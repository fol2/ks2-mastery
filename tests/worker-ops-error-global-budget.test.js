// U5 (P1.5 Phase B): route-wide global budget for /api/ops/error-event.
//
// The per-IP bucket (60 events / 10-minute window) plus the fresh-insert
// cap (10 fresh inserts / hour / subject) protect against a single
// attacker. A distributed attack across thousands of /64s can still
// exhaust the worker — each /64 consumes a tiny slice of the per-IP
// budget without ever tripping it.
//
// The global budget is one route-wide bucket consumed on every public
// ingest request, BEFORE the per-IP bucket. It is sized to absorb a
// genuine post-release crash loop (6000 events per 10-minute window)
// while still capping worst-case throughput. When exhausted, the route
// returns 429 with code `ops_error_global_budget_exhausted` and
// bumps the `ops_error_events.global_budget_exhausted` KPI counter so
// the admin dashboard can show the operator a distinguishing signal.

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
  const windowMs = 10 * 60 * 1000;
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

test('global budget: pre-seeded global bucket at cap returns 429 with global_budget_exhausted', async () => {
  const server = createWorkerRepositoryServer();
  try {
    // Simulate 6000 prior requests having already consumed the global
    // bucket. The next request must be throttled regardless of
    // per-IP budget state.
    await seedRateLimit(server, 'ops-error-capture-global', 'global:ops-error-capture', 6000);

    const response = await postErrorEvent(
      server,
      { errorKind: 'Error', messageFirstLine: 'global-hit' },
      { 'cf-connecting-ip': '2001:db8::1' },
    );
    assert.equal(response.status, 429);
    const payload = await response.json();
    assert.equal(payload.code, 'ops_error_global_budget_exhausted');
    assert.ok(payload.retryAfterSeconds > 0);
  } finally {
    server.close();
  }
});

test('global budget: KPI counter ops_error_events.global_budget_exhausted bumps on throttle', async () => {
  const server = createWorkerRepositoryServer();
  try {
    await seedRateLimit(server, 'ops-error-capture-global', 'global:ops-error-capture', 6000);

    const response = await postErrorEvent(
      server,
      { errorKind: 'Error', messageFirstLine: 'signal' },
      { 'cf-connecting-ip': '2001:db8::2' },
    );
    assert.equal(response.status, 429);
    const counter = kpiRow(server, 'ops_error_events.global_budget_exhausted');
    assert.ok(counter?.metric_count >= 1, 'global-budget counter must bump');
  } finally {
    server.close();
  }
});

test('global budget: per-IP bucket is NOT consumed when global budget blocks the request', async () => {
  const server = createWorkerRepositoryServer();
  try {
    await seedRateLimit(server, 'ops-error-capture-global', 'global:ops-error-capture', 6000);

    await postErrorEvent(
      server,
      { errorKind: 'Error', messageFirstLine: 'first' },
      { 'cf-connecting-ip': '198.51.100.1' },
    );

    // The per-IP bucket for v4:198.51.100.1 should still be at 0 — the
    // global bucket blocked the request before the per-IP consume fired.
    const row = server.DB.db.prepare(`
      SELECT request_count FROM request_limits WHERE limiter_key = ?
    `).get(`ops-error-capture-ip:${await sha256('v4:198.51.100.1')}`);
    assert.equal(row, undefined, 'per-IP bucket should not be created while global budget blocks');
  } finally {
    server.close();
  }
});

test('global budget: env.OPS_ERROR_GLOBAL_LIMIT override is honoured', async () => {
  const server = createWorkerRepositoryServer({ env: { OPS_ERROR_GLOBAL_LIMIT: '3' } });
  try {
    // 3 distinct subjects can each insert one fresh event; the 4th
    // request from anywhere trips the global bucket.
    for (let i = 1; i <= 3; i += 1) {
      const response = await postErrorEvent(
        server,
        { errorKind: 'Error', messageFirstLine: `subject-${i}`, firstFrame: `frame${i}` },
        { 'cf-connecting-ip': `198.51.100.${i}` },
      );
      assert.equal(response.status, 200, `request ${i} should succeed`);
    }
    const blocked = await postErrorEvent(
      server,
      { errorKind: 'Error', messageFirstLine: 'subject-4', firstFrame: 'frame4' },
      { 'cf-connecting-ip': '198.51.100.4' },
    );
    assert.equal(blocked.status, 429);
    const payload = await blocked.json();
    assert.equal(payload.code, 'ops_error_global_budget_exhausted');
  } finally {
    server.close();
  }
});

