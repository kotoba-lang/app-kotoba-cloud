# Billing connection checklist

Stripe context verified: Kotoba Labs, Inc. / acct_1U7sRyITDawH5x8a. The three bundled recurring Products/Prices and two existing scoped top-ups in stripe-test-catalog.json exist in test mode only. The six superseded separate-service products are historical test artifacts, excluded from the v2 mapping and UI. Do not reuse those price IDs in live mode or change an existing production product.

Required Worker secrets (values via targeted kagi read and Wrangler stdin, never commits/chat):
- STRIPE_RESTRICTED_KEY: environment-specific restricted key. Checkout Sessions, Customers, Customer Portal, invoice/subscription reads only; no transfers/payouts. Test the SDK operations with the restricted permissions.
- STRIPE_WEBHOOK_SECRET: endpoint signing secret for https://api.kotoba.cloud/v1/billing/webhook .
- METRONOME_API_KEY: owner-specified organization and environment.

Non-secret configuration:
- STRIPE_PRICE_IDS: JSON object mapping SKU to price ID, selected from the matching mode catalog.
- STRIPE_PORTAL_CONFIGURATION_ID: cancellation/payment-method only until scheduled plan changes and grant proration are qualified.
- METRONOME_RATE_CARD_ID: verified rate card with no flat fees and correctly scoped usage products.
- METRONOME_CREDIT_PRODUCTS: JSON object mapping ai/storage to commit product UUIDs.
- METRONOME_CREDIT_TYPE_ID: verified USD credit type; amounts are denominated in cents (100 units = one credit).
- BILLING_MODE: test or live; webhook mode must match.
- BILLING_ENABLED=false and BILLING_METERING_READY=false remain until the design.md launch requirements are completed. A successful compilation does not justify enabling either flag.

Required Metronome product tags: ai for token usage; storage for DB usage, and storage.capacity additionally for retained capacity. Per-contract usage filters use the scope event property. Configure actual metering/rates in the specified organization, inspect their IDs and units, and verify one invoice example before setting the rate-card binding. The adapter does not silently invent a provider contract or enable arbitrary postpaid usage.

Previous v1 local validation: 86 tests / 3112 assertions, zero failures; compiled Worker smoke exercises checkout adapter, invoice replay, customer mismatch, stable usage IDs, conflicting receipts, webhook signature/timestamp/mode; Wrangler 4.131.1 dry-run passes. Provider calls in the Worker smoke are fixtures. No real payment, Metronome grant, runtime secret change, or production deployment has occurred.

V2 validation: 87 tests / 3123 assertions pass; compiled Worker tests verify one recurring line grants both the AI and storage capacity balances, with distinct replay IDs and unchanged paid periods. Browser preview shows the three bundled plans. Build and Wrangler dry-run pass. Verification uses the explicit JVM compatibility build, not native qualification. Provider lifecycle calls are fixtures; the three bundled Stripe Products/Prices were created in the real test-mode account. No production billing was enabled.

## Connection findings (2026-09-14)

Owner clarified Metronome is not configured; an existing Stripe account did not imply a Metronome organization or API token. No Metronome connection or live end-to-end payment qualification is claimed.

Read-only Stripe live checks for acct_1U7sRyITDawH5x8a: tax.settings status pending; head_office absent; missing_fields contains head_office. tax.registrations returned an empty list with has_more=false. No settings or registrations were changed. automatic_tax remains disabled. An empty Stripe list does not establish the company's legal registration obligations or registrations outside Stripe.

The local admission mirror now reserves scoped micro-USD amounts under the per-account Durable Object serialization boundary and settles against a terminal receipt ID. Grants are mirrored only after Metronome accepts them; retries can restore a missing mirror. Included funds are used before top-ups. Missing receipts retain holds, over-budget receipts freeze admission, and expired grants cannot fund new reservations. Provider and database producers still need to call this interface before execution, and reconciliation with the remote ledger is still required. Do not enable billing flags based on these unit/fixture checks.
