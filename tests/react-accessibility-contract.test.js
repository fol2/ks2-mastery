import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  renderAuthSurfaceFixture,
  renderAppFixture,
  renderSharedSurfaceFixture,
} from './helpers/react-render.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import { createAppHarness } from './helpers/app-harness.js';
import {
  createGrammarHarness,
  grammarResponseFormData,
} from './helpers/grammar-subject-harness.js';
import { readGrammarLegacyOracle } from './helpers/grammar-legacy-oracle.js';
import { normaliseGrammarReadModel } from '../src/subjects/grammar/metadata.js';

// ----------------------------------------------------------------------------
// Phase 3 U9 — Grammar accessibility contract.
//
// SSR blind spots intentionally left to manual QA (Windows + macOS browsers):
//   - Real DOM focus motion (data-autofocus is a marker only; the runtime
//     hook lives in the post-render app shell and cannot be asserted from
//     renderToStaticMarkup).
//   - Pointer capture, touch targets under 44px on small phones (CSS
//     assertion only — we rely on `.btn` / `.btn.xl` min-height rules in
//     `styles/app.css` which SSR cannot measure in pixels).
//   - Browser IME candidate windows while typing in the Grammar answer
//     input / Writing Try textarea.
//   - Scroll-into-view motion (summary `Review answers` uses
//     `scrollIntoView`, only callable at runtime).
//   - Animation frames / `requestIdleCallback` / `MutationObserver`-driven
//     side effects (none read-critical for a11y here).
//   - Keyboard focus *return* after the concept detail modal closes; the
//     `data-focus-return-id` attribute is the SSR-visible shim and the
//     actual `element.focus()` motion is a runtime concern.
// ----------------------------------------------------------------------------

test('auth and app error surfaces expose live failure feedback', async () => {
  const authHtml = await renderAuthSurfaceFixture();

  assert.match(authHtml, /role="alert"/);
  assert.match(authHtml, /aria-live="polite"/);

  const appHtml = await renderAppFixture({ route: 'throw' });
  assert.match(appHtml, /role="alert"/);
  assert.match(appHtml, /App surface temporarily unavailable/);
});

test('subject route carries the migration accessibility contract for the live spelling scene', async () => {
  const html = await renderAppFixture({ route: 'subject' });

  assert.match(html, /aria-label="Subject breadcrumb"/);
  assert.match(html, /Round setup/);
  assert.match(html, /aria-label="Spelling pool"/);
  assert.match(html, /role="radio"/);
});

test('word-bank modal declares dialog semantics, tabs, replay, and drill controls', () => {
  const harness = createAppHarness({ storage: installMemoryStorage() });

  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-open-word-bank');
  harness.dispatch('spelling-word-detail-open', { slug: 'possess', value: 'drill' });

  const html = harness.render();

  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /aria-labelledby="wb-modal-word"/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /role="tab"/);
  assert.match(html, /aria-label="Close"/);
  const backdrop = html.match(/<div class="wb-modal-backdrop"[^>]*>/)?.[0] || '';
  assert.match(backdrop, /aria-hidden="true"/);
  assert.doesNotMatch(backdrop, /tabindex|tabIndex/);
  assert.match(html, /data-action="spelling-word-bank-drill-replay"/);
  assert.match(html, /name="typed"[^>]*data-autofocus="true"/);
  assert.match(html, /(?:autoComplete|autocomplete)="off"/);
  assert.match(html, /spellcheck="false"/);
  assert.doesNotMatch(html, />possess<\/h2>/);
});

// ----------------------------------------------------------------------------
// Phase 3 U9 — Grammar scene a11y contract entries
// ----------------------------------------------------------------------------

function grammarOracleSample(templateId = 'question_mark_select') {
  return readGrammarLegacyOracle().templates.find((template) => template.id === templateId);
}

function openGrammarDashboard() {
  const harness = createGrammarHarness({ storage: installMemoryStorage() });
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  return harness;
}

test('Grammar dashboard exposes labelled form controls and a single primary action', () => {
  const harness = openGrammarDashboard();
  const html = harness.render();

  // Round length and speech rate selects live inside wrapping `<label>`
  // elements (implicit labelling).
  assert.match(html, /<label class="field"><span>Round length<\/span>/);
  assert.match(html, /<label class="field"><span>Speech rate<\/span>/);
  // Exactly one primary CTA in the default dashboard state (`Begin round`).
  const primaryMatches = html.match(/class="btn primary[^"]*"/g) || [];
  assert.equal(primaryMatches.length, 1, 'dashboard must render a single .btn.primary');
});

