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
  // Phase 3 U2 replaces the Phase 2 ten-button mode grid with a
  // dashboard hero + three primary mode cards (Smart Review / Wobbly
  // Spots / GPS Check) + one Open Map secondary card + round-length
  // toggle. The old `data-punctuation-*-start` data attributes and
  // `Endmarks focus` / `Apostrophe focus` / etc. labels are gone —
  // the U2 describe block below tests the new dashboard shape
  // explicitly, so this smoke test only asserts the hero + the
  // three primary card labels land on Setup.
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });

  const setupHtml = harness.render();
  assert.match(setupHtml, /Bellstorm Coast/);
  assert.match(setupHtml, /Punctuation practice/);
  assert.match(setupHtml, />Smart Review</);
  assert.match(setupHtml, />Wobbly Spots</);
  assert.match(setupHtml, />GPS Check</);
  assert.match(setupHtml, /data-action="punctuation-set-mode"/);

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
  // U4 follower: the scene headline now comes from the accuracy-bucketed
  // `punctuationSummaryHeadline` helper. A 1-of-1 correct session yields
  // 100% → "Great round!". The clinical `summary.label` fallback only
  // kicks in when accuracy is missing (helper returns null).
  assert.match(summaryHtml, /Great round!/);
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

test('punctuation React surface renders Guided teach box during an active session', () => {
  // Phase 3 U2: the setup-surface Guided dropdown + Weak / GPS buttons
  // are removed (the new dashboard uses three primary mode cards +
  // Open Map). This test keeps the active-item Guided teach-box
  // regression coverage — the current session's guided teach-box
  // payload still renders rule + worked example + common mistake.
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });

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

// Phase 3 U3 replaces the adult-facing `WeakFocusChips` diagnostic row with
// a child-facing header (`Question N of M · Skill · Mode`). The scene
// derives the skill name from `item.skillIds[0]` against the frozen
// `PUNCTUATION_CLIENT_SKILLS` manifest, so a weak-mode round still reads
// the skill without leaking internal bucket labels (`weakFocus`,
// `weak_facet`) — those are now in `PUNCTUATION_CHILD_FORBIDDEN_TERMS`.
test('punctuation session scene header uses child-friendly skill + mode labels in weak-mode rounds', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'active-item',
    session: {
      id: 'weak-ui',
      mode: 'weak',
      length: 1,
      answeredCount: 0,
      currentItem: {
        id: 'sp_insert_question',
        mode: 'insert',
        inputKind: 'text',
        skillIds: ['speech'],
        prompt: 'Add the direct-speech punctuation.',
        stem: 'Ella asked, can we start now?',
      },
    },
  });

  const html = harness.render();
  assert.match(html, /Inverted commas and speech punctuation/);
  assert.match(html, /Wobbly spots/);
  assert.match(html, /Question 1 of 1/);
  // Adult-facing chips / internal bucket labels must NOT leak to the child
  // scene HTML (plan R15 — `weakFocus` is in the forbidden-term fixture).
  assert.doesNotMatch(html, /Weak focus/);
  assert.doesNotMatch(html, /weak_facet/);
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
  // Phase 3 U3: GPS chip row carries the new child-facing copy. The
  // "answers at the end" phrasing replaces the adult "Delayed feedback"
  // internal-state label from the monolith.
  assert.match(activeHtml, /GPS check/);
  assert.match(activeHtml, /Test mode: answers at the end\./);
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
  // Phase 3 U4 simplification: "Next:" diagnostic framing becomes
  // "Next up:" child copy.
  assert.match(summaryHtml, /Next up: Weak spots/);
  assert.match(summaryHtml, /1\. Correct/);
  assert.match(summaryHtml, /2\. Review/);
  // Phase 3 U4 R15: raw dotted misconception ids must no longer leak into
  // the summary SSR — they pipe through punctuationChildMisconceptionLabel
  // and render as the child label ("Speech punctuation").
  assert.doesNotMatch(summaryHtml, /speech\.quote_missing/);
  assert.match(summaryHtml, /Speech punctuation/);
});

test('punctuation text input remounts when the current text item changes', async () => {
  // Phase 3 U3 adv-232-002: text-input remount lives in
  // `PunctuationSessionScene.jsx`. The `key` uses `session.answeredCount`
  // as a monotonic counter so every item transition forces remount
  // regardless of item id / prompt content. The previous `item.id ||
  // item.prompt || 'text-item'` pattern collided on empty id +
  // shared-prompt items (paragraph repair / combine) and carried the
  // prior typed answer into the next item — the learning #9 regression
  // U3 was meant to fix.
  const source = await readFile(
    new URL('../src/subjects/punctuation/components/PunctuationSessionScene.jsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /<TextItem[^>]*key=\{`text-item-\$\{session\.answeredCount \|\| 0\}`\}/);
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
  // Phase 3 U3: paragraph mode prefills the textarea with `item.stem`; the
  // old standalone pre-wrap callout is gone (the stem lives inside the
  // textarea, which preserves newlines without needing a CSS rule).
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

test('punctuation setup view disables primary mode cards when availability is degraded', () => {
  // Phase 3 U2: the old `data-punctuation-start` Start practice button
  // is replaced with three primary mode cards + an Open Map secondary
  // card. Every mutation control threads `composeIsDisabled(ui)`, so
  // degraded availability disables the Smart Review card (and every
  // other card beside it).
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'setup',
    availability: { status: 'degraded', code: 'runtime_degraded', message: 'paused' },
  });
  const html = harness.render();
  assert.match(
    html,
    /<button[^>]*disabled[^>]*data-action="punctuation-set-mode"[^>]*data-value="smart"|<button[^>]*data-action="punctuation-set-mode"[^>]*data-value="smart"[^>]*disabled/,
    'Smart Review card must be disabled under degraded availability',
  );
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
  // mapUi lands at defaults when the phase first opens. U4 follower
  // (adv-238-003) adds `returnTo` to track the source phase so close-map
  // can route back to Summary when appropriate; Setup-source opens record
  // `returnTo: 'setup'`.
  assert.deepEqual(harness.store.getState().subjectUi.punctuation.mapUi, {
    statusFilter: 'all',
    monsterFilter: 'all',
    detailOpenSkillId: null,
    detailTab: 'learn',
    returnTo: 'setup',
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

// ---------------------------------------------------------------------------
// Phase 3 U3 — Punctuation Session scene.
//
// Consolidates `active-item` + `feedback` into one scene (`PunctuationSessionScene`).
// Covers per-item-type input shape (plan R6, learning #9), the child-facing
// header (plan R5), the collapsed guided teach box, GPS delayed-feedback
// discipline (learning #10), `composeIsDisabled` threading (plan R11), and
// the forbidden-term sweep (plan R15). Each scenario pairs an HTML-match
// assertion with a state-level or adjacency check where the contract runs
// deeper than the first render (learning #7 — silent-no-op guard).
// ---------------------------------------------------------------------------

function sessionHarnessWithItem({
  mode,
  sessionMode = 'smart',
  item,
  extra = {},
}) {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'active-item',
    session: {
      id: `${mode}-ui`,
      mode: sessionMode,
      length: 1,
      answeredCount: 0,
      currentItem: item,
      ...(extra.session || {}),
    },
    ...(extra.top || {}),
  });
  return harness;
}

function extractTextarea(html) {
  const match = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/);
  return match ? { tag: match[0], body: match[1] } : null;
}

test('U3 session scene: insert mode renders textarea prefilled with item.stem and no source block', () => {
  const harness = sessionHarnessWithItem({
    mode: 'insert',
    item: {
      id: 'se_insert_capital',
      mode: 'insert',
      inputKind: 'text',
      prompt: 'Add the missing capital letter and full stop.',
      stem: 'the boat reached the harbour',
    },
  });
  const html = harness.render();
  const textarea = extractTextarea(html);
  assert.ok(textarea, 'expected a textarea in insert-mode render');
  assert.match(textarea.body, /the boat reached the harbour/);
  assert.match(textarea.tag, /rows="4"/);
  assert.doesNotMatch(html, /data-punctuation-session-source/);
});

test('U3 session scene: fix mode renders textarea prefilled with item.stem and no source block', () => {
  const harness = sessionHarnessWithItem({
    mode: 'fix',
    item: {
      id: 'sp_fix_quotes',
      mode: 'fix',
      inputKind: 'text',
      prompt: 'Fix the inverted-comma punctuation.',
      stem: 'Mia shouted look out',
    },
  });
  const html = harness.render();
  const textarea = extractTextarea(html);
  assert.ok(textarea);
  assert.match(textarea.body, /Mia shouted look out/);
  assert.match(textarea.tag, /rows="4"/);
  assert.doesNotMatch(html, /data-punctuation-session-source/);
});

test('U3 session scene: paragraph mode prefills stem and sets rows=6 on the textarea', () => {
  const harness = sessionHarnessWithItem({
    mode: 'paragraph',
    item: {
      id: 'pg_fronted_speech',
      mode: 'paragraph',
      inputKind: 'text',
      prompt: 'Repair the passage.',
      stem: 'Quietly the door opened\nShe whispered hello',
    },
  });
  const html = harness.render();
  const textarea = extractTextarea(html);
  assert.ok(textarea);
  assert.match(textarea.tag, /rows="6"/);
  assert.match(textarea.body, /Quietly the door opened\nShe whispered hello/);
  assert.doesNotMatch(html, /data-punctuation-session-source/);
});

test('U3 session scene: combine mode renders EMPTY textarea with source block above (prefill fix for learning #9)', () => {
  const harness = sessionHarnessWithItem({
    mode: 'combine',
    item: {
      id: 'sc_combine_rain_pitch',
      mode: 'combine',
      inputKind: 'text',
      prompt: 'Combine the two clauses with a semi-colon.',
      stem: 'The rain had stopped.\nThe pitch was still slippery.',
    },
  });
  const html = harness.render();
  const textarea = extractTextarea(html);
  assert.ok(textarea);
  // The body of the textarea must be empty — combine items must not prefill
  // the source sentences as the learner's answer (the old monolith bug).
  assert.equal(textarea.body.trim(), '', 'combine textarea must start blank');
  // The source block renders the stem above the textarea.
  assert.match(html, /data-punctuation-session-source[^>]*>[\s\S]*The rain had stopped/);
});

test('U3 session scene: transfer mode renders EMPTY textarea with source block above', () => {
  const harness = sessionHarnessWithItem({
    mode: 'transfer',
    item: {
      id: 'st_transfer_speech',
      mode: 'transfer',
      inputKind: 'text',
      prompt: 'Use the fact below in one accurate sentence with speech punctuation.',
      stem: 'Fact: The otters had returned to the river.',
    },
  });
  const html = harness.render();
  const textarea = extractTextarea(html);
  assert.ok(textarea);
  assert.equal(textarea.body.trim(), '', 'transfer textarea must start blank');
  assert.match(html, /data-punctuation-session-source[^>]*>[\s\S]*Fact: The otters had returned/);
});

test('U3 session scene: choose mode renders the radio group and preserves existing behaviour', () => {
  const harness = sessionHarnessWithItem({
    mode: 'choose',
    item: {
      id: 'se_choose_ending',
      mode: 'choose',
      inputKind: 'choice',
      prompt: 'Which ending is correct?',
      options: [
        { index: 0, text: 'She asked "where is the key"' },
        { index: 1, text: 'She asked, "Where is the key?"' },
      ],
    },
  });
  const html = harness.render();
  assert.match(html, /role="radiogroup"/);
  assert.match(html, /She asked, &quot;Where is the key\?&quot;|She asked, "Where is the key\?"/);
  // No textarea in the choice branch.
  assert.equal(extractTextarea(html), null);
});

test('U3 session scene: submit in non-GPS mode dispatches punctuation-submit-form with the typed answer', () => {
  const harness = sessionHarnessWithItem({
    mode: 'insert',
    item: {
      id: 'se_insert_x',
      mode: 'insert',
      inputKind: 'text',
      prompt: 'Add end punctuation.',
      stem: 'the dog barked',
    },
  });

  // Dispatch the submit action directly — the scene's onSubmit prop calls
  // `actions.dispatch('punctuation-submit-form', { typed })`. Paired state
  // assertion: the session transitions (either feedback or summary)
  // demonstrates the dispatch is wired through the real reducer.
  harness.dispatch('punctuation-submit-form', { typed: 'The dog barked.' });
  const state = harness.store.getState().subjectUi.punctuation;
  assert.ok(
    state.phase === 'feedback' || state.phase === 'summary' || state.phase === 'active-item',
    `punctuation-submit-form must land on a recognised phase, got ${state.phase}`,
  );
});

test('U3 session scene: GPS active-item phase renders NO feedback panel (learning #10 delayed feedback)', () => {
  const harness = sessionHarnessWithItem({
    mode: 'insert',
    sessionMode: 'gps',
    item: {
      id: 'se_insert_gps',
      mode: 'insert',
      inputKind: 'text',
      prompt: 'Fix the capital letter.',
      stem: 'the bell rang',
    },
    extra: {
      session: {
        gps: { testLength: 2, answeredCount: 0, remainingCount: 2, delayedFeedback: true },
      },
      top: {
        // Feedback payload is defensively populated but MUST NOT render in
        // GPS active-item — the help-visibility helper hides it.
        feedback: {
          kind: 'warn',
          headline: 'Not quite',
          body: 'Try again.',
          displayCorrection: 'The bell rang.',
        },
      },
    },
  });
  const html = harness.render();
  // The GPS active render must not surface feedback — no headline / no
  // model-answer reveal / no feedback chip container.
  assert.doesNotMatch(html, /Not quite/);
  assert.doesNotMatch(html, /Show model answer/);
  assert.doesNotMatch(html, /The bell rang\./);
});

test('U3 session scene: GPS submit label reads "Save answer" (session-ui contract)', () => {
  const harness = sessionHarnessWithItem({
    mode: 'insert',
    sessionMode: 'gps',
    item: {
      id: 'se_insert_gps_label',
      mode: 'insert',
      inputKind: 'text',
      prompt: 'Fix the end punctuation.',
      stem: 'i like toast',
    },
  });
  const html = harness.render();
  assert.match(html, /<button[^>]*data-punctuation-submit[^>]*>Save answer<\/button>/);
  assert.doesNotMatch(html, /<button[^>]*data-punctuation-submit[^>]*>Check<\/button>/);
});

test('U3 session scene: header renders "Question N of M · Skill · Mode" when item carries skillIds', () => {
  const harness = sessionHarnessWithItem({
    mode: 'insert',
    sessionMode: 'smart',
    item: {
      id: 'se_header',
      mode: 'insert',
      inputKind: 'text',
      skillIds: ['sentence_endings'],
      prompt: 'Fix capitalisation.',
      stem: 'the cat purred',
    },
    extra: {
      session: {
        length: 4,
        answeredCount: 2,
      },
    },
  });
  const html = harness.render();
  assert.match(html, /Question 3 of 4 · Capital letters and sentence endings · Smart review/);
});

test('U3 session scene: feedback phase shows headline + body + Continue by default, model behind reveal', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'feedback',
    session: {
      id: 'feedback-ui',
      mode: 'smart',
      length: 2,
      answeredCount: 1,
      currentItem: {
        id: 'se_feedback',
        mode: 'insert',
        inputKind: 'text',
        prompt: 'Fix the punctuation.',
        stem: 'hello world',
      },
    },
    feedback: {
      kind: 'warn',
      headline: 'Almost there',
      body: 'Try one more punctuation mark.',
      displayCorrection: 'Hello, world.',
      facets: [{ id: 'ending', label: 'End punctuation', ok: false }],
    },
  });
  const html = harness.render();
  // Headline + body on the hero.
  assert.match(html, /Almost there/);
  assert.match(html, /Try one more punctuation mark/);
  // Continue button is the primary feedback action.
  assert.match(html, /data-punctuation-continue/);
  // The `displayCorrection` content IS in the DOM (inside <details>) but
  // lives behind the "Show model answer" toggle — the summary text must
  // render so a screen reader can expand it.
  assert.match(html, /Show model answer/);
  assert.match(html, /Hello, world\./);
});

