#!/usr/bin/env node
// Hero Mode pA3 — Goal 6 telemetry extraction.
// Reads D1 event_log (local sqlite via better-sqlite3) for hero-mode events,
// extracts 16 Goal 6 signals, privacy-validates every row, and outputs a
// structured JSON report with confidence classification.
//
// Usage: node scripts/hero-pA3-telemetry-extract.mjs \
//   --db-path ./local.sqlite \
//   --learner-ids id1,id2 \
//   --date-from 2026-04-01 \
//   --date-to 2026-04-30 \
//   --output reports/hero/hero-pA3-telemetry-report.json \
//   --format json
//
// Key constraint: NEVER imports from worker/src/ — only from shared/hero/.

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateMetricPrivacyRecursive,
  stripPrivacyFields,
} from '../shared/hero/metrics-privacy.js';
import { classifyConfidence } from '../shared/hero/confidence.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT = resolve(__dirname, '../reports/hero/hero-pA3-telemetry-report.json');

// ── CLI argument parsing ────────────────────────────────────────────

export function parseArgs(argv) {
  const args = {
    dbPath: null,
    learnerIds: null,
    dateFrom: null,
    dateTo: null,
    output: DEFAULT_OUTPUT,
    format: 'json',
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === '--db-path') && argv[i + 1]) {
      args.dbPath = resolve(argv[++i]);
    } else if (arg.startsWith('--db-path=')) {
      args.dbPath = resolve(arg.slice('--db-path='.length));
    } else if ((arg === '--learner-ids') && argv[i + 1]) {
      args.learnerIds = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    } else if (arg.startsWith('--learner-ids=')) {
      args.learnerIds = arg.slice('--learner-ids='.length).split(',').map(s => s.trim()).filter(Boolean);
    } else if ((arg === '--date-from') && argv[i + 1]) {
      args.dateFrom = argv[++i];
    } else if (arg.startsWith('--date-from=')) {
      args.dateFrom = arg.slice('--date-from='.length);
    } else if ((arg === '--date-to') && argv[i + 1]) {
      args.dateTo = argv[++i];
    } else if (arg.startsWith('--date-to=')) {
      args.dateTo = arg.slice('--date-to='.length);
    } else if ((arg === '--output') && argv[i + 1]) {
      args.output = resolve(argv[++i]);
    } else if (arg.startsWith('--output=')) {
      args.output = resolve(arg.slice('--output='.length));
    } else if ((arg === '--format') && argv[i + 1]) {
      args.format = argv[++i];
    } else if (arg.startsWith('--format=')) {
      args.format = arg.slice('--format='.length);
    }
  }

  return args;
}

// ── Confidence classification (imported from shared/hero/confidence.js) ──
// Re-export for backward-compatible test imports
export { classifyConfidence };

// ── Privacy validation ──────────────────────────────────────────────

/**
 * Validate all rows' event_json for privacy compliance.
 * @param {Array<{eventJson: object|null}>} parsedRows
 * @returns {{ passed: boolean, rowsChecked: number, violations: Array<{rowIndex: number, violations: string[]}> }}
 */
export function validateAllRowsPrivacy(parsedRows) {
  const result = { passed: true, rowsChecked: 0, violations: [] };

  for (let i = 0; i < parsedRows.length; i++) {
    const row = parsedRows[i];
    if (!row.eventJson || typeof row.eventJson !== 'object') continue;
    result.rowsChecked++;
    const check = validateMetricPrivacyRecursive(row.eventJson);
    if (!check.valid) {
      result.passed = false;
      result.violations.push({ rowIndex: i, violations: check.violations });
    }
  }

  return result;
}

// ── Row parsing ─────────────────────────────────────────────────────

/**
 * Parse raw DB rows into structured objects with parsed event_json.
 * Malformed event_json is gracefully set to null (row skipped from signal extraction).
 */
export function parseRows(rawRows) {
  return rawRows.map((row) => {
    let eventJson = null;
    try {
      eventJson = row.event_json ? JSON.parse(row.event_json) : null;
    } catch {
      eventJson = null;
    }
    // Defence-in-depth: strip forbidden fields before any aggregation/processing
    const cleanedJson = eventJson ? stripPrivacyFields(eventJson) : null;
    return {
      id: row.id,
      learnerId: row.learner_id,
      subjectId: row.subject_id,
      systemId: row.system_id,
      eventType: row.event_type,
      eventJson: cleanedJson,
      createdAt: row.created_at,
    };
  });
}

