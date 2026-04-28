#!/usr/bin/env node
// generate-evidence-summary.mjs
//
// Schema 3: Multi-source evidence aggregator.
// Reads evidence from multiple source directories and emits a unified summary
// at reports/capacity/latest-evidence-summary.json.
//
// Sources:
//   - Capacity tiers     → reports/capacity/evidence/*.json
//   - Admin smoke        → reports/admin-smoke/latest.json
//   - Bootstrap smoke    → reports/bootstrap-smoke/latest.json
//   - CSP status         → worker/src/security-headers.js (CSP_ENFORCEMENT_MODE)
//   - D1 migrations      → worker/migrations/ (file count)
//   - Build version      → package.json version
//   - KPI reconcile      → reports/kpi-reconcile/latest.json
//
// Usage:  node scripts/generate-evidence-summary.mjs [--verbose]

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { EVIDENCE_SCHEMA_VERSION } from './lib/capacity-evidence.mjs';

const ROOT = resolve(import.meta.url.startsWith('file://')
  ? new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1')
  : process.cwd());

const OUTPUT_PATH = join(ROOT, 'reports', 'capacity', 'latest-evidence-summary.json');

const verbose = process.argv.includes('--verbose');

function log(...args) {
  if (verbose) console.error('[evidence-summary]', ...args);
}

// ---------------------------------------------------------------------------
// Source: capacity evidence tier files
// ---------------------------------------------------------------------------

const EVIDENCE_DIR = join(ROOT, 'reports', 'capacity', 'evidence');

function readCapacityEvidenceFiles() {
  let entries;
  try {
    entries = readdirSync(EVIDENCE_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    log('No evidence directory found at', EVIDENCE_DIR);
    return [];
  }
  const files = [];
  for (const name of entries) {
    try {
      const content = readFileSync(join(EVIDENCE_DIR, name), 'utf8');
      const parsed = JSON.parse(content);
      files.push({ name, data: parsed });
    } catch (err) {
      log(`Skipping ${name}: ${err.message}`);
    }
  }
  return files;
}

function classifyTier(fileName) {
  if (/100[_-]plus|100[_-]learner/i.test(fileName)) return 'certified_100_plus';
  if (/60[_-]learner/i.test(fileName)) return 'certified_60_learner_stretch';
  if (/30[_-]learner/i.test(fileName)) return 'certified_30_learner_beta';
  if (/small[_-]pilot/i.test(fileName)) return 'small_pilot_provisional';
  if (/smoke/i.test(fileName)) return 'smoke_pass';
  return 'unknown';
}

function buildCapacityMetrics(files) {
  const metrics = {};
  for (const { name, data } of files) {
    const tier = classifyTier(name);
    const key = tier === 'unknown' ? name.replace(/\.json$/, '') : tier;

    const existing = metrics[key];
    const finishedAt = data?.reportMeta?.finishedAt
      || data?.reportMeta?.startedAt
      || null;

    // Keep the most recent run per tier.
    if (existing && existing.finishedAt && finishedAt && existing.finishedAt >= finishedAt) {
      continue;
    }

    metrics[key] = {
      tier: key,
      ok: Boolean(data?.ok),
      dryRun: Boolean(data?.dryRun),
      learners: data?.reportMeta?.learners ?? data?.safety?.learners ?? null,
      finishedAt,
      commit: data?.reportMeta?.commit || null,
      failures: Array.isArray(data?.failures) ? data.failures : [],
      thresholdsPassed: data?.failures ? data.failures.length === 0 : null,
      fileName: name,
    };
  }
  return metrics;
}

// ---------------------------------------------------------------------------
// Source: JSON report file (admin-smoke, bootstrap-smoke, kpi-reconcile)
// ---------------------------------------------------------------------------

/**
 * Read a JSON report file and extract a metric entry.
 * @param {string} filePath - absolute path to the JSON file
 * @param {string} tierKey - the tier key to assign (e.g. 'admin_smoke')
 * @returns {{ metric: object|null, found: boolean }}
 */
function readJsonSource(filePath, tierKey) {
  if (!existsSync(filePath)) {
    return { metric: null, found: false };
  }
  try {
    const content = readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    if (!data || typeof data !== 'object') {
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
        fileName: filePath.replace(ROOT + '/', '').replace(ROOT + '\\', ''),
      },
      found: true,
    };
  } catch (err) {
    log(`Source ${filePath}: malformed — ${err.message}`);
    return { metric: null, found: true };
  }
}

