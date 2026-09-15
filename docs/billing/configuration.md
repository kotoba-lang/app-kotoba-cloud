# Stripe-only billing configuration

Owner selected Stripe without Metronome. No Metronome account, token, rate card, contract, credit product or connection is required. No external usage-billing provider is contacted. The Kotoba BillingAccount Durable Object stores the authoritative prepaid ledger and numeric usage receipts.

## Provider configuration

Stripe account: Kotoba Labs, Inc. / acct_1U7sRyITDawH5x8a. The three bundled recurring Products/Prices and two scoped top-ups in stripe-test-catalog.json exist in test mode only. Superseded products are historical artifacts, excluded from the current SKU mapping. Never reuse test IDs in live mode.

Worker secrets (never put values in chat, source, or logs):
- STRIPE_RESTRICTED_KEY: mode-specific restricted Stripe key with the permissions required by Checkout, Customers, invoice reads and Customer Portal.
- STRIPE_WEBHOOK_SECRET: signing secret for https://api.kotoba.cloud/v1/billing/webhook.

Non-secret configuration:
- STRIPE_PRICE_IDS: approved SKU to mode-specific Price ID mapping.
- STRIPE_PORTAL_CONFIGURATION_ID: cancellation/payment-method only until plan changes are qualified.
- BILLING_MODE: test or live.
- BILLING_ENABLED=false and BILLING_METERING_READY=false until all launch requirements in design.md pass.

## Tax status

Live read: tax.settings was pending with head_office missing; tax.registrations returned no records and has_more=false. A subsequent authorized change set default tax_behavior=exclusive. Head office and registrations remain unresolved. The owner specified United States, but no full operational address or registered states were provided. automatic_tax is not enabled. These observations do not establish obligations or registrations outside Stripe.

## Local ledger

One paid subscription invoice line produces two scoped grants in one durable write. Grant IDs are retained in the ledger for replay detection. Local integer micro-USD balances expire at the paid period boundary. Reservations run under per-account Durable Object serialization; they hold maximum cost before work and settle against a terminal receipt. Included funds precede purchased credits. Capacity-only grants cannot fund query/egress usage. Expired funds cannot fund new requests; missing receipts retain holds; underestimated receipts freeze admission.

Usage receipts are durably recorded locally with stable IDs and conflicting replays rejected. Recording a receipt alone does not debit funds: the trusted producer must reserve and settle before/after execution. Producer integration, pricing qualification, storage time normalization, refunds/disputes, duplicate checkout prevention, reconciliation and real sandbox payment verification remain launch gates. No live billing is enabled.

## Latest connection check

Cloudflare control-plane Settings shows no Stripe billing key; STRIPE_RESTRICTED_KEY Secret entry is prepared for the owner to enter a test restricted key. Stripe test Customer Portal configurations list is empty. API tool discovery did not expose its creation operation, so provisioning must use the SDK after credentials or Dashboard. No webhook or live checkout is configured by this check.

The recurring Checkout path now checks Stripe subscription state and persists a pending checkout window before calling Stripe. Existing nonterminal subscriptions and a second pending request are rejected. Same-request retries reuse the original expiry and idempotency key; completed/expired flows still require recovery qualification. Focused compiled Worker tests pass, including blocking a second pending checkout. Build passes with zero compiler warnings.

The current research gateway sends free-only execution requests; the database ingress delegates authorization and execution without billing receipts. The paid producer integration is not complete, so both billing enable flags remain false.

## Saved settings (2026-09-14 follow-up)

Owner entered STRIPE_RESTRICTED_KEY in the Cloudflare control-plane Worker; Settings shows Secret / Value encrypted. Its contents, mode, permissions and authenticated Stripe API connectivity have not yet been verified.

Created and read back Stripe test portal bpc_1UFI88ITDawH5x8adO7LxkD1. Payment-method updates, customer information and invoice history are enabled. Cancellation is at period end with no proration; subscription changes/quantity edits and pauses are disabled. The test portal ID and five test Price mappings are now in wrangler.jsonc; billing flags remain false. These configuration changes are not yet deployed.

Latest live GET /v1/billing/catalog returned 404, so the billing endpoint is not deployed. Webhook setup and a real test payment remain incomplete. Tax follow-up: supplied head office was saved and tax.settings became active; default tax behavior is exclusive. Owner stated tax registration is absent. Do not add a registration or enable collection automatically.

## Live environment wiring (2026-09-15)

Owner direction: move billing to the production path. The Worker now runs
`BILLING_MODE=live` against the AWAI account (`BILLING_ENVIRONMENT_ID=acct_1TuxvPIzvFrqWhXK-live`,
`BILLING_SANDBOX_ENABLED=false`) with the live price map from
`stripe-live-catalog.json` (pro / team / max / ultra / ai-credits-25 /
storage-credits-25). The Worker secrets `STRIPE_AWAI_LIVE_KEY` and
`STRIPE_AWAI_LIVE_WEBHOOK_SECRET` are set (names read from `wrangler secret
list`; values never read). The Customer Portal configuration is resolved at
runtime by the billing account against the live account (stored default,
else created with the qualified test features) — the test id never reaches
the live account. `/v1/billing/catalog` names the SKUs a live price exists
for (`purchasable`); the page sells only those and marks the credits-*
monthly tiers as not yet purchasable until live prices exist for them.

**The launch flags stay `BILLING_ENABLED=false` / `BILLING_METERING_READY=false`.**
Until both are `"true"`, `configured?` is false, the catalog answers
`checkoutEnabled:false` and no Checkout session can be created. Flipping
them is the owner's decision because the paid producer integration is still
absent: the research gateway sends `free-only` requests and nothing calls
`billing-usage/reserve!` / `settle!`, so a purchased balance would be a
ledger entry that no request consumes. The gate is proven in
`test/worker-smoke.mjs` (either flag off → closed; both on with the live
account → open; another account id → never open).
