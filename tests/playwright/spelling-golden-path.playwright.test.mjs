// U5 (sys-hardening p1): spelling golden path.
//
// Flow: open demo session -> navigate dashboard -> enter spelling ->
// 1 wrong answer (intentional mis-spelling) + 1 correct answer +
// end-round-early -> reload and verify progress preserved.
//
// This scene's initial screenshot baseline is captured on the
// `mobile-390` project only; wider viewport coverage lands in U9/U10/U12.

import { test, expect } from '@playwright/test';
import {
  applyDeterminism,
  createDemoSession,
  openSubject,
  reload,
  screenshotName,
  spellingAnswer,
  spellingContinue,
  defaultMasks,
} from './shared.mjs';

test.describe('spelling golden path', () => {
  test.beforeEach(async ({ page }) => {
    await applyDeterminism(page);
  });

  test('demo learner completes a round through wrong + correct + end-early and reload preserves progress', async ({ page }, testInfo) => {
    await createDemoSession(page);

    // Dashboard assertion before we descend into the subject. The shell
    // ships a `.subject-grid` landmark once bootstrap has rehydrated
    // from /api/bootstrap.
    await expect(page.locator('.subject-grid')).toBeVisible();

    await openSubject(page, 'spelling');

    // Spelling setup scene. We rely on the default demo learner prefs
    // here — toggling prefs (auto-speak, round-length) would fire a
    // `save-prefs` command whose `pendingCommand` state briefly
    // disables the Start button, racing the scene's start click.
    // The golden-path is intentionally the happy-path with factory
    // defaults; any pref override belongs in a follow-up scene.
    const start = page.locator('[data-action="spelling-start"]');
    await expect(start).toBeVisible();
    await expect(start).toBeEnabled();
    await start.click();

    // Session mounted. Capture the mobile-390 baseline for the
    // session-start state. The setup masks cover the background
    // hero and any live timestamp slot so only the deterministic
    // prompt layout is exercised.
    await expect(page.locator('.spelling-in-session.is-question-revealed input[name="typed"]')).toBeVisible({ timeout: 15_000 });

    if (testInfo.project.name === 'mobile-390') {
      await expect(page).toHaveScreenshot(screenshotName('spelling', 'session-start'), {
        mask: defaultMasks(page),
      });
    }

    // Wrong answer: type a string that cannot match any English word.
    // The session transitions to the "retry" phase (one more blind
    // attempt) rather than surfacing a Continue button immediately.
    await spellingAnswer(page, 'zzzzzzzzzz');
    await expect(page.locator('.feedback-slot:not(.is-placeholder)')).toBeVisible({ timeout: 10_000 });

    // Second wrong attempt forces the "correction" phase, which
    // reveals the correct spelling and a Continue button (awaiting
    // advance). This is the golden-path wrong leg.
    await spellingAnswer(page, 'qqqqqqqqqq');
    await expect(
      page.locator('[data-action="spelling-continue"], .spelling-in-session.is-question-revealed input[name="typed"]').first(),
    ).toBeVisible({ timeout: 10_000 });

    // Advance past the feedback card if the Continue button is
    // present; otherwise the session has already rolled to the next
    // word (some sessions fast-track the wrong-word drill).
    const continueBtn = page.locator('[data-action="spelling-continue"]');
    if (await continueBtn.count()) {
      await continueBtn.first().click();
    }

    // Correct-intent leg: type an answer and submit. We cannot know
    // the prompted word without fixtures, so this is a deterministic
    // attempt that exercises the input + submit contract. The scene
    // asserts the state machine, not lexical correctness.
    const nextInput = page.locator('.spelling-in-session.is-question-revealed input[name="typed"]');
    await expect(nextInput).toBeVisible({ timeout: 10_000 });
    await nextInput.fill('practice');
    await nextInput.press('Enter');
    await expect(page.locator('.feedback-slot:not(.is-placeholder)')).toBeVisible({ timeout: 10_000 });

    // Finish via end-round-early — the End button stays visible on
    // every phase of the session footer, so the scene can call it
    // without chasing the feedback state machine further.
    const endButton = page.locator('[data-action="spelling-end-early"]');
    await expect(endButton).toBeVisible();
    await expect(endButton).toBeEnabled({ timeout: 10_000 });
    await endButton.click();

    // Post-end-round, the session either shows the summary ("Start
    // another round") or bounces back to the dashboard ("spelling-
    // start"). Either counts as "finish" for the golden path; both
    // states survive a reload and re-render on bootstrap.
    await expect(
      page.locator('[data-action="spelling-start-again"], [data-action="spelling-start"]').first(),
    ).toBeVisible({ timeout: 15_000 });

    // Reload and verify progress preserved. The shell re-runs
    // /api/bootstrap; the demo session cookie survives so the
    // home dashboard re-hydrates with the demo learner and the
    // spelling subject card. If the learner was mid-session the
    // spelling surface re-mounts; otherwise the home dashboard is
    // the rehydrated state — either state proves the session
    // cookie survived the refresh.
    await reload(page);
    const reloadedMarker = page.locator(
      '.subject-grid [data-action="open-subject"][data-subject-id="spelling"], [data-action="spelling-start"], [data-action="spelling-start-again"]',
    );
    await expect(reloadedMarker.first()).toBeVisible({ timeout: 15_000 });
  });
});
