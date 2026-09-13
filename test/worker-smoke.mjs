import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
const researchModel = "kotoba/norbert";
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
const identityProfile = await identityCapabilities.json();
assert.equal(identityProfile.provider, 'kotoba');
assert.equal(identityProfile.enrollmentEnabled, false);
assert.equal(identityProfile.zeroKnowledge, false);
assert.equal(identityProfile.defaultRoute, 'web-reviewed');
assert.equal(identityProfile.trustPolicy.weights['web-reviewed'], 60);
assert.equal(identityProfile.trustPolicy.weights['app-passport'], 80);
assert.equal(identityProfile.trustPolicy.ceiling, 100);
assert.equal(identityProfile.status, 'components-tested-enrollment-closed');

// Browser capture uses a dedicated private service; no authenticated fallback.
const intakeId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const identityCalls = [];
const identityEnv = { ...env, IDENTITY_AUTHORITY: { fetch: async (url, init) => {
  const headers = new Headers(init.headers);
  assert.equal(headers.get('x-kotoba-principal'), researchPrincipal);
  assert.equal(headers.get('cookie'), null);
  const op = new URL(url).pathname;
  identityCalls.push(op);
  if (op === '/upload') {
    assert.equal(headers.get('x-kotoba-case'), intakeId);
    assert.deepEqual([...init.body], [1, 2, 3]);
    return Response.json({ receiptId: 'private:stored' });
  }
  const body = JSON.parse(init.body);
  assert.equal(body.principal, undefined);
  assert.equal(body.authenticated, undefined);
  assert.equal(body['operator-signature-verified'], undefined);
  return Response.json({ principalId: researchPrincipal, intakeEnabled: false, cases: [], reviewer: false, queue: [] });
}}};
assert.equal((await route(new Request('https://kotoba.cloud/v1/identity/status'), identityEnv)).status, 401);
assert.equal((await route(researchRequest('/v1/identity/status'), env)).status, 503);
assert.equal((await route(researchRequest('/v1/identity/start', { proof: 'signature', principal: 'forged', authenticated: true, 'operator-signature-verified': true }), identityEnv)).status, 200);
assert.equal((await route(researchRequest('/v1/identity/start', {}, {origin: 'https://evil.example'}), identityEnv)).status, 403);
const uploadIdentity = (bytes, type='image/jpeg') => new Request(`https://kotoba.cloud/v1/identity/upload?id=${intakeId}&slot=document`, {
  method:'PUT', headers: { cookie:'gftd_session=research-session', origin:'https://kotoba.cloud', 'content-type':type }, body:bytes });
assert.equal((await route(uploadIdentity(new Uint8Array([1,2,3])), identityEnv)).status, 200);
const beforeOversize = identityCalls.length;
assert.equal((await route(uploadIdentity(new Uint8Array(2097153)), identityEnv)).status, 413);
assert.equal(identityCalls.length, beforeOversize);
assert.equal((await route(uploadIdentity(new Uint8Array([1]), 'image/svg+xml'), identityEnv)).status, 415);
const capturePage = await route(new Request('https://kotoba.cloud/identity'), env);
assert.equal(capturePage.headers.get('permissions-policy'), 'camera=(self), microphone=(), geolocation=(), payment=()');
assert.equal(capturePage.headers.get('cache-control'), 'no-store, private');
assert(!capturePage.headers.get('content-security-policy').includes('freebuff'));
assert(capturePage.headers.get('content-security-policy').includes('media-src blob:'));
console.log('private identity gateway authorization, bounds and camera isolation checks passed');
