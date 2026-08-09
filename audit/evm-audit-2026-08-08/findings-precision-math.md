# ClawdIntern.sol — Precision & Math Findings
Checklist: evm-audit-precision-math · Contract: `packages/foundry/contracts/ClawdIntern.sol` (Base, 18-dec CLAWD escrow) · Date: 2026-08-08

## [MATH-1] Two-step floor (gainBps then payout) under-pays the intern by up to budget/capBps beyond the exact result
**Severity**: Low
**Category**: evm-audit-precision-math
**Location**: `closeTerm()` (ClawdIntern.sol:182-184)
**Description**: The payout is computed in two sequential floor divisions:
```solidity
uint256 gainBps = ((markOut - t.markIn) * BPS) / t.markIn;  // floor #1
...
uint256 payout = (t.budget * gainBps) / t.capBps;           // floor #2
```
The natspec documents the degenerate case of floor #1 (gain < markIn/BPS → gainBps == 0 → zero payout). But the same quantization applies at *every* gain level, not just near zero: the intermediate `gainBps` truncates the gain to whole basis points before it is multiplied by the budget, so up to just-under-1-bps of real gain is discarded on every close. The exact single-division form `budget * (markOut - markIn) * BPS / (markIn * capBps)` loses at most 1 wei; the shipped two-step form loses up to `budget / capBps` wei — a factor of ~`budget/capBps` more truncation than necessary. The loss is always intern→owner (it lands in `surplus`), so it is owner-favoring rounding, but at default params it is materially larger than dust.
**Proof of Concept**: With the test-suite defaults (budget = 1,000,000e18, capBps = 5,000, markIn = 69e11) and markOut = markIn + 30.009%:
- `gainBps = floor(3000.9) = 3000` → two-step payout = 1,000,000e18 × 3000 / 5000 = **600,000 CLAWD**
- exact mulDiv payout = 1,000,000e18 × Δ × 10,000 / (markIn × 5000) = **600,180 CLAWD**
- intern loses **180 CLAWD** on this single close; worst case is `budget/capBps` = **200 CLAWD (0.02% of budget)** per close. Verified with python3 (integer arithmetic, no float).
**Recommendation**: Compute the payout with one full-precision step and cap on the raw numerator, e.g.:
```solidity
uint256 num = (markOut - t.markIn) * BPS;            // raw gain in bps*markIn units
uint256 capNum = t.capBps * t.markIn;
uint256 payout = num >= capNum ? t.budget : Math.mulDiv(t.budget, num, capNum);
```
(keep emitting a `gainBps` for the event via the old formula if desired). If the 1-bps quantization is intentionally accepted as part of the Phase 0 deal, extend the existing precision natspec to state the general bound (`loss ≤ budget/capBps` per close), not just the rounds-to-zero case.

## [MATH-2] SLASH_DELAY minimum-vest guarantee floors to zero for dust payouts
**Severity**: Info
**Category**: evm-audit-precision-math
**Location**: `_vested()` / `slash()` (ClawdIntern.sol:39, 218-233, 321-326)
**Description**: The `SLASH_DELAY` natspec promises "the intern always vests at least SLASH_DELAY/streamLen of an honest payout." Because `_vested` floors (`payout * elapsed / streamLen`), that guaranteed floor itself rounds to zero whenever `payout < streamLen / SLASH_DELAY` wei, letting a slash at `closedAt + SLASH_DELAY` reclaim 100% of the payout — the one outcome the delay exists to prevent. At default params (streamLen = 30 days, SLASH_DELAY = 2 days) this needs `payout ≤ 14 wei`; even with a 100-year streamLen the threshold is only 18,250 wei. Both are sub-dust for an 18-decimal token, so there is no economic impact — this is a documentation-accuracy note, adjacent to (and strictly smaller than) the already-documented "keep budgets >> capBps wei" guidance.
**Proof of Concept**: `payout = 14`, streamLen = 2,592,000, elapsed = 172,800 → vested = 14×172800/2592000 = floor(0.933) = **0**; `returned = 14 - 0 = 14` = entire payout, slash succeeds (NothingToSlash requires `returned == 0`). `payout = 15` → vested = 1. Verified with python3.
**Recommendation**: No code change needed at realistic magnitudes. Optionally qualify the SLASH_DELAY natspec ("at least ⌊payout·SLASH_DELAY/streamLen⌋, which is zero for payouts below streamLen/SLASH_DELAY wei"), or fold it into the existing keep-budgets-large note.

