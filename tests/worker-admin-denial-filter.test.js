// U2 (Admin Console P4): round-trip denial-filter test.
//
// Verifies the SQL WHERE clause correctly honours all 5 canonical
// DENIAL_* reason codes from worker/src/error-codes.js (lines 20-24).
//
// Scenarios:
//   1. Each canonical reason code filters to exact matches only
//   2. "All" / no-filter returns every record
//   3. Unknown reason code returns zero results

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

// Canonical DENIAL_* reason codes (must match worker/src/error-codes.js).
const CANONICAL_DENIAL_CODES = [
  'account_suspended',
  'payment_hold',
  'session_invalidated',
  'csrf_rejection',
  'rate_limit_exceeded',
];

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

function insertRequestDenial(server, {
  id,
  deniedAt,
  denialReason,
  routeName = null,
  accountId = null,
  learnerId = null,
  sessionIdLast8 = null,
  isDemo = 0,
  release = null,
  detailJson = null,
}) {
  server.DB.db.prepare(`
    INSERT INTO admin_request_denials (
      id, denied_at, denial_reason, route_name, account_id,
      learner_id, session_id_last8, is_demo, release, detail_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    deniedAt,
    denialReason,
    routeName,
    accountId,
    learnerId,
    sessionIdLast8,
    isDemo,
    release,
    detailJson,
  );
}

function seedAdmin(server, now) {
  seedAdultAccount(server, {
    id: 'adult-admin',
    email: 'admin@example.com',
    displayName: 'Admin',
    platformRole: 'admin',
    now,
  });
}

// Insert one denial record per canonical reason code.
function seedAllCanonicalDenials(server, now) {
  CANONICAL_DENIAL_CODES.forEach((code, i) => {
    insertRequestDenial(server, {
      id: `deny-${code}`,
      deniedAt: now - (i + 1) * 1000,
      denialReason: code,
      routeName: `/api/route-for-${code}`,
      accountId: `adult-account-${code}`,
    });
  });
}

// ---------------------------------------------------------------
// 1. Each canonical reason code filters to exact matches
// ---------------------------------------------------------------

for (const expectedCode of CANONICAL_DENIAL_CODES) {
  test(`filter by reason=${expectedCode} returns only that code`, async () => {
    const server = createWorkerRepositoryServer();
    try {
      const now = Date.now();
      seedAdmin(server, now);
      seedAllCanonicalDenials(server, now);

      const response = await server.fetchAs(
        'adult-admin',
        `https://repo.test/api/admin/ops/request-denials?reason=${expectedCode}`,
        {},
        { 'x-ks2-dev-platform-role': 'admin' },
      );
      const payload = await response.json();

      assert.equal(response.status, 200, `HTTP 200 for reason=${expectedCode}`);
      assert.equal(payload.entries.length, 1, `Exactly 1 result for reason=${expectedCode}`);
      assert.equal(payload.entries[0].id, `deny-${expectedCode}`);
      assert.equal(payload.entries[0].denialReason, expectedCode);
    } finally {
      server.close();
    }
  });
}

// ---------------------------------------------------------------
// 2. No-filter returns all records
// ---------------------------------------------------------------

test('no reason filter returns all 5 canonical denial records', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdmin(server, now);
    seedAllCanonicalDenials(server, now);

    const response = await server.fetchAs(
      'adult-admin',
      'https://repo.test/api/admin/ops/request-denials',
      {},
      { 'x-ks2-dev-platform-role': 'admin' },
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.entries.length, CANONICAL_DENIAL_CODES.length);

    // Every canonical code is present in the results
    const returnedCodes = payload.entries.map((e) => e.denialReason).sort();
    assert.deepStrictEqual(returnedCodes, [...CANONICAL_DENIAL_CODES].sort());
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------
// 3. Unknown reason code returns zero results
// ---------------------------------------------------------------

test('unknown reason code returns empty entries', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdmin(server, now);
    seedAllCanonicalDenials(server, now);

    const response = await server.fetchAs(
      'adult-admin',
      'https://repo.test/api/admin/ops/request-denials?reason=nonexistent_phantom',
      {},
      { 'x-ks2-dev-platform-role': 'admin' },
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.entries.length, 0);
  } finally {
    server.close();
  }
});
