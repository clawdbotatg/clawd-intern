# Chain-Specific Findings — ClawdIntern.sol on Base (OP Stack)

Contract: `packages/foundry/contracts/ClawdIntern.sol`
Deployed: Base mainnet `0xc447bC73F4101726Ae4496C3586047b5F920dcCD` (2026-08-07, solc 0.8.30)
Checklist: `evm-audit-chain-specific` (Optimism/Base/OP Stack + General L2 sections)

## [CHAIN-1] Cross-domain ownership via address aliasing can strand owner-directed token pushes

**Severity**: Low
**Category**: evm-audit-chain-specific
**Location**: `closeTerm()` / `cancelTerm()` / `slash()` (pushes to `owner()`), `Ownable2Step` transfer path
**Description**: The contract pushes CLAWD to `owner()` in three places (surplus at close, full budget on cancel, unvested remainder on slash). The trust-model comment already covers denylisted owners, but there is a Base-specific trap when ownership is ever moved cross-domain. On OP Stack, an L1 contract calling into L2 via the `OptimismPortal` arrives as its **aliased** address (`L1_addr + 0x1111000000000000000000000000000000001111`). Two consequences:

1. *Benign, recoverable*: `transferOwnership(l1ContractAddr)` with the raw (un-aliased) L1 address can never be accepted — the L1 contract's deposit transactions arrive as the alias, so `acceptOwnership()` always sees the wrong `msg.sender`. `Ownable2Step` correctly wedges here (this is the protection working), and the current owner can re-issue `transferOwnership`.
2. *Latent, fund-affecting*: the only way an L1 contract can pass the 2-step handshake is to be nominated by its **aliased** address and accept via a portal deposit. If that ever happens (e.g. "decentralize to the L1 timelock" in a later phase), every subsequent close/cancel/slash pushes CLAWD to the alias address on Base — an address with no code, controllable only through further L1→L2 portal deposits initiated by that exact L1 contract. An L1 owner that cannot make arbitrary calls to the portal (many timelock/governor setups) effectively strands the surplus/refund/slash flows. The NatSpec advice "transfer to a Safe / governance" does not distinguish L2-native from L1-based governance.

**Proof of Concept**:
1. Owner calls `transferOwnership(alias(L1Timelock))`; L1Timelock executes `OptimismPortal.depositTransaction(clawdIntern, ..., acceptOwnership())` — on Base `msg.sender == alias(L1Timelock) == pendingOwner`, acceptance succeeds.
2. Later, `closeTerm(markOut)` computes `surplus > 0` and executes `clawd.safeTransfer(owner(), surplus)` → tokens sit at `alias(L1Timelock)` on Base.
3. Moving them requires L1Timelock to deposit a tx calling `clawd.transfer(...)` from its alias — impossible if the timelock's action set can't target the portal with the required parameters.

**Recommendation**: Keep the owner an L2-native account (Base Safe) and document that requirement next to the existing denylist note: "the owner must be an address that can transact natively on Base; L1 contracts (aliased or not) are unsupported owners." Optionally, a future phase could replace push-to-`owner()` with pull-based withdrawal, which removes both the denylist and the aliasing hazard at once.

## [CHAIN-2] Sequencer downtime shifts value from the slashable remainder to the intern (bounded, direction-safe)

**Severity**: Info
**Category**: evm-audit-chain-specific
**Location**: `slash()` / `_vested()`
**Description**: All time gates are wall-clock (`block.timestamp`), and OP Stack timestamps track real time — after a sequencer outage, blocks are produced with timestamps that catch up to the wall clock. So vesting in `_vested()` keeps accruing *through* an outage, while `slash()` (like every tx) cannot execute until the sequencer resumes or the owner force-includes via the `OptimismPortal` (the sequencing window bounds censorship at ~12h). Net effect: an outage of `d` hours during a live stream moves up to `payout * d / streamLen` from the owner-recoverable remainder to the intern's vested balance. For the deployed 30-day stream, a severe 12-hour outage shifts ~1.7% of a payout. The asymmetry only ever favors the intern (the same direction as the deliberate `SLASH_DELAY` floor), never lets a slash fire early, and cannot be triggered by the intern. `claim()` is permissionless and equally force-includable, so the intern is not lockout-harmed either; term end, the 2-day `SLASH_DELAY`, and the 28-day cooldown are all day-scale and unaffected by hour-scale halts.
**Proof of Concept**: Term closed at `T` with `payout = P`, `streamLen = 30 days`. Owner intends to slash at `T + 2 days` (earliest allowed). Sequencer halts from `T + 2 days` to `T + 2 days + 12h`. When `slash()` finally lands, `_vested()` returns `P * 2.5d / 30d` instead of `P * 2d / 30d` — the intern keeps an extra `P/60`.
**Recommendation**: No code change needed — the drift is bounded, one-directional, and consistent with the stated trust model. Worth a one-line note in the trust-model NatSpec so a future oracle-phase redesign doesn't accidentally invert the asymmetry (e.g. by making vesting pause-able but slash time-locked from a stale anchor).

