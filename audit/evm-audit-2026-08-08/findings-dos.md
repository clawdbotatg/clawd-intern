# DoS & Griefing Findings — ClawdIntern.sol

Contract: `packages/foundry/contracts/ClawdIntern.sol` (checklist: evm-audit-dos)

## [DOS-1] Owner-side push payments stall close/cancel/slash, and the stall linearly destroys slashable value
**Severity**: Low
**Category**: evm-audit-dos
**Location**: `closeTerm()` (ClawdIntern.sol:194), `cancelTerm()` (ClawdIntern.sol:210), `slash()` (ClawdIntern.sol:232)
**Description**: All three owner state transitions push CLAWD to `owner()` inside the same transaction. If `owner()` cannot receive CLAWD (token-level denylist, or a future owner contract whose token hooks revert), the `safeTransfer` reverts and rolls back the entire call — the state-write ordering (state before transfer) does not help, because the revert unwinds the state too. Consequences while the owner address is unreceivable:
- `cancelTerm()` always reverts (`t.budget > 0` unconditionally), so the active term cannot be killed and `activeTermId` stays wedged (no new term can open).
- `closeTerm()` reverts whenever `surplus > 0`; it only succeeds in the special case `payout == budget` (gain at/above cap).
- `slash()` reverts — and this is the sharpest edge: `_vested()` keeps advancing in real time, so the recoverable remainder `t.payout - vested` decays linearly during the stall and hits zero at `closedAt + streamLen`. A stall longer than the remaining stream (default 30 days) converts a temporary DoS into a **permanent, irreversible loss of the slash right** for that term (`NothingToSlash` forever after).

The natspec documents the stall and the recovery path (Ownable2Step transfer to a clean address moves no tokens, so it always works). The vesting-decay-during-stall consequence is the part the docs do not spell out: the two-step transfer needs a pending owner to `acceptOwnership()`, and every day of delay is slashable CLAWD permanently released to a possibly-misbehaving intern. Today CLAWD is a plain ERC20 with no denylist, so the precondition is speculative — hence Low, not Medium.
**Proof of Concept**: 1) Term closed with payout P, streamLen 30d. 2) At `closedAt + 2d` the owner address becomes unable to receive CLAWD (denylist upgrade / owner migrated to a Safe module whose receive path reverts via a token hook). 3) Every `slash()` attempt reverts on the final `safeTransfer(owner(), returned)`. 4) Ownership transfer takes 10 days to complete (key ceremony, pending-owner accept). 5) By then `vested = P * 12d/30d`; 40% of the payout is now unslashable regardless of intern behavior; at day 30 slash is dead entirely.
**Recommendation**: Convert the owner-side payouts to pull-payment: credit `surplus`/`budget`/`returned` to an `owed[owner]` (or a single `ownerWithdrawable`) balance inside the state transition, and add an owner-callable `withdraw(address to)`. This makes `closeTerm`/`cancelTerm`/`slash` transfer-free state transitions that can never be blocked by recipient behavior, and freezes the slashable amount at the moment the decision is made rather than the moment the tokens can move. If Phase 0 keeps the push pattern, at minimum document that a slash decision under an owner-receive stall must be executed before the stream fully vests.

