// SH2-U6 (sys-hardening p2): mask-coverage invariant helper.
//
// Background
// ----------
//
// P1 U5 shipped a spelling golden-path baseline whose masks included
// `.spelling-hero-backdrop` — a `position: absolute; inset: 0` element
// covering the ENTIRE session card. Playwright painted that region
// magenta during capture and the baseline PNG compared magenta-vs-
// magenta on every subsequent run. Result: 90%+ of the viewport was
// effectively "anything goes" — a silent-green regression box where a
// layout break would still pass because the diffing routine only
// compared unmasked pixels.
//
// U6 extends that baseline matrix to 5 projects × ~14 surfaces = ~70
// baselines. At 5× scale the silent-green defect would be catastrophic:
// a single over-masked surface could hide a genuine regression across
// every viewport. The coverage invariant below prevents the defect from
// re-entering the codebase by asserting, BEFORE every
// `toHaveScreenshot()` call, that the set of masks supplied covers at
// most 30% of the viewport. Anything above the threshold trips a hard
// assertion failure with the ratio + limit surfaced in the error.
//
// Why 30%?
// --------
//
// The session card (the only surface that legitimately needs a large
// mask) occupies ~60% of the viewport on mobile-390. Masking random
// word prompts + the toast-shelf region clears well under 10%. Hero art
// ribbons on the home surface (decorative imagery) can push us to ~15%
// on mobile. 30% is roughly double the worst legitimate case, which
// gives us a useful guard rail without blocking reasonable masks.
// The P1 U5 regression was at 90%+ of the viewport.
//
// Contract
// --------
//
// `assertMaskCoverage(page, masks, viewport, maxRatio = 0.30)` reads the
// bounding box for every locator in the supplied array, sums the total
// masked area, divides by the viewport area (width × height), and
// asserts the ratio is at or below `maxRatio`. If any mask resolves to
// more than one element (e.g. `.cloze` appearing twice in the DOM), the
// helper iterates over every matching element via
// `locator.all()` and sums each rect. Off-screen / invisible masks
// (`boundingBox()` returns `null`) contribute zero area.
//
// Rectangle-overlap note: this helper intentionally uses the simple
// "sum of bounding boxes" approach rather than a pixel-accurate union.
// Two overlapping masks would be counted twice, inflating the ratio.
// This errs on the side of FAILING the test (catching more potential
// regressions) rather than PASSING silently. If a test intentionally
// supplies heavily overlapping masks and trips the guard, the fix is
// to consolidate the masks in the test's `mask:` array, not to relax
// the coverage check.

import { expect } from '@playwright/test';

/**
 * Compute the mask-coverage ratio for a set of Playwright locator
 * masks against a supplied viewport. Returns a Number in [0, 1+] (the
 * simple sum means overlapping masks can exceed 1 before clamping).
 *
 * @param {import('@playwright/test').Page} page - Playwright page.
 * @param {Array<import('@playwright/test').Locator>} masks - mask
 *   locator list, typically what a scene would pass as `mask:` in
 *   `toHaveScreenshot`.
 * @param {{ width: number, height: number }} viewport - the project's
 *   viewport (Playwright's `testInfo.project.use.viewport` or the
 *   runtime `page.viewportSize()`).
 * @returns {Promise<{ ratio: number, maskedArea: number,
 *   viewportArea: number }>} raw numbers for callers that want to
 *   instrument the ratio.
 */
export async function measureMaskCoverage(page, masks, viewport) {
  const width = Number(viewport?.width) || 0;
  const height = Number(viewport?.height) || 0;
  const viewportArea = width * height;
  if (!Array.isArray(masks) || !masks.length || viewportArea <= 0) {
    return { ratio: 0, maskedArea: 0, viewportArea };
  }
  let maskedArea = 0;
  for (const mask of masks) {
    if (!mask || typeof mask.all !== 'function') continue;
    // Expand a locator into every DOM match. `.all()` resolves to an
    // array of element-scoped locators; calling boundingBox() on a
    // root locator that matches multiple elements throws a strict-mode
    // error, so we iterate explicitly.
    const elements = await mask.all();
    for (const element of elements) {
      const box = await element.boundingBox().catch(() => null);
      if (!box) continue;
      const area = Math.max(0, Number(box.width) || 0) * Math.max(0, Number(box.height) || 0);
      maskedArea += area;
    }
  }
  return {
    ratio: viewportArea > 0 ? maskedArea / viewportArea : 0,
    maskedArea,
    viewportArea,
  };
}

/**
 * Assert that a set of masks covers at most `maxRatio` of the viewport.
 * Fails with a descriptive message that names the ratio + limit so a
 * developer can see exactly how much over-budget the masks are.
 *
 * Usage (from within a Playwright scene):
 *
 *   const masks = defaultMasks(page);
 *   await assertMaskCoverage(page, masks, testInfo.project.use.viewport);
 *   await expect(locator).toHaveScreenshot(name, { mask: masks });
 *
 * @throws When the ratio exceeds `maxRatio`. Surfaces `ratio` + `limit`
 *   in the error message so CI logs show the over-budget percentage.
 */
export async function assertMaskCoverage(page, masks, viewport, maxRatio = 0.30) {
  const { ratio, maskedArea, viewportArea } = await measureMaskCoverage(page, masks, viewport);
  if (ratio > maxRatio) {
    const ratioPct = (ratio * 100).toFixed(1);
    const limitPct = (maxRatio * 100).toFixed(1);
    throw new Error(
      `Mask coverage ${ratioPct}% exceeds ${limitPct}% limit ` +
      `(masked ${Math.round(maskedArea)}px² of ${Math.round(viewportArea)}px² viewport). ` +
      `Tighten mask selectors so non-deterministic regions are targeted narrowly — ` +
      `see the P1 U5 silent-green defect (docs/hardening/p1-baseline.md).`,
    );
  }
  return { ratio, maskedArea, viewportArea };
}

/**
 * Test-surface wrapper that pins the assertion via `expect` so a
 * failure renders as a standard Playwright test failure rather than a
 * thrown-Error-at-runtime. Useful when a scene wants to surface the
 * violation through the Playwright reporter instead of via a bare
 * throw. Prefer `assertMaskCoverage` when the caller wants to surface
 * the ratio back to its own logs or aggregate the violation count.
 */
export async function expectMaskCoverageWithinLimit(page, masks, viewport, maxRatio = 0.30) {
  const { ratio } = await measureMaskCoverage(page, masks, viewport);
  expect(
    ratio,
    `mask coverage ${(ratio * 100).toFixed(1)}% must be within ${(maxRatio * 100).toFixed(1)}% limit ` +
    '(P1 U5 silent-green hazard; see tests/playwright/shared-mask-coverage.mjs)',
  ).toBeLessThanOrEqual(maxRatio);
}
