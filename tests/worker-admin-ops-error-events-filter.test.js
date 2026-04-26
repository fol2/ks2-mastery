// Phase E / U19 coverage: `/api/admin/ops/error-events` accepts URL
// query parameters that compose a multi-predicate filter:
//   - status (existing, still supported): exact match
//   - route: case-insensitive substring, max 64 chars
//   - kind: exact match, max 128 chars
//   - lastSeenAfter / lastSeenBefore: inclusive numeric timestamps
//     (ms since epoch). Bounded to the 90-day retention window.
//   - release: SHA-shaped filter against `first_seen_release`
//     ("new in release <SHA>").
//   - reopenedAfterResolved: boolean toggle that combines three
//     predicates (status=open + resolved_in_release NOT NULL +
//     last_status_change_at NOT NULL).
//
// All filters AND together. Empty filters degrade to the unfiltered
// list. Malformed values surface as 400 `validation_failed` so the
// client can keep local form state consistent.
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U19

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

function seedAdmin(server) {
  const now = Date.now();
  server.DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, repo_revision, account_type, demo_expires_at)
    VALUES ('adult-admin', NULL, NULL, 'admin', NULL, ?, ?, 0, 'real', NULL)
  `).run(now, now);
}

function seedRow(server, row) {
  const now = Date.now();
  const merged = {
    status: 'open',
    firstSeen: now,
    lastSeen: now,
    firstSeenRelease: null,
    lastSeenRelease: null,
    resolvedInRelease: null,
    lastStatusChangeAt: null,
    routeName: '/api/foo',
    errorKind: 'TypeError',
    ...row,
  };
  server.DB.db.prepare(`
    INSERT INTO ops_error_events (
      id, fingerprint, error_kind, message_first_line, first_frame, route_name,
      user_agent, account_id, occurrence_count, first_seen, last_seen, status,
      first_seen_release, last_seen_release, resolved_in_release, last_status_change_at
    )
    VALUES (?, ?, ?, 'boom', 'frame', ?, 'UA', NULL, 1, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    merged.id, `fp-${merged.id}`, merged.errorKind, merged.routeName,
    merged.firstSeen, merged.lastSeen, merged.status,
    merged.firstSeenRelease, merged.lastSeenRelease, merged.resolvedInRelease,
    merged.lastStatusChangeAt,
  );
}

async function fetchWithFilter(server, query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined) params.set(key, String(value));
  }
  const url = `https://repo.test/api/admin/ops/error-events?${params.toString()}`;
  return server.fetchAs('adult-admin', url, {
    method: 'GET',
    headers: {
      origin: 'https://repo.test',
      'x-ks2-dev-platform-role': 'admin',
    },
  });
}

test('U19 filter — status + route substring combine (AND)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdmin(server);
    seedRow(server, { id: 'evt-api', status: 'open', routeName: '/api/dashboard' });
    seedRow(server, { id: 'evt-web', status: 'open', routeName: '/web/home' });
    seedRow(server, { id: 'evt-api-resolved', status: 'resolved', routeName: '/api/dashboard' });

    const response = await fetchWithFilter(server, { status: 'open', route: '/api/' });
    assert.equal(response.status, 200);
    const payload = await response.json();
    const ids = payload.entries.map((entry) => entry.id).sort();
    assert.deepEqual(ids, ['evt-api']);
  } finally {
    server.close();
  }
});

test('U19 filter — kind exact match filters correctly', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdmin(server);
    seedRow(server, { id: 'evt-type', errorKind: 'TypeError' });
    seedRow(server, { id: 'evt-ref', errorKind: 'ReferenceError' });

    const response = await fetchWithFilter(server, { kind: 'ReferenceError' });
    assert.equal(response.status, 200);
    const payload = await response.json();
    const ids = payload.entries.map((entry) => entry.id).sort();
    assert.deepEqual(ids, ['evt-ref']);
  } finally {
    server.close();
  }
});

test('U19 filter — date-range with no matches returns empty entries list', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdmin(server);
    const now = Date.now();
    seedRow(server, { id: 'evt-now', lastSeen: now });

    const yesterday = now - (24 * 60 * 60 * 1000);
    const twoDaysAgo = now - (2 * 24 * 60 * 60 * 1000);
    const response = await fetchWithFilter(server, {
      lastSeenAfter: String(twoDaysAgo),
      lastSeenBefore: String(yesterday),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.entries.length, 0);
    assert.ok(typeof payload.generatedAt === 'number', 'generatedAt still populated');
  } finally {
    server.close();
  }
});

