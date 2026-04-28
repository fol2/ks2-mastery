// Phase 3 U8 — Grammar view-model + session-ui pure helpers.
//
// These tests are the load-bearing assertion surface for U8. Every helper
// exported by `src/subjects/grammar/session-ui.js` and
// `src/subjects/grammar/components/grammar-view-model.js` is exercised here
// with a happy path, an edge case, and (where relevant) an error-path
// assertion. No SSR render. No React. Every fixture is a plain object so
// the test file runs fast on `node --test` alone.
//
// Integration: subsequent Phase 3 JSX units (U1, U2, U3, U4, U5, U6b, U7)
// inherit the visibility + labelling truth tables from this file rather
// than restating the rules inline.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  grammarSessionSubmitLabel,
  grammarSessionHelpVisibility,
  grammarSessionProgressLabel,
  grammarSessionInfoChips,
  grammarSessionFooterNote,
  grammarFeedbackTone,
} from '../src/subjects/grammar/session-ui.js';
import {
  GRAMMAR_PRIMARY_MODE_CARDS,
  GRAMMAR_SECONDARY_MODE_LINKS,
  GRAMMAR_MORE_PRACTICE_MODES,
  GRAMMAR_MONSTER_STRIP_CHILD_COPY,
  GRAMMAR_BANK_STATUS_FILTER_IDS,
  GRAMMAR_BANK_CLUSTER_FILTER_IDS,
  GRAMMAR_BANK_STATUS_CHIPS,
  GRAMMAR_DASHBOARD_HERO,
  GRAMMAR_CHILD_FORBIDDEN_TERMS,
  GRAMMAR_FOCUS_ALLOWED_MODES,
  grammarChildConfidenceLabel,
  grammarChildConfidenceTone,
  grammarMonsterClusterForConcept,
  grammarBankFilterMatchesStatus,
  buildGrammarDashboardModel,
  buildGrammarBankModel,
  buildGrammarMonsterStripModel,
  grammarSummaryCards,
  isGrammarChildCopy,
  isGrammarFocusAllowedMode,
} from '../src/subjects/grammar/components/grammar-view-model.js';

// -----------------------------------------------------------------------------
// grammarSessionSubmitLabel
// -----------------------------------------------------------------------------

test('U8 session-ui: grammarSessionSubmitLabel null session returns Submit', () => {
  assert.equal(grammarSessionSubmitLabel(null), 'Submit');
  assert.equal(grammarSessionSubmitLabel(undefined), 'Submit');
});

test('U8 session-ui: grammarSessionSubmitLabel awaitingAdvance returns Saved', () => {
  assert.equal(grammarSessionSubmitLabel({ type: 'smart' }, true), 'Saved');
});

test('U8 session-ui: grammarSessionSubmitLabel mini-test returns Save and next', () => {
  assert.equal(
    grammarSessionSubmitLabel({ type: 'mini-set', miniTest: { finished: false } }, false),
    'Save and next',
  );
});

test('U8 session-ui: grammarSessionSubmitLabel finished mini-test returns Finish mini-set', () => {
  assert.equal(
    grammarSessionSubmitLabel({ type: 'mini-set', miniTest: { finished: true } }, false),
    'Finish mini-set',
  );
});

test('U8 session-ui: grammarSessionSubmitLabel retry returns Try again', () => {
  assert.equal(grammarSessionSubmitLabel({ type: 'smart', phase: 'retry' }), 'Try again');
});

test('U8 session-ui: grammarSessionSubmitLabel default returns Submit', () => {
  assert.equal(grammarSessionSubmitLabel({ type: 'smart' }), 'Submit');
});

// -----------------------------------------------------------------------------
// grammarSessionHelpVisibility — the single truth table for U1/U3/U4/U6b
// -----------------------------------------------------------------------------

test('U8 session-ui: grammarSessionHelpVisibility mini-test before finish is all false (AE1, AE2)', () => {
  const flags = grammarSessionHelpVisibility(
    { type: 'mini-set', miniTest: { finished: false } },
    'session',
  );
  assert.deepEqual(flags, {
    showAiActions: false,
    showRepairActions: false,
    showWorkedSolution: false,
    showSimilarProblem: false,
    showFadedSupport: false,
  });
});

test('U8 session-ui: grammarSessionHelpVisibility mini-test in feedback still hides help when miniTest.finished is false', () => {
  const flags = grammarSessionHelpVisibility(
    { type: 'mini-set', miniTest: { finished: false } },
    'feedback',
  );
  assert.equal(flags.showAiActions, false);
  assert.equal(flags.showRepairActions, false);
  assert.equal(flags.showWorkedSolution, false);
  assert.equal(flags.showSimilarProblem, false);
  assert.equal(flags.showFadedSupport, false);
});

test('U8 session-ui: grammarSessionHelpVisibility smart-feedback-supportLevel-0 shows full help (AE3)', () => {
  const flags = grammarSessionHelpVisibility(
    { type: 'smart', supportLevel: 0 },
    'feedback',
  );
  assert.equal(flags.showAiActions, true);
  assert.equal(flags.showRepairActions, true);
  assert.equal(flags.showWorkedSolution, true);
  assert.equal(flags.showSimilarProblem, true);
  assert.equal(flags.showFadedSupport, true);
});

test('U8 session-ui: grammarSessionHelpVisibility smart-feedback-supportLevel-2 hides faded support', () => {
  const flags = grammarSessionHelpVisibility(
    { type: 'smart', supportLevel: 2 },
    'feedback',
  );
  assert.equal(flags.showFadedSupport, false);
  assert.equal(flags.showAiActions, true);
  assert.equal(flags.showRepairActions, true);
});

test('U8 session-ui: grammarSessionHelpVisibility smart-session pre-answer hides everything', () => {
  const flags = grammarSessionHelpVisibility(
    { type: 'smart', supportLevel: 0 },
    'session',
  );
  assert.deepEqual(flags, {
    showAiActions: false,
    showRepairActions: false,
    showWorkedSolution: false,
    showSimilarProblem: false,
    showFadedSupport: false,
  });
});

test('U8 session-ui: grammarSessionHelpVisibility null session returns all false', () => {
  assert.deepEqual(grammarSessionHelpVisibility(null, 'feedback'), {
    showAiActions: false,
    showRepairActions: false,
    showWorkedSolution: false,
    showSimilarProblem: false,
    showFadedSupport: false,
  });
});

// -----------------------------------------------------------------------------
// grammarSessionProgressLabel
// -----------------------------------------------------------------------------

test('U8 session-ui: grammarSessionProgressLabel null returns empty string', () => {
  assert.equal(grammarSessionProgressLabel(null), '');
});

test('U8 session-ui: grammarSessionProgressLabel independent practice renders Question X of N', () => {
  assert.equal(
    grammarSessionProgressLabel({ type: 'smart', currentIndex: 2, targetCount: 5 }),
    'Question 3 of 5',
  );
});

test('U8 session-ui: grammarSessionProgressLabel mini-test renders Mini Test — Question X of N', () => {
  assert.equal(
    grammarSessionProgressLabel({
      type: 'mini-set',
      miniTest: { questions: [{}, {}, {}], currentIndex: 1 },
    }),
    'Mini Test — Question 2 of 3',
  );
});

test('U8 session-ui: grammarSessionProgressLabel clamps current index to total', () => {
  assert.equal(
    grammarSessionProgressLabel({ type: 'smart', currentIndex: 99, targetCount: 5 }),
    'Question 5 of 5',
  );
});

// -----------------------------------------------------------------------------
// grammarSessionInfoChips
// -----------------------------------------------------------------------------

test('U8 session-ui: grammarSessionInfoChips null returns empty array', () => {
  assert.deepEqual(grammarSessionInfoChips(null), []);
});

test('U8 session-ui: grammarSessionInfoChips mini-test adds Mini Test chip', () => {
  assert.deepEqual(grammarSessionInfoChips({ type: 'mini-set', miniTest: {} }), ['Mini Test']);
});

test('U8 session-ui: grammarSessionInfoChips surfaces concept name when present', () => {
  assert.deepEqual(
    grammarSessionInfoChips({ type: 'smart', currentItem: { conceptName: 'Relative clauses' } }),
    ['Relative clauses'],
  );
});

test('U8 session-ui: grammarSessionInfoChips drops adult domain / questionType chips', () => {
  // Even if the read-model carries adult-only fields, the child info chips
  // never surface them. This is an explicit guard against accidentally
  // re-adding "Worker authority" / domain / questionType as a chip.
  const chips = grammarSessionInfoChips({
    type: 'smart',
    currentItem: { domain: 'Sentence structure', questionType: 'selected_response' },
  });
  assert.equal(chips.length, 0);
});

// -----------------------------------------------------------------------------
// grammarSessionFooterNote
// -----------------------------------------------------------------------------

test('U8 session-ui: grammarSessionFooterNote empty when no session', () => {
  assert.equal(grammarSessionFooterNote(null), '');
});

test('U8 session-ui: grammarSessionFooterNote mini-test child copy only', () => {
  const note = grammarSessionFooterNote({ type: 'mini-set', miniTest: {} });
  assert.equal(typeof note, 'string');
  assert.ok(note.length > 0);
  assert.equal(isGrammarChildCopy(note), true);
});

test('U8 session-ui: grammarSessionFooterNote practice child copy only', () => {
  const note = grammarSessionFooterNote({ type: 'smart' });
  assert.equal(typeof note, 'string');
  assert.ok(note.length > 0);
  assert.equal(isGrammarChildCopy(note), true);
});

