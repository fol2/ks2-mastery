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
import { existsSync } from 'node:fs';

// SH2-U6 (sys-hardening p2): re-export the mask-coverage invariant
// helpers so every scene can import both from `./shared.mjs` without
// adding a second import path. The actual logic lives in
// `./shared-mask-coverage.mjs` to keep this file from growing past
// the maintainable threshold. See its module-level comment for the
// P1 U5 silent-green hazard narrative.
export {
  measureMaskCoverage,
  assertMaskCoverage,
  expectMaskCoverageWithinLimit,
} from './shared-mask-coverage.mjs';

export const SUBJECT_IDS = ['spelling', 'grammar', 'punctuation'];

let syntheticDemoClientIndex = 0;

export function syntheticDemoClientIpForIndex(index) {
  const safeIndex = Math.max(0, Number(index) || 0);
  const thirdOctet = Math.floor(safeIndex / 250);
  const fourthOctet = (safeIndex % 250) + 1;
  return `203.0.${thirdOctet}.${fourthOctet}`;
}

async function applySyntheticDemoClientIp(page) {
  const clientIp = syntheticDemoClientIpForIndex(syntheticDemoClientIndex);
  syntheticDemoClientIndex += 1;
  await page.setExtraHTTPHeaders({
    'CF-Connecting-IP': clientIp,
  });
}

// Screenshot-only CSS override. Injected via `page.addStyleTag()` in
// `applyDeterminism()` + `reload()` to hide non-deterministic surfaces
// that otherwise blow past the 2% pixel-diff budget. Kept at module
// scope so every call site uses the same CSS string.
//
// SH2-U6 additions: `.hero-paper` + `.hero-art` carry a
// `--hero-bg` CSS variable driven by `randomHeroBackground()` keyed on
// the demo learner id. The learner id is random per `/demo` mint, so
// two successive runs land on different hero art and the dashboard
// baseline drifts ~20% of pixels. Hiding `background-image` on these
// containers is a no-op for layout (the hero copy sits on its own
// gradient ribbon) and pins the dashboard to a deterministic frame.
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
/* SH2-U6: home-surface hero art is per-learner-random. Hiding the
   background-image pins the dashboard baseline without collapsing the
   hero band's height (the outer .hero-paper + .hero-art keep their
   width/height via grid layout). */
