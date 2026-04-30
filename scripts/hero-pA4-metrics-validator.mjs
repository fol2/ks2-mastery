#!/usr/bin/env node
// Hero Mode pA4 — Metrics Infrastructure (U5)
// Validates that all 18 launch metrics and 10 safety metrics from the pA4
// contract (§13.1, §13.3) are mappable to canonical metric names or extraction
// query patterns. Classifies each by extraction confidence.
//
// Usage: node scripts/hero-pA4-metrics-validator.mjs
//
// Key constraint: NEVER imports from worker/src/ — only from shared/hero/.

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import {
  HERO_LEARNING_HEALTH_METRICS,
  HERO_ENGAGEMENT_METRICS,
  HERO_ECONOMY_CAMP_METRICS,
  HERO_TECHNICAL_SAFETY_METRICS,
  ALL_HERO_METRICS,
} from '../shared/hero/metrics-contract.js';

// ── Required Launch Metrics (§13.1 — 18 total) ────────────────────────

export const REQUIRED_LAUNCH_METRICS = Object.freeze([
  {
    id: 'launch-01',
    name: 'cohort accounts enabled',
    canonicalMetric: null,
    extractionSource: 'server-extractable',
    queryPattern: "SELECT COUNT(*) FROM cohort_members WHERE cohort_id = ? AND status = 'active'",
    description: 'Count of learner accounts with Hero Mode cohort flag enabled',
  },
  {
    id: 'launch-02',
    name: 'active learner count',
    canonicalMetric: null,
    extractionSource: 'derived',
    queryPattern: "SELECT COUNT(DISTINCT learner_id) FROM event_log WHERE system_id = 'hero-mode' AND created_at >= ?",
    description: 'Unique learners with at least one hero-mode event in period',
  },
  {
    id: 'launch-03',
    name: 'Hero Quest shown count',
    canonicalMetric: 'hero_engagement_card_rendered',
    extractionSource: 'client-only',
    queryPattern: null,
    description: 'Client-side render of the Hero Quest card — not written to event_log',
  },
  {
    id: 'launch-04',
    name: 'Hero Quest start count',
    canonicalMetric: 'hero_engagement_quest_started',
    extractionSource: 'client-only',
    queryPattern: null,
    description: 'Client-side event when learner taps Start on Hero Quest',
  },
  {
    id: 'launch-05',
    name: 'Hero task start count',
    canonicalMetric: 'hero_engagement_first_task_started',
    extractionSource: 'client-only',
    queryPattern: null,
    description: 'Client-side event when first task begins rendering',
  },
  {
    id: 'launch-06',
    name: 'Hero task completion count',
    canonicalMetric: 'hero_engagement_task_completed',
    extractionSource: 'server-extractable',
    queryPattern: "SELECT COUNT(*) FROM event_log WHERE system_id = 'hero-mode' AND event_type = 'hero.task.completed'",
    description: 'Server-side task.completed events in event_log',
  },
  {
    id: 'launch-07',
    name: 'Hero daily completion count',
    canonicalMetric: 'hero_engagement_daily_completed',
    extractionSource: 'server-extractable',
    queryPattern: "SELECT COUNT(*) FROM event_log WHERE system_id = 'hero-mode' AND event_type = 'hero.daily.completed'",
    description: 'Server-side daily.completed events in event_log',
  },
  {
    id: 'launch-08',
    name: 'claim success count',
    canonicalMetric: 'hero_engagement_task_completed',
    extractionSource: 'server-extractable',
    queryPattern: "SELECT COUNT(*) FROM event_log WHERE system_id = 'hero-mode' AND event_type = 'hero.task.completed'",
    description: 'Successful task claims (same as task completion — claim=completion in current arch)',
  },
  {
    id: 'launch-09',
    name: 'claim rejection count',
    canonicalMetric: null,
    extractionSource: 'derived',
    queryPattern: "SELECT COUNT(*) FROM event_log WHERE system_id = 'hero-mode' AND event_type = 'hero.task.rejected'",
    description: 'Task claim rejections (stale write, revision conflict)',
  },
  {
    id: 'launch-10',
    name: 'coin award count',
    canonicalMetric: 'hero_economy_daily_coins_awarded',
    extractionSource: 'server-extractable',
    queryPattern: "SELECT COUNT(*) FROM event_log WHERE system_id = 'hero-mode' AND event_type = 'hero.coins.awarded'",
    description: 'Coin award events logged in event_log',
  },
  {
    id: 'launch-11',
    name: 'duplicate prevention count',
    canonicalMetric: 'hero_economy_duplicate_award_prevented',
    extractionSource: 'server-extractable',
    queryPattern: "SELECT COUNT(*) FROM event_log WHERE system_id = 'hero-mode' AND event_type = 'hero.coins.duplicate-prevented'",
    description: 'Duplicate coin award prevention events',
  },
  {
    id: 'launch-12',
    name: 'Camp open count',
    canonicalMetric: 'hero_camp_opened',
    extractionSource: 'client-only',
    queryPattern: null,
    description: 'Client-side Camp screen open event',
  },
  {
    id: 'launch-13',
    name: 'Camp invite count',
    canonicalMetric: 'hero_camp_monster_invited',
    extractionSource: 'server-extractable',
    queryPattern: "SELECT COUNT(*) FROM event_log WHERE system_id = 'hero-mode' AND event_type = 'hero.camp.monster.invited'",
    description: 'Monster invitation events in event_log',
  },
  {
    id: 'launch-14',
    name: 'Camp grow count',
    canonicalMetric: 'hero_camp_monster_grown',
    extractionSource: 'server-extractable',
    queryPattern: "SELECT COUNT(*) FROM event_log WHERE system_id = 'hero-mode' AND event_type = 'hero.camp.monster.grown'",
    description: 'Monster growth events in event_log',
  },
  {
    id: 'launch-15',
    name: 'Camp insufficient count',
    canonicalMetric: 'hero_camp_insufficient_coins',
    extractionSource: 'client-only',
    queryPattern: null,
    description: 'Client-side insufficient-coins feedback shown to learner',
  },
  {
    id: 'launch-16',
    name: 'rollback-hidden checks',
    canonicalMetric: 'hero_tech_flag_misconfiguration',
    extractionSource: 'server-extractable',
    queryPattern: "SELECT COUNT(*) FROM event_log WHERE system_id = 'hero-mode' AND event_type = 'hero.rollback.check'",
    description: 'Rollback-hidden feature flag verification checks',
  },
  {
    id: 'launch-17',
    name: 'non-cohort exposure checks',
    canonicalMetric: null,
    extractionSource: 'server-extractable',
    queryPattern: "SELECT COUNT(*) FROM event_log WHERE system_id = 'hero-mode' AND event_type = 'hero.non-cohort.exposure-check'",
    description: 'Verification that non-cohort learners are not exposed to Hero Mode',
  },
  {
    id: 'launch-18',
    name: 'Hero route error count',
    canonicalMetric: 'hero_tech_asset_load_error',
    extractionSource: 'server-extractable',
    queryPattern: "SELECT COUNT(*) FROM event_log WHERE system_id = 'hero-mode' AND event_type LIKE 'hero.route.error%'",
    description: 'Hero-specific route 4xx/5xx errors logged server-side',
  },
]);

