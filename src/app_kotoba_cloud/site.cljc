(ns app-kotoba-cloud.site
  "Localized public pages for kotoba.cloud. Pure CLJC views render finite
  Worker Static Assets for every supported locale."
  (:require [app-kotoba-cloud.profile :as profile]
            [app-kotoba-cloud.session :as session]
            [jp-go-dds.behavior :as behavior]
            [jp-go-dds.core :as dds]
            [jp-go-dds.css :as dcss]
            [jp-go-dds.page :as page]
            [jp-go-dds.tokens :as tokens]
            #?(:clj [clojure.java.io :as io])))

(def supported-locales [:en :ja])

(def operator-name "Kotoba Labs Inc")
(def public-contact-email "support@kotoba.cloud")
(def legal-disclosure "請求があった場合、法令に従い遅滞なく開示します")

(def reference-package-command
  (str "# install and run the live Ed25519 + ML-DSA-65 reference package\n"
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

(def copy
  {:ja
   {:html-lang "ja" :og-locale "ja_JP" :path "/ja/"
    :title "Kotoba Cloud — 耐量子暗号を前提に、AIの境界を引く。"
    :description "耐量子暗号を新しい暗号境界の前提とし、AIが書いたコードをeffect・capability・identityで検査して許可済みの計算へ接続します。"
    :skip "本文へ移動" :home-label "Kotoba Cloud ホーム"
    :nav-architecture "構成" :nav-libraries "ライブラリ公開" :nav-label "主要ナビゲーション"
    :language-label "表示言語" :hero-eyebrow "POST-QUANTUM BY DEFAULT"
    :headline "AIは自由に書く。Kotobaは境界を引く。"
    :lead ["Kotoba は、AI が書いたコードから effect と capability を検査し、境界を満たす artifact だけを生成します。"
           "耐量子暗号は追加 mode ではなく、新しい暗号化・package admission・公開境界の前提です。Kotoba Cloud は、その境界を崩さず identity、storage、compute、agent work へ接続します。"]
    :passkey-cta "Passkey で始める" :cli-cta "Kotoba CLI を見る"
    :live "Discovery と Passkey RP は稼働中。Hosted apply はまだ提供していません。"
    :architecture-title "境界を保ったまま、三つの実行面へ。"
    :architecture-lead "一つの巨大な trust domain にまとめず、それぞれの authority を分けたまま接続します。"
    :control-kind "CONTROL + IDENTITY" :control-title "Kotoba Cloud"
    :control-body "Passkey で Stable Principal を確認し、CLI deploy が参照する topology と authority floor を公開します。"
    :connect-label "同じPrincipalで接続"
    :planes [{:kind "STORAGE" :name "Kotobase" :origin "kotobase.net"
              :href "https://kotobase.net"
              :connect-href "https://auth.kotoba.cloud/connect?target=kotobase"
              :body "Content-addressed な artifact、状態、実行 receipt を保持する。"}
             {:kind "COMPUTE" :name "Murakumo" :origin "murakumo.cloud"
              :href "https://murakumo.cloud"
              :connect-href "https://auth.kotoba.cloud/connect?target=murakumo"
              :body "Admit 済みの workload を CPU/GPU へ配置し、実行する。"}
             {:kind "AGENT WORK" :name "Itonami" :origin "itonami.cloud"
              :href "https://itonami.cloud"
              :connect-href "https://auth.kotoba.cloud/connect?target=itonami"
              :body "Agent の workspace、goal、tool、approval と継続作業を扱う。"}]
    :library-title "一つのrelease CIDを、複数の保存先から実行する"
    :library-lead "release CIDはnamespace head、definition、raw Wasm、compile receipt、再現性evidenceを一つのIPLD graphに固定します。名前とGitHubは発見・provenanceです。"
    :library-status "耐量子署名は任意ではありません。公開にはPasskey sessionとPrincipalに固定したML-DSA-65署名の両方が必要です。外部Passkey authenticatorと分散認定は別に検証します。"
    :approval-title "ライブラリ公開を承認"
    :approval-lead "CLIがローカル鍵で署名し、Kotobaseへ保存したgraphです。次のCIDとIPNS名を確認してから公開してください。"
    :approval-button "Passkey + ML-DSA-65で公開"
    :key-approval-title "耐量子公開鍵の変更を承認"
    :key-approval-lead "action、epoch、現行鍵と次の鍵を確認してください。ローテーションは両方のML-DSA鍵で署名済みです。Passkey確認後にのみ反映します。"
    :key-approval-button "Passkeyで鍵変更を確定"
    :library-catalog-cta "ライブラリcatalogと依存graphを見る"
    :library-steps [["Bundle" "definition、Wasm artifact、compile receiptを一つのrelease CIDへ閉じる。"]
                    ["Replicate" "同じclosureを少なくとも2つの独立storage originへ保存する。"]
                    ["Verify + Run" "全byteとrouted peer IDを検証し、release CIDとexportから実行する。"]]
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
    :operator-label "運営元"
    :contact-label "連絡先"
    :legal-link "運営"
    :tokushoho-link "特定商取引法に基づく表記"
    :legal-path "/ja/legal/"
    :tokushoho-path "/ja/legal/tokushoho/"
    :legal-title "運営元 — Kotoba Cloud"
    :legal-heading "運営元"
    :legal-about "Kotoba Cloud は identity と deploy control の公開入口です。storage、compute、agent work は別 origin のまま接続します。"
    :entity-label "法人情報"
    :representative-label "代表者"
    :address-label "所在地"
    :phone-label "電話番号"
    :service-provider-label "役務提供事業者"
    :service-label "対象役務"
    :price-label "販売価格"
    :other-costs-label "価格以外に必要な費用"
    :payment-label "支払方法"
    :payment-timing-label "支払時期"
    :provision-label "役務の提供時期"
    :term-label "契約期間"
    :cancel-label "解約"
    :refund-label "返金"
    :tokushoho-title "特定商取引法に基づく表記 — Kotoba Cloud"
    :tokushoho-heading "特定商取引法に基づく表記"
    :tokushoho-updated "最終更新日: 2026-08-30"
    :tokushoho-service "kotoba.cloud の identity および deploy control（Discovery と Passkey RP）。Hosted apply は提供していません。"
    :tokushoho-price "有償の hosted apply は提供していないため、販売価格はありません。"
    :tokushoho-other-costs "インターネット接続料金その他の通信費はお客様のご負担となります。"
    :tokushoho-payment "有償役務は現在提供していません。"
    :tokushoho-payment-timing "該当なし"
    :tokushoho-provision "Discovery と Passkey RP は公開中です。Hosted apply は提供していません。"
    :tokushoho-term "有償契約はありません。"
    :tokushoho-cancel "該当なし"
    :tokushoho-refund "該当なし"
    :tokushoho-note "法人情報、代表者、所在地、電話番号は、請求があった場合、法令に従い遅滞なく開示します。"
    :not-found-title "見つかりません — Kotoba Cloud"
    :not-found-heading "その入口はありません。"
    :not-found-lead "Kotoba Cloud の公開入口へ戻ってください。"
    :not-found-cta "kotoba.cloud へ戻る"}

   :en
   {:html-lang "en" :og-locale "en_US" :path "/"
    :title "Kotoba Cloud — post-quantum by default for admitted AI computing"
    :description "Post-quantum cryptography is the prerequisite for new Kotoba cryptographic boundaries, carrying admitted AI computation into separately governed storage, compute, and agent work."
    :skip "Skip to content" :home-label "Kotoba Cloud home"
    :nav-architecture "Architecture" :nav-libraries "Publish libraries" :nav-label "Primary navigation"
    :language-label "Display language" :hero-eyebrow "POST-QUANTUM BY DEFAULT"
    :headline "AI writes freely. Kotoba draws the boundary."
    :lead ["Kotoba checks effects and capabilities in AI-written code, emitting only artifacts that satisfy the admitted boundary."
           "Post-quantum cryptography is a prerequisite—not an optional mode—for new encryption, package admission, and publication boundaries. Kotoba Cloud carries that boundary into identity, storage, compute, and agent work without collapsing their authority."]
    :passkey-cta "Start with Passkey" :cli-cta "Explore the Kotoba CLI"
    :live "Discovery and the Passkey RP are live. Hosted apply is not available yet."
    :architecture-title "Three execution planes. Boundaries intact."
    :architecture-lead "The services connect without becoming one giant trust domain. Each authority remains separately governed."
    :control-kind "CONTROL + IDENTITY" :control-title "Kotoba Cloud"
    :control-body "Passkey verifies a Stable Principal. The control plane publishes the topology and authority floor used by CLI deploy."
    :connect-label "Connect this Principal"
    :planes [{:kind "STORAGE" :name "Kotobase" :origin "kotobase.net"
              :href "https://kotobase.net"
              :connect-href "https://auth.kotoba.cloud/connect?target=kotobase"
              :body "Keeps content-addressed artifacts, state, and execution receipts."}
             {:kind "COMPUTE" :name "Murakumo" :origin "murakumo.cloud"
              :href "https://murakumo.cloud"
              :connect-href "https://auth.kotoba.cloud/connect?target=murakumo"
              :body "Places admitted workloads on CPU/GPU resources and executes them."}
             {:kind "AGENT WORK" :name "Itonami" :origin "itonami.cloud"
              :href "https://itonami.cloud"
              :connect-href "https://auth.kotoba.cloud/connect?target=itonami"
              :body "Runs continuing agent work across workspaces, goals, tools, and approvals."}]
    :library-title "One release CID, executable from multiple providers"
    :library-lead "A release CID fixes the namespace head, definitions, raw Wasm, compile receipts, and reproducibility evidence in one IPLD graph. Names and GitHub remain discovery and provenance."
    :library-status "Post-quantum signatures are mandatory, not optional. Publication requires both a Passkey session and an ML-DSA-65 signature pinned to the Principal. External authenticators and distributed qualification remain separately verified boundaries."
    :approval-title "Approve library publication"
    :approval-lead "The CLI signed this graph locally and stored it in Kotobase. Verify the CIDs and IPNS name before publishing."
    :approval-button "Publish with Passkey + ML-DSA-65"
    :key-approval-title "Approve post-quantum key transition"
    :key-approval-lead "Verify the action, epoch, current key, and next key. Rotation is signed by both ML-DSA keys and takes effect only after Passkey confirmation."
    :key-approval-button "Confirm key transition with Passkey"
    :library-catalog-cta "Open the library catalog and dependency graph"
    :library-steps [["Bundle" "Close definitions, Wasm artifacts, and compile receipts under one release CID."]
                    ["Replicate" "Store the same complete closure at no fewer than two independent storage origins."]
                    ["Verify + Run" "Verify every byte and routed peer IDs, then execute by release CID and export."]]
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
    :operator-label "Operator"
    :contact-label "Contact"
    :legal-link "Operator"
    :tokushoho-link "Specified Commercial Transactions notice"
    :legal-path "/legal/"
    :tokushoho-path "/legal/tokushoho/"
    :legal-title "Operator — Kotoba Cloud"
    :legal-heading "Operator"
    :legal-about "Kotoba Cloud is the public identity and deploy-control entrance. Storage, compute, and agent work remain separately governed origins."
    :entity-label "法人情報"
    :representative-label "代表者"
    :address-label "所在地"
    :phone-label "電話番号"
    :service-provider-label "Service provider"
    :service-label "Service"
    :price-label "Price"
    :other-costs-label "Costs other than the price"
    :payment-label "Payment method"
    :payment-timing-label "Payment timing"
    :provision-label "When the service is provided"
    :term-label "Contract term"
    :cancel-label "Cancellation"
    :refund-label "Refunds"
    :tokushoho-title "Specified Commercial Transactions notice — Kotoba Cloud"
    :tokushoho-heading "Specified Commercial Transactions Act notice"
    :tokushoho-updated "Last updated: 2026-08-30"
    :tokushoho-service "kotoba.cloud identity and deploy control (discovery and the Passkey RP). Hosted apply is not offered."
    :tokushoho-price "No sale price applies. Paid hosted apply is not offered."
    :tokushoho-other-costs "Internet access and other communication charges are the customer's responsibility."
    :tokushoho-payment "No paid service is offered."
    :tokushoho-payment-timing "Not applicable"
    :tokushoho-provision "Discovery and the Passkey RP are live. Hosted apply is not offered."
    :tokushoho-term "There is no paid contract."
    :tokushoho-cancel "Not applicable"
    :tokushoho-refund "Not applicable"
    :tokushoho-note "法人情報、代表者、所在地、電話番号は、請求があった場合、法令に従い遅滞なく開示します。"
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
   ".kc-nav{display:flex;align-items:center;gap:var(--hig-spacing-4);}"
   ".kc-nav>a{color:var(--hig-color-label);font-weight:700;text-underline-offset:.25em;}"
   ".kc-hero{padding-block:var(--hig-spacing-10);border-bottom:1px solid var(--hig-color-separator);}"
   ".kc-eyebrow{margin:0 0 var(--hig-spacing-4);font-family:var(--hig-font-mono);font-size:var(--hig-text-caption1-font-size);font-weight:700;letter-spacing:.12em;color:var(--hig-color-tint);}"
   ".kc-hero h1{max-width:17ch;text-wrap:balance;}"
   ".kc-lead{max-width:48rem;font-size:var(--hig-text-title3-font-size);line-height:var(--hig-text-title3-line-height);color:var(--hig-color-secondary-label);}"
   ".kc-actions{margin-top:var(--hig-spacing-7);}"
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
  (session/passkey-href locale))

(defn language-links
  ([locale label]
   (language-links locale label {}))
  ([locale label {:keys [en ja] :or {en "/" ja "/ja/"}}]
   (dds/language-selector
    {:id-prefix "kotoba-cloud-language"
     :size "md"
     :current locale
     :languages [{:code :en :label "English" :href en}
                 {:code :ja :label "日本語" :href ja}]
     :attrs {:aria-label label}})))

(defn operator-lead [locale]
  (if (= locale :en)
    (str "The public operator of kotoba.cloud is " operator-name ".")
    (str "kotoba.cloud の公開運営元は " operator-name " です。")))

(defn contact-mailto []
  [:a {:href (str "mailto:" public-contact-email)} public-contact-email])

(defn site-header
  ([locale t]
   (site-header locale t {}))
  ([locale t {:keys [language-ja language-en]}]
   [:header {:class "kc-header"}
    (dds/container
     [:div {:class "kc-header__inner"}
      [:a {:class "kc-wordmark" :href (:path t) :aria-label (:home-label t)}
       [:span {:class "kc-mark" :aria-hidden "true"} "こ"]
       [:span {:class "kc-wordmark__text"} "KOTOBA CLOUD"]]
      [:nav {:class "kc-nav" :aria-label (:nav-label t)}
       [:a {:class "kc-nav__secondary" :href (str (:path t) "#architecture")} (:nav-architecture t)]
       [:a {:class "kc-nav__secondary" :href (str (:path t) "#libraries")} (:nav-libraries t)]
       (language-links locale (:language-label t)
                       {:ja (or language-ja "/ja/") :en (or language-en "/")})
       (dds/button "Passkey" {:type :outline :size "sm" :id "kc-session-nav"
                              :href (passkey-href locale)})]])]))

(defn site-footer [t]
  [:footer {:class "kc-footer"}
   (dds/container
    [:div {:class "kc-footer__inner"}
     [:span (:footer t)]
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
     (site-header locale t {:language-ja "/ja/legal/" :language-en "/legal/"})
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
     (site-header locale t {:language-ja "/ja/legal/tokushoho/"
                            :language-en "/legal/tokushoho/"})
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
        [:p {:class "kc-eyebrow"} (:hero-eyebrow t)]
        (dds/heading 1 (:headline t) {:size "64"})
        (into [:p {:class "kc-lead"}] (interpose " " (:lead t)))
        (dds/row
         [:div {:class "kc-actions"}
          (dds/button (:passkey-cta t) {:type :solid-fill :size "lg"
                                        :id "kc-session-action"
                                        :href (passkey-href locale)})]
         [:div {:class "kc-actions"}
          (dds/button (:cli-cta t) {:type :outline :size "lg"
                                    :href "https://kotoba-lang.org/#install"})])
        [:div {:class "kc-live"}
         [:span {:class "kc-live__dot" :aria-hidden "true"}]
         [:span {:id "kc-session-status"} (:live t)]])]
      [:section {:class "kc-identity" :id "identity" :hidden true
                 :aria-label (if (= locale :en)
                               "Signed-in identity"
                               "ログイン中の Identity")}
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
           ja-href (str "https://kotoba.cloud" (get-in copy [:ja path-key]))
           en-href (str "https://kotoba.cloud" (get-in copy [:en path-key]))]
       [[:link {:rel "canonical" :href (str "https://kotoba.cloud" path)}]
        [:script {:src "/js/language-selector.js" :defer true}]
        [:script {:src "/js/session.js" :defer true}]
        [:link {:rel "alternate" :hreflang "ja" :href ja-href}]
        [:link {:rel "alternate" :hreflang "en" :href en-href}]
        [:link {:rel "alternate" :hreflang "x-default" :href en-href}]
        [:meta {:property "og:type" :content "website"}]
        [:meta {:property "og:title" :content title}]
        [:meta {:property "og:description" :content description}]
        [:meta {:property "og:locale" :content (:og-locale t)}]
        [:meta {:property "og:url" :content (str "https://kotoba.cloud" path)}]])))

#?(:clj
   (defn page-html
     ([] (page-html :en))
     ([locale]
      (let [t (translation locale)]
        (apply page/->page
               {:title (:title t)
                :description (:description t)
                :lang (:html-lang t)
                :css (document-css)
                :app-css (str tokens/skin-css app-css)
                :head (document-head locale :path (:title t) (:description t))}
               (view locale))))))

#?(:clj
   (defn legal-html
     ([] (legal-html :en))
     ([locale]
      (let [t (translation locale)]
        (apply page/->page
               {:title (:legal-title t)
                :description (operator-lead locale)
                :lang (:html-lang t)
                :css (document-css)
                :app-css (str tokens/skin-css app-css)
                :head (document-head locale :legal-path (:legal-title t)
                                     (operator-lead locale))}
               (legal-view locale))))))

#?(:clj
   (defn tokushoho-html
     ([] (tokushoho-html :en))
     ([locale]
      (let [t (translation locale)]
        (apply page/->page
               {:title (:tokushoho-title t)
                :description (operator-lead locale)
                :lang (:html-lang t)
                :css (document-css)
                :app-css (str tokens/skin-css app-css)
                :head (document-head locale :tokushoho-path
                                     (:tokushoho-title t)
                                     (operator-lead locale))}
               (tokushoho-view locale))))))

#?(:clj
   (defn not-found-html
     ([] (not-found-html :en))
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
            (dds/button (:not-found-cta t) {:href (:path t) :size "lg"})]])
         (site-footer t))))))

