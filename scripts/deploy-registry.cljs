#!/usr/bin/env nbb
;; Deploy DelegationRootRegistry. ADR-2800011000.
;;
;; Reads its credential from the environment and never from the repo, the way
;; kotobase-anchor-fevm/scripts/deploy-calibration.mjs does. nbb rather than
;; .mjs because CLAUDE.md's runtime-priority section says new Node-side scripts
;; are written in nbb.
;;
;; Base Sepolia first and mainnet only behind an explicit flag: a registry is
;; pinned by everyone who reads it, so a mainnet address published early is one
;; that cannot be taken back by editing a file.
(ns deploy-registry
  (:require [clojure.string :as str]
            ["node:child_process" :as cp]
            ["node:process" :as proc]))

(def chains
  {"base-sepolia" {:id 84532 :rpc "https://sepolia.base.org"
                   :explorer "https://sepolia.basescan.org"}
   "base"         {:id 8453  :rpc "https://mainnet.base.org"
                   :explorer "https://basescan.org"}})

(def argv (vec (drop 2 (js->clj (.-argv proc)))))
(defn- opt [f d] (let [i (.indexOf argv f)] (if (neg? i) d (nth argv (inc i) d))))
(defn- flag? [f] (>= (.indexOf argv f) 0))

(defn- die [msg] (.error js/console msg) (.exit proc 2))

(defn -main []
  (let [network (opt "--network" "base-sepolia")
        chain (get chains network)
        _ (when-not chain
            (die (str "unknown --network " network
                      " (known: " (str/join ", " (keys chains)) ")")))
        _ (when (and (= network "base") (not (flag? "--i-mean-mainnet")))
            (die (str "refusing to deploy to Base mainnet without --i-mean-mainnet.\n"
                      "A registry address is pinned by its readers; publishing one\n"
                      "early cannot be undone by editing a file.")))
        ;; kagi first, environment second. The key belongs in a vault that
        ;; records every reveal, and reading it here keeps it out of argv, out
        ;; of the shell history and out of any file — `kagi get` writes to a
        ;; pipe and forge takes it on stdin.
        kagi-item (opt "--kagi" nil)
        key-var (opt "--key-env" "REGISTRY_DEPLOYER_PRIVATE_KEY")
        pk (if kagi-item
             (let [kagi (opt "--kagi-bin"
                             (str (aget (.-env proc) "HOME")
                                  "/github/com-junkawasaki/orgs/kotoba-lang/kagi/bin/kagi"))
                   r (cp/spawnSync kagi #js ["get" kagi-item] #js {:encoding "utf8"})]
               (when-not (zero? (or (.-status r) 1))
                 (die (str "kagi get " kagi-item " failed:\n" (.-stderr r))))
               (str/trim (str (.-stdout r))))
             (aget (.-env proc) key-var))
        _ (when (str/blank? (str pk))
            (die (str "no deployer key.\n"
                      "  --kagi <item>   read it from the kagi vault (preferred)\n"
                      "  " key-var "  or export it\n"
                      "For " network ", the item this workspace records is\n"
                      "  kotoba-cloud-registry-deployer-base-sepolia")))
        rpc (or (aget (.-env proc) "REGISTRY_RPC_URL") (:rpc chain))
        dry? (flag? "--dry-run")
        ;; Relative to --root, not to the cwd. The first version passed
        ;; contracts/src/... together with --root contracts and forge looked for
        ;; contracts/contracts/src/... — which --dry-run could not catch, because
        ;; a dry run proves the credential path and never invokes forge.
        args ["create" "src/DelegationRootRegistry.sol:DelegationRootRegistry"
              ;; forge 1.7 does NOT send without --broadcast, and it exits 0
              ;; either way. The first run of this script reported success while
              ;; the log said "Dry run enabled, not broadcasting transaction".
              "--broadcast"
              "--rpc-url" rpc "--private-key" pk "--root" "contracts"]]
    (println (str "network=" network " chainId=" (:id chain) " rpc=" rpc
                  " key-from=" (if kagi-item (str "kagi:" kagi-item) key-var)
                  (when dry? " (dry-run)")))
    (if dry?
      (do (println "dry-run: not sending. Re-run without --dry-run to deploy.")
          ;; Resolve the artifact the real run would use, so a path that only
          ;; breaks under forge is caught here rather than during a deploy.
          (let [r (cp/spawnSync "forge" #js ["build" "--root" "contracts"]
                                #js {:encoding "utf8"})]
            (when-not (zero? (or (.-status r) 1))
              (die (str "forge build failed under --root contracts:\n" (.-stderr r))))
            (println "dry-run: contracts build under --root contracts OK")))
      (let [r (cp/spawnSync "forge" (clj->js args) #js {:encoding "utf8"})]
        (println (.-stdout r))
        (when-not (zero? (or (.-status r) 1))
          (die (str "forge create failed:\n" (.-stderr r))))
        (let [out (str (.-stdout r))
              addr (second (re-find #"Deployed to:\s*(0x[0-9a-fA-F]{40})" out))]
          ;; An exit code is not a deployment. Ask the chain whether code is
          ;; actually at the address before saying the word.
          (when-not addr (die "forge printed no `Deployed to:` — nothing was broadcast"))
          ;; Retry: the first version asked once, immediately, and reported
          ;; "the transaction did not land" for a deployment that had. An RPC
          ;; that has not caught up is not a chain that rejected the tx, and a
          ;; check that cannot tell those apart is worse than no check.
          (let [code (loop [n 0]
                       (let [c (cp/spawnSync "cast" #js ["code" addr "--rpc-url" rpc]
                                             #js {:encoding "utf8"})
                             out (str/trim (str (.-stdout c)))]
                         (cond
                           (and (not (str/blank? out)) (not= "0x" out)) out
                           (>= n 10) out
                           :else (do (cp/spawnSync "sleep" #js ["2"]) (recur (inc n))))))]
            (when (or (str/blank? code) (= "0x" code))
              (die (str "no code at " addr " after 10 retries — the transaction did not land")))
            (println (str "deployed: " addr))
            (println (str "code size: " (quot (- (count code) 2) 2) " bytes"))
            (println (str "explorer: " (:explorer chain) "/address/" addr))))))))

(-main)
