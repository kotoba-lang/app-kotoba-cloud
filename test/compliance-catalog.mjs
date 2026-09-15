// Compliance & vulnerability-product catalog: test the DATA, not the server.
// Mirrors test/csf2-catalog.mjs / test/crypto-catalog.mjs conventions.
import {strict as assert} from 'node:assert';
import {readFileSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../assets/compliance-catalog');
const src = resolve(here, '../assets/compliance-catalog-src');

const index = JSON.parse(readFileSync(out + '/index.json', 'utf8'));
const fwDoc = JSON.parse(readFileSync(src + '/frameworks.json', 'utf8'));
const frameworks = fwDoc.frameworks;
const categories = JSON.parse(readFileSync(src + '/categories.json', 'utf8')).categories;
const products = JSON.parse(readFileSync(src + '/products.json', 'utf8')).products;

// counts + head CID present
assert.equal(index.frameworkCount, frameworks.length);
assert.equal(index.productCount, products.length);
assert.equal(index.categoryCount, categories.length);
assert.match(index.head['/'], /^baguq[a-z2-7]+$/);
assert.ok(index.generatedAt.length > 0);

// every index row resolves to a real block file on disk + full fields inline
for (const row of [...index.frameworks, ...index.products]) {
  assert.ok(row.record && row.record['/'], 'row without record: ' + row.id);
  const path = out + '/blocks/' + row.record['/'] + '.json';
  assert.ok(existsSync(path), 'missing block for ' + row.id + ' at ' + path);
}
// inline lookup contract: the browser UI reads these WITHOUT fetching head blocks
for (const p of index.products) {
  assert.ok(p.pricingNote && p.pricingUrl, 'product ' + p.id + ' missing pricing fields in index');
  assert.ok(p.providerHq, 'product ' + p.id + ' missing providerHq');
}
for (const f of index.frameworks) {
  assert.ok(f.sourceUrl && f.scope, 'framework ' + f.id + ' missing source fields in index');
}

// mapping integrity: every complianceFits id exists in the framework corpus
const fwIds = new Set(frameworks.map(f => f.id));
const catIds = new Set(categories.map(c => c.id));
for (const p of products) {
  assert.ok(catIds.has(p.categoryId), 'unknown category: ' + p.categoryId);
  for (const fw of p.complianceFits || []) assert.ok(fwIds.has(fw), p.id + ' references unknown framework ' + fw);
}
// unique ids + unique name|provider
assert.equal(new Set(products.map(p => p.id)).size, products.length);
assert.equal(new Set(frameworks.map(f => f.id)).size, frameworks.length);
assert.equal(new Set(products.map(p => p.name + '|' + p.provider)).size, products.length, 'duplicate name+provider record');
// honesty: every product states its pricing mode
for (const p of products) assert.ok(['public-list', 'quote-based'].includes(p.pricingMode), p.id);

// ontology integrity: every category mapped, every csf id valid against the csf2 catalog
const onto = JSON.parse(readFileSync(src + '/category-ontology.json', 'utf8')).categories;
const csfSubcats = Object.keys(JSON.parse(readFileSync(resolve(here, '../assets/csf2-catalog/subcategories.json'), 'utf8')));
const csfSet = new Set(csfSubcats);
assert.equal(Object.keys(onto).length, categories.length, 'ontology must cover every category');
for (const [cid, o] of Object.entries(onto)) {
  assert.ok(catIds.has(cid), 'ontology category not in catalog: ' + cid);
  assert.ok(o.addresses.length >= 2 && o.csf.length >= 2, 'ontology too thin: ' + cid);
  for (const s of o.csf) assert.ok(csfSet.has(s), 'unknown CSF id ' + s + ' on ' + cid);
}
const indexOnto = JSON.parse(readFileSync(out + '/index.json', 'utf8')).ontologyCategories;
assert.deepEqual(indexOnto, onto, 'index.json ontologyCategories must mirror the source file');
assert.ok(existsSync(out + '/ontology.jsonld') && existsSync(out + '/relations.json'), 'ontology artifacts missing');
const rel = JSON.parse(readFileSync(out + '/relations.json', 'utf8'));
assert.ok(rel.claims.length > products.length, 'claims must cover product edges');

console.log('compliance-catalog test: OK —', frameworks.length, 'frameworks,', products.length, 'products,', categories.length, 'categories,', rel.claims.length, 'ontology claims');