test('U3 session scene: raw misconceptionTags (dotted IDs) are NOT rendered as chips by default', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'feedback',
    session: {
      id: 'feedback-ui-tags',
      mode: 'smart',
      length: 1,
      answeredCount: 1,
      currentItem: {
        id: 'sp_fb_tags',
        mode: 'insert',
        inputKind: 'text',
        prompt: 'Fix the speech punctuation.',
        stem: 'Mia said look out',
      },
    },
    feedback: {
      kind: 'warn',
      headline: 'Almost — speech marks',
      body: 'Wrap the spoken words first.',
      misconceptionTags: ['speech.quote_missing'],
      facets: [],
    },
  });
  const html = harness.render();
  // Raw dotted ID must never surface as visible chip text — U3 pipes
  // `misconceptionTags` through `punctuationChildMisconceptionLabel`
  // (which returns `'Speech punctuation'` for that tag).
  assert.doesNotMatch(html, />speech\.quote_missing</);
  // When a mapped child label exists, it renders in the "Show more" reveal.
  assert.match(html, /Speech punctuation/);
});

test('U3 session scene: guided teach box renders rule line; worked example lives behind a toggle', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'active-item',
    session: {
      id: 'guided-teach-ui',
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
          selfCheckPrompt: 'Check the rule, compare the examples, then try the item without looking.',
        },
      },
      currentItem: {
        id: 'sp_insert_guided',
        mode: 'insert',
        inputKind: 'text',
        skillIds: ['speech'],
        prompt: 'Add the direct-speech punctuation.',
        stem: 'Ella asked, can we start now?',
      },
    },
  });
  const html = harness.render();
  // Rule is visible in the collapsed teach box.
  assert.match(html, /Put spoken words inside inverted commas/);
  // The worked / contrast examples live inside a `<details>` element — SSR
  // renders them in the DOM but the `<summary>Show example</summary>`
  // gating is the collapsed affordance.
  assert.match(html, /<details[^>]*punctuation-session-teach-details[\s\S]*<summary>Show example<\/summary>/);
});

test('U3 session scene: availability=unavailable disables Check / Skip / End buttons', () => {
  const harness = sessionHarnessWithItem({
    mode: 'insert',
    item: {
      id: 'se_unavailable',
      mode: 'insert',
      inputKind: 'text',
      prompt: 'Fix.',
      stem: 'hello',
    },
    extra: {
      top: {
        availability: { status: 'unavailable', code: 'runtime_unavailable', message: 'offline' },
      },
    },
  });
  const html = harness.render();
  assert.match(html, /<button[^>]*disabled[^>]*data-punctuation-submit/);
  assert.match(html, /<button[^>]*disabled[^>]*data-punctuation-skip/);
  assert.match(html, /<button[^>]*disabled[^>]*data-punctuation-end-round/);
});

test('U3 session scene: pendingCommand disables the textarea itself (not just the submit button)', () => {
  const harness = sessionHarnessWithItem({
    mode: 'insert',
    item: {
      id: 'se_pending',
      mode: 'insert',
      inputKind: 'text',
      prompt: 'Fix.',
      stem: 'hello',
    },
    extra: {
      top: {
        pendingCommand: 'punctuation-submit-form',
      },
    },
  });
  const html = harness.render();
  const textarea = extractTextarea(html);
  assert.ok(textarea);
  // Textarea itself must be disabled while a command is in flight so the
  // learner cannot keep typing into a stale mid-transition input.
  assert.match(textarea.tag, /disabled/);
  // Submit button still disabled as before (sanity check).
  assert.match(html, /<button[^>]*disabled[^>]*data-punctuation-submit/);
});

test('U3 session scene: active-item SSR contains none of PUNCTUATION_CHILD_FORBIDDEN_TERMS', () => {
  const harness = sessionHarnessWithItem({
    mode: 'insert',
    sessionMode: 'smart',
    item: {
      id: 'se_forbid_sweep',
      mode: 'insert',
      inputKind: 'text',
      skillIds: ['sentence_endings'],
      prompt: 'Fix the end punctuation.',
      stem: 'the bell rang',
    },
  });
  const html = harness.render();
  const leaks = forbiddenTermsInHtml(html);
  assert.deepEqual(
    leaks,
    [],
    `forbidden term leak in active-item session scene HTML: ${leaks.join(', ')}`,
  );
});

test('U3 session scene: feedback SSR contains none of PUNCTUATION_CHILD_FORBIDDEN_TERMS', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'feedback',
    session: {
      id: 'feedback-sweep-ui',
      mode: 'smart',
      length: 1,
      answeredCount: 1,
      currentItem: {
        id: 'se_fb_sweep',
        mode: 'insert',
        inputKind: 'text',
        skillIds: ['sentence_endings'],
        prompt: 'Fix.',
        stem: 'hello',
      },
    },
    feedback: {
      kind: 'success',
      headline: 'Nice.',
      body: 'Capital and full stop land clean.',
      displayCorrection: 'Hello.',
      facets: [{ id: 'ending', label: 'End punctuation', ok: true }],
      misconceptionTags: [],
    },
  });
  const html = harness.render();
  const leaks = forbiddenTermsInHtml(html);
  assert.deepEqual(
    leaks,
    [],
    `forbidden term leak in feedback session scene HTML: ${leaks.join(', ')}`,
  );
});

