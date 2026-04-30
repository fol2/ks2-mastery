#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_ROUTE_COST_OUTPUT = 'reports/capacity/evidence/2026-04-30-p5-route-costs.json';

export const REQUIRED_ROUTE_COST_METRICS = Object.freeze([
  'count',
  'wallMsP50',
  'wallMsP95',
  'wallMsMax',
  'workerCpuMsP50',
  'workerCpuMsP95',
  'workerCpuMsMax',
  'workerWallMsP50',
  'workerWallMsP95',
  'workerWallMsMax',
  'd1DurationMsP50',
  'd1DurationMsP95',
  'd1DurationMsMax',
  'queryCountP50',
  'queryCountP95',
  'queryCountMax',
  'd1RowsReadP50',
  'd1RowsReadP95',
  'd1RowsReadMax',
  'd1RowsWrittenP50',
  'd1RowsWrittenP95',
  'd1RowsWrittenMax',
  'responseBytesP50',
  'responseBytesP95',
  'responseBytesMax',
]);

export const REQUIRED_ROUTE_FAMILIES = Object.freeze([
  {
    id: 'full-bootstrap',
    method: 'GET',
    endpoint: '/api/bootstrap',
    broadPhase: 'bootstrap',
    discoverySources: ['worker/src/app.js', 'src/platform/core/repositories/api.js', 'tests/worker-bootstrap-v2.test.js'],
  },
  {
    id: 'not-modified-bootstrap',
    method: 'POST',
    endpoint: '/api/bootstrap',
    broadPhase: 'bootstrap',
    probeContract: 'Fetch full bootstrap first, then send { "lastKnownRevision": "<current revision hash>" } and require the not-modified branch.',
    discoverySources: ['worker/src/app.js', 'src/platform/core/repositories/api.js', 'tests/worker-bootstrap-v2.test.js'],
  },
  {
    id: 'demo-session-setup',
    method: 'POST',
    endpoint: '/api/demo/session',
    broadPhase: 'setup',
    discoverySources: ['worker/src/demo/sessions.js', 'scripts/prepare-session-manifest.mjs', 'tests/redaction-access-matrix.test.js'],
  },
  {
    id: 'spelling-command',
    method: 'POST',
    endpoint: '/api/subjects/spelling/command',
    broadPhase: 'command',
    discoverySources: ['worker/src/subjects/spelling/commands.js', 'worker/src/app.js', 'tests/spelling-remote-actions.test.js'],
  },
  {
    id: 'grammar-command',
    method: 'POST',
    endpoint: '/api/subjects/grammar/command',
    broadPhase: 'command',
    discoverySources: ['worker/src/subjects/grammar/commands.js', 'scripts/classroom-load-test.mjs', 'tests/worker-grammar-subject-runtime.test.js'],
  },
  {
    id: 'punctuation-command',
    method: 'POST',
    endpoint: '/api/subjects/punctuation/command',
    broadPhase: 'command',
    discoverySources: ['worker/src/subjects/punctuation/commands.js', 'worker/src/app.js', 'tests/worker-subject-runtime.test.js'],
  },
  {
    id: 'parent-summary-hub-read',
    method: 'GET',
    endpoint: '/api/hubs/parent',
    candidateEndpoints: ['/api/hubs/parent', '/api/hubs/parent/summary', '/api/hubs/parent/recent-sessions', '/api/hubs/parent/activity'],
    broadPhase: 'parent-admin',
    discoverySources: ['worker/src/app.js', 'src/platform/hubs/api.js', 'src/surfaces/hubs/ParentHubSurface.jsx', 'tests/hub-api.test.js', 'tests/worker-hubs.test.js'],
  },
  {
    id: 'admin-production-evidence-overview',
    method: 'GET',
    endpoint: '/api/admin/ops/production-evidence',
    broadPhase: 'parent-admin',
    discoverySources: ['worker/src/app.js', 'src/platform/hubs/admin-production-evidence.js', 'tests/worker-admin-ops-read.test.js', 'tests/react-admin-production-evidence.test.js', 'tests/react-admin-evidence-lanes.test.js'],
  },
  {
    id: 'hero-read-model',
    method: 'GET',
    endpoint: '/api/hero/read-model',
    broadPhase: 'hero',
    discoverySources: ['worker/src/app.js', 'worker/src/hero/routes.js', 'worker/src/hero/read-model.js', 'tests/worker-hero-command.test.js', 'tests/hero-pA2-internal-override-surface.test.js'],
  },
  {
    id: 'hero-command-start',
    method: 'POST',
    endpoint: '/api/hero/command',
    broadPhase: 'hero-command',
    commandAction: 'start',
    discoverySources: ['worker/src/hero/routes.js', 'worker/src/hero/launch.js', 'tests/worker-hero-command.test.js'],
  },
  {
    id: 'hero-command-claim',
    method: 'POST',
    endpoint: '/api/hero/command',
    broadPhase: 'hero-command',
    commandAction: 'claim',
    discoverySources: ['worker/src/hero/routes.js', 'worker/src/hero/claim.js', 'tests/worker-hero-command.test.js'],
  },
  {
    id: 'hero-command-camp',
    method: 'POST',
    endpoint: '/api/hero/command',
    broadPhase: 'hero-command',
    commandAction: 'camp',
    discoverySources: ['worker/src/hero/routes.js', 'worker/src/hero/camp.js', 'tests/worker-hero-command.test.js'],
  },
]);

