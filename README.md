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
artifact: `npm run render` produces the English root and one emit directory
per catalog locale (`public/ja/…`, `public/id/…`) — **emit directories, not
public URLs**. Every document has ONE locale-free URL (shinkansen.locale;
owner direction 2026-09-15: the `/ja`, `/en` paths are no longer needed):
the Worker negotiates the variant before the Static Assets HIT and serves
it in place. The language switch is `?lang=<locale>` on the same route,
served directly (200) with the choice persisted as `kb_locale` — no
redirect hop, no client script needed. A non-English variant is
self-canonical at `<route>?lang=<locale>`; `hreflang` alternates and
`og:url` use the same form, `x-default` is the locale-free route. An
explicit prefix (`/ja/billing/`) is compatibility only: 301 to the
locale-free route with the cookie set.

`path (301 compat) > ?lang= > kb_locale cookie > Accept-Language > request.cf.country > en`

`locale/variant-roots` names the content roots that have per-locale emits;
`test/worker-smoke.mjs` derives the list from `public/ja/` and fails when a
root is emitted but not served (measured live 2026-09-15: `/blog/` and
`/apps/` were emitted under `/ja/` and served in English).

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
- `GET /` — the public architecture and CLI entrance; the variant is
  negotiated (`?lang=`, cookie, `Accept-Language`, `request.cf.country`)
  and served in place, never redirected
- `GET /?lang=ja` (any catalog locale) — that variant, choice persisted
- `GET /ja/`, `/id/`, …, `/en/` — compatibility: 301 to `/` with the cookie

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

### Console IA

The sidebar, the top bar's section label and the setup steps all derive from
ONE table, `app-kotoba-cloud.console/groups` (views are data; the nav is
generated — a destination added there cannot be forgotten in the nav, and a
destination that does not resolve fails the build). Console documents:
`/account`, `/billing/`, `/secure/` (guardrails / firewall / compliance,
rendered from the policy the authority enforces), `/models/`, `/apps/`,
`/docs/`. Every chip in the chrome (credit, setup progress, account) is
hidden until its fact is known. Coverage against the reference console is
recorded in `docs/uiux-coscientist/console-coverage.edn`.

### UI/UX document contract (shinkansen.audit) — the kaizen loop

Every emitted document is scored by `shinkansen.audit` (13 deterministic
axes, each seeded from a failure measured on the live `/account` page on
2026-09-15 — `/js/session.js` 404 in production, duplicate ids, twelve
"loading…" cells, three nav entries for one page, 1,100px of nav before the
content on a phone, a fixed sidebar with no inline anchor). Findings are
named with WHY; unmeasurable axes are refused, never passed.

```bash
npm run audit:uiux                       # after npm run build: floor 80, exit 1 below, exit 2 refused
kbb --backend sci scripts/uiux-audit.cljk --only /account/          # one document, all findings
kbb --backend sci scripts/uiux-audit.cljk --iteration 3             # append docs/uiux-coscientist/iteration-03.{edn,md}
npm run test:account-browser             # real browser: signed-out / signed-in / 390-768-1440 (after build)
```

`npm run deploy` runs the audit between the build and `wrangler deploy` —
`:assets-resolve` is the only place a deploy from a tree that lacks the
browser bundle is caught. Four axes are **hard** (fail regardless of the
floor, because they are breakage rather than degradation): `assets-resolve`,
`links-resolve` (every same-origin `<a href>` must be an emitted document or
a Worker route — `/docs/` was linked from 75 documents and never emitted),
`unique-ids`, `csp-allows-assets` (the policy in `app-kotoba-cloud.csp` is
what the Worker serves and what the audit reads). `docs/uiux-coscientist/` is the append-only
measurement record (Generate → Reflect → Rank → Evolve → Meta per
iteration, plus the per-axis delta from the previous one — the roadmap is
a prediction, the delta is the proof). `uiux_audit_test.cljk` pins the
`/account` contract at 100 and proves the gate falls on a broken document.

