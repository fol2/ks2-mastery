import test from 'node:test';
import assert from 'node:assert/strict';

import { createAppHarness } from './helpers/app-harness.js';
import { SUBJECT_EXPOSURE_GATES } from '../src/platform/core/subject-availability.js';
import {
  registerGoldenPathSmokeSuite,
  registerSubjectConformanceSuite,
  typedFormData,
} from './helpers/subject-expansion-harness.js';
import {
  createExpansionFixtureHarness,
  EXPANSION_FIXTURE_SUBJECT_ID,
} from './helpers/expansion-fixture-subject.js';
import {
  createGrammarHarness,
  grammarOracleResponseForItem,
  grammarResponseFormData,
} from './helpers/grammar-subject-harness.js';
import { readGrammarLegacyOracle } from './helpers/grammar-legacy-oracle.js';

function createSpellingHarness({ storage, subjects } = {}) {
  return createAppHarness({ storage, subjects });
}

function prepareSpellingHarness(harness) {
  const learnerId = harness.store.getState().learners.selectedId;
  harness.services.spelling.savePrefs(learnerId, {
    mode: 'smart',
    roundLength: '1',
  });
}

function answerSpellingCorrectly(harness) {
  while (harness.store.getState().subjectUi.spelling.phase === 'session') {
    const state = harness.store.getState().subjectUi.spelling;
    const answer = state.session.currentCard.word.word;
    harness.dispatch('spelling-submit-form', { formData: typedFormData(answer) });
    if (
      harness.store.getState().subjectUi.spelling.phase === 'session'
      && harness.store.getState().subjectUi.spelling.awaitingAdvance
    ) {
      harness.dispatch('spelling-continue');
    }
  }
}

function createPunctuationHarness({ storage, subjects } = {}) {
  return createAppHarness({
    storage,
    subjects,
    subjectExposureGates: { [SUBJECT_EXPOSURE_GATES.punctuation]: true },
  });
}

function preparePunctuationHarness(harness) {
  const learnerId = harness.store.getState().learners.selectedId;
  harness.services.punctuation.savePrefs(learnerId, {
    mode: 'endmarks',
    roundLength: '1',
  });
}

function answerPunctuationCorrectly(harness) {
  let guard = 0;
  while (harness.store.getState().subjectUi.punctuation.phase !== 'summary' && guard < 12) {
    guard += 1;
    const state = harness.store.getState().subjectUi.punctuation;
    if (state.phase === 'feedback') {
      harness.dispatch('punctuation-continue');
      continue;
    }
    if (state.phase !== 'active-item') break;
    const item = state.session.currentItem;
    if (item.inputKind === 'choice') {
      const option = item.options.find((entry) => entry.text === item.model) || item.options[0];
      harness.dispatch('punctuation-submit-form', { choiceIndex: option.index });
      continue;
    }
    harness.dispatch('punctuation-submit-form', { typed: item.model });
  }
}

const spellingSpec = {
  label: 'Spelling reference subject',
  subjectId: 'spelling',
  createHarness: createSpellingHarness,
  prepareHarness: prepareSpellingHarness,
  practiceMatcher: /Round setup/,
  sessionMatcher: /Spell the word you hear|Spell the dictated word/,
  summaryMatcher: /Session summary/,
  getUiState(harness) {
    return harness.store.getState().subjectUi.spelling;
  },
  isSessionState(ui) {
    return ui.phase === 'session';
  },
  isSummaryState(ui) {
    return ui.phase === 'summary';
  },
  startRound(harness) {
    harness.dispatch('spelling-start');
  },
  answerCorrectly: answerSpellingCorrectly,
  backToDashboard(harness) {
    harness.dispatch('spelling-back');
  },
  triggerActionName: 'spelling-start',
  triggerAction(harness) {
    harness.dispatch('spelling-start');
  },
  expectedCompletionEventType: 'spelling.session-completed',
  assertDashboardStats(stats) {
    assert.ok(stats.pct >= 0 && stats.pct <= 100);
  },
  assertAnalytics(analytics) {
    assert.ok(analytics.pools.all.attempts >= 1);
    assert.ok(analytics.pools.all.correct >= 0);
  },
};

const expansionFixtureSpec = {
  label: 'Expansion fixture candidate subject',
  subjectId: EXPANSION_FIXTURE_SUBJECT_ID,
  createHarness: createExpansionFixtureHarness,
  expectReactPractice: true,
  practiceMatcher: /Expansion fixture practice/,
  sessionMatcher: /Expansion fixture live round/,
  summaryMatcher: /Expansion fixture summary/,
  getUiState(harness) {
    return harness.store.getState().subjectUi[EXPANSION_FIXTURE_SUBJECT_ID];
  },
  isSessionState(ui) {
    return ui.phase === 'session';
  },
  isSummaryState(ui) {
    return ui.phase === 'summary';
  },
  startRound(harness) {
    harness.dispatch('fixture-start');
  },
  answerCorrectly(harness) {
    const state = harness.store.getState().subjectUi[EXPANSION_FIXTURE_SUBJECT_ID];
    harness.dispatch('fixture-submit-form', {
      formData: typedFormData(state.session.currentQuestion.answer),
    });
  },
  backToDashboard(harness) {
    harness.dispatch('fixture-back');
  },
  triggerActionName: 'fixture-start',
  triggerAction(harness) {
    harness.dispatch('fixture-start');
  },
  expectedCompletionEventType: 'expansion-fixture.session-completed',
  assertDashboardStats(stats) {
    assert.ok(stats.pct >= 0 && stats.pct <= 100);
    assert.equal(typeof stats.streak, 'number');
  },
  assertAnalytics(analytics) {
    assert.equal(analytics.attempts, 1);
    assert.equal(analytics.correct, 1);
    assert.equal(analytics.accuracy, 100);
    assert.equal(analytics.sessionsCompleted, 1);
  },
};

