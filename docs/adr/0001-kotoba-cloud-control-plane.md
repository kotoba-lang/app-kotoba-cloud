# ADR 0001: Kotoba Cloud is the identity and deploy control plane

Status: accepted — 2026-08-28

## Decision

`kotoba.cloud` owns the public identity, CLI, deploy-control and discovery
contracts for Kotoba. It does not absorb the state or execution domains:

- Kotobase owns durable, content-addressed storage and receipts.
- Murakumo owns CPU/GPU placement and execution.
- Itonami owns agent work: workspaces, goals, tools and approval interaction.
- kotoba-lang.org owns language specification and conformance.

The CLI must resolve the service topology from the live Kotoba Cloud profile
and fail closed when its schema or authority origins drift. The first slice
does not claim a hosted remote-apply service; local release admission and
Murakumo placement remain the observed implementation.

Passkeys use exact RP ID `auth.kotoba.cloud`. Existing credentials registered
under `auth.kotobase.net` remain a separate RP and must be linked to the same
Stable Principal through a verified migration ceremony; DNS aliases do not
migrate WebAuthn credentials.

Arbitrary deployed application content is not served beneath `kotoba.cloud`.
Keeping it on the Murakumo execution domain prevents untrusted workloads from
sharing the Kotoba authentication site's registrable-domain boundary.

