// Local semantic check for the research authority DO against a mock DurableObjectState.
import assert from "node:assert/strict";
let upstreamBody = null;
globalThis.fetch = async (url, init) => {
  assert.equal(url, "https://kotoba-labs--cybersecurity-inference.modal.run/v1/chat/completions");
  assert.equal(init.headers.authorization, "Bearer modal-test-token");
  const req = JSON.parse(String(init.body));
  return new Response(JSON.stringify({
    id: "chatcmpl-test", object: "chat.completion",
    model: "qwen3.8-flash-next-cybersecurity-nvfp4",
    choices: [{ index: 0, message: { role: "assistant", content: "Fix authorization." }, finish_reason: "stop" }],
    usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
  }), { status: 200, headers: { "content-type": "application/json" } });
};
import { ResearchAuthority } from "../build/research/worker.js";

class MockStorage {
  constructor() { this.map = new Map(); }
  async get(k) { return this.map.has(k) ? this.map.get(k) : null; }
  async put(k, v) { this.map.set(k, String(v)); }
  async delete(k) { this.map.delete(k); }
}
const state = {
  storage: new MockStorage(),
  waitUntil(p) { /* run detached synchronously-ish */ },
  blockConcurrencyWhile(fn) { return fn(); },
};
const env = {
  RESEARCH_OPERATOR_SECRET: "test-operator-secret-0123456789abcdef",
  MODAL_INFERENCE_URL: "https://kotoba-labs--cybersecurity-inference.modal.run/v1/chat/completions",
  MODAL_INFERENCE_TOKEN: "modal-test-token",
};
const auth = new ResearchAuthority(state, env);
const call = (path, body) => auth.fetch(new Request(`https://research.internal${path}`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
})).then(r => r.json().then(j => ({ status: r.status, json: j })));

const now = Date.now();
const principal = "urn:kotoba:principal:018f4d6c-29bf-7f80-9a21-111111111111";
const sessionRef = "sessionhash0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const jobId = "22222222-2222-4222-8222-222222222222";

// 1. unknown origin refused
const wrong = await auth.fetch(new Request("https://evil.internal/status", { method: "POST", body: "{}" }));
assert.equal(wrong.status, 403);

// 2. status on a fresh principal — pending
let r = await call("/status", { principalId: principal, sessionRef, action: "code-review" });
assert.equal(r.status, 200);
assert.equal(r.json.status, "none");

// 3. job create before admission -> 403 review-required
r = await call("/jobs/create", {
  principalId: principal, sessionRef, jobId, policyVersion: "whitehat-2026-09-12-v1",
  billing: "free-only", request: { model: "qwen3.8-flash-next-whitehacker", task: "code-review",
    scopeId: "owned", max_tokens: 96, messages: [{ role: "user", content: "Review owned code." }] },
});
assert.equal(r.status, 403);

// 4. operator ops require a valid signature
async function op(body) {
  const ts = Date.now();
  const msg = JSON.stringify([body.op, body.principalId, body.caseId ?? null, body.scopeId ?? null,
    body.tasks ?? null, body.expiresAt ?? null, body.status ?? null, ts, body.operatorActor ?? null]);
  const { createHmac } = await import("node:crypto");
  const sig = createHmac("sha256", env.RESEARCH_OPERATOR_SECRET).update(msg).digest("hex");
  return call("/review", { ...body, operatorTimestamp: ts, operatorSignature: sig });
}
for (const [b, want] of [
  [{ op: "verify-ekyc", principalId: principal, caseId: "private:ekyc-1", operatorActor: "owner" }, null],
  [{ op: "clear-screening", principalId: principal, caseId: "private:screen-1", operatorActor: "owner" }, null],
  [{ op: "grant-trust", principalId: principal, routes: ["web-reviewed"], operatorActor: "owner" }, null],
  [{ op: "approve-scope", principalId: principal, scopeId: "owned", tasks: ["code-review"], expiresAt: now + 86400000, operatorActor: "owner" }, null],
  [{ op: "activate", principalId: principal, operatorActor: "owner" }, "active"],
]) {
  r = await op(b);
  assert.equal(r.status, 200, JSON.stringify(r));
  if (want) assert.equal(r.json.status, want, JSON.stringify(r));
}
// wrong signature refused
r = await call("/review", { op: "activate", principalId: principal, operatorTimestamp: Date.now(), operatorSignature: "deadbeef" });
assert.equal(r.status, 403);

