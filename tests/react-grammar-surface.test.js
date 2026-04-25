import test from 'node:test';
import assert from 'node:assert/strict';

import { createAppHarness } from './helpers/app-harness.js';
import {
  createGrammarHarness,
  grammarResponseFormData,
} from './helpers/grammar-subject-harness.js';
import { readGrammarLegacyOracle } from './helpers/grammar-legacy-oracle.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import { grammarModule } from '../src/subjects/grammar/module.js';
import { normaliseGrammarReadModel } from '../src/subjects/grammar/metadata.js';
import { grammarMasteryKey } from '../src/platform/game/monster-system.js';
import { getSubject, SUBJECTS } from '../src/platform/core/subject-registry.js';

function grammarOracleSample(templateId = 'question_mark_select') {
  return readGrammarLegacyOracle().templates.find((template) => template.id === templateId);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('Grammar opens as a real Clause Conservatory subject surface', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  const html = harness.render();

  assert.match(html, /Clause Conservatory/);
  assert.match(html, /Grammar retrieval practice/);
  assert.match(html, /All 18 Grammar concepts/);
  assert.match(html, /Start practice/);
  assert.match(html, /Bracehart/);
  assert.match(html, /Concordium/);
  assert.doesNotMatch(html, /Future subject module/);
});

test('Grammar surface runs from setup to Worker-style feedback and summary', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  const sample = grammarOracleSample();

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-start', {
    payload: {
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });

  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'session');
  let html = harness.render();
  assert.match(html, /Grammar practice/);
  assert.match(html, /question mark/i);
  assert.match(html, /Read aloud/);
  assert.match(html, /Speech synthesis unavailable/);

  harness.dispatch('grammar-submit-form', {
    formData: grammarResponseFormData(sample.correctResponse),
  });

  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'feedback');
  html = harness.render();
  assert.match(html, /Correct\./);
  assert.match(html, /Finish round/);

  harness.dispatch('grammar-continue');
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'summary');
  html = harness.render();
  assert.match(html, /Grammar session summary/);
  assert.match(html, /1\/1/);

  harness.dispatch('grammar-back');
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'dashboard');
  assert.match(harness.render(), /Grammar retrieval practice/);
});

test('Grammar surface runs KS2 mini-set mode with delayed feedback and end review', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  const sample = grammarOracleSample('fronted_adverbial_choose');

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-set-mode', { value: 'satsset' });
  let html = harness.render();
  assert.match(html, /Mini-set size/);
  assert.match(html, /<option value="8" selected="">8<\/option><option value="12">12<\/option>/);

  harness.dispatch('grammar-start', {
    payload: {
      mode: 'satsset',
      roundLength: 8,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });

  let grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'session');
  assert.equal(grammar.session.type, 'mini-set');
  assert.equal(grammar.session.miniTest.questions.length, 8);

  html = harness.render();
  assert.match(html, /KS2-style mini-test/);
  assert.match(html, /Timed test/);
  assert.match(html, /Question 1 of 8/);
  assert.match(html, /Save response/);
  assert.match(html, /Finish mini-set/);
  const navButton = html.match(/<button[^>]*class="grammar-mini-test-nav-button current"[^>]*>/)?.[0];
  assert.ok(navButton, 'mini-test question navigation renders a current question button');
  const navFormId = navButton.match(/form="([^"]+)"/)?.[1];
  assert.ok(navFormId, 'mini-test question navigation button is associated with the answer form');
  assert.match(html, new RegExp(`<form id="${escapeRegExp(navFormId)}" class="grammar-answer-form"`));
  assert.doesNotMatch(html, /Correct\./);
  assert.doesNotMatch(html, /Non-scored/);

  harness.dispatch('grammar-save-mini-test-response', {
    formData: grammarResponseFormData(sample.correctResponse),
    advance: true,
  });

  grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'session');
  assert.equal(grammar.feedback, null);
  assert.equal(grammar.session.answered, 1);
  assert.equal(grammar.session.currentIndex, 1);
  assert.equal(grammar.analytics.concepts.some((concept) => concept.attempts > 0), false);
  assert.match(harness.render(), /Question 2 of 8/);

  harness.dispatch('grammar-finish-mini-test');

  grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'summary');
  assert.equal(grammar.summary.answered, 1);
  assert.equal(grammar.summary.miniTestReview.questions.length, 8);
  html = harness.render();
  assert.match(html, /Mini-set review/);
  assert.match(html, /Delayed feedback/);
  assert.match(html, /No answer saved/);
  assert.match(html, /Q1/);
  assert.match(html, /Q2/);
});

