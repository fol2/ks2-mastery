import test from 'node:test';
import assert from 'node:assert/strict';

import { createAppHarness } from './helpers/app-harness.js';
import {
  createGrammarHarness,
  grammarResponseFormData,
} from './helpers/grammar-subject-harness.js';
import { readGrammarLegacyOracle } from './helpers/grammar-legacy-oracle.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import { scopeSummary } from './helpers/grammar-phase3-renders.js';
import {
  grammarModule,
  GRAMMAR_TRANSFER_ERROR_COPY,
  GRAMMAR_TRANSFER_GENERIC_ERROR_COPY,
  translateGrammarTransferError,
} from '../src/subjects/grammar/module.js';
import { GRAMMAR_CHILD_FORBIDDEN_TERMS } from '../src/subjects/grammar/components/grammar-view-model.js';
import { normaliseGrammarReadModel } from '../src/subjects/grammar/metadata.js';
import { grammarMasteryKey } from '../src/platform/game/monster-system.js';
import { getSubject, SUBJECTS } from '../src/platform/core/subject-registry.js';

function grammarOracleSample(templateId = 'question_mark_select') {
  return readGrammarLegacyOracle().templates.find((template) => template.id === templateId);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('Grammar opens as the child-facing Grammar Garden dashboard', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  const html = harness.render();

  // Phase 3 U1: hero copy comes from `GRAMMAR_DASHBOARD_HERO`.
  assert.match(html, /Grammar Garden/);
  assert.match(html, /Grow your Grammar creatures/);
  // U8 Phase 5: Smart Practice is the sole primary CTA.
  assert.match(html, /Smart Practice/);
  // U8 Phase 5: Grammar Bank, Mini Test, Fix Trouble Spots are secondary links.
  assert.match(html, /Fix Trouble Spots/);
  assert.match(html, /Mini Test/);
  assert.match(html, /Grammar Bank/);
  // Brand-new learner: Today section renders the empty-state callout
  // instead of the four zero tiles (U1 follower, empty_returning_states).
  assert.match(html, /Start your first round to see your scores here\./);
  // Smart Practice is marked featured/recommended (U1 follower, cta_hierarchy).
  assert.match(html, /data-mode-id="smart"[^>]*data-featured="true"/);
  assert.match(html, /class="grammar-primary-mode[^"]*is-recommended[^"]*"[^>]*data-mode-id="smart"/);
  assert.match(html, /Recommended/);
  // U7 Phase 5: Monster strip with 4 active creatures + child-facing copy.
  assert.match(html, /grammar-monster-strip/);
  assert.match(html, /data-monster-id="bracehart"/);
  assert.match(html, /data-monster-id="bracehart" data-display-state="not-found"/);
  assert.match(html, /data-monster-id="concordium"/);
  assert.match(html, /0 \/ 100 Stars/);
  assert.match(html, /Get 1 Star to find the Egg\. Reach 100 Stars for Mega\./);
  // More practice disclosure is present and closed by default.
  assert.match(html, /<details class="grammar-more-practice"><summary>More practice<\/summary>/);
  // U8 Phase 5: Writing Try now inside More practice (not primary area).
  assert.match(html, /data-action="grammar-open-transfer"/);
  assert.match(html, /Writing Try/);
  // U8 Phase 5: Primary CTA is "Start Smart Practice".
  assert.match(html, /Start Smart Practice/);
  assert.doesNotMatch(html, /Future subject module/);
});

test('Grammar dashboard omits adult-diagnostic copy and reserved monster names', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  const html = harness.render();
  // Narrow the absence check to the dashboard panel. The adult-only
  // analytics surface lives behind a sibling `<details class="grammar-grown-up-view">`
  // disclosure, so we scope to the dashboard section alone.
  const dashboardMatch = html.match(/<section class="grammar-dashboard"[\s\S]*?<\/section><details class="grammar-grown-up-view">/);
  assert.ok(dashboardMatch, 'dashboard section was rendered');
  const dashboardHtml = dashboardMatch[0];

  // U1 follower: iterate every entry in the fixture list rather than
  // hard-coding a subset. Any new forbidden term appears here automatically.
  for (const term of GRAMMAR_CHILD_FORBIDDEN_TERMS) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.doesNotMatch(dashboardHtml, new RegExp(escaped, 'i'), `forbidden term leaked: ${term}`);
  }
  // Whole-word `Worker` catch-all: the bare noun is adult-facing. The
  // `\b` boundary keeps legitimate tokens like `workbook` or `homework`
  // from tripping the guard; the fixture-driven loop above covers every
  // compound form (`Worker-marked`, `Worker authority`, ...).
  assert.doesNotMatch(dashboardHtml, /\bWorker\b/i);
  // Reserved Grammar monsters never appear in the dashboard.
  assert.doesNotMatch(dashboardHtml, /Glossbloom|Loomrill|Mirrane/i);
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
  // Phase 3 U5: child-facing summary headline replaces the adult "Grammar
  // session summary" eyebrow. The round stats are surfaced via the five
  // summary cards (Answered/Correct/Trouble spots/New secure/Monster
  // progress) rather than a "1/1" score string.
  assert.match(html, /Nice work — round complete/);
  assert.match(html, /data-card-id="answered"/);
  assert.match(html, /data-card-id="monster-progress"/);

  // Phase 3 U5: retired buttons replaced with three primary actions
  // (Practise missed / Start another round / Open Grammar Bank) plus the
  // secondary `Grown-up view` (dispatches `grammar-open-analytics`). The
  // old `grammar-back` button is no longer on the summary, so return to
  // the dashboard via `Open Grammar Bank` → dashboard routing is covered
  // elsewhere; here we assert `Start another round` remains wired.
  assert.match(html, /data-action="grammar-start-again"/);
  assert.match(html, /data-action="grammar-practise-missed"/);
  assert.match(html, /data-action="grammar-open-concept-bank"/);
  assert.match(html, /data-action="grammar-open-analytics"/);
});

test('Grammar Enter key advances from feedback to the next question', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  const sample = grammarOracleSample();

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-start', {
    payload: {
      roundLength: 2,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });

  harness.dispatch('grammar-submit-form', {
    formData: grammarResponseFormData(sample.correctResponse),
  });
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'feedback');

  assert.equal(harness.keydown({ key: 'Enter', target: { tagName: 'BODY' } }), true);
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'session');
});

test('Grammar Enter key is ignored while focus is inside a typing element', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  const sample = grammarOracleSample();

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-start', {
    payload: {
      roundLength: 2,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });

  harness.dispatch('grammar-submit-form', {
    formData: grammarResponseFormData(sample.correctResponse),
  });
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'feedback');

  harness.keydown({ key: 'Enter', target: { tagName: 'TEXTAREA' } });
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'feedback');
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
  // U3: the chip row is driven by `grammarSessionInfoChips` — mini-set
  // surfaces the child-friendly `Mini Test` chip instead of the legacy
  // `KS2-style mini-test` adult copy.
  assert.match(html, /Mini Test/);
  assert.match(html, /Timed test/);
  // U3: h2 title is now `grammarSessionProgressLabel` — mini-test uses the
  // `Mini Test — Question X of N` pattern from U8.
  assert.match(html, /Mini Test — Question 1 of 8/);
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
  assert.match(html, /Mini Test results/i);
  assert.match(html, /Your results/);
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

// --- U4 Phase 3: mini-test strictness + post-finish review ------------------
//
// These tests pin the pre-finish strictness (no feedback / worked / AI /
// similar / faded surface) and the post-finish review (score card,
// expandable per-question rows, `Practise this later` hand-off). They also
// guard the `aria-current="step"` / `aria-pressed` attributes on the
// mini-test nav buttons per the plan's a11y pass.

function u4HarnessWithMiniSet() {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  const sample = grammarOracleSample('fronted_adverbial_choose');
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-start', {
    payload: { mode: 'satsset', roundLength: 8, templateId: sample.id, seed: sample.sample.seed },
  });
  return { harness, sample };
}

function u4ScopeToSessionHtml(html) {
  const match = html.match(/<section class="grammar-session"[\s\S]*?<\/section>/);
  assert.ok(match, 'session scene was rendered');
  return match[0];
}

function u4ScopeToReviewHtml(html) {
  const match = html.match(/<section class="card grammar-mini-review"[\s\S]*?<\/section>/);
  assert.ok(match, 'mini-set review section was rendered');
  return match[0];
}

test('U4 Phase 3: mini-test before finish hides every feedback / help surface', () => {
  const { harness } = u4HarnessWithMiniSet();
  const grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'session');
  assert.equal(grammar.session.type, 'mini-set');
  assert.equal(grammar.session.miniTest.finished, false);

  // Silent-no-op hedge (Phase 2 U4 pattern): these flags must stay false for
  // the duration of the mini-set. If a stray repair button leaked through
  // the U8 gate and was clicked, `session.repair.*` would flip even if the
  // HTML assertion below happened to tolerate the DOM change.
  assert.equal(grammar.session.repair?.workedSolutionShown || false, false);
  assert.equal(grammar.session.repair?.requestedFadedSupport || false, false);

  const sessionHtml = u4ScopeToSessionHtml(harness.render());

  // Timer, nav, Save-and-next are present.
  assert.match(sessionHtml, /Time left \d+:\d{2}/);
  assert.match(sessionHtml, /Mini Test — Question 1 of 8/);
  assert.match(sessionHtml, /grammar-mini-test-nav-button/);
  assert.match(sessionHtml, />Save and next</);
  assert.match(sessionHtml, />Finish mini-set</);

  // Every feedback / help / AI / worked / repair surface is absent.
  assert.doesNotMatch(sessionHtml, /Correct\./);
  assert.doesNotMatch(sessionHtml, /Not quite/);
  assert.doesNotMatch(sessionHtml, /Worked solution/i);
  assert.doesNotMatch(sessionHtml, /Similar problem/i);
  assert.doesNotMatch(sessionHtml, /Explain this/);
  assert.doesNotMatch(sessionHtml, /Explain another way/);
  assert.doesNotMatch(sessionHtml, /Faded support/i);
  assert.doesNotMatch(sessionHtml, /Faded guidance/i);
  assert.doesNotMatch(sessionHtml, /Show a step/);
  assert.doesNotMatch(sessionHtml, /Show answer/);
  assert.doesNotMatch(sessionHtml, /Revision cards/);
  assert.doesNotMatch(sessionHtml, /Non-scored/);

  // Full forbidden-terms sweep. Any adult-diagnostic leak (Worker authority,
  // evidence snapshot, read model, ...) trips this loop.
  for (const term of GRAMMAR_CHILD_FORBIDDEN_TERMS) {
    assert.doesNotMatch(
      sessionHtml,
      new RegExp(escapeRegExp(term), 'i'),
      `forbidden term leaked into pre-finish mini-test HTML: ${term}`,
    );
  }
});

test('U4 Phase 3: mini-test nav exposes aria-current=step and aria-pressed=answered', () => {
  const { harness } = u4HarnessWithMiniSet();

  // Before any answers: current button (index 0) carries aria-current="step"
  // and every nav button reports aria-pressed="false".
  let grammar = harness.store.getState().subjectUi.grammar;
  const q1Value = grammar.session.miniTest.questions[0].item.inputSpec.options[0].value;
  let sessionHtml = u4ScopeToSessionHtml(harness.render());
  const currentBeforeAnswer = sessionHtml.match(
    /<button[^>]*class="grammar-mini-test-nav-button current"[^>]*>/,
  )?.[0];
  assert.ok(currentBeforeAnswer, 'current nav button is rendered');
  assert.match(currentBeforeAnswer, /aria-current="step"/);
  assert.match(currentBeforeAnswer, /aria-pressed="false"/);

  // Answer Q1, advance to Q2, then read the nav buttons again. Q1 now carries
  // `answered` + `aria-pressed="true"`; Q2 is current + aria-current.
  harness.dispatch('grammar-save-mini-test-response', {
    formData: grammarResponseFormData({ answer: q1Value }),
    advance: true,
  });
  grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.session.currentIndex, 1, 'advance moved to Q2');
  sessionHtml = u4ScopeToSessionHtml(harness.render());

  const answeredButton = sessionHtml.match(
    /<button[^>]*data-index="0"[^>]*>/,
  )?.[0];
  assert.ok(answeredButton, 'Q1 nav button is rendered');
  assert.match(answeredButton, /class="[^"]*\banswered\b[^"]*"/);
  assert.match(answeredButton, /aria-pressed="true"/);
  assert.doesNotMatch(answeredButton, /aria-current="step"/);

  const currentQ2 = sessionHtml.match(
    /<button[^>]*data-index="1"[^>]*>/,
  )?.[0];
  assert.ok(currentQ2, 'Q2 nav button is rendered');
  assert.match(currentQ2, /aria-current="step"/);
  assert.match(currentQ2, /aria-pressed="false"/);
});

