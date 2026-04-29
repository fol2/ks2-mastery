import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const EVIDENCE_SCHEMA_VERSION = 3;
export const P1_WORKER_LOG_DIAGNOSTICS_VERSION = 1;
export const P1_WORKER_LOG_DIAGNOSTIC_ONLY_REASON = 'worker-log-diagnostics-do-not-certify';
export const P1_UNCLASSIFIED_INSUFFICIENT_LOGS = 'unclassified-insufficient-logs';
export const CAPACITY_EVIDENCE_REDACTION_VERSION = 'capacity-diagnostics-redaction-v1';
export const CAPACITY_EVIDENCE_OPAQUE_HASH_LENGTH = 24;
export const P1_TAIL_CLASSIFICATIONS = Object.freeze([
  P1_UNCLASSIFIED_INSUFFICIENT_LOGS,
  'partial-invocation-only',
  'd1-dominated',
  'worker-cpu-dominated',
  'payload-size-pressure',
  'client-network-or-platform-overhead',
  'mixed-no-single-dominant-resource',
]);

const P1_TAIL_CLASSIFICATION_SET = new Set(P1_TAIL_CLASSIFICATIONS);
const RAW_CAPACITY_REQUEST_ID_RE = /ks2_req_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const OPAQUE_CAPACITY_REQUEST_ID_RE = /^req_[0-9a-f]{24}$/;
const REQUEST_ID_FIELD_RE = /^(clientRequestId|serverRequestId|requestId)$/;

// Request-sample cap per endpoint when --include-request-samples is enabled.
// Plan says 100 + 100 (first N and last N); this preserves post-mortem utility
// without letting classroom-tier runs produce multi-MB evidence files.
export const REQUEST_SAMPLES_HEAD_LIMIT = 100;
export const REQUEST_SAMPLES_TAIL_LIMIT = 100;
export const P6_THIRTY_LEARNER_GATE_SHAPE = Object.freeze({
  learners: 30,
  bootstrapBurst: 20,
  rounds: 1,
});
export const P6_CERTIFICATION_PRODUCTION_ORIGIN = 'https://ks2.eugnel.uk';
export const P6_CERTIFIED_THRESHOLD_CONFIG_PATH = 'reports/capacity/configs/30-learner-beta.json';
export const P6_CERTIFIED_THRESHOLD_CONFIG_HASH = '2127fb3330207f59b587dee13671a8fec4853e1d85107a582ecd5199f2c3dbce';

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
  // ADV-001: resolve the commit SHA once and pass it to buildProvenance so
  // reportMeta.commit and provenance.gitSha are guaranteed identical. Two
  // independent calls to resolveCommitSha() created a TOCTOU gap — HEAD could
  // change between the calls, causing the values to diverge.
  const commitSha = resolveCommitSha();
  return {
    commit: commitSha,
    environment: resolveEnvironmentName(options),
    origin: options.origin || 'unknown',
    authMode: resolveAuthMode(options),
    learners: options.learners ?? null,
    bootstrapBurst: options.bootstrapBurst ?? null,
    rounds: options.rounds ?? null,
    startedAt: timings.startedAt || null,
    finishedAt: timings.finishedAt || null,
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    provenance: buildProvenance(options, commitSha),
  };
}

export function classifyCapacityEvidenceRun(options = {}, tier = {}) {
  const runShape = buildRunShape(options);
  const targetTier = tier?.tier || null;
  const reasons = [];

  if (runShape.mode === 'dry-run') {
    reasons.push('dry-run-has-no-measurements');
  } else if (runShape.mode !== 'production') {
    reasons.push('not-production-mode');
  }

  if (runShape.originClass !== 'production') {
    reasons.push(`origin-${runShape.originClass}`);
  }

  if (runShape.sessionSourceMode === 'manifest') {
    reasons.push('session-manifest-requires-equivalence-record');
  } else if (runShape.sessionSourceMode !== 'demo-sessions') {
    reasons.push('session-source-not-isolated-demo');
  }

  if (!runShape.releaseGateShape) {
    reasons.push('non-p6-30-learner-gate-shape');
  }

  if (!options.configPath || !targetTier) {
    reasons.push('missing-pinned-threshold-config');
  } else if (normaliseRepoPath(options.configPath) !== P6_CERTIFIED_THRESHOLD_CONFIG_PATH) {
    reasons.push('threshold-config-not-p6-30-learner-beta');
  } else if (targetTier !== '30-learner-beta-certified') {
    reasons.push('tier-is-not-30-learner-beta-certified');
  }

  return {
    kind: reasons.length ? 'diagnostic' : 'certification-candidate',
    certificationEligible: reasons.length === 0,
    reasons,
    targetTier,
    runShape,
  };
}

