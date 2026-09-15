#!/usr/bin/env node
// Build the VC fund catalog under assets/vc-catalog/.
// Source of truth: assets/vc-catalog-src/{funds,companies,relations}.json
// — curated, sourced records (same codec as the compliance-catalog pipeline:
// plain JSON + IPLD-style blocks + ontology.jsonld + relations.json claims).
import {readFileSync, writeFileSync, mkdirSync, rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../assets/vc-catalog-src');
const out = resolve(here, '../assets/vc-catalog');
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
  blockIndex[cid] = {path: '/vc-data/vc/' + path, bytes: bytes.length, codec: codec === 0x55 ? 'raw' : 'dag-json'};
  return {'/': cid};
}
const dag = value => block(Buffer.from(canonical(value)), 0x129);

const generatedAt = process.env.VC_GENERATED_AT || new Date().toISOString();

const {meta, funds} = JSON.parse(readFileSync(src + '/funds.json', 'utf8'));
const {companies} = JSON.parse(readFileSync(src + '/companies.json', 'utf8'));
const {relations, coInvestmentClusters, systemDynamics, strategy} = JSON.parse(readFileSync(src + '/relations.json', 'utf8'));

// ---- integrity checks ----
const fundIds = new Set(funds.map(f => f.id));
const compIds = new Set(companies.map(c => c.id));
for (const f of funds) {
  if (!f.id || !f.name || !f.sourceUrl) throw new Error('fund missing required fields: ' + f.id);
  if (!f.layer) throw new Error('fund ' + f.id + ': layer required (honesty rule)');
}
for (const c of companies) {
  if (!c.id || !c.name) throw new Error('company missing required fields: ' + c.id);
  for (const r of c.rounds || []) if (!r.sourceUrl) throw new Error(`company ${c.id} round ${r.series}: sourceUrl required`);
  for (const k of Object.keys(c.fundInvestments || {})) if (!fundIds.has(k)) throw new Error(`company ${c.id}: unknown fund ${k}`);
}
let claimN = 0;
const claims = [];
function claim(subject, property, value, layer, qualifiers = {}) {
  claims.push({'claim/subject': subject, 'claim/property': property, 'claim/value': value,
               'claim/corpus': meta.corpus, 'claim/rank': 'normal', 'claim/layer': layer, qualifiers});
  claimN++;
}
for (const r of relations) {
  if (r.p === 'invested' && !compIds.has(String(r.o).replace('company/', '')) && !String(r.o).startsWith('company/'))
    throw new Error('relation unknown object: ' + r.o);
  claim(r.s, r.p, r.o, r.layer, r.via ? {via: r.via} : {});
}
writeFileSync(out + '/relations.json', JSON.stringify({corpus: meta.corpus, claims, counts: {claims: claimN}}) + '\n');

// ---- ontology linked-data view ----
const nodes = funds.map(f => ({'@id': 'vc/fund/' + f.id, '@type': 'vc-fund', name: f.name,
  'source-url': f.sourceUrl, layer: f.layer}))
  .concat(companies.map(c => ({'@id': 'vc/company/' + c.id, '@type': 'portfolio-company', name: c.name,
  domain: c.domain})));
writeFileSync(out + '/ontology.jsonld', JSON.stringify({
  '@context': {'vc-fund': 'https://kotoba.cloud/vocab/vc#fund',
               'portfolio-company': 'https://kotoba.cloud/vocab/vc#company',
               'invested': 'https://kotoba.cloud/vocab/vc#invested',
               'acquired-by': 'https://kotoba.cloud/vocab/vc#acquiredBy',
               'co-invested-with': 'https://kotoba.cloud/vocab/vc#coInvestedWith'},
  generatedAt,
  '@graph': nodes
}, null, 1) + '\n');
const ontologyLink = dag({'@id': 'vc/ontology', nodes: nodes.length, claims: claimN});

// ---- index ----
const fundIndex = funds.map(f => ({...f, record: dag(f)}));
const compIndex = companies.map(c => ({...c, record: dag(c)}));
const index = {
  generatedAt,
  'source/kind': meta.kind,
  corpus: meta.corpus,
  verified: meta.verified,
  fundCount: funds.length,
  companyCount: companies.length,
  claimCount: claimN,
  clusterCount: coInvestmentClusters.length,
  ontology: {nodes: nodes.length, claims: claimN, linkedData: ontologyLink},
  funds: fundIndex,
  companies: compIndex,
  relations,
  coInvestmentClusters,
  systemDynamics,
  strategy,
  blocks: blockIndex,
  head: null
};
const head = dag(index);
index.head = head;
writeFileSync(out + '/index.json', JSON.stringify(index, null, 1) + '\n');
console.log(`vc-catalog: ${funds.length} funds, ${companies.length} companies, ${claimN} claims, ${coInvestmentClusters.length} clusters; head ${head['/']}`);
