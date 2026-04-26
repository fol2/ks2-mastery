import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createAppHarness } from './helpers/app-harness.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import { PUNCTUATION_RELEASE_ID } from '../shared/punctuation/content.js';
import { SUBJECT_EXPOSURE_GATES } from '../src/platform/core/subject-availability.js';
import {
  PUNCTUATION_CHILD_FORBIDDEN_TERMS,
  PUNCTUATION_MAP_MONSTER_FILTER_IDS,
  PUNCTUATION_MAP_STATUS_FILTER_IDS,
} from '../src/subjects/punctuation/components/punctuation-view-model.js';
import { PUNCTUATION_MODES } from '../src/subjects/punctuation/service-contract.js';

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

// ---------------------------------------------------------------------------
// Phase 3 U5 — Punctuation Map scene.
//
// `phase === 'map'` renders 14 skill cards across the 4 active monsters with
// filter chips and skill-detail open/close state handling. Reserved monsters
// (Colisk / Hyphang / Carillon) never surface regardless of state shape.
//
// SSR blind spots (learning #6): pointer-capture, focus, and scroll are not
// observable here — every assertion below is a paired HTML-match +
// state-level check (learning #7) to close the silent-no-op gap.
// ---------------------------------------------------------------------------

function openMapScene(harness) {
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.dispatch('punctuation-open-map');
}

function forbiddenTermsInHtml(html) {
  const leaks = [];
  for (const term of PUNCTUATION_CHILD_FORBIDDEN_TERMS) {
    if (term instanceof RegExp) {
      if (term.test(html)) leaks.push(String(term));
      continue;
    }
    if (typeof term !== 'string' || !term) continue;
    if (html.toLowerCase().includes(term.toLowerCase())) leaks.push(term);
  }
  return leaks;
}

test('punctuation Map scene renders 14 skill cards across 4 monster groups', () => {
  const harness = createPunctuationHarness();
  openMapScene(harness);
  const html = harness.render();

  // Each active monster renders as a section with the aria-label "<Name> skills".
  for (const name of ['Pealark', 'Claspin', 'Curlune', 'Quoral']) {
    assert.match(html, new RegExp(`aria-label="${name} skills"`), `missing monster group for ${name}`);
  }
  // 14 skill cards — count the per-card wrapper.
  const cardMatches = html.match(/class="punctuation-map-skill-card"/g) || [];
  assert.equal(cardMatches.length, 14, `expected 14 skill cards, got ${cardMatches.length}`);
});

test('punctuation Map scene never renders reserved monster groups', () => {
  const harness = createPunctuationHarness();
  openMapScene(harness);
  // Smuggle reserved monster entries into the reward state via updateSubjectUi.
  // The Map scene iterator is ACTIVE_PUNCTUATION_MONSTER_IDS only, so even a
  // poisoned rewardState must not surface the reserved trio as groups.
  harness.store.updateSubjectUi('punctuation', {
    rewardState: {
      pealark: { mastered: ['r1'] },
      colisk: { mastered: ['c1', 'c2'] },
      hyphang: { mastered: ['h1'] },
      carillon: { mastered: ['ca1'] },
    },
  });
  const html = harness.render();

  for (const reserved of ['Colisk', 'Hyphang', 'Carillon']) {
    assert.doesNotMatch(html, new RegExp(`aria-label="${reserved} skills"`), `reserved ${reserved} leaked as a group`);
    assert.doesNotMatch(html, new RegExp(`data-monster-id="${reserved.toLowerCase()}"`));
  }
});

test('punctuation Map scene renders the status filter chip row with child copy', () => {
  const harness = createPunctuationHarness();
  openMapScene(harness);
  const html = harness.render();

  // Plan: ['All','New','Learning','Due','Wobbly','Secure'].
  for (const label of ['All', 'New', 'Learning', 'Due today', 'Wobbly', 'Secure']) {
    assert.match(html, new RegExp(`>${label}<`), `missing status chip label ${label}`);
  }
  assert.match(html, /data-action="punctuation-map-status-filter"/);
  // Every chip carries aria-pressed — the group is the canonical accessible
  // "toggle row" shape.
  for (const id of PUNCTUATION_MAP_STATUS_FILTER_IDS) {
    assert.match(html, new RegExp(`data-value="${id}"`));
  }
});

