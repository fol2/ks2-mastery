// Phase E / U18 coverage: `/api/admin/ops/error-events` returns the full
// drawer-ready payload, with R25 redaction applied per platform role:
//   - admin sees `accountIdMasked` populated from the last-6 chars
//   - ops sees `accountIdMasked` === null (PII-redacted)
//
// Release columns (`firstSeenRelease`, `lastSeenRelease`,
// `resolvedInRelease`) flow through unchanged for both roles — the
// release hash is not PII.
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U18

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

function seedErrorRow(server, { id = 'evt-1', accountId = 'adult-x-123456', ...rest } = {}) {
  const now = Date.now();
  const row = {
    firstSeenRelease: 'abc1234',
    lastSeenRelease: 'def5678',
    resolvedInRelease: 'abc1234',
    lastStatusChangeAt: now,
    status: 'resolved',
    ...rest,
  };
  // FK constraint: `ops_error_events.account_id` references
  // `adult_accounts(id)`. Seed a matching row when the caller supplies an
  // account id that has not already been seeded.
  if (accountId) {
    const existing = server.DB.db.prepare(
      'SELECT id FROM adult_accounts WHERE id = ?',
    ).get(accountId);
    if (!existing) {
      server.DB.db.prepare(`
        INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id,
          created_at, updated_at, repo_revision, account_type, demo_expires_at)
        VALUES (?, NULL, NULL, 'parent', NULL, ?, ?, 0, 'real', NULL)
      `).run(accountId, now, now);
    }
  }
  server.DB.db.prepare(`
    INSERT INTO ops_error_events (
      id, fingerprint, error_kind, message_first_line, first_frame, route_name,
      user_agent, account_id, occurrence_count, first_seen, last_seen, status,
      first_seen_release, last_seen_release, resolved_in_release, last_status_change_at
    )
    VALUES (?, ?, 'TypeError', 'x is undefined', 'at foo (bar.js:1)', '/api/foo', 'UA',
            ?, 3, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, `fp-${id}`, accountId, now - 1000, now, row.status,
    row.firstSeenRelease, row.lastSeenRelease, row.resolvedInRelease, row.lastStatusChangeAt,
  );
  return id;
}

async function fetchAs(server, accountId, platformRole) {
  return server.fetchAs(accountId, 'https://repo.test/api/admin/ops/error-events', {
    method: 'GET',
    headers: {
      origin: 'https://repo.test',
      'x-ks2-dev-platform-role': platformRole,
    },
  });
}

test('U18 drawer payload — admin reads release columns + accountIdMasked (last 6)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin' });
    seedErrorRow(server);
    const response = await fetchAs(server, 'adult-admin', 'admin');
    assert.equal(response.status, 200);
    const payload = await response.json();
    const entry = payload.entries[0];
    assert.equal(entry.firstSeenRelease, 'abc1234');
    assert.equal(entry.lastSeenRelease, 'def5678');
    assert.equal(entry.resolvedInRelease, 'abc1234');
    // Admin sees the masked account id (last 6 chars).
    assert.equal(typeof entry.accountIdMasked, 'string');
    assert.ok(entry.accountIdMasked.endsWith('123456') || entry.accountIdMasked.includes('123456'),
      `admin should see last-6 of account id, got ${entry.accountIdMasked}`);
    assert.equal(typeof entry.lastStatusChangeAt, 'number');
  } finally {
    server.close();
  }
});

test('U18 drawer payload — ops reads release columns but accountIdMasked is NULL (R25 redaction)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-ops', platformRole: 'ops' });
    seedErrorRow(server);
    const response = await fetchAs(server, 'adult-ops', 'ops');
    assert.equal(response.status, 200);
    const payload = await response.json();
    const entry = payload.entries[0];
    // Release strings are NOT PII — ops sees them.
    assert.equal(entry.firstSeenRelease, 'abc1234');
    assert.equal(entry.lastSeenRelease, 'def5678');
    assert.equal(entry.resolvedInRelease, 'abc1234');
    // Account attribution IS PII — ops-role sees NULL.
    assert.equal(entry.accountIdMasked, null);
  } finally {
    server.close();
  }
});

test('U18 drawer payload — NULL release columns serialise as JSON null', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin' });
    seedErrorRow(server, {
      id: 'evt-legacy',
      firstSeenRelease: null,
      lastSeenRelease: null,
      resolvedInRelease: null,
      lastStatusChangeAt: null,
    });
    const response = await fetchAs(server, 'adult-admin', 'admin');
    assert.equal(response.status, 200);
    const payload = await response.json();
    const entry = payload.entries.find((candidate) => candidate.id === 'evt-legacy');
    assert.ok(entry, 'evt-legacy present in response');
    assert.equal(entry.firstSeenRelease, null);
    assert.equal(entry.lastSeenRelease, null);
    assert.equal(entry.resolvedInRelease, null);
    assert.equal(entry.lastStatusChangeAt, null);
  } finally {
    server.close();
  }
});

test('U18 drawer payload — events with no account_id yield accountIdMasked === null for both roles', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin' });
    seedErrorRow(server, { id: 'evt-anon', accountId: null });
    const response = await fetchAs(server, 'adult-admin', 'admin');
    assert.equal(response.status, 200);
    const payload = await response.json();
    const entry = payload.entries.find((candidate) => candidate.id === 'evt-anon');
    assert.equal(entry.accountIdMasked, null);
  } finally {
    server.close();
  }
});
