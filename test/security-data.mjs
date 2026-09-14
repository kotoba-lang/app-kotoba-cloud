import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const root='assets/security-data/',manifest=JSON.parse(readFileSync(root+'index.json'));
function decode(text){let bits=0,acc=0,out=[];for(const c of text.slice(1)){const n='abcdefghijklmnopqrstuvwxyz234567'.indexOf(c);assert(n>=0);acc=(acc<<5)|n;bits+=5;if(bits>=8){out.push((acc>>>(bits-8))&255);bits-=8;}}return Buffer.from(out);}
function read(link){const cid=link['/'],meta=manifest.blocks[cid];assert(meta,`missing block ${cid}`);const bytes=readFileSync('assets'+meta.path);const decoded=decode(cid),prefix=meta.codec==='raw'?Buffer.from([1,0x55,0x12,32]):Buffer.from([1,0xa9,2,0x12,32]);assert(decoded.subarray(0,prefix.length).equals(prefix));assert(decoded.subarray(prefix.length).equals(createHash('sha256').update(bytes).digest()),`CID mismatch ${cid}`);assert.equal(bytes.length,meta.bytes);return meta.codec==='raw'?bytes:JSON.parse(bytes);}
for(const cid of Object.keys(manifest.blocks))read({'/':cid});
function links(value){if(!value||typeof value!=='object')return;if(Object.keys(value).length===1&&typeof value['/']==='string'){read(value);return;}for(const v of Object.values(value))links(v);}
const snapshot=read(manifest.head);links(snapshot);for(const c of snapshot.claims){const claim=read(c);assert(claim['claim/source']);assert(['observed-fact','secondary-reported','model-inference','model-prediction'].includes(claim['claim/layer']));links(claim);}
for(const s of snapshot.sources){const source=read(s);if(source.encoding==='gzip'){const raw=gunzipSync(read(source.archive));assert.equal(createHash('sha256').update(raw).digest('hex'),source.decodedSha256);}}
const ids=new Set(manifest.records.map(r=>r['item/id']));for(const r of manifest.relations){assert(ids.has(r.subject));assert(ids.has(r.object));}
const scenario=read(snapshot.scenario);assert.equal(scenario.notEvidenceOfAttack,true);assert(scenario.assumptions.length);assert(scenario.basis.every(id=>ids.has(id)));
const graph=read(snapshot.linkedData);assert.equal(graph['@graph'].length,snapshot.claims.length);assert(graph['@graph'].every(c=>c['prov:wasDerivedFrom']));
const schema=readFileSync(root+'schema.edn','utf8');for(const [,attribute]of read(snapshot.datoms).datoms)assert(schema.includes(':db/ident '+attribute+' '),`undeclared ${attribute}`);
assert.equal(manifest.records.filter(r=>r['item/class'].endsWith('/attack-log')).length,1);
console.log(`Verified ${Object.keys(manifest.blocks).length} CIDs, source decompression, ${snapshot.claims.length} sourced claims, graph joins, schema and scenario separation.`);

const attackSource=snapshot.sources.map(read).find(s=>s['source/id']==='attack');
const objects=JSON.parse(gunzipSync(read(attackSource.archive))).objects;
const valid=o=>!o.revoked&&!o.x_mitre_deprecated;
const external=o=>o.external_references?.find(x=>x.source_name==='mitre-attack')?.external_id;
const groups=objects.filter(o=>o.type==='intrusion-set'&&valid(o)&&external(o));
assert.deepEqual(new Set(manifest.records.filter(r=>r['item/class']==='security/class/actor-group').map(r=>r.identifier)),new Set(groups.map(external)));
const gids=new Set(groups.map(o=>o.id));
const tids=new Set(objects.filter(o=>o.type==='attack-pattern'&&valid(o)&&external(o)).map(o=>o.id));
const expected=objects.filter(o=>o.type==='relationship'&&valid(o)&&o.relationship_type==='uses'&&gids.has(o.source_ref)&&tids.has(o.target_ref));
const reported=snapshot.claims.map(read);
assert.deepEqual(new Set(reported.filter(c=>c['claim/property']==='security/prop/uses').map(c=>c.qualifiers.stixId)),new Set(expected.map(o=>o.id)));
for(const group of groups){const record=manifest.records.find(r=>r.identifier===external(group));assert.deepEqual(record.aliases,group.aliases||[]);}
assert(readFileSync(root+'retrieval.json').length<=524288);
console.log(`Full source coverage: ${groups.length} groups, ${expected.length} uses edges; aliases and retrieval bound verified.`);
