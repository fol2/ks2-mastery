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

function insertOpsErrorEvent(server, {
  id,
  fingerprint,
  errorKind,
  messageFirstLine,
  firstFrame = null,
  routeName = null,
  userAgent = null,
  accountId = null,
  firstSeen,
  lastSeen,
  occurrenceCount = 1,
  status = 'open',
}) {
  server.DB.db.prepare(`
    INSERT INTO ops_error_events (
      id, fingerprint, error_kind, message_first_line, first_frame,
      route_name, user_agent, account_id, first_seen, last_seen,
      occurrence_count, status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    fingerprint,
    errorKind,
    messageFirstLine,
    firstFrame,
    routeName,
    userAgent,
    accountId,
    firstSeen,
    lastSeen,
    occurrenceCount,
    status,
  );
}

function insertAdminKpiMetric(server, { metricKey, metricCount, updatedAt }) {
  server.DB.db.prepare(`
    INSERT INTO admin_kpi_metrics (metric_key, metric_count, updated_at)
    VALUES (?, ?, ?)
  `).run(metricKey, metricCount, updatedAt);
}

function opsMetadataRow(server, accountId) {
  return server.DB.db.prepare(`
    SELECT account_id, ops_status, plan_label, tags_json, internal_notes,
           updated_at, updated_by_account_id
    FROM account_ops_metadata
    WHERE account_id = ?
  `).get(accountId) || null;
}

function errorEventRow(server, id) {
  return server.DB.db.prepare(`
    SELECT id, status, last_seen, occurrence_count
    FROM ops_error_events
    WHERE id = ?
  `).get(id) || null;
}

function receiptRows(server, requestId) {
  return server.DB.db.prepare(`
    SELECT request_id, status_code, mutation_kind, scope_type, scope_id
    FROM mutation_receipts
    WHERE request_id = ?
  `).all(requestId);
}

function kpiValue(server, key) {
  const row = server.DB.db.prepare(`
    SELECT metric_count FROM admin_kpi_metrics WHERE metric_key = ?
  `).get(key);
  return row ? Number(row.metric_count) : 0;
}

function readOpsMetadataRowVersion(server, targetAccountId) {
  const row = server.DB.db.prepare(
    'SELECT row_version FROM account_ops_metadata WHERE account_id = ?',
  ).get(targetAccountId);
  if (!row) return 0;
  return Math.max(0, Number(row.row_version) || 0);
}

async function putOpsMetadata(server, as, targetAccountId, { patch, mutation, role = null, expectedRowVersion = undefined }) {
  // U8 CAS: auto-resolve the client-observed pre-image from the DB state
  // when the caller does not pin a specific value. Tests that exercise the
  // CAS path pin `expectedRowVersion` explicitly.
  const resolvedExpectedRowVersion = expectedRowVersion === undefined
    ? readOpsMetadataRowVersion(server, targetAccountId)
    : expectedRowVersion;
  return server.fetchAs(as, `https://repo.test/api/admin/accounts/${encodeURIComponent(targetAccountId)}/ops-metadata`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-platform-role': role || 'admin',
    },
    body: JSON.stringify({ patch, expectedRowVersion: resolvedExpectedRowVersion, mutation }),
  });
}

async function putErrorEventStatus(server, as, eventId, {
  status,
  mutation,
  role = null,
  expectedPreviousStatus = undefined,
}) {
  const body = { status, mutation };
  // U5 review follow-up (Finding 2): forward the optional CAS pre-image so
  // tests can exercise the stale-dispatch rejection path.
  if (expectedPreviousStatus !== undefined) {
    body.expectedPreviousStatus = expectedPreviousStatus;
  }
  return server.fetchAs(as, `https://repo.test/api/admin/ops/error-events/${encodeURIComponent(eventId)}/status`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-platform-role': role || 'admin',
    },
    body: JSON.stringify(body),
  });
}

