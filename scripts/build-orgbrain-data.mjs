#!/usr/bin/env node
// Build the orgbrain catalog data under assets/orgbrain-catalog/.
// Source of truth: kotoba-lang/kyber docs/orgbrain/ (ontology schema + BPMN EDN),
// pinned by commit SHA. The kyber Clojure model (lg/lg_kyber/graphs/org_risk.cljc)
// defines the risk math; this script only publishes the data + a BPMN 2.0 (with
// DI interchange) XML rendering of each process. Output is plain JSON + raw EDN
// + XML — no fabricated numbers: the "reference" risk report embedded here is
// computed by assets/orgbrain-risk.js (a deterministic port of org_risk.cljc,
// golden-checked against the Clojure original).
import {readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFile as execFileCb} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve, dirname, basename} from 'node:path';
import {fileURLToPath} from 'node:url';

const execFile = promisify(execFileCb);

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../assets/orgbrain-catalog');

// Pinned provenance — advance surgically (one rev per PR), never silently.
const REV = process.env.ORGBRAIN_REV || '7f6a36227e0be72a9a95d293005be11d880d3cc2';
const REPO = 'kotoba-lang/kyber';
const RAW = `https://raw.githubusercontent.com/${REPO}/${REV}/`;
// The ontology schema is one fixed file; the process set is AUTO-DISCOVERED.
// The orgbrain-maint bot adds one operating process per odd-day extension
// (finance, legal, IT, crisis — ADR-2609142000), and the publication side
// must not need hand-listing: every docs/orgbrain/*.bpmn.edn at the pinned
// rev is published, sorted for byte-deterministic output (owner direction
// 2026-09-16: close the kyber-main → /org-data loop).
const SCHEMA_FILE = 'docs/orgbrain/org-ontology.schema.edn';
// Local-checkout override (offline build): --dir=/path/to/kyber
const dirArg = process.argv.find(a => a.startsWith('--dir='));
const localDir = dirArg ? dirArg.slice(6) : null;

async function listProcessFiles() {
  if (localDir) {
    const dir = resolve(localDir, 'docs/orgbrain');
    if (!existsSync(dir)) throw new Error(`--dir source missing: ${dir}`);
    return readdirSync(dir).filter(f => f.endsWith('.bpmn.edn')).sort()
      .map(f => 'docs/orgbrain/' + f);
  }
  const api = `https://api.github.com/repos/${REPO}/git/trees/${REV}?recursive=1`;
  const pick = tree => (tree.tree || [])
    .filter(e => e.type === 'blob' && e.path.startsWith('docs/orgbrain/') && e.path.endsWith('.bpmn.edn'))
    .map(e => e.path).sort();
  // authenticated gh first (rate limits), unauthenticated REST as fallback
  let lastErr = null;
  for (const run of [
    async () => {
      const {stdout} = await execFile('gh', ['api',
        `repos/${REPO}/git/trees/${REV}?recursive=1`], {maxBuffer: 1 << 24});
      return pick(JSON.parse(stdout));
    },
    async () => {
      const res = await fetch(api, {headers: {'accept': 'application/vnd.github+json',
        'user-agent': 'orgbrain-catalog-build'}});
      if (!res.ok) throw new Error(`tree listing: HTTP ${res.status}`);
      return pick(await res.json());
    }]) {
    try {
      const got = await run();
      if (got.length) return got;
      lastErr = new Error('empty listing');
    } catch (e) { lastErr = e; }
  }
  throw new Error(`orgbrain process discovery failed at ${REV}: ${lastErr && lastErr.message}`);
}

const FILES = [SCHEMA_FILE, ...(await listProcessFiles())];

const sha256 = b => createHash('sha256').update(b).digest('hex');

