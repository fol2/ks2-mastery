// Phase D / U15 coverage: cross-actor last-active-admin guard on
// `updateAccountOpsMetadata`.
//
// Contract:
// - Admin A suspends admin B where B is the sole OTHER active admin → the
//   check asks "are there any other active admins besides the target?" and
//   succeeds because A is active.
// - Admin A suspends the ONLY other active admin B when A is suspended →
//   409 `last_admin_locked_out`.
// - Cross-actor race convergence: A and B try to suspend each other.
//   Batch 1 wins (e.g. A→suspended). Batch 2's retry on B's CAS now sees
//   A as suspended, so the pre-check blocks with `last_admin_locked_out`.
// - Guard only fires when target.platform_role='admin' AND incoming
//   opsStatus != 'active'. Parents/ops targets skip the check.
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

function seedMetadata(server, accountId, { opsStatus = 'active', statusRevision = 0, rowVersion = 0 } = {}) {
  server.DB.db.prepare(`
    INSERT INTO account_ops_metadata (
      account_id, ops_status, plan_label, tags_json, internal_notes,
      updated_at, updated_by_account_id, row_version, status_revision
    )
    VALUES (?, ?, NULL, '[]', NULL, ?, NULL, ?, ?)
  `).run(accountId, opsStatus, Date.now(), rowVersion, statusRevision);
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

test('U15 last-admin — admin A suspends admin B (second admin) succeeds when A remains active', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin-a', email: 'a@example.test', platformRole: 'admin' });
    seedAdultAccount(server, { id: 'adult-admin-b', email: 'b@example.test', platformRole: 'admin' });

    const response = await putMetadata(server, 'adult-admin-a', 'adult-admin-b', {
      patch: { opsStatus: 'suspended' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-u15-last-1', correlationId: 'corr-u15-last-1' },
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.accountOpsMetadataEntry.opsStatus, 'suspended');
  } finally {
    server.close();
  }
});

test('U15 last-admin — direct repository call with zero other active admins → ConflictError last_admin_locked_out', async () => {
  // The last-active-admin guard fires when an admin actor tries to
  // non-activate another admin AND no other admin remains active. In
  // practice the auth boundary already requires the actor to be active,
  // so this invariant triggers mostly as a race-convergence defence
  // (two admins mutually suspend; the second commit re-reads and bails).
  //
  // We verify the guard by calling `updateAccountOpsMetadata` directly
  // through the repository factory — bypassing the auth boundary the
  // request pipeline applies — and arranging the data so the guard's
  // SELECT returns 0. This scenario is semantically equivalent to the
  // race-convergence path where the actor's own metadata has been
  // concurrently flipped to non-active BETWEEN the boundary check and
  // the guard SQL running.
  const { createWorkerRepository } = await import('../worker/src/repository.js');
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin-a', email: 'a@example.test', platformRole: 'admin' });
    seedAdultAccount(server, { id: 'adult-admin-b', email: 'b@example.test', platformRole: 'admin' });
    // A and B both admins. Mark A as suspended — simulating the race
    // where A was concurrently suspended between boundary and guard.
    seedMetadata(server, 'adult-admin-a', { opsStatus: 'suspended', rowVersion: 1, statusRevision: 1 });

    const repository = createWorkerRepository({ env: server.env });
    try {
      await repository.updateAccountOpsMetadata('adult-admin-a', {
        targetAccountId: 'adult-admin-b',
        patch: { opsStatus: 'suspended' },
        expectedRowVersion: 0,
        mutation: { requestId: 'req-u15-last-2', correlationId: 'corr-u15-last-2' },
      });
      assert.fail('expected ConflictError last_admin_locked_out');
    } catch (error) {
      assert.equal(error?.status, 409);
      assert.equal(error?.extra?.code, 'last_admin_locked_out');
    }
  } finally {
    server.close();
  }
});

test('U15 last-admin — guard does NOT fire when target is parent (not admin)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin-a', email: 'a@example.test', platformRole: 'admin' });
    seedAdultAccount(server, { id: 'adult-parent-x', email: 'x@example.test', platformRole: 'parent' });

    const response = await putMetadata(server, 'adult-admin-a', 'adult-parent-x', {
      patch: { opsStatus: 'suspended' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-u15-last-3', correlationId: 'corr-u15-last-3' },
    });
    assert.equal(response.status, 200);
  } finally {
    server.close();
  }
});

test('U15 last-admin — guard does NOT fire on active→active no-op for an admin', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin-a', email: 'a@example.test', platformRole: 'admin' });

    const response = await putMetadata(server, 'adult-admin-a', 'adult-admin-a', {
      patch: { opsStatus: 'active', planLabel: 'No-op edit' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-u15-last-4', correlationId: 'corr-u15-last-4' },
    });
    assert.equal(response.status, 200);
  } finally {
    server.close();
  }
});

test('U15 last-admin — self-suspend guard takes precedence (admin A suspends self as only admin)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin-only', email: 'only@example.test', platformRole: 'admin' });

    const response = await putMetadata(server, 'adult-admin-only', 'adult-admin-only', {
      patch: { opsStatus: 'payment_hold' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-u15-last-5', correlationId: 'corr-u15-last-5' },
    });
    assert.equal(response.status, 403);
    const payload = await response.json();
    // Self-suspend guard fires before last-admin guard.
    assert.equal(payload.code, 'self_suspend_forbidden');
  } finally {
    server.close();
  }
});
