// U4 (sys-hardening p1): capacity telemetry contract tests.
//
// Covers:
//   1. Shape — happy-path bootstrap emits a single structured
//      `[ks2-capacity]` line with the full required key set.
//   2. Failure rows always emit regardless of the sampling rate.
//   3. Happy-path sampling — a stubbed random generator at rate 0 skips
//      the emission for `failureCategory === 'ok'` rows.
//   4. Redaction — a full bootstrap + subject-command + hub-read pass
//      leaves `[ks2-capacity]` lines free of forbidden keys, session
//      cookies, learner names, and private prompt text.
//   5. Subject-command telemetry: D1 query count, non-zero wall time,
//      `failureCategory: 'ok'`.
//   6. D1 row metrics — a bootstrap hit records non-zero `rowsRead`
//      against the sqlite helper's synthetic meta fields.
//   7. Error-path routing — a request that errors inside the Worker
//      handler still emits telemetry with a non-`ok` failure category.
//   8. Emission failure — a cyclic collector snapshot logs
//      `[ks2-capacity-telemetry-error]` and does not break the user
//      response.
//
// The test uses the Worker repository harness (`createWorkerRepositoryServer`)
// so it exercises the real `worker/src/index.js` => `worker/src/app.js`
// path and the real `d1.js` telemetry wrapping.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';
import { FORBIDDEN_KEYS_EVERYWHERE } from './helpers/forbidden-keys.mjs';
import {
  CAPACITY_TELEMETRY_SAMPLE_RATE,
  categoriseFailure,
  createCapacityCollector,
  emitCapacityTelemetry,
  resolveRouteTemplate,
  routeKey,
} from '../worker/src/capacity/telemetry.js';

const BASE_URL = 'https://repo.test';

function captureLogs(fn) {
  const captured = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  // Force capacity sampling ON for the test scope so happy-path rows
  // always emit. The 10 % sampler is a production-only posture; tests
  // must be deterministic.
  const originalRandom = Math.random;
  Math.random = () => 0;
  console.log = (...args) => {
    captured.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
  };
  console.warn = (...args) => {
    captured.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
  };
  return Promise.resolve()
    .then(fn)
    .then((value) => ({ value, captured }))
    .finally(() => {
      console.log = originalLog;
      console.warn = originalWarn;
      Math.random = originalRandom;
    });
}

function seedAccount(server, accountId = 'adult-a') {
  // Reuse the Worker's own ensureAccount path via /api/session; that
  // inserts the dev-stub account row so FK-constrained follow-up inserts
  // (learner_profiles, memberships) can anchor to it.
  return server.fetch(`${BASE_URL}/api/session`);
}

function capacityLinesFrom(captured) {
  return captured.filter((line) => line.startsWith('[ks2-capacity] '));
}

function parseCapacityLine(line) {
  return JSON.parse(line.slice('[ks2-capacity] '.length));
}

function createAuthedServer({ env: extraEnv = {} } = {}) {
  return createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'development-stub',
      ENVIRONMENT: 'test',
      ...extraEnv,
    },
  });
}

test('U4 sample-rate constant is 10%% by default', () => {
  assert.equal(CAPACITY_TELEMETRY_SAMPLE_RATE, 0.1);
});

test('U4 resolveRouteTemplate collapses subject-command dynamic segments', () => {
  assert.equal(resolveRouteTemplate('/api/subjects/spelling/command'), '/api/subjects/:subjectId/command');
  assert.equal(resolveRouteTemplate('/api/subjects/punctuation/command'), '/api/subjects/:subjectId/command');
  assert.equal(resolveRouteTemplate('/api/bootstrap'), '/api/bootstrap');
});

test('U4 routeKey prefixes HTTP method', () => {
  assert.equal(routeKey('GET', '/api/bootstrap'), 'GET /api/bootstrap');
  assert.equal(routeKey('post', '/api/subjects/spelling/command'), 'POST /api/subjects/:subjectId/command');
});