// ── EDN subset reader (comments, keywords, strings, numbers, vectors, maps) ──
function readEdn(text) {
  let i = 0;
  const isDelim = c => /[\s()\[\]{}",'\\;]/.test(c) || c === undefined;
  function skipWs() {
    for (;;) {
      while (i < text.length && /\s|,/.test(text[i])) i++;
      if (text[i] === ';') { while (i < text.length && text[i] !== '\n') i++; continue; }
      return;
    }
  }
  function value() {
    skipWs();
    const c = text[i];
    if (c === undefined) throw new Error('EDN EOF');
    if (c === '[') { i++; const a = []; for (;;) { skipWs(); if (text[i] === ']') { i++; return a; } a.push(value()); } }
    if (c === '{') { i++; const m = {}; for (;;) { skipWs(); if (text[i] === '}') { i++; return m; } const k = value(); skipWs(); m[keyName(k)] = value(); } }
    if (c === '"') return string();
    if (c === ':') return keyword();
    return atom();
  }
  function string() {
    i++; let s = '';
    while (text[i] !== '"') {
      if (text[i] === '\\') { const e = text[++i]; s += e === 'n' ? '\n' : e === 't' ? '\t' : e; i++; }
      else s += text[i++];
      if (i >= text.length) throw new Error('EDN unterminated string');
    }
    i++; return s;
  }
  function keyword() {
    i++; const j = i;
    while (i < text.length && !isDelim(text[i])) i++;
    return {$kw: text.slice(j, i)};
  }
  function atom() {
    const j = i;
    while (i < text.length && !isDelim(text[i])) i++;
    const t = text.slice(j, i);
    if (t === 'true') return true;
    if (t === 'false') return false;
    if (t === 'nil') return null;
    if (/^-?\d+$/.test(t)) return Number(t);
    if (/^-?\d*\.\d+([eE][+-]?\d+)?$/.test(t)) return Number(t);
    throw new Error(`EDN unsupported token near "${t}" (offset ${j})`);
  }
  const keyName = k => { if (!k || !k.$kw) throw new Error('EDN non-keyword map key'); return k.$kw; };
  const root = value();
  skipWs();
  if (i < text.length) throw new Error('EDN trailing content');
  return stripKw(root);
}
function stripKw(v) {
  if (Array.isArray(v)) return v.map(stripKw);
  if (v && typeof v === 'object') {
    if (v.$kw) return v.$kw;
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = stripKw(x);
    return o;
  }
  return v;
}

// ── fetch (cached to .cache so re-runs are byte-identical without network) ──
async function fetchSource(path) {
  if (localDir) {
    const p = resolve(localDir, path);
    if (!existsSync(p)) throw new Error(`--dir source missing: ${p}`);
    return readFileSync(p);
  }
  const cache = resolve(here, '../.cache/orgbrain');
  mkdirSync(cache, {recursive: true});
  const cf = resolve(cache, `${basename(path)}.${REV.slice(0, 9)}.edn`);
  if (existsSync(cf)) return readFileSync(cf);
  const res = await fetch(RAW + path);
  if (!res.ok) throw new Error(`fetch ${path}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(cf, buf);
  return buf;
}

// ── layered DAG layout (shared geometry for the SVG viewer and the BPMN DI) ──
function layoutProcess(processId, elements, flows) {
  const els = new Map(elements.map(e => [e.id, e]));
  const incoming = new Map(elements.map(e => [e.id, []]));
  const outgoing = new Map(elements.map(e => [e.id, []]));
  flows.forEach(([f, t], n) => {
    if (!els.has(f) || !els.has(t)) throw new Error(`${processId}: flow ${f}->${t} references unknown element`);
    outgoing.get(f).push(n); incoming.get(t).push(n);
  });
  // longest-path layering (graph is a DAG; cycle would throw via topo sort)
  const layer = new Map();
  function layerOf(id, seen) {
    if (layer.has(id)) return layer.get(id);
    if (seen.has(id)) throw new Error(`${processId}: cycle at ${id} — BPMN loops not laid out here`);
    seen.add(id);
    const l = incoming.get(id).length === 0 ? 0 : 1 + Math.max(...incoming.get(id).map(fi => layerOf(flows[fi][0], seen)));
    layer.set(id, l); return l;
  }
  for (const e of elements) layerOf(e.id, new Set());
  const cols = [];
  for (const e of elements) (cols[layer.get(e.id)] ??= []).push(e.id);
  const X = 70, DX = 250, Y = 70, DY = 130;
  const size = t => t === 'task' ? {w: 150, h: 70} : t === 'gateway' ? {w: 50, h: 50} : {w: 36, h: 36};
  const bounds = {};
  let maxRows = 0;
  cols.forEach((ids, l) => {
    maxRows = Math.max(maxRows, ids.length);
    ids.forEach((id, row) => {
      const s = size(els.get(id).type);
      bounds[id] = {x: X + l * DX, y: Y + row * DY + (maxRows === 0 ? 0 : 0), width: s.w, height: s.h, layer: l};
    });
  });
  // vertical centering per column
  for (const ids of cols) {
    const top = Math.min(...ids.map(id => bounds[id].y));
    const bottom = Math.max(...ids.map(id => bounds[id].y + bounds[id].height));
    const shift = (top + bottom) / 2;
    for (const id of ids) bounds[id].y += 350 - shift;
  }
  const edges = flows.map(([f, t], n) => {
    const a = bounds[f], b = bounds[t];
    return {id: `flow-${n + 1}`, from: f, to: t,
      waypoints: [{x: a.x + a.width, y: a.y + a.height / 2}, {x: b.x, y: b.y + b.height / 2}]};
  });
  const xs = Object.values(bounds).map(b => b.x + b.width);
  const ys = Object.values(bounds).map(b => b.y + b.height);
  return {bounds, edges, canvas: {width: Math.max(...xs) + 70, height: Math.max(...ys) + 60}};
}

// ── BPMN 2.0 XML with DI interchange (renderable in any BPMN modeler) ──
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function toXml(process, layout) {
  const els = process.elements;
  const parts = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push('<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" ' +
    'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" ' +
    'xmlns:di="http://www.omg.org/spec/DD/20100524/DI" ' +
    'xmlns:orgbrain="https://kotoba.cloud/orgbrain" ' +
    `id="definitions_${esc(process.id)}" targetNamespace="https://kotoba.cloud/orgbrain" ` +
    `name="${esc(process.name)}">`);
  parts.push(`<process id="${esc(process.id)}" name="${esc(process.name)}" isExecutable="false">`);
  for (const e of els) {
    const id = esc(e.id), name = e.name ? ` name="${esc(e.name)}"` : '';
    if (e.type === 'event' && e.event === 'start') parts.push(`<startEvent id="${id}"${name}/>`);
    else if (e.type === 'event') parts.push(`<endEvent id="${id}"${name}/>`);
    else if (e.type === 'gateway') parts.push(`<exclusiveGateway id="${id}"${name}/>`);
    else {
      parts.push(`<task id="${id}"${name}>`);
      parts.push('<extensions>');
      parts.push(`<orgbrain:attributes${e['actor-role'] ? ` orgbrain:actorRole="${esc(e['actor-role'])}"` : ''}` +
        `${e['authority-required'] ? ` orgbrain:authorityRequired="${esc(e['authority-required'])}"` : ''}` +
        `${e['sla-days'] !== undefined ? ` orgbrain:slaDays="${e['sla-days']}"` : ''}/>`);
      parts.push('</extensions>');
      if (e.name) parts.push(`<documentation>${esc(e.name)}</documentation>`);
      parts.push('</task>');
    }
  }
  for (const ed of layout.edges)
    parts.push(`<sequenceFlow id="${ed.id}" sourceRef="${esc(ed.from)}" targetRef="${esc(ed.to)}"/>`);
  parts.push('</process>');
  parts.push(`<bpmndi:BPMNDiagram id="diagram_${esc(process.id)}"><bpmndi:BPMNPlane bpmnElement="${esc(process.id)}">`);
  for (const e of els) {
    const b = layout.bounds[e.id];
    parts.push(`<bpmndi:BPMNShape bpmnElement="${esc(e.id)}"><dc:Bounds x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}"/></bpmndi:BPMNShape>`);
  }
  for (const ed of layout.edges) {
    parts.push(`<bpmndi:BPMNEdge bpmnElement="${ed.id}">` +
      ed.waypoints.map(w => `<di:waypoint x="${w.x}" y="${w.y}"/>`).join('') + '</bpmndi:BPMNEdge>');
  }
  parts.push('</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>');
  parts.push('</definitions>');
  return parts.join('\n');
}

