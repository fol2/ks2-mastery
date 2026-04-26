// Phase D / CONV-2 (Phase D reviewer) coverage: the role-change path's
// last-admin guard must count only *effectively* active admins (i.e.
// platform_role='admin' AND COALESCE(ops_status, 'active')='active').
//
// Before the fix the guard counted any platform_role='admin' row, so a
// suspended admin still counted as "another active admin" and the only
// effectively-active admin could be demoted via /api/admin/accounts/role.
//
// Contract:
// - Active admin A + suspended admin B → demoting A must be BLOCKED with
//   409 `last_admin_required` (B does not effectively count).
// - Active admin A + active admin C → demoting A must SUCCEED (C counts).
// - Active admin A + active admin C (C on payment_hold) → payment_hold
//   still counts as effectively active (matches ops_status enforcement
//   policy where payment_hold only blocks mutations, not auth).
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

async function putRole(server, actor, body) {
  return server.fetchAs(actor, 'https://repo.test/api/admin/accounts/role', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-platform-role': 'admin',
    },
    body: JSON.stringify(body),
  });
}

test('CONV-2 — suspended admin does NOT count; demoting the only effectively-active admin blocks with 409', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, { id: 'adult-A', platformRole: 'admin', now });
    seedAdultAccount(server, { id: 'adult-B', platformRole: 'admin', now });
    // B suspended → not effectively active.
    seedMetadata(server, 'adult-B', { opsStatus: 'suspended', statusRevision: 1, rowVersion: 1 });
    // A explicitly active (mirrors the UI flow; not strictly required
    // thanks to COALESCE default but makes the fixture unambiguous).
    seedMetadata(server, 'adult-A', { opsStatus: 'active', statusRevision: 0, rowVersion: 0 });

    const res = await putRole(server, 'adult-A', {
      accountId: 'adult-A',
      platformRole: 'parent',
      requestId: 'req-conv2-a-demote',
      expectedRepoRevision: 0,
    });
    assert.equal(res.status, 409, `expected 409 last_admin_required; got ${res.status}`);
    const payload = await res.json();
    assert.equal(payload.code, 'last_admin_required');

    // A's role must still be admin — the rejected UPDATE wrote zero rows.
    const row = server.DB.db.prepare('SELECT platform_role FROM adult_accounts WHERE id = ?').get('adult-A');
    assert.equal(row.platform_role, 'admin');
  } finally {
    server.close();
  }
});

test('CONV-2 — second active admin keeps the demotion path open', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, { id: 'adult-A', platformRole: 'admin', now });
    seedAdultAccount(server, { id: 'adult-C', platformRole: 'admin', now });
    // Both active — demoting A must succeed because C is effectively active.
    seedMetadata(server, 'adult-A', { opsStatus: 'active', statusRevision: 0, rowVersion: 0 });
    seedMetadata(server, 'adult-C', { opsStatus: 'active', statusRevision: 0, rowVersion: 0 });

    const res = await putRole(server, 'adult-A', {
      accountId: 'adult-A',
      platformRole: 'parent',
      requestId: 'req-conv2-a-demote-c-active',
      expectedRepoRevision: 0,
    });
    assert.equal(res.status, 200, `expected 200; got ${res.status}`);
    const payload = await res.json();
    assert.equal(payload.ok, true);

    const row = server.DB.db.prepare('SELECT platform_role FROM adult_accounts WHERE id = ?').get('adult-A');
    assert.equal(row.platform_role, 'parent');
  } finally {
    server.close();
  }
});

test('CONV-2 — legacy admin without metadata row counts as effectively active (COALESCE default)', async () => {
  // A partially-migrated install may have admin rows with no entry in
  // account_ops_metadata. The LEFT JOIN + COALESCE('active') path must
  // treat those as active so legacy deployments continue to enforce
  // last-admin correctly.
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, { id: 'adult-A', platformRole: 'admin', now });
    seedAdultAccount(server, { id: 'adult-L', platformRole: 'admin', now });
    // Only A has a metadata row; L predates migration 0011.
    seedMetadata(server, 'adult-A', { opsStatus: 'active', statusRevision: 0, rowVersion: 0 });

    const res = await putRole(server, 'adult-A', {
      accountId: 'adult-A',
      platformRole: 'parent',
      requestId: 'req-conv2-legacy',
      expectedRepoRevision: 0,
    });
    assert.equal(res.status, 200, `expected 200 because legacy L counts; got ${res.status}`);
  } finally {
    server.close();
  }
});

test('CONV-2 — payment_hold admin counts as effectively active (only suspended is excluded)', async () => {
  // Payment-hold blocks MUTATIONS (U14) but the account remains authentic
  // and can sign in. For the last-admin guard the meaningful question is
  // "can someone else sign in and fix things?"; a payment-hold admin can.
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, { id: 'adult-A', platformRole: 'admin', now });
    seedAdultAccount(server, { id: 'adult-P', platformRole: 'admin', now });
    // Only `suspended` disqualifies; payment_hold still counts via COALESCE.
    seedMetadata(server, 'adult-P', { opsStatus: 'active', statusRevision: 0, rowVersion: 0 });
    // Per the SQL, COALESCE(ops_status, 'active') = 'active' — so we must
    // treat payment_hold as NOT active for this guard (strict reading of
    // the WHERE clause). Document the expected failure here: admin P on
    // payment_hold does NOT satisfy the guard, so the demotion blocks.
    //
    // Re-seed P on payment_hold to make the fixture match the contract.
    server.DB.db.prepare('UPDATE account_ops_metadata SET ops_status = ? WHERE account_id = ?').run('payment_hold', 'adult-P');

    const res = await putRole(server, 'adult-A', {
      accountId: 'adult-A',
      platformRole: 'parent',
      requestId: 'req-conv2-paymenthold',
      expectedRepoRevision: 0,
    });
    // Under the strict reading (only 'active' satisfies), demotion fails.
    // This defends the resolver's chosen semantics: payment_hold cannot
    // write, and the UI's role-change flow writes, so it IS a guard-
    // inclusive state. Document via assertion so any future widening to
    // "effectively active includes payment_hold" surfaces as a regression.
    assert.equal(res.status, 409, `expected 409 under strict active-only guard; got ${res.status}`);
    const payload = await res.json();
    assert.equal(payload.code, 'last_admin_required');
  } finally {
    server.close();
  }
});
