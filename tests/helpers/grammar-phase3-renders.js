// Phase 3 U10 — child-phase render helpers for the forbidden-term sweep.
//
// Each child phase has its own seed shape (dashboard / session-pre /
// session-post-correct / session-post-wrong / mini-test-before /
// mini-test-after / summary / bank / transfer). The `analytics` phase is
// adult-facing and supported for the inverse-presence matrix in
// `grammar-phase3-child-copy.test.js`.
//
// `renderGrammarChildPhaseFixture(phaseName, overrides)` returns
// `{ harness, html, rawHtml }` so callers can (a) introspect live state
// after render — the `assert.equal(grammar.phase, ...)` silent-no-op
// hedge — and (b) do downstream regex sweeps against the rendered HTML.
//
// Unknown phase names throw immediately. This is deliberate: a typo in a
// test (`session-postcorrect` instead of `session-post-correct`) would
// otherwise silently skip coverage, which is the exact failure mode the
// U10 completeness gate exists to prevent.
//
// SSR blind spots documented here (mirrored in every caller's header):
//   * pointer-capture, focus management, scroll-into-view, IME, animation
//     frames, requestIdleCallback, MutationObserver, and timer drift are
//     not observable via the SSR harness. These remain manual-QA gates.
//   * React onChange events do not fire in SSR; we dispatch store actions
//     directly to model the runtime transitions.

import assert from 'node:assert/strict';

import { createAppHarness } from './app-harness.js';
import {
  createGrammarHarness,
  grammarResponseFormData,
} from './grammar-subject-harness.js';
import { readGrammarLegacyOracle } from './grammar-legacy-oracle.js';
import { installMemoryStorage } from './memory-storage.js';
import { normaliseGrammarReadModel } from '../../src/subjects/grammar/metadata.js';

const SAMPLE_TRANSFER_PROMPTS = Object.freeze([
  Object.freeze({
    id: 'storm-scene',
    title: 'Describe a storm',
    brief: 'Write a short paragraph describing a storm rolling in.',
    grammarTargets: ['adverbials', 'parenthesis_commas', 'relative_clauses'],
    checklist: Object.freeze([
      'Use at least one fronted adverbial.',
      'Use a pair of commas for parenthesis.',
      'Use one relative clause.',
    ]),
  }),
  Object.freeze({
    id: 'market-stall',
    title: 'At the market stall',
    brief: 'Write 3-5 sentences about a busy market.',
    grammarTargets: ['noun_phrases'],
    checklist: Object.freeze(['Use one expanded noun phrase.']),
  }),
]);

const SAMPLE_TRANSFER_LIMITS = Object.freeze({
  maxPrompts: 20,
  historyPerPrompt: 5,
  writingCapChars: 2000,
});

function pickOracleSample(templateId = 'fronted_adverbial_choose') {
  return readGrammarLegacyOracle().templates.find((template) => template.id === templateId);
}

function defaultTransferLane(overrides = {}) {
  return {
    mode: 'non-scored',
    prompts: SAMPLE_TRANSFER_PROMPTS.map((prompt) => ({ ...prompt, checklist: [...prompt.checklist] })),
    limits: { ...SAMPLE_TRANSFER_LIMITS },
    evidence: [],
    ...overrides,
  };
}

// The explicit phase allowlist. Unknown names throw — see module header.
const PHASE_ALLOWLIST = Object.freeze([
  'dashboard',
  'session-pre',
  'session-post-correct',
  'session-post-wrong',
  'mini-test-before',
  'mini-test-after',
  'summary',
  'bank',
  'transfer',
  'analytics',
]);

export const GRAMMAR_PHASE3_CHILD_PHASES = Object.freeze([
  'dashboard',
  'session-pre',
  'session-post-correct',
  'session-post-wrong',
  'mini-test-before',
  'mini-test-after',
  'summary',
  'bank',
  'transfer',
]);

export const GRAMMAR_PHASE3_ADULT_PHASES = Object.freeze(['analytics']);

function renderDashboard() {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  return harness;
}

function renderSessionPre() {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  const sample = pickOracleSample();
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-start', {
    payload: {
      roundLength: 2,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });
  return harness;
}

function renderSessionPostCorrect() {
  const harness = renderSessionPre();
  const sample = pickOracleSample();
  harness.dispatch('grammar-submit-form', {
    formData: grammarResponseFormData(sample.correctResponse),
  });
  return harness;
}

function renderSessionPostWrong() {
  const harness = renderSessionPre();
  const sample = pickOracleSample();
  const wrongAnswer = sample.sample.inputSpec.options.find(
    (option) => option.value !== sample.correctResponse.answer,
  ).value;
  harness.dispatch('grammar-submit-form', {
    formData: grammarResponseFormData({ answer: wrongAnswer }),
  });
  return harness;
}

