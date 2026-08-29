import assert from "node:assert/strict";
import { route } from "../build/worker.js";

const calls = [];
let upstreamStatus = 200;
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), headers: new Headers(init.headers) });
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

console.log("worker session forwarding smoke passed");
