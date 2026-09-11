(ns app-kotoba-cloud.rootkey-test
  (:require [app-kotoba-cloud.profile :as profile]
            [app-kotoba-cloud.rootkey :as rootkey]
            [clojure.test :refer [deftest is testing]]))

(def ^:private a-log
  {:genesis-key-digest "sha256:genesis"
   :records [{"v" "biscuit.rootkey/v1" "subject" rootkey/subject "seq" 1
              "keys" [["ed25519" "pk1"]] "next" "sha256:next" "prev" nil}]})

(defn- ok-verify [_] {:keys [["ed25519" "pk1"]] :seq 1 :records 1})
(defn- refusing-verify [_] {:refused :signature-mismatch :at 0})

(deftest an-unpublished-log-says-so-rather-than-serving-nothing
  (testing "no ceremony has run: neither 404 nor an empty list"
    (let [{:keys [status body]} (rootkey/served {:genesis-key-digest nil :records []}
                                                ok-verify)]
      (is (= 503 status))
      (is (= "not-published" (:reason body)))
      (is (= rootkey/subject (:subject body)))))
  (testing "a pin with no log is unusable, and so is a log with no pin"
    (is (false? (rootkey/configured? {:genesis-key-digest "sha256:g" :records []})))
    (is (false? (rootkey/configured? {:genesis-key-digest nil :records [{}]})))
    (is (true? (rootkey/configured? a-log)))))

(deftest a-log-that-does-not-verify-is-not-served
  (testing "this apex is a mutable location, which is what the pre-rotation shape survives"
    (let [{:keys [status body]} (rootkey/served a-log refusing-verify)]
      (is (= 503 status))
      (is (= "failed-verification" (:reason body)))))
  (testing "and the two unavailable states are distinguishable by a JSON reader"
    (is (not= (:reason (:body (rootkey/served a-log refusing-verify)))
              (:reason (:body (rootkey/served {:genesis-key-digest nil :records []}
                                              refusing-verify)))))))

(deftest a-verified-log-is-served-without-claiming-authority
  (let [{:keys [status body]} (rootkey/served a-log ok-verify)]
    (is (= 200 status))
    (is (= rootkey/subject (:subject body)))
    (is (= "sha256:genesis" (:genesisKeyDigest body)))
    (is (= 1 (:seq body)))
    (testing "the body says what it is not"
      (is (= "the-log-not-this-document" (:authority body))))))

(deftest the-profile-publishes-the-gap-not-only-the-material
  (let [d (:delegation profile/control-plane)]
    (testing "no ceremony has run yet, and the section says so instead of vanishing"
      (is (false? (:published d)))
      (is (nil? (:genesisKeyDigest d))))
    (testing "the pin belongs to the caller, and this document is not the authority"
      (is (= "the-log-not-this-document" (:authority d)))
      (is (= "the-calling-plane-not-this-document" (:pinnedBy d))))
    (testing "having the material is not the same as any plane using it"
      (is (false? (:verifiedLocally d)))
      (is (= "identity-service" (:verifierToday d))))))

(deftest claiming-local-verification-fails-the-predicate
  (testing "the same rule the other unwired claims carry"
    (is (not (profile/valid-profile?
              (assoc-in profile/control-plane [:delegation :verifiedLocally] true)))))
  (testing "and so does claiming this document is the authority"
    (is (not (profile/valid-profile?
              (assoc-in profile/control-plane [:delegation :authority] "this-document"))))
    (is (not (profile/valid-profile?
              (assoc-in profile/control-plane [:delegation :pinnedBy] "this-document"))))))
