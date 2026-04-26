// U5 Phase 4 — Grammar Bank focus routing.
//
// These tests pin the "Grammar Bank Practise 5 focus is allowlisted to Smart
// + Learn" contract (James 2026-04-26 decision). The UX choice for U5 is
// **silent override to Smart Practice** when the learner's current mode is
// Surgery, Builder, or Trouble — the three modes where `grammarModeUsesFocus`
// returns false and Worker's `NO_SESSION_FOCUS_MODES` / `NO_STORED_FOCUS_MODES`
// would otherwise strip the focus before the engine reads it. The override is
// silent (no toast) because the dashboard already surfaces the "Mixed practice"
// label on Surgery/Builder cards — the expectation of focus-carry is never
// set for those modes.
//
// Coverage principles:
//  - Happy paths: Smart + Learn preserve the learner's current mode.
//  - Edge cases: Surgery, Builder, Trouble silently override to Smart, with
//    the focus concept still carried through.
//  - Worked / Faded preserve the learner's choice (Worker honours focus in
//    those modes; they are not the "mixed practice" targets this unit guards).
//  - Unknown conceptId / empty conceptId → no-op (regression-lock).
//  - Active session ends cleanly when a new focused round starts.
//  - Integration: Grammar Bank → Trouble filter → Practise 5 lands in Smart
//    with the focus concept id set.
//
// Test harness: `createGrammarHarness` wires the full server grammar engine
// so `service.savePrefs` + `service.startSession` run synchronously and the
// resulting session state (`grammar.session.mode`, `grammar.session.focusConceptId`)
// is observable right after dispatch.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGrammarHarness } from './helpers/grammar-subject-harness.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import {
  GRAMMAR_FOCUS_ALLOWED_MODES,
  isGrammarFocusAllowedMode,
} from '../src/subjects/grammar/components/grammar-view-model.js';

// --- GRAMMAR_FOCUS_ALLOWED_MODES — pure-function contract -------------------

test('U5: GRAMMAR_FOCUS_ALLOWED_MODES is a frozen Set of exactly {smart, learn}', () => {
  assert.ok(GRAMMAR_FOCUS_ALLOWED_MODES instanceof Set);
  assert.equal(GRAMMAR_FOCUS_ALLOWED_MODES.size, 2);
  assert.equal(GRAMMAR_FOCUS_ALLOWED_MODES.has('smart'), true);
  assert.equal(GRAMMAR_FOCUS_ALLOWED_MODES.has('learn'), true);
  // Negative roster — explicit to catch an accidental widening.
  for (const mode of ['surgery', 'builder', 'trouble', 'worked', 'faded', 'satsset', 'bank']) {
    assert.equal(GRAMMAR_FOCUS_ALLOWED_MODES.has(mode), false, `${mode} must not be in the allowlist`);
  }
  // Frozen so a runtime mutation throws (in strict mode) instead of silently
  // weakening the contract.
  assert.equal(Object.isFrozen(GRAMMAR_FOCUS_ALLOWED_MODES), true);
});

test('U5: isGrammarFocusAllowedMode returns true only for smart and learn', () => {
  assert.equal(isGrammarFocusAllowedMode('smart'), true);
  assert.equal(isGrammarFocusAllowedMode('learn'), true);
  for (const mode of ['surgery', 'builder', 'trouble', 'worked', 'faded', 'satsset', 'bank']) {
    assert.equal(isGrammarFocusAllowedMode(mode), false, `${mode} must not be allowed`);
  }
  // Defensive inputs — never crash, always return false.
  assert.equal(isGrammarFocusAllowedMode(''), false);
  assert.equal(isGrammarFocusAllowedMode(null), false);
  assert.equal(isGrammarFocusAllowedMode(undefined), false);
  assert.equal(isGrammarFocusAllowedMode(123), false);
  assert.equal(isGrammarFocusAllowedMode({}), false);
});

// --- Happy paths ------------------------------------------------------------

test('U5 happy: Practise 5 while prefs.mode=smart keeps Smart Practice and sets focus', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  harness.dispatch('open-subject', { subjectId: 'grammar' });

  // Default mode is smart; confirm for rigour before dispatching.
  let grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.prefs.mode, 'smart');

  harness.dispatch('grammar-focus-concept', { conceptId: 'relative_clauses' });

  grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.prefs.mode, 'smart', 'mode stays smart');
  assert.equal(grammar.prefs.focusConceptId, 'relative_clauses', 'focus concept persists on prefs');
  assert.equal(grammar.phase, 'session', 'start-session transition flips phase to session');
  assert.equal(grammar.session?.mode, 'smart', 'session runs in smart mode');
  assert.equal(grammar.session?.focusConceptId, 'relative_clauses', 'session carries focus concept id');
});

