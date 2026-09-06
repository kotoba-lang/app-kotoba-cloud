(ns app-kotoba-cloud.advisory-panel-test
  (:require [app-kotoba-cloud.advisory-panel :as p]
            [app-kotoba-cloud.guardian :as g]
            [clojure.test :refer [deftest is testing]]))

(defn- ask-fixed [answers]
  (fn [member _facts] (get answers (:seat member) {:verdict :allow})))

(deftest three-models-on-one-key-is-one-seat
  (testing "the panel we start with, counted honestly"
    (let [r (p/independence-report p/default-panel)]
      (is (= 3 (:seats r)))
      (is (= 3 (:distinct-models r)))
      (is (= 1 (:independence r)))
      (is (false? (:fully-independent? r)))
      (is (= [:api-base :credential-ref] (:shared r)))))
  (testing "splitting the credential alone already buys seats"
    (let [split (map-indexed #(assoc %2 :credential-ref (str "env:KEY_" %1)) p/default-panel)]
      (is (= 3 (p/independence split)))
      (is (true? (:fully-independent? (p/independence-report split))))))
  (testing "and model diversity alone buys none"
    (let [same-model (mapv #(assoc % :model "one/model") p/default-panel)]
      (is (= 1 (p/independence same-model)))
      (is (= 1 (:distinct-models (p/independence-report same-model)))))))

(deftest any-member-may-veto-and-none-may-clear
  (testing "one veto out of three is a panel veto"
    (let [r (p/panel-verdict (ask-fixed {:gemini {:verdict :veto :reason "mixer funding"}})
                             p/default-panel {})]
      (is (= :veto (:verdict r)))
      (is (= [:gemini] (:vetoed-by r)))))
  (testing "two allows do not outvote one veto"
    (let [r (p/panel-verdict (ask-fixed {:claude {:verdict :allow}
                                         :gpt {:verdict :allow}
                                         :gemini {:verdict :veto :reason "x"}})
                             p/default-panel {})]
      (is (= :veto (:verdict r)))))
  (testing "all allow is allow"
    (is (= :allow (:verdict (p/panel-verdict (ask-fixed {}) p/default-panel {}))))))

(deftest a-member-that-could-not-answer-is-not-a-member-that-agreed
  (testing "a thrown error becomes unreachable, not allow"
    (let [ask (fn [m _] (if (= :gpt (:seat m))
                          (throw (ex-info "502 from provider" {}))
                          {:verdict :allow}))
          r (p/panel-verdict ask p/default-panel {})]
      (is (= [:gpt] (:unreachable r)))
      (is (= 2 (:answered r)))))
  (testing "so does a nonsense verdict — a model that returned garbage did not answer"
    (let [r (p/panel-verdict (ask-fixed {:claude {:verdict :maybe}}) p/default-panel {})]
      (is (= [:claude] (:unreachable r)))
      (is (= 2 (:answered r)))))
  (testing "and unreachable seats are reported rather than folded into the verdict"
    (let [r (p/panel-verdict (ask-fixed {:claude {:verdict :maybe} :gpt {:verdict :maybe}})
                             p/default-panel {})]
      (is (= :allow (:verdict r)) "no veto was cast")
      (is (= 1 (:answered r)) "but only one seat actually answered"))))

(deftest only-a-veto-crosses-into-the-guardian
  (testing "an allowing panel produces no advisory at all"
    (is (nil? (p/->advisory (p/panel-verdict (ask-fixed {}) p/default-panel {})))))
  (testing "a vetoing panel produces one the guardian will honour"
    (let [a (p/->advisory (p/panel-verdict
                           (ask-fixed {:gemini {:verdict :veto :reason "mixer funding"}})
                           p/default-panel {}))]
      (is (= :veto (:verdict a)))
      (is (= "mixer funding" (:reason a)))
      (is (= "gemini" (:model a)))))
  (testing "and the guardian still refuses to let it mint a reason code"
    (let [facts {:candidate "0x1111111111111111111111111111111111111111"
                 :current-controller "0xC0FFEE1234567890ABCDEF1234567890DEADBEEF"
                 :announced-at 1 :now 100000000 :timelock 1
                 :candidate-first-seen 1 :controller-last-active nil}
          a (p/->advisory (p/panel-verdict
                           (ask-fixed {:gpt {:verdict :veto :reason "totally-made-up"}})
                           p/default-panel {}))
          v (g/decide g/default-policy facts a)]
      (is (= "advisory-veto" (:reason v)))
      (is (true? (g/reportable? v))))))
