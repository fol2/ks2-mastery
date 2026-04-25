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
  // Phase 2 U8: all six cluster focus buttons must reach the setup surface.
  assert.match(setupHtml, /data-punctuation-endmarks-start/);
  assert.match(setupHtml, /data-punctuation-apostrophe-start/);
  assert.match(setupHtml, />Endmarks focus</);
  assert.match(setupHtml, />Apostrophe focus</);
  assert.match(setupHtml, />Speech focus</);
  assert.match(setupHtml, />Comma focus</);
  assert.match(setupHtml, />Boundary focus</);
  assert.match(setupHtml, />Structure focus</);

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
  assert.match(setupHtml, /Weak spots/);
  assert.match(setupHtml, /data-punctuation-weak-start/);
  assert.match(setupHtml, /GPS test/);
  assert.match(setupHtml, /data-punctuation-gps-start/);

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

test('punctuation React surface renders weak focus chips safely', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'active-item',
    session: {
      id: 'weak-ui',
      mode: 'weak',
      length: 1,
      answeredCount: 0,
      weakFocus: {
        skillId: 'speech',
        skillName: 'Inverted commas and speech punctuation',
        mode: 'insert',
        clusterId: 'speech',
        bucket: 'weak',
        source: 'weak_facet',
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

  const html = harness.render();
  assert.match(html, /Weak focus/);
  assert.match(html, /Inverted commas and speech punctuation/);
  assert.match(html, /insert/);
  assert.doesNotMatch(html, /accepted|correctIndex|rubric|validator|generator|hiddenQueue/);
});

test('punctuation React surface renders GPS active progress and final review', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'active-item',
    session: {
      id: 'gps-ui',
      mode: 'gps',
      length: 3,
      answeredCount: 1,
      gps: {
        testLength: 3,
        answeredCount: 1,
        remainingCount: 2,
        delayedFeedback: true,
      },
      guided: null,
      currentItem: {
        id: 'se_insert_capital',
        mode: 'insert',
        inputKind: 'text',
        prompt: 'Add the missing capital letter and full stop.',
        stem: 'the boat reached the harbour',
      },
    },
  });

  const activeHtml = harness.render();
  assert.match(activeHtml, /GPS test/);
  assert.match(activeHtml, /Delayed feedback/);
  assert.match(activeHtml, /2 of 3/);
  assert.doesNotMatch(activeHtml, /Worked example|Common mistake|displayCorrection|accepted|correctIndex|rubric|validator|generator|hiddenQueue|queueItemIds|responses/);

  harness.store.updateSubjectUi('punctuation', {
    phase: 'summary',
    summary: {
      label: 'Punctuation GPS test summary',
      message: 'GPS test complete.',
      total: 2,
      correct: 1,
      accuracy: 50,
      gps: {
        delayedFeedback: true,
        recommendedMode: 'weak',
        recommendedLabel: 'Weak spots',
        reviewItems: [
          {
            index: 1,
            itemId: 'se_insert_capital',
            mode: 'insert',
            prompt: 'Add the missing capital letter and full stop.',
            attemptedAnswer: 'The boat reached the harbour.',
            displayCorrection: 'The boat reached the harbour.',
            correct: true,
            misconceptionTags: [],
          },
          {
            index: 2,
            itemId: 'sp_insert_question',
            mode: 'insert',
            prompt: 'Add the direct-speech punctuation.',
            attemptedAnswer: 'Ella asked can we start now',
            displayCorrection: 'Ella asked, "Can we start now?"',
            correct: false,
            misconceptionTags: ['speech.quote_missing'],
          },
        ],
      },
    },
  });

  const summaryHtml = harness.render();
  assert.match(summaryHtml, /GPS review/);
  assert.match(summaryHtml, /Next: Weak spots/);
  assert.match(summaryHtml, /1\. Correct/);
  assert.match(summaryHtml, /2\. Review/);
  assert.match(summaryHtml, /speech\.quote_missing/);
});