test('U5 admin PUT /ops-metadata upserts row and returns refreshed entry', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);

    const response = await putOpsMetadata(server, 'adult-admin', 'adult-parent', {
      patch: {
        opsStatus: 'suspended',
        planLabel: 'Trial',
        tags: ['flagged', 'priority'],
        internalNotes: 'Parent on hold pending billing check.',
      },
      mutation: { requestId: 'req-ops-1', correlationId: 'corr-ops-1' },
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.accountOpsMetadataEntry.accountId, 'adult-parent');
    assert.equal(payload.accountOpsMetadataEntry.opsStatus, 'suspended');
    assert.equal(payload.accountOpsMetadataEntry.planLabel, 'Trial');
    assert.deepEqual(payload.accountOpsMetadataEntry.tags, ['flagged', 'priority']);
    assert.equal(payload.accountOpsMetadataEntry.internalNotes, 'Parent on hold pending billing check.');
    assert.equal(payload.accountOpsMetadataEntry.updatedByAccountId, 'adult-admin');
    assert.equal(payload.opsMetadataMutation.kind, 'admin.account_ops_metadata.update');
    assert.equal(payload.opsMetadataMutation.scopeType, 'account');
    assert.equal(payload.opsMetadataMutation.scopeId, 'adult-parent');
    assert.equal(payload.opsMetadataMutation.requestId, 'req-ops-1');
    assert.equal(payload.opsMetadataMutation.replayed, false);

    const dbRow = opsMetadataRow(server, 'adult-parent');
    assert.ok(dbRow);
    assert.equal(dbRow.ops_status, 'suspended');
    assert.equal(dbRow.plan_label, 'Trial');
    assert.equal(dbRow.internal_notes, 'Parent on hold pending billing check.');
    assert.deepEqual(JSON.parse(dbRow.tags_json), ['flagged', 'priority']);
    assert.equal(dbRow.updated_by_account_id, 'adult-admin');

    // account_ops_metadata.updates counter bumped inside the same batch.
    assert.equal(kpiValue(server, 'account_ops_metadata.updates'), 1);

    // Receipt landed with expected scope fields.
    const receipts = receiptRows(server, 'req-ops-1');
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].scope_type, 'account');
    assert.equal(receipts[0].scope_id, 'adult-parent');
    assert.equal(receipts[0].mutation_kind, 'admin.account_ops_metadata.update');
  } finally {
    server.close();
  }
});

test('U5 partial patch merges with existing row without clobbering untouched fields', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);

    // Seed an existing row.
    const first = await putOpsMetadata(server, 'adult-admin', 'adult-parent', {
      patch: {
        opsStatus: 'active',
        planLabel: 'Plan-A',
        tags: ['alpha'],
        internalNotes: 'Baseline notes.',
      },
      mutation: { requestId: 'req-merge-seed' },
    });
    assert.equal(first.status, 200);

    // Patch only the opsStatus — the other fields must survive.
    const response = await putOpsMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'payment_hold' },
      mutation: { requestId: 'req-merge-partial' },
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.accountOpsMetadataEntry.opsStatus, 'payment_hold');
    assert.equal(payload.accountOpsMetadataEntry.planLabel, 'Plan-A');
    assert.deepEqual(payload.accountOpsMetadataEntry.tags, ['alpha']);
    assert.equal(payload.accountOpsMetadataEntry.internalNotes, 'Baseline notes.');

    const dbRow = opsMetadataRow(server, 'adult-parent');
    assert.equal(dbRow.ops_status, 'payment_hold');
    assert.equal(dbRow.plan_label, 'Plan-A');
    assert.equal(dbRow.internal_notes, 'Baseline notes.');
    assert.deepEqual(JSON.parse(dbRow.tags_json), ['alpha']);
    assert.equal(kpiValue(server, 'account_ops_metadata.updates'), 2);
  } finally {
    server.close();
  }
});

test('U5 idempotency — same requestId + same payload returns stored response and writes once', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);

    // U8 CAS: pin `expectedRowVersion = 0` on both calls so the replay carries
    // the identical request hash as the original, keeping the idempotent
    // replay contract (the server's row_version has bumped to 1 but the
    // idempotency table preflight short-circuits before the CAS pre-check).
    const body = {
      patch: { opsStatus: 'suspended', planLabel: 'Trial' },
      mutation: { requestId: 'req-idem-1', correlationId: 'corr-idem-1' },
      expectedRowVersion: 0,
    };

    const first = await putOpsMetadata(server, 'adult-admin', 'adult-parent', body);
    const firstPayload = await first.json();
    assert.equal(first.status, 200);
    assert.equal(firstPayload.opsMetadataMutation.replayed, false);

    const replay = await putOpsMetadata(server, 'adult-admin', 'adult-parent', body);
    const replayPayload = await replay.json();
    assert.equal(replay.status, 200);
    assert.equal(replayPayload.opsMetadataMutation.replayed, true);
    // Stored receipt fields are preserved.
    assert.equal(replayPayload.accountOpsMetadataEntry.opsStatus, 'suspended');

    // Counter only bumped once despite replay.
    assert.equal(kpiValue(server, 'account_ops_metadata.updates'), 1);
    assert.equal(receiptRows(server, 'req-idem-1').length, 1);
  } finally {
    server.close();
  }
});

test('U5 idempotency reuse — same requestId with different payload returns 409 idempotency_reuse', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);

    const first = await putOpsMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'suspended' },
      mutation: { requestId: 'req-reuse' },
    });
    assert.equal(first.status, 200);

    const reuse = await putOpsMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'active' },
      mutation: { requestId: 'req-reuse' },
    });
    const reusePayload = await reuse.json();
    assert.equal(reuse.status, 409);
    assert.equal(reusePayload.code, 'idempotency_reuse');

    const dbRow = opsMetadataRow(server, 'adult-parent');
    assert.equal(dbRow.ops_status, 'suspended', 'original value preserved');
  } finally {
    server.close();
  }
});

