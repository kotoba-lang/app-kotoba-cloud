import assert from "node:assert/strict";
import { route } from "../build/worker.js";

const calls = [];
let upstreamStatus = 200;
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), headers: new Headers(init?.headers), body: init?.body });
  if (String(url).includes("ipns.publish")) {
    return new Response(JSON.stringify({ status: "ok", name: "k51demo" }), {
      status: upstreamStatus,
      headers: { "content-type": "application/json" }
    });
  }
  if (upstreamStatus !== 200) {
    return new Response("upstream unavailable", { status: upstreamStatus });
  }
  return new Response(JSON.stringify({
    valid: true,
    handle: "did:key:legacy",
    principalId: "urn:kotoba:principal:018f4d6c-29bf-7f80-9a21-111111111111",
    accountDid: "did:web:kotoba.cloud:tenant:u_01",
    activeDid: "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK"
  }), { status: 200, headers: { "content-type": "application/json" } });
};

const signedIn = await route(new Request("https://kotoba.cloud/v1/session", {
  headers: { cookie: "other=1; gftd_session=abc==; another=2" }
}), {});
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
}), {});
assert.deepEqual(await failedUpstream.json(), { valid: false });
assert.equal(calls.length, 2, "upstream failure is observed and fails closed");

const anonymous = await route(new Request("https://kotoba.cloud/v1/session"), {});
assert.deepEqual(await anonymous.json(), { valid: false });
assert.equal(calls.length, 2, "no cookie must not trigger an upstream request");

upstreamStatus = 200;
const publication = {
  schema: "https://kotoba.cloud/schemas/library-publication-request/v1",
  namespace: "demo",
  releaseCid: "bafyRelease",
  recordCid: "bafyRecord",
  publisher: "did:key:zDemo",
  ipnsName: "k51demo",
  storageOrigin: "https://kotobase.net",
  signedRecord: {
    name: "k51demo", value: "bafyRecord", sequence: 3,
    valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), ttl_secs: 3600,
    controller_did: "did:key:zDemo",
    public_key_multibase: "did:key:zDemo", signature_multibase: "zSignature"
  }
};

const beforeAnonymousPublish = calls.length;
const unauthenticatedPublish = await route(new Request("https://kotoba.cloud/v1/libraries/publish", {
  method: "POST",
  headers: { origin: "https://kotoba.cloud", "content-type": "application/json" },
  body: JSON.stringify(publication)
}), {});
assert.equal(unauthenticatedPublish.status, 401);
assert.equal(calls.length, beforeAnonymousPublish, "anonymous publish reaches neither session nor Kotobase");

const published = await route(new Request("https://kotoba.cloud/v1/libraries/publish", {
  method: "POST",
  headers: {
    origin: "https://kotoba.cloud", "content-type": "application/json",
    cookie: "other=1; gftd_session=publish-session"
  },
  body: JSON.stringify(publication)
}), {});
assert.equal(published.status, 200);
const receipt = await published.json();
assert.equal(receipt.ok, true);
assert.equal(receipt.recordCid, "bafyRecord");
const publishCall = calls.find((call) => call.url.includes("ipns.publish"));
assert.ok(publishCall, "signed head is relayed to Kotobase");
assert.equal(publishCall.headers.get("cookie"), null, "Passkey cookie never leaves kotoba.cloud");
assert.equal(publishCall.headers.get("authorization"), null, "relay adds no ambient server credential");
assert.equal(JSON.parse(publishCall.body).signature_multibase, "zSignature");

const beforeTamper = calls.length;
const tampered = structuredClone(publication);
tampered.signedRecord.value = "bafyOther";
const rejectedTamper = await route(new Request("https://kotoba.cloud/v1/libraries/publish", {
  method: "POST",
  headers: { origin: "https://kotoba.cloud", "content-type": "application/json",
             cookie: "gftd_session=publish-session" },
  body: JSON.stringify(tampered)
}), {});
assert.equal(rejectedTamper.status, 400);
assert.equal(calls.length, beforeTamper, "mismatched signed record is rejected before any upstream call");

console.log("worker session and Passkey publication relay smoke passed");
