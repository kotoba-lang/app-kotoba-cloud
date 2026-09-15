// Live-invoice-shape grant e2e: drive the COMPILED BillingAccount DO with
// BILLING_MODE=live and Stripe fetch calls mocked to return the REAL live
// invoice (in_1UFnjUIzvFrqWhXKa6wBf6vU) re-shaped as subscription_create with
// the live team price. Asserts the exact allowance math: $150 → $60 AI +
// 50 GiB capacity, with replay-safety.
import { readFileSync } from 'node:fs';
import { BillingAccount } from '../build/worker.js';

const cfg = JSON.parse(readFileSync('/tmp/live_e2e_config.json', 'utf8'));
const base = JSON.parse(cfg.invoicePayload).data.object;
// Reshape to the subscription_cycle grant path (live checkout produces this):
const invoice = {
  ...base,
  billing_reason: 'subscription_create',
  lines: {
    has_more: false,
    data: [{
      id: 'il_live_e2e_team',
      quantity: 1,
      period: { start: 1000, end: 2000 },
      pricing: { price_details: { price: cfg.livePriceIds.team } },
    }],
  },
};

const memory = new Map();
const state = {
  storage: {
    get: async (k) => memory.get(k),
    put: async (k, v) => { memory.set(k, v); },
    list: async () => new Map(),
    setAlarm: async () => {},
  },
  blockConcurrencyWhile: (f) => f(),
};
const env = {
  BILLING_MODE: 'live',
  BILLING_SANDBOX_ENABLED: 'false',
  BILLING_ENABLED: 'true',
  BILLING_METERING_READY: 'true',
  BILLING_ENVIRONMENT_ID: 'acct_1TuxvPIzvFrqWhXK-live',
  STRIPE_AWAI_LIVE_KEY: cfg.liveKey,
  STRIPE_PRICE_IDS: JSON.stringify(cfg.livePriceIds),
  STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_live_fixture',
};
const fetchCalls = [];
globalThis.fetch = async (url, init) => {
  const u = String(url);
  fetchCalls.push(u);
  if (u.startsWith('https://api.stripe.com/v1/subscriptions?')) return Response.json({ data: [], has_more: false });
  if (u === 'https://api.stripe.com/v1/customers') return Response.json({ id: base.customer });
  if (u === `https://api.stripe.com/v1/invoices/${base.id}`) { console.log("MOCK returns invoice status=", invoice.status, "reason=", invoice.billing_reason, "line price=", invoice.lines?.data?.[0]?.pricing?.price_details?.price); return Response.json(invoice); }
  throw new Error('unexpected fetch ' + u);
};
const do_ = BillingAccount(state, env);
const post = async (path, body) => {
  const res = await do_.fetch(new Request('https://billing.internal' + path, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ principal: 'e2e-live-billing-principal', ...body }),
  }));
  return { status: res.status, body: await res.json() };
};

// seed the customer record (as ensure-customer would) then deliver invoice.paid
await state.storage.put('customer', '{:stripe "' + base.customer + '"}');
let r = await post('/event', { event: { type: 'invoice.paid', data: { object: { id: base.id, customer: base.customer } } } });
console.log("fetchCalls:", fetchCalls); console.log("invoice.paid:", r.status, JSON.stringify(r.body).slice(0, 120));
const rawLedger = memory.get('limits');
// storage mock stores pr-str EDN; parse the two grant amounts out of it
const ledgerStr = typeof rawLedger === 'string' ? rawLedger : String(rawLedger);
console.log('ledger (edn):', ledgerStr.slice(0, 400));
const grants = [...ledgerStr.matchAll(/:scope "?([a-z.]+)"?, :amount (\d+)/g)]
  .map((m) => ({ scope: m[1], amount: Number(m[2]) }));
console.log('grants:', grants);
const ai = grants.find((g) => g.scope === 'ai');
const cap = grants.find((g) => g.scope === 'storage.capacity');
console.log('ai grant: amount', ai?.amount, '(expect 60000000 = $60)');
console.log('capacity grant: amount', cap?.amount, '(expect 10000000 = 50 GiB at $0.20/GiB)');
if (ai?.amount !== 60000000) throw new Error('AI allowance mismatch');
if (cap?.amount !== 10000000) throw new Error('capacity allowance mismatch');
// replay
const before = memory.get('limits');
r = await post('/event', { event: { type: 'invoice.paid', data: { object: { id: base.id, customer: base.customer } } } });
if (memory.get('limits') !== before) throw new Error('replay changed the ledger');
console.log('replay: ledger unchanged OK');
console.log('E2E OK: live team invoice -> $60 AI + 50 GiB capacity in one durable write, replay-safe');