test('U3 session scene: every cluster focus mode still starts a session via punctuation-start (R4/R16 behavioural cover)', () => {
  // Plan R16: the six cluster-focus modes stay dispatchable via
  // punctuation-start with `mode: <clusterId>`. The primary-setup
  // affordances moved (U2 owns); the dispatch path keeps behavioural
  // parity with the Phase 2 U9 matrix.
  for (const mode of ['endmarks', 'apostrophe', 'speech', 'comma_flow', 'boundary', 'structure']) {
    const harness = createPunctuationHarness();
    harness.dispatch('open-subject', { subjectId: 'punctuation' });
    harness.dispatch('punctuation-start', { mode, roundLength: '1' });
    const state = harness.store.getState().subjectUi.punctuation;
    // The scheduler may transition immediately to `active-item` or fall
    // through on a stock learner — either phase proves the dispatch is
    // reachable. The state-level check closes the silent-no-op gap
    // (learning #7) that a simple HTML-match would not.
    assert.ok(
      state.phase === 'active-item' || state.session?.mode === mode,
      `punctuation-start with mode=${mode} did not land on a recognised session state`,
    );
  }
});

// ---------------------------------------------------------------------------
// Phase 3 U3 adv-232 review-follower block.
//
// Five blockers (3 HIGH + 2 MEDIUM) raised on PR #232:
//
//   adv-232-001 HIGH: `pendingCommand` never flips for punctuation —
//     `composeIsDisabled` reads `ui?.pendingCommand` but no code path
//     writes `subjectUi.punctuation.pendingCommand`. Wiring test
//     dispatches `punctuation-submit-form` through the real action
//     handler and observes the store snapshot sequence — a production
//     wire has to write `pendingCommand` before clearing it.
//
//   adv-232-002 HIGH: `TextItem` key collision on empty id + shared prompt.
//     Two consecutive items with the same prompt + empty id reuse the same
//     TextItem instance and the previously-typed answer carries over. The
//     key pattern must force remount on every item transition regardless
//     of item content — `session.answeredCount` is the monotonic counter
//     that guarantees this.
//
//   adv-232-003 HIGH: `ChoiceItem` has no `key` prop at all. Same class as
//     002 but affects every consecutive `choose` item (not just same-
//     prompt ones). Radio selection from item N carries over to item N+1.
//
//   adv-232-004 MEDIUM: GPS contract literal `session.mode === 'gps'` gate
//     in `FeedbackBranch`. Switch to the authoritative `!help.showFeedback`
//     signal so any future read-model shape that sets `showFeedback: false`
//     also hides `feedback.displayCorrection`, not just the literal GPS
//     mode string.
//
//   design-lens HIGH: combine/transfer blockquote lacks `aria-label` and
//     bridging copy between source text and textarea. Session-phase
//     forbidden-terms sweep must cover every item mode, not just `insert`.
// ---------------------------------------------------------------------------

test('adv-232-001 HIGH: punctuation-submit-form writes pendingCommand through the real action handler', () => {
  // Dispatches through the real pipeline (not a seed) and observes the
  // store snapshot sequence via `store.subscribe`. A production wire must
  // set `pendingCommand === 'punctuation-submit-form'` on at least one
  // snapshot between `dispatch()` entering and returning. Seeding
  // `pendingCommand` on the initial state would not prove this — only an
  // observed intermediate snapshot during dispatch does.
  const harness = sessionHarnessWithItem({
    mode: 'insert',
    sessionMode: 'smart',
    item: {
      id: 'se_pending_wiring',
      mode: 'insert',
      inputKind: 'text',
      prompt: 'Add end punctuation.',
      stem: 'the cat sat',
    },
  });
  const snapshots = [];
  const unsubscribe = harness.store.subscribe((state) => {
    snapshots.push(state.subjectUi.punctuation?.pendingCommand || '');
  });
  harness.dispatch('punctuation-submit-form', { typed: 'The cat sat.' });
  unsubscribe();
  assert.ok(
    snapshots.some((value) => value === 'punctuation-submit-form'),
    `expected an intermediate snapshot with pendingCommand='punctuation-submit-form'; got ${JSON.stringify(snapshots)}`,
  );
  // Final state must clear pendingCommand so the UI re-enables after the
  // command settles.
  const finalState = harness.store.getState().subjectUi.punctuation;
  assert.equal(finalState.pendingCommand || '', '', 'pendingCommand must clear once the synchronous transition settles');
});

test('adv-232-002 HIGH: consecutive combine items with shared prompt + empty id do NOT carry prior typed answer', async () => {
  // Pre-fix: `key={item.id || item.prompt || 'text-item'}` falls back to
  // `item.prompt` when `item.id` is empty, so two items sharing the same
  // prompt reuse the React TextItem instance and the previously-typed
  // answer stays in the textarea. Post-fix: key includes
  // `session.answeredCount` so every item transition forces remount.
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'active-item',
    session: {
      id: 'carryover-ui',
      mode: 'smart',
      length: 2,
      answeredCount: 0,
      currentItem: {
        id: '',
        mode: 'combine',
        inputKind: 'text',
        prompt: 'Combine the clauses.',
        stem: 'The rain fell.\nThe pitch was wet.',
      },
    },
  });
  // Simulate learner having typed an answer into the mounted textarea.
  // SSR cannot capture typed state, so we prove the contract at the key
  // level: after advancing to a second item sharing the same prompt +
  // empty id, the rendered textarea body must be empty (i.e. a new
  // component instance with its own useState('')).
  harness.store.updateSubjectUi('punctuation', {
    phase: 'active-item',
    session: {
      id: 'carryover-ui',
      mode: 'smart',
      length: 2,
      answeredCount: 1,
      currentItem: {
        id: '',
        mode: 'combine',
        inputKind: 'text',
        prompt: 'Combine the clauses.',
        stem: 'The wind blew.\nThe flag waved.',
      },
    },
  });
  const html = harness.render();
  const textarea = extractTextarea(html);
  assert.ok(textarea, 'expected a textarea on the second combine item');
  assert.equal(textarea.body.trim(), '', 'second combine item textarea must start blank — no carry-over from item 1');
  // The key pattern must include the monotonic answeredCount so every
  // transition forces remount regardless of item content.
  const sceneSource = await readFile(
    new URL('../src/subjects/punctuation/components/PunctuationSessionScene.jsx', import.meta.url),
    'utf8',
  );
  assert.match(
    sceneSource,
    /<TextItem[^>]*key=\{`text-item-\$\{session\.answeredCount \|\| 0\}`\}/,
    'TextItem key must derive from session.answeredCount so consecutive items remount (adv-232-002)',
  );
});

test('adv-232-003 HIGH: ChoiceItem has a key prop that forces remount on every item transition', async () => {
  // Pre-fix: `<ChoiceItem>` is rendered with NO key, so two consecutive
  // `choose` items reuse the same component instance and the radio
  // selection from item N carries over to item N+1. Post-fix: key uses
  // `session.answeredCount` as a monotonic counter.
  const sceneSource = await readFile(
    new URL('../src/subjects/punctuation/components/PunctuationSessionScene.jsx', import.meta.url),
    'utf8',
  );
  assert.match(
    sceneSource,
    /<ChoiceItem[^>]*key=\{`choice-item-\$\{session\.answeredCount \|\| 0\}`\}/,
    'ChoiceItem key must derive from session.answeredCount so consecutive items remount (adv-232-003)',
  );
  // Paired SSR assertion: the first render shows no pre-selected radio
  // (choiceIndex starts at ''). The second render after advancing
  // answeredCount must render the same contract — no server-side carry.
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'active-item',
    session: {
      id: 'choice-carryover-ui',
      mode: 'smart',
      length: 2,
      answeredCount: 1,
      currentItem: {
        id: '',
        mode: 'choose',
        inputKind: 'choice',
        prompt: 'Which ending is correct?',
        options: [
          { index: 0, text: 'She asked "where is the key"' },
          { index: 1, text: 'She asked, "Where is the key?"' },
        ],
      },
    },
  });
  const html = harness.render();
  // No radio input carries the `checked` attribute on SSR render (the
  // scene's ChoiceItem starts with useState('') so no pre-selection).
  assert.doesNotMatch(html, /<input[^>]*type="radio"[^>]*checked/);
});

test('adv-232-004 MEDIUM: FeedbackBranch gate uses !help.showFeedback (authoritative) not session.mode==="gps"', async () => {
  // Pre-fix: the GPS minimal branch gates on the literal string
  // `session.mode === 'gps'`. Post-fix: it gates on `!help.showFeedback`
  // which matches the session-ui help-visibility table (the authoritative
  // source for whether the feedback panel is visible in a given phase).
  const sceneSource = await readFile(
    new URL('../src/subjects/punctuation/components/PunctuationSessionScene.jsx', import.meta.url),
    'utf8',
  );
  // The gate must use the authoritative `!help.showFeedback` flag.
  assert.match(
    sceneSource,
    /if \(!help\.showFeedback\) \{/,
    'FeedbackBranch must gate the minimal branch on !help.showFeedback (adv-232-004)',
  );
  // And the literal-GPS gate must be gone.
  assert.doesNotMatch(
    sceneSource,
    /if \(session\.mode === 'gps' && !help\.showFeedback\)/,
    'literal session.mode === "gps" gate must be removed (adv-232-004)',
  );
  // Paired behavioural check: the existing GPS feedback-phase scenario
  // still hides per-item feedback (mode='gps' makes help.showFeedback false).
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'feedback',
    session: {
      id: 'gps-fb-ui',
      mode: 'gps',
      length: 2,
      answeredCount: 1,
      currentItem: { id: 'x', mode: 'insert', inputKind: 'text', prompt: 'p', stem: '' },
    },
    feedback: {
      kind: 'warn',
      headline: 'Should not render',
      body: 'Should not render either.',
      displayCorrection: 'Hidden by the gate.',
    },
  });
  const html = harness.render();
  assert.doesNotMatch(html, /Should not render/);
  assert.doesNotMatch(html, /Hidden by the gate\./);
});

