(ns app-kotoba-cloud.chain-facts-test
  (:require [app-kotoba-cloud.chain-facts :as cf]
            [app-kotoba-cloud.guardian :as g]
            [clojure.java.io :as io]
            [kotoba.lang.text :as str]
            [clojure.test :refer [deftest is testing]]))

(def ^:private REG "0x00000000000000000000000000000000000000AA")
(def ^:private SUBJ "0xabcd000000000000000000000000000000000000000000000000000000000000")
(def ^:private CAND "0x1111111111111111111111111111111111111111")
(def ^:private CTRL "0xC0FFEE1234567890ABCDEF1234567890DEADBEEF")

(defn- rpc-fixed [answers]
  (fn [method _params] (get answers method)))

(deftest the-call-is-shaped-for-the-real-selector
  (let [[{:keys [to data]} block] (cf/announced-at-call REG SUBJ CAND)]
    (is (= REG to))
    (is (= "latest" block))
    (testing "selector, then two 32-byte words"
      (is (str/starts-with? data cf/announced-at-selector))
      (is (= (+ 10 64 64) (count data))))
    (testing "the address is left-padded, not truncated"
      (is (str/ends-with? (str/lower data)
                          (str/replace (str/lower CAND) #"^0x" ""))))))

(deftest what-the-node-can-answer-is-read-and-the-rest-is-named
  (let [r (cf/read (rpc-fixed {"eth_call" "0x000000000000000000000000000000000000000000000000000000006543210f"
                               "eth_getTransactionCount" "0x1f"
                               "eth_getCode" "0x"})
                   {:registry REG :subject SUBJ :candidate CAND
                    :current-controller CTRL :now 1700000000})]
    (testing "node-answerable facts arrive"
      (is (= 0x6543210f (get-in r [:facts :announced-at])))
      (is (= 31 (get-in r [:facts :candidate-outbound-tx-count])))
      (is (false? (get-in r [:facts :candidate-is-contract?]))))
    (testing "indexed facts are named as unavailable and are ABSENT, not nil"
      (is (contains? (:unavailable r) :candidate-first-seen))
      (is (contains? (:unavailable r) :candidate-funding-source))
      (is (not (contains? (:facts r) :candidate-first-seen)))
      (is (not (contains? (:facts r) :controller-last-active))))))

(deftest an-rpc-that-failed-is-unavailable-not-absent-of-consequence
  (let [r (cf/read (fn [method _] (if (= "eth_call" method)
                                    (throw (ex-info "node said no" {}))
                                    "0x0"))
                   {:registry REG :subject SUBJ :candidate CAND
                    :current-controller CTRL :now 1700000000})]
    (is (contains? (:unavailable r) :announced-at))
    (is (not (contains? (:facts r) :announced-at)))
    (testing "and the reason is kept, not reduced to the fact being missing"
      (is (str/includes? (get-in r [:errors :announced-at]) "node said no")))))

(deftest an-unindexed-node-makes-the-guardian-veto-and-that-is-the-point
  ;; The operational consequence, asserted rather than left in a docstring:
  ;; without an index the guardian cannot clear a candidate, because the check
  ;; it needs did not run.
  (let [r (cf/read (rpc-fixed {"eth_call" "0x0000000000000000000000000000000000000000000000000000000060000000"
                               "eth_getTransactionCount" "0x1f"
                               "eth_getCode" "0x"})
                   {:registry REG :subject SUBJ :candidate CAND
                    :current-controller CTRL :now 0x70000000})
        v (g/deterministic-verdict g/default-policy
                                   (cf/merge-into-guardian-facts r (* 7 24 60 60)))]
    (is (= :veto (:verdict v)))
    (is (= "candidate-too-new" (:reason v))
        "the unavailable fact, not a judgement about the address")
    (testing "and merging invents nothing — the reader does not decide for the guardian"
      (is (not (contains? (cf/merge-into-guardian-facts r 1) :candidate-first-seen))))))

(def ^:private artifact
  "contracts/out/DelegationRootRegistry.sol/DelegationRootRegistry.json")

(deftest the-hardcoded-selector-is-checked-against-the-compiled-abi
  ;; The Solidity side also asserts this value, but it hard-codes the same
  ;; literal — two agreeing constants, not a check. Reverting chain_facts.cljc to
  ;; the invented selector left BOTH suites green, which is how this test came to
  ;; exist. Here the Clojure constant is compared against something derived.
  (let [f (io/file artifact)]
    (is (.exists f)
        (str "run `npm run build:contract` first — this test cannot verify the "
             "selector without the compiled ABI, and must not pass while it "
             "cannot: " artifact))
    (when (.exists f)
      (let [ids (-> (slurp f)
                    (str/replace #"\s" "")
                    (->> (re-find #"\"methodIdentifiers\":\{([^}]*)\}"))
                    second)
            found (second (re-find #"\"announcedAt\(bytes32,address\)\":\"([0-9a-f]{8})\"" ids))]
        (is (some? found) "announcedAt is not in the compiled ABI")
        (is (= cf/announced-at-selector (str "0x" found))
            "chain_facts.cljc's selector disagrees with the compiled contract")))))
