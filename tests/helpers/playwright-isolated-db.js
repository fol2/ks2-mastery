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
//
//   test.beforeEach(async ({}, testInfo) => {
//     const db = createIsolatedDb({ label: testInfo.testId });
//     testInfo.db = db;
//     // spawn a browser-app-server child with KS2_TEST_DB_HANDLE=db.handle
//     // ... (scene-specific glue)
//   });
//
//   test.afterEach(async ({}, testInfo) => {
//     await testInfo.db?.close();
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
//    Playwright spawns a browser-app-server per scene when
//    `KS2_TEST_DB_HANDLE` is set, so the registry holds at most one
//    DB per handle. Handles are NOT shared across processes.
//  - `close()` pops the handle out of the registry AND calls
//    `.close()` on the underlying SQLite instance so Node can GC the
//    file descriptor.
//  - Calling `close()` twice is a no-op (idempotent).

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
