import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

function seedAdultAccount(server, {
  id,
  email,
  displayName,
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

function insertMutationReceipt(server, {
  accountId,
  requestId,
  scopeType,
  scopeId,
  mutationKind,
  response = { ok: true },
  statusCode = 200,
  correlationId = null,
  appliedAt,
  requestHash = 'hash',
}) {
  server.DB.db.prepare(`
    INSERT INTO mutation_receipts (
      account_id, request_id, scope_type, scope_id, mutation_kind,
      request_hash, response_json, status_code, correlation_id, applied_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    accountId,
    requestId,
    scopeType,
    scopeId,
    mutationKind,
    requestHash,
    JSON.stringify(response),
    statusCode,
    correlationId,
    appliedAt,
  );
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

function insertAccountOpsMetadata(server, {
  accountId,
  opsStatus = 'active',
  planLabel = null,
  tagsJson = '[]',
  internalNotes = null,
  updatedAt,
  updatedByAccountId = null,
}) {
  server.DB.db.prepare(`
    INSERT INTO account_ops_metadata (
      account_id, ops_status, plan_label, tags_json, internal_notes,
      updated_at, updated_by_account_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(accountId, opsStatus, planLabel, tagsJson, internalNotes, updatedAt, updatedByAccountId);
}

function insertAdminKpiMetric(server, { metricKey, metricCount, updatedAt }) {
  server.DB.db.prepare(`
    INSERT INTO admin_kpi_metrics (metric_key, metric_count, updated_at)
    VALUES (?, ?, ?)
  `).run(metricKey, metricCount, updatedAt);
}

function seedAdminAndOps(server, now = 1_700_000_000_000) {
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

test('GET /api/admin/ops/kpi returns all counters as non-negative integers', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdminAndOps(server, now);

    const response = await server.fetchAs('adult-admin', 'https://repo.test/api/admin/ops/kpi', {}, {
      'x-ks2-dev-platform-role': 'admin',
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(typeof payload.generatedAt, 'number');
    assert.equal(typeof payload.accounts.total, 'number');
    assert.ok(payload.accounts.total >= 0);
    assert.equal(typeof payload.learners.total, 'number');
    assert.ok(payload.learners.total >= 0);
    assert.equal(typeof payload.demos.active, 'number');
    assert.ok(payload.demos.active >= 0);
    assert.equal(typeof payload.practiceSessions.last7d, 'number');
    assert.equal(typeof payload.practiceSessions.last30d, 'number');
    assert.equal(typeof payload.eventLog.last7d, 'number');
    assert.equal(typeof payload.mutationReceipts.last7d, 'number');
    for (const statusKey of ['open', 'investigating', 'resolved', 'ignored']) {
      assert.equal(typeof payload.errorEvents.byStatus[statusKey], 'number');
      assert.ok(payload.errorEvents.byStatus[statusKey] >= 0);
    }
    assert.equal(typeof payload.accountOpsUpdates.total, 'number');
  } finally {
    server.close();
  }
});

test('GET /api/admin/ops/kpi counts only the three non-demo accounts and active demos', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdminAndOps(server, now);
    seedAdultAccount(server, {
      id: 'demo-active',
      email: null,
      displayName: 'Demo',
      platformRole: 'parent',
      now,
      accountType: 'demo',
      demoExpiresAt: now + 60_000,
    });
    seedAdultAccount(server, {
      id: 'demo-expired',
      email: null,
      displayName: 'Demo Expired',
      platformRole: 'parent',
      now,
      accountType: 'demo',
      demoExpiresAt: now - 60_000,
    });

    const response = await server.fetchAs('adult-admin', 'https://repo.test/api/admin/ops/kpi', {}, {
      'x-ks2-dev-platform-role': 'admin',
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.accounts.total, 3);
    assert.equal(payload.demos.active, 1);
  } finally {
    server.close();
  }
});

test('GET /api/admin/ops/activity returns masked account ids ordered by applied_at DESC', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    // Accounts chosen so their ids end with distinctive six-char suffixes.
    seedAdultAccount(server, {
      id: 'adult-admin',
      email: 'admin@example.com',
      displayName: 'Admin',
      platformRole: 'admin',
      now,
    });
    seedAdultAccount(server, {
      id: 'adult-account-abc123',
      email: 'a@example.com',
      displayName: 'Account A',
      platformRole: 'parent',
      now,
    });
    seedAdultAccount(server, {
      id: 'adult-account-xyz999',
      email: 'b@example.com',
      displayName: 'Account B',
      platformRole: 'parent',
      now,
    });

    insertMutationReceipt(server, {
      accountId: 'adult-account-abc123',
      requestId: 'req-older',
      scopeType: 'account',
      scopeId: 'adult-account-abc123',
      mutationKind: 'admin.account_role.update',
      appliedAt: now - 2_000,
    });
    insertMutationReceipt(server, {
      accountId: 'adult-account-xyz999',
      requestId: 'req-newer',
      scopeType: 'learner',
      scopeId: 'learner-some-very-long-uuid-abcdef1234567890',
      mutationKind: 'learners.write',
      appliedAt: now - 1_000,
    });

    const response = await server.fetchAs('adult-admin', 'https://repo.test/api/admin/ops/activity', {}, {
      'x-ks2-dev-platform-role': 'admin',
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.entries.length, 2);
    assert.equal(payload.entries[0].requestId, 'req-newer');
    assert.equal(payload.entries[1].requestId, 'req-older');
    assert.equal(payload.entries[0].accountIdMasked, 'xyz999');
    assert.equal(payload.entries[1].accountIdMasked, 'abc123');
    // R26: learner-scoped scope_id masked to last 8 chars.
    assert.equal(payload.entries[0].scopeId, '34567890');
    // account-scoped scope_id masked to last 6 chars.
    assert.equal(payload.entries[1].scopeId, 'abc123');
  } finally {
    server.close();
  }
});

test('GET /api/admin/ops/activity caps limit at 50', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdminAndOps(server, now);
    // All receipts hang off the admin account to satisfy the FK on mutation_receipts.account_id.
    for (let i = 0; i < 60; i += 1) {
      insertMutationReceipt(server, {
        accountId: 'adult-admin',
        requestId: `req-${String(i).padStart(3, '0')}`,
        scopeType: 'account',
        scopeId: 'adult-admin',
        mutationKind: 'debug.reset',
        appliedAt: now - i,
      });
    }

    const response = await server.fetchAs('adult-admin', 'https://repo.test/api/admin/ops/activity?limit=9999', {}, {
      'x-ks2-dev-platform-role': 'admin',
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.entries.length, 50);
  } finally {
    server.close();
  }
});

test('GET /api/admin/ops/error-events returns rows ordered by last_seen DESC', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdminAndOps(server, now);

    insertOpsErrorEvent(server, {
      id: 'event-old',
      fingerprint: 'fp-old',
      errorKind: 'TypeError',
      messageFirstLine: 'first error',
      firstSeen: now - 10_000,
      lastSeen: now - 5_000,
      status: 'open',
    });
    insertOpsErrorEvent(server, {
      id: 'event-new',
      fingerprint: 'fp-new',
      errorKind: 'RangeError',
      messageFirstLine: 'newer error',
      firstSeen: now - 2_000,
      lastSeen: now - 500,
      status: 'open',
    });

    const response = await server.fetchAs('adult-admin', 'https://repo.test/api/admin/ops/error-events', {}, {
      'x-ks2-dev-platform-role': 'admin',
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.entries.length, 2);
    assert.equal(payload.entries[0].id, 'event-new');
    assert.equal(payload.entries[1].id, 'event-old');
    assert.equal(payload.totals.open, 2);
    assert.equal(payload.totals.all, 2);
  } finally {
    server.close();
  }
});

test('GET /api/admin/ops/error-events filters by status', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdminAndOps(server, now);

    insertOpsErrorEvent(server, {
      id: 'event-open',
      fingerprint: 'fp-open',
      errorKind: 'TypeError',
      messageFirstLine: 'open error',
      firstSeen: now - 10_000,
      lastSeen: now - 5_000,
      status: 'open',
    });
    insertOpsErrorEvent(server, {
      id: 'event-resolved',
      fingerprint: 'fp-resolved',
      errorKind: 'RangeError',
      messageFirstLine: 'resolved error',
      firstSeen: now - 2_000,
      lastSeen: now - 500,
      status: 'resolved',
    });

    const openResponse = await server.fetchAs('adult-admin', 'https://repo.test/api/admin/ops/error-events?status=open', {}, {
      'x-ks2-dev-platform-role': 'admin',
    });
    const openPayload = await openResponse.json();
    assert.equal(openResponse.status, 200);
    assert.equal(openPayload.entries.length, 1);
    assert.equal(openPayload.entries[0].id, 'event-open');
    assert.equal(openPayload.totals.open, 1);
    assert.equal(openPayload.totals.resolved, 1);
    assert.equal(openPayload.totals.all, 2);

    const resolvedResponse = await server.fetchAs('adult-admin', 'https://repo.test/api/admin/ops/error-events?status=resolved', {}, {
      'x-ks2-dev-platform-role': 'admin',
    });
    const resolvedPayload = await resolvedResponse.json();
    assert.equal(resolvedPayload.entries.length, 1);
    assert.equal(resolvedPayload.entries[0].id, 'event-resolved');
  } finally {
    server.close();
  }
});