test('U4 Phase 3: post-finish review renders score card + expandable per-question rows', () => {
  const { harness, sample } = u4HarnessWithMiniSet();

  // Answer only Q1 correctly, leave the rest Blank, then finish.
  harness.dispatch('grammar-save-mini-test-response', {
    formData: grammarResponseFormData(sample.correctResponse),
    advance: false,
  });
  harness.dispatch('grammar-finish-mini-test');

  const grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'summary');
  const review = grammar.summary.miniTestReview;
  assert.equal(review.questions.length, 8);

  const reviewHtml = u4ScopeToReviewHtml(harness.render());

  // Score card: `X of N correct` + percentage caption.
  assert.match(reviewHtml, /Mini Test results/i);
  assert.match(reviewHtml, /Your results/);
  assert.match(reviewHtml, /1 of 8 correct/);
  assert.match(reviewHtml, /13% accuracy/);

  // Expandable per-question rows use `<details><summary>` so a11y keyboard
  // users get native disclosure semantics and SSR renders the body.
  const detailsCount = (reviewHtml.match(/<details class="grammar-mini-review-item/g) || []).length;
  assert.equal(detailsCount, 8, 'every question renders as a <details> row');

  // Q1 was correct: chip reads `Correct`, no `Practise this later` button.
  assert.match(reviewHtml, /data-index="0"[\s\S]*?<span class="chip good">Correct<\/span>/);
  const q1Slice = reviewHtml.match(
    /<details class="grammar-mini-review-item correct" data-index="0"[\s\S]*?<\/details>/,
  )?.[0];
  assert.ok(q1Slice, 'Q1 slice rendered');
  assert.doesNotMatch(q1Slice, /Practise this later/);

  // Q2 was Blank: chip reads `Blank` (never `Wrong`); a `Practise this later`
  // button is present with `data-concept-id` set from the item's skillIds.
  const q2Slice = reviewHtml.match(
    /<details class="grammar-mini-review-item blank" data-index="1"[\s\S]*?<\/details>/,
  )?.[0];
  assert.ok(q2Slice, 'Q2 slice rendered');
  assert.match(q2Slice, /<span class="chip muted">Blank<\/span>/);
  assert.doesNotMatch(q2Slice, /Wrong/);
  assert.match(q2Slice, /Practise this later/);
  assert.match(q2Slice, /data-action="grammar-focus-concept"/);
  assert.match(q2Slice, /data-concept-id="[a-z_]+/);
  assert.match(q2Slice, /<dt>Your answer<\/dt><dd>Blank<\/dd>/);

  // Forbidden-terms sweep on the full review HTML — the post-finish panel
  // must remain child-facing.
  for (const term of GRAMMAR_CHILD_FORBIDDEN_TERMS) {
    assert.doesNotMatch(
      reviewHtml,
      new RegExp(escapeRegExp(term), 'i'),
      `forbidden term leaked into post-finish review HTML: ${term}`,
    );
  }
});

test('U4 Phase 3: review Practise this later dispatches grammar-focus-concept with the missed concept id', () => {
  const { harness, sample } = u4HarnessWithMiniSet();
  // Leave every question Blank, then finish.
  harness.dispatch('grammar-finish-mini-test');

  let grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'summary');
  const missedQuestion = grammar.summary.miniTestReview.questions.find(
    (question) => !question.answered,
  );
  assert.ok(missedQuestion, 'at least one missed question to review');
  const missedConceptId = missedQuestion.item.skillIds[0]
    || missedQuestion.item.replay?.conceptIds?.[0]
    || '';
  assert.ok(missedConceptId, 'missed question carries a concept id');

  const reviewHtml = u4ScopeToReviewHtml(harness.render());
  const button = reviewHtml.match(
    new RegExp(
      `<button[^>]*data-concept-id="${escapeRegExp(missedConceptId)}"[^>]*>Practise this later<\\/button>`,
    ),
  )?.[0];
  assert.ok(button, 'Practise this later button wired to the missed concept id');

  // Dispatching the action flips the focus preference + phase as per
  // `grammar-focus-concept` (added in U2) — the UI now routes to focused
  // practice with the missed concept id.
  harness.dispatch('grammar-focus-concept', { conceptId: missedConceptId });
  grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.prefs.focusConceptId, missedConceptId);
  // U2 contract: focus-concept takes the learner out of the mini-set phase
  // and into a fresh focused session on that concept.
  assert.ok(['session', 'dashboard'].includes(grammar.phase), 'phase routed to focused practice');
  // Avoid `void` above — explicitly assert the phase is no longer summary.
  assert.notEqual(grammar.phase, 'summary');
  // sample is unused in this assertion — referenced to silence lint noise.
  void sample;
});

test('U4 Phase 3: review for a fully-blank mini-set shows 0 of N correct and all Blank rows', () => {
  const { harness } = u4HarnessWithMiniSet();
  harness.dispatch('grammar-finish-mini-test');

  const grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'summary');

  const reviewHtml = u4ScopeToReviewHtml(harness.render());
  assert.match(reviewHtml, /0 of 8 correct/);
  // Every row carries the `blank` class and the `Blank` chip — never `Wrong`.
  const blankCount = (reviewHtml.match(/grammar-mini-review-item blank/g) || []).length;
  assert.equal(blankCount, 8);
  assert.doesNotMatch(reviewHtml, /Wrong/);
  // Unanswered rows surface the Worker's `feedbackShort` (`No answer saved.`)
  // in the Why body so the learner sees why the row is Blank.
  assert.match(reviewHtml, /No answer saved\./);
});

test('U4 Phase 3: mini-test timer chip uses minutes:seconds format alongside Timed test badge', () => {
  // The timer chip is rendered by `MiniTestStatus` (GrammarSessionScene).
  // The `remainingMs <= 60_000` warning-class branch exists in the
  // component and flips at runtime via `useMiniTestRemaining` when the
  // React hook re-reads `Date.now()` through the 1 Hz interval. The SSR
  // harness cannot advance the hook's internal clock — pointer-capture,
  // React state, and `setInterval` are explicitly out of scope per the
  // plan's SSR limits note. We instead pin the fact that the initial
  // render contains a `Time left M:SS` chip alongside the `Timed test`
  // badge; the warning branch is covered end-to-end by the timer-expiry
  // auto-finish test above (`timer expiry auto-finishes`), which
  // exercises the expiresAt boundary through the Worker state machine.
  const { harness } = u4HarnessWithMiniSet();
  const sessionHtml = u4ScopeToSessionHtml(harness.render());
  assert.match(sessionHtml, /Timed test/);
  assert.match(sessionHtml, /Time left \d+:\d{2}/);
});

test('Grammar surface exposes post-answer repair actions without local scoring', () => {
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

  // U3: pre-answer path surfaces one task + one primary action — no
  // faded/similar buttons visible before marking. The actions themselves
  // remain wired and dispatchable (Worker owns authority), but the UI
  // only reveals them after submission so children see a single primary
  // action at a time.
  let html = harness.render();
  assert.doesNotMatch(html, /Faded support/);
  assert.doesNotMatch(html, /Similar problem/);

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

test('Grammar session exposes non-scored AI enrichment triggers after marking', () => {
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

  // U3: pre-answer session hides every help surface — no AI trigger
  // buttons visible until the learner has submitted an answer.
  let html = harness.render();
  assert.doesNotMatch(html, /Explain this/);
  assert.doesNotMatch(html, /Explain another way/);
  assert.doesNotMatch(html, /Revision cards/);

  // U3 follower: the AI enrichment triggers surface in the wrong-answer
  // branch of feedback (correct answers resolve with a single-line
  // explanation + Next question only, per plan §U3 lines 592-593).
  const wrongAnswer = sample.sample.inputSpec.options.find(
    (option) => option.value !== sample.correctResponse.answer,
  ).value;
  harness.dispatch('grammar-submit-form', {
    formData: grammarResponseFormData({ answer: wrongAnswer }),
  });
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'feedback');

  // U3: feedback phase relabels the existing AI enrichment trigger to
  // `Explain another way`; the revision-card trigger keeps its label.
  html = harness.render();
  assert.match(html, /Explain another way/);
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

test('Grammar manual-review feedback is neutral and hides repair actions', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-start', {
    payload: {
      roundLength: 1,
      templateId: 'build_noun_phrase',
      seed: 1,
    },
  });

  harness.dispatch('grammar-submit-form', {
    formData: grammarResponseFormData({
      part1: 'The nervous young',
      part2: 'explorer',
      part3: 'from our class',
    }),
  });

  const grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'feedback');
  assert.equal(grammar.feedback.result.nonScored, true);
  assert.equal(grammar.feedback.result.manualReviewOnly, true);

  let html = harness.render();
  assert.match(html, /class="feedback neutral"/);
  assert.match(html, /Saved for review\./);
  assert.match(html, /not auto-marked for mastery/i);
  assert.doesNotMatch(html, /Retry/);
  assert.doesNotMatch(html, /Worked solution/);
  assert.doesNotMatch(html, /Similar problem/);
  assert.doesNotMatch(html, /Explain another way/);
  assert.doesNotMatch(html, /Revision cards/);

  harness.dispatch('grammar-continue');
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'summary');
  html = harness.render();
  assert.match(html, /Saved for review/);
  assert.doesNotMatch(html, /0% accuracy/);
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

test('Grammar dashboard disables mode cards, controls, and Begin button while a command is pending', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.store.updateSubjectUi('grammar', (current) => ({
    ...normaliseGrammarReadModel(current, learnerId),
    pendingCommand: 'start-session',
  }));

  const html = harness.render();
  // U8 Phase 5: Smart Practice is the sole primary card, disabled during pending.
  assert.match(html, /<button type="button" class="grammar-primary-mode selected is-disabled is-recommended" data-mode-id="smart" data-action="grammar-set-mode" data-featured="true" aria-pressed="true" disabled="">/);
  // Round length select is disabled and shows the default 5 value selected.
  assert.match(html, /<select class="input" disabled=""[^>]*><option value="3">3<\/option><option value="5" selected="">5<\/option>/);
  // U8 Phase 5: Begin button renders the pending label.
  assert.match(html, /<button class="btn primary xl" type="button" data-featured="true" disabled="">Starting\.\.\.<\/button>/);
});

test('Grammar dashboard hides adult-diagnostic goal/teaching toggles but preserves the preference round-trip', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  let html = harness.render();
  // Child dashboard surfaces Speech rate only; adult-diagnostic toggles
  // move out of the primary dashboard as of U1.
  assert.match(html, /Speech rate/);
  assert.doesNotMatch(html, /Smart Review teaching items/);
  assert.doesNotMatch(html, /Show domain before answering/);
  assert.doesNotMatch(html, /Session goal/);

  // Preference dispatchers still round-trip through the module, so a
  // later scene can surface them. The session start payload derives the
  // goal/teaching settings as before.
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
});

test('Grammar show-domain preference persists and analytics still register attempts', () => {
  // U3: the adult `domain` chip has been removed from the session surface.
  // Setting `showDomainBeforeAnswer` no longer drives visible chip copy —
  // `grammarSessionInfoChips` surfaces only child-friendly labels. The
  // preference still lives on `grammar.prefs` for future reuse, but it
  // must not gate scoring or analytics attempts. This test keeps the
  // preference-plumbing guarantee and the analytics increment invariant
  // that the original `show-domain` test protected.
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

  const html = harness.render();
  // Neither phase surfaces the adult `domain` chip any more.
  assert.doesNotMatch(html, />Adverbials<\/span>/);

  harness.dispatch('grammar-submit-form', {
    formData: grammarResponseFormData(sample.correctResponse),
  });
  // The preference still round-trips into the normalised read model.
  assert.equal(harness.store.getState().subjectUi.grammar.prefs.showDomainBeforeAnswer, false);
  // Analytics still records the attempt — U3 only touches surface chrome.
  assert.equal(
    harness.store.getState().subjectUi.grammar.analytics.concepts.find((concept) => concept.id === 'adverbials').attempts,
    1,
  );
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

  // Phase 3 U5: analytics is no longer auto-rendered beneath the summary.
  // The summary carries a `Grown-up view` button dispatching
  // `grammar-open-analytics`, which flips phase to `'analytics'` and
  // renders `GrammarAnalyticsScene`. We dispatch here to surface the
  // analytics HTML this test is asserting on.
  harness.dispatch('grammar-open-analytics');
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'analytics');

  const html = harness.render();

  assert.match(html, /Misconception repair/);
  assert.match(html, /Fronted Adverbial pattern/);
  assert.match(html, /Question-type evidence/);
  assert.match(html, /Choose the correct sentence/);
});

test('Grammar dashboard Writing Try dispatches grammar-open-transfer to the Writing Try scene', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  const dashboardHtml = harness.render();
  assert.match(dashboardHtml, /data-action="grammar-open-transfer"/);
  assert.match(dashboardHtml, /Writing Try/);

  harness.dispatch('grammar-open-transfer');
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'transfer');
  const transferHtml = harness.render();
  // Phase 3 U6b replaces the placeholder stub with the real scene. The
  // hero copy reinforces that the surface is non-scored without leaking
  // adult-diagnostic terms.
  assert.match(transferHtml, /Writing Try/);
  assert.match(transferHtml, /Nothing you write here is scored/);
  assert.match(transferHtml, /class="grammar-transfer-scene"/);
  // Back action returns the learner safely to the dashboard.
  harness.dispatch('grammar-back');
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'dashboard');
});

test('Grammar dashboard Grammar Bank card dispatches grammar-open-concept-bank to the stub scene', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-open-concept-bank');
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'bank');
  const html = harness.render();
  assert.match(html, /Grammar Bank/);
  assert.match(html, /Back to Grammar Garden/);
  harness.dispatch('grammar-back');
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'dashboard');
});

test('Grammar dashboard placeholder dispatchers are no-ops while a command is pending', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.store.updateSubjectUi('grammar', (current) => ({
    ...normaliseGrammarReadModel(current, learnerId),
    pendingCommand: 'start-session',
  }));

  harness.dispatch('grammar-open-concept-bank');
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'dashboard');
  harness.dispatch('grammar-open-transfer');
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'dashboard');
});

