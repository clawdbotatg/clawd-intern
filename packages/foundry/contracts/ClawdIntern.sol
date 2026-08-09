// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ClawdIntern — rotating growth-intern terms rewarded in CLAWD
///
/// An intern address is appointed for a fixed term. A CLAWD budget is locked
/// at open. The owner marks the token's USD price at open (markIn) and at
/// close (markOut). If the price went up, the intern earns a share of the
/// budget proportional to the gain (capped at gainCapBps, which earns the full
/// budget), streamed linearly over streamLength. Getting paid in CLAWD over a
/// month is the alignment mechanism: a pump that collapses collapses the
/// intern's own payout.
///
/// Phase 0 trust model (deliberate, documented): the OWNER is trusted to
/// provide honest marks, not to cancel a term in bad faith, and not to slash
/// a stream without cause (slash is rate-limited by SLASH_DELAY and requires
/// a public reason, but the judgment itself is the owner's). Every mark,
/// cancel, and slash is emitted onchain so bad faith is publicly provable.
/// Owner-bound refunds (close surplus, cancel, slash) are pushed to owner()
/// but never block state: a failed push is credited to ownerOwed and pulled
/// later via withdrawOwed(), so a denylisted/reverting owner address can never
/// wedge activeTermId and freeze future terms. Refunds go to owner() at call
/// time, not the address that funded the term. The mark parameters are
/// designed to be replaced by an oracle in a later phase without changing the
/// term/stream machinery.
///
/// Token assumption: `clawd` is expected to be a plain, non-rebasing,
/// non-fee-on-transfer ERC20 with no denylist (the deployed CLAWD is). A
/// denylist-capable token that blocked THIS contract's own address would
/// strand every locked balance, since rescue() refuses the reward token by
/// design — do not deploy against such a token.
contract ClawdIntern is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;

    /// @notice minimum time after close before a stream can be slashed, so a
    /// just-announced payout can't be zeroed in the same block (the intern
    /// always vests at least SLASH_DELAY/streamLen of an honest payout).
    uint64 public constant SLASH_DELAY = 2 days;

    IERC20 public immutable clawd;

    /// @notice gain (in bps of markIn) that earns the full budget; captured
    /// per-term at open so a param change never alters an open deal.
    uint256 public gainCapBps;
    /// @notice vesting stream duration for future terms; captured per-term.
    uint64 public streamLength;
    /// @notice cooldown: an intern can't be reappointed until this many
    /// seconds after their last term ended. 0 disables.
    uint64 public cooldown;

    struct Term {
        address intern;
        uint64 start;
        uint64 end; // scheduled term end (close allowed at/after)
        uint64 closedAt; // 0 until closed; the stream starts here
        uint64 streamLen; // captured at open
        uint256 capBps; // captured at open
        uint256 markIn; // owner-provided USD price (1e18) at open
        uint256 markOut; // owner-provided USD price (1e18) at close
        uint256 budget; // CLAWD locked at open
        uint256 payout; // CLAWD awarded at close (<= budget)
        uint256 claimed; // CLAWD already released to the intern
        bool cancelled;
        bool slashed;
    }

    Term[] public terms;

    uint256 public constant NONE = type(uint256).max;
    uint256 public activeTermId = NONE;

    /// @notice timestamp each intern's last term ended (for cooldown).
    mapping(address => uint64) public lastTermEnd;

    /// @notice CLAWD owed to the owner from a refund push that failed, pulled
    /// with withdrawOwed(). Non-zero only if owner() cannot receive CLAWD.
    uint256 public ownerOwed;

    event TermOpened(
        uint256 indexed termId,
        address indexed intern,
        uint256 markIn,
        uint256 budget,
        uint64 start,
        uint64 end,
        uint256 capBps,
        uint64 streamLen
    );
    event TermClosed(uint256 indexed termId, uint256 markOut, uint256 gainBps, uint256 payout, uint256 surplus);
    event TermCancelled(uint256 indexed termId, uint256 returned);
    event Claimed(uint256 indexed termId, address indexed intern, uint256 amount);
    event Slashed(uint256 indexed termId, uint256 vestedKept, uint256 returned, string reason);
    event InternReassigned(uint256 indexed termId, address indexed oldIntern, address indexed newIntern);
    event ParamsUpdated(uint256 gainCapBps, uint64 streamLength, uint64 cooldown);
    event OwnerCredited(address indexed owner, uint256 amount);
    event OwnerWithdrew(address indexed owner, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error TermAlreadyActive();
    error NoActiveTerm();
    error TermStillRunning();
    error TermNotClosed();
    error TermAlreadySettled();
    error NothingToClaim();
    error NothingToSlash();
    error InternOnCooldown();
    error CannotRescueClawd();
    error TransferAmountMismatch();
    error RenounceDisabled();
    error SlashTooEarly();
    error CapTooLarge();
    error StreamTooShort();
    error NothingOwed();

    constructor(IERC20 _clawd, address _owner, uint256 _gainCapBps, uint64 _streamLength, uint64 _cooldown)
        Ownable(_owner)
    {
        // _payOwner's low-level call would read an EOA's empty returndata as a
        // successful transfer, so the reward token must be real code.
        if (address(_clawd) == address(0) || address(_clawd).code.length == 0) revert ZeroAddress();
        clawd = _clawd;
        _setParams(_gainCapBps, _streamLength, _cooldown);
    }

    // ---------------------------------------------------------------- admin

    /// @notice Open a term: appoint `intern`, lock `budget` CLAWD (pulled from
    /// the owner), record the owner-observed USD price `markIn` (1e18).
    function openTerm(address intern, uint256 markIn, uint256 budget, uint64 termLength)
        external
        onlyOwner
        nonReentrant
        returns (uint256 termId)
    {
        if (activeTermId != NONE) revert TermAlreadyActive();
        // address(this) would make claim()'s transfer a balance no-op while
        // still marking the slice claimed — an unrecoverable burn.
        if (intern == address(0) || intern == address(this)) revert ZeroAddress();
        if (markIn == 0 || budget == 0 || termLength == 0) revert ZeroAmount();
        uint64 last = lastTermEnd[intern];
        if (last != 0 && block.timestamp < uint256(last) + cooldown) revert InternOnCooldown();

        termId = terms.length;
        uint64 start = uint64(block.timestamp);
        uint64 end = start + termLength;
        terms.push(
            Term({
                intern: intern,
                start: start,
                end: end,
                closedAt: 0,
                streamLen: streamLength,
                capBps: gainCapBps,
                markIn: markIn,
                markOut: 0,
                budget: budget,
                payout: 0,
                claimed: 0,
                cancelled: false,
                slashed: false
            })
        );
        activeTermId = termId;
        emit TermOpened(termId, intern, markIn, budget, start, end, gainCapBps, streamLength);

        uint256 balBefore = clawd.balanceOf(address(this));
        clawd.safeTransferFrom(msg.sender, address(this), budget);
        if (clawd.balanceOf(address(this)) - balBefore != budget) revert TransferAmountMismatch();
    }

    /// @notice Close the active term at/after its scheduled end with the
    /// owner-observed USD price `markOut` (1e18). Computes the payout, opens
    /// the stream, and returns any surplus budget to the owner.
    /// @dev Trust note: there is no close deadline — the owner controls close
    /// timing (the stream starts at close, not at t.end). Part of the Phase 0
    /// owner-trust surface alongside marks and cancel; self-limiting, since no
    /// new term can open until this one closes.
    /// @dev Precision note: gainBps floors at BPS granularity, so a gain below
    /// markIn/BPS rounds to a zero payout (visible in TermClosed: gainBps==0
    /// despite markOut>markIn). Keep budgets >> capBps wei so real gains can't
    /// silently truncate to nothing.
    function closeTerm(uint256 markOut) external onlyOwner nonReentrant {
        uint256 termId = activeTermId;
        if (termId == NONE) revert NoActiveTerm();
        if (markOut == 0) revert ZeroAmount();
        Term storage t = terms[termId];
        if (block.timestamp < t.end) revert TermStillRunning();

        uint256 gainBps = markOut > t.markIn ? ((markOut - t.markIn) * BPS) / t.markIn : 0;
        if (gainBps > t.capBps) gainBps = t.capBps;
        uint256 payout = (t.budget * gainBps) / t.capBps;
        uint256 surplus = t.budget - payout;

        t.markOut = markOut;
        t.payout = payout;
        t.closedAt = uint64(block.timestamp);
        activeTermId = NONE;
        lastTermEnd[t.intern] = uint64(block.timestamp);
        emit TermClosed(termId, markOut, gainBps, payout, surplus);

        _payOwner(surplus);
    }

    /// @notice Kill switch (rogue intern / emergency): returns the full budget
    /// to the owner, no payout. Phase 0 accepts that the owner can end a term
    /// in bad faith — the event trail makes it public. Not bounded by t.end:
    /// an expired-but-unclosed term can still be cancelled instead of closed,
    /// which is the same owner-trust surface as controlling close timing.
    function cancelTerm() external onlyOwner nonReentrant {
        uint256 termId = activeTermId;
        if (termId == NONE) revert NoActiveTerm();
        Term storage t = terms[termId];

        t.cancelled = true;
        activeTermId = NONE;
        lastTermEnd[t.intern] = uint64(block.timestamp);
        emit TermCancelled(termId, t.budget);

        _payOwner(t.budget);
    }

    /// @notice Cancel the unvested remainder of a closed term's stream
    /// (manipulation / agreement breach). The intern keeps what has vested.
    /// Not callable until SLASH_DELAY after close — a just-announced payout
    /// can't be zeroed instantly — and the public `reason` goes onchain so a
    /// slash carries the same accountability bar as the marks.
    function slash(uint256 termId, string calldata reason) external onlyOwner nonReentrant {
        Term storage t = terms[termId];
        if (t.closedAt == 0) revert TermNotClosed();
        if (t.slashed) revert TermAlreadySettled();
        if (block.timestamp < uint256(t.closedAt) + SLASH_DELAY) revert SlashTooEarly();

        uint256 vested = _vested(t);
        uint256 returned = t.payout - vested;
        if (returned == 0) revert NothingToSlash();

        t.payout = vested;
        t.slashed = true;
        emit Slashed(termId, vested, returned, reason);

        _payOwner(returned);
    }

    /// @notice Redirect a closed term's UNVESTED remainder to a new address —
    /// the escape hatch for an intern account that can no longer receive
    /// CLAWD (bricked wallet, token-level denylist). Without it that term's
    /// future stream would be stranded forever, since claim() only ever pays
    /// t.intern and rescue() refuses CLAWD.
    /// @dev Anything already vested is settled to the OLD intern first, in the
    /// same transaction. Otherwise reassign would be a delay-free, reason-free
    /// superset of slash — able to seize vested funds that slash may never
    /// touch — which would falsify the SLASH_DELAY vesting floor above. If the
    /// old address genuinely cannot receive, that leg reverts and the term must
    /// be slashed instead; only the unvested part is ever redirectable.
    function reassignIntern(uint256 termId, address newIntern) external onlyOwner nonReentrant {
        Term storage t = terms[termId];
        if (t.closedAt == 0) revert TermNotClosed();
        if (newIntern == address(0) || newIntern == address(this)) revert ZeroAddress();

        uint256 owed = _vested(t) - t.claimed;
        address oldIntern = t.intern;
        if (owed > 0) {
            t.claimed += owed;
            emit Claimed(termId, oldIntern, owed);
        }

        emit InternReassigned(termId, oldIntern, newIntern);
        t.intern = newIntern;

        if (owed > 0) clawd.safeTransfer(oldIntern, owed);
    }

    /// @notice Update params for FUTURE terms only (open terms captured theirs).
    function setParams(uint256 _gainCapBps, uint64 _streamLength, uint64 _cooldown) external onlyOwner {
        _setParams(_gainCapBps, _streamLength, _cooldown);
    }

    /// @dev gainCapBps is the divisor in closeTerm's payout formula, so an
    /// oversized cap floors an honest payout toward zero — bound it at 100x BPS
    /// (a 100x price gain earning the full budget). streamLength must outlast
    /// SLASH_DELAY, or a term is fully vested before it is ever slashable and
    /// slash() reverts NothingToSlash for that term's whole life.
    function _setParams(uint256 _gainCapBps, uint64 _streamLength, uint64 _cooldown) internal {
        if (_gainCapBps == 0 || _streamLength == 0) revert ZeroAmount();
        if (_gainCapBps > 100 * BPS) revert CapTooLarge();
        if (_streamLength <= SLASH_DELAY) revert StreamTooShort();
        gainCapBps = _gainCapBps;
        streamLength = _streamLength;
        cooldown = _cooldown;
        emit ParamsUpdated(_gainCapBps, _streamLength, _cooldown);
    }

    /// @notice Recover tokens sent here by mistake. Never the reward token —
    /// stream obligations live in this contract's CLAWD balance.
    function rescue(IERC20 token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (address(token) == address(clawd)) revert CannotRescueClawd();
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        token.safeTransfer(to, amount);
    }

    /// @notice Pull the owner's refunds that a push couldn't deliver.
    /// Permissionless — like claim(), the destination is fixed to owner().
    function withdrawOwed() external nonReentrant {
        uint256 amount = ownerOwed;
        if (amount == 0) revert NothingOwed();

        ownerOwed = 0;
        address o = owner();
        emit OwnerWithdrew(o, amount);

        clawd.safeTransfer(o, amount);
    }

    /// @dev Push a refund to owner(), crediting ownerOwed if the transfer
    /// fails. close/cancel/slash finalize term state before calling this, and
    /// a bubbling revert would undo that state too — leaving activeTermId
    /// pinned to a term that can never close and blocking every future
    /// openTerm. Liveness of the term machinery must not depend on the owner
    /// address being able to receive.
    function _payOwner(uint256 amount) internal {
        if (amount == 0) return;
        address o = owner();
        (bool ok, bytes memory ret) = address(clawd).call(abi.encodeCall(IERC20.transfer, (o, amount)));
        if (ok && (ret.length == 0 || (ret.length == 32 && abi.decode(ret, (bool))))) return;

        ownerOwed += amount;
        emit OwnerCredited(o, amount);
    }

    /// @notice Disabled: an ownerless ClawdIntern is a wedged one. Renouncing
    /// with an active term would strand its budget forever (close/cancel are
    /// onlyOwner), and would permanently disable slash on live streams.
    /// Decentralize by transferring to a Safe / governance instead.
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    // ---------------------------------------------------------------- claims

    /// @notice Release vested CLAWD to a term's intern. Permissionless — the
    /// tokens can only ever go to the intern (same pattern as clawd-vesting).
    function claim(uint256 termId) external nonReentrant {
        Term storage t = terms[termId];
        if (t.closedAt == 0) revert TermNotClosed();

        uint256 amount = _vested(t) - t.claimed;
        if (amount == 0) revert NothingToClaim();

        t.claimed += amount;
        emit Claimed(termId, t.intern, amount);

        clawd.safeTransfer(t.intern, amount);
    }

    // ----------------------------------------------------------------- views

    /// @notice Vested-but-unclaimed CLAWD for a term.
    function claimable(uint256 termId) external view returns (uint256) {
        Term storage t = terms[termId];
        if (t.closedAt == 0) return 0;
        return _vested(t) - t.claimed;
    }

    /// @notice The one call the utility layer (tweet bot, credits, SIWE gate)
    /// makes. `endsAt` is the scheduled end — callers decide whether an
    /// unclosed-but-expired term still confers privileges (it shouldn't).
    function currentIntern() external view returns (address intern, uint256 termId, uint64 endsAt) {
        uint256 id = activeTermId;
        if (id == NONE) return (address(0), NONE, 0);
        Term storage t = terms[id];
        return (t.intern, id, t.end);
    }

    function termCount() external view returns (uint256) {
        return terms.length;
    }

    function getTerm(uint256 termId) external view returns (Term memory) {
        return terms[termId];
    }

    // ------------------------------------------------------------- internals

    function _vested(Term storage t) internal view returns (uint256) {
        if (t.slashed) return t.payout; // payout was reduced to vested at slash
        uint256 elapsed = block.timestamp - t.closedAt;
        if (elapsed >= t.streamLen) return t.payout;
        return (t.payout * elapsed) / t.streamLen;
    }
}
