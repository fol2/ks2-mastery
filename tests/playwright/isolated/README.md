# `tests/playwright/isolated/` — workers > 1 subset

This folder holds Playwright scenes that can safely run under
`workers: 4` because each scene owns its own per-test SQLite instance.

Added by SH2-U11 (plan: `docs/plans/2026-04-26-001-feat-sys-hardening-p2-plan.md`,
lines 747-799, R11). This is a minimum-viable isolation shape — deep
rework (per-test Cloudflare Worker binding, per-test demo rate-limit
bucket) is explicitly a deferred deep refactor. The shape landed here
is enough to unlock parallel runs of scenes that only need a fresh DB
per test; anything that touches the demo rate-limit bucket or a shared
process-wide registry still belongs under `tests/playwright/` (main
serial suite, `workers: 1`).

## Rules for this folder

1. **Every scene MUST spawn its own DB handle via
   `tests/helpers/playwright-isolated-db.js::createIsolatedDb()`** AND
   run a per-test `startBrowserAppServer({ db: ... })` IN-PROCESS.
   Do NOT rely on the shared Playwright `webServer` block in
   `playwright.config.mjs` — that spawns a CHILD Node process with
   its own empty registry `Map`, and the handle created in this
   process will not resolve there (see BLOCKER-2 note in the helper
   docstring). The `tests/journeys/_server.mjs` helper shows the
   in-process `startBrowserAppServer()` shape; isolated scenes use
   the same approach with the added `db` parameter.

2. **Every scene MUST close its DB handle in `afterEach`** so a
   failing test does not leak a file descriptor onto the next worker
   slot. The helper asserts cleanup; a missing close fails the scene.

3. **NO cross-test shared state.** No module-level counters, no
   process-wide fixtures, no "warm-up" seeds that one scene relies on
   another scene to have written. Every scene starts from a migrated-
   but-empty DB.

4. **NO demo rate-limit usage.** The demo `/api/demo/session` endpoint
   enforces a per-IP rate limit. Under `workers: 4` every scene hits
   the endpoint from `127.0.0.1` and quickly saturates the bucket. If
   a scene needs a demo session, use the test-only cookie harness; if
   the scene genuinely needs a fresh `/api/demo/session` round-trip,
   it belongs in the main serial suite (`tests/playwright/`, not this
   folder).

5. **Keep scenes fast.** The isolated pool exists to parallelise
   short, stateless scenes. A 30-second scene under `workers: 4`
   still blocks for 30 seconds; file a ticket to split it before
   adding it here.

## Canonical scene shape (end-to-end)

Reviewer BLOCKER-2 (ce-correctness): the `playwright.config.mjs`
`webServer.command` approach spawns a CHILD process whose registry is
empty — handles registered in the Playwright test process never
resolve inside that child, and the server silently falls back to the
shared DB. The fix is to start the server IN-PROCESS per test. Every
isolated scene should therefore follow this template:

```js
import { test, expect } from '@playwright/test';
import { createIsolatedDb } from '../../helpers/playwright-isolated-db.js';
import { startBrowserAppServer } from '../../helpers/browser-app-server.js';

test.beforeEach(async ({}, testInfo) => {
  // 1. Create a per-test migrated DB (registered in THIS process).
  const db = createIsolatedDb({ label: testInfo.testId });

  // 2. Tell the to-be-spawned server which handle to resolve. The env
  //    var MUST be set BEFORE startBrowserAppServer() so the server
  //    reads it during construction.
  process.env.KS2_TEST_DB_HANDLE = db.handle;

  // 3. Start the server IN THE SAME Node process as the registry.
  //    Port 0 asks the OS for a free port (avoids collisions under
  //    workers: 4).
  const app = await startBrowserAppServer({
    withWorkerApi: true,
    port: 0,
  });

  testInfo.db = db;
  testInfo.app = app;
});

test.afterEach(async ({}, testInfo) => {
  await testInfo.app?.close();
  await testInfo.db?.close();
  delete process.env.KS2_TEST_DB_HANDLE;
});

test('scene', async ({ page }) => {
  await page.goto(testInfo.app.origin);
  // ... assertions ...
});
```

The main `playwright.config.mjs` `webServer` block stays in place for
the serial suite — isolated scenes simply do not depend on it. The
config's `baseURL: 'http://127.0.0.1:4173'` also does not apply inside
isolated scenes; use `testInfo.app.origin` instead (the per-test
port).

## Running

```sh
# Run just the isolated subset with 4 parallel workers
npx playwright test --project isolated-mobile-390 --workers=4

# Run the main serial suite (workers: 1, excludes this folder)
npx playwright test --project mobile-390
```

`playwright.config.mjs` wires the `isolated-mobile-390` project to
`testMatch: /tests\/playwright\/isolated\/.*\.playwright\.test\.mjs$/`
with `fullyParallel: true`. Playwright's top-level `workers` setting is
configured to `1` for safety on the main suite; the isolated subset
takes its worker count from the `--workers=N` CLI flag so parallel
execution is opt-in at the command line. The main projects `testIgnore`
the folder so no scene runs twice.

## Why `mobile-390` only

The isolated subset uses the mobile-390 viewport as its control
surface — matching the main PR-time project — so a scene authored
here can be promoted to the main serial suite (or vice versa) without
rewriting its layout assertions. Wider-viewport parallel runs are a
possible follow-up, but today the isolation shape is mobile-390 only.
