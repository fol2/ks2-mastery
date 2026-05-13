#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  REASONING_CONTENT_RELEASE_ID,
  REASONING_TEMPLATES,
  generateReasoningQuestion,
  reasoningContentSummary,
} from '../shared/reasoning/content.js';
import {
  configuredOrigin,
  createDemoSession,
  getJson,
  loadBootstrap,
  subjectCommand,
} from './lib/production-smoke.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), '..');
export const DEFAULT_REASONING_PRODUCTION_SMOKE_REPORT = path.join('reports', 'reasoning', 'reasoning-production-smoke-current.json');
const FORBIDDEN_REASONING_READ_MODEL_KEYS = new Set(['evaluate']);
const FORBIDDEN_REASONING_EARLY_HINT_KEYS = new Set([
  'templateId',
  'templateLabel',
  'domain',
  'skillIds',
  'skillNames',
  'solutionLines',
  'checkLine',
  'reflectionPrompt',
  'answerText',
  'feedbackLong',
  'misconception',
]);

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function unique(values) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function wrongResult(question) {
  try {
    return question.evaluate({});
  } catch {
    return {};
  }
}

function sourceTextForQuestion(question) {
  const result = wrongResult(question);
  return [
    result.answerText,
    result.feedbackLong,
    result.feedbackShort,
    ...(question.solutionLines || []),
    question.stemHtml,
    question.visualHtml,
  ].filter(Boolean).join(' | ');
}

function addAnswerTextVariants(target, text) {
  const value = String(text || '').trim();
  if (!value) return;
  target.push(value);
  target.push(value.replace(/(\d),(?=\d{3}\b)/g, '$1'));
}

function answerTokens(text) {
  return [...String(text || '').matchAll(/\d{1,2}:\d{2}|\d+\/\d+|-?£?\d+(?:,\d{3})*(?:\.\d+)?|[<>]=?|=|\b(?:yes|no|Yes|No)\b|\b[A-D]\b/g)]
    .map((match) => match[0]);
}

function numericCandidates(text) {
  const values = [];
  for (const token of answerTokens(text)) {
    const raw = token.replace(/[£,]/g, '');
    if (!/^-?\d+(?:\.\d+)?$/.test(raw)) continue;
    values.push(raw);
    const numberValue = Number(raw);
    if (Number.isFinite(numberValue)) {
      values.push(String(numberValue));
      if (Number.isInteger(numberValue)) values.push(String(Math.trunc(numberValue)));
      values.push(numberValue.toFixed(2));
    }
  }
  for (let value = -5; value <= 200; value += 1) values.push(String(value));
  return unique(values).slice(0, 100);
}

function textCandidates(text, inputSpec = {}) {
  const source = String(text || '');
  const values = [];
  addAnswerTextVariants(values, source);
  for (const part of source.split(/[;|]/)) addAnswerTextVariants(values, part);
  for (const match of source.matchAll(/(?:start|break|arrive|home|end|away|wait)\s+((?:\d{1,2}:\d{2})|(?:-?£?\d+(?:,\d{3})*(?:\.\d+)?))/ig)) {
    values.push(match[1], match[1].replace(/[£,]/g, ''));
  }
  for (const token of answerTokens(source)) {
    values.push(token);
    values.push(token.replace(/[£,]/g, ''));
  }
  for (const field of inputSpec.fields || []) {
    for (const [value, label] of field.options || []) values.push(value, label);
  }
  values.push('yes', 'no', 'Yes', 'No', 'A', 'B', 'C', 'D', '<', '>', '=');
  return unique(values).slice(0, 100);
}

function candidatesForField(question, field) {
  const source = sourceTextForQuestion(question);
  if (field.kind === 'radio' || field.kind === 'select') {
    return unique((field.options || []).flatMap(([value, label]) => [value, label]));
  }
  if (field.kind === 'number') return numericCandidates(source);
  return textCandidates(source, question.inputSpec);
}