// ── main ──
const generatedAt = process.env.ORGBRAIN_GENERATED_AT || new Date().toISOString();
const sources = {};
for (const f of FILES) sources[f] = await fetchSource(f);
const schema = readEdn(sources['docs/orgbrain/org-ontology.schema.edn'].toString('utf8'));
const processes = FILES.filter(f => f.endsWith('.bpmn.edn')).map(f => {
  const doc = readEdn(sources[f].toString('utf8'));
  // normalize keys: {:id :type :event :name :gateway :actor-role :authority-required :sla-days}
  const norm = doc['orgbrain.bpmn/elements'].map(e => ({
    id: e.id, type: e.type, event: e.event, name: e.name, gateway: e.gateway,
    'actor-role': e['actor-role'], 'authority-required': e['authority-required'], 'sla-days': e['sla-days']
  }));
  const flows = doc['orgbrain.bpmn/flows'].map(f => Array.isArray(f) ? f : [f]);
  const pid = doc['orgbrain.bpmn/process-id'];
  const name = doc['orgbrain.bpmn/name'];
  return {id: pid, name, source: f, elements: norm, flows};
});
for (const p of processes) {
  const elIds = new Set(p.elements.map(e => e.id));
  if (!elIds.has('start') || !elIds.has('end')) throw new Error(`${p.id}: start/end required`);
  for (const [f, t] of p.flows) {
    if (!elIds.has(f) || !elIds.has(t)) throw new Error(`${p.id}: unknown flow endpoint ${f}->${t}`);
  }
  p.layout = layoutProcess(p.id, p.elements, p.flows);
}

