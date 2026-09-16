# Kotoba Cloud — verified white-hat research

Security-focused LLM inference for authorized code review, vulnerability triage and remediation.
Status: LIVE. Verification is card-based: a live credit or debit card on file (a $0 setup at
checkout.stripe.com, prepaid and virtual cards refused) approves the account automatically —
verification (365 d), screening (24 h), trust route, the `owned` / `code-review` scope, activation.
Document verification (Stripe Identity) can be added; it is not required for the free allowance.

Free allowance after verification: 1,000 requests per UTC day, up to 32,768 output tokens per
request, 524,288 input characters per request (about 128k tokens). With prepaid AI credits a
request past the daily allowance runs paid instead (never charged twice; see
https://docs.kotoba.cloud/reference/per-request-cost/). No automatic top-up.

## Registration (agent-followable; the human completes the card step)

1. Sign in at https://auth.kotoba.cloud/sign-in — every method yields the same stable principal
   (did:web:kotoba.cloud:tenant:…), and the method does not affect verification:
   - Passkey (Face ID / Touch ID / Windows Hello), or
   - Your own key: `POST /v1/cacao/session` with a self-minted CACAO
     (`kotoba cacao --aud https://auth.kotoba.cloud`, one-time, replay-proof), or
   - Ethereum wallet (SIWE) or Base Account, or
   - Recovery phrase (BIP-39, derived in-browser; the phrase never leaves the device).
   Passwords, email, SMS and OAuth are not sign-in methods. Linking Google / GitHub names the
   account; the passkey or wallet proves it.
   The session cookie (`credentials: "same-origin"`) is what the research API reads from a browser.

   CLI / IDE agents (no browser session at call time): the account holder signs in once and
   issues a personal API token at https://kotoba.cloud/account (Use from a CLI / IDE → Issue a
   connection token; shown once). Send `Authorization: Bearer kc_pat_...` on every call, never a
   query parameter:
   - POST https://api.kotoba.cloud/v1/chat/completions   (OpenAI-compatible: tools, stream, max_tokens ≤ 32768)
   - POST https://api.kotoba.cloud/v1/research/jobs      (async, idempotency-key uuid v4)
   - GET  https://api.kotoba.cloud/v1/models, /v1/research/status, /v1/billing/status
   Every gate (verification, approved scope, quota, guardrails) is the browser session's; the
   token only removes the browser-origin and cookie requirements. Tokens are revocable one by one
   in the account console; a revoked one answers 401 token-revoked.
2. Start verification:
   POST https://api.kotoba.cloud/v1/research/ekyc/start
   JSON body: {"scopeId":"owned","tasks":["code-review"]}
   - a card already on file → approved in this call; skip to step 5
   - otherwise → {"verificationUrl": "https://checkout.stripe.com/...", "expiresAt", ...}
3. The human account holder opens the verificationUrl and registers a credit or debit card
   ($0 setup; the card number never reaches kotoba.cloud). An agent MUST NOT enter card details.
4. Stripe posts checkout.session.completed to the first-party webhook; approval lands within
   seconds: verified (365 d), screening clear (24 h), trust 60/100 web-reviewed, scope approved,
   status active. No reviewer, no other provider.
5. Poll until eligible:
   GET https://api.kotoba.cloud/v1/research/ekyc/status  → {"status":"verified",...}
   GET https://api.kotoba.cloud/v1/research/status       → {"status":"eligible",...}
6. Run work — the OpenAI shape:
   POST https://api.kotoba.cloud/v1/chat/completions
   headers: {"content-type":"application/json","authorization":"Bearer kc_pat_..."}
   body: {"model":"qwen3.8-flash-next-whitehacker","max_tokens":2048,
          "messages":[{"role":"user","content":"Review this handler for auth bypasses: ..."}]}
   → chat.completion + "billing":"free"|"paid" + "receiptId" (usage and chargedMicroUSD on paid answers).
   Long work: POST /v1/research/jobs (202 queued) then GET /v1/research/job?jobId=<uuid> every 5 s.
   Native tool calls: send "tools" (up to 128 function definitions) and "tool_choice"; "tool_calls"
   come back with finish_reason "tool_calls"; the agent runs them locally and answers with role "tool".
   Catalog: GET /v1/models (team red = dedicated route, verification required; blue = shared route,
   sign-in only; availability "route-not-configured" is refused by name and spends no quota).

Error codes map to the missing step: sign-in-required → step 1; token-revoked → issue a new token;
invalid-ekyc-request → bad scopeId/tasks; verification-required → step 2 (the challenge lives
15 min); prepaid-card-not-accepted → a credit or debit card; research-scope-required → scope/tasks
mismatch between steps 2 and 6; free-quota-exhausted → the next UTC day, or add credits;
model-route-not-configured → pick a served model. Every code:
https://docs.kotoba.cloud/reference/errors/

- Docs: https://docs.kotoba.cloud/ (quickstart, SDKs, tool calling, errors, billing, data handling)
- Model catalog: https://kotoba.cloud/v1/models
- Registration page: https://kotoba.cloud/#research-register
- This document: https://kotoba.cloud/ekyc.md · summary: https://kotoba.cloud/llms.txt · full: https://kotoba.cloud/llms-full.txt

Boundaries. The server never executes tools, code, commands or network actions: a tool call the
model emits is data returned to the caller and runs, if at all, on the caller's machine. Guardrails
run on every request (CSAM, CBRN/WMD, fraud-as-a-service are refused; live credential shapes are
masked). Card numbers and documents go only to Stripe; kotoba.cloud keeps verification status,
expiry and an evidence reference. Job records (prompt, answer, tool calls, token counts) live in the
principal's private authority storage for 24 hours after the terminal state, then are deleted;
no inference logs, no training. Full statement: https://docs.kotoba.cloud/reference/zero-data-retention/