test('punctuation Map scene renders the monster filter chip row with active roster only', () => {
  const harness = createPunctuationHarness();
  openMapScene(harness);
  const html = harness.render();

  for (const id of PUNCTUATION_MAP_MONSTER_FILTER_IDS) {
    assert.match(html, new RegExp(`data-action="punctuation-map-monster-filter"[^>]*data-value="${id}"`));
  }
  // Reserved monster chips never appear — the frozen filter list excludes
  // them at the source.
  for (const reserved of ['colisk', 'hyphang', 'carillon']) {
    assert.doesNotMatch(
      html,
      new RegExp(`data-action="punctuation-map-monster-filter"[^>]*data-value="${reserved}"`),
      `reserved ${reserved} chip leaked`,
    );
  }
});

test('punctuation Map scene: clicking Wobbly sets state.mapUi.statusFilter to `weak`', () => {
  const harness = createPunctuationHarness();
  openMapScene(harness);
  // Simulate the click by dispatching through the real pipeline.
  harness.dispatch('punctuation-map-status-filter', { value: 'weak' });

  const state = harness.store.getState().subjectUi.punctuation;
  assert.equal(state.mapUi.statusFilter, 'weak');

  // Paired HTML assertion: aria-pressed flips to "true" on the Wobbly chip.
  const html = harness.render();
  assert.match(
    html,
    /data-value="weak"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-value="weak"/,
    'Wobbly chip should render with aria-pressed="true"',
  );
});

test('punctuation Map scene: clicking Pealark sets state.mapUi.monsterFilter to `pealark`', () => {
  const harness = createPunctuationHarness();
  openMapScene(harness);
  harness.dispatch('punctuation-map-monster-filter', { value: 'pealark' });

  const state = harness.store.getState().subjectUi.punctuation;
  assert.equal(state.mapUi.monsterFilter, 'pealark');
});

test('punctuation Map scene: invalid status-filter value returns false and leaves state unchanged', () => {
  const harness = createPunctuationHarness();
  openMapScene(harness);
  harness.dispatch('punctuation-map-status-filter', { value: 'weak' });
  assert.equal(harness.store.getState().subjectUi.punctuation.mapUi.statusFilter, 'weak');

  harness.dispatch('punctuation-map-status-filter', { value: 'garbage' });

  // Invalid payload: the handler returns false, the store is not touched,
  // and the paired state assertion catches the silent-no-op (learning #7).
  assert.equal(harness.store.getState().subjectUi.punctuation.mapUi.statusFilter, 'weak');
});

test('punctuation Map scene: PUNCTUATION_MODES enum unchanged at 10 entries (R17)', () => {
  // The Map is a phase, not a mode. No amount of Phase 3 scene work should
  // extend the mode enum past the Phase 2 shape.
  assert.equal(PUNCTUATION_MODES.length, 10);
});

test('punctuation Map scene: degraded availability disables Practise this and filter chips', () => {
  const harness = createPunctuationHarness();
  openMapScene(harness);
  harness.store.updateSubjectUi('punctuation', {
    availability: { status: 'degraded', code: 'runtime_degraded', message: 'paused' },
  });
  const html = harness.render();

  // Every filter chip in the group row renders with `disabled`.
  for (const id of PUNCTUATION_MAP_STATUS_FILTER_IDS) {
    assert.match(
      html,
      new RegExp(`<button[^>]*disabled[^>]*data-value="${id}"[^>]*data-action="punctuation-map-status-filter"|<button[^>]*disabled[^>]*data-action="punctuation-map-status-filter"[^>]*data-value="${id}"`),
      `status chip ${id} should be disabled under degraded availability`,
    );
  }
  // At least one "Practise this" button is disabled.
  assert.match(
    html,
    /<button[^>]*disabled[^>]*>Practise this<\/button>/,
    'Practise this must be disabled under degraded availability',
  );
});

