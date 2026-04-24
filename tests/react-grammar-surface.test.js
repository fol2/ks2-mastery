import test from 'node:test';
import assert from 'node:assert/strict';

import { createAppHarness } from './helpers/app-harness.js';
import {
  createGrammarHarness,
  grammarResponseFormData,
} from './helpers/grammar-subject-harness.js';
import { readGrammarLegacyOracle } from './helpers/grammar-legacy-oracle.js';
import { installMemoryStorage } from './helpers/memory-storage.js';

function grammarOracleSample(templateId = 'question_mark_select') {
  return readGrammarLegacyOracle().templates.find((template) => template.id === templateId);
}

test('Grammar opens as a real Clause Conservatory subject surface', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  const html = harness.render();

  assert.match(html, /Clause Conservatory/);
  assert.match(html, /Grammar retrieval practice/);
  assert.match(html, /All 18 Grammar concepts/);
  assert.match(html, /Start practice/);
  assert.match(html, /Bracehart/);
  assert.match(html, /Concordium/);
  assert.doesNotMatch(html, /Future subject module/);
});

test('Grammar surface runs from setup to Worker-style feedback and summary', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  const sample = grammarOracleSample();

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-start', {
    payload: {
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });

  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'session');
  let html = harness.render();
  assert.match(html, /Grammar practice/);
  assert.match(html, /question mark/i);

  harness.dispatch('grammar-submit-form', {
    formData: grammarResponseFormData(sample.correctResponse),
  });

  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'feedback');
  html = harness.render();
  assert.match(html, /Correct\./);
  assert.match(html, /Finish round/);

  harness.dispatch('grammar-continue');
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'summary');
  html = harness.render();
  assert.match(html, /Grammar session summary/);
  assert.match(html, /1\/1/);

  harness.dispatch('grammar-back');
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'dashboard');
  assert.match(harness.render(), /Grammar retrieval practice/);
});

test('Grammar locked future modes render unavailable without dispatching commands', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  const html = harness.render();

  assert.match(html, /Weak concepts drill[\s\S]*Coming next/);
  assert.match(html, /Sentence surgery[\s\S]*Coming next/);
  assert.match(html, /button class="grammar-mode locked" type="button" disabled=""/);
});
