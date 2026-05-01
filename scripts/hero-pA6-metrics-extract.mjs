#!/usr/bin/env node
// Hero Mode pA6 - schema-accurate production metrics extraction.
// Reads exported platform rows and classifies every production metric by real
// observability. event_log is telemetry only; Hero economy and Camp authority
// come from child_game_state state_json for system_id='hero-mode'.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateMetricPrivacyRecursive } from '../shared/hero/metrics-privacy.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT = resolve(__dirname, '../reports/hero/hero-pA6-metrics-report.json');

export const PA6_SOURCE_TYPES = Object.freeze([
  'observed-live',
  'schema-derived',
  'manual-support-log',
  'client-instrumented',
  'not-observable-yet',
]);

const FORBIDDEN_CONCEPTUAL_TABLES = /\b(cohort_members|hero_ledger)\b/i;

export const HERO_READY_SUBJECT_IDS = Object.freeze(['spelling', 'grammar', 'punctuation']);

export const PA6_METRIC_REGISTRY = Object.freeze([
  {
    id: 'pa6-launch-01',
    category: 'launch',
    name: 'eligible ready-subject learner count',
    sourceType: 'schema-derived',
    sourceTables: ['child_subject_state', 'account_learner_memberships'],
    extraction: 'Count distinct learners with ready-subject state rows; final launchability still requires smoke proof.',
  },
  {
    id: 'pa6-launch-02',
    category: 'launch',
    name: 'exposed account count',
    sourceType: 'schema-derived',
    sourceTables: ['event_log', 'account_learner_memberships'],
    extraction: 'Count distinct actor accounts from Hero telemetry and linked accounts for learners with Hero state.',
  },
  {
    id: 'pa6-launch-03',
    category: 'launch',
    name: 'Hero Quest shown count',
    sourceType: 'not-observable-yet',
    sourceTables: [],
    extraction: 'Requires client render telemetry or browser-smoke evidence; do not infer from registry presence.',
  },
  {
    id: 'pa6-launch-04',
    category: 'launch',
    name: 'Hero Quest start count',
    sourceType: 'schema-derived',
    sourceTables: ['child_game_state'],
    extraction: 'Count learner-days where Hero progress has firstStartedAt or at least one task started/completed.',
  },
  {
    id: 'pa6-launch-05',
    category: 'launch',
    name: 'Hero task start count',
    sourceType: 'schema-derived',
    sourceTables: ['child_game_state'],
    extraction: 'Count Hero tasks with status started or completed in the authoritative progress JSON.',
  },
  {
    id: 'pa6-launch-06',
    category: 'launch',
    name: 'Hero task completion count',
    sourceType: 'observed-live',
    sourceTables: ['event_log'],
    extraction: "Count event_log rows where system_id='hero-mode' and event_type='hero.task.completed'.",
  },
  {
    id: 'pa6-launch-07',
    category: 'launch',
    name: 'daily Hero Quest completion count',
    sourceType: 'schema-derived',
    sourceTables: ['child_game_state', 'event_log'],
    extraction: 'Use child_game_state daily.status=completed as authority, with event_log daily.completed as telemetry mirror.',
  },
  {
    id: 'pa6-launch-08',
    category: 'launch',
    name: 'claim success count',
    sourceType: 'observed-live',
    sourceTables: ['event_log'],
    extraction: "Current server mirror records successful claims as hero.task.completed events.",
  },
  {
    id: 'pa6-launch-09',
    category: 'launch',
    name: 'claim rejection count',
    sourceType: 'not-observable-yet',
    sourceTables: [],
    extraction: 'Current rejection paths are not persisted in a queryable production table.',
  },
  {
    id: 'pa6-launch-10',
    category: 'launch',
    name: 'coin award count',
    sourceType: 'schema-derived',
    sourceTables: ['child_game_state'],
    extraction: 'Count economy.ledger entries with type=daily-completion-award in Hero progress JSON.',
  },
  {
    id: 'pa6-launch-11',
    category: 'launch',
    name: 'Camp open count',
    sourceType: 'not-observable-yet',
    sourceTables: [],
    extraction: 'Camp screen opens are client-side only unless instrumented separately.',
  },
  {
    id: 'pa6-launch-12',
    category: 'launch',
    name: 'Camp invite/grow count',
    sourceType: 'schema-derived',
    sourceTables: ['child_game_state', 'event_log'],
    extraction: 'Use economy spending ledger and Hero Pool state as authority; use camp events as telemetry mirror.',
  },
  {
    id: 'pa6-launch-13',
    category: 'launch',
    name: 'Hero route 4xx count',
    sourceType: 'not-observable-yet',
    sourceTables: [],
    extraction: 'Requires Workers request logs or explicit persisted route-error telemetry.',
  },
  {
    id: 'pa6-launch-14',
    category: 'launch',
    name: 'Hero route 5xx count',
    sourceType: 'not-observable-yet',
    sourceTables: [],
    extraction: 'Requires Workers request logs or explicit persisted route-error telemetry.',
  },
  {
    id: 'pa6-product-01',
    category: 'product',
    name: 'start rate from shown',
    sourceType: 'not-observable-yet',
    sourceTables: [],
    extraction: 'The shown denominator requires client render telemetry. Use server-started counts only as a narrower decision substitute.',
  },
  {
    id: 'pa6-product-02',
    category: 'product',
    name: 'completion rate from server-started learner-days',
    sourceType: 'schema-derived',
    sourceTables: ['child_game_state'],
    extraction: 'daily.status=completed divided by learner-days with firstStartedAt or started/completed tasks.',
  },
  {
    id: 'pa6-product-03',
    category: 'product',
    name: 'next-day return rate',
    sourceType: 'observed-live',
    sourceTables: ['event_log'],
    extraction: 'Approximate from distinct learner-date pairs in Hero telemetry.',
  },
  {
    id: 'pa6-product-04',
    category: 'product',
    name: 'subject mix distribution',
    sourceType: 'observed-live',
    sourceTables: ['event_log'],
    extraction: 'Count subject_id on hero.task.completed telemetry rows.',
  },
  {
    id: 'pa6-product-05',
    category: 'product',
    name: 'task-intent mix',
    sourceType: 'schema-derived',
    sourceTables: ['child_game_state'],
    extraction: 'Count current Hero task intent values in authoritative progress JSON.',
  },
  {
    id: 'pa6-product-06',
    category: 'product',
    name: 'abandonment point distribution',
    sourceType: 'not-observable-yet',
    sourceTables: [],
    extraction: 'Requires client/session instrumentation beyond current Hero state and event mirror.',
  },
  {
    id: 'pa6-product-07',
    category: 'product',
    name: 'parent/support confusion reports',
    sourceType: 'manual-support-log',
    sourceTables: [],
    extraction: 'Count support-log rows in category=comprehension.',
  },
  {
    id: 'pa6-product-08',
    category: 'product',
    name: 'Camp-before-learning ratio',
    sourceType: 'observed-live',
    sourceTables: ['event_log'],
    extraction: 'Compare camp telemetry timestamps with daily.completed telemetry for the same learner-date.',
  },
  {
    id: 'pa6-product-09',
    category: 'product',
    name: 'extra subject practice after daily coin cap',
    sourceType: 'observed-live',
    sourceTables: ['event_log'],
    extraction: 'Count task.completed telemetry after daily.completed for the same learner-date.',
  },
  {
    id: 'pa6-product-10',
    category: 'product',
    name: 'warning-condition count',
    sourceType: 'schema-derived',
    sourceTables: ['child_game_state', 'event_log'],
    extraction: 'Derived from computed A6 warning checks plus manual support-log thresholds.',
  },
  {
    id: 'pa6-safety-01',
    category: 'safety',
    name: 'duplicate daily award',
    sourceType: 'schema-derived',
    sourceTables: ['child_game_state'],
    extraction: 'Group daily-completion-award ledger entries by learner/date/quest/idempotency key.',
  },
  {
    id: 'pa6-safety-02',
    category: 'safety',
    name: 'duplicate Camp debit',
    sourceType: 'schema-derived',
    sourceTables: ['child_game_state'],
    extraction: 'Group monster-invite and monster-grow ledger entries by learner/idempotency key.',
  },
  {
    id: 'pa6-safety-03',
    category: 'safety',
    name: 'negative balance',
    sourceType: 'schema-derived',
    sourceTables: ['child_game_state'],
    extraction: 'Inspect economy.balance and ledger balanceAfter values in Hero progress JSON; malformed Hero state fails closed as an inspection failure.',
  },
  {
    id: 'pa6-safety-04',
    category: 'safety',
    name: 'dead CTA',
    sourceType: 'not-observable-yet',
    sourceTables: [],
    extraction: 'Requires browser smoke or client instrumentation because dead navigation is not persisted.',
  },
  {
    id: 'pa6-safety-05',
    category: 'safety',
    name: 'claim without Worker-verified completion',
    sourceType: 'schema-derived',
    sourceTables: ['child_game_state', 'event_log'],
    extraction: 'Compare daily-award ledger entries with daily completion state and telemetry.',
  },
  {
    id: 'pa6-safety-06',
    category: 'safety',
    name: 'raw child content',
    sourceType: 'observed-live',
    sourceTables: ['event_log'],
    extraction: 'Run recursive privacy validation against event_json payloads; fail closed on malformed, missing, or non-object payloads.',
  },
  {
    id: 'pa6-safety-07',
    category: 'safety',
    name: 'subject Star/mastery drift attributable to Hero Mode',
    sourceType: 'not-observable-yet',
    sourceTables: ['child_subject_state'],
    extraction: 'Requires pre/post child_subject_state snapshots across the rollout window.',
  },
  {
    id: 'pa6-safety-08',
    category: 'safety',
    name: 'exposure to excluded accounts',
    sourceType: 'not-observable-yet',
    sourceTables: [],
    extraction: 'Requires resolver classification export or named smoke accounts; do not infer from event presence alone.',
  },
  {
    id: 'pa6-safety-09',
    category: 'safety',
    name: 'rollback failure',
    sourceType: 'manual-support-log',
    sourceTables: [],
    extraction: 'Recorded by rollback rehearsal evidence, not by normal Hero state rows.',
  },
  {
    id: 'pa6-safety-10',
    category: 'safety',
    name: 'production 5xx spike attributable to Hero',
    sourceType: 'not-observable-yet',
    sourceTables: [],
    extraction: 'Requires Workers request logs or explicit persisted route-error telemetry.',
  },
]);

