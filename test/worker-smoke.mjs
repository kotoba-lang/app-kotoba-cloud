import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import { route, resetFunnelStore } from "../build/worker.js";

const calls = [];
let upstreamStatus = 200;
const BOOT_CID = "bafkreifk2gpt4b2z5criansz5dj26pdrpv5pii7qt6jyqtaan564lamkqq";
const BOOT_BYTES = 744448;
let bootStoredSize = BOOT_BYTES;
const bootReads = [];
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
const env = { PUBLIC_BLOCKS: {
  get: async (key) => {
    bootReads.push(key);
    if (key !== `ipld/${BOOT_CID}` || upstreamStatus !== 200) return null;
    return { size: bootStoredSize, body: new Blob([new Uint8Array(BOOT_BYTES)]).stream() };
  }
}, PQ_KEY_REGISTRY: {
  idFromName: (principal) => principal,
  get: (principal) => ({ fetch: async (url, init) => {
    const proposed = JSON.parse(init.body);
    const current = bindings.get(principal);
    if (String(url).endsWith("/rotate") || String(url).endsWith("/revoke")) {
      if (!current) return Response.json({ ok: false, reason: "pqc-rotation-invalid" }, { status: 409 });
      if (current.transitions.has(proposed.transitionId)) {
        return Response.json({ ok: false, reason: "pqc-transition-replayed" }, { status: 409 });
      }
      if (current.status !== "active") {
        return Response.json({ ok: false, reason: "pqc-key-revoked" }, { status: 409 });
      }
      if (current.keyId !== proposed.currentKeyId) {
        return Response.json({ ok: false, reason: "pqc-key-mismatch" }, { status: 409 });
      }
      if (current.epoch !== proposed.expectedEpoch) {
        return Response.json({ ok: false, reason: "pqc-key-epoch-mismatch" }, { status: 409 });
      }
      current.transitions.add(proposed.transitionId);
      const previousEpoch = current.epoch;
      const previousKeyId = current.keyId;
      if (String(url).endsWith("/rotate")) {
        current.epoch += 1;
        current.keyId = proposed.nextKeyId;
        current.publicKey = proposed.nextPublicKey;
        return Response.json({ ok: true, binding: "rotated", previousEpoch,
          epoch: current.epoch, status: "active", previousKeyId, keyId: current.keyId,
          transitionId: proposed.transitionId });
      }
      current.status = "revoked";
      return Response.json({ ok: true, binding: "revoked", previousEpoch,
        epoch: current.epoch, status: "revoked", previousKeyId, keyId: current.keyId,
        transitionId: proposed.transitionId });
    }
    if (!current) {
      bindings.set(principal, { keyId: proposed.keyId, publicKey: proposed.publicKey,
        epoch: 1, status: "active", used: new Set([proposed.requestId]), transitions: new Set() });
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

async function approveTransition(transition, seedByte) {
  const keys = ml_dsa65.keygen(new Uint8Array(32).fill(seedByte));
  const payload = {
    action: transition.action,
    currentKeyId: transition.currentKeyId,
    expectedEpoch: transition.expectedEpoch,
    expiresAt: transition.expiresAt,
    issuedAt: transition.issuedAt,
    ...(transition.nextKeyId ? { nextKeyId: transition.nextKeyId } : {}),
    purpose: "pq-key-transition",
    schema: transition.schema,
    transitionId: transition.transitionId
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
  publisher: "did:key:zDemo", ipnsName: "k51demo", storageOrigin: "https://api.kotoba.cloud",
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

const transitionBase = {
  schema: "https://kotoba.cloud/schemas/pq-key-transition-request/v1",
  transitionId: crypto.randomUUID(), issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  action: "rotate", expectedEpoch: 1,
  currentKeyId: publication.pqcApproval.keyId
};
const nextApprovalDraft = await approveTransition({ ...transitionBase, nextKeyId: "pending" }, 8);
const rotation = { ...transitionBase, nextKeyId: nextApprovalDraft.keyId };
rotation.currentApproval = await approveTransition(rotation, 7);
rotation.nextApproval = await approveTransition(rotation, 8);

const incompleteRotation = structuredClone(rotation);
delete incompleteRotation.nextApproval;
const rejectedIncompleteRotation = await route(new Request("https://kotoba.cloud/v1/pq-keys/rotate", {
  method: "POST", headers: { origin: "https://kotoba.cloud", "content-type": "application/json",
    cookie: "gftd_session=publish-session" }, body: JSON.stringify(incompleteRotation)
}), env);
assert.equal(rejectedIncompleteRotation.status, 400);

const differentBytesRotation = structuredClone(rotation);
const reorderedPayload = {
  transitionId: rotation.transitionId, schema: rotation.schema,
  purpose: "pq-key-transition", nextKeyId: rotation.nextKeyId,
  issuedAt: rotation.issuedAt, expiresAt: rotation.expiresAt,
  expectedEpoch: rotation.expectedEpoch, currentKeyId: rotation.currentKeyId,
  action: rotation.action
};
const reorderedBytes = new TextEncoder().encode(JSON.stringify(reorderedPayload));
const nextKeys = ml_dsa65.keygen(new Uint8Array(32).fill(8));
differentBytesRotation.nextApproval.payload = b64url(reorderedBytes);
differentBytesRotation.nextApproval.signature = b64url(ml_dsa65.sign(reorderedBytes, nextKeys.secretKey));
const rejectedDifferentBytes = await route(new Request("https://kotoba.cloud/v1/pq-keys/rotate", {
  method: "POST", headers: { origin: "https://kotoba.cloud", "content-type": "application/json",
    cookie: "gftd_session=publish-session" }, body: JSON.stringify(differentBytesRotation)
}), env);
assert.equal(rejectedDifferentBytes.status, 400);
assert.equal((await rejectedDifferentBytes.json()).error, "pqc-transition-bytes-mismatch");

const rotatedResponse = await route(new Request("https://kotoba.cloud/v1/pq-keys/rotate", {
  method: "POST", headers: { origin: "https://kotoba.cloud", "content-type": "application/json",
    cookie: "gftd_session=publish-session" }, body: JSON.stringify(rotation)
}), env);
assert.equal(rotatedResponse.status, 200);
const rotationReceipt = await rotatedResponse.json();
assert.equal(rotationReceipt.schema, "https://kotoba.cloud/schemas/pq-key-transition-receipt/v1");
assert.equal(rotationReceipt.previousEpoch, 1);
assert.equal(rotationReceipt.epoch, 2);
assert.equal(rotationReceipt.currentApprovalVerified, true);
assert.equal(rotationReceipt.nextApprovalVerified, true);

const replayedRotation = await route(new Request("https://kotoba.cloud/v1/pq-keys/rotate", {
  method: "POST", headers: { origin: "https://kotoba.cloud", "content-type": "application/json",
    cookie: "gftd_session=publish-session" }, body: JSON.stringify(rotation)
}), env);
assert.equal(replayedRotation.status, 409);
assert.equal((await replayedRotation.json()).error, "pqc-transition-replayed");

const newKeyPublication = structuredClone(publication);
newKeyPublication.requestId = crypto.randomUUID();
newKeyPublication.keyEpoch = 2;
newKeyPublication.issuedAt = new Date().toISOString();
newKeyPublication.expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
newKeyPublication.pqcApproval = await approve(newKeyPublication, 8);
const newKeyPublished = await route(new Request("https://kotoba.cloud/v1/libraries/publish", {
  method: "POST", headers: { origin: "https://kotoba.cloud", "content-type": "application/json",
    cookie: "gftd_session=publish-session" }, body: JSON.stringify(newKeyPublication)
}), env);
assert.equal(newKeyPublished.status, 200);
assert.equal((await newKeyPublished.json()).pqcKeyEpoch, 2);

const revocation = {
  schema: transitionBase.schema, transitionId: crypto.randomUUID(),
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  action: "revoke", expectedEpoch: 2, currentKeyId: rotation.nextKeyId
};
revocation.currentApproval = await approveTransition(revocation, 8);
const revokedResponse = await route(new Request("https://kotoba.cloud/v1/pq-keys/revoke", {
  method: "POST", headers: { origin: "https://kotoba.cloud", "content-type": "application/json",
    cookie: "gftd_session=publish-session" }, body: JSON.stringify(revocation)
}), env);
assert.equal(revokedResponse.status, 200);
assert.equal((await revokedResponse.json()).status, "revoked");

const replayedRevocation = await route(new Request("https://kotoba.cloud/v1/pq-keys/revoke", {
  method: "POST", headers: { origin: "https://kotoba.cloud", "content-type": "application/json",
    cookie: "gftd_session=publish-session" }, body: JSON.stringify(revocation)
}), env);
assert.equal(replayedRevocation.status, 409);
assert.equal((await replayedRevocation.json()).error, "pqc-transition-replayed");

const afterRevocation = structuredClone(newKeyPublication);
afterRevocation.requestId = crypto.randomUUID();
afterRevocation.issuedAt = new Date().toISOString();
afterRevocation.expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
afterRevocation.pqcApproval = await approve(afterRevocation, 8);
const rejectedAfterRevocation = await route(new Request("https://kotoba.cloud/v1/libraries/publish", {
  method: "POST", headers: { origin: "https://kotoba.cloud", "content-type": "application/json",
    cookie: "gftd_session=publish-session" }, body: JSON.stringify(afterRevocation)
}), env);
assert.equal(rejectedAfterRevocation.status, 409);
assert.equal((await rejectedAfterRevocation.json()).error, "pqc-key-revoked");

upstreamStatus = 200;
const bootCallCount = () => bootReads.length;
const bootCatalogResponse = await route(
  new Request("https://boot.kotoba.cloud/.well-known/aiueos-boot.json"), env);
assert.equal(bootCatalogResponse.status, 200);
assert.equal(bootCatalogResponse.headers.get("cache-control"),
  "public, max-age=60, must-revalidate");
const bootCatalog = await bootCatalogResponse.json();
assert.equal(bootCatalog.status, "candidate");
assert.equal(bootCatalog.qualification.physicalK16, "unverified");
assert.equal(bootCatalog.qualification.internalDiskWrites, false);
assert.equal(bootCatalog.bootstrap.url,
  "https://boot.kotoba.cloud/aiueos/x86_64/gmktec-k16/bootstrap/v1.efi");

const bootGet = await route(new Request(
  "https://boot.kotoba.cloud/aiueos/x86_64/gmktec-k16/bootstrap/v1.efi"), env);
assert.equal(bootGet.status, 200);
assert.equal((await bootGet.arrayBuffer()).byteLength, BOOT_BYTES);
assert.equal(bootGet.headers.get("content-length"), String(BOOT_BYTES));
assert.equal(bootGet.headers.get("cache-control"), "public, max-age=31536000, immutable");
assert.equal(bootGet.headers.get("x-aiueos-cid"),
  "bafkreifk2gpt4b2z5criansz5dj26pdrpv5pii7qt6jyqtaan564lamkqq");
assert.equal(bootGet.headers.get("digest"),
  "sha-256=qtGfPgdZ6KKANlno0688cX169CPwn5OITABvfcWBioQ=");

const bootHead = await route(new Request(
  "https://boot.kotoba.cloud/aiueos/x86_64/gmktec-k16/bootstrap/v1.efi",
  { method: "HEAD" }), env);
assert.equal(bootHead.status, 200);
assert.equal(await bootHead.text(), "");
assert.equal(bootHead.headers.get("content-length"), String(BOOT_BYTES));

const callsBeforeRange = bootCallCount();
const bootRange = await route(new Request(
  "https://boot.kotoba.cloud/aiueos/x86_64/gmktec-k16/bootstrap/v1.efi",
  { headers: { range: "bytes=0-1" } }), env);
assert.equal(bootRange.status, 416);
assert.equal(bootCallCount(), callsBeforeRange, "unsupported ranges never reach immutable storage");

bootStoredSize = 1;
const bootWrongLength = await route(new Request(
  "https://boot.kotoba.cloud/aiueos/x86_64/gmktec-k16/bootstrap/v1.efi"), env);
assert.equal(bootWrongLength.status, 502);
assert.equal((await bootWrongLength.json()).error, "immutable-bootstrap-unavailable");
bootStoredSize = BOOT_BYTES;

const bootPost = await route(new Request(
  "https://boot.kotoba.cloud/aiueos/x86_64/gmktec-k16/bootstrap/v1.efi",
  { method: "POST" }), env);
assert.equal(bootPost.status, 405);
const bootUnknown = await route(new Request("https://boot.kotoba.cloud/unknown"), env);
assert.equal(bootUnknown.status, 404);

const assetReads = [];
env.ASSETS = {
  fetch: async (request) => {
    assetReads.push(String(request.url));
    return new Response("<html lang=\"en\">home</html>", {
      status: 200, headers: { "content-type": "text/html; charset=utf-8" }
    });
  }
};

const beforeAssets = assetReads.length;
const idFromHeader = await route(new Request("https://kotoba.cloud/?utm=1", {
  headers: { "accept-language": "id,en;q=0.8" }
}), env);
assert.equal(idFromHeader.status, 302);
assert.equal(idFromHeader.headers.get("location"), "/id/?utm=1");
assert.equal(idFromHeader.headers.get("cache-control"), "private, no-store");
assert.equal(assetReads.length, beforeAssets, "locale redirect happens before Static Assets HIT");

const idFromCountry = await route(new Request("https://kotoba.cloud/", {
  headers: { "cf-ipcountry": "ID" }
}), env);
assert.equal(idFromCountry.headers.get("location"), "/id/");
assert.notEqual(idFromCountry.headers.get("location"), "/jv/");
assert.notEqual(idFromCountry.headers.get("location"), "/su/");

const heFromCountry = await route(new Request("https://kotoba.cloud/", {
  headers: { "cf-ipcountry": "IL" }
}), env);
assert.equal(heFromCountry.headers.get("location"), "/he/");

const headerBeatsCountry = await route(new Request("https://kotoba.cloud/", {
  headers: { "accept-language": "en", "cf-ipcountry": "ID" }
}), env);
assert.equal(headerBeatsCountry.status, 200);
assert.equal(headerBeatsCountry.headers.get("location"), null);

const cookieBeatsCountry = await route(new Request("https://kotoba.cloud/", {
  headers: { cookie: "kb_locale=jv", "cf-ipcountry": "ID" }
}), env);
assert.equal(cookieBeatsCountry.headers.get("location"), "/jv/");

const pathWins = await route(new Request("https://kotoba.cloud/su/", {
  headers: { cookie: "kb_locale=he", "accept-language": "it", "cf-ipcountry": "IL" }
}), env);
assert.equal(pathWins.status, 200);
assert.equal(pathWins.headers.get("location"), null);
assert.match(pathWins.headers.get("set-cookie") || "", /^kb_locale=su;/);

assert(headerBeatsCountry.headers.get("content-security-policy").includes("connect-src 'self' https://api.kotoba.cloud"));
assert(pathWins.headers.get("content-security-policy").includes("connect-src 'self' https://api.kotoba.cloud"));

const sessionUntouched = await route(new Request("https://kotoba.cloud/v1/session"), env);
assert.equal(sessionUntouched.status, 200);
assert.equal(sessionUntouched.headers.get("location"), null);

const funnelUntouched = await route(new Request("https://kotoba.cloud/api/funnel"), env);
assert.equal(funnelUntouched.status, 200);
assert.equal(funnelUntouched.headers.get("location"), null);

console.log("worker Passkey/PQ publication, AIUEOS boot, and origin locale negotiate smoke passed");

// Research gateway: these tests qualify edge admission only, not a real provider.
upstreamStatus = 200;
const researchPrincipal = "urn:kotoba:principal:018f4d6c-29bf-7f80-9a21-111111111111";
const researchModel = "qwen3.8-flash-next-whitehacker";
const researchPolicy = "whitehat-2026-09-12-v1";
const researchBody = { model: researchModel, task: "code-review", scopeId: "owned-code",
  max_tokens: 512, messages: [{ role: "user", content: "Review my authorization checks." }] };
const researchCalls = [];
const researchNow = Date.now();
const researchSessionRef = createHash('sha256').update(JSON.stringify(['kotoba-research-session-v1', 'https://kotoba.cloud', researchPrincipal, 'research-session'])).digest('hex');
let researchRecord = { principalId: researchPrincipal, policyVersion: researchPolicy, status: "active",
  continuous: { policyVersion: "kotoba-session-evidence-2026-09-v1", sessionRef: researchSessionRef, action: 'code-review', decision: 'allow',
    opinion: { belief: .9, disbelief: 0, uncertainty: .1, calibrated: false }, evaluatedAt: researchNow, expiresAt: researchNow + 15000 },
  trust: { policyVersion: "kotoba-trust-routes-2026-09-v1", score: 60, routes: ["web-reviewed"], evaluatedAt: researchNow, expiresAt: researchNow + 60000 },
  ekyc: { status: "verified", evidenceRef: "private-evidence", verifiedAt: researchNow - 1000, expiresAt: researchNow + 60000 },
  screening: { status: "clear", evidenceRef: "private-screen", checkedAt: researchNow - 1000, expiresAt: researchNow + 60000 },
  scopes: [{ id: "owned-code", status: "approved", tasks: ["code-review"], expiresAt: researchNow + 60000 }] };
let corruptReceipt = false;
let oldTrustReceipt = false;
let exhausted = false;
const researchEnv = { ...env, RESEARCH_AUTHORITY: { fetch: async (url, init) => {
  const body = JSON.parse(init.body);
  const path = new URL(url).pathname;
  researchCalls.push({ path, body, headers: new Headers(init.headers) });
  assert.equal(new Headers(init.headers).get("cookie"), null);
  if (path === "/status") return Response.json(researchRecord);
  if (path === "/applications") return Response.json({ principalId: body.principalId, applicationId: "application-1" });
  assert.equal(path, "/complete");
  assert.equal(body.principalId, researchPrincipal);
  assert.equal(body.billing, "free-only");
  assert.equal(body.trustPolicyVersion, "kotoba-trust-routes-2026-09-v1");
  assert.equal(body.sessionPolicyVersion, "kotoba-session-evidence-2026-09-v1");
  assert.equal(body.sessionRef, researchSessionRef);
  if (exhausted) return new Response("limit", { status: 429 });
  return Response.json({ principalId: body.principalId, requestId: body.requestId,
    policyVersion: body.policyVersion, trustPolicyVersion: oldTrustReceipt ? undefined : body.trustPolicyVersion,
    sessionRef: body.sessionRef, sessionPolicyVersion: body.sessionPolicyVersion, billing: corruptReceipt ? "paid" : "free",
    policyDecision: "allowed", model: researchModel, receiptId: "audit-1", content: "Check ownership before returning the record." });
}} };
function researchRequest(path, body, headers = {}) {
  return new Request(`https://kotoba.cloud${path}`, { method: body === undefined ? "GET" : "POST",
    headers: { cookie: "gftd_session=research-session", origin: "https://kotoba.cloud", "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body) });
}
assert.equal((await route(new Request("https://kotoba.cloud/v1/research/status"), researchEnv)).status, 401);
assert.equal((await route(researchRequest("/v1/research/status"), env)).status, 503);
assert.equal((await route(researchRequest("/v1/chat/completions", researchBody, { origin: "https://evil.example" }), researchEnv)).status, 403);
assert.equal((await route(researchRequest("/v1/chat/completions", researchBody, { "content-type": "text/plain" }), researchEnv)).status, 415);
assert.equal(researchCalls.length, 0);

// Org gateway (ADR-2609141633): same-origin POST, session required; the private
// org authority owns create/delegate/revoke/status.
{
  const orgCalls = [];
  const orgEnv = { ...env, ORG_AUTHORITY: { fetch: async (url, init) => {
   orgCalls.push(new URL(url instanceof Request ? url.url : url).pathname);
   const body = JSON.parse(init && init.body ? init.body : await url.text());
    assert.equal(body.principalId, researchPrincipal);
    return Response.json({ orgDid: 'did:webvh:com-test:test.kotoba.cloud', handle: 'com-test.kotoba.cloud' });
  }}};
  assert.equal((await route(new Request('https://kotoba.cloud/v1/org/status', { method: 'POST',
    headers: { cookie: 'gftd_session=research-session' } }), orgEnv)).status, 403);
  assert.equal((await route(new Request('https://kotoba.cloud/v1/org/status', { method: 'GET',
    headers: { cookie: 'gftd_session=research-session', origin: 'https://kotoba.cloud' } }), orgEnv)).status, 405);
  assert.equal((await route(researchRequest('/v1/org/create', { handle: 'bad' }, { origin: 'https://evil.example' }), orgEnv)).status, 403);
  assert.equal((await route(researchRequest('/v1/org/create', { handle: 'com-x.kotoba.cloud', role: 'owner' }), orgEnv)).status, 200);
  assert.deepEqual(orgCalls, ['/create']);
  assert.equal((await route(new Request('https://kotoba.cloud/v1/org/create', { method: 'POST',
    headers: { origin: 'https://kotoba.cloud', 'content-type': 'application/json' },
    body: JSON.stringify({ handle: 'com-x.kotoba.cloud', role: 'owner' }) }), env)).status, 401);
}
const modelCatalog = await route(new Request("https://kotoba.cloud/v1/models"), env);
assert.equal((await modelCatalog.json()).data[0].availability, "upstream-tested-access-gated");
const eligibleStatus = await route(researchRequest("/v1/research/status"), researchEnv);
const eligibleStatusBody = await eligibleStatus.json();
assert.equal(eligibleStatusBody.status, "eligible");
assert.equal(eligibleStatusBody.trust.score, 60);
assert.deepEqual(eligibleStatusBody.trust.routes, ['web-reviewed']);
assert.equal(eligibleStatusBody.trust.evidenceRef, undefined);
assert.match(eligibleStatus.headers.get("cache-control"), /no-store/);
for (const extra of [{ principalId: "another" }, { model: "other" }, { tools: [] }, { stream: true }, { max_tokens: 9999 }]) {
  assert.equal((await route(researchRequest("/v1/chat/completions", { ...researchBody, ...extra }), researchEnv)).status, 400);
}
const beforeDenials = researchCalls.filter(c => c.path === "/complete").length;
for (const mutate of [r => { r.principalId = "another"; }, r => { r.status = "suspended"; },
  r => { r.continuous.sessionRef = 'other-session'; }, r => { r.continuous.decision = 'deny'; },
  r => { r.continuous.expiresAt = 1; }, r => { r.continuous.action = 'remediation'; },
  r => { r.ekyc.expiresAt = 1; }, r => { r.screening.status = "review"; },
  r => { r.screening.checkedAt = Date.now() - 86400001; }, r => { r.scopes = []; }]) {
  const saved = structuredClone(researchRecord);
  mutate(researchRecord);
  assert.equal((await route(researchRequest("/v1/chat/completions", researchBody), researchEnv)).status, 403);
  researchRecord = saved;
}
assert.equal(researchCalls.filter(c => c.path === "/complete").length, beforeDenials);
const researchOk = await route(researchRequest("/v1/chat/completions", researchBody), researchEnv);
assert.equal(researchOk.status, 200);
assert.equal((await researchOk.json()).billing, "free");
corruptReceipt = true;
assert.equal((await route(researchRequest("/v1/chat/completions", researchBody), researchEnv)).status, 502);
corruptReceipt = false; oldTrustReceipt = true;
assert.equal((await route(researchRequest("/v1/chat/completions", researchBody), researchEnv)).status, 502);
oldTrustReceipt = false; exhausted = true;
assert.equal((await route(researchRequest("/v1/chat/completions", researchBody), researchEnv)).status, 429);
exhausted = false;
const application = { verificationMode: "new", policyVersion: researchPolicy, purpose: "Review owned code",
  scope: "My repository", consent: true, authorizedResearch: true };
assert.equal((await route(researchRequest("/v1/research/applications", application), researchEnv)).status, 202);
assert.equal((await route(researchRequest("/v1/research/applications", { ...application, verified: true }), researchEnv)).status, 400);
assert.equal((await route(researchRequest("/v1/research/applications", { ...application, verificationMode: "reuse" }), researchEnv)).status, 400);
assert.equal((await route(researchRequest("/v1/research/applications", { ...application, verificationMode: "reuse", issuer: "trusted", reference: "existing-record" }), researchEnv)).status, 202);
const overLimitStream = new ReadableStream({ start(controller) {
  controller.enqueue(new TextEncoder().encode('"' + 'a'.repeat(100000) + '"')); controller.close();
} });
assert.equal((await route(new Request("https://kotoba.cloud/v1/chat/completions", {
  method: "POST", duplex: "half", headers: { cookie: "gftd_session=test", origin: "https://kotoba.cloud", "content-type": "application/json" },
  body: overLimitStream
}), researchEnv)).status, 413);
console.log("research gateway identity, evidence, scope, free-only receipts and streamed limits passed");
assert.equal((await route(new Request("https://kotoba.cloud/v1/chat/completions", {
  method: "POST", headers: { cookie: "gftd_session=test", origin: "https://kotoba.cloud", "content-type": "application/json" }, body: "{broken"
}), researchEnv)).status, 400);

const signinAlias = await route(new Request("https://kotoba.cloud/signin?bfcid=test123"), env);
assert.equal(signinAlias.status, 302);
assert.match(signinAlias.headers.get("location"), /^https:\/\/auth\.kotoba\.cloud\/sign-in\?/);
assert.match(signinAlias.headers.get("location"), /bfcid=test123/);

resetFunnelStore();
const emptyFunnel = await route(new Request("https://kotoba.cloud/api/funnel"), env);
assert.equal(emptyFunnel.status, 200);
const emptyPayload = await emptyFunnel.json();
assert.equal(emptyPayload.funnel.visitors, 0);
assert.equal(emptyPayload.funnel.signups, 0);
assert.equal(emptyPayload.funnel.signup_completed, 0);
assert.equal(emptyPayload.registrations, 0);
assert.equal(emptyPayload.seeded, false);
assert.equal(emptyPayload.persistence.kind, "isolate-memory");
assert.equal(emptyPayload.persistence.durable, false);
assert.match(emptyPayload.persistence.hold, /No KV or D1/);
assert.match(emptyPayload.persistence.openai_ads, /HOLD/);
assert.match(emptyPayload.labels.signups, /intent/);
assert.match(emptyPayload.labels.signup_completed, /completed/);
assert.equal(emptyPayload.labels.registrations.includes("alias"), true);
assert.equal(JSON.stringify(emptyPayload).includes("GMV"), false);
assert.equal(emptyFunnel.headers.get("content-security-policy").includes("https://freebuff.com"), true);

const health = await route(new Request("https://kotoba.cloud/health"), env);
const healthBody = await health.json();
assert.equal(healthBody.ok, true);
assert.equal(Object.hasOwn(healthBody, "registrant"), false);
assert.equal(Object.hasOwn(healthBody, "registrants"), false);

// sousa ontology: read-only schema routes (GET only, synthetic data only).
{
  const caseStatuses = await route(new Request("https://kotoba.cloud/v1/sousa/case-statuses"), env);
  assert.equal(caseStatuses.status, 200);
  const caseStatusesBody = await caseStatuses.json();
  assert.deepEqual(caseStatusesBody.statuses, ["reported", "accepted", "investigating", "referred"]);
  assert.equal(caseStatusesBody.initial, "reported");
  assert.deepEqual(caseStatusesBody.transitions.referred, []);
  assert.equal((await route(new Request("https://kotoba.cloud/v1/sousa/case-statuses", { method: "POST" }), env)).status, 405);
  const sousaSchema = await route(new Request("https://kotoba.cloud/schemas/sousa-ontology/v1"), env);
  assert.equal(sousaSchema.status, 200);
  assert.equal((await sousaSchema.json()).constSchema, "sousa-ontology/v2");
}

const visitorOnce = await route(new Request("https://kotoba.cloud/api/funnel/event", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ event: "visitor" })
}), env);
assert.equal(visitorOnce.status, 200);
const visitorOnceBody = await visitorOnce.json();
assert.equal(visitorOnceBody.ok, true);
assert.equal(visitorOnceBody.accepted, true);
assert.equal(visitorOnceBody.funnel.visitors, 1);
const funnelCookie = visitorOnce.headers.get("set-cookie");
assert.match(funnelCookie, /^kc_funnel=/);

const visitorAgain = await route(new Request("https://kotoba.cloud/api/funnel/event", {
  method: "POST",
  headers: { "content-type": "application/json", cookie: funnelCookie.split(";")[0] },
  body: JSON.stringify({ event: "visitor" })
}), env);
assert.equal((await visitorAgain.json()).accepted, false);

const signupIntent = await route(new Request("https://kotoba.cloud/api/funnel/event", {
  method: "POST",
  headers: { "content-type": "application/json", cookie: funnelCookie.split(";")[0] },
  body: JSON.stringify({ event: "signup" })
}), env);
assert.equal((await signupIntent.json()).funnel.signups, 1);

const completedAnonymous = await route(new Request("https://kotoba.cloud/api/funnel/event", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ event: "signup_completed" })
}), env);
assert.equal(completedAnonymous.status, 401);
assert.equal((await completedAnonymous.json()).error, "principal-session-required");

upstreamStatus = 200;
const completedFirst = await route(new Request("https://kotoba.cloud/v1/session", {
  headers: { cookie: "gftd_session=funnel-principal" }
}), env);
assert.equal((await completedFirst.json()).valid, true);
const afterSession = await (await route(new Request("https://kotoba.cloud/api/funnel"), env)).json();
assert.equal(afterSession.funnel.signup_completed, 1);
assert.equal(afterSession.registrations, 1);

const completedAgain = await route(new Request("https://kotoba.cloud/api/funnel/event", {
  method: "POST",
  headers: { "content-type": "application/json", cookie: "gftd_session=funnel-principal" },
  body: JSON.stringify({ event: "signup_completed" })
}), env);
assert.equal(completedAgain.status, 200);
assert.equal((await completedAgain.json()).accepted, false);
const afterDedup = await (await route(new Request("https://kotoba.cloud/api/funnel"), env)).json();
assert.equal(afterDedup.funnel.signup_completed, 1);
assert.equal(afterDedup.registrations, 1);

const unknownEvent = await route(new Request("https://kotoba.cloud/api/funnel/event", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ event: "purchase" })
}), env);
assert.equal(unknownEvent.status, 400);

const apiHostFunnel = await route(new Request("https://api.kotoba.cloud/api/funnel"), env);
assert.equal(apiHostFunnel.status, 200);

console.log("worker Passkey/PQ publication, AIUEOS boot, origin locale negotiate, and first-party funnel smoke passed");

const identityCapabilities = await route(new Request('https://kotoba.cloud/.well-known/kotoba-identity.json'), env);
assert.equal(identityCapabilities.status, 200);
// Org trust registry + membership schema ship as static well-known assets
// (ADR-2609141633); the schema keeps its subdirectory path.
const orgRegistry = await route(new Request('https://kotoba.cloud/.well-known/kotoba-org-registry.json'), env);
assert.equal(orgRegistry.status, 200);
const orgRegistryBody = await orgRegistry.json();
assert.equal(orgRegistryBody.trustSystem, 'did:webvh');
assert.equal(orgRegistryBody.membershipSchema, 'https://kotoba.cloud/.well-known/kotoba-org-membership-schema/v1.json');
assert.deepEqual(orgRegistryBody.organizations, []);
const identityProfile = await identityCapabilities.json();
assert.equal(identityProfile.provider, 'kotoba');
assert.equal(identityProfile.enrollmentEnabled, true);
assert.equal(identityProfile.zeroKnowledge, false);
assert.equal(identityProfile.defaultRoute, 'stripe-identity');
assert.equal(identityProfile.trustPolicy.weights['web-reviewed'], 60);
assert.equal(identityProfile.trustPolicy.weights['app-passport'], 80);
assert.equal(identityProfile.trustPolicy.ceiling, 100);
assert.equal(identityProfile.status, 'stripe-identity-only');

// Browser capture uses a dedicated private service; no authenticated fallback.
const intakeId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const identityCalls = [];
const identityEnv = { ...env, IDENTITY_AUTHORITY: { fetch: async (url, init) => {
  const headers = new Headers(init.headers);
  assert.equal(headers.get('x-kotoba-principal'), researchPrincipal);
  assert.equal(headers.get('cookie'), null);
  const op = new URL(url).pathname;
  identityCalls.push(op);
  assert.equal(init.redirect, 'manual');
  if (op === '/upload') {
    assert.equal(headers.get('x-kotoba-case'), intakeId);
    assert.deepEqual([...init.body], [1, 2, 3]);
    return Response.json({ receiptId: 'private:stored' });
  }
  const body = JSON.parse(init.body);
  assert.equal(body.principal, undefined);
  assert.equal(body.authenticated, undefined);
  assert.equal(body['operator-signature-verified'], undefined);
  assert.equal(body.researcherProfile, undefined);
  if (op === "/profile") {
    assert.equal(body.id, intakeId);
    return Response.json({id: intakeId, revision: 2, researcherProfile: {version: "synthetic"}, privateKey: "never-forward"});
  }
  return Response.json({ principalId: researchPrincipal, intakeEnabled: false, cases: [], reviewer: false, queue: [] });
}}};
assert.equal((await route(new Request('https://kotoba.cloud/v1/identity/status'), identityEnv)).status, 401);
assert.equal((await route(researchRequest('/v1/identity/status'), env)).status, 503);
assert.equal((await route(researchRequest('/v1/identity/start', { proof: 'signature', principal: 'forged', authenticated: true, 'operator-signature-verified': true }), identityEnv)).status, 200);
assert.equal((await route(researchRequest('/v1/identity/start', {}, {origin: 'https://evil.example'}), identityEnv)).status, 403);
const profilePath = `/v1/identity/profile?id=${intakeId}`;
assert.equal((await route(new Request(`https://kotoba.cloud${profilePath}`), identityEnv)).status, 401);
assert.equal((await route(researchRequest('/v1/identity/profile?id=bad'), identityEnv)).status, 400);
assert.equal((await route(researchRequest(profilePath), env)).status, 503);
const privateProfile = await route(researchRequest(profilePath), identityEnv);
assert.equal(privateProfile.status, 200);
assert.match(privateProfile.headers.get('cache-control'), /no-store/);
assert.deepEqual(await privateProfile.json(), {id: intakeId, revision: 2, researcherProfile: {version: 'synthetic'}});
const redirectedIdentity = {...env, IDENTITY_AUTHORITY: {fetch: async () => new Response(null, {status:302, headers:{location:'https://untrusted.example'}})}};
assert.equal((await route(researchRequest('/v1/identity/status'), redirectedIdentity)).status, 503);
const wrongProfile = {...env, IDENTITY_AUTHORITY: {fetch: async () => Response.json({id: 'another-case', researcherProfile: {private: true}})}};
assert.equal((await route(researchRequest(profilePath), wrongProfile)).status, 502);
const uploadIdentity = (bytes, type='image/jpeg') => new Request(`https://kotoba.cloud/v1/identity/upload?id=${intakeId}&slot=document`, {
  method:'PUT', headers: { cookie:'gftd_session=research-session', origin:'https://kotoba.cloud', 'content-type':type }, body:bytes });
assert.equal((await route(uploadIdentity(new Uint8Array([1,2,3])), identityEnv)).status, 200);
const beforeOversize = identityCalls.length;
assert.equal((await route(uploadIdentity(new Uint8Array(2097153)), identityEnv)).status, 413);
assert.equal(identityCalls.length, beforeOversize);
assert.equal((await route(uploadIdentity(new Uint8Array([1]), 'image/svg+xml'), identityEnv)).status, 415);
let identityAssetPath;
const capturePage = await route(new Request('https://kotoba.cloud/identity'), {...env, ASSETS: {fetch: async request => {identityAssetPath=new URL(request.url).pathname;return new Response('<main id="identity-console"></main>');}}});
assert.equal(identityAssetPath,'/identity/');
const slashIdentity=await route(new Request('https://kotoba.cloud/identity/'),env);
assert.equal(slashIdentity.headers.get('cache-control'),'no-store, private');
assert(!slashIdentity.headers.get('content-security-policy').includes('freebuff'));
assert.equal(capturePage.headers.get('permissions-policy'), 'camera=(self), microphone=(), geolocation=(), payment=()');
assert.equal(capturePage.headers.get('cache-control'), 'no-store, private');
assert(!capturePage.headers.get('content-security-policy').includes('freebuff'));
assert(capturePage.headers.get('content-security-policy').includes('media-src blob:'));
assert(!capturePage.headers.get('content-security-policy').includes('https://kotobase.net'));
// Operator console host: admin.kotoba.cloud serves only the console, health and the
// shared identity gateway. Marketing/discovery paths 404; the document is no-store
// with a locked-down CSP; gateway ops still require the session and same-origin.
{
  const adminDoc = await route(new Request('https://admin.kotoba.cloud/'), {...env, ASSETS: {fetch: async request => {
    assert.equal(new URL(request.url).pathname, '/admin/');
    return new Response('<main id="main"></main>', {headers: {'content-type': 'text/html'}});
  }}});
  assert.equal(adminDoc.status, 200);
  assert.equal(adminDoc.headers.get('cache-control'), 'no-store, private');
  assert.equal(adminDoc.headers.get('x-robots-tag'), 'noindex');
  assert.equal((await route(new Request('https://admin.kotoba.cloud/ja/'), env)).status, 404);
  assert.equal((await route(new Request('https://admin.kotoba.cloud/.well-known/kotoba-cloud.json'), env)).status, 404);
  assert.equal((await route(new Request('https://admin.kotoba.cloud/health'))).status, 200);
  const adminHealth = await (await route(new Request('https://admin.kotoba.cloud/health'))).json();
  assert.equal(adminHealth.service, 'kotoba-cloud-operator-console');
  assert.equal((await route(new Request('https://admin.kotoba.cloud/v1/identity/status'), env)).status, 401);
  assert.equal((await route(researchRequest('/v1/identity/status'), identityEnv)).status, 200);
  assert.equal((await route(new Request('https://admin.kotoba.cloud/v1/identity/status', {method:'POST', headers:{cookie:'gftd_session=research-session', origin:'https://admin.kotoba.cloud', 'content-type':'application/json'}, body:'{}'}), identityEnv)).status, 405);
}
console.log('private identity gateway authorization, bounds and camera isolation checks passed');

// First-party database ingress: credentials are verified by the private service,
// client identity/trust headers never reach it, and cookie writes require origin.
const databasePath='/v1/database/xrpc/ai.gftd.apps.kotobase.usageGet';
let databaseCalls=[];
const databaseEnv={...env,DATABASE_SERVICE:{fetch:async request=>{
 databaseCalls.push(request);
 return Response.json({tenantDid:'did:example:fixture'},{headers:{'set-cookie':'must-not-escape=1','access-control-allow-origin':'*'}});
}}};
const dbRequest=(headers={},path=databasePath,body='{}')=>new Request('https://api.kotoba.cloud'+path,{method:'POST',headers:{'content-type':'application/json',...headers},body});
assert.equal((await route(dbRequest(),databaseEnv)).status,401);
assert.equal((await route(dbRequest({cookie:'gftd_session=fixture'}),databaseEnv)).status,403);
assert.equal((await route(dbRequest({origin:'https://evil.example',authorization:'Bearer fixture'}),databaseEnv)).status,403);
assert.equal((await route(dbRequest({authorization:'Bearer fixture'},'/v1/database/xrpc/ai.gftd.apps.kotobase.mail.send'),databaseEnv)).status,404);
assert.equal(databaseCalls.length,0);
const dbOK=await route(dbRequest({origin:'https://kotoba.cloud',cookie:'unrelated=private; gftd_session=fixture','x-internal-trust':'forged','x-kotobase-tenant-did':'forged'}),databaseEnv);
assert.equal(dbOK.status,200);
assert.equal(dbOK.headers.get('access-control-allow-origin'),'https://kotoba.cloud');
assert.equal(dbOK.headers.get('access-control-allow-credentials'),'true');
assert.equal(dbOK.headers.get('set-cookie'),null);
assert.equal(databaseCalls[0].url,'https://database.internal/xrpc/ai.gftd.apps.kotobase.usageGet');
assert.equal(databaseCalls[0].headers.get('cookie'),'gftd_session=fixture');
assert.equal(databaseCalls[0].headers.get('x-internal-trust'),null);
assert.equal(databaseCalls[0].headers.get('x-kotobase-tenant-did'),null);
assert.equal((await route(new Request('https://api.kotoba.cloud'+databasePath,{method:'OPTIONS',headers:{origin:'https://kotoba.cloud','access-control-request-method':'POST'}}),databaseEnv)).status,204);
assert.equal((await route(dbRequest({authorization:'Bearer fixture'},databasePath,'x'.repeat(1048577)),databaseEnv)).status,413);
assert.equal(databaseCalls.length,1);
assert.equal((await route(dbRequest({authorization:'Bearer fixture'}),{...env,DATABASE_SERVICE:{fetch:async()=>new Response(null,{status:302,headers:{location:'https://kotobase.net'}})}})).status,502);
console.log('Database ingress CORS, CSRF, credential isolation, route bounds and body limits passed');

// Billing remains closed until metering and mode-specific provider configuration exist.
const { BillingAccount } = await import('../build/worker.js');
let bill = await route(new Request('https://kotoba.cloud/v1/billing/catalog'), {});
assert.equal((await bill.json()).checkoutEnabled, false);
bill = await route(new Request('https://kotoba.cloud/v1/billing/status'), {});
assert.equal(bill.status, 401);
bill = await route(new Request('https://kotoba.cloud/v1/billing/checkout', {method:'POST', headers:{origin:'https://evil.example','content-type':'application/json'},body:'{}'}), {});
assert.equal(bill.status,403);
const memory = new Map();
const billingState = {storage:{get:async k=>memory.get(k), put:async(k,v)=>memory.set(k,v), list:async()=>new Map([...memory].filter(([k])=>k.startsWith('usage:'))),setAlarm:async()=>{}}, blockConcurrencyWhile: f=>f()};
const billingEnv = {BILLING_ENVIRONMENT_ID:'account-a-test',STRIPE_RESTRICTED_KEY:'sk_test_fixture_not_a_real_key', STRIPE_PRICE_IDS:JSON.stringify({'pro':'price_fixture','ai-credits-25':'price_topup'}), STRIPE_PORTAL_CONFIGURATION_ID:'bpc_fixture'};
const enabledCatalog=await route(new Request('https://kotoba.cloud/v1/billing/catalog'), {...billingEnv,BILLING_SANDBOX_ENABLED:'true',BILLING_MODE:'test',STRIPE_WEBHOOK_SECRET:'whsec_fixture',BILLING_ACCOUNTS:{}});
assert.equal((await enabledCatalog.json()).checkoutEnabled,true,'Stripe-only configuration requires no additional provider');
const billingDO = BillingAccount(billingState,billingEnv);
const doBill = async(path,body={})=>billingDO.fetch(new Request('https://billing.internal'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({principal:'principal_fixture',...body})}));
assert.equal((await doBill('/status')).status,200);
const providerCalls=[];
const oldFetchBilling=globalThis.fetch;
globalThis.fetch=async(url,init)=>{
 const u=String(url);providerCalls.push({url:u,body:init?.body});
 if(u.startsWith('https://api.stripe.com/v1/subscriptions?'))return Response.json({data:[],has_more:false});
 if(u==='https://api.stripe.com/v1/customers')return Response.json({id:'cus_fixture'});
 if(u==='https://api.stripe.com/v1/checkout/sessions')return Response.json({id:'cs_fixture',url:'https://checkout.stripe.com/c/pay/fixture'});
 if(u==='https://api.stripe.com/v1/invoices/in_fixture')return Response.json({id:'in_fixture',status:'paid',customer:'cus_fixture',currency:'usd',billing_reason:'subscription_cycle',lines:{has_more:false,data:[{id:'il_fixture',quantity:1,period:{start:1789257600,end:1791849600},pricing:{price_details:{price:'price_fixture'}}}]}});
 throw new Error('Unexpected billing provider URL '+u);
};
try {
 let r=await doBill('/checkout',{sku:'pro',requestId:'request_fixture_000000'});
 assert.equal(r.status,503,'invalid id rejected');
 r=await doBill('/checkout',{sku:'pro',requestId:'request-fixture-000000'});
 assert.equal(r.status,200,await r.clone().text());
 assert.equal((await r.json()).url,'https://checkout.stripe.com/c/pay/fixture');
 r=await doBill('/checkout',{sku:'pro',requestId:'another-checkout-0000'});assert.equal(r.status,503,'second checkout cannot create another subscription');
 const e={type:'invoice.paid',data:{object:{id:'in_fixture',customer:'cus_fixture'}}};
 r=await doBill('/event',{event:e});assert.equal(r.status,200,await r.clone().text());
 r=await doBill('/event',{event:e});assert.equal(r.status,200);
 const balances=(await (await doBill('/status')).json()).balances;
 assert.equal(balances.find(b=>b.scope==='ai').grantedMicroUSD,12000000);
 assert.equal(balances.find(b=>b.scope==='storage.capacity').grantedMicroUSD,4000000);
 assert.equal(providerCalls.some(c=>c.url.includes('metronome')),false);
 const checkoutParams=new URLSearchParams(providerCalls.find(c=>c.url.endsWith('/checkout/sessions')).body);
 assert.equal(checkoutParams.get('line_items[0][price]'),'price_fixture');
 assert.equal(checkoutParams.has('line_items[1][price]'),false,'one recurring item includes both balances');
 r=await doBill('/reserve',{id:'reserved-one',scope:'ai',maximum:10000000});assert.equal(r.status,200,await r.clone().text());
 r=await doBill('/reserve',{id:'reserved-two',scope:'ai',maximum:3000000});assert.equal(r.status,402);
 r=await doBill('/settle',{id:'reserved-one',actual:8000000,receiptId:'receipt-fixture'});assert.equal(r.status,200);
 r=await doBill('/reserve',{id:'reserved-two',scope:'ai',maximum:3000000});assert.equal(r.status,200);
 r=await doBill('/reserve',{id:'storage-one',scope:'storage.capacity',maximum:4000000});assert.equal(r.status,200);
 r=await doBill('/reserve',{id:'storage-two',scope:'storage.capacity',maximum:1});assert.equal(r.status,402);
 r=await doBill('/reserve',{id:'egress-one',scope:'storage',maximum:1});assert.equal(r.status,402,'included capacity cannot fund egress');
 r=await doBill('/checkout',{sku:'ai-credits-25',requestId:'topup-fixture-000000'});assert.equal(r.status,200);
 const topupEvent={type:'checkout.session.completed',data:{object:{id:'cs_fixture',customer:'cus_fixture',mode:'payment',payment_status:'paid',currency:'usd',amount_subtotal:2500,created:Math.floor(Date.now()/1000)}}};
 r=await doBill('/event',{event:topupEvent});assert.equal(r.status,200);
 r=await doBill('/event',{event:topupEvent});assert.equal(r.status,200);
 const topped=(await (await doBill('/status')).json()).balances;
 assert.equal(topped.find(b=>b.scope==='ai').grantedMicroUSD,37000000,'paid topup adds once');
 assert.equal(topped.find(b=>b.scope==='storage').grantedMicroUSD,0,'AI topup cannot fund DB usage');
 r=await doBill('/event',{event:{...e,data:{object:{id:'in_fixture',customer:'cus_other'}}}});assert.equal(r.status,503);
 const receipt={requestId:'usage-fixture',model:'security',inputTokens:100,cachedInputTokens:40,outputTokens:10,occurredAt:'2026-09-14T00:00:00Z'};
 r=await doBill('/usage',{kind:'inference',receipt});assert.equal(r.status,202);
 const recorded=memory.get('usage:inference:usage-fixture');
 assert.ok(recorded.includes(':input_tokens 60'));
 await doBill('/usage',{kind:'inference',receipt});
 assert.equal(memory.get('usage:inference:usage-fixture'),recorded);
 r=await doBill('/usage',{kind:'inference',receipt:{...receipt,outputTokens:20}});assert.equal(r.status,503,'conflicting receipt rejected');

 r=await doBill('/settle-usage',{id:'reserved-two',kind:'inference',receipt});assert.equal(r.status,200,await r.clone().text());
 assert.equal((await r.json()).amountMicroUSD,66);
 const settledSnapshot=memory.get('limits');
 r=await doBill('/settle-usage',{id:'reserved-two',kind:'inference',receipt});assert.equal(r.status,200);
 assert.equal(memory.get('limits'),settledSnapshot,'retry cannot charge twice');
 r=await doBill('/reserve',{id:'receipt-replay-other',scope:'ai',maximum:100});assert.equal(r.status,200);
 r=await doBill('/settle-usage',{id:'receipt-replay-other',kind:'inference',receipt});assert.equal(r.status,503,'same receipt cannot settle another reservation');
 r=await doBill('/settle-usage',{id:'storage-one',kind:'storage',receipt:{sampleId:'storage-hour',databaseId:'fixture',bytes:1073741824,seconds:3600,occurredAt:'2026-09-14T00:00:00Z'}});assert.equal(r.status,200);
 assert.equal((await r.json()).amountMicroUSD,278);
} finally {globalThis.fetch=oldFetchBilling;}
console.log('billing provider, invoice replay, tenant and durable usage checks passed');

// Raw-body Stripe signature/mode enforcement precedes any account mutation.
const webhookSecret = 'whsec_fixture_only';
const webhookCalls = [];
const webhookEnv = {...billingEnv, STRIPE_WEBHOOK_SECRET:webhookSecret, BILLING_MODE:'test', BILLING_ACCOUNTS:{idFromName:x=>x,get:id=>({fetch:async(url,init)=>{webhookCalls.push({id,body:JSON.parse(init.body)});return Response.json({received:true});}})}};
const signedEvent = {id:'evt_fixture',livemode:false,type:'invoice.paid',data:{object:{id:'in_fixture',customer:'cus_fixture',parent:{subscription_details:{metadata:{principal:'principal_fixture'}}}}}};
const rawEvent = JSON.stringify(signedEvent);
const stamp = Math.floor(Date.now()/1000);
const signature = (raw,t=stamp)=>`t=${t},v1=${createHmac('sha256',webhookSecret).update(`${t}.${raw}`).digest('hex')}`;
const webhook = (raw,sig)=>route(new Request('https://api.kotoba.cloud/v1/billing/webhook',{method:'POST',headers:{'stripe-signature':sig},body:raw}),webhookEnv);
assert.equal((await webhook(rawEvent,'t=0,v1=bad')).status,400);
assert.equal((await webhook(rawEvent,signature(rawEvent,stamp-600))).status,400);
assert.equal(webhookCalls.length,0);
assert.equal((await webhook(rawEvent,signature(rawEvent))).status,200);
assert.equal(webhookCalls.length,1);
assert.equal(webhookCalls[0].id,'test:account-a-test:principal_fixture');
const liveEvent = JSON.stringify({...signedEvent,livemode:true});
assert.equal((await webhook(liveEvent,signature(liveEvent))).status,400);
assert.equal(webhookCalls.length,1);
webhookEnv.BILLING_ENVIRONMENT_ID = 'account-b-test';
assert.equal((await webhook(rawEvent,signature(rawEvent))).status,200);
assert.equal(webhookCalls[1].id,'test:account-b-test:principal_fixture');
assert.notEqual(webhookCalls[0].id,webhookCalls[1].id);
console.log('Stripe webhook signature, timestamp and mode checks passed');
console.log('operator console host isolation checks passed');

// Merchant readiness is authenticated, read-only, cached and projects no secret/PII.
const readinessRequest=()=>new Request('https://kotoba.cloud/v1/billing/readiness',{headers:{cookie:'gftd_session=fixture'}});
assert.equal((await route(new Request('https://kotoba.cloud/v1/billing/readiness'),{})).status,401);
const readinessFetch=globalThis.fetch;
let accountReads=0;
try {
 globalThis.fetch=async(url,init)=>{
  if(String(url)==='https://api.stripe.com/v1/account') {accountReads++;return Response.json({id:'acct_1TuxvPIzvFrqWhXK',charges_enabled:true,payouts_enabled:true,email:'must-not-leak@example.com'});}
  return readinessFetch(url,init);
 };
 const readyEnv={STRIPE_AWAI_LIVE_KEY:'sk_live_fixture_not_real'};
 let r=await route(readinessRequest(),readyEnv);
 assert.deepEqual(await r.json(),{status:'connected',chargesEnabled:true,payoutsEnabled:true});
 await route(readinessRequest(),readyEnv);assert.equal(accountReads,1);
 r=await route(readinessRequest(),{STRIPE_AWAI_LIVE_KEY:'sk_test_fixture_not_real'});
 assert.equal((await r.json()).status,'live-key-not-configured');assert.equal(accountReads,1);
 globalThis.fetch=async(url,init)=>String(url)==='https://api.stripe.com/v1/account'?Response.json({id:'acct_other',charges_enabled:true}):readinessFetch(url,init);
 r=await route(readinessRequest(),{STRIPE_AWAI_LIVE_KEY:'sk_live_fixture_other'});
 assert.deepEqual(await r.json(),{status:'account-mismatch',chargesEnabled:false,payoutsEnabled:false});
} finally {globalThis.fetch=readinessFetch;}
console.log('AWAI readiness authentication, account binding and caching passed');

// Session capability exchange: Authn alone decides membership and permission.
const sessionCalls=[];
const sessionEnv={AUTHN_SERVICE:{fetch:async request=>{sessionCalls.push(request);return Response.json({token:'fixture-only',tokenType:'Biscuit'},{status:201});}}};
const sessionReq=(body,headers={})=>new Request('https://kotoba.cloud/v1/database/session/token',{method:'POST',headers:{cookie:'gftd_session=fixture',origin:'https://kotoba.cloud','content-type':'application/json',...headers},body:JSON.stringify(body)});
const scopedToken={tenantId:'t_123456789012',dbName:'billing-e2e',permissions:['data:read']};
assert.equal((await route(sessionReq(scopedToken,{cookie:''}),sessionEnv)).status,401);
assert.equal((await route(sessionReq(scopedToken,{origin:'https://evil.example'}),sessionEnv)).status,403);
assert.equal((await route(sessionReq({...scopedToken,permissions:['admin:*']}),sessionEnv)).status,400);
assert.equal((await route(sessionReq({...scopedToken,graph:'forged'}),sessionEnv)).status,400);
assert.equal(sessionCalls.length,0);
let sr=await route(sessionReq(scopedToken,{'x-internal-trust':'forged',authorization:'Bearer injected'}),sessionEnv);
assert.equal(sr.status,201);assert.equal(sessionCalls.length,1);
assert.equal(sessionCalls[0].url,'https://auth.kotoba.cloud/v1/biscuit/token');
assert.equal(sessionCalls[0].headers.get('authorization'),null);
assert.equal(sessionCalls[0].headers.get('x-internal-trust'),null);
assert.deepEqual(await sessionCalls[0].json(),scopedToken);
assert.equal(sessionCalls[0].redirect,'manual');
const redirected=await route(sessionReq(scopedToken),{AUTHN_SERVICE:{fetch:async()=>new Response(null,{status:302,headers:{location:'https://unexpected.example/'}})}});
assert.equal(redirected.status,502);
assert.equal((await redirected.json()).stage,'authn-response-302');
console.log('Scoped database session exchange and header isolation passed');

// Org-scoped tenant exchange (ADR-2609141633 step 4): a token request with an
// orgHandle must be approved by the private org authority before Authn mints
// the Biscuit token; without the orgHandle the Authn-only path is unchanged.
{
  const orgAuthCalls=[];
  const orgSessionEnv={AUTHN_SERVICE:{fetch:async()=>Response.json({token:'fixture-only',tokenType:'Biscuit'},{status:201})},
                       ORG_AUTHORITY:{fetch:async(url,init)=>{orgAuthCalls.push(new URL(url instanceof Request?url.url:url).pathname);
                         const b=JSON.parse(init && init.body ? init.body : await url.text());
                         assert.equal(b.principalId,'urn:kotoba:principal:018f4d6c-29bf-7f80-9a21-111111111111');
                         assert.equal(b.orgHandle,'com-test.kotoba.cloud');
                         return Response.json({ok:true,orgDid:'did:webvh:com-test:test.kotoba.cloud',role:'owner',bound:true});}}};
  const orgReq=(body,env)=>route(sessionReq(body),env);
  // unconfigured org authority -> 503, no Authn call
  assert.equal((await orgReq({...scopedToken,orgHandle:'com-test.kotoba.cloud'},{AUTHN_SERVICE:sessionEnv.AUTHN_SERVICE})).status,503);
  // approved org path: authority called, then Authn mints the token
  const sr2=await orgReq({...scopedToken,orgHandle:'com-test.kotoba.cloud'},orgSessionEnv);
  if (sr2.status!==201) console.error('DBG org status', sr2.status, await sr2.clone().text());
  assert.equal(sr2.status,201);
  assert.deepEqual(orgAuthCalls,['/authorize']);
  assert.equal(sessionCalls.length,1); // unchanged: personal path before org block
  // authority rejection propagates as 403
  const rejectEnv={...orgSessionEnv,ORG_AUTHORITY:{fetch:async()=>Response.json({error:'org-membership-required'},{status:403})}};
  assert.equal((await orgReq({...scopedToken,orgHandle:'com-test.kotoba.cloud'},rejectEnv)).status,403);
}
