// kotoba-proof e2e: synthetic issuer-signed LDS bundle -> approval chain ->
// nullifier dedupe. Fixtures only: the SOD signature verification against a
// real CSCA/DSC chain is out of fixture scope; digests + MRZ check digits are
// exercised for real.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { ResearchAuthority } from "../build/research/worker.js";

function der(tag, content) {
  if (content.length < 128) return Buffer.concat([Buffer.from([tag, content.length]), content]);
  const len = content.length;
  const bytes = [];
  let n = len;
  while (n > 0) { bytes.unshift(n & 255); n >>= 8; }
  return Buffer.concat([Buffer.from([tag, 128 | bytes.length]), Buffer.from(bytes), content]);
}
const INT = b => der(0x02, b);
const OCT = b => der(0x04, b);
const SEQ = b => der(0x30, b);
const CTX0 = b => der(0xA0, b);
const OID = hex => Buffer.from(hex.replace(/ /g, ""), "hex");
const sha256 = b => crypto.createHash("sha256").update(b).digest();

const line1 = "P<JPNKAWASAKI<<JUN<<<<<<<<<<<<<<<<<<<<<<<<<<<";
const cd = (s) => { const w=[7,3,1]; let acc=0; for (let i2=0;i2<s.length;i2++){ const c=s[i2]; const v = (c>="0"&&c<="9")? +c : (c>="A"&&c<="Z"? c.charCodeAt(0)-55 : 0); acc += v*w[i2%3]; } return String(acc%10); };
const docNum="TK1234567", birth="900101", expiry="310101", personal="M1808114JPN12KAWASAKI<<JUN<<<<";
const line2 = docNum+cd(docNum)+birth+cd(birth)+expiry+cd(expiry)+personal+cd(personal+docNum+cd(docNum)+birth+cd(birth)+expiry+cd(expiry));
const dg1 = Buffer.from("5" + "P" + line1 + line2);  // 5-byte LDS header + MRZ
const dg11 = Buffer.from("DG11-ATTRS-FIXTURE");
const dg12 = Buffer.from("DG12-ATTRS-FIXTURE");
const dg5 = Buffer.from("DG5-PORTRAIT-FIXTURE");

const entries = [dg1, dg11, dg12, dg5].map((dg, i) =>
  SEQ(Buffer.concat([INT(Buffer.from([i + 1])), OCT(sha256(dg))])));
const digestedList = SEQ(Buffer.concat(entries));
const ldsTable = SEQ(Buffer.concat([
  INT(Buffer.from([0])),
  SEQ(OID("06 09 60 86 48 01 65 03 04 02 01")),  // sha256 OID
  OCT(Buffer.from("JPN")),
  digestedList,
]));
const signedData = SEQ(Buffer.concat([
  INT(Buffer.from([1])),
  SEQ(OID("06 09 60 86 48 01 65 03 04 02 01")),
  SEQ(Buffer.concat([OID("06 0a 2a 86 48 86 f7 0d 01 09 01"), CTX0(OCT(ldsTable))])),
]));
const contentInfo = SEQ(Buffer.concat([OID("06 09 2a 86 48 86 f7 0d 01 07 02"), CTX0(signedData)]));

class MockStorage {
  constructor() { this.map = new Map(); }
  async get(k) { return this.map.get(k); }
  async put(k, v) { this.map.set(k, String(v)); }
}

const now = Date.now();
const env = {
  NULLIFIER_KEY: "test-nullifier-key-0123456789abcdef",
  RESEARCH_OPERATOR_SECRET: "test-operator-secret-0123456789abcdef",
};
const p = "urn:kotoba:principal:kotoba-proof-0001";

const state = { storage: new MockStorage(), waitUntil() {}, blockConcurrencyWhile(fn) { return fn(); } };
const auth = new ResearchAuthority(state, env);
const call = (path, body) =>
  auth.fetch(new Request(`https://research.internal${path}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })).then(r => r.json().then(j => ({ status: r.status, json: j })));

// Seed the challenge as /ekyc/start would.
await state.storage.put("ekyc:" + p, JSON.stringify({
  sessionId: "kp-1", externalId: "opaque-kp-1", principal: p,
  scopeId: "owned", tasks: ["code-review"], consumed: false,
  createdAt: now - 1000, expiresAt: now + 900000,
}));

// K1. valid chip evidence -> full approval chain
let r = await call("/ekyc/kotoba-proof/submit", {
  principalId: p,
  sodDer: contentInfo.toString("base64"),
  dg1: dg1.toString("base64"),
  dg11: dg11.toString("base64"),
  dg12: dg12.toString("base64"),
  dg5: dg5.toString("base64"),
  scopeId: "owned", tasks: ["code-review"],
});
assert.equal(r.status, 200, JSON.stringify(r));
assert.equal(r.json.provider, "kotoba-proof");
assert.equal(r.json.trust, 80);
assert.equal(r.json.status, "active");

// K2. status endpoint reflects the record
r = await call("/status", { principalId: p, sessionRef: "kp-ref" });
assert.ok(r.json.ekyc, JSON.stringify(r));
assert.equal(r.json.ekyc.status, "verified");

// K3. duplicate-person: same SOD (same document number) different principal -> 403
const p2 = "urn:kotoba:principal:kotoba-proof-0002";
await state.storage.put("ekyc:" + p2, JSON.stringify({
  sessionId: "kp-2", externalId: "opaque-kp-2", principal: p2,
  scopeId: "owned", tasks: ["code-review"], consumed: false,
  createdAt: now - 1000, expiresAt: now + 900000,
}));
r = await call("/ekyc/kotoba-proof/submit", {
  principalId: p2,
  sodDer: contentInfo.toString("base64"),
  dg1: dg1.toString("base64"),
  dg11: dg11.toString("base64"),
  dg12: dg12.toString("base64"),
  dg5: dg5.toString("base64"),
  scopeId: "owned", tasks: ["code-review"],
});
assert.equal(r.status, 403, JSON.stringify(r));
assert.equal(r.json.error, "duplicate-person-rejected");

// K4. tampered DG digest -> chip-evidence-not-admissible
const tampered = Buffer.from("DG1-MRZ-CONTENT-TAMPERED");
r = await call("/ekyc/kotoba-proof/submit", {
  principalId: "urn:kotoba:principal:kotoba-proof-0003",
  sodDer: contentInfo.toString("base64"),
  dg1: tampered.toString("base64"),
  dg11: dg11.toString("base64"),
  dg12: dg12.toString("base64"),
  dg5: dg5.toString("base64"),
  scopeId: "owned", tasks: ["code-review"],
});
assert.equal(r.status, 403, JSON.stringify(r));
assert.equal(r.json.error, "chip-evidence-not-admissible");

console.log("kotoba-proof e2e: icao digests, approval chain, nullifier dedupe, tamper reject passed");
