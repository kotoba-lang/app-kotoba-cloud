# Kotoba Cloud billing v1 — sandbox proposal

Status: implementation and sandbox catalog; not production billing. Stacked on the first-party database integration PR. Metronome organization/environment and targeted API credential are awaiting owner input. Usage producers, admission reservations, refund reconciliation and end-to-end payment qualification must be completed before BILLING_METERING_READY is set. No existing research entitlement is removed or widened by payment.

## Independent subscriptions (USD, exclusive of tax)

| Service | Builder | Team | Scale |
|---|---:|---:|---:|
| Inference / month | $29, 24 AI credits | $99, 96 AI credits | $279, 288 AI credits |
| Graph + ontology DB / month | $19, 20 GiB | $79, 200 GiB | $249, 1,000 GiB |

Graph and ontology share the retained-byte pool. Viewer and query UI are included. Distinct Stripe Products represent every plan. Customers can independently select one active subscription per service; do not sell multiple same-service subscriptions. Portal v1 must allow cancellation/payment updates only; schedule plan changes at renewal until proration and grant adjustments are qualified.

One credit represents $1 of usage. AI credits and DB credits are separate balances, not money, transferable value, or a withdrawal facility. $25 scoped top-ups have no discount and last 12 months. Monthly included credits expire at the actual paid invoice line period end, without rollover. AI included credits are flexible between token types, not an unqualified number of tokens. At the proposed rate, 24 credits covers 20 million uncached input plus 5 million output tokens, or an equivalent mix.

Proposed rate card (version 2026-09-14-v1): uncached input $0.60/million; cached input $0.15/million; output $2.40/million. Storage overage $0.20/GiB-month; customer egress $0.09/GiB; measured query compute $0.06/vCPU-hour. These are launch proposals, not measured margins or provider prices. Qualify Modal GPU cost, utilization, cache accounting, actual query CPU and storage costs before offering them live. Never estimate billable CPU from wall time.

Storage is time-integrated customer-retained bytes, including customer-selected history and indexes; internal replication and deduplication are not separate customer charges. Use GiB = 2^30 bytes. Monthly included capacity is integrated over that customer's actual billing period (not a fixed 30 days). Hourly or shorter signed server snapshots become retained-byte × elapsed-second measures. Subtract the integrated included allowance once, before rating overage. Do not sum snapshots as cumulative byte counts. Missing snapshots mean reconciliation is required, not zero usage. DB included credits apply only to storage.capacity, not egress/query compute.

Verified Free research continues under the existing identity/scope/quota policy. Proposed DB Free is 1 GiB, subject to actual DB quota enforcement before launch. Payment does not bypass eKYC, AML/CTF, current session, research approval or tenant/capability checks.

## Collection and rating

Stripe Checkout and Customer Portal collect/manage recurring fees and prepaid top-ups. Metronome owns contracts, rating and scoped prepaid balances. All Metronome usage contracts must be prepaid-only with no extra flat fee: Stripe has already collected the subscription. Externally paid commits have no invoice schedule, preventing a second invoice. Use contract IDs and applicable product tags on grants. Monthly storage capacity grants must use the same time normalization as the retained-byte meter. Enterprise postpaid requires an explicit approved contract.

The same server-authenticated principal maps to a Stripe Customer and a Metronome Customer. Organization billing requires an authoritative organization-owner role mapping before it is enabled; a client-supplied tenant/customer ID is never sufficient. Current UI operates on the signed-in principal only.

Checkout success URLs do not grant funds. Verify raw-body webhook signature, timestamp tolerance, mode and stored customer. Full paid subscription-cycle invoice lines grant one bounded allowance per invoice/line; partial/proration invoices cannot refill the wallet. One-time top-ups require a saved checkout mapping and confirmed paid status. Metronome uniqueness keys prevent duplicate remote grants across crashes. A 409 after uncertain completion remains pending until the existing remote grant is reconciled; do not blindly acknowledge it or generate a new key.

The internal usage interface persists server receipts before acknowledgement. An alarm retries Metronome ingestion with stable transaction IDs. Retain receipt hashes/IDs beyond the provider's deduplication window; never resubmit unresolved events older than 33 days without reconciliation. No prompts, outputs, documents or raw graph contents are sent to Stripe/Metronome. Persist invoice/receipt identifiers and numeric measurements only.

## Enforcement and failure behavior

Before paid execution, atomically reserve the maximum possible cost against the customer's scoped spend ceiling. Settle with provider-reported uncached input/cache/output counts; release unused reservation only after terminal evidence. Streaming disconnects do not imply zero usage. Missing final receipts require reconciliation. A balance read alone is insufficient because concurrent requests and ingestion lag can overspend. This admission path is a release prerequisite, not established by the ingest adapter.

Default: prepaid only, no auto-recharge, no negative-credit execution. Notify at 50/80/100%; a customer-set hard monthly spend limit applies to both reservations and settled spend. Exceeding DB capacity freezes new growth/expensive work, with read/export retained and no automatic deletion. Define the funded grace/read allowance before launch; do not imply unlimited free retention.

Refunds, disputes and cancellations must reconcile the remote allowance and outstanding reservations. Freeze new paid work during uncertain refund/dispute resolution, retaining reads/export; never erase financial history. No production checkout until these paths and duplicate-checkout prevention are qualified.

## Enterprise

Quote-based, starting proposal $1,000/month, usually an annual minimum commitment with monthly/quarterly drawdown. Model usage, capacity, support and reserved resources separately in the order form. Negotiate volume tiers after margin review; unused commitments expire only as stated in the contract. Net-30 invoicing/postpaid is individually approved, with a credit ceiling and suspension terms. No self-service Enterprise checkout or automatic negotiated discount.

Specify organization owner/billing admin/project roles, per-project budgets, audit export, retention/deletion, DPA/subprocessors, deployment regions, dedicated Modal capacity, encryption/key ownership, recovery objectives, support hours/escalation and an agreed SLA with service credits. These are contract options, not claims that dedicated capacity or a certified SLA already exists. Do not add weaker login methods to deliver enterprise identity management.

## Launch requirements

- Metronome account/environment verified; rate card/products/tags/credit units checked in sandbox; Stripe and Metronome customer mapping tested.
- Stripe restricted API key and webhook signing secret in Worker secrets, targeted kagi custody; separate mode-specific price mapping. Cancellation-only Portal configuration.
- Authoritative usage producers, concurrent reservation/settlement and included-capacity enforcement qualified; recover outbox/remote commit uncertainty, refund/dispute and duplicate checkout scenarios.
- Full test-mode payment → webhook → allowance → authenticated inference/DB usage → credit drawdown → exhausted balance denial → refund/cancel reconciliation.
- Stripe Tax registration status reviewed. Do not enable automatic_tax without active registrations; merely enabling the flag does not establish collection.
- All live routes/source are reconciled with main and the pending DB deployment before publishing.

References: https://docs.stripe.com/billing/how-metronome-works-with-stripe ; https://docs.metronome.com/api-reference/usage/ingest-events ; https://docs.metronome.com/api-reference/credits-and-commits/create-a-commit .
