#!/usr/bin/env node
// generate-evidence-summary.mjs
//
// Schema 3 multi-source evidence aggregator. Capacity evidence still carries
// the certification truth; auxiliary sources let Admin explain surrounding
// operational state without promoting capacity by implication.
//
// Usage:  node scripts/generate-evidence-summary.mjs [--verbose]

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE_SCHEMA_VERSION } from './lib/capacity-evidence.mjs';
import {
  extractEvidencePath,
  parseEvidenceTable,
  verifyEvidenceRow,
} from './verify-capacity-evidence.mjs';

const ROOT = resolve(import.meta.url.startsWith('file://')
  ? new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1')
  : process.cwd());

const OUTPUT_PATH = join(ROOT, 'reports', 'capacity', 'latest-evidence-summary.json');

const verbose = process.argv.includes('--verbose');

export const TIER_KEYS = Object.freeze({
  SMOKE: 'smoke_pass',
  SMALL_PILOT: 'small_pilot_provisional',
  CERTIFIED_30: 'certified_30_learner_beta',
  CERTIFIED_60: 'certified_60_learner_stretch',
  CERTIFIED_100: 'certified_100_plus',
  PREFLIGHT: 'preflight_only',
  UNKNOWN: 'unknown',
});

const CERTIFICATION_TIER_KEYS = new Set([
  TIER_KEYS.CERTIFIED_30,
  TIER_KEYS.CERTIFIED_60,
  TIER_KEYS.CERTIFIED_100,
]);

const CERTIFICATION_DECISIONS = new Set([
  '30-learner-beta-certified',
  '60-learner-stretch-certified',
  '100-plus-certified',
]);

function log(...args) {
  if (verbose) console.error('[evidence-summary]', ...args);
}

export function readEvidenceFiles(rootDir = ROOT) {
  const evidenceDir = join(rootDir, 'reports', 'capacity', 'evidence');
  let entries;
  try {
    entries = readdirSync(evidenceDir).filter((f) => f.endsWith('.json')).sort();
  } catch {
    log('No evidence directory found at', evidenceDir);
    return [];
  }
  const files = [];
  for (const name of entries) {
    try {
      const content = readFileSync(join(evidenceDir, name), 'utf8');
      const parsed = JSON.parse(content);
      files.push({ name, data: parsed });
    } catch (err) {
      log(`Skipping ${name}: ${err.message}`);
    }
  }
  return files;
}

export function classifyTier(fileName, data = {}) {
  // U1 (P7): Preflight files must never displace a real certification tier.
  // Early return BEFORE the regex cascade so filenames like
  // '60-learner-stretch-preflight-*.json' do not match CERTIFIED_60.
  // Filename-based detection fires for real evidence files loaded from disk
  // (which lack an evidenceKind field until classifyEvidenceKind enriches them).
  if (/preflight/i.test(fileName)) return TIER_KEYS.PREFLIGHT;
  if (data?.evidenceKind === 'preflight') {
    return TIER_KEYS.PREFLIGHT;
  }

  const candidates = [
    data?.tier?.tier,
    data?.tier,
    data?.decision,
    data?.shape?.config,
    fileName,
  ].filter(Boolean).map(String);

  if (candidates.some((value) => /100[_-]plus|100[_-]learner|100-plus-certified/i.test(value))) {
    return TIER_KEYS.CERTIFIED_100;
  }
  if (candidates.some((value) => /60[_-]learner|60-learner-stretch-certified|60-learner-stretch/i.test(value))) {
    return TIER_KEYS.CERTIFIED_60;
  }
  if (candidates.some((value) => /30[_-]learner|30-learner-beta-certified|30-learner-beta/i.test(value))) {
    return TIER_KEYS.CERTIFIED_30;
  }
  if (candidates.some((value) => /small[_-]pilot|small-pilot-provisional/i.test(value))) {
    return TIER_KEYS.SMALL_PILOT;
  }
  if (candidates.some((value) => /smoke/i.test(value))) {
    return TIER_KEYS.SMOKE;
  }
  return TIER_KEYS.UNKNOWN;
}

