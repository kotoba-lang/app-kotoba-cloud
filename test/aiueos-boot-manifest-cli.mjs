import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const directory = mkdtempSync(join(tmpdir(), "aiueos-boot-manifest-test-"));
const script = new URL("../scripts/aiueos-boot-manifest.mjs", import.meta.url).pathname;
const seed = join(directory, "publisher.seed");
const manifestPath = join(directory, "manifest.json");

try {
  writeFileSync(seed, new Uint8Array(32).fill(7), { mode: 0o600 });
  chmodSync(seed, 0o600);
  for (const [kind, body] of [["loader", "efi"], ["kernel", "kernel"],
                              ["initramfs", "initramfs"]]) {
    writeFileSync(join(directory, kind), body);
  }
  const build = spawnSync(process.execPath, [script,
    "--loader", join(directory, "loader"),
    "--kernel", join(directory, "kernel"),
    "--initramfs", join(directory, "initramfs"),
    "--source-commit", "9f6745ca6bf291752f30ceed56d3d1daa302199c",
    "--sequence", "1",
    "--released-at", "2026-09-01T00:00:00Z",
    "--ml-dsa-seed", seed,
    "--out", manifestPath,
  ], { encoding: "utf8" });
  assert.equal(build.status, 0, build.stderr);
  const receipt = JSON.parse(build.stdout);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(receipt.ok, true);
  assert.equal(manifest.schema, "aiueos.os-update/v1");
  assert.equal(manifest.channel, "candidate");
  assert.equal(manifest.artifacts.length, 3);
  assert.deepEqual(manifest.artifacts.map((artifact) => artifact.kind),
                   ["loader", "kernel", "initramfs"]);
  assert.equal(manifest.authority.publicationSignatureSuite,
               "ipns-ed25519+manifest-ml-dsa-65");
  assert.equal(manifest.qualification.physicalK16, "unverified");
  assert.equal(manifest.qualification.internalDiskWrites, false);
  assert.match(manifest.signatures[0].keyId, /^sha256:[0-9a-f]{64}$/);

  const verify = spawnSync(process.execPath, [script, "--verify", manifestPath],
                           { encoding: "utf8" });
  assert.equal(verify.status, 0, verify.stderr);
  assert.equal(JSON.parse(verify.stdout).manifestId, manifest.manifestId);

  manifest.artifacts[0].bytes += 1;
  const tampered = join(directory, "tampered.json");
  writeFileSync(tampered, JSON.stringify(manifest));
  const rejected = spawnSync(process.execPath, [script, "--verify", tampered],
                             { encoding: "utf8" });
  assert.notEqual(rejected.status, 0, "tampered manifest must be refused");
  assert.match(rejected.stderr, /manifest identity mismatch/);
  console.log("AIUEOS boot manifest ML-DSA signing and tamper rejection passed");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
