#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmodSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";
const KINDS = ["loader", "kernel", "initramfs"];
const SIGNING_CONTEXT_TEXT = "kotoba.aiueos.boot-manifest.v1";
const SIGNING_CONTEXT = new TextEncoder().encode(SIGNING_CONTEXT_TEXT);

function fail(message) {
  console.error(message);
  process.exit(2);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--verify") args.verify = argv[++index];
    else if (flag === "--loader") args.loader = argv[++index];
    else if (flag === "--kernel") args.kernel = argv[++index];
    else if (flag === "--initramfs") args.initramfs = argv[++index];
    else if (flag === "--source-commit") args.sourceCommit = argv[++index];
    else if (flag === "--sequence") args.sequence = Number(argv[++index]);
    else if (flag === "--released-at") args.releasedAt = argv[++index];
    else if (flag === "--previous") args.previous = argv[++index];
    else if (flag === "--ml-dsa-seed") args.mlDsaSeed = argv[++index];
    else if (flag === "--out") args.out = argv[++index];
    else fail(`unknown argument: ${flag}`);
  }
  return args;
}

function base32(bytes) {
  let bits = 0;
  let value = 0;
  let result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += BASE32[(value << (5 - bits)) & 31];
  return result;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest();
}

function rawCid(bytes) {
  const multihash = Buffer.concat([Buffer.from([0x12, 0x20]), sha256(bytes)]);
  return `b${base32(Buffer.concat([Buffer.from([0x01, 0x55]), multihash]))}`;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function b64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

function fromMultibase(value, label) {
  if (typeof value !== "string" || !value.startsWith("u")) {
    fail(`${label} must use base64url multibase`);
  }
  return new Uint8Array(Buffer.from(value.slice(1), "base64url"));
}

function checkedFile(path, label, maximumBytes = 64 * 1024 * 1024) {
  if (!path) fail(`missing --${label}`);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a regular file`);
  if (stat.size <= 0 || stat.size > maximumBytes) fail(`${label} has invalid byte length`);
  const bytes = readFileSync(path);
  const digest = sha256(bytes).toString("hex");
  const cid = rawCid(bytes);
  return {
    kind: label,
    bytes: bytes.length,
    sha256: digest,
    cid,
    url: `https://ipfs.kotobase.net/ipfs/${cid}`,
  };
}

function checkedSeed(path) {
  if (!path) fail("missing --ml-dsa-seed");
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) fail("ML-DSA seed must be a regular file");
  if ((stat.mode & 0o077) !== 0) fail("ML-DSA seed must have mode 0600");
  const seed = new Uint8Array(readFileSync(path));
  if (seed.length !== 32) fail("ML-DSA seed must be exactly 32 bytes");
  return seed;
}

function identityPayload(manifest) {
  const { manifestId: _manifestId, signatures: _signatures, ...identity } = manifest;
  return identity;
}

function signedPayload(manifest) {
  const { signatures: _signatures, ...payload } = manifest;
  return payload;
}

function verifyManifest(manifest) {
  if (manifest.schema !== "aiueos.os-update/v1") fail("unexpected manifest schema");
  const expectedId = sha256(Buffer.from(canonical(identityPayload(manifest)))).toString("hex");
  if (manifest.manifestId !== expectedId) fail("manifest identity mismatch");
  if (!Array.isArray(manifest.signatures) || manifest.signatures.length !== 1) {
    fail("manifest requires exactly one embedded ML-DSA signature");
  }
  const signature = manifest.signatures[0];
  if (signature.suite !== "ml-dsa-65") fail("unexpected manifest signature suite");
  const publicKey = fromMultibase(signature.publicKeyMultibase, "public key");
  const signatureBytes = fromMultibase(signature.signatureMultibase, "signature");
  const keyId = `sha256:${sha256(publicKey).toString("hex")}`;
  if (signature.keyId !== keyId) fail("manifest key id mismatch");
  const payload = new TextEncoder().encode(canonical(signedPayload(manifest)));
  if (!ml_dsa65.verify(signatureBytes, payload, publicKey,
                       { context: SIGNING_CONTEXT })) {
    fail("manifest ML-DSA signature mismatch");
  }
  return { ok: true, manifestId: manifest.manifestId, keyId };
}

function buildManifest(args) {
  if (!Number.isSafeInteger(args.sequence) || args.sequence <= 0) {
    fail("--sequence must be a positive safe integer");
  }
  if (!/^[0-9a-f]{40}$/.test(args.sourceCommit || "")) {
    fail("--source-commit must be a full lowercase Git SHA-1");
  }
  if (!args.releasedAt || Number.isNaN(Date.parse(args.releasedAt))) {
    fail("--released-at must be RFC3339");
  }
  if (args.previous && !/^b[a-z2-7]{8,62}$/.test(args.previous)) {
    fail("--previous must be a CIDv1 base32 value");
  }
  const manifest = {
    schema: "aiueos.os-update/v1",
    sequence: args.sequence,
    releasedAt: new Date(args.releasedAt).toISOString(),
    channel: "candidate",
    previous: args.previous || null,
    target: {
      architecture: "x86_64",
      machine: "gmktec-k16",
      minAiueosAbi: 4,
    },
    artifacts: KINDS.map((kind) => checkedFile(args[kind], kind)),
    source: {
      repository: "https://github.com/kotoba-lang/aiueos",
      commit: args.sourceCommit,
      dirty: false,
    },
    authority: {
      publicationSignatureSuite: "ipns-ed25519+manifest-ml-dsa-65",
      ipnsRecord: "required-separate",
      threshold: 2,
      antiRollback: "monotonic-release-sequence",
    },
    qualification: {
      physicalK16: "unverified",
      secureBoot: "not-enrolled",
      nativeHttpsArtifactFetch: "not-yet-implemented",
      nativeNvmeOsSlotWriter: "not-yet-implemented",
      internalDiskWrites: false,
    },
    signatures: [],
  };
  manifest.manifestId = sha256(Buffer.from(canonical(identityPayload(manifest)))).toString("hex");
  const keys = ml_dsa65.keygen(checkedSeed(args.mlDsaSeed));
  const payload = new TextEncoder().encode(canonical(signedPayload(manifest)));
  const signature = ml_dsa65.sign(payload, keys.secretKey,
                                  { context: SIGNING_CONTEXT });
  manifest.signatures = [{
    suite: "ml-dsa-65",
    keyId: `sha256:${sha256(keys.publicKey).toString("hex")}`,
    publicKeyMultibase: `u${b64url(keys.publicKey)}`,
    signatureMultibase: `u${b64url(signature)}`,
    context: SIGNING_CONTEXT_TEXT,
  }];
  verifyManifest(manifest);
  return manifest;
}

const args = parseArgs(process.argv.slice(2));
if (args.verify) {
  const manifest = JSON.parse(readFileSync(args.verify, "utf8"));
  console.log(JSON.stringify(verifyManifest(manifest)));
} else {
  if (!args.out) fail("missing --out");
  const manifest = buildManifest(args);
  writeFileSync(args.out, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
  chmodSync(args.out, 0o644);
  const bytes = readFileSync(args.out);
  console.log(JSON.stringify({
    ok: true,
    manifestId: manifest.manifestId,
    cid: rawCid(bytes),
    bytes: bytes.length,
    keyId: manifest.signatures[0].keyId,
  }));
}
