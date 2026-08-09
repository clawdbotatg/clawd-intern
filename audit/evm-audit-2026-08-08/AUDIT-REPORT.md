# ClawdIntern — evm-audit-skills report (2026-08-08)

**Target**: `packages/foundry/contracts/ClawdIntern.sol` — deployed on Base at
[`0xc447bC73F4101726Ae4496C3586047b5F920dcCD`](https://base.blockscout.com/address/0xc447bC73F4101726Ae4496C3586047b5F920dcCD?tab=contract)
(immutable, non-upgradeable; findings against deployed code are operational
guidance now + code fixes for any future redeploy).

**Method**: [ethskills.com/audit](https://ethskills.com/audit/SKILL.md) →
[evm-audit-skills](https://github.com/austintgriffith/evm-audit-skills) pipeline.
Seven parallel domain agents (general, precision-math, erc20, access-control,
dos, chain-specific/Base, defi-staking-as-vesting), each walking its full
checklist against the source + tests; two state-machine findings were confirmed
with live forge tests before being reported. Raw per-domain output:
`findings-*.md` in this directory. Prior audit: One Dollar Audit job 572
(`../onedollaraudit-572.md`), all fixes confirmed present at `eab8d79`.

**Fact established on the way in** (findings-erc20.md): $CLAWD is a
ClankerToken — standard OZ v5 ERC20 + Permit + Votes + Burnable, 18 decimals,
non-proxy, no fee-on-transfer / rebasing / hooks / denylist / pause / admin
mint. Only future mint path is the Superchain bridge predeploy (IERC7802).

**Totals after dedup: 0 Critical · 0 High · 1 Medium · 6 Low · 10 Info.**
The balance-conservation invariant (`balance ≥ Σ(payout−claimed) + activeBudget`)
was checked clean across every state path, including slash and reassign.

---

## Medium

### [M-1] `reassignIntern()` bypasses the slash accountability rail (AC-1; cooldown facet: STAKE-1)
`slash()` promises a 2-day delay and a public onchain reason before the owner
can touch a live stream. `reassignIntern(termId, newIntern)` has neither: the
owner can redirect a closed term's entire remaining stream — including
vested-but-unclaimed tokens — to any address (themselves included) in one tx,
instantly, no reason string. It also skips `lastTermEnd`, so re-pointing a
stream at a just-served intern sidesteps the reappointment cooldown
(confirmed with a forge test). This is an escalation beyond the documented
Phase 0 trust surface: the natspec sells reassign as a bricked-wallet rescue
hatch, but it is strictly stronger than slash.

*Now (deployed code)*: operational — treat `reassignIntern` as
break-glass-only; its use is fully event-logged (`InternReassigned`), so any
non-rescue use is publicly provable. Weight this in the Safe-handoff decision.
*Future redeploy*: gate reassign behind the same `SLASH_DELAY`-style timer +
required reason, and/or restrict `newIntern` to an address the old intern
pre-approved; leave `lastTermEnd[newIntern]` semantics explicit.

## Low

### [L-1] Directly-sent CLAWD is stranded forever (AC-2 / DOS-3 / ERC20-1 / GEN-1 — 4/7 agents)
`rescue()` refuses the reward token wholesale and nothing accounts for
balance in excess of obligations, so any CLAWD transferred straight to the
contract (fat-finger, airdrop) is dead weight. *Future redeploy*: allow
rescuing `clawd` only above `Σ(payout−claimed) + activeBudget`.

### [L-2] No sink-address check on `intern` (ERC20-2 / GEN-2)
`openTerm`/`reassignIntern` accept `address(this)` or the token address as
the intern; `claim()` then "pays" the contract itself and the stream is
unrecoverable (and permissionless `claim` makes the burn griefable once set).
Operational: checklist the intern address; the frontend uses validated
AddressInput. *Redeploy*: `require(intern != address(this) && intern != address(clawd))`.

### [L-3] Owner-receive stall decays slashable value (DOS-1; aliasing variant CHAIN-1)
close/cancel/slash push CLAWD to `owner()`. If the owner can't receive
(contract owner that reverts; L1-aliased owner), those calls stall — and while
slash is stalled the stream keeps vesting, so the slashable remainder decays
to zero. CLAWD has no denylist, so today this requires the owner to *become* a
reverting contract via ownership transfer. Operational: only transfer
ownership to a Safe (which receives ERC20s fine); never to an L1 contract.

### [L-4] `streamLen ≤ SLASH_DELAY` makes a term unslashable (STAKE-2, forge-confirmed)
No floor on `streamLength`: a term captured with `streamLength ≤ 2 days` fully
vests before slash unlocks. Current param is 30 days — safe. Operational:
never `setParams` below ~7 days. *Redeploy*: `require(_streamLength > SLASH_DELAY)`.

### [L-5] Two-step floor under-pays the intern by up to `budget/capBps` (MATH-1)
`payout = budget * (flooredGainBps) / capBps` loses up to ~200 CLAWD per close
versus single-mulDiv `budget * (markOut−markIn) * BPS / (markIn * capBps)`.
Dust at current prices; direction is intern-unfavorable (protocol-safe).
*Redeploy*: compute payout in one mulDiv.

### [L-6] Cooldown anchors at close/cancel time, not scheduled end (DOS-5; live-param facet STAKE-4)
`lastTermEnd` is stamped when the owner actually closes/cancels, and future
`openTerm` checks it against the *live* `cooldown` param — so a late close or
a param change retroactively moves an intern's eligibility window. Owner-trust
adjacent; document per-intern expectations off-chain.

## Info

- **[I-1]** Force-fed ETH unrecoverable (no `receive`; selfdestruct-funded ETH is dust-risk only) — GEN-3/DOS-4.
- **[I-2]** `claim()` push to a reverting `t.intern` blocks that stream until `reassignIntern` — with standard-ERC20 CLAWD only reachable via a contract-wallet intern; the rescue hatch exists — DOS-2.
- **[I-3]** Owner controls close timing; stream start defers with it — documented in natspec, self-limiting (no new term until close) — STAKE-3.
- **[I-4]** Owner key loss wedges the active term's budget forever (renounce disabled by design; mitigate via Safe handoff) — DOS-6.
- **[I-5]** SLASH_DELAY minimum-vest guarantee floors to zero for dust payouts (< streamLen/SLASH_DELAY wei) — MATH-2.
- **[I-6]** `closeTerm` reverts on astronomically large `markOut` (checked mul) — fail-safe, uncapped input — MATH-3.
- **[I-7]** Sequencer downtime shifts value from slashable remainder toward the intern (bounded, direction-safe) — CHAIN-2.
- **[I-8]** Utility layer should read `currentIntern()` at safe/finalized head, not unsafe head — CHAIN-3.
- **[I-9]** CLAWD supply not strictly fixed: Superchain bridge (IERC7802) can mint on Base — economic context only — ERC20-3.
- **[I-10]** Escrow math assumes exact-balance token — true for CLAWD; re-audit if the token ever changes — ERC20-4.

---

## Disposition

| Finding | Deployed contract (now) | Future redeploy |
|---|---|---|
| M-1 reassign bypass | Break-glass only; Safe handoff; watch `InternReassigned` | Timer + reason on reassign |
| L-1 stranded CLAWD | Don't send CLAWD directly | Excess-over-obligations rescue |
| L-2 sink intern | Address checklist (UI validates) | `require` guards |
| L-3 owner-receive stall | Safe-only ownership transfers | Pull-payment for owner proceeds |
| L-4 short-stream unslashable | Keep `streamLength` ≥ 7d | Floor in `setParams`/ctor |
| L-5 payout floor | Accept (dust) | Single mulDiv |
| L-6 cooldown anchor | Document per-intern | Snapshot cooldown per term |

Phase 5 (issues): M-1 filed as a GitHub issue on `clawdbotatg/clawd-intern`
per the pipeline (Medium+ only).
