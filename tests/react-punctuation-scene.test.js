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
  PUNCTUATION_SKILL_MODAL_CONTENT,
  PUNCTUATION_SKILL_MODAL_PREFERRED_EXAMPLE,
} from '../src/subjects/punctuation/components/punctuation-view-model.js';
import { PUNCTUATION_MODES } from '../src/subjects/punctuation/service-contract.js';
import { FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS } from './helpers/forbidden-keys.mjs';

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

// ---------------------------------------------------------------------------
// U6 — Punctuation Skill Detail modal. Renders on top of the Map scene when
// `mapUi.detailOpenSkillId` is a published Punctuation skill id. Two tabs
// (Learn / Practise) consume U5's `mapUi.detailTab` state. "Practise this"
// dispatches `punctuation-start` with `{ mode: 'guided', guidedSkillId,
// roundLength: '4' }` — cluster-mode is explicitly verified against (plan
// adv-219-005 deepening against `shared/punctuation/service.js:1281-1283`).
// ---------------------------------------------------------------------------

function openSkillDetailForSpeech(harness) {
  openMapScene(harness);
  harness.dispatch('punctuation-skill-detail-open', { skillId: 'speech' });
}

// React escapes `"` as `&quot;` and `'` as `&#x27;` in SSR output. Tests that
// compare raw pedagogy strings against rendered HTML must escape through the
// same transformation so the assertion is byte-for-byte comparable. We only
// handle the five characters React escapes; any future escape drift would
// show up as a false-negative here and alert us to extend the helper.
function escapeForReactSsr(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

test('punctuation Skill Detail modal renders with role=dialog, aria-modal, labelledby', () => {
  const harness = createPunctuationHarness();
  openSkillDetailForSpeech(harness);
  const html = harness.render();

  // Review-follower HIGH 3: the inner `.punctuation-skill-modal` card carries
  // the dialog semantics — scrim is a click-absorber only, without any ARIA
  // role. The inner-card match is paired with an id-suffix assertion to
  // confirm the per-skill-scoped `aria-labelledby` (learning #6 — SSR cannot
  // assert focus trap, only static ARIA).
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /aria-labelledby="punctuation-skill-detail-title-speech"/);
  assert.match(
    html,
    /id="punctuation-skill-detail-title-speech"[^>]*>Inverted commas and speech punctuation</,
    'modal title must read the speech skill name and carry the per-skill-scoped id',
  );
  // The scrim must NOT itself be a dialog — only the inner card. Paired
  // state-level assertion catches any regression that re-hoists role=dialog
  // onto the scrim.
  assert.match(
    html,
    /<div class="punctuation-skill-modal-scrim"(?:[^>]*)>/,
    'scrim element must render',
  );
  assert.doesNotMatch(
    html,
    /<div class="punctuation-skill-modal-scrim"[^>]*role="dialog"/,
    'scrim must NOT carry role=dialog — dialog semantics live on the inner card',
  );
  // Close button carries data-autofocus for the dialog-focus contract
  // (review-follower HIGH 2). SSR cannot verify the useEffect fallback
  // actually focused — only that the attribute landed for AT announcement.
  assert.match(
    html,
    /<button[^>]*data-action="punctuation-skill-detail-close"[^>]*data-autofocus="true"/,
    'Close button must carry data-autofocus="true" for dialog focus announcement',
  );
});

test('punctuation Skill Detail modal renders exactly 3 pedagogy fields per skill (rule + contrastBad + preferred example)', () => {
  const harness = createPunctuationHarness();
  openSkillDetailForSpeech(harness);
  const html = harness.render();

  const speechContent = PUNCTUATION_SKILL_MODAL_CONTENT.speech;
  // rule + contrastBad + workedGood must appear. contrastGood (different from
  // workedGood for speech) must NOT appear in the Learn body. Every raw
  // string runs through the React-SSR escape helper first so the assertion
  // matches the actual rendered HTML byte-for-byte.
  assert.ok(html.includes(escapeForReactSsr(speechContent.rule)), 'rule must render');
  assert.ok(html.includes(escapeForReactSsr(speechContent.contrastBad)), 'contrastBad must render');
  assert.ok(
    html.includes(escapeForReactSsr(speechContent.workedGood)),
    'workedGood must render for speech (default preferred example)',
  );
  // For speech, workedGood !== contrastGood, so the absence check is rigorous.
  assert.notStrictEqual(speechContent.workedGood, speechContent.contrastGood);
  assert.ok(
    !html.includes(escapeForReactSsr(speechContent.contrastGood)),
    'contrastGood must NOT render when preferred example is workedGood',
  );
});

