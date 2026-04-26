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
// `assertMaskCoverage(page, masks, viewport, maxRatio = 0.30, { targetBbox })`
// reads the bounding box for every locator in the supplied array, sums
// the total masked area, divides by EITHER the viewport area or the
// caller-supplied `targetBbox` area (whichever is smaller / non-zero),
// and asserts the ratio is at or below `maxRatio`. If any mask resolves
// to more than one element (e.g. `.cloze` appearing twice in the DOM),
// the helper iterates over every matching element via
// `locator.all()` and sums each rect. Off-screen / invisible masks
// (`boundingBox()` returns `null`) contribute zero area.
//
// Scoped-target denominator (SH2-U6 review blocker-2)
// ---------------------------------------------------
//
// Most scenes capture with `toHaveScreenshot(target)` — a scoped shot of
// a specific card or panel — so the viewport area badly OVERstates the
// meaningful surface. A mask covering 100% of a 320x480 panel on a
// 1440x900 desktop viewport is only ~11% of-viewport (well below 30%)
// but 100% of-target (silent green). Passing the target bounding box
// via `{ targetBbox }` flips the denominator to whichever surface is
// smaller so the guard triggers on the right scale for scoped captures,
// while non-scoped full-page captures retain the viewport denominator.
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
 * masks against a supplied viewport (or optionally a scoped target
 * bounding box — see below). Returns a Number in [0, 1+] (the simple
 * sum means overlapping masks can exceed 1 before clamping).
 *
 * SH2-U6 review blocker-2: when the screenshot capture is scoped to
 * a `target` locator (e.g. `toHaveScreenshot` on a `.auth-panel`
 * rather than the full page), the meaningful denominator for mask
 * coverage is the target's bounding box, NOT the viewport. A mask
 * covering 100% of a 320x480 auth panel on a 1440x900 viewport is
 * an 11.85% of-viewport ratio but a 100% of-target ratio —
 * precisely the P1 U5 silent-green hazard at a scoped-capture scale.
 * Callers pass `targetBbox` via
 * `assertMaskCoverage(page, masks, viewport, maxRatio, { targetBbox })`
 * and the helper uses whichever denominator is smaller (the tighter
 * surface) so both guard paths stay in play. When `targetBbox` is
 * null the behaviour is identical to the pre-blocker contract
 * (viewport denominator).
 *
 * @param {import('@playwright/test').Page} page - Playwright page.
 * @param {Array<import('@playwright/test').Locator>} masks - mask
 *   locator list, typically what a scene would pass as `mask:` in
 *   `toHaveScreenshot`.
 * @param {{ width: number, height: number }} viewport - the project's
 *   viewport (Playwright's `testInfo.project.use.viewport` or the
 *   runtime `page.viewportSize()`).
 * @param {{ targetBbox?: { width: number, height: number } | null }}
 *   [options] - optional scoped-capture target bounding box. When
 *   present and smaller than the viewport, its area replaces the
 *   viewport area in the ratio computation.
 * @returns {Promise<{ ratio: number, maskedArea: number,
 *   totalArea: number, viewportArea: number, targetArea: number,
 *   denominator: 'viewport' | 'target' }>} raw numbers for callers
 *   that want to instrument the ratio. `totalArea` is whichever
 *   denominator was picked; `viewportArea` + `targetArea` are the
 *   raw figures for diagnostics.
 */
