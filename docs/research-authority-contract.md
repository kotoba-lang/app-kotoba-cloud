# White-hat research authority contract

Status: edge admission and user interface implemented; private authority and
provider integrations pending. Policy: `whitehat-2026-09-12-v1`.

## Service boundary

The apex receives an HttpOnly session, obtains the authenticated Stable Principal
from the existing auth viewer, and passes only that Principal to a private
Cloudflare HTTP service binding named `RESEARCH_AUTHORITY`. The hostname
`research.internal` is a binding request label, never a public network endpoint.
No cookie, bearer credential, raw identity evidence or biometric material crosses
from the apex to the model. Do not bind a generic inference proxy to this port.

The authority must have no public bypass to its management or inference methods.
Its canonical durable data belongs in a private Kotobase database/ref named
`kotoba-cloud-security-research`, with encrypted evidence references and access
restricted to the service and separately authorized reviewers. No PII or prompts
in public IPLD, public ledgers, chain transactions, logs, or model discovery.
Evidence blocks, if retained, use encrypted bytes and CID read/write validation.
DO state may provide serialization/projections only; canonical events and audit
receipts must be recoverable from Kotobase. Missing storage means no approval.

## Required private HTTP methods

All calls are JSON POST requests over the service binding. Requests are bounded
at the edge, upstream responses at 128 KiB; the edge gives each call 60 seconds.

- `/status`: input `principalId`. Return `principalId`, `policyVersion`, `status`,
  `ekyc`, `screening`, and `scopes`. `status` is `active` only after the required
  reviews and current consent. eKYC has `status: verified`, `evidenceRef`,
  `verifiedAt`, `expiresAt`; screening has `status: clear`, `evidenceRef`,
  `checkedAt`, `expiresAt`. Times are epoch milliseconds. The edge rejects
  verification older than 365 days or screening older than 24 hours, future
  timestamps, expiry, missing evidence and Principal/policy mismatches.
  Scopes have `id`, `status: approved`, `tasks`, `expiresAt`.
- `/applications`: input trusted `principalId`, generated `requestId`, and an
  application containing `verificationMode: new|reuse`, `purpose`, `scope`,
  `policyVersion`, `consent: true`, `authorizedResearch: true`; reuse also requires
  `issuer` and `reference`. Return matching `principalId` and `applicationId` only
  after durable acceptance. This receipt means pending review, never approval.
  The authority must rate-limit applications per Principal and deduplicate
  attempts before starting billable checks. No hosted verification URL is
  currently exposed; provider SDK/redirect integration is a separate launch step.
- `/complete`: input trusted `principalId`, generated `requestId`, `policyVersion`,
  `billing: free-only`, `limits` and the validated `request`. Atomically recheck
  eKYC, suspension, screening freshness, approved scope, consent and daily budget
  at dispatch; reserve one request and output budget before sending to the model.
  Reservations must be unique by requestId and global per verified person across
  linked Principals, with a UTC reset, concurrent-request cap and bounded expiry.
  Never trust `/status` as an execution grant. Never charge money or switch to
  another model. A suspended person must not retain access through cached grants.

Successful completion returns matching `principalId`, `requestId`, `policyVersion`,
exact `model`, `billing: free`, `policyDecision: allowed`, persisted `receiptId`,
and a nonempty `content` string. Do not return reasoning traces, tool calls or
provider secrets. The edge constructs the outward Chat Completions response;
it does not forward arbitrary provider JSON or headers. Unknown/incomplete
receipts fail with 502. Daily allowance exhaustion returns 429. Failed/ambiguous
upstream attempts must reconcile the same reservation, never dispatch twice on
retry. The edge deliberately does not retry completion requests.

## Identity and AML/CTF operations before launch

1. Establish supported jurisdictions, operator responsibilities, lawful processing
   grounds, privacy/DPA terms, retention and deletion periods, cross-border
   transfers, sanctions datasets and update SLA. Review legal applicability to
   this inference service; do not claim financial-services certification.
