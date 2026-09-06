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
        args ["create" "contracts/src/DelegationRootRegistry.sol:DelegationRootRegistry"
              "--rpc-url" rpc "--private-key" pk "--root" "contracts"]]
    (println (str "network=" network " chainId=" (:id chain) " rpc=" rpc
                  " key-from=" (if kagi-item (str "kagi:" kagi-item) key-var)
                  (when dry? " (dry-run)")))
    (if dry?
      (println "dry-run: not sending. Re-run without --dry-run to deploy.")
      (let [r (cp/spawnSync "forge" (clj->js args) #js {:stdio "inherit"})]
        (when-not (zero? (or (.-status r) 1))
          (die "forge create failed"))
        (println (str "explorer: " (:explorer chain)))))))

(-main)