// ── Signal extraction functions ─────────────────────────────────────

/**
 * Signal 1: Hero Quest card shown (count).
 * This is a client-side event — NOT written to event_log.
 */
export function extractQuestShown(rows) {
  // Client-side only — not measurable from event_log
  return { count: 0, measurable: false };
}

/**
 * Signal 2: Hero Quest start rate (started / shown).
 * "Started" approximated by first task.completed per unique dateKey+learnerId.
 * "Shown" is client-side — rate not computable.
 */
export function extractQuestStartRate(rows) {
  // Approximate quest starts: unique (learner, dateKey) combos with a task.completed
  const taskRows = rows.filter(r => r.eventType === 'hero.task.completed');
  const starts = new Set();
  for (const r of taskRows) {
    const dateKey = r.eventJson?.data?.dateKey || r.eventJson?.dateKey || (r.createdAt ? r.createdAt.slice(0, 10) : '');
    starts.add(`${r.learnerId}|${dateKey}`);
  }
  return { started: starts.size, shown: 0, value: 0, measurable: false };
}

/**
 * Signal 3: First task start rate.
 * Same limitation as signal 2 — "started" requires client-side event.
 * We can count unique learner-days with at least one task.completed.
 */
export function extractFirstTaskStartRate(rows) {
  const taskRows = rows.filter(r => r.eventType === 'hero.task.completed');
  const learnerDays = new Set();
  for (const r of taskRows) {
    const dateKey = r.eventJson?.data?.dateKey || r.eventJson?.dateKey || (r.createdAt ? r.createdAt.slice(0, 10) : '');
    learnerDays.add(`${r.learnerId}|${dateKey}`);
  }
  return { learnerDaysWithTask: learnerDays.size, measurable: false };
}

/**
 * Signal 4: Task completion rate (completed / started).
 * We can count completed tasks from event_log. Started requires client data.
 */
export function extractTaskCompletionRate(rows) {
  const completed = rows.filter(r => r.eventType === 'hero.task.completed').length;
  return { completed, started: 0, value: 0, measurable: false, note: 'started requires client-side event' };
}

/**
 * Signal 5: Daily Hero Quest completion rate.
 * Measurable: count daily.completed events vs unique learner-day sessions.
 */
export function extractDailyCompletionRate(rows) {
  const dailyCompleted = rows.filter(r => r.eventType === 'hero.daily.completed').length;
  const taskRows = rows.filter(r => r.eventType === 'hero.task.completed');
  const learnerDays = new Set();
  for (const r of taskRows) {
    const dateKey = r.eventJson?.data?.dateKey || r.eventJson?.dateKey || (r.createdAt ? r.createdAt.slice(0, 10) : '');
    learnerDays.add(`${r.learnerId}|${dateKey}`);
  }
  const sessionsStarted = learnerDays.size;
  const value = sessionsStarted > 0 ? Math.round((dailyCompleted / sessionsStarted) * 1000) / 1000 : 0;
  return { dailyCompleted, sessionsStarted, value, confidence: classifyConfidence(sessionsStarted) };
}

/**
 * Signal 6: Abandonment reason categories.
 * Requires session-level telemetry (client-side). Not in event_log.
 */
export function extractAbandonmentReasons(rows) {
  return { categories: {}, measurable: false };
}

/**
 * Signal 7: Subject mix distribution.
 * Measurable from task.completed events' subjectId.
 */
export function extractSubjectMix(rows) {
  const taskRows = rows.filter(r => r.eventType === 'hero.task.completed');
  const distribution = {};
  for (const r of taskRows) {
    const subjectId = r.subjectId || r.eventJson?.data?.subjectId || r.eventJson?.subjectId || 'unknown';
    distribution[subjectId] = (distribution[subjectId] || 0) + 1;
  }
  const total = taskRows.length;
  return { distribution, total, confidence: classifyConfidence(total) };
}