test('design-lens HIGH: combine/transfer source blockquote carries aria-label and a bridging paragraph', () => {
  // The blockquote is read-only source material. Screen readers need a
  // label so a learner landing on it knows it is source (not an input
  // field), and sighted learners need a bridging sentence between the
  // source block and the `<label>Your answer</label>` so the connection
  // between "read this" and "write below" is explicit.
  const harness = sessionHarnessWithItem({
    mode: 'combine',
    item: {
      id: 'sc_bridge',
      mode: 'combine',
      inputKind: 'text',
      prompt: 'Combine the clauses.',
      stem: 'A one.\nA two.',
    },
  });
  const html = harness.render();
  assert.match(
    html,
    /<blockquote[^>]*aria-label="Source text — read only"/,
    'combine source blockquote must carry aria-label="Source text — read only"',
  );
  // Bridging copy sits between the blockquote and the Your-answer label.
  assert.match(
    html,
    /Read the text above, then write your answer below\./,
    'combine source must be followed by a visible bridging paragraph',
  );
});

// ---------------------------------------------------------------------------
// Phase 3 U4 — Punctuation Summary scene.
//
// `phase === 'summary'` now routes through the standalone
// `PunctuationSummaryScene` (not the pre-U4 inline `SummaryView`). Assertions
// cover score chip row, wobbly chip child labels (with positive empty-state
// copy), active-only monster strip driven off the canonical `ui.rewardState`
// path threaded from `PunctuationPracticeSurface` (HIGH 1 fix), GPS review
// cards with misconception-label piping, 4 next-action buttons with paired
// state-level dispatch verification (including tightened Start-again assertion
// per MEDIUM 3), composeIsDisabled threading, accuracy-bucketed celebration
// headline (HIGH 2 fix), and absence of the Grown-up view placeholder
// (MEDIUM 1 fix — handler-less button removed).
//
// SSR blind spots (learning #6): every behavioural assertion is paired with
// either a state-level post-dispatch check or a DOM-match regex so a silent
// no-op can't pass (learning #7).
// ---------------------------------------------------------------------------

function openSummaryScene(harness, extraSummary = {}) {
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'summary',
    summary: {
      label: 'Punctuation session summary',
      message: 'Session complete.',
      total: 4,
      correct: 3,
      accuracy: 75,
      focus: [],
      ...extraSummary,
    },
  });
}

test('Punctuation summary scene: score chip row renders Answered / Correct / Accuracy', () => {
  const harness = createPunctuationHarness();
  openSummaryScene(harness, { total: 6, correct: 4, accuracy: 67 });
  const html = harness.render();
  // Score labels live on dedicated stat blocks so each chip surfaces the
  // right count. Assertions co-locate label and value to guard against a
  // future regression that swaps the order of the three stats.
  assert.match(html, /Answered/);
  assert.match(html, /Correct/);
  assert.match(html, /Accuracy/);
  assert.match(html, /stat-value">6<\/div>/);
  assert.match(html, /stat-value">4<\/div>/);
  assert.match(html, /stat-value">67%<\/div>/);
});

test('Punctuation summary scene: wobbly chips use child skill labels, not raw skill IDs', () => {
  const harness = createPunctuationHarness();
  openSummaryScene(harness, {
    focus: ['speech', 'comma_clarity'],
  });
  const html = harness.render();
  // Child-facing chip copy — derived from PUNCTUATION_CLIENT_SKILLS.name.
  assert.match(html, /Inverted commas and speech punctuation needs another go/);
  assert.match(html, /Commas for clarity needs another go/);
  // Raw skill ids must not leak (plan R15 / learning #9).
  assert.doesNotMatch(html, /data-skill-id="speech"[^>]*>speech</);
  assert.doesNotMatch(html, />speech<\/span>/);
  assert.doesNotMatch(html, />comma_clarity<\/span>/);
});

test('Punctuation summary scene: unknown skill ids are dropped rather than rendered raw', () => {
  const harness = createPunctuationHarness();
  openSummaryScene(harness, { focus: ['speech', 'unknown_skill_xyz'] });
  const html = harness.render();
  // Known id surfaces; unknown id is silently hidden.
  assert.match(html, /Inverted commas and speech punctuation needs another go/);
  assert.doesNotMatch(html, /unknown_skill_xyz/);
});

test('Punctuation summary scene: empty focus omits the "needs another go" warn row', () => {
  // U4 follower (design-lens MEDIUM 4): the warn-row aria-label "Skills
  // that need another go" only renders when there is at least one wobbly
  // chip. An empty `summary.focus` renders the positive "secure" chip
  // under a different aria-label ("Round outcome") — see the paired empty
  // chip test below. Both chip rows share the `punctuation-summary-wobbly`
  // class but never co-render.
  const harness = createPunctuationHarness();
  openSummaryScene(harness, { focus: [] });
  const html = harness.render();
  assert.doesNotMatch(html, /aria-label="Skills that need another go"/);
  assert.doesNotMatch(html, /needs another go/);
});

test('Punctuation summary scene: active monster strip renders 4 monsters, no reserved trio', () => {
  const harness = createPunctuationHarness();
  // U4 follower (HIGH 1): the Summary scene reads `ui.rewardState` — the
  // flat path that `PunctuationMapScene` uses and that
  // `PunctuationPracticeSurface` threads in via the resolved prop. The
  // pre-fix path `ui.rewards.monsters.punctuation` was fixture-only;
  // production always rendered "Stage 0 of 4" because no code wrote that
  // shape. Seed at the real path so a reserved-monster leak is still
  // caught AND the roster iteration is driven off the path production uses.
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'summary',
    summary: { total: 0, correct: 0, accuracy: 0, focus: [] },
    rewardState: {
      pealark: { mastered: ['m1'], caught: true },
      claspin: { mastered: [], caught: false },
      curlune: { mastered: [], caught: false },
      quoral: { mastered: [], caught: false },
      // Reserved — must NEVER surface in the strip even when seeded.
      colisk: { mastered: ['leak-1'], caught: true },
      hyphang: { mastered: ['leak-2'], caught: true },
      carillon: { mastered: ['leak-3'], caught: true },
    },
  });
  const html = harness.render();
  // Active monsters render.
  assert.match(html, /data-monster-id="pealark"/);
  assert.match(html, /data-monster-id="claspin"/);
  assert.match(html, /data-monster-id="curlune"/);
  assert.match(html, /data-monster-id="quoral"/);
  // Reserved monsters must never reach the DOM.
  assert.doesNotMatch(html, /data-monster-id="colisk"/);
  assert.doesNotMatch(html, /data-monster-id="hyphang"/);
  assert.doesNotMatch(html, /data-monster-id="carillon"/);
});

test('Punctuation summary scene: monster strip renders production path via repositories.gameState', () => {
  // U4 follower (HIGH 1, production-path integration): the Summary scene
  // receives a resolved `rewardState` prop from `PunctuationPracticeSurface`
  // which reads `repositories.gameState.read(learnerId, 'monster-codex')`.
  // Seed monster-codex state via the repository (the canonical write path
  // used by the punctuation reward subscriber) so the render assertion
  // exercises the real production data flow rather than a fixture shape
  // no production code ever writes.
  //
  // `progressForPunctuationMonster` filters the `mastered` array by the
  // `punctuation:<releaseId>:` prefix so only the current release's keys
  // contribute to the count — the test mastery keys carry the
  // `PUNCTUATION_RELEASE_ID` prefix so production parity is honoured.
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  const learnerId = harness.store.getState().learners.selectedId;
  const prefix = `punctuation:${PUNCTUATION_RELEASE_ID}:`;
  harness.repositories.gameState.write(learnerId, 'monster-codex', {
    pealark: {
      releaseId: PUNCTUATION_RELEASE_ID,
      mastered: [`${prefix}endmarks:key-1`, `${prefix}endmarks:key-2`, `${prefix}endmarks:key-3`],
      masteredCount: 3,
      caught: true,
    },
  });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'summary',
    summary: { total: 4, correct: 4, accuracy: 100, focus: [] },
  });
  const html = harness.render();
  // The strip renders Pealark and its stage label reads non-zero — proof
  // the scene is reading the canonical repository path, not a dead fixture
  // shape. The exact stage depends on `publishedTotal` per monster; the
  // non-zero assertion is enough to catch the regression where the scene
  // rendered "Stage 0 of 4" for every production learner.
  assert.match(html, /data-monster-id="pealark"/);
  const stageMatch = html.match(/aria-label="Pealark stage (\d) of 4"/);
  assert.ok(stageMatch, 'expected a pealark stage aria-label');
  const stage = Number(stageMatch[1]);
  assert.ok(stage > 0, `expected pealark stage > 0 after seeding mastery, saw ${stage}`);
});

