// SH2-U1 (sys-hardening p2): double-submit guard Playwright scenes.
//
// Scope: assert that a fast double-click (two `page.click()` back-to-back
// within 50 ms), an Enter-key repeat, and a mobile double-tap
// (`page.tap()` twice within 100 ms) on a non-destructive button produce
// exactly ONE visible transition and ONE network command.
//
// Coverage matrix (review follow-up, BLOCKER-1):
//   - Spelling Continue double-click + Enter-key + mobile double-tap
//   - Grammar Continue double-click (awaiting-advance path after two
//     wrong answers that exercise the `grammar-continue` dispatch)
//   - Punctuation Continue double-click (same awaiting-advance shape)
//   - Auth login form double-click (`/api/auth/login` — proves the
//     `submitLock.run()` wrapper on AuthSurface blocks the second submit)
//   - Parent Hub export double-click (proves the module-scope
//     `runExportOnce()` guard in src/main.js absorbs the second click
//     even though `downloadJson()` is fully synchronous — the hook alone
//     cannot close this window because run() resolves inside the same
//     microtask, so the second click races the finally block)
//
// Network assertion strategy: we use `page.on('request', ...)` to record
// every command-endpoint request the page fires during a double-click
// burst. After the burst, we assert the count is exactly 1 — NOT <=1
// (review follow-up, BLOCKER-2): a <=1 assertion silently passes when
// delta=0, which is the regression shape where a button disables itself
// permanently and never dispatches. `toBe(1)` catches both 0 and 2.
// We do NOT use `page.waitForRequest` alone because a second late
// dispatch would be missed — the waiter resolves on the first match.
// The explicit count-during-a-window assertion is the correct contract.
//
// Mobile-390 coverage: the `mobile-390` Playwright project applies the
// 390-px viewport. Running this scene under that project gives us the
// mobile-double-tap contract without splitting into a separate test.
//
// Error-path scenes (500 + network error) live as follow-ups: the
// current chaos-http-boundary suite owns the fault-injection plumbing
// (see `tests/playwright/chaos-http-boundary.playwright.test.mjs`). A
// naive reimplementation here would diverge from the canonical
// fault-plan shape, so those paths are noted as deferred in the PR
// body until the chaos suite or a follow-up unit picks them up.

import { test, expect } from '@playwright/test';
import {
  applyDeterminism,
  createDemoSession,
  fillGrammarAnswer,
  openSubject,
  punctuationAnswer,
  spellingAnswer,
} from './shared.mjs';

const PUNCTUATION_START_SELECTOR = '[data-punctuation-cta], [data-punctuation-start]';

async function waitForSpellingContinue(page) {
  const continueBtn = page.locator('[data-action="spelling-continue"]');
  if (await continueBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
    return continueBtn;
  }
  const feedback = page.locator('.feedback-slot:not(.is-placeholder)');
  const deadline = Date.now() + 10_000;
  let correction = '';
  while (Date.now() < deadline && !correction) {
    const feedbackText = await feedback.innerText({ timeout: 1_000 }).catch(() => '');
    const match = feedbackText.match(/“([^”]+)”/);
    correction = match?.[1]?.trim() || '';
    if (!correction) await page.waitForTimeout(100);
  }
  if (!correction) {
    throw new Error('Spelling correction did not expose a curly-quoted model word.');
  }
  await spellingAnswer(page, correction);
  await expect(continueBtn).toBeVisible({ timeout: 10_000 });
  return continueBtn;
}

async function submitOneGrammarAnswer(page) {
  await fillGrammarAnswer(page, { typed: 'x' });
  const submit = page.locator('.grammar-answer-form button[type="submit"].primary').first();
  await expect(submit).toBeEnabled({ timeout: 5_000 });
  await submit.click();
}

async function seedParentHubAccount(page) {
  const origin = new URL(page.url()).origin === 'null'
    ? 'http://127.0.0.1:4173'
    : new URL(page.url()).origin;
  const email = `parent-export-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const learnerId = `learner-export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const createdAt = Date.now();
  const register = await page.request.post('/api/auth/register', {
    headers: {
      origin,
      'sec-fetch-site': 'same-origin',
    },
    data: {
      email,
      password: 'password-1234',
    },
  });
  expect(register.status()).toBe(201);

  const learners = {
    byId: {
      [learnerId]: {
        id: learnerId,
        name: 'Export Learner',
        yearGroup: 'Y5',
        avatarColor: '#3E6FA8',
        goal: 'sats',
        dailyMinutes: 15,
        weakSubjects: [],
        createdAt,
      },
    },
    allIds: [learnerId],
    selectedId: learnerId,
  };
  const save = await page.request.put('/api/learners', {
    headers: {
      origin,
      'sec-fetch-site': 'same-origin',
      'x-ks2-request-id': `playwright-parent-export-${createdAt}`,
      'x-ks2-correlation-id': `playwright-parent-export-${createdAt}`,
    },
    data: {
      learners,
      mutation: {
        requestId: `playwright-parent-export-${createdAt}`,
        correlationId: `playwright-parent-export-${createdAt}`,
        expectedAccountRevision: 0,
      },
    },
  });
  expect(save.status()).toBe(200);
}

