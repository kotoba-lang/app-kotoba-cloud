# ADR: vuln-eval live-face probe correction and upstream staleness report (2026-09-16)

Date: 2026-09-16
Status: accepted (documentation only — no runtime change)

## Context

Daily vulnerability-assessment run (kotoba-vuln-eval). Evidence script measured the
five watched surfaces plus the live endpoints. Two signals looked like findings:

1. `https://api.kotoba.cloud/v1/health` → `final_status=404` in the evidence probe.
2. Upstream repos drifting: ayatori behind=120, amu behind=14,
   app-kotoba-cloud behind=19, kotoba behind=0.

## Findings (measured 2026-09-16)

### Live face — `/v1/health` 404 is a probe-target mismatch, not a defect

- Direct readback (curl, no redirect chain): `api.kotoba.cloud/v1/health` returns
  plain `HTTP/2 404` with `permissions-policy` present — there is no such route on
  the api host, and no repo file (README, worker source, docs) advertises
  `api.kotoba.cloud/v1/health`.
- The documented health endpoint is `GET /health` on `kotoba.cloud`
  (README.md:144; `src/app_kotoba_cloud/worker.cljk` routes `path "/health"`;
  worker-smoke asserts `https://kotoba.cloud/health` → 200 and that
  `admin.kotoba.cloud/health` → 200).
- Live readback this run: `https://kotoba.cloud/health` → **200**.
- Conclusion: the evidence probe URL was wrong, not the API. Future evidence
  scripts should probe `https://kotoba.cloud/health` (worker) rather than
  `api.kotoba.cloud/v1/health`, or drop the probe.

### Locale routing / CSP — healthy

- `kotoba.cloud/` → 200 (1 redirect, CSP present, Cloudflare).
- `kotoba.cloud/ja/` → 200 (2 redirects = root → locale; normal).
- `api.kotoba.cloud/v1/security/compliance-fit?framework=nist-csf-20` → 200 with CSP.
- README.md:232 documents `/health`, `/v1/session`, `/api/funnel` as not
  locale-redirected — consistent with observed behavior.

### Upstream staleness (pins)

| repo | behind main | :git/sha pins | note |
|---|---|---|---|
| ayatori | 120 | 8 | highest drift; bump iteration is top follow-up |
| amu | 14 | 29 | pin count high; drift moderate |
| app-kotoba-cloud | 19 | 6 | this worktree re-synced to 32a6736c this run |
| kotoba | 0 | 27 | fresh |

### Regression found on main (32a6736c): `/vc/` variant-root drift

Fresh sync of this worktree to main, then `node scripts/sync-shadow-src.mjs &&
npx shadow-cljs compile app && npm run render && npm run test:worker` fails:

```
AssertionError: /vc/ is emitted under /ja/ but the Worker did not serve the
variant (locale/variant-roots)
actual:   'https://kotoba.cloud/vc/'
expected: 'https://kotoba.cloud/ja/vc/'
  at test/worker-smoke.mjs:593
```

PR #222 (vc-fund-catalog) emits `/vc/` under locale directories, but
`variant-roots` in `src/app_kotoba_cloud/locale.cljk:179-182` does not list
`"vc"`, so locale negotiation does not fork the page. Suggested one-line fix:
add `"vc"` to `variant-roots`. Deferred: routing-code change is outside this
run's documentation-only scope.

## Decision

- Record the corrected health-probe target so future runs don't re-flag it.
- Documentation-only change; no worker/route/feature code is modified.
- Follow-ups for later runs (not this one): re-sync ayatori (120 behind) and amu,
  then re-check their deps.edn pins against newest resolved shas.
