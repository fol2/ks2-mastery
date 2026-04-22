import test from 'node:test';
import assert from 'node:assert/strict';

import { createAppController } from '../src/platform/app/create-app-controller.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { renderSubjectScreen } from '../src/platform/ui/render.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import { createAppHarness } from './helpers/app-harness.js';

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

  finishCurrentRound(harness);
  assert.equal(harness.store.getState().subjectUi.spelling.phase, 'summary');
  assert.match(harness.render(), /summary-card/);
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

  const controller = createAppController({ repositories, tts });
  const learnerId = controller.store.getState().learners.selectedId;

  controller.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '1' });
  controller.dispatch('open-subject', { subjectId: 'spelling' });
  controller.dispatch('spelling-start');

  failReplay = true;
  controller.dispatch('spelling-replay');

  const entry = controller.runtimeBoundary.read({ learnerId, subjectId: 'spelling', tab: 'practice' });
  const html = renderSubjectScreen(controller.contextFor('spelling'));

  assert.equal(entry.phase, 'action');
  assert.equal(entry.action, 'spelling-replay');
  assert.match(entry.debugMessage, /TTS unavailable/);
  assert.match(html, /Spelling · Practice temporarily unavailable/);
  assert.match(html, /Try this tab again/);
});
