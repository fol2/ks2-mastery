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
const FORBIDDEN_REASONING_READ_MODEL_KEYS = new Set(['evaluate']);

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
  assert.equal(Number(summary?.templateCount), 110, `${label}.templateCount mismatch.`);
  assert.equal(Number(summary?.skillCount), 17, `${label}.skillCount mismatch.`);
  assert.equal(Number(summary?.misconceptionCount), 20, `${label}.misconceptionCount mismatch.`);
  assert.equal(Number(summary?.satsFriendlyCount), 110, `${label}.satsFriendlyCount mismatch.`);
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
  const outPath = argValue('--out', path.join('reports', 'reasoning', 'reasoning-production-smoke-2026-05-11.json'));
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
    payload: { mode: 'sats', viewMode: 'one' },
  });
  revision = step.revision;
  const startModel = step.payload.subjectReadModel;
  assert.equal(startModel?.subjectId, 'reasoning', 'Reasoning start did not return the Reasoning read model.');
  assert.equal(startModel?.phase, 'session', 'Reasoning SATs smoke did not start a session.');
  assert.equal(startModel?.session?.strict, true, 'Reasoning SATs smoke did not expose strict mode.');
  assert.equal(startModel?.session?.delayedFeedback, false, 'Reasoning SATs single should use immediate completion.');
  assertReasoningContentSummary(startModel?.content, 'reasoning.startModel.content');
  assertNoReasoningMarkerLeak(startModel, 'reasoning.startModel');

  const currentQuestion = startModel.session.currentQuestion;
  assert.ok(currentQuestion?.id, 'Reasoning start did not expose a current question id.');
  const { templateId, seed } = parseReasoningQuestionId(currentQuestion.id);
  const sourceQuestion = generateReasoningQuestion(templateId, seed);
  const response = reasoningCorrectResponseFor(sourceQuestion);

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
      response,
    },
  });
  revision = step.revision;
  const summaryModel = step.payload.subjectReadModel;
  assert.equal(summaryModel?.subjectId, 'reasoning', 'Reasoning submit did not return the Reasoning read model.');
  assert.equal(summaryModel?.phase, 'summary', 'Reasoning SATs single did not complete to summary.');
  assert.equal(summaryModel?.summary?.questionCount, 1, 'Reasoning SATs single summary did not include one question.');
  assert.equal(summaryModel?.summary?.score, summaryModel?.summary?.maxScore, 'Reasoning correct smoke answer was not accepted.');
  assert.ok(Number(summaryModel?.stats?.overview?.evidenceStars) >= 1, 'Reasoning evidence star was not recorded.');
  assertNoReasoningMarkerLeak(summaryModel, 'reasoning.summaryModel');

  const domainEvents = step.payload.domainEvents || [];
  const reactionEvents = step.payload.reactionEvents || [];
  assert.ok(domainEvents.some((event) => event.type === 'reasoning.evidence-earned'), 'Reasoning evidence event was not emitted.');
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
    content: summaryModel.content,
    session: {
      id: startModel.session.id,
      mode: startModel.session.mode,
      questionId: currentQuestion.id,
      templateId,
      seed,
      score: summaryModel.summary.score,
      maxScore: summaryModel.summary.maxScore,
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