// 5. status now eligible
r = await call("/status", { principalId: principal, sessionRef, action: "code-review" });
assert.equal(r.json.status, "active", JSON.stringify(r.json));

// 6. job create queued + quota increments
r = await call("/jobs/create", {
  principalId: principal, sessionRef, jobId, policyVersion: "whitehat-2026-09-12-v1",
  billing: "free-only", request: { model: "qwen3.8-flash-next-whitehacker", task: "code-review",
    scopeId: "owned", max_tokens: 96, messages: [{ role: "user", content: "Review owned code." }] },
});
assert.equal(r.status, 200, JSON.stringify(r));
assert.equal(r.json.policyDecision, "allowed");
assert.equal(r.json.model, "qwen3.8-flash-next-whitehacker");

const storedJob = JSON.parse(await state.storage.get("job:" + jobId));
assert.equal(storedJob.status, "succeeded");
assert.deepEqual(storedJob.usageReceipt && {
  source: storedJob.usageReceipt.source,
  inputTokens: storedJob.usageReceipt.inputTokens,
  outputTokens: storedJob.usageReceipt.outputTokens,
  totalTokens: storedJob.usageReceipt.totalTokens,
}, { source: "modal-openai-compatible", inputTokens: 12, outputTokens: 3, totalTokens: 15 });

// 7. replay same input -> same receipt, not double-counted
r = await call("/jobs/create", {
  principalId: principal, sessionRef, jobId, policyVersion: "whitehat-2026-09-12-v1",
  billing: "free-only", request: { model: "qwen3.8-flash-next-whitehacker", task: "code-review",
    scopeId: "owned", max_tokens: 96, messages: [{ role: "user", content: "Review owned code." }] },
});
assert.equal(r.status, 200);
assert.equal(r.json.receiptId, "receipt-" + jobId);

// 8. conflicting reuse -> 409
r = await call("/jobs/create", {
  principalId: principal, sessionRef, jobId, policyVersion: "whitehat-2026-09-12-v1",
  billing: "free-only", request: { model: "qwen3.8-flash-next-whitehacker", task: "code-review",
    scopeId: "owned", max_tokens: 96, messages: [{ role: "user", content: "Different input." }] },
});
assert.equal(r.status, 409);

// 9. foreign principal cannot read the job
r = await call("/jobs/status", { principalId: "urn:kotoba:principal:someoneelse", sessionRef, jobId });
assert.equal(r.status, 403);

// 10. applications recorded
r = await call("/applications", {
  principalId: principal, sessionRef, requestId: "req-1",
  application: { verificationMode: "new", policyVersion: "whitehat-2026-09-12-v1",
    consent: true, authorizedResearch: true, purpose: "defensive review", scope: "owned" },
});
assert.equal(r.status, 200);
assert.ok(r.json.applicationId.startsWith("app-req-1"));

console.log("research authority local checks: all passed");

// --- Stripe Identity eKYC E2E (challenge -> signed webhook -> full approval) ---
import { createHmac } from "node:crypto";

const stripeEnv2 = {
  RESEARCH_OPERATOR_SECRET: "test-operator-secret-0123456789abcdef",
  STRIPE_IDENTITY_KEY: "rk_test_stripe-identity-key-0123456789abcdef",
  STRIPE_VERIFICATION_FLOW: "vf_flow_0123456789",
  STRIPE_IDENTITY_WEBHOOK_SECRET: "whsec_test_0123456789abcdef",
  MODAL_INFERENCE_URL: "https://kotoba-labs--cybersecurity-inference.modal.run/v1/chat/completions",
  MODAL_INFERENCE_TOKEN: "modal-test-token",
};