// U4 strict mini-test SSR coverage — known limits (documented in plan):
// the SSR harness cannot observe pointer-capture, focus management, CSS
// overflow, scroll-into-view, or IME behaviour. The tests below exercise
// state transitions and rendered-HTML invariants; browser-visual regressions
// must be caught by production UI verification, not this file.

test('U4: strict mini-test preserves answers across navigation', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  const sample = grammarOracleSample('fronted_adverbial_choose');

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-start', {
    payload: { mode: 'satsset', roundLength: 8, templateId: sample.id, seed: sample.sample.seed },
  });

  // Answer Q1, navigate forward, navigate back, confirm Q1 answer preserved.
  let grammar = harness.store.getState().subjectUi.grammar;
  const q1Value = grammar.session.miniTest.questions[0].item.inputSpec.options[0].value;
  harness.dispatch('grammar-save-mini-test-response', {
    formData: grammarResponseFormData({ answer: q1Value }),
    advance: true,
  });

  grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.session.currentIndex, 1, 'advance moved to Q2');

  // Go back to Q1
  harness.dispatch('grammar-move-mini-test', { index: 0 });
  grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.session.currentIndex, 0, 'navigation returned to Q1');

  // Q1's saved response must still be present in the mini-test state
  const q1Saved = grammar.session.miniTest.questions[0];
  assert.equal(q1Saved.answered, true, 'Q1 still marked answered after navigation');
  assert.equal(q1Saved.response.answer, q1Value, 'Q1 answer value preserved across navigation');

  // No feedback rendered before finish (no early marking leak)
  const html = harness.render();
  assert.doesNotMatch(html, /Correct\./, 'no early feedback before finish');
  assert.doesNotMatch(html, /Worked solution/i, 'no worked guidance before finish');
});

test('U4: strict mini-test unanswered questions render as unanswered without inventing responses', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  const sample = grammarOracleSample('fronted_adverbial_choose');

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-start', {
    payload: { mode: 'satsset', roundLength: 8, templateId: sample.id, seed: sample.sample.seed },
  });

  // Answer only Q1, then finish — leaves 7 unanswered.
  let grammar = harness.store.getState().subjectUi.grammar;
  const q1Value = grammar.session.miniTest.questions[0].item.inputSpec.options[0].value;
  harness.dispatch('grammar-save-mini-test-response', {
    formData: grammarResponseFormData({ answer: q1Value }),
    advance: false,
  });
  harness.dispatch('grammar-finish-mini-test');

  grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'summary');
  const review = grammar.summary.miniTestReview;
  assert.equal(review.questions.length, 8);
  const answered = review.questions.filter((q) => q.answered).length;
  const unanswered = review.questions.filter((q) => !q.answered).length;
  assert.equal(answered, 1);
  assert.equal(unanswered, 7);
  // Unanswered questions must not be marked or have a score
  for (const q of review.questions.filter((q) => !q.answered)) {
    assert.ok(!q.result || q.result.correct !== true, 'unanswered question must not be marked correct');
  }
  const html = harness.render();
  assert.match(html, /No answer saved/, 'unanswered state is rendered');
});

test('U4: strict mini-test blocks worked/faded/AI/similar-problem commands while unfinished', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  const sample = grammarOracleSample('fronted_adverbial_choose');

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-start', {
    payload: { mode: 'satsset', roundLength: 8, templateId: sample.id, seed: sample.sample.seed },
  });

  // Snapshot mastery before any repair attempts
  const masteryBefore = JSON.stringify(harness.store.getState().subjectUi.grammar.analytics);

  harness.dispatch('grammar-use-faded-support');
  harness.dispatch('grammar-show-worked-solution');
  harness.dispatch('grammar-start-similar-problem');
  harness.dispatch('grammar-request-ai-enrichment', { kind: 'explanation' });

  const grammar = harness.store.getState().subjectUi.grammar;
  // Mini-test is still active and unfinished
  assert.equal(grammar.phase, 'session');
  assert.equal(grammar.session.type, 'mini-set');
  // Mastery unchanged — these commands must fail closed
  const masteryAfter = JSON.stringify(grammar.analytics);
  assert.equal(masteryAfter, masteryBefore, 'mastery must not change from failed repair commands during active mini-test');
  // Feedback must remain absent (no leaked guidance)
  assert.equal(grammar.feedback, null, 'no feedback leaked during active mini-test');
  // Repair state must not record worked/faded escalation — the commands most
  // visibly mutate session.repair outside mini-tests, so a passing test without
  // this assertion could miss a silent-no-op bug.
  const repair = grammar.session.repair || {};
  assert.ok(!repair.workedSolutionShown, 'worked-solution repair must not be marked during active mini-test');
  assert.ok(!repair.requestedFadedSupport, 'faded-support repair must not be marked during active mini-test');
});

