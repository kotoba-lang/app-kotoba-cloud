(ns app-kotoba-cloud.delegation-root
  "The delegation root key, derived from a passkey and never stored.

  ADR-2800010900. A WebAuthn PRF evaluation is deterministic for a given
  credential and salt, so the root private key can be produced at the moment it
  is used and discarded afterwards. What persists is the salt and the public
  key — neither of which is a secret. There is no compartment to name because
  there is nothing to put in one, and the question ADR-2800010800 was blocked on
  does not arise.

  This is the same shape `kagi/unlock.clj` already uses to unwrap a VMK
  (`kagi/unlock/passkey-prf/v1`, HKDF over the PRF output with a per-envelope
  salt). It is repeated here rather than shared because the two derive different
  keys for different subjects, and a shared function would have to be told which
  — at which point the info string is the only thing that differed anyway.

  ## This namespace owns no crypto

  `derive-seed` takes an `hkdf` function. `biscuit.token` makes the same split
  for the same reason: a library that reaches for a host's crypto cannot be run
  on the other host, and a test cannot substitute a known-answer vector. The
  caller supplies `(fn [ikm salt info length] -> bytes)`.

  ## The info string is the domain, and it is not optional

  The PRF output is one secret. Every key derived from it is separated only by
  the info string, so an info string that is absent, shared, or attacker-chosen
  means two subjects share a key. `info-for` refuses anything it does not
  recognise rather than falling back to a default: a default here would make an
  unknown subject silently reuse a known subject's key.

  ## What this does not give you

  Deriving from an authenticator makes that authenticator a single point of
  failure. A lost passkey is a lost root, and no amount of re-derivation helps.
  That is why ADR-2800010900 D5 puts the recovery quorum in the contract and
  says the two land together: derivation without recovery is not a safer root,
  only a differently-fragile one."
  (:require [clojure.string :as str]))

(def version "kotoba.cloud/delegation-root/v1")

(def subjects
  "The subjects this apex derives keys for, and the info string each one gets.

  A map rather than a function so the set is enumerable: `kagi agent ls` shows
  which principals are cheap to steal from, and the same argument applies to
  knowing which keys exist at all."
  {:delegation-root "kotoba.cloud/delegation-root/v1"
   :log-signer "kotoba.cloud/delegation-log-signer/v1"})

(def seed-length
  "Ed25519 seeds are 32 bytes. Named rather than inlined so a caller that asks
  for a different length is making a visible choice."
  32)

(def ^:private min-prf-bytes
  "WebAuthn PRF returns 32 bytes per evaluation. A shorter value did not come
  from a PRF evaluation, and deriving from it would produce a key with less
  entropy than the caller believes it has."
  32)

(defn info-for
  "The info string for a subject, or nil if the subject is unknown.

  Unknown is nil rather than a default. A default would let a subject nobody
  registered derive the same bytes as one that was."
  [subject]
  (get subjects subject))

(defn- blank-bytes? [b]
  (or (nil? b) (zero? (count b))))

(defn refusal
  "Why a derivation cannot be performed, or nil when it can.

  Returned rather than thrown so the caller can report which input was wrong
  without catching, and so `could not derive` and `derived` are different
  values rather than one value and an exception."
  [{:keys [subject prf-output salt]}]
  (cond
    (nil? (info-for subject)) {:reason :unknown-subject :subject subject}
    (blank-bytes? prf-output) {:reason :no-prf-output}
    (< (count prf-output) min-prf-bytes)
    {:reason :prf-output-too-short :length (count prf-output) :required min-prf-bytes}
    (blank-bytes? salt) {:reason :no-salt}
    :else nil))

(defn derive-seed
  "Derive the Ed25519 seed for `subject`. -> `{:seed bytes}` or `{:refused …}`.

  `hkdf` is `(fn [ikm salt info length] -> bytes)`. The salt is the caller's:
  it is stored beside the public key and is not a secret, but it must be the
  same salt every time or the derivation is not reproducible and the published
  public key stops matching."
  [hkdf {:keys [subject prf-output salt length] :as request}]
  (if-let [r (refusal request)]
    {:refused (:reason r) :detail (dissoc r :reason)}
    {:seed (hkdf prf-output salt (info-for subject) (or length seed-length))}))

(defn envelope
  "What is persisted for a derived root: everything except the key.

  Deliberately has no field a secret could be put in. A shape that can carry
  the seed is a shape someone will eventually put the seed in — the same reason
  `kagi.agent-registry/approve` returns the token in its result and nowhere
  else."
  [{:keys [subject salt public-key created-at]}]
  {:v version
   :subject (name subject)
   :info (info-for subject)
   :salt salt
   :publicKey public-key
   :createdAt created-at
   :custody "derived-from-passkey-prf-not-stored"})

(defn stored-secret?
  "Whether a persisted envelope contains anything that looks like a private key.

  A guard against the shape drifting: this is asserted in the tests rather than
  trusted, because the field that carries a secret is usually added by someone
  who is sure it will not be persisted."
  [m]
  (boolean (some (fn [[k _]]
                   (let [n (str/lower-case (name k))]
                     (or (str/includes? n "secret")
                         (str/includes? n "private")
                         (str/includes? n "seed"))))
                 m)))