const RAW_REQUEST_ID_RE = /ks2_req_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const RAW_TAIL_RE = /reports\/capacity\/evidence\/[^"\s]*(?:tail|worker-log)[^"\s]*\.(?:jsonl|ndjson|log|txt)/i;
const SQL_LEAK_RE = /\b(?:SELECT|INSERT|UPDATE|DELETE)\b|child_subject_state|practice_sessions|account_id|learner_id/i;
const HERO_COMMAND_ACTIONS = Object.freeze({
  'start-task': 'start',
  start: 'start',
  'claim-task': 'claim',
  claim: 'claim',
  'unlock-monster': 'camp',
  'evolve-monster': 'camp',
  camp: 'camp',
});

export function parseRouteCostDiagnosticArgs(argv = process.argv.slice(2)) {
  const options = {
    json: false,
    executeLocal: false,
    executeProduction: false,
    approvedProductionRun: false,
    outputPath: DEFAULT_ROUTE_COST_OUTPUT,
    budgetPath: 'reports/capacity/latest-1000-learner-budget.json',
    tailCorrelationPaths: ['reports/capacity/evidence/2026-04-30-p3-t5-strict-r2-tail-correlation.json'],
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--execute-local') {
      options.executeLocal = true;
    } else if (arg === '--execute-production') {
      options.executeProduction = true;
    } else if (arg === '--approved-production-run') {
      options.approvedProductionRun = true;
    } else if (arg === '--output') {
      options.outputPath = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--budget') {
      options.budgetPath = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--tail-correlation') {
      options.tailCorrelationPaths.push(readValue(argv, index, arg));
      index += 1;
    } else if (arg === '--no-default-tail-correlation') {
      options.tailCorrelationPaths = [];
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function readValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${optionName} requires a value.`);
  return value;
}

export function buildRouteCostDiagnosticPlan({
  outputPath = DEFAULT_ROUTE_COST_OUTPUT,
} = {}) {
  return {
    schema: 1,
    kind: 'p5-route-cost-diagnostic-plan',
    generatedAt: new Date().toISOString(),
    outputPath,
    modellingOnly: true,
    certifying: false,
    rawLogWarning: 'Raw Worker tail JSONL must stay local/private; committed route-cost evidence must be aggregate and redacted.',
    executionModes: {
      dryRunDefault: true,
      executeLocal: 'Measure local or fixture-backed route costs when available; record blocked statuses for the rest.',
      executeProduction: 'Requires explicit production approval plus auth/session material before probing live routes.',
    },
    routeFamilies: REQUIRED_ROUTE_FAMILIES.map((family) => ({
      ...family,
      requiredMetrics: [...REQUIRED_ROUTE_COST_METRICS],
      evidenceStatus: 'modelling-only',
      redactionStatus: 'required-redacted-aggregate',
    })),
  };
}

function percentile(values, percentileValue) {
  const finite = values.map((value) => Number(value)).filter(Number.isFinite).sort((left, right) => left - right);
  if (!finite.length) return null;
  const index = Math.min(finite.length - 1, Math.ceil((percentileValue / 100) * finite.length) - 1);
  return finite[index];
}

function routeFromSample(sample = {}) {
  const method = sample.method || sample.app?.method || 'GET';
  const endpoint = sample.endpoint || sample.app?.endpoint || '/api/bootstrap';
  return `${String(method).toUpperCase()} ${endpoint}`;
}

function normaliseHeroCommandAction(action) {
  if (!action || typeof action !== 'string') return '';
  return HERO_COMMAND_ACTIONS[action] || '';
}

function commandActionFromSample(sample = {}) {
  return normaliseHeroCommandAction(
    sample.commandAction
      || sample.command
      || sample.app?.commandAction
      || sample.app?.command
      || sample.capacityRequest?.commandAction
      || sample.capacityRequest?.command
      || sample.request?.commandAction
      || sample.request?.command
      || sample.request?.body?.command
      || sample.body?.command
      || sample.payload?.command,
  );
}

function routeFamilyForCost(route = '', routeFamily = '', commandAction = '') {
  if (routeFamily && REQUIRED_ROUTE_FAMILIES.some((family) => family.id === routeFamily)) return routeFamily;
  if (/^GET\s+\/api\/bootstrap\b/.test(route)) return 'full-bootstrap';
  if (/^POST\s+\/api\/bootstrap\b/.test(route)) return 'not-modified-bootstrap';
  if (/^POST\s+\/api\/demo\/session\b/.test(route)) return 'demo-session-setup';
  if (/^POST\s+\/api\/subjects\/spelling\/command\b/.test(route)) return 'spelling-command';
  if (/^POST\s+\/api\/subjects\/grammar\/command\b/.test(route)) return 'grammar-command';
  if (/^POST\s+\/api\/subjects\/punctuation\/command\b/.test(route)) return 'punctuation-command';
  if (/^GET\s+\/api\/admin\/ops\/production-evidence\b/.test(route)) return 'admin-production-evidence-overview';
  if (/^GET\s+\/api\/hubs\/parent\b/.test(route)) return 'parent-summary-hub-read';
  if (/^GET\s+\/api\/hero\/read-model\b/.test(route)) return 'hero-read-model';
  if (/^POST\s+\/api\/hero\/command\b/.test(route)) {
    const normalisedAction = normaliseHeroCommandAction(commandAction);
    return normalisedAction ? `hero-command-${normalisedAction}` : '';
  }
  return '';
}

function routeFamilyDefinition(id) {
  return REQUIRED_ROUTE_FAMILIES.find((family) => family.id === id) || null;
}

function metricsFromBudgetCost(cost = {}) {
  return {
    count: finiteOrNull(cost.count),
    wallMsP50: finiteOrNull(cost.wallMsP50),
    wallMsP95: finiteOrNull(cost.wallMsP95),
    wallMsMax: finiteOrNull(cost.wallMsMax),
    workerCpuMsP50: finiteOrNull(cost.workerCpuMsP50),
    workerCpuMsP95: finiteOrNull(cost.workerCpuMsP95),
    workerCpuMsMax: finiteOrNull(cost.workerCpuMsMax),
    workerWallMsP50: finiteOrNull(cost.workerWallMsP50),
    workerWallMsP95: finiteOrNull(cost.workerWallMsP95),
    workerWallMsMax: finiteOrNull(cost.workerWallMsMax),
    d1DurationMsP50: finiteOrNull(cost.d1DurationMsP50),
    d1DurationMsP95: finiteOrNull(cost.d1DurationMsP95),
    d1DurationMsMax: finiteOrNull(cost.d1DurationMsMax),
    queryCountP50: finiteOrNull(cost.queryCountP50),
    queryCountP95: finiteOrNull(cost.queryCountP95),
    queryCountMax: finiteOrNull(cost.queryCountMax),
    d1RowsReadP50: finiteOrNull(cost.d1RowsReadP50),
    d1RowsReadP95: finiteOrNull(cost.d1RowsReadP95),
    d1RowsReadMax: finiteOrNull(cost.d1RowsReadMax),
    d1RowsWrittenP50: finiteOrNull(cost.d1RowsWrittenP50),
    d1RowsWrittenP95: finiteOrNull(cost.d1RowsWrittenP95),
    d1RowsWrittenMax: finiteOrNull(cost.d1RowsWrittenMax),
    responseBytesP50: finiteOrNull(cost.responseBytesP50),
    responseBytesP95: finiteOrNull(cost.responseBytesP95),
    responseBytesMax: finiteOrNull(cost.responseBytesMax),
  };
}

function finiteOrNull(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mergeMetrics(left = {}, right = {}) {
  const merged = { ...left };
  for (const metric of REQUIRED_ROUTE_COST_METRICS) {
    if (merged[metric] == null && right[metric] != null) merged[metric] = right[metric];
  }
  return merged;
}

function hasMeasuredRouteMetrics(metrics = {}) {
  return REQUIRED_ROUTE_COST_METRICS.some((metric) => finiteOrNull(metrics[metric]) !== null);
}

function hasCompleteRouteMetrics(metrics = {}) {
  return REQUIRED_ROUTE_COST_METRICS.every((metric) => finiteOrNull(metrics[metric]) !== null);
}

function statusForMetrics(metrics = {}) {
  if (hasCompleteRouteMetrics(metrics)) return 'measured';
  if (hasMeasuredRouteMetrics(metrics)) return 'partial';
  return 'missing-route';
}

function measuredStatusForCost(cost = {}, metrics = {}) {
  const explicitStatus = cost.routeCostStatus || cost.status || null;
  if (explicitStatus && explicitStatus !== 'measured') return explicitStatus;
  if (hasMeasuredRouteMetrics(metrics)) return statusForMetrics(metrics);
  return explicitStatus === 'measured' ? 'missing-metric' : 'missing-route';
}

function isMeasuredEntry(entry = {}) {
  return entry.status === 'measured' && hasCompleteRouteMetrics(entry.metrics || {});
}

function isPartialEntry(entry = {}) {
  return entry.status === 'partial' && hasMeasuredRouteMetrics(entry.metrics || {});
}

function routeEntryFromBudgetCost(cost, sourcePath) {
  const familyId = routeFamilyForCost(cost.route, cost.routeFamily, cost.commandAction);
  if (!familyId) return null;
  const definition = routeFamilyDefinition(familyId);
  const metrics = metricsFromBudgetCost(cost);
  return {
    routeFamily: familyId,
    method: definition.method,
    endpoint: definition.endpoint,
    route: cost.route,
    broadPhase: definition.broadPhase,
    status: measuredStatusForCost(cost, metrics),
    evidenceStatus: cost.evidenceStatus || 'modelling-only',
    redactionStatus: cost.redactionStatus || 'redacted-aggregate',
    sourcePaths: [sourcePath, ...(cost.sourcePaths || [])].filter(Boolean),
    discoverySource: definition.discoverySources,
    metrics,
    ...(definition.probeContract ? { probeContract: definition.probeContract } : {}),
    ...(definition.commandAction ? { commandAction: definition.commandAction } : {}),
  };
}

function routeEntryFromTailCorrelation(data, sourcePath) {
  const samples = data?.diagnostics?.workerLogJoin?.samples || [];
  const byRouteFamily = new Map();
  for (const sample of samples) {
    const route = routeFromSample(sample);
    const commandAction = commandActionFromSample(sample);
    const familyId = routeFamilyForCost(route, '', commandAction);
    if (!familyId) continue;
    const bucketKey = `${familyId}\u0000${route}`;
    const bucket = byRouteFamily.get(bucketKey) || { route, familyId, samples: [] };
    bucket.samples.push(sample);
    byRouteFamily.set(bucketKey, bucket);
  }

  return [...byRouteFamily.values()].map(({ route, familyId, samples: routeSamples }) => {
    const definition = routeFamilyDefinition(familyId);
    const metrics = {
      count: routeSamples.length,
      wallMsP50: percentile(routeSamples.map((sample) => sample.app?.wallMs), 50),
      wallMsP95: percentile(routeSamples.map((sample) => sample.app?.wallMs), 95),
      wallMsMax: percentile(routeSamples.map((sample) => sample.app?.wallMs), 100),
      workerCpuMsP50: percentile(routeSamples.map((sample) => sample.cloudflare?.cpuTimeMs), 50),
      workerCpuMsP95: percentile(routeSamples.map((sample) => sample.cloudflare?.cpuTimeMs), 95),
      workerCpuMsMax: percentile(routeSamples.map((sample) => sample.cloudflare?.cpuTimeMs), 100),
      workerWallMsP50: percentile(routeSamples.map((sample) => sample.cloudflare?.wallTimeMs), 50),
      workerWallMsP95: percentile(routeSamples.map((sample) => sample.cloudflare?.wallTimeMs), 95),
      workerWallMsMax: percentile(routeSamples.map((sample) => sample.cloudflare?.wallTimeMs), 100),
      d1DurationMsP50: percentile(routeSamples.map((sample) => sample.capacityRequest?.d1DurationMs), 50),
      d1DurationMsP95: percentile(routeSamples.map((sample) => sample.capacityRequest?.d1DurationMs), 95),
      d1DurationMsMax: percentile(routeSamples.map((sample) => sample.capacityRequest?.d1DurationMs), 100),
      queryCountP50: percentile(routeSamples.map((sample) => sample.capacityRequest?.queryCount ?? sample.app?.queryCount), 50),
      queryCountP95: percentile(routeSamples.map((sample) => sample.capacityRequest?.queryCount ?? sample.app?.queryCount), 95),
      queryCountMax: percentile(routeSamples.map((sample) => sample.capacityRequest?.queryCount ?? sample.app?.queryCount), 100),
      d1RowsReadP50: percentile(routeSamples.map((sample) => sample.capacityRequest?.d1RowsRead ?? sample.app?.d1RowsRead), 50),
      d1RowsReadP95: percentile(routeSamples.map((sample) => sample.capacityRequest?.d1RowsRead ?? sample.app?.d1RowsRead), 95),
      d1RowsReadMax: percentile(routeSamples.map((sample) => sample.capacityRequest?.d1RowsRead ?? sample.app?.d1RowsRead), 100),
      d1RowsWrittenP50: percentile(routeSamples.map((sample) => sample.capacityRequest?.d1RowsWritten ?? sample.app?.d1RowsWritten), 50),
      d1RowsWrittenP95: percentile(routeSamples.map((sample) => sample.capacityRequest?.d1RowsWritten ?? sample.app?.d1RowsWritten), 95),
      d1RowsWrittenMax: percentile(routeSamples.map((sample) => sample.capacityRequest?.d1RowsWritten ?? sample.app?.d1RowsWritten), 100),
      responseBytesP50: percentile(routeSamples.map((sample) => sample.capacityRequest?.responseBytes ?? sample.app?.responseBytes), 50),
      responseBytesP95: percentile(routeSamples.map((sample) => sample.capacityRequest?.responseBytes ?? sample.app?.responseBytes), 95),
      responseBytesMax: percentile(routeSamples.map((sample) => sample.capacityRequest?.responseBytes ?? sample.app?.responseBytes), 100),
    };
    return {
      routeFamily: familyId,
      method: definition.method,
      endpoint: definition.endpoint,
      route,
      broadPhase: definition.broadPhase,
      status: statusForMetrics(metrics),
      evidenceStatus: 'diagnostic-only',
      redactionStatus: data?.redaction?.rawRequestIdsPersisted === false ? 'redacted-aggregate' : 'unknown',
      sourcePaths: [sourcePath],
      discoverySource: definition.discoverySources,
      ...(definition.commandAction ? { commandAction: definition.commandAction } : {}),
      metrics,
    };
  });
}

function mergeRouteEntries(entries = []) {
  const byFamily = new Map();
  for (const entry of entries) {
    const existing = byFamily.get(entry.routeFamily);
    if (!existing) {
      byFamily.set(entry.routeFamily, {
        ...entry,
        sourcePaths: [...new Set(entry.sourcePaths || [])].sort(),
      });
      continue;
    }
    const mergedMetrics = mergeMetrics(existing.metrics, entry.metrics);
    const metricStatus = statusForMetrics(mergedMetrics);
    byFamily.set(entry.routeFamily, {
      ...existing,
      status: metricStatus === 'measured' || metricStatus === 'partial' ? metricStatus : (existing.status || entry.status),
      evidenceStatus: existing.evidenceStatus === 'diagnostic-only' || entry.evidenceStatus === 'diagnostic-only' ? 'diagnostic-only' : existing.evidenceStatus,
      sourcePaths: [...new Set([...(existing.sourcePaths || []), ...(entry.sourcePaths || [])])].sort(),
      metrics: mergedMetrics,
    });
  }
  return byFamily;
}

function blockedEntryForFamily(family, status = 'requires-production-operator') {
  return {
    routeFamily: family.id,
    method: family.method,
    endpoint: family.endpoint,
    candidateEndpoints: family.candidateEndpoints || undefined,
    broadPhase: family.broadPhase,
    status,
    evidenceStatus: 'modelling-only',
    redactionStatus: 'redacted-aggregate',
    sourcePaths: [],
    discoverySource: family.discoverySources,
    metrics: Object.fromEntries(REQUIRED_ROUTE_COST_METRICS.map((metric) => [metric, null])),
    ...(family.probeContract ? { probeContract: family.probeContract } : {}),
    ...(family.commandAction ? { commandAction: family.commandAction } : {}),
  };
}

export function buildRouteCostEvidence({
  budget = null,
  tailCorrelations = [],
  generatedAt = new Date().toISOString(),
  sourcePaths = {},
} = {}) {
  const routeEntries = [];
  for (const cost of budget?.routeCosts || []) {
    const entry = routeEntryFromBudgetCost(cost, sourcePaths.budget || 'reports/capacity/latest-1000-learner-budget.json');
    if (entry) routeEntries.push(entry);
  }
  for (const item of tailCorrelations) {
    routeEntries.push(...routeEntryFromTailCorrelation(item.data || item, item.path || item.sourcePath || 'tail-correlation.json'));
  }

  const merged = mergeRouteEntries(routeEntries);
  const routeFamilies = REQUIRED_ROUTE_FAMILIES.map((family) => merged.get(family.id) || blockedEntryForFamily(family));
  const measuredCount = routeFamilies.filter(isMeasuredEntry).length;
  const partialCount = routeFamilies.filter(isPartialEntry).length;
  return {
    schema: 1,
    kind: 'capacity-route-cost-diagnostic',
    generatedAt,
    modellingOnly: true,
    certifying: false,
    diagnosticOnly: true,
    redaction: {
      rawRequestIdsPersisted: false,
      rawTailPathsPersisted: false,
      rawStatementNamesPersisted: false,
      aggregateOnly: true,
    },
    coverage: {
      requiredRouteFamilies: REQUIRED_ROUTE_FAMILIES.length,
      measuredRouteFamilies: measuredCount,
      partialRouteFamilies: partialCount,
      missingRouteFamilies: REQUIRED_ROUTE_FAMILIES.length - measuredCount - partialCount,
      complete: measuredCount === REQUIRED_ROUTE_FAMILIES.length,
    },
    routeFamilies,
  };
}

export function validateRouteCostEvidence(evidence = {}) {
  const errors = [];
  if (evidence.kind !== 'capacity-route-cost-diagnostic') {
    errors.push('kind must be capacity-route-cost-diagnostic');
  }
  if (evidence.certifying !== false || evidence.modellingOnly !== true) {
    errors.push('route-cost evidence must remain modellingOnly true and certifying false');
  }
  if (evidence?.redaction?.rawRequestIdsPersisted !== false) {
    errors.push('raw request ids must not be persisted');
  }
  if (evidence?.redaction?.rawTailPathsPersisted !== false) {
    errors.push('raw tail paths must not be persisted');
  }
  if (evidence?.redaction?.rawStatementNamesPersisted !== false) {
    errors.push('raw statement names must not be persisted');
  }
  if (evidence?.redaction?.aggregateOnly !== true) {
    errors.push('route-cost evidence must be aggregate-only');
  }

  const entries = Array.isArray(evidence.routeFamilies) ? evidence.routeFamilies : [];
  const byFamily = new Map(entries.map((entry) => [entry.routeFamily, entry]));
  for (const family of REQUIRED_ROUTE_FAMILIES) {
    const entry = byFamily.get(family.id);
    if (!entry) {
      errors.push(`missing required route family: ${family.id}`);
      continue;
    }
    if (!entry.method || !entry.endpoint) errors.push(`${family.id} missing method or endpoint`);
    if (!Array.isArray(entry.discoverySource) || !entry.discoverySource.length) {
      errors.push(`${family.id} missing discoverySource`);
    }
    const metrics = entry.metrics || {};
    for (const metric of REQUIRED_ROUTE_COST_METRICS) {
      if (!Object.prototype.hasOwnProperty.call(metrics, metric)) {
        errors.push(`${family.id} missing metric ${metric}`);
      }
    }
    if (entry.status === 'measured' && !hasCompleteRouteMetrics(metrics)) {
      errors.push(`${family.id} marked measured without complete route-cost metrics`);
    }
    if (entry.status === 'partial' && !hasMeasuredRouteMetrics(metrics)) {
      errors.push(`${family.id} marked partial without any non-null route-cost metric`);
    }
  }

  const notModified = byFamily.get('not-modified-bootstrap');
  if (notModified) {
    if (notModified.method !== 'POST' || notModified.endpoint !== '/api/bootstrap') {
      errors.push('not-modified-bootstrap must use POST /api/bootstrap');
    }
    if (!/lastKnownRevision/.test(notModified.probeContract || '')) {
      errors.push('not-modified-bootstrap must document matching lastKnownRevision probe contract');
    }
  }

  const serialised = JSON.stringify(evidence);
  if (RAW_REQUEST_ID_RE.test(serialised)) errors.push('raw ks2 request id leaked into route-cost evidence');
  if (RAW_TAIL_RE.test(serialised)) errors.push('raw tail path under reports/capacity/evidence leaked into route-cost evidence');
  if (SQL_LEAK_RE.test(serialised)) errors.push('SQL/table/account/learner identifier leaked into route-cost evidence');

  return { ok: errors.length === 0, errors };
}

function readJsonIfExists(filePath, cwd) {
  const absolute = path.resolve(cwd, filePath);
  if (!existsSync(absolute)) return null;
  return JSON.parse(readFileSync(absolute, 'utf8'));
}

export async function runRouteCostDiagnostic(argv = process.argv.slice(2), {
  cwd = process.cwd(),
  now = () => new Date(),
} = {}) {
  const options = parseRouteCostDiagnosticArgs(argv);
  if (options.help) {
    return {
      ok: true,
      help: [
        'Usage: node scripts/plan-route-cost-diagnostic.mjs [--json] [--execute-local] [--output <json>]',
        'Plans P5 route-cost coverage and can write redacted local/fixture-backed route-cost evidence.',
      ].join('\n'),
    };
  }

  if (options.executeProduction && !options.approvedProductionRun) {
    throw new Error('--execute-production requires --approved-production-run and live auth/session material.');
  }

  const plan = buildRouteCostDiagnosticPlan({ outputPath: options.outputPath });
  let evidence = null;
  let validation = { ok: true, errors: [] };
  let outputPath = null;

  if (options.executeLocal) {
    const budget = readJsonIfExists(options.budgetPath, cwd);
    const tailCorrelations = options.tailCorrelationPaths
      .map((sourcePath) => {
        const data = readJsonIfExists(sourcePath, cwd);
        return data ? { path: sourcePath, data } : null;
      })
      .filter(Boolean);
    evidence = buildRouteCostEvidence({
      budget,
      tailCorrelations,
      generatedAt: now().toISOString(),
      sourcePaths: { budget: options.budgetPath },
    });
    validation = validateRouteCostEvidence(evidence);
    outputPath = path.resolve(cwd, options.outputPath);
    if (validation.ok) {
      mkdirSync(path.dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
    }
  }

  const ok = validation.ok;
  const result = { ok, plan, evidence, validation, outputPath };
  return {
    ...result,
    output: options.json ? JSON.stringify(result, null, 2) : renderPlan(result),
  };
}

function renderPlan({ ok, plan, evidence, validation, outputPath }) {
  const lines = [
    `P5 route-cost diagnostic plan: ${plan.outputPath}`,
    `Route families: ${plan.routeFamilies.length}`,
    `Raw-log warning: ${plan.rawLogWarning}`,
    '',
    'Families:',
    ...plan.routeFamilies.map((family) => `- ${family.id}: ${family.method} ${family.endpoint}`),
  ];
  if (evidence) {
    lines.push(
      '',
      `Evidence output: ${outputPath}`,
      `Measured families: ${evidence.coverage.measuredRouteFamilies}/${evidence.coverage.requiredRouteFamilies}`,
      `Partial families: ${evidence.coverage.partialRouteFamilies}/${evidence.coverage.requiredRouteFamilies}`,
      ok ? 'Validation: ok' : `Validation: failed\n${validation.errors.map((entry) => `- ${entry}`).join('\n')}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runRouteCostDiagnostic().then((result) => {
    if (result.help) {
      console.log(result.help);
      return;
    }
    process.stdout.write(result.output);
    if (!result.ok) process.exitCode = 1;
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
