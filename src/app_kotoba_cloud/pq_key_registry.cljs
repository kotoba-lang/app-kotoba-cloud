(ns app-kotoba-cloud.pq-key-registry
  "Atomic lifecycle and replay registry for one Principal's ML-DSA key."
  (:require [app-kotoba-cloud.pq-key-lifecycle :as lifecycle]
            [cljs.reader :as reader]))

(defn- storage [state] (aget state "storage"))

(defn- json-response [value status]
  (js/Response. (js/JSON.stringify (clj->js value))
                #js {:status status
                     :headers #js {"content-type" "application/json"
                                   "cache-control" "no-store, private"}}))

(defn- decode-state [value]
  (cond
    (nil? value) nil
    (string? value) (reader/read-string value)
    :else (js->clj value :keywordize-keys true)))

(defn- load-state [txn]
  (-> (js-invoke txn "get" "lifecycle")
      (.then (fn [current]
               (if current
                 (decode-state current)
                 (-> (js-invoke txn "get" "binding")
                     (.then decode-state)))))))

(defn- command [path body now at]
  (case path
    "/admit"
    {:op :admit
     :args {:key-id (:keyId body) :public-key (:publicKey body)
            :key-epoch (:keyEpoch body) :request-id (:requestId body)
            :expires-at (:expiresAt body) :now now :at at}}

    "/rotate"
    {:op :rotate
     :args {:current-key-id (:currentKeyId body)
            :next-key-id (:nextKeyId body) :next-public-key (:nextPublicKey body)
            :expected-epoch (:expectedEpoch body)
            :transition-id (:transitionId body) :at at}}

    "/revoke"
    {:op :revoke
     :args {:current-key-id (:currentKeyId body)
            :expected-epoch (:expectedEpoch body)
            :transition-id (:transitionId body) :at at}}

    (throw (ex-info "pqc-registry-operation-unknown" {:status 404}))))

(defn- apply-command [state {:keys [op args]}]
  (case op
    :admit (lifecycle/admit-publication state args)
    :rotate (lifecycle/rotate state args)
    :revoke (lifecycle/revoke state args)))

(defn- transact [state path body]
  (let [now (.now js/Date)
        at (.toISOString (js/Date. now))]
    (js-invoke
     (storage state) "transaction"
     (fn [txn]
       (-> (load-state txn)
           (.then
            (fn [current]
              (let [result (apply-command current (command path body now at))]
                (-> (js-invoke txn "put" "lifecycle" (pr-str (:state result)))
                    (.then (fn [_] (js-invoke txn "delete" "binding")))
                    (.then (fn [_]
                             (json-response
                              {:ok true :binding (name (:binding result))
                               :epoch (:epoch result) :status (name (:status result))}
                              200))))))))))))

(deftype PqKeyRegistry [state env]
  Object
  (fetch [_ request]
    (let [path (.-pathname (js/URL. (.-url request)))]
      (-> (js-invoke request "json")
          (.then (fn [body]
                   (transact state path (js->clj body :keywordize-keys true))))
          (.catch
           (fn [error]
             (let [data (ex-data error)
                   status (or (:status data) 500)
                   reason (or (:reason data)
                              (when (not= 500 status) (.-message error))
                              :pqc-registry-error)]
               (json-response {:ok false :reason (name reason)} status))))))))

(defn make-pq-key-registry [state env]
  (PqKeyRegistry. state env))
