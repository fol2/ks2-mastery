// Phase D / U15 coverage: `updateOpsErrorEventStatus` writes
// `resolved_in_release` + `last_status_change_at` on transitions.
//
// Contract:
// - open → resolved → resolved_in_release = env.BUILD_HASH; last_status_change_at = now.
// - open → investigating → resolved_in_release remains NULL; last_status_change_at = now.
// - BUILD_HASH absent (env var unset) → resolved_in_release = NULL on → resolved.
// - resolved → open → resolved_in_release is NOT cleared (the column
//   records the release that previously resolved it; auto-reopen uses
//   this hash as the comparator).
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U15

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

function seedAdminActor(server, { id = 'adult-admin', platformRole = 'admin' } = {}) {
  const now = Date.now();
  server.DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, repo_revision, account_type, demo_expires_at)
    VALUES (?, NULL, NULL, ?, NULL, ?, ?, 0, 'real', NULL)
  `).run(id, platformRole, now, now);
  return id;
}

function seedErrorEvent(server, { id = 'evt-1', status = 'open' } = {}) {
  const now = Date.now();
  server.DB.db.prepare(`
    INSERT INTO ops_error_events (
      id, fingerprint, error_kind, message_first_line, first_frame, route_name,
      user_agent, account_id, occurrence_count, first_seen, last_seen, status
    )
    VALUES (?, ?, 'TypeError', 'x is undefined', 'frame', '/api/foo', 'UA', NULL, 1, ?, ?, ?)
  `).run(id, `fp-${id}`, now, now, status);
  return id;
}

function readEvent(server, eventId) {
  return server.DB.db.prepare(`
    SELECT id, status, resolved_in_release, last_status_change_at
    FROM ops_error_events WHERE id = ?
  `).get(eventId);
}

async function putStatus(server, actor, eventId, body) {
  return server.fetchAs(actor, `https://repo.test/api/admin/ops/error-events/${encodeURIComponent(eventId)}/status`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-platform-role': 'admin',
    },
    body: JSON.stringify(body),
  });
}

test('U15 release — open→resolved writes resolved_in_release = env.BUILD_HASH and last_status_change_at', async () => {
  const server = createWorkerRepositoryServer({ env: { BUILD_HASH: 'deadbee' } });
  try {
    seedAdminActor(server);
    const eventId = seedErrorEvent(server);

    const before = Date.now();
    const response = await putStatus(server, 'adult-admin', eventId, {
      status: 'resolved',
      expectedPreviousStatus: 'open',
      mutation: { requestId: 'req-r-1', correlationId: 'corr-r-1' },
    });
    const after = Date.now();
    assert.equal(response.status, 200);

    const row = readEvent(server, eventId);
    assert.equal(row.status, 'resolved');
    assert.equal(row.resolved_in_release, 'deadbee');
    assert.ok(Number(row.last_status_change_at) >= before - 1);
    assert.ok(Number(row.last_status_change_at) <= after + 1);
  } finally {
    server.close();
  }
});

test('U15 release — open→investigating writes last_status_change_at but not resolved_in_release', async () => {
  const server = createWorkerRepositoryServer({ env: { BUILD_HASH: 'beefcafe' } });
  try {
    seedAdminActor(server);
    const eventId = seedErrorEvent(server);

    const response = await putStatus(server, 'adult-admin', eventId, {
      status: 'investigating',
      expectedPreviousStatus: 'open',
      mutation: { requestId: 'req-r-2', correlationId: 'corr-r-2' },
    });
    assert.equal(response.status, 200);

    const row = readEvent(server, eventId);
    assert.equal(row.status, 'investigating');
    assert.equal(row.resolved_in_release, null);
    assert.ok(Number(row.last_status_change_at) > 0);
  } finally {
    server.close();
  }
});

test('U15 release — BUILD_HASH absent → resolved_in_release = NULL on → resolved', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdminActor(server);
    const eventId = seedErrorEvent(server);

    const response = await putStatus(server, 'adult-admin', eventId, {
      status: 'resolved',
      expectedPreviousStatus: 'open',
      mutation: { requestId: 'req-r-3', correlationId: 'corr-r-3' },
    });
    assert.equal(response.status, 200);

    const row = readEvent(server, eventId);
    assert.equal(row.status, 'resolved');
    assert.equal(row.resolved_in_release, null);
    assert.ok(Number(row.last_status_change_at) > 0);
  } finally {
    server.close();
  }
});

test('U15 release — resolved→open PRESERVES resolved_in_release (auto-reopen comparator)', async () => {
  const server = createWorkerRepositoryServer({ env: { BUILD_HASH: 'abcdef1' } });
  try {
    seedAdminActor(server);
    const eventId = seedErrorEvent(server);

    // open → resolved stamps the release.
    await putStatus(server, 'adult-admin', eventId, {
      status: 'resolved',
      expectedPreviousStatus: 'open',
      mutation: { requestId: 'req-r-4a', correlationId: 'corr-r-4a' },
    });
    const afterResolve = readEvent(server, eventId);
    assert.equal(afterResolve.resolved_in_release, 'abcdef1');

    // resolved → open preserves the release.
    await putStatus(server, 'adult-admin', eventId, {
      status: 'open',
      expectedPreviousStatus: 'resolved',
      mutation: { requestId: 'req-r-4b', correlationId: 'corr-r-4b' },
    });
    const afterReopen = readEvent(server, eventId);
    assert.equal(afterReopen.status, 'open');
    assert.equal(afterReopen.resolved_in_release, 'abcdef1');
    // Timestamp advances on every transition.
    assert.ok(Number(afterReopen.last_status_change_at) >= Number(afterResolve.last_status_change_at));
  } finally {
    server.close();
  }
});
