import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REASONING_TEMPLATES,
  evaluateReasoningQuestion,
  generateReasoningQuestion,
  reasoningContentSummary,
  safeReasoningQuestion,
} from '../shared/reasoning/content.js';
import { reasoningContentSummary as publicReasoningContentSummary } from '../shared/reasoning/metadata.js';

test('reasoning content bank exposes 110 safe template families without leaking markers to the browser metadata', () => {
  const privateSummary = reasoningContentSummary();
  const publicSummary = publicReasoningContentSummary();
  assert.equal(privateSummary.templateCount, 110);
  assert.equal(privateSummary.skillCount, 17);
  assert.equal(privateSummary.satsFriendlyCount, 110);
  assert.deepEqual(publicSummary, privateSummary);
  assert.equal(REASONING_TEMPLATES.length, 110);
  assert.equal(typeof publicSummary.templateCount, 'number');
});

test('reasoning templates generate, mark and serialise cleanly across smoke seeds', () => {
  const failures = [];
  for (const template of REASONING_TEMPLATES) {
    for (let seed = 1; seed <= 5; seed += 1) {
      try {
        const question = generateReasoningQuestion(template.id, seed);
        const safe = safeReasoningQuestion(question);
        const marked = evaluateReasoningQuestion(question, {});
        assert.equal(safe.id, question.itemId);
        assert.ok(safe.stemHtml, `${template.id}:${seed} has stem`);
        assert.ok(safe.inputSpec?.type, `${template.id}:${seed} has input spec`);
        assert.equal(safe.evaluate, undefined);
        assert.equal(typeof question.evaluate, 'function');
        assert.ok(Array.isArray(question.solutionLines) && question.solutionLines.length > 0, `${template.id}:${seed} has worked solution`);
        assert.equal(Number.isFinite(Number(marked.score)), true);
        assert.equal(Number.isFinite(Number(marked.maxScore)), true);
      } catch (error) {
        failures.push(`${template.id}:${seed}:${error.message}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});


test('reasoning generated templates keep stable item ids and do not emit malformed maths text', () => {
  const malformed = /\b(?:undefined|NaN|Infinity|\[object Object\])\b/i;
  const failures = [];
  for (const template of REASONING_TEMPLATES) {
    for (let seed = 1; seed <= 1000; seed += 1) {
      const question = generateReasoningQuestion(template.id, seed);
      const text = [
        question?.stemHtml,
        question?.visualHtml,
        ...(question?.solutionLines || []),
        question?.checkLine,
        question?.reflectionPrompt,
      ].filter(Boolean).join('\\n');
      if (question?.itemId !== `${template.id}:${seed}`) failures.push(`${template.id}:${seed}: unstable itemId ${question?.itemId}`);
      if (malformed.test(text)) failures.push(`${template.id}:${seed}: malformed generated text`);
    }
  }
  assert.deepEqual(failures, []);
});