export function buildCapacityDiagnostics({
  options = {},
  tier = {},
  summary = {},
  thresholdViolations = [],
  thresholdConfigHash = null,
  workerLogJoin = null,
} = {}) {
  const baseClassification = classifyCapacityEvidenceRun(options, tier);
  const evidenceLane = classifyP1EvidenceLane(options, tier);
  const endpointKeys = Object.keys(summary.endpoints || {});
  const bootstrapEndpointKeys = endpointKeys.filter((key) => key.endsWith('/api/bootstrap'));
  const commandEndpointKeys = endpointKeys.filter((key) => /subjects\/.*\/command/.test(key));
  const endpointInventory = {
    hasBootstrapMetrics: bootstrapEndpointKeys.length > 0,
    hasCommandMetrics: commandEndpointKeys.length > 0,
    bootstrapEndpointKeys,
    commandEndpointKeys,
  };
  const normalisedViolations = normaliseThresholdViolations(thresholdViolations);
  const thresholdConfigHashEligible = thresholdConfigHash === P6_CERTIFIED_THRESHOLD_CONFIG_HASH;
  const shapeEligible = baseClassification.certificationEligible && thresholdConfigHashEligible;
  const thresholdEligible = normalisedViolations.length === 0;
  const evidenceComplete = endpointInventory.hasBootstrapMetrics && endpointInventory.hasCommandMetrics;
  const resultReasons = [];

  if (baseClassification.certificationEligible && !thresholdConfigHashEligible) {
    resultReasons.push(thresholdConfigHash ? 'threshold-config-hash-mismatch' : 'missing-threshold-config-hash');
  }
  if (!endpointInventory.hasBootstrapMetrics) resultReasons.push('missing-bootstrap-metrics');
  if (!endpointInventory.hasCommandMetrics) resultReasons.push('missing-command-metrics');
  if (!thresholdEligible) resultReasons.push('threshold-violations');

  const reasons = [...baseClassification.reasons, ...resultReasons];
  const certificationEligible = shapeEligible && thresholdEligible && evidenceComplete;

  return {
    classification: {
      ...baseClassification,
      kind: certificationEligible ? baseClassification.kind : 'diagnostic',
      shapeEligible,
      thresholdEligible,
      evidenceComplete,
      certificationEligible,
      reasons,
    },
    evidenceLane,
    runShape: baseClassification.runShape,
    endpointInventory,
    thresholdConfig: {
      configPath: options.configPath || null,
      tier: tier?.tier || null,
      minEvidenceSchemaVersion: tier?.minEvidenceSchemaVersion ?? null,
      hash: thresholdConfigHash || null,
    },
    thresholdViolations: normalisedViolations,
    ...(workerLogJoin ? { workerLogJoin: buildWorkerLogJoinDiagnostics(workerLogJoin) } : {}),
  };
}

export function classifyP1EvidenceLane(options = {}, tier = {}) {
  const base = classifyCapacityEvidenceRun(options, tier);
  const reasons = [...base.reasons];
  const sessionSourceMode = base.runShape.sessionSourceMode;
  let lane = 'diagnostic-other';

  if (base.runShape.mode === 'dry-run') {
    lane = 'diagnostic-dry-run';
  } else if (base.runShape.mode !== 'production') {
    lane = 'diagnostic-non-production';
  } else if (sessionSourceMode === 'manifest') {
    lane = 'diagnostic-session-manifest';
  } else if (!base.runShape.releaseGateShape) {
    lane = 'diagnostic-alternate-run-shape';
  } else if (base.runShape.originClass === 'production' && sessionSourceMode === 'demo-sessions') {
    lane = 'strict-30-release-gate';
  }

  return {
    matrix: 'p1-evidence-attribution',
    lane,
    diagnosticOnly: !base.certificationEligible,
    certificationCandidate: base.certificationEligible,
    requiresUniqueOutputPath: true,
    reasons,
  };
}

