import test from 'node:test';
import assert from 'node:assert/strict';

import { installMemoryStorage } from './helpers/memory-storage.js';
import { createAppHarness } from './helpers/app-harness.js';
import { createManualScheduler } from './helpers/manual-scheduler.js';
import { createLocalAppController } from '../src/platform/app/create-local-app-controller.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { createSpellingPersistence } from '../src/subjects/spelling/repository.js';
import { createSpellingService } from '../src/subjects/spelling/service.js';
import { resolveSpellingShortcut } from '../src/subjects/spelling/shortcuts.js';
import { spellingAutoAdvanceDelay } from '../src/subjects/spelling/auto-advance.js';
import { WORDS, WORD_BY_SLUG } from '../src/subjects/spelling/data/word-data.js';

function typedFormData(value) {
  const formData = new FormData();
  formData.set('typed', value);
  return formData;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// U5 helper — mirrors `seedAllCoreMega` in spelling-guardian.test.js so the
// parity test can drive a Guardian round without a cross-test import. Every
// core-pool word graduates to stage 4 with a 60-day dueDay cushion; the
// lastDay -7 means the word is comfortably past its Mega lockout.
function seedAllCoreMegaForGuardian(repositories, learnerId, todayDay) {
  const progress = Object.fromEntries(
    WORDS.filter((word) => word.spellingPool !== 'extra').map((word, index) => [word.slug, {
      stage: 4,
      attempts: 6 + (index % 4),
      correct: 5 + (index % 4),
      wrong: 1,
      dueDay: todayDay + 60,
      lastDay: todayDay - 7,
      lastResult: 'correct',
    }]),
  );
  repositories.subjectStates.writeData(learnerId, 'spelling', { progress });
}

function completeSingleWordRound(harness, answer = 'possess') {
  harness.dispatch('spelling-drill-single', { slug: 'possess' });
  while (harness.store.getState().subjectUi.spelling.phase === 'session') {
    harness.dispatch('spelling-submit-form', { formData: typedFormData(answer) });
    const ui = harness.store.getState().subjectUi.spelling;
    if (ui.phase === 'session' && ui.awaitingAdvance) {
      harness.dispatch('spelling-continue');
    }
  }
}

test('live spelling card keeps family hidden and restores legacy phase-specific labels', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;

  harness.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '1' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-start');

  const startHtml = harness.render();
  assert.doesNotMatch(startHtml, /Family:/);
  assert.match(startHtml, /Submit/);
  assert.match(startHtml, /placeholder="Type the spelling here"/);

  harness.dispatch('spelling-submit-form', { formData: typedFormData('wrong') });
  const retryHtml = harness.render();
  assert.match(retryHtml, /Try again/);
  assert.match(retryHtml, /You wrote &quot;wrong&quot;\./);
  assert.match(retryHtml, /placeholder="Try once more from memory"/);

  harness.dispatch('spelling-submit-form', { formData: typedFormData('still wrong') });
  const correctionHtml = harness.render();
  assert.match(correctionHtml, /Lock it in/);
  assert.match(correctionHtml, /You wrote &quot;still wrong&quot;\./);
  assert.match(correctionHtml, /placeholder="Type the correct spelling once"/);
});

