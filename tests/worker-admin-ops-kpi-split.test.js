// P1.5 Phase A (U3) — KPI real / demo split + error origin split.
//
// `readDashboardKpis` now emits:
//   - accounts.total / accounts.real / accounts.demo (real===total, additive)
//   - learners.total / learners.real / learners.demo
//   - practiceSessions.last7d/30d with real+demo windows
//   - mutationReceipts.last7d with real+demo windows
//   - errorEvents.byOrigin.client / errorEvents.byOrigin.server
//
// These tests seed adult_accounts with a mix of real and demo accounts,
// memberships, practice sessions, mutation receipts, and ops_error_events
// rows, then assert the counters come back on the correct side of the
// split. They also cover the malformed account_type (falls into real via
// COALESCE) and zero-demo (counter is 0, not null) cases the plan calls out.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

function seedAdultAccount(server, {
  id,
  email = null,
  displayName = 'Account',
  platformRole = 'parent',
  accountType = 'real',
  demoExpiresAt = null,
  now,
}) {
  server.DB.db.prepare(`
    INSERT INTO adult_accounts (
      id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, repo_revision, account_type, demo_expires_at
    )
    VALUES (?, ?, ?, ?, NULL, ?, ?, 0, ?, ?)
  `).run(id, email, displayName, platformRole, now, now, accountType, demoExpiresAt);
}

function seedLearner(server, { id, name = 'Learner', now }) {
  server.DB.db.prepare(`
    INSERT INTO learner_profiles (
      id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at
    )
    VALUES (?, ?, 'Y5', '#333', 'sats', 15, ?, ?)
  `).run(id, name, now, now);
}

function seedOwnerMembership(server, { accountId, learnerId, now }) {
  server.DB.db.prepare(`
    INSERT INTO account_learner_memberships (
      account_id, learner_id, role, sort_index, created_at, updated_at
    )
    VALUES (?, ?, 'owner', 0, ?, ?)
  `).run(accountId, learnerId, now, now);
}

function seedPracticeSession(server, { id, learnerId, updatedAt }) {
  server.DB.db.prepare(`
    INSERT INTO practice_sessions (
      id, learner_id, subject_id, session_kind, status,
      created_at, updated_at
    )
    VALUES (?, ?, 'spelling', 'smart', 'completed', ?, ?)
  `).run(id, learnerId, updatedAt, updatedAt);
}

function seedMutationReceipt(server, { accountId, requestId, appliedAt }) {
  server.DB.db.prepare(`
    INSERT INTO mutation_receipts (
      account_id, request_id, scope_type, scope_id, mutation_kind,
      request_hash, response_json, status_code, correlation_id, applied_at
    )
    VALUES (?, ?, 'account', ?, 'test.kind', 'hash', ?, 200, NULL, ?)
  `).run(accountId, requestId, accountId, JSON.stringify({ ok: true }), appliedAt);
}

function seedOpsErrorEvent(server, { id, routeName, firstSeen, lastSeen, fingerprint }) {
  server.DB.db.prepare(`
    INSERT INTO ops_error_events (
      id, fingerprint, error_kind, message_first_line, first_frame,
      route_name, user_agent, account_id, first_seen, last_seen,
      occurrence_count, status
    )
    VALUES (?, ?, 'TypeError', 'boom', NULL, ?, NULL, NULL, ?, ?, 1, 'open')
  `).run(id, fingerprint, routeName, firstSeen, lastSeen);
}

