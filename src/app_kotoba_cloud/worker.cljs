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

(defn- redirect [location]
  (response "" 302 "text/plain; charset=utf-8" {"location" location}))

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
  "https://kotoba.cloud/schemas/library-publication-request/v3")

(def transition-schema
  "https://kotoba.cloud/schemas/pq-key-transition-request/v1")

(defn- bounded-string? [value max-length]
  (and (string? value) (pos? (count value)) (<= (count value) max-length)))

(defn- valid-publication-request? [body]
  (let [signed (:signedRecord body)
        valid-until (when (string? (:valid_until signed))
                      (js/Date.parse (:valid_until signed)))
        issued-at (when (string? (:issuedAt body)) (js/Date.parse (:issuedAt body)))
        expires-at (when (string? (:expiresAt body)) (js/Date.parse (:expiresAt body)))
        now (.now js/Date)]
    (and (= publication-schema (:schema body))
         (bounded-string? (:requestId body) 128)
         (integer? (:keyEpoch body)) (pos? (:keyEpoch body))
         (number? issued-at) (= issued-at issued-at)
         (number? expires-at) (= expires-at expires-at)
         (<= (- now (* 60 1000)) issued-at (+ now (* 60 1000)))
         (< issued-at expires-at (min (+ issued-at (* 15 60 1000))
                                      (+ now (* 15 60 1000))))
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
       (= (:requestId body) (:requestId payload))
       (= (:issuedAt body) (:issuedAt payload))
       (= (:expiresAt body) (:expiresAt payload))
       (= (:keyEpoch body) (:keyEpoch payload))
       (= (:namespace body) (:namespace payload))
       (= (:releaseCid body) (:releaseCid payload))
       (= (:recordCid body) (:recordCid payload))
       (= (:publisher body) (:publisher payload))
       (= (:ipnsName body) (:ipnsName payload))
       (= (:storageOrigin body) (:storageOrigin payload))
       (= (:signedRecord body) (:signedRecord payload))))

(defn- valid-transition-request? [body]
  (let [issued-at (when (string? (:issuedAt body)) (js/Date.parse (:issuedAt body)))
        expires-at (when (string? (:expiresAt body)) (js/Date.parse (:expiresAt body)))
        rotate? (= "rotate" (:action body))
        revoke? (= "revoke" (:action body))
        now (.now js/Date)]
    (and (= transition-schema (:schema body))
         (bounded-string? (:transitionId body) 128)
         (number? issued-at) (= issued-at issued-at)
         (number? expires-at) (= expires-at expires-at)
         (<= (- now (* 60 1000)) issued-at (+ now (* 60 1000)))
         (< issued-at expires-at (min (+ issued-at (* 15 60 1000))
                                      (+ now (* 15 60 1000))))
         (or rotate? revoke?)
         (integer? (:expectedEpoch body)) (pos? (:expectedEpoch body))
         (bounded-string? (:currentKeyId body) 128)
         (map? (:currentApproval body))
         (if rotate?
           (and (bounded-string? (:nextKeyId body) 128)
                (not= (:currentKeyId body) (:nextKeyId body))
                (map? (:nextApproval body)))
           (and (nil? (:nextKeyId body)) (nil? (:nextApproval body)))))))

(defn- transition-payload-matches? [body payload]
  (and (= transition-schema (:schema payload))
       (= "pq-key-transition" (:purpose payload))
       (= (:transitionId body) (:transitionId payload))
       (= (:issuedAt body) (:issuedAt payload))
       (= (:expiresAt body) (:expiresAt payload))
       (= (:action body) (:action payload))
       (= (:expectedEpoch body) (:expectedEpoch payload))
       (= (:currentKeyId body) (:currentKeyId payload))
       (= (:nextKeyId body) (:nextKeyId payload))))

(defn- admit-pq-key [env principal-id body {:keys [key-id public-key]}]
  (let [registry (gobj/get env "PQ_KEY_REGISTRY")]
    (when-not (and registry (bounded-string? principal-id 256))
      (throw (ex-info "pqc-key-registry-unavailable" {:status 503})))
    (let [id (js-invoke registry "idFromName" principal-id)
          stub (js-invoke registry "get" id)]
      (-> (js-invoke stub "fetch" "https://pqc-key-registry.internal/admit"
                     #js {:method "POST"
                          :headers #js {"content-type" "application/json"}
                          :body (js/JSON.stringify
                                 #js {:keyId key-id :publicKey public-key
                                      :keyEpoch (:keyEpoch body)
                                      :requestId (:requestId body)
                                      :expiresAt (js/Date.parse (:expiresAt body))})})
          (.then (fn [result]
                   (-> (.json result)
                       (.then (fn [binding]
                                (if (.-ok result)
                                  (js->clj binding :keywordize-keys true)
                                  (throw (ex-info
                                          (or (aget binding "reason")
                                              (if (= 409 (.-status result))
                                                "pqc-key-conflict"
                                                "pqc-key-binding-failed"))
                                          {:status (if (= 409 (.-status result)) 409 503)}))))))))))))