test('SATs spelling card keeps audio-only context and save-and-next wording', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;

  harness.services.spelling.savePrefs(learnerId, { mode: 'test' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-start');

  const html = harness.render();
  assert.match(html, /Save and next/);
  assert.match(html, /SATs mode uses audio only\. Press Replay to hear the dictation again\./);
  assert.match(html, /placeholder="Type the spelling and move on"/);
});

test('SATs setup ignores a persisted Extra filter and stays core-only', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;

  harness.services.spelling.savePrefs(learnerId, { mode: 'test', yearFilter: 'extra' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-start');

  const session = harness.store.getState().subjectUi.spelling.session;
  assert.equal(session.type, 'test');
  assert.equal(session.uniqueWords.length, 20);
  assert.ok(session.uniqueWords.every((slug) => WORD_BY_SLUG[slug].spellingPool === 'core'));
  assert.equal(session.uniqueWords.includes('mollusc'), false);
});

test('rendered spelling prompt stays aligned with the dictated sentence', () => {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const service = createSpellingService({
    repository: createSpellingPersistence({ repositories }),
  });

  const transition = service.startSession('learner-a', {
    mode: 'single',
    words: ['imagine'],
    length: 1,
  });
  const renderedState = service.initState(transition.state, 'learner-a');

  assert.equal(renderedState.session.currentPrompt.sentence, transition.audio.sentence);
  assert.equal(renderedState.session.currentCard.prompt.sentence, transition.audio.sentence);
});

test('ending a live spelling session asks before abandoning it', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;
  const originalConfirm = globalThis.confirm;

  try {
    harness.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '1' });
    harness.dispatch('open-subject', { subjectId: 'spelling' });
    harness.dispatch('spelling-start');
    assert.equal(harness.store.getState().subjectUi.spelling.phase, 'session');

    globalThis.confirm = () => false;
    harness.dispatch('spelling-end-early');
    assert.equal(harness.store.getState().subjectUi.spelling.phase, 'session');

    globalThis.confirm = () => true;
    harness.dispatch('spelling-end-early');
    assert.equal(harness.store.getState().subjectUi.spelling.phase, 'dashboard');
  } finally {
    globalThis.confirm = originalConfirm;
  }
});

test('monster caught celebrations wait until the live spelling session ends', () => {
  const storage = installMemoryStorage();
  const nowRef = { value: Date.UTC(2026, 0, 1) };
  const harness = createAppHarness({ storage, now: () => nowRef.value });
  const originalConfirm = globalThis.confirm;

  try {
    harness.dispatch('open-subject', { subjectId: 'spelling' });

    for (let round = 0; round < 3; round += 1) {
      completeSingleWordRound(harness);
      nowRef.value += DAY_MS * 2;
    }

    harness.dispatch('spelling-drill-single', { slug: 'possess' });
    harness.dispatch('spelling-submit-form', { formData: typedFormData('possess') });

    const liveState = harness.store.getState();
    assert.equal(liveState.subjectUi.spelling.phase, 'session');
    assert.equal(liveState.subjectUi.spelling.awaitingAdvance, true);
    assert.ok(liveState.toasts.some((event) => event.type === 'reward.monster' && event.kind === 'caught'));
    assert.doesNotMatch(harness.render(), /monster-celebration-overlay/);

    globalThis.confirm = () => true;
    harness.dispatch('spelling-end-early');

    const endedHtml = harness.render();
    assert.match(endedHtml, /monster-celebration-overlay/);
    assert.match(endedHtml, /You caught a new friend!/);
    assert.match(endedHtml, /Inklet/);

    harness.dispatch('monster-celebration-dismiss');
    assert.doesNotMatch(harness.render(), /monster-celebration-overlay/);
  } finally {
    globalThis.confirm = originalConfirm;
  }
});

test('shortcut quick-start keeps the old confirm-before-switching behaviour', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;
  const originalConfirm = globalThis.confirm;

  try {
    harness.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '1' });
    harness.dispatch('open-subject', { subjectId: 'spelling' });
    harness.dispatch('spelling-start');
    const before = structuredClone(harness.store.getState().subjectUi.spelling.session);

    globalThis.confirm = () => false;
    harness.dispatch('spelling-shortcut-start', { mode: 'test' });
    assert.equal(harness.store.getState().subjectUi.spelling.session.id, before.id);
    assert.equal(harness.store.getState().subjectUi.spelling.session.type, 'learning');

    globalThis.confirm = () => true;
    harness.dispatch('spelling-shortcut-start', { mode: 'test' });
    assert.equal(harness.store.getState().subjectUi.spelling.session.type, 'test');
  } finally {
    globalThis.confirm = originalConfirm;
  }
});