2. Contract an eKYC provider for document authenticity and liveness/identity
   matching, and sanctions/PEP/adverse-media screening. The current native
   `face-match` implementation returns review; it cannot be used to auto-approve.
   Libraries `ekyc`, `aml`, `watchlist-screen` remain reusable components, not
   evidence of a contracted, current screening feed.
3. For reused verification, accept only explicitly trusted issuers and assurance
   levels, authenticated provider retrieval or signed verifiable evidence, current
   validity/revocation, consent, and strong subject-to-Principal binding. Re-run
   required screening. A checkbox, wallet balance, payment, screenshot or arbitrary
   reference supplied by a user cannot approve the person.
4. Authenticate webhook signatures over raw bytes with vendor-prescribed keys,
   timestamp/replay checks, exact applicant-to-Principal binding, event idempotency,
   ordering and authoritative provider readback. A webhook alone must not mint a
   login session. Terminal adverse decisions must not be revived by old events.
5. Distinguish possible name matches and PEPs from confirmed sanctions; use human
   review and documented enhanced due diligence where needed. Track pending,
   verified, rejected, expired, suspended and appeal/review transitions. Reviewers
   may review eligibility but cannot authenticate or recover an identity.
6. Require authorization evidence for each research scope (owned repository or
   documented delegated assessment). Apply human review for ambiguous authority,
   declared purpose and scope expiry. Account approval is not target permission.
7. Run daily screening refresh, immediate suspension/revocation processing,
   periodic eKYC renewal and case review. Failure of a feed blocks admission after
   the current screening expires; it does not extend clearance.
8. Publish support and appeal process, retention schedule, subprocessor/region list,
   service-specific terms and research acceptable-use policy before collecting
   identity evidence. Current site makes this pending status explicit.

## Inference qualification before launch

Candidate: `qwen3.8-flash-next-cybersecurity-nvfp4`. Treat all model-card benchmark
and hardware claims as provider claims until independently measured. The linked
card describes reduced refusals; identity checks and a system prompt alone are
not sufficient content controls. The private authority must enforce input/output
policy, task isolation, approved scopes and abuse handling independently of the
candidate model. First release is text-only code review, triage and remediation;
no external tools, autonomous targets or network actions.

Measure useful answer generation and token limits on the actual serving stack,
model/version identity, license provenance, provider retention/training policy,
input/output policy behavior and refusal of out-of-scope harmful requests. Do not
weaken safety mechanisms or present model refusal removal as a product guarantee.
The service must consume only qualified Murakumo compute or an explicitly approved
provider under that boundary. No GPU rental or contract has been purchased here.

## Acceptance evidence

Edge tests must cover unauthenticated/spoofed identity, origin/content type,
streamed size caps, missing bindings, stale/adverse evidence, scopes, exact model,
unsupported tools and invalid receipts. Before enabling binding, run independent
clients through real eKYC success/failure/reuse/appeal, authenticated/replayed
webhooks, concurrent free-quota exhaustion, revoked access, storage restart and
lost responses, real model completions and provider outages. Mocks qualify the
edge contract only. A health endpoint, status flag or successful build does not
prove this full process is live.

## Reference sources (checked 2026-09-12)

- https://www.orcarouter.ai/ — model discovery and gateway experience; no integration assumed.
- https://huggingface.co/dealignai/Qwen3.8-Flash-Next-CYBERSECURITY-NVFP4 — candidate model card.
- https://dealign.ai/ — source research; no model modifications are performed here.
- https://docs.sumsub.com/docs/reusable-kyc — example of contractual verification reuse, not a selected vendor.
- https://www.fatf-gafi.org/content/dam/fatf/documents/recommendations/pdfs/Guidance-on-Digital-Identity-report.pdf — risk-based digital identity guidance.

## Selected production transports (2026-09-12)

`research-providers` supplies the concrete private-authority transports:

- `create-session`: Self Enterprise REST API, pinned live flow/version, a 15-minute
  opaque challenge, live verification URL validation. Keys are server secrets.
- `verify-event`: official Svix verification of raw bytes, followed by exact live
  flow/version, pre-KYC product, challenge/session, time and predicate checks.
  Returns **identity evidence requiring review**, never blanket AML clearance.