const grammarSample = readGrammarLegacyOracle().templates.find((template) => template.id === 'question_mark_select');

function answerGrammarCorrectly(harness) {
  while (['session', 'feedback'].includes(harness.store.getState().subjectUi.grammar.phase)) {
    const ui = harness.store.getState().subjectUi.grammar;
    if (ui.phase === 'feedback') {
      harness.dispatch('grammar-continue');
      continue;
    }
    const response = grammarOracleResponseForItem(ui.session?.currentItem);
    harness.dispatch('grammar-submit-form', {
      formData: grammarResponseFormData(response),
    });
  }
}

const grammarSpec = {
  label: 'Grammar Stage 1 subject',
  subjectId: 'grammar',
  createHarness: createGrammarHarness,
  expectReactPractice: true,
  // U1 renames the dashboard hero copy from "Grammar retrieval practice"
  // to the child-facing `GRAMMAR_DASHBOARD_HERO.title` ("Grammar Garden").
  practiceMatcher: /Grammar Garden/,
  sessionMatcher: /Grammar practice|question marks/i,
  // Phase 3 U5 replaces the adult `Grammar session summary` eyebrow with the
  // child-facing `Nice work — round complete` headline on the redesigned
  // summary scene.
  summaryMatcher: /Nice work — round complete/,
  getUiState(harness) {
    return harness.store.getState().subjectUi.grammar;
  },
  isSessionState(ui) {
    return ui.phase === 'session';
  },
  isSummaryState(ui) {
    return ui.phase === 'summary';
  },
  startRound(harness) {
    harness.dispatch('grammar-start', {
      payload: {
        roundLength: 1,
        templateId: grammarSample.id,
        seed: grammarSample.sample.seed,
      },
    });
  },
  answerCorrectly: answerGrammarCorrectly,
  backToDashboard(harness) {
    harness.dispatch('grammar-back');
  },
  triggerActionName: 'grammar-start',
  triggerAction(harness) {
    harness.dispatch('grammar-start');
  },
  expectedCompletionEventType: 'grammar.session-completed',
  assertDashboardStats(stats) {
    assert.ok(stats.pct >= 0 && stats.pct <= 100);
    assert.equal(typeof stats.streak, 'number');
  },
  assertAnalytics(analytics) {
    assert.equal(Array.isArray(analytics.concepts), true);
    assert.equal(analytics.concepts.length, 18);
    assert.ok(analytics.concepts.some((concept) => concept.attempts >= 1));
  },
};

const punctuationSpec = {
  label: 'Punctuation production subject',
  subjectId: 'punctuation',
  createHarness: createPunctuationHarness,
  prepareHarness: preparePunctuationHarness,
  expectReactPractice: true,
  practiceMatcher: /Punctuation practice/,
  sessionMatcher: /Choose the best punctuated sentence|Punctuate the sentence accurately|Correct the punctuation/,
  summaryMatcher: /Punctuation session summary/,
  getUiState(harness) {
    return harness.store.getState().subjectUi.punctuation;
  },
  isSessionState(ui) {
    return ui.phase === 'active-item';
  },
  isSummaryState(ui) {
    return ui.phase === 'summary';
  },
  startRound(harness) {
    harness.dispatch('punctuation-start', { mode: 'endmarks', roundLength: '1' });
  },
  answerCorrectly: answerPunctuationCorrectly,
  backToDashboard(harness) {
    harness.dispatch('punctuation-back');
  },
  expectedRestPhase: 'setup',
  triggerActionName: 'punctuation-start',
  triggerAction(harness) {
    harness.dispatch('punctuation-start', { mode: 'endmarks', roundLength: '1' });
  },
  expectedCompletionEventType: 'punctuation.session-completed',
  assertDashboardStats(stats) {
    assert.ok(stats.pct >= 0 && stats.pct <= 100);
    assert.equal(typeof stats.streak, 'number');
  },
  assertAnalytics(analytics) {
    assert.equal(analytics.attempts, 1);
    assert.equal(analytics.correct, 1);
    assert.equal(analytics.accuracy, 100);
    assert.equal(analytics.sessionsCompleted, 1);
  },
};

test('Punctuation stays off the dashboard and route path until its exposure gate opens', () => {
  const gated = createAppHarness();

  assert.equal(gated.contextFor().subjects.some((subject) => subject.id === 'punctuation'), false);

  gated.dispatch('open-subject', { subjectId: 'punctuation' });
  assert.equal(gated.store.getState().route.screen, 'dashboard');

  gated.store.openSubject('punctuation');
  assert.match(gated.render(), /not available in this deployment yet/);

  const enabled = createAppHarness({
    subjectExposureGates: { [SUBJECT_EXPOSURE_GATES.punctuation]: true },
  });

  assert.equal(enabled.contextFor().subjects.some((subject) => subject.id === 'punctuation'), true);

  enabled.dispatch('open-subject', { subjectId: 'punctuation' });
  assert.equal(enabled.store.getState().route.screen, 'subject');
  assert.equal(enabled.store.getState().route.subjectId, 'punctuation');
});

registerSubjectConformanceSuite(spellingSpec);
registerGoldenPathSmokeSuite(spellingSpec);
registerSubjectConformanceSuite(grammarSpec);
registerGoldenPathSmokeSuite(grammarSpec);
registerSubjectConformanceSuite(expansionFixtureSpec);
registerGoldenPathSmokeSuite(expansionFixtureSpec);
registerSubjectConformanceSuite(punctuationSpec);
registerGoldenPathSmokeSuite(punctuationSpec);
