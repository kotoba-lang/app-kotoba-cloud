# ADR 2609142100: Self-hosted identity verification replaces Stripe Identity

**Status:** Accepted (implementation staged)

## Context

Stripe Identity costs roughly ¥300 per verification. Kotoba Cloud already owns
the full admission chain (challenge → webhook verification → approval chain →
scope approval) in `kotoba-research-authority`, and `research_providers.cljk`
already ships a Self (self.xyz) provider adapter and an unoffered
`web-reviewed` route. The four quality layers Stripe provides must be
reimplemented in-house without losing admission quality:

1. document authenticity
2. biometric match (selfie ↔ document)
3. AML/CTF screening (sanctions + PEP, public data)
4. duplicate-person resistance (same-human exclusion)

## Decision

### Layer architecture (all four layers)

| Layer | Component | Hosting |
|---|---|---|
| 1 document authenticity | Self Network proof (zk: government-ID issuance verified on-chain) + MRZ/checkdigit re-verification | Self edge (already coded: `create-session`/`verify-event` in research_providers.cljk) |
| 2 biometric match | Self liveness+face proof (`proof_attributes` in the Svix event) + secondary face-embedding match | Self (primary), cross-check on Modal |
| 3 AML/CTF screening | PEP/sanctions watchlists as **public data served from kotoba.cloud** + name/dob matcher | kotoba.cloud static data (security-data path) + authority-side matcher |
| 4 duplicate-person resistance | Self `nullifier` (scoped, irreversible) consumed atomically per scope | research authority DO storage |

### Why Self (self.xyz)

- The provider adapter in `research_providers.cljk` is already complete:
  session creation (`/v1/sessions` on `edge.dashboard.self.xyz`), Svix
  signature verification, and admissibility checks on
  `proof_attributes.ofac` (true), `proof_attributes.minimumAge` (18),
  and a present `nullifier`.
- Self's proof is zero-knowledge: the government ID issuance is verified
  cryptographically, so layer 1 does not require us to run OCR/forensics on
  images at all. Biometric liveness/face is attested inside the proof.
- Cost is a fraction of Stripe per verification and the nullifier gives
  layer 4 without storing biometrics (matches the existing
  "images sent-to-provider-only, never stored" policy).

### PEP/sanctions as kotoba.cloud public data (layer 3)

- The `security-data` static pipeline (`public/security-data/`, IPLD manifest
  + datoms + JSON-LD) already serves curated public security data from
  kotoba.cloud. PEP/sanctions lists (OpenSanctions base export, CC BY-NC 4.0 — non-commercial; commercial use requires a data license from OpenSanctions) are
  added as a new dataset under the same path with the same manifest pattern:
  `/security-data/pep/index.json`, `pep/persons.datoms.json`,
  `pep/schema.edn` (name variants, dob ranges, jurisdiction, list source).
- Refresh job (cron bot, weekly): download OpenSanctions base export →
  normalize into the datoms schema → publish + manifest update → authority
  matcher reads the published snapshot (content-addressed, immutable per
  snapshot id recorded in the audit receipt).
- The authority's screening step becomes: extract legal name + dob from the
  Self proof disclosure → match against the published snapshot → write
  `:screening {:status clear|review-required :evidenceRef <snapshot-id+match-digest>
  :checkedAt now :expiresAt (+ now screening-ttl-ms)}`. Matches are never
  auto-clear; they route to the existing operator review
  (`RESEARCH_OPERATOR_SECRET` HMAC path, `clear-screening` op).

### Image analysis on Modal (secondary biometric check)

- `cloud-murakumo/deploy/model-runtime/server.py` already runs an offline
  ONNX runtime on Modal. A face-embedding model (e.g. an ArcFace-family ONNX
  graph) is served as a second deployment of the same runtime
  (`MODEL_KIND=onnx`).
- The authority sends the two crops (selfie + document portrait) that the
  Self flow discloses — no raw document storage, only the derived embedding
  digest — and records `embeddingMatch: true|false` plus the model id in the
  audit receipt. Threshold and model id are pinned in this ADR; a mismatch
  routes to operator review, never auto-clear.
- This is a cross-check, not the primary gate: Self's zk proof is the
  admissibility gate; Modal is defense-in-depth against Self flow
  misconfiguration.

### Wiring (authority changes)

- New ops on the private authority, all behind the existing
  `require-operator!` HMAC gate:
  - `self-verify-ekyc` — same shape as the Stripe webhook handler: consume
    the challenge by verified session id, apply ekyc + screening(clear if no
    match) + trust(web-reviewed 60) + scope approval atomically.
  - `screening-result` — records the matcher outcome for a caseId
    (clear / review-required), so the weekly refresh never silently changes
    an adjudicated decision.
- Edge: `/v1/research/ekyc/start` gains `provider` ("stripe" | "self"),
  defaulting to "self" once live; Stripe stays as fallback until Self
  completes its first admitted end-to-end job.
- The nullifier is stored per (scopeId, nullifier digest); a repeat
  registration with the same nullifier is rejected
  (`duplicate-person-rejected`).

### Secrets/configuration

- `SELF_API_KEY`, `SELF_WEBHOOK_SECRET`, `SELF_FLOW_ID`,
  `SELF_FLOW_VERSION_ID` on `kotoba-research-authority` (Svix signing
  secret comes from the Self dashboard webhook setup).
- `MODAL_FACE_URL`, `MODAL_FACE_TOKEN` for the secondary embedding check.
- Stripe secrets stay (fallback route).

## Consequences

- Stripe Identity becomes the fallback, not the primary. The first admitted
  end-to-end Self job must be verified before switching `defaultRoute`.
- The PEP/sanctions dataset is public data served by kotoba.cloud; the
  matcher runs inside the authority (private), so watchlist hits are not
  disclosed publicly — only the snapshot id and digest are referenced.
- Biometric images are still never stored by Kotoba Cloud; only Self sees
  them, and Modal only sees derived crops/embeddings for the cross-check.
- Review-required cases (PEP hit, embedding mismatch) go to the operator
  review path that already exists (`handle-review`, `require-operator!`).

## Validation plan

1. Local: `test/research-providers.mjs` Self adapter tests (already present).
2. Local: authority test with a forged-Svix fixture asserting
   `self-evidence-not-admissible`; happy-path fixture asserting the full
   approval chain with `screeningCoverage ["self-ofac", "pep", "sanctions"]`.
3. Staging: create the Self flow, complete one verification, confirm the
   webhook applies the chain and the nullifier dedupe rejects a second
   registration with the same nullifier.
4. Modal: pin the face model, verify embedding match on a fixture pair
   (same person / different person) before wiring into the authority.