test('U5 validation — opsStatus must be in the supported enum', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);

    const response = await putOpsMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'bogus' },
      mutation: { requestId: 'req-bad-status' },
    });
    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.equal(payload.code, 'validation_failed');
    assert.equal(payload.field, 'opsStatus');

    assert.equal(opsMetadataRow(server, 'adult-parent'), null);
  } finally {
    server.close();
  }
});

test('U5 validation — planLabel longer than 64 chars returns 400', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);
    const longLabel = 'x'.repeat(65);

    const response = await putOpsMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { planLabel: longLabel },
      mutation: { requestId: 'req-long-label' },
    });
    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.equal(payload.code, 'validation_failed');
    assert.equal(payload.field, 'planLabel');
  } finally {
    server.close();
  }
});

test('U5 validation — more than 10 tags returns 400', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);
    const tooMany = Array.from({ length: 11 }, (_, i) => `tag-${i}`);

    const response = await putOpsMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { tags: tooMany },
      mutation: { requestId: 'req-too-many-tags' },
    });
    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.equal(payload.code, 'validation_failed');
    assert.equal(payload.field, 'tags');
  } finally {
    server.close();
  }
});

test('U5 validation — internalNotes longer than 2000 chars returns 400', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);
    const tooLong = 'n'.repeat(2001);

    const response = await putOpsMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { internalNotes: tooLong },
      mutation: { requestId: 'req-long-notes' },
    });
    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.equal(payload.code, 'validation_failed');
    assert.equal(payload.field, 'internalNotes');
  } finally {
    server.close();
  }
});

test('U5 authz — ops role is forbidden from account ops metadata mutation', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);

    const response = await putOpsMetadata(server, 'adult-ops', 'adult-parent', {
      patch: { opsStatus: 'suspended' },
      mutation: { requestId: 'req-ops-role' },
      role: 'ops',
    });
    const payload = await response.json();
    assert.equal(response.status, 403);
    assert.equal(payload.code, 'account_roles_forbidden');
  } finally {
    server.close();
  }
});

test('U5 authz — parent role is forbidden from admin hub', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);

    const response = await putOpsMetadata(server, 'adult-parent', 'adult-parent', {
      patch: { opsStatus: 'suspended' },
      mutation: { requestId: 'req-parent-role' },
      role: 'parent',
    });
    const payload = await response.json();
    // Parent role trips the admin hub gate first — either 403 is fine as
    // long as no write landed.
    assert.equal(response.status, 403);
    assert.ok(['admin_hub_forbidden', 'account_roles_forbidden'].includes(payload.code));
    assert.equal(opsMetadataRow(server, 'adult-parent'), null);
  } finally {
    server.close();
  }
});

test('U5 authz — demo account is forbidden from admin hub even with admin role', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);
    seedAdultAccount(server, {
      id: 'demo-admin',
      email: null,
      displayName: 'Demo',
      platformRole: 'admin',
      now,
      accountType: 'demo',
      demoExpiresAt: now + 60_000,
    });

    const response = await putOpsMetadata(server, 'demo-admin', 'adult-parent', {
      patch: { opsStatus: 'suspended' },
      mutation: { requestId: 'req-demo-admin' },
      role: 'admin',
    });
    const payload = await response.json();
    assert.equal(response.status, 403);
    assert.equal(payload.code, 'admin_hub_forbidden');
  } finally {
    server.close();
  }
});

test('U5 happy — admin PUT /error-events/:id/status transitions status and swaps counters', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);
    insertOpsErrorEvent(server, {
      id: 'evt-1',
      fingerprint: 'fp-1',
      errorKind: 'TypeError',
      messageFirstLine: 'x is undefined',
      firstSeen: now - 10_000,
      lastSeen: now - 1_000,
      status: 'open',
    });
    // Seed counters to reflect the pre-existing event.
    insertAdminKpiMetric(server, {
      metricKey: 'ops_error_events.status.open',
      metricCount: 1,
      updatedAt: now,
    });

    const response = await putErrorEventStatus(server, 'adult-admin', 'evt-1', {
      status: 'resolved',
      mutation: { requestId: 'req-evt-1', correlationId: 'corr-evt-1' },
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.opsErrorEvent.status, 'resolved');
    assert.equal(payload.opsErrorEventStatusMutation.previousStatus, 'open');
    assert.equal(payload.opsErrorEventStatusMutation.status, 'resolved');
    assert.equal(payload.opsErrorEventStatusMutation.scopeType, 'platform');
    assert.equal(payload.opsErrorEventStatusMutation.scopeId, 'ops-error-event:evt-1');
    assert.equal(payload.opsErrorEventStatusMutation.replayed, false);

    assert.equal(errorEventRow(server, 'evt-1').status, 'resolved');
    assert.equal(kpiValue(server, 'ops_error_events.status.open'), 0);
    assert.equal(kpiValue(server, 'ops_error_events.status.resolved'), 1);

    const receipts = receiptRows(server, 'req-evt-1');
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].scope_type, 'platform');
    assert.equal(receipts[0].scope_id, 'ops-error-event:evt-1');
    assert.equal(receipts[0].mutation_kind, 'admin.ops_error_event.status-set');
  } finally {
    server.close();
  }
});

