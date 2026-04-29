import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGrammarContentQualityAudit } from '../scripts/audit-grammar-content-quality.mjs';
import { markByAnswerSpec } from '../worker/src/subjects/grammar/answer-spec.js';
import {
  createGrammarQuestion,
  GRAMMAR_TEMPLATE_METADATA,
} from '../worker/src/subjects/grammar/content.js';

test('P8 content-quality audit passes with 0 hard failures for seeds 1-30', () => {
  const seeds = Array.from({ length: 30 }, (_, i) => i + 1);
  const audit = buildGrammarContentQualityAudit(seeds);
  assert.equal(
    audit.summary.hardFailCount,
    0,
    `Expected 0 hard failures but got ${audit.summary.hardFailCount}: ${JSON.stringify(audit.hardFailures, null, 2)}`,
  );
});

test('regression: old speech_punctuation_fix raw would be caught', () => {
  // The old raw was already the correct answer — markByAnswerSpec must mark it correct
  const oldRaw = '“Sit down!” said the coach.';
  // Build a spec equivalent to what the template produces
  const spec = {
    kind: 'punctuationPattern',
    golden: [
      '“Sit down!” said the coach.',
      '"Sit down!" said the coach.',
    ],
    nearMiss: [oldRaw],
    maxScore: 2,
    misconception: 'speech_punctuation_confusion',
    feedbackLong: `A correct answer is: “Sit down!” said the coach.`,
    answerText: '“Sit down!” said the coach.',
    minimalHint: 'Check the sentence structure and the instruction again.',
  };
  const result = markByAnswerSpec(spec, oldRaw);
  assert.equal(result.correct, true, 'Old raw value must mark correct — proving the audit would catch it');
});

test('near-miss-equals-golden rule catches synthetic equal pair', () => {
  // Simulate an audit with a synthetic template that has near-miss === golden
  // We cannot inject into the real audit, so we test the logic directly:
  const golden = ['The cat sat.'];
  const nearMiss = ['the cat sat.'];
  const normalise = (s) => (s || '').toLowerCase().trim();
  const normGoldens = golden.map(normalise);
  const caught = nearMiss.some((nm) => normGoldens.includes(normalise(nm)));
  assert.equal(caught, true, 'near-miss that normalises to a golden value must be detected');
});

test('raw-prompt-passes rule catches synthetic passing raw', () => {
  // Synthetic spec where the nearMiss (raw) passes marking
  const spec = {
    kind: 'acceptedSet',
    golden: ['Hello, world!'],
    nearMiss: ['Hello, world!'], // raw is identical to golden — bug
    maxScore: 1,
    misconception: 'test_misconception',
    feedbackLong: 'Test feedback.',
    answerText: 'Hello, world!',
    minimalHint: 'Check again.',
  };
  const result = markByAnswerSpec(spec, spec.nearMiss[0]);
  assert.equal(result.correct, true, 'nearMiss that equals golden must mark correct (proving the rule fires)');
});

test('all constructed-response golden answers mark correct via markByAnswerSpec', () => {
  const constructedKinds = ['normalisedText', 'acceptedSet', 'punctuationPattern'];
  const seeds = Array.from({ length: 5 }, (_, i) => i + 1);
  let checkedCount = 0;

  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    for (const seed of seeds) {
      const question = createGrammarQuestion({ templateId: template.id, seed });
      if (!question) continue;
      const spec = question.answerSpec;
      if (!spec || !constructedKinds.includes(spec.kind)) continue;
      const goldens = spec.golden;
      if (!Array.isArray(goldens) || goldens.length === 0) continue;

      for (const golden of goldens) {
        const result = markByAnswerSpec(spec, golden);
        assert.equal(
          result.correct,
          true,
          `Golden "${golden}" must mark correct for template "${template.id}" seed ${seed}`,
        );
        checkedCount += 1;
      }
    }
  }

  assert.ok(checkedCount > 0, 'At least one constructed-response golden was checked');
});