// -----------------------------------------------------------------------------
// grammarFeedbackTone
// -----------------------------------------------------------------------------

test('U8 session-ui: grammarFeedbackTone correct returns good', () => {
  assert.equal(grammarFeedbackTone({ correct: true }), 'good');
});

test('U8 session-ui: grammarFeedbackTone wrong returns bad', () => {
  assert.equal(grammarFeedbackTone({ correct: false }), 'bad');
});

test('U8 session-ui: grammarFeedbackTone neutral returns neutral', () => {
  assert.equal(grammarFeedbackTone(null), 'neutral');
  assert.equal(grammarFeedbackTone({}), 'neutral');
});

test('P2 session-ui: grammarFeedbackTone treats non-scored manual-review feedback as neutral', () => {
  assert.equal(grammarFeedbackTone({ correct: false, nonScored: true, manualReviewOnly: true }), 'neutral');
});

// -----------------------------------------------------------------------------
// GRAMMAR_PRIMARY_MODE_CARDS — roster + shape contract
// -----------------------------------------------------------------------------

// U8 Phase 5: GRAMMAR_PRIMARY_MODE_CARDS is now Smart Practice only.
test('P5-U8 view-model: GRAMMAR_PRIMARY_MODE_CARDS has exactly one card (Smart Practice)', () => {
  assert.equal(GRAMMAR_PRIMARY_MODE_CARDS.length, 1);
  assert.equal(GRAMMAR_PRIMARY_MODE_CARDS[0].id, 'smart');
  assert.equal(GRAMMAR_PRIMARY_MODE_CARDS[0].featured, true);
});

test('P5-U8 view-model: GRAMMAR_PRIMARY_MODE_CARDS title is Smart Practice', () => {
  assert.equal(GRAMMAR_PRIMARY_MODE_CARDS[0].title, 'Smart Practice');
});

test('P5-U8 view-model: GRAMMAR_PRIMARY_MODE_CARDS is frozen and deeply frozen', () => {
  assert.equal(Object.isFrozen(GRAMMAR_PRIMARY_MODE_CARDS), true);
  for (const card of GRAMMAR_PRIMARY_MODE_CARDS) {
    assert.equal(Object.isFrozen(card), true);
  }
});

test('P5-U8 view-model: GRAMMAR_PRIMARY_MODE_CARDS titles use only child copy', () => {
  for (const card of GRAMMAR_PRIMARY_MODE_CARDS) {
    assert.equal(isGrammarChildCopy(card.title), true, `title "${card.title}" contains forbidden term`);
    assert.equal(isGrammarChildCopy(card.desc), true, `desc "${card.desc}" contains forbidden term`);
  }
});

// U8 Phase 5: Three demoted modes as secondary links.
test('P5-U8 view-model: GRAMMAR_SECONDARY_MODE_LINKS has Grammar Bank, Mini Test, Fix Trouble Spots', () => {
  assert.equal(GRAMMAR_SECONDARY_MODE_LINKS.length, 3);
  const ids = GRAMMAR_SECONDARY_MODE_LINKS.map((link) => link.id);
  assert.deepEqual(ids, ['bank', 'satsset', 'trouble']);
});

test('P5-U8 view-model: GRAMMAR_SECONDARY_MODE_LINKS is frozen and deeply frozen', () => {
  assert.equal(Object.isFrozen(GRAMMAR_SECONDARY_MODE_LINKS), true);
  for (const link of GRAMMAR_SECONDARY_MODE_LINKS) {
    assert.equal(Object.isFrozen(link), true);
  }
});

test('P5-U8 view-model: GRAMMAR_SECONDARY_MODE_LINKS titles use only child copy', () => {
  for (const link of GRAMMAR_SECONDARY_MODE_LINKS) {
    assert.equal(isGrammarChildCopy(link.title), true, `title "${link.title}" contains forbidden term`);
    assert.equal(isGrammarChildCopy(link.desc), true, `desc "${link.desc}" contains forbidden term`);
  }
});

// -----------------------------------------------------------------------------
// GRAMMAR_MORE_PRACTICE_MODES
// -----------------------------------------------------------------------------

test('P5-U8 view-model: GRAMMAR_MORE_PRACTICE_MODES has exactly six secondary modes (Writing Try added)', () => {
  assert.equal(GRAMMAR_MORE_PRACTICE_MODES.length, 6);
  assert.deepEqual(
    GRAMMAR_MORE_PRACTICE_MODES.map((mode) => mode.id),
    ['learn', 'surgery', 'builder', 'worked', 'faded', 'transfer'],
  );
});

test('P5-U8 view-model: GRAMMAR_MORE_PRACTICE_MODES are frozen', () => {
  assert.equal(Object.isFrozen(GRAMMAR_MORE_PRACTICE_MODES), true);
  for (const mode of GRAMMAR_MORE_PRACTICE_MODES) {
    assert.equal(Object.isFrozen(mode), true);
  }
});

// -----------------------------------------------------------------------------
// U5 Phase 4: Mixed practice labels + focus allowlist
// -----------------------------------------------------------------------------

test('U5 view-model: GRAMMAR_MORE_PRACTICE_MODES carries "Mixed practice" label on Surgery and Builder only', () => {
  const byId = Object.fromEntries(GRAMMAR_MORE_PRACTICE_MODES.map((mode) => [mode.id, mode]));
  // Surgery + Builder are the two legitimately global/mixed modes per
  // Worker's `NO_SESSION_FOCUS_MODES` — they must surface the "Mixed
  // practice" label so the child is told up front that focused concepts
  // will not stick in these modes.
  assert.equal(byId.surgery.label, 'Mixed practice');
  assert.equal(byId.builder.label, 'Mixed practice');
  // Learn / Worked / Faded / Transfer all honour focus or are non-scored — no label required.
  assert.equal(byId.learn.label ?? '', '', 'learn has no Mixed practice label');
  assert.equal(byId.worked.label ?? '', '', 'worked has no Mixed practice label');
  assert.equal(byId.faded.label ?? '', '', 'faded has no Mixed practice label');
  assert.equal(byId.transfer.label ?? '', '', 'transfer has no Mixed practice label');
});

test('U5 view-model: Mixed practice label stays ~12 chars to fit under the mode title', () => {
  // Plan-specified wording ("Mixed practice") — 14 chars including space.
  // Pinned so a later copy tweak that pushes this past ~20 chars (e.g.,
  // "Mixed-mode practice round") would fail loudly rather than silently
  // break the dashboard card layout.
  for (const mode of GRAMMAR_MORE_PRACTICE_MODES) {
    if (typeof mode.label !== 'string' || !mode.label) continue;
    assert.ok(
      mode.label.length <= 20,
      `label "${mode.label}" on mode ${mode.id} exceeds 20 chars`,
    );
  }
});

test('U5 view-model: GRAMMAR_FOCUS_ALLOWED_MODES is a frozen Set of exactly {smart, learn}', () => {
  assert.ok(GRAMMAR_FOCUS_ALLOWED_MODES instanceof Set);
  assert.equal(GRAMMAR_FOCUS_ALLOWED_MODES.size, 2);
  assert.equal(GRAMMAR_FOCUS_ALLOWED_MODES.has('smart'), true);
  assert.equal(GRAMMAR_FOCUS_ALLOWED_MODES.has('learn'), true);
  // Non-members — pinned to catch an accidental widening of the allowlist.
  // Any new member here would silently contradict James's 2026-04-26
  // decision that Practise 5 routes into Smart + Learn only.
  for (const mode of ['surgery', 'builder', 'trouble', 'worked', 'faded', 'satsset', 'bank']) {
    assert.equal(GRAMMAR_FOCUS_ALLOWED_MODES.has(mode), false, `${mode} must not be allowed`);
  }
  assert.equal(Object.isFrozen(GRAMMAR_FOCUS_ALLOWED_MODES), true);
});

test('U5 view-model: isGrammarFocusAllowedMode is a pure predicate over mode strings', () => {
  assert.equal(isGrammarFocusAllowedMode('smart'), true);
  assert.equal(isGrammarFocusAllowedMode('learn'), true);
  for (const mode of ['surgery', 'builder', 'trouble', 'worked', 'faded', 'satsset', 'bank', 'unknown']) {
    assert.equal(isGrammarFocusAllowedMode(mode), false, `${mode} must not be allowed`);
  }
  // Defensive inputs — never crash.
  assert.equal(isGrammarFocusAllowedMode(''), false);
  assert.equal(isGrammarFocusAllowedMode(null), false);
  assert.equal(isGrammarFocusAllowedMode(undefined), false);
  assert.equal(isGrammarFocusAllowedMode(123), false);
  assert.equal(isGrammarFocusAllowedMode({}), false);
  assert.equal(isGrammarFocusAllowedMode([]), false);
});

test('U5 view-model: allowlist intersects with GRAMMAR_PRIMARY_MODE_CARDS for Smart only', () => {
  // Smart sits on the primary dashboard card row — allowlisted. Learn is
  // a secondary "More practice" mode — allowlisted but not a primary card.
  // This pinning asserts the narrow primary-card intersection.
  const primaryIds = GRAMMAR_PRIMARY_MODE_CARDS.map((card) => card.id);
  const primaryAllowlisted = primaryIds.filter((id) => GRAMMAR_FOCUS_ALLOWED_MODES.has(id));
  assert.deepEqual(primaryAllowlisted, ['smart']);
});

