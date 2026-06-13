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
  const originalDateNow = Date.now;
  const fixedNow = 1_700_000_000_000;
  Date.now = () => fixedNow;
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
    Date.now = originalDateNow;
    server.close();
  }
});
