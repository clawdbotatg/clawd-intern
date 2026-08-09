# evm-audit-general — ClawdIntern.sol

Target: `packages/foundry/contracts/ClawdIntern.sol` (deployed on Base at
`0xc447bC73F4101726Ae4496C3586047b5F920dcCD`, non-upgradeable, escrows $CLAWD
`0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07`). Phase 0 owner-trust model
(owner-provided marks, cancel, slash judgment) is accepted per scope and not
re-reported. Prior fixes from One Dollar Audit job 572 (SLASH_DELAY floor,
public slash reason, reassignIntern, nonReentrant on openTerm/rescue, rescue
zero-guard) verified present.

## [GEN-1] CLAWD sent directly to the contract is permanently stranded (no excess-over-obligations sweep)
**Severity**: Low
**Category**: evm-audit-general
**Location**: `rescue()` (ClawdIntern.sol:260-265), contract-wide accounting
**Description**: The contract correctly uses internal accounting
(`payout`/`claimed` per term) as the source of truth rather than
`balanceOf(address(this))`, and `rescue()` hard-refuses the CLAWD token so an
owner can never raid live stream obligations. The flip side: any CLAWD that
reaches the contract outside `openTerm()` — a fat-fingered direct
`transfer()` to the contract address, a community "donation", an airdrop to
holders that includes the escrow — is irrecoverable forever. No function
computes outstanding obligations (sum over closed unslashed terms of
`payout - claimed`) and no path releases the excess. This is an
honest-owner-loses-funds case: the mistake is one wrong paste of the contract
address into a wallet send.
**Proof of Concept**: `clawd.transfer(clawdIntern, 1000e18)` from any EOA.
`rescue(clawd, ...)` reverts `CannotRescueClawd()`; `closeTerm`/`cancelTerm`/
`slash` only ever move per-term amounts (`surplus`, `t.budget`, `returned`)
derived from term state, never from balance. The 1000 CLAWD is dead weight in
the contract for the life of the chain.
**Recommendation**: Track an aggregate obligation counter (increment by
`payout` at close, decrement on `claim`/`slash`; budgets of open terms count
too) and let `rescue`-for-CLAWD release only
`clawd.balanceOf(address(this)) - totalObligations`. Alternatively document
loudly (README + frontend) that the contract address must never be sent CLAWD
directly. Given the contract is already deployed and immutable, the
documentation route is the practical fix for this instance.

## [GEN-2] `openTerm`/`reassignIntern` accept `address(this)` as the intern, stranding the stream irrecoverably (griefable via permissionless `claim`)
**Severity**: Low
**Category**: evm-audit-general
**Location**: `openTerm()` (ClawdIntern.sol:124-162), `reassignIntern()` (ClawdIntern.sol:240-247)
**Description**: Checklist item "providing a system address as a user input":
neither function rejects `intern == address(this)` (nor the CLAWD token
address). If the owner ever mis-pastes the escrow's own address —
`reassignIntern` exists precisely for messy recovery situations where
addresses are being juggled — the failure is not a revert but a silent black
hole: `claim()` executes `clawd.safeTransfer(address(this), amount)`, which
succeeds on a standard ERC20 (self-transfer), increments `t.claimed`, and the
tokens are now unaccounted CLAWD inside the contract, unrecoverable per GEN-1.
Worse, `claim()` is permissionless, so after the mistaken reassignment any
third party can immediately call `claim(termId)` to convert the vested portion
into stranded tokens before the owner notices and re-reassigns — the owner's
correction window is a race.
**Proof of Concept**: Term 0 closed with `payout = 1000e18`, fully vested.
Owner calls `reassignIntern(0, address(clawdIntern))` (paste error). Attacker
sees it and calls `claim(0)`: transfer to self succeeds, `claimed = 1000e18`,
event says paid, balance never left. Owner's subsequent
`reassignIntern(0, correctAddr)` recovers nothing — `_vested - claimed == 0`.
**Recommendation**: In both functions revert when the target is
`address(this)` (and cheaply also `address(clawd)`), e.g.
`if (newIntern == address(this) || newIntern == address(clawd)) revert ZeroAddress();`
(or a dedicated `InvalidIntern` error). One-line guard against an
irreversible class of mistake. For the already-deployed instance: operational
rule — verify reassignment targets against a checklist before signing.

## [GEN-3] Force-fed ETH has no recovery path
**Severity**: Info
**Category**: evm-audit-general
**Location**: contract-wide; `rescue()` (ClawdIntern.sol:260-265)
**Description**: The contract has no `receive()`/`fallback()`, so ordinary ETH
sends revert — good. But ETH can still be force-fed via `selfdestruct` or by
pre-funding the CREATE address, and `rescue()` only handles `IERC20`. Any ETH
that lands this way is stuck forever. No logic reads
`address(this).balance`, so nothing breaks — this is purely a
stranded-dust note, and the contract is already deployed so it is not fixable
here; recorded for the Phase 1 (oracle) revision.
**Proof of Concept**: Deploy a throwaway contract with 0.1 ETH that
`selfdestruct(payable(clawdIntern))`. The 0.1 ETH is now permanently held.
**Recommendation**: In the next revision, extend `rescue` with an ETH branch
(`if (address(token) == address(0)) { (bool ok,) = to.call{value: amount}(""); require(ok); }`).

