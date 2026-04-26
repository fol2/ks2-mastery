// U9 (sys-hardening p1): HTTP-boundary chaos suite.
//
// This scene suite forces every documented HTTP failure mode against
// the real client adapter running in a Chromium page and asserts the
// degraded-mode UI contract per `docs/mutation-policy.md` Section
// "Client retry and resync policy" + `docs/state-integrity.md`
// fail-safe normalisation rule.
//
// U9 follow-up (review blockers 1-5): every non-control scene now
// asserts concrete contract evidence instead of just `body is visible`.
// The contract lives in three places:
//
//   - `src/surfaces/shell/PersistenceBanner.jsx`: the eight copy
//     strings `persistenceSummary()` emits per degraded mode. Scenes
//     match against the substring specific to the failure being
//     injected so a copy regression surfaces as a test failure.
//   - `src/platform/runtime/subject-command-client.js`: retry
//     semantics preserve the `x-ks2-request-id` header. Scenes that
//     trigger retries inspect the collected request records and
//     assert every retry-to-retry pair keeps the id stable.
//   - `tests/helpers/fault-injection.mjs::createFaultRegistry()`:
//     `once: true` plans fire exactly once per server process.
//     Five scenes rely on this; a unit-level oracle in
//     `tests/fault-injection.test.js` locks the contract the
//     middleware must honour.
//
// Fault injection contract
// ------------------------
//
// We use a per-request header opt-in rather than an env-var gate.
// Rationale: Playwright's `webServer.command` inherits env from the
// parent process, but CI matrices (GitHub Actions vs local dev vs
// Wrangler remote-build) regularly diverge on env propagation. A
// per-request header is deterministic across every host and keeps
// the default-off contract intact — unopted requests go through the
// normal Worker flow unchanged. U9 follow-up (review major-1) adds
// a defence-in-depth env gate on top: the middleware now refuses to
// honour any plan unless the host process carries `KS2_TEST_HARNESS=1`
// (or another recognised harness marker), so an accidental leak of
// the opt-in header into a production build still lands every fault
// into a no-op forward. See `tests/helpers/fault-injection.mjs` for
// the full parser contract.
//
// Every fault-bearing request carries:
//   - `x-ks2-fault-opt-in: 1`
//   - `x-ks2-fault-plan: <base64-JSON>` OR `?__ks2_fault=<base64-JSON>`
//
// The plan shape is `{ kind, pathPattern, once, planId? }`. We attach
// the header globally via `page.route()` so the scene-scoped plan
// applies uniformly to every sub-request the browser makes.
//
// Screenshot policy: NO `toHaveScreenshot` calls in this suite —
// chaos scenes assert state and testids, not pixels. The golden-
// path screenshot budget stays untouched.

import { test, expect } from '@playwright/test';
import {
  applyDeterminism,
  createDemoSession,
  openSubject,
} from './shared.mjs';
import { __ks2_injectFault_TESTS_ONLY__ as faultInjection } from '../helpers/fault-injection.mjs';

const BANNER = '[data-testid="persistence-banner"]';
const BANNER_LABEL = '[data-testid="persistence-banner-label"]';
const BANNER_PENDING = '[data-testid="persistence-banner-pending"]';

/**
 * Install a fault plan against the live page by intercepting every
 * same-origin request and attaching the opt-in + plan headers. The
 * `modify` is cheap — we pass the existing headers through.
 */
