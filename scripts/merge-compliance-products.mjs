#!/usr/bin/env node
// Merge subagent-authored product segments into products.json (curated),
// dedupe ids against the existing corpus, remap stale category ids.
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcFile = resolve(here, '../assets/compliance-catalog-src/products.json');
const doc = JSON.parse(readFileSync(srcFile, 'utf8'));
const existing = doc.products;
const existingIds = new Set(existing.map(p => p.id));
const remap = {threatintel: 'ti'};

const glob = process.argv[2] || '/tmp/compliance-products';
let added = 0, skipped = 0;
const {readdirSync} = await import('node:fs');
const required = ['id', 'provider', 'providerHq', 'name', 'categoryId', 'pricingMode', 'pricingUrl', 'pricingNote'];
for (const file of readdirSync(glob).filter(f => f.endsWith('.json')).sort()) {
  const records = JSON.parse(readFileSync(glob + '/' + file, 'utf8'));
  if (!Array.isArray(records)) throw new Error(file + ' is not an array');
  for (const r of records) {
    for (const k of required) if (!r[k]) throw new Error(`${file}: record missing ${k}: ${JSON.stringify(r).slice(0, 100)}`);
    if (!['public-list', 'quote-based'].includes(r.pricingMode)) throw new Error(`${file}: bad pricingMode ${r.pricingMode} on ${r.id}`);
    r.categoryId = remap[r.categoryId] || r.categoryId;
    if (!r.complianceFits) delete r.complianceFits;
    if (existingIds.has(r.id)) { skipped++; continue; }
    existingIds.add(r.id);
    existing.push(r);
    added++;
  }
  console.log(`${file}: merged`);
}
writeFileSync(srcFile, JSON.stringify({...doc, products: existing}, null, 1) + '\n');
console.log(`products.json: +${added} added, ${skipped} dupes skipped, total ${existing.length}`);
