#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  ARITHMETIC_CONTENT_RELEASE_ID,
  arithmeticContentSummary,
} from '../shared/arithmetic/content.js';
import {
  assertNoForbiddenObjectKeys,
  configuredOrigin,
  createDemoSession,
  loadBootstrap,
  subjectCommand,
} from './lib/production-smoke.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), '..');
const FORBIDDEN_PRE_MARK_KEYS = new Set(['expected', 'answerText', 'solutionLines', 'templateId', 'seed', 'difficulty']);

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function expectedContentSummary() {
  const summary = arithmeticContentSummary();
  assert.equal(summary.releaseId, ARITHMETIC_CONTENT_RELEASE_ID);
  assert.equal(summary.templateCount, 30);
  assert.equal(summary.rewardUnitCount, 90);
  assert.equal(summary.strandTotals.facts_place_value, 12);
  assert.equal(summary.strandTotals.operations_methods, 39);
  assert.equal(summary.strandTotals.decimals_fractions, 30);
  assert.equal(summary.strandTotals.percentages_mixed, 9);
  return summary;
}

function assertArithmeticContent(model, label) {
  const expected = expectedContentSummary();
  const observed = model?.content || null;
  assert.equal(observed?.releaseId, expected.releaseId, `${label}.content.releaseId mismatch.`);
  assert.equal(Number(observed?.templateCount), expected.templateCount, `${label}.content.templateCount mismatch.`);
  assert.equal(Number(observed?.rewardUnitCount), expected.rewardUnitCount, `${label}.content.rewardUnitCount mismatch.`);
  assert.equal(Number(observed?.strandTotals?.facts_place_value), expected.strandTotals.facts_place_value, `${label}.content facts strand mismatch.`);
  assert.equal(Number(observed?.strandTotals?.operations_methods), expected.strandTotals.operations_methods, `${label}.content operations strand mismatch.`);
  assert.equal(Number(observed?.strandTotals?.decimals_fractions), expected.strandTotals.decimals_fractions, `${label}.content decimals strand mismatch.`);
  assert.equal(Number(observed?.strandTotals?.percentages_mixed), expected.strandTotals.percentages_mixed, `${label}.content percentages strand mismatch.`);
  return observed;
}

function assertPreMarkRedaction(model, label) {
  assertNoForbiddenObjectKeys(model?.session?.currentQuestion, FORBIDDEN_PRE_MARK_KEYS, `${label}.session.currentQuestion`);
  if (Array.isArray(model?.session?.paper)) {
    model.session.paper.forEach((entry, index) => {
      assertNoForbiddenObjectKeys(entry.question, FORBIDDEN_PRE_MARK_KEYS, `${label}.session.paper[${index}].question`);
      assert.equal(entry.result, null, `${label}.session.paper[${index}].result was exposed before marking.`);
    });
  }
}

function smokeIncorrectResponse() {
  return { answer: '999999999999' };
}

async function smokeImmediatePractice({ origin, cookie, learnerId, revision }) {
  let step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'arithmetic',
    learnerId,
    revision,
    command: 'start-session',
    payload: { mode: 'smart', goal: '10q' },
  });
  revision = step.revision;
  const startModel = step.payload.subjectReadModel;
  assert.equal(startModel?.subjectId, 'arithmetic', 'Arithmetic command did not return the Arithmetic read model.');
  assert.equal(startModel?.phase, 'session', 'Arithmetic practice did not start in session phase.');
  assert.equal(startModel?.session?.mode, 'smart', 'Arithmetic practice did not preserve smart mode.');
  assertPreMarkRedaction(startModel, 'arithmetic.practice.startModel');
  const content = assertArithmeticContent(startModel, 'arithmetic.practice.startModel');

  const question = startModel.session.currentQuestion;
  step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'arithmetic',
    learnerId,
    revision,
    command: 'submit-answer',
    payload: {
      expectedSessionId: startModel.session.id,
      expectedQuestionId: question.id,
      response: smokeIncorrectResponse(),
    },
  });
  revision = step.revision;
  const feedbackModel = step.payload.subjectReadModel;
  assert.equal(feedbackModel?.phase, 'session', 'Arithmetic practice submit did not stay in session feedback phase.');
  assert.equal(feedbackModel?.feedback?.result?.correct, false, 'Arithmetic practice smoke answer unexpectedly marked correct.');
  assert.equal(feedbackModel.feedback.result.score, 0, 'Arithmetic practice smoke answer unexpectedly scored marks.');
  assert.ok(feedbackModel.feedback.solutionLines?.length > 0, 'Arithmetic practice feedback did not expose a worked solution after marking.');
  assert.equal(Number(feedbackModel?.stats?.overview?.totalQuestions), 1, 'Arithmetic practice stats did not record one question.');

  return {
    revision,
    sessionId: startModel.session.id,
    questionId: question.id,
    score: feedbackModel.feedback.result.score,
    maxScore: feedbackModel.feedback.result.maxScore,
    content,
  };
}