Locale smoke after render + Worker:

- `GET /` with `Accept-Language: id` is `200` serving the `id` emit in
  place (no `Location`)
- `GET /` with `CF-IPCountry: ID` and no language header serves `id`
  (never `jv` or `su`)
- `GET /` with `Accept-Language: en` and `CF-IPCountry: ID` stays English
- `GET /docs/?lang=ja` with `kb_locale=he` is `200` serving `/ja/docs/`,
  `Set-Cookie: kb_locale=ja`; `?lang=klingon` is ignored and persists nothing
- `GET /su/` with `kb_locale=he` is `301` `/` with `Set-Cookie: kb_locale=su`
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

The public model is `qwen3.8-flash-next-whitehacker`, mapped exclusively to
`qwen3.8-flash-next-cybersecurity-nvfp4` at
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

### Two model teams (2026-09-15)

`/v1/models` and `/models/` split the catalog into two teams
(`app-kotoba-cloud.research/teams`, one table; the page, the edge and the
authority all read it):

| team | models | route | admitted on |
|---|---|---|---|
| red | `qwen3.8-flash-next-whitehacker`, `glm5.3-flash` | Modal (`MODAL_INFERENCE_URL`) | sign-in, card-based identity verification (`/v1/research/ekyc/start`, credit/debit funding only), consent to the Acceptable Use Policy (`/security/aup/`, `policyVersion`), screening, trust route, approved scope, free quota, guardrails |
| blue | `qwen/qwen3.8-flash`, `z-ai/glm-5.3-flash` (the OpenRouter ids, unchanged) | OpenRouter (`OPENROUTER_API_KEY`, a secret on the research authority Worker) | sign-in, free quota, guardrails; the three standard tasks only |

The edge makes no `/status` hop for a blue model and the authority skips the
identity ladder for it; the offensive band (`payload-crafting`, `c2-tooling`)
stays closed to blue by the request shape. Without the key the blue route
refuses by name (`openrouter-not-configured`, 503) — a blue job never falls
back to Modal. `OPENROUTER_CONFIGURED` in `wrangler.jsonc` is what `/v1/models`
reports as the blue rows' availability (`openrouter-configured` /
`openrouter-key-not-configured`); flip it to `"true"` after
`wrangler secret put OPENROUTER_API_KEY --config wrangler.research.jsonc`.
Measured: `test/worker-smoke.mjs` (catalog split; blue 200 / red 403 on the
same suspended record), `test/research-authority-local.mjs` block 11 (blue
admitted with no record, refuses by name without the key, OpenRouter URL +
bearer + model id with it), `test/account-browser.cljk` block models.

### Shared conversation UI

The homepage uses pinned `cloud-kotoba-dds` conversation components, with new
chat, page-lifetime history, a bottom composer and a mobile history drawer.
Research scope and task settings are per conversation. Details and applications
remain at `/about/` and `/ja/about/`. No conversation content is persisted to disk.
The public `/v1/models` and completion responses use `qwen3.8-flash-next-whitehacker`; only the
server provider sends the upstream Qwen ID to Murakumo, and rejects other models.

The existing private `RESEARCH_AUTHORITY` binding, current identity evidence,
approved scope and atomic free-quota receipt remain prerequisites. This change
does not configure an authority or make unverified inference available. Responses
currently arrive as complete JSON; the UI shows a waiting state, not simulated
streaming or invented progress.

`kotoba/norbert` is reserved for a later release and is not a currently accepted model ID.

### Public security knowledge

The chat `#security` view and `/ja/security/` expose source-backed public research
data. `/security-data/index.json` is the discoverable IPLD snapshot; JSON-LD,
ontology and Hyakka-shaped datoms are projections of the same records. See
[architecture and scope](docs/security-knowledge-architecture.md). Rebuild with
`npm run build:security-data`; verify with `npm run test:security-data`.