const realFetch = globalThis.fetch;
// Card-verification Stripe mock: customers, setup-mode checkout sessions and
// per-customer payment method listings. Cards map: customer -> funding kind.
const cardFunding = new Map();
const stripeRefusals = [];
const checkoutParams = [];
let refuseCheckout = false;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith("https://api.stripe.com/")) {
    const body = init && init.body ? String(init.body) : "";
    const params = new URLSearchParams(body);
    if (u === "https://api.stripe.com/v1/customers" && (init || {}).method === "POST") {
      const principal = params.get("metadata[principal]");
      if (!principal) throw new Error("stripe customer missing principal binding");
      return new Response(JSON.stringify({
        id: "cus_card_" + principal.replace(/[^a-z0-9]/gi, "").slice(-14),
        object: "customer", metadata: { principal },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (u === "https://api.stripe.com/v1/checkout/sessions" && (init || {}).method === "POST") {
      const customer = params.get("customer");
      const principal = params.get("metadata[principal]");
      if (!customer || !principal) throw new Error("stripe setup session missing bindings");
      // Hosted Checkout refuses a session without success_url — the exact
      // 400 the live AWAI account returned to this route on 2026-09-15
      // (parameter_missing). The mock must say no the way Stripe does, or a
      // green test proves nothing about the live call.
      if (!params.get("success_url") || refuseCheckout) {
        stripeRefusals.push({ path: "/v1/checkout/sessions", param: "success_url" });
        return new Response(JSON.stringify({ error: { type: "invalid_request_error",
          code: "parameter_missing", param: "success_url",
          message: "Missing required param: success_url." } }),
          { status: 400, headers: { "content-type": "application/json" } });
      }
      checkoutParams.push(Object.fromEntries(params.entries()));
      return new Response(JSON.stringify({
        id: "cs_setup_" + customer.slice(-10), object: "checkout.session",
        status: "open", mode: "setup", customer, metadata: { principal },
        url: "https://checkout.stripe.com/c/pay/" + customer.slice(-10),
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const pmList = u.match(/^https:\/\/api\.stripe\.com\/v1\/customers\/([^/]+)\/payment_methods$/);
    if (pmList) {
      const funding = cardFunding.get(decodeURIComponent(pmList[1]));
      const data = funding ? [{ id: "pm_card_test1234", object: "payment_method",
        card: { brand: "visa", last4: "4242", funding } }] : [];
      return new Response(JSON.stringify({ object: "list", data, has_more: false }),
        { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error("unexpected stripe call: " + u);
  }
  return realFetch(url, init);
};

const state2 = { storage: new MockStorage(), waitUntil() {}, blockConcurrencyWhile(fn) { return fn(); } };
const auth2 = new ResearchAuthority(state2, stripeEnv2);
const call2 = (path, body) => auth2.fetch(new Request(`https://research.internal${path}`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
})).then(r => r.json().then(j => ({ status: r.status, json: j })));

const p2 = "urn:kotoba:principal:018f4d6c-29bf-7f80-9a21-222222222222";
const ref2 = "sessionhash2222";

// S1. ekyc/start (card route) -> no card yet -> hosted setup session URL
r = await call2("/ekyc/start", { principalId: p2, sessionRef: ref2, scopeId: "owned", tasks: ["code-review"] });
assert.equal(r.status, 200, JSON.stringify(r));
const { sessionId, externalId, verificationUrl, expiresAt, requiresCard } = r.json;
assert.ok(sessionId && externalId.startsWith("opaque-") && verificationUrl && expiresAt > Date.now());
assert.equal(requiresCard, true);
assert.ok(verificationUrl.startsWith("https://checkout.stripe.com/"), "setup URL must be checkout.stripe.com");
// The setup session must carry the return legs Stripe requires, pointing the
// human back at the account console's identity panel (the client re-reads
// /ekyc/status there; approval arrives by webhook).
assert.deepEqual(stripeRefusals, [], "Stripe refused the setup session: " + JSON.stringify(stripeRefusals));
assert.equal(checkoutParams.length, 1);
assert.equal(checkoutParams[0].success_url, "https://kotoba.cloud/account?card=done#account-panel-identity");
assert.equal(checkoutParams[0].cancel_url, "https://kotoba.cloud/account?card=cancelled#account-panel-identity");
assert.equal(checkoutParams[0].mode, "setup");
assert.equal(checkoutParams[0]["metadata[principal]"], p2);

// S1b. Stripe refuses the setup session -> 503 stripe-unavailable, and the
// refusal itself (type/code/param) is on the operator log line instead of
// being dropped. The reason literal is pinned: a 503 for any other cause
// must not pass this block.
{
  const errLines = [];
  const realError = console.error;
  console.error = (...args) => { errLines.push(args.map(String).join(" ")); };
  refuseCheckout = true;
  const stRef = { storage: new MockStorage(), waitUntil() {}, blockConcurrencyWhile(fn) { return fn(); } };
  const authRef = new ResearchAuthority(stRef, stripeEnv2);
  const rRef = await authRef.fetch(new Request("https://research.internal/ekyc/start", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ principalId: "urn:kotoba:principal:018f4d6c-29bf-7f80-9a21-666666666666",
      sessionRef: ref2, scopeId: "owned", tasks: ["code-review"] }),
  })).then(x => x.json().then(j => ({ status: x.status, json: j })));
  refuseCheckout = false;
  console.error = realError;
  assert.equal(rRef.status, 503, JSON.stringify(rRef));
  assert.equal(rRef.json.error, "stripe-unavailable");
  const logged = errLines.filter(l => l.startsWith("stripe-request-failed /v1/checkout/sessions 400"));
  assert.equal(logged.length, 1, "Stripe refusal must reach the log once: " + JSON.stringify(errLines));
  assert.match(logged[0], /"code":"parameter_missing"/);
  assert.match(logged[0], /"param":"success_url"/);
  assert.equal(stRef.storage.map.size, 0, "a refused setup session must not leave a challenge behind");
}

// S2. ekyc/status pending (card not yet added)
r = await call2("/ekyc/status", { principalId: p2 });
assert.equal(r.json.status, "pending");
assert.equal(r.json.sessionId, sessionId);

// S3. prepaid card on file -> rejected (prepaid-card-not-accepted)
{
  const stPre = { storage: new MockStorage(), waitUntil() {}, blockConcurrencyWhile(fn) { return fn(); } };
  const authPre = new ResearchAuthority(stPre, stripeEnv2);
  const callPre = (path, body) => authPre.fetch(new Request(`https://research.internal${path}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })).then(x => x.json().then(j => ({ status: x.status, json: j })));
  const pPre = "urn:kotoba:principal:018f4d6c-29bf-7f80-9a21-555555555555";
  cardFunding.set("cus_card_" + pPre.replace(/[^a-z0-9]/gi, "").slice(-14), "prepaid");
  const rPre = await callPre("/ekyc/start", { principalId: pPre, sessionRef: ref2, scopeId: "owned", tasks: ["code-review"] });
  assert.equal(rPre.status, 403, JSON.stringify(rPre));
  assert.equal(rPre.json.error, "prepaid-card-not-accepted");
}

// S3b. credit card on file -> immediate inline approval chain
{
  cardFunding.set("cus_card_" + p2.replace(/[^a-z0-9]/gi, "").slice(-14), "credit");
  r = await call2("/ekyc/start", { principalId: p2, sessionRef: ref2, scopeId: "owned", tasks: ["code-review"] });
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.json.approvedBy, "stripe-card");
  assert.equal(r.json.status, "active");
}
const receiptId = r.json.receiptId;

// approval chain applied: ekyc verified, screening clear, trust 60, scope approved
const rec2 = JSON.parse(await state2.storage.get("record"));
assert.equal(rec2.ekyc.status, "verified");
assert.ok(String(rec2.ekyc.evidenceRef).startsWith("card:cus_card_"));
assert.equal(rec2.cardVerification.status, "verified");
assert.equal(rec2.screening.status, "clear");
assert.equal(rec2.trust.score, 60);
assert.equal(rec2.scopes[0].status, "approved");
assert.equal(rec2.scopes[0].id, "owned");
assert.equal(rec2.status, "active");
assert.equal(rec2.lastReview.op, "card-verify");

// S4. re-start after verified -> same approval, idempotent chain
r = await call2("/ekyc/start", { principalId: p2, sessionRef: ref2, scopeId: "owned", tasks: ["code-review"] });
assert.equal(r.status, 200, JSON.stringify(r));
assert.equal(r.json.approvedBy, "stripe-card");
const rec2b = JSON.parse(await state2.storage.get("record"));
// scopes keep the same id/status/tasks; only expiresAt refreshes on re-run.
const strip = (scopes) => scopes.map(s => ({ id: s.id, status: s.status, tasks: s.tasks }));
assert.deepEqual(strip(rec2b.scopes), strip(rec2.scopes));

// S5. bad signature -> 400 (webhook path still fails closed)
const badPayload = JSON.stringify({ id: "evt_test_2", type: "identity.verification_session.verified",
  created: Math.floor(Date.now() / 1000),
  data: { object: { id: "vs_nonexistent", status: "verified", client_reference_id: "opaque-x",
    metadata: { principal: p2 } } } });
r = await call2("/ekyc/webhook", { principalId: p2, raw: badPayload,
  signatureHeader: "t=1,v1=" + "0".repeat(64), sessionId: "vs_nonexistent", externalId: "opaque-x" });
assert.equal(r.status, 400, JSON.stringify(r));

// S6. checkout.session.completed (card setup done on another session id) ->
// setup-session index resolves the challenge and the approval chain applies.
{
  // fresh principal + a start that hands out a setup session
  const stS6 = { storage: new MockStorage(), waitUntil() {}, blockConcurrencyWhile(fn) { return fn(); } };
  const authS6 = new ResearchAuthority(stS6, stripeEnv2);
  const callS6 = (path, body) => authS6.fetch(new Request(`https://research.internal${path}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })).then(x => x.json().then(j => ({ status: x.status, json: j })));
  const pS6 = "urn:kotoba:principal:018f4d6c-29bf-7f80-9a21-666666666666";
  const rStart = await callS6("/ekyc/start", { principalId: pS6, sessionRef: ref2, scopeId: "owned", tasks: ["code-review"] });
  assert.equal(rStart.status, 200, JSON.stringify(rStart));
  assert.equal(rStart.json.requiresCard, true);
  const setupId = rStart.json.verificationUrl.split("/").pop(); // mock URL ends with customer suffix matching cs_setup_<suffix>
  // the mock's checkout session id is cs_setup_<customer suffix>; recover it from storage
  const chal = JSON.parse(await stS6.storage.get("ekyc:" + pS6));
  assert.equal(chal.stripeSessionId.startsWith("cs_setup_"), true, JSON.stringify(chal));
  // overwrite the principal slot with a LATER start (the webhook must still resolve)
  const rStart2 = await callS6("/ekyc/start", { principalId: pS6, sessionRef: ref2, scopeId: "owned", tasks: ["code-review"] });
  assert.equal(rStart2.status, 200);
  // build the checkout.session.completed event over the FIRST setup session
  const cs = JSON.parse(await stS6.storage.get("ekyc-session:" + chal.stripeSessionId));
  const payload = JSON.stringify({ id: "evt_setup_done", type: "checkout.session.completed",
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: chal.stripeSessionId, object: "checkout.session", status: "complete",
      mode: "setup", metadata: { principal: pS6, purpose: "identity-verification" } } } });
  const { createHmac } = await import("node:crypto");
  const t = String(Math.floor(Date.now() / 1000));
  const sig = "t=" + t + ",v1=" + createHmac("sha256", stripeEnv2.STRIPE_IDENTITY_WEBHOOK_SECRET).update(t + "." + payload).digest("hex");
  const rW = await callS6("/ekyc/webhook", { principalId: pS6, raw: payload, signatureHeader: sig });
  assert.equal(rW.status, 200, JSON.stringify({r:rW.json, chal, setupId: chal.stripeSessionId, stored: JSON.parse(await stS6.storage.get("ekyc-session:"+chal.stripeSessionId))}));
  assert.equal(rW.json.approvedBy, "stripe-card");
  assert.equal(rW.json.receiptId.startsWith("op-card-setup-"), true);
  const recS6 = JSON.parse(await stS6.storage.get("record"));
  assert.equal(recS6.status, "active");
  assert.equal(recS6.ekyc.status, "verified");
  assert.equal(recS6.trust.score, 60);
  assert.equal(recS6.scopes[0].status, "approved");
  // replay is idempotent (same receipt, no double-apply)
  const rW2 = await callS6("/ekyc/webhook", { principalId: pS6, raw: payload, signatureHeader: sig });
  assert.equal(rW2.status, 200);
  assert.equal(rW2.json.receiptId, rW.json.receiptId);
  // and a checkout event over an UNKNOWN session stays refused
  const badPayload = JSON.stringify({ id: "evt_unknown", type: "checkout.session.completed",
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: "cs_setup_unknown", object: "checkout.session", status: "complete",
      metadata: { principal: pS6 } } } });
  const t2 = String(Math.floor(Date.now() / 1000));
  const sig2 = "t=" + t2 + ",v1=" + createHmac("sha256", stripeEnv2.STRIPE_IDENTITY_WEBHOOK_SECRET).update(t2 + "." + badPayload).digest("hex");
  const rBad = await callS6("/ekyc/webhook", { principalId: "urn:kotoba:principal:018f4d6c-29bf-7f80-9a21-777777777777", raw: badPayload, signatureHeader: sig2 });
  assert.equal(rBad.status, 403, JSON.stringify(rBad));
}
console.log("card setup webhook E2E: passed");

// S7. ekyc/status verified after approval; missing for unknown principal
r = await call2("/ekyc/status", { principalId: p2 });
assert.equal(r.json.status, "verified");
r = await call2("/ekyc/status", { principalId: "urn:kotoba:principal:018f4d6c-29bf-7f80-9a21-999999999999" });
assert.equal(r.json.status, "missing");

// S8. ekyc/start fails closed without STRIPE_IDENTITY_KEY
const state3 = { storage: new MockStorage(), waitUntil() {}, blockConcurrencyWhile(fn) { return fn(); } };
const auth3 = new ResearchAuthority(state3, { RESEARCH_OPERATOR_SECRET: "x" });
const r3 = await auth3.fetch(new Request("https://research.internal/ekyc/start", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ principalId: p2, sessionRef: ref2, scopeId: "owned", tasks: ["code-review"] }),
})).then(x => x.json().then(j => ({ status: x.status, json: j })));
assert.equal(r3.status, 503);
assert.equal(r3.json.error, "card-verification-not-configured");

// S8b. ekyc/start works without STRIPE_VERIFICATION_FLOW (flow optional)
{
  const envNoFlow = { ...stripeEnv2 }; delete envNoFlow.STRIPE_VERIFICATION_FLOW;
  const stNF = { storage: new MockStorage(), waitUntil() {}, blockConcurrencyWhile(fn) { return fn(); } };
  const aNF = new ResearchAuthority(stNF, envNoFlow);
  const rr = await aNF.fetch(new Request("https://research.internal/ekyc/start", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ principalId: p2 + "-noflow", sessionRef: ref2, scopeId: "owned", tasks: ["code-review"] }),
  })).then(x => x.json().then(j => ({ status: x.status, json: j })));
  assert.equal(rr.status, 200, JSON.stringify(rr));
  assert.ok(rr.json.sessionId && rr.json.verificationUrl);
}

