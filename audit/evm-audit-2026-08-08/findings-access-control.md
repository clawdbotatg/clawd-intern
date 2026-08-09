# Access Control Findings — ClawdIntern.sol

Auditor: evm-audit-access-control checklist run, 2026-08-08
Target: `packages/foundry/contracts/ClawdIntern.sol` (Ownable2Step, renounce disabled)
Trust baseline: Phase 0 natspec — owner-provided marks, bad-faith cancel, and delayed+reasoned slash are DOCUMENTED, accepted trust. Findings below are escalations beyond that baseline or gaps, not re-reports of documented powers.

## [AC-1] `reassignIntern()` lets the owner confiscate a live stream instantly, bypassing the SLASH_DELAY + public-reason bar the trust model promises
**Severity**: Medium
**Category**: evm-audit-access-control
**Location**: `reassignIntern()` (ClawdIntern.sol:240-247)
**Description**: The documented Phase 0 trust surface for taking tokens away from a closed term's stream is `slash()`: it is rate-limited (`SLASH_DELAY` = 2 days after close), requires a public `reason` onchain, and hard-guarantees the intern keeps everything vested — the natspec explicitly promises "the intern always vests at least SLASH_DELAY/streamLen of an honest payout" and "a just-announced payout can't be zeroed in the same block."

`reassignIntern()` breaks all three properties at once. It is intended as an escape hatch for a bricked/denylisted intern wallet, but nothing constrains it to that scenario: the owner can call it on any closed term, at any time (including the same block as `closeTerm()`), with any `newIntern` — including `owner()` itself. Redirecting `t.intern` transfers the claim on the **entire remaining stream, vested-but-unclaimed included**, with no delay and no reason string. A compromised or malicious owner key therefore has strictly worse blast radius than the documented model: instead of a 2-day-delayed, reasoned slash that spares vested tokens, it gets an instant confiscation of 100% of unclaimed payout (event emitted, but no reason and no reaction window). This is a trust-model violation / owner-key-compromise escalation, not a documented power.

Note the current owner is an EOA ops wallet (Safe handoff planned), so "owner key compromise" is the realistic single-key threat this phase must bound.
**Proof of Concept**:
1. Term closes with `payout = 1,000,000 CLAWD`, `streamLen = 30 days`. Intern has claimed nothing.
2. In the same block (or any later one), compromised owner calls `reassignIntern(termId, attacker)` — passes: `closedAt != 0`, `newIntern != 0`. No delay check, no reason, no slashed/settled check.
3. Attacker calls the permissionless `claim(termId)` repeatedly as the stream vests; every wei of the 1,000,000 CLAWD — including what had already vested to the original intern — pays to `attacker`.
4. Contrast with the documented worst case: `slash()` would have needed 2 days, an onchain reason, and would still have left `2/30` of payout with the intern.
**Recommendation**: Align `reassignIntern` with the slash accountability bar so it can only strand-rescue, not confiscate:
- Make it two-phase: `proposeReassign(termId, newIntern, reason)` (emits reason) → executable after `SLASH_DELAY`. During the window, `claim()` (already permissionless — anyone can trigger it for the intern) flushes vested tokens to the *current* intern, so a reassign can never retroactively capture already-vested funds.
- Alternatively (cheaper, one tx): before flipping `t.intern`, attempt `clawd.safeTransfer(t.intern, _vested(t) - t.claimed)` in a try/catch and only reassign the remainder — a genuinely bricked/denylisted wallet fails the transfer and the escape hatch still works, while a healthy wallet keeps its vested balance.
- Also require a `reason` string on reassign so the event trail carries the same accountability as `Slashed`.

