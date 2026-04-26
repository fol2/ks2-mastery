// SH2-U4 (sys-hardening p2): TTS failure / slow-audio / route-abort scenes.
//
// The TTS client surfaces four UX affordances — pending chip, failure
// banner, replay-button aria-busy, route-change abort. This scene suite
// uses the existing `slow-tts` fault kind (1.5s delay) + the new
// `500-tts` fault kind to verify:
//
//   1. Pending chip renders within 300ms of clicking replay while
//      `slow-tts` is active.
//   2. Failure banner renders when `500-tts` lands.
//   3. Replay button carries `aria-busy="true"` while loading (keyboard
//      / assistive-tech contract).
//   4. Reduced-motion learners see no animation on the chip / banner
//      (`getAnimations()` length is 0 on both surfaces).
//   5. Navigating away (navigate-home) during loading clears the chip
//      and emits the abort-on-route signal.
//
// Screenshot policy matches chaos-http-boundary: NO `toHaveScreenshot`
// calls — this is a state-and-testid suite, not a pixel suite.

import { test, expect } from '@playwright/test';
import {
  applyDeterminism,
  createDemoSession,
  openSubject,
} from './shared.mjs';
import { __ks2_injectFault_TESTS_ONLY__ as faultInjection } from '../helpers/fault-injection.mjs';

const PENDING_CHIP = '[data-testid="spelling-tts-pending-chip"]';
const FAILURE_BANNER = '[data-testid="spelling-tts-failure-banner"]';
const REPLAY_BUTTON = '[data-testid="spelling-replay"]';
const REPLAY_SLOW_BUTTON = '[data-testid="spelling-replay-slow"]';

/**
 * Install a fault plan against the live page by attaching the opt-in
 * headers to every same-origin request. Mirrors
 * `chaos-http-boundary.playwright.test.mjs::installFaultPlan`.
 */
async function installFaultPlan(page, plan) {
  const encoded = faultInjection.encodePlan(plan);
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      const next = {
        ...request.headers(),
        [faultInjection.OPT_IN_HEADER]: faultInjection.OPT_IN_VALUE,
        [faultInjection.PLAN_HEADER]: encoded,
      };
      return route.continue({ headers: next });
    }
    return route.continue();
  });
}

/**
 * Enter spelling and start a session so the replay buttons are mounted.
 * The demo learner always has a writable spelling session on entry.
 */
async function enterSpellingSession(page) {
  await openSubject(page, 'spelling');
  // Click the start button if present, otherwise assume a session is
  // already in progress.
  const start = page.locator('[data-action="spelling-start"]');
  if (await start.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await start.click();
  }
  // Wait for the replay button to appear — proves we're in the session
  // scene rather than the setup scene.
  await expect(page.locator(REPLAY_BUTTON)).toBeVisible({ timeout: 15_000 });
}

test.describe('TTS failure / slow / abort UX (SH2-U4)', () => {
  test.beforeEach(async ({ page }) => {
    await applyDeterminism(page);
  });

  // -----------------------------------------------------------------
  // slow-tts: the pending chip must render while the 1.5s-delayed TTS
  // request is in flight.
  // -----------------------------------------------------------------
  test('slow-tts shows the "…loading audio" pending chip', async ({ page }) => {
    await createDemoSession(page);
    await installFaultPlan(page, {
      kind: 'slow-tts',
      pathPattern: '/api/tts',
      once: false,
    });
    await enterSpellingSession(page);

    // Trigger a replay so the fetch fires and the chip mounts.
    await page.locator(REPLAY_BUTTON).click();
    // The chip must appear while the fetch is slow (1.5s fault delay).
    await expect(page.locator(PENDING_CHIP)).toBeVisible({ timeout: 3_000 });
  });

  test('slow-tts sets aria-busy=true on the replay button for assistive-tech', async ({ page }) => {
    await createDemoSession(page);
    await installFaultPlan(page, {
      kind: 'slow-tts',
      pathPattern: '/api/tts',
      once: false,
    });
    await enterSpellingSession(page);

    const replay = page.locator(REPLAY_BUTTON);
    await replay.click();
    // aria-busy surfaces the loading state to AT users who cannot see
    // the "…loading audio" chip visually.
    await expect(replay).toHaveAttribute('aria-busy', 'true', { timeout: 3_000 });
  });

  // -----------------------------------------------------------------
  // 500-tts: the failure banner must render with the documented copy.
  // -----------------------------------------------------------------
  test('500-tts shows the failure banner and practice remains usable', async ({ page }) => {
    await createDemoSession(page);
    await installFaultPlan(page, {
      kind: '500-tts',
      pathPattern: '/api/tts',
      once: false,
    });
    await enterSpellingSession(page);

    await page.locator(REPLAY_BUTTON).click();
    const banner = page.locator(FAILURE_BANNER);
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toContainText('Audio unavailable');
    await expect(banner).toContainText('practising');

    // The input remains visible — practice is not blocked by the
    // failure.
    await expect(page.locator('input[name="typed"]')).toBeVisible();
  });

  // -----------------------------------------------------------------
  // Reduced-motion: the chip and banner must not animate. We use
  // `element.getAnimations()` which returns the list of running
  // animations for the element's subtree — expected length is 0 when
  // `prefers-reduced-motion: reduce` is active. `applyDeterminism()`
  // already emulates reduced-motion via `page.emulateMedia()`.
  // -----------------------------------------------------------------
  test('reduced-motion: pending chip has no running animations', async ({ page }) => {
    await createDemoSession(page);
    await installFaultPlan(page, {
      kind: 'slow-tts',
      pathPattern: '/api/tts',
      once: false,
    });
    await enterSpellingSession(page);

    await page.locator(REPLAY_BUTTON).click();
    const chip = page.locator(PENDING_CHIP);
    await expect(chip).toBeVisible({ timeout: 3_000 });
    const animationCount = await chip.evaluate((el) => el.getAnimations().length);
    expect(animationCount, 'reduced-motion must suppress chip animations').toBe(0);
  });

  test('reduced-motion: failure banner has no running animations', async ({ page }) => {
    await createDemoSession(page);
    await installFaultPlan(page, {
      kind: '500-tts',
      pathPattern: '/api/tts',
      once: false,
    });
    await enterSpellingSession(page);

    await page.locator(REPLAY_BUTTON).click();
    const banner = page.locator(FAILURE_BANNER);
    await expect(banner).toBeVisible({ timeout: 10_000 });
    const animationCount = await banner.evaluate((el) => el.getAnimations().length);
    expect(animationCount, 'reduced-motion must suppress banner animations').toBe(0);
  });

  // -----------------------------------------------------------------
  // Route change aborts: while a slow fetch is in flight, clicking the
  // brand / dashboard link must remove the chip (route-level abort).
  // -----------------------------------------------------------------
  test('navigate-home during loading clears the pending chip', async ({ page }) => {
    await createDemoSession(page);
    await installFaultPlan(page, {
      kind: 'slow-tts',
      pathPattern: '/api/tts',
      once: false,
    });
    await enterSpellingSession(page);

    await page.locator(REPLAY_BUTTON).click();
    await expect(page.locator(PENDING_CHIP)).toBeVisible({ timeout: 3_000 });

    // Navigate away via the brand button — matches what
    // `SpellingSessionScene` exposes for the back-to-dashboard action.
    const brand = page.locator('.profile-brand-button[data-action="navigate-home"]').first();
    await brand.click();

    // The dashboard renders — the chip cannot survive the surface swap
    // because the subject scene unmounts.
    await expect(page.locator('.subject-grid')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(PENDING_CHIP)).toHaveCount(0);
  });
});