// U1 follower: mid-session guard. `grammar-open-concept-bank` and
// `grammar-open-transfer` must be no-ops while phase is `session` or
// `feedback` — otherwise navigating away mid-question would wipe the
// active session state. Covers `module.js` lines 281-282 and 292-293.
test('U1 follower: grammar-open-concept-bank is a no-op mid-session', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  const sample = grammarOracleSample();

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-start', {
    payload: { roundLength: 1, templateId: sample.id, seed: sample.sample.seed },
  });
  const beforeSession = harness.store.getState().subjectUi.grammar.session;
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'session');

  harness.dispatch('grammar-open-concept-bank');
  const afterGrammar = harness.store.getState().subjectUi.grammar;
  assert.equal(afterGrammar.phase, 'session', 'phase must stay session');
  assert.equal(afterGrammar.session, beforeSession, 'session object must be untouched');
});

test('U1 follower: grammar-open-transfer is a no-op mid-session', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  const sample = grammarOracleSample();

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-start', {
    payload: { roundLength: 1, templateId: sample.id, seed: sample.sample.seed },
  });
  const beforeSession = harness.store.getState().subjectUi.grammar.session;
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'session');

  harness.dispatch('grammar-open-transfer');
  const afterGrammar = harness.store.getState().subjectUi.grammar;
  assert.equal(afterGrammar.phase, 'session', 'phase must stay session');
  assert.equal(afterGrammar.session, beforeSession, 'session object must be untouched');
});

test('U1 follower: grammar-open-concept-bank and grammar-open-transfer are no-ops during feedback', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  const sample = grammarOracleSample();

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-start', {
    payload: { roundLength: 2, templateId: sample.id, seed: sample.sample.seed },
  });
  harness.dispatch('grammar-submit-form', {
    formData: grammarResponseFormData(sample.correctResponse),
  });
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'feedback');
  const beforeSession = harness.store.getState().subjectUi.grammar.session;
  const beforeFeedback = harness.store.getState().subjectUi.grammar.feedback;

  harness.dispatch('grammar-open-concept-bank');
  let grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'feedback', 'phase stays feedback after concept-bank');
  assert.equal(grammar.session, beforeSession, 'session untouched after concept-bank');
  assert.equal(grammar.feedback, beforeFeedback, 'feedback untouched after concept-bank');

  harness.dispatch('grammar-open-transfer');
  grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'feedback', 'phase stays feedback after open-transfer');
  assert.equal(grammar.session, beforeSession, 'session untouched after open-transfer');
  assert.equal(grammar.feedback, beforeFeedback, 'feedback untouched after open-transfer');
});

test('Punctuation remains separately registered from Grammar Bellstorm bridge copy', () => {
  const grammarSubject = getSubject('grammar');
  const punctuationSubject = getSubject('punctuation');

  assert.equal(grammarSubject.id, 'grammar');
  assert.equal(punctuationSubject.id, 'punctuation');
  assert.notEqual(grammarSubject, punctuationSubject);
  assert.equal(punctuationSubject.name, 'Punctuation');
  assert.equal(punctuationSubject.available, true);
  // Phase 2 blurb framed by practice modes rather than claiming "full KS2 punctuation map".
  assert.match(punctuationSubject.blurb, /KS2 punctuation progression/);
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

test('Grammar remote command defers monster celebrations until session end', async () => {
  const calls = [];
  const context = {
    appState: {
      learners: { selectedId: 'learner-a' },
      subjectUi: {
        grammar: normaliseGrammarReadModel({
          phase: 'session',
          session: { id: 'grammar-session', mode: 'smart' },
        }, 'learner-a'),
      },
    },
    runtimeReadOnly: false,
    subjectCommands: {
      send() {
        return Promise.resolve({
          learnerId: 'learner-a',
          subjectReadModel: normaliseGrammarReadModel({
            learnerId: 'learner-a',
            phase: 'summary',
            summary: { sessionId: 'grammar-session' },
          }, 'learner-a'),
          projections: {
            rewards: {
              toastEvents: [{ id: 'toast-a' }],
              events: [{ id: 'reward.monster:learner-a:grammar:bracehart:caught', type: 'reward.monster', kind: 'caught' }],
            },
          },
        });
      },
    },
    store: {
      getState() { return context.appState; },
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
      pushToasts(events) { calls.push(['pushToasts', events]); },
      pushMonsterCelebrations(events) { calls.push(['pushMonsterCelebrations', events]); },
      deferMonsterCelebrations(events) { calls.push(['deferMonsterCelebrations', events]); },
      releaseMonsterCelebrations() { calls.push(['releaseMonsterCelebrations']); return true; },
    },
  };

  grammarModule.handleAction('grammar-continue', context);
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(calls.map(([name]) => name), [
    'pushToasts',
    'deferMonsterCelebrations',
    'releaseMonsterCelebrations',
  ]);
  assert.equal(calls.some(([name]) => name === 'pushMonsterCelebrations'), false);
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

test('Grammar "More practice" disclosure exposes secondary modes without locked placeholders', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  const html = harness.render();

  // Secondary modes from `GRAMMAR_MORE_PRACTICE_MODES` render inside the
  // `<details class="grammar-more-practice">` disclosure as active cards.
  assert.match(html, /<details class="grammar-more-practice"><summary>More practice<\/summary>/);
  assert.match(html, /data-mode-id="learn"/);
  assert.match(html, /Learn a concept/);
  assert.match(html, /data-mode-id="surgery"/);
  assert.match(html, /Sentence Surgery/);
  assert.match(html, /data-mode-id="builder"/);
  assert.match(html, /Sentence Builder/);
  assert.match(html, /data-mode-id="worked"/);
  assert.match(html, /Worked Examples/);
  assert.match(html, /data-mode-id="faded"/);
  assert.match(html, /Faded Guidance/);
  // No locked / disabled-due-to-lock markup on the secondary grid.
  assert.doesNotMatch(html, /<button[^>]*class="grammar-secondary-mode[^"]* is-disabled"[^>]*disabled=""/);
});

// --- U5 Phase 4: Mixed practice labels on Surgery / Builder cards ---------

test('U5: Grammar dashboard renders "Mixed practice" label on Surgery and Builder secondary-mode cards', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  const html = harness.render();

  // Scope to the More practice disclosure so a stray "Mixed practice"
  // somewhere else in the app shell does not false-positive the assertion.
  const disclosureMatch = html.match(/<details class="grammar-more-practice"[\s\S]*?<\/details>/);
  assert.ok(disclosureMatch, 'More practice disclosure renders');
  const disclosure = disclosureMatch[0];

  // Surgery and Builder both carry the label under the mode title. The
  // span is scoped by `data-mode-label="<id>"` so the test can narrow
  // without matching unrelated spans.
  assert.match(disclosure, /data-mode-label="surgery"[^>]*>Mixed practice</);
  assert.match(disclosure, /data-mode-label="builder"[^>]*>Mixed practice</);
  // The label renders exactly twice on the dashboard (one per mode).
  const labelCount = (disclosure.match(/Mixed practice/g) || []).length;
  assert.equal(labelCount, 2, 'Mixed practice label appears on exactly two cards');
});

test('U5: Grammar dashboard does NOT render "Mixed practice" on Learn, Worked, or Faded cards', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  const html = harness.render();

  const disclosureMatch = html.match(/<details class="grammar-more-practice"[\s\S]*?<\/details>/);
  assert.ok(disclosureMatch, 'More practice disclosure renders');
  const disclosure = disclosureMatch[0];

  // Learn / Worked / Faded cards honour focus — no "Mixed practice" tag.
  for (const modeId of ['learn', 'worked', 'faded']) {
    const cardMatch = disclosure.match(
      new RegExp(`<button[^>]*data-mode-id="${modeId}"[\\s\\S]*?</button>`),
    );
    assert.ok(cardMatch, `${modeId} card renders`);
    assert.doesNotMatch(cardMatch[0], /Mixed practice/);
    assert.doesNotMatch(cardMatch[0], /data-mode-label="[^"]+"/);
  }
});

test('U5: Grammar primary cards (Smart, Trouble, Mini Test, Bank) never render the "Mixed practice" label', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  const html = harness.render();

  // Primary mode cards live outside the "More practice" disclosure. Scope
  // to the primary section and assert no Mixed practice copy leaks into
  // Smart / Trouble / Mini Test / Bank cards.
  const primaryMatch = html.match(/<section class="grammar-primary-modes"[\s\S]*?<\/section>/);
  assert.ok(primaryMatch, 'primary modes section renders');
  assert.doesNotMatch(primaryMatch[0], /Mixed practice/);
  assert.doesNotMatch(primaryMatch[0], /data-mode-label="/);
});

test('U5: data-grammar-phase-root="dashboard" landmark is preserved with the Mixed practice labels', () => {
  // U2 Phase 4 hardened the dashboard landmark — this test ensures U5's
  // label addition does not disturb the root wrapper. Regression-lock.
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  const html = harness.render();
  assert.match(html, /data-grammar-phase-root="dashboard"/);
  // And the label is still rendered inside the dashboard.
  assert.match(html, /data-mode-label="surgery"/);
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

  // U8 Phase 5: `Fix Trouble Spots` is now a secondary link, not a primary card.
  // Verify the mode is set correctly (dispatch still works).
  const html = harness.render();
  assert.match(html, /data-mode-id="trouble"/);

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
  // U1 dashboard: surgery is a "More practice" secondary mode, selected.
  assert.match(harness.render(), /<button type="button" class="grammar-secondary-mode selected" data-mode-id="surgery"/);

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
  // U1 dashboard: builder is a "More practice" secondary mode, selected.
  assert.match(harness.render(), /<button type="button" class="grammar-secondary-mode selected" data-mode-id="builder"/);

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
  const html = harness.render();
  assert.match(html, /Faded guidance/);
  assert.doesNotMatch(html, /Worked example/);
  assert.doesNotMatch(html, />Model</);
});

// U0 follower. The helper `normaliseGrammarRewardState` already has direct
// coverage in `tests/grammar-monster-roster.test.js`, but without a JSX-level
// assertion nothing in the suite turns red if a future refactor unwires the
// call from `GrammarPracticeSurface.resolveGrammarRewardState`. This test
// feeds a retired-id-only persisted state through the real SSR harness and
// asserts Concordium's Codex count reflects the unioned view — which only
// holds when the resolver routes through the normaliser before reading the
// reward state.
test('Grammar surface routes persisted retired-id state through the normaliser before rendering', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;
  const preFlipKey = grammarMasteryKey('noun_phrases');

  // Persist *only* a retired-id entry (`glossbloom`). No `bracehart`, no
  // `concordium` on disk. If `resolveGrammarRewardState` stopped calling the
  // normaliser, Concordium would render `0/18 Codex` and Bracehart would
  // render `0/6 Codex` because no active direct has any mastered keys.
  harness.repositories.gameState.write(learnerId, 'monster-codex', {
    glossbloom: {
      branch: 'b1',
      caught: true,
      mastered: [preFlipKey],
      stage: 1,
    },
  });
  harness.store.updateSubjectUi('grammar', normaliseGrammarReadModel({}, learnerId));
  harness.dispatch('open-subject', { subjectId: 'grammar' });

  const html = harness.render();

  // Concordium surfaces the unioned retired-id progress.
  assert.match(html, /Concordium/);
  assert.match(html, /1\/18 Codex/);
});

// ----------------------------------------------------------------------------
// U6a: module-level `grammar-save-transfer-evidence` dispatcher + error map.
// ----------------------------------------------------------------------------
function buildGrammarTransferDispatchContext({
  pendingCommand = '',
  sendImpl,
  initialTransferLane,
} = {}) {
  const toasts = [];
  const celebrations = [];
  const initialUi = normaliseGrammarReadModel({
    transferLane: initialTransferLane,
    pendingCommand,
  }, 'learner-a');
  const context = {
    appState: {
      learners: { selectedId: 'learner-a' },
      subjectUi: { grammar: initialUi },
    },
    runtimeReadOnly: false,
    subjectCommands: {
      send: sendImpl,
    },
    store: {
      getState() {
        return context.appState;
      },
      updateSubjectUi(subjectId, updater) {
        const previous = context.appState.subjectUi[subjectId] || {};
        const next = typeof updater === 'function' ? updater(previous) : { ...previous, ...updater };
        context.appState = {
          ...context.appState,
          subjectUi: { ...context.appState.subjectUi, [subjectId]: next },
        };
      },
      updateSubjectUiForLearner(learnerId, subjectId, updater) {
        if (learnerId !== 'learner-a') return false;
        context.store.updateSubjectUi(subjectId, updater);
        return true;
      },
      pushToasts(events) { toasts.push(...events); },
      pushMonsterCelebrations(events) { celebrations.push(...events); },
      reloadFromRepositories() {},
    },
    toasts,
    celebrations,
  };
  return context;
}