function extractEvidenceTime(data = {}, fileName = '') {
  const candidates = [
    data?.reportMeta?.finishedAt,
    data?.finishedAt,
    data?.summary?.finishedAt,
    data?.reportMeta?.abortedAt,
    data?.abortedAt,
    data?.reportMeta?.startedAt,
    data?.startedAt,
    data?.summary?.startedAt,
  ].filter(Boolean);

  for (const value of candidates) {
    const timestampMs = Date.parse(String(value));
    if (Number.isFinite(timestampMs)) {
      return {
        iso: new Date(timestampMs).toISOString(),
        timestampMs,
        dateKey: new Date(timestampMs).toISOString().slice(0, 10),
        precision: 'timestamp',
      };
    }
  }

  const dateOnly = data?.reportMeta?.date || fileName.match(/(20\d{6})/)?.[1];
  if (dateOnly) {
    const normalised = String(dateOnly).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
    const timestampMs = Date.parse(`${normalised}T00:00:00Z`);
    if (Number.isFinite(timestampMs)) {
      return {
        iso: new Date(timestampMs).toISOString(),
        timestampMs,
        dateKey: normalised,
        precision: 'date',
      };
    }
  }

  return {
    iso: null,
    timestampMs: 0,
    dateKey: '0000-00-00',
    precision: 'unknown',
  };
}

function phaseRank(data = {}, fileName = '') {
  const phase = String(data?.reportMeta?.phase || fileName || '');
  const match = phase.match(/\bP(\d+)\b/i);
  return match ? Number(match[1]) : 0;
}

function isNewerEvidence(next, existing) {
  if (!existing) return true;
  if (next.sort.dateKey !== existing.sort.dateKey) {
    return next.sort.dateKey > existing.sort.dateKey;
  }
  if (next.sort.phaseRank !== existing.sort.phaseRank) {
    return next.sort.phaseRank > existing.sort.phaseRank;
  }
  if (next.sort.timestampMs !== existing.sort.timestampMs) {
    return next.sort.timestampMs > existing.sort.timestampMs;
  }
  return next.fileName > existing.fileName;
}

function classifyEvidenceKind(fileName, data = {}) {
  if (
    data?.kind === 'capacity-worker-log-correlation'
    || data?.kind === 'capacity-statement-map'
    || data?.diagnostics?.workerLogJoin
  ) {
    return 'diagnostic-artifact';
  }
  if (/preflight/i.test(fileName)) return 'preflight';
  if (data?.setupFailure || data?.metrics === null) return 'preflight';
  if (data?.dryRun) return 'dry-run';
  return 'capacity-run';
}

function shouldSummariseEvidenceKind(evidenceKind) {
  return evidenceKind !== 'diagnostic-artifact';
}

function normaliseFailures(data = {}, thresholdViolations = []) {
  const failures = Array.isArray(data.failures) ? data.failures.map(String) : [];
  for (const violation of thresholdViolations) {
    const key = violation.threshold || violation.name;
    if (key && !failures.some((failure) => sameThresholdName(failure, key))) {
      failures.push(String(key));
    }
  }
  return failures;
}

function normaliseThresholdViolations(data = {}) {
  const thresholds = data?.thresholds && typeof data.thresholds === 'object' ? data.thresholds : {};
  const explicit = Array.isArray(thresholds.violations) ? thresholds.violations : [];
  const normalised = explicit.map((violation) => ({
    threshold: violation.threshold || violation.name || null,
    limit: violation.limit ?? violation.configured ?? null,
    observed: violation.observed ?? null,
    message: violation.message || null,
  }));

  for (const [key, value] of Object.entries(thresholds)) {
    if (!value || typeof value !== 'object' || value.passed !== false) continue;
    if (normalised.some((violation) => sameThresholdName(violation.threshold, key))) continue;
    normalised.push({
      threshold: key,
      limit: value.configured ?? value.limit ?? null,
      observed: value.observed ?? null,
      message: null,
    });
  }

  return normalised;
}