rmSync(out, {recursive: true, force: true});
mkdirSync(out + '/edn', {recursive: true});
mkdirSync(out + '/bpmn', {recursive: true});
for (const [f, buf] of Object.entries(sources)) writeFileSync(`${out}/edn/${basename(f)}`, buf);
for (const p of processes) writeFileSync(`${out}/bpmn/${p.id}.bpmn.xml`, toXml(p, p.layout));

const index = {
  'orgbrain/data-version': '1',
  generatedAt,
  source: {repo: REPO, rev: REV, url: `https://github.com/${REPO}`,
    files: Object.fromEntries(Object.entries(sources).map(([f, b]) => [f, {sha256: sha256(b), bytes: b.length}]))},
  weights: {'raci-coverage': 0.3, 'authority-concentration': 0.2, 'delegation-depth': 0.15,
    'single-point-of-failure': 0.2, 'approval-gap': 0.15},
  ontology: schema,
  processes: processes.map(p => ({id: p.id, name: p.name, source: p.source,
    elements: p.elements, flows: p.flows, layout: p.layout,
    xml: `/org-data/bpmn/${p.id}.bpmn.xml`}))
};
writeFileSync(out + '/index.json', JSON.stringify(index, null, 1));
console.log(`orgbrain data built: ${processes.length} processes, ` +
  `${index.ontology['orgbrain/roles'].length} roles, ${index.ontology['orgbrain/tasks'].length} tasks, ` +
  `rev ${REV.slice(0, 9)}`);
