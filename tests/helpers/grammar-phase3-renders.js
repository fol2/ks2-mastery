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
// Phase 4 U4 follower: extended with four adversarial render states used by
// `tests/grammar-learning-flow-matrix.test.js`:
//   * `session-pre-pending`        — pre-answer with `pendingCommand` in flight.
//   * `session-feedback-pending`   — feedback with `pendingCommand` in flight.
//   * `session-retry`              — session re-entered via `retry-current-question`.
//   * `session-mode-flip-worked`   — Worked mode started, then prefs flipped to Smart
//                                    mid-round (in-flight attempt keeps Worked supportLevel).
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
  'session-pre-pending',
  'session-feedback-pending',
  'session-retry',
  'session-mode-flip-worked',
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
  // that carries Grammar progress / Bellstorm bridge / Grammar creature
  // routes copy, so we inverse-check presence downstream.
  const harness = renderSummary();
  harness.dispatch('grammar-open-analytics');
  return harness;
}

// --- Phase 4 U4 follower: adversarial-state renderers ---------------------
//
// The four helpers below seed the render states the U4 matrix needs. Each one
// mutates the client-side subject UI through `store.updateSubjectUi` (or the
// transition path) rather than fabricating a free-form fixture — that way the
// matrix exercises the exact read-model shape the JSX consumes in production.

function setGrammarUiPatch(harness, patch) {
  const learnerId = harness.store.getState().learners.selectedId;
  harness.store.updateSubjectUi('grammar', (current) => normaliseGrammarReadModel({
    ...current,
    ...patch,
  }, learnerId));
}

function renderSessionPrePending() {
  // Pre-answer focus return after autosave: `pendingCommand='save-prefs'` is
  // set while the learner is still in the `'session'` phase. The JSX guard at
  // `GrammarSessionScene.jsx:521` disables buttons but does not change
  // help-visibility — the matrix asserts visibility stays all-false because
  // `grammarPhase !== 'feedback'` before any answer has been submitted.
  const harness = renderSessionPre();
  setGrammarUiPatch(harness, { pendingCommand: 'save-prefs' });
  return harness;
}

function renderSessionFeedbackPending() {
  // Pending command race during feedback: the learner has answered and is in
  // `'feedback'`, but the dispatcher fired `submit-answer` / `retry-current-
  // question` and hasn't resolved yet. `pendingCommand` is truthy. The JSX
  // disables buttons via `grammar.pendingCommand` — this is a no-op at the
  // visibility selector level (the selector depends on session + phase only).
  // The matrix pins that current contract so a future refactor that tried to
  // "hide help until pending resolves" would fail loud.
  const harness = renderSessionPostCorrect();
  setGrammarUiPatch(harness, { pendingCommand: 'submit-answer' });
  return harness;
}

function renderSessionRetry() {
  // Show-answer / retry flow: the learner answered wrong, then tapped the
  // repair `retry-current-question` action. The engine moves state back to
  // `phase='session'`, flips `session.repair.retryingCurrent=true`, and the
  // submit label becomes `Try again` (session.phase === 'retry' is reflected
  // at the read-model level via the engine's `state.phase = 'session'` +
  // `session.phase` left untouched). The UI visibility returns to all-false
  // during the retry attempt — the first attempt that was scored already
  // captured the scored record; the retry is not a second scored attempt.
  const harness = renderSessionPostWrong();
  harness.dispatch('grammar-retry-current-question');
  return harness;
}

function renderSessionModeFlipWorked() {
  // Mode flip Worked→Smart mid-round: start Worked mode, which stamps
  // `session.mode='worked'` + `session.supportLevel=2`. The production
  // `grammar-set-mode` dispatcher resets to dashboard, which is itself a
  // correct behaviour (the plan's "in-flight attempt keeps supportLevel"
  // language means that within a single attempt, a pref-change cannot
  // retroactively strip support from the scored record). To model the
  // narrow adversarial scenario — prefs drift out from under an in-flight
  // session — we patch `prefs.mode='smart'` directly via the store updater
  // while keeping `session.mode='worked'` + `session.supportLevel=2`. The
  // matrix then asserts the session-scoped visibility reflects worked
  // (in-flight), not smart (next-round).
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  const sample = pickOracleSample();
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-set-mode', { value: 'worked' });
  harness.dispatch('grammar-start', {
    payload: {
      roundLength: 2,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });
  // Patch prefs.mode directly: the adversarial scenario is a stale prefs
  // snapshot reaching the session scene after a mid-round pref mutation.
  setGrammarUiPatch(harness, {
    prefs: { ...harness.store.getState().subjectUi.grammar.prefs, mode: 'smart' },
  });
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
  // U4 follower adversarial-state renderers.
  'session-pre-pending': renderSessionPrePending,
  'session-feedback-pending': renderSessionFeedbackPending,
  'session-retry': renderSessionRetry,
  'session-mode-flip-worked': renderSessionModeFlipWorked,
});

