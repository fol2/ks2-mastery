import test from 'node:test';
import assert from 'node:assert/strict';

import { installMemoryStorage } from './helpers/memory-storage.js';
import { createAppHarness } from './helpers/app-harness.js';
import { WORD_BY_SLUG } from '../src/subjects/spelling/data/word-data.js';
import {
  isPostMasteryMode,
  isMegaSafeMode,
  isSingleAttemptMegaSafeMode,
} from '../src/subjects/spelling/service-contract.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// U6 mirrors the parity test's seed helper so the gate-behaviour tests can
// drive Guardian/Boss shortcut-start without depending on cross-file imports.
// Every core-pool word graduates to stage 4 with a 60-day dueDay cushion; the
// learner is a fresh all-core-Mega graduate at `todayDay`.
function seedAllCoreMegaForGuardian(repositories, learnerId, todayDay) {
  const progress = Object.fromEntries(
    Object.keys(WORD_BY_SLUG)
      .filter((slug) => WORD_BY_SLUG[slug].spellingPool !== 'extra')
      .map((slug) => [slug, {
        stage: 4,
        attempts: 6,
        correct: 5,
        wrong: 1,
        dueDay: todayDay + 60,
        lastDay: todayDay - 7,
        lastResult: 'correct',
      }]),
  );
  repositories.subjectStates.writeData(learnerId, 'spelling', { progress });
}

// ----- Pure predicate tests: behaviour of the helpers themselves ----------

test('U6 isPostMasteryMode: guardian + boss are post-mastery', () => {
  assert.equal(isPostMasteryMode('guardian'), true);
  assert.equal(isPostMasteryMode('boss'), true);
});

test('U6 isPostMasteryMode: legacy modes are NOT post-mastery', () => {
  assert.equal(isPostMasteryMode('smart'), false);
  assert.equal(isPostMasteryMode('trouble'), false);
  assert.equal(isPostMasteryMode('test'), false);
  assert.equal(isPostMasteryMode('single'), false);
});

test('U11 isPostMasteryMode: pattern-quest joins guardian + boss as post-mastery', () => {
  // U11 extends the helper to include `pattern-quest`. Without this the
  // module.js + remote-actions.js shortcut-start gate would let a
  // non-graduated learner launch a Pattern Quest, which cannot legally
  // start before all-core-Mega.
  assert.equal(isPostMasteryMode('pattern-quest'), true);
});

test('U6 isPostMasteryMode: tolerates garbage input without throwing', () => {
  assert.equal(isPostMasteryMode(undefined), false);
  assert.equal(isPostMasteryMode(null), false);
  assert.equal(isPostMasteryMode(''), false);
  assert.equal(isPostMasteryMode(0), false);
  assert.equal(isPostMasteryMode({}), false);
  assert.equal(isPostMasteryMode('GUARDIAN'), false, 'case-sensitive match');
});

test('U6 isMegaSafeMode: guardian + boss are Mega-safe regardless of options', () => {
  assert.equal(isMegaSafeMode('guardian'), true);
  assert.equal(isMegaSafeMode('boss'), true);
  assert.equal(isMegaSafeMode('guardian', { practiceOnly: false }), true);
  assert.equal(isMegaSafeMode('boss', { practiceOnly: true }), true);
  // U11: pattern-quest is Mega-safe — wobble lives in data.pattern, never
  // touches progress.stage / dueDay / lastDay / lastResult.
  assert.equal(isMegaSafeMode('pattern-quest'), true);
  assert.equal(isMegaSafeMode('pattern-quest', { practiceOnly: true }), true);
});

test('U6 isMegaSafeMode: trouble with practiceOnly=true is Mega-safe', () => {
  assert.equal(isMegaSafeMode('trouble', { practiceOnly: true }), true);
});

test('U6 isMegaSafeMode: trouble without practiceOnly is NOT Mega-safe', () => {
  assert.equal(isMegaSafeMode('trouble'), false);
  assert.equal(isMegaSafeMode('trouble', {}), false);
  assert.equal(isMegaSafeMode('trouble', { practiceOnly: false }), false);
  assert.equal(isMegaSafeMode('trouble', { practiceOnly: 'yes' }), false, 'strict boolean check');
  assert.equal(isMegaSafeMode('trouble', { practiceOnly: 1 }), false, 'strict boolean check');
});

test('U6 isMegaSafeMode: other modes are NOT Mega-safe', () => {
  assert.equal(isMegaSafeMode('smart'), false);
  assert.equal(isMegaSafeMode('test'), false);
  assert.equal(isMegaSafeMode('single'), false);
  assert.equal(isMegaSafeMode('smart', { practiceOnly: true }), false, 'practiceOnly only rescues trouble');
});

test('U6 isMegaSafeMode: tolerates garbage input and missing options', () => {
  assert.equal(isMegaSafeMode(undefined), false);
  assert.equal(isMegaSafeMode(null), false);
  assert.equal(isMegaSafeMode('trouble', null), false);
  assert.equal(isMegaSafeMode('trouble', undefined), false);
});