export function buildWorkerLogJoinDiagnostics(input = {}) {
  const samples = Array.isArray(input.samples)
    ? input.samples.map((sample) => normaliseWorkerLogJoinSample(sample))
    : [];
  const coverage = buildWorkerLogCoverage(samples);
  const classificationCounts = {};
  for (const sample of samples) {
    classificationCounts[sample.classification] = (classificationCounts[sample.classification] || 0) + 1;
  }

  return {
    schemaVersion: P1_WORKER_LOG_DIAGNOSTICS_VERSION,
    diagnosticOnly: true,
    generatedAt: typeof input.generatedAt === 'string' ? input.generatedAt : null,
    sourceEvidencePath: typeof input.sourceEvidencePath === 'string' ? input.sourceEvidencePath : null,
    logSourcePaths: Array.isArray(input.logSourcePaths)
      ? input.logSourcePaths.filter((entry) => typeof entry === 'string')
      : [],
    certification: {
      contributesToCertification: false,
      reason: P1_WORKER_LOG_DIAGNOSTIC_ONLY_REASON,
    },
    coverage,
    classificationCounts,
    samples,
  };
}

function buildWorkerLogCoverage(samples = []) {
  const topTailSamples = samples.length;
  let invocationMatched = 0;
  let invocationPartial = 0;
  let statementMatched = 0;
  let statementPartial = 0;

  for (const sample of samples) {
    const invocationStatus = sample.join.invocation.status;
    const statementStatus = sample.join.capacityRequest.status;
    if (invocationStatus === 'matched') invocationMatched += 1;
    if (invocationStatus === 'partial') invocationPartial += 1;
    if (statementStatus === 'matched') statementMatched += 1;
    if (statementStatus === 'partial') statementPartial += 1;
  }

  const ratio = (count) => (topTailSamples > 0 ? Number((count / topTailSamples).toFixed(4)) : 0);
  return {
    topTailSamples,
    invocation: {
      matched: invocationMatched,
      partial: invocationPartial,
      missing: topTailSamples - invocationMatched - invocationPartial,
      coverageRatio: ratio(invocationMatched),
    },
    statementLogs: {
      matched: statementMatched,
      partial: statementPartial,
      missing: topTailSamples - statementMatched - statementPartial,
      coverageRatio: ratio(statementMatched),
    },
  };
}

function normaliseWorkerLogJoinSample(sample = {}) {
  const join = sample.join && typeof sample.join === 'object' ? sample.join : {};
  const invocationStatus = normaliseJoinStatus(
    sample.invocationJoinStatus || join.invocation?.status,
  );
  const capacityRequestStatus = normaliseJoinStatus(
    sample.capacityRequestJoinStatus || join.capacityRequest?.status || join.statementLogs?.status,
  );
  const cloudflare = normaliseCloudflareInvocation(sample.cloudflare || sample.invocation || {});
  const capacityRequest = normaliseCapacityRequestLog(sample.capacityRequest || sample.statementLog || {});
  const classification = normaliseTailClassification(
    sample.classification,
    invocationStatus,
    cloudflare,
    capacityRequestStatus,
  );

  return {
    requestId: normaliseString(sample.requestId || sample.serverRequestId),
    clientRequestId: normaliseString(sample.clientRequestId),
    endpoint: normaliseString(sample.endpoint),
    method: normaliseString(sample.method),
    status: finiteOrNull(sample.status),
    scenario: normaliseString(sample.scenario),
    app: {
      wallMs: finiteOrNull(sample.app?.wallMs ?? sample.wallMs),
      responseBytes: finiteOrNull(sample.app?.responseBytes ?? sample.responseBytes),
      queryCount: finiteOrNull(sample.app?.queryCount ?? sample.queryCount),
      d1RowsRead: finiteOrNull(sample.app?.d1RowsRead ?? sample.d1RowsRead),
      d1RowsWritten: finiteOrNull(sample.app?.d1RowsWritten ?? sample.d1RowsWritten),
      serverWallMs: finiteOrNull(sample.app?.serverWallMs ?? sample.serverWallMs),
      bootstrapMode: normaliseString(sample.app?.bootstrapMode ?? sample.bootstrapMode),
    },
    join: {
      invocation: {
        status: invocationStatus,
        reason: normaliseString(join.invocation?.reason || sample.invocationJoinReason),
      },
      capacityRequest: {
        status: capacityRequestStatus,
        reason: normaliseString(join.capacityRequest?.reason || sample.capacityRequestJoinReason),
      },
      notes: Array.isArray(sample.joinNotes || join.notes)
        ? (sample.joinNotes || join.notes).filter((entry) => typeof entry === 'string')
        : [],
    },
    cloudflare,
    capacityRequest,
    classification,
    classificationReason: normaliseString(sample.classificationReason),
  };
}

function normaliseJoinStatus(value) {
  if (value === 'matched' || value === 'partial') return value;
  return 'missing';
}

