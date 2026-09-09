(ns app-kotoba-cloud.site
  "Localized public pages for kotoba.cloud. Pure CLJC views render finite
  Worker Static Assets for every supported locale."
  (:require [app-kotoba-cloud.profile :as profile]
            [app-kotoba-cloud.session :as session]
            [app-kotoba-cloud.site-copy :as site-copy]
            [jp-go-dds.behavior :as behavior]
            [jp-go-dds.core :as dds]
            [jp-go-dds.css :as dcss]
            [jp-go-dds.page :as page]
            [jp-go-dds.tokens :as tokens]
            #?(:clj [clojure.java.io :as io])))

(def supported-locales site-copy/supported-locales)
(def published-locales site-copy/published-locales)
(def draft-locales site-copy/draft-locales)
(def copy site-copy/copy)

(def operator-name "Kotoba Labs Inc")
(def public-contact-email "support@kotoba.cloud")
(def legal-disclosure "請求があった場合、法令に従い遅滞なく開示します")

(def reference-package-command
  (str "# reference package (install is not claimed verified)\n"
       "kotoba package add kotoba-lang/reference-math@0.1.0 --catalog-cid "
       profile/reference-package-catalog-cid
       "\nkotoba package run kotoba-lang/reference-math  # 42\n\n"
       "kotoba library inspect <name|CID|#hash> --store .kotoba/codebase --namespace demo\n\n"
       "# dry-run by default\n"
       "kotoba library publish --store .kotoba/codebase --namespace demo --hosted\n\n"
       "# replicate one exact release closure\n"
       "kotoba library publish --store .kotoba/codebase --namespace demo --hosted --dry-run false \\\n"
       "  --pqc-seed-file <ml-dsa-seed> \\\n"
       "  --provider east=https://east.example --provider-token-file <east-token> \\\n"
       "  --provider west=https://west.example --provider-token-file <west-token>\n\n"
       "# qualification and execution are release-CID addressed\n"
       "kotoba library verify ipfs://<release-cid> --store .kotoba/codebase \\\n"
       "  --provider east=https://east.example --provider west=https://west.example\n"
       "kotoba library run ipfs://<release-cid> --entry answer --store .kotoba/codebase \\\n"
       "  --provider east=https://east.example --provider west=https://west.example\n\n"
       "# rotate or revoke the Principal-pinned ML-DSA key; both finish with Passkey\n"
       "kotoba pq-key rotate --current-pqc-seed-file <current> \\\n"
       "  --next-pqc-seed-file <next> --expected-epoch 1\n"
       "kotoba pq-key revoke --current-pqc-seed-file <current> --expected-epoch 2"))

(def app-css
  (str
   ".kc-skip{position:absolute;inset-inline-start:var(--hig-spacing-4);top:-10rem;z-index:10;}"
   ".kc-skip:focus{top:var(--hig-spacing-4);}"
   ".kc-header{border-bottom:1px solid var(--hig-color-separator);background:var(--hig-color-system-background);}"
   ".kc-header__inner{min-height:4.5rem;display:flex;align-items:center;justify-content:space-between;gap:var(--hig-spacing-4);}"
   ".kc-wordmark{display:flex;align-items:center;gap:var(--hig-spacing-3);color:var(--hig-color-label);font-weight:700;text-decoration:none;letter-spacing:.04em;}"
   ".kc-mark{inline-size:2rem;block-size:2rem;display:grid;place-items:center;border:2px solid var(--hig-color-tint);border-radius:var(--hig-radius-xs);color:var(--hig-color-tint);font-weight:700;}"
   ".kc-nav{display:flex;align-items:center;gap:var(--hig-spacing-4);}"
   ".kc-nav>a{color:var(--hig-color-label);font-weight:700;text-underline-offset:.25em;}"
   ".kc-hero{padding-block:var(--hig-spacing-10);border-bottom:1px solid var(--hig-color-separator);}"
   ".kc-eyebrow{margin:0 0 var(--hig-spacing-4);font-family:var(--hig-font-mono);font-size:var(--hig-text-caption1-font-size);font-weight:700;letter-spacing:.12em;color:var(--hig-color-tint);}"
   ".kc-hero h1{max-width:17ch;text-wrap:balance;}"
   ".kc-lead{max-width:48rem;font-size:var(--hig-text-title3-font-size);line-height:var(--hig-text-title3-line-height);color:var(--hig-color-secondary-label);}"
   ".kc-actions{margin-top:var(--hig-spacing-7);}"
   ".kc-draft{margin:0 0 var(--hig-spacing-5);padding:var(--hig-spacing-4);border:1px solid var(--hig-color-separator);background:var(--hig-color-secondary-system-background);color:var(--hig-color-secondary-label);max-width:48rem;}"
   "html[dir=rtl]{direction:rtl;}"
   ".kc-facts{margin:var(--hig-spacing-5) 0 0;padding-inline-start:var(--hig-spacing-5);max-width:48rem;color:var(--hig-color-secondary-label);}"
   ".kc-facts li{margin-block-end:var(--hig-spacing-2);}"
   ".kc-live{margin-top:var(--hig-spacing-5);display:flex;align-items:center;gap:var(--hig-spacing-3);color:var(--hig-color-secondary-label);}"
   ".kc-live__dot{inline-size:.75rem;block-size:.75rem;flex:none;border-radius:var(--hig-radius-capsule);background:var(--hig-palette-green);}"
   ".kc-identity{padding-block:var(--hig-spacing-8);border-bottom:1px solid var(--hig-color-separator);background:var(--hig-color-secondary-system-background);}"
   ".kc-identity[hidden]{display:none;}"
   ".kc-identity__grid{display:grid;grid-template-columns:minmax(12rem,1fr) repeat(2,minmax(0,2fr));gap:var(--hig-spacing-5);align-items:start;}"
   ".kc-identity__label{margin:0 0 var(--hig-spacing-2);font-family:var(--hig-font-mono);font-size:var(--hig-text-caption1-font-size);font-weight:700;color:var(--hig-color-secondary-label);}"
   ".kc-identity__value{margin:0;font-family:var(--hig-font-mono);overflow-wrap:anywhere;}"
   ".kc-identity__username{font-size:var(--hig-text-title2-font-size);font-weight:700;color:var(--hig-color-tint);}"
   ".kc-architecture{background:var(--hig-color-secondary-system-background);}"
   ".kc-control{border-inline-start:.4rem solid var(--hig-color-tint);}"
   ".kc-control__origin{font-family:var(--hig-font-mono);color:var(--hig-color-tint);}"
   ".kc-control__origin a{color:inherit;font-weight:700;text-underline-offset:.25em;}"
   ".kc-flow{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--hig-spacing-5);margin-top:var(--hig-spacing-7);padding-top:var(--hig-spacing-7);border-top:1px solid var(--hig-color-separator);}"
   ".kc-plane{position:relative;}.kc-plane::before{content:'↓';position:absolute;inset-block-start:calc(-1 * var(--hig-spacing-9));inset-inline-start:50%;color:var(--hig-color-tint);font-weight:700;}"
   ".kc-plane__kind{font-family:var(--hig-font-mono);font-size:var(--hig-text-caption1-font-size);font-weight:700;letter-spacing:.08em;color:var(--hig-color-secondary-label);}"
   ".kc-plane h3{margin-block:var(--hig-spacing-2);}.kc-plane p{color:var(--hig-color-secondary-label);}.kc-plane a{font-family:var(--hig-font-mono);font-weight:700;}.kc-plane__connect{display:inline-block;margin-top:var(--hig-spacing-3);}.kc-plane__connect[hidden]{display:none;}"
   ".kc-steps{counter-reset:step}.kc-step{counter-increment:step}.kc-step::before{content:'0' counter(step);display:block;margin-bottom:var(--hig-spacing-3);font-family:var(--hig-font-mono);font-weight:700;color:var(--hig-color-tint);}"
   ".kc-command{margin:var(--hig-spacing-6) 0 0;padding:var(--hig-spacing-5);overflow:auto;border:1px solid var(--hig-color-separator);border-radius:var(--hig-radius-sm);background:var(--hig-color-label);color:var(--hig-color-system-background);font-family:var(--hig-font-mono);line-height:1.7;}"
   ".kc-publish-approval{margin-top:var(--hig-spacing-7);border-inline-start:.4rem solid var(--hig-color-tint);}.kc-publish-approval[hidden]{display:none}.kc-publish-fields{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:var(--hig-spacing-2) var(--hig-spacing-4);}.kc-publish-fields dt{font-weight:700}.kc-publish-fields dd{margin:0;font-family:var(--hig-font-mono);overflow-wrap:anywhere}"
   ".kc-boundary{border-inline-start:.4rem solid var(--hig-color-separator);}"
   ".kc-footer{padding-block:var(--hig-spacing-8);border-top:1px solid var(--hig-color-separator);color:var(--hig-color-secondary-label);}.kc-footer__inner{display:flex;justify-content:space-between;gap:var(--hig-spacing-5);flex-wrap:wrap;}"
   ".kc-footer__legal{margin-top:var(--hig-spacing-4);display:flex;flex-wrap:wrap;gap:var(--hig-spacing-2) var(--hig-spacing-4);align-items:baseline;}"
   ".kc-footer__legal a{color:inherit;font-weight:700;text-underline-offset:.25em;}"
   ".kc-legal{padding-block:var(--hig-spacing-8);}.kc-legal__lead{max-width:48rem;font-size:var(--hig-text-title3-font-size);line-height:var(--hig-text-title3-line-height);color:var(--hig-color-secondary-label);}"
   ".kc-legal .dads-table{margin-top:var(--hig-spacing-6);overflow-x:auto;}.kc-legal__note{margin-top:var(--hig-spacing-6);color:var(--hig-color-secondary-label);}"
   "@media(max-width:48rem){.kc-nav__secondary{display:none}.kc-hero{padding-block:var(--hig-spacing-8)}.kc-hero .dads-heading[data-size='64']{font-size:var(--hig-text-large-title-font-size);line-height:var(--hig-text-large-title-line-height)}.kc-hero .dds-ext-row{display:grid;grid-template-columns:1fr}.kc-actions{margin-top:var(--hig-spacing-4)}.kc-actions .dads-button{width:100%;justify-content:center}.kc-identity__grid{grid-template-columns:1fr}.kc-flow{grid-template-columns:1fr}.kc-plane::before{inset-inline-start:var(--hig-spacing-4)}.kc-footer__inner{display:block}}"
   "@media(max-width:30rem){.kc-wordmark__text{display:none}.kc-header__inner{gap:var(--hig-spacing-2)}.kc-nav{gap:var(--hig-spacing-2)}}"
   "@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}"))

(defn translation [locale]
  (or (get copy locale) (get copy :en)))

(defn passkey-href [locale]
  (session/passkey-href locale (get-in copy [locale :path] "/")))

(defn locale-href
  [locale suffix]
  (str (get-in copy [locale :path]) (or suffix "")))

(defn language-label-for
  [locale]
  (let [name (get-in copy [locale :language-name])]
    (if (get-in copy [locale :draft])
      (str name " (draft)")
      name)))

(defn language-links
  ([locale label]
   (language-links locale label ""))
  ([locale label suffix]
   (dds/language-selector
    {:id-prefix "kotoba-cloud-language"
     :size "md"
     :current locale
     :languages (mapv (fn [loc]
                        {:code loc
                         :label (language-label-for loc)
                         :href (locale-href loc suffix)})
                      supported-locales)
     :attrs {:aria-label label}})))

(defn operator-lead [locale]
  (or (get-in copy [locale :operator-lead])
      (str "The public operator of kotoba.cloud is " operator-name ".")))

(defn contact-mailto []
  [:a {:href (str "mailto:" public-contact-email)} public-contact-email])

(defn site-header
  ([locale t]
   (site-header locale t {}))
  ([locale t {:keys [page-suffix] :or {page-suffix ""}}]
   [:header {:class "kc-header"}
    (dds/container
     [:div {:class "kc-header__inner"}
      [:a {:class "kc-wordmark" :href (:path t) :aria-label (:home-label t)}
       [:span {:class "kc-mark" :aria-hidden "true"} "こ"]
       [:span {:class "kc-wordmark__text"} "KOTOBA CLOUD"]]
      [:nav {:class "kc-nav" :aria-label (:nav-label t)}
       [:a {:class "kc-nav__secondary" :href (str (:path t) "#architecture")} (:nav-architecture t)]
       [:a {:class "kc-nav__secondary" :href (str (:path t) "#libraries")} (:nav-libraries t)]
       (language-links locale (:language-label t) page-suffix)
       ;; The anonymous label. auth.kotoba.cloud's default way in is a Base
       ;; Account (smart-contract wallet) since 2026-09-07 (net-kotobase
       ;; ADR-2609071000); passkeys, wallets and recovery phrases remain.
       (dds/button (:nav-sign-in t) {:type :outline :size "sm" :id "kc-session-nav"
                                     :href (passkey-href locale)})]])]))

(defn site-footer [t]
  [:footer {:class "kc-footer"}
   (dds/container
    [:div {:class "kc-footer__inner"}
     [:span (:footer t)]
     [:a {:href "/agent-quickstart.md"} "AI agent quickstart"]
     [:a {:href "/llms.txt"} "LLM docs"]
     [:span (:footer-roles t)]]
    [:div {:class "kc-footer__legal"}
     [:span (:operator-label t) ": " operator-name]
     [:span (:contact-label t) ": " (contact-mailto)]
     [:a {:href (:legal-path t)} (:legal-link t)]
     [:a {:href (:tokushoho-path t)} (:tokushoho-link t)]])])

(defn legal-rows [t]
  [[(:operator-label t) operator-name]
   [(:service-provider-label t) operator-name]
   [(:entity-label t) legal-disclosure]
   [(:representative-label t) legal-disclosure]
   [(:address-label t) legal-disclosure]
   [(:phone-label t) legal-disclosure]
   [(:contact-label t) public-contact-email]])

(defn tokushoho-rows [t]
  (concat (legal-rows t)
          [[(:service-label t) (:tokushoho-service t)]
           [(:price-label t) (:tokushoho-price t)]
           [(:other-costs-label t) (:tokushoho-other-costs t)]
           [(:payment-label t) (:tokushoho-payment t)]
           [(:payment-timing-label t) (:tokushoho-payment-timing t)]
           [(:provision-label t) (:tokushoho-provision t)]
           [(:term-label t) (:tokushoho-term t)]
           [(:cancel-label t) (:tokushoho-cancel t)]
           [(:refund-label t) (:tokushoho-refund t)]]))

(defn disclosure-table [caption rows]
  (dds/table {:caption caption
              :headers nil
              :row-header? true
              :rows rows}))

(defn legal-view [locale]
  (let [t (translation locale)]
    [[:a {:class "kc-skip dads-button" :data-type "outline" :data-size "sm"
          :href "#main"} (:skip t)]
     (site-header locale t {:page-suffix "legal/"})
     [:main {:id "main" :class "kc-legal"}
      (dds/container
       (dds/section {:title (:legal-heading t)}
        [:p {:class "kc-legal__lead"} (operator-lead locale)]
        [:p (:legal-about t)]
        [:p (:contact-label t) ": " (contact-mailto)]
        (disclosure-table (:legal-heading t) (legal-rows t))
        [:p {:class "kc-legal__note"} (:tokushoho-note t)]
        (dds/row
         (dds/button (:tokushoho-link t) {:type :text :size "md"
                                          :href (:tokushoho-path t)}))))]
     (site-footer t)]))

(defn tokushoho-view [locale]
  (let [t (translation locale)]
    [[:a {:class "kc-skip dads-button" :data-type "outline" :data-size "sm"
          :href "#main"} (:skip t)]
     (site-header locale t {:page-suffix "legal/tokushoho/"})
     [:main {:id "main" :class "kc-legal"}
      (dds/container
       (dds/section {:title (:tokushoho-heading t)}
        [:p {:class "kc-legal__lead"} (operator-lead locale)]
        [:p (:tokushoho-updated t)]
        (disclosure-table (:tokushoho-heading t) (tokushoho-rows t))
        [:p {:class "kc-legal__note"} (:tokushoho-note t)]
        (dds/row
         (dds/button (:legal-link t) {:type :text :size "md"
                                      :href (:legal-path t)}))))]
     (site-footer t)]))

(defn plane-card [connect-label {:keys [kind name origin href body connect-href]}]
  (dds/card
   [:article {:class "kc-plane"}
    [:div {:class "kc-plane__kind"} kind]
    (dds/heading 3 name {:size "24"})
    [:p body]
    [:a {:href href} origin " ↗"]
    (when connect-href
      [:div
       [:a {:href connect-href :class "kc-plane__connect"
            :data-session-link "true" :hidden true}
        connect-label " →"]])]))

(defn view [locale]
  (let [t (translation locale)]
    [[:a {:class "kc-skip dads-button" :data-type "outline" :data-size "sm"
          :href "#main"} (:skip t)]
     (site-header locale t)
     [:main {:id "main"}
      [:section {:class "kc-hero"}
       (dds/container
        (when (seq (:review-banner t))
          [:p {:class "kc-draft" :role "status"} (:review-banner t)])
        [:p {:class "kc-eyebrow"} (:hero-eyebrow t)]
        (dds/heading 1 (:headline t) {:size "64"})
        (into [:p {:class "kc-lead"}] (interpose " " (:lead t)))
        [:p {:class "kc-lead"} (:philosophy t)]
        (dds/row
         [:div {:class "kc-actions"}
          (dds/button (:passkey-cta t) {:type :solid-fill :size "lg"
                                        :id "kc-session-action"
                                        :href (passkey-href locale)
                                        :attrs {:data-signed-in-label
                                                (:signed-in-action t)}})]
         [:div {:class "kc-actions"}
          (dds/button (:cli-cta t) {:type :outline :size "lg"
                                    :href "https://kotoba-lang.org/#start"})])
        [:p [:a {:href "/agent-quickstart.md"} "AI agent quickstart"]]
        [:div {:class "kc-live"}
         [:span {:class "kc-live__dot" :aria-hidden "true"}]
         [:span {:id "kc-session-status"
                 :data-signed-in-status (:signed-in-status t)}
          (:live t)]]
        [:ul {:class "kc-facts"}
         [:li (:passkey-fact t)]
         [:li (:authority-fact t)]
         [:li (:package-fact t)]
         [:li (:rail-fact t)]])]
      [:section {:class "kc-identity" :id "identity" :hidden true
                 :aria-label (:identity-label t)}
       (dds/container
        [:div {:class "kc-identity__grid"}
         [:div
          [:p {:class "kc-identity__label"} "PASSKEY USERNAME"]
          [:p {:class "kc-identity__value kc-identity__username"
               :id "kc-session-username"} "@kotoba-…"]]
         [:div
          [:p {:class "kc-identity__label"} "STABLE PRINCIPAL"]
          [:p {:class "kc-identity__value" :id "kc-session-principal"} "—"]]
         [:div
          [:p {:class "kc-identity__label"} "ACTIVE CONTROLLER"]
          [:p {:class "kc-identity__value" :id "kc-session-controller"} "—"]]])]
      [:section {:class "kc-architecture" :id "architecture"}
       (dds/container
        (dds/section {:title (:architecture-title t)}
         [:p {:class "dds-ext-lead"} (:architecture-lead t)]
         (dds/card
          [:article {:class "kc-control"}
           [:div {:class "kc-plane__kind"} (:control-kind t)]
           (dds/heading 3 (:control-title t) {:size "24"})
           [:p (:control-body t)]
         [:div {:class "kc-control__origin"}
          [:a {:href profile/identity-href} "auth.kotoba.cloud"]
          "  ·  api.kotoba.cloud"]])
         (into [:div {:class "kc-flow"}]
               (map #(plane-card (:connect-label t) %) (:planes t)))))]
      (dds/container
       (dds/section {:title (:library-title t) :id "libraries"}
        [:p {:class "dds-ext-lead"} (:library-lead t)]
        (into
         [:div {:class "dds-ext-grid kc-steps" :style {:--dds-ext-grid-min "15rem"}}]
         (map (fn [[title body]]
                (dds/card [:article {:class "kc-step"}
                           (dds/heading 3 title {:size "20"})
                           [:p body]]))
              (:library-steps t)))
        [:pre {:class "kc-command"}
         [:code reference-package-command]]
        [:p {:class "kc-live"}
         [:span {:class "kc-live__dot" :aria-hidden "true"}]
         [:span (:library-status t)]]
        (dds/button (:library-catalog-cta t)
                    {:type :outline :size "lg"
                     :href "https://kotoba-lang.org/libraries/"})
        (dds/card
         [:article {:id "library-publish-approval" :hidden true
                    :class "kc-publish-approval"}
          (dds/heading 3 (:approval-title t) {:size "24"})
          [:p (:approval-lead t)]
          [:dl {:class "kc-publish-fields"}
           [:dt "Namespace"] [:dd {:id "library-publish-namespace"} "—"]
           [:dt "Release CID"] [:dd {:id "library-publish-release"} "—"]
           [:dt "Head record CID"] [:dd {:id "library-publish-record"} "—"]
           [:dt "IPNS name"] [:dd {:id "library-publish-name"} "—"]]
          (dds/button (:approval-button t)
                      {:type :primary :size "lg" :id "library-publish-submit"})
          [:p {:id "library-publish-result" :role "status" :aria-live "polite"}]])
        (dds/card
         [:article {:id "pq-key-transition-approval" :hidden true
                    :class "kc-publish-approval"}
          (dds/heading 3 (:key-approval-title t) {:size "24"})
          [:p (:key-approval-lead t)]
          [:dl {:class "kc-publish-fields"}
           [:dt "Action"] [:dd {:id "pq-key-transition-action"} "—"]
           [:dt "Expected epoch"] [:dd {:id "pq-key-transition-epoch"} "—"]
           [:dt "Current key"] [:dd {:id "pq-key-transition-current"} "—"]
           [:dt "Next key"] [:dd {:id "pq-key-transition-next"} "—"]]
          (dds/button (:key-approval-button t)
                      {:type :primary :size "lg" :id "pq-key-transition-submit"})
          [:p {:id "pq-key-transition-result" :role "status" :aria-live "polite"}]])))
      (dds/container
       (dds/section {:title (:deploy-title t) :id "deploy"}
        (into
         [:div {:class "dds-ext-grid kc-steps" :style {:--dds-ext-grid-min "13rem"}}]
         (map (fn [[title body]]
                (dds/card [:article {:class "kc-step"}
                           (dds/heading 3 title {:size "20"})
                           [:p body]]))
              (:steps t)))
        [:pre {:class "kc-command"} [:code "kotoba deploy --manifest app.edn --target murakumo:asher\n# plan is dry-run by default; apply remains explicit"]])
       (dds/section {:title (:boundary-title t) :id "trust"}
        (dds/card
         [:article {:class "kc-boundary"}
          (dds/heading 3 (:boundary-heading t) {:size "24"})
          [:p (:boundary-p1 t)]
          [:p (:boundary-p2 t)]
          (dds/row
           (dds/button (:profile-link t) {:type :text :size "md"
                                          :href "/.well-known/kotoba-cloud.json"})
           (dds/button (:spec-link t) {:type :text :size "md"
                                       :href "https://kotoba-lang.org"}))])))]
     (site-footer t)]))

#?(:clj
   (defn document-css []
     (str (slurp (io/resource "jp_go_dds/dds.css"))
          "\n" (dcss/css-for [:language-selector :menu-list-box :menu-list]))))

#?(:clj
   (defn document-head
     [locale path-key title description]
     (let [t (translation locale)
           path (path-key t)
           en-href (str "https://kotoba.cloud" (get-in copy [:en path-key]))
           langs (mapv #(get-in copy [% :html-lang]) published-locales)
           json-ld (str "{\"@context\":\"https://schema.org\",\"@type\":\"WebSite\",\"@id\":\"https://kotoba.cloud/#website\",\"url\":\"https://kotoba.cloud/\",\"name\":\"Kotoba Cloud\",\"publisher\":{\"@type\":\"Organization\",\"name\":\"Kotoba Labs Inc.\"},\"inLanguage\":["
                        (apply str (interpose "," (map #(str "\"" % "\"") langs)))
                        "]}")]
       (into
        [[:link {:rel "canonical" :href (str "https://kotoba.cloud" path)}]
         [:script {:src "/js/language-selector.js" :defer true}]
         [:script {:src "/js/session.js" :defer true}]]
        (concat
         (when (:draft t)
           [[:meta {:name "robots" :content "noindex, nofollow"}]])
         (map (fn [loc]
                [:link {:rel "alternate"
                        :hreflang (get-in copy [loc :hreflang])
                        :href (str "https://kotoba.cloud" (get-in copy [loc path-key]))}])
              published-locales)
         [[:link {:rel "alternate" :hreflang "x-default" :href en-href}]
          [:link {:rel "alternate" :type "text/markdown" :href "https://kotoba.cloud/agent-quickstart.md" :title "AI agent quickstart"}]
          [:meta {:property "og:site_name" :content "Kotoba Cloud"}]
          [:meta {:property "og:image" :content "https://kotoba.cloud/og.png"}]
          [:meta {:property "og:image:width" :content "1731"}]
          [:meta {:property "og:image:height" :content "909"}]
          [:meta {:property "og:image:alt" :content "Kotoba Cloud - controlled execution for AI-generated software"}]
          [:meta {:name "twitter:card" :content "summary_large_image"}]
          [:meta {:name "twitter:title" :content title}]
          [:meta {:name "twitter:description" :content description}]
          [:meta {:name "twitter:image" :content "https://kotoba.cloud/og.png"}]
          [:script {:type "application/ld+json"} json-ld]
          [:meta {:property "og:type" :content "website"}]
          [:meta {:property "og:title" :content title}]
          [:meta {:property "og:description" :content description}]
          [:meta {:property "og:locale" :content (:og-locale t)}]
          [:meta {:property "og:url" :content (str "https://kotoba.cloud" path)}]])))))

#?(:clj
   (defn apply-document-attrs
     [locale html]
     (let [t (translation locale)
           lang (:html-lang t)
           open (str "<html lang=\"" lang "\">")]
       (if (= "rtl" (:dir t))
         (.replace html open (str "<html lang=\"" lang "\" dir=\"rtl\">"))
         html))))

#?(:clj
   (defn page-html
     ([] (page-html :en))
     ([locale]
      (let [t (translation locale)]
        (apply-document-attrs
         locale
         (apply page/->page
                {:title (:title t)
                 :description (:description t)
                 :lang (:html-lang t)
                 :css (document-css)
                 :app-css (str tokens/skin-css app-css)
                 :head (document-head locale :path (:title t) (:description t))}
                (view locale)))))))

#?(:clj
   (defn legal-html
     ([] (legal-html :en))
     ([locale]
      (let [t (translation locale)]
        (apply-document-attrs
         locale
         (apply page/->page
                {:title (:legal-title t)
                 :description (operator-lead locale)
                 :lang (:html-lang t)
                 :css (document-css)
                 :app-css (str tokens/skin-css app-css)
                 :head (document-head locale :legal-path (:legal-title t)
                                      (operator-lead locale))}
                (legal-view locale)))))))

#?(:clj
   (defn tokushoho-html
     ([] (tokushoho-html :en))
     ([locale]
      (let [t (translation locale)]
        (apply-document-attrs
         locale
         (apply page/->page
                {:title (:tokushoho-title t)
                 :description (operator-lead locale)
                 :lang (:html-lang t)
                 :css (document-css)
                 :app-css (str tokens/skin-css app-css)
                 :head (document-head locale :tokushoho-path
                                      (:tokushoho-title t)
                                      (operator-lead locale))}
                (tokushoho-view locale)))))))

#?(:clj
   (defn not-found-html
     ([] (not-found-html :en))
     ([locale]
      (let [t (translation locale)
            dds-css (slurp (io/resource "jp_go_dds/dds.css"))]
        (apply-document-attrs
         locale
         (page/->page
          {:title (:not-found-title t) :description (:not-found-lead t)
           :lang (:html-lang t) :css dds-css :app-css (str tokens/skin-css app-css)}
          (dds/container
           [:main {:id "main"}
            [:section {:class "kc-hero"}
             [:p {:class "kc-eyebrow"} "404 / NOT FOUND"]
             (dds/heading 1 (:not-found-heading t) {:size "45"})
             [:p {:class "kc-lead"} (:not-found-lead t)]
             (dds/button (:not-found-cta t) {:href (:path t) :size "lg"})]])
          (site-footer t)))))))

#?(:clj
   (defn- locale-output-dir
     [root locale]
     (let [path (get-in copy [locale :path])]
       (if (= path "/")
         root
         (io/file root (subs path 1 (dec (count path))))))))

#?(:clj
   (defn- write-locale-tree
     [dir locale]
     (let [legal (io/file dir "legal")
           tokushoho (io/file legal "tokushoho")]
       (.mkdirs tokushoho)
       (spit (io/file dir "index.html") (page-html locale))
       (spit (io/file dir "404.html") (not-found-html locale))
       (spit (io/file legal "index.html") (legal-html locale))
       (spit (io/file tokushoho "index.html") (tokushoho-html locale)))))

#?(:clj
   (defn -main [& _]
     (let [root (io/file "public")
           js-dir (io/file root "js")
           ipfs-source (io/file "assets" "ipfs")
           ipfs-target (io/file root "ipfs")
           registry-source (io/file "assets" "kotoba-package-registry.edn")
           registry-target (io/file root ".well-known" "kotoba-package-registry.edn")]
       (.mkdirs root)
       (.mkdirs js-dir)
       (doseq [name ["llms.txt" "llms-full.txt" "agent-quickstart.md" "robots.txt" "sitemap.xml" "og.png"]]
         (io/copy (io/file "assets" name) (io/file root name)))
       (doseq [locale supported-locales]
         (write-locale-tree (locale-output-dir root locale) locale))
       ;; Keep the old English URL addressable while canonical English stays
       ;; at the apex. Existing links should not become a language regression.
       (write-locale-tree (io/file root "en") :en)
       (spit (io/file js-dir "language-selector.js") behavior/language-selector-script)
       (doseq [source (file-seq ipfs-source) :when (.isFile ^java.io.File source)]
         (let [target (io/file ipfs-target (.getName ^java.io.File source))]
           (.mkdirs (.getParentFile target))
           (io/copy source target)))
       (.mkdirs (.getParentFile registry-target))
       (io/copy registry-source registry-target)
       ;; kotoba.cloud's did:webvh root and its did:web alias
       ;; (net-kotobase/control-plane ADR-2609021500): did.jsonl,
       ;; did-witness.json and did.json are minted offline by
       ;; authn/scripts/webvh_root.clj and committed under assets/well-known;
       ;; they ship verbatim. `_headers` gives the log its JSON Lines content
       ;; type and lets any resolver fetch it cross-origin.
       (doseq [source (file-seq (io/file "assets" "well-known")) :when (.isFile ^java.io.File source)]
         (let [target (io/file root ".well-known" (.getName ^java.io.File source))]
           (.mkdirs (.getParentFile target))
           (io/copy source target)
           ;; `<did>/whois` transforms to `/.well-known/whois` (no extension)
           ;; while the #whois service names `whois.vp`; a static host has no
           ;; rewrite, so the same file is published under both names.
           (when (= "whois.vp" (.getName ^java.io.File source))
             (io/copy source (io/file root ".well-known" "whois")))))
       (let [headers (io/file "assets" "_headers")]
         (when (.isFile headers)
           (io/copy headers (io/file root "_headers"))))
       (println "rendered English-first root, localized pages, legal/tokushoho documents, and localized 404s"))))
