# app-kotoba-cloud

`app-kotoba-cloud` is the public control and discovery plane for
[`kotoba.cloud`](https://kotoba.cloud). It gives the Kotoba CLI one stable
origin from which to discover identity, storage, compute, and agent-work
services without making those services one trust domain.

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
codebase. `kotoba library publish` is dry-run by default; explicit apply
reuses the existing locally signed namespace-head and IPNS path. The profile
names `kotoba-lang.org/libraries/` as the public catalog and `kotobase.net` as
block/receipt storage. `hostedPasskeyPublish: false` remains explicit until a
Passkey-authorized publication API, namespace governance, abuse controls, and
catalog ingestion are implemented and qualified.

After a successful Passkey ceremony, the apex reads its same-product
`Domain=kotoba.cloud` HttpOnly session only through `GET /v1/session`. The
Worker forwards that one cookie to the exact `auth.kotoba.cloud` viewer and
returns only a generated username, Stable Principal, account DID and active
controller. The browser never receives the session token. The navbar, primary
action and Identity panel then switch from anonymous to signed-in state.

The public webpage is generated from pure CLJC using the workspace DADS
(`jp-go-digital-design-system`) base. It visualizes Kotoba Cloud as the single
control/identity entrance feeding three separately governed planes rather than
presenting the four domains as interchangeable products. `public/` is a build
artifact: `npm run render` produces Japanese `/`, English `/en/`, and
localized finite 404 documents, then Wrangler ships them as Static Assets
beside the discovery Worker. Locale catalogs share one key contract and the
page publishes canonical and `hreflang` links, so another locale is an
explicit catalog-and-route addition rather than a second handwritten page.

Public copy follows the language authority's current thesis:
**“AI writes freely. Kotoba draws the boundary.”** The Cloud surface carries
that admitted-computation boundary into operation; it does not replace the
compiler, verifier, host enforcement, or service-specific authority.

## Public routes

- `GET https://kotoba.cloud/.well-known/kotoba-cloud.json`
- `GET https://api.kotoba.cloud/v1/control-plane`
- `GET /health`
- `GET /v1/session` — credential-free projection of the current Passkey session
- `GET /` — Japanese public architecture and CLI entrance
- `GET /en/` — English public architecture and CLI entrance

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

## Nearest-repository boundary

`kotoba-lang/kotoba-lang` owns language semantics and the public CLI contract.
`kotoba-lang/kotoba` owns the CLI host adapter. This repository owns only the
network-facing `kotoba.cloud` control/discovery surface; it does not implement
the compiler, store artifacts, or execute workloads.
