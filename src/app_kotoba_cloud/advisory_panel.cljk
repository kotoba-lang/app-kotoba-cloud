(ns app-kotoba-cloud.advisory-panel
  "Three models asked the same question, and how many seats that actually is.

  ADR-2800011000 D2. A guardian panel gets its independence from diversity along
  three axes — model, API endpoint, credential — and the seats collapse to the
  count of distinct (endpoint, credential) pairs, not the count of models. Three
  models behind one aggregator and one key is one seat wearing three names.

  The owner's decision (2026-09-06) is to start on OpenRouter with claude, gpt
  and gemini and split the endpoints later. That is a reasonable order to build
  in and a dangerous one to forget, so `independence` computes the real number
  and `panel-verdict` carries it in every result. Nothing here refuses to run at
  independence 1 — refusing would just mean the panel is never exercised — but
  nothing here lets a caller print `3 guardians` either.

  ## Any member may veto; none may clear

  The panel's verdict is the disjunction of its members' vetoes. That follows
  from `guardian/decide`, where an advisory adds a veto and never removes one:
  if a single member could clear, then compromising the weakest member would be
  enough, and the panel would be as strong as its worst seat rather than its
  best.

  A member that errored is not a member that allowed. `:unreachable` is carried
  through and counted, because a panel that could not ask is not a panel that
  asked and was satisfied.

  ## This namespace owns no HTTP

  `ask` is injected: `(fn [member prompt] -> {:verdict … :reason …})`. The same
  split `biscuit.token` makes for crypto, and for the same reason — a test must
  be able to answer for a model without a network."
  (:require [kotoba.lang.text :as str]))

(def openrouter-base "https://openrouter.ai/api/v1")

(def default-panel
  "The starting panel. One base and one credential, on purpose and for now.

  `credential-ref` names where the key is read from, not the key. Two members
  sharing a ref share a failure, which is what `independence` counts."
  [{:seat :claude :model "anthropic/claude-sonnet-5"
    :api-base openrouter-base :credential-ref "env:OPENROUTER_API_KEY"}
   {:seat :gpt :model "openai/gpt-5.6-luna-pro"
    :api-base openrouter-base :credential-ref "env:OPENROUTER_API_KEY"}
   {:seat :gemini :model "google/gemini-3.8-flash"
    :api-base openrouter-base :credential-ref "env:OPENROUTER_API_KEY"}])

(defn independence
  "How many independent seats a panel actually has.

  Distinct (api-base, credential-ref) pairs. Model diversity is real and is what
  makes a shared jailbreak less likely, but it does not survive the endpoint
  being replaced or the key being taken, so it is not what this counts."
  [panel]
  (count (distinct (map (juxt :api-base :credential-ref) panel))))

(defn independence-report
  "What a caller may honestly say about this panel."
  [panel]
  (let [seats (count panel)
        indep (independence panel)]
    {:seats seats
     :independence indep
     :fully-independent? (= seats indep)
     :distinct-models (count (distinct (map :model panel)))
     :shared
     (cond-> []
       (> seats (count (distinct (map :api-base panel)))) (conj :api-base)
       (> seats (count (distinct (map :credential-ref panel)))) (conj :credential-ref))}))

(defn- member-verdict
  "One member's answer, normalized. Anything that is not a clean veto or allow
  becomes `:unreachable` — a model that returned nonsense is one that did not
  answer, and treating it as allow is the failure this whole panel exists to
  avoid."
  [ask member facts]
  (let [r (try (ask member facts)
               (catch #?(:clj Exception :cljs :default) e
                 {:verdict :unreachable :reason (str #?(:clj (.getMessage ^Exception e)
                                                        :cljs (.-message e)))}))]
    (assoc (case (:verdict r)
             :veto {:verdict :veto :reason (str (:reason r))}
             :allow {:verdict :allow}
             {:verdict :unreachable :reason (str (:reason r))})
           :seat (:seat member) :model (:model member))))

(defn panel-verdict
  "Ask every member and combine. -> `{:verdict :veto|:allow :members [...] :independence …}`.

  `:veto` when any member vetoed. Otherwise `:allow`, with `:unreachable` seats
  reported rather than silently counted as agreement — the caller decides
  whether a panel that half-answered is one it wants to act on."
  [ask panel facts]
  (let [members (mapv #(member-verdict ask % facts) panel)
        vetoes (filterv #(= :veto (:verdict %)) members)
        unreachable (filterv #(= :unreachable (:verdict %)) members)
        answered (- (count members) (count unreachable))]
    (merge (independence-report panel)
           {;; `:no-answer` is a third value on purpose. Measured 2026-09-06
            ;; against the live panel: all three seats failed (one model id was
            ;; not routable, two replied in prose) and the verdict came back
            ;; `:allow` with `:answered 0`. A caller reading the verdict alone
            ;; would have acted on a panel that said nothing — the exact shape
            ;; where not-measured is indistinguishable from measured-and-fine.
            :verdict (cond (seq vetoes) :veto
                           (zero? answered) :no-answer
                           :else :allow)
            :members members
            :vetoed-by (mapv :seat vetoes)
            :unreachable (mapv :seat unreachable)
            :answered answered})))

(defn ->advisory
  "The panel result in the shape `guardian/decide` accepts.

  Only a veto crosses over. `guardian/decide` will not let an advisory clear a
  deterministic veto, so passing `:allow` through would be inert anyway — saying
  so here keeps the two namespaces from appearing to disagree about who decides."
  [{:keys [verdict vetoed-by members]}]
  (when (= :veto verdict)
    {:verdict :veto
     :model (str/join "," (map name vetoed-by))
     :reason (or (some #(when (= :veto (:verdict %)) (:reason %)) members)
                 "panel veto")}))
