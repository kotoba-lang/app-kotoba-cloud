# Historical transport verification — 2026-09-13

The model was subsequently renamed to `qwen3.8-flash-next-whitehacker`.
The old name below records the response at verification time; `kotoba/norbert`
is reserved for a future release and is no longer published or accepted.

- Public discovery: `https://kotoba.cloud/v1/models` exposes `kotoba/norbert`.
- Direct Murakumo SSE: a small, agent-written addition function returned
  `The code correctly returns the sum of a and b.`, the requested Qwen model ID,
  `finish_reason: stop` and `[DONE]`. No fallback model was used.
- Released provider adapter: the same benign code review returned
  `The function correctly returns the sum of a and b.` in 2042 ms,
  `model: kotoba/norbert`, `finishReason: stop`.
- These are transport tests, not an approved research session or an eKYC receipt.
  No identity evidence, browser credentials or user source code went to the model.
- The real browser showed an authenticated Kotoba principal, followed by
  `verification-provider-not-configured` on the research access screen.

## Remaining activation boundary

Keep the existing identity and research approval requirements. Production has
neither `IDENTITY_AUTHORITY` nor `RESEARCH_AUTHORITY` connected. The eKYC repository
provides host components, not a deployed provider. Activation still requires
qualified private Kotobase storage and key custody, enrolled independent
reviewers and screening evidence, the published intake notice, and current
session observers. Do not install a generic inference proxy on either binding
or substitute a successful Passkey session for those records.

The `/identity` route now serves a dedicated identity document instead of the
chat homepage. Chat settings explain the next access step from the authenticated
status response. Intake/camera controls remain disabled until the private
service explicitly enables them.
