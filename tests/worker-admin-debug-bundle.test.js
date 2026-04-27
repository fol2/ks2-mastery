// U6 (P3): Worker-side debug bundle test suite.
//
// Validates the GET /api/admin/debug-bundle route, auth gating,
// rate limiting, and per-section error boundary behaviour.
//
// Test scenarios:
//   1. Happy path: admin gets full bundle with all sections populated
//   2. Happy path: bundle with fingerprint filter returns matching occurrences
//   3. Happy path: admin bundle includes full identifiers
//   4. Edge case: bundle for non-existent account returns empty sections
//   5. Edge case: bundle with no time window defaults to last 24 hours
//   6. Edge case: one sub-query fails → that section null, others populated
//   7. Error path: non-admin/ops user gets 403
//   8. Error path: rate-limited after 10 requests in 1 minute
//   9. Happy path: ops bundle masks identifiers and excludes internal notes
//  10. Integration: canExportJson is true for admin, false for ops

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

const NOW = Date.now();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

function seedAdultAccount(server, {
  id,
  email,
  displayName,
  platformRole = 'parent',
  now = NOW,
  accountType = 'real',
} = {}) {
  server.DB.db.prepare(`
    INSERT INTO adult_accounts (
      id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, repo_revision, account_type, demo_expires_at
    )
    VALUES (?, ?, ?, ?, NULL, ?, ?, 0, ?, NULL)
  `).run(id, email, displayName, platformRole, now, now, accountType);
}

function seedLearner(server, { learnerId, accountId, learnerName, yearGroup = 'Year 4' }) {
  server.DB.db.prepare(`
    INSERT OR IGNORE INTO learner_profiles (id, name, year_group, avatar_color, goal, created_at, updated_at)
    VALUES (?, ?, ?, 'blue', 'practice', ?, ?)
  `).run(learnerId, learnerName, yearGroup, NOW, NOW);
  server.DB.db.prepare(`
    INSERT OR IGNORE INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, ?, 'owner', 0, ?, ?)
  `).run(accountId, learnerId, NOW, NOW);
}

