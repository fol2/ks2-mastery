// U5 (sys-hardening p1): punctuation golden path.
//
// Flow: open demo session -> navigate dashboard -> enter punctuation ->
// start practice -> 1 wrong attempt + 1 correct (or simply another
// attempt) -> finish now -> reload and verify punctuation surface
// re-renders.
//
// Baselines in U5 are captured only at `mobile-390`. Full matrix
// lands in U10/U12.

import { test, expect } from '@playwright/test';
import {
  applyDeterminism,
  createDemoSession,
  openSubject,
  punctuationAnswer,
  punctuationContinue,
  reload,
} from './shared.mjs';

test.describe('punctuation golden path', () => {
  test.beforeEach(async ({ page }) => {
    await applyDeterminism(page);
  });

  test('demo learner runs a session through wrong + correct + finish and reload returns to punctuation', async ({ page }) => {
    await createDemoSession(page);

    await expect(page.locator('.subject-grid')).toBeVisible();

    await openSubject(page, 'punctuation');

    // Setup hero for punctuation practice.
    const startBtn = page.locator('[data-punctuation-start]');
    await expect(startBtn).toBeVisible({ timeout: 15_000 });
    await startBtn.click();

    // Active item. The first item may be a choice (radio) or a text
    // item depending on the seeded smart-review cohort; the helper
    // handles either shape.
    await punctuationAnswer(page, {
      typed: 'not a sentence that matches the answer',
      choiceIndex: 0,
    });
    await expect(page.locator('[data-punctuation-continue]')).toBeVisible({ timeout: 10_000 });
    await punctuationContinue(page);

    // Second attempt (this may transition into summary depending on
    // the smart-review queue length; both paths are valid).
    const summaryOrActive = page.locator('[data-punctuation-summary], [data-punctuation-submit]').first();
    await expect(summaryOrActive).toBeVisible({ timeout: 15_000 });

    const submitStillAround = page.locator('[data-punctuation-submit]');
    if (await submitStillAround.count()) {
      await punctuationAnswer(page, {
        typed: 'another attempt',
        choiceIndex: 0,
      });
      await expect(page.locator('[data-punctuation-continue]')).toBeVisible({ timeout: 10_000 });

      // End via "Finish now" secondary action on the feedback card.
      const finishNow = page.getByRole('button', { name: /Finish now/ });
      if (await finishNow.count()) {
        await finishNow.first().click();
      } else {
        await punctuationContinue(page);
      }
    }

    await expect(page.locator('[data-punctuation-summary]')).toBeVisible({ timeout: 15_000 });

    // Reload and verify the demo session survives. Either the
    // summary persists (mid-flow preserved) or the app bounces to
    // the home dashboard (setup state preserved). Both count as
    // "progress preserved".
    await reload(page);
    const reloadedMarker = page.locator(
      '[data-punctuation-start], [data-punctuation-summary], .subject-grid [data-action="open-subject"][data-subject-id="punctuation"]',
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

    const startBtn = page.locator('[data-punctuation-start]');
    await expect(startBtn).toBeVisible({ timeout: 15_000 });
    await startBtn.click();

    // Drive the session to summary. The deterministic path is: first
    // active item → answer (any) → continue → if still in session,
    // end via "Finish now".
    await punctuationAnswer(page, {
      typed: 'stub answer',
      choiceIndex: 0,
    });
    await expect(page.locator('[data-punctuation-continue]')).toBeVisible({ timeout: 10_000 });
    const finishNow = page.getByRole('button', { name: /Finish now/ });
    if (await finishNow.count()) {
      await finishNow.first().click();
    } else {
      await punctuationContinue(page);
    }

    // Wait for summary scene.
    await expect(page.locator('[data-punctuation-summary]')).toBeVisible({ timeout: 15_000 });

    // Reload — this is the R2 hazard. After reload, the rehydrate
    // sanitiser drops the persisted summary so the UI CANNOT land on
    // the summary completion surface.
    await reload(page);

    // Post-reload invariant: the summary surface must NOT be visible.
    // A safe fallback is either the Punctuation setup (start button) or
    // the home subject grid.
    const safeMarker = page.locator(
      '.subject-grid [data-action="open-subject"][data-subject-id="punctuation"], [data-punctuation-start]',
    ).first();
    await expect(safeMarker).toBeVisible({ timeout: 15_000 });

    // The summary surface must NOT be visible on the rehydrated page
    // (would indicate the summary survived through the sanitiser).
    await expect(page.locator('[data-punctuation-summary]')).toHaveCount(0);
  });
});
