import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGrammarQuestion,
  serialiseGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';
import { markByAnswerSpec } from '../worker/src/subjects/grammar/answer-spec.js';

function mark(question, answer) {
  assert.ok(question?.answerSpec, 'question should expose an answerSpec');
  return markByAnswerSpec(question.answerSpec, { answer });
}

test('P20 accepts logically equivalent word-class labels without making learners type one exact phrase', () => {
  const question = createGrammarQuestion({
    templateId: 'qg_p18_p18_word_classes_precision_repair_or_rewrite',
    seed: 1,
  });

  assert.equal(question.answerSpec.kind, 'normalisedText');
  assert.equal(question.p20ClosedAutoMark, true);
  assert.equal(question.answerSpec.p20ClosedAutoMark, true);

  for (const answer of ['adverb', 'ADVERB', 'adverb.', '"adverb"', 'an adverb', 'the adverb', '  adverb  ']) {
    assert.equal(mark(question, answer).correct, true, `${answer} should be accepted`);
  }

  assert.equal(mark(question, 'verb').correct, false, 'a wrong grammar label must still be rejected');
});

test('P20 accepts harmless learner formatting around deterministic subject/object answers', () => {
  const question = createGrammarQuestion({
    templateId: 'qg_p18_p18_subject_object_precision_repair_or_rewrite',
    seed: 1,
  });

  assert.equal(question.answerSpec.kind, 'normalisedText');
  assert.equal(question.p20ClosedAutoMark, true);
  assert.equal(question.answerSpec.golden[0], 'The noisy gull');

  for (const answer of ['The noisy gull', 'the noisy gull', 'THE NOISY GULL', 'The noisy gull.', '“The noisy gull”']) {
    assert.equal(mark(question, answer).correct, true, `${answer} should be accepted`);
  }

  assert.equal(mark(question, 'the sandwich').correct, false, 'the object must not be accepted as the subject');
});

test('P20 acceptedSet answers accept harmless terminal sentence punctuation', () => {
  const spec = {
    kind: 'acceptedSet',
    golden: ['relative clause', 'subordinate clause'],
    maxScore: 2,
  };

  for (const answer of ['relative clause', 'RELATIVE CLAUSE.', '"relative clause"', 'a relative clause']) {
    assert.equal(markByAnswerSpec(spec, { answer }).correct, true, `${answer} should be accepted`);
  }

  assert.equal(markByAnswerSpec(spec, { answer: 'main clause' }).correct, false);
});

test('P20 recovered punctuation rewrites still require the grammar-critical punctuation', () => {
  const question = createGrammarQuestion({
    templateId: 'qg_p18_p15_adverbials_fronted_adverbial_comma',
    seed: 1,
  });

  assert.equal(question.answerSpec.kind, 'punctuationPattern');
  assert.equal(question.p20ClosedAutoMark, true);
  assert.equal(mark(question, 'Before sunrise, the campers packed their bags.').correct, true);
  assert.equal(mark(question, '  Before sunrise, the campers packed their bags.  ').correct, true);
  assert.equal(
    mark(question, 'Before sunrise the campers packed their bags.').correct,
    false,
    'missing the fronted-adverbial comma should remain incorrect',
  );
});

test('P20 keeps genuinely open clause-combine writing as manual-review-only', () => {
  const question = createGrammarQuestion({
    templateId: 'qg_p18_p15_clauses_combine_clause',
    seed: 1,
  });

  assert.equal(question.answerSpec.kind, 'manualReviewOnly');
  assert.equal(question.manualReviewOnly, true);
  assert.equal(question.nonScored, true);
  const result = mark(question, 'Although the wind was strong, the boat reached the shore.');
  assert.equal(result.correct, false);
  assert.equal(result.score, 0);
  assert.equal(result.manualReviewOnly, true);
});

test('P20 serialised learner prompts remove legacy tag spacing and awkward table-row copy', () => {
  const clauseQuestion = createGrammarQuestion({ templateId: 'combine_clauses_rewrite', seed: 1 });
  const clauseSerialised = serialiseGrammarQuestion(clauseQuestion);
  assert.doesNotMatch(clauseSerialised.promptText, /\s+[.,!?;:]/);
  assert.match(clauseSerialised.promptText, /using when\./);

  const tableQuestion = createGrammarQuestion({
    templateId: 'qg_p18_p18_word_classes_sat_table_classification',
    seed: 1,
  });
  const tableSerialised = serialiseGrammarQuestion(tableQuestion);
  assert.equal(tableSerialised.promptText, 'Classify the target word or phrase by its grammar role.');
  assert.doesNotMatch(JSON.stringify(tableSerialised.inputSpec), /Classify the grammar feature shown in this row:/);
  assert.match(JSON.stringify(tableSerialised.inputSpec), /Target “carefully” in sentence:/);
});