test('GET /api/hubs/admin extends payload with all four new sibling fields while preserving existing ones', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdminAndOps(server, now);

    const response = await server.fetchAs('adult-admin', 'https://repo.test/api/hubs/admin', {}, {
      'x-ks2-dev-platform-role': 'admin',
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    const hub = payload.adminHub;

    // Existing sibling fields preserved.
    assert.ok(hub.permissions);
    assert.ok(hub.account);
    assert.ok(hub.learnerSupport);
    assert.ok(hub.demoOperations);
    assert.ok(hub.contentReleaseStatus);
    assert.ok(hub.importValidationStatus);
    assert.ok(hub.auditLogLookup);
    assert.ok(hub.monsterVisualConfig);

    // Four new sibling fields present.
    assert.ok(hub.dashboardKpis);
    assert.ok(hub.opsActivityStream);
    assert.ok(hub.accountOpsMetadata);
    assert.ok(hub.errorLogSummary);

    assert.equal(typeof hub.dashboardKpis.generatedAt, 'number');
    assert.equal(typeof hub.dashboardKpis.accounts.total, 'number');
    assert.ok(Array.isArray(hub.opsActivityStream.entries));
    assert.ok(Array.isArray(hub.accountOpsMetadata.accounts));
    assert.ok(Array.isArray(hub.errorLogSummary.entries));
  } finally {
    server.close();
  }
});

