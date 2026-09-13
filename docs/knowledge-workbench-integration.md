# Shared knowledge workbench integration (development)

Kotoba Cloud mounts `cloud-kotoba-dds.graph-workbench` inside its existing
root document at `#knowledge/overview`, `#knowledge/graph`,
`#knowledge/ontology`, `#knowledge/datoms`, `#knowledge/query`, etc.
The chat sidebar exposes the route. Chat and query drafts remain in memory
while switching views. No iframe or second admin document is introduced.

Kotobase owns the databases and authorizes every existing API operation.
This host accepts an explicit Kotobase Bearer/Biscuit/CACAO token, held only
in a connection closure. It does not persist tokens, include cookies, follow
redirects, or forward a Kotoba Cloud inference key automatically. A fixed
origin and route allowlist constrain requests. Disconnect aborts outstanding
requests, disposes routing listeners and removes rendered tenant data.
Write controls still require the existing explicit scoped capability.

This is local development integration, not common SSO, a completed ontology
editor, a new API origin or a production deployment. The ontology panel
inspects observed attributes/types in a bounded snapshot. Billing remains
with the existing Kotobase contract.

## Build and release

Both consumers pin the shared library's merged main commit
`80d8e7c0ab6c0762298c37e40db451181d7964ed` (cloud-kotoba-dds PR #2).
The development-only override is no longer required. The Cloud integration is
rebased by applying the scoped feature onto latest main; earlier unpublished
inference/authority drafts remain outside this release.

## Verification on 2026-09-13

- Kotobase existing page suite: 82 tests, 1621 assertions passed after extraction.
- App pages and shared offline fixture rendered via explicit JVM compatibility
  path using the declared DADS pin. Not native/Q9 qualification.
- Fixture browser: same-document navigation, shared graph/schema snapshot,
  query state retention, bearer transport, preserved Biscuit prefix, 401
  handling, disconnect clearing and 320/390/768/1440px overflow checks passed.
- CORS OPTIONS on Kotobase accepted authorization/content-type for POST from
  kotoba.cloud. No real credential or tenant read/write was tested.

Run the committed browser test against a local render server:
`kbb --backend sci test/graph-workbench-browser.cljk`.
It uses installed Chrome and Playwright (`PLAYWRIGHT_MODULE` if outside Node's
normal module search path). Set `GRAPH_PREVIEW_URL` to the served locale root;
the default is `http://127.0.0.1:8847/ja/`. External API replies are fixtures.

## Publication prerequisite repair

Root PR #3114 repairs manifest classification retention, targeted generation's
separator and the nested .cljk verifier. The canonical check and regression
fixtures passed; individual metadata entries were corrected through separate
GitHub API commits without advancing any pin.
