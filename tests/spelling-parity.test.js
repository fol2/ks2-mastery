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
import { WORD_BY_SLUG } from '../src/subjects/spelling/data/word-data.js';

function typedFormData(value) {
  const formData = new FormData();
  formData.set('typed', value);
  return formData;
}

const DAY_MS = 24 * 60 * 60 * 1000;

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
