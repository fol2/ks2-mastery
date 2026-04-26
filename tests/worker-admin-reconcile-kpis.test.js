// U10 coverage: admin-only reconcileAdminKpiMetrics route + repository
// helper. Every invocation goes through the Worker, so single-flight
// lock + CAS-takeover + mutation-receipt-for-forensic are all exercised.
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U10

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';
import { reconcileLockHashForRequestId } from '../worker/src/repository.js';

function seedAdultAccount(server, {
  id,
  email = null,
  platformRole = 'parent',
  now = 1,
  accountType = 'real',
} = {}) {
  server.DB.db.prepare(`
    INSERT INTO adult_accounts (
      id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, repo_revision, account_type, demo_expires_at
    )
    VALUES (?, ?, NULL, ?, NULL, ?, ?, 0, ?, NULL)
  `).run(id, email, platformRole, now, now, accountType);
}

function seedErrorEvent(server, { id, status, now = 1 }) {
  server.DB.db.prepare(`
    INSERT INTO ops_error_events (
      id, fingerprint, error_kind, message_first_line, first_frame,
      route_name, user_agent, account_id, first_seen, last_seen,
      occurrence_count, status
    )
    VALUES (?, ?, 'TypeError', 'boom', 'at x', '/x', 'ua', NULL, ?, ?, 1, ?)
  `).run(id, `fp-${id}`, now, now, status);
}

function kpiRow(server, key) {
  const row = server.DB.db.prepare(`
    SELECT metric_key, metric_count, updated_at
    FROM admin_kpi_metrics
    WHERE metric_key = ?
  `).get(key);
  return row || null;
}

async function postReconcile(server, as, { requestId = 'req-reconcile-1', correlationId = null, computedValues = null, role = 'admin' } = {}) {
  return server.fetchAs(as, 'https://repo.test/api/admin/ops/reconcile-kpis', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-platform-role': role,
    },
    body: JSON.stringify({
      mutation: { requestId, correlationId: correlationId || requestId },
      computedValues,
    }),
  });
}

test('U10 happy — reconciliation recomputes server-side and writes authoritative counts', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin', now });
    seedErrorEvent(server, { id: 'evt-a', status: 'open', now });
    seedErrorEvent(server, { id: 'evt-b', status: 'open', now });
    seedErrorEvent(server, { id: 'evt-c', status: 'resolved', now });

    const response = await postReconcile(server, 'adult-admin', { requestId: 'req-happy' });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.appliedCounts['ops_error_events.status.open'], 2);
    assert.equal(payload.appliedCounts['ops_error_events.status.resolved'], 1);
    assert.equal(payload.appliedCounts['ops_error_events.status.investigating'], 0);
    assert.equal(payload.appliedCounts['ops_error_events.status.ignored'], 0);

    assert.equal(kpiRow(server, 'ops_error_events.status.open').metric_count, 2);
    assert.equal(kpiRow(server, 'ops_error_events.status.resolved').metric_count, 1);
  } finally {
    server.close();
  }
});

test('U10 tampering — client-reported computedValues does NOT override server recompute', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin', now });
    for (let i = 0; i < 5; i += 1) seedErrorEvent(server, { id: `evt-${i}`, status: 'open', now });

    const response = await postReconcile(server, 'adult-admin', {
      requestId: 'req-tamper',
      computedValues: { 'ops_error_events.status.open': 0 },
    });
    assert.equal(response.status, 200);
    const payload = await response.json();

    // Server recompute wins.
    assert.equal(payload.appliedCounts['ops_error_events.status.open'], 5);
    // But forensic diff captured the discrepancy.
    const delta = payload.deltas['ops_error_events.status.open'];
    assert.equal(delta.clientComputed, 0);
    assert.equal(delta.serverComputed, 5);
    assert.equal(delta.clientServerDelta, -5);
  } finally {
    server.close();
  }
});

test('U10 409 — concurrent reconciliation is rejected as reconcile_in_progress', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin', now });
    // Seed a non-stale lock held by a different owner hash.
    const rivalHash = reconcileLockHashForRequestId('req-rival');
    server.DB.db.prepare(`
      INSERT INTO admin_kpi_metrics (metric_key, metric_count, updated_at)
      VALUES ('reconcile_pending:lock', ?, ?)
    `).run(rivalHash, now);

    const response = await postReconcile(server, 'adult-admin', { requestId: 'req-me' });
    assert.equal(response.status, 409);
    const payload = await response.json();
    assert.equal(payload.code, 'reconcile_in_progress');
    // Lock row untouched — still pointing at the rival owner.
    const lock = kpiRow(server, 'reconcile_pending:lock');
    assert.equal(Number(lock.metric_count), rivalHash);
  } finally {
    server.close();
  }
});

test('U10 stale-lock takeover — a caller waiting > 10 minutes CAS-takes-over the lock', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin', now });
    seedErrorEvent(server, { id: 'evt-s', status: 'investigating', now });
    // Seed a stale lock: updated 11 minutes ago.
    const rivalHash = reconcileLockHashForRequestId('req-rival');
    const staleUpdatedAt = now - 11 * 60 * 1000;
    server.DB.db.prepare(`
      INSERT INTO admin_kpi_metrics (metric_key, metric_count, updated_at)
      VALUES ('reconcile_pending:lock', ?, ?)
    `).run(rivalHash, staleUpdatedAt);

    const response = await postReconcile(server, 'adult-admin', { requestId: 'req-me' });
    assert.equal(response.status, 200);
    // Lock has been released after completion.
    assert.equal(kpiRow(server, 'reconcile_pending:lock'), null);
    // Reconciliation wrote the authoritative status count.
    assert.equal(kpiRow(server, 'ops_error_events.status.investigating').metric_count, 1);
  } finally {
    server.close();
  }
});