test('U5 error-event status — no-op when oldStatus equals newStatus', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);
    insertOpsErrorEvent(server, {
      id: 'evt-noop',
      fingerprint: 'fp-noop',
      errorKind: 'TypeError',
      messageFirstLine: 'noop scenario',
      firstSeen: now - 10_000,
      lastSeen: now - 5_000,
      status: 'investigating',
    });

    const response = await putErrorEventStatus(server, 'adult-admin', 'evt-noop', {
      status: 'investigating',
      mutation: { requestId: 'req-noop' },
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.noop, true);
    assert.equal(payload.opsErrorEvent.status, 'investigating');
    // No receipt stored, counters untouched.
    assert.equal(receiptRows(server, 'req-noop').length, 0);
    assert.equal(kpiValue(server, 'ops_error_events.status.investigating'), 0);
  } finally {
    server.close();
  }
});

test('U5 error-event status — 404 when id does not exist', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);

    const response = await putErrorEventStatus(server, 'adult-admin', 'missing-id', {
      status: 'resolved',
      mutation: { requestId: 'req-missing' },
    });
    const payload = await response.json();
    assert.equal(response.status, 404);
    assert.equal(payload.code, 'not_found');
  } finally {
    server.close();
  }
});

test('U5 error-event status — validation rejects unknown status', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);
    insertOpsErrorEvent(server, {
      id: 'evt-bad',
      fingerprint: 'fp-bad',
      errorKind: 'TypeError',
      messageFirstLine: 'bad status test',
      firstSeen: now,
      lastSeen: now,
      status: 'open',
    });

    const response = await putErrorEventStatus(server, 'adult-admin', 'evt-bad', {
      status: 'bogus',
      mutation: { requestId: 'req-bad-status' },
    });
    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.equal(payload.code, 'validation_failed');
    assert.equal(payload.field, 'status');
    assert.equal(errorEventRow(server, 'evt-bad').status, 'open');
  } finally {
    server.close();
  }
});

test('U5 error-event status — authz: ops role is forbidden', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);
    insertOpsErrorEvent(server, {
      id: 'evt-authz',
      fingerprint: 'fp-authz',
      errorKind: 'TypeError',
      messageFirstLine: 'authz scenario',
      firstSeen: now,
      lastSeen: now,
      status: 'open',
    });

    const response = await putErrorEventStatus(server, 'adult-ops', 'evt-authz', {
      status: 'resolved',
      mutation: { requestId: 'req-authz' },
      role: 'ops',
    });
    const payload = await response.json();
    assert.equal(response.status, 403);
    assert.equal(payload.code, 'account_roles_forbidden');
    assert.equal(errorEventRow(server, 'evt-authz').status, 'open');
  } finally {
    server.close();
  }
});

test('U5 error-event status — three-step transition keeps counter sum at exactly 1', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);
    insertOpsErrorEvent(server, {
      id: 'evt-swap',
      fingerprint: 'fp-swap',
      errorKind: 'TypeError',
      messageFirstLine: 'swap scenario',
      firstSeen: now,
      lastSeen: now,
      status: 'open',
    });
    insertAdminKpiMetric(server, {
      metricKey: 'ops_error_events.status.open',
      metricCount: 1,
      updatedAt: now,
    });

    const sumStatuses = () => ['open', 'investigating', 'resolved', 'ignored']
      .map((status) => kpiValue(server, `ops_error_events.status.${status}`))
      .reduce((total, value) => total + value, 0);

    const step1 = await putErrorEventStatus(server, 'adult-admin', 'evt-swap', {
      status: 'investigating',
      mutation: { requestId: 'req-step-1' },
    });
    assert.equal(step1.status, 200);
    assert.equal(sumStatuses(), 1);
    assert.equal(kpiValue(server, 'ops_error_events.status.open'), 0);
    assert.equal(kpiValue(server, 'ops_error_events.status.investigating'), 1);

    const step2 = await putErrorEventStatus(server, 'adult-admin', 'evt-swap', {
      status: 'resolved',
      mutation: { requestId: 'req-step-2' },
    });
    assert.equal(step2.status, 200);
    assert.equal(sumStatuses(), 1);
    assert.equal(kpiValue(server, 'ops_error_events.status.investigating'), 0);
    assert.equal(kpiValue(server, 'ops_error_events.status.resolved'), 1);

    const step3 = await putErrorEventStatus(server, 'adult-admin', 'evt-swap', {
      status: 'open',
      mutation: { requestId: 'req-step-3' },
    });
    assert.equal(step3.status, 200);
    assert.equal(sumStatuses(), 1);
    assert.equal(kpiValue(server, 'ops_error_events.status.resolved'), 0);
    assert.equal(kpiValue(server, 'ops_error_events.status.open'), 1);
  } finally {
    server.close();
  }
});

