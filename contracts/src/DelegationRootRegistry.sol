// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

/// @title Which delegation root is current, and who may change it.
/// @notice Records the Ed25519 root public key and the log CID for a subject,
///         and gates rotation on a controller address or a guardian quorum.
///         Superproject ADR-2800010900.
///
/// @dev WHAT THIS DOES NOT DO, because the difference decides how it can be used:
///
///      It does not verify the Ed25519 root key. There is no Ed25519 precompile,
///      so the key is RECORDED here and verified where signatures are checked —
///      by `biscuit.token/verify`, against the key this registry names. A reader
///      who takes a passing transaction as proof that the key is valid has
///      learned only that the controller said so.
///
///      It does not verify the passkey. The root is derived from a WebAuthn PRF
///      off-chain (ADR-2800010900), and a chain cannot observe an authenticator.
///      The controller address is the on-chain shadow of that authority, not the
///      authority itself.
///
///      It does not store the log. The CID digest is here; the bytes are on
///      IPFS, where the location is not mutable and the digest is the content.
///      That is why the registry needs only 32 bytes to name a whole history.
contract DelegationRootRegistry {
    error ZeroSubject();
    error ZeroPublicKey();
    error ZeroController();
    error NotController(address caller, address controller);
    error SubjectExists(bytes32 subject);
    error UnknownSubject(bytes32 subject);
    /// @dev A rotation must move something, or an epoch is spent recording that
    ///      nothing happened and readers who diff epochs see a change that is not one.
    error NoChange();
    error NotGuardian(address caller);
    error AlreadyApproved(address guardian);
    error ThresholdNotMet(uint256 approvals, uint256 threshold);
    /// @dev k of n with k = 0 authorises everyone, and k > n can never be met.
    ///      Both are configuration that reads as a quorum and is not one.
    error InvalidThreshold(uint256 threshold, uint256 guardians);
    error DuplicateGuardian(address guardian);
    /// @dev A proposal must name a candidate that was announced first, so a
    ///      guardian can compare it against a chain fact rather than against
    ///      the requester's prose. ADR-2800011000 D4: prose is a shared input,
    ///      and a shared input correlates guardians that are otherwise diverse.
    error NotAnnounced(address candidate);
    error RecoveryVetoed(address vetoedBy, bytes32 reasonCode);
    error TimelockNotElapsed(uint64 executeAfter);
    error NoProposal();
    error ZeroReasonCode();
    error ZeroTimelock();

    struct Root {
        bytes32 publicKey;
        bytes32 logDigest;
        address controller;
        uint64 epoch;
        uint64 updatedAt;
    }

    struct Recovery {
        address proposedController;
        uint64 proposedAt;
        uint64 executeAfter;
        uint256 approvals;
        address vetoedBy;
        bytes32 vetoReason;
    }

    mapping(bytes32 subject => Root root) private _roots;
    mapping(bytes32 subject => address[] guardians) private _guardians;
    mapping(bytes32 subject => uint256 threshold) private _thresholds;
    mapping(bytes32 subject => Recovery recovery) private _recoveries;
    mapping(bytes32 subject => mapping(uint64 epoch => mapping(address guardian => bool approved)))
        private _approved;
    mapping(bytes32 subject => mapping(address candidate => uint64 announcedAt)) private _announced;
    mapping(bytes32 subject => uint64 timelock) private _timelocks;

    event RootRegistered(
        bytes32 indexed subject, bytes32 indexed publicKey, bytes32 logDigest, address controller
    );
    event RootRotated(
        bytes32 indexed subject, bytes32 indexed publicKey, bytes32 logDigest, uint64 epoch
    );
    event CandidateAnnounced(bytes32 indexed subject, address indexed candidate, uint64 announcedAt);
    event RecoveryProposed(
        bytes32 indexed subject, address indexed proposedController, uint64 epoch, uint64 executeAfter
    );
    event RecoveryVetoedBy(bytes32 indexed subject, address indexed guardian, bytes32 reasonCode);
    event RecoveryExecuted(bytes32 indexed subject, address indexed newController, address executedBy);
    event RecoveryApproved(bytes32 indexed subject, address indexed guardian, uint256 approvals);
    event ControllerRecovered(
        bytes32 indexed subject, address indexed previousController, address indexed newController
    );

    /// @notice Register a subject for the first time.
    /// @dev Guardians and threshold are set here and not later, because a root
    ///      that exists without a recovery quorum is the failure ADR-2800010900
    ///      names: derivation makes the authenticator a single point of failure,
    ///      so the two have to land together. Passing an empty guardian set is
    ///      allowed and is the explicit choice to have no recovery — it cannot
    ///      be reached by forgetting to pass one, because threshold 0 with
    ///      guardians present reverts.
    function register(
        bytes32 subject,
        bytes32 publicKey,
        bytes32 logDigest,
        address controller,
        address[] calldata guardians,
        uint256 threshold,
        uint64 timelock
    ) external {
        if (subject == bytes32(0)) revert ZeroSubject();
        if (publicKey == bytes32(0)) revert ZeroPublicKey();
        if (controller == address(0)) revert ZeroController();
        if (_roots[subject].publicKey != bytes32(0)) revert SubjectExists(subject);
        // Zero would make a proposal executable in the same block it was made,
        // which is the investigation window the guardians exist to use.
        if (guardians.length > 0 && timelock == 0) revert ZeroTimelock();
        _setQuorum(subject, guardians, threshold);
        _timelocks[subject] = timelock;

        _roots[subject] = Root({
            publicKey: publicKey,
            logDigest: logDigest,
            controller: controller,
            epoch: 1,
            updatedAt: uint64(block.timestamp)
        });
        emit RootRegistered(subject, publicKey, logDigest, controller);
    }

    /// @notice Rotate the recorded key and/or log for a subject.
    function rotate(bytes32 subject, bytes32 publicKey, bytes32 logDigest) external {
        Root storage r = _roots[subject];
        if (r.publicKey == bytes32(0)) revert UnknownSubject(subject);
        if (msg.sender != r.controller) revert NotController(msg.sender, r.controller);
        if (publicKey == bytes32(0)) revert ZeroPublicKey();
        if (publicKey == r.publicKey && logDigest == r.logDigest) revert NoChange();

        r.publicKey = publicKey;
        r.logDigest = logDigest;
        r.epoch += 1;
        r.updatedAt = uint64(block.timestamp);
        emit RootRotated(subject, publicKey, logDigest, r.epoch);
    }

    /// @notice Announce a candidate. The timelock starts here, not at proposal.
    /// @dev Anyone may announce: an announcement grants nothing, it only makes a
    ///      later proposal comparable to something that was public first. An
    ///      attacker must therefore expose the target address and wait, which is
    ///      the window the guardians investigate in.
    function announceCandidate(bytes32 subject, address candidate) external {
        if (_roots[subject].publicKey == bytes32(0)) revert UnknownSubject(subject);
        if (candidate == address(0)) revert ZeroController();
        if (_announced[subject][candidate] == 0) {
            _announced[subject][candidate] = uint64(block.timestamp);
            emit CandidateAnnounced(subject, candidate, uint64(block.timestamp));
        }
    }

    function announcedAt(bytes32 subject, address candidate) external view returns (uint64) {
        return _announced[subject][candidate];
    }

    /// @notice Propose an announced candidate. Clears approvals for the previous proposal.
    /// @dev Keyed by epoch so approvals cannot survive into a different proposal:
    ///      without that, a guardian who approved handing control to A would be
    ///      counted as approving B.
    function proposeRecovery(bytes32 subject, address proposedController) external {
        Root storage r = _roots[subject];
        if (r.publicKey == bytes32(0)) revert UnknownSubject(subject);
        if (proposedController == address(0)) revert ZeroController();
        if (!_isGuardian(subject, msg.sender)) revert NotGuardian(msg.sender);

        uint64 at = _announced[subject][proposedController];
        if (at == 0) revert NotAnnounced(proposedController);

        r.epoch += 1;
        _recoveries[subject] = Recovery({
            proposedController: proposedController,
            proposedAt: uint64(block.timestamp),
            // Anchored at the ANNOUNCEMENT, not at this call. The window exists
            // to expose the candidate publicly for investigation, and it starts
            // the moment it became public. Anchoring here instead would let a
            // late proposal restart a clock that had already run, and would
            // stack two full waits for one guarantee.
            executeAfter: at + _timelocks[subject],
            approvals: 0,
            vetoedBy: address(0),
            vetoReason: bytes32(0)
        });
        emit RecoveryProposed(subject, proposedController, r.epoch, _recoveries[subject].executeAfter);
    }

    /// @notice Refuse the standing proposal, naming which check failed.
    /// @dev The reason code is required and emitted. "A guardian refused" without
    ///      one is unfalsifiable — the same defect as a negative test that counts
    ///      a run which failed for an unrelated reason (ADR-2800011000 D7).
    function veto(bytes32 subject, bytes32 reasonCode) external {
        Root storage r = _roots[subject];
        if (r.publicKey == bytes32(0)) revert UnknownSubject(subject);
        if (!_isGuardian(subject, msg.sender)) revert NotGuardian(msg.sender);
        if (reasonCode == bytes32(0)) revert ZeroReasonCode();

        Recovery storage rec = _recoveries[subject];
        if (rec.proposedController == address(0)) revert NoProposal();

        rec.vetoedBy = msg.sender;
        rec.vetoReason = reasonCode;
        emit RecoveryVetoedBy(subject, msg.sender, reasonCode);
    }

    /// @notice Approve the standing proposal. Approvals shorten nothing; they record consent.
    function approveRecovery(bytes32 subject) external {
        Root storage r = _roots[subject];
        if (r.publicKey == bytes32(0)) revert UnknownSubject(subject);
        if (!_isGuardian(subject, msg.sender)) revert NotGuardian(msg.sender);

        Recovery storage rec = _recoveries[subject];
        if (rec.proposedController == address(0)) revert NoProposal();
        if (_approved[subject][r.epoch][msg.sender]) revert AlreadyApproved(msg.sender);

        _approved[subject][r.epoch][msg.sender] = true;
        rec.approvals += 1;
        emit RecoveryApproved(subject, msg.sender, rec.approvals);
    }

    /// @notice Execute a proposal that survived its timelock without a veto.
    /// @dev Deliberately callable by anyone. Restricting it would mean an agent
    ///      outage blocks recovery at the moment the keys are already lost, which
    ///      is the liveness half of ADR-2800011000 D5. Safety is bought by the
    ///      announcement, the timelock and the veto, not by gating this call.
    function executeRecovery(bytes32 subject) external {
        Root storage r = _roots[subject];
        if (r.publicKey == bytes32(0)) revert UnknownSubject(subject);

        Recovery storage rec = _recoveries[subject];
        if (rec.proposedController == address(0)) revert NoProposal();
        if (rec.vetoedBy != address(0)) revert RecoveryVetoed(rec.vetoedBy, rec.vetoReason);
        if (uint64(block.timestamp) < rec.executeAfter) revert TimelockNotElapsed(rec.executeAfter);
        if (rec.approvals < _thresholds[subject]) {
            revert ThresholdNotMet(rec.approvals, _thresholds[subject]);
        }

        address previous = r.controller;
        r.controller = rec.proposedController;
        r.updatedAt = uint64(block.timestamp);
        delete _recoveries[subject];
        emit ControllerRecovered(subject, previous, r.controller);
        emit RecoveryExecuted(subject, r.controller, msg.sender);
    }

    function rootOf(bytes32 subject) external view returns (Root memory) {
        Root memory r = _roots[subject];
        if (r.publicKey == bytes32(0)) revert UnknownSubject(subject);
        return r;
    }

    function guardiansOf(bytes32 subject) external view returns (address[] memory) {
        return _guardians[subject];
    }

    function timelockOf(bytes32 subject) external view returns (uint64) {
        return _timelocks[subject];
    }

    function thresholdOf(bytes32 subject) external view returns (uint256) {
        return _thresholds[subject];
    }

    function pendingRecovery(bytes32 subject) external view returns (Recovery memory) {
        return _recoveries[subject];
    }

    function _setQuorum(bytes32 subject, address[] calldata guardians, uint256 threshold) private {
        if (guardians.length == 0) {
            if (threshold != 0) revert InvalidThreshold(threshold, 0);
            return;
        }
        if (threshold == 0 || threshold > guardians.length) {
            revert InvalidThreshold(threshold, guardians.length);
        }
        for (uint256 i = 0; i < guardians.length; i++) {
            if (guardians[i] == address(0)) revert ZeroController();
            // A duplicate would let one key satisfy a k-of-n twice, which is the
            // same defect kagi.recovery/validate-distinct-members! rejects for
            // aliased signing keys: n distinct ids that are not n distinct holders.
            for (uint256 j = 0; j < i; j++) {
                if (guardians[i] == guardians[j]) revert DuplicateGuardian(guardians[i]);
            }
            _guardians[subject].push(guardians[i]);
        }
        _thresholds[subject] = threshold;
    }

    function _isGuardian(bytes32 subject, address who) private view returns (bool) {
        address[] storage g = _guardians[subject];
        for (uint256 i = 0; i < g.length; i++) {
            if (g[i] == who) return true;
        }
        return false;
    }
}
