#!/usr/bin/env node

import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

import { correctResponseFor } from './grammar-production-smoke.mjs';
import {
  autoNameEvidencePath,
  buildEvidencePayload,
  persistEvidenceFile,
  validateThresholdConfigKeys,
} from './lib/capacity-evidence.mjs';

const DEFAULT_PRODUCTION_ORIGIN = 'https://ks2.eugnel.uk';
const DEFAULT_TIMEOUT_MS = 15_000;
const GRAMMAR_LOAD_ITEM = Object.freeze({
  templateId: 'fronted_adverbial_choose',
  seed: 1,
});
let requestSequence = 0;

function readOptionValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${optionName} requires a value.`);
  }
  return value;
}

function nonNegativeInteger(value, optionName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${optionName} must be a non-negative integer.`);
  }
  return parsed;
}

function positiveInteger(value, optionName) {
  const parsed = nonNegativeInteger(value, optionName);
  if (parsed <= 0) throw new Error(`${optionName} must be greater than zero.`);
  return parsed;
}

function normaliseOrigin(value) {
  const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  return url.origin;
}

function isLocalOrigin(origin) {
  const host = new URL(origin).hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.test');
}

function optionHeaders(headers = []) {
  const output = {};
  for (const header of headers) {
    const separator = header.indexOf(':');
    if (separator <= 0) throw new Error(`Invalid header "${header}". Use "name: value".`);
    const name = header.slice(0, separator).trim();
    const value = header.slice(separator + 1).trim();
    if (!name) throw new Error(`Invalid header "${header}". Header name is required.`);
    output[name] = value;
  }
  return output;
}

function hasAuthHeader(headers = []) {
  for (const header of headers) {
    const separator = header.indexOf(':');
    const name = separator > 0 ? header.slice(0, separator).trim().toLowerCase() : '';
    const value = separator > 0 ? header.slice(separator + 1).trim() : '';
    if ((name === 'authorization' || name === 'cookie') && value) return true;
  }
  return false;
}

function hasExplicitAuthConfig(options = {}) {
  return Boolean(
    String(options.cookie || '').trim()
    || String(options.bearer || '').trim()
    || options.demoSessions
    || hasAuthHeader(options.headers),
  );
}

function nonAuthOptionHeaders(headers = []) {
  const output = optionHeaders(headers);
  for (const key of Object.keys(output)) {
    if (['authorization', 'cookie'].includes(key.toLowerCase())) {
      delete output[key];
    }
  }
  return output;
}

function authHeaders(options, cookie = '') {
  return {
    accept: 'application/json',
    ...optionHeaders(options.headers),
    ...(options.bearer ? { authorization: `Bearer ${options.bearer}` } : {}),
    ...(cookie || options.cookie ? { cookie: cookie || options.cookie } : {}),
  };
}

function contextAuthHeaders(options, context) {
  const cookie = context.cookie || '';
  if (options.demoSessions) {
    return {
      accept: 'application/json',
      ...nonAuthOptionHeaders(options.headers),
      ...(cookie ? { cookie } : {}),
    };
  }
  return authHeaders(options, cookie);
}

function safeFailureMessage({ payload, networkError, parseError }) {
  if (payload?.message) return payload.message;
  if (networkError) return networkError.message || 'Network request failed.';
  if (parseError) return 'Response body was not valid JSON.';
  return '';
}

function getSetCookies(response) {
  const values = response.headers.getSetCookie?.();
  if (Array.isArray(values) && values.length) return values;
  return String(response.headers.get('set-cookie') || '')
    .split(/,\s*(?=ks2_)/)
    .filter(Boolean);
}

function sessionCookieFrom(response) {
  return getSetCookies(response)
    .map((cookie) => String(cookie || '').split(';')[0])
    .find((cookie) => cookie.startsWith('ks2_session=')) || '';
}

function timeoutSignal(timeoutMs) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  return controller.signal;
}