/**
 * Signal 8: Task intent distribution (weak-repair, due-review, retention-after-secure, breadth-maintenance).
 * Derived from event_json data fields where intent is recorded.
 */
export function extractTaskIntentDistribution(rows) {
  const taskRows = rows.filter(r => r.eventType === 'hero.task.completed');
  const distribution = {};
  for (const r of taskRows) {
    const intent = r.eventJson?.data?.intent || r.eventJson?.heroTaskIntent || r.eventJson?.intent || 'unknown';
    distribution[intent] = (distribution[intent] || 0) + 1;
  }
  const total = taskRows.length;
  return { distribution, total, confidence: classifyConfidence(total) };
}

/**
 * Signal 9: Claim success and rejection reasons.
 * Successes = task.completed count. Rejections require structured logging (not in event_log).
 */
export function extractClaimSuccessAndRejections(rows) {
  const successes = rows.filter(r => r.eventType === 'hero.task.completed').length;
  return { successes, rejections: 0, rejectionReasons: {}, measurable: false, note: 'rejections logged to structured console, not event_log' };
}

/**
 * Signal 10: Duplicate-claim prevention count.
 * Not directly in event_log (ON CONFLICT DO NOTHING is silent).
 * However coin duplicate prevention IS logged.
 */
export function extractDuplicateClaimPrevention(rows) {
  // Coin duplicates are detectable via coins.awarded duplicate prevention (in console logs only)
  return { count: 0, measurable: false, note: 'ON CONFLICT DO NOTHING is silent in event_log' };
}

/**
 * Signal 11: Daily coin award count and duplicate-award prevention count.
 * Measurable: coins.awarded events in event_log.
 */
export function extractCoinAwards(rows) {
  const coinRows = rows.filter(r => r.eventType === 'hero.coins.awarded');
  const totalAwarded = coinRows.length;
  const amounts = coinRows.map(r => r.eventJson?.amount || 0);
  const totalCoins = amounts.reduce((a, b) => a + b, 0);
  // Duplicate prevention is not in event_log (console-only signal)
  return {
    awardCount: totalAwarded,
    totalCoins,
    duplicatePreventionCount: 0,
    duplicatePreventionMeasurable: false,
    confidence: classifyConfidence(totalAwarded),
  };
}

/**
 * Signal 12: Camp events — open, invite, grow, insufficient-coins, duplicate-spend.
 * Invite and grow are in event_log. Others are console-only.
 */
export function extractCampEvents(rows) {
  const invited = rows.filter(r => r.eventType === 'hero.camp.monster.invited').length;
  const grown = rows.filter(r => r.eventType === 'hero.camp.monster.grown').length;
  return {
    invited,
    grown,
    opened: 0,
    insufficientCoins: 0,
    duplicateSpend: 0,
    openedMeasurable: false,
    insufficientCoinsMeasurable: false,
    duplicateSpendMeasurable: false,
    confidence: classifyConfidence(invited + grown),
  };
}

/**
 * Signal 13: Extra subject practice after daily coin cap.
 * Requires session-level timing data. Tasks after daily.completed could approximate.
 */
export function extractExtraPracticeAfterCap(rows) {
  // Approximate: tasks completed AFTER daily.completed for same learner+date
  const dailyCompletedSet = new Map(); // learnerId|date -> created_at
  for (const r of rows) {
    if (r.eventType === 'hero.daily.completed') {
      const dateKey = r.eventJson?.data?.dateKey || r.eventJson?.dateKey || (r.createdAt ? r.createdAt.slice(0, 10) : '');
      const key = `${r.learnerId}|${dateKey}`;
      if (!dailyCompletedSet.has(key) || r.createdAt < dailyCompletedSet.get(key)) {
        dailyCompletedSet.set(key, r.createdAt);
      }
    }
  }

  let extraTaskCount = 0;
  for (const r of rows) {
    if (r.eventType === 'hero.task.completed') {
      const dateKey = r.eventJson?.data?.dateKey || r.eventJson?.dateKey || (r.createdAt ? r.createdAt.slice(0, 10) : '');
      const key = `${r.learnerId}|${dateKey}`;
      const completedAt = dailyCompletedSet.get(key);
      if (completedAt && r.createdAt > completedAt) {
        extraTaskCount++;
      }
    }
  }

  return { extraTaskCount, measurable: extraTaskCount > 0 || dailyCompletedSet.size > 0, confidence: classifyConfidence(dailyCompletedSet.size) };
}