test('U5 batch atomicity — receipt failure rolls back UPSERT + counter bump', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);

    // Wrap the DB to throw on the INSERT INTO mutation_receipts statement on
    // the first attempt only — mirroring the monster-visual-config rollback
    // test pattern.
    const originalPrepare = server.DB.prepare.bind(server.DB);
    let triggered = false;
    server.env.DB = {
      ...server.DB,
      prepare(sql) {
        const statement = originalPrepare(sql);
        if (!/INSERT\s+INTO\s+mutation_receipts/i.test(String(sql || ''))) return statement;
        return {
          bind(...params) {
            const bound = statement.bind(...params);
            return {
              async run() {
                if (!triggered) {
                  triggered = true;
                  throw new Error('receipt storage unavailable');
                }
                return bound.run();
              },
              first: (...args) => bound.first(...args),
              all: (...args) => bound.all(...args),
            };
          },
        };
      },
      batch: (...args) => server.DB.batch(...args),
      exec: (...args) => server.DB.exec(...args),
    };

    const failed = await putOpsMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'suspended' },
      mutation: { requestId: 'req-batch-fail' },
    });
    assert.equal(failed.status, 500);

    // Nothing should have been written — UPSERT + counter bump rolled back.
    assert.equal(opsMetadataRow(server, 'adult-parent'), null);
    assert.equal(kpiValue(server, 'account_ops_metadata.updates'), 0);
    assert.equal(receiptRows(server, 'req-batch-fail').length, 0);

    // Retry should succeed because the failure only triggered once.
    const retry = await putOpsMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'suspended' },
      mutation: { requestId: 'req-batch-fail' },
    });
    const retryPayload = await retry.json();
    assert.equal(retry.status, 200);
    assert.equal(retryPayload.accountOpsMetadataEntry.opsStatus, 'suspended');
    assert.equal(kpiValue(server, 'account_ops_metadata.updates'), 1);
  } finally {
    server.close();
  }
});

test('U5 integration — hub admin payload reflects metadata change after PUT', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);

    const put = await putOpsMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'payment_hold', planLabel: 'Billing follow-up' },
      mutation: { requestId: 'req-hub-integration' },
    });
    assert.equal(put.status, 200);

    const hubResponse = await server.fetchAs('adult-admin', 'https://repo.test/api/hubs/admin', {}, {
      'x-ks2-dev-platform-role': 'admin',
    });
    const hubPayload = await hubResponse.json();
    const entry = hubPayload.adminHub.accountOpsMetadata.accounts
      .find((row) => row.accountId === 'adult-parent');
    assert.ok(entry);
    assert.equal(entry.opsStatus, 'payment_hold');
    assert.equal(entry.planLabel, 'Billing follow-up');
  } finally {
    server.close();
  }
});

test('U5 integration — hub admin KPI counter reflects account ops update volume', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);

    for (let i = 0; i < 3; i += 1) {
      const response = await putOpsMetadata(server, 'adult-admin', 'adult-parent', {
        patch: { planLabel: `Plan-${i}` },
        mutation: { requestId: `req-kpi-${i}` },
      });
      assert.equal(response.status, 200);
    }

    const kpi = await server.fetchAs('adult-admin', 'https://repo.test/api/admin/ops/kpi', {}, {
      'x-ks2-dev-platform-role': 'admin',
    });
    const kpiPayload = await kpi.json();
    assert.equal(kpiPayload.accountOpsUpdates.total, 3);
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// U5 review follow-up coverage (Findings 2 + 3):
//   - Concurrent status transition race: two admins both think the row is
//     still `open`; first succeeds, second is rejected with 409
//     `ops_error_event_status_stale` and the counter sum across statuses
//     stays at exactly 1 (first admin's swap landed, second admin's did not).
//   - `last_seen` preserved on status transition: the observation timestamp
//     must NOT be rewritten to the admin's resolution time, because the
//     error-log triage view orders by `last_seen DESC`.
//   - In-flight client guard: noted as client-side defence-in-depth; there is
//     no server-side hook suitable for this behaviour, so the test lives on
//     the client side only (see `tests/react-hub-surfaces.test.js` if a
//     natural harness exists; else a TODO is left in `src/main.js`).
// ---------------------------------------------------------------------------

