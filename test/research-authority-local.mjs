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
  INFERENCE_NOT_READY_DELAY_MS: "1",
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
await new Promise(r => setTimeout(r, 20));

const storedJob = JSON.parse(await state.storage.get("job:" + jobId));
assert.equal(storedJob.status, "succeeded");
assert.equal(storedJob.attempts, 1);
assert.deepEqual(storedJob.usageReceipt && {
  source: storedJob.usageReceipt.source,
  inputTokens: storedJob.usageReceipt.inputTokens,
  outputTokens: storedJob.usageReceipt.outputTokens,
  totalTokens: storedJob.usageReceipt.totalTokens,
}, { source: "upstream-openai-compatible", inputTokens: 12, outputTokens: 3, totalTokens: 15 });

// 6b. upstream refuses (401) -> terminal state is FAILED with the upstream
// status; never "succeeded" with nil content. Live, the chain's per-step
// rejection handlers let `succeed` run on undefined after `fail` had
// already stored "failed", and the edge served 200 + content null.
{
  const realUpstream = globalThis.fetch;
  const errLines = [];
  const realError = console.error;
  console.error = (...args) => { errLines.push(args.map(String).join(" ")); };
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { type: "invalid_request_error",
    code: "invalid_api_key", message: "Incorrect API key provided" } }),
    { status: 401, headers: { "content-type": "application/json" } });
  const failJobId = "33333333-3333-4333-8333-333333333333";
  const rf = await call("/jobs/create", {
    principalId: principal, sessionRef, jobId: failJobId, policyVersion: "whitehat-2026-09-12-v1",
    billing: "free-only", request: { model: "qwen3.8-flash-next-whitehacker", task: "code-review",
      scopeId: "owned", max_tokens: 96, messages: [{ role: "user", content: "Review owned code, please." }] },
  });
  assert.equal(rf.status, 200, JSON.stringify(rf));
  await new Promise(r => setTimeout(r, 50));
  globalThis.fetch = realUpstream;
  console.error = realError;
  const failed = JSON.parse(await state.storage.get("job:" + failJobId));
  assert.equal(failed.status, "failed", "terminal state must be failed: " + JSON.stringify(failed));
  assert.equal(failed.error, "red-route-unavailable");
  assert.equal(failed.upstreamStatus, 401);
  assert.equal(failed.retryable, true, "401 is operator configuration: a re-run after the fix may succeed");
  assert.equal(failed.content, undefined);
  const logged = errLines.filter(l => l.startsWith("inference-run-failed " + failJobId));
  assert.equal(logged.length, 1, JSON.stringify(errLines));
  assert.match(logged[0], /"code":"invalid_api_key"/);
  // and the poll reports the failure, not a receipt
  const rs = await call("/jobs/status", { principalId: principal, sessionRef, jobId: failJobId });
  assert.equal(rs.json.status, "failed");
  // The same prompt again re-dispatches the FAILED reservation (the origin is
  // back) instead of replaying the failure — measured live 2026-09-15: the
  // second identical request answered 502 in 0.3 s without a run.
  const usedBefore = JSON.parse(await state.storage.get("record")).usage.count;
  const rr = await call("/jobs/create", {
    principalId: principal, sessionRef, jobId: failJobId, policyVersion: "whitehat-2026-09-12-v1",
    billing: "free-only", request: { model: "qwen3.8-flash-next-whitehacker", task: "code-review",
      scopeId: "owned", max_tokens: 96, messages: [{ role: "user", content: "Review owned code, please." }] },
  });
  assert.equal(rr.status, 200, JSON.stringify(rr));
  await new Promise(r => setTimeout(r, 50));
  const retried = JSON.parse(await state.storage.get("job:" + failJobId));
  assert.equal(retried.status, "succeeded", "a failed reservation must run again: " + JSON.stringify(retried));
  assert.equal(retried.content, "Fix authorization.");
  assert.equal(JSON.parse(await state.storage.get("record")).usage.count, usedBefore + 1, "the retry is counted");
  // a succeeded reservation is still replayed, not re-run
  const rr2 = await call("/jobs/create", {
    principalId: principal, sessionRef, jobId: failJobId, policyVersion: "whitehat-2026-09-12-v1",
    billing: "free-only", request: { model: "qwen3.8-flash-next-whitehacker", task: "code-review",
      scopeId: "owned", max_tokens: 96, messages: [{ role: "user", content: "Review owned code, please." }] },
  });
  assert.equal(rr2.json.receiptId, "receipt-" + failJobId);
  assert.equal(JSON.parse(await state.storage.get("record")).usage.count, usedBefore + 1, "a replay is not counted");
}

