#!/usr/bin/env node
// Build the enforcement (civil compulsory execution) catalog under assets/enforcement-catalog/.
// Source of truth: assets/enforcement-catalog-src/enforcement.json (curated, sourced records).
// Static output: index.json + IPLD-style blocks (same codec as the compliance/security pipelines).
import {readFileSync, writeFileSync, mkdirSync, rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../assets/enforcement-catalog-src');
const out = resolve(here, '../assets/enforcement-catalog');
rmSync(out, {recursive: true, force: true});
mkdirSync(out + '/blocks', {recursive: true});

const digest = b => createHash('sha256').update(b).digest();
function b32(bytes) {
  let bits = 0, value = 0, result = '';
  for (const n of bytes) {
    value = (value << 8) | n; bits += 8;
    while (bits >= 5) { result += 'abcdefghijklmnopqrstuvwxyz234567'[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) result += 'abcdefghijklmnopqrstuvwxyz234567'[(value << (8 - bits)) & 31];
  return result;
}
function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const blockIndex = {};
function block(bytes, codec = 0x55) {
  const cid = 'b' + b32(Buffer.concat([Buffer.from(codec === 0x55 ? [1, 0x55, 0x12, 32] : [1, 0xa9, 2, 0x12, 32]), digest(bytes)]));
  const path = `blocks/${cid}.${codec === 0x55 ? 'bin' : 'json'}`;
  writeFileSync(out + '/' + path, bytes);
  blockIndex[cid] = {path: '/enforcement-data/enforcement/' + path, bytes: bytes.length, codec: codec === 0x55 ? 'raw' : 'dag-json'};
  return {'/': cid};
}
const dag = value => block(Buffer.from(canonical(value)), 0x129);

const generatedAt = process.env.ENFORCEMENT_GENERATED_AT || new Date().toISOString();

const doc = JSON.parse(readFileSync(src + '/enforcement.json', 'utf8'));
const {meta, procedures, world, publicSources, privateSources} = doc;

// ---- integrity checks ----
const order = [];
for (const p of procedures) {
  if (!p.id || !p.name || !p.desc || !p.source) throw new Error('procedure missing required fields: ' + p.id);
  if (typeof p.order !== 'number') throw new Error('procedure ' + p.id + ': order must be a number');
  order.push(p.order);
  if (!/^https?:\/\//.test(p.source)) throw new Error('procedure ' + p.id + ': source must be a URL');
}
if (new Set(order).size !== order.length) throw new Error('duplicate procedure order values');
if (order.some((o, i) => o !== i + 1)) throw new Error('procedure order must be 1..N contiguous');
const worldSeen = new Set();
for (const w of world) {
  if (!w.id || !w.name || !w['name-ja']) throw new Error('world record missing required fields: ' + w.id);
  if (worldSeen.has(w.id)) throw new Error('duplicate world id: ' + w.id);
  worldSeen.add(w.id);
  if (!Array.isArray(w.mechanisms) || w.mechanisms.length < 1) throw new Error('world ' + w.id + ': mechanisms must be non-empty');
  if (!Array.isArray(w.sources) || w.sources.length < 1) throw new Error('world ' + w.id + ': sources must be non-empty');
  for (const s of w.sources) {
    if (!s.name || !s.url || s.status === undefined) throw new Error('world ' + w.id + ': source missing name/url/status');
    if (!/^https?:\/\//.test(s.url)) throw new Error('world ' + w.id + ': source url must be absolute');
  }
}
for (const [name, list] of [['publicSources', publicSources], ['privateSources', privateSources]]) {
  const seen = new Set();
  for (const s of list) {
    if (!s.id || !s.name || !s.url || s.status === undefined) throw new Error(name + ' record missing required fields: ' + s.id);
    if (seen.has(s.id)) throw new Error('duplicate ' + name + ' id: ' + s.id);
    seen.add(s.id);
    if (!/^https?:\/\//.test(s.url)) throw new Error(name + ' ' + s.id + ': url must be absolute');
  }
}

// ---- per-record blocks + index (inline lookup contract: the browser UI reads index.json only) ----
const procIndex = procedures.map(p => ({...p, record: dag(p)}));
const worldIndex = world.map(w => ({...w, record: dag(w)}));
const pubIndex = publicSources.map(s => ({...s, record: dag(s)}));
const privIndex = privateSources.map(s => ({...s, record: dag(s)}));

const index = {
  generatedAt,
  'source/kind': meta.kind,
  corpus: meta.corpus,
  verified: meta.verified,
  note: meta.note,
  procedureCount: procedures.length,
  worldCount: world.length,
  publicCount: publicSources.length,
  privateCount: privateSources.length,
  procedures: procIndex,
  world: worldIndex,
  publicSources: pubIndex,
  privateSources: privIndex,
  blocks: blockIndex,
  head: null
};
const head = dag(index);
index.head = head;
writeFileSync(out + '/index.json', JSON.stringify(index, null, 1) + '\n');
console.log(`enforcement-catalog: ${procedures.length} procedures, ${world.length} world jurisdictions, ${publicSources.length} public + ${privateSources.length} private sources; head ${head['/']}`);
