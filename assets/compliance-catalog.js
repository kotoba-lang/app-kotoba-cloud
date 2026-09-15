/* Compliance & vulnerability-product catalog browser.
   Data: /compliance-data/compliance/index.json (DAG-JSON blocks, codec 0x0129). */
(function () {
  'use strict';
  var DATA_URL = '/compliance-data/compliance/index.json';
  var state = { data: null, tab: 'products', query: '' };

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function matches(text) {
    if (!state.query) return true;
    var q = state.query.toLowerCase();
    return (text || '').toLowerCase().indexOf(q) !== -1;
  }

  function render() {
    var data = state.data;
    var list = $('kcp-results');
    var detail = $('kcp-detail');
    var summary = $('kcp-summary');
    if (!data || !list || !detail) return;
    list.textContent = '';
    detail.textContent = '';
    if (summary) {
      summary.textContent = data.frameworkCount + ' 基準 / ' + data.categoryCount + ' カテゴリ / ' + data.productCount + ' プロダクト — ' + (data.ontology ? data.ontology.claims + ' オントロジーclaims' : '') + ' — head CID ' + (data.head ? data.head['/'] : '') + ' (生成 ' + data.generatedAt + ')';
    }
    var count = 0;
    if (state.tab === 'categories') {
      data.categories.forEach(function (c) {
        if (!matches(c.name) && !matches(c['name-ja']) && !matches(c.desc)) return;
        count++;
        var li = el('li', 'kc-comp-row');
        var btn = el('button', 'kc-comp-row__btn');
        var o = data.ontologyCategories ? data.ontologyCategories[c.id] : null;
        btn.appendChild(el('span', 'kc-comp-row__name', c.name + ' / ' + (c['name-ja'] || '')));
        btn.appendChild(el('span', 'kc-comp-row__meta', (o && o.csf ? o.csf.length : 0) + ' CSF サブカテゴリ · ' + (o && o.addresses ? o.addresses.length : 0) + ' 脅威クラス · ' + c.desc));
        btn.addEventListener('click', function () { showCategory(data, c.id, detail); });
        li.appendChild(btn);
        list.appendChild(li);
      });
    } else if (state.tab === 'frameworks') {
      data.frameworks.forEach(function (f) {
        if (!matches(f.name) && !matches(f.publisher)) return;
        count++;
        var li = el('li', 'kc-comp-row');
        var btn = el('button', 'kc-comp-row__btn');
        btn.appendChild(el('span', 'kc-comp-row__name', f.name));
        btn.appendChild(el('span', 'kc-comp-row__meta', f.kind + ' · ' + f.publisher + ' · ' + f.jurisdiction.join(', ')));
        btn.addEventListener('click', function () { showFramework(data, f.id, detail); });
        li.appendChild(btn);
        list.appendChild(li);
      });
    } else {
      var cats = {};
      (data.categories || []).forEach(function (c) { cats[c.id] = c.name + ' / ' + (c['name-ja'] || ''); });
      data.products.forEach(function (p) {
        if (!matches(p.name) && !matches(p.provider)) return;
        count++;
        var li = el('li', 'kc-comp-row');
        var btn = el('button', 'kc-comp-row__btn');
        btn.appendChild(el('span', 'kc-comp-row__name', p.name));
        btn.appendChild(el('span', 'kc-comp-row__meta', (cats[p.categoryId] || p.categoryId) + ' · ' + p.provider + ' (' + p.providerHq + ') · ' + (p.pricingMode === 'public-list' ? '公開価格' : p.pricingMode === 'quote-based' ? '見積り' : p.pricingMode)));
        btn.addEventListener('click', function () { showProduct(data, p.id, detail); });
        li.appendChild(btn);
        list.appendChild(li);
      });
    }
    if (!count) list.appendChild(el('li', 'kc-comp-empty', '該当なし'));
  }

  function showCategory(data, id, detail) {
    var c = null;
    (data.categories || []).forEach(function (x) { if (x.id === id) c = x; });
    if (!c) return;
    var o = data.ontologyCategories ? data.ontologyCategories[id] : null;
    var labels = data.ontology ? data.ontology.csf2Labels : {};
    var box = el('div', 'kc-comp-detail');
    box.appendChild(el('h3', null, c.name + ' / ' + (c['name-ja'] || '')));
    box.appendChild(el('p', null, c.desc || ''));
    if (o && o.addresses && o.addresses.length) {
      box.appendChild(el('h4', null, '対応する脆弱性・脅威クラス (addresses)'));
      var ul1 = el('ul');
      o.addresses.forEach(function (a) { ul1.appendChild(el('li', null, a)); });
      box.appendChild(ul1);
    }
    if (o && o.csf && o.csf.length) {
      box.appendChild(el('h4', null, 'NIST CSF 2.0 サブカテゴリ対応'));
      var ul2 = el('ul');
      o.csf.forEach(function (s) { ul2.appendChild(el('li', null, s + ' — ' + (labels[s] || ''))); });
      box.appendChild(ul2);
    }
    detail.textContent = '';
    detail.appendChild(box);
  }

  function showFramework(data, id, detail) {
    var f = null;
    data.frameworks.forEach(function (x) { if (x.id === id) f = x; });
    if (!f) return;
    detail.textContent = '';
    var box = el('div', 'kc-comp-detail');
    box.appendChild(el('h3', null, f.name));
    box.appendChild(el('p', null, '発行: ' + f.publisher + ' — 管轄: ' + f.jurisdiction.join(', ')));
    box.appendChild(el('p', null, '種別: ' + f.kind));
    box.appendChild(el('p', null, f.scope || ''));
    var link = el('a', null, '出典 (source) を開く');
    link.href = f.sourceUrl;
    link.rel = 'noopener';
    link.target = '_blank';
    box.appendChild(el('p')).appendChild(link);
    detail.appendChild(box);
  }

  function showProduct(data, id, detail) {
    var p = null;
    data.products.forEach(function (x) { if (x.id === id) p = x; });
    if (!p) return;
    var box = el('div', 'kc-comp-detail');
    box.appendChild(el('h3', null, p.name));
    box.appendChild(el('p', null, 'プロバイダ: ' + p.provider + ' (本社: ' + p.providerHq + ')'));
    box.appendChild(el('p', null, '価格: ' + (p.pricingMode === 'public-list' ? '公開価格 — ' + (p.pricingNote || '') : p.pricingMode === 'quote-based' ? '見積り — ' + (p.pricingNote || '') : (p.pricingNote || ''))));
    if (p.complianceFits && p.complianceFits.length) {
      box.appendChild(el('p', null, '適合支援フレームワーク: ' + p.complianceFits.join(', ')));
    }
    var cats = {};
    (data.categories || []).forEach(function (c) { cats[c.id] = c; });
    var cat = cats[p.categoryId];
    var oc = data.ontologyCategories ? data.ontologyCategories[p.categoryId] : null;
    if (cat && oc) {
      box.appendChild(el('p', null, 'カテゴリ: ' + cat.name + ' / ' + (cat['name-ja'] || '')));
      box.appendChild(el('h4', null, 'このカテゴリが対応する脆弱性・脅威クラス'));
      var ul3 = el('ul');
      oc.addresses.forEach(function (a) { ul3.appendChild(el('li', null, a)); });
      box.appendChild(ul3);
      box.appendChild(el('h4', null, 'NIST CSF 2.0 サブカテゴリ (カテゴリ経由で transitive)'));
      var labels = data.ontology ? data.ontology.csf2Labels : {};
      var ul4 = el('ul');
      oc.csf.forEach(function (s) { ul4.appendChild(el('li', null, s + ' — ' + (labels[s] || ''))); });
      box.appendChild(ul4);
    }
    var link = el('a', null, '価格・公式ページ (出典) を開く');
    link.href = p.pricingUrl;
    link.rel = 'noopener';
    link.target = '_blank';
    box.appendChild(el('p')).appendChild(link);
    detail.textContent = '';
    detail.appendChild(box);
  }

  function init() {
    var tabs = $('kcp-tabs');
    if (!tabs) return; // page not present
    [['products', '製品'], ['categories', 'カテゴリ'], ['frameworks', '基準']].forEach(function (pair) {
      var b = el('button', 'ck-catalog__tab', pair[1]);
      b.type = 'button';
      b.setAttribute('aria-pressed', state.tab === pair[0] ? 'true' : 'false');
      b.addEventListener('click', function () {
        state.tab = pair[0];
        Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (t) {
          t.setAttribute('aria-pressed', t === b ? 'true' : 'false');
        });
        render();
      });
      tabs.appendChild(b);
    });
    var search = $('kcp-search');
    if (search) search.addEventListener('input', function () { state.query = search.value || ''; render(); });
    fetch(DATA_URL).then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (data) { state.data = data; var s = $('kcp-summary'); if (s) s.textContent = '読み込み完了'; render(); })
      .catch(function () { var s = $('kcp-summary'); if (s) s.textContent = 'データの読み込みに失敗しました ( /compliance-data/compliance/index.json )'; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