## [CHAIN-3] Off-chain consumers of `currentIntern()` should read from a safe/finalized block (unsafe-head reorgs)

**Severity**: Info
**Category**: evm-audit-chain-specific
**Location**: `currentIntern()` (view consumed by the utility layer: tweet bot, credits, SIWE gate)
**Description**: The contract's own state machine is reorg-safe (single owner-driven writer, no cross-tx assumptions, no `block.number` reliance). The chain-specific exposure is off-chain: Base's *unsafe* head (sequencer preconfirmations) can reorg until batches are posted to L1 and derived (~minutes to L1-safe, longer to finalized). The NatSpec explicitly designates `currentIntern()` as "the one call the utility layer makes" to gate privileges. A consumer reading the unsafe head immediately after a `TermOpened`/`TermCancelled` could grant or revoke tweet-bot/SIWE privileges based on state that is then reorged away — e.g. an intern keeps posting for a few minutes after a cancel that briefly disappears, or a just-opened term's privileges flap. No funds are at risk in the contract; escrow accounting re-derives identically on the canonical chain.
**Proof of Concept**: `cancelTerm()` lands in unsafe block `N`; the SIWE gate polls latest and revokes access; a sequencer reorg drops block `N`; the gate's next poll re-grants; the tx lands again in `N'`. Privilege state flaps across the utility layer during the window. (Deep sequencer reorgs on Base are rare but are a documented property of preconfirmations.)
**Recommendation**: Have the utility layer query `currentIntern()` at the `safe` (or `finalized`) block tag, or debounce privilege changes by a few minutes. Nothing to change in the contract.

## Coverage

Checklist items reviewed against the contract (Optimism/Base/OP Stack + General L2 sections; other-chain sections N/A by deployment):

- **`block.number` timing on 2s blocks** — clean: no `block.number` anywhere; all gates use `block.timestamp`, which on OP Stack is wall-clock (2s granularity, immaterial for day-scale gates: `termLength`, `SLASH_DELAY = 2 days`, `cooldown = 28 days`, 30-day `streamLen`).
- **Sequencer timestamp drift** — clean: the sequencer can skew `block.timestamp` only within protocol drift bounds (seconds-to-minutes vs the L1 origin). Every gate and the vesting numerator/denominator read the *same* clock, so the `SLASH_DELAY/streamLen` minimum-vest guarantee cannot be compressed by drift; a marginal early `closeTerm` (seconds) is subsumed by the documented owner control of close timing. Downtime effects covered as CHAIN-2.
- **Sequencer downtime + stale oracles** — N/A: no oracles; marks are owner-provided by design (Phase 0), so there is no Chainlink uptime-feed obligation. Downtime interaction with the slash window covered as CHAIN-2.
- **`block.prevrandao` / `difficulty` as randomness** — clean: not used.
- **L1 data fees / gas estimation** — N/A: no on-chain gas estimation, no `gasleft()` logic.
- **`transfer()`/`send()` 2300-gas stipend** — clean: no native ETH handling at all; token moves use `SafeERC20`.
- **Address aliasing (L1→L2 `msg.sender`)** — finding CHAIN-1: relevant only to future cross-domain ownership; no in-contract L1 messaging exists.
- **`tx.origin == msg.sender` EOA checks** — clean: not used.
- **PUSH0 / opcode support for solc 0.8.30 output** — clean: `foundry.toml` pins `solc_version = "0.8.30"` with the default EVM target; Base activated Canyon (PUSH0), Ecotone (Cancun: MCOPY/TSTORE) and Isthmus (Pectra/Prague) well before the 2026-08-07 deploy, and the verified deployment at `0xc447bC73F4101726Ae4496C3586047b5F920dcCD` succeeded — empirical confirmation. No `SELFDESTRUCT`, no precompile calls in the contract.
- **Cached `block.chainid` / signature domains** — clean: no signatures, no permit, no EIP-712 domain.
- **Hardcoded cross-chain token/infra addresses** — clean: `clawd` is a constructor-injected immutable; no other external addresses. Frontend `externalContracts.ts` carries the Base-specific CLAWD address, which is per-chain config working as intended.
- **Frontrunning threat model (private Base mempool)** — clean: all state-changing entry points are `onlyOwner` except `claim()`, which is permissionless but can only ever pay `t.intern`; nothing is frontrunnable for profit on any mempool model.
- **Reorg characteristics** — finding CHAIN-3 (off-chain consumers only); the on-chain state machine has no finality assumptions.
- **`uint64` timestamp casts** — clean: safe for ~584B years; `start + termLength` on `uint64` reverts on overflow under 0.8 checked arithmetic (owner-supplied input).
- **Arbitrum / zkSync / Blast / BSC / Polygon sections** — N/A: single-chain Base deployment.