## Coverage

Checklist domains walked and cleared (no findings beyond the above):

- **External calls & low-level interactions**: no raw `.call()`, no
  `delegatecall`, no fixed-gas calls, no `transfer()`/`send()` for ETH; all
  token moves via SafeERC20 to the known CLAWD token or owner-chosen `to` in
  `rescue` (owner-only, non-CLAWD). No `abi.encodePacked` hashing.
- **Force-feeding**: no `address(this).balance` or balance-invariant logic;
  `openTerm`'s balance-delta check reads `balBefore` in-tx under
  `nonReentrant`, so donations can't skew it (GEN-1/GEN-3 cover the stranding
  angle).
- **Fee-on-transfer / rebasing / weird ERC20**: `openTerm` verifies received
  amount with a before/after delta and reverts `TransferAmountMismatch`;
  CLAWD is a fixed, known 18-decimal token (immutable), so FoT/rebasing/ERC777
  hooks are out of scope in practice and guarded anyway.
- **Pause mechanisms**: none present — no pause-related wedge possible.
- **Reentrancy (non-obvious)**: `nonReentrant` on all token-moving functions
  and it is the last modifier after `onlyOwner` (owner check first is fine —
  `onlyOwner` is a pure read). No callbacks (no ERC721/1155/777 paths), no
  cross-contract shared state, no view functions whose staleness another
  protocol consumes mid-callback.
- **Merkle trees**: none.
- **Reveal-gap steering**: payout is a pure function of `markIn` (fixed at
  open), `markOut`, `capBps`, `budget` — all committed at or before the
  consuming tx by the owner; vesting is a pure function of `closedAt`/
  `streamLen`/`payout`. No mutable state a third party can steer between
  commit and consume. Intern front-running `slash` gains nothing (claim only
  releases vested, which slash preserves).
- **Code structure / state symmetry**: open<->close/cancel state transitions
  audited line-by-line — `activeTermId`, `lastTermEnd`, per-term flags are
  each set exactly once per transition; `cancelled` terms have `closedAt==0`
  so `claim`/`slash`/`reassignIntern` all reject them; `closeTerm` on a
  cancelled term impossible (not active). Conservation checked: at close
  `payout + surplus == budget`; at slash `returned + (vested - claimed) ==
  payout_old - claimed`; fuzz tests (`testFuzz_RepeatedClaimsConserveTokens`,
  `testFuzz_VestingNeverExceedsPayoutAndIsMonotonic`) corroborate.
  Docs<->code cross-checked: SLASH_DELAY vesting-floor comment, "close
  at/after end", cooldown semantics, param capture-at-open all match
  implementation.
- **Arrays and loops**: no loops; `terms` grows only via owner `openTerm`;
  all indexed access reverts on out-of-bounds.
- **Block/time assumptions**: `block.timestamp` only, no `block.number`; all
  intervals are days-scale (SLASH_DELAY 2d, stream 30d, terms/cooldown weeks)
  so validator drift is irrelevant. `uint64` casts safe until year 2554;
  `start + termLength` uses checked uint64 math (reverts on overflow rather
  than wrapping).
- **Comparison/logic operators**: boundaries verified — close allowed at
  exactly `t.end` (matches comment), slash allowed at exactly
  `closedAt + SLASH_DELAY` (intern keeps exactly the documented floor),
  `_vested` returns full payout at `elapsed == streamLen`. Cap clamp and
  flat/down -> 0 payout paths correct. `markOut == 0` rejected (owner passes
  1 wei for a true zero, semantically fine).
- **Multi-agent / same-person roles**: owner==intern collapses into the
  accepted Phase 0 owner-trust surface (owner already controls marks). `claim`
  is permissionless but can only pay `t.intern`. Receiver-is-system-contract
  checked -> GEN-2.
- **Compiler**: `^0.8.24`, OZ 5.x imports (Ownable2Step, ReentrancyGuard —
  storage-based, not transient). No known 0.8.24+ compiler bugs affecting
  these constructs; Base supports PUSH0 (post-Shanghai), so the >=0.8.20
  multichain concern doesn't apply to this single-chain deployment. No
  `unchecked` blocks, no signed math, no narrowing casts besides the
  timestamp `uint64` casts noted above. No small-uint expression arithmetic
  (all math in uint256 except checked uint64 time addition).
- **Storage pointer / struct-copy footguns**: all term mutations via
  `Term storage t`; no memory-copy-then-forget writes; no struct deletion
  (nothing uses `delete`); no shadowed state variables.
- **Deployment script**: `script/DeployClawdIntern.s.sol` reviewed —
  constructor args (CLAWD Base address matches scope, owner=deployer, cap
  5000 bps, stream 30d, cooldown 28d) are sane and match the README/broadcast
  record; the MockClawd fallback only triggers when the canonical address has
  no code (bare anvil), never on Base/fork.
- **ERC4626 / auction / lending-specific items**: not applicable (no shares,
  no auctions, no debt).
