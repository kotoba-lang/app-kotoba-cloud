(ns app-kotoba-cloud.site-test
  (:require [app-kotoba-cloud.site :as site]
            [clojure.string :as str]
            [clojure.test :refer [deftest is testing]]))

(deftest locale-catalogs-have-the-same-contract
  (let [catalogs (map site/copy site/supported-locales)
        keysets (map (comp set keys) catalogs)]
    (is (= (first keysets) (second keysets)))
    (is (= [:ja :en] site/supported-locales))
    (doseq [catalog catalogs]
      (is (= 3 (count (:planes catalog))))
      (is (= 4 (count (:steps catalog)))))))

(deftest japanese-page-matches-the-language-concept
  (let [html (site/page-html :ja)]
    (is (str/includes? html "<html lang=\"ja\""))
    (is (str/includes? html "AIは自由に書く。Kotobaは境界を引く。"))
    (is (= 1 (count (re-seq #"<h1" html))))
    (doseq [needle ["auth.kotoba.cloud" "kotobase.net" "murakumo.cloud"
                    "itonami.cloud" "kotoba-lang.org" "Hosted apply"]]
      (is (str/includes? html needle) needle))
    (is (str/includes? html "hreflang=\"en\""))
    (is (str/includes? html "href=\"/en/\""))
    (is (= 1 (count (re-seq #"<nav" html))))
    (is (str/includes? html "dads-button"))
    (is (str/includes? html "dds-ext-card"))))

(deftest english-page-is-complete-and-addressable
  (let [html (site/page-html :en)]
    (is (str/includes? html "<html lang=\"en\""))
    (is (str/includes? html "AI writes freely. Kotoba draws the boundary."))
    (is (str/includes? html "From AI-written code to admitted computation"))
    (is (str/includes? html "https://kotoba.cloud/en/"))
    (is (str/includes? html "hreflang=\"ja\""))
    (is (str/includes? html "return_to=https%3A%2F%2Fkotoba.cloud%2Fen%2F"))
    (is (= 1 (count (re-seq #"<h1" html))))
    (is (= 1 (count (re-seq #"<nav" html))))))

(deftest app-css-stays-on-the-shared-token-contract
  (testing "app styling contains no private palette, px font size, or font stack"
    (is (not (re-find #"#[0-9a-fA-F]{3,8}" site/app-css)))
    (is (not (re-find #"font-size:[^;}]*px" site/app-css)))
    (is (not (re-find #"font-family:(?!var\()" site/app-css)))))

(deftest localized-not-found-pages-are-finite-documents
  (doseq [[locale heading href] [[:ja "その入口はありません。" "href=\"/\""]
                                 [:en "That entrance does not exist." "href=\"/en/\""]]]
    (let [html (site/not-found-html locale)]
      (is (str/includes? html "404 / NOT FOUND"))
      (is (str/includes? html heading))
      (is (str/includes? html href)))))