(defn- transition-pq-key [env principal-id body current next-key]
  (let [registry (gobj/get env "PQ_KEY_REGISTRY")]
    (when-not (and registry (bounded-string? principal-id 256))
      (throw (ex-info "pqc-key-registry-unavailable" {:status 503})))
    (let [id (js-invoke registry "idFromName" principal-id)
          stub (js-invoke registry "get" id)
          path (str "https://pqc-key-registry.internal/" (:action body))
          command (cond-> {:currentKeyId (:key-id current)
                           :expectedEpoch (:expectedEpoch body)
                           :transitionId (:transitionId body)}
                    next-key (assoc :nextKeyId (:key-id next-key)
                                    :nextPublicKey (:public-key next-key)))]
      (-> (js-invoke stub "fetch" path
                     #js {:method "POST"
                          :headers #js {"content-type" "application/json"}
                          :body (js/JSON.stringify (clj->js command))})
          (.then (fn [result]
                   (-> (.json result)
                       (.then (fn [transition]
                                (if (.-ok result)
                                  (js->clj transition :keywordize-keys true)
                                  (throw (ex-info
                                          (or (aget transition "reason")
                                              "pqc-key-transition-failed")
                                          {:status (if (= 409 (.-status result)) 409 503)}))))))))))))

(defn- route-pq-key-transition [request env action]
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
                   (if (> (count text) 32768)
                     (throw (ex-info "request-too-large" {:status 413}))
                     (js->clj (js/JSON.parse text) :keywordize-keys true))))
          (.then (fn [body]
                   (when-not (= action (:action body))
                     (throw (ex-info "pq-key-action-mismatch" {:status 400})))
                   (when-not (valid-transition-request? body)
                     (throw (ex-info "invalid-pq-key-transition-request" {:status 400})))
                   (-> (fetch-viewer request)
                       (.then (fn [viewer]
                                (when-not (:valid viewer)
                                  (throw (ex-info "passkey-session-required" {:status 401})))
                                [body viewer])))))
          (.then (fn [[body viewer]]
                   (-> (pqc/verify-approval (:currentApproval body))
                       (.then (fn [current]
                                (when-not (and (= (:currentKeyId body) (:key-id current))
                                               (transition-payload-matches?
                                                body (:payload current)))
                                  (throw (ex-info "pqc-current-approval-mismatch"
                                                  {:status 400})))
                                (if (= "rotate" action)
                                  (do
                                    (when-not (= (get-in body [:currentApproval :payload])
                                                 (get-in body [:nextApproval :payload]))
                                      (throw (ex-info "pqc-transition-bytes-mismatch"
                                                      {:status 400})))
                                    (-> (pqc/verify-approval (:nextApproval body))
                                      (.then (fn [next-key]
                                               (when-not (and (= (:nextKeyId body)
                                                                 (:key-id next-key))
                                                              (transition-payload-matches?
                                                               body (:payload next-key)))
                                                 (throw (ex-info "pqc-next-approval-mismatch"
                                                                 {:status 400})))
                                               [body viewer current next-key]))))
                                  (js/Promise.resolve [body viewer current nil])))))))
          (.then (fn [[body viewer current next-key]]
                   (-> (transition-pq-key env (:principalId viewer) body current next-key)
                       (.then (fn [transition]
                                (private-json-response
                                 (cond-> {:ok true
                                          :schema "https://kotoba.cloud/schemas/pq-key-transition-receipt/v1"
                                          :action action
                                          :principalId (:principalId viewer)
                                          :transitionId (:transitionId body)
                                          :previousEpoch (:previousEpoch transition)
                                          :epoch (:epoch transition)
                                          :previousKeyId (:previousKeyId transition)
                                          :keyId (:keyId transition)
                                          :status (:status transition)
                                          :currentApprovalVerified true
                                          :transitionedAt (.toISOString (js/Date.))}
                                   next-key (assoc :nextApprovalVerified true))))))))
          (.catch (fn [error]
                    (private-json-response
                     {:ok false :error (or (.-message error) "pq-key-transition-failed")}
                     (or (:status (ex-data error)) 400))))))))

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
                                (-> (admit-pq-key env (:principalId viewer) body verified)
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
                                                 :pqcKeyEpoch (:epoch binding)
                                                 :pqcKeyBinding (:binding binding)
                                                 :requestId (:requestId body)
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
        method (.-method request)
        sign-in (session/apex-sign-in-location path (.-search url))]
    (cond
      (and (= path "/v1/libraries/publish") (= method "POST"))
      (route-library-publish request env)

      (and (= path "/v1/pq-keys/rotate") (= method "POST"))
      (route-pq-key-transition request env "rotate")

      (and (= path "/v1/pq-keys/revoke") (= method "POST"))
      (route-pq-key-transition request env "revoke")

      (not (#{"GET" "HEAD"} method))
      (response "method not allowed" 405 "text/plain; charset=utf-8")

      sign-in
      (redirect sign-in)

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

      (= path "/schemas/library-publication-request/v3")
      (json-response {:type "object"
                      :required ["schema" "requestId" "issuedAt" "expiresAt" "keyEpoch"
                                 "namespace" "releaseCid" "recordCid"
                                 "publisher" "ipnsName" "storageOrigin" "signedRecord"
                                 "pqcApproval"]
                      :constSchema publication-schema})

      (= path "/schemas/pq-key-transition-request/v1")
      (json-response {:type "object"
                      :required ["schema" "transitionId" "issuedAt" "expiresAt"
                                 "action" "expectedEpoch" "currentKeyId"
                                 "currentApproval"]
                      :rotateRequired ["nextKeyId" "nextApproval"]
                      :actions ["rotate" "revoke"]
                      :constSchema transition-schema})

      :else
      (-> (.fetch ^js (gobj/get env "ASSETS") request)
          (.then with-security-headers)))))

(def app
  #js {:fetch (fn [request env _ctx]
                (js/Promise.resolve (route request env)))})