/**
 * Signal 14: Signs of rushing/skipping/reward farming/too-fast completion.
 * Requires timing analysis. Approximate via tasks-per-minute within same session.
 */
export function extractRushingSignals(rows) {
  // Group tasks by learner+date, check for suspiciously rapid claims
  const taskRows = rows.filter(r => r.eventType === 'hero.task.completed' && r.createdAt);
  const byLearnerDate = {};
  for (const r of taskRows) {
    const dateKey = r.eventJson?.data?.dateKey || r.eventJson?.dateKey || (r.createdAt ? r.createdAt.slice(0, 10) : '');
    const key = `${r.learnerId}|${dateKey}`;
    if (!byLearnerDate[key]) byLearnerDate[key] = [];
    byLearnerDate[key].push(r.createdAt);
  }

  let suspiciousSessionCount = 0;
  const RAPID_THRESHOLD_MS = 30_000; // 30 seconds between tasks is suspicious

  for (const timestamps of Object.values(byLearnerDate)) {
    if (timestamps.length < 2) continue;
    const sorted = [...timestamps].sort();
    for (let i = 1; i < sorted.length; i++) {
      const gap = new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime();
      if (gap > 0 && gap < RAPID_THRESHOLD_MS) {
        suspiciousSessionCount++;
        break;
      }
    }
  }

  return {
    suspiciousSessionCount,
    sessionsAnalysed: Object.keys(byLearnerDate).length,
    confidence: classifyConfidence(Object.keys(byLearnerDate).length),
  };
}

/**
 * Signal 15: Subject Stars and mastery drift (before/after Hero sessions).
 * Requires child_subject_state table comparison — not available in event_log.
 */
export function extractMasteryDrift(rows) {
  return { measurable: false, note: 'requires child_subject_state table comparison' };
}

/**
 * Signal 16: Privacy validation — no raw child content in any telemetry path.
 * This is handled by validateAllRowsPrivacy above; included here for completeness.
 */
export function extractPrivacyCompliance(parsedRows) {
  return validateAllRowsPrivacy(parsedRows);
}

// ── Assemble full report ────────────────────────────────────────────

export function assembleReport(parsedRows, args) {
  const privacyResult = extractPrivacyCompliance(parsedRows);

  // If privacy fails, return error report
  if (!privacyResult.passed) {
    return {
      extractedAt: new Date().toISOString(),
      dateRange: { from: args.dateFrom || null, to: args.dateTo || null },
      learnerIds: args.learnerIds || [],
      error: 'privacy-violation',
      privacyValidation: privacyResult,
      signals: null,
    };
  }

  const totalEvents = parsedRows.length;

  const signals = {
    questShown: {
      ...extractQuestShown(parsedRows),
      confidence: 'insufficient',
    },
    questStartRate: {
      ...extractQuestStartRate(parsedRows),
      confidence: 'insufficient',
    },
    firstTaskStartRate: {
      ...extractFirstTaskStartRate(parsedRows),
      confidence: 'insufficient',
    },
    taskCompletionRate: {
      ...extractTaskCompletionRate(parsedRows),
      confidence: 'insufficient',
    },
    dailyCompletionRate: extractDailyCompletionRate(parsedRows),
    abandonmentReasons: {
      ...extractAbandonmentReasons(parsedRows),
      confidence: 'insufficient',
    },
    subjectMix: extractSubjectMix(parsedRows),
    taskIntentDistribution: extractTaskIntentDistribution(parsedRows),
    claimSuccessAndRejections: {
      ...extractClaimSuccessAndRejections(parsedRows),
      confidence: classifyConfidence(parsedRows.filter(r => r.eventType === 'hero.task.completed').length),
    },
    duplicateClaimPrevention: {
      ...extractDuplicateClaimPrevention(parsedRows),
      confidence: 'insufficient',
    },
    coinAwards: extractCoinAwards(parsedRows),
    campEvents: extractCampEvents(parsedRows),
    extraPracticeAfterCap: extractExtraPracticeAfterCap(parsedRows),
    rushingSignals: extractRushingSignals(parsedRows),
    masteryDrift: {
      ...extractMasteryDrift(parsedRows),
      confidence: 'insufficient',
    },
    privacyCompliance: {
      passed: privacyResult.passed,
      rowsChecked: privacyResult.rowsChecked,
      confidence: 'high',
    },
  };

  const unmeasurable = [
    { signal: 'questShown', reason: 'Hero Quest card shown is a client-side render event — not written to event_log' },
    { signal: 'questStartRate', reason: 'Quest "shown" denominator requires client-side telemetry' },
    { signal: 'firstTaskStartRate', reason: 'Task "started" (before completion) is client-side only' },
    { signal: 'taskCompletionRate', reason: 'Task "started" denominator requires client-side event' },
    { signal: 'abandonmentReasons', reason: 'Abandonment categories require session-level client telemetry' },
    { signal: 'duplicateClaimPrevention', reason: 'ON CONFLICT DO NOTHING is silent — dedup count not persisted' },
    { signal: 'masteryDrift', reason: 'Requires child_subject_state table comparison pre/post Hero sessions' },
  ];

  const warnings = [];
  if (totalEvents === 0) {
    warnings.push('No hero-mode events found in the specified range');
  }
  if (totalEvents < 10) {
    warnings.push(`Only ${totalEvents} events found — most signals will have insufficient confidence`);
  }

  return {
    extractedAt: new Date().toISOString(),
    dateRange: { from: args.dateFrom || null, to: args.dateTo || null },
    learnerIds: args.learnerIds || [],
    totalEvents,
    signals,
    privacyValidation: { passed: true, rowsChecked: privacyResult.rowsChecked },
    unmeasurable,
    warnings,
  };
}

