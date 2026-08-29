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

The authentication Worker scopes its HttpOnly session to
`Domain=kotoba.cloud`, not to the exact `auth.kotoba.cloud` host. This is an
intentional same-product bridge so the apex can project login state without
making browser JavaScript a credential holder. `GET /v1/session` forwards only
that exact cookie to the pinned `https://auth.kotoba.cloud/v1/session` viewer,
fails closed on upstream drift, and returns only the generated username,
Stable Principal, account DID and active controller. It does not issue or
validate sessions, change controllers, or become an authorization authority.

The apex webpage is a public explanation and discovery entrance, not a second
deploy authority. Its source is a pure CLJC view on the workspace DADS base;
the build renders static HTML and a finite 404 document, while the Worker keeps
API and security-header behavior. The page must visualize one control/identity
plane connected to three separate authority domains. It must not imply that
`hostedApply`, credential migration, storage, compute, or agent execution are
implemented by the apex Worker itself.

The public thesis follows the language authority:
**“AI writes freely. Kotoba draws the boundary.”** Kotoba language admission
checks types, effects, capabilities, resources, and target support. Kotoba
Cloud carries the resulting boundary into identity and deploy discovery; it
does not claim that the apex page itself makes arbitrary code safe.

Japanese is served at `/` and English at `/en/`. Both are rendered from one
pure CLJC view and locale catalogs with an identical key contract. Each locale
has a stable canonical URL, reciprocal `hreflang` links, its own Passkey
return URL, and a finite localized 404 document. New languages extend the
catalog and route registry; they do not fork page structure or authority copy.

## Library publication addendum — 2026-08-29

Kotoba Cloud owns the publication-control entrance, not library identity or
block storage. The language authority at `kotoba-lang.org` publishes the
catalog contract and human documentation; Kotobase stores verified CID blocks
and receipts; the Kotoba CLI inspects and signs the content-addressed graph.

The first landed CLI flow is `kotoba library inspect` followed by
`kotoba library publish`. Publish is dry-run by default and explicit apply
reuses the existing local-operator signed-head plus IPNS implementation. A
GitHub URL is provenance only. Names and versions are discovery refs; exact
definition and release CIDs remain content identity, and neither identity
grants execution authority.

Hosted Passkey publication uses two independent gates. The CLI's Ed25519 key
signs the namespace head and stores the complete immutable closure first. The
approval URL carries only the bounded signed request in its fragment. An exact
same-origin POST then verifies the Passkey session and relays only that signed
record; Kotobase verifies the signer/name binding and sequence CAS. The
Passkey cookie is never forwarded to Kotobase.

The discovery profile publishes `hostedPasskeyPublish: true` for that bounded
relay only. It does not imply durable history, catalog ingestion, revocation
UI, generalized hosted deploy apply, or a short-lived Passkey-scoped storage
grant; those remain separately qualified work.

## Public identity E2E addendum — 2026-08-29

`kotoba id new` uses a ten-minute single-use device authorization request at
`auth.kotoba.cloud`. The browser performs and retains the Passkey ceremony;
the CLI receives only the generated username, Stable Principal, account DID
and active controller after an explicit browser approval. It persists that
public projection with user-only permissions and never receives a Passkey
private key, wallet seed, browser cookie or long-lived bearer token.

The same Principal reaches Kotobase, Murakumo and Itonami through a separate
two-minute, target-bound controller handoff. Kotobase and Murakumo consume the
code on their own auth host and issue their own first-party cookie. Itonami is
an independently deployed Worker, so it redeems the code server-to-server at
the fixed Kotoba controller and then issues its host-only
`__Host-itonami_session`. Every code is consumed once and fixes its target and
return URL before the browser receives it.

This is Principal continuity, not WebAuthn credential portability. Each RP
keeps an independent Passkey credential, session and authorization policy.
`itonami.cloud` is a relying application and agent-work plane; it is not the
root of Kotoba identity. The public product pages expose an explicit connect
action only after the Kotoba session is known and visibly project their own
first-party session after connection.
