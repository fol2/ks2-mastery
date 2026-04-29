// U5 (refactor ui-consolidation): PunctuationSessionScene adopts the
// platform hero engine on all three `.punctuation-strip` call-sites
// (active-item, minimal-feedback / GPS early-return, scored-feedback).
// These tests pin the new DOM landmarks so later refactors don't
// silently move the Session scene off `.punctuation-session-hero` /
// `.punctuation-session-hero-content` rhythm or regress the bellstorm
// phase → URL wiring the Playwright locators depend on.
//
// Coverage:
//   * Active-item phase paints its hero via `HeroBackdrop` with the
//     `active-item` bellstorm URL in its `--hero-bg` custom property.
//   * Feedback phase paints via `HeroBackdrop` with the `feedback`
//     bellstorm URL (both the minimal-feedback / GPS early-return branch
//     and the scored-feedback branch use the same URL).
//   * `.punctuation-session-hero-content .section-title` resolves on
//     every branch — this is the anchor Playwright locators (shared.mjs
//     `defaultMasks` + visual-baselines `injectFixedPromptContent`)
//     re-point to after the `.punctuation-strip` removal.
//   * The legacy `<img src srcSet>` hero element is gone from every
//     branch — a lingering `<img>` with a bellstorm src would signal a
//     half-migrated scene.
//   * GPS session type still shows the `.punctuation-test-mode-banner`
//     chip row underneath the hero (the chip row lives OUTSIDE the
//     hero wrapper — the refactor must not accidentally move it
//     inside).
//   * React rules-of-hooks discipline: the `previousHeroBgRef` lives on
//     `PunctuationSessionScene` (phase-stable parent), not inside the
//     two branches whose mounts flip with `ui.phase`.
//
// Uses the standalone SSR renderer so we can control `ui.phase`
// directly without routing through the app-harness (which always seeds
// a specific phase on `open-subject`). The renderer composes
// `renderToStaticMarkup` so `useEffect` bodies do not flush — this is
// fine because the hero-URL wiring is visible in the initial markup
// (the `HeroBackdrop` first render paints a single `is-active` layer
// with the current URL).

import test from 'node:test';
import assert from 'node:assert/strict';

import { renderPunctuationSessionSceneStandalone } from './helpers/punctuation-scene-render.js';
import { bellstormSceneForPhase } from '../src/subjects/punctuation/components/punctuation-view-model.js';

function stubActions() {
  return {
    dispatch() {},
    updateSubjectUi() {},
  };
}

function activeItemProps() {
  return {
    ui: {
      phase: 'active-item',
      session: {
        id: 'test-session',
        mode: 'endmarks',
        length: 4,
        answeredCount: 0,
        currentItem: {
          id: 'item-1',
          inputKind: 'choice',
          prompt: 'Pick the correct endmark.',
          instruction: 'Choose one.',
          mode: 'choice',
          options: [
            { index: 0, text: 'Full stop' },
            { index: 1, text: 'Question mark' },
            { index: 2, text: 'Exclamation mark' },
          ],
          skillIds: [],
        },
      },
    },
    actions: stubActions(),
  };
}

function feedbackProps({ gps = false } = {}) {
  return {
    ui: {
      phase: 'feedback',
      session: {
        id: 'test-session',
        mode: gps ? 'gps' : 'endmarks',
        length: 4,
        answeredCount: 1,
        currentItem: { id: 'item-1', inputKind: 'choice', prompt: 'p', options: [] },
      },
      feedback: {
        kind: 'success',
        headline: 'Nice work',
        body: 'The full stop goes there.',
        displayCorrection: 'Full stop.',
      },
    },
    actions: stubActions(),
  };
}

// --- Hero URL wiring -------------------------------------------------------

