import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ANSWER_SPEC_KINDS,
  markByAnswerSpec,
  validateAnswerSpec,
} from '../worker/src/subjects/grammar/answer-spec.js';

test('ANSWER_SPEC_KINDS lists all six declarative types', () => {
  assert.deepEqual(ANSWER_SPEC_KINDS.slice().sort(), [
    'acceptedSet',
    'exact',
    'manualReviewOnly',
    'multiField',
    'normalisedText',
    'punctuationPattern',
  ]);
});

test('exact: rejects near-miss punctuation, accepts byte-identical', () => {
  const spec = { kind: 'exact', golden: ['Question mark.'], nearMiss: ['question mark', 'Question mark'], maxScore: 1 };
  assert.equal(markByAnswerSpec(spec, { answer: 'Question mark.' }).correct, true);
  assert.equal(markByAnswerSpec(spec, { answer: 'Question mark' }).correct, false, 'missing trailing dot');
  assert.equal(markByAnswerSpec(spec, { answer: 'question mark.' }).correct, false, 'wrong case');
});

test('normalisedText: accepts whitespace + case variants, preserves the golden', () => {
  const spec = { kind: 'normalisedText', golden: ['subordinate clause'], nearMiss: ['subordinate'], maxScore: 1 };
  assert.equal(markByAnswerSpec(spec, { answer: '  Subordinate  Clause  ' }).correct, true);
  assert.equal(markByAnswerSpec(spec, { answer: 'subordinate' }).correct, false);
});

test('acceptedSet: two equivalent clause-combine sentences both score full marks', () => {
  const spec = {
    kind: 'acceptedSet',
    golden: [
      'Although Mia was tired, she finished the race.',
      'Mia finished the race although she was tired.',
    ],
    nearMiss: ['Mia finished the race although tired.'],
    maxScore: 2,
  };
  const a = markByAnswerSpec(spec, { answer: 'Although Mia was tired, she finished the race.' });
  const b = markByAnswerSpec(spec, { answer: 'Mia finished the race although she was tired.' });
  assert.equal(a.correct, true);
  assert.equal(a.score, 2);
  assert.equal(b.correct, true);
  assert.equal(b.score, 2);

  const nearMiss = markByAnswerSpec(spec, { answer: 'Mia finished the race although tired.' });
  assert.equal(nearMiss.correct, false);
});

test('acceptedSet: near-miss punctuation gets partial credit when maxScore > 1', () => {
  const spec = {
    kind: 'acceptedSet',
    golden: ['When the bell rang, the pupils lined up.'],
    nearMiss: ['When the bell rang the pupils lined up.'],
    maxScore: 2,
  };
  const result = markByAnswerSpec(spec, { answer: 'When the bell rang the pupils lined up' });
  // Same content without the comma + full stop — partial credit under the
  // "bare" (punctuation-stripped) comparison path.
  assert.equal(result.correct, false);
  assert.ok(result.score > 0, 'partial credit for punctuation-only error');
  assert.equal(result.misconception, 'punctuation_precision');
});

test('punctuationPattern: optionalCommas accepts variant without surrounding commas', () => {
  const spec = {
    kind: 'punctuationPattern',
    golden: ['The cat, which sat on the mat, was fat.'],
    nearMiss: ['The cat which sat on the mat was fat.'],
    params: { optionalCommas: true },
    maxScore: 1,
  };
  const withCommas = markByAnswerSpec(spec, { answer: 'The cat, which sat on the mat, was fat.' });
  const withoutCommas = markByAnswerSpec(spec, { answer: 'The cat which sat on the mat was fat.' });
  assert.equal(withCommas.correct, true);
  assert.equal(withoutCommas.correct, true, 'optionalCommas should accept the comma-free variant');
});

test('punctuationPattern: optionalCommas=false rejects comma-free variant', () => {
  const spec = {
    kind: 'punctuationPattern',
    golden: ['The cat, which sat on the mat, was fat.'],
    nearMiss: [],
    params: { optionalCommas: false },
    maxScore: 1,
  };
  const withoutCommas = markByAnswerSpec(spec, { answer: 'The cat which sat on the mat was fat.' });
  assert.equal(withoutCommas.correct, false);
});

test('multiField: scores each sub-field independently and aggregates', () => {
  const spec = {
    kind: 'multiField',
    params: {
      fields: {
        rewrite: { kind: 'normalisedText', golden: ['the dog ran'], nearMiss: [], maxScore: 2 },
        justify: { kind: 'acceptedSet', golden: ['past tense', 'it happened before'], nearMiss: [], maxScore: 1 },
      },
    },
    maxScore: 3,
  };
  const bothCorrect = markByAnswerSpec(spec, { rewrite: { answer: 'The Dog Ran' }, justify: { answer: 'past tense' } });
  assert.equal(bothCorrect.correct, true);
  assert.equal(bothCorrect.score, 3);
  assert.equal(bothCorrect.maxScore, 3);

  const onlyRewrite = markByAnswerSpec(spec, { rewrite: { answer: 'the dog ran' }, justify: { answer: 'because' } });
  assert.equal(onlyRewrite.correct, false);
  assert.equal(onlyRewrite.score, 2);
  assert.equal(onlyRewrite.maxScore, 3);
});