test('U5 follow-up — concurrent status race: second admin with stale expectedPreviousStatus gets 409', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);
    insertOpsErrorEvent(server, {
      id: 'evt-race',
      fingerprint: 'fp-race',
      errorKind: 'TypeError',
      messageFirstLine: 'race scenario',
      firstSeen: now - 10_000,
      lastSeen: now - 1_000,
      status: 'open',
    });
    insertAdminKpiMetric(server, {
      metricKey: 'ops_error_events.status.open',
      metricCount: 1,
      updatedAt: now,
    });

    const sumStatuses = () => ['open', 'investigating', 'resolved', 'ignored']
      .map((status) => kpiValue(server, `ops_error_events.status.${status}`))
      .reduce((total, value) => total + value, 0);

    // Admin A wins the race: transitions open → resolved using the pre-read
    // status 'open' as the CAS pre-image. Counter swap lands.
    const first = await putErrorEventStatus(server, 'adult-admin', 'evt-race', {
      status: 'resolved',
      expectedPreviousStatus: 'open',
      mutation: { requestId: 'req-race-first' },
    });
    assert.equal(first.status, 200);
    const firstPayload = await first.json();
    assert.equal(firstPayload.opsErrorEvent.status, 'resolved');
    assert.equal(kpiValue(server, 'ops_error_events.status.open'), 0);
    assert.equal(kpiValue(server, 'ops_error_events.status.resolved'), 1);
    assert.equal(sumStatuses(), 1);

    // Admin B arrives second but still believes the row is 'open' — their
    // pre-read CAS pre-image is now stale. The Worker rejects the dispatch
    // with 409 ops_error_event_status_stale; counter deltas never fire so
    // the sum across statuses stays at exactly 1 (not 2).
    const second = await putErrorEventStatus(server, 'adult-admin', 'evt-race', {
      status: 'ignored',
      expectedPreviousStatus: 'open',
      mutation: { requestId: 'req-race-second' },
    });
    assert.equal(second.status, 409);
    const secondPayload = await second.json();
    assert.equal(secondPayload.code, 'ops_error_event_status_stale');
    assert.equal(secondPayload.expected, 'open');
    assert.equal(secondPayload.current, 'resolved');
    assert.equal(secondPayload.retryable, true);

    // Row remains where admin A left it; counters remain pristine.
    assert.equal(errorEventRow(server, 'evt-race').status, 'resolved');
    assert.equal(kpiValue(server, 'ops_error_events.status.open'), 0);
    assert.equal(kpiValue(server, 'ops_error_events.status.resolved'), 1);
    assert.equal(kpiValue(server, 'ops_error_events.status.ignored'), 0);
    assert.equal(sumStatuses(), 1);

    // No receipt was stored for the stale dispatch — retry with a fresh
    // pre-image must not be blocked by idempotency replay.
    assert.equal(receiptRows(server, 'req-race-second').length, 0);

    // Admin B retries with the fresh pre-image 'resolved' and the transition
    // now lands cleanly.
    const retry = await putErrorEventStatus(server, 'adult-admin', 'evt-race', {
      status: 'ignored',
      expectedPreviousStatus: 'resolved',
      mutation: { requestId: 'req-race-retry' },
    });
    assert.equal(retry.status, 200);
    assert.equal(errorEventRow(server, 'evt-race').status, 'ignored');
    assert.equal(sumStatuses(), 1);
  } finally {
    server.close();
  }
});

test('U5 follow-up — last_seen is preserved on status transition', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);
    // Seed an event with a fixed last_seen timestamp well in the past.
    const observedAt = now - 30_000;
    insertOpsErrorEvent(server, {
      id: 'evt-last-seen',
      fingerprint: 'fp-last-seen',
      errorKind: 'TypeError',
      messageFirstLine: 'last_seen scenario',
      firstSeen: observedAt - 5_000,
      lastSeen: observedAt,
      status: 'open',
    });

    const response = await putErrorEventStatus(server, 'adult-admin', 'evt-last-seen', {
      status: 'investigating',
      mutation: { requestId: 'req-last-seen' },
    });
    assert.equal(response.status, 200);
    const payload = await response.json();

    // The returned entry's lastSeen must be the original observation time,
    // NOT the admin's resolution time. Triage ordering relies on this.
    assert.equal(payload.opsErrorEvent.lastSeen, observedAt);

    // DB row should also preserve the original last_seen.
    const dbRow = errorEventRow(server, 'evt-last-seen');
    assert.equal(dbRow.last_seen, observedAt);
    assert.equal(dbRow.status, 'investigating');
  } finally {
    server.close();
  }
});

test('U5 follow-up — expectedPreviousStatus validation rejects unknown value', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);
    insertOpsErrorEvent(server, {
      id: 'evt-validation',
      fingerprint: 'fp-validation',
      errorKind: 'TypeError',
      messageFirstLine: 'bad expectedPreviousStatus',
      firstSeen: now,
      lastSeen: now,
      status: 'open',
    });

    const response = await putErrorEventStatus(server, 'adult-admin', 'evt-validation', {
      status: 'resolved',
      expectedPreviousStatus: 'bogus',
      mutation: { requestId: 'req-bad-expected' },
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_failed');
    assert.equal(payload.field, 'expectedPreviousStatus');
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// H3 (Phase C reviewer): role update CAS on `repo_revision` + atomicity of
// the UPDATE + mutation receipt write. Before the fix, the site composed
// the UPDATE, a directory re-read, and the receipt INSERT as three
// separate D1 calls — a failure between the UPDATE and the receipt INSERT
// would leave the role committed without an audit trail. Now both land in
// one atomic batch().
// ---------------------------------------------------------------------------

async function putRole(server, actor, targetAccountId, { platformRole, requestId, expectedRepoRevision, role = 'admin' } = {}) {
  const body = { accountId: targetAccountId, platformRole, requestId };
  if (expectedRepoRevision !== undefined) body.expectedRepoRevision = expectedRepoRevision;
  return server.fetchAs(actor, 'https://repo.test/api/admin/accounts/role', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-platform-role': role,
    },
    body: JSON.stringify(body),
  });
}

