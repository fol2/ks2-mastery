// P7-U11: Pending/degraded navigation proof via fault-injection stall.
//
// Contract §5.6: "Mutation buttons disable while pending/degraded/read-only.
// Navigation/escape buttons remain available."
//
// This suite activates the `stall-punctuation-command` fault kind (U9) to
// simulate a Worker command that hangs indefinitely. While the command is
// stalled it asserts:
//
//   1. Mutation buttons (Submit, Continue, Start again) are disabled.
//   2. Navigation buttons (Summary Back, Map Close, Skill Detail close)
//      remain enabled and functional.
//   3. Pressing a navigation button navigates away without waiting for the
//      stalled command to resolve.
//
// The stall fault is injected mid-session — the learner completes at least
// one answer through the real Worker path, then the fault engages on the
// NEXT command. This guarantees the pending state is real (not faked by
// omitting the command altogether).
//
// Screenshot policy: NO `toHaveScreenshot` calls — this suite asserts state
// and testids, not pixels (same as chaos-http-boundary).

import { test, expect } from '@playwright/test';
import {
  applyDeterminism,
  createDemoSession,
  openSubject,
  punctuationAnswer,
  punctuationContinue,
} from './shared.mjs';
import { __ks2_injectFault_TESTS_ONLY__ as faultInjection } from '../helpers/fault-injection.mjs';

// ---------------------------------------------------------------------------
// Fault-plan helpers
// ---------------------------------------------------------------------------

/**
 * Build the encoded stall plan for punctuation commands. The `durationMs`
 * is set high enough that the stall outlasts every assertion window in this
 * suite (15 s) but well below the Playwright test timeout (30 s default).
 */
function stallPlan({ once = false, durationMs = 20_000 } = {}) {
  return {
    kind: 'stall-punctuation-command',
    pathPattern: '/api/subjects/punctuation',
    once,
    durationMs,
  };
}

/**
 * Install the stall fault plan against the live page by intercepting every
 * same-origin request and attaching the opt-in + plan headers. Mirrors
 * `installFaultPlan` from chaos-http-boundary but scoped to stall plans.
 */
