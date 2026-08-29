(ns app-kotoba-cloud.worker
  (:require [app-kotoba-cloud.profile :as profile]
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

(defn- session-response [value]
  (response (js/JSON.stringify (clj->js value))
            200 "application/json; charset=utf-8"
            {"cache-control" "no-store, private"}))

(defn- route-session [request]
  (if-let [token (session/cookie-value (.get (.-headers request) "cookie")
                                       session/cookie-name)]
    (-> (js/fetch session/viewer-url
                  #js {:method "GET"
                       :headers #js {"accept" "application/json"
                                     "cookie" (str session/cookie-name "=" token)}})
        (.then (fn [upstream]
                 (if (.-ok upstream) (.json upstream) nil)))
        (.then (fn [payload]
                 (session-response
                  (if payload
                    (session/viewer-model (js->clj payload :keywordize-keys true))
                    {:valid false}))))
        (.catch (fn [_] (session-response {:valid false}))))
    (session-response {:valid false})))

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

      :else
      (-> (.fetch ^js (gobj/get env "ASSETS") request)
          (.then with-security-headers)))))

(def app
  #js {:fetch (fn [request env _ctx]
                (js/Promise.resolve (route request env)))})
