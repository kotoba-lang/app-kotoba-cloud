(ns app-kotoba-cloud.site-test
  (:require [app-kotoba-cloud.profile :as profile]
            [app-kotoba-cloud.site :as site]
            [clojure.string :as str]
            [clojure.test :refer [deftest is testing]]))

(deftest locale-catalogs-have-the-same-contract
  (let [catalogs (map site/copy site/supported-locales)
        keysets (map (comp set keys) catalogs)]
    (is (= (first keysets) (second keysets)))
    (is (= [:en :ja] site/supported-locales))
    (doseq [catalog catalogs]
      (is (= 3 (count (:planes catalog))))
      (is (= 4 (count (:steps catalog))))
      (is (= 3 (count (:library-steps catalog)))))))

(deftest japanese-page-matches-the-language-concept
  (let [html (site/page-html :ja)]
    (is (str/includes? html "<html lang=\"ja\""))
    (is (str/includes? html "AIは自由に書く。Kotobaは境界を引く。"))
    (is (str/includes? html "耐量子暗号は追加 mode ではなく"))
    (is (= 1 (count (re-seq #"<h1" html))))
    (doseq [needle ["auth.kotoba.cloud" "kotobase.net" "murakumo.cloud"
                    "itonami.cloud" "kotoba-lang.org" "Hosted apply"
                    (str "kotoba package add kotoba-lang/reference-math@0.1.0 --catalog-cid "
                         profile/reference-package-catalog-cid)
                    "kotoba library inspect" "耐量子署名は任意ではありません"]]
      (is (str/includes? html needle) needle))
    (is (str/includes? html "hreflang=\"en\""))
    (is (str/includes? html "href=\"/ja/\""))
    (is (str/includes? html "data-language-selector"))
    (is (str/includes? html "src=\"/js/language-selector.js\""))
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
                              "https%3A%2F%2Fkotoba.cloud%2F"
                              "https%3A%2F%2Fkotoba.cloud%2Fja%2F"))))
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
    (is (str/includes? html "Post-quantum cryptography is a prerequisite"))
    (is (str/includes? html "From AI-written code to admitted computation"))
    (is (str/includes? html "One release CID, executable from multiple providers"))
    (is (str/includes? html "Post-quantum signatures are mandatory"))
    (is (str/includes? html "https://kotoba.cloud/"))
    (is (str/includes? html "hreflang=\"ja\""))
    (is (str/includes? html "return_to=https%3A%2F%2Fkotoba.cloud%2F"))
    (is (= 1 (count (re-seq #"<h1" html))))
    (is (= 1 (count (re-seq #"<nav" html))))))

(deftest app-css-stays-on-the-shared-token-contract
  (testing "app styling contains no private palette, px font size, or font stack"
    (is (not (re-find #"#[0-9a-fA-F]{3,8}" site/app-css)))
    (is (not (re-find #"font-size:[^;}]*px" site/app-css)))
    (is (not (re-find #"font-family:(?!var\()" site/app-css)))))

(deftest localized-not-found-pages-are-finite-documents
  (doseq [[locale heading href] [[:ja "その入口はありません。" "href=\"/ja/\""]
                                 [:en "That entrance does not exist." "href=\"/\""]]]
    (let [html (site/not-found-html locale)]
      (is (str/includes? html "404 / NOT FOUND"))
      (is (str/includes? html heading))
      (is (str/includes? html href)))))

(def public-html-pages
  (for [locale site/supported-locales
        render [site/page-html site/legal-html site/tokushoho-html site/not-found-html]]
    (render locale)))

(deftest public-operator-is-kotoba-labs-inc
  (testing "operator and contact constants stay exact"
    (is (= "Kotoba Labs Inc" site/operator-name))
    (is (= "support@kotoba.cloud" site/public-contact-email))
    (is (= "請求があった場合、法令に従い遅滞なく開示します" site/legal-disclosure)))
  (testing "legal routes follow English-first apex paths"
    (is (= "/legal/" (get-in site/copy [:en :legal-path])))
    (is (= "/legal/tokushoho/" (get-in site/copy [:en :tokushoho-path])))
    (is (= "/ja/legal/" (get-in site/copy [:ja :legal-path])))
    (is (= "/ja/legal/tokushoho/" (get-in site/copy [:ja :tokushoho-path])))
    (is (str/includes? (site/legal-html :en) "https://kotoba.cloud/legal/"))
    (is (str/includes? (site/legal-html :ja) "https://kotoba.cloud/ja/legal/")))
  (testing "every public HTML document names the operator and the support inbox"
    (doseq [html public-html-pages]
      (is (str/includes? html "Kotoba Labs Inc"))
      (is (str/includes? html "support@kotoba.cloud"))
      (is (str/includes? html "mailto:support@kotoba.cloud"))))
  (testing "legal and tokushoho pages keep 法人情報 fields on-request"
    (doseq [html [(site/legal-html :ja) (site/legal-html :en)
                  (site/tokushoho-html :ja) (site/tokushoho-html :en)]]
      (is (str/includes? html "法人情報"))
      (is (str/includes? html "代表者"))
      (is (str/includes? html "所在地"))
      (is (str/includes? html "電話番号"))
      (is (<= 4 (count (re-seq #"請求があった場合、法令に従い遅滞なく開示します" html)))))))

(deftest public-copy-does-not-publish-forbidden-operator-or-contact
  (doseq [html public-html-pages
          needle ["Gftd Japan" "gftd.co.jp" "gftdcojp" "mailer.gftd.ai" "ai-gftd"
                  "河崎" "Kawasaki" "com-junkawasaki" "10704996"
                  "AWAI Network" "j@awai.network" "@agentmail.to" "@kotobalabs.com"
                  "hello@kotoba.cloud" "info@kotoba.cloud"]]
    (is (not (str/includes? html needle)) needle)))
