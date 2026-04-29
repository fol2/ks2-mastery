#!/usr/bin/env node

import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

import { correctResponseFor } from './grammar-production-smoke.mjs';
import {
  autoNameEvidencePath,
  buildCapacityDiagnostics,
  buildEvidencePayload,
  persistEvidenceFile,
  validateThresholdConfigKeys,
} from './lib/capacity-evidence.mjs';
import { loadSessionManifest } from './lib/session-manifest.mjs';

const DEFAULT_PRODUCTION_ORIGIN = 'https://ks2.eugnel.uk';
const DEFAULT_TIMEOUT_MS = 15_000;
const ENDPOINT_TAIL_SAMPLE_LIMIT = 10;
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
    || options.sessionManifest
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
  if (options.demoSessions || options.sessionManifest) {
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

function generateClientRequestId() {
  const randomUuid = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 18)}`;
  return `ks2_req_${randomUuid}`;
}

function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normaliseBootstrapCapacity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const output = {};
  for (const key of [
    'version',
    'mode',
    'limits',
    'learners',
    'practiceSessions',
    'eventLog',
    'subjectStatesBounded',
    'subjectStatesFallbackMode',
  ]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) output[key] = value[key];
  }
  return Object.keys(output).length ? output : null;
}

function normaliseResponseCapacity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    requestId: typeof value.requestId === 'string' ? value.requestId : null,
    queryCount: finiteOrNull(value.queryCount),
    d1RowsRead: finiteOrNull(value.d1RowsRead),
    d1RowsWritten: finiteOrNull(value.d1RowsWritten),
    serverWallMs: finiteOrNull(value.wallMs),
    responseBytes: finiteOrNull(value.responseBytes),
    signals: Array.isArray(value.signals) ? value.signals.filter((entry) => typeof entry === 'string') : [],
    bootstrapMode: typeof value.bootstrapMode === 'string' ? value.bootstrapMode : null,
    bootstrapCapacity: normaliseBootstrapCapacity(value.bootstrapCapacity),
    projectionFallback: typeof value.projectionFallback === 'string' ? value.projectionFallback : null,
  };
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
  // U3: every outgoing load-test request must carry an `x-ks2-request-id`
  // in the Worker's allowed shape so the server-side ingress validator
  // accepts it verbatim and echoes it back. Capturing the echo lets
  // evidence runs correlate client wall time with server structured logs.
  const clientRequestId = headers['x-ks2-request-id'] || generateClientRequestId();
  const outgoingHeaders = { ...headers, 'x-ks2-request-id': clientRequestId };

  const started = performance.now();
  let response;
  let text = '';
  let payload = null;
  let parseError = null;
  let networkError = null;

  try {
    response = await fetch(url, {
      method,
      headers: outgoingHeaders,
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
  const echoedRequestId = response?.headers?.get?.('x-ks2-request-id') || null;
  const responseCapacity = normaliseResponseCapacity(payload?.meta?.capacity);

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
    clientRequestId,
    serverRequestId: echoedRequestId,
    capacity: responseCapacity,
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
    sessionManifest: '',
    confirmProductionLoad: false,
    confirmHighProductionLoad: false,
    includeMeasurements: true,
    includeRequestSamples: false,
    help: false,
    output: undefined,
    configPath: '',
    thresholds: {},
    // Flat mirrors of nested thresholds for back-compat with PR #177 test
    // harnesses that read options.max5xx directly. Both shapes are kept in
    // sync by the threshold-parsing branches below.
    max5xx: null,
    maxNetworkFailures: null,
    maxBootstrapP95Ms: null,
    maxCommandP95Ms: null,
    maxResponseBytes: null,
    requireZeroSignals: false,
  };

  let modeFlag = null;
  const assignedFlags = new Set();
  const assignOnce = (flag) => {
    if (assignedFlags.has(flag)) {
      throw new Error(`${flag} specified more than once; refusing to let later value silently override the earlier one.`);
    }
    assignedFlags.add(flag);
  };
  const setMode = (flag, nextMode) => {
    if (modeFlag && modeFlag !== flag) {
      throw new Error(`Conflicting mode flags: ${modeFlag} and ${flag}. Specify exactly one of --dry-run, --local-fixture, --production.`);
    }
    modeFlag = flag;
    options.mode = nextMode;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--dry-run') {
      setMode(arg, 'dry-run');
    } else if (arg === '--local-fixture') {
      setMode(arg, 'local-fixture');
    } else if (arg === '--production') {
      setMode(arg, 'production');
    } else if (arg === '--origin' || arg === '--url') {
      assignOnce('--origin/--url');
      options.origin = normaliseOrigin(readOptionValue(argv, index, arg));
      index += 1;
    } else if (arg === '--learners') {
      assignOnce(arg);
      options.learners = positiveInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--bootstrap-burst') {
      assignOnce(arg);
      options.bootstrapBurst = positiveInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--rounds') {
      assignOnce(arg);
      options.rounds = positiveInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--pacing-ms') {
      assignOnce(arg);
      options.pacingMs = nonNegativeInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--timeout-ms') {
      assignOnce(arg);
      options.timeoutMs = positiveInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--cookie') {
      assignOnce(arg);
      options.cookie = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--bearer') {
      assignOnce(arg);
      options.bearer = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--header') {
      // Headers are cumulative by design (repeatable per docs); no assignOnce.
      options.headers.push(readOptionValue(argv, index, arg));
      index += 1;
    } else if (arg === '--demo-sessions') {
      options.demoSessions = true;
    } else if (arg === '--session-manifest') {
      assignOnce(arg);
      options.sessionManifest = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--confirm-production-load') {
      options.confirmProductionLoad = true;
    } else if (arg === '--confirm-high-production-load') {
      options.confirmHighProductionLoad = true;
    } else if (arg === '--summary-only') {
      options.includeMeasurements = false;
    } else if (arg === '--include-request-samples') {
      options.includeRequestSamples = true;
    } else if (arg === '--output') {
      assignOnce(arg);
      options.output = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--config') {
      assignOnce(arg);
      options.configPath = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--max-5xx') {
      assignOnce(arg);
      options.thresholds.max5xx = nonNegativeInteger(readOptionValue(argv, index, arg), arg);
      options.max5xx = options.thresholds.max5xx;
      index += 1;
    } else if (arg === '--max-network-failures') {
      assignOnce(arg);
      options.thresholds.maxNetworkFailures = nonNegativeInteger(readOptionValue(argv, index, arg), arg);
      options.maxNetworkFailures = options.thresholds.maxNetworkFailures;
      index += 1;
    } else if (arg === '--max-bootstrap-p95-ms') {
      assignOnce(arg);
      options.thresholds.maxBootstrapP95Ms = positiveInteger(readOptionValue(argv, index, arg), arg);
      options.maxBootstrapP95Ms = options.thresholds.maxBootstrapP95Ms;
      index += 1;
    } else if (arg === '--max-command-p95-ms') {
      assignOnce(arg);
      options.thresholds.maxCommandP95Ms = positiveInteger(readOptionValue(argv, index, arg), arg);
      options.maxCommandP95Ms = options.thresholds.maxCommandP95Ms;
      index += 1;
    } else if (arg === '--max-response-bytes') {
      assignOnce(arg);
      options.thresholds.maxResponseBytes = positiveInteger(readOptionValue(argv, index, arg), arg);
      options.maxResponseBytes = options.thresholds.maxResponseBytes;
      index += 1;
    } else if (arg === '--require-zero-signals') {
      options.thresholds.requireZeroSignals = true;
      options.requireZeroSignals = true;
    } else if (arg === '--require-bootstrap-capacity') {
      options.thresholds.requireBootstrapCapacity = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.demoSessions && options.sessionManifest) {
    throw new Error('--demo-sessions and --session-manifest are mutually exclusive; use one or the other.');
  }

  return options;
}

const HIGH_PRODUCTION_LOAD_THRESHOLD = 20;

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
    expectedRequests: learners + bootstrapBurst + (learners * rounds * 3) + (options.demoSessions && !options.sessionManifest ? learners : 0),
    safety: {
      productionRequiresConfirmation: true,
      productionRequiresAuth: true,
      localFixtureRequiresDemoSessions: true,
    },
  };
}

export function validateClassroomLoadOptions(options = {}) {
  if (options.help) return;
  if (options.mode === 'dry-run') {
    // Dry-run has no measurements, so threshold gates cannot meaningfully evaluate.
    // If thresholds are set, fail closed so CI cannot accidentally ship a permanent
    // silent-green gate via --dry-run + --max-* flags. Adversarial review finding adv-001.
    // This check runs before the pairing rule so the clearer adv-001 error is
    // surfaced first; a dry-run consumer cannot meaningfully pair thresholds.
    if (hasThresholdFlags(options)) {
      throw new Error('Threshold flags (--max-*, --require-zero-signals) cannot be combined with --dry-run; dry-run has no measurements and would always pass. Use --local-fixture or --production.');
    }
    return;
  }
  const thresholds = options.thresholds || {};
  if (thresholds.max5xx !== undefined && thresholds.maxNetworkFailures === undefined) {
    throw new Error('--max-5xx requires --max-network-failures to avoid a silent success on total network failure.');
  }
  if (!options.origin) {
    throw new Error(`${options.mode} load requires --origin.`);
  }
  if (options.mode === 'local-fixture') {
    if (!isLocalOrigin(options.origin)) {
      throw new Error('local fixture load must use a localhost, loopback, or .test origin.');
    }
    if (!options.demoSessions && !options.sessionManifest) {
      throw new Error('local fixture load requires --demo-sessions or --session-manifest so each virtual learner gets an isolated session.');
    }
    return;
  }
  if (options.mode === 'production') {
    const hasAuth = hasExplicitAuthConfig(options);
    if (!options.confirmProductionLoad || !hasAuth) {
      throw new Error('production load requires --confirm-production-load and explicit auth configuration (--cookie, --bearer, --header, or --demo-sessions).');
    }
    // H4 enforcement per docs/hardening/p1-baseline.md and docs/operations/capacity.md.
    // Classroom-scale production loads (>=20 learners or >=20 bootstrap burst) must carry
    // the second confirmation, otherwise the documented safety rail is a no-op.
    // Adversarial review finding adv-003.
    const highLoad = Number(options.learners) >= HIGH_PRODUCTION_LOAD_THRESHOLD
      || Number(options.bootstrapBurst) >= HIGH_PRODUCTION_LOAD_THRESHOLD;
    if (highLoad && !options.confirmHighProductionLoad) {
      throw new Error(
        `production load at classroom scale (learners >= ${HIGH_PRODUCTION_LOAD_THRESHOLD} or bootstrap-burst >= ${HIGH_PRODUCTION_LOAD_THRESHOLD}) requires --confirm-high-production-load in addition to --confirm-production-load.`,
      );
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

function phaseForMeasurement(entry = {}) {
  if (entry.scenario === 'demo-session-setup') return 'setup';
  if (entry.endpoint && entry.endpoint.includes('/api/bootstrap')) return 'bootstrap';
  if (entry.endpoint && entry.endpoint.includes('/command')) return 'command';
  return 'other';
}

function createMetricsBucket(phase = null) {
  return {
    phase,
    count: 0,
    wallMs: [],
    responseBytes: [],
    queryCount: [],
    d1RowsRead: [],
    d1RowsWritten: [],
    serverWallMs: [],
    serverResponseBytes: [],
    samples: [],
    bootstrapModes: {},
    bootstrapCapacityModes: {},
    bootstrapCapacityVersions: {},
    subjectStatesBounded: {},
    capacitySignals: {},
  };
}

function pushFinite(target, value) {
  const n = finiteOrNull(value);
  if (n !== null) target.push(n);
}

function incrementCounter(target, key) {
  if (key == null || key === '') return;
  const normalised = String(key);
  target[normalised] = (target[normalised] || 0) + 1;
}

function addMeasurementMetrics(bucket, entry) {
  bucket.count += 1;
  pushFinite(bucket.wallMs, entry.wallMs);
  pushFinite(bucket.responseBytes, entry.responseBytes);

  const capacity = entry.capacity && typeof entry.capacity === 'object' ? entry.capacity : null;
  if (capacity) {
    pushFinite(bucket.queryCount, capacity.queryCount);
    pushFinite(bucket.d1RowsRead, capacity.d1RowsRead);
    pushFinite(bucket.d1RowsWritten, capacity.d1RowsWritten);
    pushFinite(bucket.serverWallMs, capacity.serverWallMs);
    pushFinite(bucket.serverResponseBytes, capacity.responseBytes);
    incrementCounter(bucket.bootstrapModes, capacity.bootstrapMode);
    incrementCounter(bucket.bootstrapCapacityModes, capacity.bootstrapCapacity?.mode);
    incrementCounter(bucket.bootstrapCapacityVersions, capacity.bootstrapCapacity?.version);
    if (typeof capacity.bootstrapCapacity?.subjectStatesBounded === 'boolean') {
      incrementCounter(bucket.subjectStatesBounded, capacity.bootstrapCapacity.subjectStatesBounded);
    }
    for (const signal of capacity.signals || []) incrementCounter(bucket.capacitySignals, signal);
  }

  bucket.samples.push(buildTailSample(entry));
}

function buildTailSample(entry = {}) {
  const capacity = entry.capacity && typeof entry.capacity === 'object' ? entry.capacity : {};
  const sample = {
    scenario: entry.scenario || null,
    virtualLearner: entry.virtualLearner || null,
    status: entry.status ?? 0,
    ok: Boolean(entry.ok),
    wallMs: finiteOrNull(entry.wallMs) ?? 0,
    responseBytes: finiteOrNull(entry.responseBytes) ?? 0,
    clientRequestId: entry.clientRequestId || null,
    serverRequestId: entry.serverRequestId || capacity.requestId || null,
    queryCount: finiteOrNull(capacity.queryCount),
    d1RowsRead: finiteOrNull(capacity.d1RowsRead),
    d1RowsWritten: finiteOrNull(capacity.d1RowsWritten),
    serverWallMs: finiteOrNull(capacity.serverWallMs),
    serverResponseBytes: finiteOrNull(capacity.responseBytes),
    bootstrapMode: capacity.bootstrapMode || null,
    bootstrapCapacityMode: capacity.bootstrapCapacity?.mode || null,
    bootstrapCapacityVersion: capacity.bootstrapCapacity?.version ?? null,
    signals: Array.isArray(capacity.signals) ? [...capacity.signals] : [],
  };
  return Object.fromEntries(Object.entries(sample).filter(([, value]) => {
    if (value == null) return false;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }));
}

function topTailSamples(samples = [], limit = ENDPOINT_TAIL_SAMPLE_LIMIT) {
  return [...samples]
    .sort((left, right) => (Number(right.wallMs) || 0) - (Number(left.wallMs) || 0))
    .slice(0, limit);
}

function maxMetric(values) {
  return values.length ? Math.max(...values) : undefined;
}

function addDistribution(output, keyPrefix, values) {
  if (!values.length) return;
  output[`${keyPrefix}P50`] = percentile(values, 50);
  output[`${keyPrefix}P95`] = percentile(values, 95);
  output[`${keyPrefix}Max`] = Math.max(...values);
}

function metricsToSummary(bucket, { includeTailSamples = false } = {}) {
  const entry = {
    phase: bucket.phase || 'mixed',
    count: bucket.count,
    p50WallMs: percentile(bucket.wallMs, 50),
    p95WallMs: percentile(bucket.wallMs, 95),
    maxWallMs: maxMetric(bucket.wallMs) ?? 0,
    p50ResponseBytes: percentile(bucket.responseBytes, 50),
    p95ResponseBytes: percentile(bucket.responseBytes, 95),
    maxResponseBytes: maxMetric(bucket.responseBytes) ?? 0,
  };

  if (bucket.queryCount.length > 0) {
    entry.queryCount = Math.max(...bucket.queryCount);
    addDistribution(entry, 'queryCount', bucket.queryCount);
  }
  if (bucket.d1RowsRead.length > 0) {
    entry.d1RowsRead = Math.max(...bucket.d1RowsRead);
    addDistribution(entry, 'd1RowsRead', bucket.d1RowsRead);
  }
  if (bucket.d1RowsWritten.length > 0) {
    entry.d1RowsWritten = Math.max(...bucket.d1RowsWritten);
    addDistribution(entry, 'd1RowsWritten', bucket.d1RowsWritten);
  }
  addDistribution(entry, 'serverWallMs', bucket.serverWallMs);
  addDistribution(entry, 'serverResponseBytes', bucket.serverResponseBytes);

  if (Object.keys(bucket.bootstrapModes).length) entry.bootstrapModes = { ...bucket.bootstrapModes };
  if (Object.keys(bucket.bootstrapCapacityModes).length) entry.bootstrapCapacityModes = { ...bucket.bootstrapCapacityModes };
  if (Object.keys(bucket.bootstrapCapacityVersions).length) entry.bootstrapCapacityVersions = { ...bucket.bootstrapCapacityVersions };
  if (Object.keys(bucket.subjectStatesBounded).length) entry.subjectStatesBounded = { ...bucket.subjectStatesBounded };
  if (Object.keys(bucket.capacitySignals).length) entry.capacitySignals = { ...bucket.capacitySignals };
  if (includeTailSamples) entry.topTailSamples = topTailSamples(bucket.samples);

  return entry;
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

const OPERATIONAL_SIGNAL_KEYS = Object.freeze([
  'exceededCpu',
  'd1Overloaded',
  'd1DailyLimit',
  'rateLimited',
  'networkFailure',
  'server5xx',
]);

const BOOTSTRAP_P95_ENDPOINTS = Object.freeze([
  'GET /api/bootstrap',
]);

const COMMAND_P95_ENDPOINTS = Object.freeze([
  'POST /api/subjects/grammar/command',
]);

function collectObservedSignals(signals = {}) {
  const observed = [];
  for (const key of OPERATIONAL_SIGNAL_KEYS) {
    if (Number(signals[key]) > 0) observed.push(key);
  }
  return observed;
}

function operationalCapacitySignals(entry = {}) {
  const capacity = entry.capacity && typeof entry.capacity === 'object' ? entry.capacity : null;
  if (!capacity || !Array.isArray(capacity.signals)) return [];
  return capacity.signals.filter((signal) => OPERATIONAL_SIGNAL_KEYS.includes(signal));
}

function highestP95(summary, endpointList) {
  let peak = 0;
  for (const key of endpointList) {
    const metrics = summary.endpoints?.[key];
    if (metrics && Number(metrics.p95WallMs) > peak) peak = Number(metrics.p95WallMs);
  }
  return peak;
}

function gatedEndpointsHaveMeasurements(summary, endpointList) {
  for (const key of endpointList) {
    const metrics = summary.endpoints?.[key];
    if (metrics && Number(metrics.count) > 0) return true;
  }
  return false;
}

function maxResponseBytesAcross(summary) {
  let peak = 0;
  for (const metrics of Object.values(summary.endpoints || {})) {
    if (metrics && Number(metrics.maxResponseBytes) > peak) peak = Number(metrics.maxResponseBytes);
  }
  return peak;
}

/**
 * Normalise threshold config so either shape works:
 *   { max5xx: 0, maxNetworkFailures: 0, ... }           (PR #177 flat)
 *   { thresholds: { max5xx: 0, maxNetworkFailures: 0 }} (U1 nested, supports --config loading)
 * Flat keys on the top-level override nested values so ad-hoc invocations
 * (test harnesses, single-file consumers) still work against the canonical
 * implementation that the CLI drives via nested `options.thresholds`.
 */
function normaliseThresholdView(options = {}) {
  const nested = options.thresholds || {};
  const numericFlatKeys = [
    'max5xx',
    'maxNetworkFailures',
    'maxBootstrapP95Ms',
    'maxCommandP95Ms',
    'maxResponseBytes',
  ];
  const view = { ...nested };
  for (const key of numericFlatKeys) {
    if (options[key] != null) view[key] = options[key];
  }
  // Boolean gates default to false on the flat compatibility shape. Treat
  // false as "not explicitly supplied" so a config file's true value is not
  // silently disabled by parser defaults.
  if (options.requireZeroSignals === true) view.requireZeroSignals = true;
  if (options.requireBootstrapCapacity === true) view.requireBootstrapCapacity = true;
  return view;
}

export function evaluateCapacityThresholds(summary = {}, options = {}) {
  const thresholds = normaliseThresholdView(options);
  const violations = [];

  if (thresholds.max5xx != null) {
    const observed = Number(summary.signals?.server5xx || 0);
    if (observed > thresholds.max5xx) {
      violations.push({
        threshold: 'max-5xx',
        limit: thresholds.max5xx,
        observed,
        message: `Observed ${observed} 5xx response(s); limit is ${thresholds.max5xx}.`,
      });
    }
  }

  if (thresholds.maxNetworkFailures != null) {
    const observed = Number(summary.signals?.networkFailure || 0);
    if (observed > thresholds.maxNetworkFailures) {
      violations.push({
        threshold: 'max-network-failures',
        limit: thresholds.maxNetworkFailures,
        observed,
        message: `Observed ${observed} network failure(s); limit is ${thresholds.maxNetworkFailures}.`,
      });
    }
  }

  if (thresholds.maxBootstrapP95Ms != null) {
    if (!gatedEndpointsHaveMeasurements(summary, BOOTSTRAP_P95_ENDPOINTS)) {
      // Adversarial review adv-006: fail closed when the gated endpoint set
      // produced no measurements. Otherwise an unrelated bug (missed scenario,
      // endpoint path drift) silently deactivates the gate.
      violations.push({
        threshold: 'max-bootstrap-p95-ms',
        limit: thresholds.maxBootstrapP95Ms,
        observed: null,
        gatedEndpoints: [...BOOTSTRAP_P95_ENDPOINTS],
        message: `No measurements captured for bootstrap gated endpoints (${BOOTSTRAP_P95_ENDPOINTS.join(', ')}); threshold cannot be evaluated safely.`,
      });
    } else {
      const observed = highestP95(summary, BOOTSTRAP_P95_ENDPOINTS);
      if (observed > thresholds.maxBootstrapP95Ms) {
        violations.push({
          threshold: 'max-bootstrap-p95-ms',
          limit: thresholds.maxBootstrapP95Ms,
          observed,
          message: `Bootstrap P95 wall time ${observed} ms exceeds ${thresholds.maxBootstrapP95Ms} ms.`,
        });
      }
    }
  }

  if (thresholds.maxCommandP95Ms != null) {
    if (!gatedEndpointsHaveMeasurements(summary, COMMAND_P95_ENDPOINTS)) {
      violations.push({
        threshold: 'max-command-p95-ms',
        limit: thresholds.maxCommandP95Ms,
        observed: null,
        gatedEndpoints: [...COMMAND_P95_ENDPOINTS],
        message: `No measurements captured for command gated endpoints (${COMMAND_P95_ENDPOINTS.join(', ')}); threshold cannot be evaluated safely.`,
      });
    } else {
      const observed = highestP95(summary, COMMAND_P95_ENDPOINTS);
      if (observed > thresholds.maxCommandP95Ms) {
        violations.push({
          threshold: 'max-command-p95-ms',
          limit: thresholds.maxCommandP95Ms,
          observed,
          message: `Subject-command P95 wall time ${observed} ms exceeds ${thresholds.maxCommandP95Ms} ms.`,
        });
      }
    }
  }

  if (thresholds.maxResponseBytes != null) {
    const observed = maxResponseBytesAcross(summary);
    if (observed > thresholds.maxResponseBytes) {
      violations.push({
        threshold: 'max-response-bytes',
        limit: thresholds.maxResponseBytes,
        observed,
        message: `Response bytes ${observed} exceeded cap ${thresholds.maxResponseBytes}.`,
      });
    }
  }

  if (thresholds.requireZeroSignals) {
    const signals = collectObservedSignals(summary.signals || {});
    if (signals.length) {
      violations.push({
        threshold: 'require-zero-signals',
        limit: 0,
        observed: signals.length,
        signals,
        message: `Observed operational signal(s): ${signals.join(', ')}.`,
      });
    }
  }

  return violations;
}

export function hasThresholdFlags(options = {}) {
  const thresholds = normaliseThresholdView(options);
  return (
    thresholds.max5xx != null
    || thresholds.maxNetworkFailures != null
    || thresholds.maxBootstrapP95Ms != null
    || thresholds.maxCommandP95Ms != null
    || thresholds.maxResponseBytes != null
    || thresholds.requireZeroSignals === true
    || thresholds.requireBootstrapCapacity === true
  );
}

/**
 * Classify a failure into one of the canonical failure classes.
 * The taxonomy covers the full lifecycle of a load-test request:
 *   setup        — demo-session or manifest-based session creation
 *   auth         — authentication/authorisation rejection
 *   bootstrap    — /api/bootstrap failures
 *   command      — subject command failures
 *   threshold    — capacity threshold violation (evaluated post-hoc)
 *   transport    — network-level failure (no HTTP response)
 *   evidence-write — evidence persistence failure
 */
export const FAILURE_CLASSES = Object.freeze([
  'setup', 'auth', 'bootstrap', 'command', 'threshold', 'transport', 'evidence-write',
]);

function classifyFailure(entry) {
  if (!entry.status) return 'transport';
  if (entry.scenario === 'demo-session-setup') return 'setup';
  if (entry.status === 401 || entry.status === 403) return 'auth';
  if (entry.endpoint && entry.endpoint.includes('/api/bootstrap')) return 'bootstrap';
  if (entry.endpoint && entry.endpoint.includes('/command')) return 'command';
  return 'command';
}

export function summariseCapacityResults(measurements = [], plan = {}) {
  const statusCounts = {};
  const endpointStatus = {};
  const signals = {};
  const endpointMetrics = {};
  const phaseMetrics = {};
  const scenarioMetrics = {};
  const failures = [];

  for (const entry of measurements) {
    const status = String(entry.status || 'network');
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    const key = groupKey(entry);
    endpointStatus[key] = (endpointStatus[key] || 0) + 1;

    const endpointKey = `${entry.method} ${entry.endpoint}`;
    const phase = phaseForMeasurement(entry);
    const endpointBucket = endpointMetrics[endpointKey] || createMetricsBucket(phase);
    if (endpointBucket.phase !== phase) endpointBucket.phase = 'mixed';
    addMeasurementMetrics(endpointBucket, entry);
    endpointMetrics[endpointKey] = endpointBucket;

    const phaseBucket = phaseMetrics[phase] || createMetricsBucket(phase);
    addMeasurementMetrics(phaseBucket, entry);
    phaseMetrics[phase] = phaseBucket;

    const scenarioKey = entry.scenario || 'unknown';
    const scenarioBucket = scenarioMetrics[scenarioKey] || createMetricsBucket(phase);
    if (scenarioBucket.phase !== phase) scenarioBucket.phase = 'mixed';
    addMeasurementMetrics(scenarioBucket, entry);
    scenarioMetrics[scenarioKey] = scenarioBucket;

    const detectedSignals = new Set(operationalCapacitySignals(entry));
    const inferredSignal = signalFor(entry);
    if (inferredSignal) detectedSignals.add(inferredSignal);
    for (const signal of detectedSignals) {
      signals[signal] = (signals[signal] || 0) + 1;
    }
    if (!entry.ok || detectedSignals.size > 0) {
      const detectedSignalList = [...detectedSignals];
      failures.push({
        scenario: entry.scenario,
        endpoint: endpointKey,
        status: entry.status,
        code: entry.code,
        message: entry.message,
        signal: detectedSignalList[0] || null,
        signals: detectedSignalList,
        failureClass: classifyFailure(entry),
      });
    }
  }

  const endpoints = Object.fromEntries(Object.entries(endpointMetrics).map(([key, metrics]) => [
    key,
    metricsToSummary(metrics, { includeTailSamples: true }),
  ]));
  const phases = Object.fromEntries(Object.entries(phaseMetrics).map(([key, metrics]) => [
    key,
    metricsToSummary(metrics),
  ]));
  const scenarios = Object.fromEntries(Object.entries(scenarioMetrics).map(([key, metrics]) => [
    key,
    metricsToSummary(metrics),
  ]));

  return {
    ok: failures.length === 0,
    totalRequests: measurements.length,
    expectedRequests: plan.expectedRequests || 0,
    statusCounts,
    endpointStatus,
    endpoints,
    phases,
    scenarios,
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
    throw setupFailureError(
      `Demo session setup failed for ${virtualLearner.label}; refusing to reuse global auth for an isolated load context.`,
      measurement,
    );
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

  if (options.sessionManifest) {
    // Load pre-created sessions from manifest — skips demo-session creation entirely
    const manifest = loadSessionManifest(options.sessionManifest);
    contexts = plan.virtualLearners.map((virtualLearner, i) => {
      const entry = manifest.entries[i % manifest.count];
      return {
        ...virtualLearner,
        cookie: entry.sessionCookie,
        accountId: null,
        learnerId: entry.learnerId,
        revision: 0,
      };
    });
  } else if (options.demoSessions) {
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

function buildThresholdsBlock(options, summary) {
  const thresholds = normaliseThresholdView(options);
  const configured = hasThresholdFlags(options);
  const violations = configured ? evaluateCapacityThresholds(summary, options) : [];
  return {
    configured,
    limits: {
      max5xx: thresholds.max5xx ?? null,
      maxNetworkFailures: thresholds.maxNetworkFailures ?? null,
      maxBootstrapP95Ms: thresholds.maxBootstrapP95Ms ?? null,
      maxCommandP95Ms: thresholds.maxCommandP95Ms ?? null,
      maxResponseBytes: thresholds.maxResponseBytes ?? null,
      requireZeroSignals: thresholds.requireZeroSignals === true,
      requireBootstrapCapacity: thresholds.requireBootstrapCapacity === true,
    },
    violations,
  };
}

function setupFailureError(message, measurement) {
  const error = new Error(message);
  error.capacityFailurePhase = 'setup';
  error.capacityMeasurements = measurement ? [measurement] : [];
  return error;
}

function sessionSourceModeForOptions(options) {
  if (options.sessionManifest) return 'manifest';
  if (options.demoSessions) return 'demo-sessions';
  if (options.mode === 'dry-run') return 'none';
  return 'shared-auth';
}

function buildFinalClassroomReport({
  report,
  summary,
  options,
  config,
  timings,
  extraFailures = [],
}) {
  const thresholdsBlock = buildThresholdsBlock(options, summary);
  const evidence = buildEvidencePayload({
    report,
    thresholds: options.thresholds,
    options,
    timings,
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
  const diagnostics = buildCapacityDiagnostics({
    options,
    tier: evidenceTier,
    summary,
    thresholdViolations: thresholdsBlock.violations,
    thresholdConfigHash: evidence.reportMeta?.provenance?.thresholdConfigHash || null,
  });
  // Merge per-key evidence thresholds (U1) with PR #177 threshold block shape
  // ({configured, violations, limits}). Both test harnesses probe distinct
  // keys: U1 reads `report.thresholds.max5xx.passed`, PR #177 reads
  // `report.thresholds.configured` / `.violations`. Using a flat spread keeps
  // both lookup patterns live without a breaking rename.
  const mergedThresholdsReport = {
    ...(evidence.thresholds || {}),
    configured: thresholdsBlock.configured,
    violations: thresholdsBlock.violations,
    limits: thresholdsBlock.limits,
  };
  const failures = [...new Set([
    ...(evidence.failures || []),
    ...extraFailures,
  ])];

  return {
    ...report,
    startedAt: timings.startedAt,
    finishedAt: timings.finishedAt,
    sessionSourceMode: sessionSourceModeForOptions(options),
    thresholds: mergedThresholdsReport,
    failures,
    safety: evidence.safety,
    diagnostics,
    reportMeta: evidence.reportMeta,
    ...(evidenceTier ? { tier: evidenceTier } : {}),
    ok: evidence.ok && thresholdsBlock.violations.length === 0 && extraFailures.length === 0,
  };
}

function persistClassroomReport(options, finalReport) {
  if (!options.output) return finalReport;
  try {
    persistEvidenceFile(options.output, finalReport, {
      includeRequestSamples: options.includeRequestSamples,
    });
    finalReport.evidencePath = options.output;
    return finalReport;
  } catch (error) {
    throw new Error(`Failed to persist evidence to "${options.output}": ${error.message}`);
  }
}

function persistSetupFailureEvidence({
  error,
  options,
  config,
  plan,
  timings,
}) {
  if (!options.output) return null;
  const measurements = Array.isArray(error.capacityMeasurements)
    ? error.capacityMeasurements
    : [];
  const summary = summariseCapacityResults(measurements, { ...plan });
  const finalReport = buildFinalClassroomReport({
    report: {
      ok: false,
      dryRun: false,
      plan,
      summary,
      setupFailure: {
        phase: error.capacityFailurePhase || 'setup',
        message: error.message,
        measurements: measurements.length,
      },
      ...(options.includeMeasurements ? { measurements } : {}),
    },
    summary,
    options,
    config,
    timings,
    extraFailures: ['setupFailure'],
  });
  const persisted = persistClassroomReport(options, finalReport);
  error.evidencePath = persisted.evidencePath;
  error.report = persisted;
  return persisted;
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
  const mergedThresholds = mergeThresholds(config.thresholds, options.thresholds);
  const optionsWithMergedThresholds = { ...options, thresholds: mergedThresholds };
  validateClassroomLoadOptions(optionsWithMergedThresholds);
  const plan = buildClassroomLoadPlan(options);

  const startedAt = new Date().toISOString();
  const timings = { startedAt, finishedAt: null };
  let report;
  let summary;
  if (options.mode === 'dry-run') {
    summary = summariseCapacityResults([], plan);
    report = {
      ok: true,
      dryRun: true,
      plan,
      summary,
    };
  } else {
    const origin = options.origin;
    const measurements = [];
    let prepared;
    try {
      prepared = await prepareContexts(origin, options, plan);
    } catch (error) {
      timings.finishedAt = new Date().toISOString();
      persistSetupFailureEvidence({
        error,
        options: optionsWithMergedThresholds,
        config,
        plan,
        timings,
      });
      throw error;
    }
    measurements.push(...prepared.measurements);
    measurements.push(...await runColdBootstrapBurst(origin, options, prepared.contexts, plan));
    measurements.push(...await runHumanPacedRounds(origin, options, prepared.contexts, plan));
    summary = summariseCapacityResults(measurements, { ...plan });
    report = {
      ok: summary.ok,
      dryRun: false,
      plan,
      summary,
      ...(options.includeMeasurements ? { measurements } : {}),
    };
  }

  const finishedAt = new Date().toISOString();
  timings.finishedAt = finishedAt;
  const finalReport = buildFinalClassroomReport({
    report,
    summary,
    options: optionsWithMergedThresholds,
    config,
    timings,
  });

  // Only persist when --output was explicitly passed. `parseClassroomLoadArgs`
  // sets `options.output` to `undefined` by default and `readOptionValue`
  // rejects an empty value, so truthiness correctly distinguishes "caller asked
  // for evidence" from "no --output flag present".
  return persistClassroomReport(optionsWithMergedThresholds, finalReport);
}

export function usage() {
  return [
    'Usage: node ./scripts/classroom-load-test.mjs [options]',
    '',
    'Modes:',
    '  --dry-run                         Print the planned capacity run without network requests (default)',
    '  --local-fixture                   Run against a local/loopback origin using demo sessions',
    '  --production                      Run against a production or preview origin; requires explicit confirmation and auth',
    '',
    'Options:',
    '  --origin <url>                    Target origin for local-fixture or production runs',
    '  --learners <number>               Virtual learner count, default 3',
    '  --bootstrap-burst <number>        Concurrent cold bootstrap requests, default 6',
    '  --rounds <number>                 Human-paced Grammar rounds per learner, default 1',
    '  --pacing-ms <number>              Delay between learner command groups, default 0',
    '  --timeout-ms <number>             Per-request timeout, default 15000',
    '  --cookie <cookie>                 Cookie header for an existing authenticated run',
    '  --bearer <token>                  Authorization bearer token',
    '  --header "name: value"            Extra request header, repeatable',
    '  --demo-sessions                   Create one isolated demo session per virtual learner',
    '  --session-manifest <path>         Use pre-created sessions from a manifest JSON file (mutually exclusive with --demo-sessions)',
    '  --confirm-production-load         Required before --production sends requests',
    '  --confirm-high-production-load    Additional acknowledgement for larger production load shapes',
    '  --summary-only                    Omit per-request measurements from JSON output',
    '  --include-request-samples         Include per-request measurements in --output evidence (default off)',
    '',
    'Evidence and thresholds:',
    '  --output <path>                   Persist evidence JSON to <path>',
    '  --config <path>                   Load pinned thresholds from JSON file (CLI flags override)',
    '',
    'Threshold gates (release-gate mode; non-zero exit on any violation):',
    '  --max-5xx <count>                 Maximum tolerated HTTP 5xx responses (requires --max-network-failures)',
    '  --max-network-failures <count>    Maximum tolerated network failures',
    '  --max-bootstrap-p95-ms <ms>       Maximum tolerated /api/bootstrap P95 wall time',
    '  --max-command-p95-ms <ms>         Maximum tolerated subject-command P95 wall time',
    '  --max-response-bytes <bytes>      Maximum tolerated response bytes across endpoints',
    '  --require-zero-signals            Fail on any exceededCpu / d1Overloaded / d1DailyLimit /',
    '                                    rateLimited / networkFailure / server5xx signal',
    '  --require-bootstrap-capacity      Assert meta.capacity.bootstrapCapacity is present (U3)',
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
