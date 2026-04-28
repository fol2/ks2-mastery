#!/usr/bin/env node
// generate-evidence-summary.mjs
//
// Reads evidence files from reports/capacity/evidence/ and emits a summary
// at reports/capacity/latest-evidence-summary.json.  Uses the schema version
// from scripts/lib/capacity-evidence.mjs for forward-compatibility.
//
// Usage:  node scripts/generate-evidence-summary.mjs [--verbose]

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { EVIDENCE_SCHEMA_VERSION } from './lib/capacity-evidence.mjs';

const ROOT = resolve(import.meta.url.startsWith('file://')
  ? new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1')
  : process.cwd());

const EVIDENCE_DIR = join(ROOT, 'reports', 'capacity', 'evidence');
const OUTPUT_PATH = join(ROOT, 'reports', 'capacity', 'latest-evidence-summary.json');

const verbose = process.argv.includes('--verbose');

function log(...args) {
  if (verbose) console.error('[evidence-summary]', ...args);
}

function readEvidenceFiles() {
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

function buildMetrics(files) {
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

function run() {
  const files = readEvidenceFiles();
  log(`Found ${files.length} evidence file(s).`);

  const metrics = buildMetrics(files);
  const now = new Date().toISOString();

  const summary = {
    schema: EVIDENCE_SCHEMA_VERSION,
    metrics,
    generatedAt: now,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(summary, null, 2) + '\n');
  log(`Written summary to ${OUTPUT_PATH}`);
  if (!verbose) {
    console.log(OUTPUT_PATH);
  }
}

run();
