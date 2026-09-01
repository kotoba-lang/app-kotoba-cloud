(ns app-kotoba-cloud.boot-test
  (:require [app-kotoba-cloud.boot :as boot]
            [clojure.test :refer [deftest is testing]]))

(deftest candidate-catalog-is-explicit-and-content-addressed
  (is (boot/valid-catalog? boot/catalog))
  (is (= "candidate" (:status boot/catalog)))
  (is (= "https://boot.kotoba.cloud/aiueos/x86_64/gmktec-k16/bootstrap/v1.efi"
         (get-in boot/catalog [:bootstrap :url])))
  (is (= boot/manifest-cid (get-in boot/catalog [:update :manifestCid])))
  (is (= "not-advertised"
         (get-in boot/catalog [:distribution :providerAdvertisement])))
  (is (= 3 (count (get-in boot/catalog [:update :artifacts])))))

(deftest qualification-does-not-promote-unmeasured-hardware
  (testing "publication and emulation never become physical K16 evidence"
    (is (= "unverified" (get-in boot/catalog [:qualification :physicalK16])))
    (is (= "not-enrolled" (get-in boot/catalog [:qualification :secureBoot])))
    (is (= "not-yet-implemented"
           (get-in boot/catalog [:qualification :nativeNvmeOsSlotWriter])))
    (is (false? (get-in boot/catalog [:qualification :internalDiskWrites])))))
