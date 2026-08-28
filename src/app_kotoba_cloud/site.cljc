(ns app-kotoba-cloud.site
  "Static public page for kotoba.cloud. The view is pure CLJC; JVM rendering
  produces the Worker Static Assets before build/deploy."
  (:require [clojure.string :as str]
            [jp-go-dds.core :as dds]
            [jp-go-dds.page :as page]
            [jp-go-dds.tokens :as tokens]
            #?(:clj [clojure.java.io :as io])))

(def app-css
  (str
   ".kc-skip{position:absolute;inset-inline-start:var(--hig-spacing-4);top:-10rem;z-index:10;}"
   ".kc-skip:focus{top:var(--hig-spacing-4);}"
   ".kc-header{border-bottom:1px solid var(--hig-color-separator);background:var(--hig-color-system-background);}"
   ".kc-header__inner{min-height:4.5rem;display:flex;align-items:center;justify-content:space-between;gap:var(--hig-spacing-4);}"
   ".kc-wordmark{display:flex;align-items:center;gap:var(--hig-spacing-3);color:var(--hig-color-label);font-weight:700;text-decoration:none;letter-spacing:.04em;}"
   ".kc-mark{inline-size:2rem;block-size:2rem;display:grid;place-items:center;border:2px solid var(--hig-color-tint);border-radius:var(--hig-radius-xs);color:var(--hig-color-tint);font-weight:700;}"
   ".kc-nav{display:flex;align-items:center;gap:var(--hig-spacing-5);}"
   ".kc-nav a{color:var(--hig-color-label);font-weight:700;text-underline-offset:.25em;}"
   ".kc-hero{padding-block:var(--hig-spacing-10);border-bottom:1px solid var(--hig-color-separator);}"
   ".kc-eyebrow{margin:0 0 var(--hig-spacing-4);font-family:var(--hig-font-mono);font-size:var(--hig-text-caption1-font-size);font-weight:700;letter-spacing:.12em;color:var(--hig-color-tint);}"
   ".kc-hero h1{max-width:12ch;text-wrap:balance;}"
   ".kc-lead{max-width:42rem;font-size:var(--hig-text-title3-font-size);line-height:var(--hig-text-title3-line-height);color:var(--hig-color-secondary-label);}"
   ".kc-actions{margin-top:var(--hig-spacing-7);}"
   ".kc-live{margin-top:var(--hig-spacing-5);display:flex;align-items:center;gap:var(--hig-spacing-3);color:var(--hig-color-secondary-label);}"
   ".kc-live__dot{inline-size:.75rem;block-size:.75rem;flex:none;border-radius:var(--hig-radius-capsule);background:var(--hig-palette-green);}"
   ".kc-architecture{background:var(--hig-color-secondary-system-background);}"
   ".kc-control{border-inline-start:.4rem solid var(--hig-color-tint);}"
   ".kc-control__origin{font-family:var(--hig-font-mono);color:var(--hig-color-tint);}"
   ".kc-flow{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--hig-spacing-5);margin-top:var(--hig-spacing-7);padding-top:var(--hig-spacing-7);border-top:1px solid var(--hig-color-separator);}"
   ".kc-plane{position:relative;}"
   ".kc-plane::before{content:'↓';position:absolute;inset-block-start:calc(-1 * var(--hig-spacing-9));inset-inline-start:50%;color:var(--hig-color-tint);font-weight:700;}"
   ".kc-plane__kind{font-family:var(--hig-font-mono);font-size:var(--hig-text-caption1-font-size);font-weight:700;letter-spacing:.08em;color:var(--hig-color-secondary-label);}"
   ".kc-plane h3{margin-block:var(--hig-spacing-2);}"
   ".kc-plane p{color:var(--hig-color-secondary-label);}"
   ".kc-plane a{font-family:var(--hig-font-mono);font-weight:700;}"
   ".kc-steps{counter-reset:step;}"
   ".kc-step{counter-increment:step;}"
   ".kc-step::before{content:'0' counter(step);display:block;margin-bottom:var(--hig-spacing-3);font-family:var(--hig-font-mono);font-weight:700;color:var(--hig-color-tint);}"
   ".kc-command{margin:var(--hig-spacing-6) 0 0;padding:var(--hig-spacing-5);overflow:auto;border:1px solid var(--hig-color-separator);border-radius:var(--hig-radius-sm);background:var(--hig-color-label);color:var(--hig-color-system-background);font-family:var(--hig-font-mono);line-height:1.7;}"
   ".kc-boundary{border-inline-start:.4rem solid var(--hig-color-separator);}"
   ".kc-footer{padding-block:var(--hig-spacing-8);border-top:1px solid var(--hig-color-separator);color:var(--hig-color-secondary-label);}"
   ".kc-footer__inner{display:flex;justify-content:space-between;gap:var(--hig-spacing-5);flex-wrap:wrap;}"
   "@media(max-width:48rem){.kc-nav__secondary{display:none}.kc-hero{padding-block:var(--hig-spacing-8)}.kc-hero .dads-heading[data-size='64']{font-size:var(--hig-text-large-title-font-size);line-height:var(--hig-text-large-title-line-height)}.kc-hero .dds-ext-row{display:grid;grid-template-columns:1fr}.kc-actions{margin-top:var(--hig-spacing-4)}.kc-actions .dads-button{width:100%;justify-content:center}.kc-flow{grid-template-columns:1fr}.kc-plane::before{inset-inline-start:var(--hig-spacing-4)}.kc-footer__inner{display:block}}"
   "@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}"))

(def planes
  [{:kind "STORAGE" :name "Kotobase" :origin "kotobase.net"
    :href "https://kotobase.net"
    :body "成果物、状態、実行 receipt を content-addressed に保持する。"}
   {:kind "COMPUTE" :name "Murakumo" :origin "murakumo.cloud"
    :href "https://murakumo.cloud"
    :body "CPU/GPU を選び、admit 済みの workload を配置・実行する。"}
   {:kind "AGENT WORK" :name "Itonami" :origin "itonami.cloud"
    :href "https://itonami.cloud"
    :body "Agent の workspace、goal、tool、approval と継続作業を扱う。"}])

(defn plane-card [{:keys [kind name origin href body]}]
  (dds/card
   [:article {:class "kc-plane"}
    [:div {:class "kc-plane__kind"} kind]
    (dds/heading 3 name {:size "24"})
    [:p body]
    [:a {:href href} origin " ↗"]]))

(defn view []
  [[:a {:class "kc-skip dads-button" :data-type "outline" :data-size "sm"
        :href "#main"} "本文へ移動"]
   [:header {:class "kc-header"}
    (dds/container
     [:div {:class "kc-header__inner"}
      [:a {:class "kc-wordmark" :href "/" :aria-label "Kotoba Cloud ホーム"}
       [:span {:class "kc-mark" :aria-hidden "true"} "こ"]
       [:span "KOTOBA CLOUD"]]
      [:nav {:class "kc-nav" :aria-label "主要ナビゲーション"}
       [:a {:class "kc-nav__secondary" :href "#architecture"} "構成"]
       [:a {:class "kc-nav__secondary" :href "/.well-known/kotoba-cloud.json"} "Discovery"]
       (dds/button "Passkey" {:type :outline :size "sm"
                               :href "https://auth.kotoba.cloud/sign-in?return_to=https%3A%2F%2Fkotoba.cloud%2F"})]])]
   [:main {:id "main"}
    [:section {:class "kc-hero"}
     (dds/container
      [:p {:class "kc-eyebrow"} "KOTOBA CONTROL PLANE"]
      (dds/heading 1 "ことばから、実行へ。" {:size "64"})
      [:p {:class "kc-lead"}
       "Kotoba Cloud は、AI が書いたコードをそのまま信じる場所ではありません。"
       "Identity と effect を確かめ、保存・計算・Agent work を明示された境界へ渡します。"]
      (dds/row
       [:div {:class "kc-actions"}
        (dds/button "Passkey で始める" {:type :solid-fill :size "lg"
                                         :href "https://auth.kotoba.cloud/sign-in?return_to=https%3A%2F%2Fkotoba.cloud%2F"})]
       [:div {:class "kc-actions"}
        (dds/button "Kotoba CLI を見る" {:type :outline :size "lg"
                                          :href "https://kotoba-lang.org/#install"})])
      [:div {:class "kc-live"}
       [:span {:class "kc-live__dot" :aria-hidden "true"}]
       [:span "Discovery と Passkey RP は稼働中。Hosted apply はまだ提供していません。"]])]
    [:section {:class "kc-architecture" :id "architecture"}
     (dds/container
      (dds/section {:title "一つの入口。三つの実行面。"}
       [:p {:class "dds-ext-lead"}
        "同じブランドにまとめるのではなく、authority を分けたまま接続します。"]
       (dds/card
        [:article {:class "kc-control"}
         [:div {:class "kc-plane__kind"} "CONTROL + IDENTITY"]
         (dds/heading 3 "Kotoba Cloud" {:size "24"})
         [:p "Passkey で Stable Principal を確認し、CLI deploy が参照する topology と authority floor を公開します。"]
         [:div {:class "kc-control__origin"} "auth.kotoba.cloud  ·  api.kotoba.cloud"]])
       (into [:div {:class "kc-flow"}] (map plane-card planes))))]
    (dds/container
     (dds/section {:title "Deploy が通る道" :id "deploy"}
      (into
       [:div {:class "dds-ext-grid kc-steps" :style {:--dds-ext-grid-min "13rem"}}]
       (map (fn [[title body]]
              (dds/card [:article {:class "kc-step"}
                         (dds/heading 3 title {:size "20"})
                         [:p body]]))
            [["Identify" "auth.kotoba.cloud の Passkey と Principal を確認する。"]
             ["Admit" "CLI が effect、grant、artifact identity をローカルで検査する。"]
             ["Persist" "Kotobase が artifact、state、receipt を保持する。"]
             ["Execute" "Murakumo が CPU/GPU へ配置し、Itonami が Agent work を継続する。"]]))
      [:pre {:class "kc-command"} [:code "kotoba deploy --manifest app.edn --target murakumo:asher\n# plan is dry-run by default; apply remains explicit"]])
     (dds/section {:title "境界があるから、つながれる。" :id "trust"}
      (dds/card
       [:article {:class "kc-boundary"}
        (dds/heading 3 "Discovery は権限委譲ではありません" {:size "24"})
        [:p "kotoba.cloud は各 origin を発見可能にしますが、storage、compute、agent work を一つの trust domain にしません。receipt は各 origin を別々に記録します。"]
        [:p "既存の auth.kotobase.net Passkey も自動移行しません。新しい RP では、検証された Principal link が必要です。"]
        (dds/row
         (dds/button "Machine-readable profile" {:type :text :size "md"
                                                   :href "/.well-known/kotoba-cloud.json"})
         (dds/button "Language specification" {:type :text :size "md"
                                                 :href "https://kotoba-lang.org"}))])))]
   [:footer {:class "kc-footer"}
    (dds/container
     [:div {:class "kc-footer__inner"}
      [:span "Kotoba Cloud — identity and deploy control"]
      [:span "Language: kotoba-lang.org · Storage: kotobase.net · Compute: murakumo.cloud · Agent work: itonami.cloud"]])]])

#?(:clj
   (defn page-html []
     (let [dds-css (slurp (io/resource "jp_go_dds/dds.css"))]
       (apply page/->page
              {:title "Kotoba Cloud — ことばから、実行へ"
               :description "Kotoba の identity と deploy control。Kotobase storage、Murakumo compute、Itonami agent work を明示された authority boundary で接続します。"
               :lang "ja"
               :css dds-css
               :app-css (str tokens/skin-css app-css)
               :head [[:link {:rel "canonical" :href "https://kotoba.cloud/"}]
                      [:meta {:property "og:type" :content "website"}]
                      [:meta {:property "og:title" :content "Kotoba Cloud — ことばから、実行へ"}]
                      [:meta {:property "og:description" :content "Identity と effect を確かめ、storage・compute・agent work を明示された境界へ。"}]
                      [:meta {:property "og:url" :content "https://kotoba.cloud/"}]]}
              (view)))))

#?(:clj
   (defn not-found-html []
     (let [dds-css (slurp (io/resource "jp_go_dds/dds.css"))]
       (page/->page
        {:title "見つかりません — Kotoba Cloud" :description "ページが見つかりません。"
         :lang "ja" :css dds-css :app-css (str tokens/skin-css app-css)}
        (dds/container
         [:main {:id "main"}
          [:section {:class "kc-hero"}
           [:p {:class "kc-eyebrow"} "404 / NOT FOUND"]
           (dds/heading 1 "その入口はありません。" {:size "45"})
           [:p {:class "kc-lead"} "Kotoba Cloud の公開入口へ戻ってください。"]
           (dds/button "kotoba.cloud へ戻る" {:href "/" :size "lg"})]])))))

#?(:clj
   (defn -main [& _]
     (let [dir (io/file "public")]
       (.mkdirs dir)
       (spit (io/file dir "index.html") (page-html))
       (spit (io/file dir "404.html") (not-found-html))
       (println "rendered public/index.html and public/404.html"))))
