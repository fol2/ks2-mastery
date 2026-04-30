#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  REQUIRED_ROUTE_COST_METRICS,
  REQUIRED_ROUTE_FAMILIES,
} from './plan-route-cost-diagnostic.mjs';

export const DEFAULT_BUDGET_LEDGER_JSON_PATH = path.join(
  'reports',
  'capacity',
  'latest-1000-learner-budget.json',
);
export const DEFAULT_BUDGET_LEDGER_MARKDOWN_PATH = path.join(
  'docs',
  'operations',
  'capacity-1000-learner-free-tier-budget.md',
);

export const CLOUDFLARE_FREE_LIMITS = Object.freeze({
  retrievedAt: '2026-04-29',
  plan: 'Cloudflare Workers Free + D1 Free',
  dynamicRequestsPerDay: 100_000,
  workerCpuMsPerInvocation: 10,
  workerSubrequestsPerInvocation: 50,
  d1RowsReadPerDay: 5_000_000,
  d1RowsWrittenPerDay: 100_000,
});

const DEFAULT_LEARNER_COUNTS = Object.freeze([30, 60, 100, 300, 1000]);

const MODE_ASSUMPTIONS = Object.freeze({
  optimistic: {
    bootstrapPerLearnerPerDay: 2,
    commandPerLearnerPerDay: 12,
    setupPerLearnerPerDay: 0.05,
    parentAdminReadsPerLearnerPerDay: 0.05,
    retryBackoffFactor: 1,
    burst15MinuteFraction: 0.12,
  },
  expected: {
    bootstrapPerLearnerPerDay: 4,
    commandPerLearnerPerDay: 30,
    setupPerLearnerPerDay: 0.1,
    parentAdminReadsPerLearnerPerDay: 0.2,
    retryBackoffFactor: 1.05,
    burst15MinuteFraction: 0.2,
  },
  pessimistic: {
    bootstrapPerLearnerPerDay: 8,
    commandPerLearnerPerDay: 60,
    setupPerLearnerPerDay: 0.2,
    parentAdminReadsPerLearnerPerDay: 0.5,
    retryBackoffFactor: 1.25,
    burst15MinuteFraction: 0.35,
  },
});

const HERO_COMMAND_ACTIONS = Object.freeze({
  'start-task': 'start',
  start: 'start',
  'claim-task': 'claim',
  claim: 'claim',
  'unlock-monster': 'camp',
  'evolve-monster': 'camp',
  camp: 'camp',
});

