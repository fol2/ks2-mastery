import test from 'node:test';
import assert from 'node:assert/strict';

import { installMemoryStorage } from './helpers/memory-storage.js';
import { createAppHarness } from './helpers/app-harness.js';
import { exportPlatformSnapshot, importPlatformSnapshot } from '../src/platform/core/data-transfer.js';

function typedFormData(value) {
  const formData = new FormData();
  formData.set('typed', value);
  return formData;
}

function completeCurrentSpellingRound(harness) {
  while (harness.store.getState().subjectUi.spelling.phase === 'session') {
    const state = harness.store.getState().subjectUi.spelling;
    const answer = state.session.currentCard.word.word;
    harness.dispatch('spelling-submit-form', { formData: typedFormData(answer) });
    if (harness.store.getState().subjectUi.spelling.phase === 'session' && harness.store.getState().subjectUi.spelling.awaitingAdvance) {
      harness.dispatch('spelling-continue');
    }
  }
}

test('golden-path smoke covers dashboard to spelling session to summary and back', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;

  harness.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '1' });

  assert.match(harness.render(), /data-home-mount="true"/);

  harness.dispatch('open-subject', { subjectId: 'spelling' });
  assert.match(harness.render(), /Practice setup/);

  harness.dispatch('spelling-start');
  assert.equal(harness.store.getState().subjectUi.spelling.phase, 'session');
  assert.match(harness.render(), /Spell the word you hear|Spell the dictated word/);

  completeCurrentSpellingRound(harness);
  assert.equal(harness.store.getState().subjectUi.spelling.phase, 'summary');
  assert.match(harness.render(), /Session summary/);

  harness.dispatch('spelling-back');
  assert.equal(harness.store.getState().subjectUi.spelling.phase, 'dashboard');
  assert.match(harness.render(), /Practice setup/);
});

test('profile settings learner profile fields declare autofill behaviour explicitly', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  assert.doesNotMatch(harness.render(), /data-action="learner-save-form"/);

  harness.dispatch('open-profile-settings');
  const html = harness.render();

  assert.match(html, /Profile settings/);
  assert.match(html, /data-action="learner-select"/);
  assert.match(html, /data-action="learner-save-form"/);
  assert.match(html, /<input class="input" name="name"[^>]*autocomplete="off"/);
  assert.match(html, /<input class="input" type="number"[^>]*name="dailyMinutes"[^>]*autocomplete="off"/);
});

test('codex route mounts the React codex surface', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });

  harness.dispatch('open-codex');

  assert.equal(harness.store.getState().route.screen, 'codex');
  assert.match(harness.render(), /data-codex-mount="true"/);
});

test('golden-path smoke covers learner switch without losing the first learner session state', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerA = harness.store.getState().learners.selectedId;

  harness.services.spelling.savePrefs(learnerA, { mode: 'smart', roundLength: '1' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-start');
  const learnerASession = structuredClone(harness.store.getState().subjectUi.spelling);

  harness.dispatch('learner-create', { name: 'Learner B', yearGroup: 'Y4' });
  const learnerB = harness.store.getState().learners.selectedId;
  assert.notEqual(learnerB, learnerA);
  assert.equal(harness.store.getState().subjectUi.spelling.phase, 'dashboard');
  assert.match(harness.render(), /Learner B/);

  harness.dispatch('learner-select', { value: learnerA });
  assert.equal(harness.store.getState().learners.selectedId, learnerA);
  assert.deepEqual(harness.store.getState().subjectUi.spelling, learnerASession);
  assert.match(harness.render(), /Spell the word you hear|Spell the dictated word/);
});

test('golden-path smoke covers import/export restore for a live spelling session', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;

  harness.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '1' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-start');
  const exported = exportPlatformSnapshot(harness.repositories);
  const activeBefore = structuredClone(harness.store.getState().subjectUi.spelling);

  harness.store.clearAllProgress();
  importPlatformSnapshot(harness.repositories, exported);
  harness.runtimeBoundary.clearAll();
  harness.store.reloadFromRepositories();
  harness.dispatch('open-subject', { subjectId: 'spelling' });

  assert.deepEqual(harness.store.getState().subjectUi.spelling, activeBefore);
  assert.equal(harness.store.getState().subjectUi.spelling.phase, 'session');
  assert.match(harness.render(), /Spell the word you hear|Spell the dictated word/);
});

test('spelling analytics exposes searchable word-bank progress and practice-only launch', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('subject-set-tab', { tab: 'analytics' });

  let html = harness.render();
  assert.match(html, /Word bank progress/);
  assert.match(html, /name="spellingAnalyticsSearch"[^>]*autocomplete="off"/);
  assert.match(html, /class="chip new">New</);
  assert.match(html, /class="chip learning">Learning</);
  assert.match(html, /data-action="spelling-practice-single" data-slug="possess"/);
  assert.match(html, /class="word-progress-pill new"[^>]*data-action="spelling-practice-single"/);
  assert.match(html, />accident</);

  harness.dispatch('spelling-analytics-search', { value: 'possess' });
  assert.equal(harness.store.getState().transientUi.spellingAnalyticsWordSearch, 'possess');
  assert.equal(harness.store.getState().subjectUi.spelling.analyticsWordSearch, undefined);
  html = harness.render();
  assert.match(html, />possess</);
  assert.doesNotMatch(html, />accident</);

  harness.dispatch('spelling-analytics-search', { value: '' });
  html = harness.render();
  assert.match(html, />accident</);

  harness.dispatch('spelling-practice-single', { slug: 'possess' });
  assert.equal(harness.store.getState().subjectUi.spelling.phase, 'session');
  assert.equal(harness.store.getState().subjectUi.spelling.session.mode, 'single');
  assert.equal(harness.store.getState().subjectUi.spelling.session.practiceOnly, true);
  assert.equal(harness.store.getState().subjectUi.spelling.session.currentCard.word.slug, 'possess');
});

test('golden-path smoke covers placeholder-subject navigation across all shared tabs', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'reasoning' });
  assert.match(harness.render(), /Reasoning foundation/);

  harness.dispatch('subject-set-tab', { tab: 'analytics' });
  assert.match(harness.render(), /Reasoning analytics slot/);

  harness.dispatch('subject-set-tab', { tab: 'profiles' });
  const profilesHtml = harness.render();
  assert.match(profilesHtml, /Reasoning learner profile hooks/);
  assert.doesNotMatch(profilesHtml, /data-action="learner-save-form"/);

  harness.dispatch('subject-set-tab', { tab: 'settings' });
  assert.match(harness.render(), /Reasoning settings stub/);

  harness.dispatch('subject-set-tab', { tab: 'method' });
  assert.match(harness.render(), /How Reasoning should plug in/);
});
