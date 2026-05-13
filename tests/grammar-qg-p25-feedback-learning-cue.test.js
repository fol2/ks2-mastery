import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGrammarQuestion,
  serialiseGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';

async function loadRenderHarness(t) {
  try {
    const [{ JSDOM }, harness] = await Promise.all([
      import('jsdom'),
      import('./helpers/grammar-render-harness.js'),
    ]);
    return { JSDOM, ...harness };
  } catch (error) {
    t.skip(`React/jsdom render harness unavailable in this lean ZIP environment: ${error.message}`);
    return null;
  }
}

test('Grammar P25 feedback renders the misconception hint as well as the answer after a miss', async (t) => {
  const harness = await loadRenderHarness(t);
  if (!harness) return;
  const { JSDOM, renderGrammarItem, cleanupGrammarRenderHarness } = harness;
  t.after(() => cleanupGrammarRenderHarness());

  const question = createGrammarQuestion({
    templateId: 'qg_p18_p15_tense_aspect_tense_rewrite',
    seed: 1,
  });
  const html = renderGrammarItem(serialiseGrammarQuestion(question), {
    phase: 'feedback',
    awaitingAdvance: true,
    feedback: {
      result: {
        correct: false,
        feedbackShort: 'Not quite.',
        feedbackLong: 'Correct answer: She has finished her homework.',
        minimalHint: 'Check when the action happened and whether the sentence needs a simple, progressive, perfect, or past perfect form.',
        answerText: 'She has finished her homework.',
      },
    },
  });

  const doc = new JSDOM(html).window.document;
  const cue = doc.querySelector('[data-grammar-feedback-learning-cue]');
  assert.ok(cue, 'Incorrect feedback should keep the minimal hint visible even when feedbackLong exists.');
  assert.match(cue.textContent, /Remember: Check when the action happened/);
  assert.match(doc.body.textContent, /Correct answer: She has finished her homework\./);
});

test('Grammar P25 feedback renders a concept-specific stretch cue after a correct answer', async (t) => {
  const harness = await loadRenderHarness(t);
  if (!harness) return;
  const { JSDOM, renderGrammarItem, cleanupGrammarRenderHarness } = harness;
  t.after(() => cleanupGrammarRenderHarness());

  const question = createGrammarQuestion({
    templateId: 'qg_p21_relative_clauses_explanation_choice_variety',
    seed: 1,
  });
  const html = renderGrammarItem(serialiseGrammarQuestion(question), {
    phase: 'feedback',
    awaitingAdvance: true,
    feedback: {
      result: {
        correct: true,
        feedbackShort: 'Correct.',
        feedbackLong: 'A relative clause adds information about a noun.',
      },
    },
  });

  const doc = new JSDOM(html).window.document;
  const stretch = doc.querySelector('[data-grammar-feedback-stretch]');
  assert.ok(stretch, 'Correct feedback should render the non-scored stretch cue.');
  assert.equal(
    stretch.textContent.trim(),
    'Extra challenge: write one new sentence with who, which, or that.',
  );
});