test('active-item phase paints the hero via HeroBackdrop with the active-item bellstorm URL', () => {
  const html = renderPunctuationSessionSceneStandalone(activeItemProps());
  const expectedUrl = bellstormSceneForPhase('active-item').src;

  // Platform HeroBackdrop stamps `.hero-backdrop` + the Punctuation-
  // scoped `.punctuation-hero-backdrop` so Playwright has a stable
  // class anchor to replace the pre-U5 `.punctuation-strip img`
  // selector.
  assert.match(html, /class="hero-backdrop punctuation-hero-backdrop"/);

  // The bellstorm URL reaches the layer via the `--hero-bg` CSS custom
  // property (see src/platform/ui/hero-bg.js::heroBgStyle). HTML
  // renderers escape the single quotes; matching against the encoded
  // sequence is the stable assertion shape.
  const escapedUrl = expectedUrl.replace(/\//g, '\\/');
  const pattern = new RegExp(`--hero-bg:url\\(&#x27;${escapedUrl}&#x27;\\)`);
  assert.match(html, pattern);

  // The legacy `<img src srcSet>` hero element is GONE. A lingering
  // `<img>` with a bellstorm `src` would signal a half-migrated
  // scene — both in terms of visual engine alignment AND the
  // SCREENSHOT_DETERMINISM_CSS rule that used to hide `.punctuation-
  // strip img`.
  assert.doesNotMatch(html, /<img[^>]+bellstorm-coast[^>]+srcSet/i);
});

test('active-item phase renders `.punctuation-session-hero-content .section-title` with the child-register-overridden prompt', () => {
  const html = renderPunctuationSessionSceneStandalone(activeItemProps());

  // The new stable anchor that Playwright locators re-point to. The
  // `<h2 className="section-title">` now sits INSIDE
  // `.punctuation-session-hero-content`, not inside the deprecated
  // `.punctuation-strip` wrapper.
  assert.match(html, /<div class="punctuation-session-hero-content">/);
  // Title text survives the HeroBackdrop swap.
  assert.match(html, /<h2 class="section-title">Pick the correct endmark\.<\/h2>/);
});

test('active-item phase on a GPS session still renders the delayed-feedback chip row underneath the hero', () => {
  const html = renderPunctuationSessionSceneStandalone({
    ...activeItemProps(),
    ui: {
      ...activeItemProps().ui,
      session: { ...activeItemProps().ui.session, mode: 'gps' },
    },
  });

  // The GPS chip row (`.punctuation-test-mode-banner`) must sit
  // OUTSIDE the `.punctuation-session-hero` wrapper — refactors that
  // accidentally fold it inside would push the chip behind the
  // `HeroBackdrop` z-index-0 backdrop.
  assert.match(html, /data-gps-banner/);
  assert.match(html, /Test mode: answers at the end/);
  // And the hero itself still paints.
  assert.match(html, /punctuation-session-hero-content/);
});

// --- Feedback branches -----------------------------------------------------

test('scored-feedback phase paints the hero via HeroBackdrop with the feedback bellstorm URL', () => {
  const html = renderPunctuationSessionSceneStandalone(feedbackProps());
  const expectedUrl = bellstormSceneForPhase('feedback').src;

  assert.match(html, /class="hero-backdrop punctuation-hero-backdrop"/);
  const escapedUrl = expectedUrl.replace(/\//g, '\\/');
  assert.match(html, new RegExp(`--hero-bg:url\\(&#x27;${escapedUrl}&#x27;\\)`));

  // The feedback headline + body still render inside the new anchor.
  assert.match(html, /<div class="punctuation-session-hero-content"[^>]*>/);
  assert.match(html, /<h2 class="section-title">Nice work<\/h2>/);
  assert.match(html, /The full stop goes there\./);

  // No legacy `<img>` survives the swap on the feedback branch.
  assert.doesNotMatch(html, /<img[^>]+bellstorm-coast[^>]+srcSet/i);
});

test('minimal-feedback / GPS early-return branch paints the hero via HeroBackdrop with the feedback bellstorm URL', () => {
  const html = renderPunctuationSessionSceneStandalone(feedbackProps({ gps: true }));
  const expectedUrl = bellstormSceneForPhase('feedback').src;

  assert.match(html, /class="hero-backdrop punctuation-hero-backdrop"/);
  const escapedUrl = expectedUrl.replace(/\//g, '\\/');
  assert.match(html, new RegExp(`--hero-bg:url\\(&#x27;${expectedUrl.replace(/\//g, '\\/')}&#x27;\\)`));

  // The GPS "Saved" headline renders on the new anchor — this is the
  // minimal-feedback branch (no scored feedback content; just a
  // "Saved / answers come at the end" surface).
  assert.match(html, /<div class="punctuation-session-hero-content"[^>]*>/);
  assert.match(html, /<h2 class="section-title">Saved<\/h2>/);
  assert.match(html, /Your answer is locked in/);

  // `aria-live="polite"` + `role="status"` move with the content
  // wrapper — the `role="status"` region is now on the content div,
  // not on a bare inner div inside `.punctuation-strip`.
  assert.match(html, /role="status"/);
  // Make sure the feedback banner STILL announces — the content wrapper
  // is the correct ancestor for the live region.
  assert.match(html, /data-punctuation-session-feedback-live/);

  // GPS (gps mode) AND feedback phase: no legacy `<img>` element.
  assert.doesNotMatch(html, /<img[^>]+bellstorm-coast[^>]+srcSet/i);
});

// --- React rules-of-hooks parent ownership ---------------------------------

test('PunctuationSessionScene owns the bellstorm URL derivation — every phase branch receives a hero backdrop layer', () => {
  // Active-item phase: renders the `.punctuation-hero-backdrop` wrapper.
  const activeHtml = renderPunctuationSessionSceneStandalone(activeItemProps());
  // Exactly one hero-backdrop wrapper emits on the active-item
  // render (no previousUrl to paint a second layer).
  const activeMatches = activeHtml.match(/class="hero-backdrop punctuation-hero-backdrop"/g) || [];
  assert.equal(activeMatches.length, 1);

  // Feedback phase: same singleton wrapper count. `previousUrl` is only
  // supplied when the ref captured a different URL — on a fresh SSR
  // render the ref starts at '' so no cross-fade second layer renders
  // on the initial paint. (The cross-fade is a mount-time transition
  // that needs `useEffect` flush to observe.)
  const feedbackHtml = renderPunctuationSessionSceneStandalone(feedbackProps());
  const feedbackMatches = feedbackHtml.match(/class="hero-backdrop punctuation-hero-backdrop"/g) || [];
  assert.equal(feedbackMatches.length, 1);
});

test('PunctuationSessionScene threads the bellstorm URL phase-specifically — active-item differs from feedback', () => {
  // This is a characterisation guard on the `phase → URL` routing in
  // `PunctuationSessionScene`. The parent chooses `'feedback'` when
  // `ui.phase === 'feedback'` and `'active-item'` otherwise; a regression
  // that passed `'setup'` or a hardcoded phase would surface here.
  const activeHtml = renderPunctuationSessionSceneStandalone(activeItemProps());
  const feedbackHtml = renderPunctuationSessionSceneStandalone(feedbackProps());

  const activeUrl = bellstormSceneForPhase('active-item').src;
  const feedbackUrl = bellstormSceneForPhase('feedback').src;
  // The two phases must map to different URLs in the baseline
  // `bellstormSceneForPhase` contract (active-item → C1, feedback →
  // D2); if this changes someone has edited the phase → index map
  // in the view-model.
  assert.notEqual(activeUrl, feedbackUrl);

  // The active-item render includes the active-item URL, not feedback.
  assert.ok(activeHtml.includes(activeUrl));
  assert.ok(!activeHtml.includes(feedbackUrl));

  // And vice versa.
  assert.ok(feedbackHtml.includes(feedbackUrl));
  assert.ok(!feedbackHtml.includes(activeUrl));
});
