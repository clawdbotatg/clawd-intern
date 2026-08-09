# 🦞 clawd-intern

On-chain stock options for a rotating growth hire — a Scaffold-ETH 2 dApp on Base.

An **intern** address is appointed for a fixed term (~2 weeks). A **$CLAWD
budget is locked** at open. The owner marks the token's USD price at open and
at close. If the price went up, the intern earns budget × gain (capped at
+50% for the full budget), **streamed linearly over 30 days** — paid in CLAWD,
so a pump that collapses collapses their own payout. Off-chain, the intern
address unlocks the intern Twitter account, one tweet/day on the main account,
and leftclaw build credits, all gated by `currentIntern()`.

Full mechanism design, anti-gaming analysis, legal posture, and roadmap:
**[PLAN.md](PLAN.md)**.

## Deployment

**Base mainnet: [`0xD390486ab72ED8af1EE06F1060E9663aAbfe2A55`](https://basescan.org/address/0xD390486ab72ED8af1EE06F1060E9663aAbfe2A55)**
— deployed 2026-08-08 via the SE-2 flow (`yarn deploy --network base`), source
verified on Basescan, Sourcify and Blockscout. Params: CLAWD `0x9f86dB9f…6b07`,
gainCapBps 5000 (+50% = full budget), streamLength 30 days, cooldown 28 days.
Owner: `0x7E6Db18a…C471` (leftclaw ops wallet; Ownable2Step — transferable to
a Safe later).

Audit trail (identical source both deployments): One Dollar Audit job 572
(`audit/onedollaraudit-572.md`, fixes in `eab8d79`) + the ethskills
evm-audit-skills pipeline (`audit/evm-audit-2026-08-08/AUDIT-REPORT.md`,
0C/0H/1M — M-1 tracked as issue #1). Supersedes the pre-SE-2 deploy at
[`0xc447bC…dcCD`](https://basescan.org/address/0xc447bC73F4101726Ae4496C3586047b5F920dcCD)
(2026-08-07, also verified, never used — no term was ever opened).

## Contract

`packages/foundry/contracts/ClawdIntern.sol` — single contract, Base.

| Function | Who | What |
|---|---|---|
| `openTerm(intern, markIn, budget, termLength)` | owner | lock budget, start term |
| `closeTerm(markOut)` | owner | compute payout, open 30-day stream, return surplus |
| `cancelTerm()` | owner | mid-term kill switch, budget returns, no payout |
| `slash(termId, reason)` | owner | cancel the unvested rest of a stream (≥2 days after close, public reason) |
| `reassignIntern(termId, newIntern)` | owner | redirect a closed term's stream if the intern can't receive CLAWD |
| `claim(termId)` | anyone | release vested CLAWD to the intern |
| `currentIntern()` | view | the one call the utility layer makes |

**Phase 0 trust model (deliberate):** the owner provides the price marks —
no oracle, nothing to flash-loan. Every mark is emitted in an event, so a
dishonest mark is publicly provable against any chart. Oracle upgrade path in
[PLAN.md](PLAN.md) §2.

## App

Scaffold-ETH 2 monorepo:

- `packages/foundry` — the contract, 32 Foundry tests (fuzzed payout math +
  vesting), deploy scripts, and the Base broadcast record.
- `packages/nextjs` — the dashboard at `/`: current intern + term status,
  vesting stream progress, permissionless claim, past-term history, and an
  owner console (open/close/cancel/slash/reassign) that only renders for the
  contract owner. `/debug` gives raw access to every function. The frontend
  talks to the live Base contract via `contracts/externalContracts.ts`.

```bash
yarn install
yarn fork --network base   # terminal 1: anvil fork of Base (real CLAWD exists)
yarn deploy                # terminal 2: local deploy for development
yarn start                 # terminal 3: Next.js at localhost:3000

yarn foundry:test          # 32 tests
```

Against production there is nothing to deploy — the app reads the live
contract on Base. Set `NEXT_PUBLIC_ALCHEMY_API_KEY` in
`packages/nextjs/.env.local` (never commit keys).

$CLAWD (Base): `0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07`

Built following [ethskills.com](https://ethskills.com). Audited via
[onedollaraudit.com](https://onedollaraudit.com) + the
[evm-audit-skills](https://github.com/austintgriffith/evm-audit-skills)
checklist pipeline (`audit/`).
