import test from 'node:test';
import assert from 'node:assert/strict';

import { analyseBootstrapPayload } from '../scripts/probe-production-bootstrap.mjs';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

function captureLogs(fn) {
  const captured = [];
  const originalLog = console.log;
  console.log = (...args) => {
    captured.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
  };
  return Promise.resolve()
    .then(fn)
    .then((value) => ({ value, captured }))
    .finally(() => {
      console.log = originalLog;
    });
}

const BASE_URL = 'https://repo.test';
const NOW = Date.UTC(2026, 0, 1);
const RECENT_SESSION_LIMIT_PER_LEARNER = 5;
const ACTIVE_SESSION_LIMIT_PER_LEARNER = 1;
const RECENT_EVENT_LIMIT_PER_LEARNER = 50;

function cookieFrom(response) {
  const setCookie = response.headers.get('set-cookie') || '';
  const match = /ks2_session=([^;]+)/.exec(setCookie);
  return match ? `ks2_session=${match[1]}` : '';
}

async function postJson(server, path, body = {}, headers = {}) {
  return server.fetchRaw(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: BASE_URL,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function runSql(server, sql, params = []) {
  server.DB.db.prepare(sql).run(...params);
}

function insertLearner(server, accountId, {
  id,
  name,
  sortIndex,
  selected = false,
  stateRevision,
}) {
  runSql(server, `
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES (?, ?, 'Y5', '#3E6FA8', 'sats', 15, ?, ?, ?)
  `, [id, name, NOW, NOW, stateRevision]);
  runSql(server, `
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, ?, 'owner', ?, ?, ?)
  `, [accountId, id, sortIndex, NOW, NOW]);
  if (selected) {
    runSql(server, 'UPDATE adult_accounts SET selected_learner_id = ?, updated_at = ? WHERE id = ?', [id, NOW, accountId]);
  }
}

function insertSubjectState(server, accountId, learnerId) {
  runSql(server, `
    INSERT INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
    VALUES (?, 'spelling', ?, ?, ?, ?)
  `, [
    learnerId,
    JSON.stringify({
      phase: 'session',
      session: {
        id: `${learnerId}-active`,
        type: 'learning',
        mode: 'smart',
        phase: 'question',
        progress: { done: 0, total: 1 },
        currentCard: {
          word: { word: 'private-active-word', slug: 'private-active-word' },
          prompt: {
            sentence: `top-secret-prompt-sentence-${learnerId}`,
            cloze: 'Spell the missing word.',
          },
        },
      },
    }),
    JSON.stringify({
      prefs: { mode: 'smart' },
      progress: {
        possess: { stage: 4 },
      },
    }),
    NOW,
    accountId,
  ]);
}

function insertPracticeSession(server, accountId, {
  id,
  learnerId,
  status,
  createdAt,
  updatedAt,
}) {
  runSql(server, `
    INSERT INTO practice_sessions (id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at, updated_by_account_id)
    VALUES (?, ?, 'spelling', 'learning', ?, ?, ?, ?, ?, ?)
  `, [
    id,
    learnerId,
    status,
    JSON.stringify({
      currentCard: {
        word: { word: 'private-active-word' },
        prompt: { sentence: `top-secret-prompt-sentence-${learnerId}` },
      },
    }),
    JSON.stringify({
      cards: [{ label: 'accuracy', value: '100%' }],
      mistakes: [{ word: 'private-active-word', year: '5-6' }],
    }),
    createdAt,
    updatedAt,
    accountId,
  ]);
}

function insertEvent(server, accountId, {
  id,
  learnerId,
  createdAt,
}) {
  runSql(server, `
    INSERT INTO event_log (id, learner_id, subject_id, system_id, event_type, event_json, created_at, actor_account_id)
    VALUES (?, ?, 'spelling', 'spelling', 'spelling.word-secured', ?, ?, ?)
  `, [
    id,
    learnerId,
    JSON.stringify({
      id,
      type: 'spelling.word-secured',
      learnerId,
      subjectId: 'spelling',
      mode: 'smart',
      sessionType: 'learning',
      spellingPool: 'core',
      yearBand: '5-6',
      secureCount: 1,
      createdAt,
      privatePrompt: `top-secret-prompt-sentence-${learnerId}`,
    }),
    createdAt,
    accountId,
  ]);
}

function seedHighHistoryLearner(server, accountId, learnerId) {
  insertSubjectState(server, accountId, learnerId);
  insertPracticeSession(server, accountId, {
    id: `${learnerId}-active`,
    learnerId,
    status: 'active',
    createdAt: NOW + 10_000,
    updatedAt: NOW + 10_000,
  });

  for (let index = 0; index < 30; index += 1) {
    insertPracticeSession(server, accountId, {
      id: `${learnerId}-stale-active-${String(index).padStart(3, '0')}`,
      learnerId,
      status: 'active',
      createdAt: NOW + 20_000 + index,
      updatedAt: NOW + 20_000 + index,
    });
  }

  for (let index = 0; index < 40; index += 1) {
    insertPracticeSession(server, accountId, {
      id: `${learnerId}-completed-${String(index).padStart(3, '0')}`,
      learnerId,
      status: 'completed',
      createdAt: NOW - index - 1,
      updatedAt: NOW - index - 1,
    });
  }

  for (let index = 0; index < 160; index += 1) {
    insertEvent(server, accountId, {
      id: `${learnerId}-event-${String(index).padStart(3, '0')}`,
      learnerId,
      createdAt: NOW + index,
    });
  }
}

async function registerProductionAccount(server) {
  const response = await postJson(server, '/api/auth/register', {
    email: 'bootstrap-capacity@example.test',
    password: 'password-1234',
  });
  const payload = await response.json();
  assert.equal(response.status, 201);
  return {
    accountId: payload.session.accountId,
    cookie: cookieFrom(response),
  };
}

function createProductionServer() {
  return createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
    },
  });
}

