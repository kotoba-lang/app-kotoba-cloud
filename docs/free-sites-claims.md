# Free-site ownership protocol v1

Status: implemented and tested as a compatibility library; not connected to a
public route, not a live registrar, and not a qualified Q9 component.
Authority: root ADR `2609112200-free-sites-namespace`.

The pilot reserves `{name}.sites.itonami.app` for a verified Stable Principal.
Its initial capacity is 100 reservations, one per Principal. A controller change
does not change ownership. Names are lowercase ASCII DNS labels of 3–63 bytes;
reserved control labels and `xn--` labels are refused. Input is not silently
normalized. The command body contains only `name`; an owner field is rejected.

`free-sites/plan-claim` produces a proposed document, never a completed receipt.
`free-sites-claim/claim!` coordinates authoritative reads and conditional commits.
The full bounded registry is one document, so name uniqueness and owner quota
share one commit boundary. There is no separately updated owner index. Suspended
records retain their name and quota. Delete, transfer, reassign, publish, and DNS
mutation are outside this version's API. `owner-record` is an ownership lookup,
not publication authority; existing signed publication requirements still apply.

## Persistence contract

The coordinator requires three explicit trusted capabilities:

- `load!`: an authoritative `{basis registry}` snapshot. Missing, unreadable or
  corrupt state fails closed. `empty-registry` is for explicit provisioning only.
- `commit!`: atomically compare `expected-basis` AND `expected-revision`, then
  commit the whole proposed registry. It returns either `{:status :conflict}` or
  `{:status :committed :snapshot {:basis ... :registry ...}}`. A committed result
  must attest durable storage, not merely echo the request. Its basis must change
  and its registry must exactly match the proposal. A conflict never commits.
- `now!`: a trusted server timestamp for a new reservation.

Only explicit conflicts retry, at most three attempts, rereading and replanning
each time. An ambiguous timeout fails the request. Repeating the same claim can
recover an already committed reservation without writing again. Response fields
include `publicationReady: false`; reserving a name does not publish a site.

Kotobase must own the durable registry. Its adapter must use the existing
authorized datom transaction path and fresh route-scoped CACAO with a conditional
head. A DO may serialize work but cannot be the only authoritative store. No
direct R2, KV, or memory fallback is permitted. The current memory provider exists
only in tests and does not demonstrate live atomicity or persistence.

The existing gateway's `datomic.transact`/`expected_parent` path is a candidate,
not a qualified adapter. Before integration, verify its exact snapshot/read
contract, conditional conflict response, registry-specific authority, and
durable commit receipt. Do not grant callers a generic write capability for the
shared registry or assume a session cookie grants such a capability.

## Public route gate

No Worker route, DNS record, storage binding, or production feature flag is added
by this change. Before exposing the coordinator:

1. Provision the canonical registry with narrowly scoped service authority.
2. Qualify the Kotobase adapter using independent concurrent clients, readback,
   restart/recovery, lost responses and authentication failures.
3. Fetch the viewer from `auth.kotoba.cloud`; never trust a body-supplied viewer.
   Require the exact control origin, enforce method/content type and a streamed
   request-body limit before parsing, and return private/no-store responses.
4. Gate registration to invited Principals, then verify the 100-reservation cap.
5. Complete TLS and browser isolation for `*.sites.itonami.app` before serving
   user-controlled HTML. Publishing remains separately gated by its signed record,
   storage receipt, quota and versioned DNS projection requirements.

## Verification

The pure tests cover validation, ownership, quota, idempotency, suspension,
corrupt snapshots and capacity. The CLJS tests exercise concurrent same-name and
same-owner requests, independent claims without lost updates, a lost commit
response, rejected spoofed ownership, malformed receipts and bounded retries.

`shadow-cljs.edn` declares the `free-sites-test` Node target and `deps.edn` makes
test sources visible to the CLJS build. The pure suite is also registered in the
existing test runner. The repository's `.cljk` toolchain must be used to resolve
these sources. Current stock nbb/shadow require an external compatibility source
mirror with `.cljc` for `free_sites_test` and `.cljs` for the other three new files;
copy the bytes unchanged and do not commit that mirror. A standalone shadow
config needs `:source-paths` pointing to that mirror, `:target :node-test`,
`:ns-regexp "app-kotoba-cloud.free-sites.*-test$"`, and `:autorun true`.

Local compatibility compilation and execution are evidence for the claim
protocol only, not for the native/Q9 toolchain or the production adapter.
