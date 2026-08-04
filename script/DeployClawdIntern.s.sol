// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ClawdIntern} from "../src/ClawdIntern.sol";

/// Deploy to Base:
///   forge script script/DeployClawdIntern.s.sol --rpc-url base --broadcast --verify
/// Env: ALCHEMY_API_KEY (rpc), DEPLOYER via --account/--ledger (never a raw
/// key in env or shell history), OWNER (defaults to the deployer).
contract DeployClawdIntern is Script {
    // $CLAWD on Base (verified: clawdbotatg.eth.limo, basescan)
    IERC20 constant CLAWD = IERC20(0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07);

    uint256 constant GAIN_CAP_BPS = 5_000; // +50% gain earns the full budget
    uint64 constant STREAM_LENGTH = 30 days;
    uint64 constant COOLDOWN = 28 days; // two 14-day terms before a repeat

    function run() external {
        address owner = vm.envOr("OWNER", msg.sender);
        vm.startBroadcast();
        ClawdIntern app = new ClawdIntern(CLAWD, owner, GAIN_CAP_BPS, STREAM_LENGTH, COOLDOWN);
        vm.stopBroadcast();
        console.log("ClawdIntern deployed:", address(app));
        console.log("owner:", owner);
    }
}
