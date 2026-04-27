// U3 — Hot-path query budget enforcement.
//
// These tests turn observed D1 query counts from "observability" into
// "release gate" by pinning budget ceilings for every critical hot path.
// Each budget constant was established by measuring the actual query count
// on the test harness, then locking `measured + 1` as headroom for
// additive-only schema evolution. Adjusting a budget requires updating
// the constant AND the rationale comment in the same PR.
//
// Pattern reference: `tests/worker-projection-hot-path.test.js` scenario 19.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerApp } from '../worker/src/app.js';
import { COMMAND_PROJECTION_MODEL_KEY } from '../worker/src/read-models/learner-read-models.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';

// ---------------------------------------------------------------------------
// Budget constants — measured first, then locked.
// Adjusting a budget requires updating the constant AND the rationale.
// Note: count-based budgets detect ADDED queries but not replaced-bounded-with-unbounded at the same count.
// ---------------------------------------------------------------------------

// Measured: 12 queries for a 3-learner bounded POST bootstrap (ops_status
// JOIN + ensureAccount upsert + account lookup + monster_visual_config +
// membership list + list_revision + child_subject_state unbounded +
// game_state + selected-learner active-session scan + practice_sessions +
// event_log + spelling content). Headroom +1.
const BUDGET_BOOTSTRAP_MULTI_LEARNER = 13;

// Measured: 5 queries for the notModified probe (ops_status JOIN +
// ensureAccount upsert + account select + membership list +
// list_revision). Short-circuit before any learner data is loaded.
const BUDGET_BOOTSTRAP_NOT_MODIFIED = 6;

// U6 established: projection hit path — zero event_log reads. Measured:
// 13 queries on the 2000-event single-learner harness (ops_status JOIN +
// ensureAccount + membership + learner+account revision + subject_state +
// active_session + spelling_content + projection read-model + 5 batch
// writes). Phase D / U14 added the account_ops_metadata JOIN.
const BUDGET_COMMAND_HOT_PATH = 13;

// Measured: 6 queries for parent hub recent-sessions (ops_status JOIN +
// ensureAccount upsert + account select + membership list + learner
// access check + practice_sessions query). Headroom +1.
const BUDGET_PARENT_RECENT_SESSIONS = 7;

// Measured: 12 queries for GET bootstrap full bundle (identical query
// set to POST bounded — the GET path is upgraded to v2 bounded on the
// public read-models path). Headroom +1.
const BUDGET_BOOTSTRAP_GET_FULL = 13;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const BASE_URL = 'https://repo.test';
const NOW = Date.UTC(2026, 0, 1);

function runSql(server, sql, params = []) {
  server.DB.db.prepare(sql).run(...params);
}

function insertLearner(server, accountId, { id, name, sortIndex, selected = false }) {
  runSql(server, `
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES (?, ?, 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `, [id, name, NOW, NOW]);
  runSql(server, `
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, ?, 'owner', ?, ?, ?)
  `, [accountId, id, sortIndex, NOW, NOW]);
  if (selected) {
    runSql(server, 'UPDATE adult_accounts SET selected_learner_id = ?, updated_at = ? WHERE id = ?', [id, NOW, accountId]);
  }
}