export function assertNoConceptualTables(registry = PA6_METRIC_REGISTRY) {
  const offenders = [];
  for (const metric of registry) {
    const haystack = [
      metric.extraction,
      ...(metric.sourceTables || []),
      metric.queryPattern,
    ].filter(Boolean).join(' ');
    if (FORBIDDEN_CONCEPTUAL_TABLES.test(haystack)) {
      offenders.push(metric.id);
    }
  }
  return {
    ok: offenders.length === 0,
    offenders,
  };
}

function parseEventJson(value) {
  if (value == null || value === '') {
    return { value: null, parseError: false };
  }
  if (typeof value === 'object') {
    return { value, parseError: false };
  }
  if (typeof value !== 'string') {
    return { value: null, parseError: true };
  }

  try {
    const parsed = JSON.parse(value);
    return {
      value: parsed,
      parseError: !parsed || typeof parsed !== 'object',
    };
  } catch {
    return { value: null, parseError: true };
  }
}

function parseStateJson(value) {
  if (value == null || value === '') {
    return { value: {}, parseError: true };
  }
  if (typeof value === 'object') {
    return {
      value: value && !Array.isArray(value) ? value : {},
      parseError: !value || Array.isArray(value),
    };
  }
  if (typeof value !== 'string') {
    return { value: {}, parseError: true };
  }

  try {
    const parsed = JSON.parse(value);
    return {
      value: parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {},
      parseError: !parsed || typeof parsed !== 'object' || Array.isArray(parsed),
    };
  } catch {
    return { value: {}, parseError: true };
  }
}

