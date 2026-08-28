(ns app-kotoba-cloud.worker
  (:require [app-kotoba-cloud.profile :as profile]
            [goog.object :as gobj]))

(def security-headers
  {"content-security-policy"
   "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
   "cross-origin-opener-policy" "same-origin"
   "referrer-policy" "no-referrer"
   "x-content-type-options" "nosniff"
   "x-frame-options" "DENY"
   "permissions-policy" "camera=(), microphone=(), geolocation=(), payment=()"})

(defn response
  ([body status content-type]
   (let [headers (js/Headers.)]
     (doseq [[k v] security-headers] (.set headers k v))
     (.set headers "content-type" content-type)
     (js/Response. body #js {:status status :headers headers})))
  ([body] (response body 200 "text/plain; charset=utf-8")))

(defn json-response [value]
  (response (js/JSON.stringify (clj->js value) nil 2)
            200 "application/json; charset=utf-8"))

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
