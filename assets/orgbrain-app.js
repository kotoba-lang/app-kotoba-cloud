// orgbrain-app — the management UI for kotoba.cloud/orgs/.
// Renders the ontology / BPMN / RACI / deterministic risk model published at
// /org-data/index.json (source of truth: kotoba-lang/kyber docs/orgbrain).
// All math goes through OrgRisk (assets/orgbrain-risk.js), a deterministic
// port of kyber's org_risk.cljc golden-checked against the Clojure original.
(async () => {
  'use strict';
  const main = document.getElementById('orgbrain-main');
  if (!main) return;
  const ja = document.documentElement.lang === 'ja';
  const $ = id => document.getElementById('orgbrain-' + id);
  const node = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const T = {
    loading: ja ? 'データを読み込んでいます…' : 'Loading data…',
    fail: ja ? 'データを読み込めませんでした。時間をおいて再度開いてください。'
      : 'Could not load the data. Please retry later.',
    tabs: ja ? ['プロセス (BPMN)', 'オントロジー', 'RACI 行列', '運営リスク', 'シミュレーター']
      : ['Processes (BPMN)', 'Ontology', 'RACI matrix', 'Operating risk', 'Simulator'],
    auditOk: ja ? '権限監査: 全タスクの authority-required が actor-role に委任済み' : 'Authority audit: every authority-required is delegated to its actor-role',
    auditFail: ja ? '権限監査: 未委任の authority-required が存在します' : 'Authority audit: some authority-required is NOT delegated',
    role: ja ? '実行者' : 'actor', auth: ja ? '必要権限' : 'authority', sla: ja ? 'SLA(日)' : 'SLA (days)',
    critical: ja ? '重要' : 'critical', levels: ja ? 'レベル' : 'level',
    headcount: ja ? '最小人数' : 'min headcount', authorityHolders: ja ? '権限保持者' : 'authority holders',
    composite: ja ? '総合スコア' : 'composite', weights: ja ? '重み' : 'weights',
    axes: ja ? ['RACI カバレッジ', '権限過集中', '委任チェーン深度', '単一障害点', '承認ギャップ']
      : ['RACI coverage', 'Authority concentration', 'Delegation depth', 'Single point of failure', 'Approval gap'],
    axisHint: ja ? '各軸 0=安全〜1=危険。kyber lg/lg_kyber/graphs/org_risk.cljc と同一の決定論純関数。'
      : 'Each axis 0=safe..1=critical. The same deterministic pure functions as kyber org_risk.cljc.',
    editHint: ja ? 'オントロジー JSON を編集するとリスクと権限監査が即時再計算されます (サーバーには送信されません)。'
      : 'Edit the ontology JSON — risk and the authority audit recompute locally (nothing is sent to a server).',
    invalid: ja ? 'JSON が壊れています' : 'Broken JSON',
    reset: ja ? '参照値に戻す' : 'Reset to reference',
    dlJson: ja ? 'JSON をダウンロード' : 'Download JSON', dlEdn: ja ? 'EDN をダウンロード (kyber への PR 用)' : 'Download EDN (for a kyber PR)',
    downloadXml: ja ? 'BPMN 2.0 XML をダウンロード' : 'Download BPMN 2.0 XML',
    selectProcess: ja ? 'プロセス' : 'Process',
    noTask: ja ? 'タスクをクリックすると詳細を表示します。' : 'Click a task for details.',
    simDelta: ja ? '参照値からの軸差分' : 'axis deltas vs reference',
    delegations: ja ? '委任チェーン' : 'delegation chain', tasks: ja ? '運営タスク' : 'operating tasks',
    raciOf: ja ? 'RACI 割当' : 'RACI assignment',
    provenance: ja ? '出典 (rev 固定・ハッシュ検証可)' : 'provenance (pinned rev, hash-verifiable)'
  };

  let data = null;
  try {
    const res = await fetch('/org-data/index.json');
    if (!res.ok) throw new Error('unavailable');
    data = await res.json();
  } catch (_) {
    $('summary').textContent = T.fail;
    return;
  }

  const ont = data.ontology;
  const roles = ont['orgbrain/roles'] || [];
  const tasks = ont['orgbrain/tasks'] || [];
  const roleIds = roles.map(r => r['orgbrain/role-id']);
  const roleName = id => { const r = roles.find(x => x['orgbrain/role-id'] === id); return r ? (r['orgbrain/name'] || id) : id + (ja ? ' (外部)' : ' (external)'); };
  const AUTHS = ont['orgbrain/authorities'] || [];
  const LEVELS = ont['orgbrain/levels'] || [];
  const refReport = OrgRisk.riskReport(ont, data.weights);
  const refAudits = data.processes.map(p => ({p: p.id, a: OrgRisk.bpmnAuthorityAudit(ont, p)}));

  $('summary').replaceChildren(node('span',
    (ja ? '組織運営をオントロジー × BPMN × 決定論リスクの三層で定義。' : 'Organization operations defined as three layers: ontology × BPMN × deterministic risk.')),
    node('span', ' · '),
    node('span', `${roles.length} roles · ${tasks.length} tasks · ${data.processes.length} processes`));

  // ---- tabs ----
  const panels = ['process', 'ontology', 'raci', 'risk', 'simulate'].map(id => $(id));
  const tabBar = $('tabs');
  T.tabs.forEach((label, i) => {
    const b = node('button', label, 'ob-tab');
    b.type = 'button'; b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
    b.onclick = () => { panels.forEach((p, j) => p.hidden = j !== i); [...tabBar.children].forEach((c, j) => c.setAttribute('aria-pressed', j === i ? 'true' : 'false')); };
    tabBar.append(b);
  });
  panels.forEach((p, j) => p.hidden = j !== 0);

  // ---- process / BPMN SVG ----
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs, parent) => {
    const n = document.createElementNS(svgNS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.append(n);
    return n;
  };
  const sel = $('process-select');
  for (const p of data.processes) {
    const o = node('option', p.name + ' — ' + p.id);
    o.value = p.id; sel.append(o);
  }
  function drawProcess(pid) {
    const p = data.processes.find(x => x.id === pid);
    const wrap = $('process-view');
    wrap.replaceChildren();
    if (!p) return;
    const audit = OrgRisk.bpmnAuthorityAudit(ont, p);
    const bad = new Set(audit.filter(a => !a.ok).map(a => a.element));
    const {bounds, edges, canvas} = p.layout;
    const byId = Object.fromEntries(p.elements.map(e => [e.id, e]));
    const s = svg('svg', {viewBox: `0 0 ${canvas.width} ${canvas.height}`, class: 'ob-svg', role: 'img',
      'aria-label': (ja ? 'BPMN ダイアグラム: ' : 'BPMN diagram: ') + p.name});
    const titleEl = svg('title', {}, s);
    titleEl.textContent = p.name;
    const defs = svg('defs', {}, s);
    defs.innerHTML = '<marker id="ob-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker>';
    for (const ed of edges) {
      const pts = ed.waypoints.map(w => `${w.x},${w.y}`).join(' ');
      svg('polyline', {points: pts, class: 'ob-flow', 'marker-end': 'url(#ob-arrow)'}, s);
    }
    for (const e of p.elements) {
      const b = bounds[e.id];
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      let g = svg('g', {class: 'ob-el ob-' + e.type + (bad.has(e.id) ? ' ob-bad' : ''), tabindex: '0'}, s);
      if (e.type === 'event') svg('circle', {cx, cy, r: b.width / 2, class: e.event === 'start' ? 'ob-start' : 'ob-end'}, g);
      else if (e.type === 'gateway') svg('path', {d: `M${cx} ${b.y}L${b.x + b.width} ${cy}L${cx} ${b.y + b.height}L${b.x} ${cy}Z`, class: 'ob-gw'}, g);
      else svg('rect', {x: b.x, y: b.y, width: b.width, height: b.height, rx: 10, class: 'ob-task' + (e['critical'] ? ' ob-crit' : '')}, g);
      const label = e.name || e.id;
      if (e.type === 'task' || e.type === 'gateway') {
        const lines = String(label).match(/.{1,12}/g) || [label];
        lines.slice(0, 2).forEach((ln, k) => {
          const t = svg('text', {x: cx, y: e.type === 'gateway' ? b.y + b.height + 14 + k * 12 : b.y + 22 + k * 14, class: 'ob-label'}, g);
          t.textContent = ln;
        });
        if (e.type === 'task' && e['actor-role']) {
          const t = svg('text', {x: cx, y: b.y + b.height - 8, class: 'ob-sub'}, g);
          t.textContent = e['actor-role'] + (e['authority-required'] ? ' · ' + e['authority-required'] : '');
        }
      } else {
        const t = svg('text', {x: cx, y: b.y + b.height + 14, class: 'ob-sub'}, g);
        t.textContent = e.event;
      }
      g.addEventListener('click', () => showElement(p, e));
    }
    wrap.append(s);
    const okN = audit.filter(a => a.ok).length;
    const line = node('p');
    line.className = 'ob-audit-line ' + (okN === audit.length ? 'ob-ok' : 'ob-ng');
    line.textContent = (okN === audit.length ? T.auditOk : T.auditFail) + ` — ${okN}/${audit.length}`;
    wrap.append(line);
    const dl = node('a', T.downloadXml);
    dl.className = 'ob-dl ob-dl-xml'; dl.href = p.xml; dl.setAttribute('download', p.id + '.bpmn.xml');
    const ednLink = node('a', ja ? '正本 EDN' : 'source-of-truth EDN');
    ednLink.className = 'ob-dl'; ednLink.href = '/org-data/edn/' + p.source.split('/').pop(); ednLink.setAttribute('download', '');
    wrap.append(dl, ' ', ednLink);
  }
  function showElement(p, e) {
    const d = $('element-detail');
    d.replaceChildren();
    if (e.type !== 'task') { d.append(node('h3', e.id), node('p', e.type + (e.event ? ':' + e.event : '') + (e.gateway ? ':' + e.gateway : ''))); return; }
    d.append(node('h3', e.name || e.id));
    const meta = node('p');
    meta.append(node('strong', roleName(e['actor-role'])), node('span', ' — ' + T.auth + ': ' + (e['authority-required'] || '—') + ' · ' + T.sla + ': ' + e['sla-days']));
    d.append(meta);
    const raci = tasks.filter(t => (t['orgbrain/name'] === e.name) || (t['orgbrain/task-id'] === e.id))[0];
    if (raci) {
      const r = raci['orgbrain/raci'] || {};
      const ul = node('ul');
      for (const k of ['responsible', 'accountable', 'consulted', 'informed'])
        if ((r[k] || []).length) ul.append(node('li', k + ': ' + r[k].map(roleName).join(', ')));
      d.append(node('p', T.raciOf + ' (' + (raci['orgbrain/task-id']) + ')' + (raci['orgbrain/critical?'] ? ' · ' + T.critical : '')), ul);
    }
    const a = OrgRisk.bpmnAuthorityAudit(ont, {elements: [e]})[0];
    if (a) {
      const line = node('p', (a.ok ? '✓ ' : '✗ ') + T.auth + ' :' + a.authority + ' ' + (a.ok ? (ja ? '委任済み → ' : 'delegated to ') + roleName(a.role) : (ja ? '未委任!' : 'NOT delegated!')));
      line.className = a.ok ? 'ob-ok' : 'ob-ng';
      d.append(line);
    }
  }
  $('element-detail').append(node('p', T.noTask, 'ob-muted'));
  sel.onchange = () => drawProcess(sel.value);
  drawProcess(data.processes[0] && data.processes[0].id);
  if (data.processes[0]) showElement(data.processes[0], data.processes[0].elements.find(e => e.type === 'task') || data.processes[0].elements[0]);

  // ---- ontology ----
  (function () {
    const t = $('roles-table');
    const mk = (tag, cells) => { const tr = node('tr'); for (const c of cells) tr.append(node(tag, c)); return tr; };
    const thead = node('thead'); thead.append(mk('th', ['role-id', ja ? 'レベル' : 'level', ja ? '名称' : 'name', T.headcount])); t.append(thead);
    const tbody = node('tbody');
    for (const r of roles) tbody.append(mk('td', [r['orgbrain/role-id'], r['orgbrain/level'], r['orgbrain/name'] || '', String(r['orgbrain/min-headcount'])]));
    t.append(tbody);
    const holders = OrgRisk.authorityHolders(ont);
    const at = $('holders-table');
    at.replaceChildren();
    const athead = node('thead');
    athead.append(mk('th', ['authority'].concat(roleIds.map(String))));
    at.append(athead);
    const abody = node('tbody');
    for (const a of AUTHS) {
      const tr = node('tr');
      tr.append(node('td', a));
      for (const rid of roleIds) {
        const td = node('td', holders[a] && holders[a].has(rid) ? '●' : '·');
        if (holders[a] && holders[a].has(rid)) td.className = 'ob-ok';
        tr.append(td);
      }
      abody.append(tr);
    }
    at.append(abody);
    const dl = $('delegations-list');
    dl.replaceChildren();
    for (const d of (ont['orgbrain/delegations'] || []))
      dl.append(node('li', `${roleName(d['orgbrain/from-role'])} → ${roleName(d['orgbrain/to-role'])}  [:${d['orgbrain/authority']}]`));
  })();

  // ---- RACI ----
  (function () {
    const t = $('raci-table');
    t.replaceChildren();
    const thead = node('thead');
    const hrow = node('tr');
    hrow.append(node('th', ja ? 'タスク' : 'task'));
    for (const rid of roleIds) hrow.append(node('th', rid));
    thead.append(hrow); t.append(thead);
    const tbody = node('tbody');
    for (const tk of tasks) {
      const r = tk['orgbrain/raci'] || {};
      const pos = {};
      for (const [k, ids] of Object.entries(r)) for (const id of ids) (pos[id] || (pos[id] = [])).push(k[0].toUpperCase());
      const tr = node('tr');
      const name = node('td', (tk['orgbrain/name'] || tk['orgbrain/task-id']) + (tk['orgbrain/critical?'] ? ' ★' : ''));
      tr.append(name);
      for (const rid of roleIds) {
        const td = node('td', (pos[rid] || []).join('/'));
        if (pos[rid] && pos[rid].includes('A')) td.className = 'ob-a';
        else if (pos[rid] && pos[rid].includes('R')) td.className = 'ob-r';
        tr.append(td);
      }
      tbody.append(tr);
    }
    t.append(tbody);
  })();

  // ---- risk ----
  function axisBars(report, weights) {
    const wrap = $('risk-chart');
    wrap.replaceChildren();
    const keys = ['raci-coverage', 'authority-concentration', 'delegation-depth', 'single-point-of-failure', 'approval-gap'];
    keys.forEach((k, i) => {
      const v = report.axes[k];
      const row = node('div'); row.className = 'ob-row';
      row.append(node('span', T.axes[i], 'ob-fn'));
      const bar = node('div'); bar.className = 'ob-bar';
      const fill = node('div'); fill.className = 'ob-fill';
      fill.style.width = Math.round(v * 100) + '%';
      fill.style.background = v < 0.2 ? 'var(--hig-palette-green,#1a7f37)' : v < 0.5 ? '#9a6700' : v < 0.8 ? '#bc4c00' : '#cf222e';
      bar.append(fill);
      const count = node('span', v.toFixed(2) + ' · ' + (weights[k] !== undefined ? 'w=' + weights[k] : ''), 'ob-count');
      row.append(bar, count);
      wrap.append(row);
    });
  }
  function riskLine(report, label) {
    const lv = node('p', undefined, 'ob-level ob-level-' + report.level);
    lv.append(node('strong', label + ': ' + report.composite.toFixed(3)), node('span', ' · level: ' + report.level));
    return lv;
  }
  function renderRisk() {
    axisBars(refReport, data.weights);
    $('risk-composite').replaceChildren(riskLine(refReport, T.composite), node('p', T.axisHint, 'ob-muted'));
    const ul = $('audit-list');
    ul.replaceChildren();
    for (const {p, a} of refAudits) {
      const okN = a.filter(x => x.ok).length;
      const li = node('li', `${p}: ${okN}/${a.length} ` + (okN === a.length ? '✓' : '✗ ' + a.filter(x => !x.ok).map(x => x.element).join(', ')));
      li.className = okN === a.length ? 'ob-ok' : 'ob-ng';
      ul.append(li);
    }
  }
  renderRisk();

  // ---- simulator ----
  const editor = $('editor');
  let referenceText = JSON.stringify(ont, null, 1);
  editor.value = referenceText;
  let timer = 0;
  function recompute() {
    const err = $('editor-error');
    let parsed;
    try { parsed = JSON.parse(editor.value); err.textContent = ''; err.hidden = true; }
    catch (e) { err.textContent = T.invalid + ': ' + e.message; err.hidden = false; return; }
    const rep = OrgRisk.riskReport(parsed, data.weights);
    axisBars(rep, data.weights);
    $('sim-report').replaceChildren(riskLine(rep, T.composite));
    const dl = $('sim-delta');
    dl.replaceChildren(node('strong', T.simDelta + ': '));
    const ul = node('ul');
    for (const k in rep.axes) {
      const d0 = rep.axes[k] - refReport.axes[k];
      if (Math.abs(d0) > 1e-12) ul.append(node('li', `${k}: ${refReport.axes[k].toFixed(3)} → ${rep.axes[k].toFixed(3)} (${d0 > 0 ? '+' : ''}${d0.toFixed(3)})`));
    }
    if (!ul.children.length) ul.append(node('li', ja ? '差なし — 参照値と同一' : 'none — identical to reference'));
    dl.append(ul);
    for (const {p, a} of refAudits) {
      const proc = data.processes.find(x => x.id === p);
      const a2 = OrgRisk.bpmnAuthorityAudit(parsed, proc);
      const li = $('audit-' + p) || (() => { const li = node('li'); li.id = 'audit-' + p; $('sim-audit').append(li); return li; })();
      const okN = a2.filter(x => x.ok).length;
      li.textContent = `${p}: ${okN}/${a2.length} ` + (okN === a2.length ? '✓' : '✗ ' + a2.filter(x => !x.ok).map(x => x.element + '[:' + x.authority + '→' + x.role + ']').join(', '));
      li.className = okN === a2.length ? 'ob-ok' : 'ob-ng';
    }
  }
  editor.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(recompute, 250); });
  $('sim-reset').onclick = () => { editor.value = referenceText; recompute(); };
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], {type}));
    const a = Object.assign(document.createElement('a'), {href: url, download: name});
    a.click(); URL.revokeObjectURL(url);
  }
  $('sim-dl-json').onclick = () => download('org-ontology.json', JSON.stringify(ont, null, 2), 'application/json');
  // EDN writer (JSON → the subset the kyber docs use) so exports PR back cleanly.
  function toEdn(v) {
    if (v === null) return 'nil';
    if (typeof v === 'boolean' || typeof v === 'number') return String(v);
    if (typeof v === 'string') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(toEdn).join(' ') + ']';
    if (typeof v === 'object') {
      if (v.$kw) return ':' + v.$kw;
      return '{' + Object.entries(v).map(([k, x]) => (isKeywordKey(k) ? ':' + k : JSON.stringify(k)) + ' ' + toEdn(x)).join('\n  ') + '}';
    }
    throw new Error('unencodable');
  }
  const isKeywordKey = k => /^[a-z!?*+\-.0-9_/]+$/.test(k);
  $('sim-dl-edn').onclick = () => {
    try { const parsed = JSON.parse(editor.value); download('org-ontology.schema.edn', '; exported from kotoba.cloud/orgs/ (source rev ' + data.source.rev.slice(0, 9) + ')\n' + toEdn(parsed) + '\n', 'application/edn'); }
    catch (_) { download('org-ontology.schema.edn', '; exported from kotoba.cloud/orgs/\n' + toEdn(ont) + '\n', 'application/edn'); }
  };
  recompute();

  // ---- provenance ----
  (function () {
    const p = $('provenance');
    p.replaceChildren();
    const a = node('a', `${data.source.repo}@${data.source.rev.slice(0, 9)}`);
    a.href = data.source.url + '/tree/' + data.source.rev + '/docs/orgbrain';
    a.target = '_blank'; a.rel = 'noopener';
    p.append(node('strong', T.provenance + ': '), a,
      node('span', ' · ' + Object.entries(data.source.files).map(([f, h]) => `${f} sha256:${h.sha256.slice(0, 8)}`).join(' · ')));
  })();
})();
