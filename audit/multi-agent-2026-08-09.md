# Security Review — ClawdIntern.sol

**Repo:** `https://github.com/clawdbotatg/clawd-intern` @ commit `b94104c1ba56db63a7958fd611f42db84d9070a9` (default branch, no tag/commit pinned in the job description; verified reachable via `git ls-remote`).
**Scope:** `packages/foundry/contracts/ClawdIntern.sol` only (327 lines) — the file named in the job description. Imports (`OpenZeppelin` `Ownable2Step`, `ReentrancyGuard`, `SafeERC20`) and `mocks/MockClawd.sol` read for context, not in scope for findings.
**On-chain context:** the real reward token, CLAWD, is deployed at `0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07` on Base (chain id 8453) — a plain, hook-free, non-fee, non-rebasing OpenZeppelin ERC20. The deploy script (`script/DeployClawdIntern.s.sol`, out of audit scope) records a live deployment of `ClawdIntern` at `0xc447bC73F4101726Ae4496C3586047b5F920dcCD` on Base with `gainCapBps=5000`, `streamLength=30 days`, `cooldown=28 days`.
**Methodology:** three-phase audit — Phase 0 context building (protocol map + access-control inventory + threat catalog, opus) → Phase 1 breadth (5 ethskills checklists: general, precision-math, erc20, access-control, dos; sonnet) → Phase 2 depth (12 pashov attacker-mindset agents, blind to Phase 1, sonnet) → hybrid reconciliation with a Turn-3 coverage gate against the Phase 0 inventory/catalog.

**Severity counts:** 0 Critical · 1 High · 3 Medium · 2 Low · 5 Informational

