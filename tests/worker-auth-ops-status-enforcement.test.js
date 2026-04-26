// Phase D / U14 coverage: auth-boundary enforcement for `ops_status` and
// `status_revision`.
//
// Contract:
// - active account with fresh session → every route passes.
// - suspended account → every authenticated route (GET + mutation) fails
//   with 403 `account_suspended`.
// - payment_hold account → GET routes pass, mutation routes fail with 403
//   `account_payment_hold`.
// - stale `status_revision_at_issue` → 401 `session_invalidated` on every
//   authenticated request.
// - legacy account (no metadata row) → no enforcement, request passes.
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U14

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

function seedAdultAccount(server, {
  id,
  email = null,
  displayName = null,
  platformRole = 'parent',
  now = Date.now(),
  accountType = 'real',
} = {}) {
  server.DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, repo_revision, account_type, demo_expires_at)
    VALUES (?, ?, ?, ?, NULL, ?, ?, 0, ?, NULL)
  `).run(id, email, displayName, platformRole, now, now, accountType);
}

function seedMetadata(server, accountId, {
  opsStatus = 'active',
  statusRevision = 0,
  rowVersion = 0,
} = {}) {
  server.DB.db.prepare(`
    INSERT INTO account_ops_metadata (
      account_id, ops_status, plan_label, tags_json, internal_notes,
      updated_at, updated_by_account_id, row_version, status_revision
    )
    VALUES (?, ?, NULL, '[]', NULL, ?, NULL, ?, ?)
  `).run(accountId, opsStatus, Date.now(), rowVersion, statusRevision);
}

function asAccount(server, accountId, extraHeaders = {}) {
  return async function fetchAs(path, init = {}) {
    return server.fetchAs(accountId, `https://repo.test${path}`, {
      ...init,
      headers: {
        origin: 'https://repo.test',
        ...(init.headers || {}),
        ...extraHeaders,
      },
    });
  };
}

test('U14 happy — active account passes GET and mutation routes', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, { id: 'adult-active', now });
    // No metadata row — treated as active with revision 0.

    const fetchAs = asAccount(server, 'adult-active');

    // GET /api/bootstrap (authenticated read)
    const boot = await fetchAs('/api/bootstrap', { method: 'GET' });
    assert.equal(boot.status, 200);

    // Mutation (learners PUT) should pass the capability check.
    const putLearners = await fetchAs('/api/learners', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ learners: [] }),
    });
    // Whatever the repository returns, we only care that it's NOT a
    // suspended / payment-hold / session-invalidated error.
    const putPayload = await putLearners.json();
    assert.notEqual(putLearners.status, 401);
    assert.notEqual(putLearners.status, 403);
    assert.notEqual(putPayload.code, 'account_suspended');
    assert.notEqual(putPayload.code, 'account_payment_hold');
    assert.notEqual(putPayload.code, 'session_invalidated');
  } finally {
    server.close();
  }
});

test('U14 suspended — authenticated GET fails with 403 account_suspended', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-suspended' });
    seedMetadata(server, 'adult-suspended', { opsStatus: 'suspended', statusRevision: 1, rowVersion: 1 });

    const fetchAs = asAccount(server, 'adult-suspended');
    const res = await fetchAs('/api/bootstrap', { method: 'GET' });
    assert.equal(res.status, 403);
    const payload = await res.json();
    assert.equal(payload.code, 'account_suspended');
  } finally {
    server.close();
  }
});

test('U14 suspended — mutation route also fails with 403 account_suspended', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-suspended' });
    seedMetadata(server, 'adult-suspended', { opsStatus: 'suspended', statusRevision: 1, rowVersion: 1 });

    const fetchAs = asAccount(server, 'adult-suspended');
    const res = await fetchAs('/api/learners', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ learners: [] }),
    });
    assert.equal(res.status, 403);
    const payload = await res.json();
    assert.equal(payload.code, 'account_suspended');
  } finally {
    server.close();
  }
});

test('U14 payment_hold — GET passes, mutation fails with 403 account_payment_hold', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-payment-hold' });
    seedMetadata(server, 'adult-payment-hold', { opsStatus: 'payment_hold', statusRevision: 0, rowVersion: 1 });

    const fetchAs = asAccount(server, 'adult-payment-hold');
    const boot = await fetchAs('/api/bootstrap', { method: 'GET' });
    assert.equal(boot.status, 200);

    const put = await fetchAs('/api/learners', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ learners: [] }),
    });
    assert.equal(put.status, 403);
    const payload = await put.json();
    assert.equal(payload.code, 'account_payment_hold');
  } finally {
    server.close();
  }
});

test('U14 stale revision — session_invalidated 401 on every authenticated request', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-stale' });
    seedMetadata(server, 'adult-stale', { opsStatus: 'active', statusRevision: 5, rowVersion: 5 });

    // Use the dev-stub header override to simulate a session stamped at
    // revision 2 (stale — current is 5).
    const res = await server.fetchAs('adult-stale', 'https://repo.test/api/bootstrap', {
      method: 'GET',
      headers: {
        origin: 'https://repo.test',
        'x-ks2-dev-status-revision-at-issue': '2',
      },
    });
    assert.equal(res.status, 401);
    const payload = await res.json();
    assert.equal(payload.code, 'session_invalidated');
  } finally {
    server.close();
  }
});

test('U14 legacy (no metadata row) — passes authentication as active', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-legacy' });
    // No metadata row seeded.
    const fetchAs = asAccount(server, 'adult-legacy');
    const res = await fetchAs('/api/bootstrap', { method: 'GET' });
    assert.equal(res.status, 200);
  } finally {
    server.close();
  }
});

test('U14 soft-fail (missing column) — enforcement falls back to active', async () => {
  // Drop the status_revision column mid-test. The JOIN in
  // `accountSessionFromToken` / dev-stub should soft-fail and the
  // authenticated request should pass through as active.
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-softfail' });
    // SQLite does not support DROP COLUMN easily; simulate by dropping the
    // metadata table and relying on the LEFT JOIN to fail. The dev-stub
    // provider swallows the error and treats the account as active.
    server.DB.db.exec('DROP TABLE account_ops_metadata');
    const fetchAs = asAccount(server, 'adult-softfail');
    const res = await fetchAs('/api/bootstrap', { method: 'GET' });
    assert.equal(res.status, 200);
  } finally {
    server.close();
  }
});
