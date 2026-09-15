/* Enforcement (civil compulsory execution) catalog browser.
   Data: /enforcement-data/enforcement/index.json (IPLD blocks + inline index). */
(function () {
  'use strict';
  var DATA_URL = '/enforcement-data/enforcement/index.json';
  var state = { data: null, tab: 'procedures', query: '' };

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = el0(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function el0(tag) { return document.createElement(tag); }
  function matches(text) {
    if (!state.query) return true;
    var q = state.query.toLowerCase();
    return (text || '').toLowerCase().indexOf(q) !== -1;
  }
  function link(url, label) {
    var a = el('a', null, label || url);
    a.href = url; a.rel = 'noopener'; a.target = '_blank';
    return a;
  }

  function row(name, meta, onClick) {
    var li = el('li', 'kc-comp-row');
    var btn = el('button', 'kc-comp-row__btn');
    btn.appendChild(el('span', 'kc-comp-row__name', name));
    btn.appendChild(el('span', 'kc-comp-row__meta', meta));
    btn.addEventListener('click', onClick);
    li.appendChild(btn);
    return li;
  }

  function render() {
    var data = state.data;
    var list = $('ken-results');
    var detail = $('ken-detail');
    var summary = $('ken-summary');
    if (!data || !list || !detail) return;
    list.textContent = '';
    detail.textContent = '';
    if (summary) {
      summary.textContent = '日本 ' + data.procedureCount + ' 手続ステップ / 世界 ' + data.worldCount + ' 法域 / ' + data.publicCount + ' 公開データ / ' + data.privateCount + ' 非公開データ — head CID ' + (data.head ? data.head['/'] : '') + ' (検証 ' + data.verified + ')';
    }
    var count = 0;
    if (state.tab === 'procedures') {
      data.procedures.forEach(function (p) {
        if (!matches(p.name) && !matches(p['name-ja']) && !matches(p.desc)) return;
        count++;
        list.appendChild(row(p.order + '. ' + p.name + ' / ' + (p['name-ja'] || ''), p.desc, function () { showProcedure(p, detail); }));
      });
    } else if (state.tab === 'world') {
      data.world.forEach(function (w) {
        if (!matches(w.name) && !matches(w['name-ja']) && !matches((w.mechanisms || []).join(' '))) return;
        count++;
        list.appendChild(row((w['name-ja'] || '') + ' / ' + w.name, w.mechanisms.length + ' 差押手段 · ' + w.sources.length + ' 公式DB', function () { showWorld(w, detail); }));
      });
    } else if (state.tab === 'public') {
      data.publicSources.forEach(function (s) {
        if (!matches(s.name) && !matches(s['name-ja'])) return;
        count++;
        list.appendChild(row(s.name + ' / ' + (s['name-ja'] || ''), 'HTTP ' + s.status, function () { showSource(s, detail); }));
      });
    } else {
      data.privateSources.forEach(function (s) {
        if (!matches(s.name) && !matches(s['name-ja'])) return;
        count++;
        list.appendChild(row(s.name + ' / ' + (s['name-ja'] || ''), 'HTTP ' + s.status, function () { showSource(s, detail); }));
      });
    }
    if (!count) list.appendChild(el('li', 'kc-comp-empty', '該当なし'));
  }

  function showProcedure(p, detail) {
    var box = el('div', 'kc-comp-detail');
    box.appendChild(el('h3', null, p.order + '. ' + p.name + ' / ' + (p['name-ja'] || '')));
    box.appendChild(el('p', null, p.desc));
    box.appendChild(el('p')).appendChild(link(p.source, '出典を開く: ' + p.source));
    detail.textContent = '';
    detail.appendChild(box);
  }

  function showWorld(w, detail) {
    var box = el('div', 'kc-comp-detail');
    box.appendChild(el('h3', null, (w['name-ja'] || '') + ' / ' + w.name));
    box.appendChild(el('p', 'ken-note', '民事執行・判決執行の主な手段'));
    var ul = el('ul', null, null);
    (w.mechanisms || []).forEach(function (m) { ul.appendChild(el('li', null, m)); });
    box.appendChild(ul);
    box.appendChild(el('p', 'ken-note', '公式データベース (2026-09-16 実測 status)'));
    (w.sources || []).forEach(function (s) {
      var p = el('p', null, null);
      p.appendChild(link(s.url, s.name));
      p.appendChild(document.createTextNode(' — HTTP ' + s.status));
      box.appendChild(p);
    });
    if (w.note) box.appendChild(el('p', null, w.note));
    detail.textContent = '';
    detail.appendChild(box);
  }

  function showSource(s, detail) {
    var box = el('div', 'kc-comp-detail');
    box.appendChild(el('h3', null, s.name + ' / ' + (s['name-ja'] || '')));
    box.appendChild(el('p', null, '実測 HTTP ' + s.status + ' (2026-09-16)'));
    box.appendChild(el('p')).appendChild(link(s.url, s.url));
    detail.textContent = '';
    detail.appendChild(box);
  }

  function init() {
    var tabs = $('ken-tabs');
    if (!tabs) return; // page not present
    [['procedures', '手続 (日本)'], ['world', '世界'], ['public', '公開データ'], ['private', '非公開データ']].forEach(function (pair) {
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
    var search = $('ken-search');
    if (search) search.addEventListener('input', function () { state.query = search.value || ''; render(); });
    fetch(DATA_URL).then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (data) { state.data = data; render(); })
      .catch(function () { var s = $('ken-summary'); if (s) s.textContent = 'データの読み込みに失敗しました ( /enforcement-data/enforcement/index.json )'; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