// 6c. native tool calls: the request's tools reach the origin verbatim, and
// an answer with tool_calls and null content is a SUCCEEDED job carrying
// toolCalls + finishReason tool_calls (an agent's turn), never an empty
// result. Measured 2026-09-15: with tools dropped the agent's calls came
// back empty and it fell back to another provider.
{
  const realUpstream = globalThis.fetch;
  let seenTools = null;
  globalThis.fetch = async (url, init) => {
    const req = JSON.parse(String(init.body));
    seenTools = { tools: req.tools, tool_choice: req.tool_choice, roles: req.messages.map(m => m.role) };
    return new Response(JSON.stringify({
      id: "chatcmpl-tool", object: "chat.completion", model: "qwen3.8-flash-next-cybersecurity-nvfp4",
      choices: [{ index: 0, finish_reason: "tool_calls", message: { role: "assistant", content: null,
        reasoning: "The user wants a file.",
        tool_calls: [{ id: "call_1", type: "function", function: { name: "write_file", arguments: "{\"path\":\"hello.txt\",\"content\":\"hi\"}" } }] } }],
      usage: { prompt_tokens: 40, completion_tokens: 20, total_tokens: 60 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const toolJobId = "44444444-4444-4444-8444-444444444444";
  const rt = await call("/jobs/create", {
    principalId: principal, sessionRef, jobId: toolJobId, policyVersion: "whitehat-2026-09-12-v1",
    billing: "free-only", request: { model: "qwen3.8-flash-next-whitehacker", task: "code-review",
      scopeId: "owned", max_tokens: 256,
      tools: [{ type: "function", function: { name: "write_file", parameters: { type: "object", properties: { path: { type: "string" } } } } }],
      tool_choice: "auto",
      messages: [{ role: "system", content: "You are an agent." }, { role: "user", content: "Create hello.txt" },
        { role: "assistant", content: "", tool_calls: [{ id: "call_0", type: "function", function: { name: "read_file", arguments: "{}" } }] },
        { role: "tool", tool_call_id: "call_0", content: "(no such file)" }] },
  });
  assert.equal(rt.status, 200, JSON.stringify(rt));
  await new Promise(r => setTimeout(r, 50));
  globalThis.fetch = realUpstream;
  assert.equal(seenTools.tools.length, 1, "tools must reach the origin");
  assert.equal(seenTools.tools[0].function.name, "write_file");
  assert.equal(seenTools.tool_choice, "auto");
  assert.deepEqual(seenTools.roles, ["system", "user", "assistant", "tool"]);
  const toolJob = JSON.parse(await state.storage.get("job:" + toolJobId));
  assert.equal(toolJob.status, "succeeded", JSON.stringify(toolJob));
  assert.equal(toolJob.content, null, "reasoning must not stand in for content next to native tool calls");
  assert.equal(toolJob.finishReason, "tool_calls");
  assert.deepEqual(toolJob.toolCalls, [{ id: "call_1", type: "function", function: { name: "write_file", arguments: "{\"path\":\"hello.txt\",\"content\":\"hi\"}" } }]);
  const rts = await call("/jobs/status", { principalId: principal, sessionRef, jobId: toolJobId });
  assert.equal(rts.json.status, "succeeded");
  assert.equal(rts.json.toolCalls[0].function.name, "write_file");
  assert.equal(rts.json.finishReason, "tool_calls");
}

// 6d. The model answers tool calls as Qwen3-Coder XML text (the origin's
// hermes parser leaves it in content, measured live 2026-09-15 21:04). The
// authority converts it to native tool_calls, typing the parameters from
// the request's tool schema, and the residual text becomes null content.
{
  const realUpstream = globalThis.fetch;
  const xml = '\n\n<tool_call>\n<function=write_file>\n<parameter=path>\ngreet.py\n</parameter>\n<parameter=content>\nprint("hi")\n\n</parameter>\n</function>\n</tool_call>\n<tool_call>\n<function=terminal>\n<parameter=command>\npython3 greet.py\n</parameter>\n<parameter=timeout>\n30\n</parameter>\n<parameter=background>\nfalse\n</parameter>\n</function>\n</tool_call>';
  globalThis.fetch = async () => new Response(JSON.stringify({
    id: "chatcmpl-xml", object: "chat.completion", model: "qwen3.8-flash-next-cybersecurity-nvfp4",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: xml } }],
    usage: { prompt_tokens: 40, completion_tokens: 60, total_tokens: 100 },
  }), { status: 200, headers: { "content-type": "application/json" } });
  const xmlJobId = "55555555-5555-4555-8555-555555555555";
  const rx = await call("/jobs/create", {
    principalId: principal, sessionRef, jobId: xmlJobId, policyVersion: "whitehat-2026-09-12-v1",
    billing: "free-only", request: { model: "qwen3.8-flash-next-whitehacker", task: "code-review",
      scopeId: "owned", max_tokens: 256,
      tools: [{ type: "function", function: { name: "write_file", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } } } } },
              { type: "function", function: { name: "terminal", parameters: { type: "object", properties: { command: { type: "string" }, timeout: { type: "integer" }, background: { type: "boolean" } } } } }],
      messages: [{ role: "user", content: "Create greet.py and run it" }] },
  });
  assert.equal(rx.status, 200, JSON.stringify(rx));
  await new Promise(r => setTimeout(r, 50));
  globalThis.fetch = realUpstream;
  const xmlJob = JSON.parse(await state.storage.get("job:" + xmlJobId));
  assert.equal(xmlJob.status, "succeeded", JSON.stringify(xmlJob));
  assert.equal(xmlJob.content, null, "residual text is only whitespace");
  assert.equal(xmlJob.finishReason, "tool_calls");
  assert.equal(xmlJob.toolCalls.length, 2);
  assert.equal(xmlJob.toolCalls[0].function.name, "write_file");
  assert.deepEqual(JSON.parse(xmlJob.toolCalls[0].function.arguments), { path: "greet.py", content: 'print("hi")\n' });
  assert.equal(xmlJob.toolCalls[1].function.name, "terminal");
  assert.deepEqual(JSON.parse(xmlJob.toolCalls[1].function.arguments), { command: "python3 greet.py", timeout: 30, background: false });
  assert.match(xmlJob.toolCalls[0].id, /^call_/);
  assert.notEqual(xmlJob.toolCalls[0].id, xmlJob.toolCalls[1].id);
  // the hermes-style json form is read too, and text outside the block survives
  globalThis.fetch = async () => new Response(JSON.stringify({
    id: "chatcmpl-json", object: "chat.completion", model: "qwen3.8-flash-next-cybersecurity-nvfp4",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: 'Let me look.\n<tool_call>\n{"name": "read_file", "arguments": {"path": "a.txt"}}\n</tool_call>' } }],
    usage: { prompt_tokens: 4, completion_tokens: 6, total_tokens: 10 },
  }), { status: 200, headers: { "content-type": "application/json" } });
  const jsonJobId = "66666666-6666-4666-8666-666666666666";
  await call("/jobs/create", {
    principalId: principal, sessionRef, jobId: jsonJobId, policyVersion: "whitehat-2026-09-12-v1",
    billing: "free-only", request: { model: "qwen3.8-flash-next-whitehacker", task: "code-review",
      scopeId: "owned", max_tokens: 256, messages: [{ role: "user", content: "Read a.txt" }] },
  });
  await new Promise(r => setTimeout(r, 50));
  globalThis.fetch = realUpstream;
  const jsonJob = JSON.parse(await state.storage.get("job:" + jsonJobId));
  assert.equal(jsonJob.status, "succeeded", JSON.stringify(jsonJob));
  assert.equal(jsonJob.content, "Let me look.");
  assert.deepEqual(JSON.parse(jsonJob.toolCalls[0].function.arguments), { path: "a.txt" });
  assert.equal(jsonJob.toolCalls[0].function.name, "read_file");
}

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