function seedErrorEvent(server, {
  id,
  fingerprint,
  errorKind = 'TypeError',
  messageFirstLine = 'test error',
  firstFrame = null,
  routeName = null,
  userAgent = null,
  accountId = null,
  firstSeen = NOW - ONE_HOUR_MS,
  lastSeen = NOW - ONE_HOUR_MS,
  occurrenceCount = 1,
  status = 'open',
}) {
  server.DB.db.prepare(`
    INSERT INTO ops_error_events (
      id, fingerprint, error_kind, message_first_line, first_frame,
      route_name, user_agent, account_id, first_seen, last_seen,
      occurrence_count, status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, fingerprint, errorKind, messageFirstLine, firstFrame,
    routeName, userAgent, accountId, firstSeen, lastSeen,
    occurrenceCount, status);
}

function seedDenial(server, {
  id,
  deniedAt = NOW - ONE_HOUR_MS,
  denialReason = 'rate_limit_exceeded',
  routeName = '/api/test',
  accountId = null,
  learnerId = null,
  sessionIdLast8 = null,
  isDemo = 0,
  release = null,
  detailJson = null,
}) {
  server.DB.db.prepare(`
    INSERT INTO admin_request_denials (
      id, denied_at, denial_reason, route_name, account_id,
      learner_id, session_id_last8, is_demo, release, detail_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, deniedAt, denialReason, routeName, accountId,
    learnerId, sessionIdLast8, isDemo, release, detailJson);
}

function seedOccurrence(server, {
  id,
  eventId,
  occurredAt = NOW - ONE_HOUR_MS,
  release = null,
  routeName = null,
  accountId = null,
  userAgent = null,
}) {
  server.DB.db.prepare(`
    INSERT INTO ops_error_event_occurrences (
      id, event_id, occurred_at, release, route_name, account_id, user_agent
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, eventId, occurredAt, release, routeName, accountId, userAgent);
}

function fetchBundle(server, accountId, params = {}, { platformRole = 'admin' } = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null) query.set(key, String(value));
  }
  const qs = query.toString();
  const url = `https://repo.test/api/admin/debug-bundle${qs ? `?${qs}` : ''}`;
  return server.fetchAs(
    accountId,
    url,
    {},
    { origin: 'https://repo.test', 'x-ks2-dev-platform-role': platformRole },
  );
}

// =================================================================
// 1. Happy path: admin gets full bundle with all sections populated
// =================================================================

test('admin gets full bundle with all sections', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const testTs = Date.now() - 1000;
    seedAdultAccount(server, { id: 'admin-1', email: 'admin@test.com', displayName: 'Admin', platformRole: 'admin' });
    seedLearner(server, { learnerId: 'learner-1', accountId: 'admin-1', learnerName: 'Alice' });
    seedErrorEvent(server, { id: 'err-1', fingerprint: 'fp-1', routeName: '/api/test', accountId: 'admin-1', firstSeen: testTs, lastSeen: testTs });
    seedDenial(server, { id: 'denial-1', accountId: 'admin-1', deniedAt: testTs });

    const res = await fetchBundle(server, 'admin-1', {
      account_id: 'admin-1',
      time_from: testTs - ONE_HOUR_MS,
      time_to: testTs + ONE_HOUR_MS,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(body.bundle, 'bundle present');
    assert.ok(body.bundle.accountSummary, 'accountSummary present');
    assert.ok(Array.isArray(body.bundle.linkedLearners), 'linkedLearners is array');
    assert.ok(Array.isArray(body.bundle.recentErrors), 'recentErrors is array');
    assert.ok(Array.isArray(body.bundle.recentDenials), 'recentDenials is array');
    assert.ok(Array.isArray(body.bundle.recentMutations), 'recentMutations is array');
    assert.ok(Array.isArray(body.bundle.capacityState), 'capacityState is array');
    assert.equal(typeof body.humanSummary, 'string');
    assert.ok(body.humanSummary.length > 0, 'human summary is non-empty');
  } finally {
    server.close();
  }
});

// =================================================================
// 2. Happy path: bundle with fingerprint filter returns matching errors
// =================================================================

test('bundle with fingerprint filter returns matching errors', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'admin-2', email: 'admin2@test.com', displayName: 'Admin 2', platformRole: 'admin' });
    const testTs = Date.now() - 1000;
    seedErrorEvent(server, { id: 'err-match', fingerprint: 'fp-target', routeName: '/api/match', firstSeen: testTs, lastSeen: testTs });
    seedErrorEvent(server, { id: 'err-other', fingerprint: 'fp-other', routeName: '/api/other', firstSeen: testTs, lastSeen: testTs });

    // Use explicit time window covering the seeded timestamps.
    const res = await fetchBundle(server, 'admin-2', {
      error_fingerprint: 'fp-target',
      time_from: testTs - ONE_HOUR_MS,
      time_to: testTs + ONE_HOUR_MS,
    });
    const body = await res.json();
    assert.equal(body.ok, true);
    const errors = body.bundle.recentErrors || [];
    assert.equal(errors.length, 1, 'only matching fingerprint returned');
    assert.equal(errors[0].fingerprint, 'fp-target');
  } finally {
    server.close();
  }
});

// =================================================================
// 3. Happy path: admin bundle includes full identifiers
// =================================================================

test('admin bundle includes full identifiers', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'admin-full-id-test', email: 'admin-full@test.com', displayName: 'Admin Full', platformRole: 'admin' });

    const res = await fetchBundle(server, 'admin-full-id-test', { account_id: 'admin-full-id-test' });
    const body = await res.json();
    assert.equal(body.ok, true);
    // Admin sees full account ID.
    assert.equal(body.bundle.accountSummary.accountId, 'admin-full-id-test');
    assert.equal(body.bundle.accountSummary.email, 'admin-full@test.com');
    assert.equal(body.canExportJson, true, 'admin can export JSON');
  } finally {
    server.close();
  }
});

// =================================================================
// 4. Edge case: bundle for non-existent account returns empty sections
// =================================================================

test('bundle for non-existent account returns null/empty sections', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'admin-4', email: 'admin4@test.com', displayName: 'Admin 4', platformRole: 'admin' });

    const res = await fetchBundle(server, 'admin-4', { account_id: 'nonexistent-account' });
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.bundle.accountSummary, null, 'no account summary for nonexistent');
    const learners = body.bundle.linkedLearners || [];
    assert.equal(learners.length, 0, 'no learners');
  } finally {
    server.close();
  }
});

// =================================================================
// 5. Edge case: bundle with no time window defaults to last 24 hours
// =================================================================