export async function measureMaskCoverage(page, masks, viewport, options = {}) {
  const width = Number(viewport?.width) || 0;
  const height = Number(viewport?.height) || 0;
  const viewportArea = width * height;
  const bbox = options?.targetBbox || null;
  const targetArea = bbox
    ? Math.max(0, Number(bbox.width) || 0) * Math.max(0, Number(bbox.height) || 0)
    : 0;
  // Pick the smaller of the two non-zero denominators so a scoped
  // target surface always measures against itself. Fall back to the
  // viewport when no target is supplied; fall back to the target when
  // the viewport is zero (defensive — upstream callers always supply
  // a sane viewport but we want a useful ratio even in degenerate
  // test-harness conditions).
  let totalArea;
  let denominator;
  if (targetArea > 0 && (viewportArea <= 0 || targetArea < viewportArea)) {
    totalArea = targetArea;
    denominator = 'target';
  } else {
    totalArea = viewportArea;
    denominator = 'viewport';
  }
  if (!Array.isArray(masks) || !masks.length || totalArea <= 0) {
    return {
      ratio: 0,
      maskedArea: 0,
      totalArea,
      viewportArea,
      targetArea,
      denominator,
    };
  }
  // When the denominator is the scoped target, masks that live OUTSIDE
  // the target bbox are irrelevant to the capture's silent-green risk
  // — they will not paint magenta inside the target region. Count only
  // the portion of each mask that INTERSECTS the target bbox. For the
  // viewport denominator, every on-screen mask contributes the full
  // bounding-box area as before. Rectangle-overlap helper is the
  // standard `max(0, ...)` clipped width/height.
  const useTargetDenom = denominator === 'target' && bbox;
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
      if (useTargetDenom) {
        // Intersection of mask bbox with target bbox. Non-overlapping
        // masks contribute zero — they cannot leak pixels into the
        // target's captured region.
        const left = Math.max(Number(bbox.x) || 0, Number(box.x) || 0);
        const top = Math.max(Number(bbox.y) || 0, Number(box.y) || 0);
        const right = Math.min(
          (Number(bbox.x) || 0) + (Number(bbox.width) || 0),
          (Number(box.x) || 0) + (Number(box.width) || 0),
        );
        const bottom = Math.min(
          (Number(bbox.y) || 0) + (Number(bbox.height) || 0),
          (Number(box.y) || 0) + (Number(box.height) || 0),
        );
        const width = Math.max(0, right - left);
        const height = Math.max(0, bottom - top);
        maskedArea += width * height;
      } else {
        const area = Math.max(0, Number(box.width) || 0) * Math.max(0, Number(box.height) || 0);
        maskedArea += area;
      }
    }
  }
  return {
    ratio: totalArea > 0 ? maskedArea / totalArea : 0,
    maskedArea,
    totalArea,
    viewportArea,
    targetArea,
    denominator,
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
export async function assertMaskCoverage(page, masks, viewport, maxRatio = 0.30, options = {}) {
  const result = await measureMaskCoverage(page, masks, viewport, options);
  const { ratio, maskedArea, totalArea, denominator } = result;
  if (ratio > maxRatio) {
    const ratioPct = (ratio * 100).toFixed(1);
    const limitPct = (maxRatio * 100).toFixed(1);
    throw new Error(
      `Mask coverage ${ratioPct}% exceeds ${limitPct}% limit ` +
      `(masked ${Math.round(maskedArea)}px² of ${Math.round(totalArea)}px² ${denominator}). ` +
      `Tighten mask selectors so non-deterministic regions are targeted narrowly — ` +
      `see the P1 U5 silent-green defect (docs/hardening/p1-baseline.md).`,
    );
  }
  return result;
}

/**
 * Test-surface wrapper that pins the assertion via `expect` so a
 * failure renders as a standard Playwright test failure rather than a
 * thrown-Error-at-runtime. Useful when a scene wants to surface the
 * violation through the Playwright reporter instead of via a bare
 * throw. Prefer `assertMaskCoverage` when the caller wants to surface
 * the ratio back to its own logs or aggregate the violation count.
 */
export async function expectMaskCoverageWithinLimit(page, masks, viewport, maxRatio = 0.30, options = {}) {
  const { ratio } = await measureMaskCoverage(page, masks, viewport, options);
  expect(
    ratio,
    `mask coverage ${(ratio * 100).toFixed(1)}% must be within ${(maxRatio * 100).toFixed(1)}% limit ` +
    '(P1 U5 silent-green hazard; see tests/playwright/shared-mask-coverage.mjs)',
  ).toBeLessThanOrEqual(maxRatio);
}
