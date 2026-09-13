# AWAI production billing (2026-09-14)

Production merchant: AWAI Network, L.L.C., acct_1TuxvPIzvFrqWhXK, under the Kotoba Labs organization. Dashboard-created live products/prices and portal are recorded in stripe-live-catalog.json. Existing Kotobase products and Murakumo webhook are unchanged.

The Kotoba webhook is created but disabled pending recipient configuration. Its API version is 2026-08-26.dahlia. The portal permits invoice history, customer/payment-method updates and cancellation at period end; plan/quantity changes are disabled. No no-code portal link was activated. No payment has been executed in AWAI.

STRIPE_AWAI_LIVE_KEY and STRIPE_AWAI_LIVE_WEBHOOK_SECRET are the dedicated input bindings. The earlier STRIPE_LIVE_WEBHOOK_SECRET belongs to a different account and MUST NOT be used for AWAI. Test configuration remains unchanged. Do not enable billing flags before real metering verification. The org list says restricted, while account status shows no active tasks; charge capability remains unverified.

Production paid execution is not ready. The public models endpoint currently advertises the Murakumo backend and free-only eligibility; main research_gateway sends billing=free-only, research_providers omits provider token usage, and billing_usage has no producer callers. The first-party database gateway release was previously blocked (PR59); its tenant operations and authoritative storage samples have not been verified here. Do not set BILLING_ENABLED or BILLING_METERING_READY merely because live Stripe objects exist.

Required integration proof: authenticated and authorized inference/DB action reserves a server-calculated upper bound, executes once, persists actual provider token or retained-byte/time usage, and settles the same reservation atomically and idempotently. Unknown outcomes retain the hold for reconciliation. Test streaming disconnects, concurrent calls, receipt retries, insufficient balances, storage overage, cancellation, refunds and disputes before opening purchase access. Never bill browser-supplied usage or derive token counts from response text. Confirm the real Modal and identity-authority implementation/deployment ownership before changing those routes.

Current rates remain the existing proposal: input $0.60/M, cached input $0.15/M, output $2.40/M, storage $0.20/GiB-month, egress $0.09/GiB and queries $0.06/vCPU-hour. They are not yet charged against real provider/storage receipts.