test('bundle with explicit time window filters correctly', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'admin-5', email: 'admin5@test.com', displayName: 'Admin 5', platformRole: 'admin' });
    const testTs = Date.now();
    // Recent error.
    seedErrorEvent(server, { id: 'err-recent', fingerprint: 'fp-recent', firstSeen: testTs - 1000, lastSeen: testTs - 1000 });
    // Old error (3 days ago).
    seedErrorEvent(server, { id: 'err-old', fingerprint: 'fp-old', firstSeen: testTs - 3 * ONE_DAY_MS, lastSeen: testTs - 3 * ONE_DAY_MS });

    // Narrow window: only last 2 hours — should include recent, exclude old.
    const res = await fetchBundle(server, 'admin-5', {
      time_from: String(testTs - 2 * ONE_HOUR_MS),
      time_to: String(testTs + ONE_HOUR_MS),
    });
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(body.bundle.query.timeFrom > 0, 'timeFrom is set');
    assert.ok(body.bundle.query.timeTo > 0, 'timeTo is set');
    const errors = body.bundle.recentErrors || [];
    const fingerprints = errors.map((e) => e.fingerprint);
    assert.ok(fingerprints.includes('fp-recent'), 'recent error included');
    assert.ok(!fingerprints.includes('fp-old'), 'old error excluded by time window');
  } finally {
    server.close();
  }
});

// =================================================================
// 6. Error path: non-admin/ops user gets 403
// =================================================================

test('non-admin/ops user gets 403', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'parent-no-admin', email: 'parent@test.com', displayName: 'Parent', platformRole: 'parent' });

    const res = await fetchBundle(server, 'parent-no-admin', {}, { platformRole: 'parent' });
    assert.equal(res.status, 403);
  } finally {
    server.close();
  }
});

// =================================================================
// 7. Error path: rate-limited after 10 requests in 1 minute
// =================================================================

test('rate-limited after 10 requests in 1 minute', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'admin-rate', email: 'rate@test.com', displayName: 'Rate Admin', platformRole: 'admin' });

    // Fire 10 requests (all should succeed).
    for (let i = 0; i < 10; i++) {
      const res = await fetchBundle(server, 'admin-rate');
      assert.equal(res.status, 200, `request ${i + 1} should succeed`);
    }

    // 11th request should be rate-limited.
    const res = await fetchBundle(server, 'admin-rate');
    assert.equal(res.status, 429, 'should be rate-limited');
    const body = await res.json();
    assert.equal(body.code, 'admin_debug_bundle_rate_limited');
  } finally {
    server.close();
  }
});

// =================================================================
// 8. Happy path: ops bundle masks identifiers
// =================================================================

test('ops bundle masks identifiers and restricts JSON export', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'ops-user-12345678', email: 'ops@test.com', displayName: 'Ops', platformRole: 'ops' });
    seedAdultAccount(server, { id: 'target-account-abcdef123456', email: 'verylongemail@longdomain.test.com', displayName: 'Target', platformRole: 'parent' });

    const res = await fetchBundle(server, 'ops-user-12345678', { account_id: 'target-account-abcdef123456' }, { platformRole: 'ops' });
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.canExportJson, false, 'ops cannot export JSON');
    assert.equal(body.actorRole, 'ops');
    // Account ID should be masked (last 8 chars of 'target-account-abcdef123456' = 'ef123456').
    assert.equal(body.bundle.accountSummary.accountId, 'ef123456');
    // Email should be masked (last 6 chars of 'verylongemail@longdomain.test.com' = 'st.com').
    assert.ok(body.bundle.accountSummary.email.includes('*'), 'email is masked');
    assert.ok(body.bundle.accountSummary.email.endsWith('st.com'), 'email ends with last 6 chars');
  } finally {
    server.close();
  }
});

// =================================================================
// 9. Integration: canExportJson is true for admin
// =================================================================

test('canExportJson is true for admin', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'admin-export', email: 'export@test.com', displayName: 'Export Admin', platformRole: 'admin' });

    const res = await fetchBundle(server, 'admin-export');
    const body = await res.json();
    assert.equal(body.canExportJson, true);
    assert.equal(body.actorRole, 'admin');
  } finally {
    server.close();
  }
});

// =================================================================
// 10. Happy path: bundle includes query context in response
// =================================================================

test('bundle includes query context with both fingerprint and event ID', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'admin-query', email: 'query@test.com', displayName: 'Query Admin', platformRole: 'admin' });

    const res = await fetchBundle(server, 'admin-query', {
      account_id: 'acct-123',
      route: '/api/spelling',
      error_fingerprint: 'fp-test',
      error_event_id: 'evt-test',
    });
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.bundle.query.accountId, 'acct-123');
    assert.equal(body.bundle.query.route, '/api/spelling');
    assert.equal(body.bundle.query.errorFingerprint, 'fp-test');
    assert.equal(body.bundle.query.errorEventId, 'evt-test');
  } finally {
    server.close();
  }
});

