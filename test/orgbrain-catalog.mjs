// orgbrain catalog tests: provenance integrity, ontology/BPMN consistency,
// the OrgRisk JS port against the kyber Clojure golden values, BPMN XML
// well-formedness, and page/script surface wiring.
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {strict as assert} from 'node:assert';

const root = 'assets/orgbrain-catalog/';
const index = JSON.parse(readFileSync(root + 'index.json', 'utf8'));
// load the browser-side risk engine (IIFE exposing `var OrgRisk`) in-node
const OrgRisk = new Function(readFileSync('assets/orgbrain-risk.js', 'utf8') + '\nreturn OrgRisk;')();

// ---- provenance: pinned full SHA + re-hash of the vendored EDN copies ----
assert.match(index.source.rev, /^[0-9a-f]{40}$/, 'source.rev must be a full commit SHA');
assert.equal(index.source.repo, 'kotoba-lang/kyber');
for (const [f, meta] of Object.entries(index.source.files)) {
  const local = root + 'edn/' + f.split('/').pop();
  assert.ok(existsSync(local), `vendored EDN missing: ${f}`);
  const h = createHash('sha256').update(readFileSync(local)).digest('hex');
  assert.equal(h, meta.sha256, `sha256 drift for ${f}`);
}

// ---- ontology invariants ----
const ont = index.ontology;
const roles = ont['orgbrain/roles'];
const roleIds = new Set(roles.map(r => r['orgbrain/role-id']));
assert.equal(roleIds.size, roles.length, 'unique role ids');
const AUTHS = new Set(ont['orgbrain/authorities']);
assert.equal(AUTHS.size, 6, 'closed authority vocabulary (approve-spend/sign-contract/hire/fire/compliance/it-admin)');
assert.equal(new Set(ont['orgbrain/levels']).size, 4);
const taskIds = new Set(ont['orgbrain/tasks'].map(t => t['orgbrain/task-id']));
assert.equal(taskIds.size, ont['orgbrain/tasks'].length, 'unique task ids');
for (const d of ont['orgbrain/delegations']) {
  assert.ok(AUTHS.has(d['orgbrain/authority']), `delegation with unknown authority ${d['orgbrain/authority']}`);
}
for (const t of ont['orgbrain/tasks']) {
  const a = ((t['orgbrain/raci'] || {}).accountable || []);
  if (t['orgbrain/critical?']) assert.equal(a.length, 1, `critical task ${t['orgbrain/task-id']} needs exactly one accountable`);
}

// ---- BPMN processes: references, structure, authority audit ----
assert.equal(index.processes.length, 2, 'incorporation + onboarding-offboarding');
for (const p of index.processes) {
  const ids = new Set(p.elements.map(e => e.id));
  for (const [f, t] of p.flows) {
    assert.ok(ids.has(f) && ids.has(t), `${p.id}: flow ${f}->${t} references unknown element`);
  }
  for (const e of p.elements) {
    if (e['actor-role']) assert.ok(roleIds.has(e['actor-role']) || e['actor-role'] === 'board', `${p.id}: ${e.id} actor-role ${e['actor-role']} not in schema roles`);
    if (e['authority-required']) assert.ok(AUTHS.has(e['authority-required']), `${p.id}: ${e.id} unknown authority`);
  }
  const audit = OrgRisk.bpmnAuthorityAudit(ont, p);
  assert.ok(audit.length >= 5, `${p.id}: audit covers the authority-required tasks`);
  for (const a of audit) assert.ok(a.ok, `${p.id}: ${a.element} :${a.authority} NOT delegated to ${a.role}`);
}

// ---- OrgRisk JS port vs the kyber Clojure golden (risk-report on the
// reference schema, measured via kbb on kotoba-lang/kyber@main 2026-09-16) ----
const GOLDEN = {
  'raci-coverage': 0,
  'authority-concentration': 0.7142857142857144,
  'delegation-depth': 1,
  'single-point-of-failure': 1,
  'approval-gap': 0,
  composite: 0.4928571428571429,
  level: 'moderate'
};
const report = OrgRisk.riskReport(ont, index.weights);
for (const k of Object.keys(GOLDEN)) {
  const got = k === 'level' ? report.level : report.axes[k] ?? report[k];
  if (k === 'level') assert.equal(got, GOLDEN[k], `golden level ${got}`);
  else assert.ok(Math.abs(got - GOLDEN[k]) < 1e-12, `golden ${k}: ${got} != ${GOLDEN[k]}`);
}

// ---- BPMN 2.0 XML files: balanced tags + per-element DI shapes ----
for (const p of index.processes) {
  const xml = readFileSync(root + p.xml.replace('/org-data/', ''), 'utf8');
  assert.ok(xml.startsWith('<?xml'), 'xml declaration');
  for (const tag of ['definitions', 'process', 'sequenceFlow', 'bpmndi:BPMNShape', 'bpmndi:BPMNEdge'])
    assert.ok(xml.includes(tag), `${p.id}: xml missing <${tag}>`);
  const open = (xml.match(/<definitions/g) || []).length, close = (xml.match(/<\/definitions>/g) || []).length;
  assert.equal(open, close, 'definitions balanced');
  const shapes = (xml.match(/<bpmndi:BPMNShape/g) || []).length;
  const edges = (xml.match(/<bpmndi:BPMNEdge/g) || []).length;
  assert.equal(shapes, p.elements.length, `${p.id}: one DI shape per element`);
  assert.equal(edges, p.flows.length, `${p.id}: one DI edge per flow`);
  assert.equal((xml.match(/<task /g) || []).length, p.elements.filter(e => e.type === 'task').length);
}

// ---- surface wiring: page markup ids + app script + /apps card ----
const page = readFileSync('src/app_kotoba_cloud/orgbrain_site.cljk', 'utf8');
const app = readFileSync('assets/orgbrain-app.js', 'utf8');
for (const id of ['orgbrain-main', 'orgbrain-tabs', 'orgbrain-process-select', 'orgbrain-process-view',
                  'orgbrain-roles-table', 'orgbrain-raci-table', 'orgbrain-risk-chart',
                  'orgbrain-editor', 'orgbrain-sim-dl-edn', 'orgbrain-provenance'])
  assert.ok(page.includes(`"${id}"`), `page markup carries #${id}`);
for (const id of ['risk-chart', 'editor', 'sim-dl-edn', 'provenance'])
  assert.ok(app.includes(`$('${id}')`), `app script wires ${id}`);
const apps = readFileSync('src/app_kotoba_cloud/apps_site.cljk', 'utf8');
assert.ok(apps.includes('"/orgs/"') && apps.includes('orgbrain'), '/apps card links the management app');

console.log('orgbrain catalog tests passed:', index.processes.length, 'processes,',
  roles.length, 'roles,', ont['orgbrain/tasks'].length, 'tasks; risk port golden-OK');