test('U4: strict mini-test timer expiry auto-finishes with deterministic marking', () => {
  const storage = installMemoryStorage();
  let currentNow = 1_777_000_000_000;
  const harness = createGrammarHarness({ storage, now: () => currentNow });
  const sample = grammarOracleSample('fronted_adverbial_choose');

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-start', {
    payload: { mode: 'satsset', roundLength: 8, templateId: sample.id, seed: sample.sample.seed },
  });

  // Save Q1 response
  let grammar = harness.store.getState().subjectUi.grammar;
  const q1Value = grammar.session.miniTest.questions[0].item.inputSpec.options[0].value;
  harness.dispatch('grammar-save-mini-test-response', {
    formData: grammarResponseFormData({ answer: q1Value }),
    advance: false,
  });

  // Advance the clock past the timer expiry. Timer is `expiresAt` on the session.
  grammar = harness.store.getState().subjectUi.grammar;
  const expiresAt = grammar.session.miniTest.expiresAt;
  currentNow = Number(expiresAt) + 1000;

  // Submit/save after expiry should trigger auto-finish via the Worker command path.
  harness.dispatch('grammar-save-mini-test-response', {
    formData: grammarResponseFormData({ answer: q1Value }),
    advance: true,
  });

  grammar = harness.store.getState().subjectUi.grammar;
  // Finish must have been triggered; phase is summary.
  assert.equal(grammar.phase, 'summary', 'timer expiry auto-finishes the mini-test');
  assert.ok(grammar.summary, 'summary is populated after timer expiry');
  assert.equal(grammar.summary.miniTestReview.questions.length, 8);
});

test('Grammar surface exposes in-session repair actions without local scoring', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  const sample = grammarOracleSample('fronted_adverbial_choose');
  const wrongAnswer = sample.sample.inputSpec.options.find((option) => option.value !== sample.correctResponse.answer).value;

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-start', {
    payload: {
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });

  let html = harness.render();
  assert.match(html, /Faded support/);
  assert.match(html, /Similar problem/);

  harness.dispatch('grammar-use-faded-support');
  html = harness.render();
  assert.match(html, /Faded guidance/);
  assert.equal(harness.store.getState().subjectUi.grammar.session.supportLevel, 1);

  harness.dispatch('grammar-submit-form', {
    formData: grammarResponseFormData({ answer: wrongAnswer }),
  });
  html = harness.render();
  assert.match(html, /Retry/);
  assert.match(html, /Worked solution/);
  assert.match(html, /Similar problem/);

  harness.dispatch('grammar-show-worked-solution');
  html = harness.render();
  assert.match(html, /Worked solution/);
  assert.match(html, /Answer/);
  assert.equal(harness.store.getState().subjectUi.grammar.session.supportLevel, 2);

  harness.dispatch('grammar-retry-current-question');
  let grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'session');
  assert.equal(grammar.session.answered, 1);
  assert.equal(grammar.session.repair.retryingCurrent, true);
  assert.match(harness.render(), /Worked example/);

  harness.dispatch('grammar-start-similar-problem');
  grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'session');
  assert.equal(grammar.session.currentItem.templateId, sample.id);
  assert.notEqual(grammar.session.currentItem.seed, sample.sample.seed);
  assert.equal(grammar.session.repair.similarProblems, 1);
});

test('Grammar session exposes non-scored AI enrichment triggers', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  const sample = grammarOracleSample('fronted_adverbial_choose');

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-start', {
    payload: {
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });

  let html = harness.render();
  assert.match(html, /Explain this/);
  assert.match(html, /Revision cards/);

  harness.dispatch('grammar-request-ai-enrichment', { kind: 'explanation' });
  let grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.aiEnrichment.status, 'ready');
  assert.equal(grammar.aiEnrichment.nonScored, true);
  assert.equal(grammar.aiEnrichment.concept.id, 'adverbials');
  html = harness.render();
  assert.match(html, /Non-scored/);
  assert.match(html, /Adverbials and fronted adverbials explanation/);
  assert.match(html, /Fronted adverbials come first/);

  harness.dispatch('grammar-request-ai-enrichment', { kind: 'revision-card' });
  grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.aiEnrichment.kind, 'revision-card');
  assert.ok(grammar.aiEnrichment.revisionCards.length >= 1);
  assert.ok(grammar.aiEnrichment.revisionDrills.every((drill) => drill.deterministic === true));
  html = harness.render();
  assert.match(html, /Concept check/);
  assert.match(html, /Spot the fronted adverbial/);
});

