import test from 'node:test';
import assert from 'node:assert/strict';

import { createLocalAppController } from '../src/platform/app/create-local-app-controller.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { spellingModule } from '../src/subjects/spelling/module.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import { createAppHarness } from './helpers/app-harness.js';
import { renderReactControllerApp } from './helpers/react-app-ssr.js';

function typedFormData(value) {
  const formData = new FormData();
  formData.set('typed', value);
  return formData;
}

function escapingRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function finishCurrentRound(harness) {
  let guard = 0;
  while (harness.store.getState().subjectUi.spelling.phase === 'session' && guard < 12) {
    guard += 1;
    const ui = harness.store.getState().subjectUi.spelling;
    if (ui.awaitingAdvance) {
      harness.dispatch('spelling-continue');
      continue;
    }
    harness.dispatch('spelling-submit-form', {
      formData: typedFormData(ui.session.currentCard.word.word),
    });
  }
}

test('spelling session spike preserves hidden answer, replay, submit, and continue contract', () => {
  const harness = createAppHarness({ storage: installMemoryStorage() });
  const learnerId = harness.store.getState().learners.selectedId;

  harness.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '1' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-start');

  const state = harness.store.getState().subjectUi.spelling;
  const answer = state.session.currentCard.word.word;
  const questionHtml = harness.render();

  assert.equal(state.phase, 'session');
  assert.match(questionHtml, /name="typed"[^>]*data-autofocus="true"/);
  assert.match(questionHtml, /aria-label="Replay the dictated word"/);
  assert.match(questionHtml, /aria-label="Replay slowly"/);
  assert.match(questionHtml, /feedback-slot is-placeholder/);
  assert.match(questionHtml, /<kbd>Esc<\/kbd> replay/);
  assert.doesNotMatch(questionHtml, new RegExp(`>${escapingRegExp(answer)}<`, 'i'));

  harness.dispatch('spelling-replay');
  assert.equal(harness.tts.spoken.at(-1).word.word, answer);

  harness.dispatch('spelling-submit-form', { formData: typedFormData(answer) });
  const submitted = harness.store.getState().subjectUi.spelling;
  const submittedHtml = harness.render();

  assert.equal(submitted.awaitingAdvance, true);
  assert.match(submittedHtml, /Saved/);
  assert.match(submittedHtml, /data-action="spelling-continue"/);
  assert.doesNotMatch(submittedHtml, /feedback-slot is-placeholder/);

  finishCurrentRound(harness);
  assert.equal(harness.store.getState().subjectUi.spelling.phase, 'summary');
  assert.match(harness.render(), /summary-card/);
});

test('spelling replay uses a server audio cue when the prompt word is redacted', () => {
  const spoken = [];
  const audio = {
    subjectId: 'spelling',
    learnerId: 'learner-a',
    sessionId: 'server-session',
    promptToken: 'prompt-token-a',
    wordOnly: false,
  };
  const ui = {
    phase: 'session',
    audio,
    session: {
      currentCard: {
        prompt: { cloze: 'The birds sang ________ in the day.' },
      },
    },
  };

  const handled = spellingModule.handleAction('spelling-replay-slow', {
    appState: {
      learners: { selectedId: 'learner-a' },
      subjectUi: { spelling: ui },
    },
    data: {},
    store: {},
    service: {
      initState() { return ui; },
      getAudioCue() { return audio; },
    },
    tts: {
      speak(payload) { spoken.push(payload); },
    },
  });

  assert.equal(handled, true);
  assert.deepEqual(spoken, [{ ...audio, slow: true }]);
});

// ----- U8: persistenceWarning banner renders above the card --------------------
//
// Wires a happy-path session into the harness, then patches the spelling UI
// state to inject `feedback.persistenceWarning`. The scene must render a
// polite-live banner with the planned copy, and NOT render it on the
// happy-path where persistenceWarning is absent.