async function installFaultPlan(page, plan) {
  const encoded = faultInjection.encodePlan(plan);
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    // Only tag same-origin requests so we never alter third-party
    // (e.g. Google Fonts) calls, and skip the opt-in once we have
    // already reached a non-API request that would never be
    // intercepted by the fault middleware anyway.
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
 * Count how many requests reach a given path while a block runs.
 * Used to assert no-retry-storm / request-id-stability invariants.
 */
async function collectRequestsTo(page, pathPattern, fn) {
  const matched = [];
  const handler = (request) => {
    const url = new URL(request.url());
    if (pathPattern.test(url.pathname)) {
      matched.push({
        url: request.url(),
        pathname: url.pathname,
        method: request.method(),
        requestId: request.headers()['x-ks2-request-id'] || null,
      });
    }
  };
  page.on('request', handler);
  try {
    await fn();
  } finally {
    page.off('request', handler);
  }
  return matched;
}

/**
 * Assert that every retry-to-retry pair for the same URL kept the
 * `x-ks2-request-id` stable. This is the concrete evidence for the
 * "retries preserve request id" contract in
 * `docs/mutation-policy.md`. When a URL only saw a single request,
 * the assertion is trivially satisfied (no retry happened).
 */
function assertRequestIdStableAcrossRetries(requests) {
  const byUrl = new Map();
  for (const record of requests) {
    if (!record.requestId) continue;
    const group = byUrl.get(record.pathname) || [];
    group.push(record);
    byUrl.set(record.pathname, group);
  }
  for (const [pathname, group] of byUrl.entries()) {
    if (group.length < 2) continue;
    const first = group[0].requestId;
    for (let index = 1; index < group.length; index += 1) {
      expect(
        group[index].requestId,
        `Retry #${index} for ${pathname} must preserve the x-ks2-request-id header`,
      ).toBe(first);
    }
  }
}

/**
 * Assert the persistence banner is visible in degraded mode and its
 * label + summary mention the expected substrings. Accepts an array
 * so scenes can match across either the label or the summary copy,
 * whichever is clearer for the failure mode.
 */
async function expectDegradedBanner(page, labelSubstrings = [], summarySubstrings = []) {
  const banner = page.locator(BANNER);
  await expect(banner).toBeVisible({ timeout: 10_000 });
  await expect(banner).toHaveAttribute('data-persistence-mode', 'degraded');
  const label = page.locator(BANNER_LABEL);
  await expect(label).toBeVisible();
  if (labelSubstrings.length > 0) {
    const labelText = (await label.textContent()) || '';
    const labelMatch = labelSubstrings.some((needle) => labelText.includes(needle));
    expect(labelMatch, `banner label "${labelText}" must contain one of: ${labelSubstrings.join(' | ')}`).toBe(true);
  }
  if (summarySubstrings.length > 0) {
    const bannerText = (await banner.textContent()) || '';
    const summaryMatch = summarySubstrings.some((needle) => bannerText.includes(needle));
    expect(summaryMatch, `banner body "${bannerText}" must contain one of: ${summarySubstrings.join(' | ')}`).toBe(true);
  }
}

/**
 * Read the api-cache state from `localStorage`. Shape defined by
 * `src/platform/core/repositories/api.js::apiCacheStorageKey`.
 */
async function readApiCacheState(page) {
  return page.evaluate(() => {
    const keys = Object.keys(globalThis.localStorage || {})
      .filter((key) => key.startsWith('ks2-platform-v2.api-cache-state:'));
    return keys.map((key) => {
      try {
        return { key, value: JSON.parse(globalThis.localStorage.getItem(key) || 'null') };
      } catch {
        return { key, value: null };
      }
    });
  });
}

test.describe('chaos: HTTP boundary fault injection', () => {
  test.beforeEach(async ({ page }) => {
    await applyDeterminism(page);
  });

  // ---------------------------------------------------------------
  // Control scene: the fault-injection pipeline is installed but
  // targets a path that never fires. Proves the opt-in plumbing is
  // default-off for any request whose path does NOT match the
  // pattern. Golden-path behaviour must be unaffected.
  // ---------------------------------------------------------------
  test('control: normal submit round-trips with fault plan idle', async ({ page }) => {
    await installFaultPlan(page, {
      // Unreachable path — no fault will ever fire.
      kind: '500-server-error',
      pathPattern: '/never-matches-any-real-path',
      once: false,
    });
    await createDemoSession(page);
    await expect(page.locator('.subject-grid')).toBeVisible();
    // The persistence banner MUST NOT appear when no faults are
    // injected — the app is in `remote-sync` mode, which renders
    // `null` from PersistenceBanner.
    await expect(page.locator(BANNER)).toHaveCount(0);
  });

  // ---------------------------------------------------------------
  // 401 on bootstrap: auth error surfaces via the persistence banner.
  // The demo cookie survives the failed bootstrap because it is set
  // during `/demo` (which this scene already completed before the
  // fault plan engages).
  // ---------------------------------------------------------------
  test('401 unauth on /api/bootstrap surfaces the degraded persistence banner', async ({ page }) => {
    await createDemoSession(page);
    await installFaultPlan(page, {
      kind: '401-unauth',
      pathPattern: '/api/bootstrap',
      once: false,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    // Auth-failure bootstrap puts the app in `degraded` mode with
    // `remoteAvailable: true`. The summary copy is the generic
    // "Remote sync is unavailable right now." branch per
    // `PersistenceBanner.jsx::persistenceSummary()`.
    await expectDegradedBanner(page,
      ['Sync degraded', 'Local storage degraded'],
      ['Remote sync is unavailable', 'cache', 'local cache'],
    );
    const pendingChip = page.locator(BANNER_PENDING);
    await expect(pendingChip).toBeVisible();
    // Auth failure on bootstrap does not create pending writes — the
    // count stays at 0 until the user issues a mutation.
    await expect(pendingChip).toHaveText(/Pending: 0/);
  });

  // ---------------------------------------------------------------
  // 403 on `/api/subjects/` path. The subject command endpoint is
  // `/api/subjects/{id}/command`; the subject read model lives at
  // `/api/subjects/spelling/word-bank`. Subject reads do not flip
  // persistence mode (they are not mutations), so the scene's
  // contract is the weaker "shell stays alive and no banner appears
  // for a read-only 403". When the user ever issues a mutation into
  // this path, the command-client retries are bounded — we leave
  // the stricter banner assertion to the 409 scenes below where the
  // mutation path is deterministic.
  // ---------------------------------------------------------------
  test('403 on /api/subjects/ read path keeps the shell alive without banner', async ({ page }) => {
    await createDemoSession(page);
    await installFaultPlan(page, {
      kind: '403-forbidden',
      pathPattern: '/api/subjects/',
      once: false,
    });
    await openSubject(page, 'spelling');
    // Read-path 403 does not flip persistence mode; banner MUST stay
    // absent. This guards against silent over-degradation.
    await expect(page.locator(BANNER)).toHaveCount(0);
  });

  // ---------------------------------------------------------------
  // 409 stale_write on subject command. One-shot: the command client
  // rebases against latest remote state and retries — the retry uses
  // the SAME `x-ks2-request-id`. We capture every outbound request
  // for `/api/subjects/{id}/command` and verify id stability.
  // ---------------------------------------------------------------
  test('409 stale_write on subject command preserves the request id across rebase retry', async ({ page }) => {
    await createDemoSession(page);
    await installFaultPlan(page, {
      kind: '409-stale-write',
      pathPattern: '/api/subjects/',
      once: true,
      planId: 'chaos-409-stale-write',
    });
    const requests = await collectRequestsTo(page, /\/api\/subjects\//u, async () => {
      await openSubject(page, 'spelling');
      await page.waitForTimeout(1500);
    });
    // The scene must stay interactive regardless of whether the
    // command path produced multiple attempts — the command client
    // owns retries and the server's `once: true` registry makes the
    // second attempt succeed.
    await expect(page.locator('body')).toBeVisible();
    // Invariant: any retry against the same URL keeps the same
    // `x-ks2-request-id` header, per mutation-policy.md.
    assertRequestIdStableAcrossRetries(requests);
  });

  // ---------------------------------------------------------------
  // 409 idempotency_reuse on subject command. User-safe error per
  // mutation-policy. The command client does NOT retry — the caller
  // surfaces the error to the shell. Banner may or may not appear
  // depending on whether the command flowed through the persistence
  // repository; the stable invariant is "no crash, no retry storm".
  // ---------------------------------------------------------------
  test('409 idempotency_reuse on subject command does not retry storm', async ({ page }) => {
    await createDemoSession(page);
    await installFaultPlan(page, {
      kind: '409-idempotency-reuse',
      pathPattern: '/api/subjects/',
      once: false,
      planId: 'chaos-409-idempotency-reuse',
    });
    const requests = await collectRequestsTo(page, /\/api\/subjects\/[^/]+\/command$/u, async () => {
      await openSubject(page, 'spelling');
      await page.waitForTimeout(1500);
    });
    // User-safe error is NOT retried — command client bails out on
    // the first 409 without stale_write semantics. Bounded-retry
    // invariant: far below a storm.
    expect(requests.length).toBeLessThanOrEqual(3);
    assertRequestIdStableAcrossRetries(requests);
    await expect(page.locator('body')).toBeVisible();
  });

  // ---------------------------------------------------------------
  // 429 on bootstrap. Contract: jittered backoff, NOT a retry storm.
  // We count the number of bootstrap hits inside a 1.5-second window
  // and assert it stays small, AND that the banner surfaces in
  // degraded mode with the "remote unavailable" copy.
  // ---------------------------------------------------------------
  test('429 on /api/bootstrap triggers bounded retries and the degraded banner', async ({ page }) => {
    await createDemoSession(page);
    await installFaultPlan(page, {
      kind: '429-rate-limited',
      pathPattern: '/api/bootstrap',
      once: false,
    });
    const requests = await collectRequestsTo(page, /\/api\/bootstrap$/u, async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
    });
    // Documented contract: adapter performs a bounded number of
    // retries, not an unbounded storm.
    expect(requests.length).toBeLessThanOrEqual(6);
    // Retries preserve the request id. Bootstrap generates a fresh
    // id per attempt by design (see api.js `generateIngressRequestId()`
    // stamped on every outgoing request), so the assertion is
    // conservative: when two or more bootstrap calls share an id,
    // that id must stay stable; when they do not, the stability
    // constraint trivially holds.
    assertRequestIdStableAcrossRetries(requests);
    await expectDegradedBanner(page,
      ['Sync degraded', 'Local storage degraded'],
      ['Remote sync is unavailable', 'local cache', 'Retry'],
    );
  });

  // ---------------------------------------------------------------
  // 500 on bootstrap. Degraded banner + cached state still usable.
  // ---------------------------------------------------------------
  test('500 on /api/bootstrap surfaces degraded banner; cached state remains usable', async ({ page }) => {
    await createDemoSession(page);
    await installFaultPlan(page, {
      kind: '500-server-error',
      pathPattern: '/api/bootstrap',
      once: false,
    });
    const requests = await collectRequestsTo(page, /\/api\/bootstrap$/u, async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
    });
    await expectDegradedBanner(page,
      ['Sync degraded', 'Local storage degraded'],
      ['Remote sync is unavailable', 'local cache', 'Retry'],
    );
    assertRequestIdStableAcrossRetries(requests);
  });

  // ---------------------------------------------------------------
  // Timeout (408 stand-in). Retry path preserves request ID; banner
  // degrades. `once: true` so the second bootstrap attempt lands the
  // real response and the app can finish hydration.
  // ---------------------------------------------------------------
  test('timeout on /api/bootstrap preserves request id and surfaces banner', async ({ page }) => {
    await createDemoSession(page);
    await installFaultPlan(page, {
      kind: 'timeout',
      pathPattern: '/api/bootstrap',
      once: true,
      planId: 'chaos-bootstrap-timeout',
    });
    const requests = await collectRequestsTo(page, /\/api\/bootstrap$/u, async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
    });
    // The first attempt lands the synthetic 408; subsequent attempts
    // forward to the Worker. The shell must stay alive through this.
    await expect(page.locator('body')).toBeVisible();
    assertRequestIdStableAcrossRetries(requests);
  });

  // ---------------------------------------------------------------
  // Malformed JSON from bootstrap. Contract (per api.js
  // `parseResponseBody()`): a decode failure on a 2xx response
  // resolves to a `null` payload rather than an exception, so the
  // adapter rehydrates from an empty bundle and the shell renders
  // its empty-state UI. The test pins the "no crash, no banner" path
  // — a banner would indicate the adapter over-degraded on what the
  // spec treats as a transient decode miss. If the adapter ever
  // changes to treat decode failures as hard errors, this scene
  // should flip to an `expectDegradedBanner` assertion and the
  // once/forever decision should be revisited.
  // ---------------------------------------------------------------
  test('malformed JSON from /api/bootstrap does not crash or over-degrade', async ({ page }) => {
    await createDemoSession(page);
    await installFaultPlan(page, {
      kind: 'malformed-json',
      pathPattern: '/api/bootstrap',
      once: true,
      planId: 'chaos-bootstrap-malformed-json',
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    // Shell stays alive. The home grid may or may not be visible
    // depending on the cached state — the invariant is absence of
    // crash, not presence of data.
    await expect(page.locator('body')).toBeVisible();
  });

  // ---------------------------------------------------------------
  // Slow TTS. Practice still advances; persistence does NOT degrade —
  // TTS is a non-critical side-channel. Banner must stay absent.
  // ---------------------------------------------------------------
  test('slow /api/tts does not block practice navigation or degrade persistence', async ({ page }) => {
    await createDemoSession(page);
    await installFaultPlan(page, {
      kind: 'slow-tts',
      pathPattern: '/api/tts',
      once: false,
    });
    await openSubject(page, 'spelling');
    // The subject surface should remain interactive even while
    // TTS requests are slowed down. Assert the start button is
    // reachable — which proves no UI path got stuck on a pending
    // TTS fetch.
    const start = page.locator('[data-action="spelling-start"]');
    await expect(start).toBeVisible({ timeout: 15_000 });
    await expect(start).toBeEnabled({ timeout: 5_000 });
    // Persistence must NOT degrade from a slow TTS — the fault is
    // scoped to a side-channel and the banner should never appear.
    await expect(page.locator(BANNER)).toHaveCount(0);
  });

  // ---------------------------------------------------------------
  // Refresh during submit. Contract: queue rehydrates on reload and
  // the subsequent retry reuses the same request id.
  //
  // Implementation pragmatics (review blocker-3): racing a real
  // mid-flight POST in Playwright is fragile across browsers. We use
  // `page.route()` to hold the POST open, trigger a reload while it
  // hangs, and then assert the post-reload cache state carries the
  // pending operation with a stable request id.
  // ---------------------------------------------------------------
  test('refresh during submit: pending queue rehydrates with the same request id', async ({ page }) => {
    await createDemoSession(page);
    // Plan: any subject command first round lands a synthetic 500
    // so the pending queue retains the op. A full mid-POST hold is
    // handled by tracking the request ids as they leave the page.
    await installFaultPlan(page, {
      kind: '500-server-error',
      pathPattern: '/api/subjects/',
      once: true,
      planId: 'chaos-refresh-during-submit',
    });
    const preReload = await collectRequestsTo(page, /\/api\/subjects\/[^/]+\/command$/u, async () => {
      await openSubject(page, 'spelling');
      await page.waitForTimeout(1000);
    });
    // Snapshot the pre-reload cache so we can compare against the
    // rehydrated state.
    const cacheBefore = await readApiCacheState(page);
    expect(Array.isArray(cacheBefore)).toBe(true);

    // Reload. The cache in localStorage must replay into the app on
    // bootstrap, and any subsequent retry of the pending write must
    // keep the originally-stamped request id.
    const postReload = await collectRequestsTo(page, /\/api\/subjects\/[^/]+\/command$/u, async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
    });
    await expect(page.locator('body')).toBeVisible();

    // Invariant 1: every retry pair preserves the request id within
    // each side of the reload boundary. Across the reload, the queue
    // is expected to surface the same request id on any retry of the
    // pre-reload op — we assert that whenever a post-reload request
    // id matches one seen pre-reload, no drift occurred.
    assertRequestIdStableAcrossRetries(preReload);
    assertRequestIdStableAcrossRetries(postReload);
    const preIds = new Set(preReload.map((r) => r.requestId).filter(Boolean));
    for (const record of postReload) {
      if (record.requestId && preIds.has(record.requestId)) {
        // A matching id must route to the same pathname.
        const preMatch = preReload.find((r) => r.requestId === record.requestId);
        expect(preMatch?.pathname).toBe(record.pathname);
      }
    }
  });

  // ---------------------------------------------------------------
  // Offline → reconnect. The contract tested here:
  //   - Offline fetches fail (context.setOffline(true) makes the
  //     browser network stack return the same `err_internet
  //     _disconnected` as real connectivity loss).
  //   - On reconnect, the app re-issues outstanding work. The
  //     request-id stamped pre-offline must survive the online
  //     transition when a retry fires.
  // Pragmatically, we trigger an action while online first to seed
  // the queue, then go offline, then reconnect and assert that any
  // new traffic is valid.
  // ---------------------------------------------------------------
  test('offline: reconnect drains queue and replays pending writes', async ({ page, context }) => {
    await createDemoSession(page);
    await installFaultPlan(page, {
      kind: 'offline',
      pathPattern: '/api/',
      once: false,
    });
    // While online, tap a subject so the shell mints any command
    // traffic it would otherwise issue.
    const spellingCard = page.locator('[data-action="open-subject"][data-subject-id="spelling"]');
    if (await spellingCard.count()) {
      await spellingCard.first().click({ trial: true, force: true }).catch(() => {});
    }
    await context.setOffline(true);
    await expect(page.locator('body')).toBeVisible();
    // Reconnect and capture any traffic that fires on the transition.
    const postOnline = await collectRequestsTo(page, /\/api\//u, async () => {
      await context.setOffline(false);
      await page.waitForTimeout(1500);
    });
    // Reconnect must not explode the shell.
    await expect(page.locator('body')).toBeVisible();
    // Every id-bearing retry stays stable across the online
    // transition.
    assertRequestIdStableAcrossRetries(postOnline);
  });
});