test('U6a: grammar-save-transfer-evidence dispatches Worker save-transfer-evidence with exact payload (no checklist alias)', async () => {
  const observed = { request: null };
  let resolveCommand;
  const context = buildGrammarTransferDispatchContext({
    sendImpl(request) {
      observed.request = request;
      return new Promise((resolve) => { resolveCommand = resolve; });
    },
  });

  const handled = grammarModule.handleAction('grammar-save-transfer-evidence', {
    ...context,
    data: {
      payload: {
        promptId: 'storm-scene',
        writing: 'Suddenly, the storm broke. Lightning, which split the sky, lit the fields.',
        selfAssessment: [{ key: 'fronted-adverbial', checked: true }, { key: 'parenthesis-commas', checked: false }],
      },
    },
  });
  assert.equal(handled, true);

  // Worker command boundary receives exact shape; no `checklist` alias.
  assert.ok(observed.request, 'subjectCommands.send must be called');
  assert.equal(observed.request.subjectId, 'grammar');
  assert.equal(observed.request.learnerId, 'learner-a');
  assert.equal(observed.request.command, 'save-transfer-evidence');
  assert.deepEqual(Object.keys(observed.request.payload).sort(), ['promptId', 'selfAssessment', 'writing']);
  assert.equal(observed.request.payload.promptId, 'storm-scene');
  assert.equal(observed.request.payload.writing.startsWith('Suddenly'), true);
  assert.deepEqual(observed.request.payload.selfAssessment, [
    { key: 'fronted-adverbial', checked: true },
    { key: 'parenthesis-commas', checked: false },
  ]);
  // No checklist alias sneaking into the payload
  assert.equal(Object.prototype.hasOwnProperty.call(observed.request.payload, 'checklist'), false);

  // Worker returns a read model with the new evidence; mastery stays untouched.
  const masteryBefore = context.appState.subjectUi.grammar.analytics;
  resolveCommand({
    subjectReadModel: normaliseGrammarReadModel({
      learnerId: 'learner-a',
      phase: 'dashboard',
      transferLane: {
        mode: 'non-scored',
        prompts: [{ id: 'storm-scene', title: 'Storm scene', brief: 'Describe a storm.', grammarTargets: ['adverbials'], checklist: ['fronted-adverbial'] }],
        limits: { maxPrompts: 20, historyPerPrompt: 5, writingCapChars: 2000 },
        evidence: [{
          promptId: 'storm-scene',
          latest: {
            writing: 'Suddenly, the storm broke. Lightning, which split the sky, lit the fields.',
            selfAssessment: [{ key: 'fronted-adverbial', checked: true }, { key: 'parenthesis-commas', checked: false }],
            savedAt: 1_777_000_000_000,
            source: 'transfer-lane',
          },
          history: [],
          updatedAt: 1_777_000_000_000,
        }],
      },
    }, 'learner-a'),
    projections: { rewards: { toastEvents: [], events: [] } },
  });
  await Promise.resolve();
  await Promise.resolve();

  const grammar = context.appState.subjectUi.grammar;
  const evidence = grammar.transferLane.evidence.find((entry) => entry.promptId === 'storm-scene');
  assert.ok(evidence, 'transferLane.evidence must update after save');
  assert.equal(evidence.latest.writing.startsWith('Suddenly'), true);
  // Mastery node unchanged (object-identity-ish — same keys/values)
  assert.equal(JSON.stringify(grammar.analytics), JSON.stringify(masteryBefore));
  // No reward events fired
  assert.equal(context.toasts.length, 0);
  assert.equal(context.celebrations.length, 0);
});

test('U6a: grammar-save-transfer-evidence short-circuits when pendingCommand is in flight', () => {
  let sendCalled = false;
  const context = buildGrammarTransferDispatchContext({
    pendingCommand: 'save-transfer-evidence',
    sendImpl() {
      sendCalled = true;
      return Promise.resolve({});
    },
  });

  grammarModule.handleAction('grammar-save-transfer-evidence', {
    ...context,
    data: { payload: { promptId: 'p1', writing: 'draft', selfAssessment: [] } },
  });

  assert.equal(sendCalled, false, 'pendingCommand short-circuit must prevent double-dispatch');
});

test('U6a: GRAMMAR_TRANSFER_ERROR_COPY maps every known Worker error code to UK-English child copy', () => {
  const codes = [
    'grammar_transfer_unavailable_during_mini_test',
    'grammar_transfer_prompt_not_found',
    'grammar_transfer_writing_required',
    'grammar_transfer_quota_exceeded',
  ];
  for (const code of codes) {
    assert.ok(GRAMMAR_TRANSFER_ERROR_COPY[code], `copy for ${code} must be defined`);
    assert.equal(typeof GRAMMAR_TRANSFER_ERROR_COPY[code], 'string');
    assert.ok(GRAMMAR_TRANSFER_ERROR_COPY[code].length > 0);
  }
  assert.equal(GRAMMAR_TRANSFER_ERROR_COPY.grammar_transfer_unavailable_during_mini_test, 'You cannot save writing during a mini test.');
  assert.equal(GRAMMAR_TRANSFER_ERROR_COPY.grammar_transfer_prompt_not_found, 'That writing prompt is not available.');
  assert.equal(GRAMMAR_TRANSFER_ERROR_COPY.grammar_transfer_writing_required, 'Write at least a few words before saving.');
  assert.equal(GRAMMAR_TRANSFER_ERROR_COPY.grammar_transfer_quota_exceeded, 'You have too many saved writings. Delete one to save more.');
});

test('U6a: translateGrammarTransferError routes the four Worker error codes through child copy', async () => {
  const cases = [
    { code: 'grammar_transfer_unavailable_during_mini_test' },
    { code: 'grammar_transfer_prompt_not_found' },
    { code: 'grammar_transfer_writing_required' },
    { code: 'grammar_transfer_quota_exceeded' },
  ];
  for (const { code } of cases) {
    // err.extra.code is the canonical location (see engine.js:1740)
    const withExtra = { message: 'raw', extra: { code } };
    // err.payload.code is the transport shape seen by the client command helper
    const withPayload = { message: 'raw', payload: { code } };
    assert.equal(translateGrammarTransferError(withExtra), GRAMMAR_TRANSFER_ERROR_COPY[code]);
    assert.equal(translateGrammarTransferError(withPayload), GRAMMAR_TRANSFER_ERROR_COPY[code]);
  }
  assert.equal(translateGrammarTransferError({ message: 'something' }), GRAMMAR_TRANSFER_GENERIC_ERROR_COPY);
  assert.equal(translateGrammarTransferError(null), GRAMMAR_TRANSFER_GENERIC_ERROR_COPY);
});

test('U6a: grammar-save-transfer-evidence routes Worker errors through child copy into rm.error', async () => {
  const errorCodes = [
    'grammar_transfer_unavailable_during_mini_test',
    'grammar_transfer_prompt_not_found',
    'grammar_transfer_writing_required',
    'grammar_transfer_quota_exceeded',
  ];
  for (const code of errorCodes) {
    const error = Object.assign(new Error('raw worker message'), { payload: { code } });
    const context = buildGrammarTransferDispatchContext({
      sendImpl() { return Promise.reject(error); },
    });

    grammarModule.handleAction('grammar-save-transfer-evidence', {
      ...context,
      data: { payload: { promptId: 'p1', writing: 'draft', selfAssessment: [] } },
    });
    // Let the rejected promise resolve through the micro-task queue.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const grammar = context.appState.subjectUi.grammar;
    assert.equal(grammar.error, GRAMMAR_TRANSFER_ERROR_COPY[code], `error copy for ${code}`);
    assert.equal(grammar.pendingCommand, '', 'pendingCommand clears after error');
  }
});

test('U6a: grammar-save-transfer-evidence dispatch drops non-object selfAssessment entries silently', () => {
  const observed = { request: null };
  const context = buildGrammarTransferDispatchContext({
    sendImpl(request) {
      observed.request = request;
      return new Promise(() => {}); // never resolve
    },
  });

  grammarModule.handleAction('grammar-save-transfer-evidence', {
    ...context,
    data: {
      payload: {
        promptId: 'p1',
        writing: 'draft',
        selfAssessment: [
          { key: 'ok', checked: true },
          null,
          'string-entry',
          { key: '', checked: true }, // empty key dropped
          { key: 'ok2', checked: false },
        ],
      },
    },
  });

  assert.ok(observed.request);
  assert.deepEqual(observed.request.payload.selfAssessment, [
    { key: 'ok', checked: true },
    { key: 'ok2', checked: false },
  ]);
});

// ----------------------------------------------------------------------------
// U2: Grammar Bank scene + concept detail modal.
//
// SSR limits — documented here so readers know what is (and is not) asserted:
//   * Focus management beyond the SSR-visible `data-focus-return-id`
//     attribute cannot be asserted here. The attribute sits on the
//     triggering card; the modal restores focus to it on close via a
//     runtime effect. That effect is a browser side-effect and is
//     covered by manual QA, not the SSR harness.
//   * Escape-key closes the modal via a document-level keydown listener.
//     The SSR harness does not simulate document-level events, so we
//     assert the dispatcher exists via the data-action attribute + a
//     direct dispatch of `grammar-concept-detail-close` through the
//     action bus.
//   * `createPortal` targets `document.body` at runtime, but the SSR
//     renderer returns the JSX tree inline when no document is present
//     (see `GrammarConceptDetailModal.jsx`) so the rendered HTML still
//     contains the modal markup for assertions.
// ----------------------------------------------------------------------------

function openGrammarBankHarness() {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-open-concept-bank');
  return harness;
}

test('U2: Grammar Bank renders 18 concept cards when filters are all/all', () => {
  const harness = openGrammarBankHarness();
  const html = harness.render();
  assert.match(html, /class="grammar-bank-scene"/);
  assert.match(html, /Grammar Bank/);
  assert.match(html, /Back to Grammar Garden/);
  // Exactly 18 concept cards render in the default all/all view.
  const cards = html.match(/<article[^>]*class="grammar-bank-card[^"]*"/g) || [];
  assert.equal(cards.length, 18, 'bank renders 18 concept cards in default view');
  // Aggregate summary row exposes a Total card for accessibility.
  assert.match(html, /data-aggregate-id="total"/);
});

test('U2: Grammar Bank status filter "trouble" narrows to needs-repair concepts', () => {
  const harness = openGrammarBankHarness();
  const learnerId = harness.store.getState().learners.selectedId;

  // Seed one concept with needs-repair confidence so the trouble filter has
  // at least one match; every other concept should be excluded.
  harness.store.updateSubjectUi('grammar', (current) => {
    const normalised = normaliseGrammarReadModel(current, learnerId);
    const concepts = normalised.analytics.concepts.map((concept) => (
      concept.id === 'relative_clauses'
        ? { ...concept, confidenceLabel: 'needs-repair', attempts: 4, correct: 1, wrong: 3 }
        : concept
    ));
    return {
      ...normalised,
      analytics: { ...normalised.analytics, concepts },
    };
  });

  harness.dispatch('grammar-concept-bank-filter', { value: 'trouble' });
  const html = harness.render();
  // The chip toggles aria-pressed; the grid narrows to the seeded concept.
  // Attribute order in the rendered HTML is aria-pressed first, then
  // data-value, so we assert both attrs appear on the same <button> element.
  assert.match(html, /aria-pressed="true"[^>]*data-value="trouble"/);
  const cards = html.match(/<article[^>]*class="grammar-bank-card[^"]*"[^>]*data-concept-id="([^"]+)"/g) || [];
  assert.equal(cards.length, 1, 'only the needs-repair concept matches the trouble filter');
  assert.match(cards[0], /data-concept-id="relative_clauses"/);
  // Status chip on the card surfaces child copy, not internal labels.
  assert.match(html, /Trouble spot/);
});

test('U2: Grammar Bank cluster filter "bracehart" narrows to exactly 9 concepts', () => {
  const harness = openGrammarBankHarness();
  harness.dispatch('grammar-concept-bank-cluster-filter', { value: 'bracehart' });
  const html = harness.render();
  const cards = html.match(/<article[^>]*class="grammar-bank-card[^"]*"/g) || [];
  assert.equal(cards.length, 9, 'bracehart cluster contains exactly 9 concepts');
  // Cluster chip toggles aria-pressed.
  assert.match(html, /aria-pressed="true"[^>]*data-value="bracehart"/);
  // Every rendered card carries the bracehart cluster badge.
  const badges = html.match(/grammar-bank-card-cluster-badge"[^>]*data-cluster-id="bracehart"/g) || [];
  assert.equal(badges.length, 9);
});

test('U2: Grammar Bank cluster filter "concordium" shows all 18 concepts', () => {
  const harness = openGrammarBankHarness();
  harness.dispatch('grammar-concept-bank-cluster-filter', { value: 'concordium' });
  const html = harness.render();
  const cards = html.match(/<article[^>]*class="grammar-bank-card[^"]*"/g) || [];
  assert.equal(cards.length, 18, 'concordium (aggregate) shows every concept');
});

test('U2: Grammar Bank search "clause" narrows case-insensitively', () => {
  const harness = openGrammarBankHarness();
  // Simulate a committed search (input commit path goes through the action).
  harness.dispatch('grammar-concept-bank-search', { value: 'Clause' });
  const html = harness.render();
  const cards = html.match(/<article[^>]*class="grammar-bank-card[^"]*"[^>]*data-concept-id="([^"]+)"/g) || [];
  assert.ok(cards.length >= 2, 'search for "clause" matches at least two concepts');
  assert.ok(cards.some((markup) => /data-concept-id="clauses"/.test(markup)));
  assert.ok(cards.some((markup) => /data-concept-id="relative_clauses"/.test(markup)));
  // Non-matching concepts are absent.
  assert.ok(!cards.some((markup) => /data-concept-id="modal_verbs"/.test(markup)));
});

test('U2: Grammar Bank "Practise 5" button dispatches grammar-focus-concept with concept id', () => {
  // Use the full grammar harness so the server engine service is available;
  // `grammar-focus-concept` routes through `service.savePrefs` +
  // `service.startSession` so it needs a real engine.
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-open-concept-bank');
  // Assert the button markup carries the action + concept id so the
  // keyboard / click handler both route the same id.
  const html = harness.render();
  assert.match(html, /data-action="grammar-focus-concept"[^>]*data-concept-id="word_classes"/);

  // Dispatch the action directly and verify the prefs + phase transition.
  harness.dispatch('grammar-focus-concept', { conceptId: 'word_classes' });
  const grammar = harness.store.getState().subjectUi.grammar;
  // focusConceptId persists on the prefs so subsequent rounds keep the focus.
  assert.equal(grammar.prefs.focusConceptId, 'word_classes');
  // The focus mode is a focus-using mode (smart/learn/worked/faded — NOT
  // trouble/surgery/builder which drop focus).
  assert.ok(['smart', 'learn', 'worked', 'faded'].includes(grammar.prefs.mode));
  // The start-session transition flips the phase out of `bank`.
  assert.notEqual(grammar.phase, 'bank');
  // The session carries the focus concept id so the first question targets it.
  assert.equal(grammar.session?.focusConceptId, 'word_classes');
});

test('U2: Grammar Bank detail modal opens with role="dialog" and aria-modal="true"', () => {
  const harness = openGrammarBankHarness();
  harness.dispatch('grammar-concept-detail-open', { conceptId: 'relative_clauses' });
  const html = harness.render();
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /aria-labelledby="grammar-concept-detail-title-relative_clauses"/);
  // Modal body carries the concept name + example + close button.
  assert.match(html, /Relative clauses/);
  assert.match(html, /data-action="grammar-concept-detail-close"/);
  // At least one example sentence for the concept renders inside the modal.
  assert.match(html, /The dog, which was muddy, ran inside\./);
});

test('U2: Grammar Bank detail modal exposes focus-return marker on the triggering card', () => {
  const harness = openGrammarBankHarness();
  const html = harness.render();
  // Every concept card carries a `data-focus-return-id` marker on its
  // `See example` button so the modal close hook can restore focus.
  assert.match(html, /data-focus-return-id="grammar-bank-concept-card-relative_clauses"/);
});

test('U2: Grammar Bank empty state renders "No concepts match" when filters exclude everything', () => {
  const harness = openGrammarBankHarness();
  // A search that matches no concept name / summary / example / domain.
  // U2 follower: when the search query is non-empty, the empty state swaps
  // to the search-aware copy. The filter-only empty copy is covered by a
  // dedicated follower test further down.
  harness.dispatch('grammar-concept-bank-search', { value: 'zzz-unreachable-token' });
  const html = harness.render();
  const cards = html.match(/<article[^>]*class="grammar-bank-card[^"]*"/g) || [];
  assert.equal(cards.length, 0, 'no concept cards render when the search excludes everything');
  assert.match(html, /No concepts match\. Try clearing your search or changing the filters\./);
});

test('U2: Grammar Bank HTML contains none of GRAMMAR_CHILD_FORBIDDEN_TERMS', () => {
  const harness = openGrammarBankHarness();
  harness.dispatch('grammar-concept-detail-open', { conceptId: 'clauses' });
  const html = harness.render();
  // Narrow to the bank scene markup to avoid sweeping the adult analytics
  // disclosure (which lives behind a sibling `<details>`).
  const sceneMatch = html.match(/<section class="grammar-bank-scene"[\s\S]*?<\/section>/);
  assert.ok(sceneMatch, 'Grammar Bank scene renders');
  const sceneHtml = sceneMatch[0];
  for (const term of GRAMMAR_CHILD_FORBIDDEN_TERMS) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.doesNotMatch(sceneHtml, new RegExp(escaped, 'i'), `forbidden term leaked: ${term}`);
  }
  // Reserved monsters must never appear as cluster badges in the bank.
  assert.doesNotMatch(sceneHtml, /Glossbloom|Loomrill|Mirrane/i);
});

test('U2: Grammar Bank concept cards never render raw percentages', () => {
  const harness = openGrammarBankHarness();
  const learnerId = harness.store.getState().learners.selectedId;
  // Seed a non-trivial attempts count so any accidental percentage render
  // would surface in the card markup.
  harness.store.updateSubjectUi('grammar', (current) => {
    const normalised = normaliseGrammarReadModel(current, learnerId);
    const concepts = normalised.analytics.concepts.map((concept) => (
      concept.id === 'noun_phrases'
        ? { ...concept, attempts: 10, correct: 7, wrong: 3 }
        : concept
    ));
    return {
      ...normalised,
      analytics: { ...normalised.analytics, concepts },
    };
  });
  const html = harness.render();
  const cardsHtml = (html.match(/<article[^>]*class="grammar-bank-card[^"]*"[\s\S]*?<\/article>/g) || []).join('\n');
  assert.ok(cardsHtml.length > 0, 'bank cards render');
  assert.doesNotMatch(cardsHtml, /\d+%/, 'percentage characters must not appear in concept cards');
});

test('U2: Grammar Bank close action returns the learner to the dashboard', () => {
  const harness = openGrammarBankHarness();
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'bank');
  harness.dispatch('grammar-close-concept-bank');
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'dashboard');
  const html = harness.render();
  assert.match(html, /Grammar Garden/);
});

