(ns app-kotoba-cloud.delegation-root-test
  (:require [app-kotoba-cloud.delegation-root :as root]
            [clojure.test :refer [deftest is testing]]))

;; A stand-in HKDF: not crypto, but deterministic and info-sensitive, which is
;; what these tests are about. The real one is injected by the caller.
(defn- fake-hkdf [ikm salt info length]
  ;; Every input must reach every output byte, or the double is weaker than the
  ;; thing it stands in for and a test can pass for the wrong reason. The first
  ;; version concatenated the three and cycled, so a 32-byte seed never reached
  ;; the salt and `a different salt gives a different seed` failed against
  ;; correct code.
  (let [i (vec ikm) s (vec salt) f (mapv int (str info))
        at (fn [v n] (if (seq v) (nth v (mod n (count v))) 0))]
    (mapv (fn [n] (mod (+ (* 31 (at f n)) (* 7 (at i n)) (* 3 (at s n)) n) 256))
          (range length))))

(def ^:private prf (vec (repeat 32 7)))
(def ^:private salt (vec (repeat 16 3)))

(deftest derivation-is-reproducible
  (testing "the same passkey and salt give the same seed, which is what lets the key not be stored"
    (let [a (root/derive-seed fake-hkdf {:subject :delegation-root :prf-output prf :salt salt})
          b (root/derive-seed fake-hkdf {:subject :delegation-root :prf-output prf :salt salt})]
      (is (= (:seed a) (:seed b)))
      (is (= root/seed-length (count (:seed a))))))
  (testing "a different salt gives a different seed, so the published key stops matching"
    (is (not= (:seed (root/derive-seed fake-hkdf {:subject :delegation-root
                                                  :prf-output prf :salt salt}))
              (:seed (root/derive-seed fake-hkdf {:subject :delegation-root
                                                  :prf-output prf :salt (vec (repeat 16 4))}))))))

(deftest subjects-do-not-share-a-key
  (testing "one PRF secret, separated only by the info string"
    (is (not= (:seed (root/derive-seed fake-hkdf {:subject :delegation-root
                                                  :prf-output prf :salt salt}))
              (:seed (root/derive-seed fake-hkdf {:subject :log-signer
                                                  :prf-output prf :salt salt})))))
  (testing "and an unknown subject derives nothing rather than falling back"
    (let [r (root/derive-seed fake-hkdf {:subject :not-registered
                                         :prf-output prf :salt salt})]
      (is (= :unknown-subject (:refused r)))
      (is (nil? (:seed r)))))
  (testing "which is the whole reason info-for has no default"
    (is (nil? (root/info-for :not-registered)))
    (is (some? (root/info-for :delegation-root)))))

(deftest weak-or-absent-inputs-are-refused-by-name
  (testing "a short PRF output did not come from a PRF evaluation"
    (let [r (root/derive-seed fake-hkdf {:subject :delegation-root
                                         :prf-output (vec (repeat 8 7)) :salt salt})]
      (is (= :prf-output-too-short (:refused r)))
      (is (= 32 (get-in r [:detail :required])))))
  (testing "absent inputs are distinguishable from each other, not one generic failure"
    (is (= :no-prf-output (:refused (root/derive-seed fake-hkdf {:subject :delegation-root
                                                                 :prf-output [] :salt salt}))))
    (is (= :no-salt (:refused (root/derive-seed fake-hkdf {:subject :delegation-root
                                                           :prf-output prf :salt nil})))))
  (testing "and a refusal never carries a seed"
    (doseq [bad [{:subject :nope :prf-output prf :salt salt}
                 {:subject :delegation-root :prf-output [] :salt salt}
                 {:subject :delegation-root :prf-output prf :salt nil}]]
      (is (nil? (:seed (root/derive-seed fake-hkdf bad)))))))

(deftest the-persisted-envelope-cannot-carry-the-key
  (let [e (root/envelope {:subject :delegation-root :salt salt
                          :public-key "pk" :created-at "2026-09-06T00:00:00Z"})]
    (testing "it holds the public half and the salt, both of which are not secrets"
      (is (= "pk" (:publicKey e)))
      (is (= salt (:salt e)))
      (is (= "kotoba.cloud/delegation-root/v1" (:info e))))
    (testing "and nothing shaped like a private key"
      (is (false? (root/stored-secret? e)))
      (is (= "derived-from-passkey-prf-not-stored" (:custody e)))))
  (testing "the guard itself discriminates, or it is not a guard"
    (is (true? (root/stored-secret? {:seed [1 2 3]})))
    (is (true? (root/stored-secret? {:privateKey "x"})))
    (is (true? (root/stored-secret? {:secret "x"})))))
