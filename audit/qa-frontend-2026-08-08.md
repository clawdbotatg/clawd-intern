# QA Frontend Audit — Clawd Intern dApp — 2026-08-08

Reviewer: fresh QA agent, ethskills `qa/SKILL.md` checklist + `crops/SKILL.md` deep review.
Scope: `packages/nextjs` (SE-2), contract `packages/foundry/contracts/ClawdIntern.sol`, live app at
`http://localhost:3457` pointed at Base mainnet contract `0xc447bC73F4101726Ae4496C3586047b5F920dcCD`.
Verified in browser: home page (disconnected), `/debug` (both contract tabs, live Base reads),
console log, plus Basescan + Sourcify checks. No wallet was available — wallet-flow items judged
from code + disconnected render.

---

## Audit Summary

### Ship-Blocking

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| 1 | Wallet connection shows a BUTTON, not text | **PASS** | `ActionGuard.tsx:18-20` renders `<RainbowKitCustomConnectButton/>` when disconnected; header button visible in screenshot; no "please connect" prose anywhere. |
| 2 | Wrong network → Switch button in the primary CTA slot | **PASS** | `ActionGuard.tsx:22-33` — `chain?.id !== targetNetwork.id` renders a `useSwitchChain`-driven "Switch to Base" button in the same slot; every write button (claim/approve/open/close/cancel/slash/reassign) is wrapped in `<ActionGuard>`. |
| 3 | One button at a time (Connect → Network → Approve → Action) | **PASS** | `ActionGuard` gates states 1–2; `OwnerPanel.tsx:245-275` renders Approve XOR "Open term" via the `needsApproval` ternary — never both. |
| 4 | Approve locked through full cycle (`approvalSubmitting` + `approveCooldown`, both on `disabled`) | **PASS** | `OwnerPanel.tsx:84-99` — submitting set at top, cleared in `finally{}`; cooldown set after `await`, cleared after 4s + `refetchAllowance()`; `disabled={isApproveMining \|\| approvalSubmitting \|\| approveCooldown \|\| ...}` at `OwnerPanel.tsx:248-254`. `grep useWriteContract` outside scaffold internals: zero hits — all writes go through `useScaffoldWriteContract` (waits for receipt via `useTransactor`). |
| 5 | Contracts verified on block explorer | **FAIL** | **Basescan shows bytecode only** — "Are you the contract creator? Verify and Publish your contract source code today!" on `basescan.org/address/0xc447…dcCD#code` (checked live 2026-08-08). Sourcify IS an exact match (creation+runtime, verifiedAt 2026-08-06), but the footer (`Footer.tsx:42`) and README send users to **Basescan**, where the contract looks unverified. Run `forge verify-contract … --chain 8453 --etherscan-api-key …` (or Basescan's "Cross-chain Verify" import from Sourcify). |
| 6 | CROPS Review present in QA report | **PASS** | Deep four-pillar review below (app holds funds + admin powers → deep template used). |
| 7 | SE2 footer branding removed | **PASS** | `Footer.tsx:36-49` — only project GitHub + "Contract on Basescan" links; no BuidlGuidl / "Built with SE2" / fork-me. |
| 8 | SE2 tab title removed | **PASS** | `layout.tsx:9` title "Clawd Intern"; template `"%s \| Clawd Intern"` (`getMetadata.ts:6`); browser tabs showed "Clawd Intern" and "Debug Contracts \| Clawd Intern". |
| 9 | SE2 README replaced | **PASS** | `README.md` describes this project (mechanism, deployment address, function table, trust model); no SE2 template prose. |

### Should Fix

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| 10 | Contract address displayed with `<Address/>` | **PASS** | `page.tsx:57,61` — ClawdIntern + CLAWD both shown with `<Address/>` (blockie + copy + explorer) on the home page; intern addresses via `<Address/>` in `TermCard.tsx:100`. |
| 11 | Every address input uses `<AddressInput/>` | **PASS** | `OwnerPanel.tsx:209` (intern) and `:357` (reassign) use `<AddressInput/>`; greps for `type="text"` + addr and `placeholder="0x` returned nothing. Remaining raw inputs are prices/term-ids/reason — not addresses. |
| 12 | USD values next to all token amounts | **PASS** | `formatClawd()` (`utils/clawd.ts:4-17`) appends `(~$X)` on budget/payout/claimed/claimable/balance; live $CLAWD price badge rendered on home ($0.00000672 observed); budget input shows live USD echo (`OwnerPanel.tsx:229-231`). Degrades to token-only when DexScreener fails (documented in `useClawdPrice.ts`). |
| 13 | OG image is absolute production URL | **PARTIAL** | `getMetadata.ts:3-5` builds an absolute URL from `VERCEL_PROJECT_PRODUCTION_URL` — correct **on Vercel only**; falls back to `http://localhost:3000` elsewhere and would break on the stated IPFS deploy option. Not verifiable until the hosting target exists. |
| 14 | OG/social thumbnail is project's own (SE2 branding) | **FAIL** | `public/thumbnail.jpg` is the stock **"Built with Scaffold-ETH 2"** image (visually confirmed) — every social unfurl advertises the template, not the app. |
| 15 | pollingInterval is 3000 | **PASS** | `scaffold.config.ts:20` — `pollingInterval: 3000`. |
| 16 | RPC overrides set AND env var confirmed on hosting | **PARTIAL** | `NEXT_PUBLIC_ALCHEMY_API_KEY` is set in gitignored `.env.local` (confirmed; live Base reads worked on `/debug`). BUT (a) the shared SE2 fallback key remains at `scaffold.config.ts:14,25`, (b) `wagmiConfig.tsx:23,31` retains the bare `http()` public-RPC path that silently activates whenever the env var is missing, and (c) there is no Vercel project yet, so `vercel env ls` cannot be run — the exact "code references env, hosting never sets it" trap is still open. Set the env on the hosting platform at deploy time and consider hard-failing instead of falling back. |
| 17 | Favicon updated from SE2 default | **PASS** | `public/favicon.svg` — custom lobster-on-slate SVG; wired at `getMetadata.ts:46-53`; `manifest.json` + `logo.svg` also project-branded. |
| 18 | `--radius-field` changed from `9999rem` | **PASS** | `globals.css:36` and `:63` — `--radius-field: 0rem` in both theme blocks; no pill inputs observed. |
| 19 | Contract errors mapped to human-readable messages | **PASS** | `useTransactor.tsx:99` → `getParsedErrorWithAllAbis` toasts decoded errors (custom errors decoded via registered ABIs); every component catch adds a plain-language hint (`OwnerPanel.tsx:117,141,174,192`, `TermCard.tsx:84`) — no silent catches, no raw hex shown. |
| 20 | No hardcoded dark backgrounds | **PASS** | grep for `bg-black/bg-[#0…]/bg-*-9xx` in `app/` + `components/`: zero hits; wrappers use `bg-base-100/200`, `<SwitchTheme/>` present (`Footer.tsx:31`) and toggle rendered in screenshot. |
| 21 | Button loaders use inline `loading-spinner` span | **PASS** | All buttons use `<span className="loading loading-spinner loading-sm mr-2"/>` inside the button (`TermCard.tsx:156`, `OwnerPanel.tsx:257-258,272,293,…`); grep for `"loading"` in a btn className: zero hits. |
| 22 | Phantom wallet in RainbowKit list | **PASS** | `wagmiConnectors.tsx:27` — `phantomWallet` (plus metamask, WC, ledger, base, rainbow, safe). |
| 23 | Mobile: TX buttons deep link to wallet (fire TX first, `setTimeout(openWallet, 2000)`) | **FAIL** | No deep-link code exists anywhere — grep for `openWallet\|writeAndOpen\|rainbow://\|metamask://`: zero hits. Mobile WalletConnect users must manually switch apps for claim/approve/open/close. |
| 24 | Mobile: wallet detection checks WC session data | **FAIL** | N/A — no detection code exists (consequence of #23). |
| 25 | Mobile: no deep link when `window.ethereum` exists | **FAIL** | N/A — no deep-link code exists (consequence of #23). |

Judged from code only (no phone, no wallet): #23–25 (mobile), #13/#16 hosting halves, wallet-connected flows (#2–4 logic verified in source; disconnected render verified live).

**Also observed (not a checklist item):** one "execution reverted" string renders at the bottom of the ClawdIntern `/debug` variable panel (a no-active-term sentinel read — `NONE`/`activeTermId` display as `uint256.max`). Cosmetic; `/debug` is a dev surface.

---

## CROPS Review

App: ClawdIntern escrows owner-supplied $CLAWD against a rotating "growth intern" seat; owner
(EOA ops wallet `0x7E6D…C471`, Ownable2Step, Safe handoff planned) provides USD price marks
manually (Phase 0, documented on-page and in README); `claim(termId)` is permissionless but only
pays the intern; frontend is static SE-2 → Base RPC (Alchemy) + DexScreener price; deploy target
Vercel or IPFS. Funds + admin powers present → deep template.

Chosen default:
- Static SE-2 frontend with no backend/indexer, all state read directly from a single verified
  contract on Base, permissionless `claim`, and a deliberately-scoped Phase-0 owner-as-oracle.
  This is the most CROPS-aligned shape available for a manual-marks mechanism: nothing critical
  lives offchain except price display.

Censorship Resistance:
- Risk: (1) Frontend host (Vercel) can take the UI down or geofence. (2) Base's centralized
  sequencer can delay/censor txs (forced-inclusion via L1 exists but is slow). (3) The **owner**
  can refuse to open/close terms, cancel mid-term, or slash unvested stream remainder — the
  intern's upside is entirely gated on owner liveness and honesty. (4) Alchemy can rate-limit or
  block RPC reads for the hosted UI.
- Mitigation: `claim` is permissionless (anyone can push vested tokens to the intern); slash
  requires a ≥2-day delay post-close and an onchain public reason; every mark/cancel/slash is an
  event, making dishonest marks publicly provable; `renounceOwnership` is disabled so the contract
  can't be orphaned into a slash-less state.
- User escape: contract is directly callable — Sourcify exact-match source + full ABI in
  `externalContracts.ts`; `/debug` page works against any RPC; once Basescan verification lands
  (ship-blocker above), Basescan's Read/Write UI is the no-frontend fallback. Repo is public
  (github.com/clawdbotatg/clawd-intern) so anyone can rebuild the UI.

Open (visibility):
- Risk: live frontend not yet deployed, so no pinned commit ↔ deployment binding exists yet; the
  Basescan gap means the most-used explorer shows bytecode only.
- Mitigation: whole stack is in one public monorepo (contract + tests + deploy broadcast +
  frontend); README documents addresses, params, deploy tx; ABI committed in
  `externalContracts.ts`; `.env.example` documents required env vars; Sourcify exact match
  (creation + runtime).
- User escape: `git clone && yarn install && yarn start` with a free Alchemy key reproduces the
  app; IPFS deploy option would add a host-independent route.

Free, as in Freedom (license):
- Risk: **no LICENSE file anywhere in the repo** — default copyright means third parties cannot
  legally fork, modify, or operate the frontend/contract sources despite them being public.
- Mitigation: none yet. Add MIT/Apache-2.0 at repo root (SE-2 upstream is MIT).
- User escape: none legally until a license lands; practically the contract itself is immutable
  and permissionlessly callable regardless.

Privacy:
- Risk: every visitor's browser calls (1) **DexScreener** (`api.dexscreener.com`, every 60s —
  leaks IP + "interested in CLAWD" to a third party, no consent UI), (2) **Alchemy** RPC (IP +
  every address the UI reads; connected-wallet address queried for `owner`/allowance/balance),
  (3) **WalletConnect relay** on WC connections. Intern identity ↔ address linkage is public by
  design (the mechanism's point). No analytics, no Sentry; RainbowKit 2.2.11 (connector telemetry
  off by default since 2.2.10).
- Mitigation: minimum surface — no backend, no cookies, no tracking scripts; price fetch degrades
  silently rather than blocking.
- User escape: self-host with own RPC URL (`rpcOverrides` in `scaffold.config.ts`); read state via
  any Base RPC or explorer; no RPC picker in the UI itself (accepted for a static app).

Security:
- Risk: funds = owner-deposited CLAWD escrow; the owner EOA controls open/close/cancel/slash/
  reassign/setParams/rescue and **supplies both price marks** — a compromised or dishonest owner
  key can cancel a live term (budget returns to owner, intern gets nothing) or mark dishonestly.
  Single EOA, no multisig, no timelock (Phase 0, documented). Vendor liveness: Alchemy outage
  breaks the hosted UI (falls to public RPC only if env unset); DexScreener outage only drops USD
  labels.
- Mitigation: payouts capped (`gainCapBps` 5000); `claim` only ever pays `t.intern`; `rescue`
  refuses CLAWD (can't drain escrow, `ClawdIntern.sol:239-260`); slash floor `SLASH_DELAY` 2 days
  + public reason; `nonReentrant` on all movers; Ownable2Step; renounce disabled; audited (One
  Dollar Audit job 572, findings fixed at `eab8d79` = deployed code); 32 Foundry tests.
- User escape (walkaway test): if the team/host/Alchemy disappear — a **closed** term keeps
  vesting and anyone can `claim` forever via direct contract calls: intern funds are safe. If the
  owner disappears **mid-term**, `closeTerm` can never be called and that term's budget is stuck
  in the contract (owner's own funds, intern loses upside only). Users (interns) never deposit —
  worst-case loss is unearned upside, never principal.

Accepted compromises:
- Owner-as-oracle for Phase 0 (explicitly documented on-page, in README, and in PLAN.md; every
  mark is an auditable event; oracle upgrade path documented).
- Single ops EOA as owner pre-Safe-handoff (Ownable2Step makes the handoff safe; do it soon).
- Base sequencer + Alchemy + DexScreener third-party exposure, standard for a static L2 dApp.
- No mobile deep-linking in v1 (desktop-first admin/observer app; claim flow suffers most).

Who can block users: frontend host (Vercel), Base sequencer, Alchemy (hosted UI only), and the
owner (all term lifecycle actions). What leaks: visitor IPs + wallet addresses to Alchemy,
visitor IPs to DexScreener, WC metadata to WalletConnect. Who controls funds/upgrades/recovery:
owner EOA controls escrow lifecycle (bounded as above); contract is non-upgradeable; recovery =
`rescue` for non-CLAWD tokens only. Exit: direct contract calls (Sourcify source, `/debug`,
Basescan-after-verification), fork-and-self-host repo.

---

## Ship-blockers (must fix before production deploy)

1. **Verify the contract on Basescan** — it currently shows raw bytecode + "Verify and Publish"
   while the app footer and README point users exactly there. Sourcify exact-match exists;
   import/re-verify on Basescan (`forge verify-contract 0xc447…dcCD ClawdIntern --chain 8453`).
2. **Set `NEXT_PUBLIC_ALCHEMY_API_KEY` on the hosting platform at deploy time** — code currently
   silently falls back to the shared SE2 key + bare public `http()` transport if the env is
   missing (`scaffold.config.ts:25`, `wagmiConfig.tsx:23,31`). Confirm with `vercel env ls`
   post-setup. (Also required by this machine's no-public-RPC policy.)

## Should fix

- Replace `public/thumbnail.jpg` — it is the SE2 "Built with Scaffold-ETH 2" image; every social
  unfurl shows template branding.
- Add mobile deep-linking (`writeAndOpen` pattern: fire TX → `setTimeout(openWallet, 2000)`, WC
  session-based wallet detection, skip when `window.ethereum`) for claim/approve/open/close.
- Add a LICENSE file (MIT/Apache-2.0) — repo is public but legally unforkable without one.
- OG `baseUrl` falls back to `localhost` off-Vercel; pin a canonical production URL (and
  reconsider for the IPFS deploy option).
- Cosmetic: `uint256.max` sentinel values render as huge numbers + a stray "execution reverted"
  on `/debug` when no term is active (dev page; low priority).

**Counts: 18 PASS · 5 FAIL · 2 PARTIAL** (25 checklist rows; PARTIALs are the two
hosting-dependent items unverifiable pre-deploy).