test('Grammar analytics exposes parent summary draft enrichment', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  let html = harness.render();
  assert.match(html, /Parent summary draft/);

  harness.dispatch('grammar-request-ai-enrichment', { kind: 'parent-summary' });
  const grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.aiEnrichment.status, 'ready');
  assert.equal(grammar.aiEnrichment.kind, 'parent-summary');
  assert.match(grammar.aiEnrichment.parentSummary.body, /Worker-marked evidence/);
  html = harness.render();
  assert.match(html, /Grammar parent summary draft/);
  assert.match(html, /Non-scored/);
  assert.match(html, /Current focus/);
  assert.doesNotMatch(html, /correctAnswer/);
});

test('Grammar submit requires an answer before recording an attempt', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  const sample = grammarOracleSample();

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-start', {
    payload: {
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });

  harness.dispatch('grammar-submit-form', { formData: new FormData() });

  const grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'session');
  assert.equal(grammar.session.answered, 0);
  assert.match(grammar.error, /Choose or type an answer/);
  assert.equal(grammar.analytics.concepts.some((concept) => concept.attempts > 0), false);
});

test('Grammar setup controls are disabled while a command is pending', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.store.updateSubjectUi('grammar', (current) => ({
    ...normaliseGrammarReadModel(current, learnerId),
    pendingCommand: 'start-session',
  }));

  const html = harness.render();
  assert.match(html, /<button class="grammar-mode selected" type="button" disabled="">/);
  assert.match(html, /<select class="input" disabled=""[^>]*><option value="" selected="">Smart mix<\/option>/);
  assert.match(html, /<select class="input" disabled=""[^>]*><option value="3">3<\/option><option value="5" selected="">5<\/option>/);
  assert.match(html, /<button class="btn primary xl" type="button" disabled="">Starting\.\.\.<\/button>/);
});

test('Grammar setup exposes session goals and Smart Review teaching settings', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  let html = harness.render();
  assert.match(html, /Session goal/);
  assert.match(html, /Ten minutes/);
  assert.match(html, /Clear due items/);
  assert.match(html, /Speech rate/);
  assert.match(html, /Smart Review teaching items/);
  assert.match(html, /Show domain before answering/);

  harness.dispatch('grammar-set-goal', { value: 'timed' });
  harness.dispatch('grammar-set-speech-rate', { value: '1.4' });
  harness.dispatch('grammar-set-practice-setting', { key: 'allowTeachingItems', value: true });
  harness.dispatch('grammar-start', {
    payload: {
      mode: 'smart',
      roundLength: 15,
      seed: 123,
    },
  });

  const grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'session');
  assert.equal(grammar.session.goal.type, 'timed');
  assert.equal(grammar.session.goal.timeLimitMs, 10 * 60_000);
  assert.equal(grammar.prefs.speechRate, 1.4);
  // U3 contract v2: Smart Review + allowTeachingItems no longer force session support level 1.
  // Independent first-attempt correct gets full credit. In-session faded escalation still available
  // if the learner requests it via grammar-use-faded-support.
  assert.equal(grammar.session.supportLevel, 0);
  html = harness.render();
  assert.match(html, /Ten minutes/);
});

test('Grammar show-domain setting affects display only before answer feedback', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  const sample = grammarOracleSample('fronted_adverbial_choose');

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-set-practice-setting', { key: 'showDomainBeforeAnswer', value: false });
  harness.dispatch('grammar-start', {
    payload: {
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });

  let html = harness.render();
  assert.doesNotMatch(html, />Adverbials<\/span>/);

  harness.dispatch('grammar-submit-form', {
    formData: grammarResponseFormData(sample.correctResponse),
  });
  html = harness.render();
  assert.match(html, />Adverbials<\/span>/);
  assert.equal(harness.store.getState().subjectUi.grammar.analytics.concepts.find((concept) => concept.id === 'adverbials').attempts, 1);
});

test('Grammar monster progress rehydrates from persisted Codex state after reload normalisation', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;
  const key = grammarMasteryKey('sentence_functions');

  harness.repositories.gameState.write(learnerId, 'monster-codex', {
    bracehart: {
      branch: 'b1',
      caught: true,
      conceptTotal: 3,
      mastered: [key],
    },
    concordium: {
      branch: 'b1',
      caught: true,
      conceptTotal: 18,
      mastered: [key],
    },
  });
  harness.store.updateSubjectUi('grammar', normaliseGrammarReadModel({}, learnerId));
  harness.dispatch('open-subject', { subjectId: 'grammar' });

  const html = harness.render();

  assert.match(html, /Bracehart/);
  assert.match(html, /1\/3 Codex/);
  assert.match(html, /Concordium/);
  assert.match(html, /1\/18 Codex/);
});

