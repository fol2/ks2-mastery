import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderSpellingClozeFixture,
  renderSpellingSurfaceFixture,
} from './helpers/react-render.js';

test('React spelling setup scene renders primary practice controls', async () => {
  const html = await renderSpellingSurfaceFixture({ phase: 'setup' });

  assert.match(html, /Round setup/);
  assert.match(html, /Begin 20 words/);
  assert.match(html, /data-action="spelling-start"/);
});

test('React spelling session scene preserves input, replay, and submit affordances', async () => {
  const html = await renderSpellingSurfaceFixture({ phase: 'session' });

  assert.match(html, /Spell the word you hear|Spell the dictated word/);
  assert.match(html, /name="typed"/);
  assert.match(html, /data-action="spelling-replay"/);
  assert.match(html, /data-action="spelling-submit-form"/);
});

test('React cloze renders one blank for variable-length underscore placeholders', async () => {
  const html = await renderSpellingClozeFixture({
    sentence: 'Each group wrote a prediction for the __________.',
    answer: 'experiment',
  });

  assert.match(html, /<span class="blank">/);
  assert.doesNotMatch(html, /__\./);
});

test('React spelling summary and word bank scenes render migration-critical states', async () => {
  const summaryHtml = await renderSpellingSurfaceFixture({ phase: 'summary' });
  const wordBankHtml = await renderSpellingSurfaceFixture({ phase: 'word-bank' });
  const modalHtml = await renderSpellingSurfaceFixture({ phase: 'modal' });

  assert.match(summaryHtml, /summary-card/);
  assert.match(summaryHtml, /Session summary/);
  assert.match(wordBankHtml, /Word bank progress/);
  assert.match(wordBankHtml, /data-action="spelling-analytics-status-filter"/);
  assert.match(modalHtml, /aria-labelledby="wb-modal-word"/);
  assert.match(modalHtml, /data-action="spelling-word-bank-drill-submit"/);
});