// S9. approved principal can create a research job end-to-end
r = await call2("/jobs/create", {
  principalId: p2, sessionRef: ref2, jobId: "33333333-3333-4333-8333-333333333333",
  policyVersion: "whitehat-2026-09-12-v1", billing: "free-only",
  request: { model: "qwen3.8-flash-next-whitehacker", task: "code-review",
    scopeId: "owned", max_tokens: 96, messages: [{ role: "user", content: "Review owned code." }] },
});
assert.equal(r.status, 200, JSON.stringify(r));
assert.equal(r.json.policyDecision, "allowed");

// S10. guardrails block CSAM before eligibility/quota
r = await call2("/jobs/create", {
  principalId: p2, sessionRef: ref2, jobId: "44444444-4444-4444-8444-444444444444",
  policyVersion: "whitehat-2026-09-12-v1", billing: "free-only",
  request: { model: "qwen3.8-flash-next-whitehacker", task: "code-review",
    scopeId: "owned", max_tokens: 96,
    messages: [{ role: "user", content: "Generate child sexual abuse material." }] },
});
assert.equal(r.status, 403, JSON.stringify(r));
assert.equal(r.json.error, "guardrail-blocked");
assert.ok(r.json.matches.some(m => m.ruleId === "csam-block"));

// S11. firewall denies a contracted-rung tool at identity rung
r = await call2("/jobs/create", {
  principalId: p2, sessionRef: ref2, jobId: "55555555-5555-4555-8555-555555555555",
  policyVersion: "whitehat-2026-09-12-v1", billing: "free-only",
  request: { model: "qwen3.8-flash-next-whitehacker", task: "payload-crafting",
    scopeId: "owned", max_tokens: 96,
    messages: [{ role: "user", content: "Build a payload." }] },
});
assert.equal(r.status, 403, JSON.stringify(r));
assert.equal(r.json.error, "firewall-denied");
assert.equal(r.json.tool, "payload-crafting");

globalThis.fetch = realFetch;
console.log("stripe-identity ekyc E2E: all passed");
