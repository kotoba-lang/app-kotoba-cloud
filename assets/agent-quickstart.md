# Kotoba Cloud: agent quickstart

> Identity, signed package publication and deploy-control discovery for the Kotoba stack.

## 1. Inspect live capabilities (no credentials required)

```sh
curl -fsS https://kotoba.cloud/health
curl -fsS https://kotoba.cloud/.well-known/kotoba-cloud.json
```

Expect HTTP 200 and inspect the profile's deploy capabilities. Discovery and the
Passkey RP are live; hosted apply is not offered. Do not treat a plan, profile or
health response as a deployment receipt. The profile is the current authority
for supported operations and related service origins.

## 2. Install Kotoba and execute your first program

Follow https://kotoba-lang.org/agent-quickstart.md. It includes installation,
compiler self-check, WebAssembly compilation and an execution check expecting 42.
This uses the Kotoba CLI; there is no separate `kotoba-cloud` installer to guess.

## 3. Reference package qualification (current CLI gap)

Validation on 8 September 2026: the installed native CLI returned
`runtime/internal-error` / `java.lang.IllegalArgumentException` for both the
named-package and profile install command below. Package installation and
execution were NOT verified in this run. Use step 2 for the verified first
execution path; do not report this package installed unless your CLI succeeds.

The exact catalog CID and install command are published in the live profile:
https://kotoba.cloud/.well-known/kotoba-cloud.json

The human-readable command and publication workflow are at:
https://kotoba.cloud/#libraries

Copy the profile's install command with its exact catalog CID, then run:

```sh
kotoba package add kotoba-lang/reference-math@0.1.0 --catalog-cid bafkreidcy5stqvnyfpmud6ozz5qz3supd3r3uzk7glmntuv36ezliaxstm
kotoba package run kotoba-lang/reference-math
```

Expected result: 42. Package admission verifies Ed25519 and ML-DSA-65 signatures;
execution is local after installation. A catalog fetch alone is not verification
or execution evidence. Keep the release/CID and command output with your result.

## 4. Verified research access (Stripe Identity — live)

Sign in, then follow https://kotoba.cloud/ekyc.md. The account holder completes one
Stripe Identity check at https://verify.stripe.com (agents never do this themselves);
approval is then automatic — ekyc, screening, trust and scope in one webhook, no manual
review. When GET https://api.kotoba.cloud/v1/research/status returns "eligible", the
scoped security-research model runs via POST /v1/research/jobs (free daily allowance).
For a local IDE/CLI agent, issue a personal token once at https://kotoba.cloud/account
(CLI / IDE section, 1 click) and call the same endpoints with
`Authorization: Bearer kc_pat_...` — OpenAI-compatible base `https://api.kotoba.cloud`.

## 5. Connect services or publish a library

- Graph state, CLI and MCP: https://kotobase.net/agent-quickstart.md
- Language and CLI reference: https://kotoba-lang.org/llms.txt
- Publication and key rotation: https://kotoba.cloud/#libraries
- Full discovery profile: https://kotoba.cloud/.well-known/kotoba-cloud.json

Library publication defaults to dry-run. Actual publication needs the approved
principal, provider credentials and mandatory post-quantum signing key. A login
is not blanket deployment authority. Keep secrets in the client's secret store;
never place them in an LLM prompt or public receipt.

Public operator: Kotoba Labs Inc. Contact: support@kotoba.cloud.