#?(:clj
   (defn -main [& _]
     (let [root (io/file "public")
           ja-dir (io/file root "ja")
           en-dir (io/file root "en")
           js-dir (io/file root "js")
           ipfs-source (io/file "assets" "ipfs")
           ipfs-target (io/file root "ipfs")
           registry-source (io/file "assets" "kotoba-package-registry.edn")
           registry-target (io/file root ".well-known" "kotoba-package-registry.edn")]
       (.mkdirs root)
       (.mkdirs ja-dir)
       (.mkdirs en-dir)
       (.mkdirs js-dir)
       (doseq [dir [(io/file root "legal")
                    (io/file root "legal" "tokushoho")
                    (io/file ja-dir "legal")
                    (io/file ja-dir "legal" "tokushoho")
                    (io/file en-dir "legal")
                    (io/file en-dir "legal" "tokushoho")]]
         (.mkdirs dir))
       (spit (io/file root "index.html") (page-html :en))
       (spit (io/file root "404.html") (not-found-html :en))
       (spit (io/file root "legal" "index.html") (legal-html :en))
       (spit (io/file root "legal" "tokushoho" "index.html") (tokushoho-html :en))
       (spit (io/file ja-dir "index.html") (page-html :ja))
       (spit (io/file ja-dir "404.html") (not-found-html :ja))
       (spit (io/file ja-dir "legal" "index.html") (legal-html :ja))
       (spit (io/file ja-dir "legal" "tokushoho" "index.html") (tokushoho-html :ja))
       ;; Keep the old English URL addressable while canonical English moves
       ;; to the apex. Existing links should not become a language regression.
       (spit (io/file en-dir "index.html") (page-html :en))
       (spit (io/file en-dir "404.html") (not-found-html :en))
       (spit (io/file en-dir "legal" "index.html") (legal-html :en))
       (spit (io/file en-dir "legal" "tokushoho" "index.html") (tokushoho-html :en))
       (spit (io/file js-dir "language-selector.js") behavior/language-selector-script)
       (doseq [source (file-seq ipfs-source) :when (.isFile ^java.io.File source)]
         (let [target (io/file ipfs-target (.getName ^java.io.File source))]
           (.mkdirs (.getParentFile target))
           (io/copy source target)))
       (.mkdirs (.getParentFile registry-target))
       (io/copy registry-source registry-target)
       (println "rendered English-first root, Japanese pages, legal/tokushoho documents, and localized 404s"))))