test('production bootstrap keeps high-history public payloads bounded and redacted', async () => {
  const server = createProductionServer();
  const { accountId, cookie } = await registerProductionAccount(server);

  insertLearner(server, accountId, {
    id: 'learner-high-a',
    name: 'Ava',
    sortIndex: 0,
    selected: true,
    stateRevision: 7,
  });
  insertLearner(server, accountId, {
    id: 'learner-high-b',
    name: 'Ben',
    sortIndex: 1,
    stateRevision: 11,
  });
  seedHighHistoryLearner(server, accountId, 'learner-high-a');
  seedHighHistoryLearner(server, accountId, 'learner-high-b');

  server.DB.clearQueryLog();
  const response = await server.fetchRaw(`${BASE_URL}/api/bootstrap`, {
    headers: { cookie },
  });
  const text = await response.text();
  const payload = JSON.parse(text);
  const responseBytes = Buffer.byteLength(text, 'utf8');

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.learners.selectedId, 'learner-high-a');
  assert.deepEqual(payload.learners.allIds, ['learner-high-a', 'learner-high-b']);
  assert.equal(payload.syncState.learnerRevisions['learner-high-a'], 7);
  assert.equal(payload.syncState.learnerRevisions['learner-high-b'], 11);
  // U7: production bootstrap is now the selected-learner-bounded path.
  // The selected learner (learner-high-a) keeps its full session history;
  // the sibling learner (learner-high-b) ships as a compact
  // `account.learnerList` entry, with its practice sessions fetched
  // lazily via the subject runtime endpoint when the user switches.
  assert.equal(payload.practiceSessions.some((session) => session.id === 'learner-high-a-active'), true);
  assert.equal(payload.practiceSessions.every((session) => session.learnerId === 'learner-high-a'), true,
    'U7 bounded mode ships only the selected learner\'s sessions');
  const siblingEntry = (payload.account?.learnerList || []).find((entry) => entry.id === 'learner-high-b');
  assert.ok(siblingEntry, 'sibling learner surfaces in account.learnerList');
  assert.equal(siblingEntry.revision, 11, 'compact entry carries state_revision');

  const learnerCount = payload.learners.allIds.length;
  assert.ok(payload.bootstrapCapacity);
  assert.equal(payload.bootstrapCapacity.mode, 'public-bounded');
  assert.equal(payload.bootstrapCapacity.limits.activeSessionsPerLearner, ACTIVE_SESSION_LIMIT_PER_LEARNER);
  assert.equal(payload.bootstrapCapacity.practiceSessions.returned, payload.practiceSessions.length);
  assert.equal(payload.bootstrapCapacity.eventLog.returned, payload.eventLog.length);
  assert.ok(payload.practiceSessions.length <= learnerCount * (RECENT_SESSION_LIMIT_PER_LEARNER + ACTIVE_SESSION_LIMIT_PER_LEARNER));
  assert.ok(payload.eventLog.length <= learnerCount * RECENT_EVENT_LIMIT_PER_LEARNER);
  assert.equal(payload.practiceSessions.every((session) => session.subjectId !== 'spelling' || session.sessionState === null), true);

  const bodyText = JSON.stringify(payload);
  assert.equal(bodyText.includes('private-active-word'), false);
  assert.equal(bodyText.includes('top-secret-prompt-sentence'), false);

  const analysis = analyseBootstrapPayload(payload, {
    responseBytes,
    maxBytes: 600_000,
    maxSessions: learnerCount * (RECENT_SESSION_LIMIT_PER_LEARNER + ACTIVE_SESSION_LIMIT_PER_LEARNER),
    maxEvents: learnerCount * RECENT_EVENT_LIMIT_PER_LEARNER,
    forbiddenTokens: ['private-active-word', 'top-secret-prompt-sentence'],
  });
  assert.deepEqual(analysis.failures, []);

  const eventReads = server.DB.takeQueryLog()
    .filter((entry) => entry.operation === 'all' && /\bFROM event_log\b/i.test(entry.sql));
  // U7: bounded mode reads events for the selected learner only, so the
  // old `>= learnerCount` lower bound no longer applies. The important
  // invariant is that every single read stays within the per-learner
  // recent-event cap, which still holds.
  assert.ok(eventReads.length >= 1, 'at least one event_log read for the selected learner');
  assert.equal(eventReads.every((entry) => entry.rowCount <= RECENT_EVENT_LIMIT_PER_LEARNER), true);

  // U3: meta.capacity surface is attached to production bootstrap and
  // carries the bootstrapCapacity projection stamped by the collector
  // via createWorkerRepository({ env, now, capacity }). The public
  // allowlist shape must match the in-body bootstrapCapacity metadata.
  assert.ok(payload.meta, 'Bootstrap response must carry meta.');
  assert.ok(payload.meta.capacity, 'meta.capacity must be present for /api/bootstrap (U3).');
  assert.ok(
    typeof payload.meta.capacity.requestId === 'string'
    && payload.meta.capacity.requestId.startsWith('ks2_req_'),
    'meta.capacity.requestId must be a ks2_req_ prefixed id.',
  );
  assert.ok(payload.meta.capacity.queryCount > 0, 'meta.capacity.queryCount must reflect D1 work.');
  assert.ok(payload.meta.capacity.d1RowsRead >= 0);
  // bootstrapCapacity on the public shape mirrors the bundle's
  // bootstrapCapacity (stamped on the collector inside bootstrap()).
  assert.ok(payload.meta.capacity.bootstrapCapacity, 'bootstrapCapacity must be stamped on collector for public bootstrap.');
  // U7: BOOTSTRAP_CAPACITY_VERSION bumped from 1 to 2 when the
  // selected-learner-bounded envelope landed (plan line 750 release
  // rule).
  assert.equal(payload.meta.capacity.bootstrapCapacity.version, 2);
  assert.equal(payload.meta.capacity.bootstrapCapacity.mode, 'public-bounded');

  server.close();
});

