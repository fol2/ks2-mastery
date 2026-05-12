#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  READING_CONTENT_RELEASE_ID,
  READING_CONTENT_VERSION,
  readingPassageMap,
  readingQuestionRefMap,
} from '../shared/reading/content.js';
import {
  assertNoForbiddenObjectKeys,
  configuredOrigin,
  createDemoSession,
  loadBootstrap,
  subjectCommand,
} from './lib/production-smoke.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), '..');
const PASSAGE_MAP = readingPassageMap();
const QUESTION_REF_MAP = readingQuestionRefMap();
const FEEDBACK_ONLY_KEYS = new Set(['modelAnswer', 'explanation']);
const HIGH_DEPTH_TYPES = new Set(['open', 'evidenceShort', 'match', 'order']);

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function firstArgValue(names, fallback = '') {
  for (const name of names) {
    const value = argValue(name, '');
    if (value) return value;
  }
  return fallback;
}

function responseForQuestion(question) {
  assert.ok(question, 'Cannot build a Reading stretch smoke response without a source question.');
  if (question.type === 'mcq') return { answer: Number(question.correct) };
  if (question.type === 'multiSelect') return { answer: (question.correctSet || []).map(Number) };
  if (question.type === 'match') return { map: { ...(question.correctMap || {}) } };
  if (question.type === 'order') {
    return {
      order: Object.fromEntries((question.correctPositions || []).map((position, index) => [index, position])),
    };
  }
  if (question.type === 'evidenceShort' || question.type === 'open') {
    return {
      answer: question.modelAnswer || 'This answer explains the text using relevant evidence.',
      evidence: question.evidenceCheck?.containsAny?.[0] || '',
    };
  }
  return { answer: question.modelAnswer || 'Smoke response' };
}

function assertNoDelayedFeedbackLeak(model, label) {
  assert.equal(model?.feedback, null, `${label} exposed top-level feedback.`);
  assert.equal(model?.session?.result, null, `${label} exposed a session result.`);
  assertNoForbiddenObjectKeys(model?.session?.currentQuestion, FEEDBACK_ONLY_KEYS, `${label}.currentQuestion`);
  assertNoForbiddenObjectKeys(model?.session?.questions, FEEDBACK_ONLY_KEYS, `${label}.questions`);
}

function sourceDetails(questionIds) {
  return questionIds.map((questionId) => {
    const ref = QUESTION_REF_MAP[questionId];
    assert.ok(ref?.question, `Reading stretch smoke could not resolve question ${questionId}.`);
    return {
      id: questionId,
      passageId: ref.passageId,
      type: ref.question.type,
      skill: ref.question.skill,
      marks: ref.question.marks,
    };
  });
}