test('shortcut resolver matches preserved spelling shortcuts and ignores unrelated typing', () => {
  const appState = {
    route: { subjectId: 'spelling', tab: 'practice' },
    subjectUi: {
      spelling: {
        phase: 'session',
        awaitingAdvance: false,
        session: { type: 'learning', phase: 'question' },
      },
    },
  };

  assert.deepEqual(resolveSpellingShortcut({
    key: 'Escape',
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    target: { tagName: 'INPUT', name: 'typed' },
  }, appState), {
    action: 'spelling-replay',
    preventDefault: true,
  });

  assert.deepEqual(resolveSpellingShortcut({
    key: 'Escape',
    shiftKey: true,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    target: { tagName: 'INPUT', name: 'typed' },
  }, appState), {
    action: 'spelling-replay-slow',
    preventDefault: true,
  });

  assert.deepEqual(resolveSpellingShortcut({
    key: 's',
    altKey: true,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    target: { tagName: 'INPUT', name: 'typed' },
  }, appState), {
    action: 'spelling-skip',
    preventDefault: true,
  });

  assert.deepEqual(resolveSpellingShortcut({
    key: '1',
    altKey: true,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    target: { tagName: 'DIV' },
  }, appState), {
    action: 'spelling-shortcut-start',
    data: { mode: 'smart' },
    preventDefault: true,
  });

  assert.equal(resolveSpellingShortcut({
    key: '1',
    altKey: true,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    target: { tagName: 'INPUT', name: 'search' },
  }, appState), null);

  assert.deepEqual(resolveSpellingShortcut({
    key: 'k',
    altKey: true,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    target: { tagName: 'BODY' },
  }, appState), {
    focusSelector: 'input[name="typed"]',
    preventDefault: true,
  });
});

test('legacy auto-advance delay is preserved for learning and SATs saves', () => {
  assert.equal(spellingAutoAdvanceDelay({
    phase: 'session',
    awaitingAdvance: true,
    session: { type: 'learning' },
  }), 500);

  assert.equal(spellingAutoAdvanceDelay({
    phase: 'session',
    awaitingAdvance: true,
    session: { type: 'test' },
  }), 320);

  assert.equal(spellingAutoAdvanceDelay({
    phase: 'session',
    awaitingAdvance: true,
    error: 'Command failed',
    session: { type: 'learning' },
  }), null);
});

test('auto-advance can delegate continue through an injected command boundary', () => {
  const storage = installMemoryStorage();
  const scheduler = createManualScheduler();
  const repositories = createLocalPlatformRepositories({ storage });
  let autoContinueCalls = 0;
  const controller = createLocalAppController({
    repositories,
    scheduler,
    autoAdvanceDispatchContinue: () => {
      autoContinueCalls += 1;
      return true;
    },
  });
  const learnerId = controller.store.getState().learners.selectedId;

  controller.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '1' });
  controller.dispatch('open-subject', { subjectId: 'spelling' });
  controller.dispatch('spelling-start');

  const answer = controller.store.getState().subjectUi.spelling.session.currentCard.word.word;
  controller.dispatch('spelling-submit-form', { formData: typedFormData(answer) });
  controller.services.spelling.continueSession = undefined;

  assert.equal(controller.store.getState().subjectUi.spelling.awaitingAdvance, true);
  assert.equal(scheduler.count(), 1);

  scheduler.flushAll();

  assert.equal(autoContinueCalls, 1);
  assert.equal(controller.runtimeBoundary.list().length, 0);
  assert.equal(controller.store.getState().subjectUi.spelling.awaitingAdvance, true);
});

test('legacy auto-advance can move a one-word learning round on without a manual continue click', () => {
  const storage = installMemoryStorage();
  const scheduler = createManualScheduler();
  const harness = createAppHarness({ storage, scheduler });
  const learnerId = harness.store.getState().learners.selectedId;

  harness.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '1' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-start');

  const firstSlug = harness.store.getState().subjectUi.spelling.session.currentCard.slug;
  const answer = harness.store.getState().subjectUi.spelling.session.currentCard.word.word;
  harness.dispatch('spelling-submit-form', { formData: typedFormData(answer) });

  assert.equal(harness.store.getState().subjectUi.spelling.awaitingAdvance, true);
  assert.equal(scheduler.count(), 1);

  scheduler.flushAll();

  assert.equal(harness.store.getState().subjectUi.spelling.phase, 'session');
  assert.equal(harness.store.getState().subjectUi.spelling.awaitingAdvance, false);
  assert.equal(harness.store.getState().subjectUi.spelling.session.currentCard.slug, firstSlug);
});