test('U6 isSingleAttemptMegaSafeMode: only guardian + boss + pattern-quest', () => {
  assert.equal(isSingleAttemptMegaSafeMode('guardian'), true);
  assert.equal(isSingleAttemptMegaSafeMode('boss'), true);
  // U11: pattern-quest is single-attempt Mega-safe — each card gets one
  // submit and no card demotes progress.stage.
  assert.equal(isSingleAttemptMegaSafeMode('pattern-quest'), true);
  assert.equal(isSingleAttemptMegaSafeMode('trouble'), false);
  assert.equal(isSingleAttemptMegaSafeMode('smart'), false);
  assert.equal(isSingleAttemptMegaSafeMode('test'), false);
  assert.equal(isSingleAttemptMegaSafeMode('single'), false);
  assert.equal(isSingleAttemptMegaSafeMode(undefined), false);
  assert.equal(isSingleAttemptMegaSafeMode(null), false);
});

// ----- Characterisation: the 2 refactored call-sites behave identically ---
//
// Before U6 both sites carried the literal `mode === 'guardian' || mode === 'boss'`.
// After U6 they call `isPostMasteryMode(mode)`. These integration-level
// assertions pin the pre-refactor behaviour so any accidental change in
// gating logic (typo in the helper, swapped branch, wrong semantic)
// surfaces as a test failure at this site — not deep in downstream
// Guardian/Boss tests.

test('U6 characterisation: module.js shortcut-start gate blocks guardian when !allWordsMega', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;

  harness.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '5' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  const beforePhase = harness.store.getState().subjectUi.spelling.phase;

  harness.dispatch('spelling-shortcut-start', { mode: 'guardian' });

  const after = harness.store.getState().subjectUi.spelling;
  assert.equal(after.phase, beforePhase, 'Guardian shortcut must not start a session without allWordsMega');
  assert.equal(after.session, null, 'no Guardian session allocated');
});

test('U6 characterisation: module.js shortcut-start gate blocks boss when !allWordsMega', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;

  harness.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '5' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  const beforePhase = harness.store.getState().subjectUi.spelling.phase;

  harness.dispatch('spelling-shortcut-start', { mode: 'boss' });

  const after = harness.store.getState().subjectUi.spelling;
  assert.equal(after.phase, beforePhase, 'Boss shortcut must not start a session without allWordsMega');
  assert.equal(after.session, null, 'no Boss session allocated');
});

test('U6 characterisation: module.js shortcut-start gate does NOT block non-post-mastery modes', () => {
  // Smart Review / SATs / Trouble / Single all fall through the
  // post-mastery gate and proceed to startSession without the allWordsMega
  // pre-check. After U6 the helper must preserve this: `isPostMasteryMode`
  // returns false for these modes so the gate is not triggered.
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;

  harness.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '1' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });

  // Smart mode without allWordsMega: still starts
  harness.dispatch('spelling-shortcut-start', { mode: 'smart' });
  let ui = harness.store.getState().subjectUi.spelling;
  assert.equal(ui.phase, 'session', 'smart mode starts without Mega gate');
  assert.equal(ui.session.mode, 'smart');

  // SATs test mode: same — not post-mastery
  harness.dispatch('spelling-shortcut-start', { mode: 'test' });
  // Confirm dialog defaults to absent in test env so switch happens.
  ui = harness.store.getState().subjectUi.spelling;
  assert.equal(ui.phase, 'session');
  assert.equal(ui.session.mode, 'test');
});

test('U6 characterisation: module.js shortcut-start gate lets guardian through when allWordsMega', () => {
  const storage = installMemoryStorage();
  const nowRef = { value: Date.UTC(2026, 0, 10) };
  const harness = createAppHarness({ storage, now: () => nowRef.value });
  const learnerId = harness.store.getState().learners.selectedId;
  const todayDay = Math.floor(nowRef.value / DAY_MS);

  seedAllCoreMegaForGuardian(harness.repositories, learnerId, todayDay);
  harness.services.spelling.savePrefs(learnerId, { mode: 'smart' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-shortcut-start', { mode: 'guardian' });

  const state = harness.store.getState().subjectUi.spelling;
  assert.equal(state.phase, 'session');
  assert.equal(state.session.mode, 'guardian');
});

test('U6 characterisation: module.js shortcut-start gate lets boss through when allWordsMega', () => {
  const storage = installMemoryStorage();
  const nowRef = { value: Date.UTC(2026, 0, 10) };
  const harness = createAppHarness({ storage, now: () => nowRef.value });
  const learnerId = harness.store.getState().learners.selectedId;
  const todayDay = Math.floor(nowRef.value / DAY_MS);

  seedAllCoreMegaForGuardian(harness.repositories, learnerId, todayDay);
  harness.services.spelling.savePrefs(learnerId, { mode: 'smart' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-shortcut-start', { mode: 'boss' });

  const state = harness.store.getState().subjectUi.spelling;
  assert.equal(state.phase, 'session');
  assert.equal(state.session.mode, 'boss');
  assert.equal(state.session.type, 'test');
});