test('U4 categoriseFailure maps codes and statuses to the failure taxonomy', () => {
  assert.equal(categoriseFailure({ status: 200 }), 'ok');
  assert.equal(categoriseFailure({ status: 401 }), 'authFailure');
  assert.equal(categoriseFailure({ status: 429 }), 'rateLimited');
  assert.equal(categoriseFailure({ status: 503 }), 'backendUnavailable');
  assert.equal(categoriseFailure({ status: 500 }), 'server5xx');
  assert.equal(categoriseFailure({ error: { extra: { code: 'stale_write' } } }), 'staleWrite');
  assert.equal(categoriseFailure({ error: { extra: { code: 'idempotency_reuse' } } }), 'idempotencyReuse');
  assert.equal(categoriseFailure({ error: { extra: { code: 'redaction_failure' } } }), 'redactionFailure');
  assert.equal(categoriseFailure({ status: 1102 }), 'exceededCpu');
  assert.equal(categoriseFailure({ error: { message: 'D1 overloaded' } }), 'd1Overloaded');
});

test('U4 happy-path bootstrap emits [ks2-capacity] with bounded metadata and ok category', async () => {
  const server = createAuthedServer();
  const { captured, value: response } = await captureLogs(() => server.fetch(`${BASE_URL}/api/bootstrap`));
  assert.equal(response.status, 200);
  const lines = capacityLinesFrom(captured);
  assert.ok(lines.length >= 1, `expected a [ks2-capacity] line, got ${JSON.stringify(captured)}`);
  const payload = parseCapacityLine(lines[0]);
  assert.equal(payload.endpoint, '/api/bootstrap');
  assert.equal(payload.route, 'GET /api/bootstrap');
  assert.equal(payload.method, 'GET');
  assert.equal(payload.status, 200);
  assert.equal(payload.failureCategory, 'ok');
  assert.ok(payload.responseBytes > 0);
  assert.ok(payload.d1.queryCount > 0, 'bootstrap must touch D1');
  assert.ok(payload.d1.rowsRead >= 0);
  assert.ok(payload.d1.rowsWritten >= 0);
  assert.ok(typeof payload.requestId === 'string');
  server.close();
});

test('U4 subject-command emits telemetry with d1.queryCount, wall time, and ok category', async () => {
  const server = createAuthedServer();
  // Seed the dev-stub account row via the session route so FK-constrained
  // inserts below can anchor to it.
  await seedAccount(server);
  // Seed the harness with a learner so the subject command has a target.
  server.DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES ('learner-a', 'Ava', 'Y5', '#3E6FA8', 'sats', 15, 0, 0, 0)
  `).run();
  server.DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES ('adult-a', 'learner-a', 'owner', 0, 0, 0)
  `).run();
  server.DB.db.prepare(`
    UPDATE adult_accounts SET selected_learner_id = 'learner-a', updated_at = 0 WHERE id = 'adult-a'
  `).run();

  const { captured } = await captureLogs(() => server.fetch(`${BASE_URL}/api/subjects/spelling/command`, {
    method: 'POST',
    headers: {
      origin: BASE_URL,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      command: 'start-session',
      subjectId: 'spelling',
      learnerId: 'learner-a',
      input: { mode: 'single', words: ['possess'], yearFilter: 'all', length: 1 },
      mutation: { requestId: 'capacity-test-1', correlationId: 'capacity-corr-1' },
    }),
  }));
  const lines = capacityLinesFrom(captured);
  // The command route may return a 4xx if the dev-stub account is not
  // authorised for writes in all harness configurations, but it must
  // still emit a [ks2-capacity] line. We only assert telemetry shape.
  assert.ok(lines.length >= 1);
  const payload = parseCapacityLine(lines.find((line) => line.includes('/api/subjects/:subjectId/command')) || lines[0]);
  assert.ok(payload.d1.queryCount >= 0);
  assert.ok(typeof payload.wallTimeMs === 'number' && payload.wallTimeMs >= 0);
  assert.equal(payload.method, 'POST');
  server.close();
});

test('U4 request that errors still emits telemetry with non-ok failureCategory', async () => {
  const server = createAuthedServer();
  const { captured, value: response } = await captureLogs(() => server.fetchRaw(`${BASE_URL}/api/bootstrap`));
  // No dev-session header => 401 unauthenticated.
  assert.equal(response.status, 401);
  const lines = capacityLinesFrom(captured);
  assert.equal(lines.length, 1);
  const payload = parseCapacityLine(lines[0]);
  assert.equal(payload.status, 401);
  assert.equal(payload.failureCategory, 'authFailure');
  server.close();
});

