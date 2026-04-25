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
  GRAMMAR_MORE_PRACTICE_MODES,
  GRAMMAR_BANK_STATUS_FILTER_IDS,
  GRAMMAR_BANK_CLUSTER_FILTER_IDS,
  GRAMMAR_DASHBOARD_HERO,
  GRAMMAR_CHILD_FORBIDDEN_TERMS,
  grammarChildConfidenceLabel,
  grammarChildConfidenceTone,
  grammarMonsterClusterForConcept,
  grammarBankFilterMatchesStatus,
  buildGrammarDashboardModel,
  buildGrammarBankModel,
  grammarSummaryCards,
  isGrammarChildCopy,
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

// -----------------------------------------------------------------------------
// GRAMMAR_PRIMARY_MODE_CARDS — roster + shape contract
// -----------------------------------------------------------------------------

test('U8 view-model: GRAMMAR_PRIMARY_MODE_CARDS has exactly four cards (plan requirement)', () => {
  assert.equal(GRAMMAR_PRIMARY_MODE_CARDS.length, 4);
});

test('U8 view-model: GRAMMAR_PRIMARY_MODE_CARDS ids match active-mode set', () => {
  const ids = GRAMMAR_PRIMARY_MODE_CARDS.map((card) => card.id);
  assert.deepEqual(ids, ['smart', 'trouble', 'satsset', 'bank']);
});

test('U8 view-model: GRAMMAR_PRIMARY_MODE_CARDS titles match child copy', () => {
  const titles = Object.fromEntries(GRAMMAR_PRIMARY_MODE_CARDS.map((card) => [card.id, card.title]));
  assert.equal(titles.smart, 'Smart Practice');
  assert.equal(titles.trouble, 'Fix Trouble Spots');
  assert.equal(titles.satsset, 'Mini Test');
  assert.equal(titles.bank, 'Grammar Bank');
});

test('U8 view-model: GRAMMAR_PRIMARY_MODE_CARDS is frozen and deeply frozen', () => {
  assert.equal(Object.isFrozen(GRAMMAR_PRIMARY_MODE_CARDS), true);
  for (const card of GRAMMAR_PRIMARY_MODE_CARDS) {
    assert.equal(Object.isFrozen(card), true);
  }
});

test('U8 view-model: GRAMMAR_PRIMARY_MODE_CARDS titles use only child copy', () => {
  for (const card of GRAMMAR_PRIMARY_MODE_CARDS) {
    assert.equal(isGrammarChildCopy(card.title), true, `title "${card.title}" contains forbidden term`);
    assert.equal(isGrammarChildCopy(card.desc), true, `desc "${card.desc}" contains forbidden term`);
  }
});

// -----------------------------------------------------------------------------
// GRAMMAR_MORE_PRACTICE_MODES
// -----------------------------------------------------------------------------

test('U8 view-model: GRAMMAR_MORE_PRACTICE_MODES has exactly five secondary modes', () => {
  assert.equal(GRAMMAR_MORE_PRACTICE_MODES.length, 5);
  assert.deepEqual(
    GRAMMAR_MORE_PRACTICE_MODES.map((mode) => mode.id),
    ['learn', 'surgery', 'builder', 'worked', 'faded'],
  );
});

test('U8 view-model: GRAMMAR_MORE_PRACTICE_MODES are frozen', () => {
  assert.equal(Object.isFrozen(GRAMMAR_MORE_PRACTICE_MODES), true);
  for (const mode of GRAMMAR_MORE_PRACTICE_MODES) {
    assert.equal(Object.isFrozen(mode), true);
  }
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

test('U8 view-model: grammarChildConfidenceLabel unknown label falls back to Learning', () => {
  assert.equal(grammarChildConfidenceLabel({ label: 'not-a-label' }), 'Learning');
  assert.equal(grammarChildConfidenceLabel({}), 'Learning');
  assert.equal(grammarChildConfidenceLabel({ label: null }), 'Learning');
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

test('U8 view-model: grammarMonsterClusterForConcept punctuation-for-grammar concepts fall back to concordium', () => {
  assert.equal(grammarMonsterClusterForConcept('parenthesis_commas'), 'concordium');
  assert.equal(grammarMonsterClusterForConcept('speech_punctuation'), 'concordium');
  assert.equal(grammarMonsterClusterForConcept('apostrophes_possession'), 'concordium');
  assert.equal(grammarMonsterClusterForConcept('boundary_punctuation'), 'concordium');
  assert.equal(grammarMonsterClusterForConcept('hyphen_ambiguity'), 'concordium');
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

test('U8 view-model: buildGrammarDashboardModel returns safe empty shape on null inputs', () => {
  const model = buildGrammarDashboardModel(null, null, null);
  assert.equal(Array.isArray(model.modeCards), true);
  assert.equal(model.modeCards.length, 4);
  assert.equal(model.todayCards.length, 4);
  assert.equal(model.isEmpty, true);
  assert.equal(model.concordiumProgress.mastered, 0);
  assert.equal(model.concordiumProgress.total, 18);
  assert.equal(model.primaryMode, 'smart');
  assert.equal(Array.isArray(model.moreModes), true);
  assert.equal(model.moreModes.length, 5);
  assert.equal(typeof model.writingTryAvailable, 'boolean');
  // U1 follower: Smart Practice card is flagged as featured so U9 can style it.
  const smartCard = model.modeCards.find((card) => card.id === 'smart');
  assert.equal(smartCard.featured, true);
  for (const card of model.modeCards) {
    if (card.id !== 'smart') assert.notEqual(card.featured, true);
  }
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

test('U8 view-model: buildGrammarBankModel cluster filter bracehart narrows to 6', () => {
  const model = buildGrammarBankModel({}, { clusterFilter: 'bracehart' });
  assert.equal(model.cards.length, 6);
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
    bracehart: { mastered: ['grammar:grammar-legacy-reviewed-2026-04-24:clauses'] },
    concordium: { mastered: ['grammar:grammar-legacy-reviewed-2026-04-24:clauses'] },
    glossbloom: { mastered: ['grammar:grammar-legacy-reviewed-2026-04-24:noun_phrases'] }, // retired
  });
  const monsterCard = cards.find((card) => card.id === 'monster-progress');
  assert.ok(Array.isArray(monsterCard.value));
  assert.equal(monsterCard.value.length, 4);
  const ids = monsterCard.value.map((entry) => entry.id);
  assert.deepEqual(ids, ['bracehart', 'chronalyx', 'couronnail', 'concordium']);
  for (const id of ['glossbloom', 'loomrill', 'mirrane']) {
    assert.equal(ids.includes(id), false, `retired ${id} leaked into monster progress`);
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
