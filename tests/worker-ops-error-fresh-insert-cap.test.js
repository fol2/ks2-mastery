// U5 (P1.5 Phase B): fresh-insert abuse cap.
//
// An attacker that wants to flood the ops-error-events table with
// rubbish rows has to defeat the R24 tuple-dedup on
// (errorKind, messageFirstLine, firstFrame). They can do that today by
// rotating `first_frame` between requests — each request produces a
// brand-new fingerprint and bypasses the dedup UPDATE path. Without a
// fresh-insert cap, the existing 60/10-min per-IP budget lets them
// insert 60 distinct rows per window before the per-IP bucket trips.
//
// The fresh-insert cap fires ONLY when the repository reports a
// genuinely-new fingerprint (`deduped === false`). A dedup replay does
// NOT consume the bucket. Limit defaults to 10 fresh inserts per hour
// per subject; tunable via `env.OPS_ERROR_FRESH_INSERT_LIMIT`.
//
// The 11th distinct-frame request from the same subject returns 429
// with `ops_error_fresh_insert_throttled` and bumps the
// `ops_error_events.fresh_insert_throttled` KPI counter.

import test from 'node:test';
import assert from 'node:assert/strict';

import { sha256 } from '../worker/src/auth.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

async function postErrorEvent(server, body, headers = {}) {
  return server.fetchRaw('https://repo.test/api/ops/error-event', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function seedRateLimit(server, bucket, identifier, count) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const windowStartedAt = Math.floor(now / windowMs) * windowMs;
  server.DB.db.prepare(`
    INSERT INTO request_limits (limiter_key, window_started_at, request_count, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(limiter_key) DO UPDATE SET
      window_started_at = excluded.window_started_at,
      request_count = excluded.request_count,
      updated_at = excluded.updated_at
  `).run(`${bucket}:${await sha256(identifier)}`, windowStartedAt, count, now);
}

function kpiRow(server, key) {
  return server.DB.db.prepare(`
    SELECT metric_count FROM admin_kpi_metrics WHERE metric_key = ?
  `).get(key);
}

function countErrorRows(server) {
  return server.DB.db.prepare(`
    SELECT COUNT(*) AS n FROM ops_error_events
  `).get().n;
}

test('fresh-insert cap: attacker rotating first_frame hits 429 on the 11th fresh insert', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const headers = { 'cf-connecting-ip': '203.0.113.50' };

    for (let i = 1; i <= 10; i += 1) {
      const response = await postErrorEvent(
        server,
        {
          errorKind: 'TypeError',
          messageFirstLine: 'attacker churn',
          firstFrame: `at churnFrame${i} (line:${i})`,
          routeName: '/dashboard',
          userAgent: 'AttackerUA',
        },
        headers,
      );
      assert.equal(response.status, 200, `request ${i} should succeed`);
      const payload = await response.json();
      assert.equal(payload.deduped, false, `request ${i} should be a fresh insert`);
    }

    // 11th fresh insert with a new frame trips the cap.
    const blocked = await postErrorEvent(
      server,
      {
        errorKind: 'TypeError',
        messageFirstLine: 'attacker churn',
        firstFrame: 'at churnFrame11 (line:11)',
        routeName: '/dashboard',
        userAgent: 'AttackerUA',
      },
      headers,
    );
    assert.equal(blocked.status, 429);
    const payload = await blocked.json();
    assert.equal(payload.code, 'ops_error_fresh_insert_throttled');
    assert.ok(payload.retryAfterSeconds > 0, 'retryAfterSeconds should be positive');

    const counter = kpiRow(server, 'ops_error_events.fresh_insert_throttled');
    assert.ok(counter?.metric_count >= 1, 'fresh-insert throttle counter must bump');
  } finally {
    server.close();
  }
});

test('fresh-insert cap: dedup replays do NOT consume the cap', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const headers = { 'cf-connecting-ip': '203.0.113.51' };
    const body = {
      errorKind: 'TypeError',
      messageFirstLine: 'steady-state error',
      firstFrame: 'at repeatedFrame (line:1)',
      routeName: '/dashboard',
      userAgent: 'SteadyUA',
    };

    // Hammer the same (errorKind, messageFirstLine, firstFrame) tuple
    // 50 times; all but the first should be dedup UPDATEs, which must
    // not consume the fresh-insert bucket. None should 429.
    for (let i = 0; i < 50; i += 1) {
      const response = await postErrorEvent(server, body, headers);
      assert.equal(response.status, 200, `request ${i + 1} should succeed`);
    }

    // No fresh-insert throttle counter should have bumped.
    const counter = kpiRow(server, 'ops_error_events.fresh_insert_throttled');
    assert.equal(counter?.metric_count ?? 0, 0, 'dedup replays must not bump throttle counter');
  } finally {
    server.close();
  }
});

