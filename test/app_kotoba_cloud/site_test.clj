(ns app-kotoba-cloud.site-test
  (:require [app-kotoba-cloud.site :as site]
            [clojure.string :as str]
            [clojure.test :refer [deftest is testing]]))

(deftest public-page-explains-the-real-boundaries
  (let [html (site/page-html)]
    (is (str/includes? html "<html lang=\"ja\""))
    (is (= 1 (count (re-seq #"<h1" html))))
    (doseq [needle ["auth.kotoba.cloud" "kotobase.net" "murakumo.cloud"
                    "itonami.cloud" "kotoba-lang.org" "Hosted apply"]]
      (is (str/includes? html needle) needle))
    (is (str/includes? html "dads-button"))
    (is (str/includes? html "dds-ext-card"))))

(deftest app-css-stays-on-the-shared-token-contract
  (testing "app styling contains no private palette, px font size, or font stack"
    (is (not (re-find #"#[0-9a-fA-F]{3,8}" site/app-css)))
    (is (not (re-find #"font-size:[^;}]*px" site/app-css)))
    (is (not (re-find #"font-family:(?!var\()" site/app-css)))))

(deftest not-found-is-a-real-document-not-an-spa-rewrite
  (let [html (site/not-found-html)]
    (is (str/includes? html "404 / NOT FOUND"))
    (is (str/includes? html "href=\"/\""))))
