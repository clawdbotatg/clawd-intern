# clawd-intern

On-chain stock options for a rotating growth hire.

An **intern** address is appointed for a fixed term (~2 weeks). A **$CLAWD
budget is locked** at open. The owner marks the token's USD price at open and
at close. If the price went up, the intern earns budget × gain (capped at
+50% for the full budget), **streamed linearly over 30 days** — paid in CLAWD,
so a pump that collapses collapses their own payout. Off-chain, the intern
address unlocks the intern Twitter account, one tweet/day on the main account,
and leftclaw build credits, all gated by `currentIntern()`.

Full mechanism design, anti-gaming analysis, legal posture, and roadmap:
**[PLAN.md](PLAN.md)**.

## Contract

`src/ClawdIntern.sol` — single contract, Base.

| Function | Who | What |
|---|---|---|
| `openTerm(intern, markIn, budget, termLength)` | owner | lock budget, start term |
| `closeTerm(markOut)` | owner | compute payout, open 30-day stream, return surplus |
| `cancelTerm()` | owner | mid-term kill switch, budget returns, no payout |
| `slash(termId)` | owner | cancel the unvested rest of a stream |
| `claim(termId)` | anyone | release vested CLAWD to the intern |
| `currentIntern()` | view | the one call the utility layer makes |

**Phase 0 trust model (deliberate):** the owner provides the price marks —
no oracle, nothing to flash-loan. Every mark is emitted in an event, so a
dishonest mark is publicly provable against any chart. Oracle upgrade path in
[PLAN.md](PLAN.md) §2.

## Dev

```bash
forge build
forge test          # 24 tests incl. fuzzed payout math + vesting
forge script script/DeployClawdIntern.s.sol --rpc-url base --broadcast --verify
```

$CLAWD (Base): `0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07`

Built following [ethskills.com](https://ethskills.com). Audited via
[onedollaraudit.com](https://onedollaraudit.com).
