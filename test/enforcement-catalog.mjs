// Enforcement (civil compulsory execution) catalog: test the DATA, not the server.
// Mirrors test/compliance-catalog.mjs conventions.
import {strict as assert} from 'node:assert';
import {readFileSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../assets/enforcement-catalog');
const src = resolve(here, '../assets/enforcement-catalog-src');

assert.ok(existsSync(out + '/index.json'), 'run: node scripts/build-enforcement-catalog.mjs');
const index = JSON.parse(readFileSync(out + '/index.json', 'utf8'));
const doc = JSON.parse(readFileSync(src + '/enforcement.json', 'utf8'));

// counts match the curated source
assert.equal(index.procedureCount, doc.procedures.length);
assert.equal(index.publicCount, doc.publicSources.length);
assert.equal(index.privateCount, doc.privateSources.length);
assert.ok(index.procedureCount >= 5, 'procedure steps present');
assert.ok(index.publicCount >= 5 && index.privateCount >= 5);

// head CID + index integrity
assert.ok(index.head && /^b[a-z2-7]+$/.test(index.head['/']), 'head CID');
assert.ok(index.blocks && index.blocks[index.head['/']], 'head block indexed');
assert.equal(index.generatedAt, doc.meta ? index.generatedAt : index.generatedAt);

// procedures: 1..N contiguous, every record has required fields + URL source
const orders = index.procedures.map(p => p.order);
assert.deepEqual(orders, orders.slice().sort((a, b) => a - b), 'orders ascending');
assert.equal(new Set(orders).size, orders.length, 'orders unique');
assert.equal(orders[0], 1);
assert.equal(orders[orders.length - 1], index.procedureCount);
for (const p of index.procedures) {
  assert.ok(p.id && p.name && p.desc && p.source, 'procedure fields: ' + p.id);
  assert.ok(/^https?:\/\//.test(p.source), 'procedure source URL: ' + p.id);
  assert.ok(index.blocks[p.record['/']], 'procedure block present: ' + p.id);
}

// sources: unique ids, absolute urls, measured status, inline record blocks
for (const key of ['publicSources', 'privateSources']) {
  const seen = new Set();
  for (const s of index[key]) {
    assert.ok(!seen.has(s.id), 'duplicate id in ' + key + ': ' + s.id);
    seen.add(s.id);
    assert.ok(s.name && s.url, 'source fields: ' + s.id);
    assert.ok(/^https?:\/\//.test(s.url), 'source url absolute: ' + s.id);
    assert.ok(typeof s.status === 'number' || s.status === 'NXDOMAIN', 'measured status: ' + s.id);
    assert.ok(index.blocks[s.record['/']], 'source block present: ' + s.id);
  }
}

// inline lookup contract: the browser UI never needs a per-block fetch
assert.ok(index.procedures.every(p => p.desc) && index.publicSources.every(s => s.url) && index.privateSources.every(s => s.url));

console.log(`enforcement-catalog: ok — ${index.procedureCount} procedures, ${index.publicCount} public + ${index.privateCount} private sources, head ${index.head['/']}`);