// --- Per-phase HTML scope helpers ------------------------------------------
//
// Several child phases legitimately carry the adult `<details
// class="grammar-grown-up-view">` disclosure alongside the child scene.
// The disclosure body embeds `GrammarAnalyticsScene` (adult copy) and
// must be excluded from the child-facing sweep — otherwise the
// forbidden-term check flags terms the adult scene is *allowed* to
// carry (`Grammar progress`, `Bellstorm bridge`, ...).
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
// Phase 4 U2 follower-up hardening (nested-outer attack + duplicate-landmark
// attack): the previous lazy-regex approach (`[\s\S]*?</tag>(?=boundary)`)
// matched the inner landmark's close but kept the outer wrapper's close +
// trailing siblings when a hostile fixture nested the landmark inside a
// same-type outer element. A reviewer-authored
// `<section class="outer"><section data-grammar-phase-root="dashboard">INNER
// </section><p>OUTER-TEXT</p></section><details class="grammar-grown-up-view">`
// input produced scoped output `<section data-grammar-phase-root="dashboard">
// INNER</section><p>OUTER-TEXT</p></section>` — adult copy leaking into the
// child sweep. Regex with lazy quantifiers cannot solve nested same-type
// tag balancing in general.
//
// The fix is a depth-balanced walker (`scopeLandmark`) that counts opens
// and closes of the root tag until depth returns to zero. The walker
// also enforces exactly-one landmark occurrence, rejecting
// duplicate-landmark fixtures like
// `<main><div data-grammar-phase-root="summary">STALE</div><div
// data-grammar-phase-root="summary">FRESH</div></main>` which the old
// lazy-regex silently merged into one scoped string.
//
// Assumptions and SSR notes:
//   * React's server renderer emits tag names only inside tag brackets;
//     string literals like `<section>` never appear inside attribute
//     values after escaping. The walker's simple open/close detection is
//     therefore safe for SSR output and for synthetic test fixtures that
//     mirror that shape.
//   * Void/self-closing variants of `section` and `div` do not exist in
//     HTML5; the walker does not need to handle them.
//   * The optional `boundary` argument asserts that the root close is
//     immediately followed by a specific sibling marker. This preserves
//     the old boundary invariant (dashboard → grown-up-view disclosure,
//     transfer → `</div></main>`, summary → `</main>`) and fails loud if
//     a refactor reorders the sibling structure.

/**
 * Depth-balanced landmark scoper. Shared by all six `scope<Phase>` helpers.
 *
 * @param {string} html — full rendered HTML.
 * @param {string} phase — phase key, e.g. `"dashboard"`.
 * @param {string} rootTag — the landmark root tag name, e.g. `"section"` or `"div"`.
 * @param {string|null} [boundary] — optional substring that must appear immediately
 *   after the root close. Pass `null` when no sibling boundary is required.
 * @returns {string} the landmark-rooted substring (landmark open → root close).
 * @throws {Error} on missing / multiple landmarks, unbalanced tags, or missing
 *   expected boundary.
 */
