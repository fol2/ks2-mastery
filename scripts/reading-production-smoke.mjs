#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  READING_CONTENT_RELEASE_ID,
  READING_CONTENT_VERSION,
  readingContentSummary,
  readingQuestionRefMap,
} from '../shared/reading/content.js';
import {
  configuredOrigin,
  createDemoSession,
  loadBootstrap,
  subjectCommand,
} from './lib/production-smoke.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), '..');
const QUESTION_REF_MAP = readingQuestionRefMap();

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function expectedContentSummary() {
  const summary = readingContentSummary();
  assert.equal(summary.releaseId, READING_CONTENT_RELEASE_ID);
  assert.equal(summary.version, READING_CONTENT_VERSION);
  assert.equal(summary.passageCount, 108);
  assert.equal(summary.questionCount, 1052);
  assert.equal(summary.paperCount, 41);
  assert.equal(summary.genres.fiction, 37);
  assert.equal(summary.genres['non-fiction'], 37);
  assert.equal(summary.genres.poetry, 34);
  assert.equal(summary.longPassageCount, 64);
  return summary;
}

function responseForQuestion(question) {
  assert.ok(question, 'Cannot build a Reading smoke response without a source question.');
  if (question.type === 'mcq') return { answer: Number(question.correct) };
  if (question.type === 'multiSelect') return { answer: (question.correctSet || []).map(Number) };
  if (question.type === 'match') return { map: { ...(question.correctMap || {}) } };
  if (question.type === 'order') {
    return {
      order: Object.fromEntries((question.correctPositions || []).map((position, index) => [index, position])),
    };
  }
  if (question.type === 'evidenceShort') {
    return {
      answer: question.modelAnswer || 'This answer uses evidence from the text.',
      evidence: question.evidenceCheck?.containsAny?.[0] || '',
    };
  }
  if (question.type === 'open') {
    return {
      answer: question.modelAnswer || 'This answer explains the text using relevant clues.',
      evidence: question.evidenceCheck?.containsAny?.[0] || '',
    };
  }
  return { answer: question.modelAnswer || 'Smoke response' };
}

function assertNoFeedbackLeak(model, label) {
  assert.equal(model?.feedback, null, `${label} exposed top-level feedback.`);
  assert.equal(model?.session?.result, null, `${label} exposed a session result.`);
  assert.equal(model?.session?.currentQuestion?.modelAnswer, undefined, `${label} exposed modelAnswer.`);
  assert.equal(model?.session?.currentQuestion?.explanation, undefined, `${label} exposed explanation.`);
}

function assertReadingContent(model, label) {
  const expected = expectedContentSummary();
  const observed = model?.content || model?.stats?.overview?.content || null;
  assert.equal(observed?.releaseId, expected.releaseId, `${label} releaseId mismatch.`);
  assert.equal(Number(observed?.version), expected.version, `${label} content version mismatch.`);
  assert.equal(Number(observed?.passageCount), expected.passageCount, `${label} passageCount mismatch.`);
  assert.equal(Number(observed?.questionCount), expected.questionCount, `${label} questionCount mismatch.`);
  assert.equal(Number(observed?.paperCount), expected.paperCount, `${label} paperCount mismatch.`);
  assert.equal(Number(observed?.longPassageCount), expected.longPassageCount, `${label} longPassageCount mismatch.`);
  return observed;
}

