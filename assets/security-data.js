(async()=>{
 const $=id=>document.getElementById('security-'+id);if(!$('results'))return;
 const chat=document.getElementById('chat-view'),view=document.getElementById('security-view');
 if(chat&&view){const toggle=()=>{const open=location.hash==='#security';chat.hidden=open||location.hash.indexOf('#knowledge')===0;view.hidden=!open;};window.addEventListener('hashchange',toggle);toggle();view.querySelector('nav a').href='#chat';}
 if(chat&&view&&location.hash!=='#security')await new Promise(resolve=>{const start=()=>{if(location.hash==='#security'){window.removeEventListener('hashchange',start);resolve();}};window.addEventListener('hashchange',start);});
 const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 // copy in the document's language: <html lang> is ja for the Japanese emit, everything else reads English
 const lang=document.documentElement.lang,ja=lang==='ja';
 // for every other public locale the document carries the strings, by English (#kc-copy-runtime)
 let R={};try{R=JSON.parse(document.getElementById('kc-copy-runtime')?.textContent||'{}');}catch(_){}
 const t=(j,e)=>ja?j:lang==='en'?e:(R[e]||e);
 const fill=(s,vars)=>Object.entries(vars).reduce((acc,[k,v])=>acc.replace('{'+k+'}',v),s);
 try{
  const response=await fetch('/security-data/index.json');if(!response.ok)throw Error('unavailable');const data=await response.json();
  const url=link=>data.blocks[link['/']].path;
  const link=(label,href)=>{const a=node('a',label);a.href=href;return a;};
  const labels={'vulnerability':t('脆弱性','Vulnerability'),'technique':t('攻撃手法','Technique'),'actor-group':t('グループ','Group'),'historical-group':t('履歴（未確認）','History (unconfirmed)'),'attack-log':t('公開ラボログ','Public lab log'),'standard':'SCAP','threat-model':t('脅威モデル','Threat model')};
  $('summary').replaceChildren(node('span',fill(t('{items}項目 · {claims}件の出典付き主張 · 取得 {date} ','{items} items · {claims} sourced claims · fetched {date} '),{items:data.records.length,claims:data.claims.length,date:data.generatedAt.slice(0,10)})),link(t('スナップショットCID','Snapshot CID'),data.headUrl));
  let selected=0;
  async function detail(record){const request=++selected;const panel=$('detail');panel.hidden=false;panel.replaceChildren(node('h2',record['item/label']),link(t('このレコードのCID','CID of this record'),url(record.record)));
   const r=await fetch(url(record.record));if(!r.ok)throw Error('record unavailable');const value=await r.json();if(request!==selected)return;
   if(chat){const use=node('button',t('この根拠で調べる','Research with this evidence'));use.type='button';use.onclick=()=>{window.dispatchEvent(new CustomEvent('kotoba:research-context',{detail:{id:record['item/id'],label:record['item/label']}}));};panel.append(use);}
   if(value.evidence)panel.append(node('p',t('出典レコードから、元URL・取得日時・原文アーカイブへ辿れます。','The source record leads to the original URL, the fetch time and the archived text.')),link(t('出典とアーカイブ','Source and archive'),url(value.evidence)));
   if(record.historical){panel.append(node('p',fill(t('過去の未確認申告 {count} 件。確認済み被害件数ではありません。','{count} past unconfirmed reports. Not a count of confirmed victims.'),{count:record.historical.count})));for(const [i,page] of record.historical.pages.entries())panel.append(link(fill(t('履歴データ {n} ','History data {n} '),{n:i+1}),url(page)));}
   if(record.rawLog)panel.append(node('p',t('公開されたラボの監査ログです。実際の被害事例ではありません。','A published lab audit log. Not a real incident.')),link(t('監査ログを読む','Read the audit log'),record.rawLog));
   if(value.record)panel.append(node('p',t('このシナリオは分析の雛形で、観測事実ではありません。','This scenario is an analysis template, not an observation.')),link(t('シナリオと仮定','Scenario and assumptions'),url(value.record)));
   const edges=data.relations.filter(e=>e.subject===record['item/id']||e.object===record['item/id']);
   if(edges.length){panel.append(node('h3',t('出典付きの関係','Sourced relations')));const list=node('ul');for(const e of edges){const id=e.subject===record['item/id']?e.object:e.subject;const target=data.records.find(r=>r['item/id']===id);const li=node('li');const b=node('button',`${e.property} · ${target?.['item/label']||id}`);b.type='button';if(target)b.onclick=()=>detail(target).catch(fail);li.append(b);list.append(li);}panel.append(list);}
   panel.append(node('details'));const details=panel.lastChild;details.append(node('summary',t('レコード全体','Full record')),node('pre',JSON.stringify(value,null,2)));panel.focus();
  }
  function render(){const term=$('search').value.toLowerCase(),kind=$('kind').value;const records=data.records.filter(r=>(!kind||r['item/class'].endsWith('/'+kind))&&`${r['item/id']} ${r['item/label']} ${(r.aliases||[]).join(' ')}`.toLowerCase().includes(term));$('results').replaceChildren();for(const r of records){const b=node('button',r['item/label']);b.type='button';b.append(node('small',labels[r['item/class'].split('/').at(-1)]||''));b.onclick=()=>detail(r).catch(fail);$('results').append(b);}if(!records.length)$('results').append(node('p',t('一致する項目はありません。','No matching items.')));}
  function fail(){ $('summary').textContent=t('データを読み込めませんでした。時間をおいて再度開いてください。','Could not load the data. Try again later.'); }
  $('search').oninput=render;$('kind').onchange=render;render();
 }catch(_){$('summary').textContent=t('データを読み込めませんでした。時間をおいて再度開いてください。','Could not load the data. Try again later.');}
})();