function renderMiniTestBefore() {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  const sample = pickOracleSample('fronted_adverbial_choose');
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-start', {
    payload: {
      mode: 'satsset',
      roundLength: 8,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });
  // Answer Q1 so the nav-button `answered` branch (aria-pressed=true) is
  // covered, but do not finish — this lands the learner in the pre-finish
  // mini-test HTML surface.
  const q1Value = harness.store.getState().subjectUi.grammar.session.miniTest.questions[0].item.inputSpec.options?.[0]?.value;
  if (q1Value) {
    harness.dispatch('grammar-save-mini-test-response', {
      formData: grammarResponseFormData({ answer: q1Value }),
      advance: false,
    });
  }
  return harness;
}

function renderMiniTestAfter() {
  const harness = renderMiniTestBefore();
  // Finish the mini-set. With only Q1 answered (or none), the review
  // renders `Blank` chips across the remaining questions, which exercises
  // the post-finish review surface end-to-end.
  harness.dispatch('grammar-finish-mini-test');
  return harness;
}

function renderSummary() {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  const sample = pickOracleSample('question_mark_select');
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
  return harness;
}

function renderBank() {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;
  harness.store.updateSubjectUi(
    'grammar',
    normaliseGrammarReadModel({ phase: 'bank' }, learnerId),
  );
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  return harness;
}

function renderTransfer() {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.store.updateSubjectUi('grammar', (current) => normaliseGrammarReadModel({
    ...current,
    phase: 'transfer',
    transferLane: defaultTransferLane(),
    ui: { transfer: {} },
  }, learnerId));
  return harness;
}

function renderAnalytics() {
  // Adult-facing: drives the summary flow then dispatches
  // `grammar-open-analytics`. The scene is the only child-exempt surface
  // that carries Evidence snapshot / Stage 1 / Bellstorm bridge / Reserved
  // reward routes copy, so we inverse-check presence downstream.
  const harness = renderSummary();
  harness.dispatch('grammar-open-analytics');
  return harness;
}

const PHASE_RENDERERS = Object.freeze({
  'dashboard': renderDashboard,
  'session-pre': renderSessionPre,
  'session-post-correct': renderSessionPostCorrect,
  'session-post-wrong': renderSessionPostWrong,
  'mini-test-before': renderMiniTestBefore,
  'mini-test-after': renderMiniTestAfter,
  'summary': renderSummary,
  'bank': renderBank,
  'transfer': renderTransfer,
  'analytics': renderAnalytics,
});

// --- Per-phase HTML scope helpers ------------------------------------------
//
// Several child phases legitimately carry the adult `<details
// class="grammar-grown-up-view">` disclosure alongside the child scene.
// The disclosure body embeds `GrammarAnalyticsScene` (adult copy) and
// must be excluded from the child-facing sweep — otherwise the
// forbidden-term check flags terms the adult scene is *allowed* to
// carry (`Stage 1`, `Evidence snapshot`, ...).
//
// Each scope helper returns only the child-facing subtree. The adult
// disclosure is swept separately via the `analytics` phase.
//
// Phase 4 U2 hardening: the scope helpers assert on the
// `data-grammar-phase-root="<phase>"` semantic landmark on the scene's
// existing root element (added in the six `Grammar*Scene.jsx` components).
// A DOM refactor that drops a CSS class would otherwise silently
// fall back to the full HTML and turn the forbidden-term sweep into a
// false-positive silencer — the exact test-harness-vs-production defect
// class the Phase 4 plan's invariant 12 floor is defending. On no-match
// every scoper throws a named error so drift is loud and visible.
//
// Per-phase regex notes:
//   * `dashboard` and `transfer` contain nested `<section>` elements, so
//     a lazy `</section>` match needs a stable following-sibling lookahead
//     (`<details class="grammar-grown-up-view">` and `</div></main>`
//     respectively) to bind to the *root* section close rather than the
//     first nested close.
//   * `summary`'s root is a `<div class="grammar-summary-shell...">`
//     which wraps many nested `<div>`s. Lookahead to `</main>` pins the
//     match to the shell's own closing `</div>`.
//   * `session`, `bank`, `analytics` have no nested same-type tag so a
//     simple lazy `</section>` match is unambiguous.

export function scopeDashboard(html) {
  // Dashboard root section ends right before the sibling
  // `<details class="grammar-grown-up-view">` disclosure.
  const match = html.match(
    /<section[^>]*data-grammar-phase-root="dashboard"[\s\S]*?<\/section>(?=<details class="grammar-grown-up-view">)/,
  );
  if (!match) {
    throw new Error(
      'scopeDashboard: no data-grammar-phase-root="dashboard" landmark found in rendered HTML',
    );
  }
  return match[0];
}