function candidateFieldsFor(question) {
  const inputSpec = question.inputSpec || {};
  const source = sourceTextForQuestion(question);
  if (inputSpec.type === 'number') return [{ key: 'answer', values: numericCandidates(source) }];
  if (inputSpec.type === 'text') return [{ key: 'answer', values: textCandidates(source, inputSpec) }];
  if (inputSpec.type === 'multi') {
    return (inputSpec.fields || []).map((field) => ({
      key: field.key,
      values: candidatesForField(question, field),
    }));
  }
  return [{ key: 'answer', values: textCandidates(source, inputSpec) }];
}

export function reasoningCorrectResponseFor(question, { maxChecks = 120_000 } = {}) {
  const fields = candidateFieldsFor(question);
  let best = { response: {}, result: null, score: -1, checked: 0 };

  function visit(index, response) {
    if (best.checked > maxChecks) return;
    if (index >= fields.length) {
      best.checked += 1;
      const result = question.evaluate(response);
      const score = Number(result.score) || 0;
      if (result.correct || score > best.score) {
        best = { response: { ...response }, result, score, checked: best.checked };
      }
      return;
    }
    const field = fields[index];
    for (const value of field.values) visit(index + 1, { ...response, [field.key]: value });
  }

  visit(0, {});
  assert.equal(
    best.result?.correct,
    true,
    `Could not derive a correct smoke response for ${question.itemId}; best score ${best.score}/${best.result?.maxScore ?? '?'}.`,
  );
  return best.response;
}

export function parseReasoningQuestionId(itemId) {
  const raw = String(itemId || '');
  const separator = raw.lastIndexOf(':');
  assert.ok(separator > 0, `Reasoning item id was not template:seed shaped: ${raw}`);
  const templateId = raw.slice(0, separator);
  const seed = Number(raw.slice(separator + 1));
  assert.ok(REASONING_TEMPLATES.some((template) => template.id === templateId), `Unknown Reasoning template id: ${templateId}`);
  assert.equal(Number.isInteger(seed), true, `Reasoning seed was not an integer: ${raw}`);
  return { templateId, seed };
}

export function assertReasoningContentSummary(summary, label = 'reasoning.content') {
  assert.equal(summary?.releaseId, REASONING_CONTENT_RELEASE_ID, `${label}.releaseId mismatch.`);
  assert.equal(Number(summary?.templateCount), 124, `${label}.templateCount mismatch.`);
  assert.equal(Number(summary?.skillCount), 17, `${label}.skillCount mismatch.`);
  assert.equal(Number(summary?.misconceptionCount), 20, `${label}.misconceptionCount mismatch.`);
  assert.equal(Number(summary?.satsFriendlyCount), 123, `${label}.satsFriendlyCount mismatch.`);
  assert.deepEqual(summary, reasoningContentSummary(), `${label} no longer matches the local Reasoning content summary.`);
}

export function assertNoReasoningMarkerLeak(value, pathLabel = 'reasoning.readModel') {
  if (value == null) return;
  assert.notEqual(typeof value, 'function', `${pathLabel} exposed a function.`);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoReasoningMarkerLeak(entry, `${pathLabel}[${index}]`));
    return;
  }
  if (typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(FORBIDDEN_REASONING_READ_MODEL_KEYS.has(key), false, `${pathLabel}.${key} exposed a server-only marker.`);
    assertNoReasoningMarkerLeak(child, `${pathLabel}.${key}`);
  }
}

export function assertNoEarlyReasoningHints(value, pathLabel = 'reasoning.session') {
  if (value == null) return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoEarlyReasoningHints(entry, `${pathLabel}[${index}]`));
    return;
  }
  if (typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(FORBIDDEN_REASONING_EARLY_HINT_KEYS.has(key), false, `${pathLabel}.${key} exposed an early Reasoning hint.`);
    assertNoEarlyReasoningHints(child, `${pathLabel}.${key}`);
  }
}

function blankReasoningResponse(question = {}) {
  const inputSpec = question.inputSpec || {};
  if (inputSpec.type === 'multi') {
    return Object.fromEntries((inputSpec.fields || []).map((field) => [field.key, '']));
  }
  return { answer: '' };
}

function currentSourceCommit() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

