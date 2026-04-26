// U5 (sys-hardening p1): shared helpers for Playwright golden-path scenes.
//
// The three subject scenes (spelling, grammar, punctuation) share the
// same plumbing: open /demo to seed a demo session cookie, walk the home
// subject grid, enter a subject, and drive the one-correct + one-wrong
// + finish flow before reloading and re-verifying progress.
//
// Non-deterministic visual content (random celebration sprites,
// timestamps, and any viewport-specific strings) is masked by the
// per-scene `toHaveScreenshot` call sites. We also emulate
// `reducedMotion: 'reduce'` globally so celebration animations settle
// to a deterministic frame before the screenshot is captured.

import { expect } from '@playwright/test';

export const SUBJECT_IDS = ['spelling', 'grammar', 'punctuation'];

// Screenshot-only CSS override. Injected via `page.addStyleTag()` in
// `applyDeterminism()` + `reload()` to hide non-deterministic surfaces
// that otherwise blow past the 2% pixel-diff budget. Kept at module
// scope so every call site uses the same CSS string.
const SCREENSHOT_DETERMINISM_CSS = `
/* U5 playwright determinism overrides (spelling-golden-path.playwright
   .test.mjs + friends). Never ship via production CSS. */
.spelling-hero-backdrop,
.spelling-hero-backdrop .spelling-hero-layer,
.grammar-hero picture,
.grammar-hero > img,
.punctuation-hero img,
.punctuation-strip img,
.monster-celebration-overlay,
.monster-celebration-parts,
.toast-shelf {
  visibility: hidden !important;
  background-image: none !important;
}
`;

/**
 * Navigate to `/demo` — the worker-api-backed dev server creates a demo
 * session, sets the auth cookie, and redirects to `/`. Wait for the
 * subject grid to render so we know the bootstrap round-trip succeeded
 * before the scene kicks off. Also wait for every document font to
 * finish loading — Google Fonts (Fraunces, Inter) load async, and
 * `networkidle` alone returns before the font-swap frame, so screenshots
 * would otherwise capture the fallback font on one run and the loaded
 * face on the next. See `waitForFontsReady()`.
 */
export async function createDemoSession(page) {
  await page.goto('/demo', { waitUntil: 'networkidle' });
  await expect(page.locator('.subject-grid')).toBeVisible({ timeout: 15_000 });
  // Re-inject the determinism stylesheet AFTER the first real
  // navigation. `applyDeterminism()` is called in `beforeEach`, before
  // the first `page.goto()`, so its `addStyleTag()` no-ops against
  // `about:blank`. A fresh load also drops previously injected styles,
  // so this call is both the first-write and the rehydrate on every
  // subject scene entry.
  await page.addStyleTag({ content: SCREENSHOT_DETERMINISM_CSS });
  await waitForFontsReady(page);
  return { path: '/demo' };
}

/**
 * Open a subject from the home grid. Accepts `spelling`, `grammar`, or
 * `punctuation`.
 */
export async function openSubject(page, subjectId) {
  if (!SUBJECT_IDS.includes(subjectId)) {
    throw new Error(`openSubject: unknown subjectId ${subjectId}`);
  }
  const card = page.locator(`[data-action="open-subject"][data-subject-id="${subjectId}"]`);
  await expect(card).toBeVisible();
  await card.click();
}

/**
 * Navigate back to the home grid via the brand / breadcrumb button that
 * every subject surface ships. Used between subject scenes and after
 * summary screens to assert the dashboard rehydrates cleanly.
 */
export async function navigateHome(page) {
  const brand = page.locator('.profile-brand-button[data-action="navigate-home"]');
  await brand.first().click();
  await expect(page.locator('.subject-grid')).toBeVisible();
}

/**
 * Hard reload via `page.reload()` so we re-run the bootstrap round
 * trip. Used by every golden-path scene's "progress preserved" step.
 * Re-waits for document fonts AND re-injects the screenshot-determinism
 * stylesheet: `page.reload()` drops any style tag added by
 * `addStyleTag()`, so scenes that take a post-reload screenshot would
 * otherwise see the rotating hero art again.
 */
export async function reload(page) {
  await page.reload({ waitUntil: 'networkidle' });
  await page.addStyleTag({ content: SCREENSHOT_DETERMINISM_CSS });
  await waitForFontsReady(page);
}

/**
 * Wait for the spelling session input slot to be ready, then type and
 * submit. Returns the submitted text so scenes can assert against
 * feedback state.
 */
export async function spellingAnswer(page, value) {
  const input = page.locator('.spelling-in-session.is-question-revealed input[name="typed"]');
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill(value);
  await input.press('Enter');
  return value;
}

/**
 * Advance past the spelling feedback card. Only available when the
 * session is in `awaiting-advance` — the scene is expected to wait for
 * the Continue button before calling this helper.
 */
export async function spellingContinue(page) {
  const button = page.locator('[data-action="spelling-continue"]');
  await expect(button).toBeVisible();
  await button.click();
}

/**
 * Complete one answer in the punctuation surface (choice or text) and
 * press the submit button. Returns the submitted payload for the
 * caller's assertions.
 *
 * Choice items: the radio is inside a `.choice-card` label, so
 * clicking the label propagates to the radio via native behaviour.
 *
 * Waits up to 10s for EITHER a `.choice-card` row or a text
 * `textarea[name="typed"]` to mount — the next item may take a few
 * frames to render after the previous feedback's Continue click.
 */
