import assert from "node:assert/strict";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import { route } from "../build/worker.js";

const calls = [];
let upstreamStatus = 200;
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), headers: new Headers(init?.headers), body: init?.body });
  if (String(url).includes("ipns.publish")) {
    return new Response(JSON.stringify({ status: "ok", name: "k51demo" }), {
      status: upstreamStatus, headers: { "content-type": "application/json" }
    });
  }
  if (upstreamStatus !== 200) return new Response("upstream unavailable", { status: upstreamStatus });
  return new Response(JSON.stringify({
    valid: true, handle: "did:key:legacy",
    principalId: "urn:kotoba:principal:018f4d6c-29bf-7f80-9a21-111111111111",
    accountDid: "did:web:kotoba.cloud:tenant:u_01",
    activeDid: "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK"
  }), { status: 200, headers: { "content-type": "application/json" } });
};

const bindings = new Map();
const env = { PQ_KEY_REGISTRY: {
  idFromName: (principal) => principal,
  get: (principal) => ({ fetch: async (_url, init) => {
    const proposed = JSON.parse(init.body);
    const current = bindings.get(principal);
    if (!current) {
      bindings.set(principal, { keyId: proposed.keyId, publicKey: proposed.publicKey,
        epoch: 1, status: "active", used: new Set([proposed.requestId]) });
      return Response.json({ ok: true, binding: "enrolled", epoch: 1, status: "active" });
    }
    if (current.status !== "active") {
      return Response.json({ ok: false, reason: "pqc-key-revoked" }, { status: 409 });
    }
    if (current.epoch !== proposed.keyEpoch) {
      return Response.json({ ok: false, reason: "pqc-key-epoch-mismatch" }, { status: 409 });
    }
    if (current.keyId === proposed.keyId && current.publicKey === proposed.publicKey) {
      if (current.used.has(proposed.requestId)) {
        return Response.json({ ok: false, reason: "pqc-request-replayed" }, { status: 409 });
      }
      current.used.add(proposed.requestId);
      return Response.json({ ok: true, binding: "matched", epoch: current.epoch,
        status: current.status });
    }
    return Response.json({ ok: false, reason: "pqc-key-mismatch" }, { status: 409 });
  }})
}};

const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
const hex = (bytes) => Buffer.from(bytes).toString("hex");
async function approve(publication, seedByte) {
  const keys = ml_dsa65.keygen(new Uint8Array(32).fill(seedByte));
  const payload = {
    expiresAt: publication.expiresAt, issuedAt: publication.issuedAt,
    ipnsName: publication.ipnsName, namespace: publication.namespace,
    keyEpoch: publication.keyEpoch, publisher: publication.publisher,
    purpose: "library-publish",
    recordCid: publication.recordCid, releaseCid: publication.releaseCid,
    requestId: publication.requestId, schema: publication.schema,
    signedRecord: publication.signedRecord,
    storageOrigin: publication.storageOrigin
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return {
    suite: "passkey+ml-dsa-65", payload: b64url(bytes), publicKey: b64url(keys.publicKey),
    keyId: `sha256:${hex(await crypto.subtle.digest("SHA-256", keys.publicKey))}`,
    signature: b64url(ml_dsa65.sign(bytes, keys.secretKey))
  };
}

const signedIn = await route(new Request("https://kotoba.cloud/v1/session", {
  headers: { cookie: "other=1; gftd_session=abc==; another=2" }
}), env);
const payload = await signedIn.json();
assert.equal(calls.length, 1);
assert.equal(calls[0].url, "https://auth.kotoba.cloud/v1/session");
assert.equal(calls[0].headers.get("cookie"), "gftd_session=abc==");
assert.equal(calls[0].headers.get("cookie").includes("other"), false);
assert.equal(payload.valid, true);
assert.equal(payload.username, "kotoba-21111111111111");
assert.equal(payload.principalId, "urn:kotoba:principal:018f4d6c-29bf-7f80-9a21-111111111111");
assert.equal(payload.activeDid, "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK");
assert.equal(signedIn.headers.get("cache-control"), "no-store, private");

upstreamStatus = 503;
const failedUpstream = await route(new Request("https://kotoba.cloud/v1/session", {
  headers: { cookie: "gftd_session=still-secret" }
}), env);
assert.deepEqual(await failedUpstream.json(), { valid: false });
assert.equal(calls.length, 2, "upstream failure is observed and fails closed");
const anonymous = await route(new Request("https://kotoba.cloud/v1/session"), env);
assert.deepEqual(await anonymous.json(), { valid: false });
assert.equal(calls.length, 2, "no cookie must not trigger an upstream request");

const signIn = await route(new Request("https://kotoba.cloud/sign-in?return_to=https%3A%2F%2Fkotoba.cloud%2F"), env);
assert.equal(signIn.status, 302);
assert.equal(signIn.headers.get("location"),
  "https://auth.kotoba.cloud/sign-in?return_to=https%3A%2F%2Fkotoba.cloud%2F");
assert.equal(calls.length, 2, "apex sign-in redirect does not call the session viewer");

const login = await route(new Request("https://console.kotoba.cloud/login"), env);
assert.equal(login.status, 302);
assert.equal(login.headers.get("location"), "https://auth.kotoba.cloud/sign-in");
assert.equal(login.headers.get("location").includes("auth.kotobase.net"), false);

upstreamStatus = 200;
const publication = {
  schema: "https://kotoba.cloud/schemas/library-publication-request/v3",
  requestId: crypto.randomUUID(), keyEpoch: 1,
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  namespace: "demo", releaseCid: "bafyRelease", recordCid: "bafyRecord",
  publisher: "did:key:zDemo", ipnsName: "k51demo", storageOrigin: "https://kotobase.net",
  signedRecord: {
    name: "k51demo", value: "bafyRecord", sequence: 3,
    valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), ttl_secs: 3600,
    controller_did: "did:key:zDemo", public_key_multibase: "did:key:zDemo",
    signature_multibase: "zSignature"
  }
};
publication.pqcApproval = await approve(publication, 7);
const kotobaseCalls = () => calls.filter((call) => call.url.includes("ipns.publish")).length;