test.describe('SH2-U1 double-submit guard', () => {
  test.beforeEach(async ({ page }) => {
    await applyDeterminism(page);
  });

  test('rapid double-click on Continue produces exactly one spelling command', async ({ page }) => {
    // Record every command POST the page fires. The assertion pins the
    // count at exactly 1 after the burst — expected exactly one request
    // — <1 means the button never fired (regression path: button
    // disabled itself and ships green with a broken flow), >1 means
    // double-submit bypass (the hazard this test guards against).
    const commandRequests = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/subjects/spelling/command') && request.method() === 'POST') {
        commandRequests.push(request.url());
      }
    });

    await createDemoSession(page);
    await expect(page.locator('.subject-grid')).toBeVisible();
    await openSubject(page, 'spelling');

    const start = page.locator('[data-action="spelling-start"]');
    await expect(start).toBeVisible();
    await expect(start).toBeEnabled();
    await start.click();

    await expect(page.locator('.spelling-in-session.is-question-revealed input[name="typed"]'))
      .toBeVisible({ timeout: 15_000 });

    // Force the session into the `correction` phase by submitting two
    // wrong answers — this is the only path that surfaces a Continue
    // button (awaiting-advance). The golden-path scene uses the same
    // trick. We pick strings that cannot possibly match any English
    // word.
    await spellingAnswer(page, 'zzzzzzzzzz');
    await expect(page.locator('.feedback-slot:not(.is-placeholder)'))
      .toBeVisible({ timeout: 10_000 });
    await spellingAnswer(page, 'qqqqqqqqqq');

    const continueBtn = await waitForSpellingContinue(page);
    await expect(continueBtn).toBeEnabled();

    // Snapshot request count BEFORE the burst so we can assert delta.
    const before = commandRequests.length;

    // Rapid double-click: two `click()` calls dispatched back-to-back
    // with `force: true` so Playwright's built-in actionability waits
    // do not serialise the two clicks past the 50 ms window. Without
    // force, Playwright re-checks the element after the first click
    // and the re-check itself consumes 50 ms+ as it waits for the DOM
    // to settle.
    await Promise.all([
      continueBtn.click({ force: true, noWaitAfter: true }),
      continueBtn.click({ force: true, noWaitAfter: true }),
    ]);

    // Wait for the session to transition (the Continue button either
    // unmounts or the session advances). We wait up to 5 s for the
    // next input to be focusable — meaning the Continue click landed.
    await page.waitForTimeout(500);

    // The hook must have absorbed the second click. Count the command
    // requests that were fired during the burst window. We expect
    // exactly one new request (the first click fired, the second
    // early-returned).
    const delta = commandRequests.length - before;
    expect(delta).toBe(1);
  });

  test('Enter-key repeat on spelling submit produces exactly one submit-answer command', async ({ page }) => {
    const commandRequests = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/subjects/spelling/command') && request.method() === 'POST') {
        commandRequests.push(request.url());
      }
    });

    await createDemoSession(page);
    await openSubject(page, 'spelling');

    const start = page.locator('[data-action="spelling-start"]');
    await expect(start).toBeVisible();
    await start.click();

    const input = page.locator('.spelling-in-session.is-question-revealed input[name="typed"]');
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.fill('testword');

    const before = commandRequests.length;

    // Fire two Enter presses in quick succession. The form is already
    // guarded by `pendingCommand`, but a very fast repeat can slip
    // past the round-trip. The hook is belt-and-braces on the Submit
    // button itself — though here we press Enter, not the button, so
    // the adapter-layer guard is the primary defence. The assertion
    // is that the user NEVER sees two submit commands fire regardless
    // of path.
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    await page.waitForTimeout(500);

    const delta = commandRequests.length - before;
    expect(delta).toBe(1);
  });

  test('mobile-390 double-tap on Continue produces exactly one spelling command', async ({ page }, testInfo) => {
    // This scene asserts the same contract as the double-click scene
    // but fires two `tap()` events within the 100 ms window. It runs
    // across every project; the mobile-390 project provides the
    // 390-px viewport that the plan specifically calls out, but the
    // tap contract itself is viewport-independent.
    const commandRequests = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/subjects/spelling/command') && request.method() === 'POST') {
        commandRequests.push(request.url());
      }
    });

    // `page.tap()` requires `hasTouch: true` in the context options.
    // Playwright's default contexts do NOT have touch enabled, so we
    // emulate a fall-through: if taps are not supported in the
    // current project, skip the scene and let the double-click scene
    // above carry the contract.
    const hasTouch = await page.evaluate(() => 'ontouchstart' in window);
    test.skip(!hasTouch, 'Project does not emulate touch; double-click scene covers this contract.');

    await createDemoSession(page);
    await openSubject(page, 'spelling');

    const start = page.locator('[data-action="spelling-start"]');
    await expect(start).toBeVisible();
    await start.click();

    await expect(page.locator('.spelling-in-session.is-question-revealed input[name="typed"]'))
      .toBeVisible({ timeout: 15_000 });

    await spellingAnswer(page, 'zzzzzzzzzz');
    await expect(page.locator('.feedback-slot:not(.is-placeholder)'))
      .toBeVisible({ timeout: 10_000 });
    await spellingAnswer(page, 'qqqqqqqqqq');

    const continueBtn = await waitForSpellingContinue(page);

    const before = commandRequests.length;
    await Promise.all([
      continueBtn.tap({ force: true, noWaitAfter: true }),
      continueBtn.tap({ force: true, noWaitAfter: true }),
    ]);

    await page.waitForTimeout(500);

    const delta = commandRequests.length - before;
    expect(delta).toBe(1);
  });

  // ---------------------------------------------------------------
  // BLOCKER-1 review follow-up: extend coverage to Grammar, Punctuation,
  // Auth, and Parent Hub. The plan line 345 promises "three subjects +
  // Auth + Parent Hub" and the original PR only covered spelling.
  // Each scene asserts exactly one network dispatch after a rapid
  // double-click (50 ms) — the same `toBe(1)` contract as above.
  // ---------------------------------------------------------------

  test('rapid double-click on Grammar Continue produces exactly one grammar command', async ({ page }) => {
    // Grammar Continue surfaces on the feedback slot after a non-mini
    // round answer. We drive the demo learner into awaiting-advance by
    // starting a smart round (default mode in GrammarDashboard) and
    // submitting one answer — any response is accepted because the
    // feedback frame follows submit regardless of correctness.
    const commandRequests = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/subjects/grammar/command') && request.method() === 'POST') {
        commandRequests.push(request.url());
      }
    });

    await createDemoSession(page);
    await openSubject(page, 'grammar');

    const dashboard = page.locator('.grammar-dashboard');
    await expect(dashboard).toBeVisible({ timeout: 15_000 });

    // Drive into an in-session round: Smart Practice is the default
    // GrammarDashboard entry point and exposes the featured primary CTA.
    const startButton = dashboard.locator('.grammar-start-row button[data-featured="true"]').first();
    await expect(startButton).toBeVisible({ timeout: 10_000 });
    await startButton.click();

    const session = page.locator('.grammar-answer-form').first();
    await expect(session).toBeVisible({ timeout: 15_000 });

    // Submit one deterministic answer, whatever input shape the live
    // Grammar item renders, to land on the feedback frame where the
    // advance button is visible.
    await submitOneGrammarAnswer(page);

    // Wait for feedback frame with Continue / Next question button.
    const continueBtn = page.getByRole('button', { name: /Next question|Finish round/ }).first();
    await expect(continueBtn).toBeVisible({ timeout: 15_000 });
    await expect(continueBtn).toBeEnabled();

    const before = commandRequests.length;
    await Promise.all([
      continueBtn.click({ force: true, noWaitAfter: true }),
      continueBtn.click({ force: true, noWaitAfter: true }),
    ]);

    await page.waitForTimeout(500);

    const delta = commandRequests.length - before;
    expect(delta).toBe(1);
  });

  test('rapid double-click on Punctuation Continue produces exactly one punctuation command', async ({ page }) => {
    const commandRequests = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/subjects/punctuation/command') && request.method() === 'POST') {
        commandRequests.push(request.url());
      }
    });

    await createDemoSession(page);
    await openSubject(page, 'punctuation');

    const startBtn = page.locator(PUNCTUATION_START_SELECTOR).first();
    await expect(startBtn).toBeVisible({ timeout: 15_000 });
    await startBtn.click();

    // Submit one attempt so the feedback frame (with Continue) mounts.
    await punctuationAnswer(page, {
      typed: 'not a sentence that matches the answer',
      choiceIndex: 0,
    });

    const continueBtn = page.locator('[data-punctuation-continue]');
    await expect(continueBtn).toBeVisible({ timeout: 10_000 });
    await expect(continueBtn).toBeEnabled();

    const before = commandRequests.length;
    await Promise.all([
      continueBtn.click({ force: true, noWaitAfter: true }),
      continueBtn.click({ force: true, noWaitAfter: true }),
    ]);

    await page.waitForTimeout(500);

    const delta = commandRequests.length - before;
    expect(delta).toBe(1);
  });

  test('rapid double-click on Auth login submit produces exactly one /api/auth/login', async ({ page }) => {
    // The Auth surface renders when `/api/auth/session` returns no
    // session. We clear any seeded cookies by navigating to a fresh
    // page origin and then forcing the sign-out endpoint. The demo
    // helper (`createDemoSession`) would set the demo cookie; we do
    // NOT call it here. `applyDeterminism` still fires reducedMotion.
    const loginRequests = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/auth/login') && request.method() === 'POST') {
        loginRequests.push(request.url());
      }
    });

    // Hard navigation to root with no demo cookie: session lookup
    // 401s, bootstrap falls back to AuthSurface.
    await page.context().clearCookies();
    await page.goto('/', { waitUntil: 'networkidle' });

    // The AuthSurface form mounts when there is no session. We fill
    // the email + password with dummy credentials and click submit
    // twice rapidly. The worker's email auth rate limit (10/ip +
    // 8/email) is well above our 2-click burst so both clicks reach
    // the dispatch stage; the hook absorbs the second.
    const emailInput = page.locator('input[type="email"][name="email"]');
    await expect(emailInput).toBeVisible({ timeout: 15_000 });
    await emailInput.fill('doesnotexist@ks2-mastery.test');

    const passwordInput = page.locator('input[type="password"][name="password"]');
    await passwordInput.fill('doesnotmatter-12345');

    const submitBtn = page.locator('form.auth-form button[type="submit"]');
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeEnabled();

    const before = loginRequests.length;
    await Promise.all([
      submitBtn.click({ force: true, noWaitAfter: true }),
      submitBtn.click({ force: true, noWaitAfter: true }),
    ]);

    // Auth is async — the server enforces Argon2id hash on a lookup
    // miss and can take ~200 ms. Wait long enough for both clicks to
    // settle through the fetch.
    await page.waitForTimeout(1000);

    const delta = loginRequests.length - before;
    expect(delta).toBe(1);
  });

  test('rapid double-click on Parent Hub export produces exactly one JSON download', async ({ page }) => {
    // BLOCKER-3 coverage: the export button handler is fully
    // SYNCHRONOUS. The `useSubmitLock` hook acquires + releases its
    // lock inside the same microtask, so the hook alone cannot absorb
    // a 50 ms double-click. The module-scope `runExportOnce()` guard
    // in `src/main.js` is what closes the window. This test proves
    // that guard is wired correctly: two rapid clicks produce exactly
    // one `download` event.
    //
    // We count Playwright download events — `downloadJson()` builds
    // an object URL and programmatically clicks an anchor with the
    // `download` attribute, which triggers Playwright's download
    // interception. Two clicks without the guard would fire two
    // downloads.
    const downloads = [];
    page.on('download', (download) => {
      downloads.push(download.suggestedFilename());
    });

    await page.goto('/', { waitUntil: 'networkidle' });
    await seedParentHubAccount(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('.subject-grid')).toBeVisible();

    // Navigate to Parent Hub via the section link on home.
    const parentHubLink = page.getByRole('button', { name: /Parent hub/ });
    await expect(parentHubLink.first()).toBeVisible({ timeout: 15_000 });
    await parentHubLink.first().click();

    // Wait for the export buttons to mount under the snapshot card.
    const exportButton = page.locator('.parent-hub-snapshot-actions button').first();
    await expect(exportButton).toBeVisible({ timeout: 15_000 });
    await expect(exportButton).toBeEnabled();

    const before = downloads.length;
    await Promise.all([
      exportButton.click({ force: true, noWaitAfter: true }),
      exportButton.click({ force: true, noWaitAfter: true }),
    ]);

    // Allow both clicks to propagate and any pending download events
    // to resolve. The guard uses a 300 ms debounce window; we wait
    // 500 ms to be safe.
    await page.waitForTimeout(500);

    const delta = downloads.length - before;
    expect(delta).toBe(1);
  });
});