test('Grammar analytics renders evidence before reward progress', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  const sample = grammarOracleSample('fronted_adverbial_choose');

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-start', {
    payload: {
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });
  harness.dispatch('grammar-submit-form', {
    formData: grammarResponseFormData({ answer: sample.sample.inputSpec.options[0].value }),
  });
  harness.dispatch('grammar-continue');

  const html = harness.render();

  assert.match(html, /Misconception repair/);
  assert.match(html, /Fronted Adverbial pattern/);
  assert.match(html, /Question-type evidence/);
  assert.match(html, /Choose the correct sentence/);
});

test('Grammar renders transfer and Bellstorm bridge placeholders as locked future capabilities', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  const html = harness.render();

  assert.match(html, /Writing application roadmap/);
  assert.match(html, /Paragraph transfer/);
  assert.match(html, /Richer writing tasks/);
  assert.match(html, /Decision: this will be non-scored paragraph application first/);
  assert.match(html, /No score, retry, reward, or Concordium progress/);
  assert.match(html, /Teacher review and deterministic paragraph scoring are separate future decisions/);
  assert.match(html, /Worker-marked Grammar remains the only score-bearing authority/);
  assert.match(html, /Bellstorm bridge/);
  assert.match(html, /Punctuation-for-grammar stays in Grammar/);
  assert.match(html, /Bellstorm Coast remains the separate Punctuation subject/);
});

test('Grammar locked transfer placeholders do not expose scoring commands', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  const html = harness.render();

  assert.match(html, /<button(?=[^>]*data-grammar-transfer-placeholder="paragraph-transfer")(?=[^>]*disabled="")[^>]*>Coming next/);
  assert.match(html, /<button(?=[^>]*data-grammar-transfer-placeholder="writing-application")(?=[^>]*disabled="")[^>]*>Coming next/);
  assert.doesNotMatch(html, /data-grammar-transfer-submit/);
  assert.doesNotMatch(html, /name="transfer-answer"/);

  assert.equal(grammarModule.handleAction('grammar-transfer-submit', {
    appState: harness.store.getState(),
    data: { formData: new FormData() },
    store: harness.store,
    subjectCommands: {
      send() {
        throw new Error('Locked transfer placeholder must not submit a command.');
      },
    },
  }), false);
});

test('Punctuation remains separately registered from Grammar Bellstorm bridge copy', () => {
  const grammarSubject = getSubject('grammar');
  const punctuationSubject = getSubject('punctuation');

  assert.equal(grammarSubject.id, 'grammar');
  assert.equal(punctuationSubject.id, 'punctuation');
  assert.notEqual(grammarSubject, punctuationSubject);
  assert.equal(punctuationSubject.name, 'Punctuation');
  assert.equal(punctuationSubject.available, true);
  assert.match(punctuationSubject.blurb, /full KS2 punctuation map/);
  assert.equal(SUBJECTS.filter((subject) => subject.id === 'punctuation').length, 1);
});

test('Grammar analytics renders normalised recent activity before raw attempts', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;

  harness.store.updateSubjectUi('grammar', normaliseGrammarReadModel({
    phase: 'dashboard',
    analytics: {
      recentActivity: [{
        templateId: 'question_mark_select',
        questionTypeLabel: 'Choose punctuation',
        correct: true,
        score: 1,
        maxScore: 1,
      }],
      recentAttempts: [{
        templateId: 'legacy_wrong_attempt',
        result: { correct: false, score: 0, maxScore: 1 },
      }],
    },
  }, learnerId));
  harness.dispatch('open-subject', { subjectId: 'grammar' });

  const html = harness.render();

  assert.match(html, /Choose punctuation/);
  assert.match(html, /correct · score 1\/1/);
  assert.doesNotMatch(html, /legacy_wrong_attempt/);
  assert.doesNotMatch(html, /review · score 0\/1/);
});

test('Grammar analytics falls back to legacy recent attempt result payloads', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;

  harness.store.updateSubjectUi('grammar', normaliseGrammarReadModel({
    phase: 'dashboard',
    analytics: {
      recentAttempts: [{
        templateId: 'legacy_correct_attempt',
        result: { correct: true, score: 1, maxScore: 1 },
      }],
    },
  }, learnerId));
  harness.dispatch('open-subject', { subjectId: 'grammar' });

  const html = harness.render();

  assert.match(html, /legacy_correct_attempt/);
  assert.match(html, /correct · score 1\/1/);
  assert.doesNotMatch(html, /review · score 0\/1/);
});