test('Grammar Bank chips, search, and modal meet the Phase 3 a11y contract', () => {
  const harness = openGrammarDashboard();
  harness.dispatch('grammar-open-concept-bank');
  const bankHtml = harness.render();

  // Search input carries an explicit aria-label (there is no visible label
  // text adjacent to the input — the wrapping <span> is visually hidden).
  assert.match(bankHtml, /aria-label="Search Grammar concepts"/);
  // Filter chips expose aria-pressed toggling.
  assert.match(bankHtml, /aria-pressed="(?:true|false)"[^>]*data-action="grammar-concept-bank-filter"/);
  assert.match(bankHtml, /aria-pressed="(?:true|false)"[^>]*data-action="grammar-concept-bank-cluster-filter"/);
  // Back to dashboard button is explicitly labelled (text + aria-label).
  assert.match(bankHtml, /aria-label="Back to Grammar Garden dashboard"/);

  // Open the concept detail modal — dialog semantics + labelledby required.
  const anyCard = harness.store.getState().subjectUi.grammar.analytics?.concepts?.[0];
  const seededConceptId = anyCard?.id || 'relative_clauses';
  harness.dispatch('grammar-concept-detail-open', { conceptId: seededConceptId });
  const modalHtml = harness.render();
  assert.match(modalHtml, /role="dialog"/);
  assert.match(modalHtml, /aria-modal="true"/);
  assert.match(modalHtml, /aria-labelledby="grammar-concept-detail-title-/);
  // Focus-return shim for modal close.
  assert.match(modalHtml, /data-focus-trigger-id="grammar-bank-concept-card-/);
  // Close button has an explicit aria-label.
  assert.match(modalHtml, /aria-label="Close concept details"/);
});

test('Grammar session answer input carries the autofocus shim and feedback live regions', () => {
  const harness = createGrammarHarness({ storage: installMemoryStorage() });
  // Use a textarea template so the autofocus shim marker is exercised on
  // the text-entry branch of GrammarInput (choice templates render radio
  // inputs that intentionally do not carry data-autofocus).
  const sample = grammarOracleSample('fix_fronted_adverbial');
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-start', {
    payload: {
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });

  let html = harness.render();
  // Session answer input is auto-focus-marked so the runtime shell can
  // restore focus on session entry. The textarea branch carries the shim.
  assert.match(html, /class="input grammar-textarea"[^>]*data-autofocus="true"/);
  // Single .btn.primary per session state (Submit in pre-answer phase).
  const preAnswerPrimary = (html.match(/class="btn primary[^"]*"/g) || []).length;
  assert.equal(preAnswerPrimary, 1, 'session pre-answer must render a single .btn.primary');

  harness.dispatch('grammar-submit-form', {
    formData: grammarResponseFormData(sample.correctResponse),
  });
  html = harness.render();
  // Feedback panel carries role=status + aria-live=polite (good or warn).
  assert.match(html, /class="feedback (?:good|warn)" role="status" aria-live="polite"/);
});

test('Grammar session error banner carries role="alert" so assistive tech announces failures', () => {
  const harness = createGrammarHarness({ storage: installMemoryStorage() });
  const learnerId = harness.store.getState().learners.selectedId;
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.store.updateSubjectUiForLearner(learnerId, 'grammar', (previous) => ({
    ...normaliseGrammarReadModel(previous, learnerId),
    phase: 'session',
    error: 'Grammar is unavailable right now.',
    session: {
      id: 'sess-a11y',
      currentIndex: 0,
      targetCount: 1,
      answered: 0,
      currentItem: {
        promptText: 'Type your answer.',
        inputSpec: { type: 'text' },
      },
    },
  }));
  const html = harness.render();
  assert.match(html, /role="alert"/);
});

test('Grammar mini-test nav exposes aria-current=step + aria-pressed for assistive tech', () => {
  const harness = createGrammarHarness({ storage: installMemoryStorage() });
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-set-mode', { value: 'satsset' });
  harness.dispatch('grammar-start', { payload: { roundLength: 2 } });
  const html = harness.render();
  // aria-current on the current question; aria-pressed="false" everywhere
  // (no questions saved yet).
  assert.match(html, /aria-current="step"/);
  assert.match(html, /aria-pressed="false"/);
});

test('Grammar Writing Try scene labels the textarea, carries autofocus marker, and uses fieldset/legend self-check', () => {
  const harness = openGrammarDashboard();
  const learnerId = harness.store.getState().learners.selectedId;
  harness.store.updateSubjectUiForLearner(learnerId, 'grammar', (previous) => ({
    ...normaliseGrammarReadModel(previous, learnerId),
    phase: 'transfer',
    transferLane: {
      mode: 'non-scored',
      prompts: [{
        id: 'storm-scene',
        title: 'Storm scene',
        brief: 'Describe a storm for a reader.',
        grammarTargets: ['adverbials'],
        checklist: ['I used a fronted adverbial.', 'I used commas for parenthesis.'],
      }],
      limits: { writingCapChars: 2000 },
      evidence: [],
    },
    ui: {
      ...(previous?.ui || {}),
      transfer: { selectedPromptId: 'storm-scene', draft: '', ticks: {} },
    },
  }));

  const html = harness.render();
  // Back button aria-label.
  assert.match(html, /aria-label="Back to Grammar Garden dashboard"/);
  // Textarea wrapped in a `<label>` with visible text and marked for
  // runtime autofocus on mode entry.
  assert.match(html, /<span class="grammar-transfer-textarea-label">Your writing<\/span>/);
  assert.match(html, /class="grammar-transfer-textarea"[^>]*data-autofocus="true"/);
  // Counter uses role=status + aria-live=polite under cap.
  assert.match(html, /id="grammar-transfer-counter"[^>]*role="status"[^>]*aria-live="polite"/);
  // Checklist uses native fieldset + legend (read as a group by assistive
  // tech) and every checkbox sits inside a <label>.
  assert.match(html, /<fieldset class="grammar-transfer-checklist"[^>]*><legend[^>]*>Self-check<\/legend>/);
  assert.match(html, /<label class="grammar-transfer-checklist-label">/);
});

test('Grammar summary Grown-up view button advertises adult report semantics', () => {
  const harness = createGrammarHarness({ storage: installMemoryStorage() });
  const sample = grammarOracleSample();
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-start', {
    payload: { roundLength: 1, templateId: sample.id, seed: sample.sample.seed },
  });
  harness.dispatch('grammar-submit-form', {
    formData: grammarResponseFormData(sample.correctResponse),
  });
  harness.dispatch('grammar-continue');
  const html = harness.render();
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'summary');
  // Summary carries the adult-report escape hatch on a quiet ghost button.
  assert.match(html, /aria-label="Open adult report"/);
  assert.match(html, /class="btn ghost"[^>]*aria-label="Open adult report"/);
});

