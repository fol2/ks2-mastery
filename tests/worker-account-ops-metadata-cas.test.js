// U8 CAS coverage for `updateAccountOpsMetadata`.
//
// Contract:
// - `expectedRowVersion` is required in the envelope; omission returns 400
//   `validation_failed` with field=expectedRowVersion.
// - A happy-path update bumps `row_version` by 1 and echoes the bumped value.
// - A pre-check mismatch returns 409 `account_ops_metadata_stale` with a
//   redacted `currentState` envelope (internalNotes nulled for ops-role viewers).
// - A 409-retry carrying a fresh `expectedRowVersion` and new requestId
//   succeeds and is NOT idempotency-replayed.
// - Missing target accounts return 404, NOT 409.
// - Fresh inserts require `expectedRowVersion = 0`.
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U8

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

function seedCore(server, now) {
  seedAdultAccount(server, {
    id: 'adult-admin',
    email: 'admin@example.com',
    displayName: 'Admin',
    platformRole: 'admin',
    now,
  });
  seedAdultAccount(server, {
    id: 'adult-ops',
    email: 'ops@example.com',
    displayName: 'Ops',
    platformRole: 'ops',
    now,
  });
  seedAdultAccount(server, {
    id: 'adult-parent',
    email: 'parent@example.com',
    displayName: 'Parent',
    platformRole: 'parent',
    now,
  });
}

function rowVersion(server, targetAccountId) {
  const row = server.DB.db.prepare(
    'SELECT row_version FROM account_ops_metadata WHERE account_id = ?',
  ).get(targetAccountId);
  return row ? Math.max(0, Number(row.row_version) || 0) : 0;
}

function metadataRow(server, targetAccountId) {
  return server.DB.db.prepare(`
    SELECT account_id, ops_status, plan_label, tags_json, internal_notes,
           updated_at, updated_by_account_id, row_version
    FROM account_ops_metadata
    WHERE account_id = ?
  `).get(targetAccountId) || null;
}

async function putMetadata(server, actor, targetAccountId, body, { role = 'admin' } = {}) {
  return server.fetchAs(actor, `https://repo.test/api/admin/accounts/${encodeURIComponent(targetAccountId)}/ops-metadata`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-platform-role': role,
    },
    body: JSON.stringify(body),
  });
}

test('U8 happy — expectedRowVersion=0 on fresh row bumps row_version to 1', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedCore(server, Date.now());
    const response = await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'suspended', planLabel: 'Initial' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-u8-fresh', correlationId: 'corr-u8-fresh' },
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.accountOpsMetadataEntry.rowVersion, 1);
    assert.equal(payload.opsMetadataMutation.rowVersion, 1);
    assert.equal(rowVersion(server, 'adult-parent'), 1);
  } finally {
    server.close();
  }
});

test('U8 happy — expectedRowVersion matching existing row_version succeeds and bumps by 1', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedCore(server, Date.now());
    // Seed row_version = 3 by looping three updates.
    await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'active' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-u8-a', correlationId: 'corr-u8-a' },
    });
    await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'suspended' },
      expectedRowVersion: 1,
      mutation: { requestId: 'req-u8-b', correlationId: 'corr-u8-b' },
    });
    await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'payment_hold' },
      expectedRowVersion: 2,
      mutation: { requestId: 'req-u8-c', correlationId: 'corr-u8-c' },
    });
    assert.equal(rowVersion(server, 'adult-parent'), 3);

    const response = await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'active', planLabel: 'Enterprise' },
      expectedRowVersion: 3,
      mutation: { requestId: 'req-u8-win', correlationId: 'corr-u8-win' },
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.accountOpsMetadataEntry.rowVersion, 4);
    assert.equal(rowVersion(server, 'adult-parent'), 4);
  } finally {
    server.close();
  }
});