// ── Required Safety Metrics (§13.3 — 10 total) ────────────────────────

export const REQUIRED_SAFETY_METRICS = Object.freeze([
  {
    id: 'safety-01',
    name: 'duplicate daily award count',
    canonicalMetric: 'hero_economy_duplicate_award_prevented',
    extractionSource: 'server-extractable',
    queryPattern: "SELECT COUNT(*) FROM event_log WHERE system_id = 'hero-mode' AND event_type = 'hero.coins.duplicate-prevented'",
    zeroTolerance: true,
    description: 'Must be 0: no learner receives more than one daily coin award per day',
  },
  {
    id: 'safety-02',
    name: 'duplicate Camp debit count',
    canonicalMetric: 'hero_camp_duplicate_spend_prevented',
    extractionSource: 'server-extractable',
    queryPattern: "SELECT COUNT(*) FROM event_log WHERE system_id = 'hero-mode' AND event_type = 'hero.camp.duplicate-spend'",
    zeroTolerance: true,
    description: 'Must be 0: no double-debit from Camp spending',
  },
  {
    id: 'safety-03',
    name: 'negative balance count',
    canonicalMetric: null,
    extractionSource: 'derived',
    queryPattern: "SELECT COUNT(*) FROM hero_ledger WHERE balance < 0",
    zeroTolerance: true,
    description: 'Must be 0: ledger balance must never go negative',
  },
  {
    id: 'safety-04',
    name: 'dead CTA count',
    canonicalMetric: null,
    extractionSource: 'client-only',
    queryPattern: null,
    zeroTolerance: true,
    description: 'Must be 0 or explained: call-to-action buttons that lead nowhere',
  },
  {
    id: 'safety-05',
    name: 'claim-without-completion count',
    canonicalMetric: null,
    extractionSource: 'derived',
    queryPattern: "SELECT COUNT(*) FROM hero_ledger l LEFT JOIN event_log e ON l.source_event_id = e.id WHERE e.id IS NULL AND l.entry_type = 'daily-award'",
    zeroTolerance: true,
    description: 'Must be 0: coin award without corresponding task completion evidence',
  },
  {
    id: 'safety-06',
    name: 'non-cohort exposure count',
    canonicalMetric: null,
    extractionSource: 'server-extractable',
    queryPattern: "SELECT COUNT(*) FROM event_log WHERE system_id = 'hero-mode' AND learner_id NOT IN (SELECT learner_id FROM cohort_members WHERE cohort_id = ?)",
    zeroTolerance: true,
    description: 'Must be 0: non-cohort learners must never see Hero Mode surfaces',
  },
  {
    id: 'safety-07',
    name: 'raw child content violation count',
    canonicalMetric: null,
    extractionSource: 'server-extractable',
    queryPattern: "SELECT COUNT(*) FROM event_log WHERE system_id = 'hero-mode' AND (event_json LIKE '%rawAnswer%' OR event_json LIKE '%childFreeText%' OR event_json LIKE '%childName%')",
    zeroTolerance: true,
    description: 'Must be 0: no child-generated text in any telemetry payload',
  },
  {
    id: 'safety-08',
    name: 'subject Star/mastery drift attributable to Hero Mode',
    canonicalMetric: 'hero_learning_mastery_inflation_flag',
    extractionSource: 'derived',
    queryPattern: null,
    zeroTolerance: false,
    description: 'Measured via pre/post comparison of child_subject_state; acceptable if within epsilon',
  },
  {
    id: 'safety-09',
    name: 'Hero route 4xx/5xx rates',
    canonicalMetric: 'hero_tech_asset_load_error',
    extractionSource: 'server-extractable',
    queryPattern: "SELECT event_type, COUNT(*) FROM event_log WHERE system_id = 'hero-mode' AND event_type LIKE 'hero.route.error%' GROUP BY event_type",
    zeroTolerance: false,
    description: 'Route error rates — must be below SLA threshold',
  },
  {
    id: 'safety-10',
    name: 'rollback rehearsal result',
    canonicalMetric: 'hero_tech_flag_misconfiguration',
    extractionSource: 'server-extractable',
    queryPattern: "SELECT * FROM event_log WHERE system_id = 'hero-mode' AND event_type = 'hero.rollback.rehearsal' ORDER BY created_at DESC LIMIT 1",
    zeroTolerance: false,
    description: 'Most recent rollback rehearsal must show success',
  },
]);