function sameThresholdName(left, right) {
  return normaliseThresholdName(left) === normaliseThresholdName(right);
}

function normaliseThresholdName(value) {
  return String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function certificationClassification(data = {}) {
  const classification = data?.diagnostics?.classification;
  if (!classification || typeof classification !== 'object') {
    return {
      present: false,
      certificationEligible: false,
      kind: null,
      reasons: ['missing-certification-diagnostics'],
    };
  }

  const reasons = Array.isArray(classification.reasons)
    ? classification.reasons.map(String).filter(Boolean)
    : [];
  return {
    present: true,
    certificationEligible: classification.certificationEligible === true,
    kind: classification.kind || null,
    reasons,
  };
}

function certificationTableVerification(fileName, declaredTier, verifiedCertificationEvidence = new Map()) {
  const candidates = [
    fileName,
    `reports/capacity/evidence/${fileName}`,
  ];
  const verified = candidates
    .map((candidate) => verifiedCertificationEvidence.get(candidate))
    .find(Boolean);

  if (!verified) {
    return {
      verified: false,
      reason: 'evidence-not-in-verified-capacity-table',
      rowDecision: null,
    };
  }
  if (declaredTier && verified.decision !== declaredTier) {
    return {
      verified: false,
      reason: `verified-table-decision-mismatch: ${verified.decision}`,
      rowDecision: verified.decision,
    };
  }
  return {
    verified: true,
    reason: null,
    rowDecision: verified.decision,
  };
}

function certificationNonEligibilityReason(data = {}, tableVerification = { verified: true }) {
  const classification = certificationClassification(data);
  if (!classification.present) return 'missing-certification-diagnostics';
  if (classification.reasons.length > 0) {
    return `not-certification-eligible: ${classification.reasons.join(', ')}`;
  }
  if (!classification.certificationEligible) return 'not-certification-eligible';
  if (!tableVerification.verified) return tableVerification.reason;
  return null;
}

function deriveStatus({ data, tierKey, evidenceKind, failures, thresholdViolations, tableVerification }) {
  if (data?.dryRun || evidenceKind === 'dry-run') return 'non_certifying';
  if (failures.length > 0 || thresholdViolations.length > 0) return 'failed';
  if (evidenceKind === 'preflight') return 'non_certifying';
  if (!data?.ok) return 'failed';
  if (CERTIFICATION_TIER_KEYS.has(tierKey)) {
    const schemaVersion = Number(data?.reportMeta?.evidenceSchemaVersion);
    if (!Number.isFinite(schemaVersion) || schemaVersion < EVIDENCE_SCHEMA_VERSION) {
      return 'non_certifying';
    }
    if (!certificationClassification(data).certificationEligible) {
      return 'non_certifying';
    }
    if (!tableVerification.verified) {
      return 'non_certifying';
    }
  }
  return 'passed';
}

function deriveFailureReason({ data, tierKey, status, failures, thresholdViolations, evidenceKind, tableVerification }) {
  if (status === 'failed' && thresholdViolations.length > 0) return 'threshold-violations';
  if (status === 'failed' && failures.length > 0) return 'evidence-failures';
  if (status === 'non_certifying' && data?.dryRun) return 'dry-run';
  if (status === 'non_certifying') {
    const explicitReason = data?.rootCause || data?.currentBlocker || data?.previousBlocker;
    if (explicitReason) return explicitReason;
    if (evidenceKind === 'preflight') return evidenceKind;
  }
  if (status === 'non_certifying' && CERTIFICATION_TIER_KEYS.has(tierKey)) {
    const reason = certificationNonEligibilityReason(data, tableVerification);
    if (reason) return reason;
  }
  if (status === 'non_certifying') {
    return evidenceKind;
  }
  return null;
}

function declaredSourceTier(data = {}) {
  if (typeof data?.tier?.tier === 'string') return data.tier.tier;
  if (typeof data?.tier === 'string') return data.tier;
  if (typeof data?.decision === 'string' && /certified|provisional|smoke/i.test(data.decision)) {
    return data.decision;
  }
  return null;
}

function sourceTier(data = {}, tierKey) {
  return declaredSourceTier(data) || tierKey;
}

function inferLearners(fileName) {
  const match = String(fileName || '').match(/(\d+)[_-]learner/i);
  return match ? Number(match[1]) : null;
}

function summariseEvidenceFile(name, data, options = {}) {
  const tier = classifyTier(name, data);
  const key = tier === TIER_KEYS.UNKNOWN ? name.replace(/\.json$/, '') : tier;
  const evidenceTime = extractEvidenceTime(data, name);
  const thresholdViolations = normaliseThresholdViolations(data);
  const failures = normaliseFailures(data, thresholdViolations);
  const evidenceKind = classifyEvidenceKind(name, data);
  const declaredTier = declaredSourceTier(data);
  const tableVerification = CERTIFICATION_TIER_KEYS.has(key)
    ? certificationTableVerification(name, declaredTier, options.verifiedCertificationEvidence)
    : { verified: true, reason: null, rowDecision: null };
  const status = deriveStatus({
    data,
    tierKey: key,
    evidenceKind,
    failures,
    thresholdViolations,
    tableVerification,
  });
  const certification = certificationClassification(data);
  const certificationReasons = CERTIFICATION_TIER_KEYS.has(key)
    ? [
        ...certification.reasons,
        ...(tableVerification.reason ? [tableVerification.reason] : []),
      ]
    : [];
  const certificationEligible = certification.certificationEligible && tableVerification.verified;
  const certifying = status === 'passed'
    && CERTIFICATION_TIER_KEYS.has(key)
    && evidenceKind === 'capacity-run'
    && !data?.dryRun
    && certificationEligible
    && Boolean(declaredTier && /certified/i.test(declaredTier));

  return {
    tier: key,
    sourceTier: sourceTier(data, key),
    status,
    ok: Boolean(data?.ok),
    certifying,
    dryRun: Boolean(data?.dryRun),
    evidenceKind,
    certificationEligible: CERTIFICATION_TIER_KEYS.has(key) ? certificationEligible : null,
    certificationReasons,
    decision: data?.decision || (status === 'failed' ? 'fail' : null),
    failureReason: deriveFailureReason({
      data,
      tierKey: key,
      status,
      failures,
      thresholdViolations,
      evidenceKind,
      tableVerification,
    }),
    learners: data?.reportMeta?.learners ?? data?.safety?.learners ?? data?.shape?.learners ?? inferLearners(name),
    bootstrapBurst: data?.reportMeta?.bootstrapBurst ?? data?.safety?.bootstrapBurst ?? data?.shape?.bootstrapBurst ?? null,
    rounds: data?.reportMeta?.rounds ?? data?.shape?.rounds ?? null,
    finishedAt: evidenceTime.iso,
    finishedAtPrecision: evidenceTime.precision,
    commit: data?.reportMeta?.commit || null,
    failures,
    thresholdsPassed: status === 'passed'
      ? true
      : (thresholdViolations.length > 0 || failures.length > 0 ? false : null),
    thresholdViolations,
    fileName: name,
    verifiedCapacityRowDecision: tableVerification.rowDecision,
    sort: {
      dateKey: evidenceTime.dateKey,
      phaseRank: phaseRank(data, name),
      timestampMs: evidenceTime.timestampMs,
    },
  };
}

export function buildMetrics(files, options = {}) {
  const metrics = {};
  for (const { name, data } of files) {
    const metric = summariseEvidenceFile(name, data, options);
    if (!shouldSummariseEvidenceKind(metric.evidenceKind)) continue;
    const existing = metrics[metric.tier];
    if (!isNewerEvidence(metric, existing)) continue;
    metrics[metric.tier] = metric;
  }

  for (const metric of Object.values(metrics)) {
    delete metric.sort;
  }
  return metrics;
}

function withWorkingDirectory(rootDir, callback) {
  const previous = process.cwd();
  try {
    if (previous !== rootDir) process.chdir(rootDir);
    return callback();
  } finally {
    if (process.cwd() !== previous) process.chdir(previous);
  }
}

export function buildVerifiedCertificationEvidenceIndex(rootDir = ROOT) {
  const docPath = join(rootDir, 'docs', 'operations', 'capacity.md');
  if (!existsSync(docPath)) {
    log(`Capacity evidence doc not found at ${docPath}`);
    return new Map();
  }

  try {
    const markdown = readFileSync(docPath, 'utf8');
    const rows = parseEvidenceTable(markdown);
    return withWorkingDirectory(rootDir, () => {
      const verified = new Map();
      for (const row of rows) {
        if (!CERTIFICATION_DECISIONS.has(row.decision)) continue;
        const evidencePath = extractEvidencePath(row.evidence);
        if (!evidencePath) continue;
        const result = verifyEvidenceRow(row);
        if (!result.ok) {
          log(`Certification row for ${evidencePath} failed verifier: ${result.messages.join('; ')}`);
          continue;
        }
        const entry = { decision: row.decision };
        verified.set(evidencePath, entry);
        verified.set(evidencePath.split('/').pop(), entry);
      }
      return verified;
    });
  } catch (err) {
    log(`Capacity evidence verifier index failed: ${err.message}`);
    return new Map();
  }
}

function readJsonSource(filePath, tierKey, rootDir = ROOT) {
  if (!existsSync(filePath)) {
    return { metric: null, found: false };
  }
  try {
    const content = readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      log(`Source ${filePath}: parsed but not an object`);
      return { metric: null, found: true };
    }
    return {
      metric: {
        tier: tierKey,
        ok: Boolean(data.ok),
        dryRun: Boolean(data.dryRun),
        learners: data.learners ?? data?.reportMeta?.learners ?? null,
        finishedAt: data.finishedAt || data?.reportMeta?.finishedAt || null,
        commit: data.commit || data?.reportMeta?.commit || null,
        failures: Array.isArray(data.failures) ? data.failures : [],
        fileName: filePath.replace(rootDir + '/', '').replace(rootDir + '\\', ''),
      },
      found: true,
    };
  } catch (err) {
    log(`Source ${filePath}: malformed - ${err.message}`);
    return { metric: null, found: true };
  }
}

