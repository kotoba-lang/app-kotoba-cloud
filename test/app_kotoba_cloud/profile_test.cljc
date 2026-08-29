(ns app-kotoba-cloud.profile-test
  (:require [app-kotoba-cloud.profile :as profile]
            [clojure.test :refer [deftest is testing]]))

(deftest domain-roles-stay-separated
  (is (profile/valid-profile? profile/control-plane))
  (let [roles (:roles profile/control-plane)
        origins (map :origin (vals roles))]
    (is (= (count origins) (count (distinct origins))))
    (is (= "content-addressed-artifacts-state-and-receipts"
           (get-in roles [:storage :purpose])))
    (is (= "cpu-gpu-placement-and-execution"
           (get-in roles [:compute :purpose])))
    (is (= "agent-workspaces-goals-tools-and-approvals"
           (get-in roles [:agentWork :purpose])))))

(deftest hosted-apply-is-not-overclaimed
  (testing "discovery distinguishes the landed control dependency from a future hosted apply API"
    (is (false? (get-in profile/control-plane [:deploy :hostedApply])))
    (is (= "local-admission-remote-compute"
           (get-in profile/control-plane [:deploy :mode])))))

(deftest post-quantum-is-the-default-cryptographic-floor
  (let [cryptography (:cryptography profile/control-plane)]
    (is (= "post-quantum-required-for-new-boundaries" (:defaultPolicy cryptography)))
    (is (= "x25519+ml-kem-768+aes-256-gcm" (:confidentialitySuite cryptography)))
    (is (= "ed25519+ml-dsa-65" (:publicationSignatureSuite cryptography)))
    (is (= "reject-missing-pq-or-unknown-suite" (:downgradePolicy cryptography)))
    (is (false? (:legacyCompatibilityRequired cryptography)))))

(deftest passkey-rp-is-exact-and-session-is-apex-readable
  (is (= "https://auth.kotoba.cloud" profile/identity-origin))
  (is (= "https://auth.kotoba.cloud/" profile/identity-href))
  (is (= "https://auth.kotoba.cloud/sign-in" profile/identity-sign-in))
  (is (= "auth.kotoba.cloud" profile/identity-rp-id))
  (is (= profile/identity-origin
         (get-in profile/control-plane [:roles :identity :origin])))
  (is (= profile/identity-origin
         (get-in profile/control-plane [:security :passkeyOrigin])))
  (is (= "auth.kotoba.cloud"
         (get-in profile/control-plane [:security :passkeyRpId])))
  (is (= "registrable-domain:kotoba.cloud"
         (get-in profile/control-plane [:security :sessionCookieScope])))
  (is (= "https://kotoba.cloud/v1/session"
         (get-in profile/control-plane [:security :sessionProjection])))
  (is (= "webauthn-session+principal-pinned-ml-dsa-65"
         (get-in profile/control-plane [:security :passkeyPqMode])))
  (is (= "the-authenticator-passkey-itself-is-not-claimed-post-quantum"
         (get-in profile/control-plane [:security :passkeyPqLimitation])))
  (is (false? (get-in profile/control-plane
                       [:security :untrustedDeploymentsUnderKotobaCloud]))))

(deftest library-publication-keeps-catalog-storage-and-control-separated
  (let [libraries (:libraries profile/control-plane)]
    (is (= "https://kotoba-lang.org" (:catalogOrigin libraries)))
    (is (= "/libraries/" (:catalogPath libraries)))
    (is (= "https://kotobase.net" (:storageOrigin libraries)))
    (is (= "kotoba library inspect" (:inspectCommand libraries)))
    (is (= "kotoba library publish" (:publishCommand libraries)))
    (is (= "local-signed-passkey-plus-principal-pinned-ml-dsa-relay-distributed-gated"
           (:publishMode libraries)))
    (is (= "https://kotoba.cloud/schemas/library-publication-request/v3"
           (:requestSchema libraries)))
    (is (= "single-use-request-id" (:publicationRequestReplayPolicy libraries)))
    (is (= "monotonic-principal-pinned" (:pqKeyEpochPolicy libraries)))
    (is (= "publication-and-passkey-authenticated-transitions-live"
           (:pqKeyLifecycle libraries)))
    (is (= "https://kotoba.cloud/schemas/pq-key-transition-request/v1"
           (:pqKeyTransitionSchema libraries)))
    (is (= "https://kotoba.cloud/v1/pq-keys/rotate"
           (:pqKeyRotateEndpoint libraries)))
    (is (= "https://kotoba.cloud/v1/pq-keys/revoke"
           (:pqKeyRevokeEndpoint libraries)))
    (is (= "blocked-independent-quorum-not-implemented"
           (:pqKeyRecovery libraries)))
    (is (= 2 (:minimumByteCompleteStorageProviders libraries)))
    (is (= 2 (:minimumRoutedPeerIds libraries)))
    (is (= "kotoba library verify" (:verifyCommand libraries)))
    (is (= "kotoba library run" (:runCommand libraries)))
    (is (= "/.well-known/kotoba-package-registry.edn"
           (:packageRegistryPath libraries)))
    (is (= profile/reference-package-catalog-cid (:packageRegistryCid libraries)))
    (is (= "ed25519+ml-dsa-65" (:packageSignatureSuite libraries)))
    (is (= (str "kotoba package add --catalog-cid " profile/reference-package-catalog-cid)
           (:installCommand libraries)))
    (is (= "kotoba package run" (:runLockedCommand libraries)))
    (is (true? (:defaultDryRun libraries)))
    (is (true? (:hostedPasskeyPublish libraries)))
    (is (= "https://kotoba.cloud/v1/libraries/publish"
           (:hostedPublishEndpoint libraries)))))
