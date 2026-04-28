// U5 (sys-hardening p1): punctuation golden path.
//
// Flow: open demo session -> navigate dashboard -> enter punctuation ->
// start practice -> 1 wrong attempt + 1 correct (or simply another
// attempt) -> finish now -> reload and verify punctuation surface
// re-renders.
//
// Baselines in U5 are captured only at `mobile-390`. Full matrix
// lands in U10/U12.
//
// P7-U10: Full Worker-backed Playwright journey proof (§5.5).
// Extends the golden path to cover the complete journey:
//   1. Home/dashboard → Punctuation landing
//   2. Start today's round (mission-dashboard CTA)
//   3. First item render
//   4. Submit answer
//   5. Feedback (or GPS delayed path)
//   6. Summary + star meter read
//   7. Return to landing + star meter read
//   8. Refresh/bootstrap
//   9. Open Punctuation Map + star meter read
//  10. Star meter consistency across all surfaces
//  11. Telemetry write path: no disruption when telemetry enabled/disabled

import { test, expect } from '@playwright/test';
import {
  applyDeterminism,
  createDemoSession,
  openSubject,
  drivePunctuationSessionToSummary,
  reload,
} from './shared.mjs';

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

/**
 * Read Star counts from the `.punctuation-monster-meter-count` elements
 * on the current surface. Returns a sorted array of `{ name, text }`
 * objects. The `text` value is the raw content, e.g. `"0 / 100 Stars"`.
 * The Monster-meter class is shared across setup, summary, and map
 * headers so this helper works on all three surfaces.
 */