test('punctuation Skill Detail modal overrides to workedGood for comma_clarity (plan-specified)', () => {
  const harness = createPunctuationHarness();
  openMapScene(harness);
  harness.dispatch('punctuation-skill-detail-open', { skillId: 'comma_clarity' });
  const html = harness.render();

  const content = PUNCTUATION_SKILL_MODAL_CONTENT.comma_clarity;
  // comma_clarity's shared `contrastGood` was byte-for-byte identical to
  // `cc_insert_time_travellers.accepted[0]`. The `PUNCTUATION_SKILL_MODAL_PREFERRED_EXAMPLE`
  // override to `workedGood` ("Let's eat, Grandma.") is the primary guard;
  // the client-mirror rewrite of `contrastGood` to a fresh example (which
  // the red-team disjoint test in `tests/punctuation-view-model.test.js`
  // asserts) is the belt-and-braces guard that neither example field can
  // leak an accepted answer (plan R13 + review-follower HIGH 1).
  assert.equal(PUNCTUATION_SKILL_MODAL_PREFERRED_EXAMPLE.comma_clarity, 'workedGood');
  assert.ok(
    html.includes(escapeForReactSsr(content.workedGood)),
    'workedGood override must render',
  );
  // The mirror's new contrastGood (disjoint from accepted[*]) must NOT
  // render when the preferred example is workedGood.
  assert.notStrictEqual(content.workedGood, content.contrastGood);
  assert.ok(
    !html.includes(escapeForReactSsr(content.contrastGood)),
    'contrastGood must NOT render when override is workedGood (comma_clarity)',
  );
});

test('punctuation Skill Detail modal "Practise this" dispatches Guided + guidedSkillId (plan R3)', () => {
  const harness = createPunctuationHarness();
  openSkillDetailForSpeech(harness);
  // Flip to the Practise tab so the "Practise this" button appears.
  harness.dispatch('punctuation-skill-detail-tab', { value: 'practise' });
  const html = harness.render();
  assert.match(
    html,
    /<button[^>]*data-punctuation-start-skill[^>]*data-skill-id="speech"[^>]*>Practise this<\/button>/,
    '"Practise this" button must mark the skill id',
  );

  // Simulate the button's dispatch chain in the review-follower-inverted
  // order: start FIRST, then close. On success the Modal unmounts
  // naturally alongside the Map scene; on failure it stays open so the
  // learner keeps their context (review-follower adv-231-003).
  harness.dispatch('punctuation-start', {
    mode: 'guided',
    guidedSkillId: 'speech',
    roundLength: '4',
  });
  harness.dispatch('punctuation-skill-detail-close');

  // Paired state-level assertion: catches the cluster-mode silent-drop bug.
  // If a future refactor reverts to `{ mode: 'speech', skillId: 'speech' }`,
  // `prefs.mode !== 'guided'` would null the guidedSkillId in the service.
  const state = harness.store.getState().subjectUi.punctuation;
  assert.strictEqual(state.session.mode, 'guided', 'session must land in guided mode');
  assert.strictEqual(
    state.session.guidedSkillId,
    'speech',
    'session must pin guidedSkillId to the tapped skill',
  );
});

