import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  GRAMMAR_CONTENT_RELEASE_ID,
  GRAMMAR_TEMPLATE_METADATA,
  createGrammarQuestion,
  serialiseGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';
import { normaliseSmartPunctuation } from '../worker/src/subjects/grammar/answer-spec.js';
import {
  collectVisibleChoiceGroups,
  collectVisibleChoices,
} from './helpers/grammar-visible-choice-collector.js';
import {
  cleanupGrammarRenderHarness,
  renderGrammarItem,
} from './helpers/grammar-render-harness.js';

const GENERIC_EXPLANATION_DISTRACTORS = new Set([
  'It only depends on the final punctuation mark.',
  'It is correct because it is the shortest option.',
  'It is correct because it sounds more exciting.',
  'It is correct because the sentence has a capital letter.',
  'It is correct because the sentence mentions a person or thing.',
]);

function comparableOption(value) {
  return normaliseSmartPunctuation(value).toLowerCase();
}

after(() => {
  cleanupGrammarRenderHarness();
});

test('Grammar QG P24 keeps the existing content release and template denominator', () => {
  assert.equal(GRAMMAR_CONTENT_RELEASE_ID, 'grammar-qg-p21-2026-05-11');
  assert.equal(GRAMMAR_TEMPLATE_METADATA.length, 546);
});

test('Grammar QG P24 removes generic explanation distractors from learner-visible choices', () => {
  const findings = [];
  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    for (let seed = 1; seed <= 30; seed += 1) {
      const question = createGrammarQuestion({ templateId: template.id, seed });
      for (const choice of collectVisibleChoices(question?.inputSpec)) {
        const label = choice.label;
        if (GENERIC_EXPLANATION_DISTRACTORS.has(label)) {
          findings.push({ templateId: template.id, seed, label });
        }
      }
    }
  }
  assert.deepEqual(findings, []);
});

test('Grammar QG P24 keeps selected-response options unique and away from duplicate correct answers', () => {
  const findings = [];
  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    for (let seed = 1; seed <= 30; seed += 1) {
      const question = createGrammarQuestion({ templateId: template.id, seed });
      const groups = collectVisibleChoiceGroups(question?.inputSpec);
      if (groups.length === 0) continue;

      const golden = Array.isArray(question?.answerSpec?.golden) ? question.answerSpec.golden : [];
      for (const group of groups) {
        const labelComparables = group.choices.map((choice) => comparableOption(choice.label));
        const valueComparables = group.choices.map((choice) => comparableOption(choice.value));
        if (new Set(labelComparables).size !== labelComparables.length) {
          findings.push({ templateId: template.id, seed, scope: group.scope, reason: 'duplicate-labels' });
        }
        if (new Set(valueComparables).size !== valueComparables.length) {
          findings.push({ templateId: template.id, seed, scope: group.scope, reason: 'duplicate-values' });
        }

        if (group.scope === 'options' && question?.answerSpec?.kind === 'exact' && golden.length === 1) {
          const correctComparable = comparableOption(golden[0]);
          const correctOptionCount = valueComparables.filter((value) => value === correctComparable).length;
          if (correctOptionCount !== 1) {
            findings.push({
              templateId: template.id,
              seed,
              scope: group.scope,
              reason: 'correct-option-count',
              correctOptionCount,
            });
          }
        }
      }
    }
  }
  assert.deepEqual(findings, []);
});

test('Grammar QG P24 visible-choice collector includes table row column fallbacks', () => {
  const groups = collectVisibleChoiceGroups({
    type: 'table_choice',
    columns: ['Fallback A', 'Fallback B'],
    rows: [
      { key: 'specific', label: 'Specific row', options: ['Specific A', 'Specific B'] },
      { key: 'fallback', label: 'Fallback row' },
    ],
  });

  assert.deepEqual(groups, [
    {
      scope: 'row:specific',
      choices: [
        { label: 'Specific A', value: 'Specific A' },
        { label: 'Specific B', value: 'Specific B' },
      ],
    },
    {
      scope: 'row:fallback',
      choices: [
        { label: 'Fallback A', value: 'Fallback A' },
        { label: 'Fallback B', value: 'Fallback B' },
      ],
    },
  ]);
});

test('Grammar QG P24 keeps manual-expansion explanation choices concept-specific', () => {
  const question = createGrammarQuestion({
    templateId: 'qg_p18_p15_active_passive_explain_voice',
    seed: 1,
  });
  const labels = collectVisibleChoices(question.inputSpec).map((choice) => choice.label);
  assert.ok(labels.includes('The doer and receiver keep the same roles, but the sentence voice changes.'));
  assert.ok(labels.includes('Passive voice means the action is in the future.'));
  assert.ok(labels.includes('The first noun is always the doer.'));
  assert.ok(labels.includes('Adding by always makes a sentence active.'));
});

test('Grammar QG P24 renders stretch feedback only for correct practice feedback', () => {
  const question = createGrammarQuestion({
    templateId: 'qg_p18_p15_active_passive_explain_voice',
    seed: 1,
  });
  const serialised = serialiseGrammarQuestion(question);

  const correctHtml = renderGrammarItem(serialised, {
    phase: 'feedback',
    awaitingAdvance: true,
    feedback: {
      result: {
        correct: true,
        feedbackShort: 'Correct.',
        feedbackLong: 'The active voice keeps the doer first.',
      },
    },
  });
  const correctDoc = new JSDOM(correctHtml).window.document;
  const stretch = correctDoc.querySelector('[data-grammar-feedback-stretch]');
  assert.ok(stretch, 'Correct practice feedback should render the stretch cue.');
  assert.equal(
    stretch.textContent.trim(),
    'Extra challenge: turn your reason into one precise sentence using the grammar term.',
  );

  const incorrectHtml = renderGrammarItem(serialised, {
    phase: 'feedback',
    awaitingAdvance: true,
    feedback: {
      result: {
        correct: false,
        feedbackShort: 'Not quite.',
        feedbackLong: 'Try again.',
      },
    },
  });
  const incorrectDoc = new JSDOM(incorrectHtml).window.document;
  assert.equal(incorrectDoc.querySelector('[data-grammar-feedback-stretch]'), null);

  const nonScoredHtml = renderGrammarItem(serialised, {
    phase: 'feedback',
    awaitingAdvance: true,
    feedback: {
      result: {
        correct: false,
        nonScored: true,
        feedbackShort: 'Saved for review.',
        feedbackLong: 'Saved.',
      },
    },
  });
  const nonScoredDoc = new JSDOM(nonScoredHtml).window.document;
  assert.equal(nonScoredDoc.querySelector('[data-grammar-feedback-stretch]'), null);
});