test('readDashboardKpis splits accounts + learners by real vs demo', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    // Actor: admin account (real). Plus 4 real + 3 demo accounts.
    seedAdultAccount(server, { id: 'adult-admin', email: 'admin@example.com', displayName: 'Admin', platformRole: 'admin', now });
    seedAdultAccount(server, { id: 'real-1', now });
    seedAdultAccount(server, { id: 'real-2', now });
    seedAdultAccount(server, { id: 'real-3', now });
    seedAdultAccount(server, { id: 'real-4', now });
    seedAdultAccount(server, { id: 'demo-1', accountType: 'demo', demoExpiresAt: now + 60_000, now });
    seedAdultAccount(server, { id: 'demo-2', accountType: 'demo', demoExpiresAt: now - 60_000, now });
    seedAdultAccount(server, { id: 'demo-3', accountType: 'demo', demoExpiresAt: now + 1_000, now });

    // 2 learners owned by a real account, 1 by a demo account.
    seedLearner(server, { id: 'learner-r1', now });
    seedOwnerMembership(server, { accountId: 'real-1', learnerId: 'learner-r1', now });
    seedLearner(server, { id: 'learner-r2', now });
    seedOwnerMembership(server, { accountId: 'real-2', learnerId: 'learner-r2', now });
    seedLearner(server, { id: 'learner-d1', now });
    seedOwnerMembership(server, { accountId: 'demo-1', learnerId: 'learner-d1', now });

    const response = await server.fetchAs('adult-admin', 'https://repo.test/api/admin/ops/kpi', {}, {
      'x-ks2-dev-platform-role': 'admin',
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    // Real accounts: admin + 3 real + the NULL-type row = 5. Demo = 3.
    assert.equal(payload.accounts.real, 5);
    assert.equal(payload.accounts.demo, 3);
    // accounts.total preserves legacy meaning (real only).
    assert.equal(payload.accounts.total, 5);
    // Learners split.
    assert.equal(payload.learners.real, 2);
    assert.equal(payload.learners.demo, 1);
  } finally {
    server.close();
  }
});

test('readDashboardKpis emits zero demo counters instead of null when there are no demos', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, { id: 'adult-admin', email: 'admin@example.com', displayName: 'Admin', platformRole: 'admin', now });
    seedAdultAccount(server, { id: 'real-1', now });
    seedLearner(server, { id: 'learner-r1', now });
    seedOwnerMembership(server, { accountId: 'real-1', learnerId: 'learner-r1', now });

    const response = await server.fetchAs('adult-admin', 'https://repo.test/api/admin/ops/kpi', {}, {
      'x-ks2-dev-platform-role': 'admin',
    });
    const payload = await response.json();
    assert.equal(payload.accounts.demo, 0);
    assert.equal(payload.learners.demo, 0);
    assert.equal(payload.practiceSessions.demo.last7d, 0);
    assert.equal(payload.practiceSessions.demo.last30d, 0);
    assert.equal(payload.mutationReceipts.demo.last7d, 0);
  } finally {
    server.close();
  }
});

test('readDashboardKpis splits practice sessions + mutation receipts by owner account_type', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, { id: 'adult-admin', email: 'admin@example.com', displayName: 'Admin', platformRole: 'admin', now });
    seedAdultAccount(server, { id: 'real-1', now });
    seedAdultAccount(server, { id: 'demo-1', accountType: 'demo', demoExpiresAt: now + 1_000, now });
    seedLearner(server, { id: 'learner-r1', now });
    seedOwnerMembership(server, { accountId: 'real-1', learnerId: 'learner-r1', now });
    seedLearner(server, { id: 'learner-d1', now });
    seedOwnerMembership(server, { accountId: 'demo-1', learnerId: 'learner-d1', now });

    // Two real, one demo sessions within the 7-day window.
    seedPracticeSession(server, { id: 'ps-r1', learnerId: 'learner-r1', updatedAt: now - 1_000 });
    seedPracticeSession(server, { id: 'ps-r2', learnerId: 'learner-r1', updatedAt: now - 2_000 });
    seedPracticeSession(server, { id: 'ps-d1', learnerId: 'learner-d1', updatedAt: now - 3_000 });

    // Mutation receipts split.
    seedMutationReceipt(server, { accountId: 'real-1', requestId: 'req-r1', appliedAt: now - 100 });
    seedMutationReceipt(server, { accountId: 'real-1', requestId: 'req-r2', appliedAt: now - 200 });
    seedMutationReceipt(server, { accountId: 'real-1', requestId: 'req-r3', appliedAt: now - 300 });
    seedMutationReceipt(server, { accountId: 'demo-1', requestId: 'req-d1', appliedAt: now - 400 });

    const response = await server.fetchAs('adult-admin', 'https://repo.test/api/admin/ops/kpi', {}, {
      'x-ks2-dev-platform-role': 'admin',
    });
    const payload = await response.json();

    assert.equal(payload.practiceSessions.real.last7d, 2);
    assert.equal(payload.practiceSessions.demo.last7d, 1);
    // 30d window includes the same rows for this seed.
    assert.equal(payload.practiceSessions.real.last30d, 2);
    assert.equal(payload.practiceSessions.demo.last30d, 1);
    assert.equal(payload.mutationReceipts.real.last7d, 3);
    assert.equal(payload.mutationReceipts.demo.last7d, 1);
  } finally {
    server.close();
  }
});

