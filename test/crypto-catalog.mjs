import {readFileSync, existsSync} from 'node:fs';
import {strict as assert} from 'node:assert';

const root='assets/crypto-catalog/';
const index=JSON.parse(readFileSync(root+'index.json'));
const exchanges=JSON.parse(readFileSync(root+'exchanges.json')).exchanges;
const procedures=JSON.parse(readFileSync(root+'procedures.json')).procedures;

// corpus shape and counts
assert.ok(Array.isArray(exchanges)&&exchanges.length>=40, 'meaningful exchange corpus');
assert.ok(Array.isArray(procedures)&&procedures.length>=10, 'meaningful procedures corpus');
assert.equal(index.exchangeCount, exchanges.length);
assert.equal(index.procedureCount, procedures.length);
assert.equal(index.exchanges.length, exchanges.length);
assert.equal(index.procedures.length, procedures.length);

const exIds=new Set(), procIds=new Set();
for(const e of exchanges){
  for(const f of ['id','name','hq_country','website']) assert.ok(e[f], `${e.id||'?'} missing ${f}`);
  assert.ok(Array.isArray(e.sources)&&e.sources.length, `${e.id} has no sources`);
  for(const u of e.sources) assert.match(u, /^https?:\/\//, e.id+' source url');
  assert.match(e.website, /^https?:\/\//, e.id+' website');
  if(e.abuse_contact_url) assert.match(e.abuse_contact_url, /^https?:\/\//, e.id);
  assert.ok(!exIds.has(e.id), 'dup id '+e.id); exIds.add(e.id);
}
for(const p of procedures){
  for(const f of ['id','country','title']) assert.ok(p[f], `${p.id||'?'} missing ${f}`);
  assert.ok(Array.isArray(p.steps)&&p.steps.length, `${p.id} has no steps`);
  assert.ok(Array.isArray(p.sources)&&p.sources.length, `${p.id} has no sources`);
  for(const d of (p.desks||[])) assert.ok(d.name&&d.url, p.id+' desk incomplete');
  assert.ok(!procIds.has(p.id), 'dup id '+p.id); procIds.add(p.id);
}

// index entries point at real record blocks on disk
for(const item of [...index.exchanges, ...index.procedures]){
  const blk=index.blocks[item.record['/']];
  assert.ok(blk, item.id+' record missing from block index');
  const p=root+blk.path.replace('/crypto-data/crypto/','');
  assert.ok(existsSync(p), 'block file missing: '+p);
  const rec=JSON.parse(readFileSync(p));
  assert.ok(rec.id===item.id, 'block id mismatch for '+item.id);
  assert.ok(rec.sources&&rec.sources.length, item.id+' block has no sources');
}

// index embeds every lookup field the UI reads
for(const e of index.exchanges){
  for(const f of ['id','name','hq_country','regulator','website','record']) assert.ok(e[f]!==undefined, 'index entry missing '+f);
}
for(const p of index.procedures){
  for(const f of ['id','country','title','desks','steps','record']) assert.ok(p[f]!==undefined, 'index entry missing '+f);
}

console.log('crypto catalog tests passed:', exchanges.length, 'exchanges,', procedures.length, 'procedures');