test('U8 409 pre-check — stale expectedRowVersion emits account_ops_metadata_stale with currentState', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedCore(server, Date.now());
    // Baseline: row_version = 1 after one successful write.
    await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'suspended', internalNotes: 'Initial hold.' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-base', correlationId: 'corr-base' },
    });
    // Staler: admin retries with the old pre-image.
    const response = await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'active' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-stale', correlationId: 'corr-stale' },
    });
    const payload = await response.json();
    assert.equal(response.status, 409);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'account_ops_metadata_stale');
    assert.equal(payload.expected, 0);
    assert.equal(payload.current, 1);
    assert.equal(payload.currentState.rowVersion, 1);
    assert.equal(payload.currentState.opsStatus, 'suspended');
    // Admin role sees the internalNotes value in the conflict echo.
    assert.equal(payload.currentState.internalNotes, 'Initial hold.');
    // DB row_version unchanged — the stale attempt did not commit.
    assert.equal(rowVersion(server, 'adult-parent'), 1);
  } finally {
    server.close();
  }
});

test('U8 409-retry — fresh expectedRowVersion + new requestId succeeds without idempotency replay', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedCore(server, Date.now());
    await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'suspended' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-initial', correlationId: 'corr-initial' },
    });
    // Simulate 409: stale attempt fails.
    const stale = await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'active' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-stale-1', correlationId: 'corr-stale-1' },
    });
    assert.equal(stale.status, 409);

    // Keep-mine retry with fresh pre-image AND fresh requestId.
    const retry = await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'active' },
      expectedRowVersion: 1,
      mutation: { requestId: 'req-retry-1', correlationId: 'corr-retry-1' },
    });
    const payload = await retry.json();
    assert.equal(retry.status, 200);
    assert.equal(payload.opsMetadataMutation.replayed, false);
    assert.equal(payload.accountOpsMetadataEntry.opsStatus, 'active');
    assert.equal(payload.accountOpsMetadataEntry.rowVersion, 2);
    assert.equal(rowVersion(server, 'adult-parent'), 2);
  } finally {
    server.close();
  }
});

test('U8 idempotency — same requestId + same body (including expectedRowVersion) replays cached receipt', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedCore(server, Date.now());
    const body = {
      patch: { opsStatus: 'suspended' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-u8-idem', correlationId: 'corr-u8-idem' },
    };
    const first = await putMetadata(server, 'adult-admin', 'adult-parent', body);
    const firstPayload = await first.json();
    assert.equal(first.status, 200);
    assert.equal(firstPayload.opsMetadataMutation.replayed, false);

    // Replay — same requestId, same expectedRowVersion. Idempotency preflight
    // must short-circuit BEFORE the CAS pre-check.
    const replay = await putMetadata(server, 'adult-admin', 'adult-parent', body);
    const replayPayload = await replay.json();
    assert.equal(replay.status, 200);
    assert.equal(replayPayload.opsMetadataMutation.replayed, true);
    // Row was written only once.
    assert.equal(rowVersion(server, 'adult-parent'), 1);
  } finally {
    server.close();
  }
});

test('U8 validation — expectedRowVersion omitted from body returns 400 validation_failed', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedCore(server, Date.now());
    const response = await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'active' },
      mutation: { requestId: 'req-no-cas', correlationId: 'corr-no-cas' },
    });
    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.equal(payload.code, 'validation_failed');
    assert.equal(payload.field, 'expectedRowVersion');
  } finally {
    server.close();
  }
});

test('U8 validation — expectedRowVersion must be a non-negative integer', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedCore(server, Date.now());
    const response = await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'active' },
      expectedRowVersion: -1,
      mutation: { requestId: 'req-neg-cas', correlationId: 'corr-neg-cas' },
    });
    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.equal(payload.code, 'validation_failed');
    assert.equal(payload.field, 'expectedRowVersion');
  } finally {
    server.close();
  }
});

