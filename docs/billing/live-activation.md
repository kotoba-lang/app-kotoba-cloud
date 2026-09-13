# Live billing activation status (2026-09-14)

Live prices and a live webhook were provisioned for Kotoba Labs, Inc. The signing secret is stored as STRIPE_LIVE_WEBHOOK_SECRET in kotoba-cloud-control-plane. Test credentials and balances are preserved. The live catalog is recorded in stripe-live-catalog.json. No customer was charged.

Stripe onboarding reports incomplete representative/owner details and disables final submission. The account owner must complete the missing information and submit the terms acceptance. The live restricted API key and live portal configuration are still required.

Production paid execution is not ready. The public models endpoint currently advertises the Murakumo backend and free-only eligibility; main research_gateway sends billing=free-only, research_providers omits provider token usage, and billing_usage has no producer callers. The first-party database gateway release was previously blocked (PR59); its tenant operations and authoritative storage samples have not been verified here. Do not set BILLING_ENABLED or BILLING_METERING_READY merely because live Stripe objects exist.

Required integration proof: authenticated and authorized inference/DB action reserves a server-calculated upper bound, executes once, persists actual provider token or retained-byte/time usage, and settles the same reservation atomically and idempotently. Unknown outcomes retain the hold for reconciliation. Test streaming disconnects, concurrent calls, receipt retries, insufficient balances, storage overage, cancellation, refunds and disputes before opening purchase access. Never bill browser-supplied usage or derive token counts from response text. Confirm the real Modal and identity-authority implementation/deployment ownership before changing those routes.

Current rates remain the existing proposal: input $0.60/M, cached input $0.15/M, output $2.40/M, storage $0.20/GiB-month, egress $0.09/GiB and queries $0.06/vCPU-hour. They are not yet charged against real provider/storage receipts.