async function smokeImmediateRound({ origin, cookie, learnerId, revision }) {
  let step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'reading',
    learnerId,
    revision,
    command: 'start-session',
    payload: { mode: 'guided', focusSkillId: '2a', viewMode: 'one' },
  });
  revision = step.revision;
  const startModel = step.payload.subjectReadModel;
  assert.equal(startModel?.subjectId, 'reading', 'Reading command did not return the Reading read model.');
  assert.equal(startModel?.phase, 'question', 'Reading guided smoke did not start in question phase.');
  assert.equal(startModel?.session?.delayedFeedback, false, 'Guided Reading should use immediate feedback.');
  assertNoFeedbackLeak(startModel, 'reading.guided.startModel');
  const observedContent = assertReadingContent(startModel, 'reading.guided.startModel');

  const questionId = startModel.session.currentQuestion.id;
  const sourceQuestion = QUESTION_REF_MAP[questionId]?.question;
  const response = responseForQuestion(sourceQuestion);
  step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'reading',
    learnerId,
    revision,
    command: 'submit-answer',
    payload: {
      expectedSessionId: startModel.session.id,
      expectedQuestionId: questionId,
      response,
    },
  });
  revision = step.revision;
  const feedbackModel = step.payload.subjectReadModel;
  if (!['feedback', 'summary'].includes(feedbackModel?.phase)) {
    console.error(JSON.stringify({
      label: 'reading.guided.feedback.phase',
      startSessionId: startModel?.session?.id || null,
      expectedQuestionId: questionId,
      revision,
      changed: step.payload?.changed,
      mutation: step.payload?.mutation || null,
      observedPhase: feedbackModel?.phase || null,
      observedError: feedbackModel?.error || '',
      observedSession: feedbackModel?.session ? {
        id: feedbackModel.session.id || null,
        questionCount: feedbackModel.session.questionCount || null,
      } : null,
    }, null, 2));
  }
  assert.ok(['feedback', 'summary'].includes(feedbackModel?.phase), 'Reading submit did not return a marked phase.');
  const feedbackResult = feedbackModel?.feedback?.result || feedbackModel?.session?.result || {};
  const overview = feedbackModel?.stats?.overview || {};
  const feedbackScore = Number.isFinite(Number(feedbackResult.score)) ? Number(feedbackResult.score) : Number(overview.correct);
  const feedbackMaxScore = Number.isFinite(Number(feedbackResult.maxScore)) ? Number(feedbackResult.maxScore) : Number(overview.totalQuestions);
  assert.ok(Number.isFinite(feedbackScore), `Reading smoke result score was not numeric for ${questionId}.`);
  assert.ok(Number.isFinite(feedbackMaxScore), `Reading smoke result maxScore was not numeric for ${questionId}.`);
  assert.ok(feedbackMaxScore > 0, `Reading smoke result maxScore was not positive for ${questionId}.`);
  assert.equal(
    feedbackScore,
    feedbackMaxScore,
    `Reading smoke answer was not accepted for ${questionId}.`,
  );

  return {
    revision,
    questionId,
    passageId: startModel.session.passage?.id || startModel.session.passageId || null,
    content: observedContent,
    score: feedbackScore,
    maxScore: feedbackMaxScore,
  };
}

async function smokeDelayedPaper({ origin, cookie, learnerId, revision }) {
  let step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'reading',
    learnerId,
    revision,
    command: 'start-session',
    payload: { mode: 'test', viewMode: 'one', paperId: 'paper_i' },
  });
  revision = step.revision;
  const startModel = step.payload.subjectReadModel;
  assert.equal(startModel?.phase, 'question', 'Reading paper smoke did not start in question phase.');
  assert.equal(startModel?.session?.strict, true, 'Reading paper smoke did not expose strict paper mode.');
  assert.equal(startModel?.session?.delayedFeedback, true, 'Reading paper smoke did not expose delayed feedback.');
  assertNoFeedbackLeak(startModel, 'reading.paper.startModel');

  const questionId = startModel.session.currentQuestion.id;
  const sourceQuestion = QUESTION_REF_MAP[questionId]?.question;
  step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'reading',
    learnerId,
    revision,
    command: 'submit-answer',
    payload: {
      expectedSessionId: startModel.session.id,
      expectedQuestionId: questionId,
      response: responseForQuestion(sourceQuestion),
    },
  });
  revision = step.revision;
  const submittedModel = step.payload.subjectReadModel;
  assert.equal(submittedModel?.phase, 'question', 'Delayed Reading submit should remain in question phase.');
  assertNoFeedbackLeak(submittedModel, 'reading.paper.submittedModel');
  assert.equal(submittedModel?.session?.answeredCount, 1, 'Delayed Reading submit did not save the draft answer.');
  assert.equal(submittedModel?.session?.markedCount, 0, 'Delayed Reading submit marked before paper end.');

  step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'reading',
    learnerId,
    revision,
    command: 'mark-section',
  });
  revision = step.revision;
  const sectionMarkedModel = step.payload.subjectReadModel;
  assert.match(sectionMarkedModel?.error || '', /whole paper/i, 'Strict Reading paper allowed section-level marking.');
  assert.equal(sectionMarkedModel?.session?.markedCount, 0, 'Strict Reading paper section mark produced results.');

  step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'reading',
    learnerId,
    revision,
    command: 'mark-session',
  });
  revision = step.revision;
  const summaryModel = step.payload.subjectReadModel;
  assert.equal(summaryModel?.error || '', '', 'Reading mark-session left a stale section-mark error.');
  assert.equal(summaryModel?.phase, 'summary', 'Reading mark-session did not reach summary.');
  assert.equal(summaryModel?.summary?.paperId, 'paper_i', 'Reading paper summary did not preserve paper id.');
  assert.equal(summaryModel?.summary?.questionCount, 26, 'Reading paper_i did not mark all questions.');
  assert.equal(summaryModel?.summary?.maxScore, 50, 'Reading paper_i max score was not 50.');

  return {
    revision,
    paperId: summaryModel.summary.paperId,
    questionCount: summaryModel.summary.questionCount,
    maxScore: summaryModel.summary.maxScore,
    staleErrorCleared: true,
  };
}

