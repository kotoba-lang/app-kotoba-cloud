# Kotoba Cloud — verified white-hat research

Security-focused LLM inference for authorized code review, vulnerability triage and remediation.
Status: LIVE. Identity verification runs on Stripe Identity only: no manual review queue, no other provider.
After one Stripe Identity verification the account is approved automatically (ekyc + screening + trust + scope + activation).

Free allowance after verified identity: 1,000 requests per day, up to 32,768 output tokens per request (524,288 input characters, about 128k tokens). No automatic paid fallback.

## Registration (agent-followable, Stripe Identity only)

1. Sign in at https://auth.kotoba.cloud/sign-in — any method works and yields the
   same Stable Principal (identity method does not affect verification):
   - Passkey (Face ID / Touch ID / Windows Hello), or
   - Your own key: `POST /v1/cacao/session` with a self-minted CACAO
     (`kotoba cacao --aud https://auth.kotoba.cloud`, one-time, replay-proof), or
   - Ethereum wallet (SIWE) or Base Account, or
   - Recovery phrase (BIP-39, derived in-browser; the phrase never leaves the device).
   The session cookie (`credentials: "same-origin"`) is what the research API reads.
   Sole-custody methods (own key / wallet / phrase) never expose keys to the service.

   CLI/IDE alternative (no browser session at call time): after signing in once,
   the account holder issues a personal API token at https://kotoba.cloud/account
   (「CLI / IDE から使う」→「接続トークンを発行」, shown once). Local agents then send
   `Authorization: Bearer kc_pat_...` on every call (never a query parameter):
   - POST https://api.kotoba.cloud/v1/chat/completions (OpenAI-compatible)
   - POST https://api.kotoba.cloud/v1/research/jobs (async, Idempotency-Key)
   - GET  https://api.kotoba.cloud/v1/models, /v1/research/status
   All eligibility gates (Stripe Identity verification, approved scope, free
   quota) apply identically; the token only removes the browser-origin and
   cookie requirements. Revocation is by rotating the signing secret
   (support@kotoba.cloud).
2. Start verification:
   POST https://api.kotoba.cloud/v1/research/ekyc/start
   same-origin JSON body: {"scopeId":"owned","tasks":["code-review"]}
   Response: {"sessionId","externalId","verificationUrl","expiresAt","scopeId","tasks"}
3. Open the returned `verificationUrl` (https://verify.stripe.com/...) in a browser.
   The human account holder completes the Stripe Identity document + selfie check.
   An agent MUST NOT attempt to complete the identity check itself.
4. On success Stripe calls the first-party webhook and the account is approved
   automatically within seconds: ekyc verified (365d), screening clear (24h),
   trust 60/100 (web-reviewed), scope approved, status active.
5. Poll status until eligible:
   GET https://api.kotoba.cloud/v1/research/ekyc/status  → {"status":"verified",...}
   GET https://api.kotoba.cloud/v1/research/status      → {"status":"eligible",...}
6. Run a job:
   POST https://api.kotoba.cloud/v1/research/jobs
   headers: {"content-type":"application/json","idempotency-key":"<uuid-v4>"}
   body: {"model":"qwen3.8-flash-next-whitehacker","task":"code-review","scopeId":"owned",
          "max_tokens":2048,"messages":[{"role":"user","content":"Review owned code."}]}
   (also available: "glm5.3-flash" — see GET /v1/models for the current catalog.)
   202 = queued, poll GET /v1/research/job?jobId=<uuid> every 5s; 200 = terminal.

Error codes map to the missing step: sign-in-required → step 1, invalid-ekyc-request →
bad scopeId/tasks, stripe-identity-not-configured → temporary, verification-required →
repeat step 2 after the prior challenge expires (15 min), research-scope-required →
scope/tasks mismatch between step 2 and step 6.

- Model catalog: https://kotoba.cloud/v1/models
- Registration page: https://kotoba.cloud/#research-register
- This document: https://kotoba.cloud/llms.txt
- Full agent docs: https://kotoba.cloud/llms-full.txt

Not a drop-in API-key service. No tools, arbitrary models or system-message overrides.

Access order (the assurance ladder): the saved card unlocks the free
research allowance (1,000 requests/day) immediately; identity verification and the
governance checks (business verified, contracted researcher) come after and raise
the token ceiling. Tool calls, command execution and automation are NEVER performed
server-side — the model returns text only; execute tools locally on your machine.
Documents and selfies go only to Stripe (https://verify.stripe.com); kotoba.cloud stores
no identity images. Consent to the published data handling notice is part of the flow.