async function main() {
  const origin = configuredOrigin();
  const commitSha = firstArgValue(
    ['--commit-sha', '--expected-commit-sha'],
    process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA || '',
  );
  const staleSetupPayload = {
    mode: 'stretch',
    viewMode: 'one',
    difficulty: '1',
    focusSkillId: 'P1',
  };

  const demo = await createDemoSession(origin);
  const bootstrap = await loadBootstrap(origin, demo.cookie, { expectedSession: demo.session });

  let step = await subjectCommand({
    origin,
    cookie: demo.cookie,
    subjectId: 'reading',
    learnerId: bootstrap.learnerId,
    revision: bootstrap.revision,
    command: 'start-session',
    payload: staleSetupPayload,
  });
  let revision = step.revision;
  const startModel = step.payload.subjectReadModel;
  assert.equal(startModel?.subjectId, 'reading', 'Reading stretch smoke did not return a Reading read model.');
  assert.equal(startModel?.phase, 'question', 'Reading stretch smoke did not start in question phase.');
  assert.equal(startModel?.releaseId, READING_CONTENT_RELEASE_ID, 'Reading stretch release id mismatch.');
  assert.equal(Number(startModel?.content?.version), READING_CONTENT_VERSION, 'Reading stretch content version mismatch.');
  assert.equal(startModel?.session?.mode, 'stretch', 'Reading stretch smoke did not start stretch mode.');
  assert.equal(startModel?.session?.strict, false, 'Reading stretch smoke should not be strict paper mode.');
  assert.equal(startModel?.session?.delayedFeedback, true, 'Reading stretch smoke should use delayed feedback.');
  assert.equal(Number(startModel?.session?.questionCount), 6, 'Reading stretch smoke did not expose six questions.');
  assertNoDelayedFeedbackLeak(startModel, 'reading.stretch.startModel');

  const passage = startModel.session.passage || null;
  assert.ok(passage?.id, 'Reading stretch smoke did not expose a passage.');
  const sourcePassage = PASSAGE_MAP[passage.id];
  assert.ok(sourcePassage?.isLong || Number(sourcePassage?.difficulty) >= 4, 'Reading stretch selected a passage outside the long or high-difficulty contract.');

  const questionIds = (startModel.session.questionNav || []).map((entry) => entry.id).filter(Boolean);
  assert.equal(questionIds.length, 6, 'Reading stretch smoke did not expose six question ids.');
  const questionDetails = sourceDetails(questionIds);
  assert.equal(questionDetails.some((question) => String(question.skill || '').startsWith('P')), false, 'Reading stretch selected punctuation-only support items.');
  assert.ok(new Set(questionDetails.map((question) => question.type)).size >= 3, 'Reading stretch did not expose enough question-type variety.');
  assert.equal(questionDetails.some((question) => HIGH_DEPTH_TYPES.has(question.type)), true, 'Reading stretch did not include a high-depth question type.');

  const firstQuestionId = questionIds[0];
  const firstQuestion = QUESTION_REF_MAP[firstQuestionId].question;
  step = await subjectCommand({
    origin,
    cookie: demo.cookie,
    subjectId: 'reading',
    learnerId: bootstrap.learnerId,
    revision,
    command: 'submit-answer',
    payload: {
      expectedSessionId: startModel.session.id,
      expectedQuestionId: firstQuestionId,
      response: responseForQuestion(firstQuestion),
    },
  });
  revision = step.revision;
  const submittedModel = step.payload.subjectReadModel;
  assert.equal(submittedModel?.phase, 'question', 'Reading stretch submit should keep delayed-feedback sessions in question phase.');
  assert.equal(Number(submittedModel?.session?.answeredCount), 1, 'Reading stretch submit did not save the draft response.');
  assert.equal(Number(submittedModel?.session?.markedCount), 0, 'Reading stretch submit marked before challenge end.');
  assertNoDelayedFeedbackLeak(submittedModel, 'reading.stretch.submittedModel');

  step = await subjectCommand({
    origin,
    cookie: demo.cookie,
    subjectId: 'reading',
    learnerId: bootstrap.learnerId,
    revision,
    command: 'mark-section',
    payload: {
      expectedSessionId: startModel.session.id,
      expectedSectionIndex: 0,
    },
  });
  revision = step.revision;
  const markedModel = step.payload.subjectReadModel;
  assert.equal(markedModel?.phase, 'summary', 'Reading stretch mark-section did not complete the challenge.');
  assert.equal(markedModel?.summary?.mode, 'stretch', 'Reading stretch summary did not preserve stretch mode.');
  assert.equal(Number(markedModel?.summary?.questionCount), 6, 'Reading stretch summary did not mark all six questions.');
  assert.ok(Number(markedModel?.summary?.maxScore) > 0, 'Reading stretch summary maxScore was not positive.');

  const finishedAt = new Date().toISOString();
  const evidence = {
    ok: true,
    smokeType: 'reading-stretch-production',
    environment: origin === 'https://ks2.eugnel.uk' ? 'production' : 'non-production',
    deployedUrl: origin,
    origin,
    contentReleaseId: READING_CONTENT_RELEASE_ID,
    contentVersion: READING_CONTENT_VERSION,
    commitSha: commitSha || null,
    commitShaSource: commitSha ? 'cli-or-ci-expected' : null,
    learnerFixtureType: 'demo-session',
    accountId: demo.session.accountId,
    learnerId: bootstrap.learnerId,
    staleSetupPayload,
    session: {
      id: startModel.session.id,
      passage: {
        id: passage.id,
        title: passage.title,
        difficulty: passage.difficulty,
        isLong: passage.isLong,
        wordCount: passage.wordCount,
      },
      strict: startModel.session.strict,
      delayedFeedback: startModel.session.delayedFeedback,
      questionCount: startModel.session.questionCount,
      questionDetails,
      selectedQuestionTypeCount: new Set(questionDetails.map((question) => question.type)).size,
      hasHighDepthQuestionType: questionDetails.some((question) => HIGH_DEPTH_TYPES.has(question.type)),
      hasPunctuationOnlyQuestion: questionDetails.some((question) => String(question.skill || '').startsWith('P')),
    },
    submitted: {
      questionId: firstQuestionId,
      phase: submittedModel.phase,
      answeredCount: submittedModel.session.answeredCount,
      markedCount: submittedModel.session.markedCount,
      delayedFeedbackLeakPrevented: true,
    },
    marked: {
      phase: markedModel.phase,
      summary: markedModel.summary,
    },
    finalRevision: revision,
    timestamp: finishedAt,
    finishedAt,
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
    console.error(`[reading-stretch-production-smoke] ${error?.stack || error?.message || error}`);
    process.exit(1);
  });
}
