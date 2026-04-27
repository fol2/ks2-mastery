// U5 (P3): error occurrence timeline — capture + read.
//
// Test scenarios:
//   1. Happy path: recording error creates both group row and occurrence row
//   2. Happy path: 21st occurrence prunes oldest -> exactly 20 remain
//   3. Happy path: occurrence read returns latest-first ordering
//   4. Happy path: occurrence includes release, route, account_id, timestamp
//   5. Edge case: occurrence for anonymous/demo error has null account_id
//   6. Edge case: occurrence read for non-existent event_id returns empty array
//   7. Error path: non-admin/ops user gets 403

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

function seedAdultAccount(server, { id, platformRole = 'parent' } = {}) {
  const now = Date.now();
  server.DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, repo_revision, account_type, demo_expires_at)
    VALUES (?, NULL, NULL, ?, NULL, ?, ?, 0, 'real', NULL)
  `).run(id, platformRole, now, now);
}

async function postErrorEvent(server, { release = 'abc1234', routeName = '/dashboard', errorKind = 'TypeError', message = 'x is undefined', firstFrame = 'at foo (bar.js:1)' } = {}) {
  const response = await server.fetchRaw('https://repo.test/api/ops/error-event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      errorKind,
      messageFirstLine: message,
      firstFrame,
      routeName,
      release,
      userAgent: 'TestUA/1.0',
    }),
  });
  return response.json();
}

async function fetchOccurrences(server, accountId, eventId, { platformRole = 'admin' } = {}) {
  return server.fetchAs(accountId, `https://repo.test/api/admin/ops/error-occurrences/${encodeURIComponent(eventId)}`, {
    method: 'GET',
    headers: {
      origin: 'https://repo.test',
      'x-ks2-dev-platform-role': platformRole,
    },
  });
}

test('U5 occurrence — recording error creates both group row and occurrence row', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin' });
    const result = await postErrorEvent(server);
    assert.equal(result.ok, true);
    assert.ok(result.eventId, 'eventId returned');

    // Verify occurrence row exists in the DB directly.
    const occCount = server.DB.db.prepare(
      'SELECT COUNT(*) AS n FROM ops_error_event_occurrences WHERE event_id = ?',
    ).get(result.eventId);
    assert.equal(occCount.n, 1, 'exactly one occurrence row for fresh insert');

    // Verify via the API.
    const response = await fetchOccurrences(server, 'adult-admin', result.eventId);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.occurrences.length, 1);
    assert.equal(payload.occurrences[0].eventId, result.eventId);
  } finally {
    server.close();
  }
});

test('U5 occurrence — 21st occurrence prunes oldest -> exactly 20 remain', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin' });
    // First event creates the group row.
    const first = await postErrorEvent(server);
    assert.equal(first.ok, true);
    const eventId = first.eventId;

    // Insert 20 more (for 21 total). Each dedup hit adds an occurrence.
    for (let i = 0; i < 20; i++) {
      const result = await postErrorEvent(server);
      assert.equal(result.ok, true);
      assert.equal(result.deduped, true, `iteration ${i} should be a dedup`);
    }

    // Verify exactly 20 occurrence rows remain (ring buffer pruned the oldest).
    const occCount = server.DB.db.prepare(
      'SELECT COUNT(*) AS n FROM ops_error_event_occurrences WHERE event_id = ?',
    ).get(eventId);
    assert.equal(occCount.n, 20, 'ring buffer caps at 20');
  } finally {
    server.close();
  }
});

test('U5 occurrence — read returns latest-first ordering', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin' });
    const first = await postErrorEvent(server);
    // Second dedup hit adds another occurrence.
    await postErrorEvent(server);

    const response = await fetchOccurrences(server, 'adult-admin', first.eventId);
    const payload = await response.json();
    assert.equal(payload.occurrences.length, 2);
    // Latest first.
    assert.ok(
      payload.occurrences[0].occurredAt >= payload.occurrences[1].occurredAt,
      'occurrences ordered latest-first',
    );
  } finally {
    server.close();
  }
});

test('U5 occurrence — includes release, route, account_id, timestamp', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin' });
    const result = await postErrorEvent(server, { release: 'deadbeef', routeName: '/api/test' });
    const response = await fetchOccurrences(server, 'adult-admin', result.eventId);
    const payload = await response.json();
    const occ = payload.occurrences[0];
    assert.ok(occ.occurredAt > 0, 'timestamp present');
    assert.equal(occ.release, 'deadbeef');
    assert.equal(occ.routeName, '/api/test');
    // Anonymous error ingest — accountId is null because no session was
    // attached in the request (fetchRaw does not inject dev-account-id).
    assert.equal(occ.accountId, null);
  } finally {
    server.close();
  }
});

test('U5 occurrence — anonymous/demo error has null account_id', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin' });
    // Post without any session headers — anonymous.
    const result = await postErrorEvent(server, { errorKind: 'ReferenceError', message: 'y not defined' });
    assert.equal(result.ok, true);

    const response = await fetchOccurrences(server, 'adult-admin', result.eventId);
    const payload = await response.json();
    assert.equal(payload.occurrences[0].accountId, null, 'anonymous event has null accountId');
  } finally {
    server.close();
  }
});

test('U5 occurrence — read for non-existent event_id returns empty array', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin' });
    const response = await fetchOccurrences(server, 'adult-admin', 'does-not-exist');
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.occurrences.length, 0);
  } finally {
    server.close();
  }
});

test('U5 occurrence — non-admin/ops user gets 403', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-parent', platformRole: 'parent' });
    const response = await fetchOccurrences(server, 'adult-parent', 'some-event-id', { platformRole: 'parent' });
    assert.equal(response.status, 403);
  } finally {
    server.close();
  }
});

test('U5 occurrence — ops user can read but account attribution is null (R25)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-ops', platformRole: 'ops' });
    // Seed an error event directly.
    const result = await postErrorEvent(server);
    assert.equal(result.ok, true);

    const response = await fetchOccurrences(server, 'adult-ops', result.eventId, { platformRole: 'ops' });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.occurrences.length, 1);
    // Ops sees null accountId per R25.
    assert.equal(payload.occurrences[0].accountId, null);
  } finally {
    server.close();
  }
});
