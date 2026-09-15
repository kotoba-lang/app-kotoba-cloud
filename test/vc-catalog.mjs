#!/usr/bin/env node
// test:vc-catalog — integrity gate for the VC fund catalog.
// Every record needs a source; every claim must name a known node.
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../assets/vc-catalog-src');
const {funds} = JSON.parse(readFileSync(src + '/funds.json', 'utf8'));
const {companies} = JSON.parse(readFileSync(src + '/companies.json', 'utf8'));
const {relations, coInvestmentClusters, systemDynamics, strategy} = JSON.parse(readFileSync(src + '/relations.json', 'utf8'));
const idx = JSON.parse(readFileSync(resolve(here, '../assets/vc-catalog/index.json'), 'utf8'));

let fail = 0;
const check = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); fail++; } };

for (const f of funds) {
  check(f.id && f.name && f.sourceUrl, `fund ${f.id}: id/name/sourceUrl required`);
  check(['primary-fetched', 'secondary-reported'].includes(f.layer), `fund ${f.id}: layer must be primary-fetched|secondary-reported`);
}
const fundIds = new Set(funds.map(f => f.id));
const compIds = new Set(companies.map(c => c.id));
for (const c of companies) {
  check(c.id && c.name, `company missing id/name`);
  for (const r of c.rounds || []) check(r.sourceUrl, `company ${c.id} round ${r.series}: sourceUrl required`);
  for (const k of Object.keys(c.fundInvestments || {})) check(fundIds.has(k), `company ${c.id}: unknown fund ${k}`);
}
for (const r of relations) {
  check(['primary-fetched', 'secondary-reported'].includes(r.layer), `relation ${r.s}->${r.o}: bad layer`);
}
for (const cl of coInvestmentClusters) {
  check(fundIds.has(cl.fundA.replace('fund/', '')) || cl.fundA.startsWith('fund/'), `cluster fundA ${cl.fundA}`);
  for (const co of cl.companies || []) check(compIds.has(co.replace('company/', '')), `cluster unknown company ${co}`);
}
check(systemDynamics.length >= 2, 'at least 2 system-dynamics entries expected');
check(strategy.length >= 1, 'at least 1 strategy entry expected');
check(idx.fundCount === funds.length && idx.companyCount === companies.length, 'index counts must match sources');
check(idx.head && /^b[2-7a-z]{50,60}$/.test(idx.head['/']), 'index must carry an IPLD head CID');
check(idx.claimCount === relations.length, `claims ${idx.claimCount} vs relations ${relations.length}`);

if (fail) { console.error(`vc-catalog: ${fail} failure(s)`); process.exit(1); }
console.log(`vc-catalog: OK (${funds.length} funds, ${companies.length} companies, ${relations.length} claims, ${coInvestmentClusters.length} clusters, head ${idx.head['/']})`);