function normaliseTailClassification(value, invocationStatus, cloudflare, capacityRequestStatus) {
  if (
    invocationStatus !== 'matched'
    || !Number.isFinite(cloudflare.cpuTimeMs)
    || !Number.isFinite(cloudflare.wallTimeMs)
  ) {
    return P1_UNCLASSIFIED_INSUFFICIENT_LOGS;
  }
  if (P1_TAIL_CLASSIFICATION_SET.has(value)) return value;
  if (capacityRequestStatus !== 'matched') return 'partial-invocation-only';
  return 'mixed-no-single-dominant-resource';
}

function normaliseCloudflareInvocation(value = {}) {
  const cpuTimeMs = finiteOrNull(value.cpuTimeMs);
  const wallTimeMs = finiteOrNull(value.wallTimeMs);
  return {
    cpuTimeMs,
    wallTimeMs,
    outcome: normaliseString(value.outcome),
  };
}

function normaliseCapacityRequestLog(value = {}) {
  const statements = Array.isArray(value.statements)
    ? value.statements.slice(0, 50).map((entry) => ({
      name: normaliseString(entry?.name),
      rowsRead: finiteOrNull(entry?.rowsRead),
      rowsWritten: finiteOrNull(entry?.rowsWritten),
      durationMs: finiteOrNull(entry?.durationMs),
    }))
    : [];
  return {
    wallMs: finiteOrNull(value.wallMs),
    d1DurationMs: finiteOrNull(value.d1DurationMs),
    queryCount: finiteOrNull(value.queryCount),
    d1RowsRead: finiteOrNull(value.d1RowsRead),
    d1RowsWritten: finiteOrNull(value.d1RowsWritten),
    responseBytes: finiteOrNull(value.responseBytes),
    bootstrapMode: normaliseString(value.bootstrapMode),
    statements,
    statementsTruncated: value.statementsTruncated === true,
  };
}

function normaliseString(value) {
  return typeof value === 'string' && value ? value : null;
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildRunShape(options = {}) {
  const learners = normaliseShapeNumber(options.learners);
  const bootstrapBurst = normaliseShapeNumber(options.bootstrapBurst);
  const rounds = normaliseShapeNumber(options.rounds);
  const origin = options.origin || null;

  return {
    mode: options.mode || 'dry-run',
    origin,
    originClass: classifyOrigin(origin),
    learners,
    bootstrapBurst,
    rounds,
    sessionSourceMode: resolveSessionSourceMode(options),
    releaseGateShape:
      learners === P6_THIRTY_LEARNER_GATE_SHAPE.learners
      && bootstrapBurst === P6_THIRTY_LEARNER_GATE_SHAPE.bootstrapBurst
      && rounds === P6_THIRTY_LEARNER_GATE_SHAPE.rounds,
  };
}

function resolveSessionSourceMode(options = {}) {
  if (options.sessionManifest) return 'manifest';
  if (options.demoSessions) return 'demo-sessions';
  if (options.cookie || options.bearer) return 'shared-auth';
  if (options.headers && options.headers.some((header) => /^(authorization|cookie)\s*:/i.test(header))) {
    return 'shared-auth';
  }
  if (options.mode === 'dry-run') return 'none';
  return 'unknown';
}

function normaliseShapeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function classifyOrigin(origin) {
  if (!origin) return 'unknown';
  try {
    const url = new URL(origin);
    if (url.origin === P6_CERTIFICATION_PRODUCTION_ORIGIN) return 'production';
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.test')) {
      return 'local';
    }
    if (/preview|staging|dev/.test(host)) return 'preview';
    if (url.protocol === 'https:') return 'external-https';
    return 'non-production';
  } catch {
    return 'unknown';
  }
}

function normaliseRepoPath(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}

function normaliseThresholdViolations(violations = []) {
  if (!Array.isArray(violations)) return [];
  return violations.map((entry) => {
    if (!entry || typeof entry !== 'object') return { threshold: 'unknown' };
    return {
      threshold: entry.threshold || 'unknown',
      limit: entry.limit ?? null,
      observed: entry.observed ?? null,
      message: entry.message || '',
      ...(Array.isArray(entry.signals) ? { signals: [...entry.signals] } : {}),
      ...(Array.isArray(entry.gatedEndpoints) ? { gatedEndpoints: [...entry.gatedEndpoints] } : {}),
    };
  });
}

/**
 * Build the provenance sub-block for evidence anti-fabrication.
 * Every field degrades to `'unknown'` (or a safe default) rather than throwing;
 * `verify-capacity-evidence.mjs` enforces strictness for certifiable tiers.
 */
