#!/usr/bin/env node
// Portable fallback if the patch download cannot be used.
// Run from repo root: node apply-reading-clock-hotfix-v2.mjs
import fs from 'node:fs';

function replaceOnce(source, oldText, newText, label) {
  if (!source.includes(oldText)) throw new Error(`Missing expected pattern: ${label}`);
  return source.replace(oldText, newText);
}

function native(source, text) {
  const nl = source.includes('\r\n') ? '\r\n' : '\n';
  return text.replace(/\n/g, nl);
}

const enginePath = 'worker/src/subjects/reading/engine.js';
let engine = fs.readFileSync(enginePath, 'utf8');
const E = (text) => native(engine, text);

for (const [oldText, newText, label] of [
  ["function nodeStatus(node) {\n  const now = Date.now();\n", "function nodeStatus(node, nowValue = Date.now()) {\n  const now = Number.isFinite(Number(nowValue)) ? Number(nowValue) : Date.now();\n", 'nodeStatus'],
  ["function questionWeakness(data, question) {\n", "function questionWeakness(data, question, nowValue = Date.now()) {\n", 'questionWeakness signature'],
  ["  if (qNode.dueAt && qNode.dueAt <= Date.now()) score += 2;\n", "  const now = Number.isFinite(Number(nowValue)) ? Number(nowValue) : Date.now();\n  if (qNode.dueAt && qNode.dueAt <= now) score += 2;\n", 'questionWeakness due'],
  ["function chooseWeightedPassage(data, prefs, random) {\n", "function chooseWeightedPassage(data, prefs, random, nowValue = Date.now()) {\n", 'chooseWeightedPassage signature'],
  ["    weight += average(questions.map((question) => questionWeakness(data, question)));\n", "    weight += average(questions.map((question) => questionWeakness(data, question, nowValue)));\n", 'chooseWeightedPassage weight'],
  ["function chooseQuestionIds(data, passage, prefs) {\n", "function chooseQuestionIds(data, passage, prefs, nowValue = Date.now()) {\n", 'chooseQuestionIds signature'],
  ["  questions.sort((a, b) => questionWeakness(data, b) - questionWeakness(data, a));\n", "  questions.sort((a, b) => questionWeakness(data, b, nowValue) - questionWeakness(data, a, nowValue));\n", 'chooseQuestionIds sort'],
  ["function buildPracticeSession(data, prefs, { nowValue, random, heroContext } = {}) {\n", "function buildPracticeSession(data, prefs, { nowValue = Date.now(), random, heroContext } = {}) {\n", 'buildPracticeSession signature'],
  ["  const passage = chooseWeightedPassage(data, prefs, random);\n", "  const passage = chooseWeightedPassage(data, prefs, random, nowValue);\n", 'buildPracticeSession passage'],
  ["  const questionIds = chooseQuestionIds(data, passage, prefs);\n", "  const questionIds = chooseQuestionIds(data, passage, prefs, nowValue);\n", 'buildPracticeSession questions'],
  ["function buildStats(data) {\n  data = safeDataForReadModels(data);\n", "function buildStats(data, nowValue = Date.now()) {\n  data = safeDataForReadModels(data);\n  const now = Number.isFinite(Number(nowValue)) ? Number(nowValue) : Date.now();\n", 'buildStats signature'],
  ["      status: nodeStatus(node),\n", "      status: nodeStatus(node, now),\n", 'buildStats nodeStatus'],
  ["  const due = skillRows.filter((row) => row.status === 'due').length + (data.retryQueue || []).filter((entry) => entry.dueAt <= Date.now()).length;\n", "  const due = skillRows.filter((row) => row.status === 'due').length + (data.retryQueue || []).filter((entry) => entry.dueAt <= now).length;\n", 'buildStats due'],
  ["function buildAnalytics(data) {\n  data = safeDataForReadModels(data);\n", "function buildAnalytics(data, nowValue = Date.now()) {\n  data = safeDataForReadModels(data);\n  const now = Number.isFinite(Number(nowValue)) ? Number(nowValue) : Date.now();\n", 'buildAnalytics signature'],
  ["    generatedAt: Date.now(),\n    skills: buildStats(data).skills,\n", "    generatedAt: now,\n    skills: buildStats(data, now).skills,\n", 'buildAnalytics generatedAt'],
  ["    reviewQueue: (data.retryQueue || []).filter((entry) => entry.dueAt <= Date.now()).slice(0, 12),\n", "    reviewQueue: (data.retryQueue || []).filter((entry) => entry.dueAt <= now).slice(0, 12),\n", 'buildAnalytics reviewQueue'],
  ["    const stats = buildStats(data);\n    const analytics = buildAnalytics(data);\n", "    const stats = buildStats(data, t);\n    const analytics = buildAnalytics(data, t);\n", 'apply stats analytics'],
]) {
  engine = replaceOnce(engine, E(oldText), E(newText), label);
}
fs.writeFileSync(enginePath, engine, 'utf8');