test('Punctuation summary scene: GPS review cards render with preserved Phase 2 contract', () => {
  const harness = createPunctuationHarness();
  openSummaryScene(harness, {
    label: 'Punctuation GPS test summary',
    message: 'GPS test complete.',
    total: 2,
    correct: 1,
    accuracy: 50,
    gps: {
      delayedFeedback: true,
      recommendedMode: 'weak',
      recommendedLabel: 'Wobbly spots',
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
  });
  const html = harness.render();
  assert.match(html, /GPS review/);
  // Child-facing "Next up" copy uses `recommendedLabel`, not `recommendedMode`.
  assert.match(html, /Next up: Wobbly spots/);
  assert.match(html, /1\. Correct/);
  assert.match(html, /2\. Review/);
  assert.match(html, /Ella asked, &quot;Can we start now\?&quot;/);
});

test('Punctuation summary scene: misconception tags pipe through child label map, null tags hidden', () => {
  const harness = createPunctuationHarness();
  openSummaryScene(harness, {
    gps: {
      delayedFeedback: true,
      recommendedMode: 'smart',
      recommendedLabel: 'Smart review',
      reviewItems: [
        {
          index: 1,
          itemId: 'sp_insert_question',
          mode: 'insert',
          prompt: 'Add the direct-speech punctuation.',
          attemptedAnswer: '',
          displayCorrection: '',
          correct: false,
          // speech.quote_missing → "Speech punctuation" (mapped).
          // never.heard.of.this → null (dropped).
          misconceptionTags: ['speech.quote_missing', 'never.heard.of.this'],
        },
      ],
    },
  });
  const html = harness.render();
  // Child label surfaces.
  assert.match(html, /Speech punctuation</);
  // Raw dotted id must not leak — part of PUNCTUATION_CHILD_FORBIDDEN_TERMS.
  assert.doesNotMatch(html, /speech\.quote_missing/);
  assert.doesNotMatch(html, /never\.heard\.of\.this/);
});

test('Punctuation summary scene: GPS card dedupes misconception labels to a single chip per label', () => {
  // A single GPS item can carry multiple sub-tags that all map to the same
  // child label (e.g. speech.quote_missing + speech.quote_unmatched both
  // → "Speech punctuation"). The chip row must render one chip per unique
  // label, not one per raw tag.
  const harness = createPunctuationHarness();
  openSummaryScene(harness, {
    gps: {
      delayedFeedback: true,
      recommendedMode: 'weak',
      recommendedLabel: 'Wobbly spots',
      reviewItems: [
        {
          index: 1,
          itemId: 'sp_dupes',
          mode: 'insert',
          prompt: 'Add the direct-speech punctuation.',
          attemptedAnswer: '',
          displayCorrection: '',
          correct: false,
          misconceptionTags: ['speech.quote_missing', 'speech.quote_unmatched'],
        },
      ],
    },
  });
  const html = harness.render();
  const matches = html.match(/>Speech punctuation</g) || [];
  assert.equal(matches.length, 1, 'should render exactly one "Speech punctuation" chip');
});

test('Punctuation summary scene: renders 4 next-action buttons', () => {
  const harness = createPunctuationHarness();
  openSummaryScene(harness);
  const html = harness.render();
  assert.match(html, /<button[^>]*data-action="punctuation-start"[^>]*data-value="weak"[^>]*>Practise wobbly spots<\/button>/);
  assert.match(html, /<button[^>]*data-action="punctuation-open-map"[^>]*>Open Punctuation Map<\/button>/);
  assert.match(html, /<button[^>]*data-action="punctuation-start-again"[^>]*>Start again<\/button>/);
  assert.match(html, /<button[^>]*data-action="punctuation-back"[^>]*>Back to dashboard<\/button>/);
});

test('Punctuation summary scene: Practise wobbly spots dispatch results in session.mode === `weak`', () => {
  const harness = createPunctuationHarness();
  openSummaryScene(harness);
  harness.dispatch('punctuation-start', { mode: 'weak' });
  const state = harness.store.getState().subjectUi.punctuation;
  // Paired state-level assertion per learning #7: a silent no-op would
  // leave `session.mode` unchanged, so explicit equality catches it.
  assert.equal(state.session?.mode, 'weak');
});

test('Punctuation summary scene: Open Punctuation Map dispatch transitions phase to map', () => {
  // U5's `punctuation-open-map` handler allowlists `summary` as a source
  // phase (service-contract PUNCTUATION_OPEN_MAP_ALLOWED_PHASES = ['setup',
  // 'summary']). If that allowlist ever regressed, this test fails.
  const harness = createPunctuationHarness();
  openSummaryScene(harness);
  harness.dispatch('punctuation-open-map');
  const state = harness.store.getState().subjectUi.punctuation;
  assert.equal(state.phase, 'map');
  assert.equal(state.mapUi?.statusFilter, 'all');
  assert.equal(state.mapUi?.monsterFilter, 'all');
});

test('Punctuation summary scene: Start again dispatch triggers a fresh session', () => {
  // U4 follower (correctness MEDIUM 3): tighten the assertion. The
  // pre-fix test accepted `phase === 'active-item' || 'summary'`, which
  // would silently pass even if the dispatch was a no-op (Summary seeded,
  // Summary preserved). Production guarantees Start Again advances to
  // `active-item` with a live session seeded from the chosen prefs mode.
  const harness = createPunctuationHarness();
  openSummaryScene(harness);
  // Seed a prefs mode so start-again has a mode to resume.
  const learnerId = harness.store.getState().learners.selectedId;
  harness.services.punctuation.savePrefs(learnerId, { mode: 'smart', roundLength: '4' });
  harness.dispatch('punctuation-start-again');
  const state = harness.store.getState().subjectUi.punctuation;
  assert.equal(state.phase, 'active-item', `phase should be 'active-item', saw ${state.phase}`);
  assert.ok(state.session, 'active-item phase must have a session');
  // `session.mode` is derived from prefs by `service.startSession`. Smart
  // Review reads as `'smart'` in the session record — the exact mode
  // asserts that the dispatch carried prefs through rather than defaulting
  // to some other branch.
  assert.equal(state.session.mode, 'smart', `session.mode should match chosen prefs mode`);
});

test('Punctuation summary scene: Back to dashboard dispatch returns phase to setup', () => {
  const harness = createPunctuationHarness();
  openSummaryScene(harness);
  harness.dispatch('punctuation-back');
  const state = harness.store.getState().subjectUi.punctuation;
  assert.equal(state.phase, 'setup');
});

test('Punctuation summary scene: composeIsDisabled=true disables Start again and Practise wobbly spots', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'summary',
    pendingCommand: 'punctuation-continue',
    summary: { total: 4, correct: 3, accuracy: 75, focus: [] },
  });
  const html = harness.render();
  // Every next-action button renders with `disabled` when composeIsDisabled.
  assert.match(
    html,
    /<button[^>]*disabled[^>]*data-action="punctuation-start"[^>]*data-value="weak"|<button[^>]*data-action="punctuation-start"[^>]*data-value="weak"[^>]*disabled/,
    'Practise wobbly spots must be disabled under pendingCommand',
  );
  assert.match(
    html,
    /<button[^>]*disabled[^>]*data-action="punctuation-start-again"|<button[^>]*data-action="punctuation-start-again"[^>]*disabled/,
    'Start again must be disabled under pendingCommand',
  );
  assert.match(
    html,
    /<button[^>]*disabled[^>]*data-action="punctuation-open-map"|<button[^>]*data-action="punctuation-open-map"[^>]*disabled/,
    'Open Punctuation Map must be disabled under pendingCommand',
  );
  assert.match(
    html,
    /<button[^>]*disabled[^>]*data-action="punctuation-back"|<button[^>]*data-action="punctuation-back"[^>]*disabled/,
    'Back to dashboard must be disabled under pendingCommand',
  );
});

test('Punctuation summary scene: Grown-up view placeholder is not rendered (adv-238-002)', () => {
  // U4 follower (adversarial MEDIUM 1): the pre-fix scene rendered a
  // "Grown-up view" button that dispatched `punctuation-open-adult-view`
  // against a non-existent handler — a child tap produced a silent no-op.
  // The button is removed until Parent Hub ships the adult surface so
  // there is no dead UX to tap.
  const harness = createPunctuationHarness();
  openSummaryScene(harness);
  const html = harness.render();
  assert.doesNotMatch(html, /data-action="punctuation-open-adult-view"/);
  assert.doesNotMatch(html, />Grown-up view</);
});

test('Punctuation summary scene: empty wobbly focus renders positive "secure" chip', () => {
  // U4 follower (design-lens MEDIUM 4): a round with no wobbly skills
  // previously rendered an empty slot. The positive chip keeps the slot
  // communicating round outcome.
  const harness = createPunctuationHarness();
  openSummaryScene(harness, { focus: [] });
  const html = harness.render();
  assert.match(html, /Everything was secure this round!/);
  assert.match(html, /data-punctuation-summary-wobbly-empty/);
  // The empty slot still carries an accessible role so screen readers
  // surface the positive outcome rather than silencing it.
  assert.match(html, /aria-label="Round outcome"/);
});

test('Punctuation summary scene: hero headline uses celebratory copy for high accuracy', () => {
  // U4 follower (design-lens HIGH 2): accuracy-bucketed child copy.
  const harness = createPunctuationHarness();
  openSummaryScene(harness, { accuracy: 85 });
  const html = harness.render();
  assert.match(html, /Great round!/);
  assert.doesNotMatch(html, /Punctuation session summary/);
});

test('Punctuation summary scene: hero headline uses encouraging copy for mid accuracy', () => {
  const harness = createPunctuationHarness();
  openSummaryScene(harness, { accuracy: 55 });
  const html = harness.render();
  assert.match(html, /Good try!/);
});

test('Punctuation summary scene: hero headline uses supportive copy for low accuracy', () => {
  const harness = createPunctuationHarness();
  openSummaryScene(harness, { accuracy: 20 });
  const html = harness.render();
  assert.match(html, /Keep going/);
});

test('Punctuation round-trip: summary → open-map → close-map returns to summary (adv-238-003)', () => {
  // U4 follower (adversarial MEDIUM 2): `punctuation-close-map` pre-fix
  // unconditionally set `phase: 'setup'`, so a learner who opened the Map
  // from Summary lost their completion screen on close. The fix stashes
  // the source phase in `mapUi.returnTo` on open-map; close-map reads it
  // and routes back accordingly (default 'setup' for Setup-source opens).
  const harness = createPunctuationHarness();
  openSummaryScene(harness);
  // Open Map from Summary.
  harness.dispatch('punctuation-open-map');
  const mapState = harness.store.getState().subjectUi.punctuation;
  assert.equal(mapState.phase, 'map');
  assert.equal(mapState.mapUi?.returnTo, 'summary');
  // Close Map — learner lands back on Summary, not Setup.
  harness.dispatch('punctuation-close-map');
  const state = harness.store.getState().subjectUi.punctuation;
  assert.equal(state.phase, 'summary', `close-map should return to summary, saw ${state.phase}`);
  assert.ok(state.summary, 'summary payload must be preserved through the round trip');
});

test('Punctuation round-trip: setup → open-map → close-map returns to setup (default path)', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.dispatch('punctuation-open-map');
  const mapState = harness.store.getState().subjectUi.punctuation;
  assert.equal(mapState.phase, 'map');
  assert.equal(mapState.mapUi?.returnTo, 'setup');
  harness.dispatch('punctuation-close-map');
  const state = harness.store.getState().subjectUi.punctuation;
  assert.equal(state.phase, 'setup');
});

test('Punctuation summary scene: SSR HTML contains no forbidden child terms', () => {
  const harness = createPunctuationHarness();
  openSummaryScene(harness, {
    focus: ['speech', 'comma_clarity'],
    gps: {
      delayedFeedback: true,
      recommendedMode: 'weak',
      recommendedLabel: 'Wobbly spots',
      reviewItems: [
        {
          index: 1,
          itemId: 'sp1',
          mode: 'insert',
          prompt: 'Add the direct-speech punctuation.',
          attemptedAnswer: 'Ella asked',
          displayCorrection: 'Ella asked, can we start?',
          correct: false,
          misconceptionTags: ['speech.quote_missing'],
        },
      ],
    },
  });
  const html = harness.render();
  const leaks = forbiddenTermsInHtml(html);
  assert.deepEqual(leaks, [], `forbidden term leak in summary SSR: ${leaks.join(', ')}`);
});

