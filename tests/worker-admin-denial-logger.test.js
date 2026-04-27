import test from 'node:test';
import assert from 'node:assert/strict';

import {
  logRequestDenial,
  maskSessionId,
  shouldCaptureDenial,
  __resetSamplingCountersForTests,
  __setSamplingRngForTests,
} from '../worker/src/admin-denial-logger.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';

function createDb() {
  return createMigratedSqliteD1Database();
}

function readDenials(db) {
  return db.db.prepare('SELECT * FROM admin_request_denials ORDER BY denied_at DESC').all();
}

test('maskSessionId: returns last 8 chars of a long session ID', () => {
  assert.equal(maskSessionId('session-abcdefghijklmnop'), 'ijklmnop');
});

test('maskSessionId: returns short session ID unchanged', () => {
  assert.equal(maskSessionId('abc'), 'abc');
});

test('maskSessionId: returns exactly 8 chars unchanged', () => {
  assert.equal(maskSessionId('12345678'), '12345678');
});

test('maskSessionId: returns null for null/undefined/empty', () => {
  assert.equal(maskSessionId(null), null);
  assert.equal(maskSessionId(undefined), null);
  assert.equal(maskSessionId(''), null);
  assert.equal(maskSessionId('  '), null);
});

test('shouldCaptureDenial: low-volume reasons always captured', () => {
  __resetSamplingCountersForTests();
  for (let i = 0; i < 50; i += 1) {
    assert.equal(shouldCaptureDenial('account_suspended', '/api/bootstrap', Date.now()), true);
  }
});

test('shouldCaptureDenial: high-volume rate_limit_exceeded captured at 100% for first 10', () => {
  __resetSamplingCountersForTests();
  const now = Date.now();
  for (let i = 0; i < 10; i += 1) {
    assert.equal(shouldCaptureDenial('rate_limit_exceeded', '/api/ops/error-event', now), true);
  }
});

test('shouldCaptureDenial: high-volume rate_limit_exceeded sampled after threshold', () => {
  __resetSamplingCountersForTests();
  const now = Date.now();
  // Exhaust the first 10.
  for (let i = 0; i < 10; i += 1) {
    shouldCaptureDenial('rate_limit_exceeded', '/api/test', now);
  }
  // With RNG returning 0.5 (> 0.1 sample rate), the 11th should be rejected.
  __setSamplingRngForTests(() => 0.5);
  assert.equal(shouldCaptureDenial('rate_limit_exceeded', '/api/test', now), false);
  // With RNG returning 0.05 (< 0.1 sample rate), the 12th should be accepted.
  __setSamplingRngForTests(() => 0.05);
  assert.equal(shouldCaptureDenial('rate_limit_exceeded', '/api/test', now), true);
  __setSamplingRngForTests(null);
});

test('shouldCaptureDenial: new window resets sampling', () => {
  __resetSamplingCountersForTests();
  const windowMs = 10 * 60 * 1000;
  const now = Date.now();
  // Exhaust threshold in current window.
  for (let i = 0; i < 10; i += 1) {
    shouldCaptureDenial('rate_limit_exceeded', '/api/x', now);
  }
  // Next window — counter resets, so the 11th overall (1st in new window) passes.
  const nextWindow = now + windowMs;
  assert.equal(shouldCaptureDenial('rate_limit_exceeded', '/api/x', nextWindow), true);
});

test('logRequestDenial: account_suspended creates a row', async () => {
  const db = createDb();
  try {
    logRequestDenial(db, null, {
      denialReason: 'account_suspended',
      routeName: '/api/bootstrap',
      accountId: 'adult-123',
      sessionId: 'session-abcdefghijklmnop',
      isDemo: false,
      release: 'v1.0.0',
      detail: { code: 'account_suspended', opsStatus: 'suspended' },
      now: 1000,
    });
    // Wait for the fire-and-forget promise to settle.
    await new Promise((resolve) => { setTimeout(resolve, 50); });
    const rows = readDenials(db);
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.equal(row.denial_reason, 'account_suspended');
    assert.equal(row.route_name, '/api/bootstrap');
    assert.equal(row.account_id, 'adult-123');
    assert.equal(row.session_id_last8, 'ijklmnop');
    assert.equal(row.is_demo, 0);
    assert.equal(row.release, 'v1.0.0');
    assert.equal(row.denied_at, 1000);
    const detail = JSON.parse(row.detail_json);
    assert.equal(detail.code, 'account_suspended');
    assert.equal(detail.opsStatus, 'suspended');
  } finally {
    db.close();
  }
});

test('logRequestDenial: payment_hold creates a row with correct fields', async () => {
  const db = createDb();
  try {
    logRequestDenial(db, null, {
      denialReason: 'payment_hold',
      routeName: '/api/subjects/spelling/command',
      accountId: 'adult-456',
      sessionId: 'sess-short',
      isDemo: false,
      detail: { code: 'account_payment_hold', opsStatus: 'payment_hold' },
      now: 2000,
    });
    await new Promise((resolve) => { setTimeout(resolve, 50); });
    const rows = readDenials(db);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].denial_reason, 'payment_hold');
    assert.equal(rows[0].session_id_last8, 'ss-short');
  } finally {
    db.close();
  }
});

