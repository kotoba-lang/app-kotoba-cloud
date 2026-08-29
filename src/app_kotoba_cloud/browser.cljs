(ns app-kotoba-cloud.browser
  (:require [app-kotoba-cloud.session :as session]
            [goog.object :as gobj]))

(defn- element [id] (.getElementById js/document id))

(defn- text! [id value]
  (when-let [el (element id)]
    (set! (.-textContent el) value)))

(defn- signed-in! [payload]
  (let [username (:username payload)
        english? (= "en" (.-lang (.-documentElement js/document)))]
    (when-let [nav (element "kc-session-nav")]
      (set! (.-textContent nav) (str "@" username))
      (.setAttribute nav "href" "#identity"))
    (when-let [action (element "kc-session-action")]
      (set! (.-textContent action) (if english? "View identity" "Identity を確認"))
      (.setAttribute action "href" "#identity"))
    (when-let [panel (element "identity")]
      (set! (.-hidden panel) false))
    (doseq [link (array-seq (.querySelectorAll js/document "[data-session-link]"))]
      (set! (.-hidden link) false))
    (text! "kc-session-username" (str "@" username))
    (text! "kc-session-principal" (session/abbreviate (:principalId payload)))
    (text! "kc-session-controller" (session/abbreviate (:activeDid payload)))
    (text! "kc-session-status"
           (str (if english? "Passkey session confirmed" "Passkey session を確認しました")
                " · @" username))))

(defn- decode-fragment [prefix]
  (let [hash (.-hash js/location)]
    (when (.startsWith hash prefix)
      (try
        (let [encoded (subs hash (count prefix))
              padded (str encoded (apply str (repeat (mod (- 4 (mod (count encoded) 4)) 4) "=")))
              json (js/decodeURIComponent
                    (apply str
                           (map (fn [c]
                                  (str "%" (.padStart (.toString (.charCodeAt c 0) 16) 2 "0")))
                                (js/atob (.replaceAll (.replaceAll padded "-" "+") "_" "/")))))]
          (js->clj (js/JSON.parse json) :keywordize-keys true))
        (catch :default _ nil)))))

(defn- publication-preview! [publication]
  (when-let [panel (element "library-publish-approval")]
    (set! (.-hidden panel) false))
  (text! "library-publish-namespace" (:namespace publication))
  (text! "library-publish-release" (:releaseCid publication))
  (text! "library-publish-record" (:recordCid publication))
  (text! "library-publish-name" (:ipnsName publication))
  (text! "library-publish-result"
         (if (= "passkey+ml-dsa-65" (get-in publication [:pqcApproval :suite]))
           "Passkey + ML-DSA-65 approval ready"
           "ML-DSA-65 approval is required"))
  (when-let [button (element "library-publish-submit")]
    (.addEventListener
     button "click"
     (fn []
       (set! (.-disabled button) true)
       (text! "library-publish-result" "Publishing…")
       (let [request (js/fetch
                      "/v1/libraries/publish"
                      #js {:method "POST"
                           :credentials "same-origin"
                           :headers #js {"content-type" "application/json"
                                         "accept" "application/json"}
                           :body (js/JSON.stringify (clj->js publication))})]
         (-> request
             (.then (fn [response]
                      (-> (.json response)
                          (.then (fn [payload]
                                   (if (.-ok response)
                                     (do
                                       (text! "library-publish-result"
                                              (str "Published · "
                                                   (gobj/get payload "recordCid")))
                                       (.replaceState js/history nil ""
                                                      (.-pathname js/location)))
                                     (throw
                                      (js/Error.
                                       (or (gobj/get payload "error")
                                           "Publication failed")))))))))
             (.catch (fn [error]
                       (set! (.-disabled button) false)
                       (text! "library-publish-result" (.-message error))))))))))

(defn- transition-preview! [transition]
  (when-let [panel (element "pq-key-transition-approval")]
    (set! (.-hidden panel) false))
  (text! "pq-key-transition-action" (:action transition))
  (text! "pq-key-transition-epoch" (str (:expectedEpoch transition)))
  (text! "pq-key-transition-current" (:currentKeyId transition))
  (text! "pq-key-transition-next" (or (:nextKeyId transition) "—"))
  (text! "pq-key-transition-result" "Passkey confirmation required")
  (when-let [button (element "pq-key-transition-submit")]
    (.addEventListener
     button "click"
     (fn []
       (set! (.-disabled button) true)
       (text! "pq-key-transition-result" "Confirming…")
       (-> (js/fetch
            (str "/v1/pq-keys/" (:action transition))
            #js {:method "POST"
                 :credentials "same-origin"
                 :headers #js {"content-type" "application/json"
                               "accept" "application/json"}
                 :body (js/JSON.stringify (clj->js transition))})
           (.then (fn [response]
                    (-> (.json response)
                        (.then (fn [payload]
                                 (if (.-ok response)
                                   (do
                                     (text! "pq-key-transition-result"
                                            (str "Confirmed · epoch "
                                                 (gobj/get payload "epoch")))
                                     (.replaceState js/history nil ""
                                                    (.-pathname js/location)))
                                   (throw (js/Error.
                                           (or (gobj/get payload "error")
                                               "PQ key transition failed"))))))))
           (.catch (fn [error]
                     (set! (.-disabled button) false)
                     (text! "pq-key-transition-result" (.-message error))))))))))

(defn init! []
  (when-let [publication (decode-fragment "#publish=")]
    (publication-preview! publication))
  (when-let [transition (decode-fragment "#pq-key-transition=")]
    (transition-preview! transition))
  (-> (js/fetch "/v1/session" #js {:credentials "same-origin"
                                    :headers #js {"accept" "application/json"}})
      (.then (fn [response]
               (when (.-ok response) (.json response))))
      (.then (fn [payload]
               (when payload
                 (let [viewer (session/viewer-model
                               (js->clj payload :keywordize-keys true))]
                   (when (:valid viewer) (signed-in! viewer))))))
      (.catch (fn [_] nil))))
