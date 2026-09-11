(ns app-kotoba-cloud.pqc
  "ML-DSA-65 verification for Passkey-authenticated publication approvals."
  (:require ["@noble/post-quantum/ml-dsa.js" :refer [ml_dsa65]]))

(def suite "passkey+ml-dsa-65")
(def public-key-bytes 1952)
(def signature-bytes 3309)

(defn- fail! [] (throw (ex-info "pqc-approval-invalid" {:status 400})))

(defn- base64url-bytes [value expected-length]
  (when-not (string? value) (fail!))
  (try
    (let [normalized (-> value
                         (.replaceAll "-" "+")
                         (.replaceAll "_" "/"))
          padded (str normalized (apply str (repeat (mod (- 4 (mod (count normalized) 4)) 4) "=")))
          binary (js/atob padded)
          bytes (js/Uint8Array. (count binary))]
      (dotimes [i (count binary)]
        (aset bytes i (.charCodeAt binary i)))
      (when (and expected-length (not= expected-length (.-length bytes))) (fail!))
      bytes)
    (catch :default _ (fail!))))

(defn- hex [bytes]
  (apply str
         (map (fn [value] (.padStart (.toString value 16) 2 "0"))
              (array-seq (js/Uint8Array. bytes)))))

(defn verify-approval
  "Verify raw approval bytes and return the signed payload plus key facts.
  The payload is never reconstructed before verification."
  [approval]
  (try
    (when-not (= suite (:suite approval)) (fail!))
    (let [payload-bytes (base64url-bytes (:payload approval) nil)
          public-key (base64url-bytes (:publicKey approval) public-key-bytes)
          signature (base64url-bytes (:signature approval) signature-bytes)
          key-id (:keyId approval)]
      (when-not (and (string? key-id)
                     (js-invoke ml_dsa65 "verify" signature payload-bytes public-key))
        (fail!))
      (-> (.digest (.-subtle js/crypto) "SHA-256" public-key)
          (.then (fn [digest]
                   (let [derived (str "sha256:" (hex digest))]
                     (when-not (= derived key-id) (fail!))
                     (let [payload (js->clj
                                    (js/JSON.parse
                                     (.decode (js/TextDecoder. "utf-8" #js {:fatal true})
                                              payload-bytes))
                                    :keywordize-keys true)]
                       {:payload payload
                        :suite suite
                        :key-id key-id
                        :public-key (:publicKey approval)}))))))
    (catch :default error
      (js/Promise.reject
       (if (= "pqc-approval-invalid" (.-message error)) error
           (ex-info "pqc-approval-invalid" {:status 400}))))))
