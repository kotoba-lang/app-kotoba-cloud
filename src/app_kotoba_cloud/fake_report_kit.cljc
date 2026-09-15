(ns app-kotoba-cloud.fake-report-kit
  "ADR-2609141800 Phase 1: pure cljc draft-generation core for the SNS
   fake-account (impersonation) report surface. No host effects, no I/O,
   no submission rail (C4). Pure: this ns must stay loadable by any cljc
   host so it can later be extracted to kotoba-lang/fake-report-kit.

   Charter gates encoded here (ADR D1):
   - C1 non-adjudicating: drafts only carry deterministic literal-signal
     observations, never a verdict. `:kit/non-adjudicating true`.
   - C2 evidence-first: `validate-case` rejects any case with zero
     evidence; submission shape is structurally impossible without >=1.
   - C3 self-boundary: consent record is required when reporting on
     behalf of another person/business.
   - C6 data minimisation: the kit stores/derives nothing beyond the
     case fields passed in; it never joins to natural persons."
  (:require [clojure.string :as str]))

(def schema-version "kotoba-fake-report-case-2026-09-v1")

(def non-adjudicating true)

(def platforms #{:facebook :linkedin :line})
(def kinds #{:person :business})

;; C1: phrases that would constitute a verdict are banned from every
;; generated draft. The test suite pins this list.
(def forbidden-adjudication-phrases
  ["確定しています" "確定しました" "確実に偽" "definitely fake" "confirmed fake"
   "confirmed impersonator" "guaranteed" "proven fake" "it is certain"])

;; Data-driven draft templates (ADR Consequences: form structure changes,
;; so items and URLs stay data, editable without touching the generator).
(def form-specs
  {:facebook
   {:form-name "Impersonation report (Facebook Help Center)"
    :form-url "https://www.facebook.com/help/contact/1694868161277513"
    ::locale-of-form :en
    :fields
    [[:reporting-relation "What is your relationship to the account being impersonated?" :relation-field]
     [:impostered-name "Full name of the person/business being impersonated" :display-name]
     [:impostered-url "Link to the genuine profile/page" :official-url]
     [:suspect-url "Link to the impersonating profile" :suspect-url]
     [:description "What is happening (describe the impersonation)" :description]]
    :steps
    ["Open the form in your own browser (no auto-send exists in this app)."
     "Attach your saved screenshot(s) as form attachments when asked."
     "Paste each answer below into the matching field."
     "Keep your own copy of the evidence until the platform responds."]}
   :linkedin
   {:form-name "Impersonation report (LinkedIn Safety Center)"
    :form-url "https://www.linkedin.com/help/linkedin/ask/tsb-impersonation"
    ::locale-of-form :en
    :fields
    [[:reporting-relation "How are you related to the impersonated party?" :relation-field]
     [:impostered-name "Name of the profile being impersonated" :display-name]
     [:impostered-url "URL of the authentic profile" :official-url]
     [:suspect-url "URL of the impersonating profile" :suspect-url]
     [:description "Additional details" :description]]
    :steps
    ["Open the Safety Center form in your own browser."
     "Paste the URL evidence and upload screenshots as prompted."
     "Paste each answer below into the matching field."]}
   :line
   {:form-name "LINE in-app report + legal desk fallback"
    :form-url "https://terms.line.me/legal/"
    ::locale-of-form :ja
    :fields
    [[:reporting-relation "通報者と偽装されている対象の関係" :relation-field]
     [:impostered-name "偽装されているアカウントの表示名" :display-name]
     [:impostered-url "正規アカウントの URL / 公開ページ" :official-url]
     [:suspect-url "偽アカウントの URL または LINE ID" :suspect-url]
     [:description "なりすましの内容" :description]]
    :steps
    ["LINE アプリ内の「通報」経路をまず使ってください (アプリ内通報が正規経路です)。"
     "解決しない場合のみ、下記 EML ドラフトをLINE法務窓口への fallback として自分のメールソフトから送信してください。"
     "スクリーンショット証拠は添付として自分の手で追加してください。"]}})

;; ---------------------------------------------------------------- validation

(defn- nonempty-str? [x max]
  (and (string? x) (pos? (count x)) (<= (count x) max) (re-find #"\S" x)))

(defn- timestamp? [x]
  (and (or (string? x) (int? x)) (not (nil? x))))

(defn- evidence-entry? [e]
  (and (map? e)
       (or (nonempty-str? (:cid e) 200) (nonempty-str? (:url e) 2000))
       (timestamp? (:taken-at e))
       (contains? #{:screenshot :url :other} (or (:kind e) :other))))

(defn validate-case
  "C2/C3 structural gate. Returns {:ok case} or {:errors [..]}.
   Pure. Never throws."
  [case]
  (try
    (let [errs (cond-> []
                 (not (map? case)) (conj "case must be a map")
                 (and (map? case) (not= (:case/schema case) schema-version))
                 (conj (str "unexpected :case/schema, expected " schema-version))
                 (and (map? case) (not (contains? platforms (:case/platform case))))
                 (conj "invalid :case/platform")
                 (and (map? case)
                      (not (and (map? (:case/suspect case))
                                (nonempty-str? (:handle (:case/suspect case)) 200)
                                (nonempty-str? (:url (:case/suspect case)) 2000)
                                (timestamp? (:taken-at (:case/suspect case))))))
                 (conj "invalid :case/suspect (handle, url, taken-at required)")
                 (and (map? case)
                      (not (and (map? (:case/impostered case))
                                (nonempty-str? (:display-name (:case/impostered case)) 200)
                                (nonempty-str? (:official-url (:case/impostered case)) 2000)
                                (contains? kinds (:kind (:case/impostered case))))))
                 (conj "invalid :case/impostered (display-name, official-url, kind required)")
                 (and (map? case)
                      (not (vector? (:case/evidence case))))
                 (conj ":case/evidence must be a vector")
                 (and (map? case) (vector? (:case/evidence case))
                      (not (<= 1 (count (:case/evidence case)))))
                 (conj "C2: at least one evidence item is required")
                 (and (map? case) (vector? (:case/evidence case))
                      (some (complement evidence-entry?) (:case/evidence case)))
                 (conj "invalid evidence entry (cid-or-url + taken-at + kind required)")
                 (and (map? case) (:case/on-behalf case)
                      (not (and (map? (:case/consent case))
                                (nonempty-str? (:statement (:case/consent case)) 2000)
                                (nonempty-str? (:proof-url (:case/consent case)) 2000))))
                 (conj "C3: on-behalf reporting requires a consent record (statement + proof-url)"))]
      (if (seq errs) {:errors errs} {:ok case}))
    (catch #?(:clj Exception :cljs js/Error) e
      {:errors [(str "validation failed: " (str (ex-message e)))]})))

;; ------------------------------------------------------------ draft build

(defn- relation-text [case]
  (if (:case/on-behalf case)
    "I manage the authentic account of the person/business being impersonated, with their consent."
    "I am the person/business being impersonated."))

(defn- description-text [case]
  (let [imp (:case/impostered case)
        sus (:case/suspect case)
        kind-word (if (= :person (:kind imp)) "person" "business")]
    (str "A profile appears to use the name of a " kind-word
         " (\"" (:display-name imp) "\"). The authentic page is at "
         (:official-url imp) ". The suspect profile is at " (:url sus)
         ". I am not asking the platform to reach a final verdict; I ask for its own review of this report.")))

(defn- field-values
  "Data-driven: fills :relation-field / :display-name / :official-url /
   :suspect-url / :description. Signal observations (C1) stay separate."
  [case]
  (let [imp (:case/impostered case)
        sus (:case/suspect case)]
    {:relation-field (relation-text case)
     :display-name (:display-name imp)
     :official-url (:official-url imp)
     :suspect-url (:url sus)
     :description (description-text case)}))

(defn build-draft
  "Pure. Returns {:ok draft} with :fields (label/value pairs for the data
   -driven form spec), :steps, :guide (evidence handling), :caveat
   (non-adjudicating wording), and for :line the :eml fallback. Takes a
   validated case. Returns {:errors [..]} for invalid input (C2 holds here
   too: no evidence, no draft)."
  [case]
  (let [v (validate-case case)]
    (if (:errors v)
      v
      (let [platform (:case/platform case)
            spec (get form-specs platform)
            values (field-values case)
            fields (mapv (fn [[id label src]]
                           {:id (name id) :label label :value (get values src)})
                         (:fields spec))
            caveat (if (= :ja (::locale-of-form spec))
                     "本ドラフトは参考表示です。偽アカウントであることの確定ではありません。判定は各プラットフォームの審査が行います。"
                     "This draft is reference material. It is not a determination that the account is fake; the platform conducts its own review.")
            base {:platform platform
                  :schema schema-version
                  :form-name (:form-name spec)
                  :form-url (:form-url spec)
                  :fields fields
                  :steps (:steps spec)
                  :evidence (mapv (fn [e] (select-keys e [:cid :url :taken-at :kind]))
                                  (:case/evidence case))
                  :caveat caveat
                  ::locale (::locale-of-form spec)}]
        {:ok (if (= :line platform)
               (assoc base :eml
                      {:subject (str "[Impersonation report] " (:display-name (:case/impostered case)))
                       :body (str/join "\n"
                                       (mapv (fn [{:keys [label value]}] (str label ": " value)) fields))
                       :attachments "evidence screenshots, added manually by the reporter"})
               base)}))))

(defn contains-forbidden-phrase?
  "C1 support: true when a draft map (stringified shallowly) contains any
   banned adjudication phrase."
  [draft]
  (let [texts (mapcat (fn [[k v]] (if (string? v) [v] []))
                      (select-keys draft [:caveat :form-name :form-url]))
        texts (concat texts
                      (mapcat (fn [f] [(:label f) (:value f)]) (:fields draft))
                      (:steps draft)
                      (when-let [b (:body (:eml draft))] [b])
                      (when-let [s (:subject (:eml draft))] [s]))
        lower (fn [x] (str/lower-case x))]
    (boolean
     (some (fn [text]
             (some (fn [phrase] (str/includes? (lower text) (lower phrase)))
                   forbidden-adjudication-phrases))
           texts))))