test('H3 role CAS — stale expectedRepoRevision returns 409 account_role_stale', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);
    // Seed a second admin so the first can be safely demoted (avoids last-admin guard).
    seedAdultAccount(server, { id: 'adult-admin-2', platformRole: 'admin', now });

    // Bump repo_revision manually to simulate a concurrent write.
    server.DB.db.prepare(`
      UPDATE adult_accounts SET repo_revision = ? WHERE id = ?
    `).run(3, 'adult-parent');

    // Caller observed revision 2 (stale) and tries to demote.
    const response = await putRole(server, 'adult-admin', 'adult-parent', {
      platformRole: 'ops',
      expectedRepoRevision: 2,
      requestId: 'req-role-stale',
    });
    assert.equal(response.status, 409);
    const payload = await response.json();
    assert.equal(payload.code, 'account_role_stale');
    assert.equal(payload.expected, 2);
    assert.equal(payload.current, 3);
    // Role unchanged.
    const roleNow = server.DB.db.prepare('SELECT platform_role FROM adult_accounts WHERE id = ?').get('adult-parent').platform_role;
    assert.equal(roleNow, 'parent');
  } finally {
    server.close();
  }
});

test('H3 role happy — expectedRepoRevision matching current on-disk value succeeds and bumps revision', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);
    seedAdultAccount(server, { id: 'adult-admin-2', platformRole: 'admin', now });

    const beforeRevision = Number(server.DB.db.prepare('SELECT repo_revision FROM adult_accounts WHERE id = ?').get('adult-parent').repo_revision);

    const response = await putRole(server, 'adult-admin', 'adult-parent', {
      platformRole: 'ops',
      expectedRepoRevision: beforeRevision,
      requestId: 'req-role-cas-ok',
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.updatedAccount.platformRole, 'ops');
    assert.equal(payload.roleMutation.repoRevision, beforeRevision + 1);

    const afterRevision = Number(server.DB.db.prepare('SELECT repo_revision FROM adult_accounts WHERE id = ?').get('adult-parent').repo_revision);
    assert.equal(afterRevision, beforeRevision + 1);
  } finally {
    server.close();
  }
});

test('H3 role last-admin — demoting the sole admin still surfaces 409 last_admin_required (regression)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);
    // Only one admin exists (adult-admin). Attempt to demote returns 409.
    const response = await putRole(server, 'adult-admin', 'adult-admin', {
      platformRole: 'parent',
      requestId: 'req-role-last-admin',
    });
    assert.equal(response.status, 409);
    const payload = await response.json();
    assert.equal(payload.code, 'last_admin_required');
    const roleNow = server.DB.db.prepare('SELECT platform_role FROM adult_accounts WHERE id = ?').get('adult-admin').platform_role;
    assert.equal(roleNow, 'admin');

    // B-RE-1 (re-review Blocker): the receipt INSERT is EXISTS-guarded on
    // the post-bump `(platform_role, repo_revision, updated_at)` tuple, so
    // when the last-admin guard blocks the UPDATE (rowsAffected=0) the
    // receipt does not land. Without this guard, a retry with the same
    // requestId would replay the phantom 409 body as an idempotent
    // response — masking the retry's outcome from the caller.
    assert.equal(receiptRows(server, 'req-role-last-admin').length, 0, 'last-admin-guard failure must NOT persist a mutation_receipt');
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// B-RE-1 (re-review Blocker): retry after last-admin block. The first
// attempt is blocked by the last-admin guard and must NOT persist a
// receipt. A second attempt with the same requestId but a fresh target
// (not the last admin) must succeed with a fresh 200, not a replayed
// phantom 409.
// ---------------------------------------------------------------------------
test('B-RE-1 retry after last-admin — same requestId against a different target succeeds with a fresh commit', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);

    // First attempt: demote the sole admin → 409 last_admin_required, no
    // receipt stored.
    const first = await putRole(server, 'adult-admin', 'adult-admin', {
      platformRole: 'parent',
      requestId: 'req-role-retry',
    });
    assert.equal(first.status, 409);
    assert.equal(receiptRows(server, 'req-role-retry').length, 0, 'no receipt must land on last-admin guard failure');

    // Second attempt: same requestId, different target (adult-parent → ops).
    // Payload hash differs (target changed), so the idempotency preflight
    // would surface `idempotency_reuse` if a receipt HAD persisted. With
    // the B-RE-1 guard, no receipt exists → the retry proceeds to a fresh
    // commit. Seed a second admin first so the unrelated demote does not
    // trip the last-admin guard.
    seedAdultAccount(server, { id: 'adult-admin-2', platformRole: 'admin', now });
    const retry = await putRole(server, 'adult-admin', 'adult-parent', {
      platformRole: 'ops',
      requestId: 'req-role-retry',
    });
    assert.equal(retry.status, 200);
    const retryPayload = await retry.json();
    assert.equal(retryPayload.roleMutation.replayed, false, 'retry must be a fresh commit, not a phantom replay');
    assert.equal(retryPayload.updatedAccount.platformRole, 'ops');
  } finally {
    server.close();
  }
});

