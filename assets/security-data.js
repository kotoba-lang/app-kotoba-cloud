(async()=>{
 const $=id=>document.getElementById('security-'+id);if(!$('results'))return;
 const chat=document.getElementById('chat-view'),view=document.getElementById('security-view');
 if(chat&&view){const toggle=()=>{const open=location.hash==='#security';chat.hidden=open;view.hidden=!open;};window.addEventListener('hashchange',toggle);toggle();view.querySelector('nav a').href='#chat';}
 if(chat&&view&&location.hash!=='#security')await new Promise(resolve=>{const start=()=>{if(location.hash==='#security'){window.removeEventListener('hashchange',start);resolve();}};window.addEventListener('hashchange',start);});
 const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 try{
  const response=await fetch('/security-data/index.json');if(!response.ok)throw Error('unavailable');const data=await response.json();
  const url=link=>data.blocks[link['/']].path;
  const link=(label,href)=>{const a=node('a',label);a.href=href;return a;};
  const labels={'vulnerability':'脆弱性','technique':'攻撃手法','actor-group':'グループ','attack-log':'公開ラボログ','standard':'SCAP','threat-model':'脅威モデル'};
  $('summary').replaceChildren(node('span',`${data.records.length}項目 · ${data.claims.length}件の出典付き主張 · 取得 ${data.generatedAt.slice(0,10)} `),link('スナップショットCID',data.headUrl));
  let selected=0;
  async function detail(record){const request=++selected;const panel=$('detail');panel.hidden=false;panel.replaceChildren(node('h2',record['item/label']),link('このレコードのCID',url(record.record)));
   const r=await fetch(url(record.record));if(!r.ok)throw Error('record unavailable');const value=await r.json();if(request!==selected)return;
   if(chat){const use=node('button','この根拠で調べる');use.type='button';use.onclick=()=>{window.dispatchEvent(new CustomEvent('kotoba:research-context',{detail:{id:record['item/id'],label:record['item/label']}}));};panel.append(use);}
   if(value.evidence)panel.append(node('p','出典レコードから、元URL・取得日時・原文アーカイブへ辿れます。'),link('出典とアーカイブ',url(value.evidence)));
   if(record.rawLog)panel.append(node('p','公開されたラボの監査ログです。実際の被害事例ではありません。'),link('監査ログを読む',record.rawLog));
   if(value.record)panel.append(node('p','このシナリオは分析の雛形で、観測事実ではありません。'),link('シナリオと仮定',url(value.record)));
   const edges=data.relations.filter(e=>e.subject===record['item/id']||e.object===record['item/id']);
   if(edges.length){panel.append(node('h3','出典付きの関係'));const list=node('ul');for(const e of edges){const id=e.subject===record['item/id']?e.object:e.subject;const target=data.records.find(r=>r['item/id']===id);const li=node('li');const b=node('button',`${e.property} · ${target?.['item/label']||id}`);b.type='button';if(target)b.onclick=()=>detail(target).catch(fail);li.append(b);list.append(li);}panel.append(list);}
   panel.append(node('details'));const details=panel.lastChild;details.append(node('summary','レコード全体'),node('pre',JSON.stringify(value,null,2)));panel.focus();
  }
  function render(){const term=$('search').value.toLowerCase(),kind=$('kind').value;const records=data.records.filter(r=>(!kind||r['item/class'].endsWith('/'+kind))&&`${r['item/id']} ${r['item/label']}`.toLowerCase().includes(term));$('results').replaceChildren();for(const r of records){const b=node('button',r['item/label']);b.type='button';b.append(node('small',labels[r['item/class'].split('/').at(-1)]||''));b.onclick=()=>detail(r).catch(fail);$('results').append(b);}if(!records.length)$('results').append(node('p','一致する項目はありません。'));}
  function fail(){ $('summary').textContent='データを読み込めませんでした。時間をおいて再度開いてください。'; }
  $('search').oninput=render;$('kind').onchange=render;render();
 }catch(_){$('summary').textContent='データを読み込めませんでした。時間をおいて再度開いてください。';}
})();