test('U5 view-model: allowlist intersects with GRAMMAR_MORE_PRACTICE_MODES for Learn only', () => {
  const moreIds = GRAMMAR_MORE_PRACTICE_MODES.map((mode) => mode.id);
  const moreAllowlisted = moreIds.filter((id) => GRAMMAR_FOCUS_ALLOWED_MODES.has(id));
  assert.deepEqual(moreAllowlisted, ['learn']);
});

// -----------------------------------------------------------------------------
// Frozen filter-id sets
// -----------------------------------------------------------------------------

test('U8 view-model: GRAMMAR_BANK_STATUS_FILTER_IDS contains the seven child filter ids', () => {
  assert.equal(GRAMMAR_BANK_STATUS_FILTER_IDS.size, 7);
  for (const id of ['all', 'due', 'trouble', 'learning', 'nearly-secure', 'secure', 'new']) {
    assert.equal(GRAMMAR_BANK_STATUS_FILTER_IDS.has(id), true, `missing ${id}`);
  }
});

test('U8 view-model: GRAMMAR_BANK_CLUSTER_FILTER_IDS matches the four active roster ids plus all', () => {
  assert.equal(GRAMMAR_BANK_CLUSTER_FILTER_IDS.size, 5);
  for (const id of ['all', 'bracehart', 'chronalyx', 'couronnail', 'concordium']) {
    assert.equal(GRAMMAR_BANK_CLUSTER_FILTER_IDS.has(id), true, `missing ${id}`);
  }
});

test('U8 view-model: GRAMMAR_BANK_CLUSTER_FILTER_IDS never lists retired ids (R15)', () => {
  for (const retiredId of ['glossbloom', 'loomrill', 'mirrane']) {
    assert.equal(GRAMMAR_BANK_CLUSTER_FILTER_IDS.has(retiredId), false, `${retiredId} leaked into filter`);
  }
});

// -----------------------------------------------------------------------------
// GRAMMAR_DASHBOARD_HERO
// -----------------------------------------------------------------------------

test('U8 view-model: GRAMMAR_DASHBOARD_HERO has child-friendly copy', () => {
  assert.equal(GRAMMAR_DASHBOARD_HERO.title, 'Grammar Garden');
  assert.equal(typeof GRAMMAR_DASHBOARD_HERO.subtitle, 'string');
  assert.ok(GRAMMAR_DASHBOARD_HERO.subtitle.length > 0);
  assert.equal(isGrammarChildCopy(GRAMMAR_DASHBOARD_HERO.title), true);
  assert.equal(isGrammarChildCopy(GRAMMAR_DASHBOARD_HERO.subtitle), true);
});

// -----------------------------------------------------------------------------
// grammarChildConfidenceLabel + grammarChildConfidenceTone
// -----------------------------------------------------------------------------

test('U8 view-model: grammarChildConfidenceLabel maps the five internal labels (R12)', () => {
  assert.equal(grammarChildConfidenceLabel({ label: 'emerging' }), 'New');
  assert.equal(grammarChildConfidenceLabel({ label: 'building' }), 'Learning');
  assert.equal(grammarChildConfidenceLabel({ label: 'needs-repair' }), 'Trouble spot');
  assert.equal(grammarChildConfidenceLabel({ label: 'consolidating' }), 'Nearly secure');
  assert.equal(grammarChildConfidenceLabel({ label: 'secure' }), 'Secure');
});

test('U8 view-model: grammarChildConfidenceLabel unknown label falls back to Check status', () => {
  assert.equal(grammarChildConfidenceLabel({ label: 'not-a-label' }), 'Check status');
  assert.equal(grammarChildConfidenceLabel({}), 'Check status');
  assert.equal(grammarChildConfidenceLabel({ label: null }), 'Check status');
});

test('U8 view-model: grammarChildConfidenceTone maps tones for CSS classes', () => {
  assert.equal(grammarChildConfidenceTone('emerging'), 'new');
  assert.equal(grammarChildConfidenceTone('building'), 'learning');
  assert.equal(grammarChildConfidenceTone('needs-repair'), 'trouble');
  assert.equal(grammarChildConfidenceTone('consolidating'), 'nearly-secure');
  assert.equal(grammarChildConfidenceTone('secure'), 'secure');
  assert.equal(grammarChildConfidenceTone('unknown'), 'learning');
});

// -----------------------------------------------------------------------------
// grammarMonsterClusterForConcept
// -----------------------------------------------------------------------------

test('U8 view-model: grammarMonsterClusterForConcept maps direct clusters (word_classes → couronnail)', () => {
  assert.equal(grammarMonsterClusterForConcept('word_classes'), 'couronnail');
  assert.equal(grammarMonsterClusterForConcept('noun_phrases'), 'bracehart');
  assert.equal(grammarMonsterClusterForConcept('clauses'), 'bracehart');
  assert.equal(grammarMonsterClusterForConcept('relative_clauses'), 'bracehart');
  assert.equal(grammarMonsterClusterForConcept('sentence_functions'), 'bracehart');
  assert.equal(grammarMonsterClusterForConcept('active_passive'), 'bracehart');
  assert.equal(grammarMonsterClusterForConcept('subject_object'), 'bracehart');
  assert.equal(grammarMonsterClusterForConcept('tense_aspect'), 'chronalyx');
  assert.equal(grammarMonsterClusterForConcept('modal_verbs'), 'chronalyx');
  assert.equal(grammarMonsterClusterForConcept('adverbials'), 'chronalyx');
  assert.equal(grammarMonsterClusterForConcept('pronouns_cohesion'), 'chronalyx');
  assert.equal(grammarMonsterClusterForConcept('standard_english'), 'couronnail');
  assert.equal(grammarMonsterClusterForConcept('formality'), 'couronnail');
});

test('U8 view-model: grammarMonsterClusterForConcept maps punctuation-for-grammar concepts to direct owners', () => {
  assert.equal(grammarMonsterClusterForConcept('parenthesis_commas'), 'bracehart');
  assert.equal(grammarMonsterClusterForConcept('speech_punctuation'), 'bracehart');
  assert.equal(grammarMonsterClusterForConcept('boundary_punctuation'), 'bracehart');
  assert.equal(grammarMonsterClusterForConcept('apostrophes_possession'), 'couronnail');
  assert.equal(grammarMonsterClusterForConcept('hyphen_ambiguity'), 'couronnail');
});

test('U8 view-model: grammarMonsterClusterForConcept unknown/empty concept ids default to concordium', () => {
  assert.equal(grammarMonsterClusterForConcept(''), 'concordium');
  assert.equal(grammarMonsterClusterForConcept(null), 'concordium');
  assert.equal(grammarMonsterClusterForConcept('not_a_concept'), 'concordium');
});

// -----------------------------------------------------------------------------
// grammarBankFilterMatchesStatus
// -----------------------------------------------------------------------------

test('U8 view-model: grammarBankFilterMatchesStatus all matches everything', () => {
  assert.equal(grammarBankFilterMatchesStatus('all', 'emerging'), true);
  assert.equal(grammarBankFilterMatchesStatus('all', 'secure'), true);
  assert.equal(grammarBankFilterMatchesStatus('all', 'needs-repair'), true);
});

test('U8 view-model: grammarBankFilterMatchesStatus trouble maps to needs-repair only', () => {
  assert.equal(grammarBankFilterMatchesStatus('trouble', 'needs-repair'), true);
  assert.equal(grammarBankFilterMatchesStatus('trouble', 'emerging'), false);
});

test('U8 view-model: grammarBankFilterMatchesStatus secure does not match consolidating', () => {
  assert.equal(grammarBankFilterMatchesStatus('secure', 'consolidating'), false);
  assert.equal(grammarBankFilterMatchesStatus('secure', 'secure'), true);
});

test('U8 view-model: grammarBankFilterMatchesStatus learning maps to building', () => {
  assert.equal(grammarBankFilterMatchesStatus('learning', 'building'), true);
  assert.equal(grammarBankFilterMatchesStatus('learning', 'consolidating'), false);
});

test('U8 view-model: grammarBankFilterMatchesStatus nearly-secure maps to consolidating', () => {
  assert.equal(grammarBankFilterMatchesStatus('nearly-secure', 'consolidating'), true);
  assert.equal(grammarBankFilterMatchesStatus('nearly-secure', 'secure'), false);
});

test('U8 view-model: grammarBankFilterMatchesStatus new maps to emerging', () => {
  assert.equal(grammarBankFilterMatchesStatus('new', 'emerging'), true);
  assert.equal(grammarBankFilterMatchesStatus('new', 'building'), false);
});

// -----------------------------------------------------------------------------
// GRAMMAR_CHILD_FORBIDDEN_TERMS + isGrammarChildCopy
// -----------------------------------------------------------------------------

test('U8 view-model: GRAMMAR_CHILD_FORBIDDEN_TERMS contains the critical adult terms', () => {
  for (const term of [
    'Worker',
    'Worker-marked',
    'Worker-held',
    'Stage 1',
    'Evidence snapshot',
    'Reserved reward routes',
    'Bellstorm bridge',
    'denominator',
    'reward route',
    'projection',
    'retrieval practice',
  ]) {
    assert.ok(
      GRAMMAR_CHILD_FORBIDDEN_TERMS.includes(term),
      `expected GRAMMAR_CHILD_FORBIDDEN_TERMS to include "${term}"`,
    );
  }
});

test('U8 view-model: GRAMMAR_CHILD_FORBIDDEN_TERMS is frozen', () => {
  assert.equal(Object.isFrozen(GRAMMAR_CHILD_FORBIDDEN_TERMS), true);
});