## [AC-2] CLAWD sent directly to the contract is permanently unrecoverable — `rescue()` refuses the reward token with no surplus accounting
**Severity**: Low
**Category**: evm-audit-access-control
**Location**: `rescue()` (ClawdIntern.sol:260-265)
**Description**: `rescue()` unconditionally reverts on `token == clawd` (`CannotRescueClawd`) to protect stream obligations, but the contract keeps no ledger of what those obligations actually are. All legitimate CLAWD enters via `openTerm`'s measured `safeTransferFrom` and leaves via `closeTerm` surplus / `cancelTerm` / `slash` / `claim` — so any CLAWD transferred directly to the contract (fat-fingered send, airdrop, someone "topping up" the intern) sits above obligations forever with no path out: `claim` pays only per-term vested `payout`, `closeTerm` surplus is computed from `t.budget`, and rescue is blocked. This is an emergency-path gap rather than an exploit: no third party loses funds, but real tokens can become irrecoverably stuck in a contract whose renounce is disabled precisely because "an ownerless ClawdIntern is a wedged one."
**Proof of Concept**:
1. Anyone executes `clawd.transfer(clawdIntern, 500_000e18)` directly.
2. No term's `budget`/`payout` references the extra balance; `closeTerm` returns only `t.budget - payout`; `claim` caps at `_vested(t)`.
3. `rescue(clawd, ...)` reverts `CannotRescueClawd`. The 500,000 CLAWD is stranded permanently.
**Recommendation**: Track reserved obligations (`reserved += budget` at open; decrement on close-surplus/cancel/slash/claim) and let `rescue` release only `clawd.balanceOf(address(this)) - reserved`; or, if that accounting complexity isn't wanted in Phase 0, document the strandedness explicitly in the natspec so nobody sends CLAWD here expecting recovery.

## Coverage
Checked against the evm-audit-access-control checklist:
- **Missing access control**: all state-mutating functions are `onlyOwner` except `claim()` (deliberately permissionless, pays only `t.intern` — verified: amount and recipient are fully term-derived, no caller influence) and inherited `acceptOwnership()` (correctly restricted to `pendingOwner`). No gaps found.
- **Admin moving user tokens / rug surface**: `cancelTerm` (full budget to owner) and dishonest `markOut` (payout→0, surplus to owner) are within documented Phase 0 trust. The one escalation beyond the documented surface is `reassignIntern` → AC-1.
- **Instant parameter changes**: `setParams` affects future terms only; open terms capture `capBps`/`streamLen` at open (verified in `openTerm`). No retroactive parameter risk.
- **Two-step ownership edge cases**: `Ownable2Step` present; `renounceOwnership` disabled (`RenounceDisabled`) so ownership can't be lost to zero. Pending-owner during an active term moves no tokens; `owner()`-at-call-time refund semantics (close/cancel/slash after handoff pay the *new* owner, not the funder) are explicitly documented in the header natspec, as is the denylisted-owner stall + transfer-to-clean-address recovery. `transferOwnership(0)` merely clears the pending slot (OZ semantics). No undocumented edge found.
- **Renounce-bricks-contract**: mitigated by design (disabled). Note `claim()` remains callable with a lost owner key, so in-flight streams survive owner-key loss — good.
- **Upgradeability / initializers / pausing**: none present (non-upgradeable, constructor-configured, no pause). N/A.
- **Emergency paths**: `rescue` correctly excludes CLAWD but with no surplus escape → AC-2. Active-term intern wallet bricked mid-term: owner waits for `t.end` then closes and reassigns, or cancels — no stranding. Cancelled terms cannot be claimed or reassigned (`closedAt == 0` gates both).
- **Cross-term accounting under one-owner-all-roles**: single active term enforced (`TermAlreadyActive`); per-term budgets pulled and measured at open (`TransferAmountMismatch` guards fee-on-transfer); closed streams are isolated per term, so `cancelTerm`/`slash` of one term cannot raid another's escrow. Owner-as-intern (`openTerm(owner, ...)`) is economically a no-op, not an escalation.
- **Reentrancy on privileged paths**: `nonReentrant` on all token-moving functions; `reassignIntern`/`setParams` make no external calls.
