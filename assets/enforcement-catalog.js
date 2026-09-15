/* Enforcement (civil compulsory execution) catalog browser.
   Data: /enforcement-data/enforcement/index.json (IPLD blocks + inline index). */
(function () {
  'use strict';
  var DATA_URL = '/enforcement-data/enforcement/index.json';
  var state = { data: null, tab: 'procedures', query: '' };

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
      summary.textContent = data.procedureCount + ' 手続ステップ / ' + data.publicCount + ' 公開データ / ' + data.privateCount + ' 非公開データ — head CID ' + (data.head ? data.head['/'] : '') + ' (検証 ' + data.verified + ')';
    }
    var count = 0;
    if (state.tab === 'procedures') {
      data.procedures.forEach(function (p) {
        if (!matches(p.name) && !matches(p['name-ja']) && !matches(p.desc)) return;
        count++;
        list.appendChild(row(p.order + '. ' + p.name + ' / ' + (p['name-ja'] || ''), p.desc, function () { showProcedure(p, detail); }));
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
    var link = el('a', null, '出典を開く: ' + p.source);
    link.href = p.source; link.rel = 'noopener'; link.target = '_blank';
    box.appendChild(el('p')).appendChild(link);
    detail.textContent = '';
    detail.appendChild(box);
  }

  function showSource(s, detail) {
    var box = el('div', 'kc-comp-detail');
    box.appendChild(el('h3', null, s.name + ' / ' + (s['name-ja'] || '')));
    box.appendChild(el('p', null, '種別: ' + (s.id === 'nii' || /^[a-z]+$/.test(s.id) ? '' : '') + ' measured HTTP ' + s.status + ' (2026-09)'));
    var link = el('a', null, s.url);
    link.href = s.url; link.rel = 'noopener'; link.target = '_blank';
    box.appendChild(el('p')).appendChild(link);
    detail.textContent = '';
    detail.appendChild(box);
  }

  function init() {
    var tabs = $('ken-tabs');
    if (!tabs) return; // page not present
    [['procedures', '手続'], ['public', '公開データ'], ['private', '非公開データ']].forEach(function (pair) {
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