test('punctuation Skill Detail modal "Practise this" pins the correct skill in a multi-skill cluster (apostrophe)', () => {
  const harness = createPunctuationHarness();
  openMapScene(harness);
  // apostrophe cluster contains BOTH apostrophe_contractions AND
  // apostrophe_possession. The old cluster-mode dispatch would silently pick
  // either one; Guided-focus must pin the exact skill the learner tapped.
  harness.dispatch('punctuation-skill-detail-open', { skillId: 'apostrophe_contractions' });
  // Review-follower adv-231-003: start dispatch fires before close, but for
  // the happy-path state assertion the ordering is equivalent — state still
  // lands on guided+apostrophe_contractions.
  harness.dispatch('punctuation-start', {
    mode: 'guided',
    guidedSkillId: 'apostrophe_contractions',
    roundLength: '4',
  });
  harness.dispatch('punctuation-skill-detail-close');

  const state = harness.store.getState().subjectUi.punctuation;
  assert.strictEqual(state.session.mode, 'guided');
  assert.strictEqual(
    state.session.guidedSkillId,
    'apostrophe_contractions',
    'multi-skill cluster must pin the tapped skill, not the sibling',
  );
  assert.notStrictEqual(
    state.session.guidedSkillId,
    'apostrophe_possession',
    'sibling skill must not surface via cluster-mode drift',
  );
});

test('punctuation Skill Detail modal regression-locks skill-detail-open state delta (skillId: speech)', () => {
  const harness = createPunctuationHarness();
  openMapScene(harness);
  harness.dispatch('punctuation-skill-detail-open', { skillId: 'speech' });
  // Paired state assertion — learning #7: a handler that silently drops the
  // dispatch would show nothing in the HTML AND nothing in state; this check
  // fails loudly if either slips.
  assert.strictEqual(
    harness.store.getState().subjectUi.punctuation.mapUi.detailOpenSkillId,
    'speech',
  );
});

test('punctuation Skill Detail modal close button dispatches skill-detail-close', () => {
  const harness = createPunctuationHarness();
  openSkillDetailForSpeech(harness);
  const openHtml = harness.render();
  // The close button is authored in the modal with this data-action.
  assert.match(
    openHtml,
    /<button[^>]*data-action="punctuation-skill-detail-close"[^>]*aria-label="Close skill detail">/,
  );

  harness.dispatch('punctuation-skill-detail-close');
  assert.strictEqual(
    harness.store.getState().subjectUi.punctuation.mapUi.detailOpenSkillId,
    null,
  );
});

test('punctuation Skill Detail modal tab switch to Practise mutates detailTab state', () => {
  const harness = createPunctuationHarness();
  openSkillDetailForSpeech(harness);
  harness.dispatch('punctuation-skill-detail-tab', { value: 'practise' });
  assert.strictEqual(
    harness.store.getState().subjectUi.punctuation.mapUi.detailTab,
    'practise',
  );
  // Flip back — the regression-lock check for the learn default.
  harness.dispatch('punctuation-skill-detail-tab', { value: 'learn' });
  assert.strictEqual(
    harness.store.getState().subjectUi.punctuation.mapUi.detailTab,
    'learn',
  );
});

test('punctuation Skill Detail modal rejects invalid tab value (handler regression-lock)', () => {
  const harness = createPunctuationHarness();
  openSkillDetailForSpeech(harness);
  // Seed a known state so we can verify the invalid dispatch is a no-op.
  harness.dispatch('punctuation-skill-detail-tab', { value: 'practise' });
  assert.strictEqual(
    harness.store.getState().subjectUi.punctuation.mapUi.detailTab,
    'practise',
  );
  harness.dispatch('punctuation-skill-detail-tab', { value: 'garbage' });
  // Invalid payload: handler returns false, the store is untouched.
  assert.strictEqual(
    harness.store.getState().subjectUi.punctuation.mapUi.detailTab,
    'practise',
  );
});

test('punctuation Skill Detail modal SSR contains none of the 12 FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS', () => {
  const harness = createPunctuationHarness();
  openSkillDetailForSpeech(harness);
  const html = harness.render();
  // Render both tabs so we cover the Practise body too.
  harness.dispatch('punctuation-skill-detail-tab', { value: 'practise' });
  const practiseHtml = harness.render();
  const combinedHtml = `${html}\n${practiseHtml}`;

  for (const key of FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS) {
    // Word-boundary match so we don't false-positive on substrings like
    // "generator" appearing inside "generational" (no such copy in the modal,
    // but the match is still rigorous against future drift).
    const pattern = new RegExp(`\\b${key}\\b`);
    assert.ok(
      !pattern.test(combinedHtml),
      `forbidden read-model key "${key}" must not appear in Skill Detail modal HTML`,
    );
  }
});

