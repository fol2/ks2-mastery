// SH2-U11: per-test SQLite helper for the isolated Playwright subset.
//
// Plan: docs/plans/2026-04-26-001-feat-sys-hardening-p2-plan.md
// (lines 747-799, R11).
//
// The main Playwright suite under `tests/playwright/*.playwright.test.mjs`
// runs serially (`workers: 1`) because `tests/helpers/browser-app-server.js`
// backs every request with a single in-memory SQLite instance shared across
// all scenes. The isolated subset under `tests/playwright/isolated/`
// opts out of that shared fixture: every scene gets a fresh migrated DB
// and a dedicated browser-app-server process, which unlocks `workers > 1`.
//
// Shape of a scene:
//
//   import { test } from '@playwright/test';
//   import { createIsolatedDb } from '../../helpers/playwright-isolated-db.js';
//   import { startBrowserAppServer } from '../../helpers/browser-app-server.js';
//
//   test.beforeEach(async ({}, testInfo) => {
//     const db = createIsolatedDb({ label: testInfo.testId });
//     // CRITICAL: the server MUST run in THIS Node process. The registry
//     // below is an in-process `Map`, so a `webServer.command`-spawned
//     // child cannot see handles created here. Use the direct
//     // `startBrowserAppServer({ db })` form so the registry + the
//     // server share one process.
//     process.env.KS2_TEST_DB_HANDLE = db.handle;
//     const app = await startBrowserAppServer({ withWorkerApi: true, port: 0 });
//     testInfo.db = db;
//     testInfo.app = app;
//   });
//
//   test.afterEach(async ({}, testInfo) => {
//     await testInfo.app?.close();
//     await testInfo.db?.close();
//     delete process.env.KS2_TEST_DB_HANDLE;
//   });
//
// The helper is intentionally small: it wraps the existing
// `createMigratedSqliteD1Database()` helper so the migration path stays
// identical to the main suite. The only new primitive is the `handle`
// string — an opaque identifier that `browser-app-server.js` reads out
// of `process.env.KS2_TEST_DB_HANDLE` and uses as a registry key into
// the per-process DB map.
//
// Registry semantics:
//  - A handle is a UUID-ish token scoped to the CURRENT Node process.
//    Handles are NOT shared across processes — the registry below is
//    an in-process `Map`, not a file/IPC primitive.
//  - `close()` pops the handle out of the registry AND calls
//    `.close()` on the underlying SQLite instance so Node can GC the
//    file descriptor.
//  - Calling `close()` twice is a no-op (idempotent).
//
// IMPORTANT — cross-process caveat (reviewer BLOCKER-2):
//
//   The top-level `playwright.config.mjs` declares a `webServer.command`
//   that SPAWNS a child `node ./tests/helpers/browser-app-server.js`
//   process. That child has its OWN empty registry `Map`; a handle
//   created in the Playwright test process (where `createIsolatedDb` ran)
//   will NOT resolve inside that child. The server would log
//   `KS2_TEST_DB_HANDLE set but handle did not resolve; falling back to
//   shared DB` and the isolation contract would silently break.
//
//   Isolated scenes therefore MUST spawn a per-test server IN-PROCESS
//   via `startBrowserAppServer({ db })` — NOT use the shared Playwright
//   `webServer` block. The example above, and the companion README
//   (`tests/playwright/isolated/README.md`), both demonstrate the
//   correct pattern. The `tests/journeys/_server.mjs` helper shows the
//   same in-process `startBrowserAppServer()` shape used by the
//   existing Phase 4 U8 journey specs.

import { randomUUID } from 'node:crypto';
import { createMigratedSqliteD1Database } from './sqlite-d1.js';

// Process-scoped registry: handle -> DB instance. Shared across
// `createIsolatedDb()` and `resolveIsolatedDb()`. A test helper running
// in the Playwright test process creates the DB; the browser-app-server
// spawned in a child process resolves it via `process.env.KS2_TEST_DB_HANDLE`
// only AFTER the child has been told to look up a handle. Production
// builds never hit this code path because the server falls back to a
// fresh shared DB when the env var is absent.
const registry = new Map();

/**
 * Create a new per-test SQLite instance.
 *
 * @param {object} [options]
 * @param {string} [options.label] — optional debug label for logs.
 * @returns {{ handle: string, db: import('./sqlite-d1.js').SqliteD1Database, close: () => Promise<void> }}
 */
export function createIsolatedDb({ label } = {}) {
  const handle = `ks2-isolated-${randomUUID()}`;
  const db = createMigratedSqliteD1Database();
  registry.set(handle, { db, label: label || null });

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    const entry = registry.get(handle);
    registry.delete(handle);
    entry?.db?.close();
  };

  return { handle, db, close };
}

/**
 * Resolve a previously-registered DB handle. Returns `null` when the
 * handle is unknown — callers should treat that as "fall back to the
 * shared fixture" (the `browser-app-server` contract).
 *
 * @param {string | undefined | null} handle
 * @returns {import('./sqlite-d1.js').SqliteD1Database | null}
 */
export function resolveIsolatedDb(handle) {
  if (!handle || typeof handle !== 'string') return null;
  const entry = registry.get(handle);
  return entry ? entry.db : null;
}

/**
 * Test-only introspection helper: how many DB handles are live?
 * Used by the test that asserts `afterEach` closes the handle.
 *
 * @returns {number}
 */
export function liveIsolatedDbCount() {
  return registry.size;
}