test('admin hub account ops metadata includes all non-demo accounts with default ops_status active', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdminAndOps(server, now);
    // A demo account should NOT appear in account_ops_metadata directory.
    seedAdultAccount(server, {
      id: 'demo-x',
      email: null,
      displayName: 'Demo',
      platformRole: 'parent',
      now,
      accountType: 'demo',
      demoExpiresAt: now + 60_000,
    });

    const response = await server.fetchAs('adult-admin', 'https://repo.test/api/hubs/admin', {}, {
      'x-ks2-dev-platform-role': 'admin',
    });
    const payload = await response.json();
    const directory = payload.adminHub.accountOpsMetadata.accounts;
    assert.equal(directory.length, 3);
    for (const entry of directory) {
      assert.equal(entry.opsStatus, 'active');
      assert.deepEqual(entry.tags, []);
      assert.equal(entry.planLabel, null);
    }
    assert.equal(directory.some((entry) => entry.accountId === 'demo-x'), false);
  } finally {
    server.close();
  }
});

test('R25: ops-role viewer receives internalNotes redacted to null; admin sees stored value', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdminAndOps(server, now);
    insertAccountOpsMetadata(server, {
      accountId: 'adult-parent',
      opsStatus: 'suspended',
      planLabel: 'Trial',
      tagsJson: JSON.stringify(['flagged', 'priority']),
      internalNotes: 'This is a private ops note',
      updatedAt: now,
      updatedByAccountId: 'adult-admin',
    });

    const adminResponse = await server.fetchAs('adult-admin', 'https://repo.test/api/hubs/admin', {}, {
      'x-ks2-dev-platform-role': 'admin',
    });
    const adminHub = (await adminResponse.json()).adminHub;
    const adminEntry = adminHub.accountOpsMetadata.accounts.find((row) => row.accountId === 'adult-parent');
    assert.ok(adminEntry);
    assert.equal(adminEntry.opsStatus, 'suspended');
    assert.equal(adminEntry.planLabel, 'Trial');
    assert.deepEqual(adminEntry.tags, ['flagged', 'priority']);
    assert.equal(adminEntry.internalNotes, 'This is a private ops note');
    assert.equal(adminEntry.updatedByAccountId, 'adult-admin');

    const opsResponse = await server.fetchAs('adult-ops', 'https://repo.test/api/hubs/admin', {}, {
      'x-ks2-dev-platform-role': 'ops',
    });
    const opsHub = (await opsResponse.json()).adminHub;
    const opsEntry = opsHub.accountOpsMetadata.accounts.find((row) => row.accountId === 'adult-parent');
    assert.ok(opsEntry);
    assert.equal(opsEntry.opsStatus, 'suspended');
    assert.equal(opsEntry.planLabel, 'Trial');
    assert.deepEqual(opsEntry.tags, ['flagged', 'priority']);
    assert.equal(opsEntry.internalNotes, null, 'ops-role viewer sees redacted notes');
  } finally {
    server.close();
  }
});