test('punctuation text input remounts when the current text item changes', async () => {
  const source = await readFile(
    new URL('../src/subjects/punctuation/components/PunctuationPracticeSurface.jsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /<TextItem key=\{item\.id \|\| item\.prompt\}/);
});

test('punctuation React surface renders combine tasks as text-entry rewrites', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'active-item',
    session: {
      id: 'combine-ui',
      mode: 'smart',
      length: 1,
      answeredCount: 0,
      currentItem: {
        id: 'sc_combine_rain_pitch',
        mode: 'combine',
        inputKind: 'text',
        prompt: 'Combine the two related clauses into one sentence with a semi-colon.',
        stem: 'The rain had stopped.\nThe pitch was still slippery.',
      },
    },
  });

  const html = harness.render();
  assert.match(html, /Combine the two related clauses/);
  assert.match(html, /Combine the parts into one punctuated sentence/);
  assert.match(html, /textarea/);
  assert.match(html, /The rain had stopped\.\nThe pitch was still slippery\./);
  assert.doesNotMatch(html, /accepted|correctIndex|rubric|validator|generator|hiddenQueue/);
});

test('punctuation React surface renders paragraph repair as multiline text entry', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'active-item',
    session: {
      id: 'paragraph-ui',
      mode: 'smart',
      length: 1,
      answeredCount: 0,
      currentItem: {
        id: 'pg_bullet_consistency',
        mode: 'paragraph',
        inputKind: 'text',
        prompt: 'Repair the bullet-list punctuation.',
        stem: 'Bring\n- a drink.\n- a hat\n- a sketchbook.',
      },
    },
  });

  const html = harness.render();
  assert.match(html, /Repair the whole passage/);
  assert.match(html, /textarea/);
  assert.match(html, /rows="6"/);
  assert.match(html, /white-space:pre-wrap/);
  assert.match(html, /Bring\n- a drink\.\n- a hat\n- a sketchbook\./);
  assert.doesNotMatch(html, /accepted|correctIndex|rubric|validator|generator|hiddenQueue/);
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

test('punctuation text-item controls disable while a command is pending', () => {
  // Use a text-input item so the "disabled" outcome isolates to the composite
  // pending/degraded signal (not to "no choice selected").
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'active-item',
    pendingCommand: 'punctuation-submit-form',
    session: {
      id: 'pending-ui',
      mode: 'smart',
      length: 2,
      answeredCount: 0,
      currentItem: {
        id: 'sp_insert_endmark',
        mode: 'insert',
        inputKind: 'text',
        prompt: 'Insert the punctuation.',
        stem: 'We met at noon',
      },
    },
  });
  const html = harness.render();
  // Submit and Reset buttons must both be disabled while pendingCommand is set.
  assert.match(html, /<button[^>]*disabled[^>]*data-punctuation-submit/);
  assert.match(html, /Reset text[^<]*<\/button>/);
  assert.match(html, /disabled[^<]*>Reset text/);
});

test('punctuation text-item controls disable when runtime is degraded', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'active-item',
    availability: { status: 'degraded', code: 'runtime_degraded', message: 'Punctuation is temporarily read-only.' },
    session: {
      id: 'degraded-ui',
      mode: 'smart',
      length: 1,
      answeredCount: 0,
      currentItem: {
        id: 'sp_insert_endmark_degraded',
        mode: 'insert',
        inputKind: 'text',
        prompt: 'Insert the punctuation.',
        stem: 'We met at noon',
      },
    },
  });
  const html = harness.render();
  assert.match(html, /<button[^>]*disabled[^>]*data-punctuation-submit/);
});

test('punctuation setup view disables Start practice when availability is degraded', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'setup',
    availability: { status: 'degraded', code: 'runtime_degraded', message: 'paused' },
  });
  const html = harness.render();
  assert.match(html, /<button[^>]*disabled[^>]*data-punctuation-start/);
});

test('punctuation feedback view disables Continue while a command is pending', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'feedback',
    pendingCommand: 'punctuation-continue',
    session: {
      id: 'feedback-pending',
      mode: 'smart',
      length: 2,
      answeredCount: 1,
      currentItem: { id: 'x', mode: 'insert', inputKind: 'text', prompt: 'p', stem: '' },
    },
    feedback: { kind: 'success', headline: 'Nice.', body: 'Punctuation correct.' },
  });
  const html = harness.render();
  assert.match(html, /<button[^>]*disabled[^>]*data-punctuation-continue/);
});

test('punctuation text-item submit remains enabled in the idle state', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'active-item',
    session: {
      id: 'idle-ui',
      mode: 'smart',
      length: 1,
      answeredCount: 0,
      currentItem: {
        id: 'sp_insert_endmark_idle',
        mode: 'insert',
        inputKind: 'text',
        prompt: 'Insert the punctuation.',
        stem: 'We met at noon',
      },
    },
  });
  const html = harness.render();
  assert.doesNotMatch(
    html,
    /<button[^>]*disabled[^>]*data-punctuation-submit/,
    'idle active text item must allow submit',
  );
});
