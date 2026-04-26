// Phase D / CONV-3 + ADV-3 (Phase D reviewer) coverage: the stale-
// session sweep that fires from `updateAccountOpsMetadata`'s batch when
// a status change bumps `status_revision`.
//
// Contract:
// 1. Status change (active -> suspended) bumps `status_revision`. Stale
//    sessions (`status_revision_at_issue` < new revision) are DELETED.
//    Fresh sessions (stamped at the new revision) are PRESERVED.
// 2. Tags-only mutation DOES NOT bump `status_revision`. All existing
//    sessions survive even if they were stamped at revision 0 against a
//    revision-0 metadata row.
// 3. ADV-3: a tags-only save against an already-bumped metadata row MUST
//    NOT fire the DELETE. Pre-existing stale sessions survive because
//    the EXISTS guard now matches on `status_revision`.
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

function seedSession(server, accountId, {
  id,
  statusRevisionAtIssue = 0,
  provider = 'email',
  sessionKind = 'real',
  now = Date.now(),
} = {}) {
  server.DB.db.prepare(`
    INSERT INTO account_sessions (
      id, account_id, session_hash, provider, created_at, expires_at,
      session_kind, status_revision_at_issue
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    accountId,
    `hash-${id}`,
    provider,
    now,
    now + 24 * 60 * 60 * 1000,
    sessionKind,
    statusRevisionAtIssue,
  );
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

test('stale-session sweep — status change deletes stale, preserves fresh', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin', now });
    seedAdultAccount(server, { id: 'adult-T', now });
    seedMetadata(server, 'adult-T', { opsStatus: 'active', statusRevision: 0, rowVersion: 0 });

    // Two stale sessions (stamped at revision 0) + one fresh (revision 1).
    seedSession(server, 'adult-T', { id: 'sess-stale-1', statusRevisionAtIssue: 0 });
    seedSession(server, 'adult-T', { id: 'sess-stale-2', statusRevisionAtIssue: 0 });
    seedSession(server, 'adult-T', { id: 'sess-fresh-1', statusRevisionAtIssue: 1 });

    const res = await putMetadata(server, 'adult-admin', 'adult-T', {
      patch: { opsStatus: 'suspended' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-status-change', correlationId: 'corr-status-change' },
    });
    assert.equal(res.status, 200, `expected 200; got ${res.status}`);

    const meta = server.DB.db.prepare('SELECT status_revision, ops_status FROM account_ops_metadata WHERE account_id = ?').get('adult-T');
    assert.equal(meta.status_revision, 1);
    assert.equal(meta.ops_status, 'suspended');

    const surviving = server.DB.db.prepare('SELECT id FROM account_sessions WHERE account_id = ? ORDER BY id').all('adult-T');
    assert.deepEqual(surviving.map((row) => row.id), ['sess-fresh-1']);
  } finally {
    server.close();
  }
});

test('stale-session sweep — tags-only mutation preserves status_revision + all sessions', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin', now });
    seedAdultAccount(server, { id: 'adult-T', now });
    seedMetadata(server, 'adult-T', { opsStatus: 'active', statusRevision: 0, rowVersion: 0 });

    seedSession(server, 'adult-T', { id: 'sess-stale-1', statusRevisionAtIssue: 0 });
    seedSession(server, 'adult-T', { id: 'sess-stale-2', statusRevisionAtIssue: 0 });

    const res = await putMetadata(server, 'adult-admin', 'adult-T', {
      patch: { tags: ['priority', 'followup'] },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-tags-only', correlationId: 'corr-tags-only' },
    });
    assert.equal(res.status, 200, `expected 200; got ${res.status}`);

    const meta = server.DB.db.prepare('SELECT status_revision, ops_status, row_version FROM account_ops_metadata WHERE account_id = ?').get('adult-T');
    assert.equal(meta.status_revision, 0, 'tags-only mutation must not bump status_revision');
    assert.equal(meta.ops_status, 'active');
    assert.equal(meta.row_version, 1, 'row_version still bumps on every mutation');

    const survivingIds = server.DB.db
      .prepare('SELECT id FROM account_sessions WHERE account_id = ? ORDER BY id')
      .all('adult-T')
      .map((row) => row.id);
    assert.deepEqual(survivingIds, ['sess-stale-1', 'sess-stale-2']);
  } finally {
    server.close();
  }
});

test('ADV-3 — tags-only save against already-bumped revision does NOT fire the DELETE', async () => {
  // A prior status change bumped the metadata to revision 1, leaving a
  // session at revision 0 in place (perhaps because the sweep from the
  // original bump was aborted by a partial deploy). The admin then saves
  // a tags-only edit. Without the ADV-3 guard the DELETE subquery would
  // match any post-UPSERT row on the account (row_version now bumped to
  // 2) AND status_revision_at_issue<1, producing a false-positive sweep.
  // With the `status_revision = ?` field in the EXISTS tuple the DELETE
  // matches zero rows on the tags-only save because we bind the UNCHANGED
  // revision (1), so the join still finds the row but the lookup succeeds
  // for the subquery only; without status change we don't expect the
  // DELETE to actually act — meaning stale sessions survive this save.
  //
  // In this pre-existing-stale scenario the production behaviour is:
  // keep the stale session until the NEXT status-changing mutation fires.
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin', now });
    seedAdultAccount(server, { id: 'adult-T', now });
    seedMetadata(server, 'adult-T', { opsStatus: 'suspended', statusRevision: 1, rowVersion: 1 });

    // Pre-existing stale session from before the previous sweep.
    seedSession(server, 'adult-T', { id: 'sess-pre-existing-stale', statusRevisionAtIssue: 0 });

    const res = await putMetadata(server, 'adult-admin', 'adult-T', {
      patch: { tags: ['priority'] },
      expectedRowVersion: 1,
      mutation: { requestId: 'req-tags-only-after-bump', correlationId: 'corr-tags-only-after-bump' },
    });
    assert.equal(res.status, 200, `expected 200; got ${res.status}`);

    const meta = server.DB.db.prepare('SELECT status_revision, ops_status FROM account_ops_metadata WHERE account_id = ?').get('adult-T');
    assert.equal(meta.status_revision, 1, 'status_revision stays at 1 on tags-only mutation');
    assert.equal(meta.ops_status, 'suspended');

    const survivingIds = server.DB.db
      .prepare('SELECT id FROM account_sessions WHERE account_id = ? ORDER BY id')
      .all('adult-T')
      .map((row) => row.id);
    assert.deepEqual(survivingIds, ['sess-pre-existing-stale'], 'tags-only save must not sweep pre-existing stale sessions');
  } finally {
    server.close();
  }
});

test('stale-session sweep — active->active no-op mutation leaves sessions alone', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin', now });
    seedAdultAccount(server, { id: 'adult-T', now });
    seedMetadata(server, 'adult-T', { opsStatus: 'active', statusRevision: 0, rowVersion: 0 });

    seedSession(server, 'adult-T', { id: 'sess-A', statusRevisionAtIssue: 0 });

    const res = await putMetadata(server, 'adult-admin', 'adult-T', {
      patch: { opsStatus: 'active', planLabel: 'refresh' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-no-status-change', correlationId: 'corr-no-status-change' },
    });
    assert.equal(res.status, 200);

    const meta = server.DB.db.prepare('SELECT status_revision, plan_label FROM account_ops_metadata WHERE account_id = ?').get('adult-T');
    assert.equal(meta.status_revision, 0);
    assert.equal(meta.plan_label, 'refresh');

    const survivingIds = server.DB.db
      .prepare('SELECT id FROM account_sessions WHERE account_id = ?')
      .all('adult-T')
      .map((row) => row.id);
    assert.deepEqual(survivingIds, ['sess-A']);
  } finally {
    server.close();
  }
});
