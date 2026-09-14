#!/usr/bin/env node
// Build the crypto-asset fraud-response catalog under assets/crypto-catalog/.
// Source of truth: assets/crypto-catalog-src/{exchanges.json,country-procedures.json}
// — curated, sourced records (every record cites URLs actually visited during
// collection). Static output: plain JSON + IPLD-style blocks (same codec as the
// security-data pipeline).
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../assets/crypto-catalog-src');
const out = resolve(here, '../assets/crypto-catalog');
mkdirSync(out + '/blocks', {recursive: true});

const digest = b => createHash('sha256').update(b).digest();
function b32(bytes) {
  let bits = 0, value = 0, result = '';
  for (const n of bytes) {
    value = (value << 8) | n; bits += 8;
    while (bits >= 5) { result += 'abcdefghijklmnopqrstuvwxyz234567'[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) result += 'abcdefghijklmnopqrstuvwxyz234567'[(value << (5 - bits)) & 31];
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
  blockIndex[cid] = {path: '/crypto-data/crypto/' + path, bytes: bytes.length, codec: codec === 0x55 ? 'raw' : 'dag-json'};
  return {'/': cid};
}
const dag = value => block(Buffer.from(canonical(value)), 0x129);

const generatedAt = process.env.CRYPTO_GENERATED_AT || new Date().toISOString();

const exchanges = JSON.parse(readFileSync(src + '/exchanges.json', 'utf8'));
const procedures = JSON.parse(readFileSync(src + '/country-procedures.json', 'utf8'));

// ---- integrity checks ----
const seen = new Set();
for (const e of exchanges) {
  if (!e.id || !e.name || !e.hq_country || !e.website) throw new Error(`exchange missing required fields: ${JSON.stringify(e).slice(0, 120)}`);
  if (seen.has(e.id)) throw new Error('duplicate exchange id: ' + e.id);
  seen.add(e.id);
  if (!Array.isArray(e.sources) || !e.sources.length) throw new Error(`exchange ${e.id} has no sources`);
}
const pseen = new Set();
for (const p of procedures) {
  if (!p.id || !p.country || !Array.isArray(p.steps) || !p.steps.length) throw new Error(`procedure missing required fields: ${p.id}`);
  if (pseen.has(p.id)) throw new Error('duplicate procedure id: ' + p.id);
  pseen.add(p.id);
  if (!Array.isArray(p.sources) || !p.sources.length) throw new Error(`procedure ${p.id} has no sources`);
}

// ---- per-record blocks ----
const exIndex = exchanges.map(e => {
  const rec = dag(e);
  return {id: e.id, name: e.name, hq_country: e.hq_country, countries: e.countries_operating || [],
          regulator: e.regulator || '', abuse_contact: e.abuse_contact || '', abuse_contact_url: e.abuse_contact_url || '',
          website: e.website, record: rec};
});
const procIndex = procedures.map(p => {
  const rec = dag(p);
  return {id: p.id, country: p.country, title: p.title, desks: (p.desks || []).length, steps: p.steps.length, record: rec};
});

const index = {
  generatedAt,
  'source/kind': 'kotoba.cloud crypto-asset fraud-response catalog',
  exchangeCount: exchanges.length,
  procedureCount: procedures.length,
  exchanges: exIndex,
  procedures: procIndex,
  blocks: blockIndex
};
writeFileSync(out + '/index.json', JSON.stringify(index));
writeFileSync(out + '/exchanges.json', JSON.stringify({exchanges}));
writeFileSync(out + '/procedures.json', JSON.stringify({procedures}));
console.log(`crypto catalog: ${exchanges.length} exchanges, ${procedures.length} procedures, ${Object.keys(blockIndex).length + 3} files`);
