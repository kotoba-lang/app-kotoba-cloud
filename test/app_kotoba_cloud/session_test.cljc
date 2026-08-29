(ns app-kotoba-cloud.session-test
  (:require [app-kotoba-cloud.session :as session]
            [clojure.test :refer [deftest is testing]]))

(def principal "urn:kotoba:principal:018f4d6c-29bf-7f80-9a21-111111111111")
(def account "did:web:kotoba.cloud:tenant:u_01")
(def active "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK")

(deftest exact-cookie-forwarding-input
  (is (= "abc==" (session/cookie-value
                   "other=1; gftd_session=abc==; another=2" session/cookie-name)))
  (is (nil? (session/cookie-value "evil_gftd_session=x" session/cookie-name)))
  (is (nil? (session/cookie-value "gftd_session=" session/cookie-name))))

(deftest viewer-projection-is-credential-free-and-has-a-username
  (is (= {:valid true :username "kotoba-4x7m2p9k3q8v1c"
          :principalId principal :accountDid account :activeDid active}
         (session/viewer-model
          {:valid true :handle "kotoba-4x7m2p9k3q8v1c"
           :principalId principal :accountDid account :activeDid active})))
  (testing "legacy DID handles become a non-PII display alias"
    (is (= "kotoba-21111111111111"
           (:username (session/viewer-model
                       {:valid true :handle active :principalId principal
                        :accountDid account :activeDid active})))))
  (testing "partial or malformed identity data fails closed"
    (is (= {:valid false} (session/viewer-model {:valid false})))
    (is (= {:valid false}
           (session/viewer-model {:valid true :principalId principal
                                  :accountDid account :activeDid "wallet"})))))