function scopeLandmark(html, phase, rootTag, boundary = null) {
  const scoperName = `scope${phase[0].toUpperCase()}${phase.slice(1)}`;
  const landmarkAttr = `data-grammar-phase-root="${phase}"`;

  // -- Step 1: enforce exactly-one landmark (duplicate-landmark guard). --
  // A fixture or a refactor that leaves a stale landmark behind would
  // otherwise silently merge two subtrees into one scoped string. The
  // zero-match branch emits the legacy "no landmark found" message so
  // pre-follower error-path tests keep their stable message regex; the
  // duplicate branch emits a clearly different "duplicate landmark"
  // message so a fixture with two landmarks fails loud with a tailored
  // explanation.
  const landmarkMatches = html.match(new RegExp(`data-grammar-phase-root="${phase}"`, 'g')) || [];
  if (landmarkMatches.length === 0) {
    throw new Error(
      `${scoperName}: no data-grammar-phase-root="${phase}" landmark found in rendered HTML`,
    );
  }
  if (landmarkMatches.length > 1) {
    throw new Error(
      `${scoperName}: duplicate data-grammar-phase-root="${phase}" landmark — expected exactly 1, found ${landmarkMatches.length}`,
    );
  }

  // -- Step 2: locate the opening tag that carries the landmark. --
  // Search backwards from the attribute position for the most recent
  // `<rootTag ` or `<rootTag>` occurrence — that is the landmark's own
  // opening tag.
  const attrIdx = html.indexOf(landmarkAttr);
  if (attrIdx < 0) {
    throw new Error(
      `${scoperName}: no data-grammar-phase-root="${phase}" landmark found in rendered HTML`,
    );
  }
  // Scan backwards: find `<rootTag` followed by a space or `>`. We stop at
  // the first such occurrence within the same opening tag, i.e. before any
  // intervening `>` that would close a different tag.
  let openStart = -1;
  for (let i = attrIdx; i >= 0; i -= 1) {
    if (html[i] === '>') break; // landed in a different tag — bail
    if (html[i] === '<' && html.slice(i + 1, i + 1 + rootTag.length) === rootTag) {
      const afterName = html[i + 1 + rootTag.length];
      if (afterName === ' ' || afterName === '>' || afterName === '\t' || afterName === '\n') {
        openStart = i;
        break;
      }
    }
  }
  if (openStart < 0) {
    throw new Error(
      `${scoperName}: no data-grammar-phase-root="${phase}" landmark found in rendered HTML`,
    );
  }

  // -- Step 3: walk forward, counting opens/closes of `rootTag`. --
  // We start at `openStart`, treat the landmark's own opening tag as
  // depth=1, and increment/decrement as further same-type tags appear.
  // The root close is the first `</rootTag>` that returns depth to 0.
  const openMarker = `<${rootTag}`;
  const closeMarker = `</${rootTag}>`;
  let depth = 0;
  let i = openStart;
  let rootEnd = -1;
  while (i < html.length) {
    if (html.slice(i, i + openMarker.length) === openMarker) {
      const afterName = html[i + openMarker.length];
      if (afterName === ' ' || afterName === '>' || afterName === '\t' || afterName === '\n') {
        depth += 1;
        i += openMarker.length;
        continue;
      }
    }
    if (html.slice(i, i + closeMarker.length) === closeMarker) {
      depth -= 1;
      if (depth === 0) {
        rootEnd = i + closeMarker.length;
        break;
      }
      i += closeMarker.length;
      continue;
    }
    i += 1;
  }
  if (rootEnd < 0) {
    throw new Error(
      `${scoperName}: no data-grammar-phase-root="${phase}" landmark found in rendered HTML`,
    );
  }

  // -- Step 4: enforce the optional sibling boundary. --
  // This preserves the old regex lookahead contract so a refactor that
  // reorders the sibling siblings (e.g. inserting a `<hr>` between the
  // dashboard root and the grown-up-view disclosure) still fails loud.
  if (boundary !== null && html.slice(rootEnd, rootEnd + boundary.length) !== boundary) {
    throw new Error(
      `${scoperName}: no data-grammar-phase-root="${phase}" landmark found in rendered HTML`,
    );
  }

  return html.slice(openStart, rootEnd);
}

export function scopeDashboard(html) {
  // Dashboard root section ends right before the sibling
  // `<details class="grammar-grown-up-view">` disclosure.
  return scopeLandmark(html, 'dashboard', 'section', '<details class="grammar-grown-up-view">');
}

export function scopeSession(html) {
  return scopeLandmark(html, 'session', 'section', null);
}

export function scopeSummary(html) {
  // Summary shell root `<div>` closes just before `</main>`. The boundary
  // check enforces that sibling structure so a refactor that moves the
  // shell out of `<main>` fails loud.
  return scopeLandmark(html, 'summary', 'div', '</main>');
}

export function scopeBank(html) {
  return scopeLandmark(html, 'bank', 'section', null);
}

export function scopeTransfer(html) {
  // Transfer root contains nested `<section>` siblings (write, saved,
  // orphaned). The boundary check enforces that the root close is
  // immediately followed by `</div></main>`.
  return scopeLandmark(html, 'transfer', 'section', '</div></main>');
}

export function scopeAnalytics(html) {
  // Adult-facing — still asserts the landmark exists so the adult surface
  // cannot silently lose its root and turn inverse-presence into a
  // no-op. Returns the narrowed landmark-scoped substring; the adult
  // inverse-presence sweep reads `rawHtml` (not this scoped value) so
  // no downstream assertion is affected by the narrowing.
  return scopeLandmark(html, 'analytics', 'section', null);
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
  // U4 follower: the four adversarial states all render the session scene,
  // so they reuse the `data-grammar-phase-root="session"` landmark scoper.
  'session-pre-pending': scopeSession,
  'session-feedback-pending': scopeSession,
  'session-retry': scopeSession,
  'session-mode-flip-worked': scopeSession,
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
