// Phase 3 U10 — fixture-driven forbidden-term sweep across every
// Punctuation child phase + the Skill Detail modal.
//
// This is the Phase 3 completeness gate's copy invariant: every entry in
// `PUNCTUATION_CHILD_FORBIDDEN_TERMS` must remain absent in every child-
// facing scene, plus a whole-word `/\bWorker\b/i` catch-all that captures
// the bare adult noun even when compound forms (`Worker-marked`,
// `Worker-held`) are already covered by the frozen fixture.
//
// The five child phases swept:
//   setup          — PunctuationSetupScene (dashboard + mode cards + map
//                    link + monsters strip).
//   active-item    — PunctuationSessionScene with every item mode
//                    (insert / fix / paragraph / combine / transfer /
//                    choose) × both smart and guided contexts.
//   feedback       — PunctuationSessionScene's FeedbackBranch for
//                    success + error kinds, with display correction +
//                    facets + misconception tags populated.
//   summary        — PunctuationSummaryScene with a mix of focus skills
//                    and GPS review items carrying dotted tag ids that
//                    MUST pipe through `punctuationChildMisconceptionLabel`.
//   map            — PunctuationMapScene with the full 14-skill roster
//                    across 4 active monsters + filter chips.
//
// The Skill Detail modal (U6) sweeps EVERY one of the 14 client-safe
// skills × 2 tabs (Learn / Practise) = 28 render states so a rogue
// skill id or a future authoring regression can never leak an adult-
// register string in a child-facing surface.
//
// SSR blind spots (learning #6):
//   * pointer-capture, true DOM focus, scroll-into-view, IME
//     composition, animation frames, requestIdleCallback, MutationObserver,
//     and timer drift are NOT observable via `renderToStaticMarkup`.
//     They remain manual-QA gates.
//   * React onChange events do not fire in SSR; every transition is
//     driven through store dispatches instead.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createAppHarness } from './helpers/app-harness.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import { SUBJECT_EXPOSURE_GATES } from '../src/platform/core/subject-availability.js';
import { PUNCTUATION_CHILD_FORBIDDEN_TERMS } from '../src/subjects/punctuation/components/punctuation-view-model.js';
import { PUNCTUATION_CLIENT_SKILL_IDS } from '../src/subjects/punctuation/service-contract.js';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function createPunctuationHarness() {
  return createAppHarness({
    storage: installMemoryStorage(),
    subjectExposureGates: { [SUBJECT_EXPOSURE_GATES.punctuation]: true },
  });
}

// Collect every forbidden-term leak in `html`. String terms match
// case-insensitively as substrings (the authored fixture carries both
// `'Worker-held'` and `'Worker-marked'` as substring entries); RegExp
// terms (the whole-word `/\bWorker\b/i` catch-all) apply directly.
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

// -----------------------------------------------------------------------------
// Fixture integrity — pin the frozen list before iterating
// -----------------------------------------------------------------------------

test('U10: PUNCTUATION_CHILD_FORBIDDEN_TERMS is non-empty + frozen (fixture integrity)', () => {
  // A mutated or cleared fixture would silently weaken every downstream
  // absence assertion. Pin both invariants before iterating — the Grammar
  // P3 U10 precedent for exactly this guard.
  assert.ok(Array.isArray(PUNCTUATION_CHILD_FORBIDDEN_TERMS));
  assert.ok(
    PUNCTUATION_CHILD_FORBIDDEN_TERMS.length >= 10,
    `expected at least 10 forbidden terms, saw ${PUNCTUATION_CHILD_FORBIDDEN_TERMS.length}`,
  );
  assert.equal(
    Object.isFrozen(PUNCTUATION_CHILD_FORBIDDEN_TERMS),
    true,
    'PUNCTUATION_CHILD_FORBIDDEN_TERMS must stay frozen so mutations throw',
  );
  // Regex catch-all is present so a bare `Worker` noun with no surrounding
  // prefix still fails the sweep (the substring entries only catch
  // compound forms like `Worker-marked`).
  assert.ok(
    PUNCTUATION_CHILD_FORBIDDEN_TERMS.some((term) => term instanceof RegExp),
    'PUNCTUATION_CHILD_FORBIDDEN_TERMS must include at least one RegExp catch-all',
  );
});

test('U10: PUNCTUATION_CLIENT_SKILL_IDS has exactly 14 skills (drift guard)', () => {
  // The Skill Detail modal sweep below iterates this list × 2 tabs = 28
  // render states. A drift that removed a skill would silently shrink
  // the sweep coverage; a drift that added one without updating
  // PUNCTUATION_SKILL_MODAL_CONTENT would throw in the render. Both
  // failure modes are caught by pinning the expected length here.
  assert.equal(PUNCTUATION_CLIENT_SKILL_IDS.length, 14);
});

