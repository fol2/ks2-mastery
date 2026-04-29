// U6 (refactor ui-consolidation): PunctuationSummaryScene adopts the
// platform hero engine on its sole `.punctuation-strip` call-site at the
// top of the summary card. These tests pin the new DOM landmarks so
// later refactors don't silently move the Summary scene off
// `.punctuation-summary-hero` / `.punctuation-summary-hero-content`
// rhythm or regress the bellstorm `'summary'` phase → URL wiring the
// Playwright locators (shared.mjs `defaultMasks` + visual-baselines
// `injectFixedPromptContent`) depend on.
//
// Coverage:
//   * Summary scene paints its hero via `HeroBackdrop` with the
//     `'summary'` bellstorm URL in its `--hero-bg` custom property.
//   * `.punctuation-summary-hero-content .section-title` resolves to the
//     child-register headline.
//   * Telemetry `summary-reached` + `feedback-rendered` still fire
//     exactly once per Summary mount (useRef guards preserved).
//   * `monster-progress-changed` fires on genuine stage transitions.
//   * Summary with `summary.total === 0` still suppresses the
//     `CorrectCountLine` (Phase 4 U5 contract).
//   * The legacy `<img src srcSet>` hero element is gone.

import test from 'node:test';
import assert from 'node:assert/strict';

import { renderPunctuationSummarySceneStandalone } from './helpers/punctuation-scene-render.js';
import { bellstormSceneForPhase } from '../src/subjects/punctuation/components/punctuation-view-model.js';

function stubActions() {
  return {
    dispatch() {},
  };
}

function summaryProps(extraSummary = {}) {
  return {
    ui: {
      availability: { status: 'ready' },
      session: { id: 'sess-u6-summary', mode: 'smart' },
      summary: {
        sessionId: 'sess-u6-summary',
        label: 'Punctuation session summary',
        message: 'Session complete.',
        total: 4,
        correct: 3,
        accuracy: 75,
        focus: [],
        ...extraSummary,
      },
    },
    actions: stubActions(),
    rewardState: {},
  };
}

// --- Hero URL wiring -------------------------------------------------------

test('U6 Summary: hero paints via HeroBackdrop with the summary bellstorm URL', () => {
  const html = renderPunctuationSummarySceneStandalone(summaryProps());
  const expectedUrl = bellstormSceneForPhase('summary').src;

  // Platform HeroBackdrop stamps `.hero-backdrop` + the Punctuation-
  // scoped `.punctuation-hero-backdrop`. Same chrome class as Session
  // (U5) + Setup (U4) — single source of truth for Playwright
  // determinism overrides.
  assert.match(html, /class="hero-backdrop punctuation-hero-backdrop"/);

  // The bellstorm URL reaches the layer via the `--hero-bg` CSS custom
  // property. HTML renderers escape single quotes; match the encoded
  // sequence.
  const escapedUrl = expectedUrl.replace(/\//g, '\\/');
  const pattern = new RegExp(`--hero-bg:url\\(&#x27;${escapedUrl}&#x27;\\)`);
  assert.match(html, pattern);

  // Legacy `<img src srcSet>` hero element is GONE — a lingering
  // `<img>` with a bellstorm src would signal a half-migrated scene.
  assert.doesNotMatch(html, /<img[^>]+bellstorm-coast[^>]+srcSet/i);
});

test('U6 Summary: `.punctuation-summary-hero-content .section-title` renders the tonal headline', () => {
  const html = renderPunctuationSummarySceneStandalone(summaryProps());

  // New stable anchor that Playwright locators re-point to.
  assert.match(html, /<div class="punctuation-summary-hero-content">/);
  // Section title renders inside the content wrapper.
  assert.match(html, /<h2 class="section-title">[^<]+<\/h2>/);
  // Eyebrow literal "Summary" still lives in the content wrapper.
  assert.match(html, /<div class="eyebrow">Summary<\/div>/);
});

test('U6 Summary: preserves the data-punctuation-summary section attribute', () => {
  const html = renderPunctuationSummarySceneStandalone(summaryProps());
  // Outer card still carries the stable attribute used by admin
  // diagnostic bundles + visual-baselines locators.
  assert.match(html, /data-punctuation-summary/);
});

// --- Zero-total suppression preserved --------------------------------------

test('U6 Summary: summary.total === 0 still suppresses the CorrectCountLine', () => {
  const html = renderPunctuationSummarySceneStandalone(
    summaryProps({ total: 0, correct: 0, accuracy: 0 }),
  );
  // Phase 4 U5 contract — a zero-round must not emit
  // "0 out of 0 correct". Hero chrome swap must not disturb this
  // suppression branch.
  assert.doesNotMatch(html, /0 out of 0 correct/);
  assert.doesNotMatch(html, /data-punctuation-summary-correct-count/);
  // Hero still paints.
  assert.match(html, /punctuation-summary-hero-content/);
});

// --- Telemetry refs preserved ----------------------------------------------

test('U6 Summary: summary-reached + feedback-rendered telemetry still fire on mount', () => {
  const calls = [];
  const actions = {
    dispatch(action, data) {
      calls.push({ action, data });
    },
  };
  renderPunctuationSummarySceneStandalone({
    ...summaryProps(),
    actions,
  });
  const recordEvents = calls.filter((entry) => entry.action === 'punctuation-record-event');
  const summaryReached = recordEvents.filter((entry) => entry.data.kind === 'summary-reached');
  const feedbackRendered = recordEvents.filter((entry) => entry.data.kind === 'feedback-rendered');
  assert.strictEqual(
    summaryReached.length,
    1,
    `Summary mount must emit exactly ONE summary-reached event; saw ${summaryReached.length}`,
  );
  assert.strictEqual(
    feedbackRendered.length,
    1,
    `Summary mount must emit exactly ONE feedback-rendered event; saw ${feedbackRendered.length}`,
  );
});

test('U6 Summary: monster-progress-changed fires when a stage advance is present in the payload', () => {
  const calls = [];
  const actions = {
    dispatch(action, data) {
      calls.push({ action, data });
    },
  };
  renderPunctuationSummarySceneStandalone({
    ui: {
      availability: { status: 'ready' },
      session: { id: 'sess-u6-progress', mode: 'smart' },
      summary: {
        sessionId: 'sess-u6-progress',
        total: 4,
        correct: 4,
        accuracy: 100,
        focus: [],
        monsterProgress: { monsterId: 'pealark', stageFrom: 0, stageTo: 1 },
      },
    },
    actions,
    rewardState: {},
  });
  const recordEvents = calls.filter((entry) => entry.action === 'punctuation-record-event');
  const monsterProgressChanged = recordEvents.filter(
    (entry) => entry.data.kind === 'monster-progress-changed',
  );
  assert.strictEqual(
    monsterProgressChanged.length,
    1,
    `stage-advance must emit exactly ONE monster-progress-changed event; saw ${monsterProgressChanged.length}`,
  );
});
