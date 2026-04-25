import test from 'node:test';
import assert from 'node:assert/strict';

import { sha256 } from '../worker/src/auth.js';
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

function selectAllErrorRows(server) {
  return server.DB.db.prepare(`
    SELECT id, fingerprint, error_kind, message_first_line, first_frame,
           route_name, user_agent, account_id, first_seen, last_seen,
           occurrence_count, status
    FROM ops_error_events
    ORDER BY first_seen ASC, id ASC
  `).all();
}

function kpiRow(server, key) {
  return server.DB.db.prepare(`
    SELECT metric_count FROM admin_kpi_metrics WHERE metric_key = ?
  `).get(key);
}

async function postErrorEvent(server, body = {}, headers = {}) {
  return server.fetchRaw('https://repo.test/api/ops/error-event', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
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

test('POST /api/ops/error-event creates a fresh row and bumps the status.open counter', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const response = await postErrorEvent(server, {
      errorKind: 'TypeError',
      messageFirstLine: 'x is undefined',
      firstFrame: 'at foo (bar.js:12)',
      routeName: '/dashboard',
      userAgent: 'Mozilla/5.0',
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.deduped, false);
    assert.equal(typeof payload.eventId, 'string');

    const rows = selectAllErrorRows(server);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].error_kind, 'TypeError');
    assert.equal(rows[0].message_first_line, 'x is undefined');
    assert.equal(rows[0].status, 'open');
    assert.equal(rows[0].occurrence_count, 1);

    const counter = kpiRow(server, 'ops_error_events.status.open');
    assert.equal(counter?.metric_count, 1);
  } finally {
    server.close();
  }
});

test('POST /api/ops/error-event returns deduped=true on second identical POST', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const body = {
      errorKind: 'TypeError',
      messageFirstLine: 'x is undefined',
      firstFrame: 'at foo (bar.js:12)',
    };
    const first = await postErrorEvent(server, body);
    await first.json();

    const second = await postErrorEvent(server, body);
    const payload = await second.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.deduped, true);

    const rows = selectAllErrorRows(server);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].occurrence_count, 2);
    assert.equal(rows[0].status, 'open');

    // Counter must only be bumped once — dedup increments occurrence_count,
    // not the fresh-insert counter.
    const counter = kpiRow(server, 'ops_error_events.status.open');
    assert.equal(counter?.metric_count, 1);
  } finally {
    server.close();
  }
});

test('POST /api/ops/error-event rejects oversized bodies with ops_error_payload_too_large', async () => {
  const server = createWorkerRepositoryServer();
  try {
    // 10KB of characters in messageFirstLine pushes the JSON body past 8KB.
    const big = 'x'.repeat(10 * 1024);
    const response = await postErrorEvent(server, {
      errorKind: 'Error',
      messageFirstLine: big,
    });
    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'ops_error_payload_too_large');

    const rows = selectAllErrorRows(server);
    assert.equal(rows.length, 0);
  } finally {
    server.close();
  }
});

test('POST /api/ops/error-event ignores content-length header; byte-length is authoritative', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const big = JSON.stringify({
      errorKind: 'Error',
      messageFirstLine: 'x'.repeat(10 * 1024),
    });
    const response = await server.fetchRaw('https://repo.test/api/ops/error-event', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Deliberately understate the content-length; the Worker must
        // still reject based on actual ArrayBuffer byteLength.
        'content-length': '10',
      },
      body: big,
    });
    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.equal(payload.code, 'ops_error_payload_too_large');
  } finally {
    server.close();
  }
});

test('POST /api/ops/error-event returns 429 when the IP rate-limit is exhausted', async () => {
  const server = createWorkerRepositoryServer();
  try {
    // Seed the IP bucket past the 60-event limit.
    await seedRateLimit(server, 'ops-error-capture-ip', 'unknown', 61);
    const response = await postErrorEvent(server, {
      errorKind: 'Error',
      messageFirstLine: 'boom',
    });
    const payload = await response.json();
    assert.equal(response.status, 429);
    assert.equal(payload.code, 'ops_error_rate_limited');

    // Rate-limited counter should have bumped.
    const counter = kpiRow(server, 'ops_error_events.rate_limited');
    assert.ok(counter?.metric_count >= 1);
  } finally {
    server.close();
  }
});

test('POST /api/ops/error-event returns 400 validation_failed when required fields are missing', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const response = await postErrorEvent(server, { foo: 'bar' });
    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.equal(payload.code, 'validation_failed');
    assert.equal(selectAllErrorRows(server).length, 0);
  } finally {
    server.close();
  }
});

test('POST /api/ops/error-event returns 400 when the JSON body is malformed', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const response = await postErrorEvent(server, 'not-valid-json');
    const payload = await response.json();
    // readJsonBounded falls back to {} on parse failure, so the route then
    // validates shape and returns 400 validation_failed. Either outcome is
    // acceptable; assert on the status + code.
    assert.equal(response.status, 400);
    assert.equal(payload.code, 'validation_failed');
  } finally {
    server.close();
  }
});