**Reconciliation summary:** Overlap (both phases independently found): 5 of 6 above-threshold findings. Phase-1-only: 1 (denylist-capable `clawd`, deployment-dependent). Phase-2-only: 0 new above-threshold findings (Phase 2 corroborated and sharpened Phase 1's findings — most strikingly with an executable forge PoC for the top finding — rather than surfacing new ones). Re-examined leads kept: 5 (promoted to Informational findings on confirmation), demoted: 0. Coverage holes closed this pass: 0 (both phases already covered every entrypoint and threat-catalog row; see Coverage below). Confidence floor: findings below confidence 50 are listed under Leads, not as findings.

---

## Findings

### [1] `reassignIntern` lets the owner redirect a closed term's already-vested, unclaimed CLAWD to any address, bypassing every guardrail `slash` enforces for the same economic effect

**Severity:** High · **Confidence:** 95 · `ClawdIntern.reassignIntern` · **Origin:** `[both]` — Phase 1 access-control checklist, corroborated as a firm FINDING by 6 of 12 blind Phase 2 agents (`invariant`, `first-principles`, `asymmetry`, `boundary`, `trust-gap`, and a LEAD from `access-control`), including an **executable forge PoC run and passed against the live contract** by the `trust-gap` agent.

**Description**

`reassignIntern(uint256 termId, address newIntern)` (`ClawdIntern.sol:240-247`):

```solidity
function reassignIntern(uint256 termId, address newIntern) external onlyOwner {
    Term storage t = terms[termId];
    if (t.closedAt == 0) revert TermNotClosed();
    if (newIntern == address(0)) revert ZeroAddress();

    emit InternReassigned(termId, t.intern, newIntern);
    t.intern = newIntern;
}
```

Its NatSpec (`ClawdIntern.sol:235-239`) frames it narrowly as an escape hatch for a bricked/denylisted intern wallet. The code enforces none of that framing — the only guards are `t.closedAt != 0` and a non-zero address. Because `claim()` (`ClawdIntern.sol:279-290`) always pays whoever `t.intern` currently is, and `t.intern` is fully owner-controlled post-close, the owner can redirect the entire remaining claim on any closed term — **including amounts already 100% vested and simply awaiting a `claim()` call** — instantly, with no delay and no on-chain justification.

Contrast with `slash()` (`ClawdIntern.sol:218-233`), the contract's own designed mechanism for the owner to claw back a closed term's payout: `slash` cannot touch already-vested funds (`returned = t.payout - vested`), requires a 2-day `SLASH_DELAY` (`ClawdIntern.sol:226`), and requires a public `reason` string (`ClawdIntern.sol:218`, `230`) — explicitly built, per the contract's own NatSpec (`ClawdIntern.sol:36-38`), to guarantee "the intern always vests at least SLASH_DELAY/streamLen of an honest payout." `reassignIntern` achieves a strictly *more* powerful version of the same clawback with none of those protections, directly falsifying that documented invariant.

**Proof of Concept**

Executed and passed via the `trust-gap` agent's Foundry test against the actual contract (`budget=1_000_000e18`, `gainCapBps=5000`):

1. `openTerm(intern, markIn, budget=1_000_000e18, termLength)`.
2. `closeTerm(markOut)` with `gainBps == capBps` ⇒ `payout == budget` (full budget earned — a real, honest gain).
3. Warp forward past `streamLength`: `claimable(id) == 1_000_000e18` (100% vested), `t.claimed == 0` (intern simply hasn't called `claim()` yet — nothing forces promptness, and `claim()` is permissionless by design so there's no reason to rush).
4. Owner calls `reassignIntern(id, ownerAlt)` — succeeds in one transaction, no delay, no reason logged.
5. `claim(id)` (callable by anyone) now pays the full `1,000,000e18` CLAWD to `ownerAlt`. `clawd.balanceOf(intern) == 0`.

Test result: `[PASS] gas: 324263`.

**Recommendation**

Before changing `t.intern`, settle the currently-vested-but-unclaimed amount to the *old* intern atomically:

```diff
  function reassignIntern(uint256 termId, address newIntern) external onlyOwner {
      Term storage t = terms[termId];
      if (t.closedAt == 0) revert TermNotClosed();
      if (newIntern == address(0)) revert ZeroAddress();
+
+     uint256 owed = _vested(t) - t.claimed;
+     if (owed > 0) {
+         t.claimed += owed;
+         clawd.safeTransfer(t.intern, owed);
+     }

      emit InternReassigned(termId, t.intern, newIntern);
      t.intern = newIntern;
  }
```

so `reassignIntern` can only ever redirect the *future/unvested* remainder. As a complementary defense-in-depth measure, consider gating it behind the same `SLASH_DELAY` + mandatory `reason` requirement as `slash`.

---

### [2] Missing self-address validation on `intern`/`newIntern` permanently burns claimed CLAWD

**Severity:** Medium · **Confidence:** 90 · `ClawdIntern.openTerm` / `ClawdIntern.reassignIntern` · **Origin:** `[both]` — Phase 1 general checklist, corroborated as a firm FINDING by 2 of 12 blind Phase 2 agents (`economic-security`, `periphery`), each independently tracing the OpenZeppelin ERC20 `_update(from==to)` self-transfer semantics.

**Description**

`openTerm` (`ClawdIntern.sol:131`) checks `intern != address(0)`; `reassignIntern` (`ClawdIntern.sol:243`) checks `newIntern != address(0)`. Neither rejects `address(this)`. If a term's `intern` is ever set to the contract's own address (fat-finger, UI bug, or a malicious owner staging a fake payout), `claim()`'s `clawd.safeTransfer(t.intern, amount)` (`ClawdIntern.sol:289`) becomes a same-address no-op on token balance — OpenZeppelin's `ERC20._update` has no `from == to` guard, so the balance nets to zero change. But `t.claimed += amount` (`ClawdIntern.sol:286`) still executes unconditionally *before* the transfer, permanently recording that slice as delivered. `rescue()` explicitly refuses the `clawd` token (`ClawdIntern.sol:261`, `CannotRescueClawd`), `slash()` only ever touches the *unvested* remainder, and `claim()`'s formula (`_vested(t) - t.claimed`) never re-derives the burned amount. The tokens are locked in the contract forever, and if the term is later reassigned to a real intern, that intern is underpaid by exactly the burned amount.

**Proof of Concept**

Closed term, `payout = 60,000e18`, `streamLen = 30 days`, `closedAt = T0`. `reassignIntern(termId, address(clawdIntern))` passes every check. At `T0 + 15 days`, `_vested(t) = 30,000e18`. Anyone calls `claim(termId)`: `amount = 30,000e18`; `t.claimed` becomes `30,000e18`; `clawd.safeTransfer(address(this), 30,000e18)` executes as a verified net-zero self-transfer. The 30,000e18 obligation is now marked "claimed" but was never delivered to anyone, and cannot be recovered by any subsequent `reassignIntern` (the vesting formula only accounts for amounts vesting *after* the burn point) nor by `rescue` (blocked).

**Recommendation**

```diff
  function openTerm(address intern, uint256 markIn, uint256 budget, uint64 termLength)
      external onlyOwner nonReentrant returns (uint256 termId)
  {
      if (activeTermId != NONE) revert TermAlreadyActive();
-     if (intern == address(0)) revert ZeroAddress();
+     if (intern == address(0) || intern == address(this)) revert ZeroAddress();
```

```diff
  function reassignIntern(uint256 termId, address newIntern) external onlyOwner {
      Term storage t = terms[termId];
      if (t.closedAt == 0) revert TermNotClosed();
-     if (newIntern == address(0)) revert ZeroAddress();
+     if (newIntern == address(0) || newIntern == address(this)) revert ZeroAddress();
```

---

### [3] Reverting/denylisted `owner()` reverts the whole `closeTerm`/`cancelTerm` transaction, not just the transfer — freezing every future `openTerm` call

**Severity:** Medium · **Confidence:** 85 · `ClawdIntern.closeTerm` / `ClawdIntern.cancelTerm` · **Origin:** `[phase1: dos]` — re-examined in Turn 3 against the source; the underlying mechanic (any reverting `owner()`, not necessarily a denylisted one) was not independently reproduced by a Phase 2 blind agent, several of which correctly noted the real CLAWD token itself has no denylist and treated that scenario as out of scope for *this* deployment — consistent with, not contradicting, this finding, which is about a broken/reverting owner address, not token-level denylisting.

**Description**

The contract's own NatSpec (`ClawdIntern.sol:25-28`) frames a denylisted owner as merely "stalling" `closeTerm`/`cancelTerm`/`slash`. In practice, because Solidity reverts the **entire transaction** when the trailing `clawd.safeTransfer(owner(), ...)` fails, none of `closeTerm`/`cancelTerm`'s state writes persist either:

```solidity
// closeTerm, ClawdIntern.sol:187-194
t.markOut = markOut;
t.payout = payout;
t.closedAt = uint64(block.timestamp);
activeTermId = NONE;
lastTermEnd[t.intern] = uint64(block.timestamp);
emit TermClosed(termId, markOut, gainBps, payout, surplus);

if (surplus > 0) clawd.safeTransfer(owner(), surplus);   // <- reverts here reverts ALL of the above too
```

`activeTermId` stays pointed at the stuck term, and `t.closedAt` stays `0`. Since `openTerm` gates on `if (activeTermId != NONE) revert TermAlreadyActive()` (`ClawdIntern.sol:130`), **no new term can ever open** until ownership is transferred to a working address. `cancelTerm` (`ClawdIntern.sol:210`) is strictly worse: it unconditionally transfers `t.budget` (always non-zero, since `openTerm` rejects a zero budget), so it reverts on every single call while `owner()` can't receive CLAWD — there is no bailout via cancel either. The stuck term's intern is collateral damage too: `claim()` reverts `TermNotClosed` (since `closedAt` never gets set), and `reassignIntern`'s escape hatch is unusable for the same reason (it also requires `closedAt != 0`).

**Proof of Concept**

1. Owner opens and closes a term with `surplus > 0` (a typical below-cap gain).
2. `owner()` cannot receive CLAWD (denylisted by a future token variant, or simply a smart-contract wallet that reverts on receipt — e.g. mid-upgrade, or a Safe with a misconfigured guard).
3. `closeTerm` reverts whole-tx; `activeTermId` still points at the stuck term.
4. `openTerm` for the next intern reverts `TermAlreadyActive`.
5. `cancelTerm` also reverts (unconditional push to the same broken `owner()`).
6. The stuck intern's `claim` reverts `TermNotClosed`.
7. Only recovery: `transferOwnership`/`acceptOwnership` (moves no tokens per the contract's own doc) to a clean address, then retry.

**Recommendation**

Decouple state finalization from the outbound transfer — e.g. a pull-payment pattern for owner-bound refunds (record an `ownerOwed` balance, let the owner withdraw separately) so `closeTerm`/`cancelTerm` can always finalize state and unblock `openTerm`/`claim` even while the owner-side transfer is stuck.

---

### [4] Denylist-capable `clawd` (non-default deployment) can permanently strand all locked/streaming funds with zero recovery path

**Severity:** Medium (deployment-dependent — **not applicable to the intended real CLAWD deployment**, which is a plain non-denylist ERC20; this describes risk in a hypothetical differently-parameterized deployment, since the constructor accepts an unrestricted `IERC20`) · **Confidence:** 65 · `ClawdIntern.closeTerm` / `cancelTerm` / `slash` / `claim` / `rescue` · **Origin:** `[phase1: erc20]` — Phase-1-only; not independently raised by Phase 2, which correctly treated the real token as clean for this specific risk.

**Description**

The constructor accepts any `IERC20` for `clawd` (`ClawdIntern.sol:108`, `114`). If a differently-parameterized deployment used a blocklist-capable token and the **contract's own address** (not the owner) were ever blocklisted, every outbound leg (`closeTerm:194`, `cancelTerm:210`, `slash:232`, `claim:289`) reverts — and unlike the owner-denylist case (Finding 3, recoverable via ownership transfer), there is no recovery path at all: `rescue()` unconditionally refuses `clawd` (`ClawdIntern.sol:261`). All locked budget and every closed term's unvested/unclaimed remainder would be frozen permanently.

**Proof of Concept**

Deploy with a blocklist-capable token as `clawd`; the token issuer blocklists the `ClawdIntern` contract address itself; every `claim`/`slash`/`closeTerm`/`cancelTerm` reverts permanently, and `rescue` is structurally incapable of ever touching `clawd`.

**Recommendation**

Not applicable to the intended real-CLAWD deployment. If the constructor is meant to remain generic across deployments, either restrict `clawd` to non-denylist tokens at deploy time, or add a timelocked/governance-gated emergency override capable of moving `clawd` in extremis.

---

### [5] Unbounded `gainCapBps` lets `closeTerm`'s floor division silently zero a legitimate, positive-gain payout

**Severity:** Low · **Confidence:** 75 · `ClawdIntern.closeTerm` / `setParams` · **Origin:** `[both]` — Phase 1 precision-math checklist, corroborated as LEADs by 2 of 12 blind Phase 2 agents (`invariant`, `boundary`).

**Description**

`gainCapBps` is validated only for non-zero in both the constructor (`ClawdIntern.sol:112`) and `setParams` (`ClawdIntern.sol:251`) — no upper bound, no enforced relationship to `BPS` (10,000) or to `budget`. Used directly as the divisor in `payout = (t.budget * gainBps) / t.capBps` (`ClawdIntern.sol:184`), an oversized `capBps` (a future `setParams` mistake) can floor `payout` to zero regardless of a real, honestly-observed price gain — silently paying the intern nothing while the full budget returns to the owner as "surplus," with `TermClosed` still showing a positive `gainBps` and no flag distinguishing this from an honest below-cap close.

**Proof of Concept**

`capBps=50,000,000` (vs. the deployed `5,000`), `budget=100,000e18`, a real +100% price gain → `gainBps=10,000` correctly reflects the doubling, but `payout = 100,000e18 * 10,000 / 50,000,000 = 20e18` — 20 tokens on a 100,000-token budget for a doubled price. Pushing `capBps` higher floors `payout` to exactly `0`.

**Recommendation**

```diff
- if (_gainCapBps == 0 || _streamLength == 0) revert ZeroAmount();
+ if (_gainCapBps == 0 || _gainCapBps > 100 * BPS || _streamLength == 0) revert ZeroAmount();
```

As defense-in-depth, add a guard in `closeTerm`: `if (gainBps > 0 && payout == 0) revert PayoutRoundedToZero();`.

---

### [6] `setParams`/constructor allow `streamLength ≤ SLASH_DELAY`, silently and permanently disabling `slash()` for that cohort

**Severity:** Low — capped here despite being the single most-corroborated secondary issue in the run (raised as a firm FINDING by 2 of 12 blind Phase 2 agents and as a LEAD by 4 more) because the failure mode has no identifiable victim: it removes the *owner's own* clawback tool and, if anything, benefits the intern by making their payout un-slashable sooner. · **Confidence:** 80 · `ClawdIntern.slash` / `setParams` · **Origin:** `[both]`

**Description**

`SLASH_DELAY` (2 days, immutable, `ClawdIntern.sol:39`) is meant to guarantee a minimum vested floor before a slash is possible, per the contract's own NatSpec: "the intern always vests at least SLASH_DELAY/streamLen of an honest payout" (`ClawdIntern.sol:36-38`). `streamLength` for future terms is settable via `setParams` (`ClawdIntern.sol:250-256`) with only a `!= 0` check — nothing enforces `streamLength > SLASH_DELAY`. If a future term captures `streamLen ≤ SLASH_DELAY`, by the earliest slash-eligible moment (`closedAt + SLASH_DELAY`) the stream is already 100% vested, so `returned = t.payout - vested` is always `0` and `slash()` reverts `NothingToSlash()` (`ClawdIntern.sol:225`) for that term's entire lifetime — silently, with no warning at the point of misconfiguration.

**Proof of Concept**

`setParams(cap, 1 days, cooldown)` → term opens/closes with `streamLen=1 days` → 2 days later, owner has cause to slash → `_vested` already returns the full `payout` → `slash` reverts `NothingToSlash` unconditionally for this term.

**Recommendation**

```diff
- if (_gainCapBps == 0 || _streamLength == 0) revert ZeroAmount();
+ if (_gainCapBps == 0 || _streamLength == 0 || _streamLength <= SLASH_DELAY) revert ZeroAmount();
```

(apply the same check in the constructor).

---

## Informational

Confirmed, real code facts with no material fund-loss path — surfaced by Phase 2's blind pass, re-examined and promoted from lead to Informational on confirmation.

**[I-1] `reassignIntern` doesn't re-sync `lastTermEnd`, desyncing the cooldown ledger.** `[agents: 5 — access-control, first-principles, asymmetry, numerical-gap, boundary]` A reassigned `newIntern` gets no cooldown entry from this term (`lastTermEnd` is only written in `closeTerm`/`cancelTerm`, keyed to the address at that moment); the old intern's cooldown stays stamped even though they no longer hold the term. Self-referential — the owner already fully controls `openTerm`'s `intern` param, so no third-party escalation results — but worth resolving for consistency (`ClawdIntern.sol:240-247`).

**[I-2] `cooldown` is read live, not captured per-term; `setParams(cooldown=0)` immediately before `openTerm` bypasses a specific intern's cooldown.** `[phase2: asymmetry]` Unlike `gainCapBps`/`streamLength`, `cooldown` is re-read from the global at each `openTerm` call (`ClawdIntern.sol:134`). Owner-self-referential — no impact beyond what the owner already controls via the `intern` parameter itself.

**[I-3] `currentIntern()`'s `activeTermId`/`t.end` are never reconciled on-chain; an expired-but-unclosed term keeps reporting as "current."** `[phase2: flow-gap]` The contract's own docstring (`ClawdIntern.sol:301-303`) already tells off-chain consumers (tweet bot, credits, SIWE gate) to check `endsAt` themselves — this is a periphery-integration responsibility, not an on-chain defect, but worth flagging to whoever builds against `currentIntern()`.

**[I-4] `slash`'s `NothingToSlash` check runs before `SlashTooEarly`.** `[agents: 2 — access-control, execution-trace]` `ClawdIntern.sol:225` is evaluated before `ClawdIntern.sol:226`, so calling `slash` too early on a term with `returned==0` surfaces the less-precise revert reason. Cosmetic only, no fund or timing impact.

**[I-5] `cancelTerm` has no time bound relative to `t.end`, despite its NatSpec calling it a "mid-term kill switch."** `[phase2: execution-trace]` Callable even after the term's scheduled end, letting the owner strip a fully-earned payout right up until `closeTerm` is mined. Already covered by the contract's own top-level trust disclosure ("owner... not to cancel a term in bad faith," `ClawdIntern.sol:20-24`) — flagged only as a naming/documentation-consistency gap (`ClawdIntern.sol:197-211`).

## Leads

_Plausible, code-grounded trails that did not reach the confidence-50 floor for a Finding — either genuinely conditional on a future/alternate deployment, or fully neutralized by an existing guard._

- **Rebasing/admin-mint-burn `clawd` causes accounting drift** `[phase1: erc20]`: obligations (`budget`/`payout`/`claimed`) are static snapshots never re-synced to `balanceOf`; conditional on a non-default, non-real-CLAWD deployment.
- **ERC777/hook token via `clawd` or `rescue()` target** `[phase1: erc20, phase2: economic-security]`: reentrancy surface exists in principle but is neutralized by the shared `nonReentrant` lock across all six token-moving functions, plus `reassignIntern`/`setParams` (the two ungated functions) being unreachable from a non-owner callback.
- **`rescue()`'s arbitrary owner-chosen target could reenter via a hook token** `[phase1: dos]`: purely owner self-risk, no cascading effect on term state or intern funds.
- **`intern == owner()` unchecked in `openTerm`** `[phase2: access-control]`: owner could self-appoint and guarantee max payout via marks they also control — subsumed by the contract's already-disclosed "owner trusted for honest marks" surface; doesn't unlock materially new value.

---

## Access-Control Inventory

| Function | Guard | Caller | Moves value? |
|---|---|---|---|
| `openTerm` | `onlyOwner`, `nonReentrant` | owner | pulls `budget` from `msg.sender` |
| `closeTerm` | `onlyOwner`, `nonReentrant` | owner | pushes surplus → `owner()` |
| `cancelTerm` | `onlyOwner`, `nonReentrant` | owner | pushes full budget → `owner()` |
| `slash` | `onlyOwner`, `nonReentrant` + `closedAt≠0`/`!slashed`/`SLASH_DELAY` gates | owner | pushes unvested remainder → `owner()` |
| `reassignIntern` | `onlyOwner` (no `nonReentrant` — no external call) | owner | none directly (redirects future claim destination — see Finding 1) |
| `setParams` | `onlyOwner` (no `nonReentrant`) | owner | none (future terms only) |
| `rescue` | `onlyOwner`, `nonReentrant`, `token≠clawd` | owner | pushes arbitrary non-CLAWD ERC20 → owner-chosen `to` |
| `renounceOwnership` | `onlyOwner`, unconditional revert | nobody | none |
| `claim` | `nonReentrant` only — **permissionless** | anyone | pushes vested-unclaimed → `t.intern` (fixed destination) |
| `transferOwnership` (inherited) | `onlyOwner` | owner | no |
| `acceptOwnership` (inherited) | `msg.sender==pendingOwner` | pending owner | no |
| `claimable`/`currentIntern`/`termCount`/`getTerm` | none, view | anyone | no |

**Roles.** `owner`: set at construction, transferred two-step (`Ownable2Step`), renounce permanently disabled. Unlocks all admin functions and is the fixed refund/rescue destination, resolved **at call time**. `pendingOwner`: unlocks only `acceptOwnership`. `intern` (per-term, not global): stored in `Term.intern`, set by owner at open, changeable by owner via `reassignIntern` at any time post-close (see Finding 1) — holds no on-chain privilege of its own; `claim` is permissionless and simply pays whoever `t.intern` currently is.

**Unguarded state-changing entrypoint:** `claim(termId)` — anyone may trigger it, but its destination is fixed to `t.intern`, never the caller.

## Threat Model

| Actor | Reaches | Could gain | Status |
|---|---|---|---|
| Owner | `openTerm`/`closeTerm` marks | arbitrary payout size via dishonest marks | invariant holds — explicitly accepted trust surface (documented, event-logged) |
| Owner | `closeTerm` timing | indefinite delay past `t.end` | invariant holds — accepted, self-limiting (no new term until close) |
| Owner | `cancelTerm` | deny intern any payout, any time | addressed by **Finding 3** (blast radius bigger than documented); otherwise accepted trust surface |
| Owner | `slash` | claw back unvested remainder | addressed by **Finding 6** (streamLength misconfiguration); the reason-judgment itself is accepted trust surface |
| Owner (denylisted/reverting) | unable to receive at close/cancel/slash | stalls those calls | addressed by **Finding 3** — larger blast radius than the contract's own NatSpec implies |
| Any address | `claim(termId)` | trigger payout release (no fund gain — destination fixed) | invariant holds — examined, no issue |
| Owner | `rescue` w/ arbitrary token | drain any non-CLAWD ERC20, reach hook-bearing token callback | invariant holds — examined; residual reentrancy risk is a Lead, not exploitable |
| Owner→new owner mid-stream | ownership handover | redirect surplus/cancel/slash refunds to new owner | invariant holds — documented as intentional |
| **Reassigned/old intern** | **`reassignIntern`** | **owner redirects already-vested-but-unclaimed payout to themselves** | **addressed by Finding 1 — the primary finding of this audit** |
| Owner (alt. deployment) | any `IERC20` as `clawd` | denylist-capable token strands all funds | addressed by **Finding 4** (deployment-dependent) |

## Coverage

`Entrypoints: 11 external/public state-changing in source, 11 addressed (either a finding, an informational note, or an explicit "examined, no issue").` `Threat rows: 10, 10 answered.` `Coverage holes closed this pass: 0` — both phases, between them, already examined every privileged/value-moving entrypoint and every threat-catalog row; no fresh gap required a first-time re-read in this reconciliation.

**Completeness:** 9 unique (Contract, function) pairs raised across both phases' raw output (`openTerm`, `closeTerm`, `cancelTerm`, `slash`, `reassignIntern`, `setParams`, `claim`, `rescue`, constructor) — 9 covered in the final unified set above.

---

> This review was performed by an automated multi-agent audit pipeline (context-building + checklist breadth + blind attacker-mindset depth + hybrid reconciliation). Automated analysis can never verify the complete absence of vulnerabilities and no guarantee of security is given. A follow-up human review, and remediation verification for Finding 1 in particular before any live deployment holds meaningful intern payouts, is strongly recommended.
