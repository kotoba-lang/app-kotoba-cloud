(ns app-kotoba-cloud.rootkey
  "The Biscuit root-key log this apex serves, and the reasons it refuses to.

  A Biscuit is verified against one root public key, which is what lets a plane
  decide a call while holding nothing secret — the property ADR-2608200400 chose
  Biscuit over macaroon to get. Routing every verification through an identity
  service gives that property back: the plane is then trusting a service call
  rather than a signature.

  `biscuit.rootkey` closes that with a pre-rotating, hash-linked log: a record
  commits to the digest of the key that may sign the next one, so a reader who
  trusts record n can verify n+1 without trusting the host it arrived from.
  This namespace is the host. It is deliberately not the authority.

  ## What this apex is, and what it is not

  Serving the log does not make kotoba.cloud the root of trust. The genesis
  digest is pinned by the CALLER — `biscuit.rootkey/verify-log` takes it as an
  argument for that reason. A plane that reads the pin out of this document and
  then verifies the log against it has verified nothing: it trusted this apex
  for both halves. The pin belongs in the plane's own configuration, and this
  document publishes it only so the first pin can be discovered and compared.
  `:authority` says so in the profile rather than leaving it to be assumed.

  ## Refusing is a published state, not an omission

  `verify-log` refuses an empty log rather than treating it as `no rotations
  yet, use the baked key`, because that turns a fetch failure into an authority
  decision. The same rule applies one level up: when no log is configured this
  apex answers `:not-published` with that word in the body, and the profile
  carries `published false`. An apex that 404s the path, or serves `[]`, tells a
  caller the same thing whether the ceremony has not happened or the binding was
  lost."
  (:require [kotoba.lang.text :as str]))

(def log-path "/.well-known/biscuit-rootkey.json")

(def subject
  "What the log is the key set FOR.

  `biscuit.rootkey` names this as one of two defects the shape has already cost
  this fleet: without a subject, a host can answer a request about one subject
  with another subject's genuinely-signed record, and it verifies — nothing was
  forged."
  "kotoba.cloud/delegation")

(defn configured?
  "Whether a genesis pin and a log are both present.

  Both, because either alone is unusable: a log with no pinned genesis cannot be
  verified, and a pin with no log has nothing to verify."
  [{:keys [genesis-key-digest records]}]
  (boolean (and (not (str/blank? (str genesis-key-digest)))
                (sequential? records)
                (seq records))))

(defn refusal
  "The body for a request this apex cannot answer.

  Names the state rather than the HTTP status, so `the ceremony has not run` and
  `the log failed to verify` are distinguishable by a caller that only reads
  JSON. 503 rather than 404: the path exists and is the right one to ask."
  [reason]
  {:status 503
   :body {:error "biscuit-root-key-log-unavailable"
          :reason (name reason)
          :subject subject
          :details
          (case reason
            :not-published
            "no genesis ceremony has been run for this subject; the log does not exist yet"
            :failed-verification
            "a log is configured but does not verify against the configured genesis digest, and an apex must not serve a log it cannot verify"
            "unavailable")}})

(defn served
  "The log to serve, or a refusal.

  `verify` is injected — this namespace owns no crypto, the same split
  `biscuit.token` makes for the same reason. It is called with the records and
  is expected to answer `biscuit.rootkey/verify-log`'s shape: a map with
  `:refused` when the walk failed.

  The verification is not decoration. This apex is a mutable location, which is
  exactly what the pre-rotation shape exists to survive; serving a log without
  checking it against the pinned genesis would make this apex able to introduce
  a key nobody committed to, which is the one thing the shape promises cannot
  happen."
  [{:keys [genesis-key-digest records] :as config} verify]
  (cond
    (not (configured? config)) (refusal :not-published)
    :else
    (let [result (verify records)]
      (if (:refused result)
        (refusal :failed-verification)
        {:status 200
         :body {:v "biscuit.rootkey/v1"
                :subject subject
                :genesisKeyDigest genesis-key-digest
                :seq (:seq result)
                :records records
                :keys (:keys result)
                :authority "the-log-not-this-document"}}))))

(defn profile-section
  "What the control plane says about delegation.

  `verifiedLocally` is false and says so. The log existing is not the same as a
  plane using it: murakumo's operator routes today take a decided input from the
  identity service (`write-gate/operator-authorized?` receives
  `verified-operator-action`), so no plane verifies a Biscuit against a root key
  of its own yet. Publishing the log without publishing that gap would let a
  reader conclude the decentralised path is in use because the material for it
  is present."
  [{:keys [genesis-key-digest] :as config}]
  (let [published (configured? config)]
    (cond-> {:subject subject
             :logPath log-path
             :published published
             :authority "the-log-not-this-document"
             :pinnedBy "the-calling-plane-not-this-document"
             :verifiedLocally false
             :verifierToday "identity-service"}
      published (assoc :genesisKeyDigest genesis-key-digest))))