test('admin ops KPI reflects admin_kpi_metrics counter bumps', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdminAndOps(server, now);
    insertAdminKpiMetric(server, {
      metricKey: 'ops_error_events.status.open',
      metricCount: 4,
      updatedAt: now,
    });
    insertAdminKpiMetric(server, {
      metricKey: 'ops_error_events.status.resolved',
      metricCount: 2,
      updatedAt: now,
    });
    insertAdminKpiMetric(server, {
      metricKey: 'account_ops_metadata.updates',
      metricCount: 7,
      updatedAt: now,
    });

    const response = await server.fetchAs('adult-admin', 'https://repo.test/api/admin/ops/kpi', {}, {
      'x-ks2-dev-platform-role': 'admin',
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.errorEvents.byStatus.open, 4);
    assert.equal(payload.errorEvents.byStatus.resolved, 2);
    assert.equal(payload.errorEvents.byStatus.investigating, 0);
    assert.equal(payload.errorEvents.byStatus.ignored, 0);
    assert.equal(payload.accountOpsUpdates.total, 7);
  } finally {
    server.close();
  }
});

test('GET /api/admin/ops/kpi as parent role returns 403', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdminAndOps(server, now);
    const response = await server.fetchAs('adult-parent', 'https://repo.test/api/admin/ops/kpi', {}, {
      'x-ks2-dev-platform-role': 'parent',
    });
    const payload = await response.json();
    assert.equal(response.status, 403);
    assert.equal(payload.code, 'admin_hub_forbidden');
  } finally {
    server.close();
  }
});

test('GET /api/admin/ops/kpi without session returns 401', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const response = await server.fetchRaw('https://repo.test/api/admin/ops/kpi');
    const payload = await response.json();
    assert.equal(response.status, 401);
    assert.equal(payload.code, 'unauthenticated');
  } finally {
    server.close();
  }
});

test('GET /api/admin/ops/kpi rejects mismatched Origin even in non-production', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdminAndOps(server, Date.now());
    const response = await server.fetchAs('adult-admin', 'https://repo.test/api/admin/ops/kpi', {
      headers: { origin: 'https://evil.example' },
    }, {
      'x-ks2-dev-platform-role': 'admin',
    });
    const payload = await response.json();
    assert.equal(response.status, 403);
    assert.equal(payload.code, 'same_origin_required');
  } finally {
    server.close();
  }
});

// PR #188 H1: dedicated narrow GET for the accounts-metadata panel so all four
// admin ops panels can refresh independently. Mirrors /api/admin/ops/kpi etc.
test('GET /api/admin/ops/accounts-metadata returns the non-demo directory for admin role', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdminAndOps(server, now);
    insertAccountOpsMetadata(server, {
      accountId: 'adult-parent',
      opsStatus: 'suspended',
      planLabel: 'Trial',
      tagsJson: JSON.stringify(['priority']),
      internalNotes: 'admin-only note',
      updatedAt: now,
      updatedByAccountId: 'adult-admin',
    });

    const response = await server.fetchAs('adult-admin', 'https://repo.test/api/admin/ops/accounts-metadata', {}, {
      'x-ks2-dev-platform-role': 'admin',
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.ok(Array.isArray(payload.accounts));
    const parentRow = payload.accounts.find((row) => row.accountId === 'adult-parent');
    assert.ok(parentRow);
    assert.equal(parentRow.opsStatus, 'suspended');
    assert.equal(parentRow.planLabel, 'Trial');
    assert.deepEqual(parentRow.tags, ['priority']);
    assert.equal(parentRow.internalNotes, 'admin-only note');
  } finally {
    server.close();
  }
});