test('U8 view-model: isGrammarChildCopy rejects Worker-marked modes (case-insensitive)', () => {
  assert.equal(isGrammarChildCopy('Worker-marked modes'), false);
  assert.equal(isGrammarChildCopy('worker-marked modes'), false);
  assert.equal(isGrammarChildCopy('WORKER-MARKED MODES'), false);
});

test('U8 view-model: isGrammarChildCopy accepts child-friendly prompt copy', () => {
  assert.equal(
    isGrammarChildCopy('Choose the sentence that uses a relative clause'),
    true,
  );
  assert.equal(isGrammarChildCopy('Fix trouble spots. Grow your creatures.'), true);
});

test('U8 view-model: isGrammarChildCopy safe on empty / non-string', () => {
  assert.equal(isGrammarChildCopy(''), true);
  assert.equal(isGrammarChildCopy(null), true);
  assert.equal(isGrammarChildCopy(undefined), true);
});

// -----------------------------------------------------------------------------
// buildGrammarDashboardModel
// -----------------------------------------------------------------------------

test('P5-U8 view-model: buildGrammarDashboardModel returns safe empty shape on null inputs', () => {
  const model = buildGrammarDashboardModel(null, null, null);
  assert.equal(Array.isArray(model.modeCards), true);
  // U8 Phase 5: modeCards now contains only Smart Practice.
  assert.equal(model.modeCards.length, 1);
  assert.equal(model.modeCards[0].id, 'smart');
  assert.equal(model.modeCards[0].featured, true);
  assert.equal(model.todayCards.length, 4);
  assert.equal(model.isEmpty, true);
  assert.equal(model.concordiumProgress.mastered, 0);
  assert.equal(model.concordiumProgress.total, 18);
  assert.equal(model.primaryMode, 'smart');
  assert.equal(Array.isArray(model.moreModes), true);
  // U8 Phase 5: moreModes now includes Writing Try (6 total).
  assert.equal(model.moreModes.length, 6);
  assert.equal(typeof model.writingTryAvailable, 'boolean');
  // U8 Phase 5: secondaryLinks has 3 demoted modes.
  assert.equal(Array.isArray(model.secondaryLinks), true);
  assert.equal(model.secondaryLinks.length, 3);
});

test('U8 view-model: buildGrammarDashboardModel surfaces concept counts', () => {
  const grammar = {
    analytics: {
      progressSnapshot: {
        dueConcepts: 3,
        weakConcepts: 2,
        securedConcepts: 4,
      },
    },
    prefs: { mode: 'trouble' },
  };
  const model = buildGrammarDashboardModel(grammar, null, null);
  const byId = Object.fromEntries(model.todayCards.map((card) => [card.id, card]));
  assert.equal(byId.due.value, 3);
  assert.equal(byId.trouble.value, 2);
  assert.equal(byId.secure.value, 4);
  assert.equal(model.primaryMode, 'trouble');
  // Any non-zero Today count flips isEmpty to false (U1 follower).
  assert.equal(model.isEmpty, false);
});

test('U8 view-model: buildGrammarDashboardModel concordium progress reads reward state', () => {
  const rewardState = {
    concordium: {
      mastered: [
        'grammar:grammar-legacy-reviewed-2026-04-24:word_classes',
        'grammar:grammar-legacy-reviewed-2026-04-24:noun_phrases',
      ],
    },
  };
  const model = buildGrammarDashboardModel({}, null, rewardState);
  assert.equal(model.concordiumProgress.mastered, 2);
  assert.equal(model.concordiumProgress.total, 18);
});

// -----------------------------------------------------------------------------
// buildGrammarBankModel
// -----------------------------------------------------------------------------

test('U8 view-model: buildGrammarBankModel default returns 18 concept cards', () => {
  const model = buildGrammarBankModel({}, {});
  assert.equal(model.total, 18);
  assert.equal(model.cards.length, 18);
});

test('U8 view-model: buildGrammarBankModel filter=trouble narrows to needs-repair', () => {
  const grammar = {
    analytics: {
      concepts: [
        { id: 'clauses', confidenceLabel: 'needs-repair', status: 'weak', name: 'Subordinate clauses and conjunctions' },
        { id: 'word_classes', confidenceLabel: 'secure', status: 'secured', name: 'Word classes' },
        { id: 'noun_phrases', confidenceLabel: 'building', status: 'learning', name: 'Expanded noun phrases' },
      ],
    },
  };
  const model = buildGrammarBankModel(grammar, { statusFilter: 'trouble' });
  assert.ok(model.cards.length >= 1);
  for (const card of model.cards) {
    assert.equal(card.label, 'needs-repair');
  }
});

test('U8 view-model: buildGrammarBankModel search clause narrows to matching concepts', () => {
  const model = buildGrammarBankModel({}, { query: 'clause' });
  assert.ok(model.cards.length >= 2);
  for (const card of model.cards) {
    const haystack = `${card.name} ${card.summary} ${card.domain}`.toLowerCase();
    assert.ok(haystack.includes('clause'), `card ${card.id} should match clause`);
  }
});

test('U8 view-model: buildGrammarBankModel cluster filter concordium shows all 18', () => {
  const model = buildGrammarBankModel({}, { clusterFilter: 'concordium' });
  assert.equal(model.cards.length, 18);
});

test('U8 view-model: buildGrammarBankModel cluster filter bracehart narrows to 9', () => {
  const model = buildGrammarBankModel({}, { clusterFilter: 'bracehart' });
  assert.equal(model.cards.length, 9);
  for (const card of model.cards) {
    assert.equal(card.cluster, 'bracehart');
  }
});

test('U8 view-model: buildGrammarBankModel counts total 18 across all statuses', () => {
  const model = buildGrammarBankModel({}, {});
  const sumOfBuckets = model.counts.secure
    + model.counts.trouble
    + model.counts.learning
    + model.counts['nearly-secure']
    + model.counts.new;
  assert.equal(sumOfBuckets, 18);
  assert.equal(model.counts.all, 18);
});

test('U8 view-model: buildGrammarBankModel empty filter + empty grammar returns cards using child labels', () => {
  const model = buildGrammarBankModel({}, {});
  for (const card of model.cards) {
    assert.equal(typeof card.childLabel, 'string');
    assert.ok(card.childLabel.length > 0);
    assert.ok(['new', 'learning', 'trouble', 'nearly-secure', 'secure'].includes(card.tone));
  }
});

// -----------------------------------------------------------------------------
// grammarSummaryCards
// -----------------------------------------------------------------------------

test('U8 view-model: grammarSummaryCards returns five cards with correct order', () => {
  const cards = grammarSummaryCards({ answered: 6, correct: 4 }, null);
  assert.equal(cards.length, 5);
  assert.deepEqual(
    cards.map((card) => card.id),
    ['answered', 'correct', 'trouble', 'new-secure', 'monster-progress'],
  );
});

test('U8 view-model: grammarSummaryCards monster-progress surfaces 4 active monsters only (R15)', () => {
  const cards = grammarSummaryCards({}, {
    bracehart: { mastered: ['grammar:grammar-legacy-reviewed-2026-04-24:clauses'], caught: true, starHighWater: 10 },
    concordium: { mastered: ['grammar:grammar-legacy-reviewed-2026-04-24:clauses'], caught: true, starHighWater: 5 },
    glossbloom: { mastered: ['grammar:grammar-legacy-reviewed-2026-04-24:noun_phrases'], caught: true, starHighWater: 50 }, // retired
  });
  const monsterCard = cards.find((card) => card.id === 'monster-progress');
  assert.ok(Array.isArray(monsterCard.value));
  assert.equal(monsterCard.value.length, 4);
  const ids = monsterCard.value.map((entry) => entry.monsterId);
  assert.deepEqual(ids, ['bracehart', 'chronalyx', 'couronnail', 'concordium']);
  for (const id of ['glossbloom', 'loomrill', 'mirrane']) {
    assert.equal(ids.includes(id), false, `retired ${id} leaked into monster progress`);
  }
  // Entries carry Star shape, not legacy mastered/total.
  for (const entry of monsterCard.value) {
    assert.equal(typeof entry.monsterId, 'string');
    assert.equal(typeof entry.stageName, 'string');
    assert.equal(typeof entry.stars, 'number');
    assert.equal(entry.starMax, 100);
    assert.equal(typeof entry.stageIndex, 'number');
    assert.equal(typeof entry.accentColor, 'string');
    assert.equal(entry.mastered, undefined, `entry ${entry.monsterId} must not have legacy mastered`);
    assert.equal(entry.total, undefined, `entry ${entry.monsterId} must not have legacy total`);
  }
});

test('U8 view-model: grammarSummaryCards safe on empty inputs', () => {
  const cards = grammarSummaryCards(null, null);
  assert.equal(cards.length, 5);
  const byId = Object.fromEntries(cards.map((card) => [card.id, card]));
  assert.equal(byId.answered.value, 0);
  assert.equal(byId.correct.value, 0);
  assert.equal(byId.trouble.value, 0);
  assert.equal(byId['new-secure'].value, 0);
});

test('U8 view-model: grammarSummaryCards accuracy detail is computed from answered/correct', () => {
  const cards = grammarSummaryCards({ answered: 4, correct: 3 }, null);
  const correctCard = cards.find((card) => card.id === 'correct');
  assert.equal(correctCard.value, 3);
  assert.ok(correctCard.detail.includes('75%'));
});