## [MATH-3] closeTerm reverts (checked overflow) for astronomically large markOut; safe but uncapped
**Severity**: Info
**Category**: evm-audit-precision-math
**Location**: `closeTerm()` (ClawdIntern.sol:182)
**Description**: `(markOut - t.markIn) * BPS` is unbounded owner input; it overflows uint256 and reverts when `markOut - markIn > 2^256/10^4 ≈ 1.16e73`. Similarly `t.budget * gainBps` (line 184) can overflow when the uncapped intermediate `gainBps` is enormous (needs `gainBps > ~1.16e50` at a realistic 1e27-wei budget, i.e. markOut/markIn ratio ~1e46 with markIn = 1 wei). Both are checked arithmetic → clean revert, never a wrong payout; the owner simply retries with a sane mark, and `cancelTerm()` remains available, so no term can be permanently stuck. Marks are USD×1e18 (~1e12–1e30 realistically), 40+ orders of magnitude below the overflow region; the fuzz test bounds marks at 1e30 and never approaches it. Noted because the revert path is unreachable by tests and the mark inputs have no sanity cap.
**Proof of Concept**: Overflow thresholds verified with python3: `2^256/10^4 = 1.157e73` (delta threshold); `2^256/1e27 = 1.157e50` (gainBps threshold for a 1e27 budget). All values reachable only via nonsensical owner-provided marks; result is revert, not corruption.
**Recommendation**: None required. If marks are ever replaced by an oracle (the stated Phase 2 plan), add a sanity band on markOut (e.g. `markOut < markIn * MAX_MULT`) at that boundary rather than here.

## Coverage
Checklist items examined against `ClawdIntern.sol`:
- **Division before multiplication**: none — both divisions (`gainBps`, `payout`, `_vested`) multiply first. The two-*step* floor chain is MATH-1 (intermediate truncation, not div-before-mul).
- **Division to zero**: gainBps→0 for sub-bps gains is documented/accepted (natspec at closeTerm); nothing worse found beyond MATH-1's quantified general bound and MATH-2's dust case.
- **Rounding direction**: every floor favors the escrow/owner (payout down → surplus up; vested down → slash `returned` up; claim = vested − claimed exact). No user-extractable rounding: claim/claimable use the identical `_vested`, so loop-claiming extracts nothing (confirmed by `testFuzz_RepeatedClaimsConserveTokens`).
- **Dust stranding**: none — `surplus + payout = budget` exactly at close; `claimed → payout` exactly once `elapsed ≥ streamLen` (full-payout branch, no division); slash conserves `vested + returned = payout`. Tests assert contract balance → 0 across interleaved terms.
- **Slash-vs-claim interplay**: `_vested` is monotone in time with constant payout, so `claimed ≤ vested` always holds and `slash` sets `payout = vested ≥ claimed` — `_vested(t) - t.claimed` in claim/claimable can never underflow, before or after slash. `t.slashed` short-circuit freezes vesting correctly; double-slash blocked by `TermAlreadySettled`; fully-vested slash blocked by `NothingToSlash` (checked before the delay gate, order harmless).
- **claimed > payout edge cases**: impossible per above; `test_SlashAfterPartialClaimPaysRemainderExactly` covers the tightest sequence.
- **Overflow/downcasts**: `uint64(block.timestamp)` safe until year ~584 billion; `start + termLength` is checked uint64 addition → reverts (never wraps) for absurd termLength, with `cancelTerm` as escape; `uint256(last) + cooldown` and `closedAt + SLASH_DELAY` promoted to uint256 before adding; `payout * elapsed` in `_vested` needs payout > 6.2e57 wei to overflow (elapsed < streamLen ≤ 2^64) — unreachable for any real 18-dec token. No `unchecked` blocks anywhere. Remaining overflow surfaces are MATH-3 (safe reverts).
- **Decimal handling**: single 18-dec token, marks fixed at USD×1e18 by convention, no cross-decimal scaling exists; `capBps`/`BPS` used consistently (cap comparison and payout divisor both use per-term `capBps`).
- **Solidity time literals**: `2 days` appears only in the uint64 constant `SLASH_DELAY`; no literal-arithmetic hazards.
- **Off-by-one boundaries**: `block.timestamp < t.end` (close allowed exactly at end), `elapsed >= t.streamLen` (full vest exactly at stream end), `block.timestamp < closedAt + SLASH_DELAY` (slash allowed exactly at delay) — all consistent with intent.
- **Zero denominators**: `markIn`, `capBps`, `streamLen` all enforced nonzero at open/constructor/setParams; `t.capBps`/`t.streamLen` captured per-term so a later setParams can't alter an open term's divisors.
- **Fuzz coverage reviewed**: `testFuzz_PayoutMath` (payout ≤ budget, conservation, marks ≤ 1e30), `testFuzz_VestingNeverExceedsPayoutAndIsMonotonic`, `testFuzz_RepeatedClaimsConserveTokens` — consistent with the analysis above; the untested regions are the MATH-3 revert band and sub-wei dust (MATH-2).
