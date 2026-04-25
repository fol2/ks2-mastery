import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const EVIDENCE_SCHEMA_VERSION = 1;

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
    const sha = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
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
 */
export function evaluateThresholds(summary = {}, thresholds = {}) {
  const evaluated = {};
  const failures = [];

  const signals = summary.signals || {};
  const endpoints = summary.endpoints || {};
  const bootstrapKey = Object.keys(endpoints).find((key) => key.endsWith('/api/bootstrap'));
  const commandKey = Object.keys(endpoints).find((key) => /subjects\/.*\/command/.test(key));
  const bootstrapMetrics = bootstrapKey ? endpoints[bootstrapKey] : null;
  const commandMetrics = commandKey ? endpoints[commandKey] : null;

  if (thresholds.max5xx !== undefined && thresholds.max5xx !== null) {
    evaluated.max5xx = gateCount(thresholds.max5xx, signals.server5xx || 0);
  }
  if (thresholds.maxNetworkFailures !== undefined && thresholds.maxNetworkFailures !== null) {
    evaluated.maxNetworkFailures = gateCount(
      thresholds.maxNetworkFailures,
      signals.networkFailure || 0,
    );
  }
  if (thresholds.maxBootstrapP95Ms !== undefined && thresholds.maxBootstrapP95Ms !== null) {
    evaluated.maxBootstrapP95Ms = gateLatency(
      thresholds.maxBootstrapP95Ms,
      bootstrapMetrics ? bootstrapMetrics.p95WallMs : null,
    );
  }
  if (thresholds.maxCommandP95Ms !== undefined && thresholds.maxCommandP95Ms !== null) {
    evaluated.maxCommandP95Ms = gateLatency(
      thresholds.maxCommandP95Ms,
      commandMetrics ? commandMetrics.p95WallMs : null,
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
    evaluated.requireBootstrapCapacity = {
      configured: true,
      observed: null,
      passed: null,
      note: 'bootstrapCapacity metadata assertion lives in the probe script and U3 meta.capacity once shipped',
    };
  }

  for (const [name, value] of Object.entries(evaluated)) {
    if (value.passed === false) failures.push(name);
  }

  return { thresholds: evaluated, failures };
}

function gateCount(configured, observed) {
  const parsed = Number(configured);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { configured, observed, passed: false, error: 'invalid threshold value' };
  }
  if (observed === null || observed === undefined) {
    return { configured: parsed, observed: null, passed: false };
  }
  return { configured: parsed, observed, passed: observed <= parsed };
}

function gateLatency(configured, observed) {
  const parsed = Number(configured);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { configured, observed, passed: false, error: 'invalid threshold value' };
  }
  if (observed === null || observed === undefined) {
    return { configured: parsed, observed: null, passed: false };
  }
  return { configured: parsed, observed, passed: observed <= parsed };
}

/**
 * Compose an evidence payload from a load-test report. Mutates nothing;
 * returns a fresh object safe to JSON.stringify.
 */
export function buildEvidencePayload({ report, thresholds, options, timings }) {
  const summary = report.summary || {};
  const { thresholds: evaluated, failures } = evaluateThresholds(summary, thresholds);
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
 * If `includeRequestSamples` is false (default), measurements are stripped
 * entirely to keep the file bounded.
 */
export function persistEvidenceFile(outputPath, payload, { includeRequestSamples = false } = {}) {
  if (!outputPath) throw new Error('persistEvidenceFile requires an output path.');
  const absolutePath = resolve(process.cwd(), outputPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  const scrubbed = includeRequestSamples
    ? payload
    : { ...payload, measurements: undefined };
  writeFileSync(absolutePath, JSON.stringify(scrubbed, null, 2));
  return absolutePath;
}

export function autoNameEvidencePath({ environment = 'local', commit = 'unknown' } = {}) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `reports/capacity/${timestamp}-${commit.slice(0, 7) || 'unknown'}-${environment}.json`;
}
