#!/usr/bin/env node

/**
 * Punctuation QG P11 product-depth audit prototype.
 *
 * Run from repository root, even if this file lives elsewhere:
 *   node /path/to/punctuation-qg-p11-product-audit.mjs
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

const TARGET_PRODUCTION_DEPTH = 8;
const TARGET_TOTAL_ITEMS = 292;
const TARGET_CHOOSE_COUNT = 40;
const MAX_REPEAT_WITHIN_20 = 2;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeRepo() {
  const store = new Map();
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

function runSessions({ learnerId = 'learner', sessions = 1, length = 4, seed = 1, answerPattern = () => true }) {
  const repo = makeRepo();
  const service = createPunctuationService({
    repository: repo,
    random: rng(seed),
    now: () => Date.UTC(2026, 3, 30, 10, 0, 0),
  });
  const seen = [];
  for (let sessionIndex = 0; sessionIndex < sessions; sessionIndex += 1) {
    let transition = service.startSession(learnerId, { mode: 'smart', roundLength: String(length) });
    let state = transition.state;
    let guard = 0;
    while (state.phase === 'active-item' && guard < 80) {
      const item = itemById.get(state.session.currentItemId) || state.session.currentItem;
      const shouldAnswerCorrectly = answerPattern({ index: seen.length, slot: state.session.answeredCount + 1, item, state });
      seen.push({
        session: sessionIndex + 1,
        slot: state.session.answeredCount + 1,
        id: item.id,
        mode: item.mode,
        skill: (item.skillIds || []).join('+') || 'none',
        family: item.generatorFamilyId || 'fixed',
        reason: state.session.selectionReason || 'fallback',
        answeredCorrectly: shouldAnswerCorrectly,
      });
      transition = service.submitAnswer(learnerId, state, answerFor(item, shouldAnswerCorrectly));
      state = transition.state;
      if (state.phase === 'feedback') {
        transition = service.continueSession(learnerId, state);
        state = transition.state;
      }
      guard += 1;
    }
  }
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

const pool = poolSummary();
const freshLen4 = runSessions({ sessions: 20, length: 4, seed: 123 });
const freshLen6 = runSessions({ sessions: 10, length: 6, seed: 123 });
const firstWrongThenCorrect = runSessions({
  sessions: 1,
  length: 12,
  seed: 99,
  answerPattern: ({ index }) => index !== 0,
});

const findings = {
  pool,
  freshLen4: repeatStats(freshLen4),
  freshLen6: repeatStats(freshLen6),
  firstWrongThenCorrect: {
    sequence: firstWrongThenCorrect,
    repeatStats: repeatStats(firstWrongThenCorrect),
    consecutiveRepeats: consecutiveRepeatFailures(firstWrongThenCorrect),
  },
};

const failures = [];
if (pool.productionDepth < TARGET_PRODUCTION_DEPTH) failures.push(`productionDepth ${pool.productionDepth} < ${TARGET_PRODUCTION_DEPTH}`);
if (pool.total < TARGET_TOTAL_ITEMS) failures.push(`total production items ${pool.total} < ${TARGET_TOTAL_ITEMS}`);
if (pool.chooseCount < TARGET_CHOOSE_COUNT) failures.push(`choose count ${pool.chooseCount} < ${TARGET_CHOOSE_COUNT}`);
if ((freshLen4[0]?.mode || '') === 'choose' && Object.keys(findings.freshLen4.firstClickModes).length === 1) {
  failures.push('repeated short sessions always start with the same first-click mode');
}
if (findings.firstWrongThenCorrect.consecutiveRepeats.some((entry) => entry.count > 1)) {
  failures.push('misconception retry produced consecutive repeated items after one wrong answer');
}
if (findings.freshLen4.maxRepeat > MAX_REPEAT_WITHIN_20) {
  failures.push(`fresh 20-session audit max item repeat ${findings.freshLen4.maxRepeat} > ${MAX_REPEAT_WITHIN_20}`);
}

console.log(JSON.stringify({ status: failures.length ? 'FAIL' : 'PASS', failures, findings }, null, 2));
process.exitCode = failures.length ? 1 : 0;
