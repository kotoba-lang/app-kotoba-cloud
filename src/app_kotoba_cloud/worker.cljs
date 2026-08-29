(ns app-kotoba-cloud.worker
  (:require [app-kotoba-cloud.profile :as profile]
            [app-kotoba-cloud.pqc :as pqc]
            [app-kotoba-cloud.session :as session]
            [goog.object :as gobj]))

(def security-headers
  {"content-security-policy"
   "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
   "cross-origin-opener-policy" "same-origin"
   "referrer-policy" "no-referrer"
   "x-content-type-options" "nosniff"
   "x-frame-options" "DENY"
   "permissions-policy" "camera=(), microphone=(), geolocation=(), payment=()"})

(defn response
  ([body status content-type]
   (response body status content-type {}))
  ([body status content-type extra-headers]
   (let [headers (js/Headers.)]
     (doseq [[k v] security-headers] (.set headers k v))
     (doseq [[k v] extra-headers] (.set headers k v))
     (.set headers "content-type" content-type)
     (js/Response. body #js {:status status :headers headers})))
  ([body] (response body 200 "text/plain; charset=utf-8")))

(defn json-response [value]
  (response (js/JSON.stringify (clj->js value) nil 2)
            200 "application/json; charset=utf-8"))

(defn- private-json-response
  ([value] (private-json-response value 200))
  ([value status]
  (response (js/JSON.stringify (clj->js value))
            status "application/json; charset=utf-8"
            {"cache-control" "no-store, private"})))

(defn- session-response [value] (private-json-response value))

(defn- fetch-viewer [request]
  (if-let [token (session/cookie-value (.get (.-headers request) "cookie")
                                       session/cookie-name)]
    (-> (js/fetch session/viewer-url
                  #js {:method "GET"
                       :headers #js {"accept" "application/json"
                                     "cookie" (str session/cookie-name "=" token)}})
        (.then (fn [upstream] (when (.-ok upstream) (.json upstream))))
        (.then (fn [payload]
                 (when payload
                   (session/viewer-model (js->clj payload :keywordize-keys true)))))
        (.catch (fn [_] nil)))
    (js/Promise.resolve nil)))

(defn- route-session [request]
  (-> (fetch-viewer request)
      (.then #(session-response (or % {:valid false})))))

(def publication-schema
  "https://kotoba.cloud/schemas/library-publication-request/v2")

(defn- bounded-string? [value max-length]
  (and (string? value) (pos? (count value)) (<= (count value) max-length)))

(defn- valid-publication-request? [body]
  (let [signed (:signedRecord body)
        valid-until (when (string? (:valid_until signed))
                      (js/Date.parse (:valid_until signed)))
        now (.now js/Date)]
    (and (= publication-schema (:schema body))
         (bounded-string? (:namespace body) 128)
         (bounded-string? (:releaseCid body) 128)
         (bounded-string? (:recordCid body) 128)
         (bounded-string? (:publisher body) 256)
         (bounded-string? (:ipnsName body) 128)
         (= "https://kotobase.net" (:storageOrigin body))
         (map? signed)
         (= (:ipnsName body) (:name signed))
         (= (:recordCid body) (:value signed))
         (integer? (:sequence signed))
         (<= 0 (:sequence signed) js/Number.MAX_SAFE_INTEGER)
         (= (:publisher body) (:controller_did signed))
         (= (:publisher body) (:public_key_multibase signed))
         (bounded-string? (:valid_until signed) 64)
         (number? valid-until)
         (= valid-until valid-until)
         (< now valid-until (+ now (* 31 24 60 60 1000)))
         (bounded-string? (:public_key_multibase signed) 256)
         (bounded-string? (:signature_multibase signed) 256))))

(defn- signed-payload-matches? [body payload]
  (and (= publication-schema (:schema payload))
       (= "library-publish" (:purpose payload))
       (= (:namespace body) (:namespace payload))
       (= (:releaseCid body) (:releaseCid payload))
       (= (:recordCid body) (:recordCid payload))
       (= (:publisher body) (:publisher payload))
       (= (:ipnsName body) (:ipnsName payload))
       (= (:storageOrigin body) (:storageOrigin payload))
       (= (:signedRecord body) (:signedRecord payload))))

(defn- bind-pq-key [env principal-id {:keys [key-id public-key]}]
  (let [registry (gobj/get env "PQ_KEY_REGISTRY")]
    (when-not (and registry (bounded-string? principal-id 256))
      (throw (ex-info "pqc-key-registry-unavailable" {:status 503})))
    (let [id (js-invoke registry "idFromName" principal-id)
          stub (js-invoke registry "get" id)]
      (-> (js-invoke stub "fetch" "https://pqc-key-registry.internal/bind"
                     #js {:method "POST"
                          :headers #js {"content-type" "application/json"}
                          :body (js/JSON.stringify
                                 #js {:keyId key-id :publicKey public-key})})
          (.then (fn [result]
                   (-> (.json result)
                       (.then (fn [binding]
                                (if (.-ok result)
                                  (js->clj binding :keywordize-keys true)
                                  (throw (ex-info
                                          (if (= 409 (.-status result))
                                            "pqc-key-mismatch"
                                            "pqc-key-binding-failed")
                                          {:status (if (= 409 (.-status result)) 409 503)}))))))))))))

(defn- route-library-publish [request env]
  (let [origin (.get (.-headers request) "origin")
        content-type (or (.get (.-headers request) "content-type") "")]
    (cond
      (not= "https://kotoba.cloud" origin)
      (private-json-response {:ok false :error "invalid-origin"} 403)

      (not (.startsWith content-type "application/json"))
      (private-json-response {:ok false :error "content-type-required"} 415)

      :else
      (-> (.text request)
          (.then (fn [text]
                   (if (> (count text) 16384)
                     (throw (ex-info "request-too-large" {:status 413}))
                     (js->clj (js/JSON.parse text) :keywordize-keys true))))
          (.then (fn [body]
                   (if-not (valid-publication-request? body)
                     (throw (ex-info "invalid-publication-request" {:status 400}))
                     (-> (fetch-viewer request)
                         (.then (fn [viewer]
                                  (when-not (:valid viewer)
                                    (throw (ex-info "passkey-session-required" {:status 401})))
                                  [body viewer]))))))
          (.then (fn [[body viewer]]
                   (-> (pqc/verify-approval (:pqcApproval body))
                       (.then (fn [verified]
                                (when-not (signed-payload-matches? body (:payload verified))
                                  (throw (ex-info "pqc-payload-mismatch" {:status 400})))
                                (-> (bind-pq-key env (:principalId viewer) verified)
                                    (.then (fn [binding] [body viewer verified binding]))))))))
          (.then (fn [[body viewer verified binding]]
                   (-> (js/fetch
                        "https://kotobase.net/xrpc/com.etzhayyim.apps.kotoba.ipns.publish"
                        #js {:method "POST"
                             :headers #js {"accept" "application/json"
                                           "content-type" "application/json"}
                             :body (js/JSON.stringify
                                    (clj->js (get-in verified [:payload :signedRecord])))})
                       (.then (fn [upstream]
                                (-> (.json upstream)
                                    (.then (fn [result]
                                             (if-not (.-ok upstream)
                                               (throw (ex-info "kotobase-rejected"
                                                               {:status 502
                                                                :upstream-status (.-status upstream)}))
                                               (private-json-response
                                                {:ok true
                                                 :schema "https://kotoba.cloud/schemas/library-publication-receipt/v2"
                                                 :namespace (:namespace body)
                                                 :releaseCid (:releaseCid body)
                                                 :recordCid (:recordCid body)
                                                 :ipnsName (:ipnsName body)
                                                 :publisher (:publisher body)
                                                 :principalId (:principalId viewer)
                                                 :activeDid (:activeDid viewer)
                                                 :pqcVerified true
                                                 :pqcSuite (:suite verified)
                                                 :pqcKeyId (:key-id verified)
                                                 :pqcKeyBinding (:binding binding)
                                                 :kotobase (js->clj result :keywordize-keys true)
                                                 :publishedAt (.toISOString (js/Date.))}))))))))))
          (.catch (fn [error]
                    (private-json-response
                     {:ok false :error (or (.-message error) "publication-failed")}
                     (or (:status (ex-data error)) 400))))))))

(defn with-security-headers [asset]
  (let [headers (js/Headers. (.-headers asset))]
    (doseq [[k v] security-headers] (.set headers k v))
    (js/Response. (.-body asset)
                  #js {:status (.-status asset)
                       :statusText (.-statusText asset)
                       :headers headers})))

(defn route [request ^js env]
  (let [url (js/URL. (.-url request))
        path (.-pathname url)
        method (.-method request)]
    (cond
      (and (= path "/v1/libraries/publish") (= method "POST"))
      (route-library-publish request env)

      (not (#{"GET" "HEAD"} method))
      (response "method not allowed" 405 "text/plain; charset=utf-8")

      (= path "/health")
      (json-response {:ok true :service "kotoba-cloud-control-plane"})

      (= path "/v1/session")
      (route-session request)

      (or (= path "/.well-known/kotoba-cloud.json")
          (= path "/v1/control-plane"))
      (json-response profile/control-plane)

      (= path "/schemas/control-plane/v1")
      (json-response {:type "object"
                      :required ["schema" "service" "roles" "deploy" "security"]
                      :constSchema profile/schema})

      (= path "/schemas/library-publication-request/v2")
      (json-response {:type "object"
                      :required ["schema" "namespace" "releaseCid" "recordCid"
                                 "publisher" "ipnsName" "storageOrigin" "signedRecord"
                                 "pqcApproval"]
                      :constSchema publication-schema})

      :else
      (-> (.fetch ^js (gobj/get env "ASSETS") request)
          (.then with-security-headers)))))

(def app
  #js {:fetch (fn [request env _ctx]
                (js/Promise.resolve (route request env)))})