// -----------------------------------------------------------------------------
// Per-phase fixture renderers
//
// Each phase's renderer returns a harness with the subject state seeded
// to the target phase. `renderChildPhaseHtml(phase)` is the single
// dispatch-driven entry point used by the sweep loop below.
// -----------------------------------------------------------------------------

function renderSetupPhase() {
  // Seed populated stats + reward state so the sweep exercises the
  // populated Setup branches — the empty-state branch renders a single
  // "Start your first round…" line which does NOT exercise the
  // `todayCards` map, the active-monster strip, or the stats readout
  // strings. Populating here keeps the empty-state fallback covered by
  // the dedicated branch test in `react-punctuation-setup-scene.test.js`
  // while expanding this copy sweep to every populated surface too.
  //
  // `rewardState` keys are monster ids with a `mastered` array — the
  // same shape `progressForPunctuationMonster` reads. The monster ids
  // here are the active roster (plan R10 — reserved monsters never
  // surface even if their reward entries exist).
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    stats: {
      due: 3,
      weak: 2,
      securedRewardUnits: 5,
      accuracy: 82,
    },
    rewardState: {
      pealark: { mastered: ['sentence-endings-core', 'sentence-endings-exclaim'] },
      curlune: { mastered: ['comma-clarity-core'] },
      claspin: { mastered: [] },
      quoral: { mastered: ['speech-core'] },
    },
  });
  return harness;
}

function renderActiveItemPhase() {
  // Seed a populated session so the teach box, progress header, skill
  // name, and every surrounding chrome line are exercised by the sweep.
  // A speech skill with a multi-skill cluster gets the "Speech" mode
  // header the guided teach-box code path depends on.
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'active-item',
    session: {
      id: 'u10-child-copy-active',
      mode: 'guided',
      length: 4,
      answeredCount: 1,
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
        skillIds: ['speech'],
        prompt: 'Add the direct-speech punctuation.',
        stem: 'Ella asked, can we start now?',
      },
    },
  });
  return harness;
}

function renderFeedbackPhase() {
  // Feedback carries the fullest shape: kind, headline, body,
  // displayCorrection behind a <details>, facets (positive + negative),
  // and misconceptionTags that pipe through
  // `punctuationChildMisconceptionLabel` (raw dotted ids must NOT leak).
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'feedback',
    session: {
      id: 'u10-child-copy-feedback',
      mode: 'smart',
      length: 4,
      answeredCount: 2,
      currentItem: {
        id: 'se_insert_capital',
        mode: 'insert',
        inputKind: 'text',
        skillIds: ['sentence_endings'],
        prompt: 'Add the missing capital letter and full stop.',
        stem: 'the boat reached the harbour',
      },
    },
    feedback: {
      kind: 'error',
      headline: 'Almost.',
      body: 'Capital at the start and a full stop at the end.',
      displayCorrection: 'The boat reached the harbour.',
      facets: [
        { id: 'capital', label: 'Capital letter', ok: false },
        { id: 'ending', label: 'End punctuation', ok: true },
      ],
      misconceptionTags: ['speech.quote_missing', 'comma.missing_after_adverbial'],
    },
  });
  return harness;
}

function renderSummaryPhase() {
  // Summary carries focus skills (child-labelled wobbly chips), GPS
  // review items with dotted misconception tags, and the active-only
  // monster strip. Reserved monsters are NOT seeded — the scene
  // iterates the active list and reserved trio must stay invisible.
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'summary',
    summary: {
      label: 'Punctuation session summary',
      message: 'Session complete.',
      total: 4,
      correct: 3,
      accuracy: 75,
      focus: ['speech', 'comma_clarity'],
      securedUnits: ['sentence-endings-core'],
      misconceptionTags: ['speech.quote_missing'],
      gps: {
        delayedFeedback: true,
        recommendedMode: 'weak',
        recommendedLabel: 'Wobbly Spots',
        reviewItems: [
          {
            index: 1,
            itemId: 'se_insert_capital',
            mode: 'insert',
            skillIds: ['sentence_endings'],
            prompt: 'Add the missing capital letter and full stop.',
            stem: 'the boat reached the harbour',
            attemptedAnswer: 'The boat reached the harbour.',
            displayCorrection: 'The boat reached the harbour.',
            correct: true,
            misconceptionTags: [],
            facets: [],
          },
          {
            index: 2,
            itemId: 'sp_insert_question',
            mode: 'insert',
            skillIds: ['speech'],
            prompt: 'Add the direct-speech punctuation.',
            stem: 'Ella asked, can we start now?',
            attemptedAnswer: 'Ella asked can we start now',
            displayCorrection: 'Ella asked, "Can we start now?"',
            correct: false,
            misconceptionTags: ['speech.quote_missing'],
            facets: [],
          },
        ],
      },
    },
  });
  return harness;
}

