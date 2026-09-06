// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {DelegationRootRegistry} from "../src/DelegationRootRegistry.sol";

/// @dev Only the cheatcodes these tests use, declared here rather than vendored,
///      the way contracts/test/MurakumoComputeCredit.t.sol already does.
interface Vm {
    function prank(address) external;
    function expectRevert(bytes calldata) external;
    function expectRevert(bytes4) external;
}

contract DelegationRootRegistryTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertEq(bytes32 a, bytes32 b) internal pure {
        require(a == b, "bytes32 mismatch");
    }

    function assertEq(address a, address b) internal pure {
        require(a == b, "address mismatch");
    }

    function assertEq(address a, address b, string memory why) internal pure {
        require(a == b, why);
    }

    function assertEq(uint256 a, uint256 b) internal pure {
        require(a == b, "uint mismatch");
    }

    function assertEq(uint256 a, uint256 b, string memory why) internal pure {
        require(a == b, why);
    }

    DelegationRootRegistry internal reg;

    bytes32 internal constant SUBJECT = keccak256("kotoba.cloud/delegation");
    bytes32 internal constant PK1 = bytes32(uint256(0x11));
    bytes32 internal constant PK2 = bytes32(uint256(0x22));
    bytes32 internal constant CID1 = bytes32(uint256(0xc1));
    bytes32 internal constant CID2 = bytes32(uint256(0xc2));

    address internal controller = address(0xC0);
    address internal newController = address(0xC1);
    address internal g1 = address(0xA1);
    address internal g2 = address(0xA2);
    address internal g3 = address(0xA3);
    address internal stranger = address(0xBEEF);

    function setUp() public {
        reg = new DelegationRootRegistry();
    }

    function _guardians() internal view returns (address[] memory g) {
        g = new address[](3);
        (g[0], g[1], g[2]) = (g1, g2, g3);
    }

    function _register() internal {
        reg.register(SUBJECT, PK1, CID1, controller, _guardians(), 2);
    }

    function test_registerRecordsTheRootAndItsQuorum() public {
        _register();
        DelegationRootRegistry.Root memory r = reg.rootOf(SUBJECT);
        assertEq(r.publicKey, PK1);
        assertEq(r.logDigest, CID1);
        assertEq(r.controller, controller);
        assertEq(r.epoch, 1);
        assertEq(reg.thresholdOf(SUBJECT), 2);
        assertEq(reg.guardiansOf(SUBJECT).length, 3);
    }

    function test_aSubjectIsRegisteredOnce() public {
        _register();
        vm.expectRevert(
            abi.encodeWithSelector(DelegationRootRegistry.SubjectExists.selector, SUBJECT)
        );
        reg.register(SUBJECT, PK2, CID2, controller, _guardians(), 2);
    }

    function test_unknownSubjectIsNotAnEmptyRoot() public {
        // The alternative is returning a zero Root, which reads as a registered
        // subject whose key happens to be zero.
        vm.expectRevert(
            abi.encodeWithSelector(DelegationRootRegistry.UnknownSubject.selector, SUBJECT)
        );
        reg.rootOf(SUBJECT);
    }

    function test_onlyTheControllerRotates() public {
        _register();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                DelegationRootRegistry.NotController.selector, stranger, controller
            )
        );
        reg.rotate(SUBJECT, PK2, CID2);
    }

    function test_rotationAdvancesTheEpoch() public {
        _register();
        vm.prank(controller);
        reg.rotate(SUBJECT, PK2, CID2);
        DelegationRootRegistry.Root memory r = reg.rootOf(SUBJECT);
        assertEq(r.publicKey, PK2);
        assertEq(r.logDigest, CID2);
        assertEq(r.epoch, 2);
    }

    function test_aRotationThatChangesNothingIsRefused() public {
        _register();
        vm.prank(controller);
        vm.expectRevert(DelegationRootRegistry.NoChange.selector);
        reg.rotate(SUBJECT, PK1, CID1);
    }

    function test_quorumMustBeSatisfiable() public {
        address[] memory g = _guardians();
        vm.expectRevert(
            abi.encodeWithSelector(DelegationRootRegistry.InvalidThreshold.selector, 0, 3)
        );
        reg.register(SUBJECT, PK1, CID1, controller, g, 0);

        vm.expectRevert(
            abi.encodeWithSelector(DelegationRootRegistry.InvalidThreshold.selector, 4, 3)
        );
        reg.register(SUBJECT, PK1, CID1, controller, g, 4);
    }

    function test_oneHolderCannotFillTwoSeats() public {
        address[] memory g = new address[](2);
        (g[0], g[1]) = (g1, g1);
        vm.expectRevert(
            abi.encodeWithSelector(DelegationRootRegistry.DuplicateGuardian.selector, g1)
        );
        reg.register(SUBJECT, PK1, CID1, controller, g, 2);
    }

    function test_havingNoRecoveryIsExplicitNotAccidental() public {
        address[] memory none = new address[](0);
        reg.register(SUBJECT, PK1, CID1, controller, none, 0);
        assertEq(reg.thresholdOf(SUBJECT), 0);

        // And a threshold without guardians is refused, so "no recovery" cannot
        // be reached by supplying a quorum that can never be met.
        bytes32 other = keccak256("other");
        vm.expectRevert(
            abi.encodeWithSelector(DelegationRootRegistry.InvalidThreshold.selector, 1, 0)
        );
        reg.register(other, PK1, CID1, controller, none, 1);
    }

    function test_recoveryNeedsTheThresholdAndThenMovesControl() public {
        _register();
        vm.prank(g1);
        reg.proposeRecovery(SUBJECT, newController);

        vm.prank(g1);
        reg.approveRecovery(SUBJECT);
        assertEq(reg.rootOf(SUBJECT).controller, controller, "one approval is not two");

        vm.prank(g2);
        reg.approveRecovery(SUBJECT);
        assertEq(reg.rootOf(SUBJECT).controller, newController);
        assertEq(reg.pendingRecovery(SUBJECT).proposedController, address(0));
    }

    function test_aGuardianApprovesOnce() public {
        _register();
        vm.prank(g1);
        reg.proposeRecovery(SUBJECT, newController);
        vm.prank(g1);
        reg.approveRecovery(SUBJECT);
        vm.prank(g1);
        vm.expectRevert(abi.encodeWithSelector(DelegationRootRegistry.AlreadyApproved.selector, g1));
        reg.approveRecovery(SUBJECT);
    }

    function test_strangersNeitherProposeNorApprove() public {
        _register();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(DelegationRootRegistry.NotGuardian.selector, stranger)
        );
        reg.proposeRecovery(SUBJECT, newController);

        vm.prank(g1);
        reg.proposeRecovery(SUBJECT, newController);
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(DelegationRootRegistry.NotGuardian.selector, stranger)
        );
        reg.approveRecovery(SUBJECT);
    }

    function test_approvalsDoNotCarryIntoADifferentProposal() public {
        // The defect this guards: a guardian who approved handing control to A
        // being counted as approving B.
        _register();
        vm.prank(g1);
        reg.proposeRecovery(SUBJECT, newController);
        vm.prank(g1);
        reg.approveRecovery(SUBJECT);

        vm.prank(g2);
        reg.proposeRecovery(SUBJECT, stranger);
        assertEq(reg.pendingRecovery(SUBJECT).approvals, 0, "a new proposal starts at zero");

        vm.prank(g2);
        reg.approveRecovery(SUBJECT);
        assertEq(reg.rootOf(SUBJECT).controller, controller, "g1's old approval must not count");

        vm.prank(g1);
        reg.approveRecovery(SUBJECT);
        assertEq(reg.rootOf(SUBJECT).controller, stranger);
    }

    function test_recoveredControllerCanRotateAndTheOldOneCannot() public {
        _register();
        vm.prank(g1);
        reg.proposeRecovery(SUBJECT, newController);
        vm.prank(g1);
        reg.approveRecovery(SUBJECT);
        vm.prank(g2);
        reg.approveRecovery(SUBJECT);

        vm.prank(controller);
        vm.expectRevert(
            abi.encodeWithSelector(
                DelegationRootRegistry.NotController.selector, controller, newController
            )
        );
        reg.rotate(SUBJECT, PK2, CID2);

        vm.prank(newController);
        reg.rotate(SUBJECT, PK2, CID2);
        assertEq(reg.rootOf(SUBJECT).publicKey, PK2);
    }
}
