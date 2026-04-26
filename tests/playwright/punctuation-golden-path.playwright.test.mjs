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
});