test('U2: Grammar Bank detail-close clears the detailConceptId slice', () => {
  const harness = openGrammarBankHarness();
  harness.dispatch('grammar-concept-detail-open', { conceptId: 'word_classes' });
  assert.equal(harness.store.getState().subjectUi.grammar.bank.detailConceptId, 'word_classes');
  harness.dispatch('grammar-concept-detail-close');
  assert.equal(harness.store.getState().subjectUi.grammar.bank.detailConceptId, '');
});

test('U2: Grammar Bank filter + search round-trip through the normaliser without stomping unrelated state', () => {
  const harness = openGrammarBankHarness();
  harness.dispatch('grammar-concept-bank-filter', { value: 'learning' });
  harness.dispatch('grammar-concept-bank-cluster-filter', { value: 'chronalyx' });
  harness.dispatch('grammar-concept-bank-search', { value: 'verb' });
  const grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.bank.statusFilter, 'learning');
  assert.equal(grammar.bank.clusterFilter, 'chronalyx');
  assert.equal(grammar.bank.query, 'verb');
  // Session, summary, feedback untouched.
  assert.equal(grammar.phase, 'bank');
  assert.equal(grammar.session, null);
  assert.equal(grammar.summary, null);
  assert.equal(grammar.feedback, null);
});

test('U2: Grammar Bank rejects invalid filter ids via the normaliser', () => {
  const harness = openGrammarBankHarness();
  harness.dispatch('grammar-concept-bank-filter', { value: 'bogus-status' });
  assert.equal(harness.store.getState().subjectUi.grammar.bank.statusFilter, 'all');
  harness.dispatch('grammar-concept-bank-cluster-filter', { value: 'glossbloom' });
  assert.equal(harness.store.getState().subjectUi.grammar.bank.clusterFilter, 'all');
});

// ----------------------------------------------------------------------------
// U2 follower: hyphen example swap, search-aware empty state, remote
// focus-concept chain, stale modal clear, cluster-total sublabel.
// ----------------------------------------------------------------------------

test('U2 follower: Grammar Bank empty state swaps copy when search query is non-empty', () => {
  const harness = openGrammarBankHarness();
  // Filter-only empty (no search) — existing copy.
  harness.dispatch('grammar-concept-bank-cluster-filter', { value: 'bracehart' });
  harness.dispatch('grammar-concept-bank-filter', { value: 'secure' });
  let html = harness.render();
  let cards = html.match(/<article[^>]*class="grammar-bank-card[^"]*"/g) || [];
  assert.equal(cards.length, 0, 'filter-only empty state renders');
  assert.match(html, /No concepts match your filters\. Try another status or cluster\./);
  assert.doesNotMatch(html, /Try clearing your search/);

  // Search-present empty — new copy.
  harness.dispatch('grammar-concept-bank-filter', { value: 'all' });
  harness.dispatch('grammar-concept-bank-cluster-filter', { value: 'all' });
  harness.dispatch('grammar-concept-bank-search', { value: 'zzz-unreachable-token' });
  html = harness.render();
  cards = html.match(/<article[^>]*class="grammar-bank-card[^"]*"/g) || [];
  assert.equal(cards.length, 0, 'search-present empty state renders');
  assert.match(html, /No concepts match\. Try clearing your search or changing the filters\./);
  assert.doesNotMatch(html, /Try another status or cluster/);
});

test('U2 follower: Grammar Bank hyphen_ambiguity card primary example is the man-eating shark', () => {
  const harness = openGrammarBankHarness();
  const html = harness.render();
  // The card blockquote surfaces `example` (examples[0]) from the view-model.
  // After the swap, the clear positive example must be the one on-card.
  const cardMatch = html.match(/data-concept-id="hyphen_ambiguity"[\s\S]*?<\/article>/);
  assert.ok(cardMatch, 'hyphen_ambiguity card renders');
  assert.match(cardMatch[0], /The man-eating shark circled the boat\./);
  assert.doesNotMatch(cardMatch[0], /Please resign the letter/);
});

test('U2 follower: reopening Grammar Bank after closing detail modal does not auto-show the modal', () => {
  const harness = openGrammarBankHarness();
  // Open the detail modal.
  harness.dispatch('grammar-concept-detail-open', { conceptId: 'word_classes' });
  assert.equal(harness.store.getState().subjectUi.grammar.bank.detailConceptId, 'word_classes');
  let html = harness.render();
  assert.match(html, /role="dialog"/);

  // Close the bank (returns to dashboard — the legacy resetToDashboard path
  // does not touch the bank slice, so detailConceptId remained stale).
  harness.dispatch('grammar-close-concept-bank');
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'dashboard');

  // Reopen the bank. With the follower fix, `grammar-open-concept-bank`
  // clears `bank.detailConceptId`, so the modal must NOT auto-appear.
  harness.dispatch('grammar-open-concept-bank');
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'bank');
  assert.equal(
    harness.store.getState().subjectUi.grammar.bank.detailConceptId,
    '',
    'detailConceptId cleared on reopen',
  );
  html = harness.render();
  assert.doesNotMatch(html, /role="dialog"/, 'detail modal must not auto-pop on bank reopen');
});

test('U2 follower: Grammar Bank aggregate "Total" card stays at 18 under a cluster filter', () => {
  const harness = openGrammarBankHarness();
  harness.dispatch('grammar-concept-bank-cluster-filter', { value: 'bracehart' });
  const html = harness.render();
  // Grid narrows to the bracehart cluster's 9 cards.
  const cards = html.match(/<article[^>]*class="grammar-bank-card[^"]*"/g) || [];
  assert.equal(cards.length, 9);
  // Total aggregate card still shows the global 18 so the sub-label
  // "Grammar concepts tracked" stays truthful under narrower filters.
  const totalCard = html.match(/data-aggregate-id="total"[\s\S]*?<\/div><\/div>/);
  assert.ok(totalCard, 'total aggregate card renders');
  assert.match(totalCard[0], />18<\/div>/);
  assert.match(totalCard[0], /Grammar concepts tracked/);
});

test('U2 follower: grammar-focus-concept remote path chains start-session after save-prefs resolves', async () => {
  // Build a context WITHOUT `service.savePrefs` / `service.startSession` so
  // the remote path runs. Observe that `save-prefs` goes first and
  // `start-session` only dispatches after the save-prefs promise resolves.
  const sent = [];
  let resolveSavePrefs;
  let resolveStartSession;
  const context = {
    appState: {
      learners: { selectedId: 'learner-a' },
      subjectUi: { grammar: normaliseGrammarReadModel({ phase: 'bank' }, 'learner-a') },
    },
    runtimeReadOnly: false,
    subjectCommands: {
      send(request) {
        sent.push({ command: request.command, payload: request.payload });
        if (request.command === 'save-prefs') {
          return new Promise((resolve) => { resolveSavePrefs = resolve; });
        }
        if (request.command === 'start-session') {
          return new Promise((resolve) => { resolveStartSession = resolve; });
        }
        return Promise.resolve({});
      },
    },
    store: {
      getState() { return context.appState; },
      updateSubjectUi(subjectId, updater) {
        const previous = context.appState.subjectUi[subjectId] || {};
        const next = typeof updater === 'function' ? updater(previous) : { ...previous, ...updater };
        context.appState = {
          ...context.appState,
          subjectUi: { ...context.appState.subjectUi, [subjectId]: next },
        };
      },
      updateSubjectUiForLearner(learnerId, subjectId, updater) {
        if (learnerId !== 'learner-a') return false;
        context.store.updateSubjectUi(subjectId, updater);
        return true;
      },
      pushToasts() {},
      pushMonsterCelebrations() {},
      reloadFromRepositories() {},
    },
    data: { conceptId: 'relative_clauses' },
  };

  const handled = grammarModule.handleAction('grammar-focus-concept', context);
  assert.equal(handled, true);

  // Only save-prefs has gone so far; start-session must wait for the resolve.
  assert.equal(sent.length, 1, 'only save-prefs dispatched before save resolves');
  assert.equal(sent[0].command, 'save-prefs');
  assert.equal(sent[0].payload.prefs.focusConceptId, 'relative_clauses');

  // Resolve save-prefs with a valid read model.
  resolveSavePrefs({
    subjectReadModel: normaliseGrammarReadModel({
      learnerId: 'learner-a',
      phase: 'dashboard',
      prefs: { mode: 'learn', focusConceptId: 'relative_clauses' },
    }, 'learner-a'),
  });
  // Flush microtasks.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  // Now start-session must have dispatched via the onResolved callback.
  assert.equal(sent.length, 2, 'start-session dispatched after save-prefs resolved');
  assert.equal(sent[1].command, 'start-session');
  assert.equal(sent[1].payload.focusConceptId, 'relative_clauses');
  // `smart` is a focus-using mode (only trouble/surgery/builder drop focus),
  // so the target mode stays `smart` rather than falling back to `learn`.
  assert.equal(sent[1].payload.mode, 'smart');

  // Resolve start-session so any trailing handlers run cleanly.
  resolveStartSession({
    subjectReadModel: normaliseGrammarReadModel({
      learnerId: 'learner-a',
      phase: 'session',
    }, 'learner-a'),
  });
  await Promise.resolve();
});

