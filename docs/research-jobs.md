# Asynchronous browser research — draft integration

The browser posts a validated completion to `/v1/research/jobs` with a UUIDv4
`Idempotency-Key`. It stores only this opaque ID in the URL fragment and polls
`GET /v1/research/job?jobId=...` every five seconds. Reloading resumes retrieval;
it never resubmits prompts automatically. No prompt or credential is persisted
in localStorage/sessionStorage or URLs. The original synchronous Chat Completions
endpoint remains unchanged for existing API clients.

The existing private `RESEARCH_AUTHORITY` must implement `/jobs/create` and
`/jobs/status`. These calls return quickly, within the existing 60-second edge
limit, while a durable dispatcher performs inference separately. No production
binding or dispatcher is supplied by this draft.

Both calls receive server-authenticated `principalId`, scoped `sessionRef`, jobId,
policyVersion, trustPolicyVersion, sessionPolicyVersion and billing=free-only.
Create also receives the validated request and free limits. The private host
must recheck authorization and reserve quota+job atomically, use a server-computed
input fingerprint for idempotency, and return 409 for a conflicting reuse. The
ekyc identity-jobs coordinator supplies these state transitions, but the HTTP
adapter and qualified storage/queue integration remain pending.

Response fields: matching jobId/principalId/sessionRef and policy versions,
model, billing=free, policyDecision=allowed, persisted receiptId, task, scopeId,
current authorization record, and status queued/running/succeeded/cancelled/unknown.
Succeeded also requires bounded content. The edge validates current identity,
screening, trust, session and scope before releasing status/results, strips the
private record and emits 202 for queued/running, 200 for terminal state. Neither
request IDs nor receipt IDs authorize access. Do not echo internal exceptions.

Release blockers: real private adapter/storage/KMS/queue/observers; signed review
and credentials; cross-person quota identity; recovery and retention; production
end-to-end trial. New gateway tests pass under kbb SCI. Browser and Worker compatibility builds succeeded with zero compiler warnings;
the existing Worker smoke checks also passed. A loopback-only synthetic browser
fixture showed result retrieval on initial load and reload with an opaque job ID.
This is not a real model/identity/storage end-to-end test.
The installed `amu` command currently resolves to a missing Hermes profile.
Calling the repository compiler directly with the package build arguments also
refuses them: it requires a .kotoba/.cljk/.cljc source, not the legacy browser/app
build names. The build entrypoint needs repair before release.
Do not merge/deploy this UI as a working research service based on these tests.
