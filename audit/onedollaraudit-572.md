# 🔐 Security Review — ClawdIntern.sol

---

## Scope

|                                  |                                                                             |
| -------------------------------- | --------------------------------------------------------------------------- |
| **Target**                       | `src/ClawdIntern.sol` — [clawdbotatg/clawd-intern](https://github.com/clawdbotatg/clawd-intern) |
| **Commit reviewed**              | `a85a852685fb897dd8dbf5b5b728cf73353c02dd` (repo `main` at time of audit — no tag/commit was pinned in the job description) |
| **Lines of code**                | 290 (single file, single contract)                                          |
| **Method**                       | Three-phase audit — Phase 0 context map (opus) → Phase 1 breadth, 6 ethskills domains (sonnet) → Phase 2 depth, 12 pashov attack agents blind to Phase 1 (sonnet) → hybrid reconciliation |
| **Confidence threshold**         | 50 — findings below this bar are listed under **Leads**, not scored as findings |

**Declared trust model (from the contract's own NatSpec, honored throughout this review):** the owner is explicitly trusted to provide honest `markIn`/`markOut` price marks and to act in good faith on the timing of `cancelTerm`/`closeTerm`. Findings that merely restate "the owner could lie about a mark" or "the owner could delay closing" are **out of scope** per the client's own framing and are not reported below. Findings *are* reported where an owner-authorized function exceeds what this three-item disclosure actually covers, or where a structural/logic gap produces an outcome no documented trust item explains.

---

## Reconciliation Summary

`Overlap: 6 · Phase-1-only: 5 · Phase-2-only: 3 · Re-examined leads kept: 12, demoted: 1 · Coverage holes closed: 0`

Phase 1 (6 ethskills checklists: general, precision-math, erc20, access-control, defi-staking, dos) and Phase 2 (12 pashov attack agents, blind to Phase 1) were run independently against the same 290-line file. Six distinct issues were found by both phases independently (strong corroboration); five were Phase-1-only; three were Phase-2-only, including the headline finding below. One Phase-1 lead (`rescue`'s address-equality exclusion of `clawd`) was demoted after a Phase-2 agent examined the same code path and found no exploitable gap in this contract's own architecture (no proxy/aliasing exists in-scope) — it is retained only as a Lead since it remains contingent on `clawd`'s own external implementation, which is out of this file's scope. No entrypoint or threat-catalog row went unexamined by both phases (coverage holes closed = 0).

**One item is worth flagging explicitly:** the Phase-0 context map's threat catalog initially bucketed `slash` under the same "documented owner-trust, out of scope" row as marks/cancel/close-timing. Phase 2's hunting agents (3 of 12, independently) correctly identified that `slash` timing/justification was **not actually named** in the contract's own trust disclosure (which cites only "marks and cancel timing" and "close timing") — this is reflected as `[P-1]` below and is the report's highest-severity finding.

---

## Access-Control Inventory

| Function | Guard | Caller | Writes | Moves value |
|---|---|---|---|---|
| `openTerm(address,uint256,uint256,uint64)` | `onlyOwner` (L113) | owner | `terms[]` push (L125), `activeTermId` (L142) | pulls `budget` CLAWD from owner (L146) |
| `closeTerm(uint256)` | `onlyOwner nonReentrant` (L157) | owner | `markOut/payout/closedAt` (L169-171), `activeTermId=NONE` (L172), `lastTermEnd` (L173) | pushes `surplus` to `owner()` if >0 (L176) |
| `cancelTerm()` | `onlyOwner nonReentrant` (L182) | owner | `cancelled=true` (L187), `activeTermId=NONE` (L188), `lastTermEnd` (L189) | pushes full `budget` to `owner()` (L192) |
| `slash(uint256)` | `onlyOwner nonReentrant` (L197) | owner | `payout=vested` (L206), `slashed=true` (L207) | pushes `returned` to `owner()` (L210) |
| `setParams(uint256,uint64,uint64)` | `onlyOwner` (L214) | owner | `gainCapBps`/`streamLength`/`cooldown` globals | no |
| `rescue(IERC20,address,uint256)` | `onlyOwner` (L224) — **no `nonReentrant`** | owner | none (external token only) | arbitrary token/to/amount; `clawd` excluded by address equality (L225) |
| `renounceOwnership()` | `onlyOwner override` (L234) | owner | none — **always reverts** `RenounceDisabled` | no |
| `claim(uint256)` | `nonReentrant` only (L242) — **no caller check** | **anyone** | `claimed += amount` (L249) | pushes to `t.intern` (fixed in storage, never `msg.sender`) (L252) |
| `claimable/currentIntern/termCount/getTerm` | view, none | anyone | none | no |
| `transferOwnership`/`acceptOwnership` (inherited `Ownable2Step`) | `onlyOwner` / pending-owner check | owner / pending owner | ownership (two-step) | no |

**Roles.** Single role: `owner`, set in the constructor, transferred only via `Ownable2Step`'s two-step handoff. `renounceOwnership` is permanently disabled (always reverts) — an ownerless contract would strand live budgets since close/cancel/slash are all `onlyOwner`. `intern` is a per-term payout-destination field, not a caller-privileged role — it has no self-service function of any kind.

**Unguarded entrypoint.** `claim(termId)` — callable by anyone, but the transfer destination is hardcoded to `t.intern`, never `msg.sender`, so this is a "pay-it-forward" pattern rather than an arbitrary-caller drain.

---

## Threat Model

| Actor | Reaches | Could gain | Addressed by |
|---|---|---|---|
| Arbitrary caller | `claim(termId)` (permissionless) | Nothing beyond triggering a payment to `t.intern` (never self) | Invariant holds — recipient fixed by storage, confirmed by 3 independent Phase-2 agents |
| Arbitrary caller | out-of-range `termId` on `claim`/`claimable`/`slash`/`getTerm` | Revert only | Invariant holds — native Solidity array-OOB revert, confirmed by the boundary agent |
| `clawd` token (black box) during `openTerm`'s un-guarded `safeTransferFrom` | Re-entry into any function while state is mid-commit | A second `openTerm` (blocked), a `claim` on the fresh term (blocked), other privileged fns (blocked) | **[P-2]** below — LEAD only, no confirmed exploit across 6 independent agents |
| **Owner** | `slash(termId)`, any time post-close, no justification required | Retroactively zero a fully-earned, just-announced payout | **[P-1]** below — FINDING, confirmed with concrete numeric proof by 3 independent agents |
| Owner | `setParams` — no upper bound on `gainCapBps`/`streamLength` | Set extreme params for *future* terms only | Invariant holds — capBps/streamLen captured per-term at open, confirmed by the trust-gap agent |
| Owner | `rescue` — arbitrary non-`clawd` token/to/amount | Recover misdirected tokens | **[P-4]**/**[P-8]** below |
| Owner (via `openTerm`→`closeTerm`/`cancelTerm` spanning an ownership transfer) | refund destination reads `owner()` live at call time | Refund lands on new owner, not the original funder | **[P-11]** below |
| Anyone | repeated open/close/cancel cycles growing `terms[]` | Storage growth — but no function ever iterates the full array | Invariant holds — confirmed by the dos agent |
| Intern (recorded address) | nothing — zero privileged entrypoints, cannot self-appoint, cannot contest a mark/cancel/slash | N/A — passive beneficiary only | Disclosed design; **[P-1]** is the one place this passivity is exploited beyond the disclosed trust surface |
| Any actor, if `clawd` ever gains deny-list/pause capability | intern or owner address gets denylisted | Funds transiently or permanently stuck | **[P-3]**/**[P-5]** below |

Owner-trust items explicitly named in the contract's own disclosure (honest marks, cancel timing, close timing) are marked *out of scope* throughout and are not repeated as rows above.

---

## Findings

[90] **1. `slash()` has no minimum-elapsed/vesting floor — the owner can instantly zero a fully-earned, just-announced payout**

`ClawdIntern.slash` · Confidence: 90 · Severity: **Medium** · Origin: `[phase2: agents 7, 8, 11 — FINDING; agent 3 — LEAD]`

**Description**
`slash(termId)` can be called at any time after `closeTerm` — including the same block — with no minimum elapsed-time or on-chain-justification requirement; since `_vested(t)=(payout*elapsed)/streamLen`, calling it at `elapsed≈0` returns `vested≈0`, letting the owner reclaim essentially the *entire* just-computed payout even if it hit the full `capBps` cap on completely honest marks. This is a fourth unilateral owner lever, structurally more dangerous than the disclosed `cancelTerm` (pre-close only), and it is not named in the contract's own trust disclosure, which cites only "honest marks" and "not to cancel a term in bad faith" (L20-24) plus close-timing (L153-156).

**Proof of Concept**: `budget=10,000e18`, `markIn=1e18`, `capBps=5000`. Owner honestly marks `markOut=3e18` → `gainBps=(2e18*10000)/1e18=20000`, capped to `5000` → `payout=10,000e18*5000/5000=10,000e18` (the full budget). `closeTerm` emits `TermClosed` publicly announcing this reward. In the same/next block, owner calls `slash(termId)`: `elapsed≈0` → `vested≈0` → `returned≈10,000e18`, transferred entirely back to `owner()` (ClawdIntern.sol:210); `t.payout` is set to `0` (L206). Every subsequent `claim(termId)` now computes `amount=_vested(t)-claimed=0` (L246, since `t.slashed` makes `_vested` return the frozen `0` forever per L285) → reverts `NothingToClaim`. The intern receives nothing despite a maximal, honest, fully-earned reward.

**Fix**

```diff
  function slash(uint256 termId) external onlyOwner nonReentrant {
      Term storage t = terms[termId];
      if (t.closedAt == 0) revert TermNotClosed();
      if (t.slashed) revert TermAlreadySettled();
+     if (block.timestamp < t.closedAt + MIN_SLASH_DELAY) revert SlashTooEarly();

      uint256 vested = _vested(t);
      uint256 returned = t.payout - vested;
      if (returned == 0) revert NothingToSlash();
```
Add a minimum elapsed-time floor after `closedAt` (e.g., a `MIN_SLASH_DELAY` constant or a fraction of `streamLen`), and/or require an on-chain justification emitted with `Slashed` so its accountability matches the "publicly provable" bar the rest of the trust model relies on. At minimum, explicitly disclose `slash`'s unrestricted post-close discretion in the trust documentation alongside marks/cancel/close-timing.

---

[80] **2. No recovery path for vested-but-unclaimed CLAWD if the recorded intern becomes permanently unable to receive tokens**

`ClawdIntern.claim` · Confidence: 80 · Severity: **Medium** · Origin: `[both: phase1 erc20+dos agents; phase2 periphery agent]`

**Description**
`claim(termId)` always sends vested CLAWD to the hard-coded `t.intern` (L252) with no way to change it, `rescue()` refuses to move `clawd` at all (L225, by design), and `slash` only reaches the *unvested* remainder (L203). If `t.intern` ever becomes unable to receive `clawd` (e.g., a future deny-list/pause capability on the token, or a bricked/frozen intern account), every future `claim(termId)` on that term reverts forever, and the already-vested-but-unclaimed balance has zero recovery path.

**Proof of Concept**: Term closes and streams normally; intern claims once. `clawd`'s issuer denylists `t.intern`. All further `claim(termId)` calls revert inside `safeTransfer`. Owner can `slash` to recover the *unvested* remainder (unaffected, targets `owner()`), but the portion already vested-but-unclaimed at that point is frozen into `t.payout` (L206) and can only ever be sent to the now-permanently-blocked `t.intern`.

**Fix**

```diff
+ function reassignIntern(uint256 termId, address newIntern) external onlyOwner {
+     Term storage t = terms[termId];
+     if (t.closedAt == 0) revert TermNotClosed();
+     if (newIntern == address(0)) revert ZeroAddress();
+     t.intern = newIntern;
+ }
```
Add an owner-gated reassignment/redirect path for a specific `termId`, usable when the recorded intern is demonstrably unable to receive funds, so the already-vested balance isn't permanently stranded.

---

[70] **3. Owner-address blocklist/pause on `clawd` freezes the entire term lifecycle, not just the owner's own payout**

`ClawdIntern.closeTerm` / `cancelTerm` / `slash` · Confidence: 70 · Severity: Low · Origin: `[phase1: erc20]`

**Description**
`closeTerm`, `cancelTerm`, and `slash` all commit state (payout math, `activeTermId=NONE`, `closedAt`, events) *before* an unconditional `clawd.safeTransfer(owner(), ...)`. If that transfer reverts (owner address denylisted/paused), the whole transaction — including the state commits — reverts too. Since a new term can't open while `activeTermId != NONE`, and `closeTerm` can't complete, this stalls the *entire* protocol, not just the owner's own funds.

**Fix**: Recoverable via `transferOwnership`/`acceptOwnership` to a clean address (moves no tokens, unaffected by the block), so this caps at a temporary freeze requiring an out-of-band admin action. Document this dependency; consider a pull-based "owed to owner" ledger as a fallback so a stuck transfer doesn't block state transitions the intern depends on.

---

[60] **4. `openTerm` and `rescue` lack `nonReentrant`, inconsistent with the contract's other value-moving functions**

`ClawdIntern.openTerm` / `rescue` · Confidence: 60 (code fact confirmed; no exploit found by 6 independent agents) · Severity: Low · Origin: `[both: 3 phase1 checklists + 6 phase2 agents — 9 of 18 total sub-agents flagged this independently]`

**Description**
`closeTerm`, `cancelTerm`, `slash`, and `claim` are all `nonReentrant`; `openTerm` (L111) and `rescue` (L224) are not, despite both making an external token call. Nine independent sub-agents across both phases traced this and found no concrete exploit under the stated "standard ERC20" assumption for `clawd`: state is committed before `openTerm`'s call (CEI-safe), a reentrant `openTerm` is blocked by `activeTermId != NONE`, and reentrant privileged calls fail `onlyOwner` since the reentrant `msg.sender` would be the token contract, not the owner. A reentrant permissionless `claim()` during `openTerm`'s pull would additionally be caught by the trailing balance-delta check (`TransferAmountMismatch`).

**Fix**

```diff
- function openTerm(address intern, uint256 markIn, uint256 budget, uint64 termLength)
-     external
-     onlyOwner
-     returns (uint256 termId)
+ function openTerm(address intern, uint256 markIn, uint256 budget, uint64 termLength)
+     external
+     onlyOwner
+     nonReentrant
+     returns (uint256 termId)
```
Add `nonReentrant` to both `openTerm` and `rescue` for defense-in-depth and consistency with the rest of the value-moving functions.

---

[65] **5. Payout can round to zero for small budgets or marginal gains, forfeiting genuine (if tiny) gains to the owner**

`ClawdIntern.closeTerm` · Confidence: 65 · Severity: Low · Origin: `[both: phase1 precision-math; phase2 math-precision + invariant agents]`

**Description**
Two chained floor divisions (`gainBps=(markOut-markIn)*BPS/markIn` at L164, then `payout=budget*gainBps/capBps` at L166) can zero an intern's payout despite a real, owner-marked price increase — the forfeited amount flows entirely to `surplus`→owner (L167, L176). Not independently exploitable (owner controls both `budget` and marks — no adversarial upside, no funds are ever stuck), but there's no minimum-gain safeguard.

**Proof of Concept**: `markIn=1e18`, `budget=100`, `capBps=10,000`. Owner marks `markOut=1e18+1e13` (a real +0.001% gain): `gainBps=(1e13*10000)/1e18=0` → `payout=0`; intern earns nothing, owner reclaims the full 100 budget.

**Fix**: Document the minimum meaningful budget/gain given `capBps`, or emit a distinguishing event/revert when `gainBps>0 && payout==0` so a small-but-real gain isn't silently treated as zero.

---

Findings List

| # | Confidence | Title |
|---|---|---|
| 1 | [90] | `slash()` has no minimum-elapsed/vesting floor — undisclosed 4th owner lever |
| 2 | [80] | No recovery path for vested-but-unclaimed CLAWD if intern is unable to receive tokens |
| 3 | [70] | Owner-address blocklist/pause on `clawd` freezes the entire term lifecycle |
| 4 | [60] | `openTerm`/`rescue` lack `nonReentrant` (no confirmed exploit) |
| 5 | [65] | Payout can round to zero for small budgets/marginal gains |
| 6 | [55] | Outbound transfers unverified against actual token balance (only inbound is delta-checked) |
| 7 | [55] | Stray/direct CLAWD transfers to the contract are permanently unrecoverable |
| 8 | [55] | `rescue`'s `amount` is not zero-guarded |
| 9 | [55] | No pause mechanism for `claim()` |
| 10 | [50] | Theoretical overflow in `closeTerm`'s payout math under extreme owner-misconfigured `capBps` |
| 11 | [55] | `closeTerm`/`cancelTerm` refund `owner()` at call time, not the address that funded the term |
| 12 | [50] | Minor/theoretical items: cooldown sentinel edge case, timestamp-monotonicity assumption, unchecked narrowing casts |

---

[55] **6. Outbound transfers are unverified against actual token balance — only the inbound leg is delta-checked**

`ClawdIntern.closeTerm/cancelTerm/slash/claim` · Confidence: 55 · Severity: Info · Origin: `[both: phase1 general+erc20; phase2 economic-security]`

**Description**
Only `openTerm` (L145-147) verifies its transfer via a `balanceOf` delta check; `closeTerm`, `cancelTerm`, `slash`, and `claim` all compute amounts purely from internal accounting with no equivalent check on the way out. Fine under the stated non-fee/non-rebasing ERC20 assumption for `clawd` — confirmed by a concrete 3-term pooled-balance trace to hold under that assumption — but if it ever breaks, later claimants of *other, earlier* terms could be starved by an earlier outbound transfer draining more than its accounted share from the shared, unescrowed pool.

---

[55] **7. Stray/direct CLAWD transfers to the contract are permanently unrecoverable**

`ClawdIntern.rescue` · Confidence: 55 · Severity: Info · Origin: `[phase1: general]`

**Description**
`rescue` deliberately excludes `clawd` (L225) so any CLAWD sent directly via `transfer()` (bypassing `openTerm`) inflates the contract's balance with no corresponding term entitlement and no code path can ever move it out. Deliberate per the NatSpec ("stream obligations live in this contract's CLAWD balance"), but means such tokens are stuck rather than merely inaccessible to the sender.

---

[55] **8. `rescue`'s `amount` parameter is not zero-guarded**

`ClawdIntern.rescue` · Confidence: 55 · Severity: Info · Origin: `[phase1: erc20]`

**Description**
Unlike every other transfer site (`closeTerm`'s `surplus>0` guard, `slash`'s `NothingToSlash`, `claim`'s `NothingToClaim`), `rescue` has no `amount==0` guard (L224-228). Some tokens (LEND, old BNB) revert on a zero-amount transfer. Self-inflicted only (owner-only, can simply retry) — cosmetic.

---

[55] **9. No pause mechanism for `claim()`**

`ClawdIntern` (contract-wide) · Confidence: 55 · Severity: Info · Origin: `[phase1: access-control]`

**Description**
There is no way to halt `claim()` payouts. Largely mitigated by `clawd` being immutable/fixed at deploy, and by `slash`/`cancelTerm` already giving the owner an economic lever over undistributed budget. No action required given the immutable-token design.

---

[50] **10. Theoretical overflow of `budget*gainBps` under an extreme, owner-misconfigured `capBps`**

`ClawdIntern.closeTerm` · Confidence: 50 · Severity: Info · Origin: `[both: phase1 precision-math; phase2 math-precision+invariant+numerical-gap agents]`

**Description**
`payout=(t.budget*gainBps)/t.capBps` (L166) computes the full product before dividing; `gainCapBps` has no upper bound (only `!=0` checked). An implausibly large `capBps` combined with a correspondingly large `budget` could overflow the product, reverting `closeTerm` and stranding that term's payout math — though `cancelTerm` remains available as an escape hatch (forfeits payout to owner, avoids permanent lock of principal). Requires owner misconfiguration, not attacker input.

---

[55] **11. `closeTerm`/`cancelTerm` refund `owner()` evaluated at call time, not the address that funded the term at open**

`ClawdIntern.closeTerm/cancelTerm` · Confidence: 55 · Severity: Info · Origin: `[phase2: first-principles]`

**Description**
`openTerm` pulls `budget` from `msg.sender` (owner at open time, L146), but `closeTerm`'s surplus (L176) and `cancelTerm`'s full refund (L192) both read `owner()` live at call time. If ownership transfers between a term's open and its close/cancel, the refund lands on the new owner, not the original funder. Likely acceptable treasury-role semantics, but undocumented.

---

[50] **12. Minor/theoretical items**

Confidence: 50 · Severity: Info · Origin: `[phase2: math-precision, boundary, numerical-gap]`

- `lastTermEnd[intern]==0` cooldown-skip sentinel relies on `block.timestamp` never legitimately being `0` — true on any real chain, not exploitable.
- `elapsed=block.timestamp-t.closedAt` monotonicity assumption is safe under standard L1 timestamp-monotonicity consensus; worth confirming for the specific deployment chain if it is an L2 with non-standard timestamp semantics.
- Unchecked `uint64(block.timestamp)` narrowing casts (L125, L171, L173, L189) are pattern-level smells with no reachable trigger before the year 584942 AD.

---

## Leads

_Vulnerability trails with concrete code smells where the full exploit path could not be completed in one analysis pass. Not scored._

- **`rescue`'s `clawd` exclusion is address-equality only** — `ClawdIntern.rescue` — Code smells: the one hard-coded safety rail against rescuing the stream reserve is a plain `address(token)==address(clawd)` comparison (L225) — if `clawd` ever had an alias/proxy representation sharing the same underlying balance, `rescue` could move the same economic asset the guard is meant to protect. A Phase-2 trust-gap agent examined this specific path and found no gap *in this contract's own architecture* (no proxy/aliasing exists in-scope), so this is retained only as a Lead, fully contingent on `clawd`'s own external implementation, which is outside this file's scope to verify.

---

## Coverage

`Entrypoints: 8 state-changing + 4 views + 2 inherited ownership fns in inventory, 14 addressed. Threat rows: 10, 10 answered. Coverage holes closed this pass: 0.`

Every privileged/value-moving entrypoint (`openTerm`, `closeTerm`, `cancelTerm`, `slash`, `setParams`, `rescue`, `claim`, `renounceOwnership`, `transferOwnership`/`acceptOwnership`) maps to at least one finding above or an explicit "invariant holds" note in the Threat Model table. All nine documented invariants (I1–I9, see Phase-0 map) were independently re-derived and confirmed holding — including I9 (pooled-balance solvency across terms), which Phase 0 had flagged as unverified and Phase 2's invariant agent confirmed via a concrete multi-term numeric trace.

---

> ⚠️ This review was performed by an AI assistant. AI analysis can never verify the complete absence of vulnerabilities and no guarantee of security is given. Team security reviews, bug bounty programs, and on-chain monitoring are strongly recommended.