test('U8 view-model: grammarSummaryCards excludes manual-review saves from accuracy', () => {
  const manualOnlyCards = grammarSummaryCards({
    answered: 1,
    scoredAnswered: 0,
    nonScoredAnswered: 1,
    correct: 0,
  }, null);
  const manualOnlyCorrect = manualOnlyCards.find((card) => card.id === 'correct');
  assert.equal(manualOnlyCorrect.value, 0);
  assert.equal(manualOnlyCorrect.detail, 'Saved for review');

  const mixedCards = grammarSummaryCards({
    answered: 2,
    scoredAnswered: 1,
    nonScoredAnswered: 1,
    correct: 1,
  }, null);
  const mixedCorrect = mixedCards.find((card) => card.id === 'correct');
  assert.equal(mixedCorrect.detail, '100% accuracy');
});

// =============================================================================
// P7-U2: Summary monster progress uses Star display model (not concept counts)
// =============================================================================

test('P7-U2 view-model: fresh learner summary shows 0 / 100 Stars with "Not found yet" stage', () => {
  const cards = grammarSummaryCards({}, {});
  const monsterCard = cards.find((card) => card.id === 'monster-progress');
  assert.ok(Array.isArray(monsterCard.value));
  assert.equal(monsterCard.value.length, 4);
  for (const entry of monsterCard.value) {
    assert.equal(entry.stars, 0, `${entry.monsterId} starts at 0 Stars`);
    assert.equal(entry.starMax, 100, `${entry.monsterId} starMax is 100`);
    assert.equal(entry.stageName, 'Not found yet', `${entry.monsterId} stage is "Not found yet"`);
  }
});

test('P7-U2 view-model: 42-Star Bracehart summary shows "Hatched" stage name (actually Growing at 42)', () => {
  const rewardState = {
    bracehart: { mastered: [], caught: true, starHighWater: 42 },
  };
  const cards = grammarSummaryCards({}, rewardState);
  const monsterCard = cards.find((card) => card.id === 'monster-progress');
  const bracehart = monsterCard.value.find((e) => e.monsterId === 'bracehart');
  assert.equal(bracehart.stars, 42);
  assert.equal(bracehart.starMax, 100);
  assert.equal(bracehart.stageName, 'Growing');
});

test('P7-U2 view-model: Concordium at 100 Stars shows "Mega" stage', () => {
  const rewardState = {
    bracehart: { mastered: [], caught: true, starHighWater: 1 },
    couronnail: { mastered: [], caught: true, starHighWater: 1 },
    concordium: { mastered: [], caught: true, starHighWater: 100 },
  };
  const cards = grammarSummaryCards({}, rewardState);
  const monsterCard = cards.find((card) => card.id === 'monster-progress');
  const concordium = monsterCard.value.find((e) => e.monsterId === 'concordium');
  assert.equal(concordium.stars, 100);
  assert.equal(concordium.starMax, 100);
  assert.equal(concordium.stageName, 'Mega');
});

test('P7-U2 view-model: null/missing rewardState produces safe empty entries with 0 Stars', () => {
  const cards = grammarSummaryCards({}, null);
  const monsterCard = cards.find((card) => card.id === 'monster-progress');
  assert.ok(Array.isArray(monsterCard.value));
  assert.equal(monsterCard.value.length, 4);
  for (const entry of monsterCard.value) {
    assert.equal(entry.stars, 0, `${entry.monsterId} safe at 0 Stars`);
    assert.equal(entry.starMax, 100);
    assert.equal(typeof entry.stageName, 'string');
    assert.equal(typeof entry.accentColor, 'string');
  }
});

test('P7-U2 view-model: monster-progress card entries do NOT have mastered or total properties', () => {
  const rewardState = {
    bracehart: { mastered: ['grammar:grammar-legacy-reviewed-2026-04-24:clauses'], caught: true, starHighWater: 15 },
    concordium: { mastered: ['grammar:grammar-legacy-reviewed-2026-04-24:clauses'], caught: true, starHighWater: 5 },
  };
  const cards = grammarSummaryCards({}, rewardState);
  const monsterCard = cards.find((card) => card.id === 'monster-progress');
  for (const entry of monsterCard.value) {
    assert.equal(entry.mastered, undefined, `${entry.monsterId} must not carry legacy "mastered" property`);
    assert.equal(entry.total, undefined, `${entry.monsterId} must not carry legacy "total" property`);
    assert.equal(entry.id, undefined, `${entry.monsterId} uses monsterId, not legacy "id" property`);
    // Must have the Star shape instead.
    assert.equal(typeof entry.monsterId, 'string');
    assert.equal(typeof entry.stars, 'number');
    assert.equal(entry.starMax, 100);
    assert.equal(typeof entry.stageName, 'string');
    assert.equal(typeof entry.stageIndex, 'number');
    assert.equal(typeof entry.accentColor, 'string');
  }
});

// -----------------------------------------------------------------------------
// Pure-module safety: no React imports in the view-model files
// -----------------------------------------------------------------------------

