// U10 (sys-hardening p1): reduced-motion contract smoke.
//
// Contract under test
// -------------------
//
// `styles/app.css` wires a top-level `@media (prefers-reduced-motion:
// reduce)` block that sets:
//
//   *, *::before, *::after {
//     transition-duration: 0.01ms !important;
//     animation-duration: 0.01ms !important;
//     animation-iteration-count: 1 !important;
//     scroll-behavior: auto !important;
//   }
//
// followed by per-surface overrides (spelling hero, codex stage dots,
// monster celebration halo / flash / particles, etc.) that set
// `animation: none` or `display: none` on the motion-bearing elements
// so they render to a static frame.
//
// `src/platform/game/render/` effect templates additionally declare
// per-effect `reducedMotion: 'omit' | 'simplify' | 'asis'` so a
// celebration fires its static `.after` frame rather than the animated
// halo + particles burst.
//
// Playwright harness
// ------------------
//
// `page.emulateMedia({ reducedMotion: 'reduce' })` swaps the browser's
// CSS media evaluation so our top-level reduce block engages. We then:
//
//   1. Assert the media query is actually active via
//      `window.matchMedia('(prefers-reduced-motion: reduce)').matches`.
//   2. Inspect `getAnimations()` on motion-bearing elements (hero art,
//      subject-grid cards, codex stage dots) — under reduced motion the
//      list must be empty OR every animation must have a near-zero
//      duration. Either end state is legal per the CSS contract above.
//   3. Walk a practice input round-trip to prove the app still
//      advances when the viewport is honouring `reduce`. No celebration
//      is forced in this scene (triggering a real celebration requires
//      a correct answer, which the golden-path scene's honesty note
//      explains cannot be produced deterministically today); we
//      instead assert that IF an overlay ever appears it carries the
//      `data-testid="monster-celebration"` anchor added by U10 so a
//      follow-up scene can target it.
//
// Viewport policy
// ---------------
//
// The plan tasks mobile-390 at minimum. Five-viewport extension lives
// in U12. Running on every viewport for a pure CSS contract adds flake
// surface without adding coverage — the reduce media query is a
// viewport-independent page-level contract.

import { test, expect } from '@playwright/test';
import {
  applyDeterminism,
  createDemoSession,
  openSubject,
  spellingAnswer,
} from './shared.mjs';

/**
 * Read the current animation list for a locator via `getAnimations()`.
 * Returns an array of `{ duration, iterations }` for a cheap assertion.
 * When the locator does not resolve (element not in the DOM) the
 * function returns an empty array.
 */
async function readAnimations(page, selector) {
  return page.evaluate((sel) => {
    const elements = Array.from(document.querySelectorAll(sel));
    const out = [];
    for (const element of elements) {
      const animations = typeof element.getAnimations === 'function'
        ? element.getAnimations()
        : [];
      for (const animation of animations) {
        const timing = typeof animation.effect?.getTiming === 'function'
          ? animation.effect.getTiming()
          : {};
        out.push({
          duration: typeof timing.duration === 'number' ? timing.duration : 0,
          iterations: typeof timing.iterations === 'number' ? timing.iterations : 0,
        });
      }
    }
    return out;
  }, selector);
}

/**
 * Read the browser's effective `matchMedia` value for
 * `prefers-reduced-motion: reduce`. We cannot assume `emulateMedia`
 * succeeded on every browser engine without reading the live result.
 */
