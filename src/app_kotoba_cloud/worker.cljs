(ns app-kotoba-cloud.worker
  (:require [app-kotoba-cloud.profile :as profile]))

(def security-headers
  {"content-security-policy"
   "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
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

(def page
  "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Kotoba Cloud</title><style>body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:58rem;margin:0 auto;padding:4rem 1.25rem;color:#142018;background:#f4f7f2}h1{font-size:clamp(2.6rem,8vw,6rem);letter-spacing:-.06em;margin:0 0 1rem}p{font-size:1.12rem;line-height:1.7}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:1rem;margin-top:3rem}.card{background:white;border:1px solid #d8e0d7;border-radius:1rem;padding:1.25rem}.card b{display:block;margin-bottom:.5rem}code{font-size:.9rem}.note{margin-top:2.5rem;color:#526258}</style></head><body><h1>Kotoba Cloud</h1><p>The identity and deploy control plane for Kotoba. One control origin, with storage, compute, and agent work kept as separate authority domains.</p><div class=\"grid\"><div class=\"card\"><b>kotoba.cloud</b>Identity, CLI and deploy control</div><div class=\"card\"><b>kotobase.net</b>Content-addressed storage and receipts</div><div class=\"card\"><b>murakumo.cloud</b>CPU/GPU placement and execution</div><div class=\"card\"><b>itonami.cloud</b>Agent workspaces, goals and approvals</div><div class=\"card\"><b>kotoba-lang.org</b>Language specification and conformance</div></div><p class=\"note\">Machine-readable discovery: <code>/.well-known/kotoba-cloud.json</code>. Hosted remote apply is not claimed yet; current deploy uses local admission and Murakumo compute.</p></body></html>")

(defn route [request]
  (let [url (js/URL. (.-url request))
        path (.-pathname url)
        method (.-method request)]
    (cond
      (not= method "GET")
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

      (= path "/")
      (response page 200 "text/html; charset=utf-8")

      :else
      (json-response {:error "not_found" :path path}))))

(def app
  #js {:fetch (fn [request _env _ctx]
                (js/Promise.resolve (route request)))})

