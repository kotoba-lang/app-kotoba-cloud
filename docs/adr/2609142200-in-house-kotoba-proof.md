# ADR 2609142200: in-house Self replacement — "kotoba-proof" identity attestation

**Status:** Accepted (design; implementation staged)

## Context

The Self (self.xyz) route (ADR 2609142100) still depends on Self Network's
edge (`edge.dashboard.self.xyz`) for session creation and on Self's zk
attestation for document authenticity + biometrics. Fully in-housing it
means building what Self provides without their network:

- government-ID authenticity (issuer signature over the document chip)
- selective disclosure of attributes (age ≥ 18, name/dob for screening)
- duplicate-person resistance without storing identity data
- liveness binding (the chip holder was physically present)

## Decision

Build "kotoba-proof" on the primitives we already operate, replacing Self's
zk layer with signature-based verification (no zk circuit) plus the existing
Durable-Object state machine:

### Layer 1 — document authenticity: ICAO passive auth (app-passport route)

A passport / (JP) My Number Card / driver's license chip carries
ICAO 9303 LDS data signed by the issuing state:

1. **capture bridge** (mobile web): WebNFC is too limited, so the kotoba
   mobile shell performs BAC/PACE + reads DG1 (MRZ data), DG11/DG12
   (attributes), SOD (Security Object Document: signed digest list), and
   emits a single opaque `chip-evidence` blob (base64, ≤ 64 KiB) to
   `/v1/research/ekyc/start` (provider `kotoba-proof`).
2. **authority verification** (runs in the DO, no external calls):
   - parse SOD → verify the document-signer (DSC) certificate chain up to the
     embedded CSCA master list (bundled, content-addressed, refreshed weekly
     like the PEP data)
   - recompute SHA-1/SHA-256 digests of DG1/DG11/DG12 and compare against SOD
     → document integrity = issuer-signed
   - extract: name, dob, expiry, document number, issuing state
   - MRZ check digits re-verified
   - expiry > now, dob ⇒ age ≥ 18
- this replaces Self's "government ID issuance verified" with the same
  guarantee minus zk: the evidence blob is issuer-signed, but our authority
  sees the disclosed attributes in plaintext (acceptable: the authority is
  the relying party, exactly like a border control officer; nothing is
  published).

### Layer 2 — biometric binding: liveness ↔ chip-holder binding

Self binds selfie↔chip in their proof. In-house:

1. capture bridge captures a **live selfie video** (3 s, device attestation
   via WebAuthn creation on the same device) plus stills.
2. the stills + DG5 (portrait) hash go to the **face service** (a private deployment)
   (cloud-murakumo model-runtime, ArcFace-family ONNX, CPU):
   - `POST /verify` `{portraitDigest, selfieFrames[]}` →
     `{match: bool, score, modelId}` (server keeps nothing but the digest)
3. liveness: model-runtime runs an anti-spoof ONNX (micro-texture + motion)
   on the frames; a `liveness: pass` result is required.
4. authority records `biometric: {match, liveness, modelId, checkedAt}` —
   a mismatch or fail routes to operator review (never auto-clear).
- model ids + thresholds are pinned in this ADR; upgrading requires an ADR
  note (auditability of the gate).

### Layer 3 — AML/CTF/PEP screening: unchanged from 2609142100

The disclosed name + dob are matched against the kotoba.cloud-published
PEP/sanctions snapshot (`/security-data/pep/`), matched inside the authority;
hits go to operator review. The weekly snapshot refresh cron also refreshes
the CSCA/DSC master lists for layer 1.

### Layer 4 — duplicate-person resistance: deterministic nullifier

Replace Self's nullifier with a keyed derivation performed **by the
authority, not the client**:

- `nullifier = HMAC-SHA256(NULLIFIER_KEY, normalized(documentNumber))`
- NULLIFIER_KEY is a server-only secret (like RESEARCH_OPERATOR_SECRET),
  so clients cannot compute or pre-hash identities
- stored mapping: `self-nullifier:<digest> → principalId`; a second
  registration with the same document (same normalized document number,
  including cross-issuing-state collisions by document number class) is
  rejected `duplicate-person-rejected`
- normalization: uppercase, strip separators, keep issuing-state prefix —
  documented so future operators can reason about collisions

### Session flow (replaces Self sessions)

1. `POST /v1/research/ekyc/start` `{provider: "kotoba-proof", scopeId,
   tasks}` → authority mints a challenge
   (`sessionId`, `nonce`, `expiresAt +900s`), persists it (existing slot)
2. mobile shell completes NFC read + selfie against the challenge nonce
   (nonce is bound into the WebAuthn challenge and the SOD digest list to
   stop replay)
3. mobile shell posts the evidence bundle to the authority (through the
   edge, size-capped) — no third-party webhook needed; the chain applies
   synchronously in the DO (verify → screening → trust(app-passport 80) →
   scope approval), then a receipt

### What this drops vs Self

- zero-knowledge selective disclosure: the authority sees disclosed
  attributes in plaintext. Accepted — the authority is the relying party;
  nothing is published or stored beyond digests and the nullifier.
- Self's issuer-root PKI maintenance: replaced by bundling public CSCA
  master lists (public, weekly refresh).

## Components to build

| Component | Repo | Notes |
|---|---|---|
| chip-evidence capture (mobile shell) | new `app-kotoba-passport` (or extension of kotoba mobile shell) | BAC/PACE via `nfc-manager` (React Native) or Android `IdentityCredential` API |
| LDS/SOD parser + digest verify | `app-kotoba-cloud` `src/app_kotoba_cloud/icao.cljk` (new) | pure .cljc, offline, fixture-tested with sample LDS dumps |
| CSCA/DSC master list refresh | cron bot (like PEP data) | public sources: ICAO PKD, EU list, Japan MPA |
| face + liveness service | cloud-murakumo `deploy/model-runtime` second deployment | ArcFace ONNX + anti-spoof ONNX, pinned model ids |
| authority ops | `research_authority.cljk` | `kotoba-proof-start`, `kotoba-proof-submit`, nullifier mapping |
| edge wiring | `research_gateway.cljk` | size cap (64 KiB), origin gate, relay |

## Consequences

- removes the Self Network dependency entirely (edge + their PKI)
- cost per verification ≈ the face service's CPU seconds (fractions of a cent) + zero
  per-verification vendor fee
- plaintext disclosure to the authority (documented tradeoff)
- the mobile capture bridge is the largest single piece of new engineering
  (NFC + WebAuthn + camera in one shell)
- interim: keep Self (if configured) and Stripe as fallback routes while
  kotoba-proof is staged; `weights {"app-passport" 80}` already prices it
  above Stripe's web-reviewed 60.

## Validation plan

1. `icao.cljk` unit tests against fixture LDS dumps (Japan MPA sample, EU
   sample, one tampered SOD → must fail)
2. authority e2e: chip-evidence fixture → approval chain, then replay with
   same document number / different principal → rejected
3. Face service: same-person fixture pair ≥ threshold, different-person
   pair < threshold, liveness spoof video → fail
4. staging: one real passport NFC read end-to-end through the mobile shell