// --- U3 session redesign (one task, post-answer help only) -----------------
//
// These tests pin the visibility contract that `grammarSessionHelpVisibility`
// (U8) ships to the JSX. They cover the three canonical states: pre-answer
// session, post-answer correct, post-answer wrong. Every adult-facing string
// removed by U3 (`Worker authority`, `Worker-marked question`) is asserted
// absent, and the full `GRAMMAR_CHILD_FORBIDDEN_TERMS` fixture is iterated on
// the session HTML so a future leak is caught automatically.

function u3HarnessWithSample() {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  const sample = grammarOracleSample('fronted_adverbial_choose');
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-start', {
    payload: {
      roundLength: 2,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });
  return { harness, sample };
}

function u3ScopeToSessionHtml(html) {
  // `harness.render()` returns the whole app surface. The session scene is
  // emitted as `<section class="grammar-session"...>` — we narrow the HTML
  // so dashboard/analytics panels (which may legitimately hold adult
  // strings behind a `Grown-up view` disclosure) are not swept by the
  // forbidden-terms loop.
  const match = html.match(/<section class="grammar-session"[\s\S]*?<\/section>/);
  assert.ok(match, 'session scene was rendered');
  return match[0];
}

test('U3: pre-answer session hides every help surface', () => {
  const { harness } = u3HarnessWithSample();

  const grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'session');
  // Silent-no-op hedge (Phase 2 U4): the worked-solution flag stays false
  // pre-answer, so if a stray button ever slipped through the gate the
  // state would betray the leak. Mirrors the faded-support assertion.
  assert.equal(grammar.session.repair.workedSolutionShown, false);

  const sessionHtml = u3ScopeToSessionHtml(harness.render());

  // Help surfaces gated entirely pre-answer.
  assert.doesNotMatch(sessionHtml, /Explain this/);
  assert.doesNotMatch(sessionHtml, /Explain another way/);
  assert.doesNotMatch(sessionHtml, /Revision cards/);
  assert.doesNotMatch(sessionHtml, /Worked solution/);
  assert.doesNotMatch(sessionHtml, /Similar problem/);
  assert.doesNotMatch(sessionHtml, /Faded support/);

  // Adult-facing copy removed by U3.
  assert.doesNotMatch(sessionHtml, /Worker authority/i);
  assert.doesNotMatch(sessionHtml, /Worker-marked question/i);

  // Full forbidden-terms sweep on the session HTML. Any new forbidden
  // term added to the fixture automatically gates this test.
  for (const term of GRAMMAR_CHILD_FORBIDDEN_TERMS) {
    assert.doesNotMatch(
      sessionHtml,
      new RegExp(escapeRegExp(term), 'i'),
      `forbidden term leaked into session HTML: ${term}`,
    );
  }

  // Single primary action remains: the answer input + Submit button.
  // U3: the submit label is driven by `grammarSessionSubmitLabel(session,
  // awaitingAdvance)` — practice/pre-answer resolves to `Submit` (no
  // `answer` tail), matching the Spelling one-task layout.
  assert.match(sessionHtml, /name="answer"/);
  assert.match(sessionHtml, />Submit<\/button>/);
});

test('U3: post-answer correct shows Next question and hides repair', () => {
  const { harness, sample } = u3HarnessWithSample();

  harness.dispatch('grammar-submit-form', {
    formData: grammarResponseFormData(sample.correctResponse),
  });
  const grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'feedback');
  assert.equal(grammar.feedback.result.correct, true);

  const sessionHtml = u3ScopeToSessionHtml(harness.render());

  // Primary continuation is the single `Next question` button.
  assert.match(sessionHtml, /Next question/);
  // Correct answers do not surface retry / show-a-step / show-answer.
  assert.doesNotMatch(sessionHtml, /Retry/);
  assert.doesNotMatch(sessionHtml, /Show a step/);
  assert.doesNotMatch(sessionHtml, /Show answer/);
  // U3 follower: correct answers also suppress every remediation surface.
  // `Worked solution`, `Similar problem`, `Faded support`, and the AI
  // enrichment relabel (`Explain another way`) are post-answer-wrong
  // affordances only — never surfaced when the learner is correct.
  assert.doesNotMatch(sessionHtml, /Worked solution/i);
  assert.doesNotMatch(sessionHtml, /Similar problem/i);
  assert.doesNotMatch(sessionHtml, /Faded support/i);
  assert.doesNotMatch(sessionHtml, /Explain another way/i);
  assert.doesNotMatch(sessionHtml, /Worker authority/i);
  assert.doesNotMatch(sessionHtml, /Worker-marked question/i);
});

test('U3: post-answer wrong shows repair + relabelled AI explanation', () => {
  const { harness, sample } = u3HarnessWithSample();
  const wrongAnswer = sample.sample.inputSpec.options.find(
    (option) => option.value !== sample.correctResponse.answer,
  ).value;

  harness.dispatch('grammar-submit-form', {
    formData: grammarResponseFormData({ answer: wrongAnswer }),
  });
  const grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'feedback');
  assert.equal(grammar.feedback.result.correct, false);

  const sessionHtml = u3ScopeToSessionHtml(harness.render());

  // Post-answer wrong renders every repair / help surface.
  assert.match(sessionHtml, /Retry/);
  assert.match(sessionHtml, /Worked solution/);
  assert.match(sessionHtml, /Similar problem/);
  // AI enrichment trigger relabelled to child copy in the feedback phase.
  assert.match(sessionHtml, /Explain another way/);
  assert.doesNotMatch(sessionHtml, /Explain this/);
  assert.match(sessionHtml, /Revision cards/);
  // Adult-facing copy still absent.
  assert.doesNotMatch(sessionHtml, /Worker authority/i);
  assert.doesNotMatch(sessionHtml, /Worker-marked question/i);
});

test('U3: forbidden-terms sweep runs across the full session HTML in every phase', () => {
  const { harness, sample } = u3HarnessWithSample();
  const wrongAnswer = sample.sample.inputSpec.options.find(
    (option) => option.value !== sample.correctResponse.answer,
  ).value;

  // Pre-answer
  let sessionHtml = u3ScopeToSessionHtml(harness.render());
  for (const term of GRAMMAR_CHILD_FORBIDDEN_TERMS) {
    assert.doesNotMatch(
      sessionHtml,
      new RegExp(escapeRegExp(term), 'i'),
      `pre-answer session leaked forbidden term: ${term}`,
    );
  }

  // Post-answer wrong — the densest surface (repair + AI + worked solution).
  harness.dispatch('grammar-submit-form', {
    formData: grammarResponseFormData({ answer: wrongAnswer }),
  });
  sessionHtml = u3ScopeToSessionHtml(harness.render());
  for (const term of GRAMMAR_CHILD_FORBIDDEN_TERMS) {
    assert.doesNotMatch(
      sessionHtml,
      new RegExp(escapeRegExp(term), 'i'),
      `post-answer session leaked forbidden term: ${term}`,
    );
  }

  // U3 follower: post-answer correct — sparser surface but still needs the
  // forbidden-terms sweep so a future regression (e.g., a progress summary
  // leaking `Worker authority` into the correct-answer feedback) is caught.
  const { harness: harness2, sample: sample2 } = u3HarnessWithSample();
  harness2.dispatch('grammar-submit-form', {
    formData: grammarResponseFormData(sample2.correctResponse),
  });
  sessionHtml = u3ScopeToSessionHtml(harness2.render());
  for (const term of GRAMMAR_CHILD_FORBIDDEN_TERMS) {
    assert.doesNotMatch(
      sessionHtml,
      new RegExp(escapeRegExp(term), 'i'),
      `post-answer-correct session leaked forbidden term: ${term}`,
    );
  }
});

// U3 follower: the error banner is rendered via `translateGrammarSessionError`
// so raw Worker strings never leak to children. The pre-submit validation
// path (dispatching `grammar-submit-form` with no response) writes a
// known child-copy string to `grammar.error`; the banner must render that
// copy and carry `role="alert"` for assistive tech. This test pins both.
test('U3 follower: error banner renders child copy with role="alert"', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  const sample = grammarOracleSample('fronted_adverbial_choose');

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-start', {
    payload: {
      roundLength: 2,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });
  // Invalid submit: FormData carries no `answer`, triggering the client-side
  // `setGrammarError(context, 'Choose or type an answer before submitting.')`
  // branch in `module.js`.
  harness.dispatch('grammar-submit-form', { formData: new FormData() });

  const grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'session');
  assert.match(grammar.error, /Choose or type an answer/);

  const sessionHtml = u3ScopeToSessionHtml(harness.render());
  // Banner preserves `role="alert"` (assistive tech contract). SH2-U7
  // also threads `aria-live="assertive"` + a session-scoped id for the
  // `aria-describedby` linkage on the input; match the opening tag
  // loosely so future attribute additions (e.g. a data-test-id) do
  // not crack the assertion.
  assert.match(sessionHtml, /<div class="feedback bad" role="alert"[^>]*>/);
  // Banner renders the child-copy translation, NOT the adult-diagnostic
  // `Grammar command failed` title the pre-follower JSX used.
  assert.doesNotMatch(sessionHtml, /Grammar command failed/);
  assert.match(sessionHtml, /Something went wrong/);
  // In this validation path, the translator preserves the already-child
  // copy string verbatim — so the banner body shows it.
  assert.match(sessionHtml, /Choose or type an answer before submitting\./);
});

// ---------------------------------------------------------------------------
// U5: Summary redesign (child-friendly round end + Grown-up view gate)
// ---------------------------------------------------------------------------
// The regular-practice summary is the five-card grid produced by
// `grammarSummaryCards(summary, rewardState)` plus the three primary actions
// (Practise missed / Start another round / Open Grammar Bank) and the quiet
// `Grown-up view` secondary. The mini-test summary renders a score card,
// the existing `GrammarMiniTestReview`, and two primary actions (Review
// answers / Fix missed concepts) plus the same `Grown-up view`. The adult
// analytics surface is gated behind `grammar-open-analytics` — it never
// auto-renders in the summary HTML.

function u5RunRegularToSummary() {
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
  harness.dispatch('grammar-submit-form', {
    formData: grammarResponseFormData(sample.correctResponse),
  });
  harness.dispatch('grammar-continue');
  return { harness, sample };
}

function u5ScopeToSummaryHtml(html) {
  // Phase 4 U2: delegate to the exported, landmark-based `scopeSummary`
  // helper so the local surface test and the Phase 3 forbidden-term
  // sweep share a single source of truth for what "the summary subtree"
  // means. The helper throws on a missing
  // `data-grammar-phase-root="summary"` landmark, so a DOM refactor that
  // drops the attribute surfaces a loud failure here too.
  return scopeSummary(html);
}

test('U5: regular summary renders exactly five summary cards', () => {
  const { harness } = u5RunRegularToSummary();
  const html = u5ScopeToSummaryHtml(harness.render());

  const cardIds = ['answered', 'correct', 'trouble', 'new-secure', 'monster-progress'];
  for (const id of cardIds) {
    assert.match(html, new RegExp(`data-card-id="${id}"`), `summary card missing: ${id}`);
  }
  // Exactly five cards — no drift.
  const cardMatches = html.match(/data-card-id="/g) || [];
  assert.equal(cardMatches.length, 5, 'summary must render exactly five cards');

  // Labels match the plan spec.
  assert.match(html, /Answered/);
  assert.match(html, /Correct/);
  assert.match(html, /Trouble spots found/);
  assert.match(html, /New secure/);
  assert.match(html, /Monster progress/);
});

test('U5: regular summary primary action row has three buttons (Practise missed, Start another round, Open Grammar Bank)', () => {
  const { harness } = u5RunRegularToSummary();
  const html = u5ScopeToSummaryHtml(harness.render());

  const primaryRow = html.match(
    /<div class="grammar-summary-primary-actions"[^>]*>[\s\S]*?<\/div>/,
  )?.[0];
  assert.ok(primaryRow, 'primary action row rendered');

  assert.match(primaryRow, /data-action="grammar-practise-missed"[^>]*>Practise missed</);
  assert.match(primaryRow, /data-action="grammar-start-again"[^>]*>Start another round</);
  assert.match(primaryRow, /data-action="grammar-open-concept-bank"[^>]*>Open Grammar Bank</);

  // Exactly three buttons in the primary row — no drift.
  const buttonCount = (primaryRow.match(/<button /g) || []).length;
  assert.equal(buttonCount, 3, 'primary row must hold exactly three buttons');
});

test('U5: regular summary secondary row holds the Grown-up view button with aria-label="Open adult report"', () => {
  const { harness } = u5RunRegularToSummary();
  const html = u5ScopeToSummaryHtml(harness.render());

  const secondaryRow = html.match(
    /<div class="grammar-summary-secondary-actions"[^>]*>[\s\S]*?<\/div>/,
  )?.[0];
  assert.ok(secondaryRow, 'secondary action row rendered');
  assert.match(secondaryRow, /data-action="grammar-open-analytics"/);
  assert.match(secondaryRow, /aria-label="Open adult report"/);
  assert.match(secondaryRow, />Grown-up view</);
});

test('U5: Grown-up view dispatches grammar-open-analytics and flips phase to analytics', () => {
  const { harness } = u5RunRegularToSummary();
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'summary');

  harness.dispatch('grammar-open-analytics');
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'analytics');

  const html = harness.render();
  // Analytics scene is rendered directly by the phase router. The adult
  // surface carries Misconception repair / Question-type evidence / etc.
  // Phase 3 U7: the scene heading is now `Grown-up view` to match the
  // summary button label.
  assert.match(html, /class="grammar-analytics-back-row"/);
  assert.match(html, /data-action="grammar-close-analytics"/);
  assert.match(html, /id="grammar-analytics-title"[^>]*>Grown-up view</);

  // `grammar-close-analytics` returns to summary (because `grammar.summary`
  // is still populated).
  harness.dispatch('grammar-close-analytics');
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'summary');
});