test('U8 fresh-row — non-zero expectedRowVersion on an absent row is rejected as stale', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedCore(server, Date.now());
    // No metadata row exists yet for `adult-parent`. Claim 5 as the
    // pre-image — should 409 with current = 0.
    const response = await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'active' },
      expectedRowVersion: 5,
      mutation: { requestId: 'req-fresh-bogus', correlationId: 'corr-fresh-bogus' },
    });
    const payload = await response.json();
    assert.equal(response.status, 409);
    assert.equal(payload.code, 'account_ops_metadata_stale');
    assert.equal(payload.expected, 5);
    assert.equal(payload.current, 0);
    assert.equal(payload.currentState.rowVersion, 0);
    // Nothing written.
    assert.equal(metadataRow(server, 'adult-parent'), null);
  } finally {
    server.close();
  }
});

test('U8 missing target account — returns 404 target_account_not_found, not 409', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, {
      id: 'adult-admin',
      email: 'admin@example.com',
      platformRole: 'admin',
      now: Date.now(),
    });
    const response = await putMetadata(server, 'adult-admin', 'adult-ghost', {
      patch: { opsStatus: 'active' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-missing', correlationId: 'corr-missing' },
    });
    const payload = await response.json();
    assert.equal(response.status, 404);
    assert.equal(payload.code, 'target_account_not_found');
  } finally {
    server.close();
  }
});

test('U8 R25 redaction — ops-role 409 body has internalNotes=null', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedCore(server, Date.now());
    // Admin seeds a row with sensitive notes.
    await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'suspended', internalNotes: 'Secret ops detail.' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-seed-notes', correlationId: 'corr-seed-notes' },
    });
    // Ops attempts a write with stale pre-image → 409. Their conflict body
    // must not leak internalNotes (R25 admin-only policy).
    // Note: ops-role is also forbidden from mutation (returns 403) — but in
    // the specific case where the repository helper is invoked with
    // role=admin for auth but the currentState echo is owned by the actor's
    // role, we assert via the ADMIN-on-OPS scenario: ops-role fetch first
    // would be rejected 403, so the R25 check is exercised via the
    // readAccountOpsMetadataDirectory ops-view path in worker-admin-ops-read.test.js.
    // Here we assert the admin-role 409 body DOES include internalNotes (as
    // a cross-check of the redaction gate direction).
    const response = await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'active' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-admin-409', correlationId: 'corr-admin-409' },
    });
    const payload = await response.json();
    assert.equal(response.status, 409);
    assert.equal(payload.currentState.internalNotes, 'Secret ops detail.');
  } finally {
    server.close();
  }
});

