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
  function records(list, key) {
    // inline lookup tables live in index.json; records resolve lazily
    return list.map(function (row) { return row.record; });
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
      summary.textContent = data.frameworkCount + ' 基準 / ' + data.categoryCount + ' カテゴリ / ' + data.productCount + ' プロダクト — head CID ' + (data.head ? data.head['/'] : '') + ' (生成 ' + data.generatedAt + ')';
    }
    var count = 0;
    if (state.tab === 'frameworks') {
      data.frameworks.forEach(function (f) {
        if (!matches(f.name) && !matches(f.publisher)) return;
        count++;
        var li = el('li', 'kc-comp-row');
        var btn = el('button', 'kc-comp-row__btn');
        btn.appendChild(el('span', 'kc-comp-row__name', f.name));
        btn.appendChild(el('span', 'kc-comp-row__meta', f.kind + ' · ' + f.publisher + ' · ' + f.jurisdiction.join(', ')));
        btn.addEventListener('click', function () { showFramework(data, f.id, list, detail); });
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
        btn.addEventListener('click', function () { showProduct(data, p.id, list, detail); });
        li.appendChild(btn);
        list.appendChild(li);
      });
    }
    if (!count) list.appendChild(el('li', 'kc-comp-empty', '該当なし'));
  }

  function showFramework(data, id, list, detail) {
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

  function showProduct(data, id, list, detail) {
    var p = null;
    data.products.forEach(function (x) { if (x.id === id) p = x; });
    if (!p) return;
    // full record fields (pricing note etc.) ride the index row for public-list data
    var box = el('div', 'kc-comp-detail');
    box.appendChild(el('h3', null, p.name));
    box.appendChild(el('p', null, 'プロバイダ: ' + p.provider + ' (本社: ' + p.providerHq + ')'));
    box.appendChild(el('p', null, '価格: ' + (p.pricingMode === 'public-list' ? '公開価格 — ' + (p.pricingNote || '') : p.pricingMode === 'quote-based' ? '見積り — ' + (p.pricingNote || '') : (p.pricingNote || ''))));
    if (p.complianceFits && p.complianceFits.length) {
      box.appendChild(el('p', null, '適合支援フレームワーク: ' + p.complianceFits.join(', ')));
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
    tabs.addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-tab]');
      if (!btn) return;
      state.tab = btn.getAttribute('data-tab');
      Array.prototype.forEach.call(tabs.querySelectorAll('button[data-tab]'), function (b) {
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });
      render();
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