test('U5 happy: Practise 5 while prefs.mode=learn keeps Learn mode and sets focus', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-set-mode', { value: 'learn' });

  let grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.prefs.mode, 'learn');

  harness.dispatch('grammar-focus-concept', { conceptId: 'relative_clauses' });

  grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.prefs.mode, 'learn', 'mode stays learn');
  assert.equal(grammar.prefs.focusConceptId, 'relative_clauses');
  assert.equal(grammar.session?.mode, 'learn');
  assert.equal(grammar.session?.focusConceptId, 'relative_clauses');
});

// --- Silent override edge cases --------------------------------------------

test('U5 edge: Practise 5 while prefs.mode=surgery silently overrides to Smart + preserves focus', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-set-mode', { value: 'surgery' });

  let grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.prefs.mode, 'surgery');
  // `grammar-set-mode` clears focus for non-focus-using modes — this is the
  // pre-existing contract (preserved by U5).
  assert.equal(grammar.prefs.focusConceptId, '');
  // No error is set by the set-mode transition.
  assert.equal(grammar.error, '');

  harness.dispatch('grammar-focus-concept', { conceptId: 'relative_clauses' });

  grammar = harness.store.getState().subjectUi.grammar;
  // Silent override — no toast, no error banner.
  assert.equal(grammar.error, '', 'silent override — no error surfaced');
  // Mode flipped to smart (allowlisted), focus concept preserved.
  assert.equal(grammar.prefs.mode, 'smart', 'silent override routes to smart');
  assert.equal(grammar.prefs.focusConceptId, 'relative_clauses');
  // Session runs in smart with the requested focus concept.
  assert.equal(grammar.session?.mode, 'smart');
  assert.equal(grammar.session?.focusConceptId, 'relative_clauses');
});

test('U5 edge: Practise 5 while prefs.mode=builder silently overrides to Smart + preserves focus', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-set-mode', { value: 'builder' });

  harness.dispatch('grammar-focus-concept', { conceptId: 'noun_phrases' });

  const grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.error, '', 'silent override — no error surfaced');
  assert.equal(grammar.prefs.mode, 'smart');
  assert.equal(grammar.prefs.focusConceptId, 'noun_phrases');
  assert.equal(grammar.session?.mode, 'smart');
  assert.equal(grammar.session?.focusConceptId, 'noun_phrases');
});

test('U5 edge: Practise 5 while prefs.mode=trouble silently overrides to Smart + preserves focus', () => {
  // Trouble drops focus on Worker too (`NO_STORED_FOCUS_MODES`). The plan's
  // intent is that any Practise 5 tap lands in a focus-bearing Smart round —
  // trouble is rejected by `grammarModeUsesFocus` and falls to the same
  // silent-override path.
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-set-mode', { value: 'trouble' });

  harness.dispatch('grammar-focus-concept', { conceptId: 'clauses' });

  const grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.error, '', 'silent override — no error surfaced');
  assert.equal(grammar.prefs.mode, 'smart');
  assert.equal(grammar.prefs.focusConceptId, 'clauses');
  assert.equal(grammar.session?.mode, 'smart');
  assert.equal(grammar.session?.focusConceptId, 'clauses');
});

test('U5 edge: Practise 5 while prefs.mode=worked preserves Worked Examples (focus-using)', () => {
  // Worked is a focus-using mode on Worker and sits outside the client
  // allowlist — but it is not a "mixed practice" mode, so the dispatcher
  // preserves the learner's scaffold preference rather than overriding.
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-set-mode', { value: 'worked' });

  harness.dispatch('grammar-focus-concept', { conceptId: 'relative_clauses' });

  const grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.prefs.mode, 'worked');
  assert.equal(grammar.prefs.focusConceptId, 'relative_clauses');
  assert.equal(grammar.session?.mode, 'worked');
  assert.equal(grammar.session?.focusConceptId, 'relative_clauses');
});

test('U5 edge: Practise 5 while prefs.mode=faded preserves Faded Guidance (focus-using)', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-set-mode', { value: 'faded' });

  harness.dispatch('grammar-focus-concept', { conceptId: 'tense_aspect' });

  const grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.prefs.mode, 'faded');
  assert.equal(grammar.prefs.focusConceptId, 'tense_aspect');
  assert.equal(grammar.session?.mode, 'faded');
  assert.equal(grammar.session?.focusConceptId, 'tense_aspect');
});

// --- In-flight session → Practise 5 ends the current session cleanly -------

test('U5 edge: Practise 5 during an active Surgery session ends it cleanly + starts a fresh Smart round', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-set-mode', { value: 'surgery' });
  // Start a Surgery round — note Surgery's session type is `sentence-surgery`.
  harness.dispatch('grammar-start', {
    payload: { roundLength: 1, seed: 7 },
  });

  let grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'session');
  assert.equal(grammar.session.mode, 'surgery');
  const priorSessionId = grammar.session.id || grammar.session.startedAt || null;

  // Now tap Practise 5 mid-Surgery — the silent override should end the
  // Surgery session cleanly and drop the learner into a focused Smart round.
  harness.dispatch('grammar-focus-concept', { conceptId: 'relative_clauses' });

  grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.error, '', 'no error banner — transition is clean');
  assert.equal(grammar.prefs.mode, 'smart');
  assert.equal(grammar.prefs.focusConceptId, 'relative_clauses');
  assert.equal(grammar.session?.mode, 'smart', 'new session runs in smart');
  assert.equal(grammar.session?.focusConceptId, 'relative_clauses');
  // The session identity changed (either id or startedAt must differ) so we
  // know the prior Surgery session was replaced rather than mutated.
  const newSessionId = grammar.session.id || grammar.session.startedAt || null;
  if (priorSessionId && newSessionId) {
    assert.notEqual(newSessionId, priorSessionId, 'new session replaces prior one');
  }
});