async function smokeStaleWriteGuard({ origin, cookie, learnerId, revision }) {
  const staleQuestionId = 'stale-question-id';
  let step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'reading',
    learnerId,
    revision,
    command: 'start-session',
    payload: { mode: 'guided', viewMode: 'one' },
  });
  revision = step.revision;
  const startModel = step.payload.subjectReadModel;
  const sessionId = startModel?.session?.id;
  const questionId = startModel?.session?.currentQuestion?.id;
  assert.ok(sessionId, 'Reading stale-write guard did not start a session.');
  assert.ok(questionId, 'Reading stale-write guard did not expose a current question.');

  step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'reading',
    learnerId,
    revision,
    command: 'save-response',
    payload: {
      expectedSessionId: sessionId,
      expectedQuestionId: staleQuestionId,
      response: { answer: 'this stale write must not persist' },
    },
  });
  const guardedModel = step.payload.subjectReadModel;
  const sessionResponses = guardedModel?.session?.responses || {};
  const sectionResponses = guardedModel?.session?.currentSection?.responses || {};
  const stalePersistedResponse = sessionResponses[staleQuestionId]
    || sectionResponses[staleQuestionId]
    || null;
  const protectedPersistedResponse = sessionResponses[questionId]
    || sectionResponses[questionId]
    || null;
  assert.equal(step.payload?.changed, false, 'Reading stale question save unexpectedly changed learner state.');
  assert.equal(step.revision, revision, 'Reading stale question save unexpectedly advanced learner revision.');
  assert.equal(stalePersistedResponse, null, 'Reading stale question save persisted a response under the stale key.');
  assert.equal(protectedPersistedResponse, null, 'Reading stale question save persisted a response under the active key.');

  return {
    expectedSessionId: sessionId,
    expectedQuestionId: staleQuestionId,
    protectedQuestionId: questionId,
    changed: step.payload?.changed,
    revisionUnchanged: step.revision === revision,
    staleResponsePersisted: false,
    protectedQuestionResponsePersisted: false,
  };
}

async function main() {
  const origin = configuredOrigin();
  const demo = await createDemoSession(origin);
  const bootstrap = await loadBootstrap(origin, demo.cookie, { expectedSession: demo.session });
  const immediate = await smokeImmediateRound({
    origin,
    cookie: demo.cookie,
    learnerId: bootstrap.learnerId,
    revision: bootstrap.revision,
  });
  const delayedPaper = await smokeDelayedPaper({
    origin,
    cookie: demo.cookie,
    learnerId: bootstrap.learnerId,
    revision: immediate.revision,
  });
  const staleWriteGuard = await smokeStaleWriteGuard({
    origin,
    cookie: demo.cookie,
    learnerId: bootstrap.learnerId,
    revision: delayedPaper.revision,
  });

  const evidence = {
    ok: true,
    smokeType: argValue('--smoke-type', 'reading-production'),
    environment: origin === 'https://ks2.eugnel.uk' ? 'production' : 'non-production',
    deployedUrl: origin,
    origin,
    contentReleaseId: READING_CONTENT_RELEASE_ID,
    contentVersion: READING_CONTENT_VERSION,
    productionReportedCommitSha: null,
    learnerFixtureType: 'demo-session',
    accountId: demo.session.accountId,
    learnerId: bootstrap.learnerId,
    immediate,
    delayedPaper,
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
    console.error(`[reading-production-smoke] ${error?.stack || error?.message || error}`);
    process.exit(1);
  });
}
