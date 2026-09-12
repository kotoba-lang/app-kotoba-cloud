# app-kotoba-cloud

`app-kotoba-cloud` is the public control and discovery plane for
[`kotoba.cloud`](https://kotoba.cloud). It gives the Kotoba CLI one stable
origin from which to discover identity, storage, compute, and agent-work
services without making those services one trust domain.

Kotoba Cloud applies the language's cryptographic floor: post-quantum evidence
is mandatory for every new Kotoba encryption, package-admission, and hosted
publication boundary. It is not an optional compatibility mode. Unknown
suites, missing PQ material, and classical-only downgrade fail closed;
development-only legacy paths are not migration requirements.

The boundary is deliberate:

- `kotoba.cloud` owns Kotoba identity, CLI and deploy control contracts;
- `kotobase.net` is the storage and durable receipt plane;
- `murakumo.cloud` is the compute plane, including GPU execution;
- `itonami.cloud` is the agent-work plane;
- `kotoba-lang.org` remains the language specification and documentation
  authority.

This first production slice is discovery, not a pretend hosted deploy
service. `kotoba deploy` still performs local release admission and asks the
Murakumo control plane to place admitted compute. It now fails closed unless
the live `kotoba.cloud` profile names the expected storage and compute planes.
The profile truthfully publishes `hostedApply: false` until a remote apply API
is implemented and qualified.

Library publication follows the same separation. `kotoba library inspect`
projects exact definition and dependency CIDs from the local hash-native
codebase. `kotoba library publish` is dry-run by default; explicit local apply
builds an immutable release CID binding definitions, raw Wasm, compile receipts,
and reproducibility evidence before reusing the signed namespace-head and IPNS
path. `--hosted` replicates every CID to the configured storage providers,
returns a fragment-only approval URL, and requires both an explicit click
under the existing Passkey session and a valid ML-DSA-65 approval made by the
CLI. On first use that ML-DSA public key is atomically pinned to the Stable
Principal; a later Passkey session cannot silently replace it. The Worker
verifies the signed payload before relaying the locally signed head.
Kotobase rechecks the `k51...` signer and monotonic sequence. The signing seed,
storage tokens, and Passkey cookie never cross their respective boundaries.
A hosted approval is valid for at most fifteen minutes, carries a signed
single-use request ID and monotonic PQ-key epoch, and is atomically consumed by
the Principal's Durable Object before Kotobase relay. Replaying the same
approval, using an old epoch, or using a revoked key fails closed.
Authenticated public rotation and revocation are live at
`POST /v1/pq-keys/rotate` and `POST /v1/pq-keys/revoke`. The current ML-DSA-65
key signs a short-lived transition request; rotation also requires the next
key to sign the exact same bytes. The browser then requires the Principal's
Passkey session before the atomic transition and returns a no-store receipt.
Exact transition IDs cannot be replayed. Independent recovery quorum,
scheduled drills, and a transparency witness are still blocked.
A platform Passkey still uses the COSE algorithm implemented by its
authenticator. The post-quantum claim is intentionally narrower: hosted
library publication is co-approved by the Principal-pinned ML-DSA-65 key. It
does not claim that WebAuthn, TLS, IPNS, or every Kotoba operation is
post-quantum. First-use key enrollment inherits the security of the live
Passkey ceremony; after enrollment, classical Passkey compromise alone cannot
replace the pinned ML-DSA key.
A release remains pending until `kotoba library verify` proves every byte at
two distinct storage origins and delegated routing observes two distinct
libp2p peer IDs. `kotoba library run` enforces that proof before executing a
hash-addressed Wasm export.
Durable publication history, catalog ingestion, revocation UI, and short-lived
Passkey-scoped storage grants are follow-ups, not current claims.

After a successful Passkey ceremony, the apex reads its same-product
`Domain=kotoba.cloud` HttpOnly session only through `GET /v1/session`. The
Worker forwards that one cookie to the exact `auth.kotoba.cloud` viewer and
returns only a generated username, Stable Principal, account DID and active
controller. The browser never receives the session token. The navbar, primary
action and Identity panel then switch from anonymous to signed-in state.

Signed-in product cards use a two-minute target-bound, single-use handoff to
create a separate first-party session at Kotobase, Murakumo, or Itonami. The
Stable Principal remains the same; RP Passkeys and cookies do not cross service
boundaries.

The public webpage is generated from pure CLJC using the workspace DADS
(`jp-go-digital-design-system`) base. It visualizes Kotoba Cloud as the single
control/identity entrance feeding three separately governed planes rather than
presenting the four domains as interchangeable products. `public/` is a build
artifact: `npm run render` produces English `/`, Japanese `/ja/`, and one
emit directory per catalog locale, then Wrangler ships them as Static Assets
beside the discovery Worker. Locale catalogs share one key contract and the
page publishes canonical, `hreflang`, and JSON-LD `inLanguage` links, so
another locale is an explicit catalog-and-route addition rather than a
second handwritten page.

Origin language switching runs in the Worker **before** the Static Assets
HIT and follows the kotobase.net detection contract:

`path > kb_locale cookie > Accept-Language > request.cf.country > en`

Country map: `ID→id`, `IL→he`, `KR→ko`, `ES→es`, `IT→it`, `DE→de`,
`MA→ar-MA` (else `ar`), `EG→arz`. Country never selects `jv` or `su`;
those stay explicit path, cookie, or `Accept-Language` choices.

Public copy follows the language authority's current thesis:
**“AI writes freely. Kotoba draws the boundary.”** The Cloud surface carries
that admitted-computation boundary into operation; it does not replace the
compiler, verifier, host enforcement, or service-specific authority.

## Public routes

- `GET https://kotoba.cloud/.well-known/kotoba-cloud.json`
- `GET https://api.kotoba.cloud/v1/control-plane`
- `GET /health`
- `GET /api/funnel` — first-party visitor / sign-in-intent / completed-registration counters. Starts at zero. Isolate memory until KV/D1 exists (HOLD).
- `POST /api/funnel/event` — `visitor`, `signup`, or `signup_completed`. Completed events require a valid Principal session.
- `GET /v1/session` — credential-free projection of the current Passkey session
- `POST /v1/libraries/publish` — same-origin Passkey + Principal-pinned
  ML-DSA-65 approval relay for a bounded, locally signed Kotobase head record
- `GET /schemas/library-publication-request/v3` — single-use, epoch-bound
  publication request contract
- `GET /` — English public architecture and CLI entrance; 302 to a catalog
  locale when cookie, `Accept-Language`, or `request.cf.country` negotiate
  one
- `GET /ja/`, `/id/`, `/jv/`, `/su/`, `/he/`, `/it/`, `/ar-MA/`, and the
  rest of the catalog — finite localized entry documents
- `GET /en/` — English alias of the apex document

The control-plane document also includes the library catalog, storage,
commands, current publication mode, default dry-run behavior, and hosted
Passkey publication status.

`console.kotoba.cloud` currently presents the same boundary and links to the
CLI workflow; it does not claim deployment management that does not exist.

## Development

```bash
npm install
npm test
npm run render
npm run build
npm run dry-run
```

Deploy only after those checks pass:

```bash
npm run deploy
```

Locale smoke after render + Worker:

- `GET /id/` is `200` with `lang=id`; `/jv/`, `/su/`, `/he/`, `/it/`,
  `/ar-MA/` are the same shape (no 404)
- `GET /` with `Accept-Language: id` is `302` `/id/`
- `GET /` with `CF-IPCountry: ID` and no language header is `302` `/id/`
  (never `/jv/` or `/su/`)
- `GET /` with `Accept-Language: en` and `CF-IPCountry: ID` stays English
- `GET /su/` with `kb_locale=he` stays Sundanese (path wins) and refreshes
  the cookie
- `GET /health`, `/v1/session`, and `/api/funnel` are not locale-redirected

## Nearest-repository boundary

`kotoba-lang/kotoba-lang` owns language semantics and the public CLI contract.
`kotoba-lang/kotoba` owns the CLI host adapter. This repository owns only the
network-facing `kotoba.cloud` control/discovery surface; it does not implement
the compiler, store artifacts, or execute workloads.

## White-hat research launch

The public entry now introduces verified security research. Researcher onboarding
and a text-only workspace share the existing page and authenticated Principal.
The proposed free tier is 50 requests/day and at most 2,048 output tokens/request;
there is no paid fallback. This launch is **pending providers**, not live inference.

The Worker implements `GET /v1/models`, `GET /v1/research/status`,
`POST /v1/research/applications`, and `POST /v1/chat/completions`. The latter uses
the Chat Completions envelope plus required `task` and `scopeId`; it is a scoped
browser-session API, not a drop-in public OpenAI API-key service. It accepts no
system messages, arbitrary models, tools, streaming, or user-supplied identity.

`RESEARCH_AUTHORITY` is deliberately absent from production bindings. Until a
qualified service is connected, authenticated research requests return 503,
anonymous requests return 401, and no application or prompt reaches a provider.
The identity-library/native-provider stubs do not count as eKYC approval.

The private service contract is in `docs/research-authority-contract.md`. Its
implementation, provider contracts, actual screening, durable audit, atomic
quotas, model qualification and independent end-to-end acceptance are launch
requirements. No configuration flag alone constitutes launch approval.

### Selected Murakumo model and Self integration

The selected model is `qwen3.8-flash-next-cybersecurity-nvfp4` at
`https://api.murakumo.cloud/v1/chat/completions`. On 2026-09-12 a direct defensive
request returned the exact model in 251.94 seconds; the compiled private transport
then returned the same model in 2.52 seconds. These are upstream transport checks,
not an end-to-end verified-researcher qualification.

`shadow-cljs release research-providers` builds the private Self/Murakumo
transports; `npm run test:providers` checks signature, environment, challenge,
screening predicates, and model identity using fixtures. The public Worker does
not expose these functions. Self account/live-flow provisioning, canonical
Kotobase review/quota state, human-review operation and durable asynchronous
inference jobs remain required before public intake can open. See
`docs/research-authority-contract.md` for the exact activation boundary.