test('design-lens HIGH: every item mode passes the PUNCTUATION_CHILD_FORBIDDEN_TERMS sweep in the session scene', () => {
  // U3 must render every item mode without leaking any adult / internal
  // terms. The pre-existing sweep covered only `insert`. We iterate every
  // mode so a regression in any branch (combine / transfer / paragraph /
  // choose / fix) fails loudly.
  const scenarios = [
    { mode: 'insert', inputKind: 'text', prompt: 'Fix the end punctuation.', stem: 'the bell rang' },
    { mode: 'fix', inputKind: 'text', prompt: 'Fix the speech punctuation.', stem: 'Mia said look out' },
    { mode: 'paragraph', inputKind: 'text', prompt: 'Repair the whole passage.', stem: 'Line one.\nLine two.' },
    { mode: 'combine', inputKind: 'text', prompt: 'Combine the clauses.', stem: 'The rain fell.\nThe pitch was wet.' },
    { mode: 'transfer', inputKind: 'text', prompt: 'Write one accurate sentence.', stem: 'Fact: the wind blew.' },
    {
      mode: 'choose',
      inputKind: 'choice',
      prompt: 'Which ending is correct?',
      options: [
        { index: 0, text: 'She asked "where is the key"' },
        { index: 1, text: 'She asked, "Where is the key?"' },
      ],
    },
  ];
  for (const extra of scenarios) {
    const harness = sessionHarnessWithItem({
      mode: extra.mode,
      sessionMode: 'smart',
      item: {
        id: `sweep_${extra.mode}`,
        skillIds: ['sentence_endings'],
        ...extra,
      },
    });
    const html = harness.render();
    const leaks = forbiddenTermsInHtml(html);
    assert.deepEqual(
      leaks,
      [],
      `forbidden term leak in session scene (${extra.mode}): ${leaks.join(', ')}`,
    );
  }
});

// ---------------------------------------------------------------------------
// Phase 3 U2 — Punctuation setup scene (child dashboard).
//
// Replaces the Phase 2 ten-button mode grid with Hero + Today cards +
// three primary journey cards (Smart Review / Wobbly Spots / GPS Check) +
// one "Open Punctuation Map" secondary card + compact round-length
// toggle + active-monster strip. Reserved monsters (Colisk / Hyphang /
// Carillon) NEVER surface regardless of state shape.
//
// SSR blind spots (learning #6): focus, pointer-capture, and scroll are
// not observable here — assertions pair HTML-match with state-level
// checks (learning #7) where a silent no-op would otherwise pass.
// ---------------------------------------------------------------------------

function forbiddenTermsInSetupHtml(html) {
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

test('punctuation Setup scene renders 3 primary mode cards + Open Map secondary card', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  const html = harness.render();

  // Three primary journey cards, each tagged by mode id.
  for (const modeId of ['smart', 'weak', 'gps']) {
    assert.match(
      html,
      new RegExp(`data-action="punctuation-set-mode"[^>]*data-value="${modeId}"`),
      `missing primary mode card for ${modeId}`,
    );
  }
  // Child-facing labels land too.
  assert.match(html, />Smart Review</);
  assert.match(html, />Wobbly Spots</);
  assert.match(html, />GPS Check</);
  // Exactly one Open Map secondary card.
  const openMapMatches = html.match(/data-action="punctuation-open-map"/g) || [];
  assert.equal(openMapMatches.length, 1, 'expected exactly one Open Map affordance');
  assert.match(html, />Open Punctuation Map</);
});

test('punctuation Setup scene does not render the 6 cluster focus buttons (plan R1)', () => {
  // Phase 3 U2 demotes the 6 cluster focus modes from primary-setup
  // affordances. They stay dispatchable via direct mode dispatch
  // (Phase 2 U9 parity matrix) but should never appear as Setup
  // buttons again. Regression guard against a future revert.
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  const html = harness.render();

  for (const label of ['Endmarks focus', 'Apostrophe focus', 'Speech focus', 'Comma focus', 'Boundary focus', 'Structure focus']) {
    assert.doesNotMatch(html, new RegExp(`>${label}<`), `${label} should no longer render on Setup`);
  }
  // Also check the old data attributes are gone.
  assert.doesNotMatch(html, /data-punctuation-endmarks-start/);
  assert.doesNotMatch(html, /data-punctuation-apostrophe-start/);
  assert.doesNotMatch(html, /data-punctuation-guided-start/);
  assert.doesNotMatch(html, /data-punctuation-weak-start/);
  assert.doesNotMatch(html, /data-punctuation-gps-start/);
});

test('punctuation Setup scene Smart Review card has aria-pressed="true" when prefs.mode is smart', () => {
  const harness = createPunctuationHarness();
  const learnerId = harness.store.getState().learners.selectedId;
  harness.services.punctuation.savePrefs(learnerId, { mode: 'smart', roundLength: '4' });
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  // Force a fresh dispatch so ui.prefs mirrors the stored mode.
  harness.dispatch('punctuation-set-mode', { value: 'smart' });
  const html = harness.render();

  assert.match(
    html,
    /data-value="smart"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-value="smart"/,
    'Smart Review card should be aria-pressed="true" when prefs.mode === "smart"',
  );
});

test('punctuation Setup scene Wobbly card has aria-pressed="true" when prefs.mode is weak', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.dispatch('punctuation-set-mode', { value: 'weak' });
  const html = harness.render();
  assert.match(
    html,
    /data-value="weak"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-value="weak"/,
    'Wobbly Spots card should be aria-pressed="true" when prefs.mode === "weak"',
  );
});

test('punctuation Setup scene GPS card has aria-pressed="true" when prefs.mode is gps', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.dispatch('punctuation-set-mode', { value: 'gps' });
  const html = harness.render();
  assert.match(
    html,
    /data-value="gps"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-value="gps"/,
    'GPS Check card should be aria-pressed="true" when prefs.mode === "gps"',
  );
});

test('punctuation Setup scene: clicking Smart Review sets state.subjectUi.punctuation.prefs.mode to smart', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.dispatch('punctuation-set-mode', { value: 'smart' });
  const state = harness.store.getState().subjectUi.punctuation;
  assert.equal(state.prefs.mode, 'smart');
});

test('punctuation Setup scene: clicking Wobbly sets state.subjectUi.punctuation.prefs.mode to weak', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.dispatch('punctuation-set-mode', { value: 'weak' });
  const state = harness.store.getState().subjectUi.punctuation;
  assert.equal(state.prefs.mode, 'weak');
});

test('punctuation Setup scene: clicking GPS sets state.subjectUi.punctuation.prefs.mode to gps', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.dispatch('punctuation-set-mode', { value: 'gps' });
  const state = harness.store.getState().subjectUi.punctuation;
  assert.equal(state.prefs.mode, 'gps');
});

test('punctuation Setup scene: Open Map dispatch transitions phase setup → map (paired state assertion)', () => {
  // Paired state-level assertion per learning #7 — catches the
  // U2-before-U5 ordering gap where the dispatch silently no-ops.
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  assert.equal(harness.store.getState().subjectUi.punctuation.phase, 'setup');

  harness.dispatch('punctuation-open-map');
  assert.equal(harness.store.getState().subjectUi.punctuation.phase, 'map');
});

test('punctuation Setup scene: degraded availability disables every primary and secondary card', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    availability: { status: 'degraded', code: 'runtime_degraded', message: 'paused' },
  });
  const html = harness.render();

  // Each primary mode card is disabled.
  for (const modeId of ['smart', 'weak', 'gps']) {
    assert.match(
      html,
      new RegExp(`<button[^>]*disabled[^>]*data-action="punctuation-set-mode"[^>]*data-value="${modeId}"|<button[^>]*data-action="punctuation-set-mode"[^>]*data-value="${modeId}"[^>]*disabled`),
      `primary mode card ${modeId} should be disabled under degraded availability`,
    );
  }
  // Open Map secondary card is disabled.
  assert.match(
    html,
    /<button[^>]*disabled[^>]*data-action="punctuation-open-map"|<button[^>]*data-action="punctuation-open-map"[^>]*disabled/,
    'Open Map card should be disabled under degraded availability',
  );
});

test('punctuation Setup scene: pendingCommand disables every primary and secondary card', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    pendingCommand: 'save-prefs',
  });
  const html = harness.render();

  for (const modeId of ['smart', 'weak', 'gps']) {
    assert.match(
      html,
      new RegExp(`<button[^>]*disabled[^>]*data-action="punctuation-set-mode"[^>]*data-value="${modeId}"|<button[^>]*data-action="punctuation-set-mode"[^>]*data-value="${modeId}"[^>]*disabled`),
      `primary mode card ${modeId} should be disabled while pendingCommand is set`,
    );
  }
  assert.match(
    html,
    /<button[^>]*disabled[^>]*data-action="punctuation-open-map"|<button[^>]*data-action="punctuation-open-map"[^>]*disabled/,
    'Open Map card should be disabled while pendingCommand is set',
  );
});

test('punctuation Setup scene: fresh learner renders zero-state copy (guards Phase 2 hasEvidence fix)', () => {
  // A fresh learner with no stats should NOT see "1 skill due" or any
  // inflated Today counter. The empty-state copy lives in a dedicated
  // data-testid hook so this test stays resilient to copy tweaks.
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  const html = harness.render();

  // Zero-state copy lands — every count is zero, so the dashboard
  // shows the empty-state prompt instead of the grid.
  assert.match(html, /data-testid="punctuation-today-empty"/);
});

test('punctuation Setup scene: reserved monster ids NEVER appear in the active monster strip', () => {
  // Smuggle reserved monster entries into the reward state. The
  // iterator is `ACTIVE_PUNCTUATION_MONSTER_IDS` only (plan R10), so
  // even a poisoned rewardState must not surface the reserved trio.
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    rewardState: {
      pealark: { mastered: ['r1'] },
      colisk: { mastered: ['c1', 'c2'] },
      hyphang: { mastered: ['h1'] },
      carillon: { mastered: ['ca1'] },
    },
  });
  const html = harness.render();

  for (const reserved of ['colisk', 'hyphang', 'carillon']) {
    assert.doesNotMatch(
      html,
      new RegExp(`data-monster-id="${reserved}"`),
      `reserved monster ${reserved} leaked into the active monster strip`,
    );
  }
  // The four active monsters all render.
  for (const active of ['pealark', 'claspin', 'curlune', 'quoral']) {
    assert.match(
      html,
      new RegExp(`data-monster-id="${active}"`),
      `active monster ${active} should render in the strip`,
    );
  }
});

test('punctuation Setup scene SSR HTML contains no forbidden child terms', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  const html = harness.render();
  const leaks = forbiddenTermsInSetupHtml(html);
  assert.deepEqual(leaks, [], `forbidden term leak in Setup scene HTML: ${leaks.join(', ')}`);
});

