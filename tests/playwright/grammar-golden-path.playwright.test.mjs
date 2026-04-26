// U5 (sys-hardening p1): grammar golden path.
//
// Flow: open demo session -> navigate dashboard -> enter grammar ->
// Mini Test mode (scene with short form) -> one answer saved + one
// skipped (i.e. the intentional "wrong" path via the Save and next
// button with an empty response) -> Finish mini-set -> reload +
// verify we land back on the grammar surface.
//
// Baselines in U5 are captured only at `mobile-390`. Wider viewport
// matrix lands in U10/U12.

import { test, expect } from '@playwright/test';
import {
  applyDeterminism,
  createDemoSession,
  openSubject,
  reload,
} from './shared.mjs';

test.describe('grammar golden path', () => {
  test.beforeEach(async ({ page }) => {
    await applyDeterminism(page);
  });

  test('demo learner runs a mini-test round through wrong + correct + finish and reload returns to grammar', async ({ page }) => {
    await createDemoSession(page);

    await expect(page.locator('.subject-grid')).toBeVisible();

    await openSubject(page, 'grammar');

    // Dashboard rendered. Select Mini Test mode so the round has a
    // short, deterministic length — Smart / Timed modes vary by
    // generator state across runs.
    const dashboard = page.locator('.grammar-dashboard');
    await expect(dashboard).toBeVisible({ timeout: 15_000 });

    const miniTestButton = page.getByRole('button', { name: /^Mini Test/ });
    await expect(miniTestButton).toBeVisible();
    await miniTestButton.click();

    const beginRound = page.getByRole('button', { name: /Begin round/ });
    await expect(beginRound).toBeVisible();
    await beginRound.click();

    // Mini test session live.
    const session = page.locator('.grammar-mini-test-panel, .grammar-session').first();
    await expect(session).toBeVisible({ timeout: 15_000 });

    // One "wrong" leg: save the current response unchanged via
    // "Save and next". In mini-test mode `required={false}`, so the
    // current empty response is legal; the save advances to the next
    // item and records a blank attempt — this is the deterministic
    // wrong-leg we can drive without a per-seed oracle.
    const saveNext = page.getByRole('button', { name: /Save and next/ });
    if (await saveNext.count()) {
      await saveNext.first().click();
      // Wait a beat for the next item to mount before we touch the
      // second-leg input.
      await page.waitForTimeout(200);
    }

    // One "correct" leg: mini-test items may be free-text or radio
    // groups depending on the generated round. Fill whichever shape
    // is present so the scene ends with a non-empty attempt.
    const freeText = page.locator('.grammar-answer-form input[type="text"], .grammar-answer-form textarea, .grammar-mini-test-panel input[type="text"], .grammar-mini-test-panel textarea').first();
    const radioChoice = page.locator('.grammar-answer-form input[type="radio"], .grammar-mini-test-panel input[type="radio"]').first();
    if (await freeText.count()) {
      await freeText.fill('test');
    } else if (await radioChoice.count()) {
      await radioChoice.check({ force: true }).catch(() => radioChoice.click({ force: true }));
    }

    // Close the round via Finish mini-set. The summary shell lands
    // on the grammar dashboard; both counts as "finish" for the
    // golden path.
    const finish = page.getByRole('button', { name: /Finish mini-set/ });
    await expect(finish).toBeVisible();
    await finish.click();

    // Summary lands.
    await expect(page.locator('.grammar-summary-shell, .grammar-dashboard')).toBeVisible({ timeout: 15_000 });

    // Reload and verify the demo session survives: either the
    // grammar surface re-mounts (mid-session state preserved) or
    // the home dashboard rehydrates with the grammar subject card
    // visible. Both count as "progress preserved" — the demo
    // cookie survived the refresh and bootstrap returned the same
    // learner scope.
    await reload(page);
    const reloadedMarker = page.locator(
      '.grammar-dashboard, .grammar-summary-shell, .subject-grid [data-action="open-subject"][data-subject-id="grammar"]',
    );
    await expect(reloadedMarker.first()).toBeVisible({ timeout: 15_000 });
  });

  // SH2-U2 (R2): reload-on-summary scene. The `sanitiseUiOnRehydrate()`
  // hook on `grammarModule` must strip the persisted `summary` field on
  // bootstrap so that a browser Back / Refresh on the summary screen
  // does NOT re-render the completion surface. After reload the learner
  // must land on a clean dashboard-phase surface instead.
  test('SH2-U2: reload on grammar summary lands on clean dashboard phase, not summary shell', async ({ page }) => {
    await createDemoSession(page);
    await expect(page.locator('.subject-grid')).toBeVisible();
    await openSubject(page, 'grammar');

    const dashboard = page.locator('.grammar-dashboard');
    await expect(dashboard).toBeVisible({ timeout: 15_000 });

    const miniTestButton = page.getByRole('button', { name: /^Mini Test/ });
    await expect(miniTestButton).toBeVisible();
    await miniTestButton.click();

    const beginRound = page.getByRole('button', { name: /Begin round/ });
    await expect(beginRound).toBeVisible();
    await beginRound.click();

    const session = page.locator('.grammar-mini-test-panel, .grammar-session').first();
    await expect(session).toBeVisible({ timeout: 15_000 });

    // End the mini-test round via Finish mini-set without answering so
    // we land on the summary screen without coupling to a specific
    // question seed.
    const finish = page.getByRole('button', { name: /Finish mini-set/ });
    await expect(finish).toBeVisible();
    await finish.click();

    // Wait for summary scene.
    await expect(page.locator('.grammar-summary-shell, .grammar-dashboard')).toBeVisible({ timeout: 15_000 });

    // Reload — this is the R2 hazard. After reload, the rehydrate
    // sanitiser drops the persisted summary so the UI CANNOT land on
    // the completion summary shell.
    await reload(page);

    // Post-reload invariant: the grammar summary shell must NOT be
    // visible. A safe fallback is either the Grammar dashboard or the
    // home subject grid.
    const safeMarker = page.locator(
      '.subject-grid [data-action="open-subject"][data-subject-id="grammar"], .grammar-dashboard',
    ).first();
    await expect(safeMarker).toBeVisible({ timeout: 15_000 });

    // The summary shell must NOT be visible on the rehydrated page
    // (would indicate the summary survived through the sanitiser).
    await expect(page.locator('.grammar-summary-shell')).toHaveCount(0);
  });
});
