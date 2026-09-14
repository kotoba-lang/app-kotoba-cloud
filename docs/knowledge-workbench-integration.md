# First-party database workbench

The shared graph, ontology inspector, datoms, query, pins and audit components
are pinned to cloud-kotoba-dds 502053418e9df99f167d3da8a5953edb1a73fc7e.
They remain mounted in the root document at #knowledge/overview and sibling tabs.
Every CID link is supplied by the host adapter.

## Public contract

The host uses https://api.kotoba.cloud/v1/database as the API base. Suffixes
include /xrpc/ai.gftd.apps.kotobase.datomic.q, /api/q, /api/transact, /pins,
/v1/audit and /ipld/{cid}. Compatibility NSID names and existing tenant IDs
remain stable; they are not network destinations.

The browser signs in at auth.kotoba.cloud and uses its HttpOnly session cookie.
It does not request a Kotobase token. API callers may supply their existing
verified database Bearer/Biscuit/CACAO credential; inference keys do not grant
database rights. Writes remain subject to database capabilities and authority.

Only named Kotoba Cloud origins receive credentialed CORS. Cookie-authenticated
mutations require an allowed Origin. The gateway strips caller identity and
internal-trust headers, bounds JSON bodies to 1 MiB, refuses redirects, and
forwards only the session cookie and database authentication/selector headers.

## Private transport

DATABASE_SERVICE targets the separate kotoba-cloud-database Worker. It has no
public route or cron and uses internal identity and graph-engine bindings.
The shared engine and tenant store preserve existing data; net-kotobase's
public Worker, DNS and TLS are not used as transport dependencies.

Its deployment config lives in net-kotobase/control-plane at
kotobase-api-gateway/wrangler.kotoba-cloud.jsonc. Its wrapper refuses requests
until AUTHN_SERVICE, KOTOBASE_GRAPH_DATABASE_SERVICE and KOTOBA_INTERNAL_SECRET
are present. The last must match the existing graph backend's trust credential.
Missing credentials are not replaced with unsigned identities or an HTTP fallback.

## Release qualification

Worker tests cover credential/tenant-header isolation, CORS, CSRF, size bounds,
unknown operation rejection and redirect refusal. The browser fixture test
covers session-based connection, graph/ontology/query state and expired-session
clearing. Live tenant read/write qualification is required after provisioning
the dedicated Worker's trust credential; do not equate mock tests with this.