test('Grammar analytics back button is labelled for assistive tech', () => {
  const harness = createGrammarHarness({ storage: installMemoryStorage() });
  const sample = grammarOracleSample();
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-start', {
    payload: { roundLength: 1, templateId: sample.id, seed: sample.sample.seed },
  });
  harness.dispatch('grammar-submit-form', {
    formData: grammarResponseFormData(sample.correctResponse),
  });
  harness.dispatch('grammar-continue');
  harness.dispatch('grammar-open-analytics');
  const html = harness.render();
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'analytics');
  assert.match(html, /aria-label="Back to round summary"/);
  // Analytics heading labels the scene section.
  assert.match(html, /aria-labelledby="grammar-analytics-title"/);
});

test('Grammar button CSS contract — .btn.xl primary keeps a 44px-friendly tap target', () => {
  // The Grammar dashboard `Begin round` button applies `.btn.primary.xl`
  // from `styles/app.css`. We guard the 48px min-height rule against
  // accidental regression. SSR cannot measure pixels, so we read the CSS
  // source instead (per Phase 3 U9 test plan — CSS rule assertion is the
  // agreed proxy for touch-target width on mobile).
  const cssPath = new URL('../styles/app.css', import.meta.url);
  const css = readFileSync(cssPath, 'utf8');
  const xlRule = css.match(/\.btn\.xl\s*\{[\s\S]*?min-height:\s*(\d+)px/);
  assert.ok(xlRule, '.btn.xl rule must declare min-height');
  assert.ok(Number(xlRule[1]) >= 44, `.btn.xl min-height must be >= 44px (got ${xlRule[1]}px)`);
});

// ----------------------------------------------------------------------------
// U10 (sys-hardening p1) — shared surface accessibility contract.
//
// These assertions pin the three anchors / ARIA attributes that U10's
// Playwright scenes rely on:
//
//   - `tests/playwright/multi-tab-bootstrap.playwright.test.mjs`
//   - `tests/playwright/reduced-motion.playwright.test.mjs`
//   - `tests/playwright/accessibility-golden.playwright.test.mjs`
//
// A regression that removes the `data-testid="toast-shelf"`, downgrades
// the `role="status"` on toasts, or drops the
// `data-testid="monster-celebration"` anchor will fail HERE first —
// earlier and more cheaply than the browser suite.
//
// Scope boundary: the baseline doc entry "Broken card states when
// session data is partially loaded, showing skeleton-card outline
// without the shimmer animation" is tracked in U12 — there is no
// loading-skeleton role/aria contract in the current shell, so no
// assertion is added for it in U10. Empty-state copy invariants are
// per-surface, so they are covered by each subject scene's own
// contract test rather than a single cross-shell assertion.
// ----------------------------------------------------------------------------

test('ToastShelf container is the single aria-live region anchored by data-testid for SR announcement', async () => {
  const html = await renderSharedSurfaceFixture();
  // Anchor + role + live region + accessible name are the four
  // invariants U10 locks. A copy regression that removes any of them
  // surfaces here before the Playwright scene.
  assert.match(html, /data-testid="toast-shelf"/);
  // role=status on the container elevates the aria-live contract for
  // assistive tech that ignores live regions without an explicit role.
  assert.match(html, /<div class="toast-shelf"[^>]*role="status"/);
  assert.match(html, /<div class="toast-shelf"[^>]*aria-live="polite"/);
  assert.match(html, /<div class="toast-shelf"[^>]*aria-label="Notifications"/);
  // U10 review follow-up (adversarial finding #6): the inner <aside>
  // elements MUST NOT carry their own role=status. Nested live regions
  // have undefined AT behaviour (NVDA/VoiceOver may double-announce or
  // skip). The container is the single live region.
  assert.match(html, /<aside class="toast [^"]*"(?![^>]*role="status")/);
  // The close button is explicitly labelled.
  assert.match(html, /aria-label="Dismiss notification"/);
});

test('MonsterCelebrationOverlay exposes dialog semantics + data-testid anchor for reduced-motion scene', async () => {
  const html = await renderSharedSurfaceFixture();
  // `role="dialog"` + `aria-modal="true"` + `aria-labelledby` was the
  // pre-U10 contract; the `data-testid` anchor is the new addition so
  // the reduced-motion scene can query the overlay deterministically.
  assert.match(html, /<section class="monster-celebration-overlay[^"]*"[^>]*role="dialog"/);
  assert.match(html, /<section class="monster-celebration-overlay[^"]*"[^>]*aria-modal="true"/);
  assert.match(html, /aria-labelledby="monster-celebration-title"/);
  assert.match(html, /data-testid="monster-celebration"/);
  // `data-celebration-kind` exposes the event kind (caught/evolve/mega)
  // for the scene to filter on without reading the className bag.
  assert.match(html, /data-celebration-kind="caught"/);
});

test('PersistenceBanner degraded mode keeps role=status + aria-live for the persistence SR contract', async () => {
  // U9 already pinned the banner data-testids; U10 adds an explicit
  // aria contract assertion so a copy regression that drops the
  // announce semantics surfaces in the contract suite rather than
  // only in the chaos Playwright suite.
  const html = await renderSharedSurfaceFixture();
  assert.match(html, /data-testid="persistence-banner"/);
  // The persistence feedback block carries role=status + aria-live.
  assert.match(html, /class="feedback warn"[^>]*role="status"[^>]*aria-live="polite"/);
});

test('home dashboard subject-grid carries keyboard-reachable open-subject buttons for the accessibility-golden scene', async () => {
  // The accessibility-golden Playwright scene focuses the subject
  // card via `locator.focus()` + `Enter`. That presupposes the card
  // is a NATIVE focusable element (not a div with a click handler).
  // We lock the `<button data-action="open-subject">` shape here so
  // any refactor that swaps the element type (e.g. <a href="#"> or
  // <div role="button">) catches this test before the scene.
  const html = await renderAppFixture({ route: 'dashboard' });
  assert.match(html, /<button[^>]*data-action="open-subject"/);
  // Every subject card advertises its subject id (scene query uses it).
  assert.match(html, /data-action="open-subject"[^>]*data-subject-id="spelling"/);
});