// ---------------------------------------------------------------------------
// Source: CSP enforcement mode (static analysis)
// ---------------------------------------------------------------------------

function readCspStatus() {
  const secHeadersPath = join(ROOT, 'worker', 'src', 'security-headers.js');
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
        finishedAt: null,
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

// ---------------------------------------------------------------------------
// Source: D1 migration count
// ---------------------------------------------------------------------------

function readMigrationCount() {
  const migrationsDir = join(ROOT, 'worker', 'migrations');
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
        finishedAt: null,
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

// ---------------------------------------------------------------------------
// Source: Build version from package.json
// ---------------------------------------------------------------------------

function readBuildVersion() {
  const pkgPath = join(ROOT, 'package.json');
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
        finishedAt: null,
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

// ---------------------------------------------------------------------------
// Main aggregation
// ---------------------------------------------------------------------------

/** @typedef {{ file: string, found: boolean }} SourceEntry */

export function aggregateSources(rootDir) {
  const root = rootDir || ROOT;
  const sources = {};
  const metrics = {};

  // 1. Capacity tier evidence files
  const capacityFiles = readCapacityEvidenceFiles();
  log(`Found ${capacityFiles.length} capacity evidence file(s).`);
  const capacityMetrics = buildCapacityMetrics(capacityFiles);
  sources.capacity_evidence = {
    file: 'reports/capacity/evidence/',
    found: capacityFiles.length > 0,
  };
  Object.assign(metrics, capacityMetrics);

  // 2. Admin smoke
  const adminSmokePath = join(root, 'reports', 'admin-smoke', 'latest.json');
  const adminSmoke = readJsonSource(adminSmokePath, 'admin_smoke');
  sources.admin_smoke = { file: 'reports/admin-smoke/latest.json', found: adminSmoke.found };
  if (adminSmoke.metric) metrics.admin_smoke = adminSmoke.metric;

  // 3. Bootstrap smoke
  const bootstrapSmokePath = join(root, 'reports', 'bootstrap-smoke', 'latest.json');
  const bootstrapSmoke = readJsonSource(bootstrapSmokePath, 'bootstrap_smoke');
  sources.bootstrap_smoke = { file: 'reports/bootstrap-smoke/latest.json', found: bootstrapSmoke.found };
  if (bootstrapSmoke.metric) metrics.bootstrap_smoke = bootstrapSmoke.metric;

  // 4. CSP status
  const csp = readCspStatus();
  sources.csp_status = { file: 'worker/src/security-headers.js', found: csp.found };
  if (csp.metric) metrics.csp_status = csp.metric;

  // 5. D1 migrations
  const migrations = readMigrationCount();
  sources.d1_migrations = { file: 'worker/migrations/', found: migrations.found };
  if (migrations.metric) metrics.d1_migrations = migrations.metric;

  // 6. Build version
  const buildVersion = readBuildVersion();
  sources.build_version = { file: 'package.json', found: buildVersion.found };
  if (buildVersion.metric) metrics.build_version = buildVersion.metric;

  // 7. KPI reconcile
  const kpiPath = join(root, 'reports', 'kpi-reconcile', 'latest.json');
  const kpi = readJsonSource(kpiPath, 'kpi_reconcile');
  sources.kpi_reconcile = { file: 'reports/kpi-reconcile/latest.json', found: kpi.found };
  if (kpi.metric) metrics.kpi_reconcile = kpi.metric;

  return { sources, metrics };
}

function run() {
  const { sources, metrics } = aggregateSources(ROOT);
  const now = new Date().toISOString();

  const summary = {
    schema: EVIDENCE_SCHEMA_VERSION,
    generatedAt: now,
    sources,
    metrics,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(summary, null, 2) + '\n');
  log(`Written summary to ${OUTPUT_PATH}`);
  if (!verbose) {
    console.log(OUTPUT_PATH);
  }
}

run();
