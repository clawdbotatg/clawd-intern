# ClawdIntern — evm-audit-erc20 findings (2026-08-08)

Contract: `packages/foundry/contracts/ClawdIntern.sol`
Escrowed token (fixed at construction): $CLAWD on Base, `0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07`

## [ERC20-1] CLAWD sent directly to the contract is permanently irrecoverable
**Severity**: Low
**Category**: evm-audit-erc20
**Location**: `rescue()` (ClawdIntern.sol:260-265)
**Description**: `rescue()` hard-refuses the reward token (`CannotRescueClawd`), and every outbound CLAWD path (`closeTerm` surplus, `cancelTerm`, `slash`, `claim`) pays only amounts derived from stored `Term` accounting, never from `balanceOf`. The contract therefore has no code path that can ever release CLAWD in excess of tracked obligations. Any CLAWD that reaches the contract outside `openTerm` — a fat-fingered direct `transfer`, an airdrop to holders, or dust — is stranded forever. The natspec frames the refusal as protecting stream obligations, but the protection is stronger than needed: obligations are exactly `activeBudget + Σ(payout_i − claimed_i)` over closed terms, which the contract already knows, so a surplus sweep is computable without ever touching escrowed funds.
**Proof of Concept**: 1) Anyone calls `clawd.transfer(clawdIntern, 1000e18)` by mistake. 2) `rescue(clawd, …)` reverts `CannotRescueClawd`. 3) No `claim`/`closeTerm`/`cancelTerm`/`slash` ever pays more than the per-term stored amounts. The 1000 CLAWD is unreachable by any address, forever.
**Recommendation**: Track an `obligations` accumulator (increment by `budget` in `openTerm`, decrement by `surplus` in `closeTerm`, by `budget` in `cancelTerm`, by `returned` in `slash`, by `amount` in `claim`) and allow `rescue` of CLAWD only up to `clawd.balanceOf(address(this)) − obligations`. Alternatively, explicitly document that direct CLAWD transfers are treated as burns.

## [ERC20-2] No sink-address validation on `intern` / `reassignIntern` — transfer to `address(clawd)` or `address(this)` succeeds silently
**Severity**: Low
**Category**: evm-audit-erc20
**Location**: `openTerm()` (ClawdIntern.sol:131), `reassignIntern()` (ClawdIntern.sol:240-247)
**Description**: CLAWD is a standard OZ v5 ERC20: unlike LUSD-style tokens, it does **not** revert on transfers to its own token address (or to arbitrary contracts). `openTerm` and `reassignIntern` only reject `address(0)`, so `t.intern` can be set to `address(clawd)` or `address(this)`. `claim()` is permissionless and pushes to `t.intern`, so vested tokens would be irreversibly transferred into the token contract (classic stuck-funds sink), or self-transferred while `claimed` still increments (equivalent to ERC20-1's black hole). `reassignIntern` is specifically the *recovery* path for a bricked intern wallet — the moment it is most likely to be used in a hurry with a pasted address — and it is the one owner function with no second chance: after a bad reassign + a permissionless `claim`, `reassignIntern` again cannot recover already-transferred tokens.
**Proof of Concept**: 1) Term closed, 10,000 CLAWD payout streaming. 2) Owner calls `reassignIntern(id, 0x9f86dB…6b07)` (pastes the token address instead of the new wallet). 3) Any address calls `claim(id)`; `safeTransfer(address(clawd), vested)` succeeds (OZ ERC20 permits it). Vested CLAWD now sits in the token contract with no owner — unrecoverable.
**Recommendation**: In `openTerm` and `reassignIntern`, revert if the intern address is `address(this)` or `address(clawd)`. Two cheap checks close the two deterministic sink addresses.

## [ERC20-3] CLAWD supply is not strictly fixed: Superchain bridge can mint on Base via IERC7802
**Severity**: Info
**Category**: evm-audit-erc20
**Location**: token contract (ClankerToken `crosschainMint`), context for ClawdIntern's economics
**Description**: The verified ClankerToken source exposes `crosschainMint(address,uint256)` / `crosschainBurn(address,uint256)` gated to `Predeploys.SUPERCHAIN_TOKEN_BRIDGE` (`0x4200…0028`). Initial supply (~9.9986e28) was minted once at construction and there is no admin mint — but if/when Base activates Superchain interop, per-chain supply can grow via bridged-in mints (mirrored by burns on the source chain). ClawdIntern's accounting is amount-based, not share- or supply-based (`totalSupply` is never read), so there is no accounting impact; the only exposure is economic (the "pump collapses the payout" alignment already prices token-value risk in). `crosschainBurn` can only burn via the bridge acting on a holder-initiated bridge flow, and ClawdIntern never calls the bridge, so escrowed balance cannot be burned by a third party.
**Proof of Concept**: N/A — behavioral note verified from the token's verified source (Sourcify exact match, `ClankerToken`).
**Recommendation**: None required. Worth a line in the trust-model docs: "CLAWD has no admin mint; the only future mint path is the OP-stack SuperchainTokenBridge predeploy."

