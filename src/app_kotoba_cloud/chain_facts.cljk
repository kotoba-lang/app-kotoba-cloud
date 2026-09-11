(ns app-kotoba-cloud.chain-facts
  "The facts a guardian decides from, and an honest account of which ones this
  node could not obtain.

  ADR-2800011000 D4. `guardian/deterministic-verdict` and the advisory panel both
  take facts and neither produces them; this is the missing half. It reads Base
  through a plain JSON-RPC endpoint and the registry through `eth_call`.

  ## Some facts a plain RPC cannot give, and that is reported rather than filled in

  Outbound transaction count, balance and contract-ness come from the node.
  First-seen and funding source do not: they need an index over history, which a
  public RPC will not do and which this workspace has no explorer credential
  for (measured 2026-09-06: BASESCAN_API_KEY and ETHERSCAN_API_KEY are unset).

  So `read` returns `:unavailable`, a set naming every fact it could not get, and
  it leaves those keys ABSENT from the facts map rather than present-and-nil or
  present-and-zero. That matters because `guardian/deterministic-verdict` treats
  an unknown `:candidate-first-seen` as too-new and vetoes: absent is the input
  that produces the safe answer, while zero would read as an address first seen
  at the epoch and sail through.

  ⚠ **The operational consequence is that an unindexed node vetoes everything.**
  That is fail-safe and it is not free — a recovery cannot complete on a panel
  whose facts nobody can supply. Naming `:unavailable` is what lets an operator
  see that the refusal is about the node and not about the candidate, instead of
  reading three vetoes as three independent judgements about the address.

  ## This namespace owns no HTTP

  `rpc` is injected: `(fn [method params] -> result-or-throw)`."
  (:require [kotoba.lang.text :as str]))

(def indexed-facts
  "Facts that need an index over history, not a node.

  Kept as data so `read` cannot drift from what it claims it could not do."
  #{:candidate-first-seen :candidate-funding-source :candidate-inbound-tx-count
    :controller-last-active})

(defn- hex->long [s]
  (when (and (string? s) (str/starts-with? s "0x"))
    #?(:clj (Long/parseLong (subs s 2) 16)
       :cljs (js/parseInt (subs s 2) 16))))

(defn- pad32 [addr]
  (let [a (str/replace (str/lower (str addr)) #"^0x" "")]
    (str (apply str (repeat (- 64 (count a)) "0")) a)))

(def announced-at-selector
  "keccak256(\"announcedAt(bytes32,address)\")[0:4].

  Hard-coded rather than computed: this namespace has no keccak, and adding one
  to derive a constant that never changes would be a dependency bought for
  nothing.

  It is pinned on the Solidity side instead —
  `test_theSelectorTheOffchainReaderHardcodesIsTheRealOne` computes the keccak
  natively and asserts this value. That test exists because the first version of
  this constant was INVENTED rather than computed, and nothing in a Clojure test
  suite would have noticed: a wrong selector produces a well-formed eth_call that
  returns empty, which this namespace would have reported as an unavailable fact
  rather than as a bug."
  "0x4ddf26c7")

(defn announced-at-call
  "`eth_call` params for the registry's announcedAt(subject, candidate)."
  [registry subject candidate]
  [{:to registry
    :data (str announced-at-selector (pad32 subject) (pad32 candidate))}
   "latest"])

(defn read
  "Gather what this node can answer. -> `{:facts {…} :unavailable #{…} :errors {…}}`.

  Every key in `:unavailable` is absent from `:facts`. A caller that merges this
  into a guardian's input therefore gets the safe verdict for anything the node
  could not see, without this namespace deciding on the guardian's behalf."
  [rpc {:keys [registry subject candidate current-controller now]}]
  (let [errors (atom {})
        try-rpc (fn [k method params]
                  (try (rpc method params)
                       (catch #?(:clj Exception :cljs :default) e
                         (swap! errors assoc k (str #?(:clj (.getMessage ^Exception e)
                                                       :cljs (.-message e))))
                         nil)))
        announced (some-> (try-rpc :announced-at "eth_call"
                                   (announced-at-call registry subject candidate))
                          hex->long)
        nonce (some-> (try-rpc :candidate-outbound-tx-count "eth_getTransactionCount"
                               [candidate "latest"])
                      hex->long)
        code (try-rpc :candidate-code "eth_getCode" [candidate "latest"])
        base (cond-> {:candidate candidate
                      :current-controller current-controller
                      :now now}
               (some? announced) (assoc :announced-at announced)
               (some? nonce) (assoc :candidate-outbound-tx-count nonce)
               (some? code) (assoc :candidate-is-contract? (not= code "0x")))
        failed (set (keys @errors))]
    {:facts base
     ;; Both what the node refused and what no node could give.
     :unavailable (into indexed-facts failed)
     :errors @errors}))

(defn merge-into-guardian-facts
  "Combine chain facts with a timelock and hand the guardian its input.

  Nothing from `:unavailable` is invented here. The point of this function is
  that it is short: if it ever needs to decide what to do about a missing fact,
  that decision belongs in the guardian and not in the reader."
  [{:keys [facts]} timelock]
  (assoc facts :timelock timelock))
