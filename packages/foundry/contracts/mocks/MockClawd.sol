// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Local-dev stand-in for $CLAWD (Base: 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07).
/// Deployed only on chains where the real token doesn't exist (bare anvil).
contract MockClawd is ERC20 {
    constructor(address mintTo) ERC20("Clawd", "CLAWD") {
        _mint(mintTo, 1_000_000_000e18);
    }
}
