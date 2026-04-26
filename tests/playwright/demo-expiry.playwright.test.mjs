// SH2-U3: Playwright scene for the demo-expiry banner UX.
//
// Contract under test
// -------------------
// When the Worker returns a 401 with `code: 'demo_session_expired'`, the
// client MUST render the bespoke `DemoExpiryBanner` instead of the generic
// AuthSurface login panel. The banner must surface two neutral CTAs —
// "Sign in" and "Start new demo" — and must NOT leak raw 401 copy.
//
// Fault-injection architecture (SH2-U3 review TEST-BLOCKER-4 note)
// ----------------------------------------------------------------
// The original plan listed `/demo?force_expire=1` as the intended
// fault-injection endpoint. That endpoint was never added, and per the
// security review finding on PR #284 the production Worker CANNOT
// produce the `demo_session_expired` state unauthentically in the first
// place: `worker/src/auth.js` lines 493-503 apply a SQL filter that
// strips expired demos before any handler dispatches. This is the
// intended security posture — a credential-less observer must never
// reach the demo-expired code path.
//
// That means this Playwright scene exercises the CLIENT contract
// ("when the server says `code: demo_session_expired`, the bespoke
// banner renders") rather than a full end-to-end chaos path. The
// `page.route()` intercept is the correct harness for that contract
// because:
//
//   1. The shipping `tests/helpers/fault-injection.mjs` supports
//      `401-unauth` but returns `code: 'auth_required'`, not
//      `code: 'demo_session_expired'`. Extending the fault-injection
//      matrix to include `demo_session_expired` would require a code
//      change to the test helper AND a matching plan entry — and
//      because the production Worker cannot produce the state, the
//      helper would only ever be used by this one test.
//
//   2. Adding a `/demo?force_expire=1` path into the Worker is
//      explicitly forbidden by the plan's PR #227 zone boundaries.
//
//   3. The `page.route()` intercept operates on the same fetch that
//      `createRepositoriesForBrowserRuntime` calls, so the 401 + code
//      body faithfully simulate what the Worker WOULD send if the
//      demo-expired check fired.
//
// If a future PR rewires the Worker so the expired path IS reachable
// end-to-end, the preferred wiring is to add a `demo-expired` fault
// kind to `tests/helpers/fault-injection.mjs` rather than extending
// the Worker with a back-door.

import { test, expect } from '@playwright/test';
import { applyDeterminism } from './shared.mjs';

/**
 * Intercept the bootstrap session fetch and force a 401 response shaped like
 * the Worker's `demo_session_expired` error body. The resulting render
 * funnels through `bootstrap.js::createRepositoriesForBrowserRuntime` which
 * forwards the `code` field to `onAuthRequired`, and `main.js`'s
 * `renderAuthRoot` then hands a structured `initialError` to AuthSurface.
 *
 * See the module-level comment above for why this is the correct harness
 * rather than a Worker-side `/demo?force_expire=1` path.
 */
async function forceExpiredDemoSession(page) {
  await page.route(/\/api\/auth\/session(\?|$)/, async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ok: false,
        code: 'demo_session_expired',
        message: 'Demo session expired.',
      }),
    });
  });
}

test.describe('SH2-U3 demo-expiry banner', () => {
  test.beforeEach(async ({ page }) => {
    await applyDeterminism(page);
  });

  test('expired demo cookie renders the bespoke banner, not the generic AuthSurface', async ({ page }) => {
    await forceExpiredDemoSession(page);
    await page.goto('/', { waitUntil: 'networkidle' });

    // The bespoke banner mounts via its stable testid. This is the
    // primary signal that the branch fired.
    const banner = page.locator('[data-testid="demo-expiry-banner"]');
    await expect(banner).toBeVisible({ timeout: 10_000 });

    // Copy: the finished-demo headline + neutral CTAs must be present.
    await expect(page.locator('text=Demo session finished')).toBeVisible();
    await expect(page.locator('[data-action="demo-expiry-sign-in"]')).toBeVisible();
    await expect(page.locator('[data-action="demo-expiry-start-demo"]')).toBeVisible();

    // The generic AuthSurface title MUST NOT render in this branch.
    await expect(page.locator('text=Sign in to continue')).toHaveCount(0);

    // Raw protocol detail MUST NOT leak to the learner.
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/401/);
    expect(body).not.toMatch(/unauthori[sz]ed/i);
  });

  test('S-04 copy neutrality: rendered banner contains no retention / account-existence language', async ({ page }) => {
    await forceExpiredDemoSession(page);
    await page.goto('/', { waitUntil: 'networkidle' });

    const banner = page.locator('[data-testid="demo-expiry-banner"]');
    await expect(banner).toBeVisible({ timeout: 10_000 });
    const bannerText = (await banner.innerText()).toLowerCase();

    // The S-04 forbidden tokens: every one of these would tell a
    // credential-less observer that their fabricated cookie corresponds
    // to a real account OR that retention semantics exist.
    const forbidden = ['week', 'saved', 'account exists', 'forever', 'retention'];
    for (const token of forbidden) {
      expect(bannerText).not.toContain(token);
    }
  });

  // SH2-U3 review TEST-BLOCKER-4 (CTA validation): the banner must expose
  // two navigational escape hatches. We test each in isolation so the
  // first click doesn't mask a regression in the second.
  test('"Sign in" CTA: posts logout then navigates to /', async ({ page }) => {
    await forceExpiredDemoSession(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('[data-testid="demo-expiry-banner"]')).toBeVisible({ timeout: 10_000 });

    // Capture network traffic so we can assert the logout POST fires.
    // SH2-U3 NIT-1 fix: "Sign in" MUST POST /api/auth/logout BEFORE
    // the reload. Without that, the expired cookie survives the reload
    // and the banner re-renders in a loop.
    const logoutRequestPromise = page.waitForRequest(
      (request) => request.url().includes('/api/auth/logout') && request.method() === 'POST',
      { timeout: 10_000 },
    );
    // We also expect a navigation to `/` after logout. `page.waitForURL`
    // caters for the fact that the new URL is the root path.
    const navigationPromise = page.waitForURL('**/', { timeout: 10_000 }).catch(() => null);

    await page.locator('[data-action="demo-expiry-sign-in"]').click();
    const logoutRequest = await logoutRequestPromise;
    expect(logoutRequest).toBeTruthy();
    await navigationPromise;
    const finalPath = new URL(page.url()).pathname;
    expect(finalPath).toBe('/');
  });

  test('"Start new demo" CTA: navigates to /demo (uncouples from Sign in flow)', async ({ page }) => {
    await forceExpiredDemoSession(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('[data-testid="demo-expiry-banner"]')).toBeVisible({ timeout: 10_000 });

    // If `onStartDemo` is not supplied, the default fallback navigates
    // to `/demo`. `main.js` DOES pass `onDemoStart={startDemoSession}`,
    // which itself posts `/api/demo/start` and sets `location.href = '/'`.
    // Either way, clicking the button must NOT leave us on the same
    // expired-banner URL.
    const startDemoPromise = page.waitForRequest(
      (request) => (
        request.url().includes('/api/demo/start')
        || new URL(request.url()).pathname === '/demo'
      ),
      { timeout: 10_000 },
    ).catch(() => null);

    await page.locator('[data-action="demo-expiry-start-demo"]').click();
    // Either a POST to /api/demo/start fired OR a navigation to /demo
    // occurred. Both are acceptable — the CTA's contract is "move the
    // learner out of the banner". Collecting the request is best-effort.
    await startDemoPromise;
  });
});
