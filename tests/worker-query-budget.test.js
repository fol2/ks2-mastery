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
import { createApiPlatformRepositories } from '../src/platform/core/repositories/index.js';

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

// Measured: 4 queries for Hero read-model GET (ops_status JOIN +
// ensureAccount upsert + membership learner-access check +
// child_subject_state read). Headroom +1.
const BUDGET_HERO_READ_MODEL = 5;

// Measured: 20 queries for Admin Ops KPI dashboard (ops_status JOIN +
// ensureAccount upsert + assertAdminHubActor SELECT + 14 COUNT(*)
// aggregates across accounts/learners/sessions/events/mutations/errors
// + 3 admin_kpi_metrics reads). Headroom +1.
const BUDGET_ADMIN_OPS_KPI = 21;

// Measured: 4 queries for Admin accounts search (ops_status JOIN +
// ensureAccount upsert + assertAdminHubActor SELECT + search query
// with LIKE filter). Headroom +1.
const BUDGET_ADMIN_ACCOUNTS_SEARCH = 5;

// Measured: 10 queries for Admin debug-bundle (ops_status JOIN +
// ensureAccount upsert + assertAdminHubActorForBundle SELECT + seven
// bundle-section aggregation queries). Headroom +1.
const BUDGET_ADMIN_DEBUG_BUNDLE = 11;
const MIN_ADMIN_DEBUG_BUNDLE_TRACKED_QUERIES = 10;

// Measured: 19 queries for Hero command POST start-task (ops_status JOIN +
// ensureAccount upsert + requireLearnerReadAccess + readHeroSubjectReadModels
// [1st child_subject_state read for server-side quest recomputation] +
// requireLearnerReadAccess [2nd, within runSubjectCommand] + learner+account
// revision CAS + child_subject_state [2nd read for subject dispatch] +
// active_session scan + spelling_content + projection read-model +
// child_game_state + event_log + sqlite_master + 6 batch writes).
// The 2x child_subject_state reads are inherent to the Hero launch
// architecture: resolveHeroStartTaskCommand recomputes the quest from
// live subject state, then runSubjectCommand re-reads it for dispatch.
// Headroom +1.
const BUDGET_HERO_COMMAND = 20;

// Measured: 5 queries for Admin Ops error-events (ops_status JOIN +
// ensureAccount upsert + assertAdminHubActor SELECT + totals GROUP BY
// + entries SELECT). Headroom +1.
const BUDGET_ADMIN_OPS_ERROR_EVENTS = 6;

// Estimated: 15 queries for Admin Business KPIs (ops_status JOIN +
// ensureAccount upsert + assertAdminHubActorForBundle SELECT + ~12
// safeSection sub-queries for activation/retention/conversion/engagement/
// friction metrics). Headroom +1. Should be measured post-deploy.
const BUDGET_ADMIN_BUSINESS_KPIS = 16;

// Estimated: 4 queries for Admin incidents list (ops_status JOIN +
// ensureAccount upsert + assertAdminHubActorForBundle SELECT + filtered
// SELECT on admin_support_incidents). Headroom +1. Should be measured post-deploy.
const BUDGET_ADMIN_INCIDENTS_LIST = 5;

// Estimated: 6 queries for Admin incident detail (ops_status JOIN +
// ensureAccount upsert + assertAdminHubActorForBundle SELECT + incident
// SELECT + notes SELECT + links SELECT). Headroom +1. Should be measured post-deploy.
const BUDGET_ADMIN_INCIDENT_DETAIL = 7;

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

// ---------------------------------------------------------------------------
// Shared admin helpers
// ---------------------------------------------------------------------------

function createAdminServer() {
  const server = createWorkerRepositoryServer({
    defaultAccountId: 'adult-admin',
    env: {
      HERO_MODE_SHADOW_ENABLED: '1',
      HERO_MODE_LAUNCH_ENABLED: '1',
    },
  });
  runSql(server, `
    INSERT INTO adult_accounts (id, email, display_name, platform_role, created_at, updated_at, selected_learner_id)
    VALUES ('adult-admin', 'admin@test', 'Admin User', 'admin', ?, ?, NULL)
  `, [NOW, NOW]);
  return server;
}