async function optionalHeroReadModel({ origin, cookie, learnerId }) {
  const result = await getJson(origin, `/api/hero/read-model?learnerId=${encodeURIComponent(learnerId)}`, { cookie });
  if (result.response.status === 404 && result.payload?.code === 'hero_shadow_disabled') {
    return { checked: true, available: false, status: 404, reason: 'hero_shadow_disabled' };
  }
  assert.ok(result.response.ok, `Hero read model failed with ${result.response.status}: ${JSON.stringify(result.payload)}`);
  const eligibleSubjects = result.payload?.hero?.eligibleSubjects || [];
  const reasoningEligible = eligibleSubjects.some((entry) => entry?.subjectId === 'reasoning');
  assert.equal(
    reasoningEligible,
    true,
    `Hero read model is available, but Reasoning is not eligible: ${JSON.stringify(eligibleSubjects)}`,
  );
  return {
    checked: true,
    available: true,
    status: result.response.status,
    eligibleSubjects,
    reasoningEligible,
  };
}

async function runSmoke() {
  const origin = configuredOrigin();
  const outPath = argValue('--out', DEFAULT_REASONING_PRODUCTION_SMOKE_REPORT);
  const startedAt = new Date().toISOString();
  const demo = await createDemoSession(origin);
  let { learnerId, revision } = await loadBootstrap(origin, demo.cookie, { expectedSession: demo.session });

  let step = await subjectCommand({
    origin,
    cookie: demo.cookie,
    subjectId: 'reasoning',
    learnerId,
    revision,
    command: 'start-session',
    payload: { mode: 'smart', viewMode: 'one', roundLength: 3 },
  });
  revision = step.revision;
  const startModel = step.payload.subjectReadModel;
  assert.equal(startModel?.subjectId, 'reasoning', 'Reasoning start did not return the Reasoning read model.');
  assert.equal(startModel?.phase, 'session', 'Reasoning SATs smoke did not start a session.');
  assert.equal(startModel?.session?.strict, false, 'Reasoning support smoke should start outside strict mode.');
  assert.equal(startModel?.session?.delayedFeedback, false, 'Reasoning single-question surface should use immediate feedback.');
  assertReasoningContentSummary(startModel?.content, 'reasoning.startModel.content');
  assertNoReasoningMarkerLeak(startModel, 'reasoning.startModel');

  const currentQuestion = startModel.session.currentQuestion;
  assert.ok(currentQuestion?.id, 'Reasoning start did not expose a current question id.');
  assert.doesNotMatch(currentQuestion.id, /^[a-z0-9_]+:\d+$/i, 'Reasoning exposed a template-shaped question id before marking/support.');
  assert.equal(currentQuestion.id, currentQuestion.itemId, 'Reasoning public question id and item id should agree.');
  assertNoEarlyReasoningHints(startModel.session.currentQuestion, 'reasoning.startModel.session.currentQuestion');
  assertNoEarlyReasoningHints(startModel.session.questionNav, 'reasoning.startModel.session.questionNav');
  const blankResponse = blankReasoningResponse(currentQuestion);

  step = await subjectCommand({
    origin,
    cookie: demo.cookie,
    subjectId: 'reasoning',
    learnerId,
    revision,
    command: 'submit-answer',
    payload: {
      expectedSessionId: startModel.session.id,
      expectedQuestionId: currentQuestion.id,
      response: blankResponse,
    },
  });
  revision = step.revision;
  const firstWrongModel = step.payload.subjectReadModel;
  assert.equal(firstWrongModel?.subjectId, 'reasoning', 'Reasoning first submit did not return the Reasoning read model.');
  assert.equal(firstWrongModel?.phase, 'session', 'Reasoning first-wrong nudge should keep the session active.');
  assert.equal(firstWrongModel?.feedback?.final, false, 'Reasoning first-wrong feedback should be non-final.');
  assert.equal(firstWrongModel?.feedback?.result?.answerText, undefined, 'Reasoning first-wrong feedback exposed answer text.');
  assert.equal(firstWrongModel?.feedback?.result?.feedbackLong, undefined, 'Reasoning first-wrong feedback exposed full feedback.');
  assertNoReasoningMarkerLeak(firstWrongModel, 'reasoning.firstWrongModel');
  assertNoEarlyReasoningHints(firstWrongModel.session.currentQuestion, 'reasoning.firstWrongModel.session.currentQuestion');
  assertNoEarlyReasoningHints(firstWrongModel.feedback?.question, 'reasoning.firstWrongModel.feedback.question');

  step = await subjectCommand({
    origin,
    cookie: demo.cookie,
    subjectId: 'reasoning',
    learnerId,
    revision,
    command: 'request-support',
    payload: {
      expectedSessionId: startModel.session.id,
      expectedQuestionId: currentQuestion.id,
      kind: 'worked',
    },
  });
  revision = step.revision;
  const supportModel = step.payload.subjectReadModel;
  assert.equal(supportModel?.subjectId, 'reasoning', 'Reasoning support did not return the Reasoning read model.');
  assert.equal(supportModel?.session?.supportLevel, 2, 'Reasoning worked support was not applied.');
  assert.ok(Array.isArray(supportModel?.session?.currentQuestion?.solutionLines), 'Reasoning support did not expose worked solution lines.');
  assertNoReasoningMarkerLeak(supportModel, 'reasoning.supportModel');

  step = await subjectCommand({
    origin,
    cookie: demo.cookie,
    subjectId: 'reasoning',
    learnerId,
    revision,
    command: 'submit-answer',
    payload: {
      expectedSessionId: startModel.session.id,
      expectedQuestionId: currentQuestion.id,
      response: blankResponse,
    },
  });
  revision = step.revision;
  const markedModel = step.payload.subjectReadModel;
  assert.equal(markedModel?.subjectId, 'reasoning', 'Reasoning supported submit did not return the Reasoning read model.');
  assert.equal(markedModel?.feedback?.final, true, 'Reasoning supported submit did not finalise the question.');
  assert.equal(Number(markedModel?.stats?.overview?.totalQuestions), 1, 'Reasoning supported submit did not update practice history.');
  assert.equal(Number(markedModel?.stats?.overview?.evidenceStars), 0, 'Reasoning supported submit should not award independent evidence.');
  assertNoReasoningMarkerLeak(markedModel, 'reasoning.markedModel');

  const domainEvents = step.payload.domainEvents || [];
  const reactionEvents = step.payload.reactionEvents || [];
  assert.ok(domainEvents.some((event) => event.type === 'reasoning.answer-submitted'), 'Reasoning answer-submitted event was not emitted.');
  assert.equal(domainEvents.some((event) => event.type === 'reasoning.evidence-earned'), false, 'Supported Reasoning smoke emitted independent evidence.');
  assert.ok(reactionEvents.every((event) => event.subjectId === 'reasoning'), 'Reasoning reward reactions included another subject.');

  const heroReadModel = await optionalHeroReadModel({ origin, cookie: demo.cookie, learnerId });

  const report = {
    ok: true,
    origin,
    sourceCommit: currentSourceCommit(),
    startedAt,
    finishedAt: new Date().toISOString(),
    learnerId,
    finalRevision: revision,
    contentReleaseId: REASONING_CONTENT_RELEASE_ID,
    content: markedModel.content,
    session: {
      id: startModel.session.id,
      mode: startModel.session.mode,
      questionId: currentQuestion.id,
      publicQuestionIdOpaque: !/^[a-z0-9_]+:\d+$/i.test(currentQuestion.id),
      firstWrongFinal: firstWrongModel.feedback.final,
      supportLevel: supportModel.session.supportLevel,
      markedCorrect: Boolean(markedModel.session?.result?.correct),
      score: markedModel.session?.result?.score ?? null,
      maxScore: markedModel.session?.result?.maxScore ?? null,
    },
    rewardProjection: {
      domainEvents: domainEvents.map((event) => event.type),
      reactionSubjects: reactionEvents.map((event) => event.subjectId),
      reactionCount: reactionEvents.length,
    },
    heroReadModel,
  };

  mkdirSync(path.dirname(path.resolve(ROOT_DIR, outPath)), { recursive: true });
  writeFileSync(path.resolve(ROOT_DIR, outPath), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export async function main() {
  try {
    const report = await runSmoke();
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(`[reasoning-production-smoke] ${error?.stack || error?.message || error}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
