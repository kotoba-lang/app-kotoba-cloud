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
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith("https://api.stripe.com/")) {
    const body = String(init.body);
    const ref = new URLSearchParams(body).get("client_reference_id");
    const meta = new URLSearchParams(body).get("metadata[principal]");
    if (!ref || !meta) throw new Error("stripe request missing bindings");
    return new Response(JSON.stringify({
      id: "vs_session_" + ref.replace("opaque-", ""),
      object: "identity.verification_session",
      status: "requires_input",
      client_reference_id: ref,
      url: "https://hooks.stripe.com/verify/" + ref,
      metadata: { principal: meta },
    }), { status: 200, headers: { "content-type": "application/json" } });
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

// S1. ekyc/start -> challenge + stripe session
r = await call2("/ekyc/start", { principalId: p2, sessionRef: ref2, scopeId: "owned", tasks: ["code-review"] });
assert.equal(r.status, 200, JSON.stringify(r));
const { sessionId, externalId, verificationUrl, expiresAt } = r.json;
assert.ok(sessionId && externalId.startsWith("opaque-") && verificationUrl && expiresAt > Date.now());

// S2. ekyc/status pending
r = await call2("/ekyc/status", { principalId: p2 });
assert.equal(r.json.status, "pending");
assert.equal(r.json.sessionId, sessionId);

// S3. signed verified webhook -> full approval chain, one shot
function signedStripeEvent(payload) {
  const t = Math.floor((Date.now() + 60000) / 1000);
  const sig = createHmac("sha256", stripeEnv2.STRIPE_IDENTITY_WEBHOOK_SECRET).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${sig}`;
}
const stripeEventPayload = JSON.stringify({
  id: "evt_test_1", type: "identity.verification_session.verified",
  created: Math.floor(Date.now() / 1000),
  data: { object: { id: sessionId, object: "identity.verification_session", status: "verified",
    client_reference_id: externalId, metadata: { principal: p2 },
    verified_outputs: { dob: "1990-01-01", first_name: "T", last_name: "U", address: { country: "JP" } } } },
});
r = await call2("/ekyc/webhook", { principalId: p2, raw: stripeEventPayload, signatureHeader: signedStripeEvent(stripeEventPayload), sessionId, externalId });
assert.equal(r.status, 200, JSON.stringify(r));
assert.equal(r.json.approvedBy, "stripe-identity");
const receiptId = r.json.receiptId;
assert.equal(r.json.status, "active");

// approval chain applied: ekyc verified, screening clear, trust 60, scope approved
const rec2 = JSON.parse(await state2.storage.get("record"));
assert.equal(rec2.ekyc.status, "verified");
assert.equal(rec2.ekyc.evidenceRef, sessionId);
assert.equal(rec2.screening.status, "clear");
assert.equal(rec2.trust.score, 60);
assert.equal(rec2.scopes[0].status, "approved");
assert.equal(rec2.scopes[0].id, "owned");
assert.equal(rec2.status, "active");
assert.equal(rec2.lastReview.op, "stripe-identity-approve");

// S4. idempotent replay -> same receipt, no double-apply
r = await call2("/ekyc/webhook", { principalId: p2, raw: stripeEventPayload, signatureHeader: signedStripeEvent(stripeEventPayload), sessionId, externalId });
assert.equal(r.status, 200, JSON.stringify(r));
assert.equal(r.json.receiptId, receiptId);
const rec2b = JSON.parse(await state2.storage.get("record"));
assert.deepEqual(rec2b.scopes, rec2.scopes);

// S5. bad signature -> 400
r = await call2("/ekyc/start", { principalId: "urn:kotoba:principal:018f4d6c-29bf-7f80-9a21-333333333333", sessionRef: ref2, scopeId: "owned", tasks: ["code-review"] });
assert.equal(r.status, 200);
const ch2 = r.json;
const badPayload = JSON.stringify({ id: "evt_test_2", type: "identity.verification_session.verified",
  created: Math.floor(Date.now() / 1000),
  data: { object: { id: ch2.sessionId, status: "verified", client_reference_id: ch2.externalId,
    metadata: { principal: "urn:kotoba:principal:018f4d6c-29bf-7f80-9a21-333333333333" } } } });
r = await call2("/ekyc/webhook", { principalId: "urn:kotoba:principal:018f4d6c-29bf-7f80-9a21-333333333333", raw: badPayload,
  signatureHeader: "t=1,v1=" + "0".repeat(64), sessionId: ch2.sessionId, externalId: ch2.externalId });
assert.equal(r.status, 400, JSON.stringify(r));

// S6. wrong principal binding -> 403 (event metadata principal ≠ challenge principal)
const forged = JSON.stringify({ id: "evt_test_3", type: "identity.verification_session.verified",
  created: Math.floor(Date.now() / 1000),
  data: { object: { id: ch2.sessionId, status: "verified", client_reference_id: ch2.externalId,
    metadata: { principal: p2 } } } });
r = await call2("/ekyc/webhook", { principalId: "urn:kotoba:principal:018f4d6c-29bf-7f80-9a21-333333333333", raw: forged,
  signatureHeader: signedStripeEvent(forged), sessionId: ch2.sessionId, externalId: ch2.externalId });
assert.equal(r.status, 403, JSON.stringify(r));

// S7. ekyc/status verified after consume; missing for unknown principal
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
assert.equal(r3.json.error, "stripe-identity-not-configured");

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

globalThis.fetch = realFetch;
console.log("stripe-identity ekyc E2E: all passed");