## [ERC20-4] Escrow accounting assumes an exact-balance token — safe for CLAWD, underfunds streams if ever redeployed with a rebasing/fee-on-transfer token
**Severity**: Info
**Category**: evm-audit-erc20
**Location**: constructor (ClawdIntern.sol:108-118), `_vested()`/`claim()` (ClawdIntern.sol:279-290, 321-326)
**Description**: The token is an immutable constructor parameter, and the deployed instance holds CLAWD, which is verifiably standard (no fee, no rebase, no hooks — see Coverage). The inbound side is defended (`TransferAmountMismatch` balance-delta check in `openTerm` fails closed against fee-on-transfer), but all *outbound* obligations (`payout`, `claimed`, surplus math) are stored amounts with no re-sync against `balanceOf`. If the same bytecode were redeployed pointing at a down-rebasing token (stETH-style) or a token that fees outbound transfers, the contract's balance would drift below `Σ(payout − claimed)` and the last claimants' `claim()` would revert — silent underfunding with no recovery path (rescue refuses the reward token). This is a deployment-guidance note, not a live bug: the current token cannot exhibit any of these behaviors and is not upgradeable.
**Proof of Concept**: Hypothetical redeploy only: ClawdIntern(rebasingToken) → open+close two terms → negative rebase 5% → second stream's final `claim` reverts on insufficient balance.
**Recommendation**: Document in the deploy script/README that the reward token must be a standard non-rebasing, non-fee, non-hook ERC20 (as CLAWD is). No code change needed for the current deployment.

## Coverage

**Real CLAWD token verified onchain + from verified source** (Sourcify exact match: `ClankerToken`, Alchemy Base RPC):
- Standard OZ v5 stack: `ERC20 + ERC20Permit + ERC20Votes + ERC20Burnable + IERC7802`. 18 decimals, name `clawd.atg.eth`, symbol `CLAWD`, totalSupply ≈ 9.9986e28.
- **Not a proxy** (EIP-1967 implementation & admin slots both zero; single code deployment, immutable) — no upgrade or multiple-entry-point risk.
- **No fee-on-transfer, no rebasing**: `_update` is plain OZ ERC20 + ERC20Votes checkpointing; balances only change via transfer/mint/burn.
- **No transfer hooks/callbacks** (not ERC777/ERC677): no reentrancy vector from token transfers; ClawdIntern additionally has `nonReentrant` on every fund-moving function.
- **No denylist, no pause, no admin mint**: bytecode probed for `pause/paused/isBlacklisted/mint/owner/transferOwnership` selectors — all absent; the token "admin" role only edits image/metadata strings. Only mint path is `crosschainMint` gated to the Superchain bridge predeploy (ERC20-3).
- **Standard bool returns** (OZ), zero-amount transfers allowed, transfer-to-token-address allowed (basis of ERC20-2), permit is standard ERC-2612 (unused by ClawdIntern).
- ERC20Votes supply cap (uint208) far above totalSupply; checkpointing adds gas only, no behavior change.

**Checklist items checked against ClawdIntern**:
- Fee-on-transfer: inbound `openTerm` defended by balance-delta check (fails closed); outbound paths noted under ERC20-4 drift angle. Real token has no fee.
- Rebasing: internal accounting is stored-amount based; real token non-rebasing (ERC20-4 covers drift).
- Zero-amount transfer reverts: all transfers are guarded non-zero (`surplus > 0`, `NothingToClaim`, `NothingToSlash`, `budget > 0`) — safe even under a LEND-style token.
- Revert-on-transfer-to-special-address / transfer-to-self: real token allows them — flipped into ERC20-2 (sink addresses accepted as intern).
- Blocklist/pause: token has none; the natspec-documented denylisted-owner stall is moot for CLAWD today; `reassignIntern` covers a future intern-side stall.
- Approval edge cases (USDT race, BNB zero-approve, infinite-approval drain): contract never calls `approve` and holds no third-party allowances — N/A.
- Missing return values / Solmate-existence gap: OZ SafeERC20 used throughout; token address is non-zero-checked immutable with real code.
- Decimals quirks: contract never reads `decimals()`; payout math is pure bps-of-budget, decimals-agnostic; the gainBps flooring edge is already natspec'd.
- ERC777/hook reentrancy: no hooks on real token; `nonReentrant` on `openTerm/closeTerm/cancelTerm/slash/claim/rescue` anyway; `reassignIntern`/`setParams` move no tokens.
- Flash-mint / `totalSupply` in pricing: `totalSupply` never read; marks are owner-provided.
- Multiple-address token aliasing vs. `rescue`'s `token == clawd` check: CLAWD is single-entry-point, no alias exists.
- `transferFrom` self-transfer semantics, uint96 caps (UNI/COMP), `type(uint256).max` transfer-all, phantom permit, bytes32 metadata: N/A to this token/contract pair.
- Cross-term escrow accounting audited: budget fully partitioned into surplus/payout/claimed/returned per term; no path pays beyond tracked amounts; concurrent streams + one active term cannot cross-drain.
- `crosschainBurn` cannot touch escrowed balance (holder-initiated bridge flow only; ClawdIntern never calls the bridge).