function readCspStatus(rootDir = ROOT) {
  const secHeadersPath = join(rootDir, 'worker', 'src', 'security-headers.js');
  if (!existsSync(secHeadersPath)) {
    return { metric: null, found: false };
  }
  try {
    const content = readFileSync(secHeadersPath, 'utf8');
    const match = content.match(/CSP_ENFORCEMENT_MODE\s*=\s*['"]([^'"]+)['"]/);
    const mode = match ? match[1] : 'unknown';
    return {
      metric: {
        tier: 'csp_status',
        ok: mode === 'enforced',
        dryRun: false,
        mode,
        finishedAt: new Date().toISOString(),
        commit: null,
        failures: mode === 'enforced' ? [] : [`csp_mode_is_${mode}`],
      },
      found: true,
    };
  } catch (err) {
    log(`CSP source read failed: ${err.message}`);
    return { metric: null, found: true };
  }
}

function readMigrationCount(rootDir = ROOT) {
  const migrationsDir = join(rootDir, 'worker', 'migrations');
  if (!existsSync(migrationsDir)) {
    return { metric: null, found: false };
  }
  try {
    const entries = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
    return {
      metric: {
        tier: 'd1_migrations',
        ok: entries.length > 0,
        dryRun: false,
        count: entries.length,
        finishedAt: new Date().toISOString(),
        commit: null,
        failures: [],
      },
      found: true,
    };
  } catch (err) {
    log(`Migrations read failed: ${err.message}`);
    return { metric: null, found: true };
  }
}