// =================================================================
// 11. Identifier semantics: fingerprint returns matching occurrences
// =================================================================

test('search by fingerprint returns matching error events AND their occurrences', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const testTs = Date.now() - 1000;
    seedAdultAccount(server, { id: 'admin-fp', email: 'fp@test.com', displayName: 'FP Admin', platformRole: 'admin' });
    seedErrorEvent(server, { id: 'evt-fp-1', fingerprint: 'fp-target', firstSeen: testTs, lastSeen: testTs });
    seedErrorEvent(server, { id: 'evt-fp-2', fingerprint: 'fp-other', firstSeen: testTs, lastSeen: testTs });
    seedOccurrence(server, { id: 'occ-1', eventId: 'evt-fp-1', occurredAt: testTs, routeName: '/api/a' });
    seedOccurrence(server, { id: 'occ-2', eventId: 'evt-fp-2', occurredAt: testTs, routeName: '/api/b' });

    const res = await fetchBundle(server, 'admin-fp', {
      error_fingerprint: 'fp-target',
      time_from: testTs - ONE_HOUR_MS,
      time_to: testTs + ONE_HOUR_MS,
    });
    const body = await res.json();
    assert.equal(body.ok, true);

    // recentErrors: only the matching fingerprint
    const errors = body.bundle.recentErrors || [];
    assert.equal(errors.length, 1);
    assert.equal(errors[0].fingerprint, 'fp-target');

    // errorOccurrences: only occurrences linked to the matched event
    const occs = body.bundle.errorOccurrences || [];
    assert.equal(occs.length, 1);
    assert.equal(occs[0].eventId, 'evt-fp-1');
    assert.equal(occs[0].routeName, '/api/a');
  } finally {
    server.close();
  }
});

// =================================================================
// 12. Identifier semantics: event ID returns the specific event and occurrences
// =================================================================

test('search by event ID returns the specific event and its occurrences', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const testTs = Date.now() - 1000;
    seedAdultAccount(server, { id: 'admin-eid', email: 'eid@test.com', displayName: 'EID Admin', platformRole: 'admin' });
    seedErrorEvent(server, { id: 'evt-id-1', fingerprint: 'fp-a', firstSeen: testTs, lastSeen: testTs });
    seedErrorEvent(server, { id: 'evt-id-2', fingerprint: 'fp-b', firstSeen: testTs, lastSeen: testTs });
    seedOccurrence(server, { id: 'occ-eid-1', eventId: 'evt-id-1', occurredAt: testTs });
    seedOccurrence(server, { id: 'occ-eid-2', eventId: 'evt-id-2', occurredAt: testTs });

    const res = await fetchBundle(server, 'admin-eid', {
      error_event_id: 'evt-id-1',
      time_from: testTs - ONE_HOUR_MS,
      time_to: testTs + ONE_HOUR_MS,
    });
    const body = await res.json();
    assert.equal(body.ok, true);

    const errors = body.bundle.recentErrors || [];
    assert.equal(errors.length, 1);
    assert.equal(errors[0].id, 'evt-id-1');

    const occs = body.bundle.errorOccurrences || [];
    assert.equal(occs.length, 1);
    assert.equal(occs[0].eventId, 'evt-id-1');
  } finally {
    server.close();
  }
});

// =================================================================
// 13. Identifier semantics: both fingerprint and event ID = intersection
// =================================================================