// ── Database query ──────────────────────────────────────────────────

function buildQuery(args) {
  let sql = `SELECT id, learner_id, subject_id, system_id, event_type, event_json, created_at
    FROM event_log WHERE system_id = 'hero-mode'`;
  const params = [];

  if (args.learnerIds && args.learnerIds.length > 0) {
    const placeholders = args.learnerIds.map(() => '?').join(',');
    sql += ` AND learner_id IN (${placeholders})`;
    params.push(...args.learnerIds);
  }
  if (args.dateFrom) {
    sql += ` AND created_at >= ?`;
    params.push(args.dateFrom);
  }
  if (args.dateTo) {
    sql += ` AND created_at <= ?`;
    params.push(args.dateTo + 'T23:59:59.999Z');
  }

  sql += ` ORDER BY created_at ASC`;
  return { sql, params };
}

// ── Format output ───────────────────────────────────────────────────

function formatMarkdown(report) {
  let md = `# Hero Mode pA3 — Goal 6 Telemetry Report\n\n`;
  md += `**Extracted:** ${report.extractedAt}\n`;
  md += `**Date range:** ${report.dateRange.from || 'all'} to ${report.dateRange.to || 'all'}\n`;
  md += `**Total events:** ${report.totalEvents || 0}\n\n`;

  if (report.error) {
    md += `## ERROR: ${report.error}\n\n`;
    md += `Privacy violations found. Cannot produce signal report.\n`;
    return md;
  }

  md += `---\n\n## Measurable Signals\n\n`;
  md += `| Signal | Value | Confidence |\n|--------|-------|------------|\n`;

  const s = report.signals;
  md += `| Daily completion rate | ${s.dailyCompletionRate.value} (${s.dailyCompletionRate.dailyCompleted}/${s.dailyCompletionRate.sessionsStarted}) | ${s.dailyCompletionRate.confidence} |\n`;
  md += `| Subject mix | ${s.subjectMix.total} tasks across ${Object.keys(s.subjectMix.distribution).length} subjects | ${s.subjectMix.confidence} |\n`;
  md += `| Task intent | ${s.taskIntentDistribution.total} tasks, ${Object.keys(s.taskIntentDistribution.distribution).length} intents | ${s.taskIntentDistribution.confidence} |\n`;
  md += `| Claim successes | ${s.claimSuccessAndRejections.successes} | ${s.claimSuccessAndRejections.confidence} |\n`;
  md += `| Coin awards | ${s.coinAwards.awardCount} (${s.coinAwards.totalCoins} coins) | ${s.coinAwards.confidence} |\n`;
  md += `| Camp invited | ${s.campEvents.invited} | ${s.campEvents.confidence} |\n`;
  md += `| Camp grown | ${s.campEvents.grown} | ${s.campEvents.confidence} |\n`;
  md += `| Extra practice after cap | ${s.extraPracticeAfterCap.extraTaskCount} tasks | ${s.extraPracticeAfterCap.confidence} |\n`;
  md += `| Rushing signals | ${s.rushingSignals.suspiciousSessionCount}/${s.rushingSignals.sessionsAnalysed} sessions | ${s.rushingSignals.confidence} |\n`;
  md += `| Privacy compliance | ${s.privacyCompliance.passed ? 'PASSED' : 'FAILED'} (${s.privacyCompliance.rowsChecked} rows) | ${s.privacyCompliance.confidence} |\n`;

  md += `\n---\n\n## Unmeasurable Signals\n\n`;
  for (const u of report.unmeasurable) {
    md += `- **${u.signal}**: ${u.reason}\n`;
  }

  if (report.warnings.length > 0) {
    md += `\n---\n\n## Warnings\n\n`;
    for (const w of report.warnings) {
      md += `- ${w}\n`;
    }
  }

  md += `\n---\n\n*Generated by hero-pA3-telemetry-extract.mjs*\n`;
  return md;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  console.log('Hero Mode pA3 — Goal 6 Telemetry Extraction');
  console.log(`DB path: ${args.dbPath || '(not specified)'}`);
  console.log(`Output: ${args.output}`);
  console.log(`Format: ${args.format}`);
  console.log('---');

  if (!args.dbPath) {
    console.log('No --db-path specified. Generating empty report.');
    const emptyReport = assembleReport([], args);
    writeOutput(emptyReport, args);
    return;
  }

  if (!existsSync(args.dbPath)) {
    console.log(`Database file not found: ${args.dbPath}. Generating empty report.`);
    const emptyReport = assembleReport([], args);
    writeOutput(emptyReport, args);
    return;
  }

  // Dynamic import of better-sqlite3 with graceful fallback
  let Database;
  try {
    const mod = await import('better-sqlite3');
    Database = mod.default || mod;
  } catch (err) {
    console.log(`better-sqlite3 not available (${err.message}). Cannot read D1 database.`);
    console.log('Install with: npm install better-sqlite3');
    const emptyReport = assembleReport([], args);
    emptyReport.warnings.push('better-sqlite3 not installed — could not read database');
    writeOutput(emptyReport, args);
    return;
  }

  // Open database and query
  let rawRows;
  try {
    const db = new Database(args.dbPath, { readonly: true });
    const { sql, params } = buildQuery(args);
    rawRows = db.prepare(sql).all(...params);
    db.close();
  } catch (err) {
    console.log(`Database query failed: ${err.message}`);
    const emptyReport = assembleReport([], args);
    emptyReport.warnings.push(`Database query failed: ${err.message}`);
    writeOutput(emptyReport, args);
    return;
  }

  console.log(`Fetched ${rawRows.length} hero-mode events from event_log.`);

  // Parse rows
  const parsedRows = parseRows(rawRows);

  // Assemble report
  const report = assembleReport(parsedRows, args);

  // Write output
  writeOutput(report, args);
  console.log(`\nReport written to: ${args.output}`);
}

function writeOutput(report, args) {
  const outputDir = dirname(args.output);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const tmpPath = args.output + '.tmp';
  if (args.format === 'markdown') {
    writeFileSync(tmpPath, formatMarkdown(report), 'utf8');
  } else {
    writeFileSync(tmpPath, JSON.stringify(report, null, 2), 'utf8');
  }
  renameSync(tmpPath, args.output);
}

const _scriptUrl = fileURLToPath(import.meta.url);
const _invokedAs = process.argv[1] ? resolve(process.argv[1]) : '';
if (_scriptUrl === _invokedAs) {
  main().catch((err) => {
    console.error('Fatal:', err.message);
    process.exit(0); // Always exit 0 — report problems in output
  });
}