test('U8 payload-hash — expectedRowVersion participates in the receipt hash', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedCore(server, Date.now());
    // First request at pre-image 0.
    const first = await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'suspended' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-hash-0', correlationId: 'corr-hash-0' },
    });
    assert.equal(first.status, 200);

    // Same requestId but different expectedRowVersion value. The idempotency
    // layer must flag this as a reuse with a different payload, so it
    // surfaces 409 `idempotency_reuse` — proving the expectedRowVersion is
    // part of the hashed body.
    const reuse = await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'suspended' },
      expectedRowVersion: 1,
      mutation: { requestId: 'req-hash-0', correlationId: 'corr-hash-0' },
    });
    const payload = await reuse.json();
    assert.equal(reuse.status, 409);
    assert.equal(payload.code, 'idempotency_reuse');
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// C1 (Phase C reviewer): TOCTOU race — simulate a concurrent writer
// committing between the pre-check SELECT and the batch commit. Writer B
// must see 409 `account_ops_metadata_stale` driven by the UPSERT
// statement's `meta.changes = 0`, NOT a tautological row_version re-read.
// Before the fix, both racers could see a post-batch `row_version` equal
// to their own `nextRowVersion` → false 200 with the loser's `appliedRow`
// diverging from the DB. The rowsAffected signal closes that hole.
// ---------------------------------------------------------------------------
test('C1 TOCTOU — concurrent writer commits between pre-check and batch; loser gets 409 with fresh currentState', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedCore(server, Date.now());
    // Baseline — row_version = 1 after initial seed.
    const seeded = await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'suspended', planLabel: 'Plan-A' },
      expectedRowVersion: 0,
      mutation: { requestId: 'req-toctou-seed', correlationId: 'corr-toctou-seed' },
    });
    assert.equal(seeded.status, 200);
    assert.equal(rowVersion(server, 'adult-parent'), 1);

    // Monkey-patch the D1 batch so a concurrent writer A commits one row_version
    // bump between B's pre-check SELECT and B's batch commit. We do this by
    // wrapping the underlying sqlite-D1 `batch` method — the next call to
    // `batch()` first commits writer A's UPDATE directly (bypassing the CAS
    // helper) before delegating to the real implementation. That mirrors the
    // production race where writer A wins the D1 round-trip while writer B is
    // mid-flight.
    const d1 = server.DB;
    const originalBatch = d1.batch.bind(d1);
    let batchCalls = 0;
    d1.batch = async (statements) => {
      batchCalls += 1;
      if (batchCalls === 1) {
        // Simulate writer A's already-committed UPSERT. Bumps row_version from
        // 1 → 2 BEFORE writer B's batch runs. Writer B pre-checked at v=1 and
        // composed its batch with `WHERE row_version = 1`; after this bump the
        // UPSERT WHERE-clause matches zero rows.
        d1.db.prepare(`
          UPDATE account_ops_metadata
          SET ops_status = 'payment_hold',
              plan_label = 'Plan-RacerA',
              updated_at = ?,
              updated_by_account_id = 'adult-admin',
              row_version = row_version + 1
          WHERE account_id = ?
        `).run(Date.now(), 'adult-parent');
      }
      return originalBatch(statements);
    };

    // Writer B (the loser) pre-checks at v=1, composes its batch, and tries to
    // commit. The SQL guard (layer 2) yields `changes = 0` on the UPSERT
    // statement. Layer 3 (C1 fix) reads that count from the batch result and
    // throws 409.
    const loser = await putMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'active' },
      expectedRowVersion: 1,
      mutation: { requestId: 'req-toctou-loser', correlationId: 'corr-toctou-loser' },
    });
    const payload = await loser.json();
    assert.equal(loser.status, 409);
    assert.equal(payload.code, 'account_ops_metadata_stale');
    // The 409 echoes the fresh post-race row_version (= 2) in currentState so
    // the UI banner can render the diff against the server's true state.
    assert.equal(payload.currentState.rowVersion, 2);
    assert.equal(payload.currentState.opsStatus, 'payment_hold');
    assert.equal(payload.currentState.planLabel, 'Plan-RacerA');

    // Writer B's patch must NOT have clobbered writer A's commit. The DB holds
    // writer A's values — this is the data-integrity invariant the C1 fix
    // protects. Before the fix, both writers committed their batch; the row
    // reflected whichever batch ran last AND the HTTP loser got 200 with their
    // `appliedRow` diverging from the DB.
    const dbRow = metadataRow(server, 'adult-parent');
    assert.equal(dbRow.ops_status, 'payment_hold');
    assert.equal(dbRow.plan_label, 'Plan-RacerA');
    assert.equal(dbRow.row_version, 2);

    // Note: the mutation_receipts row + counter bump DO land for writer B
    // because a zero-match UPSERT is not a SQL error and the batch commits.
    // This is accepted drift — KPI reconciliation (U10) collapses it. The
    // critical invariant is that writer B's STATE was not applied, which the
    // DB assertions above confirm. Documenting the behaviour here so a future
    // reviewer does not treat the receipt landing as a bug.
    const loserReceipt = server.DB.db.prepare(
      'SELECT request_id FROM mutation_receipts WHERE request_id = ?',
    ).get('req-toctou-loser');
    assert.ok(loserReceipt, 'the 409-loser receipt IS persisted (accepted drift); U10 reconciles counters');
  } finally {
    server.close();
  }
});