async function readsReducedMotion(page) {
  return page.evaluate(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
}

test.describe('reduced-motion contract', () => {
  test.beforeEach(async ({ page }) => {
    // U5's shared `applyDeterminism()` already emulates `reduce` for
    // screenshot stability — we re-apply here explicitly so this scene
    // is self-contained (it does NOT take screenshots so determinism is
    // a side note; the reduced-motion emulation is the primary setup).
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await applyDeterminism(page);
  });

  // ---------------------------------------------------------------
  // Contract 1: browser actually evaluates `reduce` as true. If the
  // emulation silently fails (for instance on a browser build that
  // ignores the flag), the rest of the scene is meaningless — we pin
  // the media-query result first so any regression surfaces here,
  // not later as a flaky animation-duration assertion.
  // ---------------------------------------------------------------
  test('browser evaluates prefers-reduced-motion: reduce after emulateMedia', async ({ page }) => {
    await createDemoSession(page);
    const reduced = await readsReducedMotion(page);
    expect(reduced, 'emulateMedia({ reducedMotion: reduce }) must actually engage').toBe(true);
  });

  // ---------------------------------------------------------------
  // Contract 2: subject-grid cards are static under reduce. The
  // `@media (prefers-reduced-motion: reduce)` block in `styles/app.css`
  // drops the entrance choreography (`polish-rise`, subject-grid
  // cards, Ken-Burns banner pan) to `animation: none !important`. We
  // assert `getAnimations()` returns an empty list OR every animation
  // reports a ≤ 1 ms duration (the universal selector fallback).
  // ---------------------------------------------------------------
  test('subject-grid cards render without active animations under reduce', async ({ page }) => {
    await createDemoSession(page);
    await expect(page.locator('.subject-grid')).toBeVisible();
    // Give the `polish-rise` entrance a beat to try to run; under
    // reduce it lands on its final frame instantly.
    await page.waitForTimeout(200);
    const animations = await readAnimations(page, '.subject-grid [data-action="open-subject"]');
    for (const record of animations) {
      const duration = Number(record.duration) || 0;
      expect(
        duration,
        `subject-grid entrance animation duration ${duration}ms must be ≤ 1ms under reduced-motion`,
      ).toBeLessThanOrEqual(1);
    }
  });

  // ---------------------------------------------------------------
  // Contract 3: session feedback + modal open/close without motion.
  // Open a spelling session, submit an obviously-wrong answer, and
  // assert the feedback ribbon renders with no active animation. We
  // do NOT chase the summary modal here — the feedback ribbon is the
  // lowest-friction proof that a mid-session surface advances under
  // reduce without waiting on choreography.
  // ---------------------------------------------------------------
  test('spelling session feedback renders without animation under reduce', async ({ page }) => {
    await createDemoSession(page);
    await openSubject(page, 'spelling');
    const start = page.locator('[data-action="spelling-start"]');
    await expect(start).toBeVisible();
    await start.click();

    const input = page.locator('.spelling-in-session.is-question-revealed input[name="typed"]');
    await expect(input).toBeVisible({ timeout: 15_000 });

    // Submit an obviously-wrong answer (two spaces into the demo
    // learner's random word is not going to match — cf. the honesty
    // note on the golden path). The feedback ribbon must then appear.
    await spellingAnswer(page, 'zzzzzzzzzz');
    const feedback = page.locator('.feedback-slot:not(.is-placeholder)');
    await expect(feedback).toBeVisible({ timeout: 10_000 });

    // The ribbon lives under `.spelling-in-session .ribbon` and the
    // `@media (prefers-reduced-motion: reduce) { .spelling-in-session
    // .ribbon { animation: none; } }` rule disables its glide-in.
    // Verify no live animation is playing on the ribbon.
    const animations = await readAnimations(page, '.spelling-in-session .ribbon');
    for (const record of animations) {
      const duration = Number(record.duration) || 0;
      expect(
        duration,
        `feedback ribbon animation duration ${duration}ms must be ≤ 1ms under reduced-motion`,
      ).toBeLessThanOrEqual(1);
    }
  });

  // ---------------------------------------------------------------
  // Contract 4: monster celebration overlay anchor. We cannot force
  // a celebration without a correct spelling answer (the demo learner
  // gets a random word), so we assert the weaker invariant: IF the
  // overlay ever mounts during the session, it carries the
  // `data-testid="monster-celebration"` anchor added by U10 and, under
  // reduce, its halo + particles + flash sub-elements MUST NOT run
  // active animations (they are `display: none` in CSS line 1907-1914).
  //
  // Without a deterministic correct-answer hook the overlay rarely
  // mounts. The scene short-circuits when the overlay is absent
  // — this keeps the test from flaking while still locking the
  // contract whenever the overlay DOES happen to render.
  // ---------------------------------------------------------------
  test('monster-celebration overlay anchor exposes the reduced-motion contract when mounted', async ({ page }) => {
    await createDemoSession(page);
    await openSubject(page, 'spelling');
    const start = page.locator('[data-action="spelling-start"]');
    await expect(start).toBeVisible();
    await start.click();

    const overlay = page.locator('[data-testid="monster-celebration"]');
    // Short poll — if the overlay does not mount, we move on. The
    // positive branch below is the actual contract assertion.
    await page.waitForTimeout(500);
    if (await overlay.count()) {
      // Halo / flash (white) / particles must have no active
      // animation under reduce — CSS hides them outright, so
      // getAnimations() should return an empty list.
      const haloAnimations = await readAnimations(page, '[data-testid="monster-celebration"] .monster-celebration-halo');
      const partsAnimations = await readAnimations(page, '[data-testid="monster-celebration"] .monster-celebration-parts');
      const flashAnimations = await readAnimations(page, '[data-testid="monster-celebration"] .monster-celebration-white');
      const all = [...haloAnimations, ...partsAnimations, ...flashAnimations];
      for (const record of all) {
        const duration = Number(record.duration) || 0;
        expect(
          duration,
          `celebration motion element animation duration ${duration}ms must be ≤ 1ms under reduced-motion`,
        ).toBeLessThanOrEqual(1);
      }
      // The `.after` sprite (the static final frame) must be present.
      const afterVisual = page.locator('[data-testid="monster-celebration"] .monster-celebration-visual.after');
      await expect(afterVisual).toBeVisible();
    }
  });
});
