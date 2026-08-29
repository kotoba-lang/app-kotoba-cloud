(ns app-kotoba-cloud.pq-key-lifecycle-test
  (:require [app-kotoba-cloud.pq-key-lifecycle :as lifecycle]
            [clojure.test :refer [deftest is testing]]))

(defn- rejected [f]
  (try (f) nil (catch #?(:clj Exception :cljs :default) error
                 (:reason (ex-data error)))))

(deftest publication-admission-enrolls-once-and-rejects-replay
  (let [command {:key-id "sha256:key-a" :public-key "public-a" :key-epoch 1
                 :request-id "request-1" :expires-at 2000 :now 1000
                 :at "2026-08-29T00:00:00Z"}
        enrolled (lifecycle/admit-publication nil command)
        state (:state enrolled)]
    (is (= :enrolled (:binding enrolled)))
    (is (= 1 (:epoch enrolled)))
    (is (= :pqc-request-replayed
           (rejected #(lifecycle/admit-publication state command))))
    (is (= :matched
           (:binding (lifecycle/admit-publication
                      state (assoc command :request-id "request-2")))))))

(deftest key-epochs-rotate-monotonically-and-revocation-fails-closed
  (let [enrolled (:state (lifecycle/admit-publication
                          nil {:key-id "key-a" :public-key "public-a" :key-epoch 1
                               :request-id "request-1" :expires-at 2000 :now 1000
                               :at "enrolled"}))
        rotated (lifecycle/rotate
                 enrolled {:current-key-id "key-a" :next-key-id "key-b"
                           :next-public-key "public-b" :expected-epoch 1
                           :transition-id "rotate-1" :at "rotated"})
        revoked (lifecycle/revoke
                 (:state rotated) {:current-key-id "key-b" :expected-epoch 2
                                   :transition-id "revoke-1" :at "revoked"})]
    (is (= 2 (:epoch rotated)))
    (is (= :rotated (:binding rotated)))
    (is (= :revoked (:status revoked)))
    (testing "old epochs, replayed transitions, and revoked publication fail"
      (is (= :pqc-key-epoch-mismatch
             (rejected #(lifecycle/revoke
                         (:state rotated) {:current-key-id "key-b" :expected-epoch 1
                                           :transition-id "bad" :at "later"}))))
      (is (= :pqc-transition-replayed
             (rejected #(lifecycle/rotate
                         (:state rotated) {:current-key-id "key-b"
                                           :next-key-id "key-c"
                                           :next-public-key "public-c"
                                           :expected-epoch 2
                                           :transition-id "rotate-1" :at "later"}))))
      (is (= :pqc-key-revoked
             (rejected #(lifecycle/admit-publication
                         (:state revoked)
                         {:key-id "key-b" :public-key "public-b" :key-epoch 2
                          :request-id "request-2" :expires-at 3000 :now 2000
                          :at "later"})))))))

(deftest legacy-binding-is-imported-without-permitting-replacement
  (let [legacy {:keyId "key-a" :publicKey "public-a"}
        state (lifecycle/normalize legacy)]
    (is (= 1 (:epoch state)))
    (is (= :active (:status state)))
    (is (= :pqc-key-mismatch
           (rejected #(lifecycle/admit-publication
                       state {:key-id "key-b" :public-key "public-b" :key-epoch 1
                              :request-id "request-1" :expires-at 2000 :now 1000
                              :at "later"}))))))

(deftest replay-window-capacity-fails-closed-without-forgetting-live-ids
  (let [base {:key-id "key-a" :public-key "public-a" :key-epoch 1
              :expires-at 5000 :now 1000 :at "publication"}
        full (reduce (fn [state index]
                       (:state (lifecycle/admit-publication
                                state (assoc base :request-id (str "request-" index)))))
                     nil
                     (range lifecycle/max-used-requests))]
    (is (= lifecycle/max-used-requests (count (:used-requests full))))
    (is (= :pqc-replay-window-capacity
           (rejected #(lifecycle/admit-publication
                       full (assoc base :request-id "overflow")))))
    (is (= :pqc-request-replayed
           (rejected #(lifecycle/admit-publication
                       full (assoc base :request-id "request-0")))))
    (testing "expired IDs are pruned before capacity is evaluated"
      (is (= :matched
             (:binding (lifecycle/admit-publication
                        full (assoc base :request-id "after-expiry"
                                    :now 6000 :expires-at 7000))))))))
