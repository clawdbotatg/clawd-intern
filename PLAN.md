# clawd-intern — design plan

**One sentence:** a rotating "intern" address is appointed for a fixed term, gets
control of marketing + build credits, and earns a CLAWD token stream sized by how
much the token price rose (sustainably) during their term — on-chain stock options
for a growth hire that governance (eventually Clawd himself) picks each week.

**The strongest framing, and the one to build around:** this is a **performance
grant with vesting**, the on-chain analog of employee stock options. Executives
are legally paid enormous sums for "number go up" every day — the legitimacy comes
from (a) the arrangement being **disclosed**, (b) the payout **vesting over time**
so short-term games don't cash out, and (c) no fraud (no wash trading, no false
statements). Every mechanism decision below exists to preserve one of those three
properties.

---

## 0. Research findings (2026-08-03)

- **CLAWD token:** `0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07` on **Base**.
  Price ≈ $0.0000069, FDV ≈ $675k.
- **Canonical pool:** **Uniswap V4** CLAWD/WETH, poolId
  `0x9fd58e73d8047cb14ac540acd141d3fc1a41fb6252d674b730faf62fe24aa8ce` —
  ~$707k liquidity, ~$10k/day volume. Everything else is dust by comparison:
  the V3 CLAWD/WETH pool (`0xCD55…FAc3`) holds only ~$25k, Aerodrome USDC ~$5k.
- **⚠️ Oracle consequence:** Uniswap **V4 removed TWAP oracles from core** —
  observations only exist if the pool was created with an oracle hook, and hooks
  can't be retrofitted. The V3 pool's built-in TWAP exists but $25k of depth is
  too thin to trust. See §2 "Price source" for the revised design.
- **CV = Clawdviction** (larv.ai): governance weight earned by staking CLAWD,
  conviction = stake × time (1 CLAWD × 20 days = 1 CV). Larva agents debate and
  vote on proposals for their owners. **Phase 2 selection can plug straight into
  this** — "lock CV to pick/veto the intern" is an existing system, not new infra.
  CV is also spendable (Conclave chat/engagements), so *spending* CV to
  nominate is another option.
- **Existing vesting primitive:** `clawd-vesting`
  (`0x8d094DA613827Ec6B6C667D10b0719b494D76049`, Base) — linear drip,
  no-admin-keys, but hardcoded 10-minute duration and single beneficiary; the
  pattern forks cleanly into the 30-day intern stream.
- **Treasury:** `safe.clawd.atg.eth`, with a loud "not a single token has been
  sold" ethos. Narrative note: the intern *will* sell streamed tokens — that's
  the point of comp — so the messaging should pre-frame intern emissions as
  "earned comp, publicly metered on-chain," distinct from team sales.
