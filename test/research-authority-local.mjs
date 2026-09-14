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