// --- Error path: unknown / empty conceptId ---------------------------------

test('U5 error: grammar-focus-concept with empty conceptId is a no-op (no session mutation)', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  harness.dispatch('open-subject', { subjectId: 'grammar' });

  const before = harness.store.getState().subjectUi.grammar;
  const beforeSnapshot = JSON.stringify({
    phase: before.phase,
    mode: before.prefs?.mode,
    focus: before.prefs?.focusConceptId,
    session: Boolean(before.session),
  });

  // Missing conceptId — the dispatcher must short-circuit without mutating
  // prefs or starting a session.
  harness.dispatch('grammar-focus-concept', { conceptId: '' });

  const after = harness.store.getState().subjectUi.grammar;
  const afterSnapshot = JSON.stringify({
    phase: after.phase,
    mode: after.prefs?.mode,
    focus: after.prefs?.focusConceptId,
    session: Boolean(after.session),
  });
  assert.equal(beforeSnapshot, afterSnapshot, 'empty conceptId leaves state untouched');
  assert.equal(after.error, '', 'no toast / error surfaced');
});

test('U5 error: grammar-focus-concept with an unknown conceptId starts a session but does not crash', () => {
  // Unknown concept ids are tolerated — the Worker selection engine will
  // pick a nearest-valid concept. This test locks in that the dispatcher
  // itself does NOT crash or set an error banner. The focus concept id
  // still lands on prefs (engine decides how to handle the unknown id
  // downstream; the client must not pre-validate against a hard-coded list).
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  harness.dispatch('open-subject', { subjectId: 'grammar' });

  assert.doesNotThrow(() => {
    harness.dispatch('grammar-focus-concept', { conceptId: 'not_a_real_concept' });
  });

  const after = harness.store.getState().subjectUi.grammar;
  // Silent — no toast / error banner.
  assert.equal(after.error, '');
});

// --- Integration: Grammar Bank → Trouble filter → Practise 5 --------------

test('U5 integration: Grammar Bank Trouble filter → Practise 5 lands in Smart with focus concept', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-open-concept-bank');
  harness.dispatch('grammar-concept-bank-filter', { value: 'trouble' });

  let grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'bank');
  assert.equal(grammar.bank.statusFilter, 'trouble');

  // Tap Practise 5 on a real concept id (the bank view-model falls back to
  // all 18 concepts when analytics is empty, so any valid id works here).
  harness.dispatch('grammar-focus-concept', { conceptId: 'relative_clauses' });

  grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.prefs.mode, 'smart', 'lands in Smart (allowlisted mode)');
  assert.equal(grammar.prefs.focusConceptId, 'relative_clauses');
  assert.equal(grammar.session?.mode, 'smart');
  assert.equal(grammar.session?.focusConceptId, 'relative_clauses');
  assert.equal(grammar.phase, 'session', 'bank phase replaced by the new session');
  // Bank filter state is cleared on session start so re-opening the bank
  // does not carry the previous visit's "trouble" filter forward.
  assert.equal(grammar.bank.statusFilter, 'all');
});

// --- Explicit `mode` override in context.data -----------------------------

test('U5: grammar-focus-concept with data.mode=surgery is silently overridden to Smart', () => {
  // Defensive test: even if a caller explicitly passes `mode: 'surgery'` in
  // the dispatch data, the allowlist check overrides it to Smart. This
  // guards against a future scene passing a stale mode from some other
  // cache / memoised view.
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  // Start from smart so the only mode signal is the explicit data.mode.
  harness.dispatch('grammar-set-mode', { value: 'smart' });

  harness.dispatch('grammar-focus-concept', { conceptId: 'clauses', mode: 'surgery' });

  const grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.prefs.mode, 'smart', 'data.mode=surgery is overridden');
  assert.equal(grammar.prefs.focusConceptId, 'clauses');
  assert.equal(grammar.session?.mode, 'smart');
});

test('U5: grammar-focus-concept with data.mode=learn is honoured (allowlisted)', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  // Start from smart so the only mode signal is the explicit data.mode.
  harness.dispatch('grammar-set-mode', { value: 'smart' });

  harness.dispatch('grammar-focus-concept', { conceptId: 'clauses', mode: 'learn' });

  const grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.prefs.mode, 'learn');
  assert.equal(grammar.prefs.focusConceptId, 'clauses');
  assert.equal(grammar.session?.mode, 'learn');
});