function readBuildVersion(rootDir = ROOT) {
  const pkgPath = join(rootDir, 'package.json');
  if (!existsSync(pkgPath)) {
    return { metric: null, found: false };
  }
  try {
    const content = readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(content);
    return {
      metric: {
        tier: 'build_version',
        ok: Boolean(pkg.version),
        dryRun: false,
        version: pkg.version || null,
        finishedAt: new Date().toISOString(),
        commit: null,
        failures: [],
      },
      found: true,
    };
  } catch (err) {
    log(`package.json read failed: ${err.message}`);
    return { metric: null, found: true };
  }
}

/** @typedef {{ file: string, found: boolean }} SourceEntry */

export function aggregateSources(rootDir = ROOT) {
  const sources = {};
  const metrics = {};

  const capacityFiles = readEvidenceFiles(rootDir);
  const verifiedCertificationEvidence = buildVerifiedCertificationEvidenceIndex(rootDir);
  log(`Found ${capacityFiles.length} capacity evidence file(s).`);
  Object.assign(metrics, buildMetrics(capacityFiles, { verifiedCertificationEvidence }));
  sources.capacity_evidence = {
    file: 'reports/capacity/evidence/',
    found: capacityFiles.length > 0,
  };

  const adminSmokePath = join(rootDir, 'reports', 'admin-smoke', 'latest.json');
  const adminSmoke = readJsonSource(adminSmokePath, 'admin_smoke', rootDir);
  sources.admin_smoke = { file: 'reports/admin-smoke/latest.json', found: adminSmoke.found };
  if (adminSmoke.metric) metrics.admin_smoke = adminSmoke.metric;

  const bootstrapSmokePath = join(rootDir, 'reports', 'bootstrap-smoke', 'latest.json');
  const bootstrapSmoke = readJsonSource(bootstrapSmokePath, 'bootstrap_smoke', rootDir);
  sources.bootstrap_smoke = { file: 'reports/bootstrap-smoke/latest.json', found: bootstrapSmoke.found };
  if (bootstrapSmoke.metric) metrics.bootstrap_smoke = bootstrapSmoke.metric;

  const csp = readCspStatus(rootDir);
  sources.csp_status = { file: 'worker/src/security-headers.js', found: csp.found };
  if (csp.metric) metrics.csp_status = csp.metric;

  const migrations = readMigrationCount(rootDir);
  sources.d1_migrations = { file: 'worker/migrations/', found: migrations.found };
  if (migrations.metric) metrics.d1_migrations = migrations.metric;

  const buildVersion = readBuildVersion(rootDir);
  sources.build_version = { file: 'package.json', found: buildVersion.found };
  if (buildVersion.metric) metrics.build_version = buildVersion.metric;

  const kpiPath = join(rootDir, 'reports', 'kpi-reconcile', 'latest.json');
  const kpi = readJsonSource(kpiPath, 'kpi_reconcile', rootDir);
  sources.kpi_reconcile = { file: 'reports/kpi-reconcile/latest.json', found: kpi.found };
  if (kpi.metric) metrics.kpi_reconcile = kpi.metric;

  return { sources, metrics };
}

export function buildEvidenceSummary(files, {
  generatedAt = new Date().toISOString(),
  sources = null,
  verifiedCertificationEvidence = new Map(),
} = {}) {
  const summary = {
    schema: EVIDENCE_SCHEMA_VERSION,
    metrics: buildMetrics(files, { verifiedCertificationEvidence }),
    generatedAt,
  };
  if (sources) {
    summary.sources = sources;
  } else {
    summary.source = 'reports/capacity/evidence';
  }
  return summary;
}

function run() {
  const { sources, metrics } = aggregateSources(ROOT);
  const summary = {
    schema: EVIDENCE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sources,
    metrics,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(summary, null, 2) + '\n');
  log(`Written summary to ${OUTPUT_PATH}`);
  if (!verbose) {
    console.log(OUTPUT_PATH);
  }
}

const isDirectInvocation = (() => {
  try {
    return fileURLToPath(import.meta.url) === resolve(process.argv[1] || '');
  } catch {
    return false;
  }
})();

if (isDirectInvocation) run();
