// U5 (sys-hardening p1): Playwright adoption for golden-path scenes.
// SH2-U11 (sys-hardening p2): per-project `maxDiffPixelRatio` override
// for narrow-viewport Linux-CI font-hinting drift + isolated-subset
// project that runs `workers: 4` against per-test migrated SQLite
// instances under `tests/playwright/isolated/`.
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
//
// SH2-U11 (sys-hardening p2): `maxDiffPixelRatio` per project.
// Linux-CI font hinting at narrow viewports (`mobile-360`, `mobile-390`)
// routinely exceeds the 0.02 default — glyph anti-aliasing differences
// between macOS / Windows / Linux make a ~3% diff expected even when
// the layout is identical. The per-project override below loosens only
// those two to 0.035; wider viewports keep the tighter 0.02 because
// Linux rendering there matches the developer-machine baselines closely
// enough. F-04 deepening.
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
  // workers keep U5 deterministic; SH2-U11 redesigns isolation for the
  // opt-in subset under `tests/playwright/isolated/` via
  // `tests/helpers/playwright-isolated-db.js`. Isolated-subset scenes
  // bypass the shared DB and the demo rate-limit path so they can run
  // `workers: 4`. The main serial suite still uses `workers: 1` by
  // default (set at the per-project level below).
  workers: 1,
  timeout: 30_000,
  // SH2-U6 (sys-hardening p2): never auto-write snapshots on CI. The
  // dev loop opts in explicitly via `npx playwright test
  // --update-snapshots` when regenerating baselines (typically after a
  // deliberate visual change), and the SH2-U11 Linux-CI baseline pass
  // will do a one-PR regenerate on the Linux host. Keeping this at
  // `'none'` guarantees that a flaky test on CI cannot silently rewrite
  // the committed baseline — the failing PR shows a visual diff report
  // and the change must be reviewed before a human regenerates.
  updateSnapshots: 'none',
  expect: {
    // Start conservative; per-project overrides below loosen the
    // narrow-viewport threshold to account for Linux-CI font hinting.
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
    // SH2-U6: extended from 60s to 180s because the build pipeline
    // (esbuild bundle + public copy) can exceed 60s on a cold cache or
    // when multiple worktrees share the same host. Failed webserver
    // startup blocks the entire matrix, so we err on the side of waiting.
    timeout: 180_000,
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
    // SH2-U11: per-project `maxDiffPixelRatio` override. Narrow
    // viewports (360 / 390) allow a 0.035 ratio to absorb Linux-CI
    // font-hinting drift; wider viewports keep the 0.02 default.
    {
      name: 'mobile-360',
      testIgnore: /tests[\\/]+playwright[\\/]+isolated[\\/]/,
      use: { viewport: { width: 360, height: 740 } },
      expect: {
        toHaveScreenshot: {
          maxDiffPixelRatio: 0.035,
        },
      },
    },
    {
      name: 'mobile-390',
      testIgnore: /tests[\\/]+playwright[\\/]+isolated[\\/]/,
      use: { viewport: { width: 390, height: 844 } },
      expect: {
        toHaveScreenshot: {
          maxDiffPixelRatio: 0.035,
        },
      },
    },
    {
      name: 'tablet',
      testIgnore: /tests[\\/]+playwright[\\/]+isolated[\\/]/,
      use: { viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'desktop-1024',
      testIgnore: /tests[\\/]+playwright[\\/]+isolated[\\/]/,
      use: { viewport: { width: 1024, height: 768 } },
    },
    {
      name: 'desktop-1440',
      testIgnore: /tests[\\/]+playwright[\\/]+isolated[\\/]/,
      use: { viewport: { width: 1440, height: 900 } },
    },
    // SH2-U11: isolated subset. Scenes under `tests/playwright/isolated/`
    // use `tests/helpers/playwright-isolated-db.js` to spawn a per-test
    // migrated SQLite instance, which unlocks parallel execution. The
    // main projects above `testIgnore` this folder so a scene never
    // runs twice.
    //
    // `workers` is a top-level Playwright config option, not per-project;
    // isolated runs therefore supply `--workers=4` on the CLI. The
    // `fullyParallel: true` flag here ensures tests within a single file
    // are also parallelised under that worker count. The PR-time
    // `playwright.yml` workflow only exercises the main `mobile-390`
    // project; operators who want to flex the isolated subset locally
    // run:
    //
    //   npx playwright test --project isolated-mobile-390 --workers=4
    //
    // The subset is opt-in today; it does not run by default on PR. A
    // follow-up PR wires the isolated subset into `playwright.yml` once
    // at least one isolated scene lands (SH2-U11 ships the isolation
    // contract + helper; isolated scenes are authored in follow-ups).
    {
      name: 'isolated-mobile-390',
      testMatch: /tests[\\/]+playwright[\\/]+isolated[\\/].*\.playwright\.test\.(js|mjs)$/,
      use: { viewport: { width: 390, height: 844 } },
      expect: {
        toHaveScreenshot: {
          maxDiffPixelRatio: 0.035,
        },
      },
      fullyParallel: true,
    },
  ],
};