test('production bootstrap still requires an authenticated session before capacity checks', async () => {
  const server = createProductionServer();
  const response = await server.fetchRaw(`${BASE_URL}/api/bootstrap`);
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.code, 'unauthenticated');

  server.close();
});

// U3 characterization lock: pins the `[ks2-worker] {event: "capacity.request", ...}`
// structured telemetry line the Worker emits on an unauthenticated bootstrap.
// Pre-route 401s are force-logged (round 1 P0 #01 fix), so an unauthenticated
// bootstrap is a deterministic witness for the telemetry contract without
// needing to stub Math.random. Rewritten on 2026-04-26 during Option B merge
// (PR #201) to use our `[ks2-worker] event: capacity.request` prefix in
// place of PR #207's `[ks2-capacity]`.
test('U3 characterization — unauthenticated bootstrap emits capacity.request log with pre-route phase', async () => {
  const server = createProductionServer();
  const { captured, value: response } = await captureLogs(() => server.fetchRaw(`${BASE_URL}/api/bootstrap`));
  assert.equal(response.status, 401);
  const capacityLines = captured.filter((line) => line.startsWith('[ks2-worker] '));
  // Parse each candidate and retain only capacity.request events.
  const payloads = capacityLines
    .map((line) => {
      try {
        return JSON.parse(line.slice('[ks2-worker] '.length));
      } catch {
        return null;
      }
    })
    .filter((entry) => entry && entry.event === 'capacity.request');
  assert.equal(payloads.length, 1, `expected exactly one capacity.request line, got ${payloads.length}: ${JSON.stringify(capacityLines)}`);
  const payload = payloads[0];
  // Shape contract — keys present, values bounded.
  assert.equal(payload.endpoint, '/api/bootstrap');
  assert.equal(payload.method, 'GET');
  assert.equal(payload.status, 401);
  assert.equal(payload.phase, 'pre-route');
  assert.ok(typeof payload.wallMs === 'number' && payload.wallMs >= 0);
  assert.ok(typeof payload.responseBytes === 'number' && payload.responseBytes > 0);
  assert.ok(typeof payload.queryCount === 'number');
  assert.ok(typeof payload.d1RowsRead === 'number');
  assert.ok(typeof payload.d1RowsWritten === 'number');
  assert.ok(Array.isArray(payload.statements));
  assert.ok(typeof payload.requestId === 'string' && payload.requestId.startsWith('ks2_req_'));

  server.close();
});