test('U5: regular summary Monster progress card iterates the four active monsters only', () => {
  const { harness } = u5RunRegularToSummary();
  const html = u5ScopeToSummaryHtml(harness.render());

  const monsterBlock = html.match(
    /<div class="grammar-summary-card grammar-summary-card--monster"[\s\S]*?<\/ul>/,
  )?.[0];
  assert.ok(monsterBlock, 'monster progress card rendered');

  const activeIds = ['bracehart', 'chronalyx', 'couronnail', 'concordium'];
  for (const id of activeIds) {
    assert.match(monsterBlock, new RegExp(`data-monster-id="${id}"`));
  }
  // Exactly four active monsters — reserved ids absent per R15.
  const monsterRows = (monsterBlock.match(/data-monster-id="/g) || []).length;
  assert.equal(monsterRows, 4, 'monster progress card must iterate exactly four active monsters');

  assert.doesNotMatch(monsterBlock, /Glossbloom/i);
  assert.doesNotMatch(monsterBlock, /Loomrill/i);
  assert.doesNotMatch(monsterBlock, /Mirrane/i);
});

test('U5: regular summary HTML does not leak adult-diagnostic analytics copy or reserved monsters', () => {
  const { harness } = u5RunRegularToSummary();
  const html = u5ScopeToSummaryHtml(harness.render());

  // The densest adult-only strings from `GrammarAnalyticsScene` — evidence
  // summary header, parent summary draft aside, misconception pattern
  // block, Bellstorm bridge copy — must not appear in the default summary.
  assert.doesNotMatch(html, /Evidence summary|parent summary|misconception pattern|Bellstorm bridge/i);

  // Reserved monsters absent from every corner of the summary.
  assert.doesNotMatch(html, /Glossbloom|Loomrill|Mirrane/i);

  // Forbidden-terms sweep across the full summary subtree.
  for (const term of GRAMMAR_CHILD_FORBIDDEN_TERMS) {
    assert.doesNotMatch(
      html,
      new RegExp(escapeRegExp(term), 'i'),
      `forbidden term leaked into default summary HTML: ${term}`,
    );
  }
});

test('U5: mini-test summary renders score card plus Review answers + Fix missed concepts primary actions', () => {
  const { harness, sample } = u4HarnessWithMiniSet();
  harness.dispatch('grammar-save-mini-test-response', {
    formData: grammarResponseFormData(sample.correctResponse),
    advance: false,
  });
  harness.dispatch('grammar-finish-mini-test');

  const grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'summary');
  assert.ok(grammar.summary?.miniTestReview?.questions?.length);

  const html = u5ScopeToSummaryHtml(harness.render());

  // Score card headline (correct of total + percent accuracy).
  const scoreBlock = html.match(/<div class="grammar-summary-score"[\s\S]*?<\/div>/)?.[0];
  assert.ok(scoreBlock, 'mini-test score card rendered');
  assert.match(scoreBlock, /1 of 8 correct/);
  assert.match(scoreBlock, /13% accuracy/);

  // Primary actions row: `Review answers` + `Fix missed concepts`. Exactly two.
  const primaryRow = html.match(
    /<div class="grammar-summary-primary-actions"[^>]*>[\s\S]*?<\/div>/,
  )?.[0];
  assert.ok(primaryRow, 'mini-test primary actions row rendered');
  assert.match(primaryRow, />Review answers</);
  assert.match(primaryRow, />Fix missed concepts</);
  assert.match(primaryRow, /data-action="grammar-practise-missed"/);

  const buttonCount = (primaryRow.match(/<button /g) || []).length;
  assert.equal(buttonCount, 2, 'mini-test primary row holds exactly two buttons');

  // The old generic buttons `Start another round` + `Back to Grammar setup`
  // must NOT appear on the mini-test summary variant.
  assert.doesNotMatch(primaryRow, /Start another round/);
  assert.doesNotMatch(primaryRow, /Back to Grammar setup/);

  // `GrammarMiniTestReview` is still mounted below the summary card, so the
  // adjacent review section is present (contains its own `Mini Test results`
  // score card + per-question rows).
  assert.match(html, /class="card grammar-mini-review"/);
  assert.match(html, /Mini Test results/);

  // Grown-up view still surfaces the adult analytics for this variant.
  assert.match(html, /data-action="grammar-open-analytics"/);
  assert.match(html, /aria-label="Open adult report"/);
});

test('U5: grammar-practise-missed routes the learner out of summary with the first missed concept id as focus', () => {
  const { harness } = u4HarnessWithMiniSet();
  // Leave every question Blank — every review entry is missed.
  harness.dispatch('grammar-finish-mini-test');

  let grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'summary');
  const firstQuestion = grammar.summary.miniTestReview.questions[0];
  const expectedConceptId = firstQuestion.item.skillIds[0]
    || firstQuestion.item.replay?.conceptIds?.[0]
    || '';
  assert.ok(expectedConceptId, 'first review question carries a concept id');

  harness.dispatch('grammar-practise-missed');
  grammar = harness.store.getState().subjectUi.grammar;

  // `grammar-practise-missed` delegates to `grammar-focus-concept`, which
  // saves the focus preference and starts a fresh focused round. The
  // learner is no longer on the summary phase.
  assert.notEqual(grammar.phase, 'summary');
  assert.equal(grammar.prefs.focusConceptId, expectedConceptId);
  assert.ok(['session', 'dashboard'].includes(grammar.phase), 'phase routed to focused practice');
});

test('U5: grammar-open-analytics renders GrammarAnalyticsScene via the phase router', () => {
  const { harness } = u5RunRegularToSummary();
  harness.dispatch('grammar-open-analytics');
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'analytics');

  const html = harness.render();
  // The analytics surface lives inside `.grammar-surface--analytics` now
  // (phase: 'analytics') — not behind `<details class="grammar-grown-up-view">`.
  assert.match(html, /class="grammar-surface grammar-surface--analytics"/);
  // Back affordance routes `grammar-close-analytics`.
  assert.match(html, /data-action="grammar-close-analytics"/);
  // Canonical analytics content is present. Phase 3 U7 renames the scene
  // heading to `Grown-up view` to match the summary button label.
  assert.match(html, /id="grammar-analytics-title"[^>]*>Grown-up view</);
  assert.match(html, /Grammar progress/);
});

test('U5: grammar-open-analytics is a no-op mid-session so the active round is not wiped', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  const sample = grammarOracleSample();

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-start', {
    payload: { roundLength: 1, templateId: sample.id, seed: sample.sample.seed },
  });
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'session');

  harness.dispatch('grammar-open-analytics');
  // Phase stays on session — `grammar-open-analytics` refuses to fire
  // mid-session or mid-feedback.
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'session');
});

// ---------------------------------------------------------------------------
// U5 follower coverage: mini-test `Fix missed concepts` variant flip, regular-
// practice `Practise missed` disabled state, analytics close-fallback, and
// weak-vs-due precedence when resolving the missed concept id.
// ---------------------------------------------------------------------------

test('U5 follower T1: regular-practice grammar-practise-missed prefers a weak analytics concept over a due one', () => {
  const { harness } = u5RunRegularToSummary();
  const learnerId = harness.store.getState().learners.selectedId;

  // Seed analytics.concepts so the missed-concept helper has something to
  // act on (regular-practice summaries have no `miniTestReview`, so the
  // helper falls straight through to analytics). `word_classes` is weak,
  // `clauses` is due -- weak must win.
  harness.store.updateSubjectUi('grammar', (current) => {
    const normalised = normaliseGrammarReadModel(current, learnerId);
    return {
      ...normalised,
      analytics: {
        ...normalised.analytics,
        concepts: [
          { id: 'clauses', status: 'due' },
          { id: 'word_classes', status: 'weak' },
        ],
      },
    };
  });

  let grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'summary', 'setup left learner on summary');
  assert.equal(grammar.prefs.focusConceptId, '', 'focus preference clean before dispatch');

  harness.dispatch('grammar-practise-missed');
  grammar = harness.store.getState().subjectUi.grammar;

  // weak beats due -- `word_classes` wins and routes into a focused round.
  assert.equal(grammar.prefs.focusConceptId, 'word_classes');
  assert.notEqual(grammar.phase, 'summary');
});

test('U5 follower T2: grammar-practise-missed is a silent no-op when the round has no missed or weak / due concept', () => {
  const { harness } = u5RunRegularToSummary();
  const learnerId = harness.store.getState().learners.selectedId;

  // Wipe analytics.concepts so no weak / due concept is present. Regular
  // practice summaries carry no miniTestReview, so the helper has nothing
  // to act on -- the handler must return early without mutating phase or
  // prefs.
  harness.store.updateSubjectUi('grammar', (current) => {
    const normalised = normaliseGrammarReadModel(current, learnerId);
    return {
      ...normalised,
      analytics: { ...normalised.analytics, concepts: [] },
    };
  });

  const before = harness.store.getState().subjectUi.grammar;
  assert.equal(before.phase, 'summary');
  const focusBefore = before.prefs.focusConceptId;

  harness.dispatch('grammar-practise-missed');
  const after = harness.store.getState().subjectUi.grammar;

  assert.equal(after.phase, 'summary', 'phase unchanged when nothing to practise');
  assert.equal(after.prefs.focusConceptId, focusBefore, 'focus preference unchanged');
});

test('U5 follower T3: grammar-close-analytics falls back to dashboard when summary has been cleared', () => {
  const { harness } = u5RunRegularToSummary();
  const learnerId = harness.store.getState().learners.selectedId;

  harness.dispatch('grammar-open-analytics');
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'analytics');

  // Simulate the summary being cleared (e.g. server eviction or a follow-up
  // dispatch that reset the round). The close-analytics fallback must route
  // to dashboard, never leave the learner stranded on a phase with nothing
  // to render.
  harness.store.updateSubjectUi('grammar', (current) => {
    const normalised = normaliseGrammarReadModel(current, learnerId);
    return { ...normalised, summary: null, phase: 'analytics' };
  });

  harness.dispatch('grammar-close-analytics');
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'dashboard');
});

test('U5 follower T4: mini-test Fix missed concepts button renders disabled when every question is correct', () => {
  const { harness } = u4HarnessWithMiniSet();
  harness.dispatch('grammar-finish-mini-test');

  const learnerId = harness.store.getState().learners.selectedId;
  const beforeGrammar = harness.store.getState().subjectUi.grammar;
  assert.equal(beforeGrammar.phase, 'summary');
  assert.ok(Array.isArray(beforeGrammar.summary?.miniTestReview?.questions));

  // Force every review question to be marked correct so the first-missed
  // resolver returns ''. analytics.concepts also wiped so the module-side
  // fallback does not resurrect a concept id from weak / due analytics.
  harness.store.updateSubjectUi('grammar', (current) => {
    const normalised = normaliseGrammarReadModel(current, learnerId);
    const questions = normalised.summary.miniTestReview.questions.map((question) => ({
      ...question,
      answered: true,
      marked: {
        ...(question.marked || {}),
        result: { ...(question.marked?.result || {}), correct: true },
      },
    }));
    return {
      ...normalised,
      summary: {
        ...normalised.summary,
        miniTestReview: { ...normalised.summary.miniTestReview, questions },
      },
      analytics: { ...normalised.analytics, concepts: [] },
    };
  });

  const html = harness.render();
  const primaryRow = html.match(
    /<div class="grammar-summary-primary-actions"[^>]*>[\s\S]*?<\/div>/,
  )?.[0];
  assert.ok(primaryRow, 'mini-test primary actions row rendered');

  const fixButton = primaryRow.match(
    /<button[^>]*data-action="grammar-practise-missed"[^>]*>[^<]*<\/button>/,
  )?.[0];
  assert.ok(fixButton, 'Fix missed concepts button rendered');
  assert.match(fixButton, /disabled/, 'Fix missed concepts button carries the disabled attribute when no misses');
});

test('U5 follower T5: mini-test primary row puts Fix missed concepts first with the primary variant and Review answers second as secondary', () => {
  const { harness } = u4HarnessWithMiniSet();
  // Leave every question Blank so the resolver finds a missed concept id
  // and the primary button is enabled.
  harness.dispatch('grammar-finish-mini-test');

  const html = harness.render();
  const primaryRow = html.match(
    /<div class="grammar-summary-primary-actions"[^>]*>[\s\S]*?<\/div>/,
  )?.[0];
  assert.ok(primaryRow, 'mini-test primary actions row rendered');

  // Button order -- Fix missed concepts must appear before Review answers.
  const fixIndex = primaryRow.indexOf('>Fix missed concepts<');
  const reviewIndex = primaryRow.indexOf('>Review answers<');
  assert.ok(fixIndex >= 0 && reviewIndex >= 0, 'both mini-test primary buttons rendered');
  assert.ok(fixIndex < reviewIndex, 'Fix missed concepts renders before Review answers');

  // Variants -- Fix missed concepts carries `btn primary`, Review answers
  // carries `btn secondary`.
  assert.match(
    primaryRow,
    /<button[^>]*class="btn primary"[^>]*data-action="grammar-practise-missed"[^>]*>Fix missed concepts</,
    'Fix missed concepts is the primary variant',
  );
  assert.match(
    primaryRow,
    /<button[^>]*class="btn secondary"[^>]*data-action="grammar-review-mini-test"[^>]*>Review answers</,
    'Review answers is the secondary variant',
  );
});

