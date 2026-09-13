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