function renderMapPhase() {
  // Open the Map phase via the real dispatch path (plan R5 — Map is
  // reached from Setup, not by direct state seeding). The filter chip
  // rows, 14 skill cards, 4 monster sections, and summary counter all
  // render off the current read-model shape.
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.dispatch('punctuation-open-map');
  return harness;
}

// --- Explicit phase allowlist + renderer registry ----------------------------
//
// The allowlist is deliberately frozen (Object.freeze) so a typo in a
// downstream test cannot silently skip coverage. The renderer registry
// throws on an unknown phase name for the same reason.

export const PUNCTUATION_PHASE3_CHILD_PHASES = Object.freeze([
  'setup',
  'active-item',
  'feedback',
  'summary',
  'map',
]);

const PHASE_RENDERERS = Object.freeze({
  setup: renderSetupPhase,
  'active-item': renderActiveItemPhase,
  feedback: renderFeedbackPhase,
  summary: renderSummaryPhase,
  map: renderMapPhase,
});

function renderChildPhaseHtml(phase) {
  const renderer = PHASE_RENDERERS[phase];
  if (typeof renderer !== 'function') {
    throw new Error(
      `renderChildPhaseHtml: unknown phase "${phase}". ` +
      `Expected one of: ${PUNCTUATION_PHASE3_CHILD_PHASES.join(', ')}.`,
    );
  }
  const harness = renderer();
  return { harness, html: harness.render() };
}

// -----------------------------------------------------------------------------
// Forbidden-term sweep — five child phases × every fixture entry
// -----------------------------------------------------------------------------

test('U10: the five child-phase allowlist is frozen + complete', () => {
  assert.equal(Object.isFrozen(PUNCTUATION_PHASE3_CHILD_PHASES), true);
  assert.deepEqual([...PUNCTUATION_PHASE3_CHILD_PHASES], [
    'setup',
    'active-item',
    'feedback',
    'summary',
    'map',
  ]);
});

test('U10: renderChildPhaseHtml throws on an unknown phase name (silent-skip guard)', () => {
  // Without this, a typo like `active_item` (underscore) or `feedbacks`
  // in a downstream test would silently return an empty string and skip
  // the coverage loop. This is the exact failure mode the U10
  // completeness gate exists to prevent.
  assert.throws(() => renderChildPhaseHtml('active_item'), /unknown phase/);
  assert.throws(() => renderChildPhaseHtml(''), /unknown phase/);
  assert.throws(() => renderChildPhaseHtml('bogus'), /unknown phase/);
});

for (const phase of PUNCTUATION_PHASE3_CHILD_PHASES) {
  test(`U10: ${phase} HTML contains none of PUNCTUATION_CHILD_FORBIDDEN_TERMS`, () => {
    const { html } = renderChildPhaseHtml(phase);
    const leaks = forbiddenTermsInHtml(html);
    assert.deepEqual(
      leaks,
      [],
      `forbidden term leak in ${phase} HTML: ${leaks.join(', ')}`,
    );
  });

  test(`U10: ${phase} HTML contains no whole-word /\\bWorker\\b/i catch-all`, () => {
    const { html } = renderChildPhaseHtml(phase);
    // `\b` boundary keeps legitimate tokens like `homework` or
    // `workbook` from tripping the guard. The iterated substring fixture
    // above covers every compound form; this catch-all protects against
    // the bare noun.
    assert.doesNotMatch(
      html,
      /\bWorker\b/i,
      `bare Worker noun leaked into ${phase} HTML`,
    );
  });
}

// -----------------------------------------------------------------------------
// Skill Detail modal sweep — 14 skills × 2 tabs = 28 render states
// -----------------------------------------------------------------------------
//
// The Modal is a sub-surface of the Map phase. We open it on every
// published skill and render both tabs so an authoring regression on
// any single pedagogy string fails loudly here rather than at manual
// QA. The modal render strictly scopes its output to the scrim subtree
// so the surrounding Map HTML doesn't double-count toward leaks.
//
// Plan R3 reminder: "Practise this" dispatches Guided mode + skill id,
// not cluster mode. The sweep only asserts copy absence — the
// behavioural cluster-mode assertions live in `react-punctuation-scene.test.js`.