test('U4 parity: non-Guardian learning skip still renders "Skip for now" button and legacy feedback', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;

  harness.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '5' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-start');

  // Non-Guardian learning session: label is "Skip for now".
  const startHtml = harness.render();
  assert.match(startHtml, /Skip for now/);
  assert.doesNotMatch(startHtml, /I don.t know/, 'non-Guardian session never shows "I don\'t know"');

  // Clicking skip uses legacy feedback text.
  harness.dispatch('spelling-skip');
  const afterSkipHtml = harness.render();
  assert.match(afterSkipHtml, /Skipped for now\./);
});

test('U4 parity: Guardian session renders "I don\'t know" button label', () => {
  const storage = installMemoryStorage();
  const nowRef = { value: Date.UTC(2026, 0, 10) };
  const harness = createAppHarness({ storage, now: () => nowRef.value });
  const learnerId = harness.store.getState().learners.selectedId;

  // Seed all-core-mega via the subjectStates repository.
  const today = Math.floor(nowRef.value / DAY_MS);
  const progress = Object.fromEntries(
    Object.keys(WORD_BY_SLUG)
      .filter((slug) => WORD_BY_SLUG[slug].spellingPool !== 'extra')
      .map((slug) => [slug, {
        stage: 4,
        attempts: 6,
        correct: 5,
        wrong: 1,
        dueDay: today + 60,
        lastDay: today - 7,
        lastResult: 'correct',
      }]),
  );
  harness.repositories.subjectStates.writeData(learnerId, 'spelling', { progress });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-shortcut-start', { mode: 'guardian' });

  const html = harness.render();
  assert.equal(harness.store.getState().subjectUi.spelling.session.mode, 'guardian');
  // React escapes the apostrophe to &#x27; in rendered HTML.
  assert.match(html, /I don&#x27;t know/);
  assert.doesNotMatch(html, /Skip for now/);
});

// U3 characterisation: legacy Smart Review summary -> spelling-drill-all dispatch
// must remain byte-identical — `mode: 'trouble'`, `practiceOnly: false`. This
// test exists as a regression guard because U3 adds a Guardian branch to the
// same handler. If a future refactor accidentally sets practiceOnly=true on
// non-Guardian origins, this fails loudly.
test('legacy Smart Review drill-all path starts mode=trouble with practiceOnly unset', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;
  harness.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '1' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-start');

  // Cycle the word through retry → correction (two wrong + one copy of the
  // real answer). Legacy learning phases require a successful correction
  // before the round can finalise, so we never loop indefinitely.
  const realAnswer = harness.store.getState().subjectUi.spelling.session.currentCard.word.word;
  harness.dispatch('spelling-submit-form', { formData: typedFormData('zzzwrong-question') });
  harness.dispatch('spelling-submit-form', { formData: typedFormData('zzzwrong-retry') });
  harness.dispatch('spelling-submit-form', { formData: typedFormData(realAnswer) });
  // Drain any follow-up advance steps until we land on the summary phase.
  for (let guard = 0; guard < 20; guard += 1) {
    const ui = harness.store.getState().subjectUi.spelling;
    if (ui.phase !== 'session') break;
    if (ui.awaitingAdvance) {
      harness.dispatch('spelling-continue');
      continue;
    }
    harness.dispatch('spelling-submit-form', { formData: typedFormData(ui.session.currentCard.word.word) });
  }

  const summary = harness.store.getState().subjectUi.spelling.summary;
  assert.equal(summary.mode, 'smart', 'sanity: Smart Review origin summary');
  assert.ok(summary.mistakes.length >= 1, 'at least one mistake to drill');

  harness.dispatch('spelling-drill-all');

  const session = harness.store.getState().subjectUi.spelling.session;
  assert.equal(session.mode, 'trouble', 'legacy drill-all stays on mode=trouble');
  // practiceOnly is normalised to false by default inside startSession — the
  // assertion is that it is *not true*, preserving legacy demotion behaviour.
  assert.notEqual(session.practiceOnly, true, 'legacy Smart Review drill-all must not set practiceOnly=true');
});