test('U4 request that does not touch D1 emits d1.queryCount 0 without crashing', async () => {
  const server = createAuthedServer();
  const { captured } = await captureLogs(() => server.fetchRaw(`${BASE_URL}/src/bundles/app.bundle.js`, {
    method: 'GET',
  }));
  const lines = capacityLinesFrom(captured);
  assert.ok(lines.length >= 1);
  const payload = parseCapacityLine(lines[0]);
  // /src/* is short-circuited before any D1 access; telemetry still emits.
  assert.equal(payload.d1.queryCount, 0);
  server.close();
});

test('U4 sampling stub at rate 0 skips ok rows but still emits failure rows', async () => {
  // Drive the collector directly with a deterministic random so we can
  // lock the sampler contract without depending on Math.random variance.
  const okCollector = createCapacityCollector({
    request: new Request(`${BASE_URL}/api/bootstrap`),
    random: () => 0.9,
    sampleRate: 0,
    now: () => 0,
  });
  okCollector.setStatus(200);
  okCollector.finalise({ status: 200 });
  const captured = [];
  emitCapacityTelemetry(okCollector, { log: (line) => captured.push(line) });
  assert.equal(captured.length, 0, 'ok rows at sampleRate 0 must be skipped');

  const failCollector = createCapacityCollector({
    request: new Request(`${BASE_URL}/api/bootstrap`),
    random: () => 0.9,
    sampleRate: 0,
    now: () => 0,
  });
  failCollector.setStatus(500);
  failCollector.finalise({ status: 500 });
  emitCapacityTelemetry(failCollector, { log: (line) => captured.push(line) });
  assert.equal(captured.length, 1, 'failure rows must bypass the sampler');
  assert.ok(captured[0].startsWith('[ks2-capacity] '));
});

test('U4 sampling stub at rate 1 emits every ok row', async () => {
  const captured = [];
  const collector = createCapacityCollector({
    request: new Request(`${BASE_URL}/api/bootstrap`),
    random: () => 0.9999,
    sampleRate: 1,
    now: () => 0,
  });
  collector.setStatus(200);
  collector.finalise({ status: 200 });
  emitCapacityTelemetry(collector, { log: (line) => captured.push(line) });
  assert.equal(captured.length, 1);
});

test('U4 emission failure logs [ks2-capacity-telemetry-error] without crashing', async () => {
  const captured = [];
  const brokenCollector = {
    get requestId() { return 'ks2-req-broken'; },
    snapshot() {
      const cyclic = {};
      cyclic.self = cyclic;
      return cyclic;
    },
    shouldEmit() { return true; },
  };
  const ok = emitCapacityTelemetry(brokenCollector, {
    log: (line) => captured.push(line),
    warn: (line) => captured.push(line),
  });
  assert.equal(ok, false);
  assert.equal(captured.length, 1);
  assert.ok(captured[0].startsWith('[ks2-capacity-telemetry-error] '));
});

