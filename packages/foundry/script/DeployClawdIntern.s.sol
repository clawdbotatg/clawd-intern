// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./DeployHelpers.s.sol";
import { ClawdIntern } from "../contracts/ClawdIntern.sol";
import { MockClawd } from "../contracts/mocks/MockClawd.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// Deploy script for ClawdIntern.
///
/// Production deployment (Base, 2026-08-09): 0x65604a8709AfeF464d67AAab8EFB030F5676f489
/// via `yarn deploy --network base` (Basescan verified; broadcast in
/// broadcast/Deploy.s.sol/8453/). Supersedes two earlier deploys, neither of
/// which ever held CLAWD or opened a term: 0xD390486ab72ED8af1EE06F1060E9663aAbfe2A55
/// (2026-08-08, retired by the multi-agent audit fixes in c207b61) and
/// 0xc447bC73F4101726Ae4496C3586047b5F920dcCD (2026-08-07, pre-SE-2; its
/// broadcast record is in broadcast/DeployClawdIntern.s.sol/8453/).
///
/// yarn deploy                                            # local anvil / base fork
/// yarn deploy --network base --keystore <account>        # production
contract DeployClawdIntern is ScaffoldETHDeploy {
    // $CLAWD on Base (verified: clawdbotatg.eth.limo, basescan)
    address constant CLAWD_BASE = 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07;

    uint256 constant GAIN_CAP_BPS = 5_000; // +50% gain earns the full budget
    uint64 constant STREAM_LENGTH = 30 days;
    uint64 constant COOLDOWN = 28 days; // two 14-day terms before a repeat

    function run() external ScaffoldEthDeployerRunner {
        // On a Base fork (`yarn fork --network base`) the real CLAWD exists at
        // its canonical address; on a bare anvil chain deploy a mock instead.
        IERC20 clawd = CLAWD_BASE.code.length > 0
            ? IERC20(CLAWD_BASE)
            : IERC20(address(new MockClawd(deployer)));
        new ClawdIntern(clawd, deployer, GAIN_CAP_BPS, STREAM_LENGTH, COOLDOWN);
    }
}
