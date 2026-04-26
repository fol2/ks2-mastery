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

// T-Imp-5 (Phase D reviewer): exercise the production session cookie
// path (NOT the dev-stub header path) to prove the stale-revision
// branch of `accountSessionFromToken` surfaces 401 `session_invalidated`
// on a real cookie. This covers the JOIN-driven comparison that the
// existing dev-stub test does not touch.
//
// Flow:
//   1. Register via POST /api/auth/register to mint a production cookie.
//   2. Bump `account_ops_metadata.status_revision` directly via D1.
//   3. Re-use the same cookie against an authenticated GET.
//   4. Assert 401 + code: 'session_invalidated'.

test('T-Imp-5 — production session cookie path returns 401 session_invalidated after status_revision bump', async () => {
  const { createWorkerRepositoryServer: createProductionServer } = await import('./helpers/worker-server.js');
  const server = createProductionServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
    },
  });
  try {
    const register = await server.fetchRaw('https://repo.test/api/auth/register', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://repo.test',
      },
      body: JSON.stringify({ email: 'timp5@example.test', password: 'password-1234' }),
    });
    assert.equal(register.status, 201, `expected 201 on register; got ${register.status}`);
    const setCookie = register.headers.get('set-cookie');
    assert.ok(setCookie, 'expected Set-Cookie header on successful register');
    // Extract the ks2_session cookie value. The server emits a standard
    // `Cookie-name=value; Path=/; HttpOnly; ...` string.
    const match = /ks2_session=([^;]+)/.exec(setCookie);
    assert.ok(match, `expected ks2_session cookie in Set-Cookie; got: ${setCookie}`);
    const cookieValue = match[1];

    const registerPayload = await register.json();
    const accountId = registerPayload.session.accountId;

    // Directly bump status_revision via D1 (simulating what
    // updateAccountOpsMetadata would do on a real admin action).
    const now = Date.now();
    server.DB.db.prepare(`
      INSERT INTO account_ops_metadata (
        account_id, ops_status, plan_label, tags_json, internal_notes,
        updated_at, updated_by_account_id, row_version, status_revision
      ) VALUES (?, 'active', NULL, '[]', NULL, ?, NULL, 1, 1)
    `).run(accountId, now);

    // Re-use the same cookie on an authenticated GET. Use /api/session
    // because it requires a session (cleaner failure surface than
    // /api/hubs/parent which has extra permission checks).
    const followup = await server.fetchRaw('https://repo.test/api/session', {
      method: 'GET',
      headers: {
        origin: 'https://repo.test',
        cookie: `ks2_session=${cookieValue}`,
      },
    });
    assert.equal(followup.status, 401, `expected 401 session_invalidated; got ${followup.status}`);
    const payload = await followup.json();
    assert.equal(payload.code, 'session_invalidated', `expected code=session_invalidated; got ${payload.code}`);
    // Explicitly NOT account_suspended — we stayed on ops_status=active and
    // only bumped the revision counter.
    assert.notEqual(payload.code, 'account_suspended');
  } finally {
    server.close();
  }
});

test('T-Imp-5 — production cookie path still passes when status_revision matches issue-stamp', async () => {
  // Sibling positive control: with the session's
  // status_revision_at_issue matching the current revision, the
  // authenticated request succeeds and the enforcement path stays silent.
  const { createWorkerRepositoryServer: createProductionServer } = await import('./helpers/worker-server.js');
  const server = createProductionServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
    },
  });
  try {
    const register = await server.fetchRaw('https://repo.test/api/auth/register', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://repo.test',
      },
      body: JSON.stringify({ email: 'timp5-pos@example.test', password: 'password-1234' }),
    });
    assert.equal(register.status, 201);
    const setCookie = register.headers.get('set-cookie') || '';
    const match = /ks2_session=([^;]+)/.exec(setCookie);
    assert.ok(match);
    const cookieValue = match[1];

    const res = await server.fetchRaw('https://repo.test/api/session', {
      method: 'GET',
      headers: {
        origin: 'https://repo.test',
        cookie: `ks2_session=${cookieValue}`,
      },
    });
    assert.equal(res.status, 200, `expected 200 on fresh cookie; got ${res.status}`);
  } finally {
    server.close();
  }
});
