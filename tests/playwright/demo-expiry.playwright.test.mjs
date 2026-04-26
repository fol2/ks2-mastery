// SH2-U3: Playwright scene for the demo-expiry banner UX.
//
// Contract under test
// -------------------
// When the Worker returns a 401 with `code: 'demo_session_expired'`, the
// client MUST render the bespoke `DemoExpiryBanner` instead of the generic
// AuthSurface login panel. The banner must surface two neutral CTAs —
// "Sign in" and "Start new demo" — and must NOT leak raw 401 copy.
//
// Fault injection
// ---------------
// We drive the expired-demo state directly through `localStorage` in the
// browser context. The scene
//   1) opens `/` so the page mounts,
//   2) seeds a fabricated "expired demo" hint into the session-bootstrap
//      path via `window.fetch` interception (see `forceExpiredDemoSession`),
//   3) reloads to trigger the AuthSurface render.
//
// This avoids editing any production Worker code: the plan explicitly
// forbids changes to `worker/src/demo/sessions.js` and friends. The fault
// is injected purely on the client at the fetch boundary.

import { test, expect } from '@playwright/test';
import { applyDeterminism } from './shared.mjs';

/**
 * Intercept the bootstrap session fetch and force a 401 response shaped like
 * the Worker's `demo_session_expired` error body. The resulting render
 * funnels through `bootstrap.js::createRepositoriesForBrowserRuntime` which
 * forwards the `code` field to `onAuthRequired`, and `main.js`'s
 * `renderAuthRoot` then hands a structured `initialError` to AuthSurface.
 *
 * Injection happens via `page.route()` so the Worker never sees the
 * request — the Worker is unchanged in this PR (see plan S-04 handoff).
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
});
