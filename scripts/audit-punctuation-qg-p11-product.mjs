#!/usr/bin/env node

/**
 * Punctuation QG P11 product-depth audit.
 *
 * Run from repository root:
 *   node scripts/audit-punctuation-qg-p11-product.mjs
 *
 * This is intentionally product-facing. It checks what a learner sees across
 * session starts and retry loops, not just whether the content bank exists.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const moduleUrl = (rel) => pathToFileURL(path.join(root, rel)).href;

const { createPunctuationRuntimeManifest, PRODUCTION_DEPTH, CAPACITY_DEPTH } = await import(moduleUrl('shared/punctuation/generators.js'));
const { PUNCTUATION_CONTENT_MANIFEST } = await import(moduleUrl('shared/punctuation/content.js'));
const { createPunctuationService, createInitialPunctuationData } = await import(moduleUrl('shared/punctuation/service.js'));
const { createMemoryState, updateMemoryState } = await import(moduleUrl('shared/punctuation/scheduler.js'));

const TARGET_PRODUCTION_DEPTH = 8;
const TARGET_TOTAL_ITEMS = 292;
const TARGET_CHOOSE_COUNT = 40;
const MAX_REPEAT_WITHIN_20 = 2;
const SMART_MODE_COUNT = 6;
const MAX_GENERATOR_FAMILY_SHARE_IN_STANDARD_SESSION = 0.35;
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 3, 30, 10, 0, 0);
const FORBIDDEN_TINY_SESSION_MASTERY_COPY = /\b(mastered|mastery|secure|retained|learnt|learned|section complete|path complete|you are done)\b/i;
const REQUIRED_CONTRACT_JOURNEY_TYPES = Object.freeze([
  'fresh',
  'one-wrong-then-correct',
  'repeated-wrong',
  'guided',
  'weak',
  'gps',
  'post-secure',
]);
const REQUIRED_SURFACE_KINDS = Object.freeze([
  'first-click',
  'retry',
  'mixed-review',
  'due-review',
  'spaced-return',
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeRepo(initialData = null) {
  const store = new Map();
  if (initialData) store.set('learner', clone(initialData));
  return {
    readData(learnerId) {
      return clone(store.get(learnerId) || createInitialPunctuationData());
    },
    writeData(learnerId, data) {
      store.set(learnerId, clone(data));
      return data;
    },
    syncPracticeSession() {},
    abandonPracticeSession() {},
    resetLearner(learnerId) {
      store.delete(learnerId);
    },
  };
}

function rng(seed) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

function answerFor(item, correct = true) {
  if (item.mode === 'choose' || item.inputKind === 'choice') {
    return correct ? { choiceIndex: item.correctIndex } : { choiceIndex: 999 };
  }
  return correct ? { typed: item.model || item.accepted?.[0] || '' } : { typed: 'wrong answer' };
}

function expectedContextForSession(session = {}) {
  if (session.mode !== 'gps') return {};
  return {
    expectedSessionId: session.id,
    expectedItemId: session.currentItemId,
    expectedAnsweredCount: session.answeredCount,
    expectedReleaseId: session.releaseId,
  };
}

function countBy(rows, fn) {
  return rows.reduce((out, row) => {
    const key = fn(row);
    out[key] = (out[key] || 0) + 1;
    return out;
  }, {});
}

const runtime = createPunctuationRuntimeManifest({
  manifest: PUNCTUATION_CONTENT_MANIFEST,
  generatedPerFamily: PRODUCTION_DEPTH,
});
const items = runtime.items;
const itemById = new Map(items.map((item) => [item.id, item]));

function poolSummary() {
  const fixed = items.filter((item) => item.source !== 'generated' && !item.generatorFamilyId).length;
  const generated = items.filter((item) => item.source === 'generated' || item.generatorFamilyId).length;
  const byMode = countBy(items, (item) => item.mode || 'unknown');
  const bySkill = countBy(items, (item) => (item.skillIds || []).join('+') || 'none');
  const singleSkillCounts = Object.entries(bySkill).filter(([skill]) => !skill.includes('+') && skill !== 'none');
  const minSingleSkillCount = singleSkillCounts.length ? Math.min(...singleSkillCounts.map(([, count]) => count)) : 0;
  return {
    productionDepth: PRODUCTION_DEPTH,
    capacityDepth: CAPACITY_DEPTH,
    fixed,
    generated,
    total: items.length,
    chooseCount: byMode.choose || 0,
    byMode,
    bySkill,
    minSingleSkillCount,
  };
}

function memoryState({ attempts = 2, correct = 2, streak = 2, firstCorrectDaysAgo = 2, lastCorrectDaysAgo = 1, intervalDays = 1, due = true } = {}) {
  return {
    attempts,
    correct,
    incorrect: Math.max(0, attempts - correct),
    streak,
    lapses: 0,
    ease: 2.3,
    intervalDays,
    dueAt: due ? NOW - 60_000 : NOW + DAY_MS,
    firstCorrectAt: NOW - (firstCorrectDaysAgo * DAY_MS),
    lastCorrectAt: NOW - (lastCorrectDaysAgo * DAY_MS),
    lastSeen: NOW - (lastCorrectDaysAgo * DAY_MS),
    lastCorrect: true,
    recent: Array.from({ length: Math.min(streak, 6) }, () => 1),
  };
}

function secureMemoryState() {
  return {
    attempts: 4,
    correct: 4,
    incorrect: 0,
    streak: 4,
    lapses: 0,
    ease: 2.3,
    intervalDays: 8,
    dueAt: NOW - 60_000,
    firstCorrectAt: NOW - (9 * DAY_MS),
    lastCorrectAt: NOW - DAY_MS,
    lastSeen: NOW - DAY_MS,
    lastCorrect: true,
    recent: [1, 1, 1, 1],
  };
}

function weakLearnerData() {
  const data = createInitialPunctuationData();
  data.progress.facets['speech::insert'] = updateMemoryState(createMemoryState(), false, NOW - DAY_MS);
  return data;
}

function dueLearnerData({ spaced = false } = {}) {
  const data = createInitialPunctuationData();
  const chooseItems = items.filter((entry) => entry.mode === 'choose');
  for (const item of chooseItems) {
    data.progress.items[item.id] = spaced
      ? memoryState({ firstCorrectDaysAgo: 5, lastCorrectDaysAgo: 4, intervalDays: 4 })
      : memoryState({ firstCorrectDaysAgo: 2, lastCorrectDaysAgo: 1, intervalDays: 1 });
  }
  return data;
}

function postSecureLearnerData() {
  const data = createInitialPunctuationData();
  const secureFixedItems = items
    .filter((item) => item.source !== 'generated')
    .slice(0, 8);
  for (const item of secureFixedItems) {
    const state = secureMemoryState();
    data.progress.items[item.id] = state;
    for (const skillId of item.skillIds || []) {
      data.progress.facets[`${skillId}:${item.mode}`] = state;
    }
    data.progress.attempts.push({
      ts: NOW - DAY_MS,
      timestamp: NOW - DAY_MS,
      sessionId: 'seed-post-secure',
      itemId: item.id,
      variantSignature: item.variantSignature || '',
      mode: item.mode || '',
      itemMode: item.mode || '',
      skillIds: item.skillIds || [],
      rewardUnitId: item.rewardUnitId || '',
      sessionMode: 'smart',
      supportLevel: 0,
      supportKind: null,
      meaningful: true,
      correct: true,
      misconceptionTags: [],
      facetOutcomes: [],
    });
  }
  return data;
}

function surfaceKindsFor({ slot, reason, sessionMode }) {
  const kinds = [];
  if (slot === 1) kinds.push('first-click');
  if (reason === 'misconception-retry') kinds.push('retry');
  if (reason === 'mixed-review') kinds.push('mixed-review');
  if (reason === 'due-review') kinds.push('due-review');
  if (reason === 'spaced-return' || reason === 'retention-after-secure') kinds.push('spaced-return');
  if (sessionMode === 'guided') kinds.push('guided-support');
  if (sessionMode === 'weak') kinds.push('weak-mode');
  if (sessionMode === 'gps') kinds.push('gps-test');
  return kinds;
}

function runSessions({
  learnerId = 'learner',
  journeyId = 'journey',
  journeyType = 'fresh',
  sessions = 1,
  mode = 'smart',
  length = 4,
  seed = 1,
  skillId = null,
  answerPattern = () => true,
  initialData = null,
} = {}) {
  const repo = makeRepo(initialData);
  const service = createPunctuationService({
    repository: repo,
    random: rng(seed),
    now: () => NOW,
  });
  const seen = [];
  let lastSummary = null;
  for (let sessionIndex = 0; sessionIndex < sessions; sessionIndex += 1) {
    const startOptions = { mode, roundLength: String(length) };
    if (skillId) startOptions.skillId = skillId;
    let transition = service.startSession(learnerId, startOptions);
    let state = transition.state;
    let guard = 0;
    while (state.phase === 'active-item' && guard < 80) {
      const item = itemById.get(state.session.currentItemId) || state.session.currentItem;
      const shouldAnswerCorrectly = answerPattern({ index: seen.length, slot: state.session.answeredCount + 1, item, state });
      const reason = state.session.selectionReason || 'fallback';
      const slot = state.session.answeredCount + 1;
      seen.push({
        journeyId,
        journeyType,
        session: sessionIndex + 1,
        sessionId: state.session.id,
        sessionMode: state.session.mode,
        slot,
        id: item.id,
        source: item.source === 'generated' || item.generatorFamilyId ? 'generated' : 'fixed',
        mode: item.mode,
        skill: (item.skillIds || []).join('+') || 'none',
        skillIds: item.skillIds || [],
        family: item.generatorFamilyId || 'fixed',
        reason,
        surfaceKinds: surfaceKindsFor({ slot, reason, sessionMode: state.session.mode }),
        answeredCorrectly: shouldAnswerCorrectly,
        supportLevel: state.session.guidedSupportLevel || 0,
        guidedSkillId: state.session.guidedSkillId || '',
        weakFocusSource: state.session.weakFocus?.source || '',
        gpsAnsweredCount: state.session.gps?.answeredCount ?? null,
        surfacedByProductService: true,
      });
      transition = service.submitAnswer(
        learnerId,
        state,
        answerFor(item, shouldAnswerCorrectly),
        expectedContextForSession(state.session),
      );
      state = transition.state;
      if (state.phase === 'feedback') {
        transition = service.continueSession(learnerId, state);
        state = transition.state;
      }
      guard += 1;
    }
    if (state.phase === 'summary') lastSummary = state.summary;
  }
  seen.stats = service.getStats(learnerId);
  seen.lastSummary = lastSummary;
  return seen;
}

function repeatStats(seen) {
  const counts = countBy(seen, (row) => row.id);
  return {
    attempts: seen.length,
    uniqueItems: Object.keys(counts).length,
    maxRepeat: Math.max(0, ...Object.values(counts)),
    topRepeats: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10),
    modeCounts: countBy(seen, (row) => row.mode),
    reasonCounts: countBy(seen, (row) => row.reason),
    firstClickModes: countBy(seen.filter((row) => row.slot === 1), (row) => row.mode),
  };
}

function firstClickModeIsStuck(stats) {
  const modes = Object.keys(stats.firstClickModes);
  return modes.length === 1 && modes[0] === 'choose';
}

function consecutiveRepeatFailures(seen) {
  const failures = [];
  let streakId = '';
  let streak = 0;
  let firstIndex = 0;
  for (let i = 0; i < seen.length; i += 1) {
    if (seen[i].id === streakId) {
      streak += 1;
    } else {
      if (streak > 1) failures.push({ itemId: streakId, count: streak, startsAt: firstIndex + 1 });
      streakId = seen[i].id;
      streak = 1;
      firstIndex = i;
    }
  }
  if (streak > 1) failures.push({ itemId: streakId, count: streak, startsAt: firstIndex + 1 });
  return failures;
}

function generatorFamilyDominanceFailures(seen, sessionLength) {
  const bySession = new Map();
  for (const row of seen) {
    if (row.family === 'fixed') continue;
    const rows = bySession.get(row.session) || [];
    rows.push(row);
    bySession.set(row.session, rows);
  }
  const failures = [];
  for (const [session, rows] of bySession.entries()) {
    const counts = countBy(rows, (row) => row.family);
    const max = Math.max(0, ...Object.values(counts));
    if (max / sessionLength > MAX_GENERATOR_FAMILY_SHARE_IN_STANDARD_SESSION) {
      failures.push({ session, max, counts });
    }
  }
  return failures;
}

function slidingWindowMaxRepeat(seen, windowSize) {
  let max = 0;
  for (let start = 0; start < seen.length; start += 1) {
    const window = seen.slice(start, start + windowSize);
    const counts = countBy(window, (row) => row.id);
    max = Math.max(max, ...Object.values(counts));
  }
  return max;
}

function forbiddenTinySessionMasteryCopy(summary) {
  const text = [
    summary?.label,
    summary?.message,
    summary?.publishedScope,
  ].filter(Boolean).join(' ');
  return FORBIDDEN_TINY_SESSION_MASTERY_COPY.test(text);
}

function buildContractJourneyAudit() {
  const specs = [];
  for (let i = 0; i < 8; i += 1) {
    specs.push({ journeyType: 'fresh', mode: 'smart', length: 6, seed: 100 + i, answerPattern: () => true });
  }
  for (let i = 0; i < 4; i += 1) {
    specs.push({ journeyType: 'one-wrong-then-correct', mode: 'smart', length: 6, seed: 200 + i, answerPattern: ({ index }) => index !== 0 });
  }
  for (let i = 0; i < 4; i += 1) {
    specs.push({ journeyType: 'repeated-wrong', mode: 'smart', length: 6, seed: 300 + i, answerPattern: () => false });
  }
  for (let i = 0; i < 3; i += 1) {
    specs.push({ journeyType: 'guided', mode: 'guided', skillId: 'speech', length: 3, seed: 400 + i, answerPattern: () => true });
  }
  for (let i = 0; i < 3; i += 1) {
    specs.push({ journeyType: 'weak', mode: 'weak', length: 3, seed: 500 + i, initialData: weakLearnerData(), answerPattern: () => true });
  }
  for (let i = 0; i < 2; i += 1) {
    specs.push({ journeyType: 'gps', mode: 'gps', length: 3, seed: 600 + i, answerPattern: ({ index }) => index !== 0 });
  }
  specs.push({ journeyType: 'due', mode: 'smart', length: 3, seed: 700, initialData: dueLearnerData(), answerPattern: () => true });
  specs.push({ journeyType: 'spaced-return', mode: 'smart', length: 3, seed: 701, initialData: dueLearnerData({ spaced: true }), answerPattern: () => true });
  specs.push({ journeyType: 'post-secure', mode: 'smart', length: 6, seed: 702, initialData: postSecureLearnerData(), answerPattern: () => true });

  const journeys = specs.map((spec, index) => {
    const journeyId = `p11-${String(index + 1).padStart(2, '0')}-${spec.journeyType}`;
    const sequence = runSessions({
      ...spec,
      journeyId,
      learnerId: 'learner',
      sessions: 1,
    });
    return {
      journeyId,
      type: spec.journeyType,
      mode: spec.mode,
      length: spec.length,
      surfacedCount: sequence.length,
      events: sequence,
      summary: sequence.lastSummary,
    };
  });
  const events = journeys.flatMap((journey) => journey.events);
  const surfaceKindCounts = {};
  for (const event of events) {
    for (const kind of event.surfaceKinds || []) {
      surfaceKindCounts[kind] = (surfaceKindCounts[kind] || 0) + 1;
    }
  }
  return {
    totalJourneys: journeys.length,
    byType: countBy(journeys, (journey) => journey.type),
    surfaceKinds: surfaceKindCounts,
    surfacedItemCount: new Set(events.map((event) => event.id)).size,
    eventCount: events.length,
    journeys,
  };
}

function buildP11ProductAudit() {
  const pool = poolSummary();
  const freshLen4 = runSessions({ journeyType: 'fresh-len4', sessions: 20, length: 4, seed: 123 });
  const freshLen6 = runSessions({ journeyType: 'fresh-len6', sessions: 10, length: 6, seed: 123 });
  const firstWrongThenCorrect = runSessions({
    journeyType: 'one-wrong-then-correct',
    sessions: 1,
    length: 12,
    seed: 99,
    answerPattern: ({ index }) => index !== 0,
  });
  const alwaysWrong = runSessions({
    journeyType: 'repeated-wrong',
    sessions: 1,
    length: 12,
    seed: 99,
    answerPattern: () => false,
  });
  const postSecure = runSessions({
    journeyType: 'post-secure',
    sessions: 1,
    length: 6,
    seed: 555,
    initialData: postSecureLearnerData(),
  });
  const sameDayGrinding = runSessions({
    journeyType: 'same-day-grinding',
    sessions: 15,
    length: 6,
    seed: 321,
    answerPattern: () => true,
  });
  const contractJourneys = buildContractJourneyAudit();

  const findings = {
    pool,
    freshLen4: repeatStats(freshLen4),
    freshLen6: repeatStats(freshLen6),
    firstWrongThenCorrect: {
      sequence: firstWrongThenCorrect,
      repeatStats: repeatStats(firstWrongThenCorrect),
      consecutiveRepeats: consecutiveRepeatFailures(firstWrongThenCorrect),
    },
    alwaysWrong: {
      sequence: alwaysWrong,
      repeatStats: repeatStats(alwaysWrong),
      consecutiveRepeats: consecutiveRepeatFailures(alwaysWrong),
    },
    postSecure: {
      sequence: postSecure,
      stats: postSecure.stats,
      repeatStats: repeatStats(postSecure),
      consecutiveRepeats: consecutiveRepeatFailures(postSecure),
    },
    sameDayGrinding: {
      attempts: sameDayGrinding.length,
      stats: sameDayGrinding.stats,
      summary: sameDayGrinding.lastSummary,
      repeatStats: repeatStats(sameDayGrinding),
      slidingWindow20MaxRepeat: slidingWindowMaxRepeat(sameDayGrinding, 20),
    },
    freshLen6GeneratorFamilyDominance: generatorFamilyDominanceFailures(freshLen6, SMART_MODE_COUNT),
    contractJourneys,
  };

  const failures = [];
  if (pool.productionDepth < TARGET_PRODUCTION_DEPTH) failures.push(`productionDepth ${pool.productionDepth} < ${TARGET_PRODUCTION_DEPTH}`);
  if (pool.total < TARGET_TOTAL_ITEMS) failures.push(`total production items ${pool.total} < ${TARGET_TOTAL_ITEMS}`);
  if (pool.chooseCount < TARGET_CHOOSE_COUNT) failures.push(`choose count ${pool.chooseCount} < ${TARGET_CHOOSE_COUNT}`);
  if (firstClickModeIsStuck(findings.freshLen4)) {
    failures.push('repeated short sessions always start with the same first-click mode');
  }
  if (firstClickModeIsStuck(findings.freshLen6)) {
    failures.push('repeated standard six-question sessions always start with choose');
  }
  if (findings.firstWrongThenCorrect.consecutiveRepeats.some((entry) => entry.count > 1)) {
    failures.push('misconception retry produced consecutive repeated items after one wrong answer');
  }
  if (findings.alwaysWrong.consecutiveRepeats.some((entry) => entry.count > 1)) {
    failures.push('always-wrong journey produced consecutive repeated items');
  }
  if (findings.postSecure.stats.secure < 1) {
    failures.push('post-secure journey did not start from a secure learner state');
  }
  if (findings.postSecure.consecutiveRepeats.some((entry) => entry.count > 1)) {
    failures.push('post-secure journey produced consecutive repeated items');
  }
  if (findings.freshLen4.maxRepeat > MAX_REPEAT_WITHIN_20) {
    failures.push(`fresh 20-session audit max item repeat ${findings.freshLen4.maxRepeat} > ${MAX_REPEAT_WITHIN_20}`);
  }
  if (findings.sameDayGrinding.slidingWindow20MaxRepeat > MAX_REPEAT_WITHIN_20) {
    failures.push(`same-day grinding max item repeat within 20 attempts ${findings.sameDayGrinding.slidingWindow20MaxRepeat} > ${MAX_REPEAT_WITHIN_20}`);
  }
  if (findings.sameDayGrinding.stats.securedRewardUnits > 0) {
    failures.push(`same-day grinding secured ${findings.sameDayGrinding.stats.securedRewardUnits} reward units without spaced evidence`);
  }
  if (forbiddenTinySessionMasteryCopy(findings.sameDayGrinding.summary)) {
    failures.push('same-day six-question summary uses mastery/secure completion copy');
  }
  if (findings.freshLen6GeneratorFamilyDominance.length > 0) {
    failures.push('six-question standard session has a generated family above the 35% dominance limit');
  }
  if (Object.keys(findings.freshLen4.modeCounts).length < 5) {
    failures.push('20-session fresh-learner audit surfaced fewer than five item modes');
  }
  if (Object.keys(findings.freshLen4.modeCounts).length > SMART_MODE_COUNT) {
    failures.push('20-session fresh-learner audit surfaced an unknown item mode');
  }
  if (Object.keys(findings.freshLen4.modeCounts).length >= 5 && Object.keys(findings.freshLen4.modeCounts).length <= SMART_MODE_COUNT) {
    const skillCount = Object.keys(countBy(freshLen4, (row) => row.skill)).length;
    if (skillCount < 10) failures.push(`20-session fresh-learner audit surfaced ${skillCount} skills < 10`);
  }
  if (findings.contractJourneys.totalJourneys < 24) {
    failures.push(`contract journey pack has ${findings.contractJourneys.totalJourneys} journeys < 24`);
  }
  for (const type of REQUIRED_CONTRACT_JOURNEY_TYPES) {
    if (!findings.contractJourneys.byType[type]) failures.push(`contract journey pack missing ${type} journey`);
  }
  for (const kind of REQUIRED_SURFACE_KINDS) {
    if (!findings.contractJourneys.surfaceKinds[kind]) failures.push(`contract journey pack missing ${kind} surface evidence`);
  }

  return { status: failures.length ? 'FAIL' : 'PASS', failures, findings };
}

function main() {
  const audit = buildP11ProductAudit();
  console.log(JSON.stringify(audit, null, 2));
  process.exitCode = audit.failures.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export {
  buildP11ProductAudit,
  buildContractJourneyAudit,
  runSessions,
  repeatStats,
  countBy,
};
