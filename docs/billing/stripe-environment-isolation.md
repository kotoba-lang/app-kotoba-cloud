# Stripe environment isolation

Set BILLING_ENVIRONMENT_ID to a stable identifier for the Stripe account and sandbox. The Durable Object name includes mode, environment, and principal. Use the same identifier when rotating credentials within an environment; use a different identifier when switching Stripe accounts or sandboxes. Never change a funded environment identifier without a reviewed migration.

The initial test-only, unscoped ledger contained a customer from another Stripe environment. Its records are retained; the configured Kotoba Labs test environment now starts in a separate namespace. No live ledger was funded or migrated. Prices, portal configuration, API key, and webhook signing secret must belong to the same environment.

The release also restores billing bindings and configuration lost in PR64 while retaining its admin host, and fixes an unmatched delimiter and translation arity in its browser module found by compilation. Live paid execution remains disabled.
