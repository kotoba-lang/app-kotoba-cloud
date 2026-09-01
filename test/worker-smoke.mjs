import assert from "node:assert/strict";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import { route } from "../build/worker.js";

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

console.log("worker Passkey/PQ publication and hash-addressed AIUEOS boot smoke passed");
