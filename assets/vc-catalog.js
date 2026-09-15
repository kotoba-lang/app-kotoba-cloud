/* VC fund catalog browser (DNX / In-Q-Tel / SYN).
   Data: /vc-data/vc/index.json (DAG-JSON blocks, codec 0x0129). */
(function () {
  'use strict';
  var DATA_URL = '/vc-data/vc/index.json';
  var state = { data: null, tab: 'funds', query: '' };

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function matches() {
    var q = (state.query || '').toLowerCase();
    return function (text) { return !q || (text || '').toLowerCase().indexOf(q) !== -1; };
  }

  function render() {
    var data = state.data;
    var list = $('kcv-results'), detail = $('kcv-detail'), summary = $('kcv-summary');
    if (!data || !list || !detail || !summary) return;
    list.textContent = '';
    detail.textContent = '';
    summary.textContent = data.fundCount + ' funds / ' + data.companyCount + ' companies / '
      + data.claimCount + ' claims · co-investment clusters ' + data.clusterCount
      + ' · head ' + (data.head ? data.head['/'] : '') + ' (生成 ' + data.generatedAt + ')';
    var hit = matches();
    var count = 0;
    function row(name, meta, detailFn) {
      count++;
      var li = el('li', 'kc-vc-row');
      var btn = el('button', 'kc-vc-row__btn');
      btn.type = 'button';
      btn.appendChild(el('span', 'kc-vc-row__name', name));
      btn.appendChild(el('span', 'kc-vc-row__meta', meta));
      btn.addEventListener('click', detailFn);
      li.appendChild(btn);
      list.appendChild(li);
    }
    function detailBlock(title, lines) {
      var box = el('div', 'kc-vc-detail');
      box.appendChild(el('h3', null, title));
      lines.forEach(function (l) { box.appendChild(el('p', null, l)); });
      detail.textContent = '';
      detail.appendChild(box);
    }
    if (state.tab === 'funds') {
      data.funds.forEach(function (f) {
        if (!hit(f.name) && !hit(f.id)) return;
        row(f.name, (f.founded || '') + ' · ' + (f.focus || []).join(', '), function () {
          var lines = [];
          (f.focus || []).forEach(function (z) { lines.push('focus: ' + z); });
          ['aumUsdM', 'portfolioCount', 'corporatePartners', 'stages', 'type', 'model', 'network', 'note'].forEach(function (k) {
            if (f[k] != null) lines.push(k + ': ' + f[k]);
          });
          if (f.hq) lines.push('hq: ' + f.hq.join('; '));
          if (f.fundEntities) lines.push('vehicles: ' + f.fundEntities.join(', '));
          if (f.affiliates) lines.push('affiliates: ' + f.affiliates.join('; '));
          if (f.sourceUrl) lines.push('source: ' + f.sourceUrl + ' (' + f.layer + ')');
          detailBlock(f.name, lines);
        });
      });
    } else if (state.tab === 'companies') {
      data.companies.forEach(function (c) {
        if (!hit(c.name) && !hit(c.domain)) return;
        row(c.name, c.domain, function () {
          var lines = [];
          (c.rounds || []).forEach(function (r) {
            lines.push('round: ' + r.series + (r.usdM ? ' $' + r.usdM + 'M' : '') + ' · ' + (r.date || '')
              + (r.lead ? ' · lead: ' + r.lead : '')
              + (r.participants ? ' · ' + r.participants.join(', ') : '')
              + ' · ' + (r.layer || '') + (r.sourceUrl ? ' · ' + r.sourceUrl : ''));
          });
          if (c.outcome) lines.push('exit: ' + c.outcome.type + ' ' + c.outcome.by
            + (c.outcome.usdB ? ' $' + c.outcome.usdB + 'B' : '') + ' ' + (c.outcome.date || '')
            + ' · ' + (c.outcome.sourceUrl || ''));
          Object.keys(c.fundInvestments || {}).forEach(function (k) {
            lines.push('fund ' + k + ': ' + c.fundInvestments[k]);
          });
          detailBlock(c.name, lines);
        });
      });
    } else if (state.tab === 'relations') {
      data.relations.forEach(function (r) {
        if (!hit(r.s) && !hit(r.o)) return;
        row(r.s + ' → ' + r.o, r.p + (r.via ? ' · ' + r.via : '') + ' · ' + (r.layer || ''), function () {
          detailBlock(r.s + ' → ' + r.o, [r.p + (r.via ? ' · ' + r.via : ''), 'layer: ' + (r.layer || '')]);
        });
      });
    } else {
      (data.systemDynamics || []).concat(data.strategy || []).forEach(function (d) {
        if (!hit(d.name || '') && !hit(d.id) && !hit(d.for || '')) return;
        row(d.id + (d.name ? ' — ' + d.name : ''),
          d.steps ? d.steps.join(' → ') : (d.for ? d.for + ': ' + (d.read || '').slice(0, 80) : (d.notes || []).join(' · ')),
          function () {
            detailBlock(d.id + (d.name ? ' — ' + d.name : ''),
              (d.steps || d.notes || []).concat(d.for ? ['for: ' + d.for] : []).concat(d.read ? ['read: ' + d.read] : []));
          });
      });
      (data.coInvestmentClusters || []).forEach(function (cl) {
        if (!hit(cl.fundA) && !hit(cl.fundB)) return;
        row(cl.fundA + ' × ' + cl.fundB, 'shared: ' + (cl.companies || []).join(', ') + (cl.note ? ' · ' + cl.note : ''), function () {
          detailBlock(cl.fundA + ' × ' + cl.fundB, ['co-invested companies: ' + (cl.companies || []).join(', ')]
            .concat(cl.note ? ['note: ' + cl.note] : []));
        });
      });
    }
    if (!count) list.appendChild(el('li', 'kc-vc-empty', '該当なし'));
  }

  function init() {
    var tabs = $('kcv-tabs');
    if (!tabs) return; // page not present
    [['funds', 'Fund'], ['companies', 'Company'], ['relations', 'Relation'], ['dynamics', 'Dynamics']].forEach(function (pair) {
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
    var search = $('kcv-search');
    if (search) search.addEventListener('input', function () { state.query = search.value || ''; render(); });
    fetch(DATA_URL).then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (data) { state.data = data; render(); })
      .catch(function () { var s = $('kcv-summary'); if (s) s.textContent = 'データの読み込みに失敗しました ( /vc-data/vc/index.json )'; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
