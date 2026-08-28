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

(deftest passkey-is-exact-host-scoped
  (is (= "auth.kotoba.cloud"
         (get-in profile/control-plane [:security :passkeyRpId])))
  (is (= "host-only"
         (get-in profile/control-plane [:security :sessionCookieScope])))
  (is (false? (get-in profile/control-plane
                       [:security :untrustedDeploymentsUnderKotobaCloud]))))