test('readDashboardKpis splits ops_error_events by route origin (client vs server)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, { id: 'adult-admin', email: 'admin@example.com', displayName: 'Admin', platformRole: 'admin', now });

    // Server-origin: route starts with '/api/'.
    seedOpsErrorEvent(server, { id: 'e1', fingerprint: 'fp1', routeName: '/api/admin/foo', firstSeen: now - 2000, lastSeen: now - 1000 });
    seedOpsErrorEvent(server, { id: 'e2', fingerprint: 'fp2', routeName: '/api/hubs/parent', firstSeen: now - 3000, lastSeen: now - 2500 });
    // Client-origin: SPA URL path (not /api/).
    seedOpsErrorEvent(server, { id: 'e3', fingerprint: 'fp3', routeName: '/subject/spelling', firstSeen: now - 1000, lastSeen: now - 500 });
    // Client-origin: NULL route (majority case today).
    seedOpsErrorEvent(server, { id: 'e4', fingerprint: 'fp4', routeName: null, firstSeen: now - 500, lastSeen: now - 100 });

    const response = await server.fetchAs('adult-admin', 'https://repo.test/api/admin/ops/kpi', {}, {
      'x-ks2-dev-platform-role': 'admin',
    });
    const payload = await response.json();
    assert.equal(payload.errorEvents.byOrigin.client, 2);
    assert.equal(payload.errorEvents.byOrigin.server, 2);
  } finally {
    server.close();
  }
});

// -----------------------------------------------------------------
// I2 reviewer fix: multi-owner demo learner must count once (DISTINCT).
// -----------------------------------------------------------------

test('readDashboardKpis counts a learner with multiple demo-owner memberships once (DISTINCT)', async () => {
  // I2 coverage: before the DISTINCT fix, `COUNT(*)` on the INNER JOIN
  // returned one row per membership, so a learner co-owned by two demo
  // accounts was tallied as 2 demo learners instead of 1. The same
  // over-count affected practice-session demo windows. This test seeds a
  // learner with two demo-owner memberships and one demo-session, then
  // asserts both counters stay at 1.
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, { id: 'adult-admin', email: 'admin@example.com', displayName: 'Admin', platformRole: 'admin', now });
    seedAdultAccount(server, { id: 'demo-1', accountType: 'demo', demoExpiresAt: now + 60_000, now });
    seedAdultAccount(server, { id: 'demo-2', accountType: 'demo', demoExpiresAt: now + 60_000, now });
    seedLearner(server, { id: 'learner-shared', now });
    // Two demo-owner memberships for the same learner.
    seedOwnerMembership(server, { accountId: 'demo-1', learnerId: 'learner-shared', now });
    seedOwnerMembership(server, { accountId: 'demo-2', learnerId: 'learner-shared', now });
    // One session for that learner within the 7d window.
    seedPracticeSession(server, { id: 'ps-shared-1', learnerId: 'learner-shared', updatedAt: now - 1_000 });

    const response = await server.fetchAs('adult-admin', 'https://repo.test/api/admin/ops/kpi', {}, {
      'x-ks2-dev-platform-role': 'admin',
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    // Before the fix this returned 2 (one row per membership). After
    // DISTINCT it is 1.
    assert.equal(payload.learners.demo, 1);
    // Same story for practice-session demo windows.
    assert.equal(payload.practiceSessions.demo.last7d, 1);
    assert.equal(payload.practiceSessions.demo.last30d, 1);
  } finally {
    server.close();
  }
});

