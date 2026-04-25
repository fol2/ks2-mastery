import test from 'node:test';
import assert from 'node:assert/strict';

import { installMemoryStorage } from './helpers/memory-storage.js';
import { SUBJECTS } from '../src/platform/core/subject-registry.js';
import { createStore } from '../src/platform/core/store.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import {
  applyOptimisticSpellingPrefs,
  mergePendingOptimisticSpellingPrefsForLearner,
  optimisticSpellingPrefsPatchForAction,
} from '../src/subjects/spelling/optimistic-prefs.js';

test('spelling preference actions resolve the optimistic patch immediately', () => {
  const prefs = {
    mode: 'smart',
    yearFilter: 'core',
    roundLength: '10',
    showCloze: true,
    autoSpeak: true,
    extraWordFamilies: false,
  };

  assert.deepEqual(
    optimisticSpellingPrefsPatchForAction('spelling-set-pref', { pref: 'yearFilter', value: 'extra' }, prefs),
    { yearFilter: 'extra' },
  );
  assert.deepEqual(
    optimisticSpellingPrefsPatchForAction('spelling-toggle-pref', { pref: 'autoSpeak' }, prefs),
    { autoSpeak: false },
  );
  assert.deepEqual(
    optimisticSpellingPrefsPatchForAction('spelling-set-mode', { value: 'test' }, prefs),
    { mode: 'test', roundLength: 20 },
  );
});

test('optimistic spelling prefs leave completed flows on setup without waiting for the Worker', () => {
  const next = applyOptimisticSpellingPrefs({
    subjectId: 'spelling',
    learnerId: 'learner-a',
    version: 2,
    phase: 'summary',
    session: null,
    feedback: { kind: 'success', headline: 'Done' },
    summary: { mode: 'smart', totalWords: 10 },
    awaitingAdvance: true,
    audio: { promptToken: 'old-cue' },
    prefs: {
      mode: 'smart',
      yearFilter: 'core',
      roundLength: '10',
      autoSpeak: true,
    },
    stats: { core: { total: 10 } },
  }, { yearFilter: 'extra' });

  assert.equal(next.phase, 'dashboard');
  assert.equal(next.feedback, null);
  assert.equal(next.summary, null);
  assert.equal(next.awaitingAdvance, false);
  assert.equal(next.audio, null);
  assert.equal(next.prefs.yearFilter, 'extra');
  assert.deepEqual(next.stats, { core: { total: 10 } });
});

test('optimistic spelling prefs do not tear down an active session', () => {
  const next = applyOptimisticSpellingPrefs({
    phase: 'session',
    session: { id: 'session-a' },
    feedback: null,
    prefs: {
      mode: 'smart',
      yearFilter: 'core',
      roundLength: '10',
      showCloze: true,
    },
  }, { showCloze: false });

  assert.equal(next.phase, 'session');
  assert.deepEqual(next.session, { id: 'session-a' });
  assert.equal(next.prefs.showCloze, false);
});

test('pending optimistic spelling prefs are scoped to the selected learner', () => {
  const pending = [
    { id: 1, learnerId: 'learner-a', patch: { autoSpeak: false } },
    { id: 2, learnerId: 'learner-b', patch: { showCloze: false, yearFilter: 'extra' } },
    { id: 3, learnerId: 'learner-a', patch: { roundLength: '40' } },
  ];

  assert.deepEqual(
    mergePendingOptimisticSpellingPrefsForLearner(pending, 'learner-a'),
    { autoSpeak: false, roundLength: '40' },
  );
  assert.deepEqual(
    mergePendingOptimisticSpellingPrefsForLearner(pending, 'learner-b'),
    { showCloze: false, yearFilter: 'extra' },
  );
});

test('spelling toggles can be reversed before the first save resolves', () => {
  const prefs = {
    mode: 'smart',
    yearFilter: 'core',
    roundLength: '10',
    autoSpeak: true,
  };

  const firstPatch = optimisticSpellingPrefsPatchForAction('spelling-toggle-pref', { pref: 'autoSpeak' }, prefs);
  const visible = applyOptimisticSpellingPrefs({ phase: 'dashboard', prefs }, firstPatch).prefs;
  const secondPatch = optimisticSpellingPrefsPatchForAction('spelling-toggle-pref', { pref: 'autoSpeak' }, visible);

  assert.deepEqual(firstPatch, { autoSpeak: false });
  assert.deepEqual(secondPatch, { autoSpeak: true });
});

test('local spelling errors do not cache pending optimistic prefs', () => {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const store = createStore(SUBJECTS, { repositories, cacheSubjectUiWrites: true });
  const learnerId = store.getState().learners.selectedId;

  store.updateSubjectUi('spelling', {
    phase: 'dashboard',
    error: '',
    prefs: {
      mode: 'smart',
      yearFilter: 'core',
      roundLength: '10',
      autoSpeak: true,
    },
  });

  store.patch((current) => ({
    subjectUi: {
      ...current.subjectUi,
      spelling: applyOptimisticSpellingPrefs(current.subjectUi.spelling, { autoSpeak: false }),
    },
  }));
  store.patch((current) => ({
    subjectUi: {
      ...current.subjectUi,
      spelling: {
        ...current.subjectUi.spelling,
        error: 'Save failed',
      },
    },
  }));

  const visible = store.getState().subjectUi.spelling;
  const cached = repositories.subjectStates.read(learnerId, 'spelling').ui;

  assert.equal(visible.prefs.autoSpeak, false);
  assert.equal(visible.error, 'Save failed');
  assert.equal(cached.prefs.autoSpeak, true);
  assert.equal(cached.error, '');
});