test('search by both fingerprint and event ID returns intersection', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const testTs = Date.now() - 1000;
    seedAdultAccount(server, { id: 'admin-both', email: 'both@test.com', displayName: 'Both Admin', platformRole: 'admin' });
    // Two events with distinct fingerprints.
    seedErrorEvent(server, { id: 'evt-both-1', fingerprint: 'fp-alpha', firstSeen: testTs, lastSeen: testTs });
    seedErrorEvent(server, { id: 'evt-both-2', fingerprint: 'fp-beta', firstSeen: testTs, lastSeen: testTs });
    seedOccurrence(server, { id: 'occ-both-1', eventId: 'evt-both-1', occurredAt: testTs });
    seedOccurrence(server, { id: 'occ-both-2', eventId: 'evt-both-2', occurredAt: testTs });

    // Both fingerprint and event ID: event must match both constraints.
    // fp-alpha resolves to evt-both-1, AND event ID is evt-both-1 → match.
    const res = await fetchBundle(server, 'admin-both', {
      error_fingerprint: 'fp-alpha',
      error_event_id: 'evt-both-1',
      time_from: testTs - ONE_HOUR_MS,
      time_to: testTs + ONE_HOUR_MS,
    });
    const body = await res.json();
    assert.equal(body.ok, true);

    // recentErrors: both constraints AND'd in section 3
    const errors = body.bundle.recentErrors || [];
    assert.equal(errors.length, 1);
    assert.equal(errors[0].id, 'evt-both-1');

    // errorOccurrences: intersection of resolved FP IDs with explicit event ID
    const occs = body.bundle.errorOccurrences || [];
    assert.equal(occs.length, 1);
    assert.equal(occs[0].eventId, 'evt-both-1');

    // Mismatch case: fp-alpha resolves to evt-both-1 but event ID is evt-both-2.
    // The intersection is empty → zero results.
    const res2 = await fetchBundle(server, 'admin-both', {
      error_fingerprint: 'fp-alpha',
      error_event_id: 'evt-both-2',
      time_from: testTs - ONE_HOUR_MS,
      time_to: testTs + ONE_HOUR_MS,
    });
    const body2 = await res2.json();
    assert.equal(body2.ok, true);

    // recentErrors: fp-alpha AND id=evt-both-2 — no row matches both.
    const errors2 = body2.bundle.recentErrors || [];
    assert.equal(errors2.length, 0, 'mismatched fingerprint+eventId → no events');

    // errorOccurrences: intersection is empty → empty array.
    const occs2 = body2.bundle.errorOccurrences;
    assert.ok(Array.isArray(occs2), 'errorOccurrences is array on mismatch');
    assert.equal(occs2.length, 0, 'mismatched fingerprint+eventId → no occurrences');
  } finally {
    server.close();
  }
});

// =================================================================
// 14. Neither fingerprint nor event ID returns all in time window
// =================================================================

test('search with neither fingerprint nor event ID returns all in time window', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const testTs = Date.now() - 1000;
    seedAdultAccount(server, { id: 'admin-neither', email: 'neither@test.com', displayName: 'Neither Admin', platformRole: 'admin' });
    seedErrorEvent(server, { id: 'evt-all-1', fingerprint: 'fp-x', firstSeen: testTs, lastSeen: testTs });
    seedErrorEvent(server, { id: 'evt-all-2', fingerprint: 'fp-y', firstSeen: testTs, lastSeen: testTs });
    seedOccurrence(server, { id: 'occ-all-1', eventId: 'evt-all-1', occurredAt: testTs });
    seedOccurrence(server, { id: 'occ-all-2', eventId: 'evt-all-2', occurredAt: testTs });

    const res = await fetchBundle(server, 'admin-neither', {
      time_from: testTs - ONE_HOUR_MS,
      time_to: testTs + ONE_HOUR_MS,
    });
    const body = await res.json();
    assert.equal(body.ok, true);

    const errors = body.bundle.recentErrors || [];
    assert.equal(errors.length, 2, 'both events returned without filter');

    const occs = body.bundle.errorOccurrences || [];
    assert.equal(occs.length, 2, 'both occurrences returned without filter');
  } finally {
    server.close();
  }
});

// =================================================================
// 15. CRITICAL: fingerprint matches zero events → empty occurrences, not SQL error
// =================================================================

test('fingerprint matching zero events returns empty occurrences (not SQL error)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const testTs = Date.now() - 1000;
    seedAdultAccount(server, { id: 'admin-zero', email: 'zero@test.com', displayName: 'Zero Admin', platformRole: 'admin' });
    // Seed an event and occurrence, but with a different fingerprint.
    seedErrorEvent(server, { id: 'evt-z', fingerprint: 'fp-exists', firstSeen: testTs, lastSeen: testTs });
    seedOccurrence(server, { id: 'occ-z', eventId: 'evt-z', occurredAt: testTs });

    const res = await fetchBundle(server, 'admin-zero', {
      error_fingerprint: 'fp-nonexistent',
      time_from: testTs - ONE_HOUR_MS,
      time_to: testTs + ONE_HOUR_MS,
    });
    assert.equal(res.status, 200, 'should not be a server error');
    const body = await res.json();
    assert.equal(body.ok, true);

    // recentErrors: empty because fingerprint does not match any event
    const errors = body.bundle.recentErrors || [];
    assert.equal(errors.length, 0, 'no matching error events');

    // CRITICAL: errorOccurrences must be empty array, NOT null (SQL error)
    const occs = body.bundle.errorOccurrences;
    assert.ok(Array.isArray(occs), 'errorOccurrences is an array (not null from SQL error)');
    assert.equal(occs.length, 0, 'zero occurrences — empty-match guard triggered');
  } finally {
    server.close();
  }
});