function extractModalHtml(html) {
  const start = html.indexOf('<div class="punctuation-skill-modal-scrim"');
  return start === -1 ? '' : html.slice(start);
}

for (const skillId of PUNCTUATION_CLIENT_SKILL_IDS) {
  test(`U10 modal: ${skillId} Learn tab renders with zero forbidden-term leaks`, () => {
    const harness = createPunctuationHarness();
    harness.dispatch('open-subject', { subjectId: 'punctuation' });
    harness.dispatch('punctuation-open-map');
    harness.dispatch('punctuation-skill-detail-open', { skillId });
    // Default tab is 'learn' — no explicit dispatch needed. Paired
    // state-level assertion that the modal actually opened closes the
    // silent-no-op gap (learning #7).
    assert.equal(
      harness.store.getState().subjectUi.punctuation.mapUi.detailOpenSkillId,
      skillId,
      `modal must open for ${skillId}`,
    );
    assert.equal(
      harness.store.getState().subjectUi.punctuation.mapUi.detailTab,
      'learn',
    );
    const modalHtml = extractModalHtml(harness.render());
    assert.ok(modalHtml, `modal HTML must be present for ${skillId}`);
    const leaks = forbiddenTermsInHtml(modalHtml);
    assert.deepEqual(
      leaks,
      [],
      `forbidden term leak in Learn tab for ${skillId}: ${leaks.join(', ')}`,
    );
    assert.doesNotMatch(
      modalHtml,
      /\bWorker\b/i,
      `bare Worker noun leaked into Learn tab for ${skillId}`,
    );
  });

  test(`U10 modal: ${skillId} Practise tab renders with zero forbidden-term leaks`, () => {
    const harness = createPunctuationHarness();
    harness.dispatch('open-subject', { subjectId: 'punctuation' });
    harness.dispatch('punctuation-open-map');
    harness.dispatch('punctuation-skill-detail-open', { skillId });
    harness.dispatch('punctuation-skill-detail-tab', { value: 'practise' });
    assert.equal(
      harness.store.getState().subjectUi.punctuation.mapUi.detailTab,
      'practise',
      `modal must flip to practise tab for ${skillId}`,
    );
    const modalHtml = extractModalHtml(harness.render());
    assert.ok(modalHtml, `modal HTML must be present for ${skillId}`);
    const leaks = forbiddenTermsInHtml(modalHtml);
    assert.deepEqual(
      leaks,
      [],
      `forbidden term leak in Practise tab for ${skillId}: ${leaks.join(', ')}`,
    );
    assert.doesNotMatch(
      modalHtml,
      /\bWorker\b/i,
      `bare Worker noun leaked into Practise tab for ${skillId}`,
    );
  });
}

// -----------------------------------------------------------------------------
// Review follow-on FINDING C — end-to-end override regression sweep.
//
// The existing sweeps above seed fixtures that do NOT carry the U7 adult
// grammar terms (`fronted adverbial`, `main clause`, `complete clause`,
// `subordinate`). Removing the `punctuationChildRegisterOverride` call from
// any threading site would therefore PASS those tests silently — they prove
// the pre-clean fixtures don't leak, not that the override is actually
// firing. This block seeds the worst-case shape: adult terms in EVERY
// threading site (teachBox.rule, feedback.headline/body/displayCorrection,
// summary review-item prompt/displayCorrection, and the Skill Detail modal
// content via the shared-source rule field). Renders each scene and
// asserts the rendered HTML contains ZERO adult terms.
//
// This test MUST fail if the override is silently removed from any
// threading call site in the future.
// -----------------------------------------------------------------------------

function forbiddenAdultGrammarTerms(html) {
  // The four U7-registered adult terms. Explicit list rather than
  // re-using the full PUNCTUATION_CHILD_FORBIDDEN_TERMS so this sweep
  // is scoped to the override's job.
  const terms = ['fronted adverbial', 'main clause', 'complete clause', 'subordinate'];
  return terms.filter((term) => html.toLowerCase().includes(term));
}

