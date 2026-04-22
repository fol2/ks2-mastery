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
  assert.match(harness.render(), /Round setup/);

  harness.dispatch('spelling-start');
  assert.equal(harness.store.getState().subjectUi.spelling.phase, 'session');
  assert.match(harness.render(), /Spell the word you hear|Spell the dictated word/);

  completeCurrentSpellingRound(harness);
  assert.equal(harness.store.getState().subjectUi.spelling.phase, 'summary');
  assert.match(harness.render(), /summary-card/);

  harness.dispatch('spelling-back');
  assert.equal(harness.store.getState().subjectUi.spelling.phase, 'dashboard');
  assert.match(harness.render(), /Round setup/);
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

test('spelling word bank opens from setup and exposes searchable progress with drill modal', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'spelling' });
  /* The Codex Journal redesign folds the old Analytics tab into a standalone
     word-bank scene reached via the "Browse the word bank" card on the setup
     dashboard. subject-set-tab no longer switches views — the setup scene
     itself owns this navigation. */
  harness.dispatch('spelling-open-word-bank');
  assert.equal(harness.store.getState().subjectUi.spelling.phase, 'word-bank');

  let html = harness.render();
  assert.match(html, /Word bank progress/);
  assert.match(html, /name="spellingAnalyticsSearch"[^>]*autocomplete="off"/);
  // Filter tabs — the legend chips have been replaced by interactive
  // spelling-analytics-status-filter tabs. The status value stays on the wire
  // in v1 vocabulary ("unseen" / "learning" / "weak"), and each tab carries a
  // .wb-chip-label span with the visible label. Attribute regexes use `\s+`
  // because the template emits attrs on separate indented lines for legibility.
  assert.match(html, /data-action="spelling-analytics-status-filter"\s+data-value="unseen"/);
  assert.match(html, /data-action="spelling-analytics-status-filter"\s+data-value="learning"/);
  assert.match(html, /class="wb-chip-label">Unseen</);
  assert.match(html, /class="wb-chip-label">Learning</);
  // The word row opens the detail modal in explain mode; the inner arrow chip
  // jumps to drill mode. Both buttons share the same data-action.
  assert.match(html, /data-action="spelling-word-detail-open" data-slug="possess" data-value="explain"/);
  assert.match(html, /data-action="spelling-word-detail-open" data-slug="possess" data-value="drill"/);
  assert.match(html, />accident</);
  assert.match(html, /wb-meta-label">Next due<\/span><span class="wb-meta-value">Unseen/);
  assert.doesNotMatch(html, /wb-meta-label">Family/);

  const learnerId = harness.store.getState().learners.selectedId;
  const todayDay = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  harness.repositories.subjectStates.writeData(learnerId, 'spelling', {
    progress: {
      possess: {
        stage: 1,
        attempts: 1,
        correct: 1,
        wrong: 0,
        dueDay: todayDay + 3,
        lastDay: todayDay,
        lastResult: true,
      },
    },
  });

  harness.dispatch('spelling-analytics-search', { value: 'possess' });
  assert.equal(harness.store.getState().transientUi.spellingAnalyticsWordSearch, 'possess');
  assert.equal(harness.store.getState().subjectUi.spelling.analyticsWordSearch, undefined);
  html = harness.render();
  assert.match(html, />possess</);
  assert.match(html, /wb-meta-label">Next due<\/span><span class="wb-meta-value">In 3 days/);
  assert.doesNotMatch(html, />accident</);

  harness.dispatch('spelling-word-detail-open', { slug: 'possess', value: 'explain' });
  html = harness.render();
  assert.match(html, /What it means/);
  assert.match(html, /To possess something means to own it or have it/);
  assert.match(html, /Example sentence/);
  assert.doesNotMatch(html, /wb-modal-section-label">Family/);
  harness.dispatch('spelling-word-detail-close');

  harness.dispatch('spelling-analytics-search', { value: '' });
  html = harness.render();
  assert.match(html, />accident</);

  /* Opening a word in drill mode stays in the word-bank phase, sets the modal
     state on transientUi, and never mutates the session scheduler. The drill
     is fully self-contained: a local string check against the target word. */
  harness.dispatch('spelling-word-detail-open', { slug: 'possess', value: 'drill' });
  assert.equal(harness.store.getState().subjectUi.spelling.phase, 'word-bank');
  assert.equal(harness.store.getState().transientUi.spellingWordDetailSlug, 'possess');
  assert.equal(harness.store.getState().transientUi.spellingWordDetailMode, 'drill');
  html = harness.render();
  assert.match(html, /class="wb-modal"/);
  assert.match(html, /data-action="spelling-word-bank-drill-submit"/);

  const drillForm = new FormData();
  drillForm.set('typed', 'possess');
  harness.dispatch('spelling-word-bank-drill-submit', { slug: 'possess', formData: drillForm });
  assert.equal(harness.store.getState().transientUi.spellingWordBankDrillResult, 'correct');
  assert.equal(harness.store.getState().subjectUi.spelling.phase, 'word-bank');
  assert.equal(harness.store.getState().subjectUi.spelling.session, null);
});

test('golden-path smoke covers placeholder-subject navigation through the setup scene', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'reasoning' });
  /* Placeholders render the same "future subject foundation" card for every
     phase because they have no engine yet — the subject shell is exercised
     by the fact that opening succeeds without a runtime error. */
  const html = harness.render();
  assert.match(html, /Reasoning foundation/);
  assert.match(html, /Extension points already reserved/);
});