- `infer`: exactly `https://api.murakumo.cloud/v1/chat/completions`, model
  `qwen3.8-flash-next-cybersecurity-nvfp4`. No fallback model; rejects mismatched
  response attribution. This uses the upstream's supported public inference path.

These transports are buildable and tested separately from the public Worker.
They are **not yet attached to a production authority**. No application may call
`infer` without the canonical atomic quota reservation described above. Self
session URLs are bearer capabilities: return only to the authenticated applicant;
never place them or raw proofs in logs, analytics, public blocks or datoms.

Before activation the authority must atomically consume `eventId`, challenge and
scoped `nullifier`, write minimal encrypted/private evidence to Kotobase, run the
configured sanctions/PEP/manual review workflow, and issue a scope grant. The
`consumed` value comes from this canonical record, never request JSON. Self OFAC
coverage alone does not establish comprehensive sanctions, PEP or AML/CTF review.
A reused identity needs a fresh service-bound proof and current screening.

Cold startup is advertised up to 2,000 seconds by Murakumo's model inventory.
The transport permits up to 2,100 seconds; the public gateway's 60-second binding
call is deliberately unchanged. The authority needs a durable asynchronous job
and authenticated polling route before exposing cold inference to researchers.
A queued job must reserve free quota once, recheck revocation before dispatch,
record the actual model receipt, and never automatically rebill or silently retry
an unknown execution outcome.

Self's new-integration path requires a dashboard account and a live Pre-KYC flow,
plus `SELF_API_KEY`, `SELF_FLOW_ID`, `SELF_FLOW_VERSION_ID` and
`SELF_WEBHOOK_SECRET`. Test keys are rejected. Establish the privacy/retention
notice and review operator permissions before opening document verification.
No customer identity has been verified by these fixture tests.

References: https://docs.self.xyz/docs/self-enterprise/sdk/nodejs/ and
https://docs.self.xyz/docs/self-enterprise/webhooks/verify-webhooks/ . Wire fields
were checked against the official `@selfxyz/enterprise-sdk` 0.4.1 package. The
small REST surface is used directly because installing the complete SDK pulls a
legacy core Git dependency whose preparation fails under the workspace npm policy;
Svix 1.92.2 remains the unmodified signature verifier.


## First-party Kotoba Identity direction

Primary implementation now lives in `kotoba-lang/ekyc`: TD3 passive authentication,
review state machine, holder-bound Ed25519 credentials, revocation, free reservation
and a commit-gated authority coordinator. An iPhone CoreNFC capture bridge compiles
for iOS. These components do not depend on a Self subscription. Self transports
remain an optional alternative, not a requirement for the first-party path.

`/.well-known/kotoba-identity.json` advertises the actual profile and keeps
`enrollmentEnabled=false`. The private canonical storage host, production trust
bundle, physical passport qualification, review operations and signed phone app
are not supplied by the component release. No client-side test/fixture result can
open enrollment. ZK proof generation is a later phase and is not advertised as
implemented. The Murakumo model and existing fail-closed research gates remain.


## Web-first trust routes (identity v2)

The initial route is browser document capture plus supervised live video review.
It contributes 60 points after signed operator approval. App passport verification
is a separate later route worth 80 points; combined score is capped at 100, with
a threshold of 60. Weights are provisional assurance points, not probabilities.
App distribution and physical NFC qualification are not Web launch prerequisites.

The authority must supply a current `trust` projection with `policyVersion`
`kotoba-trust-routes-2026-09-v1`, `score`, distinct `routes`, `evaluatedAt` and
`expiresAt`. The ekyc library's `identity-trust/projection` computes this from
canonical evidence and caps freshness at 60 seconds or the earliest contributing
evidence expiry. The gateway recomputes the fixed-policy score and rejects stale,
unknown, duplicate or inconsistent route claims. It never accepts browser scores.
The `/complete` authority rechecks source revocation and all admission gates before
dispatch, including after queueing. Screening, account suspension, scope and quota
cannot be bypassed by any score. Linked source revocation removes its points.

Browser capture/review host and protected storage remain unimplemented; this
release changes tested policy and API admission, not live customer intake.