// ---------------------------------------------------------------------------
// U7: Child/adult analytics split
// ---------------------------------------------------------------------------
// Finalises the gating U1 + U5 scaffolded. The adult analytics scene now
// carries the `Grown-up view` heading + intro copy + internal confidence chips
// (5-label taxonomy + sample size) + the "Draft for review" framing on the
// parent summary draft. The dashboard `<details class="grammar-grown-up-view">`
// is kept as a closed-by-default escape hatch so parents can reach progress
// outside the post-session path; the canonical path is summary -> `Grown-up
// view` button (phase: 'analytics').

function u7OpenAnalyticsFromSummary() {
  const { harness, sample } = u5RunRegularToSummary();
  harness.dispatch('grammar-open-analytics');
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'analytics');
  return { harness, sample };
}

function u7SeedAnalyticsConfidence(harness) {
  const learnerId = harness.store.getState().learners.selectedId;
  harness.store.updateSubjectUi('grammar', (current) => {
    const normalised = normaliseGrammarReadModel(current, learnerId);
    // Seed mixed confidence levels across concept rows and a question-type row
    // so the chip renders with at least two distinct labels. The Worker
    // projects `confidence: {label, sampleSize, ...}` on both read-model
    // shapes; we mirror that shape here.
    const concepts = normalised.analytics.concepts.map((concept) => {
      if (concept.id === 'relative_clauses') {
        return {
          ...concept,
          status: 'weak',
          attempts: 3,
          confidence: { label: 'needs-repair', sampleSize: 3, intervalDays: 0, distinctTemplates: 1, recentMisses: 2 },
        };
      }
      if (concept.id === 'word_classes') {
        return {
          ...concept,
          status: 'learning',
          attempts: 12,
          confidence: { label: 'consolidating', sampleSize: 12, intervalDays: 3, distinctTemplates: 4, recentMisses: 1 },
        };
      }
      return concept;
    });
    return {
      ...normalised,
      analytics: {
        ...normalised.analytics,
        concepts,
        questionTypeSummary: [
          {
            id: 'select_one',
            label: 'Select one',
            status: 'learning',
            attempts: 5,
            correct: 2,
            wrong: 3,
            confidence: { label: 'needs-repair', sampleSize: 5, intervalDays: 0, distinctTemplates: 2, recentMisses: 2 },
          },
          {
            id: 'construct',
            label: 'Constructed response',
            status: 'secured',
            attempts: 20,
            correct: 18,
            wrong: 2,
            confidence: { label: 'secure', sampleSize: 20, intervalDays: 14, distinctTemplates: 5, recentMisses: 0 },
          },
        ],
      },
    };
  });
}

test('U7: analytics phase heading reads Grown-up view and carries the non-grade intro copy', () => {
  const { harness } = u7OpenAnalyticsFromSummary();
  const html = harness.render();
  // Scene title matches the summary button label so the routing feels
  // cohesive. `aria-labelledby` keeps pointing at `grammar-analytics-title`.
  assert.match(html, /aria-labelledby="grammar-analytics-title"/);
  assert.match(html, /id="grammar-analytics-title"[^>]*>Grown-up view</);
  // Intro copy frames the scene as non-scored.
  assert.match(html, /Detailed progress for parents and teachers\. Nothing here is a grade\./);
});

test('U7: analytics phase renders the back affordance dispatching grammar-close-analytics', () => {
  const { harness } = u7OpenAnalyticsFromSummary();
  const html = harness.render();
  const backRow = html.match(/<div class="grammar-analytics-back-row"[^>]*>[\s\S]*?<\/div>/)?.[0];
  assert.ok(backRow, 'back affordance row rendered');
  assert.match(backRow, /data-action="grammar-close-analytics"/);
  assert.match(backRow, />Back to round summary</);

  // Dispatch round-trip: close returns to summary because grammar.summary is
  // still populated.
  harness.dispatch('grammar-close-analytics');
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'summary');
});

test('U7: analytics phase retains the adult-only evidence vocabulary', () => {
  const { harness } = u7OpenAnalyticsFromSummary();
  const html = harness.render();
  // U10: "Evidence snapshot" → "Grammar progress"; "Stage 1" chip removed;
  // "Reserved reward routes" → "Grammar creature routes" (U3).
  assert.match(html, /Grammar progress/);
  assert.doesNotMatch(html, /Evidence snapshot/);
  assert.doesNotMatch(html, /class="chip">Stage 1</);
  assert.match(html, /Bellstorm bridge/);
  assert.match(html, /Grammar creature routes/);
});

test('U7: analytics phase renders adult confidence chips with the internal 5-label taxonomy + sample size', () => {
  const { harness } = u7OpenAnalyticsFromSummary();
  u7SeedAnalyticsConfidence(harness);
  const html = harness.render();

  // Concept row chips use Worker's `confidence.label` + `sampleSize`.
  const relativeChip = html.match(
    /<span class="grammar-adult-confidence needs-repair"[^>]*data-concept-id="relative_clauses"[\s\S]*?<\/span>/,
  )?.[0] || html.match(
    /data-concept-id="relative_clauses"[\s\S]*?<span class="grammar-adult-confidence needs-repair"[^>]*>[^<]*<\/span>/,
  )?.[0];
  assert.ok(relativeChip, 'needs-repair chip rendered on the relative_clauses concept row');
  assert.match(relativeChip, /needs-repair/);
  assert.match(relativeChip, /3 attempts/);

  const wordClassesChip = html.match(
    /data-concept-id="word_classes"[\s\S]*?<span class="grammar-adult-confidence consolidating"[^>]*>[^<]*<\/span>/,
  )?.[0];
  assert.ok(wordClassesChip, 'consolidating chip rendered on the word_classes concept row');
  assert.match(wordClassesChip, /12 attempts/);

  // Question-type row chips use the same shape.
  const questionBlock = html.match(
    /<div class="eyebrow">Question-type evidence<\/div>[\s\S]*?<\/ol>/,
  )?.[0];
  assert.ok(questionBlock, 'question-type evidence block rendered');
  assert.match(questionBlock, /data-question-type-id="select_one"/);
  assert.match(questionBlock, /grammar-adult-confidence needs-repair/);
  assert.match(questionBlock, /5 attempts/);
  assert.match(questionBlock, /data-question-type-id="construct"/);
  assert.match(questionBlock, /grammar-adult-confidence secure/);
  assert.match(questionBlock, /20 attempts/);
});

test('U7: adult confidence chip renders singular "attempt" copy for a single-attempt row', () => {
  const { harness } = u7OpenAnalyticsFromSummary();
  const learnerId = harness.store.getState().learners.selectedId;
  harness.store.updateSubjectUi('grammar', (current) => {
    const normalised = normaliseGrammarReadModel(current, learnerId);
    return {
      ...normalised,
      analytics: {
        ...normalised.analytics,
        questionTypeSummary: [{
          id: 'solo',
          label: 'Solo question type',
          status: 'learning',
          attempts: 1,
          correct: 1,
          wrong: 0,
          confidence: { label: 'emerging', sampleSize: 1, intervalDays: 0, distinctTemplates: 1, recentMisses: 0 },
        }],
      },
    };
  });
  const html = harness.render();
  assert.match(html, /grammar-adult-confidence emerging[^"]*"[^>]*>[^<]*1 attempt</);
});

test('U7: parent summary draft carries the Draft for review framing when enrichment is present', () => {
  const { harness } = u7OpenAnalyticsFromSummary();
  const learnerId = harness.store.getState().learners.selectedId;
  harness.store.updateSubjectUi('grammar', (current) => {
    const normalised = normaliseGrammarReadModel(current, learnerId);
    return {
      ...normalised,
      aiEnrichment: {
        ...(normalised.aiEnrichment || {}),
        parentSummary: {
          title: 'Parent summary',
          body: 'Seed body for the draft aside.',
          nextSteps: ['Keep practising relative clauses.'],
        },
      },
    };
  });
  const html = harness.render();
  const aside = html.match(/<aside class="grammar-parent-summary-draft"[\s\S]*?<\/aside>/)?.[0];
  assert.ok(aside, 'parent summary draft aside rendered');
  assert.match(aside, /Draft for review/);
  assert.match(aside, /not a grade/);
});

test('U7: analytics phase empty state — no recent activity and no question types still renders without blank page', () => {
  const { harness } = u7OpenAnalyticsFromSummary();
  const learnerId = harness.store.getState().learners.selectedId;
  harness.store.updateSubjectUi('grammar', (current) => {
    const normalised = normaliseGrammarReadModel(current, learnerId);
    return {
      ...normalised,
      analytics: {
        ...normalised.analytics,
        recentActivity: [],
        recentAttempts: [],
        misconceptionPatterns: [],
        questionTypeSummary: [],
      },
    };
  });
  const html = harness.render();
  // Scene still carries its heading + intro + back affordance.
  assert.match(html, /id="grammar-analytics-title"[^>]*>Grown-up view</);
  assert.match(html, /data-action="grammar-close-analytics"/);
  // Empty-state prose from the scene renders (not a blank page).
  assert.match(html, /No Grammar attempts recorded yet\./);
  assert.match(html, /No recurring misconception pattern recorded yet\./);
  assert.match(html, /No question-type evidence recorded yet\./);
});

test('U7: dashboard <details class="grammar-grown-up-view"> stays as a closed-by-default escape hatch', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  const html = harness.render();

  // The disclosure is present but closed — no `open` attribute. SSR cannot
  // flip it programmatically; this assertion guards against drift that would
  // render the disclosure open by default and leak adult copy into the child
  // dashboard flow.
  const details = html.match(/<details class="grammar-grown-up-view"[^>]*>/)?.[0];
  assert.ok(details, 'grown-up view disclosure rendered on the dashboard');
  assert.doesNotMatch(details, /\bopen\b/, 'grown-up view disclosure must NOT be open by default');
});

test('U7: default dashboard HTML carries no Grown-up intro copy outside the analytics phase', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  const html = harness.render();

  // Narrow to the dashboard panel so we do not sweep the sibling `<details>`
  // disclosure which legitimately holds adult copy ready for opening.
  const dashboardMatch = html.match(/<section class="grammar-dashboard"[\s\S]*?<\/section><details class="grammar-grown-up-view">/);
  assert.ok(dashboardMatch, 'dashboard section rendered');
  const dashboardHtml = dashboardMatch[0];
  assert.doesNotMatch(dashboardHtml, /Nothing here is a grade/i);
  assert.doesNotMatch(dashboardHtml, /Draft for review/i);
});

test('U7: summary HTML does not render Grown-up intro copy or Draft for review framing', () => {
  const { harness } = u5RunRegularToSummary();
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'summary');
  const html = u5ScopeToSummaryHtml(harness.render());
  assert.doesNotMatch(html, /Nothing here is a grade/i);
  assert.doesNotMatch(html, /Draft for review/i);
  // The button to open the analytics scene is still present on the summary.
  assert.match(html, /data-action="grammar-open-analytics"/);
});

test('U7: integration — summary Grown-up view -> analytics -> back leaves summary intact', () => {
  const { harness } = u5RunRegularToSummary();
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'summary');
  const summaryBefore = harness.store.getState().subjectUi.grammar.summary;

  harness.dispatch('grammar-open-analytics');
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'analytics');
  // The adult scene has fully replaced the summary render.
  const analyticsHtml = harness.render();
  assert.match(analyticsHtml, /class="grammar-surface grammar-surface--analytics"/);
  assert.match(analyticsHtml, /id="grammar-analytics-title"[^>]*>Grown-up view</);

  harness.dispatch('grammar-close-analytics');
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'summary');
  // Summary payload is preserved end-to-end — the round cards are still
  // rendered when the learner returns.
  assert.deepEqual(
    harness.store.getState().subjectUi.grammar.summary,
    summaryBefore,
    'summary payload survives the analytics round-trip',
  );
});

// ---------------------------------------------------------------------------
// U10: Star explanation surface + analytics copy cleanup
// ---------------------------------------------------------------------------

test('U10: analytics eyebrow reads "Grammar progress" not "Evidence snapshot"', () => {
  const { harness } = u7OpenAnalyticsFromSummary();
  const html = harness.render();
  assert.match(html, /Grammar progress/);
  assert.doesNotMatch(html, /Evidence snapshot/);
});

test('U10: "Stage 1" chip is absent from the analytics scene', () => {
  const { harness } = u7OpenAnalyticsFromSummary();
  const html = harness.render();
  assert.doesNotMatch(html, /<span class="chip">Stage 1<\/span>/);
});

test('U10: star explanation details element is rendered on the analytics scene', () => {
  const { harness } = u7OpenAnalyticsFromSummary();
  const html = harness.render();
  assert.match(html, /<details class="grammar-star-explanation">/);
  assert.match(html, /<summary>Star<\/summary>/);
  // All four active monsters are present in the debug output.
  assert.match(html, /class="grammar-star-debug-entry"/);
  assert.match(html, />Bracehart</);
  assert.match(html, />Chronalyx</);
  assert.match(html, />Couronnail</);
  assert.match(html, />Concordium</);
  // Each entry shows star count and stage name.
  assert.match(html, /\/ 100 Stars/);
  assert.match(html, /Source: live/);
});

test('U10: forbidden-term sweep still passes on the child dashboard', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  const html = harness.render();
  const dashboardMatch = html.match(/<section class="grammar-dashboard"[\s\S]*?<\/section><details class="grammar-grown-up-view">/);
  assert.ok(dashboardMatch, 'dashboard section was rendered');
  const dashboardHtml = dashboardMatch[0];
  for (const term of GRAMMAR_CHILD_FORBIDDEN_TERMS) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.doesNotMatch(dashboardHtml, new RegExp(escaped, 'i'), `forbidden term leaked: ${term}`);
  }
});