test('U8 safety: session-ui.js does not import react', async () => {
  const fs = await import('node:fs');
  const url = await import('node:url');
  const path = url.fileURLToPath(new URL('../src/subjects/grammar/session-ui.js', import.meta.url));
  const source = fs.readFileSync(path, 'utf8');
  assert.equal(/from ['"]react['"]/i.test(source), false);
  assert.equal(/require\(['"]react['"]\)/i.test(source), false);
});

test('U8 safety: grammar-view-model.js does not import react', async () => {
  const fs = await import('node:fs');
  const url = await import('node:url');
  const path = url.fileURLToPath(
    new URL('../src/subjects/grammar/components/grammar-view-model.js', import.meta.url),
  );
  const source = fs.readFileSync(path, 'utf8');
  assert.equal(/from ['"]react['"]/i.test(source), false);
  assert.equal(/require\(['"]react['"]\)/i.test(source), false);
});

// -----------------------------------------------------------------------------
// U2: GRAMMAR_CONCEPT_EXAMPLES + helpers — one example per concept, short
// sentences, no forbidden terms. Tests for the Grammar Bank scene's view-model
// surface: chip orderings, aggregate cards, cluster counts, evidence copy.
// -----------------------------------------------------------------------------

test('U2 view-model: GRAMMAR_CONCEPT_EXAMPLES covers all 18 concepts', async () => {
  const {
    GRAMMAR_CONCEPT_EXAMPLES,
    grammarConceptPrimaryExample,
    grammarConceptExamples,
  } = await import('../src/subjects/grammar/components/grammar-view-model.js');
  const { GRAMMAR_CLIENT_CONCEPTS } = await import('../src/subjects/grammar/metadata.js');
  assert.equal(Object.keys(GRAMMAR_CONCEPT_EXAMPLES).length, 18);
  for (const concept of GRAMMAR_CLIENT_CONCEPTS) {
    const examples = GRAMMAR_CONCEPT_EXAMPLES[concept.id];
    assert.ok(Array.isArray(examples), `${concept.id} has examples`);
    assert.ok(examples.length >= 1, `${concept.id} has at least one example`);
    assert.equal(typeof grammarConceptPrimaryExample(concept.id), 'string');
    assert.ok(grammarConceptPrimaryExample(concept.id).length > 0);
    assert.equal(grammarConceptExamples(concept.id).length, examples.length);
  }
});

test('U2 view-model: GRAMMAR_CONCEPT_EXAMPLES are KS2-appropriate short sentences', async () => {
  const { GRAMMAR_CONCEPT_EXAMPLES } = await import('../src/subjects/grammar/components/grammar-view-model.js');
  for (const [conceptId, entries] of Object.entries(GRAMMAR_CONCEPT_EXAMPLES)) {
    for (const sentence of entries) {
      assert.ok(sentence.length <= 100, `${conceptId} example too long: ${sentence}`);
      assert.ok(sentence.length >= 3, `${conceptId} example too short`);
    }
  }
});

test('U2 view-model: grammarConceptPrimaryExample safe on unknown ids', async () => {
  const { grammarConceptPrimaryExample, grammarConceptExamples } = await import('../src/subjects/grammar/components/grammar-view-model.js');
  assert.equal(grammarConceptPrimaryExample(''), '');
  assert.equal(grammarConceptPrimaryExample(null), '');
  assert.equal(grammarConceptPrimaryExample('bogus-id'), '');
  assert.deepEqual(grammarConceptExamples(null), []);
  assert.deepEqual(grammarConceptExamples('bogus-id'), []);
});

test('U2 view-model: grammarConceptEvidenceLine produces child copy tallies (no percentages)', async () => {
  const { grammarConceptEvidenceLine } = await import('../src/subjects/grammar/components/grammar-view-model.js');
  assert.equal(grammarConceptEvidenceLine({ attempts: 0, correct: 0 }), 'You have not answered any of these yet.');
  assert.equal(grammarConceptEvidenceLine({ attempts: 3, correct: 2 }), 'You have 3 answers on this concept. 2 were correct.');
  assert.equal(grammarConceptEvidenceLine({ attempts: 1, correct: 1 }), 'You have 1 answer on this concept. 1 was correct.');
  assert.equal(grammarConceptEvidenceLine({ attempts: 5, correct: 0 }), 'You have 5 answers on this concept. 0 were correct.');
  // No raw percentage in the output
  assert.doesNotMatch(grammarConceptEvidenceLine({ attempts: 10, correct: 7 }), /\d+%/);
});

test('U2 view-model: GRAMMAR_BANK_STATUS_CHIPS ordering matches filter ids', async () => {
  const { GRAMMAR_BANK_STATUS_CHIPS, GRAMMAR_BANK_STATUS_FILTER_IDS: filterIds } = await import('../src/subjects/grammar/components/grammar-view-model.js');
  assert.equal(GRAMMAR_BANK_STATUS_CHIPS.length, filterIds.size);
  for (const chip of GRAMMAR_BANK_STATUS_CHIPS) {
    assert.ok(filterIds.has(chip.id), `chip ${chip.id} must be a valid filter id`);
    assert.ok(typeof chip.label === 'string');
    assert.ok(chip.label.length > 0);
  }
});

test('U2 view-model: GRAMMAR_BANK_CLUSTER_CHIPS never includes reserved monster ids', async () => {
  const { GRAMMAR_BANK_CLUSTER_CHIPS } = await import('../src/subjects/grammar/components/grammar-view-model.js');
  for (const chip of GRAMMAR_BANK_CLUSTER_CHIPS) {
    assert.ok(!['glossbloom', 'loomrill', 'mirrane'].includes(chip.id), `reserved id leaked: ${chip.id}`);
  }
});

test('U2 view-model: grammarBankAggregateCards returns frozen cards in the expected order', async () => {
  const { grammarBankAggregateCards } = await import('../src/subjects/grammar/components/grammar-view-model.js');
  const counts = { all: 18, secure: 2, 'nearly-secure': 3, trouble: 5, learning: 4, new: 4, due: 10 };
  const cards = grammarBankAggregateCards(counts);
  assert.equal(cards.length, 6);
  assert.deepEqual(cards.map((c) => c.id), ['total', 'secure', 'nearly-secure', 'trouble', 'learning', 'new']);
  assert.equal(cards[0].value, 18);
  assert.equal(cards[2].value, 3);
});

test('U2 follower: grammarBankAggregateCards Total card uses override total when counts narrow to a cluster', async () => {
  const { grammarBankAggregateCards } = await import('../src/subjects/grammar/components/grammar-view-model.js');
  // Cluster-scoped counts: only 6 concepts in view, but the global total is 18.
  const counts = { all: 6, secure: 1, 'nearly-secure': 1, trouble: 1, learning: 1, new: 2, due: 2 };
  const cards = grammarBankAggregateCards(counts, { total: 18 });
  // Total stays globally stable; the other tallies still reflect the scope.
  assert.equal(cards[0].value, 18);
  assert.equal(cards[0].sub, 'Grammar concepts tracked');
  assert.equal(cards[1].value, 1);
});

test('U2 follower: GRAMMAR_CONCEPT_EXAMPLES.hyphen_ambiguity primary example is the clear positive case', async () => {
  const { GRAMMAR_CONCEPT_EXAMPLES, grammarConceptPrimaryExample } = await import('../src/subjects/grammar/components/grammar-view-model.js');
  // [0] must be the clear positive "man-eating shark" example, [1] the re-sign one.
  assert.equal(GRAMMAR_CONCEPT_EXAMPLES.hyphen_ambiguity[0], 'The man-eating shark circled the boat.');
  assert.equal(GRAMMAR_CONCEPT_EXAMPLES.hyphen_ambiguity[1], 'Please re-sign the letter and send it back.');
  assert.equal(grammarConceptPrimaryExample('hyphen_ambiguity'), 'The man-eating shark circled the boat.');
});

test('U2 follower: GRAMMAR_BANK_HERO exposes a search-aware emptyWithSearch copy', async () => {
  const { GRAMMAR_BANK_HERO } = await import('../src/subjects/grammar/components/grammar-view-model.js');
  assert.equal(typeof GRAMMAR_BANK_HERO.emptyWithSearch, 'string');
  assert.ok(GRAMMAR_BANK_HERO.emptyWithSearch.length > 0);
  assert.match(GRAMMAR_BANK_HERO.emptyWithSearch, /search/i);
  assert.notEqual(GRAMMAR_BANK_HERO.emptyWithSearch, GRAMMAR_BANK_HERO.empty);
});

test('U2 view-model: buildGrammarBankModel exposes clusterCounts for chip badges', async () => {
  const { buildGrammarBankModel } = await import('../src/subjects/grammar/components/grammar-view-model.js');
  const model = buildGrammarBankModel({}, { statusFilter: 'all', clusterFilter: 'all', query: '' });
  assert.equal(model.clusterCounts.all, 18);
  assert.equal(model.clusterCounts.bracehart, 9);
  assert.equal(model.clusterCounts.chronalyx, 4);
  assert.equal(model.clusterCounts.couronnail, 5);
  assert.equal(model.clusterCounts.concordium, 18);
});

// =============================================================================
// P5-U7: buildGrammarMonsterStripModel — monster strip view-model
// =============================================================================

test('P5-U7 view-model: buildGrammarMonsterStripModel returns 4 active monsters in order', () => {
  const strip = buildGrammarMonsterStripModel(null, null, null);
  assert.equal(strip.length, 4);
  assert.deepEqual(strip.map((e) => e.monsterId), ['bracehart', 'chronalyx', 'couronnail', 'concordium']);
});

test('P5-U7 view-model: monster with 0 Stars shows "Not found yet"', () => {
  const strip = buildGrammarMonsterStripModel({}, null, null);
  for (const entry of strip) {
    assert.equal(entry.stars, 0);
    assert.equal(entry.stageName, 'Not found yet');
    assert.equal(entry.starMax, 100);
    assert.equal(entry.stageIndex, 0);
  }
});

test('P5-U7 view-model: monster with starHighWater=42 shows "Growing" (42 Stars)', () => {
  const rewardState = {
    bracehart: { mastered: [], caught: true, starHighWater: 42 },
  };
  const strip = buildGrammarMonsterStripModel(rewardState, null, null);
  const bracehart = strip.find((e) => e.monsterId === 'bracehart');
  assert.equal(bracehart.stars, 42);
  assert.equal(bracehart.stageName, 'Growing');
  assert.equal(bracehart.stageIndex, 3);
});

test('P5-U7 view-model: monster with starHighWater=100 shows "Mega"', () => {
  const rewardState = {
    couronnail: { mastered: [], caught: true, starHighWater: 100 },
  };
  const strip = buildGrammarMonsterStripModel(rewardState, null, null);
  const couronnail = strip.find((e) => e.monsterId === 'couronnail');
  assert.equal(couronnail.stars, 100);
  assert.equal(couronnail.stageName, 'Mega');
  assert.equal(couronnail.stageIndex, 5);
});

test('P5-U7 view-model: reserved monsters never appear in strip', () => {
  const rewardState = {
    glossbloom: { mastered: ['something'], caught: true, starHighWater: 50 },
    loomrill: { mastered: ['something'], caught: true, starHighWater: 30 },
    mirrane: { mastered: ['something'], caught: true, starHighWater: 20 },
  };
  const strip = buildGrammarMonsterStripModel(rewardState, null, null);
  const ids = strip.map((e) => e.monsterId);
  assert.equal(ids.includes('glossbloom'), false);
  assert.equal(ids.includes('loomrill'), false);
  assert.equal(ids.includes('mirrane'), false);
  assert.equal(ids.length, 4);
});

test('P5-U7 view-model: child-facing copy in monster strip contains no forbidden terms', () => {
  const strip = buildGrammarMonsterStripModel({}, null, null);
  for (const entry of strip) {
    assert.equal(isGrammarChildCopy(entry.name), true, `name "${entry.name}" contains forbidden term`);
    assert.equal(isGrammarChildCopy(entry.stageName), true, `stageName "${entry.stageName}" contains forbidden term`);
  }
  assert.equal(isGrammarChildCopy(GRAMMAR_MONSTER_STRIP_CHILD_COPY), true);
});

test('P5-U7 view-model: each monster entry has a valid accentColor from MONSTERS registry', () => {
  const strip = buildGrammarMonsterStripModel({}, null, null);
  for (const entry of strip) {
    assert.ok(typeof entry.accentColor === 'string');
    assert.match(entry.accentColor, /^#[0-9A-Fa-f]{6}$/, `${entry.monsterId} accent must be hex colour`);
  }
});

test('P5-U7 view-model: monster strip entries are frozen', () => {
  const strip = buildGrammarMonsterStripModel({}, null, null);
  for (const entry of strip) {
    assert.equal(Object.isFrozen(entry), true, `${entry.monsterId} entry must be frozen`);
  }
});

test('P5-U7 view-model: GRAMMAR_MONSTER_STRIP_CHILD_COPY is correct child-facing sentence', () => {
  assert.equal(GRAMMAR_MONSTER_STRIP_CHILD_COPY, 'Get 1 Star to find the Egg. Reach 100 Stars for Mega.');
});

test('P5-U7 view-model: buildGrammarMonsterStripModel + buildGrammarDashboardModel compose without conflict', () => {
  const dashboard = buildGrammarDashboardModel({}, null, {});
  const strip = buildGrammarMonsterStripModel({}, null, null);
  // Both return valid shapes without overwriting each other.
  assert.equal(dashboard.modeCards.length, 1);
  assert.equal(strip.length, 4);
  assert.equal(dashboard.concordiumProgress.total, 18);
});

// =============================================================================
// P5-U8: Landing page simplification — Smart Practice sole CTA
// =============================================================================

test('P5-U8 view-model: Smart Practice is the only data-featured=true element', () => {
  // In GRAMMAR_PRIMARY_MODE_CARDS, only Smart Practice has featured=true.
  const featuredCards = GRAMMAR_PRIMARY_MODE_CARDS.filter((c) => c.featured === true);
  assert.equal(featuredCards.length, 1);
  assert.equal(featuredCards[0].id, 'smart');
});

test('P5-U8 view-model: Grammar Bank, Mini Test, Fix Trouble Spots appear as secondary links', () => {
  const ids = GRAMMAR_SECONDARY_MODE_LINKS.map((link) => link.id);
  assert.ok(ids.includes('bank'), 'Grammar Bank in secondary links');
  assert.ok(ids.includes('satsset'), 'Mini Test in secondary links');
  assert.ok(ids.includes('trouble'), 'Fix Trouble Spots in secondary links');
});

test('P5-U8 view-model: Writing Try appears inside collapsed More practice', () => {
  const moreIds = GRAMMAR_MORE_PRACTICE_MODES.map((mode) => mode.id);
  assert.ok(moreIds.includes('transfer'), 'Writing Try (transfer) in More practice');
  // Writing Try is NOT in primary or secondary.
  const primaryIds = GRAMMAR_PRIMARY_MODE_CARDS.map((c) => c.id);
  const secondaryIds = GRAMMAR_SECONDARY_MODE_LINKS.map((l) => l.id);
  assert.equal(primaryIds.includes('transfer'), false, 'Writing Try not in primary');
  assert.equal(secondaryIds.includes('transfer'), false, 'Writing Try not in secondary links');
});

test('P5-U8 view-model: More practice disclosure contains all 6 secondary modes', () => {
  assert.deepEqual(
    GRAMMAR_MORE_PRACTICE_MODES.map((mode) => mode.id),
    ['learn', 'surgery', 'builder', 'worked', 'faded', 'transfer'],
  );
});

test('P5-U8 view-model: fresh learner (no progress) still produces valid dashboard with Smart Practice accessible', () => {
  const model = buildGrammarDashboardModel({}, null, null);
  assert.equal(model.isEmpty, true);
  assert.equal(model.modeCards.length, 1);
  assert.equal(model.modeCards[0].id, 'smart');
  assert.equal(model.secondaryLinks.length, 3);
  assert.equal(model.moreModes.length, 6);
});

test('P5-U8 view-model: all forbidden terms absent from simplified layout labels', () => {
  // Primary, secondary, and more-practice titles + descs.
  const allLabels = [
    ...GRAMMAR_PRIMARY_MODE_CARDS.flatMap((c) => [c.title, c.desc]),
    ...GRAMMAR_SECONDARY_MODE_LINKS.flatMap((l) => [l.title, l.desc]),
    ...GRAMMAR_MORE_PRACTICE_MODES.flatMap((m) => [m.title, m.desc]),
    GRAMMAR_MONSTER_STRIP_CHILD_COPY,
  ];
  for (const label of allLabels) {
    assert.equal(isGrammarChildCopy(label), true, `"${label}" contains forbidden term`);
  }
});

// =============================================================================
// P5-U10: View-model integration — additive Star fields
// =============================================================================

test('P5-U10 view-model: buildGrammarDashboardModel includes monsterStrip with 4 entries alongside concordiumProgress', () => {
  const model = buildGrammarDashboardModel({}, null, {});
  // monsterStrip is present and has 4 active monsters.
  assert.ok(Array.isArray(model.monsterStrip), 'monsterStrip is an array');
  assert.equal(model.monsterStrip.length, 4, 'monsterStrip has 4 entries');
  assert.deepEqual(
    model.monsterStrip.map((e) => e.monsterId),
    ['bracehart', 'chronalyx', 'couronnail', 'concordium'],
  );
  // concordiumProgress coexists — backward compatibility.
  assert.equal(typeof model.concordiumProgress, 'object');
  assert.equal(typeof model.concordiumProgress.mastered, 'number');
  assert.equal(typeof model.concordiumProgress.total, 'number');
});

test('P5-U10 view-model: concordiumProgress shape is UNCHANGED ({ mastered, total }) — backward compatibility', () => {
  const rewardState = {
    concordium: {
      mastered: [
        'grammar:grammar-legacy-reviewed-2026-04-24:word_classes',
        'grammar:grammar-legacy-reviewed-2026-04-24:noun_phrases',
        'grammar:grammar-legacy-reviewed-2026-04-24:clauses',
      ],
    },
  };
  const model = buildGrammarDashboardModel({}, null, rewardState);
  // concordiumProgress shape has exactly { mastered, total }, no extra keys.
  const keys = Object.keys(model.concordiumProgress).sort();
  assert.deepEqual(keys, ['mastered', 'total'], 'concordiumProgress has exactly mastered + total');
  assert.equal(model.concordiumProgress.mastered, 3);
  assert.equal(model.concordiumProgress.total, 18);
});

test('P5-U10 view-model: monsterStrip entries carry Star fields (stars, starMax, stageName, stageIndex)', () => {
  const rewardState = {
    bracehart: { mastered: [], caught: true, starHighWater: 42 },
    couronnail: { mastered: [], caught: true, starHighWater: 100 },
  };
  const model = buildGrammarDashboardModel({}, null, rewardState);
  for (const entry of model.monsterStrip) {
    assert.equal(typeof entry.stars, 'number', `${entry.monsterId} has numeric stars`);
    assert.equal(entry.starMax, 100, `${entry.monsterId} starMax is 100`);
    assert.equal(typeof entry.stageName, 'string', `${entry.monsterId} has string stageName`);
    assert.equal(typeof entry.stageIndex, 'number', `${entry.monsterId} has numeric stageIndex`);
    assert.equal(typeof entry.accentColor, 'string', `${entry.monsterId} has accentColor`);
  }
  // Specific star values from starHighWater.
  const bracehart = model.monsterStrip.find((e) => e.monsterId === 'bracehart');
  assert.equal(bracehart.stars, 42);
  assert.equal(bracehart.stageName, 'Growing');
  const couronnail = model.monsterStrip.find((e) => e.monsterId === 'couronnail');
  assert.equal(couronnail.stars, 100);
  assert.equal(couronnail.stageName, 'Mega');
});

test('P5-U10 view-model: fresh learner with no Grammar data -> monsterStrip shows 0 Stars for all 4 monsters', () => {
  const model = buildGrammarDashboardModel(null, null, null);
  assert.equal(model.monsterStrip.length, 4);
  for (const entry of model.monsterStrip) {
    assert.equal(entry.stars, 0, `${entry.monsterId} starts at 0 Stars`);
    assert.equal(entry.stageName, 'Not found yet', `${entry.monsterId} starts "Not found yet"`);
    assert.equal(entry.stageIndex, 0, `${entry.monsterId} starts at stageIndex 0`);
  }
  // concordiumProgress also safe.
  assert.equal(model.concordiumProgress.mastered, 0);
  assert.equal(model.concordiumProgress.total, 18);
});

test('P5-U10 view-model: monsterStrip + concordiumProgress do not conflict — both return valid shapes', () => {
  const rewardState = {
    concordium: {
      mastered: [
        'grammar:grammar-legacy-reviewed-2026-04-24:sentence_functions',
        'grammar:grammar-legacy-reviewed-2026-04-24:word_classes',
      ],
      caught: true,
      starHighWater: 5,
    },
    bracehart: {
      mastered: ['grammar:grammar-legacy-reviewed-2026-04-24:sentence_functions'],
      caught: true,
      starHighWater: 15,
    },
    couronnail: {
      mastered: ['grammar:grammar-legacy-reviewed-2026-04-24:word_classes'],
      caught: true,
      starHighWater: 1,
    },
  };
  const model = buildGrammarDashboardModel({}, null, rewardState);
  // Legacy concordiumProgress reads mastered count.
  assert.equal(model.concordiumProgress.mastered, 2);
  assert.equal(model.concordiumProgress.total, 18);
  // monsterStrip reads Star-based progress from starHighWater.
  const concordiumEntry = model.monsterStrip.find((e) => e.monsterId === 'concordium');
  assert.equal(concordiumEntry.stars, 5);
  const bracehartEntry = model.monsterStrip.find((e) => e.monsterId === 'bracehart');
  assert.equal(bracehartEntry.stars, 15);
  assert.equal(bracehartEntry.stageName, 'Hatched');
});

test('P5-U10 view-model: reserved monsters never leak into monsterStrip from dashboard model', () => {
  const rewardState = {
    glossbloom: { mastered: ['something'], caught: true, starHighWater: 50 },
    loomrill: { mastered: ['something'], caught: true, starHighWater: 30 },
  };
  const model = buildGrammarDashboardModel({}, null, rewardState);
  const ids = model.monsterStrip.map((e) => e.monsterId);
  assert.equal(ids.includes('glossbloom'), false, 'glossbloom excluded from dashboard monsterStrip');
  assert.equal(ids.includes('loomrill'), false, 'loomrill excluded from dashboard monsterStrip');
  assert.equal(ids.length, 4, 'exactly 4 active monsters in strip');
});

// =============================================================================
// P6-U6: Dashboard model passes evidence to monster strip
// =============================================================================

test('P6-U6 view-model: dashboard model with evidence → monsterStrip Stars match live derivation', () => {
  // Bracehart has 9 concepts after bridge ownership. Provide mastery nodes showing a secured concept
  // with 2 independent corrects across 2 templates → all 5 evidence tiers
  // should be true for that concept, yielding floor(100/9 * 1.0) = 11 Stars.
  const rewardState = {
    bracehart: { mastered: [], caught: false, starHighWater: 0 },
  };
  const conceptNodes = {
    clauses: { attempts: 12, correct: 11, wrong: 1, strength: 0.88, intervalDays: 14, correctStreak: 6 },
  };
  // P6-U2/U3 (#387) requires `createdAt` strictly after the estimated
  // `securedAtTs = now - intervalDays * 86_400_000` for `retainedAfterSecure`
  // to fire. `Date.now()` satisfies that for any positive intervalDays.
  const now = Date.now();
  const recentAttempts = [
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-a', firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: now },
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-b', firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: now },
  ];
  const model = buildGrammarDashboardModel({}, null, rewardState, conceptNodes, recentAttempts);
  const bracehart = model.monsterStrip.find((e) => e.monsterId === 'bracehart');
  // 1 concept fully evidenced out of 9: floor(100/9 * 1.0) = floor(11.111) = 11
  assert.equal(bracehart.stars, 11, 'Live evidence yields 11 Stars for 1 fully-evidenced concept');
  assert.equal(bracehart.stageName, 'Egg found', '11 Stars = Egg found stage');
});

test('P6-U6 view-model: dashboard model without evidence (null, null) → graceful fallback to starHighWater', () => {
  const rewardState = {
    bracehart: { mastered: [], caught: true, starHighWater: 42 },
  };
  // No evidence args — the 4th and 5th parameters default to null.
  const model = buildGrammarDashboardModel({}, null, rewardState);
  const bracehart = model.monsterStrip.find((e) => e.monsterId === 'bracehart');
  assert.equal(bracehart.stars, 42, 'Falls back to persisted starHighWater when no evidence supplied');
  assert.equal(bracehart.stageName, 'Growing', '42 Stars = Growing stage');
});

test('P6-U6 view-model: live evidence > persisted starHighWater → dashboard shows higher Stars', () => {
  // starHighWater is 5, but live evidence computes to more than 5.
  const rewardState = {
    couronnail: { mastered: [], caught: true, starHighWater: 5 },
  };
  // Couronnail has 5 concepts after bridge ownership. Give word_classes all 5 tiers:
  // floor(100/5 * 1.0) = 20 Stars.
  const conceptNodes = {
    word_classes: { attempts: 12, correct: 11, wrong: 1, strength: 0.88, intervalDays: 14, correctStreak: 6 },
  };
  // P6-U2/U3 (#387) `retainedAfterSecure` temporal proof — see sibling test.
  const now = Date.now();
  const recentAttempts = [
    { conceptIds: ['word_classes'], result: { correct: true }, templateId: 'tmpl-a', firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: now },
    { conceptIds: ['word_classes'], result: { correct: true }, templateId: 'tmpl-b', firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: now },
  ];
  const model = buildGrammarDashboardModel({}, null, rewardState, conceptNodes, recentAttempts);
  const couronnail = model.monsterStrip.find((e) => e.monsterId === 'couronnail');
  assert.ok(couronnail.stars > 5, `Live evidence (${couronnail.stars}) must exceed persisted starHighWater (5)`);
  assert.equal(couronnail.stars, 20, '1 fully-evidenced Couronnail concept = 20 Stars');
});

test('P6-U6 view-model: bridge-only evidence shows direct egg and hides Concordium until breadth gate', () => {
  const rewardState = {
    concordium: {
      mastered: ['grammar:grammar-legacy-reviewed-2026-04-24:speech_punctuation'],
      caught: true,
      starHighWater: 14,
    },
  };
  const conceptNodes = {
    speech_punctuation: { attempts: 12, correct: 11, wrong: 1, strength: 0.88, intervalDays: 14, correctStreak: 6 },
  };
  const now = Date.now();
  const recentAttempts = [
    { conceptIds: ['speech_punctuation'], result: { correct: true }, templateId: 'tmpl-a', firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: now },
    { conceptIds: ['speech_punctuation'], result: { correct: true }, templateId: 'tmpl-b', firstAttemptIndependent: true, supportLevelAtScoring: 0, createdAt: now },
  ];
  const model = buildGrammarDashboardModel({}, null, rewardState, conceptNodes, recentAttempts);
  const bracehart = model.monsterStrip.find((e) => e.monsterId === 'bracehart');
  const concordium = model.monsterStrip.find((e) => e.monsterId === 'concordium');
  assert.ok(bracehart.stars >= 1, 'speech_punctuation contributes to Bracehart');
  assert.notEqual(bracehart.displayState, 'not-found', 'Bracehart egg appears');
  assert.equal(concordium.stars, 0, 'Concordium display Stars are taken back');
  assert.equal(concordium.displayState, 'not-found', 'Concordium egg is hidden');
});

test('P6-U6 view-model: live evidence < persisted starHighWater → dashboard shows starHighWater (latch holds)', () => {
  // starHighWater is 50, but live evidence only computes to 1 Star
  // (one concept with firstIndependentWin only → floor guarantee 1).
  // The latch must hold — display should be 50.
  const rewardState = {
    bracehart: { mastered: [], caught: true, starHighWater: 50 },
  };
  const conceptNodes = {
    clauses: { attempts: 1, correct: 1, wrong: 0, strength: 0.5, intervalDays: 1, correctStreak: 1 },
  };
  const recentAttempts = [
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-a', firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const model = buildGrammarDashboardModel({}, null, rewardState, conceptNodes, recentAttempts);
  const bracehart = model.monsterStrip.find((e) => e.monsterId === 'bracehart');
  assert.equal(bracehart.stars, 50, 'Latch holds — starHighWater 50 preserved despite lower live evidence');
  assert.equal(bracehart.stageName, 'Growing', '50 Stars = Growing stage');
});

test('P6-U6 view-model: dashboard Stars match direct buildGrammarMonsterStripModel Stars when same evidence supplied', () => {
  // Integration test: the dashboard model and the direct strip builder must
  // produce identical results when given the same inputs.
  const rewardState = {
    bracehart: { mastered: [], caught: true, starHighWater: 10 },
    chronalyx: { mastered: [], caught: false, starHighWater: 0 },
    couronnail: { mastered: [], caught: true, starHighWater: 20 },
    concordium: { mastered: [], caught: false, starHighWater: 0 },
  };
  const conceptNodes = {
    clauses: { attempts: 12, correct: 11, wrong: 1, strength: 0.88, intervalDays: 14, correctStreak: 6 },
    word_classes: { attempts: 12, correct: 11, wrong: 1, strength: 0.88, intervalDays: 14, correctStreak: 6 },
  };
  const recentAttempts = [
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-a', firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptIds: ['clauses'], result: { correct: true }, templateId: 'tmpl-b', firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptIds: ['word_classes'], result: { correct: true }, templateId: 'tmpl-c', firstAttemptIndependent: true, supportLevelAtScoring: 0 },
    { conceptIds: ['word_classes'], result: { correct: true }, templateId: 'tmpl-d', firstAttemptIndependent: true, supportLevelAtScoring: 0 },
  ];
  const dashboardModel = buildGrammarDashboardModel({}, null, rewardState, conceptNodes, recentAttempts);
  const directStrip = buildGrammarMonsterStripModel(rewardState, conceptNodes, recentAttempts);

  assert.equal(dashboardModel.monsterStrip.length, directStrip.length, 'Same number of entries');
  for (let i = 0; i < directStrip.length; i++) {
    const dashEntry = dashboardModel.monsterStrip[i];
    const directEntry = directStrip[i];
    assert.equal(dashEntry.monsterId, directEntry.monsterId, `Same monster id at index ${i}`);
    assert.equal(dashEntry.stars, directEntry.stars, `${dashEntry.monsterId}: dashboard Stars match direct strip Stars`);
    assert.equal(dashEntry.stageName, directEntry.stageName, `${dashEntry.monsterId}: dashboard stageName matches direct strip`);
    assert.equal(dashEntry.stageIndex, directEntry.stageIndex, `${dashEntry.monsterId}: dashboard stageIndex matches direct strip`);
  }
});

// =============================================================================
// P7-U3: Writing Try availability, Due filter label, confidence fallback
// =============================================================================

test('P7-U3 view-model: buildGrammarDashboardModel with aiEnrichment.enabled: false returns writingTryAvailable: true', () => {
  const grammar = { capabilities: { aiEnrichment: { enabled: false } } };
  const model = buildGrammarDashboardModel(grammar, null, null);
  assert.equal(model.writingTryAvailable, true);
});

test('P7-U3 view-model: buildGrammarDashboardModel with no capabilities returns writingTryAvailable: true', () => {
  const model = buildGrammarDashboardModel({}, null, null);
  assert.equal(model.writingTryAvailable, true);
});

test('P7-U3 view-model: GRAMMAR_BANK_STATUS_CHIPS "due" entry has label "Practise next"', () => {
  const dueChip = GRAMMAR_BANK_STATUS_CHIPS.find((chip) => chip.id === 'due');
  assert.ok(dueChip, 'due chip must exist');
  assert.equal(dueChip.label, 'Practise next');
});

test('P7-U3 view-model: grammarBankFilterMatchesStatus("due", "building") still returns true (unchanged behaviour)', () => {
  assert.equal(grammarBankFilterMatchesStatus('due', 'building'), true);
  assert.equal(grammarBankFilterMatchesStatus('due', 'needs-repair'), true);
});

test('P7-U3 view-model: grammarChildConfidenceLabel({ label: "not-a-label" }) returns "Check status"', () => {
  assert.equal(grammarChildConfidenceLabel({ label: 'not-a-label' }), 'Check status');
});

test('P7-U3 view-model: grammarChildConfidenceLabel({ label: "building" }) returns "Learning" (unchanged)', () => {
  assert.equal(grammarChildConfidenceLabel({ label: 'building' }), 'Learning');
});

test('P7-U3 view-model: grammarChildConfidenceLabel({}) returns "Check status"', () => {
  assert.equal(grammarChildConfidenceLabel({}), 'Check status');
});

test('P7-U3 view-model: grammarChildConfidenceLabel(undefined) returns "Check status"', () => {
  assert.equal(grammarChildConfidenceLabel(undefined), 'Check status');
});
