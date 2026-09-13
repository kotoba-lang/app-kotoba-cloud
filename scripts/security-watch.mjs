import {readFile,mkdir,writeFile,rename,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
// Source audit only. Publishing uses the reviewed existing corpus builder.
const sources=JSON.parse(await readFile('bots/security-watch/sources.json','utf8'));
const root=resolve(process.env.SECURITY_WATCH_STATE||'.state/security-watch');await mkdir(root,{recursive:true});
let previous={};try{previous=JSON.parse(await readFile(root+'/state.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const report={profile:'kotoba-security-watch',checkedAt:new Date().toISOString(),publication:'not-attempted',sources:[]};
for(const source of sources){
 const old=previous[source.id];
 if(!['current','historical'].includes(source.mode)){report.sources.push({id:source.id,status:source.mode});continue;}
 if(source.mode==='historical'&&old&&Date.now()-Date.parse(old.checkedAt)<7*86400000){report.sources.push({id:source.id,status:'historical-cached',sha256:old.sha256});continue;}
 const body=root+'/'+source.id+'.tmp',headers=body+'.headers';
 const args=['--silent','--show-error','--fail','--max-time','45','--max-filesize',String(source.maxBytes),'--proto','=https','--dump-header',headers,'--output',body];
 if(old?.etag)args.push('--header','If-None-Match: '+old.etag);
 args.push(source.url);
 const result=spawnSync('curl',args,{encoding:'utf8',timeout:50000,maxBuffer:65536});
 try{
  if(result.status!==0)throw Error('download-failed');
  const h=await readFile(headers,'utf8');const code=Number([...h.matchAll(/^HTTP\/\S+\s+(\d+)/gm)].at(-1)?.[1]);
  if(code===304){previous[source.id]={...old,checkedAt:report.checkedAt};report.sources.push({id:source.id,status:'unchanged',sha256:old.sha256});continue;}
  if(code!==200)throw Error('unexpected-http-status');
  const bytes=await readFile(body);if(bytes.length>source.maxBytes)throw Error('size-limit');const value=JSON.parse(bytes);
  if(source.format==='stix-2.1'&&(!Array.isArray(value.objects)||value.type!=='bundle'))throw Error('schema-mismatch');
  if(source.id==='cisa-kev'&&!Array.isArray(value.vulnerabilities))throw Error('schema-mismatch');
  if(source.id.startsWith('ransomwatch-')&&!Array.isArray(value))throw Error('schema-mismatch');
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const summary=source.id==='mitre-enterprise'?{actorClusters:value.objects.filter(x=>x.type==='intrusion-set'&&!x.revoked&&!x.x_mitre_deprecated).length,relationships:value.objects.filter(x=>x.type==='relationship'&&!x.revoked).length}:source.id==='cisa-kev'?{records:value.vulnerabilities.length}: {records:value.length};
  const etag=h.match(/^etag:\s*(.+)$/im)?.[1]?.trim();
  previous[source.id]={sha256,etag,checkedAt:report.checkedAt,url:source.url,mode:source.mode,...summary};
  report.sources.push({id:source.id,status:old?.sha256===sha256?'unchanged':'changed',sha256,mode:source.mode,...summary});
 }catch(e){report.sources.push({id:source.id,status:'failed',reason:e.message,lastGoodSha256:old?.sha256||null});}
 finally{await unlink(body).catch(()=>{});await unlink(headers).catch(()=>{});}
}
await writeFile(root+'/state.next.json',JSON.stringify(previous,null,2)+'\n');await rename(root+'/state.next.json',root+'/state.json');
await writeFile(root+'/latest.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
if(report.sources.some(x=>x.status==='failed'))process.exitCode=1;