test('U19 filter — route LIKE is parameterised; SQL metacharacters do not inject', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdmin(server);
    seedRow(server, { id: 'evt-safe', routeName: '/api/foo' });

    // A route filter containing a semicolon + DROP would execute if the
    // handler stuffed the value into the SQL string directly. Because we
    // bind via `?`, this returns simply "no rows match the substring".
    const response = await fetchWithFilter(server, { route: '%\'; DROP TABLE ops_error_events;--' });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.entries.length, 0);

    // Table still exists and seeded row still present after the "attack".
    const probe = await fetchWithFilter(server, { route: '/api/' });
    const probeBody = await probe.json();
    assert.equal(probeBody.entries.length, 1);
  } finally {
    server.close();
  }
});

test('U19 filter — oversized route (>64 chars) rejected with 400 validation_failed', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdmin(server);
    const oversized = 'a'.repeat(65);
    const response = await fetchWithFilter(server, { route: oversized });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_failed');
  } finally {
    server.close();
  }
});

test('U19 filter — release filter matches first_seen_release, not last_seen_release', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdmin(server);
    seedRow(server, { id: 'evt-first', firstSeenRelease: 'abc1234', lastSeenRelease: 'def5678' });
    seedRow(server, { id: 'evt-last', firstSeenRelease: 'def5678', lastSeenRelease: 'abc1234' });

    const response = await fetchWithFilter(server, { release: 'abc1234' });
    assert.equal(response.status, 200);
    const payload = await response.json();
    const ids = payload.entries.map((entry) => entry.id).sort();
    // Only evt-first (its first_seen_release is 'abc1234') matches.
    assert.deepEqual(ids, ['evt-first']);
  } finally {
    server.close();
  }
});

test('U19 filter — release filter rejects non-SHA input with 400 validation_failed', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdmin(server);
    const response = await fetchWithFilter(server, { release: 'principal' });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_failed');
    assert.equal(payload.field, 'release');
  } finally {
    server.close();
  }
});

test('U19 filter — reopenedAfterResolved returns only the reopened-row class', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdmin(server);
    const now = Date.now();
    // Resolved row — doesn't match.
    seedRow(server, {
      id: 'evt-resolved',
      status: 'resolved',
      resolvedInRelease: 'abc1234',
      lastStatusChangeAt: now - 1000,
    });
    // Open row that was auto-reopened (has resolved_in_release + last_status_change_at).
    seedRow(server, {
      id: 'evt-reopened',
      status: 'open',
      resolvedInRelease: 'abc1234',
      lastStatusChangeAt: now - 500,
    });
    // Open row that was NEVER resolved — doesn't match (no resolved_in_release).
    seedRow(server, {
      id: 'evt-never-resolved',
      status: 'open',
      resolvedInRelease: null,
      lastStatusChangeAt: null,
    });

    const response = await fetchWithFilter(server, { reopenedAfterResolved: 'true' });
    assert.equal(response.status, 200);
    const payload = await response.json();
    const ids = payload.entries.map((entry) => entry.id).sort();
    assert.deepEqual(ids, ['evt-reopened']);
  } finally {
    server.close();
  }
});

test('U19 filter — no filter params returns the full unfiltered list', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdmin(server);
    seedRow(server, { id: 'evt-1' });
    seedRow(server, { id: 'evt-2' });
    seedRow(server, { id: 'evt-3' });

    const response = await fetchWithFilter(server, {});
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.entries.length, 3);
  } finally {
    server.close();
  }
});

test('U19 filter — lastSeenAfter > lastSeenBefore rejected', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdmin(server);
    const now = Date.now();
    const response = await fetchWithFilter(server, {
      lastSeenAfter: String(now),
      lastSeenBefore: String(now - (60 * 60 * 1000)),
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_failed');
  } finally {
    server.close();
  }
});

test('U19 filter — lastSeenAfter more than 90 days in the past rejected', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdmin(server);
    const ninetyDaysAgo = Date.now() - (91 * 24 * 60 * 60 * 1000);
    const response = await fetchWithFilter(server, {
      lastSeenAfter: String(ninetyDaysAgo),
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_failed');
  } finally {
    server.close();
  }
});