async function wait(ms) {
  if (!ms) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function timedJsonRequest({
  origin,
  path,
  method = 'GET',
  headers = {},
  body = null,
  scenario,
  virtualLearner = null,
  timeoutMs,
}) {
  const url = new URL(path, origin);
  const started = performance.now();
  let response;
  let text = '';
  let payload = null;
  let parseError = null;
  let networkError = null;

  try {
    response = await fetch(url, {
      method,
      headers,
      ...(body == null ? {} : { body: JSON.stringify(body) }),
      signal: timeoutSignal(timeoutMs),
    });
    text = await response.text();
    try {
      payload = text ? JSON.parse(text) : {};
    } catch (error) {
      parseError = error;
    }
  } catch (error) {
    networkError = error;
  }

  const wallMs = Math.round((performance.now() - started) * 10) / 10;
  const status = response?.status || 0;
  const bytes = Buffer.byteLength(text || '', 'utf8');
  const failureText = !response?.ok || parseError || networkError
    ? String(text || payload?.message || networkError?.message || parseError?.message || '').slice(0, 2_000)
    : '';
  const ok = Boolean(response?.ok) && payload?.ok !== false && !parseError && !networkError;

  const measurement = {
    scenario,
    virtualLearner,
    method,
    endpoint: url.pathname,
    status,
    ok,
    wallMs,
    responseBytes: bytes,
    code: payload?.code || payload?.error || null,
    message: safeFailureMessage({ payload, networkError, parseError }),
    requestId: body?.requestId || null,
  };
  Object.defineProperty(measurement, 'payload', {
    value: payload,
    enumerable: false,
  });
  const cookie = response ? sessionCookieFrom(response) : '';
  if (cookie) {
    Object.defineProperty(measurement, 'cookie', {
      value: cookie,
      enumerable: false,
    });
  }
  if (failureText) {
    Object.defineProperty(measurement, 'failureText', {
      value: failureText,
      enumerable: false,
    });
  }
  return measurement;
}

export function parseClassroomLoadArgs(argv = process.argv.slice(2)) {
  const options = {
    mode: 'dry-run',
    origin: '',
    learners: 3,
    bootstrapBurst: 6,
    rounds: 1,
    pacingMs: 0,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    cookie: '',
    bearer: '',
    headers: [],
    demoSessions: false,
    confirmProductionLoad: false,
    includeMeasurements: true,
    includeRequestSamples: false,
    help: false,
    output: undefined,
    configPath: '',
    thresholds: {},
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--dry-run') {
      options.mode = 'dry-run';
    } else if (arg === '--local-fixture') {
      options.mode = 'local-fixture';
    } else if (arg === '--production') {
      options.mode = 'production';
    } else if (arg === '--origin' || arg === '--url') {
      options.origin = normaliseOrigin(readOptionValue(argv, index, arg));
      index += 1;
    } else if (arg === '--learners') {
      options.learners = positiveInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--bootstrap-burst') {
      options.bootstrapBurst = positiveInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--rounds') {
      options.rounds = positiveInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--pacing-ms') {
      options.pacingMs = nonNegativeInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = positiveInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--cookie') {
      options.cookie = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--bearer') {
      options.bearer = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--header') {
      options.headers.push(readOptionValue(argv, index, arg));
      index += 1;
    } else if (arg === '--demo-sessions') {
      options.demoSessions = true;
    } else if (arg === '--confirm-production-load') {
      options.confirmProductionLoad = true;
    } else if (arg === '--summary-only') {
      options.includeMeasurements = false;
    } else if (arg === '--include-request-samples') {
      options.includeRequestSamples = true;
    } else if (arg === '--output') {
      options.output = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--config') {
      options.configPath = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--max-5xx') {
      options.thresholds.max5xx = nonNegativeInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--max-network-failures') {
      options.thresholds.maxNetworkFailures = nonNegativeInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--max-bootstrap-p95-ms') {
      options.thresholds.maxBootstrapP95Ms = positiveInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--max-command-p95-ms') {
      options.thresholds.maxCommandP95Ms = positiveInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--max-response-bytes') {
      options.thresholds.maxResponseBytes = positiveInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--require-zero-signals') {
      options.thresholds.requireZeroSignals = true;
    } else if (arg === '--require-bootstrap-capacity') {
      options.thresholds.requireBootstrapCapacity = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

export function buildClassroomLoadPlan(options = {}) {
  const mode = options.mode || 'dry-run';
  const origin = options.origin || (mode === 'production' ? DEFAULT_PRODUCTION_ORIGIN : '');
  const learners = positiveInteger(options.learners ?? 3, '--learners');
  const bootstrapBurst = positiveInteger(options.bootstrapBurst ?? Math.max(learners, 1), '--bootstrap-burst');
  const rounds = positiveInteger(options.rounds ?? 1, '--rounds');
  const pacingMs = nonNegativeInteger(options.pacingMs ?? 0, '--pacing-ms');
  const virtualLearners = Array.from({ length: learners }, (_, index) => ({
    index,
    label: `learner-${String(index + 1).padStart(2, '0')}`,
  }));

  return {
    mode,
    origin: origin || null,
    virtualLearners,
    scenarios: [
      {
        name: 'cold-bootstrap-burst',
        requests: bootstrapBurst,
        concurrency: Math.min(bootstrapBurst, learners),
        endpoint: 'GET /api/bootstrap',
      },
      {
        name: 'human-paced-grammar-round',
        learners,
        rounds,
        pacingMs,
        commandsPerRound: 3,
        endpoint: 'POST /api/subjects/grammar/command',
      },
    ],
    expectedRequests: learners + bootstrapBurst + (learners * rounds * 3) + (options.demoSessions ? learners : 0),
    safety: {
      productionRequiresConfirmation: true,
      productionRequiresAuth: true,
      localFixtureRequiresDemoSessions: true,
    },
  };
}

export function validateClassroomLoadOptions(options = {}) {
  const thresholds = options.thresholds || {};
  if (thresholds.max5xx !== undefined && thresholds.maxNetworkFailures === undefined) {
    throw new Error('--max-5xx requires --max-network-failures to avoid a silent success on total network failure.');
  }
  if (options.help || options.mode === 'dry-run') return;
  if (!options.origin) {
    throw new Error(`${options.mode} load requires --origin.`);
  }
  if (options.mode === 'local-fixture') {
    if (!isLocalOrigin(options.origin)) {
      throw new Error('local fixture load must use a localhost, loopback, or .test origin.');
    }
    if (!options.demoSessions) {
      throw new Error('local fixture load requires --demo-sessions so each virtual learner gets an isolated session.');
    }
    return;
  }
  if (options.mode === 'production') {
    const hasAuth = hasExplicitAuthConfig(options);
    if (!options.confirmProductionLoad || !hasAuth) {
      throw new Error('production load requires --confirm-production-load and explicit auth configuration (--cookie, --bearer, --header, or --demo-sessions).');
    }
  }
}

function groupKey(entry) {
  return `${entry.method} ${entry.endpoint} ${entry.status || 'network'}`;
}

function percentile(values, percentileValue) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return sorted[index];
}

function signalFor(entry) {
  const text = `${entry.code || ''} ${entry.message || ''} ${entry.failureText || ''}`.toLowerCase();
  if (entry.status === 1102 || /exceeded[_\s-]?cpu|cpu limit|worker cpu/.test(text)) return 'exceededCpu';
  if (/\berror\s*1102\b|\b1102\b.*worker/.test(text)) return 'exceededCpu';
  if (/d1.*overloaded|overloaded/.test(text)) return 'd1Overloaded';
  if (/daily.*limit|rows.*limit|quota/.test(text)) return 'd1DailyLimit';
  if (entry.status === 401 || entry.status === 403 || /unauth|forbidden/.test(text)) return 'authFailure';
  if (entry.status >= 500) return 'server5xx';
  if (entry.status === 429) return 'rateLimited';
  if (!entry.status) return 'networkFailure';
  return null;
}

export function summariseCapacityResults(measurements = [], plan = {}) {
  const statusCounts = {};
  const endpointStatus = {};
  const signals = {};
  const endpointMetrics = {};
  const failures = [];

  for (const entry of measurements) {
    const status = String(entry.status || 'network');
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    const key = groupKey(entry);
    endpointStatus[key] = (endpointStatus[key] || 0) + 1;

    const endpointKey = `${entry.method} ${entry.endpoint}`;
    const metrics = endpointMetrics[endpointKey] || {
      count: 0,
      wallMs: [],
      responseBytes: [],
      maxResponseBytes: 0,
    };
    metrics.count += 1;
    metrics.wallMs.push(Number(entry.wallMs) || 0);
    metrics.responseBytes.push(Number(entry.responseBytes) || 0);
    metrics.maxResponseBytes = Math.max(metrics.maxResponseBytes, Number(entry.responseBytes) || 0);
    endpointMetrics[endpointKey] = metrics;

    const signal = signalFor(entry);
    if (signal) signals[signal] = (signals[signal] || 0) + 1;
    if (!entry.ok || signal) {
      failures.push({
        scenario: entry.scenario,
        endpoint: endpointKey,
        status: entry.status,
        code: entry.code,
        message: entry.message,
        signal,
      });
    }
  }

  const endpoints = Object.fromEntries(Object.entries(endpointMetrics).map(([key, metrics]) => [key, {
    count: metrics.count,
    p50WallMs: percentile(metrics.wallMs, 50),
    p95WallMs: percentile(metrics.wallMs, 95),
    maxResponseBytes: metrics.maxResponseBytes,
  }]));

  return {
    ok: failures.length === 0,
    totalRequests: measurements.length,
    expectedRequests: plan.expectedRequests || 0,
    statusCounts,
    endpointStatus,
    endpoints,
    signals,
    failures,
  };
}

async function createDemoContextWithResponse(origin, options, virtualLearner) {
  const measurement = await timedJsonRequest({
    origin,
    path: '/api/demo/session',
    method: 'POST',
    headers: {
      accept: 'application/json',
      ...nonAuthOptionHeaders(options.headers),
      'content-type': 'application/json',
      origin,
    },
    scenario: 'demo-session-setup',
    virtualLearner: virtualLearner.label,
    timeoutMs: options.timeoutMs,
  });
  if (!measurement.ok || !measurement.cookie || !measurement.payload?.session?.learnerId) {
    throw new Error(`Demo session setup failed for ${virtualLearner.label}; refusing to reuse global auth for an isolated load context.`);
  }
  return {
    ...virtualLearner,
    cookie: measurement.cookie,
    accountId: measurement.payload?.session?.accountId || null,
    learnerId: measurement.payload?.session?.learnerId || null,
    revision: 0,
    setupMeasurement: measurement,
  };
}

async function loadBootstrapForContext(origin, options, context, scenario) {
  const measurement = await timedJsonRequest({
    origin,
    path: '/api/bootstrap',
    method: 'GET',
    headers: contextAuthHeaders(options, context),
    scenario,
    virtualLearner: context.label,
    timeoutMs: options.timeoutMs,
  });
  const learnerId = measurement.payload?.learners?.selectedId || context.learnerId;
  const revision = Number(measurement.payload?.learners?.byId?.[learnerId]?.stateRevision);
  return {
    measurement,
    context: {
      ...context,
      learnerId,
      revision: Number.isFinite(revision) ? revision : context.revision,
    },
  };
}

function commandRequestId(context, round, command) {
  requestSequence += 1;
  const learner = String(context.learnerId || context.label).replace(/[^a-zA-Z0-9_-]/g, '-');
  return `load-${learner}-r${round}-${command}-${Date.now()}-${requestSequence}`;
}

async function sendGrammarCommand(origin, options, context, round, command, payload = {}) {
  const requestId = commandRequestId(context, round, command);
  const measurement = await timedJsonRequest({
    origin,
    path: '/api/subjects/grammar/command',
    method: 'POST',
    headers: {
      ...contextAuthHeaders(options, context),
      'content-type': 'application/json',
      origin,
    },
    body: {
      subjectId: 'grammar',
      learnerId: context.learnerId,
      command,
      requestId,
      correlationId: requestId,
      expectedLearnerRevision: context.revision,
      payload,
    },
    scenario: 'human-paced-grammar-round',
    virtualLearner: context.label,
    timeoutMs: options.timeoutMs,
  });
  const nextRevision = Number(measurement.payload?.mutation?.appliedRevision);
  return {
    measurement,
    context: {
      ...context,
      revision: Number.isFinite(nextRevision) ? nextRevision : context.revision,
    },
  };
}

async function runGrammarRound(origin, options, context, round) {
  const measurements = [];
  let current = context;

  let step = await sendGrammarCommand(origin, options, current, round, 'start-session', {
    mode: 'smart',
    roundLength: 1,
    templateId: GRAMMAR_LOAD_ITEM.templateId,
    seed: GRAMMAR_LOAD_ITEM.seed,
  });
  measurements.push(step.measurement);
  current = step.context;

  const currentItem = step.measurement.payload?.subjectReadModel?.session?.currentItem;
  const response = currentItem ? correctResponseFor(currentItem) : { answer: '' };
  step = await sendGrammarCommand(origin, options, current, round, 'submit-answer', { response });
  measurements.push(step.measurement);
  current = step.context;

  step = await sendGrammarCommand(origin, options, current, round, 'continue-session');
  measurements.push(step.measurement);
  current = step.context;

  return { context: current, measurements };
}

async function prepareContexts(origin, options, plan) {
  const setupMeasurements = [];
  let contexts = plan.virtualLearners.map((entry) => ({
    ...entry,
    cookie: options.cookie,
    accountId: null,
    learnerId: null,
    revision: 0,
  }));

  if (options.demoSessions) {
    contexts = [];
    for (const virtualLearner of plan.virtualLearners) {
      const context = await createDemoContextWithResponse(origin, options, virtualLearner);
      setupMeasurements.push(context.setupMeasurement);
      contexts.push(context);
    }
  }

  const bootstrapped = [];
  for (const context of contexts) {
    const { measurement, context: nextContext } = await loadBootstrapForContext(origin, options, context, 'initial-bootstrap');
    setupMeasurements.push(measurement);
    bootstrapped.push(nextContext);
  }

  return { contexts: bootstrapped, measurements: setupMeasurements };
}

async function runColdBootstrapBurst(origin, options, contexts, plan) {
  const scenario = plan.scenarios.find((entry) => entry.name === 'cold-bootstrap-burst');
  const requests = Array.from({ length: scenario.requests }, (_, index) => {
    const context = contexts[index % contexts.length];
    return loadBootstrapForContext(origin, options, context, scenario.name).then((result) => result.measurement);
  });
  return Promise.all(requests);
}

async function runHumanPacedRounds(origin, options, contexts, plan) {
  const measurements = [];
  for (let round = 1; round <= options.rounds; round += 1) {
    for (let index = 0; index < contexts.length; index += 1) {
      const result = await runGrammarRound(origin, options, contexts[index], round);
      contexts[index] = result.context;
      measurements.push(...result.measurements);
      await wait(options.pacingMs);
    }
  }
  return measurements;
}

function loadThresholdConfig(configPath) {
  if (!configPath) return { thresholds: {}, tier: null, minEvidenceSchemaVersion: null };
  let raw;
  try {
    raw = readFileSync(configPath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read threshold config "${configPath}": ${error.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Threshold config "${configPath}" is not valid JSON: ${error.message}`);
  }
  const thresholds = parsed.thresholds || {};
  // Unknown config keys (typos like `maxFivexx`, unsupported keys) must fail
  // loudly: a silently-dropped key is indistinguishable from a configured
  // gate that always passes.
  const unknown = validateThresholdConfigKeys(thresholds);
  if (unknown.length) {
    throw new Error(
      `Threshold config "${configPath}" contains unknown keys: ${unknown.join(', ')}. `
      + 'Check for typos or use a CLI flag for one-off overrides.',
    );
  }
  return {
    thresholds,
    tier: parsed.tier || null,
    minEvidenceSchemaVersion: parsed.minEvidenceSchemaVersion || null,
  };
}

function mergeThresholds(configThresholds = {}, cliThresholds = {}) {
  // CLI thresholds override config values when both are present. An explicit
  // CLI value of 0 is retained as strict; undefined means "inherit from config
  // or leave ungated". requireZero* booleans follow the same rule.
  const merged = { ...configThresholds };
  for (const [key, value] of Object.entries(cliThresholds)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

export async function runClassroomLoadTest(argv = process.argv.slice(2)) {
  const options = parseClassroomLoadArgs(argv);
  if (options.help) {
    return { ok: true, help: true, usage: usage() };
  }
  // Load config first so validateClassroomLoadOptions can see the merged
  // threshold set: a config-only `max5xx` must still trip the
  // `--max-network-failures` pairing rule.
  const config = loadThresholdConfig(options.configPath);
  const thresholds = mergeThresholds(config.thresholds, options.thresholds);
  validateClassroomLoadOptions({ ...options, thresholds });
  const plan = buildClassroomLoadPlan(options);

  const startedAt = new Date().toISOString();
  let report;
  if (options.mode === 'dry-run') {
    report = {
      ok: true,
      dryRun: true,
      plan,
      summary: summariseCapacityResults([], plan),
    };
  } else {
    const origin = options.origin;
    const measurements = [];
    const prepared = await prepareContexts(origin, options, plan);
    measurements.push(...prepared.measurements);
    measurements.push(...await runColdBootstrapBurst(origin, options, prepared.contexts, plan));
    measurements.push(...await runHumanPacedRounds(origin, options, prepared.contexts, plan));
    const summary = summariseCapacityResults(measurements, { ...plan });
    report = {
      ok: summary.ok,
      dryRun: false,
      plan,
      summary,
      ...(options.includeMeasurements ? { measurements } : {}),
    };
  }

  const finishedAt = new Date().toISOString();
  const evidence = buildEvidencePayload({
    report,
    thresholds,
    options,
    timings: { startedAt, finishedAt },
  });

  // Record the config source path alongside tier metadata so verify can
  // confirm the thresholds that backed this run were PR-reviewed.
  // Path is recorded exactly as the operator supplied it; verify normalises
  // to a repo-relative form before checking it is under
  // reports/capacity/configs/.
  const evidenceTier = config.tier
    ? {
      tier: config.tier,
      minEvidenceSchemaVersion: config.minEvidenceSchemaVersion,
      configPath: options.configPath || null,
    }
    : null;
  const finalReport = {
    ...report,
    startedAt,
    finishedAt,
    thresholds: evidence.thresholds,
    failures: evidence.failures,
    safety: evidence.safety,
    reportMeta: evidence.reportMeta,
    ...(evidenceTier ? { tier: evidenceTier } : {}),
    ok: evidence.ok,
  };

  // Only persist when --output was explicitly passed. `parseClassroomLoadArgs`
  // sets `options.output` to `undefined` by default and `readOptionValue`
  // rejects an empty value, so truthiness correctly distinguishes "caller asked
  // for evidence" from "no --output flag present".
  if (options.output) {
    try {
      persistEvidenceFile(options.output, finalReport, {
        includeRequestSamples: options.includeRequestSamples,
      });
      finalReport.evidencePath = options.output;
    } catch (error) {
      throw new Error(`Failed to persist evidence to "${options.output}": ${error.message}`);
    }
  }

  return finalReport;
}

export function usage() {
  return [
    'Usage: node ./scripts/classroom-load-test.mjs [options]',
    '',
    'Modes:',
    '  --dry-run                  Print the planned capacity run without network requests (default)',
    '  --local-fixture            Run against a local/loopback origin using demo sessions',
    '  --production               Run against a production or preview origin; requires explicit confirmation and auth',
    '',
    'Options:',
    '  --origin <url>             Target origin for local-fixture or production runs',
    '  --learners <number>        Virtual learner count, default 3',
    '  --bootstrap-burst <number> Concurrent cold bootstrap requests, default 6',
    '  --rounds <number>          Human-paced Grammar rounds per learner, default 1',
    '  --pacing-ms <number>       Delay between learner command groups, default 0',
    '  --timeout-ms <number>      Per-request timeout, default 15000',
    '  --cookie <cookie>          Cookie header for an existing authenticated run',
    '  --bearer <token>           Authorization bearer token',
    '  --header "name: value"     Extra request header, repeatable',
    '  --demo-sessions            Create one isolated demo session per virtual learner',
    '  --confirm-production-load  Required before --production sends requests',
    '  --summary-only             Omit per-request measurements from JSON output',
    '  --include-request-samples  Include per-request measurements in --output evidence (default off)',
    '',
    'Evidence and thresholds:',
    '  --output <path>            Persist evidence JSON to <path>; auto-names when flag is set without value',
    '  --config <path>            Load pinned thresholds from JSON file (CLI flags override)',
    '  --max-5xx <n>              Fail run when 5xx count exceeds n (requires --max-network-failures)',
    '  --max-network-failures <n> Fail run when network-failure count exceeds n',
    '  --max-bootstrap-p95-ms <n> Fail run when P95 bootstrap wall time exceeds n ms',
    '  --max-command-p95-ms <n>   Fail run when P95 subject command wall time exceeds n ms',
    '  --max-response-bytes <n>   Fail run when any endpoint response exceeds n bytes',
    '  --require-zero-signals     Fail run when any operational signal fires',
    '  --require-bootstrap-capacity  Assert meta.capacity.bootstrapCapacity is present (U3)',
  ].join('\n');
}

if (process.argv[1] && !process.env.NODE_TEST_CONTEXT && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runClassroomLoadTest().then((report) => {
    if (report.help) {
      console.log(report.usage);
    } else {
      console.log(JSON.stringify(report, null, 2));
    }
    process.exitCode = report.ok ? 0 : 1;
  }).catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: error.message,
    }, null, 2));
    process.exitCode = 2;
  });
}
