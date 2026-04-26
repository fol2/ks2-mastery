// Phase D / U15 coverage: self-suspend guard on `updateAccountOpsMetadata`.
//
// Contract:
// - Admin A PATCHing admin A's own ops_status to 'suspended' or
//   'payment_hold' → 403 `self_suspend_forbidden`. No DB writes. No
//   row_version bump.
// - Admin A PATCHing admin A's own ops_status to 'active' (already active)
//   → succeeds. The guard only trips on non-active transitions.
// - Admin A PATCHing a DIFFERENT admin's ops_status → normal flow (the
//   last-admin guard takes over, tested separately).
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U15

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

function seedAdultAccount(server, {
  id,
  email = null,
  platformRole = 'parent',
  now = Date.now(),
} = {}) {
  server.DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, repo_revision, account_type, demo_expires_at)
    VALUES (?, ?, NULL, ?, NULL, ?, ?, 0, 'real', NULL)
  `).run(id, email, platformRole, now, now);
}

async function putMetadata(server, actor, targetAccountId, body) {
  return server.fetchAs(actor, `https://repo.test/api/admin/accounts/${encodeURIComponent(targetAccountId)}/ops-metadata`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-platform-role': 'admin',
    },
    body: JSON.stringify(body),
  });
}

test('U15 self-suspend — admin setting own ops_status=suspended → 403 self_suspend_forbidden', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin-a', email: 'a@example.test', platformRole: 'admin' });
    seedAdultAccount(server, { id: 'adult-admin-b', email: 'b@example.test', platformRole: 'admin' });

    const response = await putMetadata(server, 'adult-admin-a', 'adult-admin-a', {
      patch: { opsStatus: 'suspended' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-u15-self-1', correlationId: 'corr-u15-self-1' },
    });
    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.code, 'self_suspend_forbidden');

    // No row_version bump — no metadata row was created.
    const row = server.DB.db.prepare(
      'SELECT row_version FROM account_ops_metadata WHERE account_id = ?',
    ).get('adult-admin-a');
    assert.equal(row, undefined);
  } finally {
    server.close();
  }
});

test('U15 self-suspend — admin setting own ops_status=payment_hold → 403 self_suspend_forbidden', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin-a', email: 'a@example.test', platformRole: 'admin' });
    seedAdultAccount(server, { id: 'adult-admin-b', email: 'b@example.test', platformRole: 'admin' });

    const response = await putMetadata(server, 'adult-admin-a', 'adult-admin-a', {
      patch: { opsStatus: 'payment_hold' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-u15-self-2', correlationId: 'corr-u15-self-2' },
    });
    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.code, 'self_suspend_forbidden');
  } finally {
    server.close();
  }
});

test('U15 self-suspend — admin setting own ops_status=active (no-op) succeeds', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin-a', email: 'a@example.test', platformRole: 'admin' });
    seedAdultAccount(server, { id: 'adult-admin-b', email: 'b@example.test', platformRole: 'admin' });

    const response = await putMetadata(server, 'adult-admin-a', 'adult-admin-a', {
      patch: { opsStatus: 'active', planLabel: 'Self-edit' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-u15-self-3', correlationId: 'corr-u15-self-3' },
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.accountOpsMetadataEntry.opsStatus, 'active');
    assert.equal(payload.accountOpsMetadataEntry.planLabel, 'Self-edit');
  } finally {
    server.close();
  }
});