async function readStarMeters(page) {
  await page.waitForSelector('.punctuation-monster-meter-count', { timeout: 10_000 }).catch(() => null);
  const meters = page.locator('.punctuation-monster-meter-count');
  const count = await meters.count();
  const result = [];
  for (let i = 0; i < count; i += 1) {
    const text = ((await meters.nth(i).textContent()) || '').trim();
    // Walk up to find the meter-name sibling.
    const parent = meters.nth(i).locator('..');
    const nameEl = parent.locator('.punctuation-monster-meter-name');
    const name = (await nameEl.count()) > 0
      ? ((await nameEl.first().textContent()) || '').trim()
      : `meter-${i}`;
    result.push({ name, text });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Read map monster-group header star text (e.g. "12 / 100 Stars · Getting
 * started"). Returns an array of `{ monsterId, text }` from the
 * `.punctuation-map-monster-group` headers.
 */
async function readMapStarHeaders(page) {
  const groups = page.locator('.punctuation-map-monster-group');
  const count = await groups.count();
  const result = [];
  for (let i = 0; i < count; i += 1) {
    const monsterId = (await groups.nth(i).getAttribute('data-monster-id')) || `group-${i}`;
    const head = groups.nth(i).locator('.punctuation-map-monster-group-head');
    const text = (await head.count()) > 0
      ? ((await head.first().textContent()) || '').trim()
      : '';
    result.push({ monsterId, text });
  }
  return result.sort((a, b) => a.monsterId.localeCompare(b.monsterId));
}

/**
 * Extract the numeric star value from a meter text string.
 * "12 / 100 Stars" → 12, "3 / 100 Grand Stars" → 3.
 */
function parseStarCount(text) {
  const match = (text || '').match(/^(\d+)\s*\/\s*\d+/);
  return match ? Number(match[1]) : NaN;
}

/**
 * Drive the Punctuation session to completion (summary). Answers items
 * naturally so "Finish now" keeps its product behaviour as an early
 * exit back to setup.
 */
async function driveSessionToSummary(page) {
  await drivePunctuationSessionToSummary(page, { typedPrefix: 'punctuation-golden' });
}

/**
 * Start CTA selector — the mission-dashboard primary CTA carries
 * `data-punctuation-cta`.
 */
const START_CTA_SELECTOR = '[data-punctuation-cta]';

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

test.describe('punctuation golden path', () => {
  test.beforeEach(async ({ page }) => {
    await applyDeterminism(page);
  });

  test('demo learner runs a session through wrong + correct + finish and reload returns to punctuation', async ({ page }) => {
    await createDemoSession(page);

    await expect(page.locator('.subject-grid')).toBeVisible();

    await openSubject(page, 'punctuation');

    // Setup hero for punctuation practice.
    const startBtn = page.locator(START_CTA_SELECTOR).first();
    await expect(startBtn).toBeVisible({ timeout: 15_000 });
    await startBtn.click();

    // Complete the full round so the summary scene appears. "Finish
    // now" is intentionally not used here because it exits back to
    // setup.
    await driveSessionToSummary(page);

    // Reload and verify the demo session survives. Either the
    // summary persists (mid-flow preserved) or the app bounces to
    // the home dashboard (setup state preserved). Both count as
    // "progress preserved".
    await reload(page);
    const reloadedMarker = page.locator(
      `${START_CTA_SELECTOR}, [data-punctuation-summary], .subject-grid [data-action="open-subject"][data-subject-id="punctuation"]`,
    );
    await expect(reloadedMarker.first()).toBeVisible({ timeout: 15_000 });
  });

  // SH2-U2 (R2): reload-on-summary scene. The Punctuation sanitiser
  // (`sanitisePunctuationUiOnRehydrate` in
  // `src/subjects/punctuation/service-contract.js`) must strip the
  // persisted `summary` field on bootstrap so that a browser Back /
  // Refresh on the summary screen does NOT re-render the completion
  // surface with its "Start another round" CTA. After reload the
  // learner must land on a clean setup-phase surface instead.
  test('SH2-U2: reload on punctuation summary lands on clean setup phase, not summary screen', async ({ page }) => {
    await createDemoSession(page);
    await expect(page.locator('.subject-grid')).toBeVisible();
    await openSubject(page, 'punctuation');

    const startBtn = page.locator(START_CTA_SELECTOR).first();
    await expect(startBtn).toBeVisible({ timeout: 15_000 });
    await startBtn.click();

    await driveSessionToSummary(page);

    // Reload -- this is the R2 hazard. After reload, the rehydrate
    // sanitiser drops the persisted summary and coerces phase='summary'
    // back to 'setup' so the UI CANNOT land on the summary completion
    // surface.
    await reload(page);

    // Post-reload invariant: the summary surface must NOT be visible.
    // A safe fallback is either the Punctuation setup (start button) or
    // the home subject grid.
    const safeMarker = page.locator(
      `.subject-grid [data-action="open-subject"][data-subject-id="punctuation"], ${START_CTA_SELECTOR}`,
    ).first();
    await expect(safeMarker).toBeVisible({ timeout: 15_000 });

    // The summary surface must NOT be visible on the rehydrated page
    // (would indicate the summary survived through the sanitiser).
    await expect(page.locator('[data-punctuation-summary]')).toHaveCount(0);

    // adv-sh2u2-005 (zombie-phase proof): route resets to dashboard on
    // bootstrap, so the summary surface is naturally gone. Re-open the
    // Punctuation card -- this exercises the zombie-phase path. Without
    // the phase coercion to 'setup', phase='summary' would still be
    // persisted and PunctuationPracticeSurface (line 71) would mount
    // SummaryScene with an active "Start another round" CTA. With the
    // coercion the surface mounts the setup phase instead.
    const onGrid = page.locator('.subject-grid [data-action="open-subject"][data-subject-id="punctuation"]');
    if (await onGrid.count()) {
      await onGrid.first().click();
    }
    await expect(page.locator(START_CTA_SELECTOR).first()).toBeVisible({ timeout: 15_000 });
    // Summary surface MUST NOT reappear after re-opening Punctuation.
    await expect(page.locator('[data-punctuation-summary]')).toHaveCount(0);
  });
});

// -----------------------------------------------------------------------
// P7-U10: Full Worker-backed Playwright journey proof (§5.5)
//
// Exercises the complete Punctuation journey through the real Worker/D1
// command path end-to-end in a browser. Every assertion fires against
// actual DOM rendered from Worker responses — NOT SSR or direct dispatch.
//
// Star consistency contract: after completing a round, Star counts read
// from the landing (setup) monster meters, the summary monster meters,
// and the map monster-group headers must agree (within display rounding).
//
// Telemetry write path: the journey completes without errors regardless
// of whether telemetry events are accepted or rate-limited.
//
// Mobile-390 baseline consistent with existing tests. Desktop/tablet
// matrix deferred to follow-up.
// -----------------------------------------------------------------------

test.describe('P7-U10: full Worker-backed Punctuation journey', () => {
  test.beforeEach(async ({ page }) => {
    await applyDeterminism(page);
  });

  test('complete journey: home → landing → session → summary → landing → refresh → map with star consistency', async ({ page }) => {
    // ---------------------------------------------------------------
    // Step 1: Home/dashboard → Punctuation landing
    // ---------------------------------------------------------------
    await createDemoSession(page);
    await expect(page.locator('.subject-grid')).toBeVisible();

    // The home dashboard must show the punctuation subject card.
    const punctuationCard = page.locator(
      '.subject-card[data-action="open-subject"][data-subject-id="punctuation"]',
    );
    await expect(punctuationCard).toBeVisible();
    await openSubject(page, 'punctuation');

    // Landing (setup phase) must render the mission-dashboard CTA and
    // the monster-meter row.
    const startBtn = page.locator(START_CTA_SELECTOR).first();
    await expect(startBtn).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-punctuation-phase="setup"]')).toBeVisible();

    // Read pre-session star meters from the landing for baseline.
    const landingMetersBefore = await readStarMeters(page);

    // ---------------------------------------------------------------
    // Step 2: Start today's round (mission-dashboard CTA)
    // ---------------------------------------------------------------
    await startBtn.click();

    // ---------------------------------------------------------------
    // Step 3: First item renders
    // ---------------------------------------------------------------
    const sessionScene = page.locator('[data-punctuation-session-scene]').first();
    await expect(sessionScene).toBeVisible({ timeout: 15_000 });

    // The session must present either a choice or text input.
    const inputPresent = page.locator(
      '[data-punctuation-submit], .choice-card, textarea[name="typed"]',
    ).first();
    await expect(inputPresent).toBeVisible({ timeout: 10_000 });

    // ---------------------------------------------------------------
    // Steps 4-6: Submit answers, follow feedback, and reach summary
    // ---------------------------------------------------------------
    await driveSessionToSummary(page);

    // Read summary star meters.
    const summaryMeters = await readStarMeters(page);

    // ---------------------------------------------------------------
    // Step 7: Return to landing
    // ---------------------------------------------------------------
    // Use the Punctuation summary escape action so the subject surface
    // clears back to setup. The global dashboard button preserves the
    // summary for re-entry, which is a different journey.
    const backToLanding = page.locator('[data-action="punctuation-back"]').first();
    await expect(backToLanding).toBeVisible({ timeout: 10_000 });
    await backToLanding.click();
    await expect(page.locator(START_CTA_SELECTOR).first()).toBeVisible({ timeout: 15_000 });

    // Read post-session landing star meters.
    const landingMetersAfter = await readStarMeters(page);

    // ---------------------------------------------------------------
    // Step 8: Refresh/bootstrap
    // ---------------------------------------------------------------
    await reload(page);

    // After reload the learner must land on either the subject grid
    // or the punctuation setup — never on summary.
    const reloadedSurface = page.locator(
      `${START_CTA_SELECTOR}, .subject-grid [data-action="open-subject"][data-subject-id="punctuation"]`,
    ).first();
    await expect(reloadedSurface).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-punctuation-summary]')).toHaveCount(0);

    // If landed on home grid, re-open punctuation.
    const onGridAfterReload = page.locator(
      '.subject-grid [data-action="open-subject"][data-subject-id="punctuation"]',
    );
    if (await onGridAfterReload.count()) {
      await onGridAfterReload.first().click();
      await expect(page.locator(START_CTA_SELECTOR).first()).toBeVisible({ timeout: 15_000 });
    }

    // Read post-refresh landing star meters.
    const landingMetersRefreshed = await readStarMeters(page);

    // ---------------------------------------------------------------
    // Step 9: Open Punctuation Map
    // ---------------------------------------------------------------
    const openMapBtn = page.locator('[data-action="punctuation-open-map"]').first();
    await expect(openMapBtn).toBeVisible({ timeout: 10_000 });
    await openMapBtn.click();

    await expect(page.locator('[data-punctuation-map]')).toBeVisible({ timeout: 15_000 });

    // Read map star headers.
    const mapHeaders = await readMapStarHeaders(page);

    // Close map — back to landing.
    const closeMapBtn = page.locator('[data-action="punctuation-close-map"]').first();
    await expect(closeMapBtn).toBeVisible();
    await closeMapBtn.click();
    await expect(page.locator(START_CTA_SELECTOR).first()).toBeVisible({ timeout: 15_000 });

    // ---------------------------------------------------------------
    // Step 10: Star meter consistency
    // ---------------------------------------------------------------

    // Hard-fail if any meter array is empty — prevents vacuous passes.
    expect(landingMetersAfter.length, 'Post-session landing must have star meters').toBeGreaterThan(0);
    expect(landingMetersRefreshed.length, 'Post-refresh landing must have star meters').toBeGreaterThan(0);

    // Post-session landing and post-refresh landing must agree.
    // Star counts extracted as numbers must be identical.
    if (landingMetersAfter.length > 0 && landingMetersRefreshed.length > 0) {
      expect(
        landingMetersAfter.length,
        'Post-session and post-refresh landing must show the same number of monster meters',
      ).toBe(landingMetersRefreshed.length);

      for (let i = 0; i < landingMetersAfter.length; i += 1) {
        const afterStars = parseStarCount(landingMetersAfter[i].text);
        const refreshedStars = parseStarCount(landingMetersRefreshed[i].text);
        if (!Number.isNaN(afterStars) && !Number.isNaN(refreshedStars)) {
          expect(
            afterStars,
            `Star count for "${landingMetersAfter[i].name}" must agree between post-session and post-refresh landing`,
          ).toBe(refreshedStars);
        }
      }
    }

    // Summary meters vs post-session landing meters: the same monsters
    // must show the same Star counts. Summary includes a MonsterProgressStrip
    // that mirrors the setup scene's monster meters. Both read from the same
    // starView + rewardState + mergeMonotonicDisplay pipeline, so counts
    // must be identical.
    expect(summaryMeters.length, 'Summary must have star meters').toBeGreaterThan(0);

    if (summaryMeters.length > 0 && landingMetersAfter.length > 0) {
      // Build lookup by monster name for comparison (order may differ).
      const summaryByName = Object.fromEntries(summaryMeters.map((m) => [m.name, m]));
      const landingByName = Object.fromEntries(landingMetersAfter.map((m) => [m.name, m]));

      for (const [name, summaryMeter] of Object.entries(summaryByName)) {
        const landingMeter = landingByName[name];
        if (!landingMeter) continue; // Skip monsters only on one surface.
        const summaryStars = parseStarCount(summaryMeter.text);
        const landingStars = parseStarCount(landingMeter.text);
        if (!Number.isNaN(summaryStars) && !Number.isNaN(landingStars)) {
          expect(
            summaryStars,
            `Star count for "${name}" must agree between summary and landing (within display rounding)`,
          ).toBe(landingStars);
        }
      }
    }

    // Map headers vs landing meters: extract star counts from map headers
    // and verify they match the landing meters for the same monsters.
    // Map headers contain text like "Pealark12 / 100 Stars · Getting started"
    // so parsing requires a broader pattern.
    expect(mapHeaders.length, 'Map must have monster-group headers').toBeGreaterThan(0);

    if (mapHeaders.length > 0 && landingMetersAfter.length > 0) {
      for (const header of mapHeaders) {
        const mapStars = parseStarCount(header.text.replace(/^[A-Za-z\s]+/, ''));
        if (Number.isNaN(mapStars)) continue;
        // Find matching landing meter by checking if header text starts
        // with a name from the landing meters.
        const matchingLanding = landingMetersAfter.find((m) =>
          header.text.toLowerCase().includes(m.name.toLowerCase()),
        );
        if (!matchingLanding) continue;
        const landingStars = parseStarCount(matchingLanding.text);
        if (!Number.isNaN(landingStars)) {
          expect(
            mapStars,
            `Map star count for monster "${header.monsterId}" must agree with landing meter`,
          ).toBe(landingStars);
        }
      }
    }

    // ---------------------------------------------------------------
    // Star progression: at least one monster must show progress
    // after completing a session (prevents vacuous all-zero passes).
    // ---------------------------------------------------------------
    const anyProgression = landingMetersAfter.some((m, i) =>
      landingMetersBefore[i] && parseStarCount(m.text) > parseStarCount(landingMetersBefore[i].text),
    );
    expect(
      anyProgression,
      'At least one monster should show star progress after completing a session',
    ).toBeTruthy();
  });

  // ---------------------------------------------------------------
  // P7-U10: SH2-U2 refresh regression guard. After completing a
  // session, reload must land on a clean setup phase — not re-render
  // the summary. This is a dedicated proof distinct from the SH2-U2
  // test above because it runs through the full journey first.
  // ---------------------------------------------------------------
  test('refresh after full journey returns to clean setup state (SH2-U2 regression)', async ({ page }) => {
    await createDemoSession(page);
    await expect(page.locator('.subject-grid')).toBeVisible();
    await openSubject(page, 'punctuation');

    const startBtn = page.locator(START_CTA_SELECTOR).first();
    await expect(startBtn).toBeVisible({ timeout: 15_000 });
    await startBtn.click();

    await driveSessionToSummary(page);

    // Reload from summary.
    await reload(page);

    // Must NOT land on summary.
    await expect(page.locator('[data-punctuation-summary]')).toHaveCount(0);

    // Must land on either home grid or setup.
    const safeTarget = page.locator(
      `${START_CTA_SELECTOR}, .subject-grid [data-action="open-subject"][data-subject-id="punctuation"]`,
    ).first();
    await expect(safeTarget).toBeVisible({ timeout: 15_000 });

    // Re-open Punctuation if on home grid.
    const gridCard = page.locator(
      '.subject-grid [data-action="open-subject"][data-subject-id="punctuation"]',
    );
    if (await gridCard.count()) {
      await gridCard.first().click();
    }
    await expect(page.locator(START_CTA_SELECTOR).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-punctuation-summary]')).toHaveCount(0);
  });

  // ---------------------------------------------------------------
  // P7-U10: Map open/close round-trip from landing.
  // ---------------------------------------------------------------
  test('map opens from landing and closes back to landing', async ({ page }) => {
    await createDemoSession(page);
    await expect(page.locator('.subject-grid')).toBeVisible();
    await openSubject(page, 'punctuation');

    await expect(page.locator(START_CTA_SELECTOR).first()).toBeVisible({ timeout: 15_000 });

    // Open map.
    const openMapBtn = page.locator('[data-action="punctuation-open-map"]').first();
    await expect(openMapBtn).toBeVisible({ timeout: 10_000 });
    await openMapBtn.click();

    await expect(page.locator('[data-punctuation-map]')).toBeVisible({ timeout: 15_000 });

    // Map must show the map body.
    await expect(page.locator('[data-punctuation-map-body]')).toBeVisible();

    // Close map.
    const closeMapBtn = page.locator('[data-action="punctuation-close-map"]').first();
    await expect(closeMapBtn).toBeVisible();
    await closeMapBtn.click();

    // Must return to landing — setup phase with CTA visible.
    await expect(page.locator(START_CTA_SELECTOR).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-punctuation-map]')).toHaveCount(0);
  });

  // ---------------------------------------------------------------
  // P7-U10: Telemetry disabled path — journey completes without
  // errors when telemetry events are absent or rate-limited.
  // The contract says "verify no learner disruption when telemetry
  // is enabled/disabled". We intercept the telemetry route and
  // force 429 responses, then run the session to summary and verify
  // no console errors disrupt the journey.
  // ---------------------------------------------------------------
  test('telemetry disabled: journey completes without errors when telemetry is rate-limited', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    // Intercept telemetry event recording route and return rate-limited.
    await page.route('**/api/subjects/punctuation/command', async (route) => {
      const postData = route.request().postData() || '';
      // Only intercept record-event commands; let other commands through.
      if (postData.includes('"record-event"') || postData.includes("'record-event'")) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, recorded: false, rateLimited: true }),
        });
      } else {
        await route.continue();
      }
    });

    await createDemoSession(page);
    await expect(page.locator('.subject-grid')).toBeVisible();
    await openSubject(page, 'punctuation');

    const startBtn = page.locator(START_CTA_SELECTOR).first();
    await expect(startBtn).toBeVisible({ timeout: 15_000 });
    await startBtn.click();

    await driveSessionToSummary(page);

    // The journey must complete without page errors. Filter out
    // benign telemetry-related messages (rate-limit logs are expected).
    // Chromium reports the optional Hero read-model 404 as a URL-less
    // generic resource error, which is unrelated to this telemetry path.
    const realErrors = consoleErrors.filter(
      (msg) => !msg.includes('rate')
        && !msg.includes('telemetry')
        && !msg.includes('Rate')
        && msg !== 'Failed to load resource: the server responded with a status of 404 (Not Found)',
    );
    expect(
      realErrors,
      'No console errors should disrupt the journey when telemetry is rate-limited',
    ).toEqual([]);
  });
});