test('logRequestDenial: session_invalidated captured with no account context', async () => {
  const db = createDb();
  try {
    logRequestDenial(db, null, {
      denialReason: 'session_invalidated',
      routeName: '/api/session',
      detail: { code: 'session_invalidated' },
      now: 3000,
    });
    await new Promise((resolve) => { setTimeout(resolve, 50); });
    const rows = readDenials(db);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].denial_reason, 'session_invalidated');
    assert.equal(rows[0].account_id, null);
    assert.equal(rows[0].session_id_last8, null);
  } finally {
    db.close();
  }
});

test('logRequestDenial: rate-limit denial captured with route context', async () => {
  __resetSamplingCountersForTests();
  const db = createDb();
  try {
    logRequestDenial(db, null, {
      denialReason: 'rate_limit_exceeded',
      routeName: '/api/ops/error-event',
      release: 'v2.0.0',
      detail: { code: 'ops_error_rate_limited', bucket: 'ops-error-capture-ip', retryAfterSeconds: 30 },
      now: 4000,
    });
    await new Promise((resolve) => { setTimeout(resolve, 50); });
    const rows = readDenials(db);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].denial_reason, 'rate_limit_exceeded');
    assert.equal(rows[0].route_name, '/api/ops/error-event');
    const detail = JSON.parse(rows[0].detail_json);
    assert.equal(detail.retryAfterSeconds, 30);
    assert.equal(detail.bucket, 'ops-error-capture-ip');
  } finally {
    db.close();
  }
});

test('logRequestDenial: demo session marked is_demo = 1', async () => {
  const db = createDb();
  try {
    logRequestDenial(db, null, {
      denialReason: 'csrf_rejection',
      routeName: '/api/demo/session',
      isDemo: true,
      detail: { code: 'same_origin_required' },
      now: 5000,
    });
    await new Promise((resolve) => { setTimeout(resolve, 50); });
    const rows = readDenials(db);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].is_demo, 1);
  } finally {
    db.close();
  }
});

test('logRequestDenial: unknown denial reason silently skipped', async () => {
  const db = createDb();
  try {
    logRequestDenial(db, null, {
      denialReason: 'unknown_bad_reason',
      routeName: '/api/bootstrap',
      now: 6000,
    });
    await new Promise((resolve) => { setTimeout(resolve, 50); });
    const rows = readDenials(db);
    assert.equal(rows.length, 0);
  } finally {
    db.close();
  }
});

test('logRequestDenial: DB failure does not throw', async () => {
  // Use a mock DB that always throws on prepare().
  const brokenDb = {
    prepare() {
      throw new Error('DB is down');
    },
  };
  // This must not throw.
  logRequestDenial(brokenDb, null, {
    denialReason: 'account_suspended',
    routeName: '/api/bootstrap',
    now: 7000,
  });
  // Wait for the fire-and-forget promise.
  await new Promise((resolve) => { setTimeout(resolve, 50); });
  // If we reached here, the test passes — the error was swallowed.
  assert.ok(true, 'DB failure did not propagate');
});

test('logRequestDenial: ctx.waitUntil is called when present', async () => {
  const db = createDb();
  try {
    let waitUntilCalled = false;
    const ctx = {
      waitUntil(promise) {
        waitUntilCalled = true;
        // Still await to let the insert complete.
        promise.catch(() => {});
      },
    };
    logRequestDenial(db, ctx, {
      denialReason: 'account_suspended',
      routeName: '/api/bootstrap',
      now: 8000,
    });
    assert.equal(waitUntilCalled, true, 'ctx.waitUntil was called');
    await new Promise((resolve) => { setTimeout(resolve, 50); });
    const rows = readDenials(db);
    assert.equal(rows.length, 1);
  } finally {
    db.close();
  }
});

test('logRequestDenial: detail_json only includes allowed keys', async () => {
  const db = createDb();
  try {
    logRequestDenial(db, null, {
      denialReason: 'account_suspended',
      routeName: '/api/bootstrap',
      detail: {
        code: 'account_suspended',
        opsStatus: 'suspended',
        secretToken: 'should-not-appear',
        rawHeaders: { cookie: 'leaked' },
      },
      now: 9000,
    });
    await new Promise((resolve) => { setTimeout(resolve, 50); });
    const rows = readDenials(db);
    assert.equal(rows.length, 1);
    const detail = JSON.parse(rows[0].detail_json);
    assert.equal(detail.code, 'account_suspended');
    assert.equal(detail.opsStatus, 'suspended');
    assert.equal(detail.secretToken, undefined, 'unknown key excluded');
    assert.equal(detail.rawHeaders, undefined, 'object value excluded');
  } finally {
    db.close();
  }
});
