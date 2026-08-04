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

### Price source: TWAP, denominated right

- **Oracle:** Uniswap V3/V4 pool observation (CLAWD/WETH on Base, whichever pool
  is canonical + deepest). Multi-block TWAPs are the standard flash-loan defense —
  a flash loan lives and dies in one block and moves a long TWAP by ~nothing.
- **Denomination:** compose CLAWD/WETH TWAP with Chainlink ETH/USD on Base so the
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

## 4. Contracts (Phase 0)

Foundry project, Base (+ Base Sepolia first). ~3 small contracts:

```
InternRegistry.sol
  appoint(address intern, uint64 termLength)   onlyOwner (multisig)
  currentIntern() → (address, termId, endsAt)  ← the utility layer reads only this
  cooldown enforcement, one active term at a time

RewardVault.sol
  fund(termId, budget)            locks CLAWD at appointment
  settle(termId)                  anyone can call after term end; reads oracle,
                                  computes payout, opens the stream, returns
                                  surplus to treasury
  claim(termId)                   intern pulls vested amount (linear over 30d)
  slash(termId)                   governance-only, unvested portion only

TwapOracle.sol
  markIn(pool)   3d TWAP  (Uniswap observe() + Chainlink ETH/USD → USD price)
  markOut(pool)  7d TWAP
  liquidity floor check
```

Streaming: a hand-rolled linear vest is ~20 lines and keeps the system
self-contained; Sablier V2 on Base is the alternative if we'd rather have their
UI for free. Lean hand-rolled — the slash hook composes better.

Tests that matter most: fork-test the TWAP math against the real pool;
simulate attack #2 (end-of-term pump) and #3 (pre-term dump) and assert the
payout delta is small; fuzz `settle` around term boundaries.

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

- Which chain/pool is canonical for CLAWD, and how deep is it? (Drives budget
  sizing and whether the TWAP is trustworthy at all — if liquidity is very thin,
  we should fix that before this launches.)
- Price-only v1, or blend in a non-price metric from day one (§3.3)? My
  recommendation: blend, even 75/25, for both legal posture and mechanism
  quality.
- What is CV vs CLAWD exactly (selection-stake vs reward token), and does CV
  already have locking infrastructure to reuse for Phase 2?
- Budget per term: fixed CLAWD amount, or fixed % of a treasury pot?
