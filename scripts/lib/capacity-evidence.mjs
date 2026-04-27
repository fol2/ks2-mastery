import { execSync } from 'node:child_process';
import { mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const EVIDENCE_SCHEMA_VERSION = 2;

// Request-sample cap per endpoint when --include-request-samples is enabled.
// Plan says 100 + 100 (first N and last N); this preserves post-mortem utility
// without letting classroom-tier runs produce multi-MB evidence files.
export const REQUEST_SAMPLES_HEAD_LIMIT = 100;
export const REQUEST_SAMPLES_TAIL_LIMIT = 100;

// Known keys for threshold config files. `validateThresholdConfigKeys` rejects
// unknown keys so typos like `maxFivexx` cannot silently disable a gate.
const KNOWN_THRESHOLD_KEYS = new Set([
  'max5xx',
  'maxNetworkFailures',
  'maxBootstrapP95Ms',
  'maxCommandP95Ms',
  'maxResponseBytes',
  'requireZeroSignals',
  'requireBootstrapCapacity',
]);

export function validateThresholdConfigKeys(thresholds = {}) {
  const unknown = Object.keys(thresholds).filter((key) => !KNOWN_THRESHOLD_KEYS.has(key));
  return unknown;
}

/**
 * Builds the evidence-JSON `reportMeta` block. Values that cannot be resolved
 * degrade to the string `unknown` rather than throwing; a capacity run must never
 * fail just because git metadata or env hints are missing.
 */
export function buildReportMeta(options = {}, timings = {}) {
  return {
    commit: resolveCommitSha(),
    environment: resolveEnvironmentName(options),
    origin: options.origin || 'unknown',
    authMode: resolveAuthMode(options),
    learners: options.learners ?? null,
    bootstrapBurst: options.bootstrapBurst ?? null,
    rounds: options.rounds ?? null,
    startedAt: timings.startedAt || null,
    finishedAt: timings.finishedAt || null,
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
  };
}

function resolveCommitSha() {
  const envSha = process.env.GITHUB_SHA || process.env.KS2_CAPACITY_COMMIT_SHA;
  if (envSha && /^[0-9a-f]{7,40}$/i.test(envSha)) return envSha;
  try {
    // Hard timeout so a wedged git call (network fs, frozen filesystem) cannot
    // hang a capacity run; degrade to `unknown` instead.
    const sha = execSync('git rev-parse HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).toString().trim();
    return /^[0-9a-f]{7,40}$/i.test(sha) ? sha : 'unknown';
  } catch {
    return 'unknown';
  }
}

function resolveEnvironmentName(options) {
  if (options.environment) return String(options.environment);
  const mode = options.mode || 'dry-run';
  if (mode === 'dry-run') return 'dry-run';
  if (mode === 'local-fixture') return 'local';
  if (mode === 'production') {
    if (!options.origin) return 'production';
    if (/preview|staging|dev/i.test(options.origin)) return 'preview';
    return 'production';
  }
  return mode;
}

function resolveAuthMode(options) {
  if (options.demoSessions) return 'demo-sessions';
  if (options.cookie) return 'cookie';
  if (options.bearer) return 'bearer';
  if (options.headers && options.headers.some((header) => /^authorization\s*:/i.test(header))) {
    return 'header-authorization';
  }
  if (options.mode === 'dry-run') return 'none';
  return 'unknown';
}

/**
 * Evaluate threshold config against the summary and return the per-threshold
 * pass/fail shape the plan requires: `{configured, observed, passed}` per
 * threshold and a separate `failures: [name]` list naming only failing
 * thresholds. A threshold flag of `null`/`undefined` means "not gated" and is
 * omitted from the output; a threshold flag of `0` is still evaluated (strict).
 *
 * When `dryRun` is true, thresholds that have no observed value (e.g. latency
 * gates on an empty measurement set) are recorded with `observed: null,
 * passed: true` to reflect "not applicable in dry-run". This lets operators
 * preview pinned threshold configs without a spurious red verdict.
 */
export function evaluateThresholds(summary = {}, thresholds = {}, { dryRun = false } = {}) {
  const evaluated = {};
  const failures = [];

  const signals = summary.signals || {};
  const endpoints = summary.endpoints || {};
  const bootstrapKey = Object.keys(endpoints).find((key) => key.endsWith('/api/bootstrap'));
  const commandKey = Object.keys(endpoints).find((key) => /subjects\/.*\/command/.test(key));
  const bootstrapMetrics = bootstrapKey ? endpoints[bootstrapKey] : null;
  const commandMetrics = commandKey ? endpoints[commandKey] : null;

  if (thresholds.max5xx !== undefined && thresholds.max5xx !== null) {
    evaluated.max5xx = gateCount(thresholds.max5xx, signals.server5xx || 0, dryRun);
  }
  if (thresholds.maxNetworkFailures !== undefined && thresholds.maxNetworkFailures !== null) {
    evaluated.maxNetworkFailures = gateCount(
      thresholds.maxNetworkFailures,
      signals.networkFailure || 0,
      dryRun,
    );
  }
  if (thresholds.maxBootstrapP95Ms !== undefined && thresholds.maxBootstrapP95Ms !== null) {
    evaluated.maxBootstrapP95Ms = gateLatency(
      thresholds.maxBootstrapP95Ms,
      bootstrapMetrics ? bootstrapMetrics.p95WallMs : null,
      dryRun,
    );
  }
  if (thresholds.maxCommandP95Ms !== undefined && thresholds.maxCommandP95Ms !== null) {
    evaluated.maxCommandP95Ms = gateLatency(
      thresholds.maxCommandP95Ms,
      commandMetrics ? commandMetrics.p95WallMs : null,
      dryRun,
    );
  }
  if (thresholds.maxResponseBytes !== undefined && thresholds.maxResponseBytes !== null) {
    const maxObserved = Math.max(
      0,
      ...Object.values(endpoints).map((metrics) => Number(metrics.maxResponseBytes) || 0),
    );
    evaluated.maxResponseBytes = gateCount(
      thresholds.maxResponseBytes,
      Object.keys(endpoints).length ? maxObserved : null,
      dryRun,
    );
  }
  if (thresholds.requireZeroSignals) {
    const total = Object.values(signals).reduce((sum, value) => sum + Number(value || 0), 0);
    evaluated.requireZeroSignals = {
      configured: true,
      observed: total,
      passed: total === 0,
    };
  }
  if (thresholds.requireBootstrapCapacity) {
    // Assert that the bootstrap endpoint has non-null `queryCount` and
    // `d1RowsRead`, matching the `CapacityCollector.toPublicJSON()` shape.
    // This gate has teeth: empty endpoints, missing bootstrap entry, or
    // null capacity fields all fail. `queryCount: 0` is valid (a cached
    // bootstrap that issued no D1 queries is legitimate).
    const bootstrapEntry = bootstrapMetrics || {};
    const hasEndpoint = bootstrapKey != null;
    const qc = bootstrapEntry.queryCount;
    const rows = bootstrapEntry.d1RowsRead;
    const queryCountPresent = qc !== undefined && qc !== null;
    const d1RowsReadPresent = rows !== undefined && rows !== null;
    const allPresent = hasEndpoint && queryCountPresent && d1RowsReadPresent;

    evaluated.requireBootstrapCapacity = {
      configured: true,
      observed: allPresent
        ? { queryCount: qc, d1RowsRead: rows }
        : hasEndpoint
          ? { queryCount: qc ?? null, d1RowsRead: rows ?? null }
          : 'no-bootstrap-endpoint',
      passed: allPresent,
    };
  }

  for (const [name, value] of Object.entries(evaluated)) {
    if (value.passed === false) failures.push(name);
  }

  return { thresholds: evaluated, failures };
}

// Both count-based gates (5xx, network failures, bytes) and latency gates
// (bootstrap/command P95) share the same semantics: "observed must not exceed
// configured". Unified under a single helper.
function gateUpperBound(configured, observed, dryRun = false) {
  const parsed = Number(configured);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { configured, observed, passed: false, error: 'invalid threshold value' };
  }
  if (observed === null || observed === undefined) {
    return { configured: parsed, observed: null, passed: dryRun };
  }
  return { configured: parsed, observed, passed: observed <= parsed };
}

// Aliases kept for readability at call sites; both resolve to gateUpperBound.
const gateCount = gateUpperBound;
const gateLatency = gateUpperBound;

/**
 * Compose an evidence payload from a load-test report. Mutates nothing;
 * returns a fresh object safe to JSON.stringify.
 */
export function buildEvidencePayload({ report, thresholds, options, timings }) {
  const summary = report.summary || {};
  const dryRun = Boolean(report.dryRun);
  const { thresholds: evaluated, failures } = evaluateThresholds(summary, thresholds, { dryRun });
  const thresholdsFailed = failures.length > 0;
  const safety = buildSafetyBlock(options);

  return {
    ok: report.ok && !thresholdsFailed,
    dryRun: Boolean(report.dryRun),
    reportMeta: buildReportMeta(options, timings),
    safety,
    plan: report.plan || null,
    summary,
    thresholds: evaluated,
    failures,
  };
}

function buildSafetyBlock(options = {}) {
  return {
    mode: options.mode || 'dry-run',
    origin: options.origin || null,
    learners: options.learners ?? null,
    bootstrapBurst: options.bootstrapBurst ?? null,
    demoSessions: Boolean(options.demoSessions),
    authMode: resolveAuthMode(options),
    confirmedVia: describeConfirmations(options),
  };
}

function describeConfirmations(options = {}) {
  const confirmations = [];
  if (options.confirmProductionLoad) confirmations.push('production-load');
  if (options.confirmHighProductionLoad) confirmations.push('high-production-load');
  if (options.confirmSchoolLoad) confirmations.push('school-load');
  return confirmations;
}

/**
 * Persist the evidence JSON to `outputPath`, creating parent directories as
 * needed. Raw failure bodies, cookies, and payloads are non-enumerable on the
 * existing measurement objects, so `JSON.stringify` skips them automatically.
 *
 * - If `includeRequestSamples` is false (default), `measurements` is stripped
 *   entirely to keep the file bounded.
 * - If true, the array is capped at the first REQUEST_SAMPLES_HEAD_LIMIT and
 *   last REQUEST_SAMPLES_TAIL_LIMIT entries per endpoint. Larger sets would
 *   produce multi-MB files on classroom-tier runs without post-mortem value.
 *
 * Writes go through tempfile-then-rename so an interrupted run cannot destroy
 * the previous good `latest-<env>.json` and block `npm run verify`.
 */
export function persistEvidenceFile(outputPath, payload, { includeRequestSamples = false } = {}) {
  if (!outputPath) throw new Error('persistEvidenceFile requires an output path.');
  const absolutePath = resolve(process.cwd(), outputPath);
  mkdirSync(dirname(absolutePath), { recursive: true });

  const scrubbed = includeRequestSamples
    ? { ...payload, measurements: capRequestSamples(payload.measurements) }
    : { ...payload, measurements: undefined };

  const tempPath = `${absolutePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tempPath, JSON.stringify(scrubbed, null, 2));
    renameSync(tempPath, absolutePath);
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {
      // Ignore cleanup failure; original error takes priority.
    }
    throw error;
  }
  return absolutePath;
}

function capRequestSamples(measurements) {
  if (!Array.isArray(measurements)) return measurements;
  const totalCap = REQUEST_SAMPLES_HEAD_LIMIT + REQUEST_SAMPLES_TAIL_LIMIT;
  if (measurements.length <= totalCap) return measurements;

  // Group by endpoint to preserve coverage of every endpoint seen, then cap
  // head/tail within each group. This matches the plan's "first 100 + last 100
  // per endpoint" spec more faithfully than a single global cap.
  const groups = new Map();
  for (const entry of measurements) {
    const key = entry?.endpoint || 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  const capped = [];
  for (const [, entries] of groups) {
    if (entries.length <= totalCap) {
      capped.push(...entries);
      continue;
    }
    capped.push(...entries.slice(0, REQUEST_SAMPLES_HEAD_LIMIT));
    capped.push(...entries.slice(-REQUEST_SAMPLES_TAIL_LIMIT));
  }
  return capped;
}

export function autoNameEvidencePath({ environment = 'local', commit = 'unknown' } = {}) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `reports/capacity/${timestamp}-${commit.slice(0, 7) || 'unknown'}-${environment}.json`;
}