// -----------------------------------------------------------------
// Malformed account_type must fall into "real" via COALESCE.
// -----------------------------------------------------------------

test('readDashboardKpis counts a legacy malformed account_type as real via COALESCE', async () => {
  // Coverage: the 0007 migration adds `account_type TEXT NOT NULL DEFAULT
  // 'real'` with no CHECK constraint, so a raw INSERT can produce a
  // non-canonical value like `'weird-legacy-value'`. Our real-side filter
  // uses `COALESCE(account_type, 'real') <> 'demo'`, so anything not
  // equal to the literal string `'demo'` falls into real. This test
  // seeds one such row and asserts the count.
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, { id: 'adult-admin', email: 'admin@example.com', displayName: 'Admin', platformRole: 'admin', now });
    // Directly INSERT a row with a non-canonical account_type — no
    // CHECK constraint, so SQLite accepts it.
    server.DB.db.prepare(`
      INSERT INTO adult_accounts (
        id, email, display_name, platform_role, selected_learner_id,
        created_at, updated_at, repo_revision, account_type, demo_expires_at
      )
      VALUES ('legacy-weird', NULL, 'Legacy', 'parent', NULL, ?, ?, 0, 'weird-legacy-value', NULL)
    `).run(now, now);

    const response = await server.fetchAs('adult-admin', 'https://repo.test/api/admin/ops/kpi', {}, {
      'x-ks2-dev-platform-role': 'admin',
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    // Admin + the legacy weird-typed row = 2 real, 0 demo.
    assert.equal(payload.accounts.real, 2);
    assert.equal(payload.accounts.demo, 0);
  } finally {
    server.close();
  }
});

// -----------------------------------------------------------------
// I5 reviewer fix: `lower(route_name) LIKE '/api/%'` handles uppercase
// routes uniformly.
// -----------------------------------------------------------------

test('readDashboardKpis classifies uppercase /API/ routes as server-origin (case-insensitive LIKE)', async () => {
  // I5 coverage: SQLite `LIKE` is case-sensitive by default, so a route
  // logged as `/API/admin/foo` (uppercase, e.g. a legacy beacon) would
  // incorrectly land in the client-origin bucket. After the `lower()`
  // fix the two sides partition correctly regardless of casing. This
  // test mixes lowercase / uppercase / mixed-case routes and checks
  // that every '/api/'-prefixed route (case-insensitive) is counted as
  // server-origin.
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, { id: 'adult-admin', email: 'admin@example.com', displayName: 'Admin', platformRole: 'admin', now });

    // Three server-origin routes (lowercase, uppercase, mixed-case).
    seedOpsErrorEvent(server, { id: 'e1', fingerprint: 'fp1', routeName: '/api/admin/foo', firstSeen: now - 2000, lastSeen: now - 1000 });
    seedOpsErrorEvent(server, { id: 'e2', fingerprint: 'fp2', routeName: '/API/admin/bar', firstSeen: now - 3000, lastSeen: now - 2500 });
    seedOpsErrorEvent(server, { id: 'e3', fingerprint: 'fp3', routeName: '/Api/hubs/parent', firstSeen: now - 1500, lastSeen: now - 1000 });
    // One client-origin route.
    seedOpsErrorEvent(server, { id: 'e4', fingerprint: 'fp4', routeName: '/subject/spelling', firstSeen: now - 1000, lastSeen: now - 500 });

    const response = await server.fetchAs('adult-admin', 'https://repo.test/api/admin/ops/kpi', {}, {
      'x-ks2-dev-platform-role': 'admin',
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.errorEvents.byOrigin.server, 3);
    assert.equal(payload.errorEvents.byOrigin.client, 1);
  } finally {
    server.close();
  }
});