test('H3 role atomicity — receipt INSERT failure rolls back the UPDATE', async () => {
  // Force the batch's second statement (the mutation_receipts INSERT) to
  // fail. The atomic batch must roll the UPDATE back.
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);
    seedAdultAccount(server, { id: 'adult-admin-2', platformRole: 'admin', now });
    const beforeRole = server.DB.db.prepare('SELECT platform_role FROM adult_accounts WHERE id = ?').get('adult-parent').platform_role;
    assert.equal(beforeRole, 'parent');

    // Monkey-patch batch so the SECOND statement (receipts insert) throws.
    const d1 = server.DB;
    const originalBatch = d1.batch.bind(d1);
    d1.batch = async (statements) => {
      // Replace the 2nd statement with one whose .run() throws.
      const malformed = [
        statements[0],
        { run: async () => { throw new Error('synthetic receipt insert failure'); } },
      ];
      return originalBatch(malformed);
    };

    try {
      const response = await putRole(server, 'adult-admin', 'adult-parent', {
        platformRole: 'ops',
        requestId: 'req-role-atomic',
      });
      assert.notEqual(response.status, 200);
    } catch { /* transport-level failure is acceptable here */ }

    // The role must NOT have changed — the batch rolled back.
    const afterRole = server.DB.db.prepare('SELECT platform_role FROM adult_accounts WHERE id = ?').get('adult-parent').platform_role;
    assert.equal(afterRole, 'parent', 'role must remain parent because the batch aborted atomically');
  } finally {
    server.close();
  }
});

test('H3 role idempotency — same requestId replays cached receipt', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);
    seedAdultAccount(server, { id: 'adult-admin-2', platformRole: 'admin', now });

    const first = await putRole(server, 'adult-admin', 'adult-parent', {
      platformRole: 'ops',
      requestId: 'req-role-replay',
    });
    assert.equal(first.status, 200);

    const replay = await putRole(server, 'adult-admin', 'adult-parent', {
      platformRole: 'ops',
      requestId: 'req-role-replay',
    });
    assert.equal(replay.status, 200);
    const payload = await replay.json();
    assert.equal(payload.roleMutation.replayed, true);
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// I3 (Phase C reviewer): per-session rate limit on admin-ops mutation
// routes. 60 requests per minute per authenticated session is generous
// for a legit dashboard workflow but stops a runaway loop / scripted
// spam from saturating the CAS + batch write path. Bucket key is
// `admin-ops-mutation` scoped to session.accountId so the same admin
// hitting three different routes shares one budget.
// ---------------------------------------------------------------------------
test('I3 rate limit — 61st /ops-metadata PUT from same session hits 429', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedCore(server, now);

    // Seed a row so the rest of the requests share a cheap row_version
    // merge path. Body carries `expectedRowVersion` the test helper
    // auto-resolves on every call.
    const seed = await putOpsMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { opsStatus: 'active' },
      mutation: { requestId: 'req-seed-rate' },
    });
    assert.equal(seed.status, 200);

    // Fire 60 requests which should all pass. Then the 61st hits 429.
    let last200Count = 1; // counting seed
    for (let i = 0; i < 59; i += 1) {
      const response = await putOpsMetadata(server, 'adult-admin', 'adult-parent', {
        patch: { planLabel: `Plan-${i}` },
        mutation: { requestId: `req-rate-${i}` },
      });
      if (response.status === 200) {
        last200Count += 1;
      } else if (response.status === 429) {
        break;
      }
    }
    assert.equal(last200Count, 60, 'first 60 requests allowed through rate limit');

    // 61st — should be throttled.
    const throttled = await putOpsMetadata(server, 'adult-admin', 'adult-parent', {
      patch: { planLabel: 'Plan-throttle' },
      mutation: { requestId: 'req-rate-throttle' },
    });
    assert.equal(throttled.status, 429);
    const payload = await throttled.json();
    assert.equal(payload.code, 'admin_ops_mutation_rate_limited');
    assert.ok(Number.isFinite(payload.retryAfterSeconds));
    assert.ok(payload.retryAfterSeconds >= 0);
  } finally {
    server.close();
  }
});