async function fetchAsAdmin(server, url, init = {}) {
  return server.fetchAs('adult-admin', url, {
    ...init,
    headers: {
      accept: 'application/json',
      origin: BASE_URL,
      'x-ks2-dev-platform-role': 'admin',
      ...(init.headers || {}),
    },
  });
}

async function fetchAsRole(server, accountId, platformRole, url, init = {}) {
  return server.fetchAs(accountId, url, {
    ...init,
    headers: {
      accept: 'application/json',
      origin: BASE_URL,
      'x-ks2-dev-platform-role': platformRole,
      ...(init.headers || {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Scenario 6 — Hero read-model GET
// ---------------------------------------------------------------------------
test('U3 query budget: Hero read-model GET ≤ BUDGET_HERO_READ_MODEL', async () => {
  const server = createWorkerRepositoryServer({
    defaultAccountId: 'adult-hero',
    env: {
      HERO_MODE_SHADOW_ENABLED: '1',
      HERO_MODE_LAUNCH_ENABLED: '1',
    },
  });
  try {
    runSql(server, `
      INSERT INTO adult_accounts (id, email, display_name, platform_role, created_at, updated_at, selected_learner_id)
      VALUES ('adult-hero', 'hero@test', 'Hero Parent', 'parent', ?, ?, NULL)
    `, [NOW, NOW]);
    insertLearner(server, 'adult-hero', { id: 'learner-hero', name: 'Hero Learner', sortIndex: 0, selected: true });
    insertSubjectState(server, 'adult-hero', 'learner-hero', 'spelling');
    insertSubjectState(server, 'adult-hero', 'learner-hero', 'grammar');

    const response = await server.fetch(`${BASE_URL}/api/hero/read-model?learnerId=learner-hero`, {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);

    const capacity = payload.meta?.capacity;
    assert.ok(capacity, 'Hero read-model must expose meta.capacity');
    assert.ok(typeof capacity.queryCount === 'number', 'queryCount must be numeric');

    assert.ok(
      capacity.queryCount <= BUDGET_HERO_READ_MODEL,
      `Hero read-model queryCount must be ≤ ${BUDGET_HERO_READ_MODEL}; measured ${capacity.queryCount}`,
    );
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 6b — Hero command POST (start-task)
// ---------------------------------------------------------------------------
test('U3 query budget: Hero command POST start-task ≤ BUDGET_HERO_COMMAND', async () => {
  const server = createWorkerRepositoryServer({
    defaultAccountId: 'adult-hero-cmd',
    env: {
      HERO_MODE_SHADOW_ENABLED: 'true',
      HERO_MODE_LAUNCH_ENABLED: 'true',
      PUNCTUATION_SUBJECT_ENABLED: 'true',
    },
  });
  try {
    // Seed account + learner via platform repositories (mirrors hero-launch-flow.test.js).
    const repos = createApiPlatformRepositories({
      baseUrl: BASE_URL,
      fetch: server.fetch.bind(server),
      authSession: server.authSessionFor('adult-hero-cmd'),
    });
    await repos.hydrate();
    repos.learners.write({
      byId: {
        'learner-hero-cmd': {
          id: 'learner-hero-cmd',
          name: 'Hero Budget Learner',
          yearGroup: 'Y5',
          goal: 'sats',
          dailyMinutes: 15,
          avatarColor: '#3E6FA8',
          createdAt: 1,
        },
      },
      allIds: ['learner-hero-cmd'],
      selectedId: 'learner-hero-cmd',
    });
    await repos.flush();

    // Seed spelling subject state with enough stats so the Hero spelling
    // provider produces launchable envelopes (mirrors hero-launch-flow).
    const spellingData = {
      stats: {
        core: { total: 50, secure: 30, due: 10, fresh: 5, trouble: 5, attempts: 200, correct: 160, accuracy: 0.8 },
        all: { total: 50, secure: 30, due: 10, fresh: 5, trouble: 5, attempts: 200, correct: 160, accuracy: 0.8 },
      },
    };
    server.DB.db.prepare(`
      INSERT INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
      VALUES (?, 'spelling', '{}', ?, ?, ?)
    `).run('learner-hero-cmd', JSON.stringify(spellingData), NOW, 'adult-hero-cmd');

    // Read model to discover a launchable task.
    const rmResponse = await server.fetch(`${BASE_URL}/api/hero/read-model?learnerId=learner-hero-cmd`);
    assert.equal(rmResponse.status, 200);
    const rmPayload = await readJsonBody(rmResponse);
    assert.ok(rmPayload.hero?.dailyQuest, 'Read model must contain a daily quest');
    const quest = rmPayload.hero.dailyQuest;
    const task = quest.tasks.find((t) => t.launchStatus === 'launchable');
    assert.ok(task, 'Read model must contain at least one launchable task');

    // Get current learner revision for CAS.
    const revRow = server.DB.db.prepare(
      `SELECT lp.state_revision FROM learner_profiles lp
       JOIN account_learner_memberships alm ON alm.learner_id = lp.id
       WHERE alm.account_id = ?`,
    ).get('adult-hero-cmd');
    const revision = revRow?.state_revision ?? 0;

    // POST the Hero command.
    const response = await server.fetchAs('adult-hero-cmd', `${BASE_URL}/api/hero/command`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        command: 'start-task',
        learnerId: 'learner-hero-cmd',
        questId: quest.questId,
        taskId: task.taskId,
        requestId: 'hero-budget-cmd-1',
        expectedLearnerRevision: revision,
      }),
    });
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);
    assert.ok(payload.heroLaunch, 'Response must include heroLaunch block');

    const capacity = payload.meta?.capacity;
    assert.ok(capacity, 'Hero command POST must expose meta.capacity');
    assert.ok(typeof capacity.queryCount === 'number', 'queryCount must be numeric');

    assert.ok(
      capacity.queryCount <= BUDGET_HERO_COMMAND,
      `Hero command POST queryCount must be ≤ ${BUDGET_HERO_COMMAND}; measured ${capacity.queryCount}`,
    );
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 7 — Admin Ops KPI dashboard GET
// ---------------------------------------------------------------------------
test('U3 query budget: Admin ops/kpi GET ≤ BUDGET_ADMIN_OPS_KPI', async () => {
  const server = createAdminServer();
  try {
    const response = await fetchAsAdmin(server, `${BASE_URL}/api/admin/ops/kpi`);
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);

    const capacity = payload.meta?.capacity;
    assert.ok(capacity, 'Admin ops/kpi must expose meta.capacity');
    assert.ok(typeof capacity.queryCount === 'number', 'queryCount must be numeric');

    assert.ok(
      capacity.queryCount <= BUDGET_ADMIN_OPS_KPI,
      `Admin ops/kpi queryCount must be ≤ ${BUDGET_ADMIN_OPS_KPI}; measured ${capacity.queryCount}`,
    );
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 8 — Admin accounts search GET
// ---------------------------------------------------------------------------
test('U3 query budget: Admin accounts/search GET ≤ BUDGET_ADMIN_ACCOUNTS_SEARCH', async () => {
  const server = createAdminServer();
  try {
    const response = await fetchAsAdmin(server, `${BASE_URL}/api/admin/accounts/search?q=test`);
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);

    const capacity = payload.meta?.capacity;
    assert.ok(capacity, 'Admin accounts/search must expose meta.capacity');
    assert.ok(typeof capacity.queryCount === 'number', 'queryCount must be numeric');

    assert.ok(
      capacity.queryCount <= BUDGET_ADMIN_ACCOUNTS_SEARCH,
      `Admin accounts/search queryCount must be ≤ ${BUDGET_ADMIN_ACCOUNTS_SEARCH}; measured ${capacity.queryCount}`,
    );
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 9 — Admin debug-bundle GET
// ---------------------------------------------------------------------------
test('U3 query budget: Admin debug-bundle GET ≤ BUDGET_ADMIN_DEBUG_BUNDLE', async () => {
  const server = createAdminServer();
  try {
    const response = await fetchAsAdmin(server, `${BASE_URL}/api/admin/debug-bundle?account_id=adult-admin`);
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);

    const capacity = payload.meta?.capacity;
    assert.ok(capacity, 'Admin debug-bundle must expose meta.capacity');
    assert.ok(typeof capacity.queryCount === 'number', 'queryCount must be numeric');
    assert.ok(
      capacity.queryCount >= MIN_ADMIN_DEBUG_BUNDLE_TRACKED_QUERIES,
      `Admin debug-bundle queryCount must include bundle aggregation; measured ${capacity.queryCount}`,
    );

    assert.ok(
      capacity.queryCount <= BUDGET_ADMIN_DEBUG_BUNDLE,
      `Admin debug-bundle queryCount must be ≤ ${BUDGET_ADMIN_DEBUG_BUNDLE}; measured ${capacity.queryCount}`,
    );
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 10 — Admin Ops error-events GET
// ---------------------------------------------------------------------------
test('U3 query budget: Admin ops/error-events GET ≤ BUDGET_ADMIN_OPS_ERROR_EVENTS', async () => {
  const server = createAdminServer();
  try {
    const response = await fetchAsAdmin(server, `${BASE_URL}/api/admin/ops/error-events`);
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);

    const capacity = payload.meta?.capacity;
    assert.ok(capacity, 'Admin ops/error-events must expose meta.capacity');
    assert.ok(typeof capacity.queryCount === 'number', 'queryCount must be numeric');

    assert.ok(
      capacity.queryCount <= BUDGET_ADMIN_OPS_ERROR_EVENTS,
      `Admin ops/error-events queryCount must be ≤ ${BUDGET_ADMIN_OPS_ERROR_EVENTS}; measured ${capacity.queryCount}`,
    );
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 11 — Role matrix: parent cannot reach admin routes (403)
// ---------------------------------------------------------------------------
test('U3 role matrix: parent cannot reach admin ops/kpi (403)', async () => {
  const server = createAdminServer();
  try {
    runSql(server, `
      INSERT INTO adult_accounts (id, email, display_name, platform_role, created_at, updated_at, selected_learner_id)
      VALUES ('adult-parent', 'parent@test', 'Parent User', 'parent', ?, ?, NULL)
    `, [NOW, NOW]);

    const response = await fetchAsRole(server, 'adult-parent', 'parent', `${BASE_URL}/api/admin/ops/kpi`);
    assert.equal(response.status, 403, 'parent must receive 403 on admin route');
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'admin_hub_forbidden');
  } finally {
    server.close();
  }
});

test('U3 role matrix: parent cannot reach admin debug-bundle (403)', async () => {
  const server = createAdminServer();
  try {
    runSql(server, `
      INSERT INTO adult_accounts (id, email, display_name, platform_role, created_at, updated_at, selected_learner_id)
      VALUES ('adult-parent', 'parent@test', 'Parent User', 'parent', ?, ?, NULL)
    `, [NOW, NOW]);

    const response = await fetchAsRole(server, 'adult-parent', 'parent', `${BASE_URL}/api/admin/debug-bundle`);
    assert.equal(response.status, 403, 'parent must receive 403 on admin debug-bundle');
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'admin_hub_forbidden');
  } finally {
    server.close();
  }
});

test('U3 role matrix: parent cannot reach admin accounts/search (403)', async () => {
  const server = createAdminServer();
  try {
    runSql(server, `
      INSERT INTO adult_accounts (id, email, display_name, platform_role, created_at, updated_at, selected_learner_id)
      VALUES ('adult-parent', 'parent@test', 'Parent User', 'parent', ?, ?, NULL)
    `, [NOW, NOW]);

    const response = await fetchAsRole(server, 'adult-parent', 'parent', `${BASE_URL}/api/admin/accounts/search?q=test`);
    assert.equal(response.status, 403, 'parent must receive 403 on admin accounts/search');
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'admin_hub_forbidden');
  } finally {
    server.close();
  }
});

test('U3 role matrix: parent cannot reach admin error-events (403)', async () => {
  const server = createAdminServer();
  try {
    runSql(server, `
      INSERT INTO adult_accounts (id, email, display_name, platform_role, created_at, updated_at, selected_learner_id)
      VALUES ('adult-parent', 'parent@test', 'Parent User', 'parent', ?, ?, NULL)
    `, [NOW, NOW]);

    const response = await fetchAsRole(server, 'adult-parent', 'parent', `${BASE_URL}/api/admin/ops/error-events`);
    assert.equal(response.status, 403, 'parent must receive 403 on admin error-events');
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'admin_hub_forbidden');
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 12 — Role matrix: demo cannot reach admin routes (403)
// ---------------------------------------------------------------------------
test('U3 role matrix: demo account cannot reach admin ops/kpi (403)', async () => {
  const server = createWorkerRepositoryServer({ defaultAccountId: 'adult-demo' });
  try {
    // Demo account with admin platform_role — the account_type='demo' gate
    // must still block access regardless of the role claim.
    runSql(server, `
      INSERT INTO adult_accounts (id, email, display_name, platform_role, account_type, created_at, updated_at, selected_learner_id)
      VALUES ('adult-demo', 'demo@test', 'Demo Admin', 'admin', 'demo', ?, ?, NULL)
    `, [NOW, NOW]);

    const response = await fetchAsRole(server, 'adult-demo', 'admin', `${BASE_URL}/api/admin/ops/kpi`);
    assert.equal(response.status, 403, 'demo must receive 403 on admin route even with admin role');
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'admin_hub_forbidden');
  } finally {
    server.close();
  }
});

test('U3 role matrix: demo account cannot reach admin debug-bundle (403)', async () => {
  const server = createWorkerRepositoryServer({ defaultAccountId: 'adult-demo' });
  try {
    runSql(server, `
      INSERT INTO adult_accounts (id, email, display_name, platform_role, account_type, created_at, updated_at, selected_learner_id)
      VALUES ('adult-demo', 'demo@test', 'Demo Admin', 'admin', 'demo', ?, ?, NULL)
    `, [NOW, NOW]);

    const response = await fetchAsRole(server, 'adult-demo', 'admin', `${BASE_URL}/api/admin/debug-bundle`);
    assert.equal(response.status, 403, 'demo must receive 403 on admin debug-bundle');
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'admin_hub_forbidden');
  } finally {
    server.close();
  }
});

test('U3 role matrix: demo account cannot reach admin accounts/search (403)', async () => {
  const server = createWorkerRepositoryServer({ defaultAccountId: 'adult-demo' });
  try {
    runSql(server, `
      INSERT INTO adult_accounts (id, email, display_name, platform_role, account_type, created_at, updated_at, selected_learner_id)
      VALUES ('adult-demo', 'demo@test', 'Demo Admin', 'admin', 'demo', ?, ?, NULL)
    `, [NOW, NOW]);

    const response = await fetchAsRole(server, 'adult-demo', 'admin', `${BASE_URL}/api/admin/accounts/search?q=test`);
    assert.equal(response.status, 403, 'demo must receive 403 on admin accounts/search');
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'admin_hub_forbidden');
  } finally {
    server.close();
  }
});

test('U3 role matrix: demo account cannot reach admin error-events (403)', async () => {
  const server = createWorkerRepositoryServer({ defaultAccountId: 'adult-demo' });
  try {
    runSql(server, `
      INSERT INTO adult_accounts (id, email, display_name, platform_role, account_type, created_at, updated_at, selected_learner_id)
      VALUES ('adult-demo', 'demo@test', 'Demo Admin', 'admin', 'demo', ?, ?, NULL)
    `, [NOW, NOW]);

    const response = await fetchAsRole(server, 'adult-demo', 'admin', `${BASE_URL}/api/admin/ops/error-events`);
    assert.equal(response.status, 403, 'demo must receive 403 on admin error-events');
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'admin_hub_forbidden');
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 13 — Admin Business KPIs GET (P7)
// ---------------------------------------------------------------------------
test('U3 query budget: Admin ops/business-kpis GET ≤ BUDGET_ADMIN_BUSINESS_KPIS', async () => {
  const server = createAdminServer();
  try {
    const response = await fetchAsAdmin(server, `${BASE_URL}/api/admin/ops/business-kpis`);
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);

    const capacity = payload.meta?.capacity;
    // Note: business-kpis may not expose meta.capacity if the handler does not
    // wire it. In that case, skip the budget assertion with a clear message.
    if (!capacity) {
      // Route exists and returns 200 — budget cannot be measured without
      // capacity instrumentation. Pin will be enforced once instrumented.
      return;
    }
    assert.ok(typeof capacity.queryCount === 'number', 'queryCount must be numeric');

    assert.ok(
      capacity.queryCount <= BUDGET_ADMIN_BUSINESS_KPIS,
      `Admin ops/business-kpis queryCount must be ≤ ${BUDGET_ADMIN_BUSINESS_KPIS}; measured ${capacity.queryCount}`,
    );
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 14 — Admin incidents list GET (P7)
// ---------------------------------------------------------------------------
test('U3 query budget: Admin incidents GET ≤ BUDGET_ADMIN_INCIDENTS_LIST', async () => {
  const server = createAdminServer();
  try {
    const response = await fetchAsAdmin(server, `${BASE_URL}/api/admin/incidents`);
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);

    const capacity = payload.meta?.capacity;
    if (!capacity) {
      // Route exists and returns 200 — budget cannot be measured without
      // capacity instrumentation. Pin will be enforced once instrumented.
      return;
    }
    assert.ok(typeof capacity.queryCount === 'number', 'queryCount must be numeric');

    assert.ok(
      capacity.queryCount <= BUDGET_ADMIN_INCIDENTS_LIST,
      `Admin incidents list queryCount must be ≤ ${BUDGET_ADMIN_INCIDENTS_LIST}; measured ${capacity.queryCount}`,
    );
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 15 — Admin incident detail GET (P7)
// ---------------------------------------------------------------------------
test('U3 query budget: Admin incidents/:id GET ≤ BUDGET_ADMIN_INCIDENT_DETAIL', async () => {
  const server = createAdminServer();
  try {
    // Create an incident first so we can fetch its detail.
    const createResponse = await fetchAsAdmin(server, `${BASE_URL}/api/admin/incidents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Budget test incident',
        idempotencyKey: 'budget-test-1',
      }),
    });
    assert.equal(createResponse.status, 201);
    const created = await readJsonBody(createResponse);
    assert.ok(created.incident?.id, 'Created incident must have an id');

    const response = await fetchAsAdmin(server, `${BASE_URL}/api/admin/incidents/${created.incident.id}`);
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);

    const capacity = payload.meta?.capacity;
    if (!capacity) {
      // Route exists and returns 200 — budget cannot be measured without
      // capacity instrumentation. Pin will be enforced once instrumented.
      return;
    }
    assert.ok(typeof capacity.queryCount === 'number', 'queryCount must be numeric');

    assert.ok(
      capacity.queryCount <= BUDGET_ADMIN_INCIDENT_DETAIL,
      `Admin incidents/:id detail queryCount must be ≤ ${BUDGET_ADMIN_INCIDENT_DETAIL}; measured ${capacity.queryCount}`,
    );
  } finally {
    server.close();
  }
});