// ── Validation function ────────────────────────────────────────────────

/**
 * Validate that all required metrics can be mapped to canonical metric names
 * or extraction query patterns.
 *
 * @param {object} metricsContract - Object containing ALL_HERO_METRICS array
 * @returns {{
 *   valid: boolean,
 *   launchMetrics: Array<{id: string, name: string, mapped: boolean, extractionSource: string, reason?: string}>,
 *   safetyMetrics: Array<{id: string, name: string, mapped: boolean, extractionSource: string, reason?: string}>,
 *   summary: {total: number, mapped: number, serverExtractable: number, clientOnly: number, derived: number}
 * }}
 */
export function validateMetricsMapping(metricsContract) {
  const allCanonical = metricsContract?.ALL_HERO_METRICS || ALL_HERO_METRICS;

  function classifyMetric(metric) {
    let mapped;
    if (metric.canonicalMetric) {
      mapped = allCanonical.includes(metric.canonicalMetric);
    } else {
      // Metrics without a canonical name are valid if they have a queryPattern,
      // are derived from other metrics, or are classified as client-only (measured
      // via browser telemetry rather than event_log).
      mapped = metric.queryPattern !== null
        || metric.extractionSource === 'derived'
        || metric.extractionSource === 'client-only';
    }

    const reason = !mapped
      ? `Canonical metric '${metric.canonicalMetric}' not found in metrics-contract.js`
      : undefined;

    return {
      id: metric.id,
      name: metric.name,
      mapped,
      extractionSource: metric.extractionSource,
      canonicalMetric: metric.canonicalMetric || null,
      queryPattern: metric.queryPattern || null,
      zeroTolerance: metric.zeroTolerance || false,
      reason,
    };
  }

  const launchMetrics = REQUIRED_LAUNCH_METRICS.map(classifyMetric);
  const safetyMetrics = REQUIRED_SAFETY_METRICS.map(classifyMetric);

  const allResults = [...launchMetrics, ...safetyMetrics];
  const mapped = allResults.filter(r => r.mapped).length;
  const serverExtractable = allResults.filter(r => r.extractionSource === 'server-extractable').length;
  const clientOnly = allResults.filter(r => r.extractionSource === 'client-only').length;
  const derived = allResults.filter(r => r.extractionSource === 'derived').length;

  return {
    valid: allResults.every(r => r.mapped),
    launchMetrics,
    safetyMetrics,
    summary: {
      total: allResults.length,
      mapped,
      serverExtractable,
      clientOnly,
      derived,
    },
  };
}

