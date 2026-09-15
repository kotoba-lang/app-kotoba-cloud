# ADR-2609151900 (app-kotoba-cloud half) — Google/GitHub as linked identities; organization SSO for Team/Enterprise as provisioning + a gate

- Status: accepted
- Date: 2026-09-15
- The identity-plane half and the full reasoning live in
  `net-kotobase/control-plane/docs/adr/2609151900-google-github-linked-identities-and-org-sso.md`;
  the workspace ADR is `90-docs/adr/2609151900-google-github-linked-identities-and-org-sso.kotoba`.
  ADR-2609070400 (Web3-first, OAuth/OIDC/SSO never a session authority) is unchanged.

## What kotoba.cloud does

- **Continue with Google / GitHub** — `/sign-in/{google|github}` and
  `/account/link/{google|github}` hand the browser to
  `auth.kotoba.cloud/v1/link/<provider>/start`. The provider names the
  account; the passkey or wallet proves it. The account page lists linked
  identities (`/v1/account/identities`, proxied with the caller's cookie) and
  unlinks (`/v1/account/identities/revoke`).
- **Organization SSO (OIDC), Team / Enterprise** — `org_sso_gateway.cljk`:
  - `/v1/org/sso/status?org=` — the caller's role, the org's plan, whether
    they may configure, and auth.kotoba.cloud's standing (`gate`).
  - `/v1/org/sso/configure` / `remove` — owner/admin only; the plan must be
    `team` or `enterprise`; the apex mints `x-kotoba-org-entitlement`
    (HMAC-SHA256, `ORG_SSO_ENTITLEMENT_SECRET`, ≤5 min) and forwards the
    connection to `auth.kotoba.cloud/v1/org-sso/connections/<handle>`; the
    org authority records `ssoPolicy` (`/sso-policy`).
  - `/v1/org/sso/start?org=` — a redirect to the identity plane's start,
    which requires the member's passkey/wallet session first.
  - `/v1/org/sso/sync` — back from the IdP (`/account/?sso=<handle>`): reads
    the fresh assertion and provisions the membership VC with the mapped
    role (`/sso-provision`; `admin`/`member`/`billing`, never `owner`; a
    hand-delegated member keeps the hand-given role).
  - the gate: org-scoped database sessions (`database_session.cljk`) refuse
    with `sso-assertion-required` / `sso-assertion-expired` and the start
    URL when the org enforces assertions and the member's is not fresh.
- **Plan** — `ORG_PLAN_OVERRIDES` (operator, for Enterprise) else the org
  owner's active platform plan from the billing ledger (`billing/active-plan`;
  grants now record their `sku`, older grants count as no plan). Until org
  billing (ADR-2609141633 §5) lands, the founding owner's subscription is the
  org's plan.

## Verification (2026-09-15)

- `kbb -M:test`: 116 tests / 3499 assertions; the same 265 pre-existing site
  failures as `main` (theme/topbar merge), +22 assertions green in
  `org-sso-gateway-test` (plan derivation with the boundary both ways,
  handle grammar, entitlement round-trip verified with WebCrypto).
- `npm run build` (render + amu compile + shadow): completed; `npm run
  test:worker`: passed; `npm run audit:uiux`: 99.6 (floor 80).
- SAML: not supported (recorded gap). Live IdP round trips are not claimed
  here; the identity plane's smokes prove the contract against a stubbed IdP.