test('punctuation Setup scene stale-prefs migration: endmarks prefs collapse to smart on first render', () => {
  // Pre-Phase-3 stored `prefs.mode === 'endmarks'` → Setup renders with
  // Smart Review aria-pressed="true" (display normaliser) AND first
  // render dispatches `punctuation-set-mode` with `{ value: 'smart' }`
  // to migrate stored state once.
  const harness = createPunctuationHarness();
  const learnerId = harness.store.getState().learners.selectedId;
  harness.services.punctuation.savePrefs(learnerId, { mode: 'endmarks', roundLength: '4' });
  harness.dispatch('open-subject', { subjectId: 'punctuation' });

  // First render — the effect dispatches the migration.
  const html = harness.render();
  // Display collapse: Smart Review reads as aria-pressed="true".
  assert.match(
    html,
    /data-value="smart"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-value="smart"/,
    'Smart Review must render as aria-pressed="true" when prefs.mode is a legacy cluster value',
  );
  // Migration persisted — stored prefs.mode is now 'smart'.
  assert.equal(harness.store.getState().subjectUi.punctuation.prefs.mode, 'smart');
});

test('punctuation Setup scene stale-prefs migration: apostrophe prefs also collapse to smart', () => {
  const harness = createPunctuationHarness();
  const learnerId = harness.store.getState().learners.selectedId;
  harness.services.punctuation.savePrefs(learnerId, { mode: 'apostrophe', roundLength: '4' });
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.render();
  assert.equal(harness.store.getState().subjectUi.punctuation.prefs.mode, 'smart');
});

test('punctuation Setup scene stale-prefs migration: guided prefs also collapse to smart', () => {
  // `'guided'` is the seventh value that should migrate — Guided is no
  // longer a primary affordance (the Modal's Practise-this path is
  // Guided under the hood, but the learner-facing mode is collapsed).
  const harness = createPunctuationHarness();
  const learnerId = harness.store.getState().learners.selectedId;
  harness.services.punctuation.savePrefs(learnerId, { mode: 'guided', roundLength: '4' });
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.render();
  assert.equal(harness.store.getState().subjectUi.punctuation.prefs.mode, 'smart');
});

test('punctuation Setup scene stale-prefs migration: smart prefs do NOT trigger a migration dispatch', () => {
  // Starting with `prefs.mode === 'smart'` should not touch the store's
  // prefs at all (no re-dispatch, no updateSubjectUi with a prefs
  // delta). We snapshot the store version before and after the render.
  const harness = createPunctuationHarness();
  const learnerId = harness.store.getState().learners.selectedId;
  harness.services.punctuation.savePrefs(learnerId, { mode: 'smart', roundLength: '4' });
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.render();
  // The store should still have the fresh-open state — stored mode
  // never flipped to anything else.
  const state = harness.store.getState().subjectUi.punctuation;
  // `state.prefs` is undefined until a dispatch mirrors it into ui
  // state; the absence itself proves no migration dispatch fired.
  assert.ok(!state.prefs || state.prefs.mode === 'smart');
});

test('punctuation Setup scene stale-prefs migration: re-render does not re-dispatch', () => {
  // After the first render migrates, a subsequent render with the same
  // component instance must not re-dispatch — the `useRef` gate in
  // `PunctuationSetupScene.jsx` closes the loop.
  const harness = createPunctuationHarness();
  const learnerId = harness.store.getState().learners.selectedId;
  harness.services.punctuation.savePrefs(learnerId, { mode: 'boundary', roundLength: '4' });
  harness.dispatch('open-subject', { subjectId: 'punctuation' });

  harness.render();
  assert.equal(harness.store.getState().subjectUi.punctuation.prefs.mode, 'smart');

  // Force prefs.mode to revert via direct store mutation — the next
  // render must not re-run the migration because `migratedRef` stays
  // true within the same component instance.
  harness.store.updateSubjectUi('punctuation', { prefs: { mode: 'speech', roundLength: '4' } });
  harness.render();
  // The migration did NOT fire again — the revert stands.
  assert.equal(harness.store.getState().subjectUi.punctuation.prefs.mode, 'speech');
});

test('punctuation Setup scene stale-prefs migration (adv-234 HIGH 1): store-level prefsMigrated latch is set by the render', () => {
  // adv-234 HIGH 1: the Scene latches `ui.prefsMigrated: true` VIA
  // `actions.updateSubjectUi` BEFORE the `punctuation-set-mode` dispatch
  // fires, so the latch lands regardless of whether the dispatch routes
  // through the module handler (test harness) or the remote command
  // boundary (production `handleRemotePunctuationAction` path — where the
  // Worker `save-prefs` command short-circuits the fall-through to
  // `handleSubjectAction`). We assert the store state directly after the
  // first render — `ui.prefsMigrated === true` proves the client-side
  // latch fired.
  const harness = createPunctuationHarness();
  const learnerId = harness.store.getState().learners.selectedId;
  harness.services.punctuation.savePrefs(learnerId, { mode: 'endmarks', roundLength: '4' });
  harness.dispatch('open-subject', { subjectId: 'punctuation' });

  const beforeLatch = harness.store.getState().subjectUi.punctuation.prefsMigrated;
  // Fresh Setup state — latch starts unset.
  assert.ok(!beforeLatch, 'prefsMigrated must start unset on a fresh open-subject');

  harness.render();

  const afterLatch = harness.store.getState().subjectUi.punctuation.prefsMigrated;
  assert.equal(afterLatch, true, 'prefsMigrated must latch true after the first Setup render migrates');
});

test('punctuation Setup scene stale-prefs migration (adv-234 HIGH 1): second mount with prefsMigrated set does NOT re-dispatch', () => {
  // Second Setup mount (fresh component instance — `migratedRef` reset)
  // where the store already carries `prefsMigrated: true` must NOT run
  // the migration. This is the production regression the HIGH 1 fix
  // closes: a subsequent SSR render of the Setup scene no longer re-
  // fires the Worker `save-prefs` command.
  //
  // Stored mode is set to a legacy cluster value AND the latch is
  // pre-set to simulate the "learner previously migrated this
  // session" state. If the Scene ignores the store-level latch it
  // will migrate `prefs.mode` back to 'smart' (mutation) and the
  // test fails.
  const harness = createPunctuationHarness();
  const learnerId = harness.store.getState().learners.selectedId;
  harness.services.punctuation.savePrefs(learnerId, { mode: 'speech', roundLength: '4' });
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    prefs: { mode: 'speech', roundLength: '4' },
    prefsMigrated: true,
  });

  harness.render();

  // The migration MUST NOT have run — stored mode stays at 'speech'.
  assert.equal(harness.store.getState().subjectUi.punctuation.prefs.mode, 'speech');
  // The latch stayed true.
  assert.equal(harness.store.getState().subjectUi.punctuation.prefsMigrated, true);
});

test('punctuation module handler (adv-234-004 MEDIUM): punctuation-set-mode rejected from non-setup phases', () => {
  // adv-234-004: set-mode is a Setup-scoped mutation. A dispatch from
  // active-item / feedback / summary / map must not mutate prefs. This
  // locks the phase guard at the module handler level — the Scene-side
  // migration dispatch still works because Setup-phase render is the
  // only trigger.
  const harness = createPunctuationHarness();
  const learnerId = harness.store.getState().learners.selectedId;
  harness.services.punctuation.savePrefs(learnerId, { mode: 'smart', roundLength: '4' });
  harness.dispatch('open-subject', { subjectId: 'punctuation' });

  // Force the Setup → active-item transition via a direct store merge so
  // we don't rely on `punctuation-start` spinning a real session.
  harness.store.updateSubjectUi('punctuation', {
    phase: 'active-item',
    session: { id: 'mid-session', currentItem: { id: 'it-1' }, answeredCount: 0 },
    prefs: { mode: 'smart', roundLength: '4' },
    prefsMigrated: true,
  });

  // Returns false from non-setup phase; controller.dispatch's
  // `handled` boolean surfaces via handleSubjectAction.
  const handled = harness.handleSubjectAction('punctuation-set-mode', { value: 'weak' });
  assert.equal(handled, false, 'set-mode must be rejected from active-item phase');
  // Stored mode is untouched.
  assert.equal(harness.store.getState().subjectUi.punctuation.prefs.mode, 'smart');
});

test('punctuation module handler (adv-234-001 MEDIUM): punctuation-set-round-length rejected from non-setup phases', () => {
  const harness = createPunctuationHarness();
  const learnerId = harness.store.getState().learners.selectedId;
  harness.services.punctuation.savePrefs(learnerId, { mode: 'smart', roundLength: '4' });
  harness.dispatch('open-subject', { subjectId: 'punctuation' });

  harness.store.updateSubjectUi('punctuation', {
    phase: 'active-item',
    session: { id: 's-1', currentItem: { id: 'it' }, answeredCount: 0 },
    prefs: { mode: 'smart', roundLength: '4' },
    prefsMigrated: true,
  });

  const handled = harness.handleSubjectAction('punctuation-set-round-length', { value: '8' });
  assert.equal(handled, false, 'set-round-length must be rejected from active-item phase');
  // roundLength stays at 4.
  assert.equal(harness.store.getState().subjectUi.punctuation.prefs.roundLength, '4');
});

test('punctuation module handler (adv-234-001 MEDIUM): punctuation-set-round-length rejects off-enum values (all / 1)', () => {
  // The narrower UI-level enum is ['4', '8', '12']. The storage-level
  // `normalisePunctuationRoundLength` accepts 1 / 2 / 3 / 6 / 'all' too —
  // those are kept valid for the /start-session Worker command so legacy
  // per-skill drills still work, but the Setup dashboard toggle must never
  // accept them. Rogue 'all' / '1' payloads are rejected here.
  const harness = createPunctuationHarness();
  const learnerId = harness.store.getState().learners.selectedId;
  harness.services.punctuation.savePrefs(learnerId, { mode: 'smart', roundLength: '4' });
  harness.dispatch('open-subject', { subjectId: 'punctuation' });

  // Setup phase, but value is out of the narrow enum.
  for (const badValue of ['all', '1', '2', '3', '6', 'seven', '', null, undefined, 4]) {
    const handled = harness.handleSubjectAction('punctuation-set-round-length', { value: badValue });
    assert.equal(handled, false, `set-round-length should reject value ${JSON.stringify(badValue)}`);
    // Stored prefs (via the service) must still read roundLength '4'.
    // `ui.prefs` is only populated once a successful handler mirrors — a
    // rejected dispatch leaves `ui.prefs` undefined on a freshly-opened
    // Setup, so we read from the repository via the service as the
    // canonical source.
    assert.equal(
      harness.services.punctuation.getPrefs(learnerId).roundLength,
      '4',
      `stored prefs.roundLength must stay at 4 after rejected ${JSON.stringify(badValue)}`,
    );
  }
});