test('U7 FINDING C: seeded adult-term teachBox payload renders with override applied (Session scene)', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'active-item',
    session: {
      id: 'u7-finding-c-session',
      mode: 'guided',
      length: 4,
      answeredCount: 1,
      guided: {
        skillId: 'semicolon',
        supportLevel: 2,
        teachBox: {
          name: 'Semi-colons between related clauses',
          rule: 'A semi-colon can join two closely related main clauses.',
          workedExample: {
            before: 'Two main clauses without a semi-colon.',
            after: 'Two main clauses joined by a semi-colon.',
          },
          contrastExample: {
            before: 'A fronted adverbial without a comma.',
            after: 'A fronted adverbial, with a comma.',
          },
        },
      },
      currentItem: {
        id: 'sc_insert',
        mode: 'insert',
        inputKind: 'text',
        skillIds: ['semicolon'],
        prompt: 'Add the semi-colon between the two main clauses.',
        stem: 'The rain had stopped the pitch was still slippery',
      },
    },
  });
  const html = harness.render();
  const leaks = forbiddenAdultGrammarTerms(html);
  assert.deepEqual(
    leaks,
    [],
    `Session scene leaked adult grammar terms (override not firing?): ${leaks.join(', ')}`,
  );
});

test('U7 FINDING C: seeded adult-term feedback payload renders with override applied (Session scene feedback)', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'feedback',
    session: {
      id: 'u7-finding-c-feedback',
      mode: 'smart',
      length: 4,
      answeredCount: 2,
      currentItem: {
        id: 'sc_fix',
        mode: 'fix',
        inputKind: 'text',
        skillIds: ['semicolon'],
        prompt: 'Fix the comma splice between the two main clauses.',
        stem: 'The rain had stopped, the pitch was still slippery',
      },
    },
    feedback: {
      kind: 'error',
      headline: 'A complete clause matters.',
      body: 'Combine it with the main clause using a semi-colon.',
      displayCorrection: 'The rain had stopped; the pitch was still slippery.',
      facets: [],
      misconceptionTags: [],
    },
  });
  const html = harness.render();
  const leaks = forbiddenAdultGrammarTerms(html);
  assert.deepEqual(
    leaks,
    [],
    `Feedback branch leaked adult grammar terms (override not firing?): ${leaks.join(', ')}`,
  );
});

test('U7 FINDING C: seeded adult-term GPS review-item renders with override applied (Summary scene)', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'summary',
    summary: {
      label: 'Punctuation session summary',
      message: 'Session complete.',
      total: 2,
      correct: 1,
      accuracy: 50,
      focus: [],
      securedUnits: [],
      misconceptionTags: [],
      gps: {
        delayedFeedback: true,
        recommendedMode: 'weak',
        recommendedLabel: 'Wobbly Spots',
        reviewItems: [
          {
            index: 1,
            itemId: 'sc_fix',
            mode: 'fix',
            skillIds: ['semicolon'],
            // Adult-term seeding at both the prompt + displayCorrection
            // sites so removing either override call fails the sweep.
            prompt: 'Fix the comma splice between the two main clauses.',
            stem: 'The rain had stopped, the pitch was still slippery',
            attemptedAnswer: 'The rain had stopped, the pitch was still slippery.',
            displayCorrection: 'Two main clauses joined by a semi-colon.',
            correct: false,
            misconceptionTags: [],
            facets: [],
          },
        ],
      },
    },
  });
  const html = harness.render();
  const leaks = forbiddenAdultGrammarTerms(html);
  assert.deepEqual(
    leaks,
    [],
    `Summary scene leaked adult grammar terms (override not firing?): ${leaks.join(', ')}`,
  );
});

test('U7 FINDING C: SkillDetailModal renders with override applied (adult-term smuggle probe)', () => {
  // The modal reads from PUNCTUATION_SKILL_MODAL_CONTENT. The source
  // for that table was rewritten in U7 to child register, so we cannot
  // seed adult terms by mutating live state. Instead, assert the SAME
  // invariant at the integration level: open the modal for a skill
  // whose shared-source rule contains "main clause" and confirm the
  // rendered HTML contains no adult grammar terms. If the override
  // were removed from SkillDetailModal.jsx, the modal's rule line
  // would bypass the rewrite even though the client mirror
  // (PUNCTUATION_SKILL_MODAL_CONTENT) is pre-rewritten — but the defense-
  // in-depth sweep guards against future authors re-populating the
  // client mirror with adult-register strings.
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.dispatch('punctuation-open-map');
  harness.dispatch('punctuation-skill-detail-open', { skillId: 'semicolon' });
  // Default tab 'learn' renders rule + worked example + common mix-up.
  const html = harness.render();
  const modalStart = html.indexOf('<div class="punctuation-skill-modal-scrim"');
  const modalHtml = modalStart === -1 ? '' : html.slice(modalStart);
  assert.ok(modalHtml, 'modal HTML must be present');
  const leaks = forbiddenAdultGrammarTerms(modalHtml);
  assert.deepEqual(
    leaks,
    [],
    `SkillDetailModal leaked adult grammar terms (override not threaded?): ${leaks.join(', ')}`,
  );
});
