// U5 (sys-hardening p1): Playwright adoption for golden-path scenes.
//
// The webServer command now passes `--with-worker-api` to
// `tests/helpers/browser-app-server.js` so `/api/*` routes respond during
// scenes — without that flag the helper replies 404 on every `/api/` call
// and the demo cookie bootstrap fails. See plan unit U5 + feasibility F-04.
//
// `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` should be set on any Cloudflare
// Wrangler remote-build host: the `wrangler.jsonc` build command runs
// `npm install`, which would otherwise fetch ~300 MB of Playwright
// browsers that the deployed Worker never uses.
export default {
  testDir: './tests',
  // Playwright scenes live under `tests/playwright/*.playwright.test.mjs`.
  // node:test's default file-discovery glob also grabs anything matching
  // `.test.mjs`, which caused the Playwright scenes to run under
  // `npm test` (node --test) with no browser context. We tell Playwright
  // to match the full path so the existing glob is preserved, and we tell
  // `npm test` to skip `tests/playwright/**` via the `testPathIgnorePatterns`
  // equivalent in `tests/helpers/node-test-filter.mjs` (see README note).
  testMatch: /tests[\\/]+playwright[\\/].*\.playwright\.test\.(js|mjs)$/,
  snapshotDir: './tests/playwright/__screenshots__',
  // U5 runs the scenes serially: `tests/helpers/browser-app-server.js`
  // backs every request with a single in-memory SQLite database and the
  // demo-session endpoint enforces a 30-request / 10-minute rate limit
  // per IP. 15 parallel workers × re-runs saturates the rate limit and
  // can hit SAVEPOINT concurrency inside shared batch queries. Serial
  // workers keep U5 deterministic; U9/U10 can redesign isolation
  // (per-worker DB, seeded demo cookie, or relaxed rate limit under a
  // test-only flag) and bump this back up.
  workers: 1,
  timeout: 30_000,
  expect: {
    // Start conservative; tune per viewport as real baselines accumulate.
    // Follow-up units (U9 / U10 / U12) extend the matrix to all five
    // viewports and may lower this per project.
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
      caret: 'hide',
    },
  },
  webServer: {
    // U8: `KS2_BUILD_MODE=test` swaps the esbuild `NODE_ENV` define
    // from `"production"` to `"test"` so the
    // `globalThis.__ks2_capacityMeta__` counters survive dead-code
    // elimination and the Playwright scene can read them. Production
    // builds keep the counter object stripped (verified by
    // `scripts/audit-client-bundle.mjs`). The env var is set via the
    // `env:` block below; Playwright propagates it into the spawned
    // shell, which then passes it down to `scripts/build-client.mjs`.
    command: 'node ./scripts/build-bundles.mjs && node ./scripts/build-public.mjs && node ./tests/helpers/browser-app-server.js --serve-only --port 4173 --with-worker-api',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // U9 follow-up (review major-1): defence-in-depth env gate for the
    // fault-injection middleware. `isFaultInjectionAllowed()` checks
    // `KS2_TEST_HARNESS=1` in addition to the per-request header opt-in
    // so a production worker build never honours chaos plans. Playwright
    // propagates `env` into the child process that runs the browser-app
    // server; the golden-path scenes never toggle the opt-in header
    // anyway, so the only surface effect is that chaos scenes actually
    // get their plans honoured.
    env: {
      KS2_TEST_HARNESS: '1',
      // U8: propagate build mode so the child `build-client.mjs`
      // esbuild invocation skips the `NODE_ENV=production` define and
      // the capacity-meta counter object lives in the served bundle.
      KS2_BUILD_MODE: 'test',
    },
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile-360', use: { viewport: { width: 360, height: 740 } } },
    { name: 'mobile-390', use: { viewport: { width: 390, height: 844 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'desktop-1024', use: { viewport: { width: 1024, height: 768 } } },
    { name: 'desktop-1440', use: { viewport: { width: 1440, height: 900 } } },
  ],
};
