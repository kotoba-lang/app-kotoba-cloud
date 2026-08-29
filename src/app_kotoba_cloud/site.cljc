(ns app-kotoba-cloud.site
  "Localized public pages for kotoba.cloud. Pure CLJC views render finite
  Worker Static Assets for every supported locale."
  (:require [jp-go-dds.core :as dds]
            [jp-go-dds.page :as page]
            [jp-go-dds.tokens :as tokens]
            #?(:clj [clojure.java.io :as io])))

(def supported-locales [:ja :en])

(def copy
  {:ja
   {:html-lang "ja" :og-locale "ja_JP" :path "/"
    :title "Kotoba Cloud — AIは自由に書く。Kotobaは境界を引く。"
    :description "AIが書いたコードを、effect・capability・identityを検査した許可済みの計算へ。Kotoba Cloudは分離されたstorage、compute、agent workへ接続します。"
    :skip "本文へ移動" :home-label "Kotoba Cloud ホーム"
    :nav-architecture "構成" :nav-label "主要ナビゲーション"
    :language-label "表示言語" :hero-eyebrow "SECURITY-FIRST COMPUTING"
    :headline "AIは自由に書く。Kotobaは境界を引く。"
    :lead ["Kotoba は、AI が書いたコードから effect と capability を検査し、境界を満たす artifact だけを生成します。"
           "Kotoba Cloud は、その境界を崩さず identity、storage、compute、agent work へ接続します。"]
    :passkey-cta "Passkey で始める" :cli-cta "Kotoba CLI を見る"
    :live "Discovery と Passkey RP は稼働中。Hosted apply はまだ提供していません。"
    :architecture-title "境界を保ったまま、三つの実行面へ。"
    :architecture-lead "一つの巨大な trust domain にまとめず、それぞれの authority を分けたまま接続します。"
    :control-kind "CONTROL + IDENTITY" :control-title "Kotoba Cloud"
    :control-body "Passkey で Stable Principal を確認し、CLI deploy が参照する topology と authority floor を公開します。"
    :planes [{:kind "STORAGE" :name "Kotobase" :origin "kotobase.net"
              :href "https://kotobase.net"
              :body "Content-addressed な artifact、状態、実行 receipt を保持する。"}
             {:kind "COMPUTE" :name "Murakumo" :origin "murakumo.cloud"
              :href "https://murakumo.cloud"
              :body "Admit 済みの workload を CPU/GPU へ配置し、実行する。"}
             {:kind "AGENT WORK" :name "Itonami" :origin "itonami.cloud"
              :href "https://itonami.cloud"
              :body "Agent の workspace、goal、tool、approval と継続作業を扱う。"}]
    :deploy-title "AIのコードが、許可済みの計算になるまで"
    :steps [["Write" "AIと人間は、読みやすいデータとしてコードを自由に書く。"]
            ["Admit" "Kotobaがtype、effect、capability、resource、targetを検査する。"]
            ["Bind" "Passkey identityと対象限定grantを、host/providerが具体的なscopeへ結びつける。"]
            ["Run" "Kotobaseがartifactとreceiptを保持し、MurakumoとItonamiが許可された処理を担う。"]]
    :boundary-title "境界があるから、つながれる。"
    :boundary-heading "Discoveryは権限委譲ではありません"
    :boundary-p1 "kotoba.cloud は各 origin を発見可能にしますが、storage、compute、agent work を一つの trust domain にしません。receipt は各 origin を別々に記録します。"
    :boundary-p2 "既存の auth.kotobase.net Passkey も自動移行しません。新しい RP では、検証された Principal link が必要です。"
    :profile-link "Machine-readable profile" :spec-link "言語仕様を読む"
    :footer "Kotoba Cloud — identity and deploy control"
    :footer-roles "Language: kotoba-lang.org · Storage: kotobase.net · Compute: murakumo.cloud · Agent work: itonami.cloud"
    :not-found-title "見つかりません — Kotoba Cloud"
    :not-found-heading "その入口はありません。"
    :not-found-lead "Kotoba Cloud の公開入口へ戻ってください。"
    :not-found-cta "kotoba.cloud へ戻る"}

   :en
   {:html-lang "en" :og-locale "en_US" :path "/en/"
    :title "Kotoba Cloud — AI writes freely. Kotoba draws the boundary."
    :description "Turn AI-written code into admitted computation by checking effects, capabilities, and identity, then connect it to separately governed storage, compute, and agent work."
    :skip "Skip to content" :home-label "Kotoba Cloud home"
    :nav-architecture "Architecture" :nav-label "Primary navigation"
    :language-label "Display language" :hero-eyebrow "SECURITY-FIRST COMPUTING"
    :headline "AI writes freely. Kotoba draws the boundary."
    :lead ["Kotoba checks effects and capabilities in AI-written code, emitting only artifacts that satisfy the admitted boundary."
           "Kotoba Cloud carries that boundary into identity, storage, compute, and agent work without collapsing their authority."]
    :passkey-cta "Start with Passkey" :cli-cta "Explore the Kotoba CLI"
    :live "Discovery and the Passkey RP are live. Hosted apply is not available yet."
    :architecture-title "Three execution planes. Boundaries intact."
    :architecture-lead "The services connect without becoming one giant trust domain. Each authority remains separately governed."
    :control-kind "CONTROL + IDENTITY" :control-title "Kotoba Cloud"
    :control-body "Passkey verifies a Stable Principal. The control plane publishes the topology and authority floor used by CLI deploy."
    :planes [{:kind "STORAGE" :name "Kotobase" :origin "kotobase.net"
              :href "https://kotobase.net"
              :body "Keeps content-addressed artifacts, state, and execution receipts."}
             {:kind "COMPUTE" :name "Murakumo" :origin "murakumo.cloud"
              :href "https://murakumo.cloud"
              :body "Places admitted workloads on CPU/GPU resources and executes them."}
             {:kind "AGENT WORK" :name "Itonami" :origin "itonami.cloud"
              :href "https://itonami.cloud"
              :body "Runs continuing agent work across workspaces, goals, tools, and approvals."}]
    :deploy-title "From AI-written code to admitted computation"
    :steps [["Write" "Agents and humans write freely in readable, data-oriented code."]
            ["Admit" "Kotoba checks types, effects, capabilities, resources, and target support."]
            ["Bind" "The host and provider bind Passkey identity and a resource-scoped grant."]
            ["Run" "Kotobase keeps artifacts and receipts; Murakumo and Itonami perform the admitted work."]]
    :boundary-title "Boundaries make connection possible."
    :boundary-heading "Discovery is not delegation"
    :boundary-p1 "kotoba.cloud makes each origin discoverable without merging storage, compute, and agent work into one trust domain. Receipts record every origin separately."
    :boundary-p2 "Existing auth.kotobase.net Passkeys do not migrate automatically. The new RP requires a verified Principal link."
    :profile-link "Machine-readable profile" :spec-link "Read the language specification"
    :footer "Kotoba Cloud — identity and deploy control"
    :footer-roles "Language: kotoba-lang.org · Storage: kotobase.net · Compute: murakumo.cloud · Agent work: itonami.cloud"
    :not-found-title "Not found — Kotoba Cloud"
    :not-found-heading "That entrance does not exist."
    :not-found-lead "Return to the public Kotoba Cloud entrance."
    :not-found-cta "Return to kotoba.cloud"}})

(def app-css
  (str
   ".kc-skip{position:absolute;inset-inline-start:var(--hig-spacing-4);top:-10rem;z-index:10;}"
   ".kc-skip:focus{top:var(--hig-spacing-4);}"
   ".kc-header{border-bottom:1px solid var(--hig-color-separator);background:var(--hig-color-system-background);}"
   ".kc-header__inner{min-height:4.5rem;display:flex;align-items:center;justify-content:space-between;gap:var(--hig-spacing-4);}"
   ".kc-wordmark{display:flex;align-items:center;gap:var(--hig-spacing-3);color:var(--hig-color-label);font-weight:700;text-decoration:none;letter-spacing:.04em;}"
   ".kc-mark{inline-size:2rem;block-size:2rem;display:grid;place-items:center;border:2px solid var(--hig-color-tint);border-radius:var(--hig-radius-xs);color:var(--hig-color-tint);font-weight:700;}"
   ".kc-nav,.kc-languages{display:flex;align-items:center;gap:var(--hig-spacing-4);}"
   ".kc-nav a,.kc-languages a{color:var(--hig-color-label);font-weight:700;text-underline-offset:.25em;}"
   ".kc-languages{gap:var(--hig-spacing-2);white-space:nowrap}.kc-languages [aria-current='page']{text-decoration-thickness:.15em;}"
   ".kc-hero{padding-block:var(--hig-spacing-10);border-bottom:1px solid var(--hig-color-separator);}"
   ".kc-eyebrow{margin:0 0 var(--hig-spacing-4);font-family:var(--hig-font-mono);font-size:var(--hig-text-caption1-font-size);font-weight:700;letter-spacing:.12em;color:var(--hig-color-tint);}"
   ".kc-hero h1{max-width:17ch;text-wrap:balance;}"
   ".kc-lead{max-width:48rem;font-size:var(--hig-text-title3-font-size);line-height:var(--hig-text-title3-line-height);color:var(--hig-color-secondary-label);}"
   ".kc-actions{margin-top:var(--hig-spacing-7);}"
   ".kc-live{margin-top:var(--hig-spacing-5);display:flex;align-items:center;gap:var(--hig-spacing-3);color:var(--hig-color-secondary-label);}"
   ".kc-live__dot{inline-size:.75rem;block-size:.75rem;flex:none;border-radius:var(--hig-radius-capsule);background:var(--hig-palette-green);}"
   ".kc-architecture{background:var(--hig-color-secondary-system-background);}"
   ".kc-control{border-inline-start:.4rem solid var(--hig-color-tint);}"
   ".kc-control__origin{font-family:var(--hig-font-mono);color:var(--hig-color-tint);}"
   ".kc-flow{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--hig-spacing-5);margin-top:var(--hig-spacing-7);padding-top:var(--hig-spacing-7);border-top:1px solid var(--hig-color-separator);}"
   ".kc-plane{position:relative;}.kc-plane::before{content:'↓';position:absolute;inset-block-start:calc(-1 * var(--hig-spacing-9));inset-inline-start:50%;color:var(--hig-color-tint);font-weight:700;}"
   ".kc-plane__kind{font-family:var(--hig-font-mono);font-size:var(--hig-text-caption1-font-size);font-weight:700;letter-spacing:.08em;color:var(--hig-color-secondary-label);}"
   ".kc-plane h3{margin-block:var(--hig-spacing-2);}.kc-plane p{color:var(--hig-color-secondary-label);}.kc-plane a{font-family:var(--hig-font-mono);font-weight:700;}"
   ".kc-steps{counter-reset:step}.kc-step{counter-increment:step}.kc-step::before{content:'0' counter(step);display:block;margin-bottom:var(--hig-spacing-3);font-family:var(--hig-font-mono);font-weight:700;color:var(--hig-color-tint);}"
   ".kc-command{margin:var(--hig-spacing-6) 0 0;padding:var(--hig-spacing-5);overflow:auto;border:1px solid var(--hig-color-separator);border-radius:var(--hig-radius-sm);background:var(--hig-color-label);color:var(--hig-color-system-background);font-family:var(--hig-font-mono);line-height:1.7;}"
   ".kc-boundary{border-inline-start:.4rem solid var(--hig-color-separator);}"
   ".kc-footer{padding-block:var(--hig-spacing-8);border-top:1px solid var(--hig-color-separator);color:var(--hig-color-secondary-label);}.kc-footer__inner{display:flex;justify-content:space-between;gap:var(--hig-spacing-5);flex-wrap:wrap;}"
   "@media(max-width:48rem){.kc-nav__secondary{display:none}.kc-hero{padding-block:var(--hig-spacing-8)}.kc-hero .dads-heading[data-size='64']{font-size:var(--hig-text-large-title-font-size);line-height:var(--hig-text-large-title-line-height)}.kc-hero .dds-ext-row{display:grid;grid-template-columns:1fr}.kc-actions{margin-top:var(--hig-spacing-4)}.kc-actions .dads-button{width:100%;justify-content:center}.kc-flow{grid-template-columns:1fr}.kc-plane::before{inset-inline-start:var(--hig-spacing-4)}.kc-footer__inner{display:block}}"
   "@media(max-width:30rem){.kc-wordmark__text{display:none}.kc-header__inner{gap:var(--hig-spacing-2)}.kc-nav{gap:var(--hig-spacing-2)}}"
   "@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}"))

(defn translation [locale]
  (or (get copy locale) (get copy :ja)))

(defn passkey-href [locale]
  (str "https://auth.kotoba.cloud/sign-in?return_to="
       (if (= locale :en)
         "https%3A%2F%2Fkotoba.cloud%2Fen%2F"
         "https%3A%2F%2Fkotoba.cloud%2F")))

(defn language-links [locale label]
  [:div {:class "kc-languages" :role "group" :aria-label label}
   [:a (cond-> {:href "/" :lang "ja" :hreflang "ja"}
         (= locale :ja) (assoc :aria-current "page")) "日本語"]
   [:span {:aria-hidden "true"} "/"]
   [:a (cond-> {:href "/en/" :lang "en" :hreflang "en"}
         (= locale :en) (assoc :aria-current "page")) "English"]])

(defn plane-card [{:keys [kind name origin href body]}]
  (dds/card
   [:article {:class "kc-plane"}
    [:div {:class "kc-plane__kind"} kind]
    (dds/heading 3 name {:size "24"})
    [:p body]
    [:a {:href href} origin " ↗"]]))

(defn view [locale]
  (let [t (translation locale)]
    [[:a {:class "kc-skip dads-button" :data-type "outline" :data-size "sm"
          :href "#main"} (:skip t)]
     [:header {:class "kc-header"}
      (dds/container
       [:div {:class "kc-header__inner"}
        [:a {:class "kc-wordmark" :href (:path t) :aria-label (:home-label t)}
         [:span {:class "kc-mark" :aria-hidden "true"} "こ"]
         [:span {:class "kc-wordmark__text"} "KOTOBA CLOUD"]]
        [:nav {:class "kc-nav" :aria-label (:nav-label t)}
         [:a {:class "kc-nav__secondary" :href "#architecture"} (:nav-architecture t)]
         (language-links locale (:language-label t))
         (dds/button "Passkey" {:type :outline :size "sm"
                                :href (passkey-href locale)})]])]
     [:main {:id "main"}
      [:section {:class "kc-hero"}
       (dds/container
        [:p {:class "kc-eyebrow"} (:hero-eyebrow t)]
        (dds/heading 1 (:headline t) {:size "64"})
        (into [:p {:class "kc-lead"}] (interpose " " (:lead t)))
        (dds/row
         [:div {:class "kc-actions"}
          (dds/button (:passkey-cta t) {:type :solid-fill :size "lg"
                                        :href (passkey-href locale)})]
         [:div {:class "kc-actions"}
          (dds/button (:cli-cta t) {:type :outline :size "lg"
                                    :href "https://kotoba-lang.org/#install"})])
        [:div {:class "kc-live"}
         [:span {:class "kc-live__dot" :aria-hidden "true"}]
         [:span (:live t)]])]
      [:section {:class "kc-architecture" :id "architecture"}
       (dds/container
        (dds/section {:title (:architecture-title t)}
         [:p {:class "dds-ext-lead"} (:architecture-lead t)]
         (dds/card
          [:article {:class "kc-control"}
           [:div {:class "kc-plane__kind"} (:control-kind t)]
           (dds/heading 3 (:control-title t) {:size "24"})
           [:p (:control-body t)]
           [:div {:class "kc-control__origin"} "auth.kotoba.cloud  ·  api.kotoba.cloud"]])
         (into [:div {:class "kc-flow"}] (map plane-card (:planes t)))))]
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
     [:footer {:class "kc-footer"}
      (dds/container
       [:div {:class "kc-footer__inner"}
        [:span (:footer t)]
        [:span (:footer-roles t)]])]]))

#?(:clj
   (defn page-html
     ([] (page-html :ja))
     ([locale]
      (let [t (translation locale)
            dds-css (slurp (io/resource "jp_go_dds/dds.css"))]
        (apply page/->page
               {:title (:title t)
                :description (:description t)
                :lang (:html-lang t)
                :css dds-css
                :app-css (str tokens/skin-css app-css)
                :head [[:link {:rel "canonical" :href (str "https://kotoba.cloud" (:path t))}]
                       [:link {:rel "alternate" :hreflang "ja" :href "https://kotoba.cloud/"}]
                       [:link {:rel "alternate" :hreflang "en" :href "https://kotoba.cloud/en/"}]
                       [:link {:rel "alternate" :hreflang "x-default" :href "https://kotoba.cloud/"}]
                       [:meta {:property "og:type" :content "website"}]
                       [:meta {:property "og:title" :content (:title t)}]
                       [:meta {:property "og:description" :content (:description t)}]
                       [:meta {:property "og:locale" :content (:og-locale t)}]
                       [:meta {:property "og:url" :content (str "https://kotoba.cloud" (:path t))}]]}
               (view locale))))))

#?(:clj
   (defn not-found-html
     ([] (not-found-html :ja))
     ([locale]
      (let [t (translation locale)
            dds-css (slurp (io/resource "jp_go_dds/dds.css"))]
        (page/->page
         {:title (:not-found-title t) :description (:not-found-lead t)
          :lang (:html-lang t) :css dds-css :app-css (str tokens/skin-css app-css)}
         (dds/container
          [:main {:id "main"}
           [:section {:class "kc-hero"}
            [:p {:class "kc-eyebrow"} "404 / NOT FOUND"]
            (dds/heading 1 (:not-found-heading t) {:size "45"})
            [:p {:class "kc-lead"} (:not-found-lead t)]
            (dds/button (:not-found-cta t) {:href (:path t) :size "lg"})]]))))))

#?(:clj
   (defn -main [& _]
     (let [root (io/file "public")
           en-dir (io/file root "en")]
       (.mkdirs root)
       (.mkdirs en-dir)
       (spit (io/file root "index.html") (page-html :ja))
       (spit (io/file root "404.html") (not-found-html :ja))
       (spit (io/file en-dir "index.html") (page-html :en))
       (spit (io/file en-dir "404.html") (not-found-html :en))
       (println "rendered ja and en pages with localized 404 documents"))))
