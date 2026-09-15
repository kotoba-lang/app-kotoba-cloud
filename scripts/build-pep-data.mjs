// Build a small normalized PEP snapshot under public/security-data/pep/
// Source: OpenSanctions jp_shugiin (bounded dataset, NOT the 925 MB full peps
// export). The upstream artifact URL is resolved at run time from the catalog
// https://data.opensanctions.org/datasets/latest/index.json (version suffix
// varies; never hardcode it).
//
// License: OpenSanctions data is CC BY-NC 4.0 (non-commercial). Commercial use
// requires a data license from OpenSanctions. This must be stated wherever the
// snapshot is published.
//
// Usage: node scripts/build-pep-data.mjs [dataset=jp_shugiin]
import {writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

const dataset=process.argv[2]||'jp_shugiin';
const catalogUrl='https://data.opensanctions.org/datasets/latest/index.json';
const catalog=await (await fetch(catalogUrl)).json();
const entry=catalog.datasets.find(d=>d.name===dataset);
if(!entry) throw new Error(`dataset ${dataset} not in catalog`);
const res=entry.resources.find(r=>r.name==='entities.ftm.json');
if(!res) throw new Error('entities.ftm.json resource missing');
const artifactUrl=res.url;
console.log(`fetching ${artifactUrl} (version ${entry.version})`);
const lines=(await (await fetch(artifactUrl)).text()).split('\n').filter(Boolean);

const persons=[];
for(const line of lines){
  const e=JSON.parse(line);
  if(e.schema!=='Person')continue;
  const p=e.properties||{};
  persons.push({
    'person/id':e.id,
    'person/name':p.name?.[0]||e.caption,
    'person/name-variants':[...(new Set(p.name||[]))].filter(n=>n!==p.name?.[0]),
    'person/citizenship':p.citizenship||[],
    'person/political-party':p.political||[],
    'person/source-url':p.sourceUrl||[],
    'person/topics':p.topics||[],
    'person/datasets':e.datasets||[],
    'person/last-seen':e.last_seen,
  });
}
const datoms=[];
for(const p of persons)for(const [k,v] of Object.entries(p)){
  if(Array.isArray(v))for(const x of v)datoms.push([p['person/id'],':'+k,String(x)]);
  else datoms.push([p['person/id'],':'+k,String(v)]);
}
const doc={'format':'kotobase-eav-export-v1',
  note:'Three-column EAV facts (normalized OpenSanctions snapshot); not Datomic transaction history. Not yet transacted into the Hyakka single ref.',
  dataset:'pep/'+dataset,
  upstream:{catalog:catalogUrl,dataset,version:entry.version,artifact:artifactUrl},
  personCount:persons.length,datoms};
const body=JSON.stringify(doc,null,1);
const sha256=createHash('sha256').update(body).digest('hex');

const schema=[
 [':person/id',':db/unique',':db.unique/identity'],
 [':person/id',':db/valueType',':db.type/string'],
 [':person/name',':db/valueType',':db.type/string'],
 [':person/name-variants',':db/cardinality',':db.cardinality/many'],
 [':person/citizenship',':db/cardinality',':db.cardinality/many'],
 [':person/political-party',':db/cardinality',':db.cardinality/many'],
 [':person/source-url',':db/cardinality',':db.cardinality/many'],
 [':person/topics',':db/cardinality',':db.cardinality/many'],
 [':person/datasets',':db/cardinality',':db.cardinality/many'],
 [':person/last-seen',':db/valueType',':db.type/instant'],
];
const edn=v=>Array.isArray(v)?'['+v.map(edn).join(' ')+']'
  :(typeof v==='string'&&v.startsWith(':'))?v:JSON.stringify(v);

const out=resolve('public/security-data/pep');
mkdirSync(out,{recursive:true});
writeFileSync(out+'/persons.datoms.json',body+'\n');
writeFileSync(out+'/schema.edn',schema.map(edn).join('\n')+'\n');
writeFileSync(out+'/index.json',JSON.stringify({
  version:1,corpus:'pep',
  snapshot:{upstreamDataset:dataset,upstreamVersion:entry.version,artifactUrl},
  artifactChecksum:res.checksum,
  persons:persons.length,datoms:datoms.length,sha256,
  license:'OpenSanctions data is CC BY-NC 4.0 (non-commercial); commercial use requires a data license from OpenSanctions',
  files:['persons.datoms.json','schema.edn'],
},null,2)+'\n');
console.log(JSON.stringify({persons:persons.length,datoms:datoms.length,sha256:sha256.slice(0,16),out}));
