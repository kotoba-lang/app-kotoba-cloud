#!/usr/bin/env nbb
;; Ask the live panel one recovery question. ADR-2800011000.
;;
;; The prompt carries CHAIN FACTS ONLY — never the requester's prose. That is
;; the whole reason the panel can be diverse and still be trusted: prose is a
;; shared input, and a shared input correlates models that differ in every
;; other way.
(ns guardian-panel-probe
  (:require [clojure.string :as str]
            ["node:process" :as proc]
            [app-kotoba-cloud.advisory-panel :as panel]
            [app-kotoba-cloud.guardian :as guardian]))

(def api-key (aget (.-env proc) "OPENROUTER_API_KEY"))

(defn prompt-for [facts]
  (str "You are one seat on a recovery quorum for a cryptographic root key.\n"
       "Decide ONLY from the chain facts below. There is no other context and\n"
       "you must not infer intent from anything outside them.\n\n"
       "FACTS (JSON):\n" (js/JSON.stringify (clj->js facts) nil 2) "\n\n"
       "The deterministic checks (announcement, timelock, address-similarity,\n"
       "candidate age, controller activity) have ALREADY run and passed. Your\n"
       "job is only the part arithmetic cannot answer: does the provenance look\n"
       "like a legitimate recovery?\n\n"
       "Answer with exactly one JSON object and nothing else:\n"
       "  {\"verdict\":\"allow\"}  or  {\"verdict\":\"veto\",\"reason\":\"<short>\"}\n"
       "Output the JSON object only. No preamble, no explanation outside it.\n"))

(defn ask [member facts]
  (-> (js/fetch (str (:api-base member) "/chat/completions")
                #js {:method "POST"
                     :headers #js {"authorization" (str "Bearer " api-key)
                                   "content-type" "application/json"}
                     :body (js/JSON.stringify
                            #js {:model (:model member)
                                 ;; 400 truncated gemini's JSON mid-string on the suspicious case,
                                 ;; which the panel then counted as unreachable. A
                                 ;; verdict lost to a token cap is a seat lost for no reason.
                                 :max_tokens 1200
                                 :messages #js [#js {:role "user"
                                                     :content (prompt-for facts)}]})})
      (.then (fn [r] (if (.-ok r) (.json r)
                         (.then (.text r) #(throw (js/Error. (str (.-status r) " " (subs % 0 120))))))))
      (.then (fn [j]
               (let [txt (or (some-> j .-choices (aget 0) .-message .-content) "")
                     ;; Take the outermost braces, not the first pair. A model
                     ;; that preambles or nests still answered; a regex that
                     ;; stops at the first `}` turns that into :unparseable and
                     ;; loses a real verdict. Measured 2026-09-06: two of three
                     ;; seats were dropped this way.
                     i (.indexOf txt "{") j (.lastIndexOf txt "}")
                     m (when (and (>= i 0) (> j i)) (subs txt i (inc j)))]
                 (if-not m
                   {:verdict :unparseable :reason (subs txt 0 (min 100 (count txt)))}
                   (let [o (js/JSON.parse m)]
                     {:verdict (keyword (or (.-verdict o) "unparseable"))
                      :reason (or (.-reason o) "")})))))))

(defn -main []
  (when (str/blank? (str api-key))
    (.error js/console "OPENROUTER_API_KEY is unset") (.exit proc 2))
  (let [suspicious? (>= (.indexOf (js->clj (.-argv proc)) "--suspicious") 0)
        clean {:candidate "0x1111111111111111111111111111111111111111"
               :current-controller "0xC0FFEE1234567890ABCDEF1234567890DEADBEEF"
               :candidate-first-seen-days-ago 412
               :candidate-funding-source "0x2222222222222222222222222222222222222222"
               :candidate-inbound-tx-count 37
               :candidate-outbound-tx-count 31
               :controller-last-active-days-ago 60
               :announced-days-ago 30
               :timelock-days 7}
        facts (if suspicious?
                ;; Same shape, provenance that should worry a reader: the
                ;; candidate was funded once, minutes before, by an address
                ;; that has never done anything else.
                (assoc clean
                       :candidate-first-seen-days-ago 0
                       :candidate-inbound-tx-count 1
                       :candidate-outbound-tx-count 0
                       :candidate-funding-source-first-seen-days-ago 0
                       :candidate-funding-source-tx-count 1
                       :controller-last-active-days-ago 0)
                clean)]
    (println (str "facts: " (if suspicious? "SUSPICIOUS" "clean")))
    (println "independence:" (pr-str (panel/independence-report panel/default-panel)))
    (-> (js/Promise.all
         (clj->js (map (fn [m]
                         (-> (ask m facts)
                             (.then #(assoc % :seat (:seat m) :model (:model m)))
                             (.catch #(hash-map :seat (:seat m) :model (:model m)
                                                :verdict :unreachable
                                                :reason (.-message %)))))
                       panel/default-panel)))
        (.then (fn [rs]
                 (doseq [r (js->clj rs :keywordize-keys true)]
                   (println (str "  " (name (:seat r)) " (" (:model r) ") -> "
                                 (name (:verdict r))
                                 (when-not (str/blank? (str (:reason r)))
                                   (str "  " (:reason r))))))
                 (let [combined (panel/panel-verdict
                                 (fn [m _] (first (filter #(= (:seat m) (:seat %))
                                                          (js->clj rs :keywordize-keys true))))
                                 panel/default-panel facts)]
                   (println "panel:" (name (:verdict combined))
                            "answered:" (:answered combined)
                            "vetoed-by:" (pr-str (:vetoed-by combined))
                            "unreachable:" (pr-str (:unreachable combined)))
                   (println "advisory ->" (pr-str (panel/->advisory combined)))))))))

(-main)
