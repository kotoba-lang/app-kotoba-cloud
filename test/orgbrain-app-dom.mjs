// DOM-shim harness: run assets/orgbrain-risk.js + orgbrain-app.js against the
// rendered page's element ids and the real /org-data/index.json. Catches wiring
// bugs (wrong ids, null refs, API misuse) the static grep cannot.
import {readFileSync} from 'node:fs';
import {strict as assert} from 'node:assert';

class El {
  constructor(tag, ns) { this.tagName = tag; this.ns = ns; this.children = []; this.attrs = {}; this.style = {}; this.className = ''; this._text = ''; this.hidden = false; this.listeners = {}; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set innerHTML(v) { this._html = v; }
  get innerHTML() { return this._html || ''; }
  append(...kids) { for (const k of kids) { if (typeof k === 'string') { const t = new El('#text'); t._text = k; this.children.push(t); } else this.children.push(k); } }
  replaceChildren(...kids) { this.children = []; this.append(...kids); }
  remove() {}
  addEventListener(ev, f) { (this.listeners[ev] ||= []).push(f); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  get firstChild() { return this.children[0]; }
  get value() { return this._value || (this.children.length ? '' : ''); }
  set value(v) { this._value = String(v); }
  get selectionStart() { return 0; }
  querySelectorAll(sel) { return []; }
  fire(ev) { for (const f of (this.listeners[ev] || [])) f({}); }
  walk(out = []) { out.push(this); for (const c of this.children) if (c.walk) c.walk(out); return out; }
}

const ids = {};
for (const id of ['orgbrain-main', 'orgbrain-summary', 'orgbrain-tabs', 'orgbrain-process', 'orgbrain-ontology',
                  'orgbrain-raci', 'orgbrain-risk', 'orgbrain-simulate', 'orgbrain-process-select',
                  'orgbrain-process-view', 'orgbrain-element-detail', 'orgbrain-roles-table',
                  'orgbrain-holders-table', 'orgbrain-delegations-list', 'orgbrain-raci-table',
                  'orgbrain-risk-chart', 'orgbrain-risk-composite', 'orgbrain-audit-list',
                  'orgbrain-editor', 'orgbrain-editor-error', 'orgbrain-sim-report', 'orgbrain-sim-delta',
                  'orgbrain-sim-audit', 'orgbrain-sim-reset', 'orgbrain-sim-dl-json', 'orgbrain-sim-dl-edn',
                  'orgbrain-provenance']) ids[id] = new El('div');
ids['orgbrain-process-select'] = new El('select');
ids['orgbrain-editor'] = new El('textarea');

global.document = {
  documentElement: {lang: 'ja'},
  getElementById: id => ids[id] || null,
  createElement: t => new El(t),
  createElementNS: (ns, t) => new El(t, ns),
};
global.window = global;
global.fetch = async url => {
  if (url === '/org-data/index.json') return {ok: true, json: async () => JSON.parse(readFileSync('assets/orgbrain-catalog/index.json', 'utf8'))};
  return {ok: false};
};
global.Blob = class { constructor() {} };
global.URL.createObjectURL = () => 'blob:x';
global.URL.revokeObjectURL = () => {};

// load the two browser scripts in order, exactly like the page does
const riskSrc = readFileSync('assets/orgbrain-risk.js', 'utf8');
const appSrc = readFileSync('assets/orgbrain-app.js', 'utf8');
new Function(riskSrc + '\n' + appSrc + '\nreturn {OrgRisk, window};')();

// wait for the async IIFE (single awaited fetch + sync render)
await new Promise(r => setTimeout(r, 50));

// ---- assertions on the rendered DOM tree ----
const tabs = ids['orgbrain-tabs'].children;
assert.equal(tabs.length, 5, 'five tabs');
const svgRoot = ids['orgbrain-process-view'];
const nodes = svgRoot.walk();
assert.ok(nodes.some(n => n.tagName === 'svg'), 'process svg rendered');
assert.equal(nodes.filter(n => n.tagName === 'rect').length, nodes.filter(n => n.tagName === 'task').length || nodes.filter(n => n.tagName === 'rect').length, 'rect sanity noop');
assert.ok(nodes.filter(n => n.tagName === 'rect').length >= 7, 'tasks as rects (>=7 in incorporation)');
assert.ok(nodes.filter(n => n.tagName === 'circle').length === 2, 'start+end circles');
assert.ok(nodes.filter(n => n.tagName === 'polyline').length >= 9, 'flow polylines');
assert.ok(nodes.some(n => n.tagName === 'path'), 'gateway path drawn');
assert.ok(svgRoot.textContent.includes('委任済み') || svgRoot.textContent.includes('delegated'), 'audit line present: ' + svgRoot.textContent.slice(0, 60));
assert.equal(ids['orgbrain-editor-error'].hidden, true, 'no editor error');
assert.ok(ids['orgbrain-sim-report'].textContent.includes('0.493'), 'simulator composite rendered: ' + ids['orgbrain-sim-report'].textContent);
assert.ok(ids['orgbrain-sim-delta'].textContent.includes('差なし'), 'delta vs reference: none');
assert.equal(ids['orgbrain-sim-audit'].children.length, 2, 'per-process audits');
assert.ok(ids['orgbrain-sim-audit'].children.every(li => li.textContent.includes('7/7')), 'audit 7/7 x2');
assert.ok(ids['orgbrain-provenance'].textContent.includes('7f6a36227'), 'provenance rev shown');
assert.equal(ids['orgbrain-roles-table'].walk().filter(n => n.tagName === 'tr').length, 8, '7 roles + header row');
assert.equal(ids['orgbrain-raci-table'].walk().filter(n => n.tagName === 'tr').length, 9, '8 tasks + header row');
assert.ok(ids['orgbrain-delegations-list'].children.length === 11, '11 delegations listed');

// simulate an edit: CEO concentration change recomputes risk live
ids['orgbrain-editor'].value = JSON.stringify({...JSON.parse(readFileSync('assets/orgbrain-catalog/index.json', 'utf8')).ontology, 'orgbrain/delegations': []}, null, 1);
ids['orgbrain-editor'].fire('input');
await new Promise(r => setTimeout(r, 400));
assert.ok(ids['orgbrain-sim-report'].textContent.includes('0.350') && ids['orgbrain-sim-report'].textContent.includes('moderate'), 'stripping delegations -> composite 0.350 live');
assert.ok(!ids['orgbrain-sim-report'].textContent.includes('null'), 'no null-text artifact');
assert.ok(!ids['orgbrain-editor-error'].hidden === false || ids['orgbrain-editor-error'].textContent === '', 'no error on valid edit');

// broken JSON -> banner, no crash
ids['orgbrain-editor'].value = '{oops';
ids['orgbrain-editor'].fire('input');
await new Promise(r => setTimeout(r, 400));
assert.ok(ids['orgbrain-editor-error'].textContent.includes('JSON'), 'invalid JSON flagged');

console.log('orgbrain-app DOM harness: all assertions passed');
