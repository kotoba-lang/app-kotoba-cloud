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

function cd(s) {
  const w = [7, 3, 1]; let acc = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const v = (c >= "0" && c <= "9") ? +c : (c >= "A" && c <= "Z" ? c.charCodeAt(0) - 55 : 0);
    acc += v * w[i % 3];
  }
  return String(acc % 10);
}
// TD3 per icao.cljk's layout: line2[0:5] filler, [5:14] doc, [14] cd,
// [15:22] birth(7), [22] cd, [23:30] expiry(7), [30] cd, [31:42] personal(11),
// [42] personal cd, [43] composite cd.
const line1 = "P<JPNKAWASAKI<<JUN" + "<".repeat(26);
const docNum = "TK1234567", b7 = "1900101", e7 = "1310101", personal = "M1808114JPN";
const line2 = "<<<<<" + docNum + cd(docNum) + b7 + cd(b7) + e7 + cd(e7) + personal + cd(personal)
  + cd(docNum + cd(docNum) + b7 + cd(b7) + e7 + cd(e7) + personal + cd(personal));
if (line1.length !== 44 || line2.length !== 44) throw new Error("MRZ length " + line1.length + "/" + line2.length);
const dg1 = Buffer.from("5PGD1" + line1 + line2);  // 5-char LDS header + 2x44 MRZ  // 5-byte LDS header + MRZ
const dg11 = Buffer.from("DG11-ATTRS-FIXTURE");
const dg12 = Buffer.from("DG12-ATTRS-FIXTURE");
const dg5 = Buffer.from("DG5-PORTRAIT-FIXTURE");

// SOD digestedList entries carry the REAL DG number (ICAO LDS numbering:
// DG1 MRZ, DG5 portrait, DG11/12 attributes) — not a positional index.
const dgNumbers = [1, 11, 12, 5];
const entries = [dg1, dg11, dg12, dg5].map((dg, i) =>
  SEQ(Buffer.concat([INT(Buffer.from([dgNumbers[i]])), OCT(sha256(dg))])));
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
  SEQ(Buffer.concat([OID("06 09 2a 86 48 86 f7 0d 01 09 01"), CTX0(OCT(ldsTable))])),
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
console.error("E2E: calling submit");
import("node:fs").then(({default: fs}) => fs.writeFileSync("/tmp/sod-der.b64", contentInfo.toString("base64")));
let r = await call("/ekyc/kotoba-proof/submit", {
  principalId: p,
  sodDer: contentInfo.toString("base64"),
  dg1: dg1.toString("base64"),
  dg11: dg11.toString("base64"),
  dg12: dg12.toString("base64"),
  dg5: dg5.toString("base64"),
  scopeId: "owned", tasks: ["code-review"],
});
console.error("K1 RESULT:", JSON.stringify(r).slice(0, 300));
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
