# Kotoba Cloud billing v2 — sandbox proposal

Status: Stripe-only implementation and sandbox catalog, not production billing. The owner explicitly chose not to use Metronome. Kotoba owns the prepaid ledger and usage admission. No existing research entitlement is removed or widened by payment. Usage producers, refund reconciliation, duplicate subscriptions and end-to-end payment qualification remain prerequisites.

## One platform subscription (USD, exclusive of tax)

| Plan | Monthly fee | Included token budget | Included graph + ontology storage |
|---|---:|---:|---:|
| Verified Free | $0 | Existing verified research quota | 1 GiB |
| Pro | $20 | 12 AI credits | 20 GiB |
| Max | $100 | 60 AI credits (5x Pro) | 100 GiB |
| Ultra | $200 | 120 AI credits (10x Pro) | 250 GiB |
| Enterprise | From $1,000, quote | Contracted organization pool | Contracted organization capacity |

Each paid tier is one Stripe Product, one recurring Price, one subscription item and one renewal date. Both allowances are included in that single payment. Graph and ontology share retained capacity, with the viewer included. Web and API use the same AI allowance. Token consumption cannot consume the storage allowance and storage cannot consume the AI allowance. Query compute and egress are separately metered DB usage, not included capacity.

One credit represents $1 of usage. AI credits and DB credits are separate balances, not money, transferable value, or a withdrawal facility. Optional $25 scoped top-ups last 12 months. Monthly allowances expire at the paid period end with no rollover. Consume included allowance before purchased credits. There is no automatic top-up or default postpaid bill. The Pro allowance covers, for example, 10 million uncached input plus 2.5 million output tokens; this is a mixed-use example, not two independent token quotas. Max and Ultra scale this token budget 5x and 10x, respectively.

Use one active platform subscription per billing owner. Portal v2 must allow cancellation/payment updates only; schedule plan changes at renewal until proration and grant adjustments are qualified. Upgrades do not instantly refill either allowance. Duplicate active subscription and pending checkout prevention remains a production release gate, as in v1.

A paid recurring invoice line fans out into two grants with distinct stable IDs (invoice:line:ai and invoice:line:storage), identical paid periods and independent replay records. If one grant fails, retry only the unfinished grant. Do not treat the bundle's storage as an alternative to its AI grant.

The structure follows Claude and Codex's included-plan-usage plus optional paid-credits approach, not their proprietary token limits, models or exact rates. Kotoba prices and margins are proposals requiring cost qualification. Five-hour/weekly throttles may protect shared capacity separately; they must not silently reset or charge the monthly budget. We do not advertise unlimited usage or an unimplemented rolling window.

References checked 2026-09-14:
- https://claude.com/pricing
- https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans
- https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-freego-pluspro-sora

Proposed rate card (version 2026-09-14-v2): uncached input $0.60/million; cached input $0.15/million; output $2.40/million. Storage overage $0.20/GiB-month; customer egress $0.09/GiB; measured query compute $0.06/vCPU-hour. These are launch proposals, not measured margins or provider prices. Qualify the dedicated deployment's GPU cost, utilization, cache accounting, actual query CPU and storage costs before offering them live. Never estimate billable CPU from wall time.

Storage is time-integrated customer-retained bytes, including customer-selected history and indexes; internal replication and deduplication are not separate customer charges. Use GiB = 2^30 bytes. Monthly included capacity is integrated over that customer's actual billing period (not a fixed 30 days). Hourly or shorter signed server snapshots become retained-byte × elapsed-second measures. Subtract the integrated included allowance once, before rating overage. Do not sum snapshots as cumulative byte counts. Missing snapshots mean reconciliation is required, not zero usage. DB included credits apply only to storage.capacity, not egress/query compute.

Verified Free research continues under the existing identity/scope/quota policy. Proposed DB Free is 1 GiB, subject to actual DB quota enforcement before launch. Payment does not bypass eKYC, AML/CTF, current session, research approval or tenant/capability checks.

