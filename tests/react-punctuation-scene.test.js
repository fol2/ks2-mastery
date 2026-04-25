import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createAppHarness } from './helpers/app-harness.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import { PUNCTUATION_RELEASE_ID } from '../shared/punctuation/content.js';
import { SUBJECT_EXPOSURE_GATES } from '../src/platform/core/subject-availability.js';

function createPunctuationHarness() {
  return createAppHarness({
    storage: installMemoryStorage(),
    subjectExposureGates: { [SUBJECT_EXPOSURE_GATES.punctuation]: true },
  });
}

function startOneItemPunctuationSession(harness) {
  const learnerId = harness.store.getState().learners.selectedId;
  harness.services.punctuation.savePrefs(learnerId, {
    mode: 'endmarks',
    roundLength: '1',
  });
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.dispatch('punctuation-start', { mode: 'endmarks', roundLength: '1' });
}

function answerCurrentItemCorrectly(harness) {
  const ui = harness.store.getState().subjectUi.punctuation;
  const item = ui.session.currentItem;
  if (item.inputKind === 'choice') {
    const option = item.options.find((entry) => entry.text === item.model) || item.options[0];
    harness.dispatch('punctuation-submit-form', { choiceIndex: option.index });
  } else {
    harness.dispatch('punctuation-submit-form', { typed: item.model });
  }
}

test('punctuation React surface renders setup, active item, feedback and summary states', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });

  const setupHtml = harness.render();
  assert.match(setupHtml, /Bellstorm Coast/);
  assert.match(setupHtml, /Punctuation practice/);
  assert.match(setupHtml, /data-punctuation-start/);

  startOneItemPunctuationSession(harness);
  const activeHtml = harness.render();
  assert.match(activeHtml, /Choose the best punctuated sentence/);
  assert.match(activeHtml, /role="radiogroup"/);
  assert.match(activeHtml, /data-punctuation-submit/);
  assert.doesNotMatch(activeHtml, /correctIndex|accepted|rubric|validator|generator|hiddenQueue/);

  answerCurrentItemCorrectly(harness);
  const feedbackHtml = harness.render();
  assert.match(feedbackHtml, /Feedback/);
  assert.match(feedbackHtml, /Correct\./);
  assert.match(feedbackHtml, /data-punctuation-continue/);

  harness.dispatch('punctuation-continue');
  const summaryHtml = harness.render();
  assert.match(summaryHtml, /Punctuation session summary/);
  assert.match(summaryHtml, /Session complete/);
  assert.match(summaryHtml, /Start again/);
});

test('punctuation React surface keeps server-only fields out of active HTML', () => {
  const harness = createPunctuationHarness();
  startOneItemPunctuationSession(harness);

  const html = harness.render();
  assert.doesNotMatch(html, /speech\.punctuation_outside_quote/);
  assert.doesNotMatch(html, /sentence-endings-core/);
  assert.equal(html.includes(PUNCTUATION_RELEASE_ID), false);
});

test('punctuation React surface renders guided setup controls and teach boxes', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'setup',
    content: {
      publishedScopeCopy: 'This Punctuation release covers all 14 KS2 punctuation skills.',
      skills: [
        { id: 'sentence_endings', name: 'Capital letters and sentence endings', clusterId: 'endmarks' },
        { id: 'speech', name: 'Inverted commas and speech punctuation', clusterId: 'speech' },
      ],
    },
  });

  const setupHtml = harness.render();
  assert.match(setupHtml, /Guided skill/);
  assert.match(setupHtml, /Guided learn/);
  assert.match(setupHtml, /data-punctuation-guided-start/);

  harness.store.updateSubjectUi('punctuation', {
    phase: 'active-item',
    session: {
      id: 'guided-ui',
      mode: 'guided',
      length: 1,
      answeredCount: 0,
      guided: {
        skillId: 'speech',
        supportLevel: 2,
        teachBox: {
          name: 'Inverted commas and speech punctuation',
          rule: 'Put spoken words inside inverted commas.',
          workedExample: {
            before: 'Mia said come here.',
            after: 'Mia said, "Come here."',
          },
          contrastExample: {
            before: 'Mia said "come here".',
            after: 'Mia said, "Come here."',
          },
          selfCheckPrompt: 'Check the rule, compare the examples, then try the item without looking for the answer pattern.',
        },
      },
      currentItem: {
        id: 'sp_insert_question',
        mode: 'insert',
        inputKind: 'text',
        prompt: 'Add the direct-speech punctuation.',
        stem: 'Ella asked, can we start now?',
      },
    },
  });
  const activeHtml = harness.render();
  assert.match(activeHtml, /Inverted commas and speech punctuation/);
  assert.match(activeHtml, /Put spoken words inside inverted commas/);
  assert.match(activeHtml, /Worked example/);
  assert.match(activeHtml, /Common mistake/);
  assert.doesNotMatch(activeHtml, /accepted|correctIndex|rubric|validator|generator|hiddenQueue/);
});

test('punctuation text input remounts when the current text item changes', async () => {
  const source = await readFile(
    new URL('../src/subjects/punctuation/components/PunctuationPracticeSurface.jsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /<TextItem key=\{item\.id \|\| item\.prompt\}/);
});

test('punctuation React surface preserves newline-sensitive bullet text', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'active-item',
    session: {
      id: 'bullet-ui',
      length: 1,
      answeredCount: 0,
      currentItem: {
        id: 'bp_choose_bring',
        mode: 'choose',
        inputKind: 'choice',
        prompt: 'Choose the correctly punctuated bullet list.',
        stem: 'Bring\n- a drink\n- a hat\n- a sketchbook',
        options: [
          { index: 0, text: 'Bring:\n- a drink\n- a hat\n- a sketchbook' },
          { index: 1, text: 'Bring\n- a drink\n- a hat\n- a sketchbook' },
        ],
      },
    },
  });

  const html = harness.render();
  assert.match(html, /white-space:pre-wrap/);
  assert.match(html, /Bring\n- a drink\n- a hat\n- a sketchbook/);
  assert.match(html, /Bring:\n- a drink\n- a hat\n- a sketchbook/);
});
