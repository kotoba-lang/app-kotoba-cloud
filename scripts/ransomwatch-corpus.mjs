import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
export function addRansomwatch({dag,block,item,claim,sources}){
 const lock=JSON.parse(readFileSync('data/security/ransomwatch-lock.json'));
 const bytes=readFileSync('data/security/ransomwatch-normalized.json.gz');
 const data=JSON.parse(gunzipSync(bytes));
 const archive=block(bytes);
 const source={'source/id':'ransomwatch','source/url':lock.posts.url,'source/title':'Ransomwatch historical minimal claim metadata','source/publisher':'joshhighet/ransomwatch','source/license':'Unlicense; original third-party posts not republished','source/access':'public','source/retrieved-at':lock.retrievedAt,'source/archived-cid':archive['/'],archive,encoding:'gzip-normalized',sourceVersion:lock.revision,originalHashes:{posts:lock.posts.sha256,groups:lock.groups.sha256},registryUrl:lock.groups.url,licenseUrl:lock.license.url,license: block(readFileSync('assets/security-data/RANSOMWATCH-LICENSE.txt')),extraction:'Allowlisted group name, discovered string, row locator and opaque hashes only. No original title, victim identity, site URL or raw response archived.',historical:true,repositoryArchivedAt:'2026-03-03'};
 sources.push(source);const evidence=dag(source);
 const names=[...new Set([...data.groups,...data.observations.map(p=>p.group)])].sort();let pageCount=0;
 for(const name of names){
  const groupId='security/ransomwatch/'+encodeURIComponent(name);
  const observations=data.observations.filter(p=>p.group===name).sort((a,b)=>a.discovered.localeCompare(b.discovered)||a.id.localeCompare(b.id));
  const pages=[];
  for(let start=0;start<observations.length;start+=32){
   const rows=observations.slice(start,start+32).map(p=>({'claim/id':'security/ransomwatch-observation/'+p.id,'claim/subject':'security/ransomwatch-post/'+p.logicalId,'claim/property':'security/prop/reported-by','claim/value-item':groupId,'claim/layer':'unverified-allegation','claim/source':'ransomwatch',evidence,sourceLocator:{url:lock.posts.url,rows:p.sourceRows},discovered:p.discovered,timeZone:null,eventTime:null,retrievedAt:lock.retrievedAt,confidenceRationale:'Historical aggregator reports an extortion post; no independent corroboration or confirmed compromise.',corrections:[],correctionNote:'No correction asserted; source title changes cannot be reconciled automatically.'}));
   const datoms=rows.flatMap(r=>Object.entries(r).filter(([k])=>k.includes('/')).map(([k,v])=>[r['claim/id'],':'+k,v]));
   const graph=rows.map(r=>({'@id':r['claim/id'],'@type':'rdf:Statement','rdf:subject':{'@id':r['claim/subject']},'rdf:predicate':{'@id':'security:reported-by'},'rdf:object':{'@id':groupId},'prov:wasDerivedFrom':{'@id':'https://kotoba.cloud/security-data/blocks/'+evidence['/']+'.json'},'security:layer':r['claim/layer']}));
   const page=dag({version:1,kind:'historical-allegation-page',groupId,source:evidence,claims:rows,datoms,linkedData:{'@context':{rdf:'http://www.w3.org/1999/02/22-rdf-syntax-ns#',prov:'http://www.w3.org/ns/prov#',security:'https://kotoba.cloud/security-data/ontology.jsonld#'},'@graph':graph}});
   pages.push(page);pageCount++;
  }
  const historical={mode:'historical-unverified',count:observations.length,pages,source:evidence,discoveredRange:observations.length?[observations[0].discovered,observations.at(-1).discovered]:null,timeZone:null,eventTime:null,sourceRegistryEntry:data.groups.includes(name),usage:'Counts represent tracker posts, not confirmed victims or incidents. Discovery time has unspecified timezone and is not attack time. No cross-source actor identity merge.'};
  item(groupId,name+' — Ransomwatch 履歴（未確認）','historical-group','ransomwatch',{identifier:name,historical});
  claim(groupId,'historical-post-count',observations.length,'ransomwatch',{meaning:'historical tracker posts, not verified victims or incidents',sourceVersion:lock.revision},false,'secondary-reported');
  if(historical.discoveredRange)claim(groupId,'discovered-range',historical.discoveredRange.join(' / '),'ransomwatch',{timeZone:'unspecified',meaning:'tracker discovery time, not incident time'},false,'secondary-reported');
 }
 return {groups:names.length,registryGroups:data.groups.length,observations:data.observations.length,inputRows:data.inputRows,duplicates:data.duplicates,pages:pageCount,mode:'historical-unverified',sourceVersion:lock.revision,geography:'Tracker-covered groups only; nationality and global completeness not inferred',language:'Original group identifiers retained; no translations',omitted:'Post titles, victim identities, locations, private/leaked contents; no independently confirmed incidents',retrievedAt:lock.retrievedAt};
}