test('U10 authz — non-admin role cannot reconcile', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, { id: 'adult-ops', platformRole: 'ops', now });
    const response = await postReconcile(server, 'adult-ops', { requestId: 'req-ops', role: 'ops' });
    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.code, 'account_roles_forbidden');
  } finally {
    server.close();
  }
});

test('U10 mutation receipt — reconciliation writes a admin.ops.reconcile_kpis receipt', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin', now });
    seedErrorEvent(server, { id: 'evt-x', status: 'resolved', now });

    const requestId = 'req-receipt';
    const response = await postReconcile(server, 'adult-admin', { requestId });
    assert.equal(response.status, 200);

    const row = server.DB.db.prepare(`
      SELECT account_id, request_id, scope_type, scope_id, mutation_kind, response_json
      FROM mutation_receipts
      WHERE request_id = ?
    `).get(requestId);
    assert.ok(row, 'mutation receipt row should exist');
    assert.equal(row.mutation_kind, 'admin.ops.reconcile_kpis');
    assert.equal(row.scope_type, 'platform');
    assert.equal(row.scope_id, `reconcile-kpis:${requestId}`);
    const parsed = JSON.parse(row.response_json);
    assert.ok(parsed.reconcile);
    assert.equal(parsed.reconcile.requestId, requestId);
    assert.ok(parsed.reconcile.deltas);
  } finally {
    server.close();
  }
});

test('U10 validation — missing requestId rejects with 400', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin', now });
    const response = await server.fetchAs('adult-admin', 'https://repo.test/api/admin/ops/reconcile-kpis', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://repo.test',
        'x-ks2-dev-platform-role': 'admin',
      },
      body: JSON.stringify({ mutation: {}, computedValues: null }),
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_failed');
    assert.equal(payload.field, 'requestId');
  } finally {
    server.close();
  }
});

test('U10 reconcileLockHashForRequestId — deterministic non-negative integer', () => {
  assert.equal(reconcileLockHashForRequestId('req-a'), reconcileLockHashForRequestId('req-a'));
  assert.notEqual(reconcileLockHashForRequestId('req-a'), reconcileLockHashForRequestId('req-b'));
  assert.equal(reconcileLockHashForRequestId(null), 0);
  assert.equal(reconcileLockHashForRequestId(''), 0);
  for (const sample of ['req-1', 'req-2', 'c'.repeat(50)]) {
    const value = reconcileLockHashForRequestId(sample);
    assert.ok(Number.isInteger(value));
    assert.ok(value >= 0);
  }
});

// ---------------------------------------------------------------------------
// H2 (Phase C reviewer): idempotency preflight — a retried reconcile with
// the same requestId must return the cached response BEFORE acquiring the
// single-flight lock. Prevents a backoff-retry storm from forcing every
// caller into the lock and every caller observing 409 reconcile_in_progress
// despite the first reconcile having landed.
// ---------------------------------------------------------------------------

test('H2 idempotency — same requestId + same computedValues replays cached response without writing a new receipt', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin', now });
    seedErrorEvent(server, { id: 'evt-a', status: 'open', now });
    seedErrorEvent(server, { id: 'evt-b', status: 'resolved', now });

    const body = { requestId: 'req-idem', computedValues: null };
    const first = await postReconcile(server, 'adult-admin', body);
    assert.equal(first.status, 200);
    const firstPayload = await first.json();
    assert.equal(firstPayload.appliedCounts['ops_error_events.status.open'], 1);

    // Retry with the same requestId. The preflight should short-circuit
    // BEFORE the lock is acquired, and the response should mark `cached:
    // true` while preserving the same applied counts. The mutation_receipts
    // table should still only have one row for this requestId.
    const second = await postReconcile(server, 'adult-admin', body);
    assert.equal(second.status, 200);
    const secondPayload = await second.json();
    assert.equal(secondPayload.ok, true);
    assert.equal(secondPayload.cached, true);
    assert.equal(secondPayload.appliedCounts['ops_error_events.status.open'], 1);

    const receiptCount = server.DB.db.prepare(`
      SELECT COUNT(*) AS count FROM mutation_receipts WHERE request_id = ?
    `).get('req-idem').count;
    assert.equal(receiptCount, 1);
  } finally {
    server.close();
  }
});

test('H2 idempotency_reuse — same requestId + different computedValues is rejected 409', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, { id: 'adult-admin', platformRole: 'admin', now });
    seedErrorEvent(server, { id: 'evt-a', status: 'open', now });

    const requestId = 'req-idem-reuse';
    const first = await postReconcile(server, 'adult-admin', { requestId, computedValues: { 'ops_error_events.status.open': 1 } });
    assert.equal(first.status, 200);

    // Replay with different computedValues — idempotency layer flags reuse.
    const reuse = await postReconcile(server, 'adult-admin', { requestId, computedValues: { 'ops_error_events.status.open': 99 } });
    assert.equal(reuse.status, 409);
    const payload = await reuse.json();
    assert.equal(payload.code, 'idempotency_reuse');
  } finally {
    server.close();
  }
});