test('Grammar session renders non-scored AI enrichment from the Worker read model', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;

  harness.store.updateSubjectUi('grammar', normaliseGrammarReadModel({
    phase: 'session',
    session: {
      id: 'grammar-ai-session',
      mode: 'smart',
      type: 'practice',
      targetCount: 1,
      answered: 0,
      currentItem: {
        templateLabel: 'Choose the correct sentence',
        domain: 'Adverbials',
        questionType: 'choose',
        promptText: 'Choose the sentence with a correctly punctuated fronted adverbial.',
        inputSpec: {
          type: 'single_choice',
          options: [
            { value: 'a', label: 'After lunch, we revised grammar.' },
            { value: 'b', label: 'After lunch we revised grammar.' },
          ],
        },
      },
      serverAuthority: 'worker',
    },
    aiEnrichment: {
      kind: 'explanation',
      status: 'ready',
      nonScored: true,
      source: 'server-validated-ai',
      explanation: {
        title: 'Fronted adverbials',
        body: 'A fronted adverbial comes before the main clause and usually takes a comma.',
        keyPoints: ['Find the opener before the main clause.'],
      },
      revisionCards: [{
        title: 'Comma check',
        front: 'Find the fronted adverbial.',
        back: 'Check the comma after the opener.',
      }],
      revisionDrills: [{
        templateId: 'fronted_adverbial_choose',
        label: 'Reviewed adverbial drill',
        deterministic: true,
      }],
      notices: ['This enrichment is non-scored.'],
    },
  }, learnerId));
  harness.dispatch('open-subject', { subjectId: 'grammar' });

  const html = harness.render();

  assert.match(html, /Non-scored/);
  assert.match(html, /Fronted adverbials/);
  assert.match(html, /Find the opener before the main clause/);
  assert.match(html, /Reviewed adverbial drill/);
  assert.match(html, /This enrichment is non-scored/);
  assert.doesNotMatch(html, /correctAnswer/);
});

test('Grammar command responses are pinned to the learner that sent them', async () => {
  let resolveCommand;
  const toasts = [];
  const celebrations = [];
  const context = {
    appState: {
      learners: { selectedId: 'learner-a' },
      subjectUi: { grammar: normaliseGrammarReadModel({}, 'learner-a') },
    },
    runtimeReadOnly: false,
    subjectCommands: {
      send(request) {
        assert.equal(request.learnerId, 'learner-a');
        return new Promise((resolve) => {
          resolveCommand = resolve;
        });
      },
    },
    store: {
      updateSubjectUi(subjectId, updater) {
        const previous = context.appState.subjectUi[subjectId] || {};
        const next = typeof updater === 'function' ? updater(previous) : { ...previous, ...updater };
        context.appState = {
          ...context.appState,
          subjectUi: {
            ...context.appState.subjectUi,
            [subjectId]: next,
          },
        };
      },
      pushToasts(events) {
        toasts.push(...events);
      },
      pushMonsterCelebrations(events) {
        celebrations.push(...events);
      },
      reloadFromRepositories() {
        throw new Error('Late Grammar response must not reload the selected learner.');
      },
    },
  };

  grammarModule.handleAction('grammar-start', context);
  assert.equal(context.appState.subjectUi.grammar.pendingCommand, 'start-session');

  context.appState = {
    ...context.appState,
    learners: { selectedId: 'learner-b' },
    subjectUi: { grammar: normaliseGrammarReadModel({}, 'learner-b') },
  };
  resolveCommand({
    subjectReadModel: normaliseGrammarReadModel({
      learnerId: 'learner-a',
      phase: 'summary',
      summary: { sessionId: 'learner-a-summary' },
      analytics: { concepts: [] },
    }, 'learner-a'),
    projections: {
      rewards: {
        toastEvents: [{ id: 'toast-a' }],
        events: [{ id: 'celebration-a' }],
      },
    },
  });
  await Promise.resolve();

  const grammar = context.appState.subjectUi.grammar;
  assert.equal(grammar.learnerId, 'learner-b');
  assert.equal(grammar.phase, 'dashboard');
  assert.equal(grammar.summary, null);
  assert.equal(toasts.length, 0);
  assert.equal(celebrations.length, 0);
});

