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

**Launch flags (2026-09-15 evening, owner direction "決済ができるようにして"):
`BILLING_ENABLED=true` / `BILLING_METERING_READY=true`.** `configured?` is
true, the catalog answers `checkoutEnabled:true` for the SKUs with a live
price, and Checkout sessions are created. The gate itself is unchanged and
still proven in `test/worker-smoke.mjs` (either flag off → closed; both on
with the live account → open; another account id → never open).

## Paid inference (2026-09-15)

The producer integration that the flags were waiting for is in
`research_gateway.cljk` (`paid-admission`, `settle-paid!`, `release-paid!`)
and `research_authority.cljk` (`handle-jobs-create`, `job-response`); both
gateways derive the ledger's Durable Object name through
`billing_binding.cljk`, so the ledger a purchase funds is the ledger a
completion debits.

- Before the authority admits a completion, the edge POSTs `/reserve` on the
  principal's BillingAccount with the job id as the reservation id, scope
  `ai`, and an UPPER BOUND of the job's cost at `billing/rates`: input tokens
  ≤ UTF-8 bytes of the messages + 512 + 64 per message (byte-level BPE never
  yields more tokens than bytes; the origin's own template is the fixed
  part), output ≤ `max_tokens` (the origin's hard cap, reasoning included),
  both rated uncached, +25 %. The bound is deliberately generous: an
  under-reserved settlement freezes the ledger (`billing-limits/settle`)
  instead of charging the excess.
- `held` → the job is created with `billing: "paid"`: the authority does not
  count it against the free daily quota and does not refuse it on that quota;
  guardrails, firewall and the identity ladder are the same bar. 402
  `usage-limit-exceeded` (no balance — every account until it buys), 503
  (frozen / unavailable) or metering off → `billing: "free-only"`, the free
  quota exactly as before. Payment never removes an entitlement.
- The authority stores the provider's measured usage on the job
  (`usageReceipt`: token counts, model, timestamp — never the prompt) and
  returns it on `/jobs/status`. The edge settles with `/settle-usage`
  (`kind: inference`, that receipt); the ledger rates it and debits in the
  same durable write. The answer carries `billing: "paid"`, OpenAI-shaped
  `usage`, and `chargedMicroUSD` — the ledger's number, never an estimate.
- A paid job that ends `failed`/`cancelled` releases its hold (`/settle`,
  actual 0). A job the edge stops waiting for keeps its hold: the client's
  retry re-attaches to the same job id and reservation and settles then. A
  settlement the ledger refuses is served with `settlement: "pending"` and
  logged (`paid-settlement-failed`); the hold stays for reconciliation.
- The deterministic job id is the reservation id, so a retried completion is
  never charged twice (`billing-limits/reserve` and `settle` are idempotent
  on equal input).
- `GET /v1/billing/status` accepts the research PAT bearer as well as the
  browser session, so an agent can read the balance its own completions
  debit. Checkout and portal stay cookie + origin.
- Checkout sessions allow promotion codes and collect a payment method only
  when the first invoice charges (`payment_method_collection: if_required`);
  the allowance still comes only from the paid invoice the webhook retrieves.

Measured in `test/worker-smoke.mjs` ("paid inference: …"): held → paid job
+ settle from the receipt (no prompt text in the ledger call, streamed shape
carries the same accounting); 402 → free-only with no settle; metering off →
no ledger hop; failed → release at zero; refused settlement → answer served
with `settlement: pending`; PAT reads its own balance, cannot start a
checkout.
