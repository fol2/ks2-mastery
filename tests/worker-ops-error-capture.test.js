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

// U6 review follow-up (Finding 1): server-side redaction parity on firstFrame.
test('POST /api/ops/error-event redacts all-caps spelling words in firstFrame (Finding 1)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const response = await postErrorEvent(server, {
      errorKind: 'TypeError',
      messageFirstLine: 'boom',
      firstFrame: 'PRINCIPAL token detected at handler',
      routeName: '/dashboard',
    });
    await response.json();

    const rows = selectAllErrorRows(server);
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.ok(!/PRINCIPAL/.test(row.first_frame), `leaked PRINCIPAL in first_frame: ${row.first_frame}`);
    assert.ok(!/HANDLER/i.test(row.first_frame) || /\[word\]/.test(row.first_frame), `expected [word] replacement: ${row.first_frame}`);
    assert.match(row.first_frame, /\[word\]/);
  } finally {
    server.close();
  }
});

test('POST /api/ops/error-event redacts all-caps spelling words in routeName (Finding 1)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const response = await postErrorEvent(server, {
      errorKind: 'Error',
      messageFirstLine: 'boom',
      routeName: '/word/PRINCIPAL',
    });
    await response.json();

    const rows = selectAllErrorRows(server);
    assert.equal(rows.length, 1);
    assert.ok(!/PRINCIPAL/.test(rows[0].route_name), `leaked PRINCIPAL in route_name: ${rows[0].route_name}`);
    assert.match(rows[0].route_name, /\[word\]/);
  } finally {
    server.close();
  }
});

// U6 review follow-up (Finding 2): rate-limit ordering — oversized bodies
// must still bump the rate-limit counter so a flood of 9KB+ requests from
// the same IP eventually trips 429.
test('POST /api/ops/error-event bumps rate-limit BEFORE body-cap check (Finding 2)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    // Seed the IP bucket to 60 so the 61st request (oversized or not) is
    // over the limit. If the reorder fix is correct, an oversized body
    // will return 429 — not 400 — because the rate-limit fires first.
    await seedRateLimit(server, 'ops-error-capture-ip', 'unknown', 60);

    const bigBody = JSON.stringify({
      errorKind: 'Error',
      messageFirstLine: 'x'.repeat(10 * 1024), // > 8KB cap
    });
    const response = await server.fetchRaw('https://repo.test/api/ops/error-event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: bigBody,
    });
    const payload = await response.json();
    assert.equal(response.status, 429, 'oversized body must be rejected by rate-limit first');
    assert.equal(payload.code, 'ops_error_rate_limited');
  } finally {
    server.close();
  }
});

test('POST /api/ops/error-event: oversized bodies still bump the rate-limit counter (Finding 2)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    // First oversized body: rate-limit counter is zero so the request
    // passes the limit check, hits the body-cap, returns 400.
    const bigBody = JSON.stringify({
      errorKind: 'Error',
      messageFirstLine: 'x'.repeat(10 * 1024),
    });
    const first = await server.fetchRaw('https://repo.test/api/ops/error-event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: bigBody,
    });
    const firstPayload = await first.json();
    assert.equal(first.status, 400);
    assert.equal(firstPayload.code, 'ops_error_payload_too_large');

    // With the Finding 2 fix, that first oversized body incremented the
    // rate-limit bucket. Confirm by reading the limiter row directly.
    const windowMs = 10 * 60 * 1000;
    const windowStartedAt = Math.floor(Date.now() / windowMs) * windowMs;
    const hashedKey = server.DB.db.prepare(`
      SELECT request_count FROM request_limits
      WHERE limiter_key LIKE 'ops-error-capture-ip:%'
        AND window_started_at = ?
    `).get(windowStartedAt);
    assert.ok(hashedKey && Number(hashedKey.request_count) >= 1, 'rate-limit counter must advance on oversized body');
  } finally {
    server.close();
  }
});

// U6 review follow-up (Finding 5): concurrent fresh-insert race — the
// losing invocation must NOT double-bump the status.open counter.
// Simulated by driving the second call through the ON CONFLICT DO NOTHING
// branch: the dedup preflight misses (because we clear the preflight
// index temporarily) but the fingerprint UNIQUE already has the row.
test('recordClientErrorEvent: concurrent fresh-insert race does not drift the counter (Finding 5)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const db = server.DB;
    const { createWorkerRepository } = await import('../worker/src/repository.js');
    const repository = createWorkerRepository({ env: { DB: db } });

    // First call: genuine fresh insert.
    const first = await repository.recordClientErrorEvent({
      clientEvent: {
        errorKind: 'RaceError',
        messageFirstLine: 'race A',
        firstFrame: 'at A (race.js:1)',
      },
    });
    assert.equal(first.deduped, false);
    assert.ok(first.eventId);

    // To simulate a concurrent race where two invocations both reach the
    // fresh-insert branch before either commits, we need the preflight
    // to miss while the fingerprint-UNIQUE already holds a row. We
    // simulate that by wrapping the D1 prepare call for the preflight
    // SELECT tuple so that its first result returns null. The INSERT
    // then runs, hits the UNIQUE-on-fingerprint, returns changes=0, and
    // the Finding 5 fallback executes a tuple lookup (not the preflight)
    // which DOES see the row.
    const originalPrepare = db.prepare.bind(db);
    let preflightBypass = true;
    db.prepare = function patchedPrepare(sql) {
      const statement = originalPrepare(sql);
      // Only patch the preflight SELECT with the tuple (matched by the
      // specific column list). Every other prepare passes straight through.
      if (preflightBypass
        && typeof sql === 'string'
        && /SELECT id, first_seen, occurrence_count, status\s+FROM ops_error_events/.test(sql)
        && /WHERE error_kind = \?/.test(sql)) {
        preflightBypass = false; // only suppress the first match
        return {
          ...statement,
          bind(...params) {
            const bound = statement.bind(...params);
            return {
              ...bound,
              async first() { return null; }, // force the caller onto the fresh-insert branch
              async all() { return bound.all(); },
              async run() { return bound.run(); },
            };
          },
        };
      }
      return statement;
    };

    try {
      const second = await repository.recordClientErrorEvent({
        clientEvent: {
          errorKind: 'RaceError',
          messageFirstLine: 'race A',
          firstFrame: 'at A (race.js:1)',
        },
      });
      // Finding 5: the ON CONFLICT fires, changes=0, fallback tuple lookup
      // hits the winner, UPDATE bumps occurrence_count, counter not
      // double-bumped.
      assert.equal(second.deduped, true, 'lost-race call must downgrade to dedup path');
      assert.equal(second.eventId, first.eventId, 'dedup must return the winning row id');
    } finally {
      db.prepare = originalPrepare;
    }

    const rows = selectAllErrorRows(server);
    assert.equal(rows.length, 1, 'only one row should exist');
    assert.equal(rows[0].occurrence_count, 2, 'occurrence_count must advance to 2');

    // Crucial assertion: counter is 1 (from the first genuine insert), NOT 2.
    const counter = kpiRow(server, 'ops_error_events.status.open');
    assert.equal(counter?.metric_count, 1, 'status.open counter must not drift under concurrent race');
  } finally {
    server.close();
  }
});