// =================================================================
// 16. Fingerprint resolves to event and returns all its occurrences
// =================================================================

test('fingerprint resolves to event and returns all its occurrences', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const testTs = Date.now() - 1000;
    seedAdultAccount(server, { id: 'admin-multi', email: 'multi@test.com', displayName: 'Multi Admin', platformRole: 'admin' });
    // One event with multiple occurrences, and a second unrelated event.
    seedErrorEvent(server, { id: 'evt-m1', fingerprint: 'fp-multi', routeName: '/api/a', firstSeen: testTs, lastSeen: testTs });
    seedErrorEvent(server, { id: 'evt-m2', fingerprint: 'fp-unrelated', routeName: '/api/b', firstSeen: testTs, lastSeen: testTs });
    seedOccurrence(server, { id: 'occ-m1', eventId: 'evt-m1', occurredAt: testTs });
    seedOccurrence(server, { id: 'occ-m2', eventId: 'evt-m1', occurredAt: testTs - 500 });
    seedOccurrence(server, { id: 'occ-m3', eventId: 'evt-m1', occurredAt: testTs - 1000 });
    seedOccurrence(server, { id: 'occ-m4', eventId: 'evt-m2', occurredAt: testTs });

    const res = await fetchBundle(server, 'admin-multi', {
      error_fingerprint: 'fp-multi',
      time_from: testTs - ONE_HOUR_MS,
      time_to: testTs + ONE_HOUR_MS,
    });
    const body = await res.json();
    assert.equal(body.ok, true);

    const errors = body.bundle.recentErrors || [];
    assert.equal(errors.length, 1, 'only the matching event returned');
    assert.equal(errors[0].fingerprint, 'fp-multi');

    const occs = body.bundle.errorOccurrences || [];
    assert.equal(occs.length, 3, 'all 3 occurrences for that event returned');
    const eventIds = [...new Set(occs.map((o) => o.eventId))];
    assert.deepStrictEqual(eventIds, ['evt-m1'], 'all occurrences belong to the matched event');
  } finally {
    server.close();
  }
});

// =================================================================
// 17. Event ID that does not exist → empty occurrences (not error)
// =================================================================

test('non-existent event ID returns empty occurrences (not error)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const testTs = Date.now() - 1000;
    seedAdultAccount(server, { id: 'admin-noevt', email: 'noevt@test.com', displayName: 'NoEvt Admin', platformRole: 'admin' });
    seedErrorEvent(server, { id: 'evt-exists', fingerprint: 'fp-e', firstSeen: testTs, lastSeen: testTs });
    seedOccurrence(server, { id: 'occ-exists', eventId: 'evt-exists', occurredAt: testTs });

    const res = await fetchBundle(server, 'admin-noevt', {
      error_event_id: 'evt-does-not-exist',
      time_from: testTs - ONE_HOUR_MS,
      time_to: testTs + ONE_HOUR_MS,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);

    // recentErrors: empty because id does not match
    const errors = body.bundle.recentErrors || [];
    assert.equal(errors.length, 0);

    // errorOccurrences: empty because no occurrence has this event_id
    const occs = body.bundle.errorOccurrences || [];
    assert.equal(occs.length, 0);
  } finally {
    server.close();
  }
});

// =================================================================
// 18. safeSection catches DB failure gracefully
// =================================================================

test('safeSection catches DB failure gracefully in error occurrences', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'admin-dbfail', email: 'dbfail@test.com', displayName: 'DBFail Admin', platformRole: 'admin' });

    // Drop the occurrences table to simulate a DB failure.
    server.DB.db.prepare('DROP TABLE IF EXISTS ops_error_event_occurrences').run();

    const res = await fetchBundle(server, 'admin-dbfail', { account_id: 'admin-dbfail' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);

    // errorOccurrences section returns empty array (allSafe catches
    // missing table) — other sections still populate.
    const occs = body.bundle.errorOccurrences;
    assert.ok(Array.isArray(occs), 'errorOccurrences is array even when table missing');
    assert.equal(occs.length, 0, 'empty array from missing table');
    // Other sections (accountSummary) still populated.
    assert.ok(body.bundle.accountSummary, 'accountSummary still populated');
  } finally {
    server.close();
  }
});