function finiteOrNull(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value, digits = 2) {
  const n = finiteOrNull(value);
  if (n === null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function percentile(values, percentileValue) {
  const finite = values.map((value) => Number(value)).filter(Number.isFinite).sort((left, right) => left - right);
  if (!finite.length) return null;
  const index = Math.min(finite.length - 1, Math.ceil((percentileValue / 100) * finite.length) - 1);
  return finite[index];
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

function classifyRoute(route = '', metrics = {}) {
  if (metrics.phase) return String(metrics.phase);
  if (/\/api\/bootstrap\b/.test(route)) return 'bootstrap';
  if (/\/command\b/.test(route)) return 'command';
  if (/\/api\/demo\/session\b/.test(route)) return 'setup';
  if (/\/api\/admin\b|\/api\/parent\b/.test(route)) return 'parent-admin';
  return 'other';
}

function routeFamilyForRoute(route = '', metrics = {}) {
  if (metrics.routeFamily) return String(metrics.routeFamily);
  if (/^GET\s+\/api\/bootstrap\b/.test(route)) return 'full-bootstrap';
  if (/^POST\s+\/api\/bootstrap\b/.test(route)) return 'not-modified-bootstrap';
  if (/^POST\s+\/api\/demo\/session\b/.test(route)) return 'demo-session-setup';
  if (/^POST\s+\/api\/subjects\/spelling\/command\b/.test(route)) return 'spelling-command';
  if (/^POST\s+\/api\/subjects\/grammar\/command\b/.test(route)) return 'grammar-command';
  if (/^POST\s+\/api\/subjects\/punctuation\/command\b/.test(route)) return 'punctuation-command';
  if (/^GET\s+\/api\/hubs\/parent\b/.test(route)) return 'parent-summary-hub-read';
  if (/^GET\s+\/api\/admin\/ops\/production-evidence\b/.test(route)) return 'admin-production-evidence-overview';
  if (/^GET\s+\/api\/hero\/read-model\b/.test(route)) return 'hero-read-model';
  if (/^POST\s+\/api\/hero\/command\b/.test(route)) {
    const commandAction = normaliseHeroCommandAction(metrics.commandAction || metrics.command);
    return commandAction ? `hero-command-${commandAction}` : 'unknown';
  }
  return 'unknown';
}

function validateLimits(limits = CLOUDFLARE_FREE_LIMITS) {
  const required = [
    'dynamicRequestsPerDay',
    'workerCpuMsPerInvocation',
    'workerSubrequestsPerInvocation',
    'd1RowsReadPerDay',
    'd1RowsWrittenPerDay',
  ];
  const invalid = required.filter((key) => !Number.isFinite(Number(limits[key])) || Number(limits[key]) <= 0);
  if (invalid.length) {
    throw new Error(`Unsupported Cloudflare Free limit values: ${invalid.join(', ')}`);
  }
}

function evidenceTime(data = {}) {
  const candidates = [
    data?.reportMeta?.finishedAt,
    data?.finishedAt,
    data?.summary?.finishedAt,
    data?.generatedAt,
  ].filter(Boolean);
  for (const candidate of candidates) {
    const ms = Date.parse(String(candidate));
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  return null;
}

function evidenceKind(data = {}) {
  if (data?.evidenceKind) return String(data.evidenceKind);
  if (data?.kind === 'capacity-route-cost-diagnostic') return 'route-cost-diagnostic';
  if (data?.kind === 'capacity-worker-log-correlation') return 'worker-log-correlation';
  if (data?.dryRun) return 'dry-run';
  if (data?.setupFailure || data?.metrics === null) return 'preflight';
  return 'capacity-run';
}

function routeEntriesFromEvidence(data = {}) {
  if (data?.kind === 'capacity-route-cost-diagnostic' && Array.isArray(data.routeFamilies)) {
    return data.routeFamilies.map((entry) => [
      entry.route || `${entry.method || 'GET'} ${entry.endpoint || 'unknown'}`,
      {
        ...(entry.metrics || {}),
        phase: entry.broadPhase || entry.phase,
        routeFamily: entry.routeFamily,
        commandAction: entry.commandAction,
        routeCostStatus: entry.status,
        evidenceStatus: entry.evidenceStatus,
        redactionStatus: entry.redactionStatus,
        sourcePaths: entry.sourcePaths,
      },
    ]);
  }
  if (data?.kind === 'capacity-worker-log-correlation') {
    return routeEntriesFromWorkerLogCorrelation(data);
  }
  if (Array.isArray(data.routeSummaries)) {
    return data.routeSummaries.map((entry) => [entry.route || entry.endpoint || 'unknown', entry]);
  }
  if (Array.isArray(data.routes)) {
    return data.routes.map((entry) => [entry.route || entry.endpoint || 'unknown', entry]);
  }
  const endpoints = data?.summary?.endpoints || data?.endpoints || null;
  if (endpoints && typeof endpoints === 'object') return Object.entries(endpoints);
  return [];
}

function routeEntriesFromWorkerLogCorrelation(data = {}) {
  const samples = data?.diagnostics?.workerLogJoin?.samples || [];
  const byRouteFamily = new Map();
  for (const sample of samples) {
    const method = String(sample.method || 'GET').toUpperCase();
    const endpoint = sample.endpoint || '/api/bootstrap';
    const route = `${method} ${endpoint}`;
    const commandAction = commandActionFromSample(sample);
    const routeFamily = routeFamilyForRoute(route, { commandAction });
    if (routeFamily === 'unknown') continue;
    const bucketKey = `${routeFamily}\u0000${route}`;
    const bucket = byRouteFamily.get(bucketKey) || { route, routeFamily, commandAction, samples: [] };
    bucket.samples.push(sample);
    byRouteFamily.set(bucketKey, bucket);
  }
  return [...byRouteFamily.values()].map(({ route, routeFamily, commandAction, samples: routeSamples }) => [
    route,
    {
      phase: classifyRoute(route),
      routeFamily,
      ...(commandAction ? { commandAction } : {}),
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
      evidenceStatus: 'diagnostic-only',
      redactionStatus: data?.redaction?.rawRequestIdsPersisted === false ? 'redacted-aggregate' : 'unknown',
    },
  ]);
}

function metricValue(metrics = {}, names = []) {
  for (const name of names) {
    const value = finiteOrNull(metrics[name]);
    if (value !== null) return value;
  }
  return null;
}

function normaliseRouteCost(route, metrics = {}, sourcePath = null) {
  const phase = classifyRoute(route, metrics);
  const routeFamily = routeFamilyForRoute(route, metrics);
  const commandAction = normaliseHeroCommandAction(metrics.commandAction || metrics.command);
  return {
    route,
    phase,
    routeFamily,
    ...(commandAction ? { commandAction } : {}),
    routeCostStatus: metrics.routeCostStatus || 'measured',
    evidenceStatus: metrics.evidenceStatus || null,
    redactionStatus: metrics.redactionStatus || null,
    sourcePaths: [...new Set([sourcePath, ...(Array.isArray(metrics.sourcePaths) ? metrics.sourcePaths : [])].filter(Boolean))],
    count: finiteOrNull(metrics.count),
    wallMsP50: metricValue(metrics, ['wallMsP50', 'p50WallMs']),
    wallMsP95: metricValue(metrics, ['wallMsP95', 'p95WallMs']),
    wallMsMax: metricValue(metrics, ['wallMsMax', 'maxWallMs']),
    queryCountP50: metricValue(metrics, ['queryCountP50', 'queriesP50']),
    queryCountP95: metricValue(metrics, ['queryCountP95', 'queriesP95', 'queryCount']),
    queryCountMax: metricValue(metrics, ['queryCountMax', 'queryCount']),
    d1DurationMsP50: metricValue(metrics, ['d1DurationMsP50', 'd1MsP50']),
    d1DurationMsP95: metricValue(metrics, ['d1DurationMsP95', 'd1MsP95', 'd1DurationMs']),
    d1DurationMsMax: metricValue(metrics, ['d1DurationMsMax', 'd1MsMax', 'd1DurationMs']),
    d1RowsReadP50: metricValue(metrics, ['d1RowsReadP50', 'rowsReadP50']),
    d1RowsReadP95: metricValue(metrics, ['d1RowsReadP95', 'rowsReadP95', 'd1RowsRead']),
    d1RowsReadMax: metricValue(metrics, ['d1RowsReadMax', 'rowsReadMax', 'd1RowsRead']),
    d1RowsWrittenP50: metricValue(metrics, ['d1RowsWrittenP50', 'rowsWrittenP50']),
    d1RowsWrittenP95: metricValue(metrics, ['d1RowsWrittenP95', 'rowsWrittenP95', 'd1RowsWritten']),
    d1RowsWrittenMax: metricValue(metrics, ['d1RowsWrittenMax', 'rowsWrittenMax', 'd1RowsWritten']),
    responseBytesP50: metricValue(metrics, ['p50ResponseBytes', 'responseBytesP50']),
    responseBytesP95: metricValue(metrics, ['p95ResponseBytes', 'responseBytesP95', 'maxResponseBytes']),
    responseBytesMax: metricValue(metrics, ['maxResponseBytes', 'responseBytesMax']),
    workerCpuMsP50: metricValue(metrics, ['workerCpuMsP50', 'cpuMsP50', 'cloudflareCpuMsP50']),
    workerCpuMsP95: metricValue(metrics, ['workerCpuMsP95', 'cpuMsP95', 'cloudflareCpuMsP95', 'workerCpuMs']),
    workerCpuMsMax: metricValue(metrics, ['workerCpuMsMax', 'cpuMsMax', 'cloudflareCpuMsMax', 'workerCpuMs']),
    workerWallMsP50: metricValue(metrics, ['workerWallMsP50', 'workerWallP50', 'cloudflareWallMsP50']),
    workerWallMsP95: metricValue(metrics, ['workerWallMsP95', 'workerWallP95', 'cloudflareWallMsP95', 'workerWallMs']),
    workerWallMsMax: metricValue(metrics, ['workerWallMsMax', 'workerWallMax', 'cloudflareWallMsMax', 'workerWallMs']),
  };
}

function mergeMetric(left, right, key) {
  const leftValue = finiteOrNull(left[key]);
  const rightValue = finiteOrNull(right[key]);
  if (leftValue === null) return rightValue;
  if (rightValue === null) return leftValue;
  return Math.max(leftValue, rightValue);
}

function mergeRouteCosts(costs = []) {
  const byRoute = new Map();
  for (const cost of costs) {
    const mergeKey = `${cost.routeFamily || 'unknown'}\u0000${cost.route}`;
    const existing = byRoute.get(mergeKey);
    if (!existing) {
      byRoute.set(mergeKey, { ...cost, sourcePaths: [...cost.sourcePaths] });
      continue;
    }
    const merged = { ...existing };
    for (const key of Object.keys(cost)) {
      if (['route', 'phase', 'routeFamily', 'routeCostStatus', 'evidenceStatus', 'redactionStatus'].includes(key)) continue;
      if (key === 'sourcePaths') {
        merged.sourcePaths = [...new Set([...merged.sourcePaths, ...cost.sourcePaths])].sort();
      } else {
        merged[key] = mergeMetric(existing, cost, key);
      }
    }
    byRoute.set(mergeKey, merged);
  }
  return [...byRoute.values()].sort((left, right) => left.route.localeCompare(right.route));
}

function buildRouteFamilyCoverage(routeCosts = []) {
  const byFamily = new Map();
  for (const cost of routeCosts) {
    if (!byFamily.has(cost.routeFamily)) byFamily.set(cost.routeFamily, []);
    byFamily.get(cost.routeFamily).push(cost);
  }
  const families = REQUIRED_ROUTE_FAMILIES.map((family) => {
    const matches = byFamily.get(family.id) || [];
    if (!matches.length) {
      return {
        routeFamily: family.id,
        status: 'missing-route',
        routes: [],
        missingMetrics: [...REQUIRED_ROUTE_COST_METRICS],
      };
    }
    const missingMetrics = REQUIRED_ROUTE_COST_METRICS.filter((metric) => (
      !matches.some((cost) => finiteOrNull(cost[metric]) !== null)
    ));
    const hasAnyMetric = matches.some((cost) => (
      REQUIRED_ROUTE_COST_METRICS.some((metric) => finiteOrNull(cost[metric]) !== null)
    ));
    const hasPartialStatus = matches.some((cost) => cost.routeCostStatus === 'partial');
    return {
      routeFamily: family.id,
      status: !missingMetrics.length ? 'measured' : (hasAnyMetric || hasPartialStatus ? 'partial' : 'blocked-or-missing'),
      routes: matches.map((cost) => cost.route),
      missingMetrics,
      evidenceStatuses: [...new Set(matches.map((cost) => cost.evidenceStatus).filter(Boolean))].sort(),
      redactionStatuses: [...new Set(matches.map((cost) => cost.redactionStatus).filter(Boolean))].sort(),
    };
  });
  return {
    required: REQUIRED_ROUTE_FAMILIES.length,
    measured: families.filter((family) => family.status === 'measured').length,
    partial: families.filter((family) => family.status === 'partial').length,
    missing: families.filter((family) => family.status === 'missing-route' || family.status === 'blocked-or-missing').length,
    families,
  };
}

export function extractMeasuredRouteCosts(evidenceFiles = []) {
  const costs = [];
  const sources = [];
  for (const file of evidenceFiles) {
    const data = file.data || file;
    const sourcePath = file.path || file.sourcePath || null;
    sources.push({
      path: sourcePath,
      evidenceKind: evidenceKind(data),
      finishedAt: evidenceTime(data),
      inputCertifying: data?.certifying === true,
      usedForCertification: false,
      modellingInputStatus: 'non-certifying-modelling-input',
    });
    for (const [route, metrics] of routeEntriesFromEvidence(data)) {
      costs.push(normaliseRouteCost(route, metrics, sourcePath));
    }
  }
  return {
    sources,
    routeCosts: mergeRouteCosts(costs),
  };
}

function costForMode(routeCost, metric, mode) {
  const prefix = metric;
  if (!routeCost) return null;
  if (mode === 'optimistic') {
    return metricValue(routeCost, [`${prefix}P50`, `${prefix}P95`, `${prefix}Max`]);
  }
  if (mode === 'pessimistic') {
    return metricValue(routeCost, [`${prefix}Max`, `${prefix}P95`, `${prefix}P50`]);
  }
  return metricValue(routeCost, [`${prefix}P95`, `${prefix}Max`, `${prefix}P50`]);
}

function routeForPhase(routeCosts, phase) {
  return routeCosts.find((route) => route.phase === phase) || null;
}

function buildQuotaUse(value, limit, { complete = true } = {}) {
  const n = finiteOrNull(value);
  if (n === null) return { value: null, limit, percent: null, status: 'unknown', coverage: 'missing' };
  const percent = (n / limit) * 100;
  const thresholdStatus = percent >= 80 ? 'red' : percent >= 60 ? 'amber' : 'green';
  return {
    value: round(n, 2),
    limit,
    percent: round(percent, 2),
    status: !complete && thresholdStatus !== 'red' ? 'unknown' : thresholdStatus,
    coverage: complete ? 'complete' : 'partial-lower-bound',
  };
}

function markMetricGap(totals, metric, route, reason) {
  totals.metricGaps[metric].push({ route, reason });
}

function addRouteTotals(totals, routeCost, requestCount, mode, warnings, label) {
  if (!routeCost) {
    warnings.push(`missing-measured-${label}-route-cost`);
    totals.dynamicRequests += requestCount;
    markMetricGap(totals, 'd1Queries', label, 'missing-route-cost');
    markMetricGap(totals, 'd1RowsRead', label, 'missing-route-cost');
    markMetricGap(totals, 'd1RowsWritten', label, 'missing-route-cost');
    markMetricGap(totals, 'responseBytes', label, 'missing-route-cost');
    totals.routesMissingCpu.push(label);
    return;
  }

  totals.dynamicRequests += requestCount;
  const queryCount = costForMode(routeCost, 'queryCount', mode);
  const rowsRead = costForMode(routeCost, 'd1RowsRead', mode);
  const rowsWritten = costForMode(routeCost, 'd1RowsWritten', mode);
  const responseBytes = costForMode(routeCost, 'responseBytes', mode);
  const workerCpuMs = costForMode(routeCost, 'workerCpuMs', mode);

  if (queryCount !== null) {
    totals.d1Queries += requestCount * queryCount;
  } else {
    markMetricGap(totals, 'd1Queries', routeCost.route, 'missing-query-count');
  }
  if (rowsRead !== null) {
    totals.d1RowsRead += requestCount * rowsRead;
  } else {
    markMetricGap(totals, 'd1RowsRead', routeCost.route, 'missing-d1-rows-read');
  }
  if (rowsWritten !== null) {
    totals.d1RowsWritten += requestCount * rowsWritten;
  } else {
    markMetricGap(totals, 'd1RowsWritten', routeCost.route, 'missing-d1-rows-written');
  }
  if (responseBytes !== null) {
    totals.responseBytes += requestCount * responseBytes;
  } else {
    markMetricGap(totals, 'responseBytes', routeCost.route, 'missing-response-bytes');
  }
  if (workerCpuMs !== null) {
    totals.workerCpuSamples.push({ route: routeCost.route, workerCpuMs });
  } else {
    totals.routesMissingCpu.push(routeCost.route);
  }
  if (queryCount !== null) {
    totals.maxD1QueriesPerInvocation = Math.max(totals.maxD1QueriesPerInvocation, queryCount);
  }
}

function workerCpuJudgement(samples, missingRoutes, limits) {
  if (!samples.length) {
    return {
      status: 'unknown',
      reason: 'missing-worker-cpu-join',
      maxWorkerCpuMs: null,
      routesMissingCpu: [...new Set(missingRoutes)].sort(),
    };
  }
  const maxSample = samples.reduce((best, sample) => (
    sample.workerCpuMs > best.workerCpuMs ? sample : best
  ), samples[0]);
  const percent = (maxSample.workerCpuMs / limits.workerCpuMsPerInvocation) * 100;
  return {
    status: percent >= 80 ? 'red' : percent >= 60 ? 'amber' : 'green',
    reason: missingRoutes.length ? 'partial-worker-cpu-join' : 'worker-cpu-modelled-from-joined-evidence',
    maxWorkerCpuMs: round(maxSample.workerCpuMs, 3),
    maxRoute: maxSample.route,
    limitMs: limits.workerCpuMsPerInvocation,
    percentOfLimit: round(percent, 2),
    routesMissingCpu: [...new Set(missingRoutes)].sort(),
  };
}

function d1InvocationJudgement(maxQueries, limits) {
  const percent = (maxQueries / limits.workerSubrequestsPerInvocation) * 100;
  return {
    maxD1QueriesPerInvocation: round(maxQueries, 2),
    limit: limits.workerSubrequestsPerInvocation,
    percentOfLimit: round(percent, 2),
    status: percent >= 80 ? 'red' : percent >= 60 ? 'amber' : 'green',
  };
}

function bottlenecks(quotaUses, cpu) {
  const entries = Object.entries(quotaUses)
    .filter(([, value]) => value.percent !== null)
    .sort((left, right) => right[1].percent - left[1].percent)
    .map(([quota, value]) => ({ quota, percent: value.percent, status: value.status }));
  if (cpu.status === 'unknown') {
    entries.push({ quota: 'workerCpuMsPerInvocation', percent: null, status: 'unknown' });
  }
  return entries.slice(0, 4);
}

function recommendationsFor(modeLedger) {
  const recommendations = [];
  const quotaUses = modeLedger.quotaUse;
  if (quotaUses.d1RowsReadPerDay.status === 'amber' || quotaUses.d1RowsReadPerDay.status === 'red') {
    recommendations.push({
      path: 'statement-map-backed query-plan read reduction',
      protects: ['D1 rows read/day', 'D1 query duration', 'bootstrap wall-time tail'],
      triggeredBy: 'd1RowsReadPerDay',
    });
  }
  if (quotaUses.dynamicRequestsPerDay.status === 'amber' || quotaUses.dynamicRequestsPerDay.status === 'red') {
    recommendations.push({
      path: 'burst pacing and retry/backoff shaping',
      protects: ['Worker dynamic requests/day', '15-minute burst shape'],
      triggeredBy: 'dynamicRequestsPerDay',
    });
  }
  if (quotaUses.d1RowsWrittenPerDay.status === 'amber' || quotaUses.d1RowsWrittenPerDay.status === 'red') {
    recommendations.push({
      path: 'write-amplification review before new indexes',
      protects: ['D1 rows written/day'],
      triggeredBy: 'd1RowsWrittenPerDay',
    });
  }
  if (modeLedger.workerCpu.status === 'unknown') {
    recommendations.push({
      path: 'complete Worker CPU join before CPU optimisation',
      protects: ['Worker CPU ms/invocation attribution'],
      triggeredBy: 'missing-worker-cpu-join',
    });
  }
  return recommendations;
}

function buildModeLedger({ learners, mode, assumptions, routeCosts, limits }) {
  const bootstrapRoute = routeForPhase(routeCosts, 'bootstrap');
  const commandRoute = routeForPhase(routeCosts, 'command');
  const setupRoute = routeForPhase(routeCosts, 'setup');
  const parentAdminRoute = routeForPhase(routeCosts, 'parent-admin');
  const warnings = [];
  const totals = {
    dynamicRequests: 0,
    d1Queries: 0,
    d1RowsRead: 0,
    d1RowsWritten: 0,
    responseBytes: 0,
    workerCpuSamples: [],
    routesMissingCpu: [],
    maxD1QueriesPerInvocation: 0,
    metricGaps: {
      d1Queries: [],
      d1RowsRead: [],
      d1RowsWritten: [],
      responseBytes: [],
    },
  };

  addRouteTotals(
    totals,
    bootstrapRoute,
    learners * assumptions.bootstrapPerLearnerPerDay,
    mode,
    warnings,
    'bootstrap',
  );
  addRouteTotals(
    totals,
    commandRoute,
    learners * assumptions.commandPerLearnerPerDay,
    mode,
    warnings,
    'command',
  );
  addRouteTotals(
    totals,
    setupRoute,
    learners * assumptions.setupPerLearnerPerDay,
    mode,
    warnings,
    'setup',
  );
  addRouteTotals(
    totals,
    parentAdminRoute,
    learners * assumptions.parentAdminReadsPerLearnerPerDay,
    mode,
    warnings,
    'parent-admin',
  );

  const retryFactor = assumptions.retryBackoffFactor;
  const dynamicRequestsPerDay = totals.dynamicRequests * retryFactor;
  const d1RowsReadPerDay = totals.d1RowsRead * retryFactor;
  const d1RowsWrittenPerDay = totals.d1RowsWritten * retryFactor;
  const responseBytesPerDay = totals.responseBytes * retryFactor;
  const worst15MinuteDynamicRequests = dynamicRequestsPerDay * assumptions.burst15MinuteFraction;
  const workerCpu = workerCpuJudgement(totals.workerCpuSamples, totals.routesMissingCpu, limits);
  const quotaUse = {
    dynamicRequestsPerDay: buildQuotaUse(dynamicRequestsPerDay, limits.dynamicRequestsPerDay),
    d1RowsReadPerDay: buildQuotaUse(d1RowsReadPerDay, limits.d1RowsReadPerDay, {
      complete: totals.metricGaps.d1RowsRead.length === 0,
    }),
    d1RowsWrittenPerDay: buildQuotaUse(d1RowsWrittenPerDay, limits.d1RowsWrittenPerDay, {
      complete: totals.metricGaps.d1RowsWritten.length === 0,
    }),
  };

  const ledger = {
    learners,
    mode,
    assumptions,
    totals: {
      dynamicRequestsPerDay: round(dynamicRequestsPerDay),
      d1QueriesPerDay: round(totals.d1Queries * retryFactor),
      d1RowsReadPerDay: round(d1RowsReadPerDay),
      d1RowsWrittenPerDay: round(d1RowsWrittenPerDay),
      responseBytesPerDay: round(responseBytesPerDay),
      responseMiBPerDay: round(responseBytesPerDay / 1024 / 1024, 3),
      worst15MinuteDynamicRequests: round(worst15MinuteDynamicRequests),
    },
    quotaUse,
    workerCpu,
    d1Invocation: d1InvocationJudgement(totals.maxD1QueriesPerInvocation, limits),
    bottlenecks: bottlenecks(quotaUse, workerCpu),
    metricGaps: totals.metricGaps,
    warnings,
  };
  ledger.phase2Recommendations = recommendationsFor(ledger);
  return ledger;
}

export function buildCapacityBudgetLedger({
  evidenceFiles = [],
  learnerCounts = DEFAULT_LEARNER_COUNTS,
  limits = CLOUDFLARE_FREE_LIMITS,
  generatedAt = new Date().toISOString(),
} = {}) {
  validateLimits(limits);
  const { sources, routeCosts } = extractMeasuredRouteCosts(evidenceFiles);
  if (!routeCosts.length) throw new Error('No measured route summaries found in budget ledger inputs');
  const routeFamilyCoverage = buildRouteFamilyCoverage(routeCosts);

  const scenarios = learnerCounts.map((learners) => ({
    learners,
    modes: Object.fromEntries(Object.entries(MODE_ASSUMPTIONS).map(([mode, assumptions]) => [
      mode,
      buildModeLedger({ learners, mode, assumptions, routeCosts, limits }),
    ])),
  }));

  return {
    schema: 1,
    kind: 'capacity-1000-learner-free-tier-budget-ledger',
    generatedAt,
    modellingOnly: true,
    certifying: false,
    certification: {
      status: 'non-certifying-modelling',
      reasons: [
        'budget-ledger-is-not-production-evidence',
        'capacity-certification-still-requires-verifier-backed-strict-evidence',
      ],
    },
    limits,
    amberThresholdPercent: 60,
    redThresholdPercent: 80,
    sources,
    routeCosts,
    routeFamilyCoverage,
    missingRouteCosts: routeFamilyCoverage.families.filter((family) => (
      family.status !== 'measured'
    )),
    scenarios,
  };
}

function renderQuotaCell(entry) {
  if (!entry || entry.percent === null) return 'unknown';
  const coverage = entry.coverage === 'partial-lower-bound' ? ', lower-bound' : '';
  return `${entry.value} (${entry.percent}%, ${entry.status}${coverage})`;
}

export function renderBudgetLedgerMarkdown(ledger) {
  const lines = [
    '# 1000-Learner Free-Tier Budget Ledger',
    '',
    '> Non-certifying modelling worksheet. This document does not certify 30, 60, 100, 300, or 1000 learner capacity; certification still requires verifier-backed strict evidence.',
    '',
    `Generated: ${ledger.generatedAt}`,
    `Cloudflare limits retrieved: ${ledger.limits.retrievedAt}`,
    '',
    '## Inputs',
    '',
    '| Source | Kind | Used for certification |',
    '| --- | --- | --- |',
  ];

  for (const source of ledger.sources) {
    lines.push(`| ${source.path || 'inline'} | ${source.evidenceKind} | no |`);
  }

  lines.push(
    '',
    '## Free-Tier Limits',
    '',
    '| Quota | Free limit | Amber | Red |',
    '| --- | ---: | ---: | ---: |',
    `| Worker dynamic requests/day | ${ledger.limits.dynamicRequestsPerDay} | ${ledger.amberThresholdPercent}% | ${ledger.redThresholdPercent}% |`,
    `| D1 rows read/day | ${ledger.limits.d1RowsReadPerDay} | ${ledger.amberThresholdPercent}% | ${ledger.redThresholdPercent}% |`,
    `| D1 rows written/day | ${ledger.limits.d1RowsWrittenPerDay} | ${ledger.amberThresholdPercent}% | ${ledger.redThresholdPercent}% |`,
    `| Worker CPU/invocation | ${ledger.limits.workerCpuMsPerInvocation} ms | ${ledger.amberThresholdPercent}% | ${ledger.redThresholdPercent}% |`,
    `| Worker subrequests/invocation | ${ledger.limits.workerSubrequestsPerInvocation} | ${ledger.amberThresholdPercent}% | ${ledger.redThresholdPercent}% |`,
    '',
    '## Scenario Totals',
    '',
    '| Learners | Mode | Requests/day | D1 rows read/day | D1 rows written/day | Worst 15-minute requests | CPU judgement | Top bottleneck |',
    '| ---: | --- | --- | --- | --- | ---: | --- | --- |',
  );

  for (const scenario of ledger.scenarios) {
    for (const [mode, model] of Object.entries(scenario.modes)) {
      const top = model.bottlenecks[0];
      lines.push(`| ${scenario.learners} | ${mode} | ${renderQuotaCell(model.quotaUse.dynamicRequestsPerDay)} | ${renderQuotaCell(model.quotaUse.d1RowsReadPerDay)} | ${renderQuotaCell(model.quotaUse.d1RowsWrittenPerDay)} | ${model.totals.worst15MinuteDynamicRequests} | ${model.workerCpu.status} | ${top ? `${top.quota} (${top.status})` : 'none'} |`);
    }
  }

  lines.push(
    '',
    '## Phase 2 Paths Protected',
    '',
    '| Learners | Mode | Path | Protects | Trigger |',
    '| ---: | --- | --- | --- | --- |',
  );

  for (const scenario of ledger.scenarios) {
    for (const [mode, model] of Object.entries(scenario.modes)) {
      for (const recommendation of model.phase2Recommendations) {
        lines.push(`| ${scenario.learners} | ${mode} | ${recommendation.path} | ${recommendation.protects.join(', ')} | ${recommendation.triggeredBy} |`);
      }
    }
  }

  lines.push(
    '',
    '## Required Route-Family Coverage',
    '',
    '| Route family | Status | Routes | Missing metrics |',
    '| --- | --- | --- | --- |',
  );

  for (const family of ledger.routeFamilyCoverage.families) {
    lines.push(`| ${family.routeFamily} | ${family.status} | ${family.routes.length ? family.routes.join(', ') : 'none'} | ${family.missingMetrics.length ? family.missingMetrics.join(', ') : 'none'} |`);
  }

  lines.push(
    '',
    '## Residual Gaps',
    '',
    '- Worker CPU remains `unknown` wherever the input evidence has no joined Cloudflare CPU telemetry.',
    '- Quota cells marked `lower-bound` have missing measured route or metric coverage; green/amber lower bounds stay `unknown` rather than becoming capacity claims.',
    '- Parent/admin reads are modelled only when a measured parent/admin route summary is present; otherwise the ledger records a missing-route warning rather than inventing D1 cost.',
    '- The worksheet uses measured route costs with modelled daily usage assumptions; it is an internal planning ledger, not a launch claim.',
  );

  return `${lines.join('\n')}\n`;
}

export function parseBudgetLedgerArgs(argv = []) {
  const options = {
    inputPaths: [],
    jsonOutputPath: DEFAULT_BUDGET_LEDGER_JSON_PATH,
    markdownOutputPath: DEFAULT_BUDGET_LEDGER_MARKDOWN_PATH,
    learnerCounts: [...DEFAULT_LEARNER_COUNTS],
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--input') {
      const value = argv[++i];
      if (!value) throw new Error('--input requires a path');
      options.inputPaths.push(value);
    } else if (arg === '--json-output') {
      const value = argv[++i];
      if (!value) throw new Error('--json-output requires a path');
      options.jsonOutputPath = value;
    } else if (arg === '--markdown-output') {
      const value = argv[++i];
      if (!value) throw new Error('--markdown-output requires a path');
      options.markdownOutputPath = value;
    } else if (arg === '--learners') {
      const value = argv[++i];
      if (!value) throw new Error('--learners requires a comma-separated list');
      options.learnerCounts = value.split(',').map((item) => Number(item.trim()));
      if (options.learnerCounts.some((count) => !Number.isInteger(count) || count < 1)) {
        throw new Error('--learners must contain positive integers');
      }
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function readEvidenceFile(filePath, cwd) {
  const absolute = path.resolve(cwd, filePath);
  if (!existsSync(absolute)) throw new Error(`Input file not found: ${absolute}`);
  return {
    path: path.relative(cwd, absolute),
    data: JSON.parse(readFileSync(absolute, 'utf8')),
  };
}

export async function runCapacityBudgetLedger(argv = process.argv.slice(2), {
  cwd = process.cwd(),
  now = () => new Date(),
} = {}) {
  const options = parseBudgetLedgerArgs(argv);
  if (options.help) {
    return {
      ok: true,
      help: [
        'Usage: node scripts/build-capacity-budget-ledger.mjs --input <capacity-evidence.json> [--input <path> ...]',
        '       [--json-output reports/capacity/latest-1000-learner-budget.json]',
        '       [--markdown-output docs/operations/capacity-1000-learner-free-tier-budget.md]',
        'Builds a non-certifying 30/60/100/300/1000 learner free-tier modelling ledger from measured route summaries.',
      ].join('\n'),
    };
  }
  if (!options.inputPaths.length) throw new Error('At least one --input path is required');

  const evidenceFiles = options.inputPaths.map((inputPath) => readEvidenceFile(inputPath, cwd));
  const ledger = buildCapacityBudgetLedger({
    evidenceFiles,
    learnerCounts: options.learnerCounts,
    generatedAt: now().toISOString(),
  });

  const jsonOutputPath = path.resolve(cwd, options.jsonOutputPath);
  const markdownOutputPath = path.resolve(cwd, options.markdownOutputPath);
  mkdirSync(path.dirname(jsonOutputPath), { recursive: true });
  mkdirSync(path.dirname(markdownOutputPath), { recursive: true });
  writeFileSync(jsonOutputPath, JSON.stringify(ledger, null, 2) + '\n', 'utf8');
  writeFileSync(markdownOutputPath, renderBudgetLedgerMarkdown(ledger), 'utf8');
  return { ok: true, jsonOutputPath, markdownOutputPath, ledger };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCapacityBudgetLedger().then((result) => {
    if (result.help) {
      console.log(result.help);
      return;
    }
    console.log(JSON.stringify({
      ok: true,
      jsonOutputPath: result.jsonOutputPath,
      markdownOutputPath: result.markdownOutputPath,
      certifying: result.ledger.certifying,
    }, null, 2));
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