test('fresh-insert cap: already-exhausted bucket blocks the very next fresh insert', async () => {
  const server = createWorkerRepositoryServer();
  try {
    // Pre-seed the fresh-insert bucket at the 10-event default cap.
    await seedRateLimit(server, 'ops-error-fresh-insert', 'v4:198.51.100.200', 10);

    const response = await postErrorEvent(
      server,
      {
        errorKind: 'ReferenceError',
        messageFirstLine: 'seeded-subject',
        firstFrame: 'at newFrame (line:9)',
      },
      { 'cf-connecting-ip': '198.51.100.200' },
    );
    assert.equal(response.status, 429);
    const payload = await response.json();
    assert.equal(payload.code, 'ops_error_fresh_insert_throttled');
  } finally {
    server.close();
  }
});

test('fresh-insert cap: OPS_ERROR_FRESH_INSERT_LIMIT env override is honoured', async () => {
  const server = createWorkerRepositoryServer({ env: { OPS_ERROR_FRESH_INSERT_LIMIT: '2' } });
  try {
    const headers = { 'cf-connecting-ip': '203.0.113.70' };

    for (let i = 1; i <= 2; i += 1) {
      const response = await postErrorEvent(
        server,
        {
          errorKind: 'RangeError',
          messageFirstLine: 'tight-cap',
          firstFrame: `at line:${i}`,
        },
        headers,
      );
      assert.equal(response.status, 200, `request ${i} should succeed`);
    }

    const blocked = await postErrorEvent(
      server,
      {
        errorKind: 'RangeError',
        messageFirstLine: 'tight-cap',
        firstFrame: 'at line:3',
      },
      headers,
    );
    assert.equal(blocked.status, 429);
    const payload = await blocked.json();
    assert.equal(payload.code, 'ops_error_fresh_insert_throttled');
  } finally {
    server.close();
  }
});

test('fresh-insert cap: invalid OPS_ERROR_FRESH_INSERT_LIMIT falls back to default 10', async () => {
  const server = createWorkerRepositoryServer({ env: { OPS_ERROR_FRESH_INSERT_LIMIT: 'not-a-number' } });
  try {
    const headers = { 'cf-connecting-ip': '203.0.113.71' };
    // 10 successful inserts — the default cap.
    for (let i = 1; i <= 10; i += 1) {
      const response = await postErrorEvent(
        server,
        {
          errorKind: 'SyntaxError',
          messageFirstLine: 'default-cap',
          firstFrame: `at line:${i}`,
        },
        headers,
      );
      assert.equal(response.status, 200, `request ${i} should succeed`);
    }
    // 11th trips the default cap.
    const blocked = await postErrorEvent(
      server,
      {
        errorKind: 'SyntaxError',
        messageFirstLine: 'default-cap',
        firstFrame: 'at line:11',
      },
      headers,
    );
    assert.equal(blocked.status, 429);
  } finally {
    server.close();
  }
});

test('fresh-insert cap: different IPv6 /64s keep independent fresh-insert budgets', async () => {
  const server = createWorkerRepositoryServer();
  try {
    // Fill one /64 to its cap.
    for (let i = 1; i <= 10; i += 1) {
      const response = await postErrorEvent(
        server,
        {
          errorKind: 'CustomError',
          messageFirstLine: 'cohort-A',
          firstFrame: `at frame:${i}`,
        },
        { 'cf-connecting-ip': `2001:db8:a::${i}` },
      );
      assert.equal(response.status, 200);
    }
    // A request from a DIFFERENT /64 must succeed.
    const response = await postErrorEvent(
      server,
      {
        errorKind: 'CustomError',
        messageFirstLine: 'cohort-B',
        firstFrame: 'at differentFrame',
      },
      { 'cf-connecting-ip': '2001:db8:b::1' },
    );
    assert.equal(response.status, 200, 'different /64 must have independent fresh-insert bucket');
    const rows = countErrorRows(server);
    assert.equal(rows, 11, 'all 11 fresh inserts should persist');
  } finally {
    server.close();
  }
});
