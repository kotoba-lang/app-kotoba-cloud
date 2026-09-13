# Billing connection checklist

Stripe context verified: Kotoba Labs, Inc. / acct_1U7sRyITDawH5x8a. The eight Products and default Prices in stripe-test-catalog.json exist in test mode only. Do not reuse those price IDs in live mode or change an existing production product.

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

Observed local validation: 86 tests / 3112 assertions, zero failures; compiled Worker smoke exercises checkout adapter, invoice replay, customer mismatch, stable usage IDs, conflicting receipts, webhook signature/timestamp/mode; Wrangler 4.131.1 dry-run passes. Provider calls in the Worker smoke are fixtures. No real payment, Metronome grant, runtime secret change, or production deployment has occurred.
