(ns app-kotoba-cloud.guardian
  "What a guardian decides, and how much of it needs a model.

  ADR-2800011000. A guardian answers one question about a standing recovery
  proposal: should this candidate be allowed to become the controller. It reads
  chain facts and the announcement, never the requester's prose — prose is a
  shared input, and a shared input correlates guardians that are otherwise
  diverse in model, API and credential.

  ## Most of the poisoning check does not need a model

  The owner's argument for agent guardians was that a model beats a human at
  spotting address poisoning. That is true of the human comparison and it is
  worth being precise about why: the attack works because a person compares the
  first and last few characters. But comparing the first and last few characters
  is *arithmetic*, and `similarity` below does it exactly, on twenty bytes, with
  no model at all.

  So the deterministic core answers the poisoning question, and it answers it
  the same way in every guardian — which is what makes three verdicts
  comparable. What a model adds is the part that is not arithmetic: whether a
  funding source or an interaction history looks like a legitimate recovery.
  That arrives through `advisory`, and it can only ever add a veto.

  ## An advisory verdict can veto and cannot clear

  `decide` takes the deterministic facts and an optional model verdict. A model
  that says allow does not overturn a deterministic veto, and a model that says
  veto is honoured. The composition is one-directional on purpose: a jailbroken
  or hallucinating guardian can then cost a delay and never a root, which is the
  same asymmetry the contract encodes by making veto the agent's authority.

  ## Reason codes are the contract's vocabulary

  The contract requires a non-zero reason code and emits it, so a refusal can be
  re-checked by a third party from chain data. `reason-codes` is that vocabulary;
  a verdict carrying a reason outside it is not reportable and `decide` will not
  produce one."
  (:require [clojure.string :as str]))

(def reason-codes
  "Every refusal this namespace can produce. The contract stores keccak256 of
  these strings; keeping the plaintext here is what lets a reader of the chain
  turn an emitted code back into a claim they can check."
  #{"not-announced"
    "timelock-not-elapsed"
    "address-poisoning-suspected"
    "candidate-too-new"
    "controller-still-active"
    "advisory-veto"})

(def default-policy
  "Thresholds a guardian applies. Named and passed rather than inlined, because
  three guardians that silently disagree about a threshold produce three
  verdicts that cannot be compared."
  {;; Leading or trailing hex characters shared with the current controller.
   ;; Poisoning kits mine addresses to match a prefix AND suffix, which is why
   ;; both ends are counted and either end alone can trip it.
   :poisoning-affix-chars 6
   ;; An address first seen this recently has no history to have investigated.
   :min-candidate-age-sec (* 30 24 60 60)
   ;; If the controller signed this recently, the premise of a recovery — that
   ;; the key is lost — is not visible on chain.
   :controller-active-within-sec (* 7 24 60 60)})

(defn- normalize [addr]
  (some-> addr str str/lower-case (str/replace #"^0x" "")))

(defn similarity
  "Shared leading and trailing hex characters between two addresses.

  -> `{:prefix n :suffix n}`. Case-insensitive and 0x-insensitive, because an
  attacker choosing a confusable address is not obliged to match the caller's
  formatting."
  [a b]
  (let [a (normalize a) b (normalize b)]
    (if (or (str/blank? a) (str/blank? b))
      {:prefix 0 :suffix 0}
      (let [n (min (count a) (count b))
            pre (count (take-while true? (map = (seq a) (seq b))))
            suf (count (take-while true? (map = (reverse (seq a)) (reverse (seq b)))))]
        {:prefix (min pre n) :suffix (min suf n)}))))

(defn poisoning-suspect?
  "Whether `candidate` is confusable with `current` at the policy's threshold.

  Either end alone is enough. A kit that matches only the prefix still defeats a
  human who checks the prefix, and requiring both would make the check weaker
  than the attack it is named for."
  [{:keys [poisoning-affix-chars]} current candidate]
  (let [{:keys [prefix suffix]} (similarity current candidate)]
    (and (not= (normalize current) (normalize candidate))
         (or (>= prefix poisoning-affix-chars)
             (>= suffix poisoning-affix-chars)))))

(defn deterministic-verdict
  "The part every guardian must agree on, computed from chain facts alone.

  `facts` is `{:candidate :current-controller :announced-at :now :timelock
  :candidate-first-seen :controller-last-active}`. Times are seconds.

  -> `{:verdict :allow}` or `{:verdict :veto :reason code :detail {…}}`.

  Absent optional facts do not clear a check they could not run: an unknown
  `:candidate-first-seen` is treated as unknown-and-therefore-too-new, because
  the alternative is that a guardian which failed to look answers the same as
  one that looked and was satisfied."
  [policy {:keys [candidate current-controller announced-at now timelock
                  candidate-first-seen controller-last-active]}]
  (let [{:keys [min-candidate-age-sec controller-active-within-sec]} policy]
    (cond
      (or (nil? announced-at) (zero? announced-at))
      {:verdict :veto :reason "not-announced"}

      (< now (+ announced-at timelock))
      {:verdict :veto :reason "timelock-not-elapsed"
       :detail {:usable-at (+ announced-at timelock) :now now}}

      (poisoning-suspect? policy current-controller candidate)
      {:verdict :veto :reason "address-poisoning-suspected"
       :detail (similarity current-controller candidate)}

      (or (nil? candidate-first-seen)
          (< (- now candidate-first-seen) min-candidate-age-sec))
      {:verdict :veto :reason "candidate-too-new"
       :detail {:first-seen candidate-first-seen
                :age (when candidate-first-seen (- now candidate-first-seen))}}

      (and controller-last-active
           (< (- now controller-last-active) controller-active-within-sec))
      {:verdict :veto :reason "controller-still-active"
       :detail {:last-active controller-last-active}}

      :else {:verdict :allow})))

(defn decide
  "The guardian's verdict. `advisory` is an optional model verdict.

  An advisory may add a veto and may not remove one. A model that answers
  `:allow` changes nothing; a model that answers `:veto` is honoured under the
  `advisory-veto` code, with its stated reason carried in `:detail` for a reader
  rather than as the reportable code — the contract's vocabulary is fixed, and a
  model that could mint new codes could mint one nobody can check."
  [policy facts advisory]
  (let [d (deterministic-verdict policy facts)]
    (cond
      (= :veto (:verdict d)) d
      (= :veto (:verdict advisory))
      {:verdict :veto :reason "advisory-veto"
       :detail {:model (:model advisory) :stated (:reason advisory)}}
      :else d)))

(defn reportable?
  "Whether a verdict can be sent to the contract.

  The contract refuses a zero reason code, so a veto this namespace cannot name
  is one that would revert on submission — better to catch it here than to
  discover it as a failed transaction during a recovery."
  [{:keys [verdict reason]}]
  (case verdict
    :allow true
    :veto (contains? reason-codes reason)
    false))
