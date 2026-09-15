// Live-mode billing webhook e2e against the COMPILED worker (build/worker.js).
// Signs a real live invoice.paid event with the rotated live whsec, drives the
// billing gateway route with BILLING_MODE=live + the live price map, and asserts
// the DO receives /event (principal metadata path) — the exact grant flow Stripe
// will hit in production.
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { route } from '../build/worker.js';

const cfg = JSON.parse(readFileSync('/tmp/live_e2e_config.json', 'utf8'));
const { whsec, livePriceIds, invoicePayload, eventId } = cfg;

const calls = [];
const webhookEnv = {
  BILLING_MODE: 'live',
  BILLING_SANDBOX_ENABLED: 'false',
  BILLING_ENABLED: 'true',
  BILLING_METERING_READY: 'true',
  BILLING_ENVIRONMENT_ID: 'acct_1TuxvPIzvFrqWhXK-live',
  STRIPE_AWAI_LIVE_KEY: cfg.liveKey,
  STRIPE_AWAI_LIVE_WEBHOOK_SECRET: whsec,
  STRIPE_PRICE_IDS: JSON.stringify(livePriceIds),
  STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_live_fixture',
  BILLING_ACCOUNTS: {
    idFromName: (x) => x,
    get: (id) => ({
      fetch: async (url, init) => {
        calls.push({ id, url: String(url), body: JSON.parse(init.body) });
        return Response.json({ received: true });
      },
    }),
  },
};

const t = Math.floor(Date.now() / 1000);
const sig = 't=' + t + ',v1=' + createHmac('sha256', whsec).update(t + '.' + invoicePayload).digest('hex');
const request = new Request('https://api.kotoba.cloud/v1/billing/webhook', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'stripe-signature': sig },
  body: invoicePayload,
});
const respond = (body, status) => new Response(JSON.stringify(body), { status });
const res = await route(request, webhookEnv, () => {}, respond);
const body = await res.json();
console.log('status:', res.status, 'body:', JSON.stringify(body));
console.log('DO /event calls:', calls.length, JSON.stringify(calls.map((c) => ({ url: c.url, type: c.body?.event?.type, principal: c.body?.event?.data?.object?.parent?.subscription_details?.metadata?.principal || c.body?.event?.data?.object?.metadata?.principal }))));
if (res.status !== 200) throw new Error('webhook rejected: ' + res.status);
const expected = eventId;
if (calls.length !== 1) throw new Error('expected exactly one /event delivery, got ' + calls.length);
console.log('E2E OK: signed live invoice.paid accepted and routed to BillingAccount DO /event');
