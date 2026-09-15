# ADR 260914: Kotoba Cloud research inference connects directly to its dedicated deployment

**Status:** Accepted

## Context

Kotoba Cloud provides an access-controlled white-hat research service. The
previous private research authority sent admitted requests through
`api.murakumo.cloud`. That extra hop made Murakumo an operational dependency of
the Kotoba Cloud product even though admission, eKYC/AML/CTF review, approved
scope checks, session evidence, quotas, and receipts are owned by Kotoba Cloud.

## Decision

The private `kotoba-research-authority` Worker calls the explicitly configured
dedicated inference deployment directly. Its configuration is two stored
secrets (their names are fixed by the stored values):

- `MODAL_INFERENCE_URL`: the deployment's HTTPS OpenAI-compatible completion
  endpoint; the authority pins the deployment host it accepts.
- `MODAL_INFERENCE_TOKEN`: its server-only bearer token.

The authority rejects missing configuration, a host other than the pinned
deployment host, failed upstream
responses, a model attribution mismatch, or missing/inconsistent provider usage
instead of falling back to Murakumo or another model. Browser requests never
receive either configuration value.

The durable job stores a usage receipt only from the provider's
`prompt_tokens`, `completion_tokens`, and `total_tokens`; request text, maximum
output settings, and elapsed time are never converted into billable usage.
Kotoba Cloud retains every research admission gate and remains the sole public
API and billing authority.

## Consequences

Murakumo is removed from this inference path. Before a live research job can
run, operators must configure the exact deployment URL and token in the
research authority Worker, then execute an admitted end-to-end job and verify
its provider usage receipt. Until then, inference fails closed with a 503 rather
than routing requests through the former backend.

## Validation

The transformed `.cljk` Worker compatibility build completed with 46 files and
no compiler warnings. `test/research-authority-local.mjs` passed, including the
direct deployment URL, bearer-header, model-attribution, admission, replay, and
provider-usage receipt checks.

## 2026-09-15

Public surfaces (the catalog, `/models/`, README) name no provider; the
deployment behind each route is operator configuration. This record keeps
the two secret names because a stored secret cannot be renamed without its
value.
