// orgbrain-risk — deterministic organization risk model (pure functions).
// JS port of kotoba-lang/kyber lg/lg_kyber/graphs/org_risk.cljc — same axis
// math, same weights, same thresholds. Golden-checked against the Clojure
// original in test/orgbrain-catalog.mjs. No LLM, no randomness: same input,
// same score. Keys are the EDN keyword strings ("orgbrain/role-id" etc.).
/* global OrgRisk */
var OrgRisk = (function () {
  'use strict';

  var defaultWeights = {
    'raci-coverage': 0.3, 'authority-concentration': 0.2, 'delegation-depth': 0.15,
    'single-point-of-failure': 0.2, 'approval-gap': 0.15
  };

  function accountableRole(task) {
    var raci = task['orgbrain/raci'] || {};
    var a = raci.accountable;
    return (a && a.length) ? a[0] : undefined;
  }

  function authorityHolders(schema) {
    // authority -> Set(role-id): DIRECT delegations only (mirrors cljc)
    var holders = {};
    for (var d of (schema['orgbrain/delegations'] || [])) {
      var auth = d['orgbrain/authority'];
      (holders[auth] || (holders[auth] = new Set())).add(d['orgbrain/to-role']);
    }
    return holders;
  }

  function depthFrom(delegations, role, seen) {
    if (seen.has(role)) return 0;
    var into = delegations.filter(function (d) { return d['orgbrain/to-role'] === role; });
    if (!into.length) return 0;
    var next = new Set(seen);
    next.add(role);
    var m = 0;
    for (var d of into) m = Math.max(m, depthFrom(delegations, d['orgbrain/from-role'], next));
    return m + 1;
  }

  // Critical tasks without an accountable role. 0 = all covered, 1 = none.
  function raciCoverageRisk(schema) {
    var critical = (schema['orgbrain/tasks'] || []).filter(function (t) { return t['orgbrain/critical?']; });
    if (!critical.length) return 0.0;
    var uncovered = critical.filter(function (t) { return accountableRole(t) === undefined; }).length;
    return uncovered / critical.length;
  }

  // Max number of distinct authorities held by one role / (0.7 * total).
  function authorityConcentrationRisk(schema) {
    var total = (schema['orgbrain/authorities'] || []).length;
    var holders = authorityHolders(schema);
    var counts = {};
    for (var auth in holders)
      for (var role of holders[auth]) counts[role] = (counts[role] || 0) + 1;
    if (!total) return 0.0;
    var values = Object.keys(counts).map(function (k) { return counts[k]; });
    var max = values.length ? Math.max.apply(null, values) : 0;
    return Math.min(1.0, max / (0.7 * total));
  }

  // Deepest delegation chain / 3, capped at 1.0.
  function delegationDepthRisk(schema) {
    var delegs = schema['orgbrain/delegations'] || [];
    var roles = new Set((schema['orgbrain/roles'] || []).map(function (r) { return r['orgbrain/role-id']; }));
    var toRoles = Array.from(new Set(delegs.map(function (d) { return d['orgbrain/to-role']; })));
    var sourceRoles = Array.from(roles).filter(function (r) { return !toRoles.includes(r); });
    var deepest = delegs.length ? Math.max.apply(null, [1].concat(toRoles.map(function (r) { return depthFrom(delegs, r, new Set()); }))) : 0;
    if (!sourceRoles.length) return 0.0;
    return Math.min(1.0, deepest / 3.0);
  }

  // Critical tasks whose accountable role has min-headcount <= 1 (or unlisted).
  function singlePointOfFailureRisk(schema) {
    var critical = (schema['orgbrain/tasks'] || []).filter(function (t) { return t['orgbrain/critical?']; });
    if (!critical.length) return 0.0;
    var hc = {};
    for (var r of (schema['orgbrain/roles'] || [])) hc[r['orgbrain/role-id']] = r['orgbrain/min-headcount'];
    var exposed = critical.filter(function (t) {
      var role = accountableRole(t);
      return role !== undefined && (hc[role] === undefined ? 1 : hc[role]) <= 1;
    }).length;
    return exposed / critical.length;
  }

  // Critical approval authorities (:approve-spend, :sign-contract) nobody holds.
  function approvalGapRisk(schema) {
    var holders = authorityHolders(schema);
    var required = ['approve-spend', 'sign-contract'];
    var missing = required.filter(function (a) { return !holders[a] || holders[a].size === 0; });
    return missing.length / required.length;
  }

  function riskReport(schema, weights) {
    weights = weights || defaultWeights;
    var axes = {
      'raci-coverage': raciCoverageRisk(schema),
      'authority-concentration': authorityConcentrationRisk(schema),
      'delegation-depth': delegationDepthRisk(schema),
      'single-point-of-failure': singlePointOfFailureRisk(schema),
      'approval-gap': approvalGapRisk(schema)
    };
    var wsum = 0, acc = 0.0;
    for (var k in axes) {
      var w = weights[k] === undefined ? 0 : weights[k];
      wsum += w;
      acc += w * axes[k];
    }
    var composite = wsum === 0 ? 0.0 : acc / wsum;
    var level = composite < 0.2 ? 'low' : composite < 0.5 ? 'moderate' : composite < 0.8 ? 'elevated' : 'critical';
    return {axes: axes, composite: composite, level: level};
  }

  // Every :authority-required BPMN element must be delegated to its :actor-role.
  function bpmnAuthorityAudit(schema, bpmn) {
    var holders = authorityHolders(schema);
    var out = [];
    for (var el of (bpmn['orgbrain.bpmn/elements'] || bpmn.elements || [])) {
      if (!el['authority-required']) continue;
      out.push({
        element: el.id, authority: el['authority-required'], role: el['actor-role'],
        ok: holders[el['authority-required']] ? holders[el['authority-required']].has(el['actor-role']) : false
      });
    }
    return out;
  }

  var api = {
    defaultWeights: defaultWeights,
    accountableRole: accountableRole,
    authorityHolders: authorityHolders,
    raciCoverageRisk: raciCoverageRisk,
    authorityConcentrationRisk: authorityConcentrationRisk,
    delegationDepthRisk: delegationDepthRisk,
    singlePointOfFailureRisk: singlePointOfFailureRisk,
    approvalGapRisk: approvalGapRisk,
    riskReport: riskReport,
    bpmnAuthorityAudit: bpmnAuthorityAudit
  };
  if (typeof window !== 'undefined') window.OrgRisk = api;
  return api;
})();