const testPath = 'tests/worker-reading-runtime.test.js';
let testSource = fs.readFileSync(testPath, 'utf8');
const regression = native(testSource, `test('reading due stats and review queue use the injected command clock', () => {
  const engine = createServerReadingEngine({ now: () => 1000, random: () => 0 });
  const subjectRecord = {
    state: {},
    data: {
      skills: {
        '2a': {
          attempts: 1,
          correct: 1,
          wrong: 0,
          strength: 0.7,
          intervalDays: 1,
          dueAt: 1500,
          lastSeenAt: 900,
          lastWrongAt: null,
          correctStreak: 1,
        },
      },
      retryQueue: [{ questionId: 'future-review', passageId: 'red_tin_box', skillId: '2a', dueAt: 1500 }],
    },
  };
  const result = engine.apply({
    learnerId: 'l1',
    subjectRecord,
    command: 'save-prefs',
    payload: { prefs: { mode: 'guided' } },
    requestId: 'clock-regression',
  });
  assert.equal(result.stats.overview.due, 0);
  assert.equal(result.analytics.reviewQueue.length, 0);
  assert.equal(result.analytics.generatedAt, 1000);
});

`);
const needle = "test('worker subject runtime wires reading command handlers', async () => {";
if (!testSource.includes('reading due stats and review queue use the injected command clock')) {
  if (!testSource.includes(needle)) throw new Error('Missing test insertion point');
  testSource = testSource.replace(needle, regression + needle);
  fs.writeFileSync(testPath, testSource, 'utf8');
}

const smokePath = 'scripts/reading-production-smoke.mjs';
let smokeSource = fs.readFileSync(smokePath, 'utf8');
const S = (text) => native(smokeSource, text);
if (smokeSource.includes("payload: { mode: 'guided', focusSkillId: '2b', viewMode: 'one' }")) {
  smokeSource = replaceOnce(
    smokeSource,
    "payload: { mode: 'guided', focusSkillId: '2b', viewMode: 'one' }",
    "payload: { mode: 'guided', focusSkillId: '2a', viewMode: 'one' }",
    'reading production smoke deterministic focus',
  );
}
if (!smokeSource.includes('const feedbackScore = Number(feedbackResult.score);')) {
  smokeSource = replaceOnce(
    smokeSource,
    S(`  assert.ok(['feedback', 'summary'].includes(feedbackModel?.phase), 'Reading submit did not return a marked phase.');
  assert.equal(feedbackModel?.feedback?.result?.correct, true, \`Reading smoke answer was not accepted for \${questionId}.\`);
  assert.ok(feedbackModel?.feedback?.question?.modelAnswer, 'Reading feedback did not expose modelAnswer after marking.');
`),
    S(`  assert.ok(['feedback', 'summary'].includes(feedbackModel?.phase), 'Reading submit did not return a marked phase.');
  const feedbackResult = feedbackModel?.feedback?.result || feedbackModel?.session?.result || {};
  const overview = feedbackModel?.stats?.overview || {};
  const feedbackScore = Number.isFinite(Number(feedbackResult.score)) ? Number(feedbackResult.score) : Number(overview.correct);
  const feedbackMaxScore = Number.isFinite(Number(feedbackResult.maxScore)) ? Number(feedbackResult.maxScore) : Number(overview.totalQuestions);
  assert.ok(Number.isFinite(feedbackScore), \`Reading smoke result score was not numeric for \${questionId}.\`);
  assert.ok(Number.isFinite(feedbackMaxScore), \`Reading smoke result maxScore was not numeric for \${questionId}.\`);
  assert.ok(feedbackMaxScore > 0, \`Reading smoke result maxScore was not positive for \${questionId}.\`);
  assert.equal(
    feedbackScore,
    feedbackMaxScore,
    \`Reading smoke answer was not accepted for \${questionId}.\`,
  );
`),
    'reading production smoke result guard',
  );
  smokeSource = replaceOnce(
    smokeSource,
    S(`    score: feedbackModel.feedback.result.score,
    maxScore: feedbackModel.feedback.result.maxScore,
`),
    S(`    score: feedbackScore,
    maxScore: feedbackMaxScore,
`),
    'reading production smoke evidence score source',
  );
  fs.writeFileSync(smokePath, smokeSource, 'utf8');
}
console.log('Reading injected-clock hotfix applied.');