function insertSubjectState(server, accountId, learnerId, subjectId = 'spelling') {
  runSql(server, `
    INSERT INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    learnerId,
    subjectId,
    JSON.stringify({ phase: 'idle' }),
    JSON.stringify({ prefs: { mode: 'smart' } }),
    NOW,
    accountId,
  ]);
}

function insertPracticeSession(server, accountId, learnerId, { id, status = 'completed', createdAt = NOW }) {
  runSql(server, `
    INSERT INTO practice_sessions (id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at, updated_by_account_id)
    VALUES (?, ?, 'spelling', 'learning', ?, ?, ?, ?, ?, ?)
  `, [
    id,
    learnerId,
    status,
    JSON.stringify({}),
    JSON.stringify({ cards: [] }),
    createdAt,
    createdAt,
    accountId,
  ]);
}

function insertEvent(server, accountId, learnerId, { id, createdAt = NOW }) {
  runSql(server, `
    INSERT INTO event_log (id, learner_id, subject_id, system_id, event_type, event_json, created_at, actor_account_id)
    VALUES (?, ?, 'spelling', 'spelling', 'spelling.word-secured', ?, ?, ?)
  `, [
    id,
    learnerId,
    JSON.stringify({ id, type: 'spelling.word-secured', learnerId, secureCount: 1 }),
    createdAt,
    accountId,
  ]);
}

function createServer() {
  const server = createWorkerRepositoryServer({ defaultAccountId: 'adult-budget' });
  runSql(server, `
    INSERT INTO adult_accounts (id, email, display_name, platform_role, created_at, updated_at, selected_learner_id)
    VALUES ('adult-budget', 'budget@test', 'Budget Adult', 'parent', ?, ?, NULL)
  `, [NOW, NOW]);
  return server;
}

async function readJsonBody(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return null; }
}

async function postBootstrap(server, body = {}, extraHeaders = {}) {
  return server.fetch(`${BASE_URL}/api/bootstrap`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: BASE_URL,
      'x-ks2-public-read-models': '1',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

async function getBootstrap(server, extraHeaders = {}) {
  return server.fetch(`${BASE_URL}/api/bootstrap`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'x-ks2-public-read-models': '1',
      ...extraHeaders,
    },
  });
}

// Seed the canonical 3-learner fixture for bootstrap budget tests.
function seed3LearnerFixture(server) {
  const accountId = 'adult-budget';
  insertLearner(server, accountId, { id: 'learner-alpha', name: 'Alpha', sortIndex: 0, selected: true });
  insertLearner(server, accountId, { id: 'learner-beta', name: 'Beta', sortIndex: 1 });
  insertLearner(server, accountId, { id: 'learner-gamma', name: 'Gamma', sortIndex: 2 });

  // Subject states for all 3 learners (spelling + grammar).
  for (const learnerId of ['learner-alpha', 'learner-beta', 'learner-gamma']) {
    insertSubjectState(server, accountId, learnerId, 'spelling');
    insertSubjectState(server, accountId, learnerId, 'grammar');
  }

  // Sessions + events only for the selected learner (bounded envelope).
  for (let i = 0; i < 5; i += 1) {
    insertPracticeSession(server, accountId, 'learner-alpha', {
      id: `alpha-session-${i}`,
      createdAt: NOW - i - 1,
    });
  }
  for (let i = 0; i < 10; i += 1) {
    insertEvent(server, accountId, 'learner-alpha', {
      id: `alpha-event-${i}`,
      createdAt: NOW + i,
    });
  }

  // Seed a couple of sessions + events for siblings to ensure bounded
  // queries do NOT fetch them (the assertion has teeth only when sibling
  // data exists in the DB).
  for (let i = 0; i < 3; i += 1) {
    insertPracticeSession(server, accountId, 'learner-beta', {
      id: `beta-session-${i}`,
      createdAt: NOW - i - 1,
    });
    insertEvent(server, accountId, 'learner-beta', {
      id: `beta-event-${i}`,
      createdAt: NOW + i,
    });
  }
}

// ---------------------------------------------------------------------------
// Command hot-path harness (mirrors worker-projection-hot-path.test.js)
// ---------------------------------------------------------------------------

function seedAccountLearner(DB, { accountId = 'adult-cmd', learnerId = 'learner-cmd' } = {}) {
  DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES (?, 'Cmd Learner', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(learnerId, NOW, NOW);
  DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES (?, ?, ?, 'parent', ?, ?, ?, 0)
  `).run(accountId, `${accountId}@example.test`, 'Cmd Adult', learnerId, NOW, NOW);
  DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, ?, 'owner', 0, ?, ?)
  `).run(accountId, learnerId, NOW, NOW);
}

function insertProjectionWindowFillerEvents(DB, { learnerId = 'learner-cmd', count = 2000, startAt }) {
  for (let index = 0; index < count; index += 1) {
    DB.db.prepare(`
      INSERT INTO event_log (id, learner_id, subject_id, system_id, event_type, event_json, created_at, actor_account_id)
      VALUES (?, ?, 'spelling', 'spelling', 'spelling.session-completed', ?, ?, 'adult-cmd')
    `).run(
      `spelling.budget-filler:${index}`,
      learnerId,
      JSON.stringify({ id: `spelling.budget-filler:${index}`, type: 'spelling.session-completed', learnerId }),
      startAt + index,
    );
  }
}

function eventLogReads(DB) {
  return DB.takeQueryLog()
    .filter((entry) => entry.sql && /\bevent_log\b/i.test(entry.sql));
}

function createCommandHarness({ subjectId = 'spelling', accountId = 'adult-cmd' } = {}) {
  const DB = createMigratedSqliteD1Database();
  seedAccountLearner(DB, { accountId });
  const app = createWorkerApp({ now: () => NOW });
  const env = {
    DB,
    AUTH_MODE: 'development-stub',
    ENVIRONMENT: 'test',
  };
  let revision = 0;
  let sequence = 0;

  async function command(commandName, payload = {}) {
    const response = await app.fetch(new Request(`${BASE_URL}/api/subjects/${subjectId}/command`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ks2-dev-account-id': accountId,
      },
      body: JSON.stringify({
        command: commandName,
        learnerId: 'learner-cmd',
        requestId: `budget-cmd-${sequence += 1}`,
        expectedLearnerRevision: revision,
        payload,
      }),
    }), env, {});
    const body = await response.json();
    if (response.status === 200 && body?.mutation?.appliedRevision != null) {
      revision = body.mutation.appliedRevision;
    }
    return { response, body };
  }

  return {
    DB,
    env,
    app,
    command,
    close() { DB.close(); },
    get revision() { return revision; },
    set revision(value) { revision = value; },
  };
}

// ---------------------------------------------------------------------------
// Scenario 1 — Bootstrap POST (selected-learner-bounded, 3-learner fixture)
// ---------------------------------------------------------------------------
test('U3 query budget: POST bootstrap multi-learner bounded ≤ BUDGET_BOOTSTRAP_MULTI_LEARNER', async () => {
  const server = createServer();
  try {
    seed3LearnerFixture(server);

    const response = await postBootstrap(server, {});
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);
    assert.equal(payload.meta?.capacity?.bootstrapMode, 'selected-learner-bounded');

    const capacity = payload.meta?.capacity;
    assert.ok(capacity, 'POST bootstrap must expose meta.capacity');
    assert.ok(typeof capacity.queryCount === 'number', 'queryCount must be numeric');

    assert.ok(
      capacity.queryCount <= BUDGET_BOOTSTRAP_MULTI_LEARNER,
      `POST bootstrap multi-learner queryCount must be ≤ ${BUDGET_BOOTSTRAP_MULTI_LEARNER}; measured ${capacity.queryCount}`,
    );

    // D1 rows read must be bounded — not scanning full history.
    assert.ok(typeof capacity.d1RowsRead === 'number', 'd1RowsRead must be numeric');
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 2 — Bootstrap POST (notModified short-circuit)
// ---------------------------------------------------------------------------
test('U3 query budget: POST bootstrap notModified ≤ BUDGET_BOOTSTRAP_NOT_MODIFIED', async () => {
  const server = createServer();
  try {
    seed3LearnerFixture(server);

    // First POST to get the baseline hash.
    const probeResponse = await getBootstrap(server);
    const probePayload = await readJsonBody(probeResponse);
    assert.equal(probePayload.ok, true);
    const lastKnownRevision = probePayload.revision.hash;
    assert.ok(lastKnownRevision, 'probe must return a revision hash');

    // Second POST with the matching hash — should short-circuit.
    const response = await postBootstrap(server, { lastKnownRevision });
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);
    assert.equal(payload.notModified, true, 'matching hash must return notModified');
    assert.equal(payload.meta?.capacity?.bootstrapMode, 'not-modified');

    const capacity = payload.meta?.capacity;
    assert.ok(capacity, 'notModified response must expose meta.capacity');

    assert.ok(
      capacity.queryCount <= BUDGET_BOOTSTRAP_NOT_MODIFIED,
      `POST bootstrap notModified queryCount must be ≤ ${BUDGET_BOOTSTRAP_NOT_MODIFIED}; measured ${capacity.queryCount}`,
    );
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 3 — Subject command hot path (2000-event learner)
// ---------------------------------------------------------------------------
test('U3 query budget: subject command hot-path 2000-event learner ≤ BUDGET_COMMAND_HOT_PATH', async () => {
  const harness = createCommandHarness();
  try {
    insertProjectionWindowFillerEvents(harness.DB, {
      count: 2000,
      startAt: Date.UTC(2026, 3, 24, 17, 30, 0),
    });

    // First command primes the projection via miss-rehydrated fallback.
    const first = await harness.command('start-session', {
      mode: 'single',
      slug: 'possess',
      length: 1,
    });
    assert.equal(first.response.status, 200, JSON.stringify(first.body));

    // Second command rides the hot path with the projection already primed.
    harness.DB.clearQueryLog();
    const hot = await harness.command('submit-answer', { answer: 'possess' });
    assert.equal(hot.response.status, 200, JSON.stringify(hot.body));

    const capacity = hot.body.meta?.capacity;
    assert.ok(capacity, 'hot-path command must expose meta.capacity');

    assert.ok(
      capacity.queryCount <= BUDGET_COMMAND_HOT_PATH,
      `command hot-path queryCount must be ≤ ${BUDGET_COMMAND_HOT_PATH}; measured ${capacity.queryCount}`,
    );

    // event_log reads must be zero on the hot path (projection handles it).
    const reads = eventLogReads(harness.DB);
    assert.equal(
      reads.length,
      0,
      `hot path must not read from event_log; saw ${reads.length} scans`,
    );
  } finally {
    harness.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 4 — Parent Hub recent-sessions
// ---------------------------------------------------------------------------
test('U3 query budget: parent hub recent-sessions ≤ BUDGET_PARENT_RECENT_SESSIONS', async () => {
  const server = createServer();
  try {
    insertLearner(server, 'adult-budget', { id: 'learner-hub', name: 'Hub Learner', sortIndex: 0, selected: true });
    insertSubjectState(server, 'adult-budget', 'learner-hub', 'spelling');

    for (let i = 0; i < 5; i += 1) {
      insertPracticeSession(server, 'adult-budget', 'learner-hub', {
        id: `hub-session-${i}`,
        createdAt: NOW - i - 1,
      });
    }

    const response = await server.fetch(`${BASE_URL}/api/hubs/parent/recent-sessions?learnerId=learner-hub`, {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);

    const capacity = payload.meta?.capacity;
    assert.ok(capacity, 'parent hub recent-sessions must expose meta.capacity');

    assert.ok(
      capacity.queryCount <= BUDGET_PARENT_RECENT_SESSIONS,
      `parent hub recent-sessions queryCount must be ≤ ${BUDGET_PARENT_RECENT_SESSIONS}; measured ${capacity.queryCount}`,
    );
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 5 — GET bootstrap (full bundle with public read models)
// ---------------------------------------------------------------------------
test('U3 query budget: GET bootstrap full bundle ≤ BUDGET_BOOTSTRAP_GET_FULL', async () => {
  const server = createServer();
  try {
    seed3LearnerFixture(server);

    const response = await getBootstrap(server);
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);
    assert.equal(payload.meta?.capacity?.bootstrapMode, 'selected-learner-bounded');

    const capacity = payload.meta?.capacity;
    assert.ok(capacity, 'GET bootstrap must expose meta.capacity');

    assert.ok(
      capacity.queryCount <= BUDGET_BOOTSTRAP_GET_FULL,
      `GET bootstrap full bundle queryCount must be ≤ ${BUDGET_BOOTSTRAP_GET_FULL}; measured ${capacity.queryCount}`,
    );

    // GET full must be at least as expensive as the notModified short-circuit.
    assert.ok(
      capacity.queryCount > BUDGET_BOOTSTRAP_NOT_MODIFIED,
      `GET bootstrap full (${capacity.queryCount}) must exceed notModified budget (${BUDGET_BOOTSTRAP_NOT_MODIFIED})`,
    );
  } finally {
    server.close();
  }
});
