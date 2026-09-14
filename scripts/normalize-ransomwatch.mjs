import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
export const hash=x=>createHash('sha256').update(x).digest('hex');
export function normalize(groups,posts){
 if(!Array.isArray(groups)||!Array.isArray(posts))throw Error('invalid source arrays');
 const name=x=>{if(typeof x!=='string'||! /^[a-zA-Z0-9_. -]{1,100}$/.test(x))throw Error('invalid group identifier');return x;};
 const names=[...new Set(groups.map(g=>name(g.name)))].sort();const seen=new Map();
 posts.forEach((p,row)=>{
  name(p.group_name);if(typeof p.post_title!=='string'||typeof p.discovered!=='string'||!/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d{1,6})?$/.test(p.discovered))throw Error('invalid post metadata');
  const logicalId=hash(JSON.stringify([p.group_name,p.post_title]));
  const id=hash(JSON.stringify([p.group_name,p.post_title,p.discovered]));
  if(seen.has(id)){seen.get(id).sourceRows.push(row);return;}
  seen.set(id,{id,logicalId,group:p.group_name,discovered:p.discovered,sourceRows:[row]});
 });
 const observations=[...seen.values()].sort((a,b)=>a.id.localeCompare(b.id));
 return {version:1,groups:names,observations,inputRows:posts.length,duplicates:posts.length-observations.length,unregisteredGroups:[...new Set(observations.map(p=>p.group).filter(g=>!names.includes(g)))].sort()};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const get=url=>{const r=spawnSync('curl',['-fsS','--proto','=https','--max-time','45','--max-filesize','30000000',url],{maxBuffer:30000000});if(r.status)throw Error('public source download failed');return r.stdout;};
 const meta=JSON.parse(get('https://api.github.com/repos/joshhighet/ransomwatch/commits/main'));if(!/^[a-f0-9]{40}$/.test(meta.sha))throw Error('missing source revision');
 const base='https://raw.githubusercontent.com/joshhighet/ransomwatch/'+meta.sha+'/';
 const groups=get(base+'groups.json'),posts=get(base+'posts.json'),license=get(base+'LICENSE');
 const data=normalize(JSON.parse(groups),JSON.parse(posts));
 const receipt={revision:meta.sha,retrievedAt:new Date().toISOString(),groups:{url:base+'groups.json',sha256:hash(groups)},posts:{url:base+'posts.json',sha256:hash(posts)},license:{url:base+'LICENSE',sha256:hash(license)}};
 writeFileSync('data/security/ransomwatch-normalized.json.gz',gzipSync(JSON.stringify(data),{level:9}));
 writeFileSync('data/security/ransomwatch-lock.json',JSON.stringify(receipt,null,2)+'\n');
 writeFileSync('assets/security-data/RANSOMWATCH-LICENSE.txt',license);
 console.log(JSON.stringify({groups:data.groups.length,observations:data.observations.length,inputRows:data.inputRows,duplicates:data.duplicates,unregisteredGroups:data.unregisteredGroups.length,revision:meta.sha}));
}