test('manualReviewOnly: never auto-scores correct', () => {
  const spec = {
    kind: 'manualReviewOnly',
    golden: [],
    nearMiss: [],
    maxScore: 0,
    feedbackLong: 'A teacher will review this response.',
  };
  const result = markByAnswerSpec(spec, { answer: 'My storm paragraph with a relative clause...' });
  assert.equal(result.correct, false, 'manualReviewOnly must never auto-correct');
  assert.equal(result.score, 0);
  assert.equal(result.maxScore, 0);
  assert.equal(result.nonScored, true);
  assert.equal(result.manualReviewOnly, true);
  assert.equal(result.feedbackShort, 'Saved for review.');
});

test('markByAnswerSpec preserves spec-owned answer text and hint metadata', () => {
  const spec = {
    kind: 'exact',
    golden: ['passive voice'],
    nearMiss: ['active voice'],
    maxScore: 1,
    misconception: 'active_passive_confusion',
    minimalHint: 'Look for who receives the action first.',
    feedbackLong: 'The sentence is passive because the thing affected comes first.',
    answerText: 'passive voice',
  };
  const result = markByAnswerSpec(spec, { answer: 'active voice' });
  assert.equal(result.correct, false);
  assert.equal(result.misconception, 'active_passive_confusion');
  assert.equal(result.minimalHint, 'Look for who receives the action first.');
  assert.equal(result.answerText, 'passive voice');
});

test('markByAnswerSpec tolerates missing/malformed input gracefully', () => {
  assert.equal(markByAnswerSpec(null, { answer: 'x' }).correct, false);
  assert.equal(markByAnswerSpec({}, { answer: 'x' }).correct, false);
  assert.equal(markByAnswerSpec({ kind: 'garbage-kind', golden: ['y'], nearMiss: [] }, { answer: 'x' }).correct, false);
  assert.equal(markByAnswerSpec({ kind: 'acceptedSet', golden: [], nearMiss: [] }, { answer: 'x' }).misconception, 'marking_unavailable');
  assert.equal(markByAnswerSpec({ kind: 'acceptedSet', golden: ['ok'], nearMiss: [] }, null).correct, false);
});

test('validateAnswerSpec: all kinds with golden + nearMiss pass', () => {
  for (const kind of ['exact', 'normalisedText', 'acceptedSet', 'punctuationPattern']) {
    assert.ok(validateAnswerSpec({ kind, golden: ['x'], nearMiss: [] }), kind);
  }
  assert.ok(validateAnswerSpec({ kind: 'manualReviewOnly' }));
  assert.ok(validateAnswerSpec({
    kind: 'multiField',
    params: { fields: { a: { kind: 'exact', golden: ['x'], nearMiss: [] } } },
  }));
});

test('validateAnswerSpec: rejects missing golden (except manualReviewOnly)', () => {
  assert.throws(() => validateAnswerSpec({ kind: 'exact', golden: [], nearMiss: [] }), /golden/);
  assert.throws(() => validateAnswerSpec({ kind: 'acceptedSet', nearMiss: [] }), /golden/);
  assert.throws(() => validateAnswerSpec({ kind: 'exact', golden: ['x'] }), /nearMiss/);
  assert.throws(() => validateAnswerSpec({ kind: 'garbage' }), /kind must be one of/);
});

test('validateAnswerSpec: multiField recursively validates subfields', () => {
  assert.throws(() => validateAnswerSpec({
    kind: 'multiField',
    params: { fields: { broken: { kind: 'exact', golden: [], nearMiss: [] } } },
  }), /multiField\.broken/);
});

test('Backcompat: content.js inline accepted-array marking still works through the new marker', async () => {
  // content.js markStringAnswer is now a thin adapter — it constructs a
  // transient acceptedSet spec and delegates to markByAnswerSpec. Every
  // existing inline `accepted: [...]` call in content.js continues to work
  // because the shape is backwards compatible with the existing opts.
  const { createGrammarQuestion, evaluateGrammarQuestion } = await import('../worker/src/subjects/grammar/content.js');
  const question = createGrammarQuestion({ templateId: 'combine_clauses_rewrite', seed: 1 });
  assert.ok(question, 'question should build');
  const evaluation = evaluateGrammarQuestion(question, { answer: 'Although Mia was tired, she finished the race.' });
  assert.equal(typeof evaluation.correct, 'boolean');
  assert.ok(evaluation.maxScore >= 1);
});