async function smokeTrueTestMode({ origin, cookie, learnerId, revision }) {
  let step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'arithmetic',
    learnerId,
    revision,
    command: 'start-session',
    payload: { mode: 'test', testForm: 'short' },
  });
  revision = step.revision;
  const startModel = step.payload.subjectReadModel;
  assert.equal(startModel?.phase, 'test', 'Arithmetic test mode did not start in test phase.');
  assert.equal(startModel?.session?.mode, 'test', 'Arithmetic test mode did not preserve test mode.');
  assert.equal(startModel?.session?.paper?.length, 12, 'Arithmetic short test did not expose 12 questions.');
  assertPreMarkRedaction(startModel, 'arithmetic.test.startModel');

  const question = startModel.session.currentQuestion;
  step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'arithmetic',
    learnerId,
    revision,
    command: 'submit-answer',
    payload: {
      expectedSessionId: startModel.session.id,
      expectedQuestionId: question.id,
      index: startModel.session.currentIndex,
      response: smokeIncorrectResponse(),
      advance: false,
    },
  });
  revision = step.revision;
  const savedModel = step.payload.subjectReadModel;
  assert.equal(savedModel?.feedback, null, 'Arithmetic test mode exposed feedback before finish-test.');
  assert.equal(savedModel?.session?.paper?.[0]?.result, null, 'Arithmetic test mode marked before finish-test.');
  assertPreMarkRedaction(savedModel, 'arithmetic.test.savedModel');

  step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'arithmetic',
    learnerId,
    revision,
    command: 'finish-test',
    payload: {
      expectedSessionId: savedModel.session.id,
      expectedQuestionId: savedModel.session.currentQuestion.id,
      index: savedModel.session.currentIndex,
      response: savedModel.session.paper[0].response,
      advance: false,
    },
  });
  revision = step.revision;
  const summaryModel = step.payload.subjectReadModel;
  assert.equal(summaryModel?.phase, 'summary', 'Arithmetic finish-test did not reach summary.');
  assert.ok(summaryModel?.session?.paper?.[0]?.result, 'Arithmetic finish-test did not mark saved responses.');
  assert.ok(Number(summaryModel?.summary?.maxScore) >= 14, 'Arithmetic short test max score was lower than expected.');

  return {
    revision,
    sessionId: startModel.session.id,
    questionCount: startModel.session.paper.length,
    firstQuestionId: question.id,
    delayedFeedbackBeforeFinish: savedModel.feedback === null && savedModel.session.paper[0].result === null,
    summaryScore: summaryModel.summary.score,
    summaryMaxScore: summaryModel.summary.maxScore,
  };
}

async function smokeStaleWriteGuard({ origin, cookie, learnerId, revision }) {
  let step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'arithmetic',
    learnerId,
    revision,
    command: 'start-session',
    payload: { mode: 'smart', goal: '10q' },
  });
  revision = step.revision;
  const startModel = step.payload.subjectReadModel;
  const sessionId = startModel?.session?.id;
  const questionId = startModel?.session?.currentQuestion?.id;
  assert.ok(sessionId, 'Arithmetic stale-write guard did not start a session.');
  assert.ok(questionId, 'Arithmetic stale-write guard did not expose a current question.');

  step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'arithmetic',
    learnerId,
    revision,
    command: 'submit-answer',
    payload: {
      expectedSessionId: sessionId,
      expectedQuestionId: 'stale-question-id',
      response: { answer: '999999' },
    },
  });
  assert.equal(step.payload?.changed, false, 'Arithmetic stale question submit unexpectedly changed learner state.');
  assert.equal(step.revision, revision, 'Arithmetic stale question submit unexpectedly advanced learner revision.');
  assert.equal(Number(step.payload?.subjectReadModel?.session?.answered), 0, 'Arithmetic stale question submit recorded an answer.');

  return {
    expectedSessionId: sessionId,
    expectedQuestionId: 'stale-question-id',
    protectedQuestionId: questionId,
    changed: step.payload?.changed,
    revisionUnchanged: step.revision === revision,
    answeredCount: Number(step.payload?.subjectReadModel?.session?.answered) || 0,
  };
}

async function main() {
  const origin = configuredOrigin();
  const demo = await createDemoSession(origin);
  const bootstrap = await loadBootstrap(origin, demo.cookie, { expectedSession: demo.session });
  const immediate = await smokeImmediatePractice({
    origin,
    cookie: demo.cookie,
    learnerId: bootstrap.learnerId,
    revision: bootstrap.revision,
  });
  const trueTestMode = await smokeTrueTestMode({
    origin,
    cookie: demo.cookie,
    learnerId: bootstrap.learnerId,
    revision: immediate.revision,
  });
  const staleWriteGuard = await smokeStaleWriteGuard({
    origin,
    cookie: demo.cookie,
    learnerId: bootstrap.learnerId,
    revision: trueTestMode.revision,
  });

  const evidence = {
    ok: true,
    smokeType: argValue('--smoke-type', 'arithmetic-production'),
    environment: origin === 'https://ks2.eugnel.uk' ? 'production' : 'non-production',
    deployedUrl: origin,
    origin,
    contentReleaseId: ARITHMETIC_CONTENT_RELEASE_ID,
    learnerFixtureType: 'demo-session',
    accountId: demo.session.accountId,
    learnerId: bootstrap.learnerId,
    immediate,
    trueTestMode,
    staleWriteGuard,
    finishedAt: new Date().toISOString(),
  };

  const outPath = argValue('--out', '');
  if (outPath) {
    const absolute = path.resolve(ROOT_DIR, outPath);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(evidence, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[arithmetic-production-smoke] ${error?.stack || error?.message || error}`);
    process.exit(1);
  });
}
