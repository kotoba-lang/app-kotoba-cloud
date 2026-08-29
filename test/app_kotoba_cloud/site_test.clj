(ns app-kotoba-cloud.site-test
  (:require [app-kotoba-cloud.profile :as profile]
            [app-kotoba-cloud.site :as site]
            [clojure.string :as str]
            [clojure.test :refer [deftest is testing]]))

(deftest locale-catalogs-have-the-same-contract
  (let [catalogs (map site/copy site/supported-locales)
        keysets (map (comp set keys) catalogs)]
    (is (= (first keysets) (second keysets)))
    (is (= [:ja :en] site/supported-locales))
    (doseq [catalog catalogs]
      (is (= 3 (count (:planes catalog))))
      (is (= 4 (count (:steps catalog))))
      (is (= 3 (count (:library-steps catalog)))))))

(deftest japanese-page-matches-the-language-concept
  (let [html (site/page-html :ja)]
    (is (str/includes? html "<html lang=\"ja\""))
    (is (str/includes? html "AIは自由に書く。Kotobaは境界を引く。"))
    (is (= 1 (count (re-seq #"<h1" html))))
    (doseq [needle ["auth.kotoba.cloud" "kotobase.net" "murakumo.cloud"
                    "itonami.cloud" "kotoba-lang.org" "Hosted apply"
                    (str "kotoba package add kotoba-lang/reference-math@0.1.0 --catalog-cid "
                         profile/reference-package-catalog-cid)
                    "kotoba library inspect" "Principalに固定したML-DSA-65署名"]]
      (is (str/includes? html needle) needle))
    (is (str/includes? html "hreflang=\"en\""))
    (is (str/includes? html "href=\"/en/\""))
    (is (= 1 (count (re-seq #"<nav" html))))
    (is (str/includes? html "dads-button"))
    (is (str/includes? html "dds-ext-card"))
    (is (str/includes? html "id=\"identity\""))
    (is (str/includes? html "src=\"/js/session.js\""))))

(deftest signed-in-product-links-use-the-target-bound-controller-handoff
  (let [html (site/page-html :ja)]
    (is (str/includes? html "https://auth.kotoba.cloud/connect?target=kotobase"))
    (is (str/includes? html "https://auth.kotoba.cloud/connect?target=murakumo"))
    (is (str/includes? html "https://auth.kotoba.cloud/connect?target=itonami"))
    (is (str/includes? html "data-session-link=\"true\""))
    (is (str/includes? html "同じPrincipalで接続"))))

(deftest public-identity-and-passkey-ctas-use-auth-kotoba-cloud
  (testing "identity origin is a link; Passkey CTAs use the live /sign-in path"
    (doseq [locale site/supported-locales]
      (let [html (site/page-html locale)
            sign-in (site/passkey-href locale)
            href-of (fn [url] (str "href=\"" url "\""))]
        (is (= sign-in (str "https://auth.kotoba.cloud/sign-in?return_to="
                            (if (= locale :en)
                              "https%3A%2F%2Fkotoba.cloud%2Fen%2F"
                              "https%3A%2F%2Fkotoba.cloud%2F"))))
        (is (str/includes? html (href-of profile/identity-href)))
        (is (= 1 (count (re-seq #"href=\"https://auth\.kotoba\.cloud/\"" html))))
        (is (= 2 (count (re-seq (re-pattern
                                 (str "href=\""
                                      (java.util.regex.Pattern/quote sign-in)
                                      "\""))
                                html))))
        (is (not (str/includes? html "href=\"https://auth.kotobase.net")))
        (is (not (str/includes? html "href=\"https://auth.murakumo.cloud")))
        (is (str/includes? html (get-in site/copy [locale :live]))))))
  (testing "honest live copy does not invent a hosted apply SKU"
    (is (str/includes? (get-in site/copy [:ja :live]) "Hosted apply はまだ提供していません"))
    (is (str/includes? (get-in site/copy [:en :live]) "Hosted apply is not available yet"))))

(deftest english-page-is-complete-and-addressable
  (let [html (site/page-html :en)]
    (is (str/includes? html "<html lang=\"en\""))
    (is (str/includes? html "AI writes freely. Kotoba draws the boundary."))
    (is (str/includes? html "From AI-written code to admitted computation"))
    (is (str/includes? html "One release CID, executable from multiple providers"))
    (is (str/includes? html "ML-DSA-65 signature pinned to the Principal"))
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
