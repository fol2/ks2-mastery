import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

function seedAdultAccount(server, {
  id,
  email = null,
  displayName = null,
  platformRole = 'parent',
  now = 1,
  accountType = 'real',
  demoExpiresAt = null,
} = {}) {
  server.DB.db.prepare(`
    INSERT INTO adult_accounts (
      id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, repo_revision, account_type, demo_expires_at
    )
    VALUES (?, ?, ?, ?, NULL, ?, ?, 0, ?, ?)
  `).run(id, email, displayName, platformRole, now, now, accountType, demoExpiresAt);
}

function seedOpsMetadata(server, {
  accountId,
  opsStatus = 'active',
  statusRevision = 0,
  now = 1,
} = {}) {
  server.DB.db.prepare(`
    INSERT INTO account_ops_metadata (
      account_id, ops_status, status_revision, plan_label, tags_json,
      internal_notes, updated_at, updated_by_account_id, row_version
    )
    VALUES (?, ?, ?, NULL, '[]', NULL, ?, ?, 0)
  `).run(accountId, opsStatus, statusRevision, now, accountId);
}

function readDenials(server) {
  return server.DB.db.prepare(
    'SELECT * FROM admin_request_denials ORDER BY denied_at DESC',
  ).all();
}

test('integration: account_suspended denial appears after auth rejection', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, {
      id: 'adult-suspended',
      email: 'suspended@example.com',
      platformRole: 'parent',
      now: 1000,
    });
    seedOpsMetadata(server, {
      accountId: 'adult-suspended',
      opsStatus: 'suspended',
      statusRevision: 1,
      now: 1000,
    });

    const response = await server.fetchAs(
      'adult-suspended',
      'http://localhost/api/bootstrap',
      { method: 'GET' },
    );
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.code, 'account_suspended');

    // Wait for the fire-and-forget denial insert to settle.
    await new Promise((resolve) => { setTimeout(resolve, 100); });

    const denials = readDenials(server);
    assert.ok(denials.length >= 1, 'at least one denial row inserted');
    const denial = denials.find((d) => d.denial_reason === 'account_suspended');
    assert.ok(denial, 'account_suspended denial found');
    assert.equal(denial.route_name, '/api/bootstrap');
    assert.equal(denial.account_id, 'adult-suspended');
    assert.equal(denial.is_demo, 0);
    // session_id_last8 should be the last 8 chars of the dev-stub session ID.
    // dev-stub generates `dev:<accountId>` = `dev:adult-suspended`
    assert.equal(denial.session_id_last8, 'uspended');
  } finally {
    server.close();
  }
});

test('integration: payment_hold denial appears after mutation rejection', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, {
      id: 'adult-held',
      email: 'held@example.com',
      platformRole: 'parent',
      now: 1000,
    });
    seedOpsMetadata(server, {
      accountId: 'adult-held',
      opsStatus: 'payment_hold',
      statusRevision: 0,
      now: 1000,
    });

    // A mutation route that triggers requireMutationCapability.
    const response = await server.fetchAs(
      'adult-held',
      'http://localhost/api/learners',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ learners: [] }),
      },
    );
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.code, 'account_payment_hold');

    await new Promise((resolve) => { setTimeout(resolve, 100); });

    const denials = readDenials(server);
    const denial = denials.find((d) => d.denial_reason === 'payment_hold');
    assert.ok(denial, 'payment_hold denial found');
    assert.equal(denial.route_name, '/api/learners');
    assert.equal(denial.account_id, 'adult-held');
  } finally {
    server.close();
  }
});

test('integration: denial logging failure does not affect the 403 response', async () => {
  // Use a server with the normal DB — the denial insert may fail due to
  // any number of reasons, but the 403 response must still be returned.
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, {
      id: 'adult-suspended-2',
      email: 'susp2@example.com',
      platformRole: 'parent',
      now: 1000,
    });
    seedOpsMetadata(server, {
      accountId: 'adult-suspended-2',
      opsStatus: 'suspended',
      statusRevision: 1,
      now: 1000,
    });

    // Drop the table to force a denial-insert failure.
    server.DB.db.prepare('DROP TABLE IF EXISTS admin_request_denials').run();

    const response = await server.fetchAs(
      'adult-suspended-2',
      'http://localhost/api/session',
      { method: 'GET' },
    );
    // The auth rejection must still succeed — denial logging failure is fire-and-forget.
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.code, 'account_suspended');
  } finally {
    server.close();
  }
});

