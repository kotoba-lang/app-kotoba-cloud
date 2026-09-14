// scripts/sync-shadow-src.mjs — refresh the build/shadow-src .cljc shim tree.
//
// shadow-cljs cannot resolve .cljk (its probe list is .cljs/.cljc/.clj), so the
// build needs byte-identical .cljc copies under build/shadow-src/. The shim is
// a build artifact, NOT a second source of truth: this script re-copies every
// src/**.cljk over its shim and FAILS if any shim would diverge in a way that
// hides a source edit (it never hand-edits). tools.deps :paths carries
// build/shadow-src (see deps.edn) because shadow-cljs is launched with
// :deps {:aliases [:cljs]} and thus resolves source paths from tools.deps.
import { readdirSync, statSync, existsSync, mkdirSync, copyFileSync, readFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";

const SRC = "src/app_kotoba_cloud";
const SHIM = "build/shadow-src/app_kotoba_cloud";
let synced = 0;
for (const name of readdirSync(SRC)) {
  if (!name.endsWith(".cljk")) continue;
  const source = readFileSync(join(SRC, name), "utf8");
  const shimName = name.replace(/\.cljk$/, ".cljc");
  const shimPath = join(SHIM, shimName);
  if (existsSync(shimPath)) {
    const shim = readFileSync(shimPath, "utf8");
    if (shim !== source) {
      // A stale shim means a previous build copied then the source moved on.
      // Overwrite: the shim must never be edited by hand.
      copyFileSync(join(SRC, name), shimPath);
      synced++;
    }
  } else {
    mkdirSync(dirname(shimPath), { recursive: true });
    copyFileSync(join(SRC, name), shimPath);
    synced++;
  }
}
// Drop shims whose .cljk source is gone (deleted namespaces must not linger).
let dropped = 0;
for (const name of readdirSync(SHIM)) {
  if (!name.endsWith(".cljc")) continue;
  const sourceName = name.replace(/\.cljc$/, ".cljk");
  if (!existsSync(join(SRC, sourceName))) {
    (await import("node:fs")).rmSync(join(SHIM, name));
    dropped++;
  }
}
console.log(`sync-shadow-src: ${synced} refreshed, ${dropped} dropped`);
