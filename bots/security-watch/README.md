# Kotoba Security Watch

Registered 2026-09-13 as Codex heartbeat `kotoba-security-watch`, every six hours. The desktop host must be available for execution. The runner reads this profile and performs bounded updates in the existing task. Registration is not proof of a completed scheduled publication.

The first source audit successfully parsed MITRE Enterprise ATT&CK (176 non-revoked/non-deprecated actor clusters), CISA KEV (1,709 records), Ransomwatch's historical group registry (216 entries) and historical posts (16,072 entries). These are source counts, not new published corpus counts. See `initial-source-audit.json`. Ransomware.live v2/groups produced no response within a 20-second probe; current access and reuse terms are still pending. Do not use archived Ransomwatch as a live replacement.

Run `node scripts/security-watch.mjs` from the repository root. It checks bounded allowlisted sources, validates their broad structure, and retains hashes/ETags in ignored `.state/security-watch`. Raw response bodies are removed after auditing. A 304 is unchanged; failed sources retain the last good state. Historical sources are checked at most weekly. This command audits sources, it does not itself publish records. The heartbeat executes the normalization, testing and publication steps in SOUL.md.

Next ingestion work: expand the existing three-group ATT&CK sample to all source-covered groups and activity relationships, then normalize historical Ransomwatch allegations with stable IDs and separate evidence layers. Keep search index sizes and Worker asset limits bounded; shard indexes/blocks if the full graph exceeds existing limits. Do not silently truncate the global inventory to fit a single response.

Itonami Bot registration completed through the authenticated UI on 2026-09-13. “Kotoba Security Watch” is visible in My Bots. Its workspace reports synced. Writes, autonomous approval, isolated browser and peer notes are disabled; Goal auto-start is disabled. The routines panel confirms no registered jobs. Computer Use remains unavailable at host level. The existing Codex heartbeat remains the sole six-hour publisher. `itonami-create.json` is the original inert import template, not a claim that it was the UI creation payload. Do not create a duplicate profile or restart sign-in onboarding.

Public profile assets are copied by the site renderer. No credentials, private workspace paths or raw breach data are included in public assets.
