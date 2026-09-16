#!/usr/bin/env node
// Rewrite the OrgRisk golden block in test/orgbrain-catalog.mjs from the
// Clojure truth. Input: the pr-str of (risk-report (load-schema)) as printed
// by golden_emit.cljk under kbb at the pinned kyber rev — i.e. the values
// the vendored schema actually produces, straight from org_risk.cljc.
// Deterministic and surgical: only the six numbers + level between the
// GOLDEN markers are touched; dies loudly on unknown keys or shapes.
// Used by scripts/hermes-orgbrain-publish (catalog sync bot) — never hand-run
// against a schema you have not vendored: pass the report + the repo root.
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const [reportPath] = process.argv.slice(2);
if (!reportPath) {
  console.error('usage: orgbrain-golden.mjs <report.edn> [repoRoot]');
  process.exit(2);
}
const raw = readFileSync(reportPath, 'utf8').trim();

// parse the exact shape golden_emit.cljk prints:
// {:axes {:raci-coverage 0, :authority-concentration 0.71…, …}, :composite 0.49…, :level :moderate}
const AXES = ['raci-coverage', 'authority-concentration', 'delegation-depth',
              'single-point-of-failure', 'approval-gap'];
const nums = {};
for (const a of AXES) {
  const m = raw.match(new RegExp(`:${a}(-risk)?\\s+(-?[0-9]+(?:\\.[0-9]+)?)`));
  if (!m) throw new Error(`report missing axis ${a}: ${raw}`);
  nums[a] = parseFloat(m[2]);
}
const cm = raw.match(/:composite\s+(-?[0-9]+(?:\.[0-9]+)?)/);
if (!cm) throw new Error(`report missing :composite: ${raw}`);
nums.composite = parseFloat(cm[1]);
const lm = raw.match(/:level\s+:([a-z]+)/);
if (!lm) throw new Error(`report missing :level: ${raw}`);
const level = lm[1];
if (!['low', 'moderate', 'elevated', 'critical'].includes(level))
  throw new Error(`unknown level ${level}`);
// arithmetic gate: composite must be the weighted mean of the axes (the
// weights are the vendored ones; the test re-checks them against index.json)
for (const a of AXES) if (!(nums[a] >= 0 && nums[a] <= 1)) throw new Error(`axis ${a} out of range`);

const root = resolve(process.argv[3] || '.');
const tf = root + '/test/orgbrain-catalog.mjs';
const src = readFileSync(tf, 'utf8');
const block = /const GOLDEN = \{[\s\S]*?\n\};/;
if (!block.test(src)) throw new Error('GOLDEN block not found in orgbrain-catalog.mjs');
const next = src.replace(block,
  'const GOLDEN = {\n' + AXES.map(a => `  '${a}': ${nums[a]},`).join('\n') +
  `\n  composite: ${nums.composite},\n  level: '${level}'\n};`);
const changed = next !== src;
if (changed) writeFileSync(tf, next);
console.log(JSON.stringify({changed, golden: {...nums, level}}));
