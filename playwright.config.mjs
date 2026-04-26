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
    command: 'node ./scripts/build-bundles.mjs && node ./scripts/build-public.mjs && node ./tests/helpers/browser-app-server.js --serve-only --port 4173 --with-worker-api',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
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
