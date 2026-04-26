// Phase D / U13 coverage: `createSession` stamps the account's current
// `status_revision` into `account_sessions.status_revision_at_issue` at
// login. U14's per-request comparison invalidates the session when an
// admin bumps the target account's revision.
//
// Contract:
// - Fresh active account with no metadata row → session stamps 0.
// - Account with metadata row at status_revision=0 → stamps 0.
// - Account with metadata row at status_revision>0 → stamps the current
//   value.
// - payment_hold accounts STILL get a session (U14 enforces
//   mutation-layer blocking separately).
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U13

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

function productionServer(env = {}) {
  return createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
      ...env,
    },
  });
}

function seedMetadata(server, accountId, { opsStatus = 'active', statusRevision = 0, rowVersion = 0 } = {}) {
  server.DB.db.prepare(`
    INSERT INTO account_ops_metadata (
      account_id, ops_status, plan_label, tags_json, internal_notes,
      updated_at, updated_by_account_id, row_version, status_revision
    )
    VALUES (?, ?, NULL, '[]', NULL, ?, NULL, ?, ?)
  `).run(accountId, opsStatus, Date.now(), rowVersion, statusRevision);
}

function readSessionRow(server) {
  return server.DB.db.prepare(`
    SELECT id, account_id, status_revision_at_issue
    FROM account_sessions
    ORDER BY created_at DESC
    LIMIT 1
  `).get();
}

async function postJson(server, path, body, headers = {}) {
  return server.fetchRaw(`https://repo.test${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test('U13 happy active (no metadata row) — session stamps status_revision_at_issue = 0', async () => {
  const server = productionServer();
  try {
    const register = await postJson(server, '/api/auth/register', {
      email: 'legacy-active@example.test',
      password: 'password-1234',
    });
    assert.equal(register.status, 201);
    const row = readSessionRow(server);
    assert.ok(row, 'session row must be inserted');
    assert.equal(row.status_revision_at_issue, 0);
  } finally {
    server.close();
  }
});

test('U13 happy active (metadata row at revision=0) — session stamps 0', async () => {
  const server = productionServer();
  try {
    const register = await postJson(server, '/api/auth/register', {
      email: 'active-zero@example.test',
      password: 'password-1234',
    });
    assert.equal(register.status, 201);
    const registerPayload = await register.json();
    const accountId = registerPayload.session.accountId;

    // Seed metadata AFTER registration so the test exercises the read path
    // on a subsequent login.
    seedMetadata(server, accountId, { statusRevision: 0, rowVersion: 1 });

    // Clear existing sessions and login again so createSession re-reads.
    server.DB.db.prepare('DELETE FROM account_sessions').run();

    const login = await postJson(server, '/api/auth/login', {
      email: 'active-zero@example.test',
      password: 'password-1234',
    });
    assert.equal(login.status, 200);
    const row = readSessionRow(server);
    assert.equal(row.status_revision_at_issue, 0);
  } finally {
    server.close();
  }
});

test('U13 happy active (metadata row at revision=3) — session stamps 3', async () => {
  const server = productionServer();
  try {
    const register = await postJson(server, '/api/auth/register', {
      email: 'active-three@example.test',
      password: 'password-1234',
    });
    const registerPayload = await register.json();
    const accountId = registerPayload.session.accountId;
    seedMetadata(server, accountId, { statusRevision: 3, rowVersion: 5 });
    server.DB.db.prepare('DELETE FROM account_sessions').run();

    const login = await postJson(server, '/api/auth/login', {
      email: 'active-three@example.test',
      password: 'password-1234',
    });
    assert.equal(login.status, 200);
    const row = readSessionRow(server);
    assert.equal(row.status_revision_at_issue, 3);
  } finally {
    server.close();
  }
});

test('U13 happy payment_hold — session IS issued and stamps the revision', async () => {
  const server = productionServer();
  try {
    const register = await postJson(server, '/api/auth/register', {
      email: 'payment-hold@example.test',
      password: 'password-1234',
    });
    const registerPayload = await register.json();
    const accountId = registerPayload.session.accountId;
    seedMetadata(server, accountId, {
      opsStatus: 'payment_hold',
      statusRevision: 7,
      rowVersion: 2,
    });
    server.DB.db.prepare('DELETE FROM account_sessions').run();

    const login = await postJson(server, '/api/auth/login', {
      email: 'payment-hold@example.test',
      password: 'password-1234',
    });
    // payment_hold does not refuse session creation — U14 enforces mutation
    // blocking at the request boundary instead.
    assert.equal(login.status, 200);
    const row = readSessionRow(server);
    assert.equal(row.status_revision_at_issue, 7);
  } finally {
    server.close();
  }
});
