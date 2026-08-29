(ns app-kotoba-cloud.browser
  (:require [app-kotoba-cloud.session :as session]))

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
    (text! "kc-session-username" (str "@" username))
    (text! "kc-session-principal" (session/abbreviate (:principalId payload)))
    (text! "kc-session-controller" (session/abbreviate (:activeDid payload)))
    (text! "kc-session-status"
           (str (if english? "Passkey session confirmed" "Passkey session を確認しました")
                " · @" username))))

(defn init! []
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
