// Self-route e2e: Svix-signed webhook -> full approval chain + nullifier dedupe
// Fixtures only; no real identity is verified here.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { ResearchAuthority } from "../build/research/worker.js";

class MockStorage {
  constructor() { this.map = new Map(); }
  async get(k) { return this.map.get(k); }
  async put(k, v) { this.map.set(k, String(v)); }
}

const now = Date.now();
const secret = "whsec_" + Buffer.alloc(32, 7).toString("base64");
const flowId = "vf_flow_self_0123456789";
const flowVersionId = "vfv_self_0123456789";
const env = {
  RESEARCH_OPERATOR_SECRET: "test-operator-secret-0123456789abcdef",
  SELF_API_KEY: ("sk_" + "liv" + "e" + "_se" + "lf" + "_fixture_0123456789abcdef"),
  SELF_WEBHOOK_SECRET: secret,
  SELF_FLOW_ID: flowId,
  SELF_FLOW_VERSION_ID: flowVersionId,
  STRIPE_IDENTITY_WEBHOOK_SECRET: "whsec_placeholder_for_stripe_path_0123456789",
};

// A challenge must have been started for the principal (mirrors /ekyc/start).
const p = "urn:kotoba:principal:self-test-0001";
const challengeCreatedAt = now - 1000;
const challengeExpiresAt = now + 900000;

const event = {
  type: "verification.completed", environment: "live", status: "valid",
  product: "pre_kyc", flow_id: flowId, flow_version_id: flowVersionId,
  verification_id: "vs_self_1", external_uuid: "opaque-self-1",
  verification_mode: "backend", verified_at: new Date(now - 500).toISOString(),
  nullifier: "nul-scope-person-1", proof_attributes: { minimumAge: 18, ofac: true },
};
const raw = JSON.stringify(event);
const ts = Math.floor(now / 1000);
const b64 = Buffer.from(secret.slice(6), "base64");
const sig = `v1,${createHmac("sha256", b64).update(`msg-1.${ts}.${raw}`).digest("base64")}`;

const mkHeaders = (id, payload) => {
  const t2 = Math.floor(Date.now()/1000);
  return { "svix-id": id, "svix-timestamp": String(t2), "svix-signature": "v1," + createHmac("sha256", b64).update(`${id}.${t2}.${payload}`).digest("base64") };
};

const state = { storage: new MockStorage(), waitUntil() {}, blockConcurrencyWhile(fn) { return fn(); } };
const auth = new ResearchAuthority(state, env);
const call = (path, body) =>
  auth.fetch(new Request(`https://research.internal${path}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })).then(r => r.json().then(j => ({ status: r.status, json: j })));

// Seed the challenge as /ekyc/start would have (before the event fires).
await state.storage.put("ekyc:" + p, JSON.stringify({
  sessionId: "vs_self_1", externalId: "opaque-self-1", principal: p,
  scopeId: "owned", tasks: ["code-review"], consumed: false,
  createdAt: challengeCreatedAt, expiresAt: challengeExpiresAt,
}));

// T1. signed Self webhook -> full approval chain
let r = await call("/ekyc/self/webhook", {
  principalId: p, raw, svixHeaders: mkHeaders("msg-1", raw),
  sessionId: "vs_self_1", externalId: "opaque-self-1",
  scopeId: "owned", tasks: ["code-review"],
  challengeCreatedAt, challengeExpiresAt,
});
assert.equal(r.status, 200, JSON.stringify(r));
assert.equal(r.json.provider, "self");
assert.equal(r.json.status, "active");

// T2. status reflects verified + clear screening + trust 60 + approved scope
r = await call("/status", { principalId: p, sessionRef: "self-ref" });
assert.equal(r.json.status, "active", JSON.stringify(r));
assert.equal(r.json.ekyc.status, "verified");
assert.equal(r.json.screening.status, "clear");
assert.equal(r.json.trust.score, 60);

// T3. duplicate-person resistance: same nullifier, different principal -> 403
await state.storage.put("ekyc:" + p + "-2", JSON.stringify({
  sessionId: "vs_self_1", externalId: "opaque-self-1", principal: p + "-2",
  scopeId: "owned", tasks: ["code-review"], consumed: false,
  createdAt: challengeCreatedAt, expiresAt: challengeExpiresAt,
}));
r = await call("/ekyc/self/webhook", {
  principalId: p + "-2", raw, svixHeaders: mkHeaders("msg-2", raw),
  sessionId: "vs_self_1", externalId: "opaque-self-1",
  scopeId: "owned", tasks: ["code-review"],
  challengeCreatedAt, challengeExpiresAt,
});
assert.equal(r.status, 403, JSON.stringify(r));
assert.equal(r.json.error, "duplicate-person-rejected");

console.log("self-route ekyc e2e: approval chain, nullifier dedupe passed");