export function buildProvenance(options = {}, cachedCommitSha) {
  const serverUrl = process.env.GITHUB_SERVER_URL || '';
  const repo = process.env.GITHUB_REPOSITORY || '';
  const runId = process.env.GITHUB_RUN_ID || '';
  const workflowRunUrl = (serverUrl && repo && runId)
    ? `${serverUrl}/${repo}/actions/runs/${runId}`
    : 'unknown';

  return {
    workflowRunUrl,
    workflowName: process.env.GITHUB_WORKFLOW || 'unknown',
    // ADV-001: use the cached SHA from buildReportMeta when available, so
    // provenance.gitSha is always identical to reportMeta.commit.
    gitSha: cachedCommitSha ?? resolveCommitSha(),
    dirtyTreeFlag: resolveGitDirty(),
    thresholdConfigHash: resolveThresholdConfigHash(options),
    loadDriverVersion: resolveLoadDriverVersion(),
    operator: process.env.GITHUB_ACTOR || process.env.USER || process.env.USERNAME || 'unknown',
    rawLogArtifactPath: options.rawLogArtifactPath || 'none',
  };
}

function resolveGitDirty() {
  try {
    const status = execSync('git status --porcelain', {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).toString().trim();
    return status.length > 0;
  } catch {
    // Cannot determine; degrade to true (conservative — verify will reject
    // dirty-tree for certifiable tiers).
    return true;
  }
}

/**
 * SHA-256 of the threshold config file content when a --config path is supplied.
 * Returns `'none'` when no config was used (e.g. dry-run or CLI-only thresholds).
 * Returns `'unknown'` when the file cannot be read.
 */
function resolveThresholdConfigHash(options = {}) {
  const configPath = options.configPath;
  if (!configPath) return 'none';
  try {
    const content = readFileSync(resolve(process.cwd(), configPath), 'utf8');
    return createHash('sha256').update(content).digest('hex');
  } catch {
    return 'unknown';
  }
}

function resolveLoadDriverVersion() {
  try {
    const pkgPath = resolve(import.meta.url.startsWith('file://')
      ? new URL('../../package.json', import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1')
      : resolve(process.cwd(), 'package.json'));
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
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
  if (options.sessionManifest) return 'session-manifest';
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
    const queryCountValid = typeof qc === 'number' && Number.isFinite(qc) && qc >= 0;
    const d1RowsReadValid = typeof rows === 'number' && Number.isFinite(rows) && rows >= 0;
    const allPresent = hasEndpoint && queryCountValid && d1RowsReadValid;

    if (!hasEndpoint && dryRun) {
      evaluated.requireBootstrapCapacity = {
        configured: true,
        observed: 'no-bootstrap-endpoint (dry-run)',
        passed: true,
      };
    } else {
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

export function redactCapacityEvidenceRequestId(value) {
  if (typeof value !== 'string' || !value) return value ?? null;
  if (OPAQUE_CAPACITY_REQUEST_ID_RE.test(value)) return value;
  return `req_${createHash('sha256')
    .update(`${CAPACITY_EVIDENCE_REDACTION_VERSION}:request-id:${value}`)
    .digest('hex')
    .slice(0, CAPACITY_EVIDENCE_OPAQUE_HASH_LENGTH)}`;
}

function redactCapacityEvidenceString(value) {
  if (typeof value !== 'string') return value;
  if (OPAQUE_CAPACITY_REQUEST_ID_RE.test(value)) return value;
  return value.replace(RAW_CAPACITY_REQUEST_ID_RE, (match) => redactCapacityEvidenceRequestId(match));
}

export function redactPersistedEvidenceRequestIds(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => redactPersistedEvidenceRequestIds(entry));
  }
  if (!value || typeof value !== 'object') {
    return typeof value === 'string' ? redactCapacityEvidenceString(value) : value;
  }

  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    if (REQUEST_ID_FIELD_RE.test(key) && typeof entry === 'string') {
      output[key] = redactCapacityEvidenceRequestId(entry);
    } else {
      output[key] = redactPersistedEvidenceRequestIds(entry);
    }
  }
  return output;
}

function withCapacityEvidenceRedactionMetadata(payload = {}) {
  return {
    ...payload,
    redaction: {
      ...(payload.redaction && typeof payload.redaction === 'object' ? payload.redaction : {}),
      version: CAPACITY_EVIDENCE_REDACTION_VERSION,
      requestIds: `sha256:${CAPACITY_EVIDENCE_OPAQUE_HASH_LENGTH}`,
      rawRequestIdsPersisted: false,
    },
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
  const persistedPayload = withCapacityEvidenceRedactionMetadata(
    redactPersistedEvidenceRequestIds(scrubbed),
  );

  const tempPath = `${absolutePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tempPath, JSON.stringify(persistedPayload, null, 2));
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