test('Grammar normaliser preserves Worker concept copy over client placeholders', () => {
  const grammar = normaliseGrammarReadModel({
    analytics: {
      concepts: [{
        id: 'clauses',
        name: 'Worker clauses',
        domain: 'Worker domain',
        summary: 'Worker-authored concept summary.',
        punctuationForGrammar: false,
        status: 'learning',
        attempts: 3,
      }],
    },
  }, 'learner-a');

  const clauses = grammar.analytics.concepts.find((concept) => concept.id === 'clauses');
  assert.equal(clauses.name, 'Worker clauses');
  assert.equal(clauses.domain, 'Worker domain');
  assert.equal(clauses.summary, 'Worker-authored concept summary.');
  assert.equal(clauses.punctuationForGrammar, false);
  assert.equal(clauses.attempts, 3);
});

test('Grammar normaliser parses ISO misconception timestamps in fallback patterns', () => {
  const isoTimestamp = '2026-04-24T10:00:00.000Z';
  const grammar = normaliseGrammarReadModel({
    analytics: {
      misconceptionCounts: {
        fronted_adverbial_confusion: {
          count: 2,
          lastSeenAt: isoTimestamp,
        },
      },
    },
  });

  assert.equal(grammar.analytics.misconceptionPatterns[0].lastSeenAt, Date.parse(isoTimestamp));
});

test('Grammar normaliser upgrades stale persisted mode capabilities', () => {
  const grammar = normaliseGrammarReadModel({
    capabilities: {
      enabledModes: [
        { id: 'learn', label: 'Learn a concept' },
        { id: 'smart', label: 'Smart mixed review' },
        { id: 'satsset', label: 'KS2-style mini-set' },
      ],
      lockedModes: [
        { id: 'trouble', label: 'Weak concepts drill', reason: 'coming-next' },
        { id: 'surgery', label: 'Sentence surgery', reason: 'coming-next' },
        { id: 'builder', label: 'Sentence builder', reason: 'coming-next' },
        { id: 'worked', label: 'Worked examples', reason: 'coming-next' },
        { id: 'faded', label: 'Faded guidance', reason: 'coming-next' },
      ],
    },
  });

  for (const modeId of ['trouble', 'surgery', 'builder', 'worked', 'faded']) {
    assert.equal(grammar.capabilities.enabledModes.some((mode) => mode.id === modeId), true, modeId);
    assert.equal(grammar.capabilities.lockedModes.some((mode) => mode.id === modeId), false, modeId);
  }
});

test('Grammar legacy modes render available without locked placeholders', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  const html = harness.render();

  assert.match(html, /<button class="grammar-mode" type="button">[\s\S]*Weak concepts drill/);
  assert.doesNotMatch(html, /<button class="grammar-mode locked" type="button" disabled="">[\s\S]*Weak concepts drill/);
  assert.match(html, /<button class="grammar-mode" type="button">[\s\S]*Sentence surgery/);
  assert.doesNotMatch(html, /<button class="grammar-mode locked" type="button" disabled="">[\s\S]*Sentence surgery/);
  assert.match(html, /<button class="grammar-mode" type="button">[\s\S]*Sentence builder/);
  assert.doesNotMatch(html, /<button class="grammar-mode locked" type="button" disabled="">[\s\S]*Sentence builder/);
  assert.match(html, /<button class="grammar-mode" type="button">[\s\S]*Worked examples/);
  assert.doesNotMatch(html, /<button class="grammar-mode locked" type="button" disabled="">[\s\S]*Worked examples/);
  assert.match(html, /<button class="grammar-mode" type="button">[\s\S]*Faded guidance/);
  assert.doesNotMatch(html, /<button class="grammar-mode locked" type="button" disabled="">[\s\S]*Faded guidance/);
  assert.doesNotMatch(html, /<button class="grammar-mode locked" type="button" disabled="">/);
});

test('Grammar setup can start trouble drill mode', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-set-focus', { value: 'word_classes' });
  assert.equal(harness.store.getState().subjectUi.grammar.prefs.focusConceptId, 'word_classes');

  harness.dispatch('grammar-set-mode', { value: 'trouble' });
  assert.equal(harness.store.getState().subjectUi.grammar.prefs.mode, 'trouble');
  assert.equal(harness.store.getState().subjectUi.grammar.prefs.focusConceptId, '');
  assert.match(harness.render(), /<select class="input" disabled=""><option value="" selected="">Weakest concept<\/option>/);

  harness.dispatch('grammar-set-focus', { value: 'word_classes' });
  assert.equal(harness.store.getState().subjectUi.grammar.prefs.focusConceptId, '');

  harness.dispatch('grammar-start', {
    payload: {
      roundLength: 1,
      seed: 123,
    },
  });

  const grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'session');
  assert.equal(grammar.session.mode, 'trouble');
  assert.equal(grammar.session.type, 'trouble-drill');
});

