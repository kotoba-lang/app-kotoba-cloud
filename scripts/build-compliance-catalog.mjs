#!/usr/bin/env node
// Build the compliance & vulnerability-product catalog under assets/compliance-catalog/.
// Source of truth: assets/compliance-catalog-src/{frameworks,categories,products,category-ontology}.json
// — curated, sourced records. Static output: plain JSON + IPLD-style blocks
// (same codec as the security-data pipeline) + ontology artifacts
// (ontology.jsonld + relations.json; CSF 2.0 subcategory ids validated against
// assets/csf2-catalog/subcategories.json at build time).
import {readFileSync, writeFileSync, mkdirSync, rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../assets/compliance-catalog-src');
const out = resolve(here, '../assets/compliance-catalog');
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
  blockIndex[cid] = {path: '/compliance-data/compliance/' + path, bytes: bytes.length, codec: codec === 0x55 ? 'raw' : 'dag-json'};
  return {'/': cid};
}
const dag = value => block(Buffer.from(canonical(value)), 0x129);

const generatedAt = process.env.COMPLIANCE_GENERATED_AT || new Date().toISOString();

const {frameworks, meta} = JSON.parse(readFileSync(src + '/frameworks.json', 'utf8'));
const {categories} = JSON.parse(readFileSync(src + '/categories.json', 'utf8'));
const {products} = JSON.parse(readFileSync(src + '/products.json', 'utf8'));
const ontoDoc = JSON.parse(readFileSync(src + '/category-ontology.json', 'utf8'));
const csfSubcats = JSON.parse(readFileSync(resolve(here, '../assets/csf2-catalog/subcategories.json'), 'utf8'));

// ---- ontology: category → {addresses[], csf[]} ----
const catById = new Map(categories.map(c => [c.id, c]));
const onto = {};
for (const [cid, o] of Object.entries(ontoDoc.categories)) {
  if (!catById.has(cid)) throw new Error('ontology: unknown category ' + cid);
  for (const s of o.csf) if (!csfSubcats[s]) throw new Error(`ontology: category ${cid} references unknown CSF subcategory ${s}`);
  onto[cid] = {addresses: o.addresses, csf: o.csf};
}
for (const c of categories) if (!onto[c.id]) throw new Error('ontology missing for category ' + c.id);

const remap = {threatintel: 'ti'};
for (const p of products) p.categoryId = remap[p.categoryId] || p.categoryId;

// ---- integrity checks ----
const catIds = new Set(categories.map(c => c.id));
const fwIds = new Set(frameworks.map(f => f.id));
const pseen = new Set();
for (const f of frameworks) {
  if (!f.id || !f.name || !f.publisher || !f.sourceUrl) throw new Error('framework missing required fields: ' + f.id);
  if (!Array.isArray(f.jurisdiction) || !f.jurisdiction.length) throw new Error('framework ' + f.id + ' has no jurisdiction');
}
for (const p of products) {
  if (!p.id || !p.name || !p.provider || !p.categoryId) throw new Error('product missing required fields: ' + p.id);
  if (pseen.has(p.id)) throw new Error('duplicate product id: ' + p.id);
  pseen.add(p.id);
  if (!catIds.has(p.categoryId)) throw new Error(`product ${p.id}: unknown category ${p.categoryId}`);
  if (!p.pricingMode || !['public-list', 'quote-based', 'free-open-source'].includes(p.pricingMode)) throw new Error(`product ${p.id}: bad pricingMode`);
  if (!p.pricingNote) throw new Error(`product ${p.id}: pricingNote required (honesty rule)`);
  if (!p.pricingUrl) throw new Error(`product ${p.id}: pricingUrl required`);
  if (p.complianceFits) {
    const ok = p.complianceFits.filter(fw => fwIds.has(fw));
    if (ok.length) p.complianceFits = ok; else delete p.complianceFits;
  }
}
for (const c of categories) {
  if (!c.id || !c.name) throw new Error('category missing required fields');
}

// ---- per-record blocks ----
const fwIndex = frameworks.map(f => ({...f, record: dag(f)}));
const prodIndex = products.map(p => ({...p, record: dag(p)}));

// ---- ontology claims + linked data ----
const claims = [];
let claimN = 0;
function claim(subject, property, value, layer, qualifiers = {}) {
  claims.push({'claim/subject': subject, 'claim/property': property, 'claim/value': value,
               'claim/corpus': meta.corpus, 'claim/rank': 'normal', 'claim/layer': layer, qualifiers});
  claimN++;
}
const ontologyNodes = [];
for (const c of categories) {
  const o = onto[c.id];
  ontologyNodes.push({'@id': 'compliance/category/' + c.id, '@type': 'service-category',
                      'name': c.name, 'name-ja': c['name-ja'], 'description': c.desc,
                      'addresses': o.addresses, 'csf-subcategories': o.csf});
  for (const a of o.addresses) claim('compliance/category/' + c.id, 'compliance/prop/addresses', a, 'authored-ontology');
  for (const s of o.csf) claim('compliance/category/' + c.id, 'csf2/satisfies-subcategory', s, 'authored-ontology', {'csf2/label': csfSubcats[s]});
}
for (const p of products) {
  claim('compliance/product/' + p.id, 'compliance/prop/in-category', 'compliance/category/' + p.categoryId, 'curated-record');
  for (const s of onto[p.categoryId].csf)
    claim('compliance/product/' + p.id, 'csf2/transitively-satisfies-subcategory', s, 'derived-via-category', {'via': 'compliance/category/' + p.categoryId});
}
writeFileSync(out + '/ontology.jsonld', JSON.stringify({
  '@context': {'service-category': 'https://kotoba.cloud/vocab/compliance#service-category',
               'addresses': 'https://kotoba.cloud/vocab/compliance#addresses',
               'csf-subcategories': 'https://kotoba.cloud/vocab/csf2#subcategory'},
  'generatedAt': generatedAt,
  'csf2/subcategory-labels': csfSubcats,
  '@graph': ontologyNodes
}, null, 1) + '\n');
writeFileSync(out + '/relations.json', JSON.stringify({corpus: meta.corpus, claims, counts: {categoryCsfEdges: claimN}}) + '\n');
const ontologyLink = dag({'@id': 'compliance/ontology', nodes: ontologyNodes.length, claims: claimN});

const index = {
  generatedAt,
  'source/kind': meta.kind,
  corpus: meta.corpus,
  verified: meta.verified,
  frameworkCount: frameworks.length,
  categoryCount: categories.length,
  productCount: products.length,
  ontology: {nodes: ontologyNodes.length, claims: claimN, csfSource: 'NIST CSF 2.0 (106 subcategories, validated against assets/csf2-catalog)', linkedData: ontologyLink, csf2Labels: csfSubcats},
  ontologyCategories: onto,
  categories,
  frameworks: fwIndex,
  products: prodIndex,
  blocks: blockIndex,
  head: null
};
const head = dag(index);
index.head = head;
writeFileSync(out + '/index.json', JSON.stringify(index, null, 1) + '\n');
console.log(`compliance-catalog: ${frameworks.length} frameworks, ${categories.length} categories, ${products.length} products, ${claimN} ontology claims; head ${head['/']}`);