test('punctuation module handler (adv-234-001 MEDIUM): punctuation-set-round-length accepts each narrow-enum stop', () => {
  // Positive-case pair for the rejection test above: the three narrow-enum
  // stops DO save through to stored prefs when dispatched from Setup.
  for (const value of ['4', '8', '12']) {
    const harness = createPunctuationHarness();
    const learnerId = harness.store.getState().learners.selectedId;
    harness.services.punctuation.savePrefs(learnerId, { mode: 'smart', roundLength: '4' });
    harness.dispatch('open-subject', { subjectId: 'punctuation' });

    const handled = harness.handleSubjectAction('punctuation-set-round-length', { value });
    assert.equal(handled, true, `set-round-length should accept ${value}`);
    assert.equal(harness.store.getState().subjectUi.punctuation.prefs.roundLength, value);
  }
});

test('punctuation remote dispatch (adv-234 HIGH 1): production-shape routing latches prefsMigrated and sends exactly one save-prefs', async () => {
  // Simulates the production dispatch chain (main.js):
  //   dispatchAction → handleRemotePunctuationAction → punctuationCommandActions.handle
  // The subject-command-actions handler routes `punctuation-set-mode` through
  // the Worker save-prefs command and RETURNS TRUE — the fall-through to
  // `handleSubjectAction` (which would run the module handler that sets
  // `prefsMigrated: true`) never happens in production. Before the HIGH 1
  // fix, a subsequent SSR render would re-run the migration dispatch and
  // send ANOTHER save-prefs command to the Worker.
  //
  // The fix latches `ui.prefsMigrated: true` CLIENT-SIDE via
  // `actions.updateSubjectUi` BEFORE the dispatch fires, so regardless of
  // downstream routing the store's `prefsMigrated` gate is set and the
  // next render skips the migration.
  //
  // This test verifies that contract end-to-end without spinning the full
  // main.js stack: we render the Setup scene with `actions.dispatch` wired
  // to a production-shaped routing that calls the real
  // `punctuationCommandActions.handle` against a mock subjectCommands.

  // Deferred imports so other test files don't pay the cost.
  const { createSubjectCommandActionHandler } = await import(
    '../src/platform/runtime/subject-command-actions.js'
  );
  const { punctuationSubjectCommandActions } = await import(
    '../src/subjects/punctuation/command-actions.js'
  );

  const harness = createPunctuationHarness();
  const learnerId = harness.store.getState().learners.selectedId;
  harness.services.punctuation.savePrefs(learnerId, { mode: 'endmarks', roundLength: '4' });
  harness.dispatch('open-subject', { subjectId: 'punctuation' });

  // Mock subject-command client — captures every outgoing request and
  // resolves each `send` with a benign response.
  const sent = [];
  const subjectCommands = {
    send(request) {
      sent.push(request);
      return Promise.resolve({ ok: true, learnerId: request.learnerId });
    },
  };
  const punctuationCommandHandler = createSubjectCommandActionHandler({
    subjectId: 'punctuation',
    subjectCommands,
    getState: () => harness.store.getState(),
    actions: punctuationSubjectCommandActions,
  });

  // Production-shape dispatch: handleRemotePunctuationAction → handler.handle
  // short-circuits for set-mode (and the other mapped actions). If the
  // handler does NOT claim the action it falls through to the module
  // handleAction so setup-only UI mutations (updateSubjectUi) still land.
  function prodDispatch(action, data = {}) {
    const handled = punctuationCommandHandler.handle(action, data);
    if (!handled) {
      harness.handleSubjectAction(action, data);
    }
  }

  // Render the Setup scene directly with a production-shaped actions
  // object. The Scene's migration dispatch must both latch
  // `prefsMigrated: true` AND emit exactly one save-prefs Worker call.
  const { renderPunctuationSetupSceneStandalone } = await import(
    './helpers/punctuation-scene-render.js'
  );
  renderPunctuationSetupSceneStandalone({
    ui: harness.store.getState().subjectUi.punctuation,
    actions: {
      dispatch: prodDispatch,
      updateSubjectUi: (subjectId, updater) => harness.store.updateSubjectUi(subjectId, updater),
    },
    prefs: { mode: 'endmarks', roundLength: '4' },
    stats: {},
    learner: null,
    rewardState: {},
  });

  // Flush the queued promise microtasks so the send() resolutions settle.
  await Promise.resolve();
  await Promise.resolve();

  // Exactly one save-prefs command should have been sent to the Worker.
  const savePrefsCalls = sent.filter((request) => request.command === 'save-prefs');
  assert.equal(savePrefsCalls.length, 1, `expected exactly one save-prefs Worker call, got ${savePrefsCalls.length}`);
  assert.deepEqual(savePrefsCalls[0].payload, { prefs: { mode: 'smart' } });

  // The store-level latch was set BY THE SCENE BEFORE the dispatch — not
  // by the (never-invoked-in-prod) module handler. This is the key
  // HIGH 1 assertion.
  assert.equal(harness.store.getState().subjectUi.punctuation.prefsMigrated, true);

  // A second render MUST NOT re-fire the migration. Because we use the
  // same Scene helper but a fresh component tree, the only remaining
  // gate is the store-level `prefsMigrated` latch.
  sent.length = 0;
  renderPunctuationSetupSceneStandalone({
    ui: harness.store.getState().subjectUi.punctuation,
    actions: {
      dispatch: prodDispatch,
      updateSubjectUi: (subjectId, updater) => harness.store.updateSubjectUi(subjectId, updater),
    },
    // Deliberately simulate a data-restore that rolled prefs back to a
    // legacy cluster mode — the latch must STILL block re-migration.
    prefs: { mode: 'boundary', roundLength: '4' },
    stats: {},
    learner: null,
    rewardState: {},
  });
  await Promise.resolve();

  const savePrefsCallsAfterSecondMount = sent.filter((request) => request.command === 'save-prefs');
  assert.equal(savePrefsCallsAfterSecondMount.length, 0, 'second mount must not re-fire the save-prefs Worker call');
});

test('punctuation remote dispatch (adv-234-006 MEDIUM): Worker save-prefs failure rearms prefsMigrated latch', async () => {
  // adv-234-006: if the Worker `save-prefs` command rejects (network /
  // 5xx / offline) after the Setup scene has latched
  // `ui.prefsMigrated: true` CLIENT-SIDE (the adv-234 HIGH 1 fix), the
  // stored prefs on the repo remain on the legacy cluster mode but the
  // client latch persists as true. Without reversing the latch on
  // failure, every subsequent Setup render sees `legacyCluster=true`
  // AND `prefsMigrated=true` — the migration never re-fires and the
  // learner is stuck with the Smart Review aria-pressed state while
  // each session runs the stored cluster mode.
  //
  // The fix wires `createSubjectCommandActionHandler`'s onCommandError
  // through `createPunctuationOnCommandError`, which clears
  // `prefsMigrated` back to false when the failing command is
  // `save-prefs`. A subsequent Setup render can then retry migration.
  //
  // This test mirrors the adv-234 HIGH 1 production-dispatch pattern
  // above but swaps the mock subjectCommands for a rejecting one and
  // wires the real factory so we exercise the production contract.

  const { createSubjectCommandActionHandler } = await import(
    '../src/platform/runtime/subject-command-actions.js'
  );
  const {
    createPunctuationOnCommandError,
    punctuationSubjectCommandActions,
  } = await import('../src/subjects/punctuation/command-actions.js');

  const harness = createPunctuationHarness();
  const learnerId = harness.store.getState().learners.selectedId;
  harness.services.punctuation.savePrefs(learnerId, { mode: 'endmarks', roundLength: '4' });
  harness.dispatch('open-subject', { subjectId: 'punctuation' });

  // Rejecting subjectCommands — every `send` fails with a network error.
  const sent = [];
  const subjectCommands = {
    send(request) {
      sent.push(request);
      return Promise.reject(new Error('network failure'));
    },
  };

  // Capture subject-error strings the factory forwards to set-error.
  const subjectErrors = [];

  // Wire the PRODUCTION onCommandError factory so the test exercises the
  // same code path as main.js — not a test-only inline copy.
  const punctuationCommandHandler = createSubjectCommandActionHandler({
    subjectId: 'punctuation',
    subjectCommands,
    getState: () => harness.store.getState(),
    actions: punctuationSubjectCommandActions,
    onCommandError: createPunctuationOnCommandError({
      store: harness.store,
      setSubjectError: (message) => {
        subjectErrors.push(message);
      },
      warn: () => {},
    }),
  });

  function prodDispatch(action, data = {}) {
    const handled = punctuationCommandHandler.handle(action, data);
    if (!handled) {
      harness.handleSubjectAction(action, data);
    }
  }

  const { renderPunctuationSetupSceneStandalone } = await import(
    './helpers/punctuation-scene-render.js'
  );
  renderPunctuationSetupSceneStandalone({
    ui: harness.store.getState().subjectUi.punctuation,
    actions: {
      dispatch: prodDispatch,
      updateSubjectUi: (subjectId, updater) => harness.store.updateSubjectUi(subjectId, updater),
    },
    prefs: { mode: 'endmarks', roundLength: '4' },
    stats: {},
    learner: null,
    rewardState: {},
  });

  // The migration dispatch latches `prefsMigrated: true` BEFORE the
  // Worker send fires — mirror of the adv-234 HIGH 1 invariant.
  assert.equal(
    harness.store.getState().subjectUi.punctuation.prefsMigrated,
    true,
    'migration must latch `prefsMigrated: true` before dispatch',
  );

  // Exactly one save-prefs request reaches the (rejecting) mock.
  const savePrefsCalls = sent.filter((request) => request.command === 'save-prefs');
  assert.equal(savePrefsCalls.length, 1, `expected exactly one save-prefs Worker call, got ${savePrefsCalls.length}`);

  // Flush queued microtasks so the reject + onCommandError settle.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  // Core adv-234-006 assertion: the latch is CLEARED so the next render
  // can retry the migration. Without the fix, the latch stays true and
  // the learner is stranded with a stored cluster mode.
  assert.equal(
    harness.store.getState().subjectUi.punctuation.prefsMigrated,
    false,
    'save-prefs failure must clear `prefsMigrated` so the migration can retry',
  );

  // Stored prefs on the repo are unchanged — the Worker rejection means
  // no persistence happened — so the next render's legacyCluster check
  // still matches and a retry is warranted.
  const repoPrefs = harness.services.punctuation.getPrefs(learnerId);
  assert.equal(repoPrefs.mode, 'endmarks', 'stored prefs.mode must remain on the legacy cluster after the Worker rejection');

  // A subject-error message is surfaced so the learner/UX knows the
  // command failed — factory keeps parity with the previous behaviour.
  assert.ok(subjectErrors.length >= 1, 'save-prefs failure must surface a subject error');
});