test('Grammar setup can start sentence surgery mode', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-set-focus', { value: 'word_classes' });
  assert.equal(harness.store.getState().subjectUi.grammar.prefs.focusConceptId, 'word_classes');

  harness.dispatch('grammar-set-mode', { value: 'surgery' });
  assert.equal(harness.store.getState().subjectUi.grammar.prefs.mode, 'surgery');
  assert.equal(harness.store.getState().subjectUi.grammar.prefs.focusConceptId, '');
  assert.match(harness.render(), /<select class="input" disabled=""><option value="" selected="">Surgery mix<\/option>/);

  harness.dispatch('grammar-set-focus', { value: 'word_classes' });
  assert.equal(harness.store.getState().subjectUi.grammar.prefs.focusConceptId, '');

  harness.dispatch('grammar-start', {
    payload: {
      roundLength: 1,
      seed: 123,
    },
  });

  const grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'session');
  assert.equal(grammar.session.mode, 'surgery');
  assert.equal(grammar.session.type, 'sentence-surgery');
  assert.equal(grammar.session.focusConceptId, '');
  assert.match(grammar.session.currentItem.questionType, /^(fix|rewrite)$/);
});

test('Grammar explicit template starts ignore stored focus through the client wrapper', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  const sample = grammarOracleSample('question_mark_select');

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-set-focus', { value: 'word_classes' });
  assert.equal(harness.store.getState().subjectUi.grammar.prefs.focusConceptId, 'word_classes');

  harness.dispatch('grammar-start', {
    payload: {
      roundLength: 1,
      seed: sample.sample.seed,
      templateId: sample.id,
    },
  });

  const grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'session');
  assert.equal(grammar.session.currentItem.templateId, sample.id);
  assert.equal(grammar.session.focusConceptId, '');
  assert.equal(grammar.prefs.focusConceptId, 'word_classes');
});

test('Grammar setup can start sentence builder mode', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-set-focus', { value: 'word_classes' });
  assert.equal(harness.store.getState().subjectUi.grammar.prefs.focusConceptId, 'word_classes');

  harness.dispatch('grammar-set-mode', { value: 'builder' });
  assert.equal(harness.store.getState().subjectUi.grammar.prefs.mode, 'builder');
  assert.equal(harness.store.getState().subjectUi.grammar.prefs.focusConceptId, '');
  assert.match(harness.render(), /<select class="input" disabled=""><option value="" selected="">Builder mix<\/option>/);

  harness.dispatch('grammar-set-focus', { value: 'word_classes' });
  assert.equal(harness.store.getState().subjectUi.grammar.prefs.focusConceptId, '');

  harness.dispatch('grammar-start', {
    payload: {
      roundLength: 1,
      seed: 123,
    },
  });

  const grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'session');
  assert.equal(grammar.session.mode, 'builder');
  assert.equal(grammar.session.type, 'sentence-builder');
  assert.equal(grammar.session.focusConceptId, '');
  assert.match(grammar.session.currentItem.questionType, /^(build|rewrite)$/);
});

test('Grammar setup can start worked example mode with guidance', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-set-focus', { value: 'word_classes' });
  harness.dispatch('grammar-set-mode', { value: 'worked' });
  assert.equal(harness.store.getState().subjectUi.grammar.prefs.mode, 'worked');
  assert.equal(harness.store.getState().subjectUi.grammar.prefs.focusConceptId, 'word_classes');

  harness.dispatch('grammar-start', {
    payload: {
      roundLength: 1,
      seed: 123,
    },
  });

  const grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'session');
  assert.equal(grammar.session.mode, 'worked');
  assert.equal(grammar.session.type, 'worked-example');
  assert.equal(grammar.session.supportLevel, 2);
  assert.equal(grammar.session.supportGuidance.kind, 'worked');
  assert.match(harness.render(), /Worked example/);
  assert.match(harness.render(), /Model/);
});

test('Grammar setup can start faded guidance mode with lower support', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-set-mode', { value: 'faded' });
  assert.equal(harness.store.getState().subjectUi.grammar.prefs.mode, 'faded');

  harness.dispatch('grammar-start', {
    payload: {
      roundLength: 1,
      seed: 123,
    },
  });

  const grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'session');
  assert.equal(grammar.session.mode, 'faded');
  assert.equal(grammar.session.type, 'faded-guidance');
  assert.equal(grammar.session.supportLevel, 1);
  assert.equal(grammar.session.supportGuidance.kind, 'faded');
  assert.match(harness.render(), /Faded guidance/);
  assert.match(harness.render(), /Near miss/);
});