// 11. blue team (the shared route): a signed-in principal with NO record is
//     admitted, the job goes to the shared route with the model's id, and the offensive
//     band stays closed. Without the key the route refuses by name.
{
  const blueState = { storage: new MockStorage(), waitUntil() {}, blockConcurrencyWhile(fn) { return fn(); } };
  const bluePrincipal = "urn:kotoba:principal:018f4d6c-29bf-7f80-9a21-222222222222";
  const blueJob = "33333333-3333-4333-8333-333333333333";
  const blueRequest = (model, task, content) => ({
    principalId: bluePrincipal, sessionRef, jobId: blueJob, policyVersion: "whitehat-2026-09-12-v1",
    billing: "free-only", request: { model, task, scopeId: "owned", max_tokens: 64, messages: [{ role: "user", content }] },
  });
  const oldFetch = globalThis.fetch;
  const routed = [];
  globalThis.fetch = async (url, init) => {
    routed.push({ url: String(url), auth: init.headers.authorization, referer: init.headers["HTTP-Referer"], body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ id: "gen-1", object: "chat.completion", model: "qwen/qwen3.8-flash",
      choices: [{ index: 0, message: { role: "assistant", content: "Blue answer." }, finish_reason: "stop" }],
      usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    // key absent → the job is admitted but the run refuses by name (never falls back to the dedicated deployment)
    const noKey = new ResearchAuthority(blueState, { ...env });
    const callNoKey = (path, body) => noKey.fetch(new Request(`https://research.internal${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).then(r => r.json().then(j => ({ status: r.status, json: j })));
    let b = await callNoKey("/jobs/create", blueRequest("qwen/qwen3.8-flash", "code-review", "Summarise this function."));
    assert.equal(b.status, 200, "blue: no record needed " + JSON.stringify(b.json));
    await new Promise(r => setTimeout(r, 20));
    let stored = JSON.parse(await blueState.storage.get("job:" + blueJob));
    assert.equal(stored.status, "failed");
    assert.match(stored.error, /blue-route-not-configured/);
    assert.equal(routed.length, 0, "nothing was fetched — no fallback to the red route");
    // key present → the shared route, the model id, referer, strict attribution
    const blueState2 = { storage: new MockStorage(), waitUntil() {}, blockConcurrencyWhile(fn) { return fn(); } };
    const withKey = new ResearchAuthority(blueState2, { ...env, BLUE_ROUTE_API_KEY: "or-test-key" });
    const callKey = (path, body) => withKey.fetch(new Request(`https://research.internal${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).then(r => r.json().then(j => ({ status: r.status, json: j })));
    b = await callKey("/jobs/create", blueRequest("qwen/qwen3.8-flash", "code-review", "Summarise this function."));
    assert.equal(b.status, 200, JSON.stringify(b.json));
    await new Promise(r => setTimeout(r, 20));
    stored = JSON.parse(await blueState2.storage.get("job:" + blueJob));
    assert.equal(stored.status, "succeeded", JSON.stringify(stored));
    assert.equal(routed.length, 1);
    assert.equal(routed[0].url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(routed[0].auth, "Bearer or-test-key");
    assert.equal(routed[0].referer, "https://kotoba.cloud");
    assert.equal(routed[0].body.model, "qwen/qwen3.8-flash");
    // the offensive band is closed to the blue team regardless of key
    b = await callKey("/jobs/create", { ...blueRequest("z-ai/glm-5.3-flash", "payload-crafting", "x"), jobId: "44444444-4444-4444-8444-444444444444" });
    assert.equal(b.status, 403, JSON.stringify(b.json));
    // red team on a fresh principal is still refused
    b = await callKey("/jobs/create", { ...blueRequest("qwen3.8-flash-next-whitehacker", "code-review", "x"), jobId: "55555555-5555-4555-8555-555555555555" });
    assert.equal(b.status, 403, "red stays gated: " + JSON.stringify(b.json));
    assert.equal(b.json.error, "review-required");
  } finally { globalThis.fetch = oldFetch; }
  console.log("blue team route: admitted on sign-in, the shared route with the model id, refuses by name without the key, offensive band closed, red still gated");
}


// 6f. cold start absorbed: the route answers 503 "model loading" twice, then
// 200 -> ONE job, status running in between, succeeded with attempts=3.
// (Measured 2026-09-15 12:38Z: one shot against a snapshot-creating start
// stored `failed` after 129 s.)
{
  const realUpstream = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls <= 2) return new Response(JSON.stringify({ error: "model loading" }), { status: 503, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ id: "c", object: "chat.completion", model: "qwen3.8-flash-next-cybersecurity-nvfp4",
      choices: [{ index: 0, message: { role: "assistant", content: "Warm now." }, finish_reason: "stop" }],
      usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const coldJobId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const req = { principalId: principal, sessionRef, jobId: coldJobId, policyVersion: "whitehat-2026-09-12-v1",
    billing: "free-only", request: { model: "qwen3.8-flash-next-whitehacker", task: "code-review",
      scopeId: "owned", max_tokens: 96, messages: [{ role: "user", content: "Review owned code while the route warms." }] } };
  const rc = await call("/jobs/create", req);
  assert.equal(rc.status, 200, JSON.stringify(rc));
  // in flight: a second identical create re-attaches to the RUNNING job and does not dispatch again
  const rc2 = await call("/jobs/create", req);
  assert.equal(rc2.status, 200);
  assert.ok(["queued", "running"].includes(rc2.json.status), "re-attach while running: " + rc2.json.status);
  await new Promise(r => setTimeout(r, 120));
  globalThis.fetch = realUpstream;
  const cold = JSON.parse(await state.storage.get("job:" + coldJobId));
  assert.equal(cold.status, "succeeded", JSON.stringify(cold));
  assert.equal(cold.attempts, 3, "two not-ready answers then the answer");
  assert.equal(cold.lastUpstreamStatus, undefined, "the terminal record carries no stale not-ready status");
  assert.equal(calls, 3, "exactly three fetches for two creates: no double dispatch");
  console.log("cold start absorbed: 503,503,200 -> one succeeded job, attempts=3, no double dispatch");
}

// 6g. the origin refuses the REQUEST (400: context window): terminal failed,
// retryable=false, the origin's message kept; a retry of the same request
// does NOT re-dispatch (the edge serves the caller its 400).
{
  const realUpstream = globalThis.fetch;
  let calls = 0;
  const realError = console.error; console.error = () => {};
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ error: { type: "BadRequestError", code: 400,
    message: "This model's maximum context length is 131072 tokens. However, you requested 16 output tokens and your prompt contains at least 131057 input tokens" } }),
    { status: 400, headers: { "content-type": "application/json" } }); };
  const bigJobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const req = { principalId: principal, sessionRef, jobId: bigJobId, policyVersion: "whitehat-2026-09-12-v1",
    billing: "free-only", request: { model: "qwen3.8-flash-next-whitehacker", task: "code-review",
      scopeId: "owned", max_tokens: 16, messages: [{ role: "user", content: "Count the letters (pretend this is 480k characters)." }] } };
  let rb = await call("/jobs/create", req);
  assert.equal(rb.status, 200);
  await new Promise(r => setTimeout(r, 30));
  const big = JSON.parse(await state.storage.get("job:" + bigJobId));
  assert.equal(big.status, "failed", JSON.stringify(big));
  assert.equal(big.upstreamStatus, 400);
  assert.equal(big.retryable, false);
  assert.match(big.upstreamError.message, /maximum context length/);
  rb = await call("/jobs/create", req);
  await new Promise(r => setTimeout(r, 30));
  assert.equal(rb.json.status, "failed", "a request refusal is final: " + JSON.stringify(rb.json));
  assert.equal(rb.json.upstreamStatus, 400, "the poll carries the status the edge maps to the caller's 400");
  assert.match(rb.json.upstreamError.message, /maximum context length/);
  assert.equal(calls, 1, "no re-dispatch of a request the origin refused");
  globalThis.fetch = realUpstream; console.error = realError;
  console.log("request refusal: 400 -> failed, retryable=false, message kept, retry does not re-dispatch");
}

// 6h. a retryable failure (500 from the route) is re-queued by the next
// identical request and then succeeds; requeues is counted and capped.
{
  const realUpstream = globalThis.fetch;
  const realError = console.error; console.error = () => {};
  const realWarn = console.warn; const warns = []; console.warn = (...a) => warns.push(a.map(String).join(" "));
  let mode = "500";
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (mode === "500") return new Response("upstream exploded", { status: 500 });
    return new Response(JSON.stringify({ id: "c", object: "chat.completion", model: "qwen3.8-flash-next-cybersecurity-nvfp4",
      choices: [{ index: 0, message: { role: "assistant", content: "Recovered." }, finish_reason: "stop" }],
      usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const rqJobId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const req = { principalId: principal, sessionRef, jobId: rqJobId, policyVersion: "whitehat-2026-09-12-v1",
    billing: "free-only", request: { model: "qwen3.8-flash-next-whitehacker", task: "code-review",
      scopeId: "owned", max_tokens: 96, messages: [{ role: "user", content: "hello (the agent's fixed opening prompt)" }] } };
  let rr = await call("/jobs/create", req);
  await new Promise(r => setTimeout(r, 30));
  let job = JSON.parse(await state.storage.get("job:" + rqJobId));
  assert.equal(job.status, "failed"); assert.equal(job.retryable, true); assert.equal(job.upstreamStatus, 500);
  const used = JSON.parse(await state.storage.get("record")).usage.count;
  mode = "200";
  rr = await call("/jobs/create", req);
  assert.equal(rr.status, 200);
  assert.equal(rr.json.status, "queued", "the retry re-queues the failed job: " + JSON.stringify(rr.json));
  await new Promise(r => setTimeout(r, 30));
  job = JSON.parse(await state.storage.get("job:" + rqJobId));
  assert.equal(job.status, "succeeded", JSON.stringify(job));
  assert.equal(job.requeues, 1);
  assert.equal(job.content, "Recovered.");
  assert.equal(JSON.parse(await state.storage.get("record")).usage.count, used + 1, "a re-dispatch draws the free quota, like a fresh job (the daily cap + requeues cap bound it)");
  assert.equal(calls, 2);
  assert.ok(warns.some(w => w.startsWith("inference-job-requeued " + rqJobId)), JSON.stringify(warns));
  // the cap: a job that already re-queued 3 times stays failed
  await state.storage.put("job:" + rqJobId, JSON.stringify({ ...job, status: "failed", retryable: true, requeues: 3 }));
  rr = await call("/jobs/create", req);
  assert.equal(rr.json.status, "failed", "past max-requeues the failure is final: " + JSON.stringify(rr.json));
  assert.equal(calls, 2, "no dispatch past the cap");
  // a prior stored before `retryable` existed (today's stuck jobs) counts as retryable
  await state.storage.put("job:" + rqJobId, JSON.stringify({ ...job, status: "failed", error: "red-route-unavailable", upstreamStatus: 502, retryable: undefined, requeues: 0 }));
  rr = await call("/jobs/create", req);
  assert.equal(rr.json.status, "queued", "legacy failed job re-queued: " + JSON.stringify(rr.json));
  await new Promise(r => setTimeout(r, 30));
  // a run presumed dead (running for 26 minutes) is re-queued too
  await state.storage.put("job:" + rqJobId, JSON.stringify({ ...job, status: "running", startedAt: Date.now() - 26 * 60000, requeues: 0 }));
  rr = await call("/jobs/create", req);
  assert.equal(rr.json.status, "queued", "stale running job re-queued: " + JSON.stringify(rr.json));
  await new Promise(r => setTimeout(r, 30));
  // ... but a run that is 1 minute old is left alone (re-attach, no second dispatch)
  const before = calls;
  await state.storage.put("job:" + rqJobId, JSON.stringify({ ...job, status: "running", startedAt: Date.now() - 60000, requeues: 0 }));
  rr = await call("/jobs/create", req);
  assert.equal(rr.json.status, "running");
  assert.equal(calls, before, "a live run is not dispatched again");
  globalThis.fetch = realUpstream; console.error = realError; console.warn = realWarn;
  console.log("retryable failure: 500 -> failed(retryable) -> retry re-queues -> succeeded; cap, legacy record, stale run covered");
}

// 11. personal API token registry on the principal record
{
  let r;
  r = await call("/tokens/check", { principalId: principal, tokenId: null });
  assert.equal(r.status, 200, "legacy token admitted before legacy revocation");
  r = await call("/tokens/register", { principalId: principal, tokenId: "not-hex" });
  assert.equal(r.status, 400);
  r = await call("/tokens/register", { principalId: principal, tokenId: "0123456789ab", label: "cli" });
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.json.token.label, "cli");
  assert.equal(typeof r.json.token.issuedAt, "number");
  r = await call("/tokens/register", { principalId: principal, tokenId: "0123456789ab" });
  assert.equal(r.status, 409, "an id registers once");
  r = await call("/tokens/register", { principalId: principal, tokenId: "0123456789ac", label: "x".repeat(65) });
  assert.equal(r.json.token.label, null, "an over-long label is dropped, the token still registers");
  r = await call("/tokens/check", { principalId: principal, tokenId: "0123456789ab" });
  assert.equal(r.status, 200); assert.equal(r.json.ok, true); assert.equal(r.json.label, "cli");
  r = await call("/tokens/check", { principalId: principal, tokenId: "ffffffffffff" });
  assert.equal(r.status, 403); assert.equal(r.json.error, "token-unknown");
  r = await call("/tokens/revoke", { principalId: principal, tokenId: "ffffffffffff" });
  assert.equal(r.status, 404);
  r = await call("/tokens/revoke", { principalId: principal, tokenId: "0123456789ab" });
  assert.equal(r.status, 200); assert.equal(typeof r.json.token.revokedAt, "number");
  const firstRevokedAt = r.json.token.revokedAt;
  r = await call("/tokens/check", { principalId: principal, tokenId: "0123456789ab" });
  assert.equal(r.status, 403); assert.equal(r.json.error, "token-revoked");
  r = await call("/tokens/revoke", { principalId: principal, tokenId: "0123456789ab" });
  assert.equal(r.json.token.revokedAt, firstRevokedAt, "revoking twice keeps the first revocation time");
  r = await call("/tokens/check", { principalId: principal, tokenId: "0123456789ac" });
  assert.equal(r.status, 200, "the other token is untouched");
  r = await call("/tokens/list", { principalId: principal });
  assert.equal(r.json.tokens.length, 2);
  assert.deepEqual(Object.keys(r.json.tokens[0]).sort(), ["id", "issuedAt", "label", "revokedAt"]);
  assert.equal(r.json.legacyRevokedAt, null, "not yet revoked (JSON null)");
  r = await call("/tokens/revoke-legacy", { principalId: principal });
  assert.equal(typeof r.json.legacyRevokedAt, "number");
  r = await call("/tokens/check", { principalId: principal, tokenId: null });
  assert.equal(r.status, 403); assert.equal(r.json.error, "legacy-token-revoked");
  r = await call("/tokens/check", { principalId: principal, tokenId: "0123456789ac" });
  assert.equal(r.status, 200, "revoking legacy tokens does not touch v2 tokens");
  // the record's research state is untouched by registry writes
  r = await call("/status", { principalId: principal, sessionRef, action: "code-review" });
  assert.equal(r.json.status, "active");
}

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

  // S6b. The trust grant outlives its 60-second stamp. Age the stored stamp
  // by two minutes (what any /status read after the first minute sees) and
  // the projection must still carry the grant: policyVersion, score 60, a
  // fresh evaluatedAt and an expiresAt at most 60 s later. Live, the first
  // console read after approval said trust-route-required (2026-09-15).
  const aged = JSON.parse(await stS6.storage.get("record"));
  aged.trust.evaluatedAt = Date.now() - 120000;
  aged.trust.expiresAt = Date.now() - 60000;
  await stS6.storage.put("record", JSON.stringify(aged));
  const t0 = Date.now();
  const rSt = await callS6("/status", { principalId: pS6, sessionRef: ref2, action: "code-review" });
  assert.equal(rSt.status, 200, JSON.stringify(rSt));
  assert.equal(rSt.json.trust.policyVersion, "kotoba-trust-routes-2026-09-v1", "trust must be projected after the stamp aged: " + JSON.stringify(rSt.json.trust));
  assert.equal(rSt.json.trust.score, 60);
  assert.deepEqual(rSt.json.trust.routes, ["web-reviewed"]);
  assert.ok(rSt.json.trust.evaluatedAt >= t0, "projection is stamped now");
  assert.ok(rSt.json.trust.expiresAt - rSt.json.trust.evaluatedAt <= 60000, "projection window is at most 60 s");
  assert.ok(rSt.json.trust.expiresAt <= aged.ekyc.expiresAt, "projection never outlives the evidence");
  // and a job admitted on the same aged record is not trust-route-required
  const rJob = await callS6("/jobs/create", { principalId: pS6, sessionRef: ref2, jobId: "job-aged-1",
    policyVersion: "whitehat-2026-09-12-v1", billing: "free-only",
    trustPolicyVersion: "kotoba-trust-routes-2026-09-v1", sessionPolicyVersion: "kotoba-session-evidence-2026-09-v1",
    request: { model: "qwen3.8-flash-next-whitehacker", task: "code-review", scopeId: "owned", max_tokens: 64,
      messages: [{ role: "user", content: "Review my authorization checks." }] },
    limits: { requestsPerDay: 50, maxOutputTokens: 2048, maxInputCharacters: 24000 } });
  assert.notEqual(rJob.json.error, "trust-route-required", JSON.stringify(rJob));
  // Evidence gone -> no projection (the reason literal is verification-expired
  // upstream; here the trust simply is not re-stamped).
  const expired = JSON.parse(await stS6.storage.get("record"));
  expired.ekyc.expiresAt = Date.now() - 1;
  await stS6.storage.put("record", JSON.stringify(expired));
  const rEx = await callS6("/status", { principalId: pS6, sessionRef: ref2, action: "code-review" });
  assert.equal(rEx.json.trust.policyVersion, undefined, "no evidence, no projection: " + JSON.stringify(rEx.json.trust));
  expired.ekyc.expiresAt = aged.ekyc.expiresAt;
  await stS6.storage.put("record", JSON.stringify(expired));
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
