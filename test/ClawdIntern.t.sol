// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ClawdIntern} from "../src/ClawdIntern.sol";

contract MockClawd is ERC20 {
    constructor() ERC20("Clawd", "CLAWD") {
        _mint(msg.sender, 1_000_000_000e18);
    }
}

contract ClawdInternTest is Test {
    ClawdIntern internal app;
    MockClawd internal clawd;

    address internal owner = makeAddr("owner");
    address internal intern = makeAddr("intern");
    address internal rando = makeAddr("rando");

    uint256 internal constant GAIN_CAP_BPS = 5_000; // +50% earns full budget
    uint64 internal constant STREAM = 30 days;
    uint64 internal constant COOLDOWN = 14 days;
    uint64 internal constant TERM = 14 days;
    uint256 internal constant BUDGET = 1_000_000e18;
    uint256 internal constant MARK_IN = 69e11; // $0.0000069 * 1e18

    function setUp() public {
        vm.startPrank(owner);
        clawd = new MockClawd();
        app = new ClawdIntern(IERC20(address(clawd)), owner, GAIN_CAP_BPS, STREAM, COOLDOWN);
        clawd.approve(address(app), type(uint256).max);
        vm.stopPrank();
    }

    function _open() internal returns (uint256 id) {
        vm.prank(owner);
        id = app.openTerm(intern, MARK_IN, BUDGET, TERM);
    }

    function _openAndClose(uint256 markOut) internal returns (uint256 id) {
        id = _open();
        vm.warp(block.timestamp + TERM);
        vm.prank(owner);
        app.closeTerm(markOut);
    }

    // ----------------------------------------------------------- constructor

    function test_ConstructorValidation() public {
        vm.expectRevert(ClawdIntern.ZeroAddress.selector);
        new ClawdIntern(IERC20(address(0)), owner, GAIN_CAP_BPS, STREAM, COOLDOWN);
        vm.expectRevert(ClawdIntern.ZeroAmount.selector);
        new ClawdIntern(IERC20(address(clawd)), owner, 0, STREAM, COOLDOWN);
        vm.expectRevert(ClawdIntern.ZeroAmount.selector);
        new ClawdIntern(IERC20(address(clawd)), owner, GAIN_CAP_BPS, 0, COOLDOWN);
    }

    // ------------------------------------------------------------- openTerm

    function test_OpenTermLocksBudgetAndSetsState() public {
        uint256 ownerBefore = clawd.balanceOf(owner);
        uint256 id = _open();

        assertEq(id, 0);
        assertEq(app.activeTermId(), 0);
        assertEq(clawd.balanceOf(address(app)), BUDGET);
        assertEq(clawd.balanceOf(owner), ownerBefore - BUDGET);

        (address who, uint256 termId, uint64 endsAt) = app.currentIntern();
        assertEq(who, intern);
        assertEq(termId, 0);
        assertEq(endsAt, uint64(block.timestamp) + TERM);

        ClawdIntern.Term memory t = app.getTerm(0);
        assertEq(t.markIn, MARK_IN);
        assertEq(t.budget, BUDGET);
        assertEq(t.capBps, GAIN_CAP_BPS);
        assertEq(t.streamLen, STREAM);
    }

    function test_RevertWhen_SecondTermOpenedWhileActive() public {
        _open();
        vm.prank(owner);
        vm.expectRevert(ClawdIntern.TermAlreadyActive.selector);
        app.openTerm(rando, MARK_IN, BUDGET, TERM);
    }

    function test_RevertWhen_OpenTermZeroInputs() public {
        vm.startPrank(owner);
        vm.expectRevert(ClawdIntern.ZeroAddress.selector);
        app.openTerm(address(0), MARK_IN, BUDGET, TERM);
        vm.expectRevert(ClawdIntern.ZeroAmount.selector);
        app.openTerm(intern, 0, BUDGET, TERM);
        vm.expectRevert(ClawdIntern.ZeroAmount.selector);
        app.openTerm(intern, MARK_IN, 0, TERM);
        vm.expectRevert(ClawdIntern.ZeroAmount.selector);
        app.openTerm(intern, MARK_IN, BUDGET, 0);
        vm.stopPrank();
    }

    function test_RevertWhen_NonOwnerCalls() public {
        vm.startPrank(rando);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, rando));
        app.openTerm(intern, MARK_IN, BUDGET, TERM);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, rando));
        app.closeTerm(MARK_IN);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, rando));
        app.cancelTerm();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, rando));
        app.slash(0);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, rando));
        app.setParams(1, 1, 1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, rando));
        app.rescue(IERC20(address(0xBEEF)), rando, 1);
        vm.stopPrank();
    }

    function test_CooldownBlocksReappointment() public {
        _openAndClose(MARK_IN);
        vm.prank(owner);
        vm.expectRevert(ClawdIntern.InternOnCooldown.selector);
        app.openTerm(intern, MARK_IN, BUDGET, TERM);

        // a different intern is fine immediately
        vm.prank(owner);
        app.openTerm(rando, MARK_IN, BUDGET, TERM);
        vm.prank(owner);
        app.cancelTerm();

        // and the original is fine after the cooldown
        vm.warp(block.timestamp + COOLDOWN);
        vm.prank(owner);
        app.openTerm(intern, MARK_IN, BUDGET, TERM);
    }

    // ------------------------------------------------------------ closeTerm

    function test_RevertWhen_CloseBeforeTermEnd() public {
        _open();
        vm.warp(block.timestamp + TERM - 1);
        vm.prank(owner);
        vm.expectRevert(ClawdIntern.TermStillRunning.selector);
        app.closeTerm(MARK_IN);
    }

    function test_RevertWhen_CloseWithNoActiveTerm() public {
        vm.prank(owner);
        vm.expectRevert(ClawdIntern.NoActiveTerm.selector);
        app.closeTerm(MARK_IN);
    }

    function test_CloseFlatOrDownPaysNothing() public {
        uint256 ownerBefore = clawd.balanceOf(owner);
        _openAndClose(MARK_IN / 2); // price halved

        ClawdIntern.Term memory t = app.getTerm(0);
        assertEq(t.payout, 0);
        assertEq(clawd.balanceOf(owner), ownerBefore); // full budget returned
        assertEq(clawd.balanceOf(address(app)), 0);
        assertEq(app.activeTermId(), app.NONE());
    }

    function test_CloseHalfOfCapPaysHalfBudget() public {
        // +25% gain vs 50% cap → half the budget
        _openAndClose(MARK_IN + MARK_IN / 4);
        ClawdIntern.Term memory t = app.getTerm(0);
        assertEq(t.payout, BUDGET / 2);
    }

    function test_CloseAtOrAboveCapPaysFullBudget() public {
        _openAndClose(MARK_IN * 10); // +900%, way past cap
        ClawdIntern.Term memory t = app.getTerm(0);
        assertEq(t.payout, BUDGET);
        assertEq(clawd.balanceOf(address(app)), BUDGET); // all streams to intern
    }

    function testFuzz_PayoutMath(uint256 markIn, uint256 markOut, uint256 budget) public {
        markIn = bound(markIn, 1, 1e30);
        markOut = bound(markOut, 1, 1e30);
        budget = bound(budget, 1, clawd.balanceOf(owner));

        vm.prank(owner);
        app.openTerm(intern, markIn, budget, TERM);
        vm.warp(block.timestamp + TERM);
        vm.prank(owner);
        app.closeTerm(markOut);

        ClawdIntern.Term memory t = app.getTerm(0);
        assertLe(t.payout, budget, "payout exceeds budget");
        if (markOut <= markIn) assertEq(t.payout, 0, "no gain must pay zero");
        // conservation: payout stays in contract, surplus went back to owner
        assertEq(clawd.balanceOf(address(app)), t.payout);
    }

    // -------------------------------------------------------------- vesting

    function test_VestingLinear() public {
        uint256 id = _openAndClose(MARK_IN * 10); // full budget payout

        assertEq(app.claimable(id), 0);

        vm.warp(block.timestamp + STREAM / 2);
        assertEq(app.claimable(id), BUDGET / 2);

        app.claim(id); // permissionless, pays the intern
        assertEq(clawd.balanceOf(intern), BUDGET / 2);
        assertEq(app.claimable(id), 0);

        vm.warp(block.timestamp + STREAM); // way past end
        assertEq(app.claimable(id), BUDGET / 2);
        vm.prank(intern);
        app.claim(id);
        assertEq(clawd.balanceOf(intern), BUDGET);
        assertEq(clawd.balanceOf(address(app)), 0);
    }

    function test_RevertWhen_ClaimBeforeCloseOrNothingVested() public {
        uint256 id = _open();
        vm.expectRevert(ClawdIntern.TermNotClosed.selector);
        app.claim(id);

        vm.warp(block.timestamp + TERM);
        vm.prank(owner);
        app.closeTerm(MARK_IN * 2);
        vm.expectRevert(ClawdIntern.NothingToClaim.selector);
        app.claim(id); // closed this second — nothing vested yet
    }

    function testFuzz_VestingNeverExceedsPayoutAndIsMonotonic(uint64 t1, uint64 t2) public {
        uint256 id = _openAndClose(MARK_IN * 2);
        uint256 payout = app.getTerm(id).payout;
        uint256 closedAt = block.timestamp;

        t1 = uint64(bound(t1, 0, STREAM * 2));
        t2 = uint64(bound(t2, t1, STREAM * 2));

        vm.warp(closedAt + t1);
        uint256 v1 = app.claimable(id);
        vm.warp(closedAt + t2);
        uint256 v2 = app.claimable(id);

        assertLe(v1, payout);
        assertLe(v2, payout);
        assertLe(v1, v2, "vesting must be monotonic");
        if (t2 >= STREAM) assertEq(v2, payout, "fully vested at stream end");
    }

    function testFuzz_RepeatedClaimsConserveTokens(uint8 steps) public {
        steps = uint8(bound(steps, 1, 20));
        uint256 id = _openAndClose(MARK_IN * 10); // full budget
        for (uint256 i = 0; i < steps; i++) {
            vm.warp(block.timestamp + STREAM / steps + 1);
            uint256 c = app.claimable(id);
            if (c > 0) app.claim(id);
        }
        vm.warp(block.timestamp + STREAM);
        if (app.claimable(id) > 0) app.claim(id);
        assertEq(clawd.balanceOf(intern), BUDGET, "intern must end with exactly the payout");
        assertEq(clawd.balanceOf(address(app)), 0, "no dust left behind");
    }

    // --------------------------------------------------------------- cancel

    function test_CancelReturnsBudgetAndEndsTerm() public {
        uint256 ownerBefore = clawd.balanceOf(owner);
        uint256 id = _open();
        vm.warp(block.timestamp + TERM / 2);
        vm.prank(owner);
        app.cancelTerm();

        assertEq(clawd.balanceOf(owner), ownerBefore);
        assertEq(app.activeTermId(), app.NONE());
        assertTrue(app.getTerm(id).cancelled);

        // cancelled term can never be closed or claimed
        vm.prank(owner);
        vm.expectRevert(ClawdIntern.NoActiveTerm.selector);
        app.closeTerm(MARK_IN);
        vm.expectRevert(ClawdIntern.TermNotClosed.selector);
        app.claim(id);
    }

    // ---------------------------------------------------------------- slash

    function test_SlashKeepsVestedReturnsRest() public {
        uint256 id = _openAndClose(MARK_IN * 10); // full budget payout
        uint256 ownerBefore = clawd.balanceOf(owner);

        vm.warp(block.timestamp + STREAM / 4);
        vm.prank(owner);
        app.slash(id);

        assertEq(clawd.balanceOf(owner), ownerBefore + (BUDGET * 3) / 4);
        assertEq(app.claimable(id), BUDGET / 4);

        // vesting is frozen: more time unlocks nothing more
        vm.warp(block.timestamp + STREAM);
        assertEq(app.claimable(id), BUDGET / 4);
        app.claim(id);
        assertEq(clawd.balanceOf(intern), BUDGET / 4);
    }

    function test_SlashAfterClaimsAccountsForClaimed() public {
        uint256 id = _openAndClose(MARK_IN * 10);
        vm.warp(block.timestamp + STREAM / 2);
        app.claim(id); // intern claims half

        vm.prank(owner);
        app.slash(id); // vested == claimed == half; other half returns
        assertEq(app.claimable(id), 0);
        vm.expectRevert(ClawdIntern.NothingToClaim.selector);
        app.claim(id);
    }

    function test_RevertWhen_SlashFullyVestedOrTwice() public {
        uint256 id = _openAndClose(MARK_IN * 10);
        vm.warp(block.timestamp + STREAM);
        vm.prank(owner);
        vm.expectRevert(ClawdIntern.NothingToSlash.selector);
        app.slash(id);

        uint256 id2;
        vm.warp(block.timestamp + COOLDOWN + 1);
        vm.prank(owner);
        id2 = app.openTerm(intern, MARK_IN, BUDGET, TERM);
        vm.warp(block.timestamp + TERM);
        vm.prank(owner);
        app.closeTerm(MARK_IN * 10);
        vm.warp(block.timestamp + 1 days);
        vm.startPrank(owner);
        app.slash(id2);
        vm.expectRevert(ClawdIntern.TermAlreadySettled.selector);
        app.slash(id2);
        vm.stopPrank();
    }

    function test_RevertWhen_SlashUnclosedTerm() public {
        uint256 id = _open();
        vm.prank(owner);
        vm.expectRevert(ClawdIntern.TermNotClosed.selector);
        app.slash(id);
    }

    // ------------------------------------------------- params + multi-term

    function test_ParamChangesDontTouchOpenTerm() public {
        uint256 id = _open();
        vm.prank(owner);
        app.setParams(1_000, 7 days, 0);

        ClawdIntern.Term memory t = app.getTerm(id);
        assertEq(t.capBps, GAIN_CAP_BPS, "open term keeps its cap");
        assertEq(t.streamLen, STREAM, "open term keeps its stream");
    }

    function test_NewTermWhileOldStreamStillPaying() public {
        uint256 id1 = _openAndClose(MARK_IN * 10);

        vm.warp(block.timestamp + 1 days);
        vm.prank(owner);
        uint256 id2 = app.openTerm(rando, MARK_IN, BUDGET, TERM);

        // old stream keeps working under the new term
        vm.warp(block.timestamp + STREAM);
        app.claim(id1);
        assertEq(clawd.balanceOf(intern), BUDGET);

        // and the new term's budget was never touched by the old claim
        vm.prank(owner);
        app.closeTerm(MARK_IN * 10);
        vm.warp(block.timestamp + STREAM);
        app.claim(id2);
        assertEq(clawd.balanceOf(rando), BUDGET);
        assertEq(clawd.balanceOf(address(app)), 0);
    }

    function test_RenounceOwnershipDisabled() public {
        _open(); // even (especially) with an active term
        vm.prank(owner);
        vm.expectRevert(ClawdIntern.RenounceDisabled.selector);
        app.renounceOwnership();
        assertEq(app.owner(), owner);
    }

    function test_SlashAfterPartialClaimPaysRemainderExactly() public {
        // claim at T/4, slash at T/2 → intern must net exactly payout/2
        uint256 id = _openAndClose(MARK_IN * 10); // full budget payout
        uint256 closedAt = block.timestamp;

        vm.warp(closedAt + STREAM / 4);
        app.claim(id); // intern has BUDGET/4

        vm.warp(closedAt + STREAM / 2);
        vm.prank(owner);
        app.slash(id); // vested = BUDGET/2, claimed = BUDGET/4

        assertEq(app.claimable(id), BUDGET / 4, "remainder after slash");
        app.claim(id);
        assertEq(clawd.balanceOf(intern), BUDGET / 2, "intern nets exactly vested-at-slash");
        assertEq(clawd.balanceOf(address(app)), 0);
    }

    function test_RevertWhen_SlashFlatCloseTerm() public {
        uint256 id = _openAndClose(MARK_IN); // flat → payout 0
        vm.prank(owner);
        vm.expectRevert(ClawdIntern.NothingToSlash.selector);
        app.slash(id);
    }

    function test_CancelInterleavedBetweenStreamsConservesBalances() public {
        // term 0 closes with a live stream, term 1 is cancelled mid-term,
        // term 2 closes — cancel must never dip into term 0's payout.
        uint256 id0 = _openAndClose(MARK_IN * 10); // full BUDGET streaming

        vm.warp(block.timestamp + 1 days);
        vm.prank(owner);
        app.openTerm(rando, MARK_IN, BUDGET, TERM);
        uint256 ownerBefore = clawd.balanceOf(owner);
        vm.prank(owner);
        app.cancelTerm();
        assertEq(clawd.balanceOf(owner), ownerBefore + BUDGET, "cancel returns exactly its own budget");
        assertEq(clawd.balanceOf(address(app)), BUDGET, "term 0 stream untouched");

        address third = makeAddr("third");
        vm.prank(owner);
        uint256 id2 = app.openTerm(third, MARK_IN, BUDGET, TERM);
        vm.warp(block.timestamp + TERM);
        vm.prank(owner);
        app.closeTerm(MARK_IN + MARK_IN / 4); // +25% → half budget

        vm.warp(block.timestamp + STREAM);
        app.claim(id0);
        app.claim(id2);
        assertEq(clawd.balanceOf(intern), BUDGET);
        assertEq(clawd.balanceOf(third), BUDGET / 2);
        assertEq(clawd.balanceOf(address(app)), 0, "exact conservation across all three terms");
    }

    function test_CancelPutsInternOnCooldown() public {
        _open();
        vm.prank(owner);
        app.cancelTerm();
        vm.prank(owner);
        vm.expectRevert(ClawdIntern.InternOnCooldown.selector);
        app.openTerm(intern, MARK_IN, BUDGET, TERM);

        // documented escape hatch for a typo'd open: zero the cooldown
        vm.prank(owner);
        app.setParams(GAIN_CAP_BPS, STREAM, 0);
        vm.prank(owner);
        app.openTerm(intern, MARK_IN, BUDGET, TERM);
    }

    // --------------------------------------------------------------- rescue

    function test_RescueRefusesClawdButSavesOthers() public {
        vm.prank(owner);
        vm.expectRevert(ClawdIntern.CannotRescueClawd.selector);
        app.rescue(IERC20(address(clawd)), owner, 1);

        MockClawd other = new MockClawd();
        other.transfer(address(app), 100e18);
        vm.prank(owner);
        app.rescue(IERC20(address(other)), owner, 100e18);
        assertEq(other.balanceOf(owner), 100e18);
    }
}