const noApproval = structuredClone(publication);
delete noApproval.pqcApproval;
const rejectedNoApproval = await route(new Request("https://kotoba.cloud/v1/libraries/publish", {
  method: "POST", headers: { origin: "https://kotoba.cloud", "content-type": "application/json",
    cookie: "gftd_session=publish-session" }, body: JSON.stringify(noApproval)
}), env);
assert.equal(rejectedNoApproval.status, 400);
assert.equal(kotobaseCalls(), 0, "classical-only approval never reaches Kotobase");

const expired = structuredClone(publication);
expired.requestId = crypto.randomUUID();
expired.issuedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
expired.expiresAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
expired.pqcApproval = await approve(expired, 7);
const rejectedExpired = await route(new Request("https://kotoba.cloud/v1/libraries/publish", {
  method: "POST", headers: { origin: "https://kotoba.cloud", "content-type": "application/json",
    cookie: "gftd_session=publish-session" }, body: JSON.stringify(expired)
}), env);
assert.equal(rejectedExpired.status, 400);
assert.equal(kotobaseCalls(), 0, "expired approval never reaches Kotobase");

const unauthenticatedPublish = await route(new Request("https://kotoba.cloud/v1/libraries/publish", {
  method: "POST", headers: { origin: "https://kotoba.cloud", "content-type": "application/json" },
  body: JSON.stringify(publication)
}), env);
assert.equal(unauthenticatedPublish.status, 401);
assert.equal(kotobaseCalls(), 0, "anonymous publish never reaches Kotobase");

const published = await route(new Request("https://kotoba.cloud/v1/libraries/publish", {
  method: "POST", headers: { origin: "https://kotoba.cloud", "content-type": "application/json",
    cookie: "other=1; gftd_session=publish-session" }, body: JSON.stringify(publication)
}), env);
assert.equal(published.status, 200);
const receipt = await published.json();
assert.equal(receipt.ok, true);
assert.equal(receipt.pqcVerified, true);
assert.equal(receipt.pqcSuite, "passkey+ml-dsa-65");
assert.equal(receipt.pqcKeyBinding, "enrolled");
assert.equal(receipt.pqcKeyEpoch, 1);
assert.equal(receipt.requestId, publication.requestId);
const publishCall = calls.find((call) => call.url.includes("ipns.publish"));
assert.ok(publishCall, "doubly approved signed head is relayed to Kotobase");
assert.equal(publishCall.headers.get("cookie"), null, "Passkey cookie never leaves kotoba.cloud");
assert.equal(publishCall.headers.get("authorization"), null, "relay adds no ambient server credential");
assert.equal(JSON.parse(publishCall.body).signature_multibase, "zSignature");

