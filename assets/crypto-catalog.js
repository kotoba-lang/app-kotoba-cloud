(async()=>{
 const $=id=>document.getElementById('kcc-'+id);if(!$('results'))return;
 const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 let data=null,mode='exchanges',selected=null;
 function fail(){$('summary').textContent='データを読み込めませんでした。時間をおいて再度開いてください。';}
 try{
  const res=await fetch('/crypto-data/crypto/index.json');if(!res.ok)throw Error('unavailable');
  data=await res.json();
  const summary=node('span',`${data.exchangeCount}取引所 · ${data.procedureCount}国・地域の手順 · 出典付き公開データ`);
  $('summary').replaceChildren(summary);
  // mode tabs
  for(const [m,label] of [['exchanges','取引所'],['procedures','通報手順']]){
    const b=node('button',label);b.type='button';b.className='kcc-tab';b.setAttribute('aria-pressed',mode===m?'true':'false');
    b.onclick=()=>{mode=m;selected=null;for(const t of document.querySelectorAll('.kcc-tab'))t.setAttribute('aria-pressed',t===b?'true':'false');render();};
    $('tabs').append(b);
  }
  function recLink(item){
    const blk=data.blocks[item.record['/']];
    return blk?Object.assign(node('a','レコードCID（IPLD）'),{href:blk.path,target:'_blank',rel:'noopener'}):null;
  }
  function render(){
    const term=($('search').value||'').toLowerCase();
    $('results').replaceChildren();
    if(mode==='exchanges'){
      const list=data.exchanges.filter(e=>`${e.id} ${e.name} ${e.hq_country} ${e.countries.join(' ')} ${e.regulator}`.toLowerCase().includes(term));
      for(const e of list){
        const b=node('button',e.name);b.type='button';
        b.append(node('small',`${e.hq_country} · ${e.regulator||'規制状況：要確認'}${e.abuse_contact?' · 通報窓口あり':''}`));
        b.onclick=()=>select(e.id);$('results').append(b);
        if(selected===e.id)b.setAttribute('aria-pressed','true');
      }
      if(!list.length)$('results').append(node('p','一致する取引所はありません。'));
    }else{
      const list=data.procedures.filter(p=>`${p.id} ${p.country} ${p.title}`.toLowerCase().includes(term));
      for(const p of list){
        const b=node('button',p.title);b.type='button';
        b.append(node('small',`${p.country} · 窓口 ${p.desks}件 · 手順 ${p.steps}ステップ`));
        b.onclick=()=>select(p.id);$('results').append(b);
        if(selected===p.id)b.setAttribute('aria-pressed','true');
      }
      if(!list.length)$('results').append(node('p','一致する手順はありません。'));
    }
  }
  function select(id){
    selected=id;
    const d=$('detail');d.replaceChildren();d.hidden=false;
    if(mode==='exchanges'){
      const item=data.exchanges.find(x=>x.id===id);if(!item)return;
      const link=recLink(item);
      const read=()=>JSON.parse((async()=>{return ''})()||'{}');
      d.append(node('h3',item.name),node('p',`本社: ${item.hq_country}`));
      if(item.regulator)d.append(node('p','規制: '+item.regulator));
      if(item.abuse_contact)d.append(node('p','通報窓口: '+item.abuse_contact));
      if(item.abuse_contact_url)d.append(Object.assign(node('a','通報フォームを開く'),{href:item.abuse_contact_url,target:'_blank',rel:'noopener'}));
      d.append(node('p'),Object.assign(node('a','公式サイト'),{href:item.website,target:'_blank',rel:'noopener'}));
      if(link)d.append(node('p'),link);
      // full record via fetch
      const blk=data.blocks[item.record['/']];
      if(blk)fetch(blk.path).then(r=>r.json()).then(rec=>{
        if(Array.isArray(rec.countries_operating)&&rec.countries_operating.length)
          d.append(node('p','サービス提供国: '+rec.countries_operating.join('、')));
        if(rec.license_notes)d.append(node('p',rec.license_notes));
        if(Array.isArray(rec.sources)&&rec.sources.length){
          const s=node('details');s.append(node('summary','出典'));
          for(const u of rec.sources)s.append(Object.assign(node('a',u),{href:u,target:'_blank',rel:'noopener'}),node('br'));
          d.append(s);
        }
      }).catch(()=>{});
    }else{
      const item=data.procedures.find(x=>x.id===id);if(!item)return;
      d.append(node('h3',item.title),node('p',item.country));
      const link=recLink(item);if(link)d.append(node('p'),link);
      const blk=data.blocks[item.record['/']];
      if(blk)fetch(blk.path).then(r=>r.json()).then(rec=>{
        if(Array.isArray(rec.desks)&&rec.desks.length){
          const h=node('h4','相談・通報窓口');d.append(h);
          for(const k of rec.desks){
            const a=node('a',k.name);a.href=k.url||'#';a.target='_blank';a.rel='noopener';
            d.append(node('p'),a,node('div',k.role||''));
            if(k.how_to_report)d.append(node('div',k.how_to_report));
          }
        }
        if(Array.isArray(rec.steps)&&rec.steps.length){
          d.append(node('h4','被害時の手順'));
          const ol=node('ol');
          for(const s of rec.steps)ol.append(node('li',s));
          d.append(ol);
        }
        if(Array.isArray(rec.sources)&&rec.sources.length){
          const s=node('details');s.append(node('summary','出典'));
          for(const u of rec.sources)s.append(Object.assign(node('a',u),{href:u,target:'_blank',rel:'noopener'}),node('br'));
          d.append(s);
        }
      }).catch(()=>{});
    }
  }
  $('search').oninput=render;
  render();
  if(mode==='exchanges'&&data.exchanges.length)select(data.exchanges[0].id);
 }catch(_){fail();}
})();
