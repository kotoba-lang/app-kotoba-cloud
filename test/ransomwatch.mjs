import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {normalize} from '../scripts/normalize-ransomwatch.mjs';
const one={group_name:'fixture',post_title:'DO NOT PUBLISH https://private.invalid stolen-password',discovered:'2024-01-01 00:00:00.000000'};
const fixture=normalize([{name:'fixture',locations:['forbidden.onion']}],[one,one,{...one,discovered:'2024-01-02 00:00:00.000000'}]);
assert.equal(fixture.duplicates,1);assert.deepEqual(fixture.observations.map(o=>o.logicalId),[fixture.observations[0].logicalId,fixture.observations[0].logicalId]);
assert(!JSON.stringify(fixture).includes('DO NOT'));assert(!JSON.stringify(fixture).includes('onion'));assert.throws(()=>normalize([{name:'https://bad'}],[]));
const root='assets/security-data/';const m=JSON.parse(readFileSync(root+'index.json'));const read=l=>JSON.parse(readFileSync('assets'+m.blocks[l['/']].path));
const normalized=JSON.parse(gunzipSync(readFileSync('data/security/ransomwatch-normalized.json.gz')));const expected=new Map(normalized.observations.map(o=>[o.id,o]));const seen=new Set();
const history=m.records.filter(r=>r.historical);assert.equal(history.length,new Set([...normalized.groups,...normalized.observations.map(o=>o.group)]).size);
let pages=0;
for(const group of history){let count=0;for(const link of group.historical.pages){pages++;const page=read(link);assert.equal(page.groupId,group['item/id']);assert(page.claims.length<=32);assert(m.blocks[link['/']].bytes<=131072);assert.equal(page.linkedData['@graph'].length,page.claims.length);for(const c of page.claims){
 const id=c['claim/id'].split('/').at(-1),o=expected.get(id);assert(o);assert(!seen.has(id));seen.add(id);count++;
 assert.equal(c['claim/layer'],'unverified-allegation');assert.equal(c['claim/value-item'],group['item/id']);assert.equal(c.eventTime,null);assert.equal(c.timeZone,null);assert.equal(c.discovered,o.discovered);assert.deepEqual(c.sourceLocator.rows,o.sourceRows);assert(c.sourceLocator.url.includes('/'+m.coverage.ransomwatch.sourceVersion+'/posts.json'));assert.deepEqual(c.evidence,group.historical.source);assert(read(c.evidence).originalHashes.posts);assert(c.confidenceRationale.includes('no independent'));assert(!('post_title' in c));
 for(const key of Object.keys(c).filter(k=>k.includes('/')))assert(page.datoms.some(d=>d[0]===c['claim/id']&&d[1]===':'+key&&d[2]===c[key]));
 }}assert.equal(count,group.historical.count);}
assert.equal(seen.size,expected.size);assert.equal(pages,m.coverage.ransomwatch.pages);
const retrieval=JSON.parse(readFileSync(root+'retrieval.json'));for(const r of retrieval.entries.filter(r=>r.kind.endsWith('/historical-group'))){const c=read(r.context);assert.deepEqual(c.snapshot,m.head);assert.equal(c.historical.mode,'historical-unverified');assert(m.blocks[r.context['/']].bytes<=65536);}
const files=readdirSync(root+'blocks');assert(files.length<19000);assert(Math.max(...files.map(f=>statSync(root+'blocks/'+f).size))<25000000);
console.log(`Ransomwatch: ${seen.size} unverified observations in ${pages} bounded pages; provenance, deduplication, privacy allowlist, context and asset budgets passed.`);