- **Budget sizing:** at ~$707k pool depth, the ≤ low-single-digit-% rule puts a
  sensible per-term budget around **$5–15k worth of CLAWD** (≈ 0.7–2B CLAWD at
  today's price).

## 1. Decoupled modules (one address, three systems)

The intern is just an address. Three independent systems key off it, and each can
evolve separately (exactly as Austin sketched):

| Module | Phase 0 | Later |
|---|---|---|
| **Selection** — who is the intern | multisig appoints manually | application site → Clawd picks → CV-lock governance |
| **Reward** — what they earn | TWAP-marked CLAWD stream (the core contract) | same contract, tuned params |
| **Utility** — what they can do | Twitter delegation, 1 tweet/day on main, clawd-services credits | more surface as trust grows |

Never let these couple. The reward contract should not know *how* the intern was
chosen; the utility layer should only ask one question: `who is the current
intern?` (via SIWE against `currentIntern()`).

## 2. Core reward mechanism

### The term lifecycle

```
appoint(intern, termLength)          e.g. 7 or 14 days
  └─ markIn  = TWAP over the window BEFORE the appointment tx
term runs … intern tweets, builds, ships
term ends
  └─ markOut = TWAP over the FINAL 7 days of the term
  └─ gain    = max(0, (markOut - markIn) / markIn)
  └─ payout  = budget × min(gain, gainCap) / gainCap     (linear, capped)
  └─ payout streams linearly to intern over the next 30 days, in CLAWD
```

### Parameters (initial suggestions, all governance-settable)

- `termLength`: 14 days (one week feels too short to ship anything real)
- `budget`: fixed CLAWD amount locked per term when the intern is appointed —
  small relative to pool depth (see anti-gaming #4)
- `gainCap`: 50% — a 50%+ gain earns the full budget; prevents a moonshot week
  from draining anything beyond the pre-locked budget (it can't — budget is the
  ceiling — but the cap also flattens the incentive to do something insane)
- `streamLength`: 30 days, linear, starts at term end
- `cooldown`: an address can't be intern again for N terms

### Price source — Phase 0 decision (2026-08-03): admin marks

Austin's call: **the owner provides the price at open and close.** Since the
admin picks the timing, nobody can flash-loan "the moment of the mark" — there
is no onchain read to attack. This deletes the entire oracle problem for
Phase 0 (which matters extra because the deep pool is V4 with no native TWAP —
see below). The trust trade-off is explicit and documented in CROPS terms: the
owner is trusted for marks; every mark is emitted in an event so anyone can
compare it against public charts, and dishonest marks are publicly provable.
The checkpoint-oracle design below is the **Phase 1+ upgrade path**, kept for
when selection/settlement decentralizes.

### Price source (Phase 1+): TWAP, denominated right

- **The wrinkle (see §0):** the deep pool is Uniswap **V4**, which has no native
  TWAP — and the V3 pool that *does* have one is too thin ($25k) to trust.
  Options, in order of preference:
  1. **Checkpoint oracle (recommended):** a small permissionless contract with
     `poke()` — anyone (a keeper cron, the settle tx itself, random users) calls
     it to record the V4 pool's current sqrtPrice into a cumulative accumulator;
     TWAP = time-weighted mean of checkpoints over the window. Guards: minimum
     spacing between counted checkpoints, per-checkpoint price-move clamp (e.g.
     ±10% vs previous, so a single manipulated block can't spike the mean), and
     a minimum-observation count for a mark to be valid. To rig a 7-day window an
     attacker must hold a moved price across *many spaced checkpoints* against
     arbitrage — economically the same defense as a native TWAP.
  2. **Migrate/see liquidity into a V4 pool created with a truncated-oracle hook**
     — cleanest long-term, but means moving the canonical pool; heavier lift.
  3. **Deepen the V3 pool** and use its native TWAP — only if there's an
     independent reason to hold V3 liquidity.
  Cross-check either way: settle can sanity-band the primary mark against the
  V3 TWAP and revert to governance settlement if they diverge wildly.
- **Denomination:** compose the CLAWD/WETH mark with Chainlink ETH/USD on Base so the
  intern is measured in **USD terms**, not ETH terms. Otherwise an ETH rally pays
  the intern for doing nothing (and an ETH crash punishes a great intern). Ship
  v1 with the composition; make the denominator swappable.
- **Windows:** mark-in = 3-day TWAP ending at the appointment tx; mark-out =
  7-day TWAP ending at term end. Long windows are the whole defense — see next.

### Anti-gaming analysis (each attack → the mitigation that kills it)

1. **Flash loan at either mark** → multi-block TWAP. Dead by construction.
2. **Pump the price in the final hours** → mark-out is a *7-day* TWAP, so you'd
   have to hold an elevated price against arbitrage for a week of block-time —
   that's not a manipulation, that's just… buying and holding, which is fine.
   Plus the payout is in CLAWD streamed over 30 more days: if the pump collapses,
   the tokens they're receiving collapse with it. The stream *is* the vesting
   cliff that makes short-termism unprofitable. This is Austin's key insight and
   it does most of the work.
3. **Dump before your own term starts** (lower your own mark-in) → mark-in window
   ends at the *appointment tx*, and selection should be announced only at
   appointment. Belt-and-suspenders: `markIn = max(TWAP_at_selection,
   TWAP_at_termStart)` if selection and start are ever separated.
4. **Thin-liquidity games** — if the pool is shallow, moving even a 7-day TWAP
   gets cheap. Mitigations: (a) designate the canonical deep pool in the
   contract, (b) keep `budget` small relative to pool depth (rule of thumb:
   budget ≤ a low single-digit % of pool TVL), (c) optionally read pool liquidity
   at mark time and refuse to settle below a floor (revert → governance settles
   manually).
5. **Intern just buys CLAWD with their own money** → allowed, even good — that's
   real demand and they're exit-liquidity for themselves via the stream. Not an
   attack.
6. **Wash trading** → doesn't move a TWAP without sustained one-directional
   capital (wash volume is price-neutral), but it *is* the thing that turns this
   from "performance comp" into "market manipulation" legally — so it's banned in
   the intern agreement (§4) and grounds for the clawback.
7. **Collusion across terms** (I pump your term, you pump mine) → cooldown +
   the payout cap bounds the damage; governance selection is the real filter.

### Escape hatch

A governance-only `slash(termId)` that cancels an unvested stream, usable during
the stream window, for provable manipulation or agreement breach. It's a
centralization trade-off, but during Phase 0 (manual selection anyway) it's free
insurance; sunset it when selection decentralizes.

## 3. Legal (not legal advice — get a real crypto lawyer before mainnet)

Honest assessment: **the raw pitch "we pay you if the price goes up" is the
single spiciest way to phrase this**, and phrasing/structure genuinely matters
here. But the underlying structure is defensible, because it's economically
identical to things that are done legally all the time:

**What makes it defensible:**
- **It's equity-style performance compensation.** Stock options and RSU grants
  are exactly "get paid for price appreciation, vested over time." The vesting
  stream and the payment-in-kind (CLAWD, not stables) are the same alignment
  devices public companies use.
- **It's radically disclosed.** The terms, the budget, the marks, and the payout
  are all on-chain and public. The failure mode in every SEC touting action
  (Section 17(b) and its state analogs) is *undisclosed* paid promotion. Here the
  compensation arrangement is literally a public smart contract.
- **No fraud in the mechanism.** Nothing about it requires false statements or
  wash trades; the TWAP design actively makes manipulation the *losing* strategy.

**What keeps it risky:**
- **If CLAWD is deemed a security**, paying people to promote it triggers
  touting/registration issues regardless of disclosure quality. This is the
  wildcard nobody can engineer away; it's jurisdiction- and facts-dependent.
- **A bad intern is your liability surface.** If an intern wash-trades or lies
  ("partnership incoming!") to hit their mark, the program that paid them looks
  like it procured manipulation. The intern agreement + slash exist for this.
- **CFTC manipulation authority** covers commodities too — "we didn't think it
  was a security" is not a full shield if actual manipulation happens.

**Structural mitigations to build in (cheap now, expensive later):**
1. **Mandatory disclosure by the intern**: every promotional post from the intern
   during the term must disclose the arrangement ("I'm this term's clawd intern,
   compensated in CLAWD per the public intern contract: <link>"). Put it in the
   agreement; make the Twitter-bot append it automatically so it can't be
   forgotten.
2. **A signed intern agreement** (click-through at application): no wash trading,
   no false/misleading statements, disclosure duty, acknowledgment that payout
   may be zero, slash conditions.
3. **Blend the metric (recommended, and worth real consideration):** weight the
   payout e.g. 50% price gain / 50% verifiable non-price growth metrics (protocol
   revenue, active users, tx counts — whatever CLAWD's ecosystem can attest
   on-chain). "Growth incentive" is a materially better posture than "price
   incentive," and it's also just a better *mechanism* — it pays for the
   sustainable thing directly instead of hoping price proxies it. The contract
   below supports this as a pluggable `IMetric[]` with weights; ship v1 with
   price-only if desired, but leave the socket.
4. **Don't market it as "get paid to pump."** Market it as "run growth for two
   weeks, comp vests in CLAWD based on results." Same contract, very different
   exhibit A.
5. **Lawyer review before mainnet + real budget.** Testnet and a toy budget need
   nothing; before meaningful money, one consult ($) is worth avoiding the tail
   risk (jail is very unlikely for building this in good faith with disclosure —
   the realistic tail is enforcement/fines aimed at the *program*, and a consult
   shrinks it a lot).

## 4. Contract (Phase 0) — ONE contract, admin-marked

Per the ethskills ship guidance (0–2 contracts for an MVP) and Austin's
admin-marks decision, Phase 0 collapses to a single contract on Base:

```
ClawdIntern.sol  (Ownable; owner = Austin, later a Safe)

  openTerm(intern, markIn, budget, termLength)   onlyOwner
    · one active term at a time; pulls `budget` CLAWD in (SafeERC20)
    · markIn = USD price ×1e18, read by the admin off public charts
  closeTerm(markOut)                             onlyOwner, at/after term end
    · gainBps  = markOut > markIn ? (markOut−markIn)·10000/markIn : 0
    · payout   = budget × min(gainBps, gainCapBps) / gainCapBps
    · surplus returns to owner; 30-day linear stream opens for the intern
  cancelTerm()                                   onlyOwner, mid-term kill switch
    · rogue-intern escape hatch: budget returns, no payout (trust trade-off
      documented — the admin can rug a term; Phase 0 accepts this)
  claim(termId)                                  intern pulls vested CLAWD
  slash(termId)                                  onlyOwner, unvested only
  currentIntern() → (intern, termId, endsAt)     ← the only thing the utility
                                                    layer ever reads

  Every mark, payout, slash emits an event — the transparency that makes
  admin marks auditable-by-anyone is load-bearing (legally too, §3).
```

Streaming is hand-rolled linear vesting (~15 lines) — self-contained and the
slash hook composes cleanly. No oracle contract in Phase 0; the §2 checkpoint
oracle slots in later by replacing the two mark parameters with oracle reads.

Tests that matter most: fuzz the gain/payout math (zero, negative, > cap,
extreme marks), fuzz vesting across time (claim monotonic, never exceeds
payout), slash mid-stream, cancel mid-term, access control on every mutating
function, surplus accounting exact to the wei.

## 5. Utility layer (off-chain, keyed to `currentIntern()`)

- **Auth everywhere = SIWE**: sign with the intern address, backend checks
  `currentIntern()`. No new accounts, no passwords.
- **Intern Twitter account**: rotate credentials per term *or* (better) a bot
  holds the account and posts on the intern's behalf via a submit UI — never
  hand out the password. The bot appends the §3 disclosure line.
- **One tweet/day on the main account**: submit → queue → bot posts; rate limit
  lives in the bot. Optionally a human/Clawd veto during Phase 0.
- **clawd services credits**: credit the intern address in the existing services
  ledger for the term; expire at term end.

## 6. Selection evolution

- **Phase 0 — manual:** multisig appoints. Start here; everything else works
  identically underneath.
- **Phase 1 — Clawd picks:** application website (SIWE + a pitch: "what will you
  do with two weeks, one tweet/day, and build credits?"). Applications go
  on-chain or to a public feed; Clawd (agent) reviews weekly, publishes reasoning
  publicly (that transparency is itself great content), multisig executes his
  pick. Clawd choosing his own intern is the marketing hook — lead with it.
- **Phase 2 — governance:** lock CV to vote on applicants (or to veto Clawd's
  pick — a veto is a lighter first step than full election). Selection stake ≠
  reward token is fine; they're decoupled by design.

## 7. Build order

1. **Contracts + fork tests** (Foundry, Base Sepolia): Registry, Vault, Oracle,
   attack-sim tests. *The mechanism is the product; everything else wraps it.*
2. **Dry-run term** on testnet with a friendly intern and fake budget — exercise
   the full lifecycle including settle + stream + slash.
3. **Utility plumbing**: SIWE gate, tweet-queue bot with auto-disclosure,
   credits hook.
4. **Application site** + Clawd-picks flow.
5. **Lawyer consult**, then mainnet with a small budget and the metric blend
   decision made.
6. **Phase 2 governance** only after several clean terms.

## Open questions for Austin

- ~~Which chain/pool is canonical for CLAWD?~~ **Answered (§0):** Uniswap V4
  CLAWD/WETH on Base, ~$707k deep — plenty for a $5–15k/term budget, but V4's
  missing native TWAP forces the checkpoint-oracle design in §2.
- ~~What is CV?~~ **Answered (§0):** Clawdviction on larv.ai — stake-×-time
  governance weight with larva agents; Phase 2 selection reuses it directly.
- Price-only v1, or blend in a non-price metric from day one (§3.3)? My
  recommendation: blend, even 75/25, for both legal posture and mechanism
  quality.
- Checkpoint oracle (§2 option 1) vs. migrating liquidity to an oracle-hooked V4
  pool (option 2)? Checkpoint is far less disruptive; hook pool is cleaner
  forever-infra.
- Budget per term: fixed CLAWD amount, or fixed % of a treasury pot?
- Who runs the `poke()` keeper (harness cron is the obvious answer), and do we
  pay a tiny CLAWD bounty per poke to make it permissionlessly self-sustaining?