test('GET /api/admin/ops/accounts-metadata redacts internalNotes for ops-role (R25)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdminAndOps(server, now);
    insertAccountOpsMetadata(server, {
      accountId: 'adult-parent',
      opsStatus: 'suspended',
      internalNotes: 'private admin note',
      updatedAt: now,
      updatedByAccountId: 'adult-admin',
    });

    const response = await server.fetchAs('adult-ops', 'https://repo.test/api/admin/ops/accounts-metadata', {}, {
      'x-ks2-dev-platform-role': 'ops',
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    const parentRow = payload.accounts.find((row) => row.accountId === 'adult-parent');
    assert.ok(parentRow);
    assert.equal(parentRow.internalNotes, null);
  } finally {
    server.close();
  }
});

test('GET /api/admin/ops/accounts-metadata as parent role returns 403', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdminAndOps(server, now);
    const response = await server.fetchAs('adult-parent', 'https://repo.test/api/admin/ops/accounts-metadata', {}, {
      'x-ks2-dev-platform-role': 'parent',
    });
    const payload = await response.json();
    assert.equal(response.status, 403);
    assert.equal(payload.code, 'admin_hub_forbidden');
  } finally {
    server.close();
  }
});

test('GET /api/admin/ops/accounts-metadata without session returns 401', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const response = await server.fetchRaw('https://repo.test/api/admin/ops/accounts-metadata');
    const payload = await response.json();
    assert.equal(response.status, 401);
    assert.equal(payload.code, 'unauthenticated');
  } finally {
    server.close();
  }
});

// P3 U1: readAdminHub actor dedup — the assertAdminHubActor SELECT fires
// exactly once per readAdminHub invocation (not once per downstream helper).
// ADV-1 review: strict assertion — the test must fail if the capacity
// structured log is not emitted (guards against silent dedup regression).
test('P3 U1: readAdminHub dedup — assertAdminHubActor SELECT appears once in capacity trace', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdminAndOps(server, now);

    // Intercept structured capacity log (statements are in the log, not
    // the public JSON — toPublicJSON intentionally omits per-statement
    // breakdown). Capture [ks2-worker] lines emitted during the request.
    const logLines = [];
    const originalLog = console.log;
    console.log = (...args) => {
      if (args[0] === '[ks2-worker]') logLines.push(args[1]);
      originalLog.apply(console, args);
    };

    const response = await server.fetchAs('adult-admin', 'https://repo.test/api/hubs/admin', {}, {
      'x-ks2-dev-platform-role': 'admin',
    });
    const payload = await response.json();
    console.log = originalLog;
    assert.equal(response.status, 200);

    // Find the structured log for /api/hubs/admin.
    const adminLog = logLines
      .map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .find((entry) => entry?.endpoint === '/api/hubs/admin');
    assert.ok(adminLog, 'capacity structured log must be emitted for /api/hubs/admin');

    const statements = adminLog.statements;
    assert.ok(Array.isArray(statements), 'capacity statements must be present in structured log for dedup verification');

    // The assertAdminHubActor query is the only SELECT that fetches
    // individual columns (id, email, display_name, platform_role,
    // repo_revision, account_type, selected_learner_id) from
    // adult_accounts. Statement names are truncated at 80 chars by
    // statementNameFromSql, so we match on the unique prefix.
    const actorSelects = statements.filter(
      (s) => typeof s.name === 'string'
        && s.name.startsWith('first:SELECT id, email, display_name, platform_role, repo_revision, account_type'),
    );
    assert.equal(
      actorSelects.length,
      1,
      `assertAdminHubActor should fire exactly once; found ${actorSelects.length}`,
    );

    // Structural: all four ops panels present regardless of capacity trace.
    assert.ok(payload.adminHub.dashboardKpis);
    assert.ok(payload.adminHub.opsActivityStream);
    assert.ok(payload.adminHub.accountOpsMetadata);
    assert.ok(payload.adminHub.errorLogSummary);
  } finally {
    server.close();
  }
});