## [DOS-2] `claim()` pushes to `t.intern`; a reverting recipient blocks the permissionless claim path until the owner intervenes
**Severity**: Low
**Category**: evm-audit-dos
**Location**: `claim()` (ClawdIntern.sol:289)
**Description**: `claim()` is permissionless but the recipient is hard-wired to `t.intern`. If the intern address cannot receive CLAWD (denylist, bricked smart wallet, token hook revert), every `claim()` reverts and the vested balance is stuck in the contract. The designed escape hatch is `reassignIntern()` — but it is `onlyOwner`, so recovery depends on an attentive, capable owner; with an unresponsive or key-lost owner the vested CLAWD is stranded forever (`rescue()` correctly refuses CLAWD, so there is no other exit). No third party can grief this (the intern's own address is the only failure source), funds are not lost while the owner is functional, and vesting math (`_vested` is time-based, not claim-based) is unaffected by the outage — the intern loses no entitlement, only liveness. Documented in the natspec; noted here because the recovery path concentrates on a single admin key.
**Proof of Concept**: Intern's address is a smart-contract wallet that self-destructs / is upgraded to revert on ERC20 hooks (or CLAWD later adds a denylist and lists it). `claim(termId)` reverts on `safeTransfer(t.intern, amount)` for everyone. Until the owner calls `reassignIntern(termId, cleanAddr)`, zero CLAWD moves; if the owner key is lost, the term's payout is stranded permanently.
**Recommendation**: Acceptable as designed for Phase 0. Optionally allow the intern themselves to redirect their own stream (`msg.sender == t.intern` may set a new payee), removing the owner from the recovery path for the common bricked-wallet case while keeping `reassignIntern` for the denylist case where the intern's key can no longer act on-chain via the token.

## [DOS-3] CLAWD sent directly to the contract is permanently stranded
**Severity**: Low
**Category**: evm-audit-dos
**Location**: `rescue()` (ClawdIntern.sol:260-265)
**Description**: The contract carries no internal accounting of "obligated" CLAWD (obligations are implicit: `sum(payout - claimed)` over closed terms). `rescue()` categorically refuses the reward token to protect stream obligations, and no other function can move CLAWD except along the term paths, which only ever move term-sized amounts. Therefore any CLAWD that reaches the contract outside `openTerm`'s pull — a mistaken direct `transfer`, a donation, dust from a griefing sender — is unrecoverable by anyone, forever. This is a deliberate simplicity/safety trade-off (a sweep of "excess" would require summing obligations over the unbounded `terms` array or maintaining a running obligation counter), but it is a real one-way burn for the sender.
**Proof of Concept**: `clawd.transfer(clawdIntern, 1000e18)` from any EOA. No code path can ever return it: `rescue` reverts `CannotRescueClawd`, `closeTerm/cancelTerm/slash/claim` move only per-term amounts derived from `t.budget`/`t.payout`.
**Recommendation**: If recoverability is wanted, maintain `uint256 public totalObligated` (add `payout - claimed` deltas at close/claim/slash/cancel) and let `rescue` release only `clawd.balanceOf(this) - totalObligated`. Otherwise document loudly (README / token page) that the contract address must never be sent CLAWD directly.

## [DOS-4] Force-sent ETH is unrecoverable
**Severity**: Info
**Category**: evm-audit-dos
**Location**: contract-wide (no `receive()`/`payable`; `rescue()` is ERC20-only, ClawdIntern.sol:260)
**Description**: The contract has no payable path, so ETH can only arrive via `selfdestruct` force-send or as a coinbase/withdrawal target. There is no ETH withdrawal function (`rescue` takes `IERC20` only), so any such ETH is stuck. No protocol function reads `address(this).balance`, so stuck ETH breaks nothing — pure dead weight, no security impact.
**Proof of Concept**: Deploy a contract with 1 wei, `selfdestruct(payable(clawdIntern))`. The wei is stranded.
**Recommendation**: None required. If desired, add an owner-only `rescueETH(address to)`.

## [DOS-5] Cooldown clock starts at owner-controlled close/cancel time, not scheduled term end
**Severity**: Info
**Category**: evm-audit-dos
**Location**: `closeTerm()` (ClawdIntern.sol:191), `cancelTerm()` (ClawdIntern.sol:207)
**Description**: `lastTermEnd[t.intern]` is stamped with `block.timestamp` at the moment the owner closes or cancels, not with `t.end`. Since close has no deadline (documented owner-trust), a late close pushes the intern's reappointment eligibility window out by the same delay (`lastTermEnd + cooldown` in `openTerm`, ClawdIntern.sol:134). Similarly, an immediate bad-faith `cancelTerm` still puts the intern on full cooldown. Both actor and victim of this "grief" are mediated by the same owner who also controls `setParams(cooldown)` and chooses whom to appoint, so there is no third-party attack surface — it only slightly widens the already-documented owner-trust surface. Also confirmed: `reassignIntern` after close cannot corrupt cooldown state, because `lastTermEnd` was already stamped for the original intern at close time.
**Proof of Concept**: Term ends at `t.end`; owner closes 20 days late; with a 30-day cooldown the intern is eligible again at `t.end + 50d` instead of `t.end + 30d`.
**Recommendation**: If exact cooldown semantics matter, stamp `lastTermEnd[t.intern] = t.end` in `closeTerm` (keep `block.timestamp` for `cancelTerm`, where the term never reached its scheduled end). Otherwise leave as-is; it is consistent with the documented Phase 0 trust model.

## [DOS-6] Owner key loss permanently wedges an active term (accepted design)
**Severity**: Info
**Category**: evm-audit-dos
**Location**: `closeTerm()`/`cancelTerm()` (onlyOwner), `renounceOwnership()` (ClawdIntern.sol:271-273)
**Description**: The only two paths that return `activeTermId` to `NONE` are `closeTerm` and `cancelTerm`, both `onlyOwner`. If the owner key is lost mid-term, the budget is stranded, no new term can ever open, and no stream ever starts for the intern — a permanent wedge with no permissionless fallback (e.g., no "anyone may close at markOut floor after `t.end + grace`"). The contract acknowledges this class of risk by disabling `renounceOwnership` and recommending a Safe/governance owner; the residual key-loss wedge is inherent to the fully-owner-gated design and is listed for completeness, not as a defect. Verified there is no other wedge: every revert path in close/cancel is either owner-fixable (`markOut == 0`, wait for `t.end`) or covered by DOS-1.
**Proof of Concept**: Owner EOA key destroyed while a term is active. `closeTerm`/`cancelTerm`/`openTerm`/`slash`/`reassignIntern`/`transferOwnership` are all unreachable; the budget and contract are frozen forever.
**Recommendation**: Operate the contract from a multisig from day one (already the documented recommendation). Optionally add a permissionless dead-man close (e.g., after `t.end + N days` anyone may cancel to a preset beneficiary) in a later phase.

## Coverage

Checked against the evm-audit-dos checklist; the following were examined and found not applicable or correctly handled:

- **Returndata bombing / gas-forwarded calls**: the only external calls are SafeERC20 ops against the immutable `clawd` token and `rescue`'s owner-supplied token (owner-gated, `nonReentrant`). No raw `.call()` to user-controlled addresses, no fixed-gas forwarding, no try/catch.
- **Unbounded loops / array growth**: `terms` grows only via owner-gated `openTerm` (one at a time, gated by `activeTermId`). No function iterates the array; all reads (`getTerm`, `claimable`, `terms(i)`) are indexed. `termCount` is O(1). No L2 array-filling surface.
- **Zero-amount transfer reverts**: every transfer site is guarded — `closeTerm` gates `surplus > 0`, `slash` reverts `NothingToSlash` before transferring, `claim` reverts `NothingToClaim`, `cancelTerm` moves `t.budget` which is enforced non-zero at open, `rescue` rejects `amount == 0`.
- **Division-by-zero in `_vested`**: `streamLen` captured at open from `streamLength`, which is enforced non-zero in both constructor and `setParams`. `_vested` is only reachable when `closedAt != 0` (guarded in `claim`, `claimable`, `slash`), so the `block.timestamp - t.closedAt` huge-elapsed path is unreachable.
- **Reentrancy-assisted DoS**: `openTerm`, `closeTerm`, `cancelTerm`, `slash`, `claim`, `rescue` are all `nonReentrant`; state is written before transfers everywhere; `openTerm` additionally balance-diff-checks the pull (fee-on-transfer defense). `reassignIntern` and `setParams` make no external calls.
- **Wedge audit on `activeTermId`**: no path other than DOS-1 (owner unreceivable) / DOS-6 (owner key loss) prevents return to `NONE`; `closeTerm` with `surplus == 0` even succeeds under an owner denylist.
- **`uint64` arithmetic in `openTerm`**: `start + termLength` overflow simply reverts (0.8 checked math) on absurd owner input — no silent wrap, self-correcting.
- **Block stuffing / timelock griefing**: `SLASH_DELAY` is a floor, not a deadline — no time-boxed action a third party can stuff out of a window; slash itself has no expiry other than full vesting (covered in DOS-1). Cooldown cannot be restarted by non-owners.
- **Pause mechanics, oracles, paymasters, liquidations**: none exist in this contract.
- **`balanceOf` revert DoS**: `balanceOf` is called only in `openTerm` against the immutable CLAWD token (standard ERC20, non-pausable); a hypothetical revert would block only new term opens, not funds in flight.