test('POST /api/ops/error-event redacts PII + all-caps spelling words server-side', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const response = await postErrorEvent(server, {
      errorKind: 'Error',
      messageFirstLine: 'learner Alice solved PRINCIPAL with answer_raw=secret',
      firstFrame: 'at learner_name_helper (learner_id=xyz)',
      routeName: '/learner/learner-abc/spelling?token=secret',
      userAgent: 'Mozilla',
    });
    await response.json();

    const rows = selectAllErrorRows(server);
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.ok(!/PRINCIPAL/.test(row.message_first_line), `leaked PRINCIPAL in ${row.message_first_line}`);
    assert.ok(!/answer_raw/i.test(row.message_first_line), `leaked answer_raw in ${row.message_first_line}`);
    assert.ok(!/learner_name/i.test(row.first_frame), `leaked learner_name in ${row.first_frame}`);
    assert.ok(!/learner_id/i.test(row.first_frame), `leaked learner_id in ${row.first_frame}`);
    assert.ok(!/token/i.test(row.route_name), `leaked token in ${row.route_name}`);
    // Route UUID-shaped segment should have been replaced.
    assert.ok(row.route_name.includes('[id]'), `route not masked: ${row.route_name}`);
  } finally {
    server.close();
  }
});

test('POST /api/ops/error-event first-line truncation blocks fingerprint-replay poison', async () => {
  const server = createWorkerRepositoryServer();
  try {
    // Legitimate real error.
    const real = {
      errorKind: 'TypeError',
      messageFirstLine: 'x is undefined',
      firstFrame: 'at foo (bar.js:12)',
    };
    await (await postErrorEvent(server, real)).json();

    // Crafted replay with a multi-line message whose first line matches the
    // stored tuple exactly. The Worker truncates to first line BEFORE the
    // tuple lookup so this must dedup onto the existing row, not create a
    // new one, and the injected EVIL_PAYLOAD must never hit the DB.
    const crafted = {
      errorKind: 'TypeError',
      messageFirstLine: 'x is undefined\nEVIL_PAYLOAD',
      firstFrame: 'at foo (bar.js:12)',
    };
    const response = await postErrorEvent(server, crafted);
    const payload = await response.json();
    assert.equal(payload.deduped, true);

    const rows = selectAllErrorRows(server);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].occurrence_count, 2);
    assert.ok(!/EVIL_PAYLOAD/.test(rows[0].message_first_line));
  } finally {
    server.close();
  }
});

test('POST /api/ops/error-event soft-fails if ops_error_events table is missing', async () => {
  const server = createWorkerRepositoryServer();
  try {
    server.DB.db.exec('DROP TABLE IF EXISTS ops_error_events;');
    const response = await postErrorEvent(server, {
      errorKind: 'Error',
      messageFirstLine: 'boom',
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.unavailable, true);
    assert.equal(payload.eventId, null);
  } finally {
    server.close();
  }
});

test('POST /api/ops/error-event: /demo/ route never attaches account_id (real session)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, {
      id: 'adult-admin',
      email: 'admin@example.com',
      displayName: 'Admin',
      platformRole: 'admin',
      now,
    });

    const response = await server.fetchAs('adult-admin', 'https://repo.test/api/ops/error-event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        errorKind: 'Error',
        messageFirstLine: 'boom',
        routeName: '/demo/spelling',
      }),
    }, {
      'x-ks2-dev-platform-role': 'admin',
    });
    const payload = await response.json();
    assert.equal(payload.ok, true);

    const rows = selectAllErrorRows(server);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].account_id, null, 'admin on /demo/ must not attach account_id');
  } finally {
    server.close();
  }
});

test('POST /api/ops/error-event: real session on non-demo route attaches account_id', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, {
      id: 'adult-admin',
      email: 'admin@example.com',
      displayName: 'Admin',
      platformRole: 'admin',
      now,
    });

    const response = await server.fetchAs('adult-admin', 'https://repo.test/api/ops/error-event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        errorKind: 'Error',
        messageFirstLine: 'boom on home',
        routeName: '/dashboard',
      }),
    }, {
      'x-ks2-dev-platform-role': 'admin',
    });
    const payload = await response.json();
    assert.equal(payload.ok, true);

    const rows = selectAllErrorRows(server);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].account_id, 'adult-admin');
  } finally {
    server.close();
  }
});

test('POST /api/ops/error-event: demo session never attaches account_id', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    seedAdultAccount(server, {
      id: 'demo-xyz',
      email: null,
      displayName: 'Demo',
      platformRole: 'parent',
      now,
      accountType: 'demo',
      demoExpiresAt: now + 60_000,
    });

    const response = await server.fetchAs('demo-xyz', 'https://repo.test/api/ops/error-event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        errorKind: 'Error',
        messageFirstLine: 'demo boom',
        routeName: '/dashboard',
      }),
    });
    const payload = await response.json();
    assert.equal(payload.ok, true);

    const rows = selectAllErrorRows(server);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].account_id, null, 'demo session must not attach account_id');
  } finally {
    server.close();
  }
});

test('POST /api/ops/error-event is reachable without any auth (public endpoint)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    // fetchRaw sends no dev-account header — confirm the endpoint still
    // responds 200 (no 401 / unauthenticated).
    const response = await server.fetchRaw('https://repo.test/api/ops/error-event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        errorKind: 'TypeError',
        messageFirstLine: 'anon boom',
      }),
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);

    const rows = selectAllErrorRows(server);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].account_id, null);
  } finally {
    server.close();
  }
});