test('integration: csrf_rejection denial captured from requireSameOrigin', async () => {
  const server = createWorkerRepositoryServer({
    env: { AUTH_MODE: 'development-stub', ENVIRONMENT: 'test' },
  });
  try {
    seedAdultAccount(server, {
      id: 'adult-csrf',
      email: 'csrf@example.com',
      platformRole: 'parent',
      now: 1000,
    });

    // Send a cross-site request to a route that calls requireSameOrigin in strict mode.
    // The /api/auth/register route calls requireSameOrigin(request, env) explicitly.
    const response = await server.fetchAs(
      'adult-csrf',
      'http://localhost/api/auth/register',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'sec-fetch-site': 'cross-site',
        },
        body: JSON.stringify({ email: 'test@test.com', password: 'password123' }),
      },
    );
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.code, 'same_origin_required');

    await new Promise((resolve) => { setTimeout(resolve, 100); });

    const denials = readDenials(server);
    const denial = denials.find((d) => d.denial_reason === 'csrf_rejection');
    assert.ok(denial, 'csrf_rejection denial found');
    assert.equal(denial.route_name, '/api/auth/register');
  } finally {
    server.close();
  }
});

test('integration: retention sweep removes old denials', async () => {
  const { sweepRequestDenials, REQUEST_DENIALS_RETENTION_MS } = await import(
    '../worker/src/cron/retention-sweep.js'
  );
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    const old = now - REQUEST_DENIALS_RETENTION_MS - 1000;
    // Insert an old denial row directly.
    server.DB.db.prepare(`
      INSERT INTO admin_request_denials (
        id, denied_at, denial_reason, route_name, account_id,
        learner_id, session_id_last8, is_demo, release, detail_json
      )
      VALUES (?, ?, ?, ?, ?, NULL, NULL, 0, NULL, NULL)
    `).run('denial-old-1', old, 'account_suspended', '/api/bootstrap', 'adult-x');

    // Insert a recent denial row.
    server.DB.db.prepare(`
      INSERT INTO admin_request_denials (
        id, denied_at, denial_reason, route_name, account_id,
        learner_id, session_id_last8, is_demo, release, detail_json
      )
      VALUES (?, ?, ?, ?, ?, NULL, NULL, 0, NULL, NULL)
    `).run('denial-new-1', now, 'payment_hold', '/api/learners', 'adult-y');

    const result = await sweepRequestDenials(server.DB, now);
    assert.equal(result.deleted, 1, 'one old denial deleted');

    const remaining = readDenials(server);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, 'denial-new-1');
  } finally {
    server.close();
  }
});

test('integration: retention sweep tolerates missing table', async () => {
  const { sweepRequestDenials } = await import(
    '../worker/src/cron/retention-sweep.js'
  );
  const server = createWorkerRepositoryServer();
  try {
    server.DB.db.prepare('DROP TABLE IF EXISTS admin_request_denials').run();
    const result = await sweepRequestDenials(server.DB, Date.now());
    assert.equal(result.deleted, 0, 'missing table returns 0 deleted');
  } finally {
    server.close();
  }
});

test('integration: runRetentionSweeps includes request denials sweep', async () => {
  const { runRetentionSweeps } = await import(
    '../worker/src/cron/retention-sweep.js'
  );
  const server = createWorkerRepositoryServer();
  try {
    const result = await runRetentionSweeps(server.DB, Date.now());
    const denialSweep = result.completed.find((s) => s.sweep === 'admin_request_denials');
    assert.ok(denialSweep, 'admin_request_denials sweep is in the completed list');
    assert.equal(typeof denialSweep.deleted, 'number');
  } finally {
    server.close();
  }
});