## Collection and rating

Stripe Checkout and Customer Portal collect/manage recurring fees and prepaid top-ups. Kotoba's per-account Durable Object is the authoritative local prepaid ledger; Stripe remains authoritative for payments and subscription state. No Metronome API or credentials are required. Prepaid usage does not generate a second invoice or Stripe metered charge. Enterprise postpaid is disabled until separately implemented and contracted.

An authenticated principal maps to one Stripe Customer. Organization billing requires an authoritative owner-role mapping; browser-supplied tenant/customer IDs cannot select the billing account.

Checkout return URLs do not grant funds. Verify the raw webhook signature, mode, customer and paid invoice. Full recurring invoice lines grant both bounded allowances in one durable ledger write. Stable invoice/line/scope IDs reject duplicate or conflicting grants. Partial/proration invoices cannot refill the wallet. Top-ups require a saved checkout mapping and confirmed paid status.

The internal usage interface persists numeric server receipts with stable IDs and rejects conflicting replays. This is an audit record, not an automatic charge. The producer must reserve maximum cost, then settle from an authoritative terminal receipt. No prompts, outputs, documents or raw graph contents are sent to Stripe or another metering provider.

## Enforcement and failure behavior

Before paid execution, atomically reserve the maximum possible cost against the customer's scoped spend ceiling. Settle with provider-reported uncached input/cache/output counts; release unused reservation only after terminal evidence. Streaming disconnects do not imply zero usage. Missing final receipts require reconciliation. A balance read alone is insufficient because concurrent requests and ingestion lag can overspend. This admission path is a release prerequisite, not established by the ingest adapter.

Default: prepaid only, no auto-recharge, no negative-credit execution. Notify at 50/80/100%; a customer-set hard monthly spend limit applies to both reservations and settled spend. Exceeding DB capacity freezes new growth/expensive work, with read/export retained and no automatic deletion. Define the funded grace/read allowance before launch; do not imply unlimited free retention.

Refunds, disputes and cancellations must reconcile the local allowance and outstanding reservations. Freeze new paid work during uncertain refund/dispute resolution, retaining reads/export; never erase financial history. No production checkout until these paths and duplicate-checkout prevention are qualified.

## Enterprise

Quote-based, starting proposal $1,000/month, usually an annual minimum commitment with monthly/quarterly drawdown. Model usage, capacity, support and reserved resources separately in the order form. Negotiate volume tiers after margin review; unused commitments expire only as stated in the contract. Net-30 invoicing/postpaid is individually approved, with a credit ceiling and suspension terms. No self-service Enterprise checkout or automatic negotiated discount.

Specify organization owner/billing admin/project roles, per-project budgets, audit export, retention/deletion, DPA/subprocessors, deployment regions, dedicated inference capacity, encryption/key ownership, recovery objectives, support hours/escalation and an agreed SLA with service credits. These are contract options, not claims that dedicated capacity or a certified SLA already exists. Do not add weaker login methods to deliver enterprise identity management.

## Launch requirements

- Stripe restricted key, webhook signing secret, correct mode-specific Prices and cancellation-only Portal configured.
- Integrate authoritative inference/storage producers with reservation/settlement. Qualify concurrent execution, receipt loss, capacity normalization, refunds/disputes, duplicate subscriptions and interrupted checkout recovery.
- Real sandbox payment → signed webhook → both allowances → authenticated inference/DB usage → debit → exhausted-balance denial → refund/cancel reconciliation.
- Verify Stripe Tax operational head-office address and actual registrations before enabling automatic_tax.
- Reconcile source/main and pending DB deployment before publishing. Compilation or fixture success is not a real payment or production release.

References: https://docs.stripe.com/billing/subscriptions/design-an-integration ; https://docs.stripe.com/payments/checkout ; https://docs.stripe.com/tax/settings-api .
