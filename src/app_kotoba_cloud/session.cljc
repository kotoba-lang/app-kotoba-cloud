(ns app-kotoba-cloud.session
  "Pure session projection shared by the Worker and the browser UI."
  (:require [app-kotoba-cloud.profile :as profile]
            [clojure.string :as str]))

(def cookie-name "gftd_session")
(def viewer-url (str profile/identity-origin "/v1/session"))
(def apex-sign-in-paths #{"/sign-in" "/login"})

(defn passkey-href
  "Public Passkey CTA. Live auth.kotoba.cloud serves HTML at /sign-in."
  [locale]
  (str profile/identity-sign-in
       "?return_to="
       (if (= locale :en)
         "https%3A%2F%2Fkotoba.cloud%2Fen%2F"
         "https%3A%2F%2Fkotoba.cloud%2F")))

(defn apex-sign-in-location
  "Send mistaken apex login paths to the live Passkey RP, keeping any query."
  [path search]
  (when (contains? apex-sign-in-paths path)
    (str profile/identity-sign-in (or search ""))))

(defn cookie-value
  "Read one exact cookie name without losing `=` padding from its value."
  [header name]
  (when (string? header)
    (some (fn [part]
            (let [[k value] (str/split (str/trim part) #"=" 2)]
              (when (and (= name k)
                         (string? value)
                         (not (str/blank? value))
                         (<= (count value) 4096)
                         (not (re-find #"[\r\n;]" value)))
                value)))
          (str/split header #";"))))

(defn- identity-value [value]
  (when (and (string? value)
             (= value (str/trim value))
             (<= 1 (count value) 256)
             (not (re-find #"[\r\n]" value))
             (or (str/starts-with? value "did:")
                 (str/starts-with? value "urn:kotoba:principal:")))
    value))

(defn- issued-username [value]
  (when (and (string? value)
             (re-matches #"(?:kotoba|kotobase|murakumo)-[a-z0-9]{14}" value))
    value))

(defn fallback-username
  "Generate a non-secret display name for sessions issued before usernames.

  It is a UI alias, not an authority identifier. Authorization continues to
  use the Stable Principal and active controller supplied alongside it."
  [principal-id]
  (let [material (-> (or principal-id "") str/lower-case
                     (str/replace #"[^a-z0-9]" ""))
        suffix (if (> (count material) 14)
                 (subs material (- (count material) 14))
                 (str (apply str (repeat (- 14 (count material)) "0")) material))]
    (str "kotoba-" suffix)))

(defn viewer-model
  "Fail-closed, credential-free subset of auth.kotoba.cloud's viewer."
  [payload]
  (let [principal-id (identity-value (:principalId payload))
        account-did (identity-value (:accountDid payload))
        active-did (identity-value (:activeDid payload))]
    (if (and (true? (:valid payload)) principal-id account-did active-did)
      {:valid true
       :username (or (issued-username (:handle payload))
                     (fallback-username principal-id))
       :principalId principal-id
       :accountDid account-did
       :activeDid active-did}
      {:valid false})))

(defn abbreviate [value]
  (if (and (string? value) (> (count value) 24))
    (str (subs value 0 12) "…" (subs value (- (count value) 8)))
    (or value "—")))