const replayed = await route(new Request("https://kotoba.cloud/v1/libraries/publish", {
  method: "POST", headers: { origin: "https://kotoba.cloud", "content-type": "application/json",
  cookie: "gftd_session=publish-session" }, body: JSON.stringify(publication)
}), env);
assert.equal(replayed.status, 409);
assert.equal((await replayed.json()).error, "pqc-request-replayed");
assert.equal(kotobaseCalls(), 1, "replayed approval is rejected before Kotobase");

const nextPublication = structuredClone(publication);
nextPublication.requestId = crypto.randomUUID();
nextPublication.issuedAt = new Date().toISOString();
nextPublication.expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
nextPublication.pqcApproval = await approve(nextPublication, 7);
const matched = await route(new Request("https://kotoba.cloud/v1/libraries/publish", {
  method: "POST", headers: { origin: "https://kotoba.cloud", "content-type": "application/json",
  cookie: "gftd_session=publish-session" }, body: JSON.stringify(nextPublication)
}), env);
assert.equal((await matched.json()).pqcKeyBinding, "matched");
const beforeRejected = kotobaseCalls();

const oldEpoch = structuredClone(publication);
oldEpoch.requestId = crypto.randomUUID();
oldEpoch.keyEpoch = 2;
oldEpoch.issuedAt = new Date().toISOString();
oldEpoch.expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
oldEpoch.pqcApproval = await approve(oldEpoch, 7);
const rejectedOldEpoch = await route(new Request("https://kotoba.cloud/v1/libraries/publish", {
  method: "POST", headers: { origin: "https://kotoba.cloud", "content-type": "application/json",
    cookie: "gftd_session=publish-session" }, body: JSON.stringify(oldEpoch)
}), env);
assert.equal(rejectedOldEpoch.status, 409);
assert.equal((await rejectedOldEpoch.json()).error, "pqc-key-epoch-mismatch");
assert.equal(kotobaseCalls(), beforeRejected, "wrong PQ key epoch is rejected before Kotobase");

const tampered = structuredClone(publication);
tampered.recordCid = "bafyOther";
const rejectedTamper = await route(new Request("https://kotoba.cloud/v1/libraries/publish", {
  method: "POST", headers: { origin: "https://kotoba.cloud", "content-type": "application/json",
    cookie: "gftd_session=publish-session" }, body: JSON.stringify(tampered)
}), env);
assert.equal(rejectedTamper.status, 400);
assert.equal(kotobaseCalls(), beforeRejected, "tampering is rejected before Kotobase");

const badSignature = structuredClone(publication);
badSignature.pqcApproval.signature = `${badSignature.pqcApproval.signature.slice(0, -1)}A`;
const rejectedSignature = await route(new Request("https://kotoba.cloud/v1/libraries/publish", {
  method: "POST", headers: { origin: "https://kotoba.cloud", "content-type": "application/json",
    cookie: "gftd_session=publish-session" }, body: JSON.stringify(badSignature)
}), env);
assert.equal(rejectedSignature.status, 400);
assert.equal(kotobaseCalls(), beforeRejected, "bad ML-DSA signature is rejected before Kotobase");

const replacement = structuredClone(publication);
replacement.requestId = crypto.randomUUID();
replacement.issuedAt = new Date().toISOString();
replacement.expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
replacement.pqcApproval = await approve(replacement, 8);
const rejectedReplacement = await route(new Request("https://kotoba.cloud/v1/libraries/publish", {
  method: "POST", headers: { origin: "https://kotoba.cloud", "content-type": "application/json",
    cookie: "gftd_session=publish-session" }, body: JSON.stringify(replacement)
}), env);
assert.equal(rejectedReplacement.status, 409);
assert.equal(kotobaseCalls(), beforeRejected, "a Passkey session cannot replace the pinned PQ key");

console.log("worker Passkey + principal-pinned ML-DSA publication smoke passed");