test('restored completed spelling card caps progress and resumes auto-advance', () => {
  const storage = installMemoryStorage();
  const scheduler = createManualScheduler();
  const harness = createAppHarness({ storage, scheduler });
  const learnerId = harness.store.getState().learners.selectedId;

  harness.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '1' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-start');

  const answer = harness.store.getState().subjectUi.spelling.session.currentCard.word.word;
  harness.dispatch('spelling-submit-form', { formData: typedFormData(answer) });
  scheduler.flushAll();
  harness.dispatch('spelling-submit-form', { formData: typedFormData(answer) });

  assert.equal(harness.store.getState().subjectUi.spelling.phase, 'session');
  assert.equal(harness.store.getState().subjectUi.spelling.awaitingAdvance, true);

  const restoredScheduler = createManualScheduler();
  const restoredHarness = createAppHarness({ storage, scheduler: restoredScheduler });
  restoredHarness.dispatch('open-subject', { subjectId: 'spelling' });

  const html = restoredHarness.render();
  assert.match(html, /1 of 1/);
  assert.doesNotMatch(html, /2 of 1/);
  assert.equal(restoredScheduler.count(), 1);

  restoredScheduler.flushAll();

  assert.equal(restoredHarness.store.getState().subjectUi.spelling.phase, 'summary');
});

// ----- U5: Guardian clean-retrieval UX (R5) -----------------------------------
//
// These assertions drive the full SSR path through `harness.render()` so we
// catch integration-level regressions (prefs → scene prop drilling → JSX).
// Matching logic:
//   - `prefs.showCloze === true` + guardian mode → no active cloze in HTML.
//   - Guardian info chip appears verbatim.
//   - Guardian context note appears verbatim.
//   - SATs-only copy must not leak into a Guardian session.

test('Guardian session hides the cloze hint even when showCloze is true (R5)', () => {
  const storage = installMemoryStorage();
  const nowRef = { value: Date.UTC(2026, 0, 10) };
  const harness = createAppHarness({ storage, now: () => nowRef.value });
  const learnerId = harness.store.getState().learners.selectedId;
  const todayDay = Math.floor(nowRef.value / DAY_MS);

  seedAllCoreMegaForGuardian(harness.repositories, learnerId, todayDay);
  harness.services.spelling.savePrefs(learnerId, { mode: 'smart', showCloze: true });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-shortcut-start', { mode: 'guardian' });

  const state = harness.store.getState().subjectUi.spelling;
  assert.equal(state.phase, 'session');
  assert.equal(state.session.mode, 'guardian');

  const html = harness.render();
  // Active cloze renders as `<div class="cloze">` with no "muted" modifier;
  // the hidden/muted render uses `cloze muted`. A Guardian round must never
  // show the active form.
  assert.doesNotMatch(html, /<div class="cloze"(?!\s+muted)/, 'no active cloze element in Guardian mode');
});