test('U8 session scene renders storage-failure banner when feedback.persistenceWarning is present', () => {
  const harness = createAppHarness({ storage: installMemoryStorage() });
  const learnerId = harness.store.getState().learners.selectedId;

  harness.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '1' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-start');

  // Happy path render: banner absent.
  const happyHtml = harness.render();
  assert.doesNotMatch(happyHtml, /spelling-persistence-warning/,
    'banner absent when feedback has no persistenceWarning');

  // Patch the spelling UI to inject a persistenceWarning on the current
  // feedback. This simulates a state where U8's service code has set the
  // warning after a storage throw.
  harness.store.patch((current) => ({
    subjectUi: {
      ...current.subjectUi,
      spelling: {
        ...current.subjectUi.spelling,
        feedback: {
          kind: 'info',
          headline: 'Guardian strong.',
          answer: 'possess',
          attemptedAnswer: '',
          body: '',
          footer: '',
          familyWords: [],
          persistenceWarning: { reason: 'storage-save-failed' },
        },
      },
    },
  }));

  const warningHtml = harness.render();
  assert.match(warningHtml, /spelling-persistence-warning/,
    'banner element renders when feedback.persistenceWarning is set');
  assert.match(warningHtml, /Progress could not be saved on this device\./,
    'banner copy matches the planned wording');
  assert.match(warningHtml, /role="status"/,
    'banner uses role="status" (ARIA live-polite)');
  assert.match(warningHtml, /aria-live="polite"/,
    'banner announces once via aria-live="polite"');
  assert.match(warningHtml, /data-testid="spelling-persistence-warning"/,
    'banner exposes a data-testid for downstream integration tests');
});

test('word-bank modal spike keeps drill isolated and Escape closes back to the word bank', () => {
  const harness = createAppHarness({ storage: installMemoryStorage() });
  const learnerId = harness.store.getState().learners.selectedId;
  const beforeScheduler = structuredClone(harness.repositories.subjectStates.read(learnerId, 'spelling').data || {});

  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-open-word-bank');
  harness.dispatch('spelling-word-detail-open', { slug: 'possess', value: 'drill' });

  assert.equal(harness.store.getState().subjectUi.spelling.phase, 'word-bank');
  assert.equal(harness.store.getState().transientUi.spellingWordDetailSlug, 'possess');
  assert.match(harness.render(), /Listen, then spell the missing word/);

  harness.dispatch('spelling-word-bank-drill-submit', {
    slug: 'possess',
    formData: typedFormData('not possess'),
  });
  assert.equal(harness.store.getState().transientUi.spellingWordBankDrillResult, 'incorrect');
  assert.deepEqual(harness.repositories.subjectStates.read(learnerId, 'spelling').data || {}, beforeScheduler);

  assert.equal(harness.keydown({
    key: 'Escape',
    target: { tagName: 'BUTTON' },
  }), true);
  assert.equal(harness.store.getState().transientUi.spellingWordDetailSlug, '');
  assert.equal(harness.store.getState().subjectUi.spelling.phase, 'word-bank');
});

test('TTS replay failures are contained by the subject runtime boundary', () => {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const spoken = [];
  let failReplay = false;
  const tts = {
    spoken,
    speak(payload) {
      if (failReplay) throw new Error('TTS unavailable');
      spoken.push(payload);
    },
    stop() {},
    warmup() {},
    subscribe() { return () => {}; },
    getSnapshot() { return { playingKind: null, error: failReplay ? 'TTS unavailable' : '' }; },
  };

  const controller = createLocalAppController({ repositories, tts });
  const learnerId = controller.store.getState().learners.selectedId;

  controller.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '1' });
  controller.dispatch('open-subject', { subjectId: 'spelling' });
  controller.dispatch('spelling-start');

  failReplay = true;
  controller.dispatch('spelling-replay');

  const entry = controller.runtimeBoundary.read({ learnerId, subjectId: 'spelling', tab: 'practice' });
  const html = renderReactControllerApp(controller);

  assert.equal(entry.phase, 'action');
  assert.equal(entry.action, 'spelling-replay');
  assert.match(entry.debugMessage, /TTS unavailable/);
  assert.match(html, /Spelling · Practice temporarily unavailable/);
  assert.match(html, /Try this tab again/);
});
