(ns app-kotoba-cloud.pq-key-lifecycle
  "Pure, fail-closed lifecycle for Principal-pinned ML-DSA keys.")

(def version 1)
(def max-used-requests 2048)
(def max-history 256)

(defn- fail! [reason]
  (throw (ex-info (name reason) {:reason reason :status 409})))

(defn- bounded-string? [value maximum]
  (and (string? value) (pos? (count value)) (<= (count value) maximum)))

(defn- append-history [state event]
  (update state :history
          (fn [history]
            (vec (take-last max-history (conj (vec history) event))))))

(defn normalize
  "Upgrade the original one-key binding in place. Unknown shapes fail closed."
  [state]
  (cond
    (nil? state) nil
    (= version (:version state)) state
    (and (bounded-string? (:keyId state) 128)
         (bounded-string? (:publicKey state) 4096))
    {:version version :epoch 1 :status :active
     :key-id (:keyId state) :public-key (:publicKey state)
     :used-requests {} :transition-ids {}
     :history [{:action :legacy-binding-imported :epoch 1}]}
    :else (fail! :pqc-key-state-invalid)))

(defn admit-publication
  [state {:keys [key-id public-key key-epoch request-id expires-at now at]}]
  (when-not (and (bounded-string? key-id 128)
                 (bounded-string? public-key 4096)
                 (integer? key-epoch) (pos? key-epoch)
                 (bounded-string? request-id 128)
                 (number? expires-at) (number? now) (> expires-at now))
    (fail! :pqc-admission-invalid))
  (let [existing (normalize state)
        base (or existing
                 {:version version :epoch 1 :status :active
                  :key-id key-id :public-key public-key
                  :used-requests {} :transition-ids {}
                  :history [{:action :enrolled :epoch 1 :key-id key-id :at at}]})
        pruned (update base :used-requests
                       (fn [requests]
                         (into {} (filter (fn [[_ expiry]] (> expiry now)) requests))))]
    (when (= :revoked (:status pruned)) (fail! :pqc-key-revoked))
    (when-not (= key-epoch (:epoch pruned)) (fail! :pqc-key-epoch-mismatch))
    (when-not (and (= key-id (:key-id pruned))
                   (= public-key (:public-key pruned)))
      (fail! :pqc-key-mismatch))
    (when (contains? (:used-requests pruned) request-id)
      (fail! :pqc-request-replayed))
    (when (>= (count (:used-requests pruned)) max-used-requests)
      (fail! :pqc-replay-window-capacity))
    (let [next-state (-> pruned
                         (assoc-in [:used-requests request-id] expires-at)
                         (assoc :last-publication-at at))]
      {:state next-state
       :binding (if existing :matched :enrolled)
       :epoch (:epoch next-state)
       :status (:status next-state)})))

(defn rotate
  [state {:keys [current-key-id next-key-id next-public-key expected-epoch
                 transition-id at]}]
  (let [current (normalize state)]
    (when-not (and current (= :active (:status current))
                   (bounded-string? current-key-id 128)
                   (bounded-string? next-key-id 128)
                   (bounded-string? next-public-key 4096)
                   (bounded-string? transition-id 128)
                   (integer? expected-epoch) (pos? expected-epoch))
      (fail! :pqc-rotation-invalid))
    (when-not (= current-key-id (:key-id current)) (fail! :pqc-key-mismatch))
    (when-not (= expected-epoch (:epoch current)) (fail! :pqc-key-epoch-mismatch))
    (when (= current-key-id next-key-id) (fail! :pqc-key-unchanged))
    (when (contains? (:transition-ids current) transition-id)
      (fail! :pqc-transition-replayed))
    (let [next-epoch (inc expected-epoch)
          next-state (-> current
                         (assoc :epoch next-epoch :status :active
                                :key-id next-key-id :public-key next-public-key)
                         (assoc-in [:transition-ids transition-id] at)
                         (append-history {:action :rotated :epoch next-epoch
                                          :from-key-id current-key-id
                                          :key-id next-key-id :at at}))]
      {:state next-state :binding :rotated :epoch next-epoch :status :active})))

(defn revoke
  [state {:keys [current-key-id expected-epoch transition-id at]}]
  (let [current (normalize state)]
    (when-not (and current (= :active (:status current))
                   (bounded-string? current-key-id 128)
                   (bounded-string? transition-id 128)
                   (integer? expected-epoch) (pos? expected-epoch))
      (fail! :pqc-revocation-invalid))
    (when-not (= current-key-id (:key-id current)) (fail! :pqc-key-mismatch))
    (when-not (= expected-epoch (:epoch current)) (fail! :pqc-key-epoch-mismatch))
    (when (contains? (:transition-ids current) transition-id)
      (fail! :pqc-transition-replayed))
    (let [next-state (-> current
                         (assoc :status :revoked :revoked-at at)
                         (assoc-in [:transition-ids transition-id] at)
                         (append-history {:action :revoked :epoch expected-epoch
                                          :key-id current-key-id :at at}))]
      {:state next-state :binding :revoked
       :epoch expected-epoch :status :revoked})))
