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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractWordBankAggregateStats(html, title) {
  const match = String(html || '').match(new RegExp(
    `<section class="wb-card wb-card-compact">[\\s\\S]*?<h2 class="section-title">${escapeRegExp(title)}</h2>([\\s\\S]*?)</section>`,
  ));
  assert.ok(match, `Missing word-bank aggregate card: ${title}`);
  return Object.fromEntries([...match[1].matchAll(
    /<div class="stat-label">([^<]+)<\/div>\s*<div class="stat-value"[^>]*>([^<]+)<\/div>/g,
  )].map((entry) => [entry[1], entry[2]]));
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
  const learnerId = harness.store.getState().learners.selectedId;

  harness.dispatch('open-subject', { subjectId: 'spelling' });
  let html = harness.render();
  assert.match(html, /aria-label="Spelling pool"/);
  assert.match(html, /value="core"[^>]*>\s*<span>Core<\/span>/);
  assert.match(html, /value="extra"[^>]*>\s*<span>Extra<\/span>/);
  assert.doesNotMatch(html, />All<\/span>/);

  harness.dispatch('spelling-set-pref', { pref: 'yearFilter', value: 'extra' });
  html = harness.render();
  assert.match(html, /value="extra"[^>]*>\s*<span>Extra<\/span>/);
  assert.match(html, /ss-stat-label">Total spellings<\/div>\s*<div class="ss-stat-value"[^>]*>22<\/div>/);
  assert.match(html, /value="trouble"[^>]*disabled[^>]*>[\s\S]*Trouble Drill/);

  /* The Codex Journal redesign folds the old Analytics tab into a standalone
     word-bank scene reached via the "Browse the word bank" card on the setup
     dashboard. subject-set-tab no longer switches views — the setup scene
     itself owns this navigation. */
  harness.dispatch('spelling-open-word-bank');
  assert.equal(harness.store.getState().subjectUi.spelling.phase, 'word-bank');

  html = harness.render();
  assert.match(html, /Word bank progress/);
  assert.match(html, /Core spellings/);
  assert.match(html, /Expansion spelling pool/);
  assert.doesNotMatch(html, /All spellings/);
  assert.match(html, /name="spellingAnalyticsSearch"[^>]*autocomplete="off"/);
  // Category filters sit beside search and use transient UI only, so browsing
  // the bank never mutates the scheduled spelling session.
  assert.match(html, /data-action="spelling-analytics-year-filter"\s+data-value="y3-4"/);
  assert.match(html, /data-action="spelling-analytics-year-filter"\s+data-value="y5-6"/);
  assert.match(html, /data-action="spelling-analytics-year-filter"\s+data-value="extra"/);
  assert.match(html, /class="wb-chip-label">Years 3-4</);
  assert.match(html, /class="wb-chip-label">Years 5-6</);
  assert.match(html, /class="wb-chip-label">Extra</);
  assert.match(html, /data-action="spelling-analytics-status-filter"\s+data-value="due"/);
  assert.match(html, /data-action="spelling-analytics-status-filter"\s+data-value="weak"/);
  assert.match(html, /data-action="spelling-analytics-status-filter"\s+data-value="learning"/);
  assert.match(html, /data-action="spelling-analytics-status-filter"\s+data-value="secure"/);
  assert.match(html, /data-action="spelling-analytics-status-filter"\s+data-value="unseen"/);
  assert.match(html, /class="wb-status-swatch trouble"/);
  assert.doesNotMatch(html, /Word status colour legend/);
  assert.deepEqual(extractWordBankAggregateStats(html, 'Core statutory progress'), {
    Total: '213',
    Secure: '0',
    'Due now': '0',
    Trouble: '0',
    Learning: '0',
    Unseen: '213',
  });
  assert.deepEqual(extractWordBankAggregateStats(html, 'Lower KS2 spelling pool'), {
    Total: '109',
    Secure: '0',
    'Due now': '0',
    Trouble: '0',
    Learning: '0',
    Unseen: '109',
  });
  assert.deepEqual(extractWordBankAggregateStats(html, 'Upper KS2 spelling pool'), {
    Total: '104',
    Secure: '0',
    'Due now': '0',
    Trouble: '0',
    Learning: '0',
    Unseen: '104',
  });
  assert.deepEqual(extractWordBankAggregateStats(html, 'Expansion spelling pool'), {
    Total: '22',
    Secure: '0',
    'Due now': '0',
    Trouble: '0',
    Learning: '0',
    Unseen: '22',
  });
  // Word-bank entries render as legacy-style colour pills. The tooltip carries
  // the progress details, while clicking the pill opens the new drill modal.
  assert.match(html, /class="wb-word-pill new"/);
  assert.match(html, /data-action="spelling-word-detail-open"\s+data-slug="possess"\s+data-value="drill"/);
  assert.match(html, /title="possess[^"]*Family: possess\(ion\)[^"]*Next due: Unseen[^"]*Click to drill"/);
  assert.match(html, />accident</);
  assert.doesNotMatch(html, /wb-meta-label">Family/);

  const todayDay = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  harness.repositories.subjectStates.writeData(learnerId, 'spelling', {
    progress: {
      accommodate: {
        stage: 1,
        attempts: 1,
        correct: 1,
        wrong: 0,
        dueDay: todayDay - 1,
        lastDay: todayDay - 2,
        lastResult: true,
      },
      accident: {
        stage: 4,
        attempts: 4,
        correct: 4,
        wrong: 0,
        dueDay: todayDay + 14,
        lastDay: todayDay,
        lastResult: true,
      },
      actual: {
        stage: 1,
        attempts: 3,
        correct: 2,
        wrong: 1,
        dueDay: todayDay + 3,
        lastDay: todayDay,
        lastResult: true,
      },
    },
  });

  harness.dispatch('spelling-analytics-year-filter', { value: 'y5-6' });
  assert.equal(harness.store.getState().transientUi.spellingAnalyticsYearFilter, 'y5-6');
  html = harness.render();
  assert.match(html, />accommodate</);
  assert.doesNotMatch(html, />accident</);
  assert.match(html, /Years 5-6 selected — 104 of 235 words, 0 secure, 1 due today, 0 weak spots/);
  assert.match(html, /Showing 104 of 104 Years 5-6 spellings/);
  assert.deepEqual(extractWordBankAggregateStats(html, 'Upper KS2 spelling pool'), {
    Total: '104',
    Secure: '0',
    'Due now': '1',
    Trouble: '0',
    Learning: '0',
    Unseen: '103',
  });

  harness.dispatch('spelling-analytics-status-filter', { value: 'due' });
  assert.equal(harness.store.getState().transientUi.spellingAnalyticsStatusFilter, 'due');
  html = harness.render();
  assert.match(html, />accommodate</);
  assert.doesNotMatch(html, />accident</);
  assert.match(html, /Showing 1 of 104 Years 5-6 spellings/);

  harness.dispatch('spelling-analytics-status-filter', { value: 'all' });
  harness.dispatch('spelling-analytics-year-filter', { value: 'y3-4' });
  html = harness.render();
  assert.match(html, />accident</);
  assert.doesNotMatch(html, />accommodate</);
  assert.match(html, /Years 3-4 selected — 109 of 235 words, 1 secure, 0 due today, 0 weak spots/);
  assert.match(html, /Showing 109 of 109 Years 3-4 spellings/);
  assert.deepEqual(extractWordBankAggregateStats(html, 'Lower KS2 spelling pool'), {
    Total: '109',
    Secure: '1',
    'Due now': '0',
    Trouble: '0',
    Learning: '1',
    Unseen: '107',
  });

  harness.dispatch('spelling-analytics-status-filter', { value: 'secure' });
  html = harness.render();
  assert.match(html, />accident</);
  assert.doesNotMatch(html, />actual</);
  assert.match(html, /Showing 1 of 109 Years 3-4 spellings/);

  harness.dispatch('spelling-analytics-status-filter', { value: 'all' });
  harness.dispatch('spelling-analytics-year-filter', { value: 'extra' });
  html = harness.render();
  assert.match(html, />mollusc</);
  assert.doesNotMatch(html, />accident</);
  assert.match(html, /Extra selected — 22 of 235 words, 0 secure, 0 due today, 0 weak spots/);
  assert.match(html, /Showing 22 of 22 Extra spellings/);

  harness.dispatch('spelling-analytics-year-filter', { value: 'all' });

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
  assert.match(html, /title="possess[^"]*Next due: In 3 days[^"]*Click to drill"/);
  assert.doesNotMatch(html, />accident</);

  harness.dispatch('spelling-word-detail-open', { slug: 'possess', value: 'explain' });
  html = harness.render();
  assert.match(html, /What it means/);
  assert.match(html, /To possess something means to own it or have it/);
  assert.match(html, /Example sentence/);
  assert.match(html, /data-action="spelling-word-bank-word-replay" data-slug="possess"/);
  assert.doesNotMatch(html, /wb-modal-section-label">Family/);
  harness.dispatch('spelling-word-bank-word-replay', { slug: 'possess' });
  assert.deepEqual(harness.tts.spoken.at(-1), {
    word: 'possess',
    wordOnly: true,
  });
  harness.dispatch('spelling-word-detail-close');

  harness.dispatch('spelling-analytics-search', { value: '' });
  html = harness.render();
  assert.match(html, />accident</);

  harness.dispatch('spelling-analytics-search', { value: 'mollusc' });
  html = harness.render();
  assert.match(html, />mollusc</);
  assert.match(html, /title="mollusc[^"]*Extra[^"]*Click to drill"/);
  assert.match(html, /Showing 1 of 235 tracked spellings/);
  assert.doesNotMatch(html, />accident</);

  harness.dispatch('spelling-word-detail-open', { slug: 'mollusc', value: 'explain' });
  html = harness.render();
  assert.match(html, /Extra spelling/);
  assert.match(html, /A mollusc is a soft-bodied animal/);
  harness.dispatch('spelling-word-detail-close');

  harness.dispatch('spelling-word-detail-open', { slug: 'mollusc', value: 'drill' });
  const rejectedExtraDrill = new FormData();
  rejectedExtraDrill.set('typed', 'mollusk');
  harness.dispatch('spelling-word-bank-drill-submit', { slug: 'mollusc', formData: rejectedExtraDrill });
  assert.equal(harness.store.getState().transientUi.spellingWordBankDrillResult, 'incorrect');

  harness.dispatch('spelling-word-bank-drill-try-again', { slug: 'mollusc' });
  const acceptedExtraDrill = new FormData();
  acceptedExtraDrill.set('typed', 'mollusc');
  harness.dispatch('spelling-word-bank-drill-submit', { slug: 'mollusc', formData: acceptedExtraDrill });
  assert.equal(harness.store.getState().transientUi.spellingWordBankDrillResult, 'correct');
  harness.dispatch('spelling-word-detail-close');
  harness.dispatch('spelling-analytics-search', { value: '' });

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