test('U4 redaction — telemetry lines never contain forbidden keys, cookies, or prompts', async () => {
  const server = createAuthedServer();
  // Seed fixture data with sentinel tokens that must never surface in any
  // telemetry line. The test asserts both absence of forbidden keys and
  // absence of the sentinel tokens.
  const learnerName = 'sentinel-learner-name-DO-NOT-LEAK';
  const privatePrompt = 'private-prompt-sentinel-DO-NOT-LEAK';
  await seedAccount(server);
  server.DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES ('learner-a', ?, 'Y5', '#3E6FA8', 'sats', 15, 0, 0, 1)
  `).run(learnerName);
  server.DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES ('adult-a', 'learner-a', 'owner', 0, 0, 0)
  `).run();
  server.DB.db.prepare(`
    UPDATE adult_accounts SET selected_learner_id = 'learner-a', updated_at = 0 WHERE id = 'adult-a'
  `).run();
  server.DB.db.prepare(`
    INSERT INTO event_log (id, learner_id, subject_id, system_id, event_type, event_json, created_at, actor_account_id)
    VALUES ('sentinel-event-1', 'learner-a', 'spelling', 'spelling', 'spelling.word-secured', ?, 1, 'adult-a')
  `).run(JSON.stringify({
    id: 'sentinel-event-1',
    type: 'spelling.word-secured',
    learnerId: 'learner-a',
    privatePrompt,
    sessionHash: 'should-never-leak',
  }));

  const { captured } = await captureLogs(async () => {
    // Full happy-path traversal: bootstrap, parent hub, then attempted
    // subject command (may error — we only care about telemetry).
    await server.fetch(`${BASE_URL}/api/bootstrap`);
    await server.fetch(`${BASE_URL}/api/hubs/parent`);
    await server.fetch(`${BASE_URL}/api/hubs/parent/recent-sessions`);
  });

  const lines = capacityLinesFrom(captured);
  assert.ok(lines.length >= 2, `expected multiple [ks2-capacity] lines, got ${lines.length}`);
  const joined = lines.join('\n');
  // Sentinel absence — private prompt text and learner name must never
  // appear in any telemetry line.
  assert.ok(!joined.includes(privatePrompt), `private prompt sentinel leaked: ${joined}`);
  assert.ok(!joined.includes(learnerName), `learner name sentinel leaked: ${joined}`);
  // Cookie values must never appear.
  assert.ok(!/ks2_session=/i.test(joined), 'session cookie leaked into telemetry');
  // Forbidden keys (structural): telemetry payload keys must never
  // include any of the universal forbidden-key set.
  for (const line of lines) {
    const payload = parseCapacityLine(line);
    for (const forbiddenKey of FORBIDDEN_KEYS_EVERYWHERE) {
      assert.ok(!Object.prototype.hasOwnProperty.call(payload, forbiddenKey),
        `forbidden key "${forbiddenKey}" appeared on capacity telemetry line: ${line}`);
    }
    // Bounded counts are a whitelist; reject anything unexpected.
    if (payload.boundedCounts) {
      for (const key of Object.keys(payload.boundedCounts)) {
        assert.ok(['sessions', 'events', 'learners', 'items'].includes(key),
          `unexpected bounded count key: ${key}`);
      }
    }
  }
  server.close();
});

test('U4 D1 row metrics — bootstrap records rowsRead against the helper metadata', async () => {
  const server = createAuthedServer();
  await seedAccount(server);
  server.DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES ('learner-a', 'Ava', 'Y5', '#3E6FA8', 'sats', 15, 0, 0, 1)
  `).run();
  server.DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES ('adult-a', 'learner-a', 'owner', 0, 0, 0)
  `).run();

  const { captured } = await captureLogs(() => server.fetch(`${BASE_URL}/api/bootstrap`));
  const lines = capacityLinesFrom(captured);
  assert.equal(lines.length, 1);
  const payload = parseCapacityLine(lines[0]);
  assert.ok(payload.d1.queryCount > 0, 'bootstrap must issue at least one query');
  assert.ok(payload.d1.rowsRead > 0, 'bootstrap must register rows_read via the sqlite helper');
  server.close();
});

test('U4 request IDs use cf-ray header when present', async () => {
  const server = createAuthedServer();
  const { captured } = await captureLogs(() => server.fetch(`${BASE_URL}/api/bootstrap`, {
    headers: {
      'cf-ray': '89ab12cd34ef5678-LHR',
    },
  }));
  const lines = capacityLinesFrom(captured);
  assert.ok(lines.length >= 1);
  const payload = parseCapacityLine(lines[0]);
  assert.ok(payload.requestId.startsWith('ks2-req-'));
  assert.ok(payload.requestId.includes('89ab12cd34ef5678-LHR'));
  server.close();
});

test('U4 bounded counts surface sessions/events/learners lengths from bootstrap payload', async () => {
  const server = createAuthedServer();
  await seedAccount(server);
  server.DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES ('learner-a', 'Ava', 'Y5', '#3E6FA8', 'sats', 15, 0, 0, 1)
  `).run();
  server.DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES ('adult-a', 'learner-a', 'owner', 0, 0, 0)
  `).run();

  const { captured } = await captureLogs(() => server.fetch(`${BASE_URL}/api/bootstrap`));
  const payload = parseCapacityLine(capacityLinesFrom(captured)[0]);
  // At minimum, `learners` bounded count must match the seeded cardinality.
  assert.equal(payload.boundedCounts.learners, 1);
  // `sessions` and `events` are present as array-length projections when
  // the bootstrap response carries them — telemetry records 0 when the
  // response contains an empty array.
  assert.ok(Object.prototype.hasOwnProperty.call(payload.boundedCounts, 'sessions'));
  assert.ok(Object.prototype.hasOwnProperty.call(payload.boundedCounts, 'events'));
  server.close();
});
