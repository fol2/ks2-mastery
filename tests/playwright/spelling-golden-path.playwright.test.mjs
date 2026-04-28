// U5 (sys-hardening p1): spelling golden path.
//
// Flow: open demo session -> navigate dashboard -> enter spelling ->
// two wrong answers (intentional mis-spellings across the retry +
// correction phases) -> end-round-early -> reload and verify progress
// preserved.
//
// Honesty note: the scene CANNOT actually land a correct answer today.
// The prompted word is seeded per demo learner from a random vocabulary
// pool, and the scene has no way to read it — so typing `'practice'`
// (or anything else) is almost never the right spelling. What the scene
// exercises is the state-machine contract for two wrong attempts
// (retry -> correction) plus the end-round-early path. The previous
// wording ("wrong + correct + end-early") was misleading.
//
// TODO(U9+): add a test-only hook (demo template override or cookie
// flag) that seeds a known word so this scene can exercise the
// correct-answer path. Today: two wrong attempts + end-round-early only.
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
  hasCurrentPlatformScreenshot,
} from './shared.mjs';

test.describe('spelling golden path', () => {
  test.beforeEach(async ({ page }) => {
    await applyDeterminism(page);
  });

  test('demo learner completes a round through two wrong attempts + end-early and reload preserves progress', async ({ page }, testInfo) => {
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
    // session-start state. The screenshot targets the inner `.session`
    // card locator rather than the full page because the outer
    // `.spelling-in-session` container hosts `.spelling-hero-backdrop`
    // (absolute inset:0 hero art picked from a per-learner rotating
    // asset set). Scoping to `.session` pins the deterministic prompt
    // layout — breadcrumb path, info chips, prompt sentence, input,
    // path progress, and footer — while letting the hero art vary
    // freely. Masks still apply to any toasts or celebration overlays
    // that float over the session card mid-capture.
    await expect(page.locator('.spelling-in-session.is-question-revealed input[name="typed"]')).toBeVisible({ timeout: 15_000 });

    const sessionScreenshot = screenshotName('spelling', 'session-start');
    if (testInfo.project.name === 'mobile-390' && hasCurrentPlatformScreenshot(testInfo, sessionScreenshot)) {
      const sessionCard = page.locator('.spelling-in-session .session').first();
      await expect(sessionCard).toBeVisible();
      await expect(sessionCard).toHaveScreenshot(sessionScreenshot, {
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

    // Third attempt leg: type a deterministic string and submit. We
    // cannot know the prompted word without fixtures (the demo learner
    // gets a random word out of the pool), so this is almost certainly
    // another wrong answer. That is fine — the scene exercises the
    // input + submit contract on the next round, not lexical
    // correctness. A test-only correct-answer hook lands in U9+.
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

  // SH2-U2 (R2): reload-on-summary scene. The `sanitiseUiOnRehydrate()`
  // hook on `spellingModule` must strip the persisted `summary` field on
  // bootstrap so that a browser Back / Refresh on the summary screen does
  // NOT re-render the completion state with its "Start another round"
  // CTA. After reload the learner must land on a clean setup-phase
  // surface instead.
  test('SH2-U2: reload on spelling summary lands on clean setup phase, not "Start another round"', async ({ page }) => {
    await createDemoSession(page);
    await expect(page.locator('.subject-grid')).toBeVisible();
    await openSubject(page, 'spelling');

    const start = page.locator('[data-action="spelling-start"]');
    await expect(start).toBeVisible();
    await expect(start).toBeEnabled();
    await start.click();
    await expect(page.locator('.spelling-in-session.is-question-revealed input[name="typed"]')).toBeVisible({ timeout: 15_000 });

    // End the round immediately (1 card → 0 answered) via end-round-early
    // so we land on a summary-equivalent state regardless of the random
    // demo learner's seed word. End-round-early is a deterministic path
    // into the post-round rehydrate scenario.
    const endButton = page.locator('[data-action="spelling-end-early"]');
    await expect(endButton).toBeVisible();
    await expect(endButton).toBeEnabled({ timeout: 10_000 });
    await endButton.click();

    // Wait until the post-round surface renders. Either the explicit
    // summary with "Start another round" CTA OR the dashboard fallback
    // (when the end-early flow collapsed straight to dashboard) is
    // acceptable as the pre-reload state.
    const postRoundMarker = page.locator(
      '[data-action="spelling-start-again"], [data-action="spelling-start"]',
    );
    await expect(postRoundMarker.first()).toBeVisible({ timeout: 15_000 });

    // Reload -- this is the R2 hazard. After reload, the rehydrate
    // sanitiser drops the persisted summary and coerces phase='summary'
    // so the UI CANNOT land on the "Start another round" CTA.
    await reload(page);

    // Post-reload invariant: "Start another round" (the summary's
    // completion-state CTA) must NOT be the visible primary. The
    // learner should either see the home subject grid or the spelling
    // setup scene with the plain "Start" button -- never the summary-
    // phase "Start another round" variant.
    const startAgain = page.locator('[data-action="spelling-start-again"]');

    // At least one of the safe fallback surfaces must be visible.
    const safeMarker = page.locator(
      '.subject-grid [data-action="open-subject"][data-subject-id="spelling"], [data-action="spelling-start"]:not([data-action="spelling-start-again"])',
    ).first();
    await expect(safeMarker).toBeVisible({ timeout: 15_000 });

    // The summary-only "Start another round" CTA must NOT be visible
    // on the rehydrated surface (would indicate the summary survived).
    await expect(startAgain).toHaveCount(0);

    // adv-sh2u2-005 (zombie-phase proof): route resets to dashboard on
    // bootstrap, so the spelling summary surface is naturally gone.
    // Re-open the Spelling card -- this exercises the zombie-phase
    // path. Without the phase coercion, phase='summary' would still be
    // persisted and the summary-phase "Start another round" CTA would
    // appear instead of the plain Start button. With the coercion the
    // surface mounts the dashboard phase instead.
    const onGrid = page.locator('.subject-grid [data-action="open-subject"][data-subject-id="spelling"]');
    if (await onGrid.count()) {
      await onGrid.first().click();
    }
    await expect(page.locator('[data-action="spelling-start"]:not([data-action="spelling-start-again"])')).toBeVisible({ timeout: 15_000 });
    // "Start another round" MUST NOT reappear after re-opening Spelling.
    await expect(startAgain).toHaveCount(0);
  });

  // U12 (sys-hardening p1): polish regression assertions.
  //
  // These two checks lock the baseline-doc items that cannot be caught
  // by a parser-level test. Both run on mobile-390 where the viewport
  // constraint is tightest — a 360 project would be equivalent, but the
  // current playwright config wires mobile-390 + desktop sizes.
  //
  //   1. Mobile overflow: a long learner name + long prompt sentence
  //      must not push the practice-session card beyond the viewport.
  //      `document.documentElement.scrollWidth <= clientWidth` is the
  //      canonical check for "no horizontal scrollbar". A regression
  //      that removes `min-width: 0` / `overflow: hidden` / the toast
  //      ellipsis contract surfaces here before the learner hits it.
  //   2. Toast-during-submit: when a toast is rendered while the input
  //      is focused, the toast's bounding box MUST NOT overlap the
  //      submit button's bounding box. The spelling surface fires
  //      reward toasts mid-session (R11, U11); a CSS regression that
  //      moved the shelf to top-right at the same height as the submit
  //      button row would read as "toast covers submit" exactly as the
  //      baseline doc described.
  test('mobile-390 practice surface does not overflow horizontally, and toasts do not overlap submit button', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390', 'U12 polish overflow + toast-overlap assertion is mobile-390-only');
    await createDemoSession(page);
    await expect(page.locator('.subject-grid')).toBeVisible();
    await openSubject(page, 'spelling');
    const start = page.locator('[data-action="spelling-start"]');
    await expect(start).toBeVisible();
    await expect(start).toBeEnabled();
    await start.click();

    // Wait for the live session input so the surface is actually
    // rendering a prompt card. Avoid racing the is-question-revealed
    // transition.
    await expect(page.locator('.spelling-in-session.is-question-revealed input[name="typed"]')).toBeVisible({ timeout: 15_000 });

    // Overflow check: neither the viewport root nor the practice-card
    // inner container should report a scrollWidth larger than its
    // clientWidth. The viewport check covers the outer chrome; the
    // session-card check covers the inner prompt layout (sentence +
    // input + buttons) where long words historically caused overflow.
    const viewportOverflow = await page.evaluate(() => {
      const root = document.documentElement;
      return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth };
    });
    expect(viewportOverflow.scrollWidth).toBeLessThanOrEqual(viewportOverflow.clientWidth);

    const sessionCardOverflow = await page.evaluate(() => {
      const card = document.querySelector('.spelling-in-session .session');
      if (!card) return null;
      return { scrollWidth: card.scrollWidth, clientWidth: card.clientWidth };
    });
    expect(sessionCardOverflow).not.toBeNull();
    expect(sessionCardOverflow.scrollWidth).toBeLessThanOrEqual(sessionCardOverflow.clientWidth + 1);

    // Toast-during-submit check: inject a synthetic toast shelf into
    // the DOM directly. The store's `toasts` array is internal to the
    // React controller and there is no test-only hook today that lets
    // a scene push a toast without a real reward firing — waiting for
    // a reward is non-deterministic because the demo learner's
    // prompted word is random. The DOM injection mirrors the exact
    // markup that `src/surfaces/shell/ToastShelf.jsx` renders (class
    // names + `data-testid` + `role="status"`), so every CSS rule that
    // applies to the real shelf also applies here. This gives us the
    // geometric contract (toast vs submit overlap) without inventing a
    // production hook.
    await page.evaluate(() => {
      // Remove any pre-existing shelf so the measurement only sees the
      // fixture we control.
      const existing = document.querySelector('[data-testid="toast-shelf"]');
      if (existing) existing.remove();
      const shelf = document.createElement('div');
      shelf.className = 'toast-shelf';
      shelf.setAttribute('role', 'status');
      shelf.setAttribute('aria-live', 'polite');
      shelf.setAttribute('aria-label', 'Notifications');
      shelf.setAttribute('data-testid', 'toast-shelf');
      shelf.innerHTML = `
        <aside class="toast catch" data-toast-id="u12-polish-toast">
          <div class="cm-port" aria-hidden="true"></div>
          <div class="cm-copy">
            <div class="cm-title">Inklet the Many-Syllable Very Long Monster Name for Overflow Testing joined your Codex</div>
            <div class="cm-body">You caught a new friend!</div>
          </div>
          <button class="cm-close" type="button" aria-label="Dismiss notification">×</button>
        </aside>
      `;
      document.body.appendChild(shelf);
    });

    // The DOM-level injection renders immediately; the determinism
    // stylesheet set `visibility: hidden` on `.toast-shelf` — drop
    // that so the geometric measurement reflects the production
    // layout (visibility: hidden does not affect layout but does
    // prevent Playwright's .toBeVisible() from resolving).
    await page.addStyleTag({
      content: `[data-testid="toast-shelf"] { visibility: visible !important; background-image: none !important; }`,
    });
    const toast = page.locator('[data-testid="toast-shelf"] .toast');
    await expect(toast).toBeVisible({ timeout: 5_000 });
    const submit = page.locator('.action-row .btn.primary[type="submit"]').first();
    await expect(submit).toBeVisible();

    const boxes = await page.evaluate(() => {
      const toastEl = document.querySelector('[data-testid="toast-shelf"] .toast');
      const submitEl = document.querySelector('.action-row .btn.primary[type="submit"]');
      if (!toastEl || !submitEl) return null;
      const toastBox = toastEl.getBoundingClientRect();
      const submitBox = submitEl.getBoundingClientRect();
      return {
        toast: { left: toastBox.left, right: toastBox.right, top: toastBox.top, bottom: toastBox.bottom },
        submit: { left: submitBox.left, right: submitBox.right, top: submitBox.top, bottom: submitBox.bottom },
      };
    });
    expect(boxes).not.toBeNull();
    // Overlap = rectangles share a non-empty intersection.
    // Two rects overlap iff (leftA < rightB AND rightA > leftB) AND
    // (topA < bottomB AND bottomA > topB). The inverse (no overlap)
    // is the assertion we need: the two rects share no pixels.
    const overlapsHorizontally = boxes.toast.left < boxes.submit.right && boxes.toast.right > boxes.submit.left;
    const overlapsVertically = boxes.toast.top < boxes.submit.bottom && boxes.toast.bottom > boxes.submit.top;
    expect(overlapsHorizontally && overlapsVertically).toBe(false);
  });
});