test('punctuation Skill Detail modal SSR contains no PUNCTUATION_CHILD_FORBIDDEN_TERMS', () => {
  const harness = createPunctuationHarness();
  openSkillDetailForSpeech(harness);
  const learnHtml = harness.render();
  harness.dispatch('punctuation-skill-detail-tab', { value: 'practise' });
  const practiseHtml = harness.render();

  // Exclude the Map scene chrome from the scan — the Modal's own HTML is
  // sufficient for this test's intent. We slice from the modal root.
  const extractModal = (html) => {
    const start = html.indexOf('<div class="punctuation-skill-modal-scrim"');
    return start === -1 ? '' : html.slice(start);
  };
  const learnLeaks = forbiddenTermsInHtml(extractModal(learnHtml));
  const practiseLeaks = forbiddenTermsInHtml(extractModal(practiseHtml));
  assert.deepEqual(learnLeaks, [], `forbidden terms leaked in Learn tab: ${learnLeaks.join(', ')}`);
  assert.deepEqual(practiseLeaks, [], `forbidden terms leaked in Practise tab: ${practiseLeaks.join(', ')}`);
});

test('punctuation Skill Detail modal "Practise this" disables under degraded availability (R11)', () => {
  const harness = createPunctuationHarness();
  openSkillDetailForSpeech(harness);
  harness.store.updateSubjectUi('punctuation', {
    availability: { status: 'degraded', code: 'runtime_degraded', message: 'paused' },
  });
  harness.dispatch('punctuation-skill-detail-tab', { value: 'practise' });
  const html = harness.render();
  assert.match(
    html,
    /<button[^>]*disabled[^>]*data-punctuation-start-skill[^>]*>Practise this<\/button>/,
    '"Practise this" must be disabled under degraded availability',
  );
});

test('punctuation Skill Detail modal renders multi-skill footnote for Speech (paragraph caveat)', () => {
  const harness = createPunctuationHarness();
  openSkillDetailForSpeech(harness);
  // speech appears in sp_fa_transfer_at_last_speech + pg_fronted_speech +
  // pg_parenthesis_speech — i.e. PUNCTUATION_ITEMS entries with
  // `skillIds.length > 1`. The caveat footnote must render on Practise in
  // the review-follower-softened child register ("You might see one or two
  // other punctuation skills too — that's normal!").
  harness.dispatch('punctuation-skill-detail-tab', { value: 'practise' });
  const html = harness.render();
  assert.match(
    html,
    /You might see one or two other punctuation skills too/,
    'Speech must surface the child-register multi-skill caveat footnote',
  );
  assert.match(html, /data-punctuation-skill-modal-multi-skill-note="true"/);
});

test('punctuation Skill Detail modal does NOT render multi-skill footnote for a single-skill skill (hyphen)', () => {
  const harness = createPunctuationHarness();
  openMapScene(harness);
  harness.dispatch('punctuation-skill-detail-open', { skillId: 'hyphen' });
  harness.dispatch('punctuation-skill-detail-tab', { value: 'practise' });
  const html = harness.render();
  // hyphen only appears in single-skill PUNCTUATION_ITEMS entries — no
  // caveat footnote in the HTML.
  assert.doesNotMatch(
    html,
    /You might see one or two other punctuation skills too/,
    'hyphen must NOT surface the multi-skill caveat footnote',
  );
});

test('punctuation Skill Detail modal only renders when mapUi.detailOpenSkillId is set', () => {
  const harness = createPunctuationHarness();
  openMapScene(harness);
  const closedHtml = harness.render();
  // No modal in the Map scene default render.
  assert.doesNotMatch(closedHtml, /role="dialog"/);
  assert.doesNotMatch(closedHtml, /data-punctuation-skill-modal/);

  harness.dispatch('punctuation-skill-detail-open', { skillId: 'speech' });
  const openHtml = harness.render();
  assert.match(openHtml, /role="dialog"/);
  assert.match(openHtml, /data-punctuation-skill-modal/);
});