export function scopeSession(html) {
  const match = html.match(
    /<section[^>]*data-grammar-phase-root="session"[\s\S]*?<\/section>/,
  );
  if (!match) {
    throw new Error(
      'scopeSession: no data-grammar-phase-root="session" landmark found in rendered HTML',
    );
  }
  return match[0];
}

export function scopeSummary(html) {
  // Summary shell root `<div>` closes just before `</main>`. The lookahead
  // binds to that main close so the lazy match consumes the shell's full
  // contents rather than the first inner `</div>`.
  const match = html.match(
    /<div[^>]*data-grammar-phase-root="summary"[\s\S]*?<\/div>(?=<\/main>)/,
  );
  if (!match) {
    throw new Error(
      'scopeSummary: no data-grammar-phase-root="summary" landmark found in rendered HTML',
    );
  }
  return match[0];
}

export function scopeBank(html) {
  const match = html.match(
    /<section[^>]*data-grammar-phase-root="bank"[\s\S]*?<\/section>/,
  );
  if (!match) {
    throw new Error(
      'scopeBank: no data-grammar-phase-root="bank" landmark found in rendered HTML',
    );
  }
  return match[0];
}

export function scopeTransfer(html) {
  // Transfer root contains nested `<section>` siblings (write, saved,
  // orphaned). Lookahead to `</div></main>` pins the match to the root
  // transfer scene close.
  const match = html.match(
    /<section[^>]*data-grammar-phase-root="transfer"[\s\S]*?<\/section>(?=<\/div><\/main>)/,
  );
  if (!match) {
    throw new Error(
      'scopeTransfer: no data-grammar-phase-root="transfer" landmark found in rendered HTML',
    );
  }
  return match[0];
}

export function scopeAnalytics(html) {
  // Adult-facing — still asserts the landmark exists so the adult surface
  // cannot silently lose its root and turn inverse-presence into a
  // no-op. Returns the narrowed landmark-scoped substring; the adult
  // inverse-presence sweep reads `rawHtml` (not this scoped value) so
  // no downstream assertion is affected by the narrowing.
  const match = html.match(
    /<section[^>]*data-grammar-phase-root="analytics"[\s\S]*?<\/section>/,
  );
  if (!match) {
    throw new Error(
      'scopeAnalytics: no data-grammar-phase-root="analytics" landmark found in rendered HTML',
    );
  }
  return match[0];
}

const PHASE_SCOPERS = Object.freeze({
  'dashboard': scopeDashboard,
  'session-pre': scopeSession,
  'session-post-correct': scopeSession,
  'session-post-wrong': scopeSession,
  'mini-test-before': scopeSession,
  'mini-test-after': (html) => scopeSummary(html),
  'summary': scopeSummary,
  'bank': scopeBank,
  'transfer': scopeTransfer,
  'analytics': scopeAnalytics,
});

/**
 * Render one of the ten supported Phase 3 phase fixtures. Throws on an
 * unknown phase name so a typo in a test cannot silently skip coverage.
 *
 * `html` is the **scoped** child-facing subtree. The adult
 * `<details class="grammar-grown-up-view">` disclosure (which legitimately
 * embeds GrammarAnalyticsScene with adult copy) is excluded from child
 * phases so the forbidden-term sweep only reads child-facing markup.
 * `rawHtml` returns the full rendered surface for callers that need it
 * (e.g., whole-app assertions, adult inverse-presence on `analytics`).
 *
 * @param {string} phaseName — one of PHASE_ALLOWLIST.
 * @param {object} [overrides] — reserved for future per-phase seeding.
 * @returns {{ harness: object, html: string, rawHtml: string }}
 */
export function renderGrammarChildPhaseFixture(phaseName, overrides = {}) {
  if (!PHASE_ALLOWLIST.includes(phaseName)) {
    throw new Error(
      `renderGrammarChildPhaseFixture: unknown phase "${phaseName}". ` +
      `Expected one of: ${PHASE_ALLOWLIST.join(', ')}.`,
    );
  }
  const renderer = PHASE_RENDERERS[phaseName];
  const scoper = PHASE_SCOPERS[phaseName];
  assert.equal(typeof renderer, 'function', `renderer missing for phase ${phaseName}`);
  assert.equal(typeof scoper, 'function', `scoper missing for phase ${phaseName}`);
  void overrides;
  const harness = renderer();
  const rawHtml = harness.render();
  const html = scoper(rawHtml);
  return { harness, html, rawHtml };
}
