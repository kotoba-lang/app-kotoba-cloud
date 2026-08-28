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

## Public routes

- `GET https://kotoba.cloud/.well-known/kotoba-cloud.json`
- `GET https://api.kotoba.cloud/v1/control-plane`
- `GET /health`

`console.kotoba.cloud` currently presents the same boundary and links to the
CLI workflow; it does not claim deployment management that does not exist.

## Development

```bash
npm install
npm test
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