test('global budget: invalid OPS_ERROR_GLOBAL_LIMIT falls back to 6000 default', async () => {
  const server = createWorkerRepositoryServer({ env: { OPS_ERROR_GLOBAL_LIMIT: 'abc' } });
  try {
    // Seeding 6000 uses the default. The next request must 429.
    await seedRateLimit(server, 'ops-error-capture-global', 'global:ops-error-capture', 6000);
    const response = await postErrorEvent(
      server,
      { errorKind: 'Error', messageFirstLine: 'default' },
      { 'cf-connecting-ip': '198.51.100.99' },
    );
    assert.equal(response.status, 429);
    const payload = await response.json();
    assert.equal(payload.code, 'ops_error_global_budget_exhausted');
  } finally {
    server.close();
  }
});

test('global budget: happy path — normal traffic does not trip the budget', async () => {
  const server = createWorkerRepositoryServer();
  try {
    // 5 distinct /64s each submit a unique fingerprint. Global
    // bucket count climbs from 0 to 5; no 429.
    for (let i = 0; i < 5; i += 1) {
      const response = await postErrorEvent(
        server,
        { errorKind: 'Err', messageFirstLine: `line${i}`, firstFrame: `f${i}` },
        { 'cf-connecting-ip': `2001:db8:${i}::1` },
      );
      assert.equal(response.status, 200, `request ${i + 1} should succeed`);
    }
    const counter = kpiRow(server, 'ops_error_events.global_budget_exhausted');
    assert.equal(counter?.metric_count ?? 0, 0, 'no global-budget throttle should fire');
  } finally {
    server.close();
  }
});

// -- I7 (reviewer) — additional coverage ------------------------------

test('global budget: per-request admissions bump the global bucket request_count', async () => {
  const server = createWorkerRepositoryServer({ env: { OPS_ERROR_GLOBAL_LIMIT: '3' } });
  try {
    // 3 admitted requests from 3 different /64s. The global bucket
    // (identified by `global:ops-error-capture`) should carry
    // `request_count = 3` by the end.
    for (let i = 0; i < 3; i += 1) {
      const response = await postErrorEvent(
        server,
        { errorKind: 'Err', messageFirstLine: `probe-${i}`, firstFrame: `frame-${i}` },
        { 'cf-connecting-ip': `2001:db8:${100 + i}::1` },
      );
      assert.equal(response.status, 200, `admitted request ${i + 1} should succeed`);
    }

    const limiterKey = `ops-error-capture-global:${await sha256('global:ops-error-capture')}`;
    const row = server.DB.db.prepare(`
      SELECT request_count FROM request_limits WHERE limiter_key = ?
    `).get(limiterKey);
    assert.equal(row?.request_count ?? 0, 3, 'global bucket request_count must advance on each admitted request');
  } finally {
    server.close();
  }
});

test('global budget: per-bucket-category KPI split bumps ops_error_events.global_budget_exhausted.v6_64 when a /64 triggers exhaustion', async () => {
  const server = createWorkerRepositoryServer();
  try {
    // Pre-seed the global bucket at the 6000 default. Any request
    // trips it. The attacker is on an IPv6 /64, so the category split
    // must increment `.v6_64`.
    await seedRateLimit(server, 'ops-error-capture-global', 'global:ops-error-capture', 6000);

    const response = await postErrorEvent(
      server,
      { errorKind: 'Error', messageFirstLine: 'v6-exhaustion' },
      { 'cf-connecting-ip': '2001:db8::1' },
    );
    assert.equal(response.status, 429);

    const baseCounter = kpiRow(server, 'ops_error_events.global_budget_exhausted');
    assert.ok(baseCounter?.metric_count >= 1, 'base counter must bump');

    const splitCounter = kpiRow(server, 'ops_error_events.global_budget_exhausted.v6_64');
    assert.ok(
      splitCounter?.metric_count >= 1,
      'per-bucket-category .v6_64 counter must bump when an IPv6 /64 source triggers exhaustion',
    );
  } finally {
    server.close();
  }
});