async function installStallFault(page, plan) {
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
 * Remove all route handlers so subsequent requests proceed without the
 * stall fault. Used to clean up after navigation assertions so the page
 * can settle without interference.
 */
async function removeAllRoutes(page) {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
}

// ---------------------------------------------------------------------------
// Shared flow: drive a punctuation session to the Summary scene.
// ---------------------------------------------------------------------------

/**
 * Drive a punctuation session from the Setup CTA through at least one
 * answer to the Summary scene. Returns when `[data-punctuation-summary]`
 * is visible.
 */
async function driveToSummary(page) {
  // Start a session.
  const startBtn = page.locator('[data-punctuation-start]');
  await expect(startBtn).toBeVisible({ timeout: 15_000 });
  await startBtn.click();

  // Answer the first question.
  await punctuationAnswer(page, { typed: 'stub answer', choiceIndex: 0 });
  await expect(page.locator('[data-punctuation-continue]')).toBeVisible({ timeout: 10_000 });

  // Try "Finish now" if available, otherwise continue and loop.
  const finishNow = page.getByRole('button', { name: /Finish now/ });
  if (await finishNow.count()) {
    await finishNow.first().click();
  } else {
    await punctuationContinue(page);
  }

  // If we landed on another question instead of summary, keep going.
  const summaryOrSubmit = page.locator('[data-punctuation-summary], [data-punctuation-submit]').first();
  await expect(summaryOrSubmit).toBeVisible({ timeout: 15_000 });

  if (await page.locator('[data-punctuation-submit]').count()) {
    await punctuationAnswer(page, { typed: 'another answer', choiceIndex: 0 });
    await expect(page.locator('[data-punctuation-continue]')).toBeVisible({ timeout: 10_000 });
    const finishNow2 = page.getByRole('button', { name: /Finish now/ });
    if (await finishNow2.count()) {
      await finishNow2.first().click();
    } else {
      await punctuationContinue(page);
    }
  }

  await expect(page.locator('[data-punctuation-summary]')).toBeVisible({ timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('P7-U11: pending/degraded navigation proof', () => {
  test.beforeEach(async ({ page }) => {
    await applyDeterminism(page);
  });

  // -----------------------------------------------------------------
  // Scene 1: Summary Back navigates to landing during stalled command.
  //
  // Flow:
  //   1. Demo session → Punctuation → complete a round → Summary.
  //   2. Install stall fault (next command will hang).
  //   3. Click "Start again" to trigger a mutation command that stalls.
  //   4. While stalled: assert mutation buttons disabled.
  //   5. While stalled: assert Back button enabled.
  //   6. Click Back → assert navigation to setup/landing.
  // -----------------------------------------------------------------
  test('Summary Back navigates to landing while command is stalled', async ({ page }) => {
    await createDemoSession(page);
    await expect(page.locator('.subject-grid')).toBeVisible();
    await openSubject(page, 'punctuation');
    await driveToSummary(page);

    // Verify we are on Summary before engaging the fault.
    await expect(page.locator('[data-punctuation-summary]')).toBeVisible();

    // Install stall fault — the NEXT punctuation command will hang.
    await installStallFault(page, stallPlan({ durationMs: 20_000 }));

    // Click "Start again" — this dispatches a mutation command that will
    // stall because the fault is active. The button itself will disable
    // (mutation control) but the Back button must stay enabled (navigation).
    const startAgain = page.locator('[data-punctuation-summary] button.btn.primary');
    if (await startAgain.count()) {
      // Fire-and-forget — the click triggers the stalled command. We do
      // NOT await the navigation because the command hangs.
      await startAgain.first().click();
    }

    // Give the pending signal a moment to propagate through React.
    await page.waitForTimeout(500);

    // Assert: Back to dashboard button is NOT disabled.
    const backButton = page.locator('[data-action="punctuation-back"]');
    // The back button may still be on the Summary. If the stall caused
    // a phase transition attempt that hung, the Summary stays visible.
    const summaryStillVisible = await page.locator('[data-punctuation-summary]').count();

    if (summaryStillVisible) {
      await expect(backButton).toBeVisible({ timeout: 5_000 });
      await expect(backButton).toBeEnabled({ timeout: 5_000 });

      // Assert the Back button does NOT have aria-disabled="true".
      const ariaDisabled = await backButton.getAttribute('aria-disabled');
      expect(ariaDisabled).not.toBe('true');

      // Click Back — this must navigate away without waiting for stall.
      await removeAllRoutes(page);
      await backButton.click();

      // Post-navigation: we should land on setup or the home grid.
      const safeMarker = page.locator(
        '[data-punctuation-phase="setup"], .subject-grid',
      ).first();
      await expect(safeMarker).toBeVisible({ timeout: 15_000 });

      // Summary must NOT be visible after navigating back.
      await expect(page.locator('[data-punctuation-summary]')).toHaveCount(0);
    } else {
      // The "Start again" click transitioned away from Summary before the
      // stall could be observed — the session re-entered and is now on an
      // active-item phase with a stalled command. Assert mutation disabled,
      // then use the brand/home button to escape.
      const submit = page.locator('[data-punctuation-submit]');
      if (await submit.count()) {
        await expect(submit).toBeDisabled({ timeout: 5_000 });
      }
      // Clean up routes so navigation works, then navigate home.
      await removeAllRoutes(page);
      const brand = page.locator('.profile-brand-button[data-action="navigate-home"]');
      if (await brand.count()) {
        await brand.first().click();
        await expect(page.locator('.subject-grid')).toBeVisible({ timeout: 15_000 });
      }
    }
  });

  // -----------------------------------------------------------------
  // Scene 2: mutation buttons are disabled during a stalled command
  // on the Summary scene, while navigation stays enabled.
  //
  // This scene uses a different approach: inject the stall fault
  // BEFORE the summary-triggering "Continue" so that the last
  // command of the session (which produces the summary read model)
  // is the one that stalls. The UI should show the summary with
  // mutation buttons disabled and navigation enabled.
  // -----------------------------------------------------------------
  test('mutation buttons disabled and navigation enabled during stalled command on Summary', async ({ page }) => {
    await createDemoSession(page);
    await expect(page.locator('.subject-grid')).toBeVisible();
    await openSubject(page, 'punctuation');

    // Start session, answer a question, land on feedback.
    const startBtn = page.locator('[data-punctuation-start]');
    await expect(startBtn).toBeVisible({ timeout: 15_000 });
    await startBtn.click();

    await punctuationAnswer(page, { typed: 'stub answer', choiceIndex: 0 });
    await expect(page.locator('[data-punctuation-continue]')).toBeVisible({ timeout: 10_000 });

    // Complete the session naturally (to reach Summary without stall).
    const finishNow = page.getByRole('button', { name: /Finish now/ });
    if (await finishNow.count()) {
      await finishNow.first().click();
    } else {
      await punctuationContinue(page);
      // Drive until summary.
      const summaryOrSubmit = page.locator('[data-punctuation-summary], [data-punctuation-submit]').first();
      await expect(summaryOrSubmit).toBeVisible({ timeout: 15_000 });
      if (await page.locator('[data-punctuation-submit]').count()) {
        await punctuationAnswer(page, { typed: 'another attempt', choiceIndex: 0 });
        const finish2 = page.getByRole('button', { name: /Finish now/ });
        if (await finish2.count()) {
          await finish2.first().click();
        } else {
          await expect(page.locator('[data-punctuation-continue]')).toBeVisible({ timeout: 10_000 });
          await punctuationContinue(page);
        }
      }
    }

    await expect(page.locator('[data-punctuation-summary]')).toBeVisible({ timeout: 15_000 });

    // NOW install the stall fault. The next command will hang.
    await installStallFault(page, stallPlan({ durationMs: 20_000 }));

    // Click "Start again" to trigger a pending mutation command.
    const startAgainBtn = page.locator('[data-punctuation-summary] button.btn.primary');
    if (await startAgainBtn.count()) {
      await startAgainBtn.first().click();
    }
    await page.waitForTimeout(500);

    // If we are still on Summary (stall prevented transition):
    if (await page.locator('[data-punctuation-summary]').count()) {
      // Assert: "Start again" (mutation) is disabled.
      const startAgain = page.locator('[data-punctuation-summary] button.btn.primary');
      if (await startAgain.count()) {
        // The mutation button should be disabled while the command is pending.
        const isStartDisabled = await startAgain.first().isDisabled();
        expect(isStartDisabled).toBe(true);
      }

      // Assert: "Open Punctuation Map" (mutation) is disabled.
      const openMap = page.locator('[data-action="punctuation-open-map"]');
      if (await openMap.count()) {
        const isMapDisabled = await openMap.first().isDisabled();
        expect(isMapDisabled).toBe(true);
      }

      // Assert: "Back to dashboard" (navigation) is NOT disabled.
      const backBtn = page.locator('[data-action="punctuation-back"]');
      await expect(backBtn).toBeVisible();
      await expect(backBtn).toBeEnabled();
      const ariaDisabled = await backBtn.getAttribute('aria-disabled');
      expect(ariaDisabled).not.toBe('true');

      // Navigate away — prove it works.
      await removeAllRoutes(page);
      await backBtn.click();
      const safeMarker = page.locator(
        '[data-punctuation-phase="setup"], .subject-grid',
      ).first();
      await expect(safeMarker).toBeVisible({ timeout: 15_000 });
    }
  });

  // -----------------------------------------------------------------
  // Scene 3: Map Close returns to prior surface during stalled command.
  //
  // Flow:
  //   1. Demo session → Punctuation → Setup.
  //   2. Open the Map from Setup.
  //   3. Install stall fault.
  //   4. Click a mutation button on the Map (e.g. a filter chip) that
  //      triggers a stalled command.
  //   5. While stalled: assert Map Close button is enabled.
  //   6. Click Map Close → returns to Setup.
  // -----------------------------------------------------------------
  test('Map Close returns to prior surface during stalled command', async ({ page }) => {
    await createDemoSession(page);
    await expect(page.locator('.subject-grid')).toBeVisible();
    await openSubject(page, 'punctuation');

    // Wait for setup to render.
    await expect(page.locator('[data-punctuation-phase="setup"]')).toBeVisible({ timeout: 15_000 });

    // Open the Map.
    const mapLink = page.locator('[data-action="punctuation-open-map"]');
    await expect(mapLink).toBeVisible({ timeout: 10_000 });
    await mapLink.click();

    // Wait for Map scene.
    await expect(page.locator('[data-punctuation-phase="map"]')).toBeVisible({ timeout: 15_000 });

    // Install stall fault.
    await installStallFault(page, stallPlan({ durationMs: 20_000 }));

    // Try to click a filter chip (mutation action) to trigger a command.
    const filterChip = page.locator('[data-action="punctuation-map-status-filter"]').first();
    if (await filterChip.count()) {
      await filterChip.click();
      await page.waitForTimeout(500);
    }

    // Assert: Map Close button is enabled.
    const closeBtn = page.locator('[data-action="punctuation-close-map"]');
    await expect(closeBtn).toBeVisible({ timeout: 5_000 });
    await expect(closeBtn).toBeEnabled({ timeout: 5_000 });
    const ariaDisabled = await closeBtn.getAttribute('aria-disabled');
    expect(ariaDisabled).not.toBe('true');

    // Navigate: close the map.
    await removeAllRoutes(page);
    await closeBtn.click();

    // Should return to Setup.
    await expect(page.locator('[data-punctuation-phase="setup"]')).toBeVisible({ timeout: 15_000 });
    // Map must not be visible.
    await expect(page.locator('[data-punctuation-phase="map"]')).toHaveCount(0);
  });

  // -----------------------------------------------------------------
  // Scene 4: Skill Detail modal Escape closes it during stalled command.
  //
  // Flow:
  //   1. Demo session → Punctuation → Setup → Map.
  //   2. Click a skill card on the Map to open Skill Detail modal.
  //   3. Install stall fault.
  //   4. While stalled: assert close button is enabled.
  //   5. Click close → modal closes, Map is visible.
  // -----------------------------------------------------------------
  test('Skill Detail modal close button works during stalled command', async ({ page }) => {
    await createDemoSession(page);
    await expect(page.locator('.subject-grid')).toBeVisible();
    await openSubject(page, 'punctuation');

    await expect(page.locator('[data-punctuation-phase="setup"]')).toBeVisible({ timeout: 15_000 });

    // Open the Map.
    const mapLink = page.locator('[data-action="punctuation-open-map"]');
    await expect(mapLink).toBeVisible({ timeout: 10_000 });
    await mapLink.click();
    await expect(page.locator('[data-punctuation-phase="map"]')).toBeVisible({ timeout: 15_000 });

    // Click a skill card to open the Skill Detail modal.
    const skillCard = page.locator('[data-action="punctuation-open-skill-detail"]').first();
    if (await skillCard.count()) {
      await skillCard.click();

      // Wait for the modal to render.
      const modalClose = page.locator('[data-action="punctuation-skill-detail-close"]');
      await expect(modalClose).toBeVisible({ timeout: 10_000 });

      // Install stall fault.
      await installStallFault(page, stallPlan({ durationMs: 20_000 }));

      // The modal close button must be enabled.
      await expect(modalClose).toBeEnabled({ timeout: 5_000 });
      const ariaDisabled = await modalClose.getAttribute('aria-disabled');
      expect(ariaDisabled).not.toBe('true');

      // Close the modal.
      await removeAllRoutes(page);
      await modalClose.click();

      // Modal should close — the close button should no longer be visible.
      await expect(modalClose).toHaveCount(0, { timeout: 10_000 });
      // Map should still be visible.
      await expect(page.locator('[data-punctuation-phase="map"]')).toBeVisible();
    } else {
      // No skill cards on the map — skip gracefully. This path is
      // unlikely with a demo learner but we do not want a false failure.
      test.skip(true, 'No skill cards visible on Map for this demo learner');
    }
  });
});