function normaliseCreatedAt(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function dateKeyFromTimestamp(value) {
  const ts = normaliseCreatedAt(value);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString().slice(0, 10);
}

function getRows(input, snakeName, camelName) {
  const value = input?.[snakeName] || input?.[camelName] || [];
  return Array.isArray(value) ? value : [];
}

export function parseEventRows(rawRows = []) {
  return rawRows
    .map((row) => {
      const parsedEventJson = parseEventJson(row.event_json ?? row.eventJson);
      return {
        id: row.id || null,
        learnerId: row.learner_id ?? row.learnerId ?? null,
        subjectId: row.subject_id ?? row.subjectId ?? null,
        systemId: row.system_id ?? row.systemId ?? null,
        eventType: row.event_type ?? row.eventType ?? null,
        eventJson: parsedEventJson.value,
        eventJsonParseError: parsedEventJson.parseError,
        createdAt: row.created_at ?? row.createdAt ?? null,
        createdAtMs: normaliseCreatedAt(row.created_at ?? row.createdAt),
        actorAccountId: row.actor_account_id ?? row.actorAccountId ?? null,
      };
    })
    .filter((row) => row.systemId === 'hero-mode' || String(row.eventType || '').startsWith('hero.'));
}

export function parseHeroStateRows(rawRows = []) {
  return rawRows
    .filter((row) => (row.system_id ?? row.systemId) === 'hero-mode')
    .map((row) => {
      const parsedState = parseStateJson(row.state_json ?? row.stateJson);
      const rawState = parsedState.value;
      return {
        learnerId: row.learner_id ?? row.learnerId ?? null,
        updatedAt: row.updated_at ?? row.updatedAt ?? null,
        updatedAtMs: normaliseCreatedAt(row.updated_at ?? row.updatedAt),
        stateJsonParseError: parsedState.parseError,
        rawState,
        economy: rawState.economy && typeof rawState.economy === 'object' ? rawState.economy : {},
        heroPool: rawState.heroPool && typeof rawState.heroPool === 'object' ? rawState.heroPool : {},
        daily: rawState.daily && typeof rawState.daily === 'object' ? rawState.daily : null,
      };
    });
}

function allTasksFromState(stateRow) {
  const tasks = stateRow.daily?.tasks;
  if (!tasks || typeof tasks !== 'object') return [];
  return Object.values(tasks).filter((task) => task && typeof task === 'object');
}

function ledgerEntriesFromStates(stateRows) {
  const entries = [];
  for (const row of stateRows) {
    const ledger = Array.isArray(row.economy?.ledger) ? row.economy.ledger : [];
    for (const entry of ledger) {
      if (!entry || typeof entry !== 'object') continue;
      entries.push({
        ...entry,
        learnerId: entry.learnerId || row.learnerId,
      });
    }
  }
  return entries;
}

function countBy(rows, fn) {
  const counts = {};
  for (const row of rows) {
    const key = fn(row);
    if (!key) continue;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function countDuplicateGroups(keys) {
  const counts = countBy(keys, (key) => key);
  return Object.values(counts).filter((count) => count > 1).length;
}

function computePrivacy(events) {
  const violations = [];
  const parseFailures = [];
  const notEvaluatedRows = [];
  let checked = 0;
  for (let i = 0; i < events.length; i++) {
    if (events[i].eventJsonParseError) {
      parseFailures.push({
        rowIndex: i,
        eventId: events[i].id,
        reason: 'malformed-or-non-object-event-json',
      });
      continue;
    }
    const payload = events[i].eventJson;
    if (!payload || typeof payload !== 'object') {
      notEvaluatedRows.push({
        rowIndex: i,
        eventId: events[i].id,
        reason: 'missing-event-json',
      });
      continue;
    }
    checked++;
    const result = validateMetricPrivacyRecursive(payload);
    if (!result.valid) {
      violations.push({ rowIndex: i, eventId: events[i].id, violations: result.violations });
    }
  }
  const failureCount = violations.length + parseFailures.length + notEvaluatedRows.length;
  const status = events.length === 0
    ? 'not-evaluated'
    : (failureCount === 0 ? 'passed' : 'failed');
  return {
    passed: events.length === 0 ? null : failureCount === 0,
    status,
    rowsChecked: checked,
    violationCount: violations.length,
    parseErrorCount: parseFailures.length,
    notEvaluatedCount: notEvaluatedRows.length,
    failureCount,
    violations,
    parseFailures,
    notEvaluatedRows,
  };
}

function computeDateRange(events, stateRows) {
  const timestamps = [
    ...events.map((row) => row.createdAtMs),
    ...stateRows.map((row) => row.updatedAtMs),
  ].filter((ts) => Number.isFinite(ts));
  if (timestamps.length === 0) return { from: null, to: null };
  return {
    from: new Date(Math.min(...timestamps)).toISOString(),
    to: new Date(Math.max(...timestamps)).toISOString(),
  };
}

function computeNextDayReturnRate(events) {
  const byLearner = new Map();
  for (const event of events) {
    const day = event.eventJson?.data?.dateKey || event.eventJson?.dateKey || dateKeyFromTimestamp(event.createdAt);
    if (!event.learnerId || !day) continue;
    if (!byLearner.has(event.learnerId)) byLearner.set(event.learnerId, new Set());
    byLearner.get(event.learnerId).add(day);
  }

  let activeLearnerDays = 0;
  let returnNextDayCount = 0;
  for (const daySet of byLearner.values()) {
    const days = [...daySet].sort();
    activeLearnerDays += days.length;
    const lookup = new Set(days);
    for (const day of days) {
      const next = new Date(`${day}T00:00:00.000Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      if (lookup.has(next.toISOString().slice(0, 10))) {
        returnNextDayCount++;
      }
    }
  }

  return {
    activeLearnerDays,
    returnNextDayCount,
    rate: activeLearnerDays > 0 ? returnNextDayCount / activeLearnerDays : 0,
  };
}

function computeCampBeforeLearning(events) {
  const completedAtByLearnerDate = new Map();
  for (const event of events) {
    if (event.eventType !== 'hero.daily.completed') continue;
    const day = event.eventJson?.data?.dateKey || event.eventJson?.dateKey || dateKeyFromTimestamp(event.createdAt);
    if (!event.learnerId || !day || !Number.isFinite(event.createdAtMs)) continue;
    const key = `${event.learnerId}|${day}`;
    const existing = completedAtByLearnerDate.get(key);
    if (!Number.isFinite(existing) || event.createdAtMs < existing) {
      completedAtByLearnerDate.set(key, event.createdAtMs);
    }
  }

  const campEvents = events.filter((event) => (
    event.eventType === 'hero.camp.monster.invited' ||
    event.eventType === 'hero.camp.monster.grown'
  ));
  let beforeLearning = 0;
  for (const event of campEvents) {
    const day = dateKeyFromTimestamp(event.createdAt);
    const completedAt = completedAtByLearnerDate.get(`${event.learnerId}|${day}`);
    if (!Number.isFinite(completedAt) || event.createdAtMs < completedAt) {
      beforeLearning++;
    }
  }

  return {
    campEvents: campEvents.length,
    beforeLearning,
    ratio: campEvents.length > 0 ? beforeLearning / campEvents.length : 0,
  };
}

function computeExtraPracticeAfterCap(events) {
  const completedAtByLearnerDate = new Map();
  for (const event of events) {
    if (event.eventType !== 'hero.daily.completed') continue;
    const day = event.eventJson?.data?.dateKey || event.eventJson?.dateKey || dateKeyFromTimestamp(event.createdAt);
    if (!event.learnerId || !day || !Number.isFinite(event.createdAtMs)) continue;
    completedAtByLearnerDate.set(`${event.learnerId}|${day}`, event.createdAtMs);
  }

  let extraTaskCount = 0;
  for (const event of events) {
    if (event.eventType !== 'hero.task.completed') continue;
    const day = event.eventJson?.data?.dateKey || event.eventJson?.dateKey || dateKeyFromTimestamp(event.createdAt);
    const completedAt = completedAtByLearnerDate.get(`${event.learnerId}|${day}`);
    if (Number.isFinite(completedAt) && event.createdAtMs > completedAt) {
      extraTaskCount++;
    }
  }
  return { extraTaskCount };
}

function buildValues({ events, stateRows, childSubjectRows, membershipRows, supportRows }) {
  const stateInspectionFailures = stateRows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.stateJsonParseError)
    .map(({ row, index }) => ({
      rowIndex: index,
      learnerId: row.learnerId,
      reason: 'malformed-or-non-object-state-json',
    }));
  const stateInspectionFailureCount = stateInspectionFailures.length;
  const ledgerEntries = ledgerEntriesFromStates(stateRows);
  const dailyAwardEntries = ledgerEntries.filter((entry) => entry.type === 'daily-completion-award');
  const campDebitEntries = ledgerEntries.filter((entry) => entry.type === 'monster-invite' || entry.type === 'monster-grow');
  const taskCompletedEvents = events.filter((event) => event.eventType === 'hero.task.completed');
  const dailyCompletedEvents = events.filter((event) => event.eventType === 'hero.daily.completed');
  const coinAwardEvents = events.filter((event) => event.eventType === 'hero.coins.awarded');
  const campEvents = events.filter((event) => (
    event.eventType === 'hero.camp.monster.invited' ||
    event.eventType === 'hero.camp.monster.grown'
  ));

  const readyLearnerIds = new Set(
    childSubjectRows
      .filter((row) => HERO_READY_SUBJECT_IDS.includes(row.subject_id ?? row.subjectId))
      .map((row) => row.learner_id ?? row.learnerId)
      .filter(Boolean),
  );
  const heroStateLearnerIds = new Set(stateRows.map((row) => row.learnerId).filter(Boolean));
  const exposedAccountIds = new Set(events.map((event) => event.actorAccountId).filter(Boolean));
  for (const row of membershipRows) {
    const learnerId = row.learner_id ?? row.learnerId;
    const accountId = row.account_id ?? row.accountId;
    if (accountId && heroStateLearnerIds.has(learnerId)) exposedAccountIds.add(accountId);
  }

  let startedLearnerDays = 0;
  let taskStartCount = 0;
  let dailyCompletedStateCount = 0;
  const taskIntentCounts = {};
  for (const stateRow of stateRows) {
    const tasks = allTasksFromState(stateRow);
    const startedTasks = tasks.filter((task) => task.status === 'started' || task.status === 'completed');
    if (stateRow.daily?.firstStartedAt || startedTasks.length > 0) {
      startedLearnerDays++;
    }
    taskStartCount += startedTasks.length;
    if (stateRow.daily?.status === 'completed') dailyCompletedStateCount++;
    for (const task of tasks) {
      if (task.intent) {
        taskIntentCounts[task.intent] = (taskIntentCounts[task.intent] || 0) + 1;
      }
    }
  }

  const duplicateDailyAwardGroups = countDuplicateGroups(
    dailyAwardEntries.map((entry) => (
      entry.idempotencyKey ||
      `${entry.learnerId || ''}|${entry.dateKey || ''}|${entry.questId || ''}|${entry.questFingerprint || ''}`
    )),
  );
  const duplicateCampDebitGroups = countDuplicateGroups(
    campDebitEntries.map((entry) => (
      entry.idempotencyKey ||
      `${entry.learnerId || ''}|${entry.type || ''}|${entry.monsterId || ''}|${entry.stageAfter ?? ''}|${entry.branch || ''}`
    )),
  );
  const negativeBalanceCount = stateInspectionFailureCount
    + stateRows.filter((row) => typeof row.economy?.balance === 'number' && row.economy.balance < 0).length
    + ledgerEntries.filter((entry) => typeof entry.balanceAfter === 'number' && entry.balanceAfter < 0).length;

  const dailyCompleteKeys = new Set(dailyCompletedEvents.map((event) => {
    const day = event.eventJson?.data?.dateKey || event.eventJson?.dateKey || dateKeyFromTimestamp(event.createdAt);
    return `${event.learnerId || ''}|${day || ''}|${event.eventJson?.data?.questId || event.eventJson?.questId || ''}`;
  }));
  const claimWithoutCompletionCount = dailyAwardEntries.filter((entry) => {
    const key = `${entry.learnerId || ''}|${entry.dateKey || ''}|${entry.questId || ''}`;
    if (dailyCompleteKeys.has(key)) return false;
    return !stateRows.some((row) => (
      row.learnerId === entry.learnerId &&
      row.daily?.dateKey === entry.dateKey &&
      row.daily?.questId === entry.questId &&
      row.daily?.status === 'completed'
    ));
  }).length;

  const privacy = computePrivacy(events);
  const nextDayReturn = computeNextDayReturnRate(events);
  const campBeforeLearning = computeCampBeforeLearning(events);
  const extraPractice = computeExtraPracticeAfterCap(events);
  const supportConfusionCount = supportRows.filter((row) => (row.category || '').toLowerCase() === 'comprehension').length;

  const warningCount = [
    campBeforeLearning.ratio > 0.5,
    supportConfusionCount > 3,
    privacy.failureCount > 0,
    negativeBalanceCount > 0,
  ].filter(Boolean).length;

  return {
    'pa6-launch-01': readyLearnerIds.size,
    'pa6-launch-02': exposedAccountIds.size,
    'pa6-launch-03': null,
    'pa6-launch-04': startedLearnerDays,
    'pa6-launch-05': taskStartCount,
    'pa6-launch-06': taskCompletedEvents.length,
    'pa6-launch-07': dailyCompletedStateCount,
    'pa6-launch-08': taskCompletedEvents.length,
    'pa6-launch-09': null,
    'pa6-launch-10': dailyAwardEntries.length,
    'pa6-launch-11': null,
    'pa6-launch-12': campDebitEntries.length,
    'pa6-launch-13': null,
    'pa6-launch-14': null,
    'pa6-product-01': null,
    'pa6-product-02': {
      startedLearnerDays,
      dailyCompletedStateCount,
      rate: startedLearnerDays > 0 ? dailyCompletedStateCount / startedLearnerDays : 0,
    },
    'pa6-product-03': nextDayReturn,
    'pa6-product-04': countBy(taskCompletedEvents, (event) => event.subjectId || event.eventJson?.data?.subjectId || 'unknown'),
    'pa6-product-05': taskIntentCounts,
    'pa6-product-06': null,
    'pa6-product-07': supportConfusionCount,
    'pa6-product-08': campBeforeLearning,
    'pa6-product-09': extraPractice.extraTaskCount,
    'pa6-product-10': warningCount,
    'pa6-safety-01': duplicateDailyAwardGroups,
    'pa6-safety-02': duplicateCampDebitGroups,
    'pa6-safety-03': negativeBalanceCount,
    'pa6-safety-04': null,
    'pa6-safety-05': claimWithoutCompletionCount,
    'pa6-safety-06': privacy.failureCount,
    'pa6-safety-07': null,
    'pa6-safety-08': null,
    'pa6-safety-09': null,
    'pa6-safety-10': null,
    _privacy: privacy,
    _stateInspection: {
      parseErrorCount: stateInspectionFailureCount,
      failureCount: stateInspectionFailureCount,
      failures: stateInspectionFailures,
    },
    _eventMirrorCounts: {
      taskCompleted: taskCompletedEvents.length,
      dailyCompleted: dailyCompletedEvents.length,
      coinAwarded: coinAwardEvents.length,
      campEvents: campEvents.length,
    },
  };
}

export function buildA6MetricsReport(input = {}, options = {}) {
  const events = parseEventRows(getRows(input, 'event_log', 'eventLog'));
  const stateRows = parseHeroStateRows(getRows(input, 'child_game_state', 'childGameState'));
  const childSubjectRows = getRows(input, 'child_subject_state', 'childSubjectState');
  const membershipRows = getRows(input, 'account_learner_memberships', 'accountLearnerMemberships');
  const supportRows = getRows(input, 'support_issues', 'supportIssues');
  const conceptualCheck = assertNoConceptualTables();
  const values = buildValues({ events, stateRows, childSubjectRows, membershipRows, supportRows });
  const dateRange = computeDateRange(events, stateRows);
  const sourceCounts = {
    eventLogRows: events.length,
    heroStateRows: stateRows.length,
    childSubjectStateRows: childSubjectRows.length,
    membershipRows: membershipRows.length,
    supportRows: supportRows.length,
  };
  const suppliedRowCount = Object.values(sourceCounts).reduce((sum, count) => sum + count, 0);
  const reportEvidenceState = suppliedRowCount === 0
    ? 'no-live-export-supplied'
    : 'computed-from-supplied-export';

  const metrics = PA6_METRIC_REGISTRY.map((metric) => ({
    ...metric,
    value: values[metric.id],
    observableNow: metric.sourceType !== 'not-observable-yet' && metric.sourceType !== 'client-instrumented',
    evidenceState: values[metric.id] == null ? 'not-observable-yet' : reportEvidenceState,
  }));

  const notObservable = metrics.filter((metric) => metric.sourceType === 'not-observable-yet');
  const clientInstrumented = metrics.filter((metric) => metric.sourceType === 'client-instrumented');

  return {
    phase: 'hero-mode-pA6',
    generatedAt: options.generatedAt || new Date().toISOString(),
    evidenceState: reportEvidenceState,
    dateRange,
    sourceCounts,
    sourceTruth: {
      economyAuthority: "child_game_state.state_json where system_id='hero-mode'",
      eventLogRole: 'telemetry mirror only',
      conceptualTablesAbsent: conceptualCheck.ok,
      conceptualTableOffenders: conceptualCheck.offenders,
    },
    eventMirrorCounts: values._eventMirrorCounts,
    privacy: values._privacy,
    stateInspection: values._stateInspection,
    metrics,
    blindSpots: [
      ...notObservable.map((metric) => ({ id: metric.id, name: metric.name, reason: metric.extraction })),
      ...clientInstrumented.map((metric) => ({ id: metric.id, name: metric.name, reason: metric.extraction })),
    ],
    decisionImpact: deriveDecisionImpact({ metrics, values, events, stateRows }),
  };
}

function deriveDecisionImpact({ metrics, values, events, stateRows }) {
  const zeroToleranceBreaches = [
    ['duplicate-daily-award', values['pa6-safety-01']],
    ['duplicate-camp-debit', values['pa6-safety-02']],
    ['negative-balance', values['pa6-safety-03']],
    ['claim-without-completion', values['pa6-safety-05']],
    ['raw-child-content', values['pa6-safety-06']],
  ].filter(([, value]) => typeof value === 'number' && value > 0);

  const notObservableSafety = metrics
    .filter((metric) => metric.category === 'safety' && metric.sourceType === 'not-observable-yet')
    .map((metric) => metric.id);

  let recommendation = 'HOLD AT CURRENT ROLLOUT PERCENTAGE';
  const reasons = [];

  if (zeroToleranceBreaches.length > 0) {
    recommendation = 'ROLL BACK TO COHORT ONLY';
    reasons.push(`Zero-tolerance breach(es): ${zeroToleranceBreaches.map(([name]) => name).join(', ')}`);
  }
  if (events.length === 0 && stateRows.length === 0) {
    reasons.push('No supplied live Hero production export rows; normalisation is not supported.');
  }
  if (notObservableSafety.length > 0) {
    reasons.push(`Safety blind spots still need smoke/log/manual evidence: ${notObservableSafety.join(', ')}`);
  }
  if (reasons.length === 0) {
    reasons.push('Schema-derived checks supplied no stop-condition breach, but final rollout decision still needs owner sign-off.');
  }

  return {
    recommendedOutcome: recommendation,
    zeroToleranceBreaches: zeroToleranceBreaches.map(([name, count]) => ({ name, count })),
    reasons,
  };
}

export function parseArgs(argv) {
  const args = {
    input: null,
    output: DEFAULT_OUTPUT,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--input' && argv[i + 1]) {
      args.input = resolve(argv[++i]);
    } else if (arg.startsWith('--input=')) {
      args.input = resolve(arg.slice('--input='.length));
    } else if (arg === '--output' && argv[i + 1]) {
      args.output = resolve(argv[++i]);
    } else if (arg.startsWith('--output=')) {
      args.output = resolve(arg.slice('--output='.length));
    }
  }

  return args;
}

function readInput(path) {
  if (!path) return {};
  if (!existsSync(path)) {
    throw new Error(`Input file not found: ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeOutput(report, outputPath) {
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const tmpPath = `${outputPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(report, null, 2), 'utf8');
  renameSync(tmpPath, outputPath);
}

async function main() {
  const args = parseArgs(process.argv);
  const input = readInput(args.input);
  const report = buildA6MetricsReport(input);
  writeOutput(report, args.output);
  console.log(`Hero Mode pA6 metrics report written to ${args.output}`);
  if (!report.sourceTruth.conceptualTablesAbsent) {
    console.error(`Conceptual metric source(s) remain: ${report.sourceTruth.conceptualTableOffenders.join(', ')}`);
    process.exit(1);
  }
}

const _scriptUrl = fileURLToPath(import.meta.url);
const _invokedAs = process.argv[1] ? resolve(process.argv[1]) : '';
if (_scriptUrl === _invokedAs) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
