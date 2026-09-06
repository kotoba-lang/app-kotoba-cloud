(ns app-kotoba-cloud.guardian-test
  (:require [app-kotoba-cloud.guardian :as g]
            [clojure.test :refer [deftest is testing]]))

(def ^:private P g/default-policy)
(def ^:private DAY (* 24 60 60))
(def ^:private NOW 1000000000)

(def ^:private controller "0xC0FFEE1234567890ABCDEF1234567890DEADBEEF")

(defn- facts [& {:as over}]
  (merge {:candidate "0x1111111111111111111111111111111111111111"
          :current-controller controller
          :announced-at (- NOW (* 30 DAY))
          :now NOW
          :timelock (* 7 DAY)
          :candidate-first-seen (- NOW (* 200 DAY))
          :controller-last-active (- NOW (* 60 DAY))}
         over))

(deftest a-clean-proposal-is-allowed
  (is (= :allow (:verdict (g/deterministic-verdict P (facts))))))

(deftest poisoning-is-caught-by-arithmetic-not-by-a-model
  (testing "a candidate mined to share the controller's prefix"
    (let [near (str "0xC0FFEE1234" (apply str (repeat 30 "9")))
          v (g/deterministic-verdict P (facts :candidate near))]
      (is (= :veto (:verdict v)))
      (is (= "address-poisoning-suspected" (:reason v)))))
  (testing "and one mined to share only the suffix — matching either end defeats a human"
    (let [near (str "0x" (apply str (repeat 34 "9")) "DEADBEEF")
          v (g/deterministic-verdict P (facts :candidate near))]
      (is (= "address-poisoning-suspected" (:reason v)))))
  (testing "similarity ignores case and the 0x prefix, which an attacker need not match"
    (is (= 40 (:prefix (g/similarity controller (clojure.string/lower-case controller)))))
    (is (= 40 (:prefix (g/similarity controller (subs controller 2))))))
  (testing "an unrelated address is not flagged"
    (is (false? (g/poisoning-suspect? P controller
                                      "0x1111111111111111111111111111111111111111")))))

(deftest a-check-that-could-not-run-does-not-clear
  (testing "an unknown first-seen is treated as too new, not as satisfied"
    (let [v (g/deterministic-verdict P (facts :candidate-first-seen nil))]
      (is (= :veto (:verdict v)))
      (is (= "candidate-too-new" (:reason v)))))
  (testing "an absent announcement is its own reason, not a generic refusal"
    (is (= "not-announced" (:reason (g/deterministic-verdict P (facts :announced-at nil)))))
    (is (= "not-announced" (:reason (g/deterministic-verdict P (facts :announced-at 0)))))))

(deftest the-window-and-the-premise-are-both-checked
  (testing "the timelock has not elapsed"
    (let [v (g/deterministic-verdict P (facts :announced-at (- NOW DAY)))]
      (is (= "timelock-not-elapsed" (:reason v)))
      (is (= (+ (- NOW DAY) (* 7 DAY)) (get-in v [:detail :usable-at])))))
  (testing "a controller that is still signing undercuts the premise of a recovery"
    (let [v (g/deterministic-verdict P (facts :controller-last-active (- NOW DAY)))]
      (is (= "controller-still-active" (:reason v)))))
  (testing "and an unknown last-active does not veto — absence of evidence of activity
            is not evidence of activity, which is the opposite direction from first-seen"
    (is (= :allow (:verdict (g/deterministic-verdict P (facts :controller-last-active nil)))))))

(deftest an-advisory-may-veto-and-may-not-clear
  (testing "a model saying allow does not overturn a deterministic veto"
    (let [v (g/decide P (facts :candidate-first-seen nil) {:verdict :allow :model "m"})]
      (is (= :veto (:verdict v)))
      (is (= "candidate-too-new" (:reason v)))))
  (testing "a model saying veto is honoured on an otherwise clean proposal"
    (let [v (g/decide P (facts) {:verdict :veto :model "m" :reason "funding source is a mixer"})]
      (is (= :veto (:verdict v)))
      (is (= "advisory-veto" (:reason v)))
      (is (= "funding source is a mixer" (get-in v [:detail :stated])))))
  (testing "and a model cannot mint a reason code nobody can check"
    (let [v (g/decide P (facts) {:verdict :veto :model "m" :reason "made-up-code"})]
      (is (contains? g/reason-codes (:reason v)))))
  (testing "no advisory at all leaves the deterministic verdict alone"
    (is (= :allow (:verdict (g/decide P (facts) nil))))))

(deftest only-namable-refusals-are-reportable
  (testing "the contract refuses a zero reason code, so an unnamable veto is caught here"
    (is (true? (g/reportable? {:verdict :allow})))
    (is (true? (g/reportable? {:verdict :veto :reason "address-poisoning-suspected"})))
    (is (false? (g/reportable? {:verdict :veto :reason "something-else"})))
    (is (false? (g/reportable? {:verdict :veto}))))
  (testing "and everything decide can produce is reportable"
    (doseq [f [(facts) (facts :announced-at nil) (facts :candidate-first-seen nil)
               (facts :announced-at (- NOW DAY)) (facts :controller-last-active (- NOW DAY))]]
      (is (true? (g/reportable? (g/decide P f nil)))))
    (is (true? (g/reportable? (g/decide P (facts) {:verdict :veto :model "m" :reason "x"}))))))
