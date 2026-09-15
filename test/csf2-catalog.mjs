import {readFileSync, existsSync} from 'node:fs';
import {strict as assert} from 'node:assert';

const root='assets/csf2-catalog/';
const index=JSON.parse(readFileSync(root+'index.json'));
const subs=JSON.parse(readFileSync(root+'subcategories.json'));

// CSF 2.0 subcategory corpus: 106, six functions, canonical counts
assert.equal(Object.keys(subs).length, 106);
const counts={};
for(const k of Object.keys(subs)){const f=k.split('.')[0];counts[f]=(counts[f]||0)+1;}
assert.deepEqual(counts, {GV:31, ID:21, PR:22, DE:11, RS:13, RC:8});
for(const [k,v] of Object.entries(subs)) assert.ok(typeof v==='string' && v.length>20, k);

// products: id/name/vendor/category/summary/source/csf present, mappings valid
assert.ok(index.productCount>=25, 'catalog has a meaningful number of products');
const ids=new Set();
for(const p of index.products){
  assert.ok(p['product/id'] && p['product/name'] && p['product/vendor'] && p['product/category'] && p['product/source']);
  assert.ok(Array.isArray(p['product/csf']) && p['product/csf'].length>0, p['product/id']);
  for(const c of p['product/csf']) assert.ok(subs[c], `${p['product/id']} maps to unknown ${c}`);
  ids.add(p['product/id']);
}
assert.equal(ids.size, index.products.length, 'unique product ids');

// every product record block resolves on disk
const recordRoot='public';
for(const p of index.products){
  const path=index.blocks[p.record['/']].path;
  assert.ok(existsSync(recordRoot+path) || existsSync(root+path.replace('/security-data/csf2/','')), path);
}

// head block: framework provenance
assert.equal(index['source/framework'].document, 'NIST CSWP 29');
assert.equal(index['source/framework'].subcategoryCount, 106);

// surface: report download wired in page + script
const page=readFileSync('src/app_kotoba_cloud/csf2_site.cljk','utf8');
const js=readFileSync('assets/csf2-catalog.js','utf8');
assert.ok(page.includes('"csf2-report"'), 'report button present in page markup');
assert.ok(page.includes('カバレッジレポートをダウンロード'), 'report button copy');
assert.ok(js.includes("getElementById('csf2-'+id)") && js.includes("$('report')"), 'script wires report button');
assert.ok(js.includes('supportedSubcategories'), 'report includes covered subcategory detail');
assert.ok(js.includes("-coverage.json"), 'download filename names the product');

console.log('csf2 catalog tests passed:', index.products.length, 'products,', Object.keys(subs).length, 'subcategories');