test('Guardian session renders the "Guardian" info chip (R5)', () => {
  const storage = installMemoryStorage();
  const nowRef = { value: Date.UTC(2026, 0, 10) };
  const harness = createAppHarness({ storage, now: () => nowRef.value });
  const learnerId = harness.store.getState().learners.selectedId;
  const todayDay = Math.floor(nowRef.value / DAY_MS);

  seedAllCoreMegaForGuardian(harness.repositories, learnerId, todayDay);
  harness.services.spelling.savePrefs(learnerId, { mode: 'smart' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-shortcut-start', { mode: 'guardian' });

  const html = harness.render();
  assert.match(html, /Guardian/);
});

test('Guardian session renders the clean-retrieval context note and no SATs copy (R5)', () => {
  const storage = installMemoryStorage();
  const nowRef = { value: Date.UTC(2026, 0, 10) };
  const harness = createAppHarness({ storage, now: () => nowRef.value });
  const learnerId = harness.store.getState().learners.selectedId;
  const todayDay = Math.floor(nowRef.value / DAY_MS);

  seedAllCoreMegaForGuardian(harness.repositories, learnerId, todayDay);
  harness.services.spelling.savePrefs(learnerId, { mode: 'smart', showCloze: false });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-shortcut-start', { mode: 'guardian' });

  const html = harness.render();
  assert.match(html, /Spell the word from memory\. One clean attempt\./);
  // SATs-only copy must not leak.
  assert.doesNotMatch(html, /SATs mode uses audio only/);
  assert.doesNotMatch(html, /SATs one-shot/);
});

test('Smart Review session still shows cloze when showCloze=true (U5 parity guard)', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;

  harness.services.spelling.savePrefs(learnerId, { mode: 'smart', showCloze: true, roundLength: '1' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-start');

  const html = harness.render();
  // Smart Review with showCloze=true must still render an active cloze.
  assert.match(html, /<div class="cloze">/);
  // No guardian copy and no Boss copy should leak into a smart-review round.
  assert.doesNotMatch(html, /Spell the word from memory\. One clean attempt\./);
  assert.doesNotMatch(html, /Boss round/);
});

test('Smart Review with showCloze=false still shows the default context note (U5 parity guard)', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;

  harness.services.spelling.savePrefs(learnerId, { mode: 'smart', showCloze: false, roundLength: '1' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-start');

  const html = harness.render();
  assert.match(html, /Family hidden during live recall\./);
  assert.doesNotMatch(html, /Spell the word from memory\. One clean attempt\./);
});

test('SATs Test session does not leak Guardian copy after U5 (parity guard)', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;

  harness.services.spelling.savePrefs(learnerId, { mode: 'test' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-start');

  const html = harness.render();
  assert.match(html, /SATs mode uses audio only\. Press Replay to hear the dictation again\./);
  assert.doesNotMatch(html, /Spell the word from memory\. One clean attempt\./);
  assert.doesNotMatch(html, /Boss round\. Mega words only\./);
});

// Trouble Drill pure-function parity. Integration-level trouble sessions
// depend on the learner having a due backlog, which is brittle to seed in
// a byte-for-byte parity test. We assert the pure session-ui helpers
// instead so regressions in branch ordering — e.g. an accidental Guardian
// chip leaking into trouble — are caught reliably.
test('Trouble Drill pure session-ui helpers: byte-for-byte unchanged under U5', async () => {
  const {
    spellingSessionContextNote,
    spellingSessionInfoChips,
    spellingSessionInputPlaceholder,
    spellingSessionProgressLabel,
    spellingSessionSubmitLabel,
    spellingSessionSkipLabel,
  } = await import('../src/subjects/spelling/session-ui.js');
  const trouble = {
    type: 'learning',
    mode: 'trouble',
    phase: 'question',
    practiceOnly: false,
    currentCard: { word: { yearLabel: 'Y5-6' } },
  };
  assert.equal(spellingSessionSubmitLabel(trouble), 'Submit');
  assert.equal(spellingSessionInputPlaceholder(trouble), 'Type the spelling here');
  assert.equal(spellingSessionContextNote(trouble), 'Family hidden during live recall.');
  assert.equal(spellingSessionProgressLabel(trouble), 'Phase: question');
  assert.deepEqual(spellingSessionInfoChips(trouble), ['Y5-6']);
  assert.equal(spellingSessionSkipLabel(trouble), 'Skip for now');

  // Practice-only trouble drill (U3) — chip row + progress label unchanged.
  const practiceTrouble = { ...trouble, practiceOnly: true };
  assert.equal(spellingSessionProgressLabel(practiceTrouble), 'Practice only');
  assert.deepEqual(spellingSessionInfoChips(practiceTrouble), ['Y5-6', 'Practice only']);
});

// U9: Boss Dictation shortcut-start gate parity. The plan guards the module-
// level gate (mode === 'boss' → requires allWordsMega === true) against a
// regression where a Smart Review fallback fires for non-graduated learners.
// The gate mirrors the Guardian (Alt+4) gate already in place; this test
// guards the Boss branch at the same call site via the local harness.
test('spelling-shortcut-start with mode:boss when allWordsMega=false is a gate-level no-op', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;

  harness.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '5' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  const beforePhase = harness.store.getState().subjectUi.spelling.phase;

  harness.dispatch('spelling-shortcut-start', { mode: 'boss' });

  const after = harness.store.getState().subjectUi.spelling;
  // Not graduated → the gate must short-circuit; no Boss session should have
  // been started. Phase remains at whatever it was (dashboard or similar).
  assert.equal(after.phase, beforePhase, 'Boss shortcut must not start a session without allWordsMega');
  assert.equal(after.session, null, 'no Boss session allocated');
});

test('spelling-shortcut-start with mode:boss when allWordsMega=true starts a Boss session', () => {
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
  assert.equal(state.session.label, 'Boss Dictation');
});