test('punctuation Map scene SSR HTML contains no forbidden child terms', () => {
  const harness = createPunctuationHarness();
  openMapScene(harness);
  const html = harness.render();
  const leaks = forbiddenTermsInHtml(html);
  assert.deepEqual(leaks, [], `forbidden term leak in Map scene HTML: ${leaks.join(', ')}`);
});

test('punctuation Map phase transition: setup → map → setup via dispatch chain', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  assert.equal(harness.store.getState().subjectUi.punctuation.phase, 'setup');

  harness.dispatch('punctuation-open-map');
  assert.equal(harness.store.getState().subjectUi.punctuation.phase, 'map');
  // mapUi lands at defaults when the phase first opens.
  assert.deepEqual(harness.store.getState().subjectUi.punctuation.mapUi, {
    statusFilter: 'all',
    monsterFilter: 'all',
    detailOpenSkillId: null,
    detailTab: 'learn',
  });

  harness.dispatch('punctuation-back');
  assert.equal(harness.store.getState().subjectUi.punctuation.phase, 'setup');
  assert.equal(harness.store.getState().subjectUi.punctuation.mapUi.detailOpenSkillId, null);
});

test('punctuation Map phase: skill-detail open / close transitions mapUi correctly', () => {
  const harness = createPunctuationHarness();
  openMapScene(harness);

  harness.dispatch('punctuation-skill-detail-open', { skillId: 'speech' });
  assert.equal(harness.store.getState().subjectUi.punctuation.mapUi.detailOpenSkillId, 'speech');

  harness.dispatch('punctuation-skill-detail-close');
  assert.equal(harness.store.getState().subjectUi.punctuation.mapUi.detailOpenSkillId, null);
});

// ---------------------------------------------------------------------------
// Design-lens follow-ups from U5 review: top-bar Back button + live-region
// filtered-count summary. Mirrors Spelling `word-bank-topbar` and Grammar
// `grammar-bank-topbar` patterns.
// ---------------------------------------------------------------------------

test('punctuation Map scene renders a top-bar Back to dashboard button (design-lens)', () => {
  const harness = createPunctuationHarness();
  openMapScene(harness);
  const html = harness.render();

  // `punctuation-map-topbar` parallels Spelling's `word-bank-topbar` and
  // Grammar's `grammar-bank-topbar` so a screen reader lands on the exit
  // affordance before the hero / filter rows.
  assert.match(html, /class="punctuation-map-topbar"/);
  // The top-bar back button dispatches `punctuation-close-map`.
  assert.match(
    html,
    /<header class="punctuation-map-topbar">[\s\S]*?data-action="punctuation-close-map"[\s\S]*?<\/header>/,
    'top-bar must contain a punctuation-close-map button',
  );
});

test('punctuation Map scene renders a role="status" live-region count of visible skills', () => {
  const harness = createPunctuationHarness();
  openMapScene(harness);
  const html = harness.render();

  // Default filters render all 14 skills — the summary text reads "Showing
  // all 14 skills." and lives inside a role="status" <p> so a screen reader
  // announces filter changes.
  assert.match(
    html,
    /role="status"[^>]*>Showing all 14 skills\.<|>Showing all 14 skills\.<[^>]*role="status"/,
    'live-region summary must read "Showing all 14 skills." by default',
  );
});

test('punctuation Map scene live-region count reflects a monster filter flip', () => {
  const harness = createPunctuationHarness();
  openMapScene(harness);
  // Apply the Pealark monster filter — Pealark owns endmarks + speech +
  // boundary clusters, which carry 5 skills total (sentence_endings, speech,
  // semicolon, dash_clause, hyphen). The summary must re-count.
  harness.dispatch('punctuation-map-monster-filter', { value: 'pealark' });

  const html = harness.render();
  assert.match(
    html,
    /role="status"[^>]*>Showing 5 of 14 skills\.<|>Showing 5 of 14 skills\.<[^>]*role="status"/,
    'live-region summary must reflect the narrowed monster filter',
  );
});
