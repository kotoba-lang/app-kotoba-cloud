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

(deftest passkey-rp-is-exact-and-session-is-apex-readable
  (is (= "auth.kotoba.cloud"
         (get-in profile/control-plane [:security :passkeyRpId])))
  (is (= "registrable-domain:kotoba.cloud"
         (get-in profile/control-plane [:security :sessionCookieScope])))
  (is (= "https://kotoba.cloud/v1/session"
         (get-in profile/control-plane [:security :sessionProjection])))
  (is (false? (get-in profile/control-plane
                       [:security :untrustedDeploymentsUnderKotobaCloud]))))

(deftest library-publication-keeps-catalog-storage-and-control-separated
  (let [libraries (:libraries profile/control-plane)]
    (is (= "https://kotoba-lang.org" (:catalogOrigin libraries)))
    (is (= "/libraries/" (:catalogPath libraries)))
    (is (= "https://kotobase.net" (:storageOrigin libraries)))
    (is (= "kotoba library inspect" (:inspectCommand libraries)))
    (is (= "kotoba library publish" (:publishCommand libraries)))
    (is (= "local-signed-passkey-relay-distributed-gated" (:publishMode libraries)))
    (is (= 2 (:minimumByteCompleteStorageProviders libraries)))
    (is (= 2 (:minimumRoutedPeerIds libraries)))
    (is (= "kotoba library verify" (:verifyCommand libraries)))
    (is (= "kotoba library run" (:runCommand libraries)))
    (is (= "/.well-known/kotoba-package-registry.edn"
           (:packageRegistryPath libraries)))
    (is (= "kotoba package add" (:installCommand libraries)))
    (is (= "kotoba package run" (:runLockedCommand libraries)))
    (is (true? (:defaultDryRun libraries)))
    (is (true? (:hostedPasskeyPublish libraries)))
    (is (= "https://kotoba.cloud/v1/libraries/publish"
           (:hostedPublishEndpoint libraries)))))