.hero-paper,
.hero-art {
  background-image: none !important;
  --hero-bg: none !important;
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
 *
 * The local worker harness still enforces the production demo-create
 * rate limit. Full PR-time Playwright runs create many fresh browser
 * contexts from the same loopback connection, so the helper stamps a
 * deterministic synthetic client IP before `/demo`. Production rate
 * limiting remains covered by Worker tests; browser scenes get isolated
 * demo clients instead of competing for one shared `unknown:missing`
 * bucket.
 */
export async function createDemoSession(page) {
  await applySyntheticDemoClientIp(page);
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
 *
 * SH2-U6 review blocker-6: `[data-action="open-subject"][data-subject-id]`
 * matches TWO elements on the home surface — the hero CTA button
 * (`.btn.primary.xl` that auto-targets the recommended subject) AND the
 * subject-grid card. The hero CTA was added by PR #273 and breaks
 * Playwright's strict-mode click with "locator resolved to 2 elements".
 * Scope to `.subject-card` so the grid card is the sole target; the
 * hero CTA path is still exercised by tests that want it explicitly via
 * `.hero-cta-row .btn.primary.xl` selectors.
 */
export async function openSubject(page, subjectId) {
  if (!SUBJECT_IDS.includes(subjectId)) {
    throw new Error(`openSubject: unknown subjectId ${subjectId}`);
  }
  const card = page.locator(
    `.subject-card[data-action="open-subject"][data-subject-id="${subjectId}"]`,
  );
  await expect(card).toBeVisible();
  await card.click();
}

export async function focusSubjectCard(page, subjectId) {
  if (!SUBJECT_IDS.includes(subjectId)) {
    throw new Error(`focusSubjectCard: unknown subjectId ${subjectId}`);
  }
  const card = page.locator(
    `.subject-card[data-action="open-subject"][data-subject-id="${subjectId}"]`,
  );
  await expect(card).toBeVisible();
  await card.focus();
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

export async function drivePunctuationSessionToSummary(page, {
  maxSteps = 24,
  typedPrefix = 'punctuation-answer',
} = {}) {
  for (let i = 0; i < maxSteps; i += 1) {
    if (await page.locator('[data-punctuation-summary]').first().isVisible().catch(() => false)) {
      return;
    }

    const submit = page.locator('[data-punctuation-submit]').first();
    if (await submit.isVisible().catch(() => false)) {
      await punctuationAnswer(page, {
        typed: `${typedPrefix}-${i}`,
        choiceIndex: 0,
      });
      await expect(
        page.locator('[data-punctuation-summary], [data-punctuation-phase="feedback"]').first(),
      ).toBeVisible({ timeout: 15_000 });
      continue;
    }

    const continueButton = page.locator('[data-punctuation-continue]').first();
    if (await continueButton.isVisible().catch(() => false)) {
      await punctuationContinue(page);
      await expect(
        page.locator('[data-punctuation-summary], [data-punctuation-phase="active-item"]').first(),
      ).toBeVisible({ timeout: 15_000 });
      continue;
    }

    await expect(
      page.locator('[data-punctuation-summary], [data-punctuation-submit], [data-punctuation-continue]').first(),
    ).toBeVisible({ timeout: 15_000 });
  }

  await expect(page.locator('[data-punctuation-summary]')).toBeVisible({ timeout: 15_000 });
}

/**
 * Grammar session helper: the form has a primary "Submit" button and
 * a "Continue" button on the feedback screen. Both use the enclosing
 * form so the scene only needs the value argument.
 */
export async function grammarAnswer(page, { typed = '' } = {}) {
  const answer = await fillGrammarAnswer(page, { typed });
  if (answer.kind === 'none') {
    throw new Error('grammarAnswer: no supported answer control was visible.');
  }
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

export function hasCurrentPlatformScreenshot(testInfo, name) {
  return existsSync(testInfo.snapshotPath(name));
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
 *
 * SH2-U6 (sys-hardening p2): `defaultMasks()` is audited at runtime by
 * the mask-coverage invariant (see `shared-mask-coverage.mjs`). The
 * two targeted selectors `.cloze` + `.prompt-sentence` resolve to a
 * narrow inline-text region within the session card (typically
 * < 2% of any viewport), so the default comfortably passes the ≤30%
 * coverage check. Extension by per-scene callers is the only path
 * that can push the total above the threshold, which is the whole
 * point of the guard: any new over-broad selector is caught before
 * the baseline is committed.
 */
export function defaultMasks(page) {
  return [
    page.locator('.cloze'),
    page.locator('.prompt-sentence'),
    // SH2-U6 extensions — the grammar + punctuation prompt texts are
    // per-session random. Masking them keeps baselines stable across
    // demo runs (the prompt word changes each time /demo mints a new
    // learner). All locators are small inline-text regions — well
    // under the 30% coverage limit even when matched across a
    // viewport.
    page.locator('.grammar-prompt'),
    // SH2-U6 review nit-1 fix: the punctuation session renders its
    // prompt as `<h2 className="section-title">` inside the
    // `.punctuation-strip` header. The item source text lives in
    // `[data-punctuation-session-source]` (a `<blockquote>`); both
    // carry per-item variable content. `.punctuation-prompt` /
    // `.punctuation-question` never existed in the DOM — removing
    // the phantom selectors so the default-mask audit (NIT-2) shows
    // every entry resolves to ≥1 element.
    page.locator('[data-punctuation-session-source]'),
    page.locator('.punctuation-strip .section-title'),
  ];
}

/**
 * SH2-U6: resolve the active viewport for the currently running
 * project. Playwright's `testInfo.project.use.viewport` is the static
 * config, but scenes may change it dynamically via `page.setViewportSize`;
 * callers should prefer the live size returned by `page.viewportSize()`
 * and fall back to the config only when the page has not yet rendered.
 *
 * Provided here so every scene uses the same resolution logic — the
 * mask-coverage invariant is brittle when scenes disagree on which
 * viewport reference they pass.
 */
export function resolveViewport(page, testInfo) {
  const live = typeof page?.viewportSize === 'function' ? page.viewportSize() : null;
  if (live && Number(live.width) > 0 && Number(live.height) > 0) return live;
  const configured = testInfo?.project?.use?.viewport;
  if (configured && Number(configured.width) > 0 && Number(configured.height) > 0) {
    return { width: Number(configured.width), height: Number(configured.height) };
  }
  // Last-resort fallback mirrors the mobile-390 baseline viewport so
  // the assertion still runs against a sensible ratio.
  return { width: 390, height: 844 };
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

// ---------------------------------------------------------------
// U9 (Grammar Phase 4): extended helpers for the 6-flow Playwright
// matrix. These three helpers land in shared.mjs because Grammar,
// Punctuation, and Spelling goldens will all benefit from them over
// time — the Concordium-fraction reader is grammar-specific today but
// the same pattern applies to the other subjects' mastery surfaces.
// ---------------------------------------------------------------

/**
 * U9 seedFreshLearner — navigate to `/demo` to get a fresh demo
 * learner. Playwright gives each test its own isolated `context`
 * (and thus its own cookie jar), so a fresh `page.goto('/demo')` in
 * a new test always hits the no-cookie branch of the worker's /demo
 * handler and mints a new demo account.
 *
 * This is an alias for `createDemoSession(page)` that exists so the
 * U9 flows can document "this test seeds a pristine learner" at the
 * call site. Do NOT clear cookies or localStorage here - the test
 * context is already fresh, and extra `/demo` hits (from cookie
 * clears triggering re-navigation) saturate the worker's
 * 30-req/10-min rate limit when multiple scenes run in series.
 *
 * If a SINGLE test needs multiple pristine-learner resets (e.g.,
 * two sequential flows in the same test body), the caller must
 * manually clear cookies + re-seed, OR split into separate `test()`
 * calls so each gets its own context.
 */
export async function seedFreshLearner(page) {
  return createDemoSession(page);
}

/**
 * U9 assertConcordiumFraction — read the grammar dashboard's Concordium
 * progress marker and assert its rendered fraction. Used by Flow 4
 * (Writing Try non-scored) to pin that the fraction does NOT move after
 * a save, and by Flow 6 (reward path) to pin the reverse side of the
 * invariant (it DOES move when a concept is secured, but NEVER moves on
 * re-secure).
 *
 * The marker is `[data-testid="grammar-concordium-progress"]` scoped to
 * the dashboard's `<strong class="grammar-concordium-value">` child. The
 * helper accepts either a literal string (`'3/18'`) or an object
 * describing the expected shape (`{ mastered: 3, total: 18 }`) — the
 * object form keeps the assertion ergonomic at call sites that compute
 * the expected fraction from the read-model upstream.
 *
 * `expected === null` means "pin whatever is currently rendered and
 * return it" — used by the Flow 4 snapshot-then-assert pattern:
 *
 *   const before = await assertConcordiumFraction(page, null);
 *   // ... do the non-scored save ...
 *   await assertConcordiumFraction(page, before);
 *
 * Returns the rendered fraction string so callers can use it as the
 * `expected` value on a subsequent invocation.
 */
export async function assertConcordiumFraction(page, expected) {
  const legacyRoot = page.locator('[data-testid="grammar-concordium-progress"]');
  let rendered = '';
  if (await legacyRoot.count()) {
    await expect(legacyRoot).toBeVisible({ timeout: 10_000 });
    const valueNode = legacyRoot.locator('.grammar-concordium-value');
    await expect(valueNode).toBeVisible();
    rendered = ((await valueNode.textContent()) || '').trim();
  } else {
    const starNode = page.locator('.grammar-monster-entry[data-monster-id="concordium"] .grammar-monster-entry-stars');
    await expect(starNode).toBeVisible({ timeout: 10_000 });
    const raw = ((await starNode.textContent()) || '').trim();
    const match = /(\d+)\s*\/\s*(\d+)/u.exec(raw);
    rendered = match ? `${match[1]}/${match[2]}` : raw;
  }
  if (expected === null || expected === undefined) return rendered;
  const expectedString = typeof expected === 'string'
    ? expected
    : `${expected.mastered}/${expected.total}`;
  expect(rendered, 'Concordium fraction should match expected shape').toBe(expectedString);
  return rendered;
}

export function grammarDashboardStartButton(page) {
  return page.locator('.grammar-start-row button[data-featured="true"]').first();
}

export async function startGrammarDashboardRound(page) {
  const startButton = grammarDashboardStartButton(page);
  await expect(startButton).toBeVisible({ timeout: 10_000 });
  await expect(startButton).toBeEnabled();
  await startButton.click();
}

export async function openGrammarMorePractice(page) {
  const details = page.locator('details.grammar-more-practice').first();
  await expect(details).toBeVisible({ timeout: 10_000 });
  const isOpen = await details.evaluate((node) => node.open).catch(() => false);
  if (!isOpen) {
    await details.locator('summary').click();
  }
  await expect(details).toHaveJSProperty('open', true);
}

/**
 * U9 networkOffline — wrap an async callback with the browser context
 * flipped into offline mode, restoring the online state (even on
 * throw) in a finally block. Used by the Flow 4 / Flow 3 error-path
 * scenes to exercise the "draft preserved under network failure"
 * contract without depending on the chaos fault-injection middleware.
 *
 * Playwright's `page.context().setOffline(true)` drops the TCP
 * connectivity for every request in the context, so subsequent
 * `fetch()` calls reject with a `TypeError: Failed to fetch` matching
 * the browser's native offline behaviour. The wrapper restores the
 * online state before returning so the next test step starts on a
 * clean network.
 */
export async function networkOffline(page, fn) {
  const context = page.context();
  await context.setOffline(true);
  try {
    return await fn();
  } finally {
    await context.setOffline(false);
  }
}

// ---------------------------------------------------------------
// U9 grammar helpers — small locator shortcuts reused across the 6
// grammar golden-path flows. Scoped here instead of per-test file so
// the action contract is in one place and a dashboard copy change
// lands in one sweep.
// ---------------------------------------------------------------

/**
 * U9 openGrammarDashboard — deterministic entry into the grammar
 * surface. Wraps `openSubject(page, 'grammar')` + the dashboard
 * visibility wait so flows can call one helper and immediately assert
 * on dashboard sub-elements.
 */
export async function openGrammarDashboard(page) {
  await openSubject(page, 'grammar');
  await expect(page.locator('.grammar-dashboard')).toBeVisible({ timeout: 15_000 });
}

/**
 * U9 fillGrammarAnswer — the grammar session renders six input shapes
 * (free text, textarea, single_choice radio, checkbox_list, multi with
 * sub-fields, and table_choice). Each one requires a different fill
 * pattern to satisfy the form's native `required` validation. This
 * helper probes for every shape and fills whichever mounts, returning
 * the tag it filled so callers can log / assert on it if needed.
 *
 * Handled shapes (in priority order):
 *   1. Free-text `<input name="answer">` or `<textarea name="answer">`
 *      -> fill with a deterministic wrong string.
 *   2. Table-choice `<table class="grammar-table-choice">` -> tick the
 *      first radio in every row. Each row uses `name="<rowKey>"` so
 *      the required-per-row validation is satisfied.
 *   3. Single-choice `<input type="radio" name="answer">` -> check the
 *      first radio.
 *   4. Checkbox list `<input type="checkbox" name="selected">` -> tick
 *      the first checkbox.
 *   5. Multi fields (inputSpec.type === 'multi') -> iterate sub-fields
 *      and fill/select the first option of each.
 *
 * Uses `{ force: true }` on radio/checkbox `check()` to tolerate the
 * `<label>`-wrapped shape the grammar session uses — clicking the
 * native input is the cleanest path to update state.
 *
 * Returns `{ kind }` where `kind` is one of `'freeText'`,
 * `'tableChoice'`, `'radio'`, `'checkbox'`, `'multi'`, or `'none'`
 * (no input present - caller should wait and retry or treat as a
 * no-input question).
 */
export async function fillGrammarAnswer(page, { typed = 'zzz-not-a-real-answer' } = {}) {
  const form = page.locator('.grammar-answer-form').first();
  // 1. Free text / textarea.
  const freeText = form.locator('input[name="answer"]:not([type="radio"]):not([type="checkbox"]), textarea[name="answer"]').first();
  if (await freeText.count()) {
    await freeText.fill(typed);
    return { kind: 'freeText' };
  }
  // 2. Table choice: tick the first radio in every row. Each row is
  // keyed by `name="<rowKey>"` so we group by name and pick the first
  // radio for each group.
  const tableRoot = form.locator('.grammar-table-choice');
  if (await tableRoot.count()) {
    const rowNames = await tableRoot.evaluate((root) => {
      const radios = Array.from(root.querySelectorAll('input[type="radio"]'));
      const seen = new Set();
      for (const radio of radios) {
        const name = radio.getAttribute('name');
        if (name) seen.add(name);
      }
      return Array.from(seen);
    });
    for (const name of rowNames) {
      const firstRadio = form.locator(`input[type="radio"][name="${name}"]`).first();
      if (await firstRadio.count()) {
        await firstRadio.check({ force: true }).catch(() => firstRadio.click({ force: true }));
      }
    }
    return { kind: 'tableChoice' };
  }
  // 3. Single-choice radio.
  const radio = form.locator('input[type="radio"]').first();
  if (await radio.count()) {
    await radio.check({ force: true }).catch(() => radio.click({ force: true }));
    return { kind: 'radio' };
  }
  // 4. Checkbox list.
  const checkbox = form.locator('input[type="checkbox"]').first();
  if (await checkbox.count()) {
    await checkbox.check({ force: true }).catch(() => checkbox.click({ force: true }));
    return { kind: 'checkbox' };
  }
  // 5. Multi fields - mixed select/radio/text. Fill the first input of
  // each kind so the form's required validation passes.
  const multiRoot = form.locator('.grammar-multi-fields');
  if (await multiRoot.count()) {
    const selects = multiRoot.locator('select');
    const selectCount = await selects.count();
    for (let i = 0; i < selectCount; i += 1) {
      const select = selects.nth(i);
      const firstOption = await select.locator('option').nth(0).getAttribute('value');
      if (firstOption != null) {
        await select.selectOption(firstOption).catch(() => {});
      }
    }
    const multiText = multiRoot.locator('input:not([type="radio"]):not([type="checkbox"])');
    const multiTextCount = await multiText.count();
    for (let i = 0; i < multiTextCount; i += 1) {
      await multiText.nth(i).fill(typed).catch(() => {});
    }
    const multiRadio = multiRoot.locator('input[type="radio"]').first();
    if (await multiRadio.count()) {
      await multiRadio.check({ force: true }).catch(() => multiRadio.click({ force: true }));
    }
    return { kind: 'multi' };
  }
  return { kind: 'none' };
}

/**
 * U9 returnToGrammarDashboard — navigate back to the grammar dashboard
 * from wherever the flow has landed (summary, analytics, session, …).
 * Uses the subject breadcrumb's `Grammar` button when present; falls
 * back to the home-dashboard breadcrumb + re-opening the subject card.
 *
 * Mini-test summary does NOT expose an `Open Grammar Bank` secondary
 * link (only the regular-practice summary does), so flows that need
 * dashboard-phase state after a mini-test finish must route through
 * this helper rather than the bank round-trip shortcut.
 */
export async function returnToGrammarDashboard(page) {
  // Round-trip via a hard reload + re-open. `page.reload()` exercises
  // the rehydrate path on the grammar module (see SH2-U2 test), which
  // coerces `phase: 'summary'` to `phase: 'dashboard'` via the
  // sanitiseUiOnRehydrate hook. Result: the subject-grid remounts
  // cleanly and the grammar card can be tapped to land on the
  // dashboard phase.
  //
  // We prefer reload over a breadcrumb click because the breadcrumb's
  // `onDashboard` handler navigates the URL but does NOT clear the
  // persisted `grammar.phase` in the subject-ui store - a follow-up
  // subject re-entry could land back on the summary shell.
  await reload(page);
  // If the reload lands us on the grammar dashboard directly, we are
  // done. Otherwise the home grid is visible and we need to re-open
  // the grammar card.
  const dashboardCandidate = page.locator('.grammar-dashboard');
  if (await dashboardCandidate.isVisible().catch(() => false)) return;
  await expect(page.locator('.subject-grid')).toBeVisible({ timeout: 15_000 });
  await openSubject(page, 'grammar');
  await expect(page.locator('.grammar-dashboard')).toBeVisible({ timeout: 15_000 });
}

/**
 * U9 primeGrammarReadModel — fire one trivial grammar command so the
 * client receives the Worker's full read model (capabilities,
 * transferLane, bank data, etc.). On a pristine demo learner,
 * `applyRemoteReadModel` has never run; Writing Try prompts are only
 * populated after at least one command round-trip.
 *
 * Strategy: dispatch `grammar-set-round-length` (which sends a
 * `save-prefs` command). save-prefs returns the full read model in
 * its response, including `transferLane.prompts`. save-prefs does NOT
 * alter `state.phase` or `state.summary` on the server side, so
 * subsequent commands (e.g., save-transfer-evidence) return responses
 * with `phase: 'dashboard'` / `summary: null` as expected.
 *
 * Caller MUST be on the grammar dashboard surface before calling.
 * Leaves the learner on the dashboard with `transferLane.prompts`
 * populated in memory.
 */
export async function primeGrammarReadModel(page) {
  // Dashboard's round-length <select> dispatches
  // `grammar-set-round-length` which the module routes to a
  // `save-prefs` Worker command. The response carries the full read
  // model; `applyRemoteReadModel` then hydrates the subject UI with
  // transferLane.prompts.
  const lengthSelect = page.locator('.grammar-round-controls select').first();
  await expect(lengthSelect).toBeVisible({ timeout: 10_000 });
  const initial = await lengthSelect.inputValue();
  const options = await lengthSelect.evaluate((el) => Array.from(el.options).map((o) => o.value));
  const other = options.find((v) => v !== initial) || options[0];
  if (!other) return;
  // Toggle to a different length to trigger save-prefs.
  await lengthSelect.selectOption(other);
  // Wait for the command to complete. We watch for a response pattern
  // via the network - any grammar command response suffices.
  await page.waitForResponse(
    (resp) => resp.url().includes('/api/subjects/grammar/command') && resp.status() === 200,
    { timeout: 10_000 },
  ).catch(() => {
    // If the response didn't land, fall back to a short wait so the
    // in-memory state has time to settle.
  });
  // Flip back to the original value for a clean baseline.
  if (initial !== other) {
    await lengthSelect.selectOption(initial);
    await page.waitForResponse(
      (resp) => resp.url().includes('/api/subjects/grammar/command') && resp.status() === 200,
      { timeout: 10_000 },
    ).catch(() => {});
  }
}

/**
 * U9 startGrammarMiniTest — click the "Mini Test" secondary mode link
 * then the dashboard CTA and wait for the mini-test panel to render.
 * Factored out so multiple flows can reuse the setup without coupling
 * to the dashboard's internal button order.
 */
export async function startGrammarMiniTest(page) {
  const miniTestButton = page.getByRole('button', { name: /^Mini Test/ });
  await expect(miniTestButton).toBeVisible();
  await miniTestButton.click();
  await startGrammarDashboardRound(page);
  const session = page.locator('.grammar-mini-test-panel, .grammar-session').first();
  await expect(session).toBeVisible({ timeout: 15_000 });
}