// ── Extraction output format (9-column provenance pattern) ─────────────

/**
 * Format a metric extraction result in the 9-column provenance pattern:
 * [metricId, name, value, extractionSource, queryPattern, canonicalMetric, timestamp, cohortId, confidence]
 *
 * @param {object} metric - metric definition from REQUIRED_LAUNCH_METRICS or REQUIRED_SAFETY_METRICS
 * @param {number|null} value - extracted value (null if pre-cohort / not yet emitted)
 * @param {string} cohortId - cohort identifier
 * @param {string} confidence - confidence classification
 * @returns {Array} 9-column provenance row
 */
export function formatExtractionRow(metric, value, cohortId, confidence) {
  return [
    metric.id,
    metric.name,
    value,
    metric.extractionSource,
    metric.queryPattern || null,
    metric.canonicalMetric || null,
    new Date().toISOString(),
    cohortId,
    confidence,
  ];
}

/**
 * For pre-cohort metrics (not yet emitted), return null value with explanation.
 * @param {object} metric
 * @returns {{ value: null, explanation: string }}
 */
export function preCohortResult(metric) {
  return {
    value: null,
    explanation: `Metric '${metric.name}' not yet emitted — cohort has not launched. Source: ${metric.extractionSource}`,
  };
}

// ── Main (CLI execution) ──────────────────────────────────────────────

function main() {
  console.log('Hero Mode pA4 — Metrics Infrastructure Validation');
  console.log('='.repeat(55));

  const result = validateMetricsMapping({ ALL_HERO_METRICS });

  console.log(`\nLaunch Metrics (§13.1): ${REQUIRED_LAUNCH_METRICS.length}`);
  console.log(`Safety Metrics (§13.3): ${REQUIRED_SAFETY_METRICS.length}`);
  console.log(`\nSummary:`);
  console.log(`  Total:              ${result.summary.total}`);
  console.log(`  Mapped:             ${result.summary.mapped}`);
  console.log(`  Server-extractable: ${result.summary.serverExtractable}`);
  console.log(`  Client-only:        ${result.summary.clientOnly}`);
  console.log(`  Derived:            ${result.summary.derived}`);

  if (!result.valid) {
    console.log('\n[FAIL] Not all metrics are mapped:');
    const unmapped = [...result.launchMetrics, ...result.safetyMetrics].filter(m => !m.mapped);
    for (const m of unmapped) {
      console.log(`  - ${m.id} (${m.name}): ${m.reason}`);
    }
    process.exit(1);
  }

  console.log('\n[PASS] All 28 metrics are mapped to extraction sources.');

  // Report client-only metrics (informational)
  const clientMetrics = [...result.launchMetrics, ...result.safetyMetrics].filter(m => m.extractionSource === 'client-only');
  if (clientMetrics.length > 0) {
    console.log(`\nClient-only metrics (${clientMetrics.length} — require browser telemetry, not event_log):`);
    for (const m of clientMetrics) {
      console.log(`  - ${m.id}: ${m.name}`);
    }
  }

  // Report zero-tolerance safety metrics
  const zeroToleranceMetrics = result.safetyMetrics.filter(m => m.zeroTolerance);
  console.log(`\nZero-tolerance safety metrics (${zeroToleranceMetrics.length}):`);
  for (const m of zeroToleranceMetrics) {
    console.log(`  - ${m.id}: ${m.name}`);
  }

  process.exit(0);
}

const _scriptUrl = fileURLToPath(import.meta.url);
const _invokedAs = process.argv[1] ? resolve(process.argv[1]) : '';
if (_scriptUrl === _invokedAs) {
  main();
}
