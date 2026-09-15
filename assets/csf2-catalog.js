(async()=>{
 const $=id=>document.getElementById('csf2-'+id);if(!$('results'))return;
 const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const fns={GV:'ガバナ',ID:'特定',PR:'防御',DE:'検知',RS:'対応',RC:'復旧'};
 const fnColors={GV:'#5e5971',ID:'#0b57a4',PR:'#1a7f37',DE:'#9a6700',RS:'#bc4c00',RC:'#8250df'};
 let data=null,selected=null;
 function fail(){$('summary').textContent='データを読み込めませんでした。時間をおいて再度開いてください。';}
 try{
  const res=await fetch('/security-data/csf2/index.json');if(!res.ok)throw Error('unavailable');
  data=await res.json();
  const subs=data.subcategories;
  const subIds=Object.keys(subs);
  $('summary').replaceChildren(node('span',`${data.productCount}製品 · CSF 2.0 の ${data.subcategoryCount}サブカテゴリ · 出典 `),
    Object.assign(node('a','NIST CSWP 29'),{href:data['source/framework'].url,target:'_blank',rel:'noopener'}));
  // ---- product list ----
  const cats=[...new Set(data.products.map(p=>p['product/category']))];
  for(const c of cats)$('kind').append(Object.assign(node('option',c),{value:c}));
  function render(){
    const term=($('search').value||'').toLowerCase(),cat=($('kind')&&$('kind').value)||'';
    const list=data.products.filter(p=>(!cat||p['product/category']===cat)&&
      `${p['product/id']} ${p['product/name']} ${p['product/vendor']} ${p['product/category']}`.toLowerCase().includes(term));
    $('results').replaceChildren();
    for(const p of list){
      const b=node('button',p['product/name']);b.type='button';
      b.append(node('small',`${p['product/vendor']} · ${p['product/category']} · ${p['product/csf'].length}サブカテゴリ`));
      b.onclick=()=>select(p['product/id']);$('results').append(b);
      if(selected===p['product/id'])b.setAttribute('aria-pressed','true');
    }
    if(!list.length)$('results').append(node('p','一致する製品はありません。'));
  }
  // ---- coverage chart ----
  function chart(pid){
    const p=data.products.find(x=>x['product/id']===pid);if(!p)return;
    const covered=new Set(p['product/csf']);
    const byFn={};for(const id of subIds){const fn=id.split('.')[0];(byFn[fn]??=[]).push(id);}
    const wrap=$('chart');wrap.replaceChildren();
    for(const fn of ['GV','ID','PR','DE','RS','RC']){
      const ids=byFn[fn]||[];const cov=ids.filter(i=>covered.has(i)).length;
      const row=node('div');row.className='csf2-row';
      const label=node('span');label.className='csf2-fn';label.textContent=fns[fn]+' '+fn;
      const bar=node('div');bar.className='csf2-bar';const fill=node('div');fill.className='csf2-fill';
      fill.style.width=(ids.length?Math.round(cov/ids.length*100):0)+'%';fill.style.background=fnColors[fn];
      bar.append(fill);
      const count=node('span');count.className='csf2-count';count.textContent=cov+'/'+ids.length;
      row.append(label,bar,count);wrap.append(row);
    }
    const total=subIds.filter(i=>covered.has(i)).length;
    $('coverage').replaceChildren(node('strong',String(total)),node('span',' / '+subIds.length+' サブカテゴリをサポート（表は機能別カバー率）'));
    // subcategory chips
    const chips=$('chips');chips.replaceChildren();
    for(const id of subIds){
      const c=node('span',id);
      c.className='ck-catalog__chip';if(covered.has(id))c.setAttribute('aria-pressed','true');
      c.title=subs[id];
      if(covered.has(id))c.onclick=()=>{const d=$('detail');d.replaceChildren(node('strong',id),node('p',subs[id]));d.hidden=false;};
      chips.append(c);
    }
    // detail
    const d=$('detail');d.replaceChildren();
    d.append(node('h3',p['product/name']),node('p',`${p['product/vendor']} · ${p['product/category']} · ${p['product/platform']}`),node('p',p['product/summary']));
    const src=Object.assign(node('a','出典（ベンダー文書）'),{href:p['product/source'],target:'_blank',rel:'noopener'});
    d.append(node('p'),src);
    const rec=(data.products.find(x=>x['product/id']===pid)||{}).record;
    if(rec&&data.blocks[rec['/']])d.append(Object.assign(node('a','レコードCID（IPLD）'),{href:data.blocks[rec['/']].path,target:'_blank',rel:'noopener'}));
    d.hidden=false;
  }
  function select(pid){selected=pid;chart(pid);render();}
  $('search').oninput=render;$('kind').onchange=render;
  render();
  if(data.products.length)select(data.products[0]['product/id']);
 }catch(_){fail();}
})();
