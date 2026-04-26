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

/**
 * Navigate to `/demo` — the worker-api-backed dev server creates a demo
 * session, sets the auth cookie, and redirects to `/`. Wait for the
 * subject grid to render so we know the bootstrap round-trip succeeded
 * before the scene kicks off.
 */
export async function createDemoSession(page) {
  await page.goto('/demo', { waitUntil: 'networkidle' });
  await expect(page.locator('.subject-grid')).toBeVisible({ timeout: 15_000 });
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
 */
export async function reload(page) {
  await page.reload({ waitUntil: 'networkidle' });
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
 * Default `mask` list for `toHaveScreenshot`:
 *
 *  - Hero backdrops: picked per-learner-id from a rotating art set,
 *    so a fresh demo session draws a different tile each run.
 *  - Timestamps + celebration sprites: inherently non-deterministic
 *    and orthogonal to the layout contract under test.
 *  - Monster effect layer: celebration particles rendered over the
 *    session card after a correct answer.
 *
 * Per-scene callers can extend this list.
 */
export function defaultMasks(page) {
  return [
    page.locator('.spelling-hero-backdrop'),
    page.locator('.punctuation-hero img, .punctuation-strip img'),
    page.locator('.grammar-hero-backdrop'),
    page.locator('[data-dynamic-timestamp]'),
    page.locator('[data-celebration-sprite]'),
    page.locator('[data-monster-effect-layer]'),
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
 */
export async function applyDeterminism(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  page.on('dialog', (dialog) => dialog.accept().catch(() => {}));
}