export async function punctuationAnswer(page, { typed = '', choiceIndex = 0 } = {}) {
  const choiceCard = page.locator('.choice-card');
  const textarea = page.locator('textarea[name="typed"]').first();
  const submit = page.locator('[data-punctuation-submit]');
  await expect(submit).toBeVisible({ timeout: 10_000 });
  const choiceCount = await choiceCard.count();
  if (choiceCount > 0) {
    const selection = choiceCard.nth(Math.min(Number(choiceIndex) || 0, choiceCount - 1));
    await selection.click();
    await expect(submit).toBeEnabled({ timeout: 5_000 });
    await submit.click();
    return { choiceIndex };
  }
  await expect(textarea).toBeVisible({ timeout: 10_000 });
  await textarea.fill(typed);
  await submit.click();
  return { typed };
}

export async function punctuationContinue(page) {
  const button = page.locator('[data-punctuation-continue]');
  await expect(button).toBeVisible();
  await button.click();
}

/**
 * Grammar session helper: the form has a primary "Submit" button and
 * a "Continue" button on the feedback screen. Both use the enclosing
 * form so the scene only needs the value argument.
 */
export async function grammarAnswer(page, { typed = '' } = {}) {
  const input = page.locator('.grammar-answer-form input[name], .grammar-answer-form textarea[name]').first();
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill(typed);
  await page.locator('.grammar-answer-form button[type="submit"].primary').first().click();
}

/**
 * Compose a screenshot filename from (subject, scene). Playwright
 * automatically suffixes project name + `.png` so we only supply the
 * logical step.
 */
export function screenshotName(subjectId, scene) {
  return `${subjectId}-${scene}.png`;
}

/**
 * Additional `mask` list for `toHaveScreenshot`. The stylesheet injected
 * in `applyDeterminism()` already hides hero art, toast shelf, and
 * monster celebrations (see the comment on `SCREENSHOT_DETERMINISM_CSS`);
 * what remains is per-session content that CANNOT be stabilised via a
 * blanket CSS override because the layout depends on its flow:
 *
 *  - `.cloze` / `.prompt-sentence`: the demo learner draws a fresh
 *    random word from the vocabulary pool each session, so the literal
 *    sentence ("The parcel arrived at the correct ___.") varies across
 *    runs. Masking these keeps the baseline focused on prompt layout,
 *    type, chrome, and spacing — not on any particular word.
 *
 * Earlier iterations referenced `[data-dynamic-timestamp]`,
 * `[data-celebration-sprite]`, `[data-monster-effect-layer]`, and
 * `.grammar-hero-backdrop` — none of those resolve in today's DOM, and
 * the old `.spelling-hero-backdrop` entry painted magenta over the
 * entire session card (inset:0 container). The CSS-level fix in
 * `applyDeterminism()` replaces all of them.
 *
 * Per-scene callers can extend this list.
 */
export function defaultMasks(page) {
  return [
    page.locator('.cloze'),
    page.locator('.prompt-sentence'),
  ];
}

/**
 * Apply the shared determinism defaults every golden-path scene relies
 * on. Must be called from each scene's `test.beforeEach` before the
 * first navigation.
 *
 * Also registers a default `dialog` handler that accepts every
 * `confirm()` / `alert()` — the spelling "End round early" action
 * opens a `globalThis.confirm()` prompt (`module.js:268`), and
 * Playwright otherwise blocks the page waiting for a dismiss.
 *
 * Inject a screenshot-only stylesheet via `page.addStyleTag()` that
 * hides every known non-deterministic hero image. We CANNOT reach
 * these via Playwright's `mask` option because the hero elements are
 * `position: absolute; inset: 0` — masking them paints magenta over
 * the entire session card, defeating the point of the capture. A CSS
 * override on `background-image: none !important` + `visibility: hidden
 * !important` keeps the layout chrome intact while guaranteeing
 * pixel-for-pixel identical hero regions between runs. The demo
 * learner picks a different learnerId on each `/demo` redirect, which
 * selects a different hero tile, so suppressing the tile is the only
 * way to stabilise the screenshot without re-architecting the demo
 * bootstrap flow.
 */
export async function applyDeterminism(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  page.on('dialog', (dialog) => dialog.accept().catch(() => {}));
  // Note: the stylesheet is injected in `createDemoSession()` and in
  // `reload()`; `beforeEach` typically runs before the first
  // navigation, so `addStyleTag()` here would no-op against the
  // initial `about:blank`.
}

/**
 * Await `document.fonts.ready` inside the page so every `@font-face`
 * declared by the app (Fraunces, Inter, Crimson Pro, …) is fully loaded
 * before a screenshot is captured. Without this, `networkidle` returns
 * as soon as the network queue drains, but the browser may still be
 * rendering the fallback font (system sans). A later run captures the
 * post-swap frame with the loaded face, and the > 2% pixel diff blows
 * past `maxDiffPixelRatio`.
 *
 * Safe to call multiple times; `document.fonts.ready` resolves with the
 * FontFaceSet once all outstanding loads finish and caches the result.
 * Call this after any navigation and before any `toHaveScreenshot`.
 */
export async function waitForFontsReady(page) {
  await page.evaluate(async () => {
    if (typeof document === 'undefined') return;
    if (document.fonts && typeof document.fonts.ready?.then === 'function') {
      await document.fonts.ready;
    }
  });
}
