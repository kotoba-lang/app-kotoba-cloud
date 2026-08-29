(ns app-kotoba-cloud.pq-key-registry
  "Atomic first-use binding of one ML-DSA public key to one Principal.")

(defn- storage [state] (aget state "storage"))
(defn- json-response [value status]
  (js/Response. (js/JSON.stringify (clj->js value))
                #js {:status status :headers #js {"content-type" "application/json"}}))

(defn- bind-key [state body]
  (let [key-id (aget body "keyId")
        public-key (aget body "publicKey")]
    (if-not (and (string? key-id) (string? public-key))
      (js/Promise.resolve (json-response {:ok false :reason "invalid"} 400))
      (-> (js-invoke (storage state) "get" "binding")
          (.then
           (fn [existing]
             (cond
               (nil? existing)
               (-> (js-invoke (storage state) "put" "binding"
                              #js {:keyId key-id :publicKey public-key})
                   (.then (fn [_] (json-response {:ok true :binding "enrolled"} 200))))

               (and (= key-id (aget existing "keyId"))
                    (= public-key (aget existing "publicKey")))
               (json-response {:ok true :binding "matched"} 200)

               :else
               (json-response {:ok false :reason "key-mismatch"} 409))))))))

(deftype PqKeyRegistry [state env]
  Object
  (fetch [_ request]
    (-> (js-invoke request "json")
        (.then (fn [body] (bind-key state body)))
        (.catch (fn [_] (json-response {:ok false :reason "registry-error"} 500))))))

(defn make-pq-key-registry [state env]
  (PqKeyRegistry. state env))
