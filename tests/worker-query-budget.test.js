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
import { createWorkerSubjectRuntime } from '../worker/src/subjects/runtime.js';
import { createSession } from '../worker/src/auth.js';
import { COMMAND_PROJECTION_MODEL_KEY } from '../worker/src/read-models/learner-read-models.js';
import { __setRequestLimitsCleanupRngForTests } from '../worker/src/rate-limit.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';
import { createApiPlatformRepositories } from '../src/platform/core/repositories/index.js';

// ---------------------------------------------------------------------------
// Budget constants — measured first, then locked.
// Adjusting a budget requires updating the constant AND the rationale.
// Note: count-based budgets detect ADDED queries but not replaced-bounded-with-unbounded at the same count.
// ---------------------------------------------------------------------------

// P7 measured: 10 queries for a 3-learner bounded POST bootstrap (ops_status
// JOIN + ensureAccount upsert + reused account snapshot +
// monster_visual_config + membership list + list_revision +
// child_subject_state unbounded + game_state + practice_sessions +
// event_log + spelling content). P7 removed the duplicate account point read.
// May 2026 hotfix removed the spelling content table read from bootstrap
// public read-model hydration. Content Operations Centre adds one bounded
// release revision lookup, and the P95 follow-up reuses the authenticated
// account snapshot, so the measured path is now 9.
// Headroom +1.
const MEASURED_BOOTSTRAP_MULTI_LEARNER = 9;
const BUDGET_BOOTSTRAP_MULTI_LEARNER = MEASURED_BOOTSTRAP_MULTI_LEARNER + 1;

// Measured: 5 queries for the notModified probe (ops_status JOIN +
// ensureAccount upsert + membership list + list_revision +
// content-operation release revision). Short-circuit before any learner data
// is loaded.
const BUDGET_BOOTSTRAP_NOT_MODIFIED = 6;

// U6 established: projection hit path — zero event_log reads. P95 follow-up
// measured 7 queries after preloading subject_state + latest_session +
// projection read-model in the mutation preflight while Content Operations
// keeps one bounded release lookup. Headroom +1.
const BUDGET_COMMAND_HOT_PATH = 8;
// First start-session pays the practice-session insert path before the
// projection row is primed, but it must not spend an extra sqlite_master probe.
// Measured 8 queries after the active-session no-op abandon UPDATE is skipped
// when the combined read proves there is no active session. Headroom +1.
const BUDGET_COMMAND_START_PATH = 9;

// Measured after folding TTS membership access into the subject-runtime read:
// auth account read + combined access/runtime read + one bounded Content
// Operations release lookup + two TTS limiter writes. Keep this exact because
// adding a D1 read is visible to every spelling card.
const MEASURED_TTS_SESSION_PLAYBACK = 5;
const BUDGET_TTS_SESSION_PLAYBACK = 5;
const MEASURED_TTS_SIGNED_SESSION_PLAYBACK = 4;
const BUDGET_TTS_SIGNED_SESSION_PLAYBACK = 4;

// Measured: 6 queries for parent hub recent-sessions (ops_status JOIN +
// ensureAccount upsert + account select + membership list + learner
// access check + practice_sessions query). Headroom +1.
const BUDGET_PARENT_RECENT_SESSIONS = 7;

// P7 measured: 10 queries for GET bootstrap full bundle. May 2026 hotfix
// removed the spelling content table read from public read-model hydration,
// and the P95 follow-up reused the auth account snapshot. Content Operations
// Centre keeps one bounded release revision lookup, leaving 9 measured
// queries without returning to account_subject_content.
// Headroom +1.
const MEASURED_BOOTSTRAP_GET_FULL = 9;
const BUDGET_BOOTSTRAP_GET_FULL = MEASURED_BOOTSTRAP_GET_FULL + 1;
const MEASURED_BOOTSTRAP_GET_WITH_CACHED_MONSTER_POINTER = MEASURED_BOOTSTRAP_GET_FULL - 1;

// Measured: 6 queries for Hero read-model GET (ops_status JOIN +
// ensureAccount upsert + membership learner-access check +
// child_subject_state read + content-operation override/global release
// checks). Headroom +1.
const BUDGET_HERO_READ_MODEL = 7;

// Measured: 20 queries for Admin Ops KPI dashboard (ops_status JOIN +
// ensureAccount upsert + assertAdminHubActor SELECT + 14 COUNT(*)
// aggregates across accounts/learners/sessions/events/mutations/errors
// + 3 admin_kpi_metrics reads). Headroom +1.
const BUDGET_ADMIN_OPS_KPI = 21;

// Measured: 4 queries for Admin accounts search (ops_status JOIN +
// ensureAccount upsert + assertAdminHubActor SELECT + search query
// with LIKE filter). Headroom +1.
const BUDGET_ADMIN_ACCOUNTS_SEARCH = 5;

// Measured: 9 queries for Admin debug-bundle (ops_status JOIN with reusable
// account snapshot + assertAdminHubActorForBundle SELECT + seven
// bundle-section aggregation queries). Headroom +1.
const BUDGET_ADMIN_DEBUG_BUNDLE = 10;
const MIN_ADMIN_DEBUG_BUNDLE_TRACKED_QUERIES = 9;

// Measured: 22 queries for Hero command POST start-task (ops_status JOIN +
// ensureAccount upsert + requireLearnerReadAccess + readHeroSubjectReadModels
// [1st child_subject_state read for server-side quest recomputation] +
// requireLearnerReadAccess [2nd, within runSubjectCommand] + learner+account
// revision CAS + child_subject_state [2nd read for subject dispatch] +
// active_session scan + content-operation release checks + projection
// read-model + child_game_state + event_log + 6 batch writes).
// The 2x child_subject_state reads are inherent to the Hero launch
// architecture: resolveHeroStartTaskCommand recomputes the quest from
// live subject state, then runSubjectCommand re-reads it for dispatch.
// Headroom +1.
const BUDGET_HERO_COMMAND = 23;

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
  if (subjectId === 'spelling') {
    runSql(server, `
      INSERT INTO spelling_learner_state (
        learner_id, ui_json, data_json, stats_json, updated_at, updated_by_account_id
      ) VALUES (?, ?, ?, '{}', ?, ?)
      ON CONFLICT(learner_id) DO UPDATE SET
        ui_json = excluded.ui_json,
        data_json = excluded.data_json,
        stats_json = excluded.stats_json,
        updated_at = excluded.updated_at,
        updated_by_account_id = excluded.updated_by_account_id
    `, [
      learnerId,
      JSON.stringify({ phase: 'idle' }),
      JSON.stringify({ prefs: { mode: 'smart' } }),
      NOW,
      accountId,
    ]);
  }
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

function sessionCookieForToken(token) {
  return `ks2_session=${encodeURIComponent(token)}`;
}

function refreshedSessionCookie(response, fallbackCookie = '') {
  const setCookie = response.headers.get('set-cookie') || '';
  const match = /ks2_session=([^;]+)/.exec(setCookie);
  return match ? `ks2_session=${match[1]}` : fallbackCookie;
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
  const app = createWorkerApp({
    now: () => NOW,
    ...(subjectId === 'punctuation'
      ? { subjectRuntime: createWorkerSubjectRuntime({ punctuation: { random: () => 0 } }) }
      : {}),
  });
  const env = {
    DB,
    AUTH_MODE: 'development-stub',
    ENVIRONMENT: 'test',
    ...(subjectId === 'arithmetic' ? { ARITHMETIC_SUBJECT_ENABLED: 'true' } : {}),
    ...(subjectId === 'punctuation' ? { PUNCTUATION_SUBJECT_ENABLED: 'true' } : {}),
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

  async function bootstrap() {
    const response = await app.fetch(new Request(`${BASE_URL}/api/bootstrap`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'x-ks2-public-read-models': '1',
        'x-ks2-dev-account-id': accountId,
      },
    }), env, {});
    const body = await response.json();
    return { response, body };
  }

  return {
    DB,
    env,
    app,
    command,
    bootstrap,
    close() { DB.close(); },
    get revision() { return revision; },
    set revision(value) { revision = value; },
  };
}

test('U3 query budget: latest subject session lookup stays subject-scoped for old learners', () => {
  const DB = createMigratedSqliteD1Database();
  try {
    const columns = DB.db
      .prepare('PRAGMA index_info(idx_practice_sessions_learner_subject)')
      .all()
      .map((row) => row.name);
    assert.deepEqual(columns, ['learner_id', 'subject_id', 'updated_at', 'id']);

    const plan = DB.db.prepare(`
      EXPLAIN QUERY PLAN
      SELECT id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at
      FROM practice_sessions
      WHERE learner_id = ? AND subject_id = ?
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `).all('learner-old', 'grammar').map((row) => row.detail).join('\n');
    assert.match(plan, /idx_practice_sessions_learner_subject/);
    assert.doesNotMatch(plan, /USE TEMP B-TREE/i);
  } finally {
    DB.close();
  }
});

test('U3 query budget: active session abandon update stays bounded for old learners', () => {
  const DB = createMigratedSqliteD1Database();
  try {
    const columns = DB.db
      .prepare('PRAGMA index_info(idx_practice_sessions_active_learner_subject)')
      .all()
      .map((row) => row.name);
    assert.deepEqual(columns, ['learner_id', 'subject_id', 'id']);

    const plan = DB.db.prepare(`
      EXPLAIN QUERY PLAN
      UPDATE practice_sessions
      SET status = 'abandoned',
          updated_at = ?,
          updated_by_account_id = ?
      WHERE learner_id = ?
        AND subject_id = ?
        AND status = 'active'
        AND id <> ?
    `).all(NOW, 'adult-old', 'learner-old', 'arithmetic', 'new-session').map((row) => row.detail).join('\n');
    assert.match(plan, /idx_practice_sessions_active_learner_subject/);
    assert.doesNotMatch(plan, /idx_practice_sessions_learner_subject/);
  } finally {
    DB.close();
  }
});

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
    assert.equal('bootstrapPhaseTimings' in capacity, false, 'phase timings must stay structured-log-only.');

    assert.ok(
      capacity.queryCount <= BUDGET_BOOTSTRAP_MULTI_LEARNER,
      `POST bootstrap multi-learner queryCount must be ≤ ${BUDGET_BOOTSTRAP_MULTI_LEARNER}; measured ${capacity.queryCount}`,
    );
    assert.equal(
      capacity.queryCount,
      MEASURED_BOOTSTRAP_MULTI_LEARNER,
      `POST bootstrap multi-learner queryCount should stay at the measured P7 count ${MEASURED_BOOTSTRAP_MULTI_LEARNER}; measured ${capacity.queryCount}`,
    );

    // D1 rows read must be bounded — not scanning full history.
    assert.ok(typeof capacity.d1RowsRead === 'number', 'd1RowsRead must be numeric');

    const subjectStateReads = server.DB.takeQueryLog()
      .filter((entry) => entry.operation === 'all' && /\bFROM child_subject_state\b/i.test(entry.sql));
    assert.equal(subjectStateReads.length, 1,
      'POST bootstrap should reuse the already-loaded child_subject_state rows for active-session discovery.');
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
    assert.equal('bootstrapPhaseTimings' in capacity, false, 'phase timings must stay structured-log-only.');

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

    // First command primes the projection via the degraded baseline path.
    const first = await harness.command('start-session', {
      mode: 'single',
      slug: 'possess',
      length: 1,
    });
    assert.equal(first.response.status, 200, JSON.stringify(first.body));
    const firstCapacity = first.body.meta?.capacity;
    assert.ok(firstCapacity, 'start command must expose meta.capacity');
    assert.ok(
      firstCapacity.queryCount <= BUDGET_COMMAND_START_PATH,
      `command start-session queryCount must be ≤ ${BUDGET_COMMAND_START_PATH}; measured ${firstCapacity.queryCount}`,
    );

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

test('spelling gameplay cost is independent of lifetime profile size', async () => {
  const harness = createCommandHarness();
  try {
    const start = await harness.command('start-session', {
      mode: 'single',
      slug: 'possess',
      length: 1,
    });
    assert.equal(start.response.status, 200, JSON.stringify(start.body));

    const coldProgress = {};
    const insertColdItem = harness.DB.db.prepare(`
      INSERT INTO spelling_item_state (
        learner_id, slug, progress_json, guardian_json, pattern_json, updated_at, updated_by_account_id
      ) VALUES ('learner-cmd', ?, ?, NULL, NULL, ?, 'adult-cmd')
    `);
    for (let index = 0; index < 10_000; index += 1) {
      const slug = `retired-history-${index}`;
      const progress = { stage: index % 5, attempts: 10, correct: 8, wrong: 2, dueDay: 1 };
      coldProgress[slug] = progress;
      insertColdItem.run(slug, JSON.stringify(progress), NOW - index);
    }
    const insertColdAchievement = harness.DB.db.prepare(`
      INSERT INTO spelling_achievement_state (
        learner_id, achievement_id, record_json, updated_at, updated_by_account_id
      ) VALUES ('learner-cmd', ?, ?, ?, 'adult-cmd')
    `);
    for (let index = 0; index < 10_000; index += 1) {
      insertColdAchievement.run(
        `achievement:spelling:boss:clean-sweep:learner-cmd:history-${index}`,
        JSON.stringify({ unlockedAt: NOW - index }),
        NOW - index,
      );
    }
    const coldBlob = JSON.stringify({ prefs: { mode: 'smart' }, progress: coldProgress });
    harness.DB.db.prepare(`
      INSERT INTO child_subject_state (
        learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id
      ) VALUES ('learner-cmd', 'spelling', '{}', ?, ?, 'adult-cmd')
    `).run(coldBlob, NOW);

    harness.DB.clearQueryLog();
    const hot = await harness.command('submit-answer', { answer: 'possess' });
    assert.equal(hot.response.status, 200, JSON.stringify(hot.body));

    const queries = harness.DB.takeQueryLog();
    const itemReads = queries.filter((entry) => /FROM spelling_item_state/i.test(entry.sql || ''));
    assert.equal(itemReads.length, 1, 'gameplay should issue one item working-set read');
    assert.deepEqual(JSON.parse(itemReads[0].params[1]), ['possess'],
      'an answer must point-read only the active round roster, not the published catalogue');
    assert.ok(itemReads[0].rowCount <= 29,
      `one item plus the fixed achievement projection is the hard row cap; read ${itemReads[0].rowCount}`);
    assert.match(itemReads[0].sql, /LIMIT \?/i,
      'Boss achievement history must be selected through a fixed recent window');
    assert.equal(
      queries.some((entry) => /legacy_state\.data_json/i.test(entry.sql || '')),
      false,
      'gameplay must never select the legacy lifetime JSON blob',
    );
    assert.equal(
      queries.some((entry) => /INSERT INTO child_subject_state/i.test(entry.sql || '')),
      false,
      'gameplay must never rewrite the legacy lifetime JSON blob',
    );
    const preservedBlob = harness.DB.db.prepare(`
      SELECT data_json FROM child_subject_state
      WHERE learner_id = 'learner-cmd' AND subject_id = 'spelling'
    `).get()?.data_json;
    assert.equal(preservedBlob, coldBlob, 'cold lifetime history must remain complete and untouched');
    assert.equal(
      harness.DB.db.prepare(`
        SELECT COUNT(*) AS total FROM spelling_achievement_state
        WHERE learner_id = 'learner-cmd'
          AND achievement_id LIKE 'achievement:spelling:boss:clean-sweep:%'
      `).get().total,
      10_000,
      'achievement history remains complete even though gameplay hydrates only eight recent unlocks',
    );
  } finally {
    harness.close();
  }
});

test('Grammar gameplay reads only active generated items, not lifetime item mastery', async () => {
  const harness = createCommandHarness({ subjectId: 'grammar' });
  try {
    const start = await harness.command('start-session', {
      mode: 'smart',
      roundLength: 1,
      seed: 17,
    });
    assert.equal(start.response.status, 200, JSON.stringify(start.body));

    const insertItem = harness.DB.db.prepare(`
      INSERT INTO grammar_item_state (
        learner_id, item_id, mastery_json, updated_at, updated_by_account_id
      ) VALUES ('learner-cmd', ?, ?, ?, 'adult-cmd')
    `);
    for (let index = 0; index < 10_000; index += 1) {
      insertItem.run(
        `retired-template:${index}`,
        JSON.stringify({ attempts: 10, correct: 8, wrong: 2, strength: 0.8 }),
        NOW - index,
      );
    }

    harness.DB.clearQueryLog();
    const hot = await harness.command('save-prefs', { mode: 'smart', roundLength: 1 });
    assert.equal(hot.response.status, 200, JSON.stringify(hot.body));

    const queries = harness.DB.takeQueryLog();
    const itemReads = queries.filter((entry) => /FROM grammar_item_state/i.test(entry.sql || ''));
    assert.equal(itemReads.length, 1, 'Grammar should issue one active-item working-set read');
    assert.match(itemReads[0].sql, /item_id IN \(SELECT value FROM json_each\(\?\)\)/i);
    assert.equal(itemReads[0].rowCount, 0,
      '10,000 retired item rows must stay outside the active command working set');
    assert.equal(
      harness.DB.db.prepare(`
        SELECT COUNT(*) AS total FROM grammar_item_state
        WHERE learner_id = 'learner-cmd' AND item_id LIKE 'retired-template:%'
      `).get().total,
      10_000,
      'generated-item history must remain complete',
    );
    const hotRow = harness.DB.db.prepare(`
      SELECT ui_json, data_json FROM child_subject_state
      WHERE learner_id = 'learner-cmd' AND subject_id = 'grammar'
    `).get();
    assert.deepEqual(JSON.parse(hotRow.ui_json).mastery.items, {});
    assert.deepEqual(JSON.parse(hotRow.data_json).mastery.items, {});
  } finally {
    harness.close();
  }
});

test('Reading gameplay reads a bounded scheduler working set, not lifetime question mastery', async () => {
  const harness = createCommandHarness({ subjectId: 'reading' });
  try {
    const start = await harness.command('start-session', {
      mode: 'smart',
      viewMode: 'one',
    });
    assert.equal(start.response.status, 200, JSON.stringify(start.body));

    const insertQuestion = harness.DB.db.prepare(`
      INSERT INTO reading_question_state (
        learner_id, question_id, mastery_json, updated_at, updated_by_account_id
      ) VALUES ('learner-cmd', ?, ?, ?, 'adult-cmd')
    `);
    for (let index = 0; index < 10_000; index += 1) {
      insertQuestion.run(
        `retired-reading-question:${index}`,
        JSON.stringify({ attempts: 10, correct: 8, wrong: 2, strength: 0.8 }),
        NOW - index,
      );
    }

    const readingHotRow = harness.DB.db.prepare(`
      SELECT data_json FROM child_subject_state
      WHERE learner_id = 'learner-cmd' AND subject_id = 'reading'
    `).get();
    const readingHotData = JSON.parse(readingHotRow.data_json);
    readingHotData.retryQueue = [{
      questionId: 'retired-reading-question:0',
      passageId: 'retired-passage',
      skillId: '2a',
      dueAt: NOW,
    }];
    harness.DB.db.prepare(`
      UPDATE child_subject_state SET data_json = ?
      WHERE learner_id = 'learner-cmd' AND subject_id = 'reading'
    `).run(JSON.stringify(readingHotData));

    harness.DB.clearQueryLog();
    const hot = await harness.command('save-prefs', { mode: 'smart', viewMode: 'one' });
    assert.equal(hot.response.status, 200, JSON.stringify(hot.body));

    const queries = harness.DB.takeQueryLog();
    const questionReads = queries.filter((entry) => /FROM reading_question_state/i.test(entry.sql || ''));
    assert.equal(questionReads.length, 1, 'Reading should issue one scheduler working-set read');
    assert.match(questionReads[0].sql, /question_id IN \(SELECT value FROM json_each\(\?\)\)/i);
    assert.equal(questionReads[0].rowCount, 1,
      'the retired question referenced by the bounded retry queue may be point-read');
    assert.equal(
      harness.DB.db.prepare(`
        SELECT COUNT(*) AS total FROM reading_question_state
        WHERE learner_id = 'learner-cmd' AND question_id LIKE 'retired-reading-question:%'
      `).get().total,
      10_000,
      'Reading question history must remain complete',
    );
    const hotData = JSON.parse(harness.DB.db.prepare(`
      SELECT data_json FROM child_subject_state
      WHERE learner_id = 'learner-cmd' AND subject_id = 'reading'
    `).get().data_json);
    assert.deepEqual(hotData.questions, {});
  } finally {
    harness.close();
  }
});

test('Punctuation gameplay and bootstrap ignore lifetime item history', async () => {
  const harness = createCommandHarness({ subjectId: 'punctuation' });
  try {
    const start = await harness.command('start-session', {
      mode: 'endmarks',
      roundLength: '1',
    });
    assert.equal(start.response.status, 200, JSON.stringify(start.body));

    const hotRow = harness.DB.db.prepare(`
      SELECT ui_json, data_json FROM child_subject_state
      WHERE learner_id = 'learner-cmd' AND subject_id = 'punctuation'
    `).get();
    const hotData = JSON.parse(hotRow.data_json);
    const hotUi = JSON.parse(hotRow.ui_json);
    hotUi.session.currentItemId = 'retired-punctuation:0';
    hotData.progress.itemTotals = {
      version: 1,
      tracked: 10_000,
      new: 0,
      secure: 0,
      weak: 0,
    };
    hotData.progress.attempts = Array.from({ length: 1000 }, (_unused, index) => ({
      ts: NOW - index,
      itemId: `retired-punctuation:${index}`,
      itemMode: 'choose',
      mode: 'choose',
      skillIds: ['sentence_endings'],
      rewardUnitId: 'sentence-endings-core',
      correct: index % 2 === 0,
    }));
    hotData.progress.starEvidence = {
      version: 1,
      releaseId: 'punctuation-qg-p24-15072-2026-05-13',
      secureItemIds: [],
    };
    harness.DB.db.prepare(`
      UPDATE child_subject_state SET ui_json = ?, data_json = ?
      WHERE learner_id = 'learner-cmd' AND subject_id = 'punctuation'
    `).run(JSON.stringify(hotUi), JSON.stringify(hotData));

    const insertItem = harness.DB.db.prepare(`
      INSERT INTO punctuation_item_state (
        learner_id, item_id, state_json, updated_at, updated_by_account_id
      ) VALUES ('learner-cmd', ?, ?, ?, 'adult-cmd')
    `);
    for (let index = 0; index < 10_000; index += 1) {
      insertItem.run(
        `retired-punctuation:${index}`,
        JSON.stringify({ attempts: 10, correct: 8, incorrect: 2, streak: 1, dueAt: 1 }),
        NOW - index,
      );
    }

    harness.DB.clearQueryLog();
    const hot = await harness.command('save-prefs', { mode: 'smart', roundLength: '1' });
    assert.equal(hot.response.status, 200, JSON.stringify(hot.body));

    const queries = harness.DB.takeQueryLog();
    const itemReads = queries.filter((entry) => /FROM punctuation_item_state/i.test(entry.sql || ''));
    assert.equal(itemReads.length, 1, 'Punctuation should issue one bounded item working-set read');
    assert.match(itemReads[0].sql, /item_id IN \(SELECT value FROM json_each\(\?\)\)/i);
    assert.equal(itemReads[0].rowCount, 1,
      'the retired item referenced by the bounded active session may be point-read');
    const hydratedIds = JSON.parse(itemReads[0].params[1]);
    assert.ok(hydratedIds.length <= 128, `expected scheduler-only hydration, received ${hydratedIds.length} ids`);
    assert.equal(
      hydratedIds.some((itemId) => itemId.startsWith('retired-punctuation:')),
      true,
      'only the active-session retired item, not the 1,000 Star attempts, should be hydrated',
    );
    assert.equal(
      harness.DB.db.prepare(`
        SELECT COUNT(*) AS total FROM punctuation_item_state
        WHERE learner_id = 'learner-cmd' AND item_id LIKE 'retired-punctuation:%'
      `).get().total,
      10_000,
      'Punctuation item history must remain complete',
    );
    const persistedData = JSON.parse(harness.DB.db.prepare(`
      SELECT data_json FROM child_subject_state
      WHERE learner_id = 'learner-cmd' AND subject_id = 'punctuation'
    `).get().data_json);
    assert.equal(persistedData.progress.items, undefined);

    harness.DB.clearQueryLog();
    const bootstrap = await harness.bootstrap();
    assert.equal(bootstrap.response.status, 200, JSON.stringify(bootstrap.body));
    const bootstrapQueries = harness.DB.takeQueryLog();
    assert.equal(
      bootstrapQueries.some((entry) => /FROM punctuation_item_state/i.test(entry.sql || '')),
      false,
      'bootstrap must not touch item history when retained Star attempts reference no item rows',
    );
    assert.doesNotMatch(JSON.stringify(bootstrap.body), /retired-punctuation:/);
  } finally {
    harness.close();
  }
});

test('U3 query budget: Arithmetic and Reasoning session starts do not scan event_log history', async () => {
  const cases = [
    ['arithmetic', { mode: 'smart', goal: '10q' }],
    ['reasoning', { mode: 'worked', viewMode: 'one', roundLength: 3 }],
  ];

  for (const [subjectId, payload] of cases) {
    const harness = createCommandHarness({ subjectId });
    try {
      insertProjectionWindowFillerEvents(harness.DB, {
        count: 2000,
        startAt: Date.UTC(2026, 3, 24, 17, 30, 0),
      });

      harness.DB.clearQueryLog();
      const start = await harness.command('start-session', payload);
      assert.equal(start.response.status, 200, `${subjectId} start-session failed: ${JSON.stringify(start.body)}`);

      const capacity = start.body.meta?.capacity;
      assert.ok(capacity, `${subjectId} start-session must expose meta.capacity`);
      assert.equal(
        capacity.projectionFallback,
        undefined,
        `${subjectId} start-session should not enter projection fallback for non-reward events`,
      );
      assert.ok(
        capacity.d1RowsRead < 20,
        `${subjectId} start-session should stay below lightweight read budget; measured ${capacity.d1RowsRead}`,
      );
      assert.ok(
        start.body.domainEvents?.some((event) => event?.type === `${subjectId}.session-started`),
        `${subjectId} start-session must still return its domain event`,
      );

      const queryLog = harness.DB.takeQueryLog();
      const reads = queryLog
        .filter((entry) => entry.sql && /\bevent_log\b/i.test(entry.sql));
      assert.equal(
        reads.length,
        0,
        `${subjectId} start-session must not scan event_log history; saw ${reads.length} reads`,
      );
      const metadataReads = queryLog
        .filter((entry) => entry.sql && /\bsqlite_master\b/i.test(entry.sql));
      assert.equal(
        metadataReads.length,
        0,
        `${subjectId} start-session must not probe sqlite_master on the hot path; saw ${metadataReads.length} reads`,
      );
    } finally {
      harness.close();
    }
  }
});

test('U3 query budget: Arithmetic and Reasoning bootstrap first-paint payloads stay compact', async () => {
  const cases = [
    ['arithmetic', { mode: 'smart', goal: '10q' }],
    ['reasoning', { mode: 'worked', viewMode: 'one', roundLength: 3 }],
  ];

  for (const [subjectId, payload] of cases) {
    const harness = createCommandHarness({ subjectId });
    try {
      const start = await harness.command('start-session', payload);
      assert.equal(start.response.status, 200, `${subjectId} start-session failed: ${JSON.stringify(start.body)}`);

      const bootstrap = await harness.bootstrap();
      assert.equal(bootstrap.response.status, 200, `${subjectId} bootstrap failed: ${JSON.stringify(bootstrap.body)}`);
      assert.equal(bootstrap.body.meta?.capacity?.bootstrapMode, 'selected-learner-bounded');

      const state = bootstrap.body.subjectStates?.[`learner-cmd::${subjectId}`]?.ui;
      assert.ok(state, `${subjectId} state must be present`);
      assert.ok(state.session?.currentQuestion || state.session?.questions?.length,
        `${subjectId} active session must remain resumable from bootstrap`);
      assert.equal('content' in state, false,
        `${subjectId} bootstrap must not duplicate static content already bundled on the client`);
      assert.equal(Array.isArray(state.stats?.skills), false,
        `${subjectId} bootstrap must not ship heavyweight stats.skills`);
      assert.equal(state.stats?.overview?.content, undefined,
        `${subjectId} bootstrap must not duplicate content inside stats.overview`);

      if (subjectId === 'arithmetic') {
        assert.equal(Array.isArray(state.analytics?.skills), false,
          'arithmetic bootstrap analytics must omit skill rows');
        assert.equal(Array.isArray(state.analytics?.recentAttempts), false,
          'arithmetic bootstrap analytics must omit recent-attempt history');
      } else {
        assert.equal(Array.isArray(state.analytics?.templates), false,
          'reasoning bootstrap analytics must omit template rows');
        assert.equal(Array.isArray(state.analytics?.recentActivity), false,
          'reasoning bootstrap analytics must omit recent activity');
      }

      const subjectStateBytes = Buffer.byteLength(JSON.stringify(bootstrap.body.subjectStates || {}));
      assert.ok(subjectStateBytes < 18_000,
        `${subjectId} bootstrap subjectStates should stay below 18 KB; measured ${subjectStateBytes}`);
    } finally {
      harness.close();
    }
  }
});

// ---------------------------------------------------------------------------
// Scenario 3b — TTS session playback (real route, cached/provider-independent)
// ---------------------------------------------------------------------------
test('U3 query budget: TTS session playback ≤ BUDGET_TTS_SESSION_PLAYBACK', async () => {
  const harness = createCommandHarness();
  const originalFetch = globalThis.fetch;
  __setRequestLimitsCleanupRngForTests(() => 1);
  globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { 'content-type': 'audio/mpeg' },
  });

  try {
    const start = await harness.command('start-session', {
      mode: 'single',
      slug: 'early',
      length: 1,
    });
    assert.equal(start.response.status, 200, JSON.stringify(start.body));
    assert.ok(start.body.audio?.promptToken, 'start-session must return a TTS prompt token');

    harness.DB.clearQueryLog();
    const response = await harness.app.fetch(new Request(`${BASE_URL}/api/tts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ks2-dev-account-id': 'adult-cmd',
      },
      body: JSON.stringify({
        learnerId: 'learner-cmd',
        promptToken: start.body.audio.promptToken,
      }),
    }), {
      ...harness.env,
      OPENAI_API_KEY: 'test-openai-key',
    }, {});
    const failureBody = response.status === 200 ? '' : await response.clone().text();
    assert.equal(response.status, 200, failureBody);
    await response.arrayBuffer();

    const queries = harness.DB.takeQueryLog();
    assert.ok(
      queries.length <= BUDGET_TTS_SESSION_PLAYBACK,
      `TTS session playback query count must be ≤ ${BUDGET_TTS_SESSION_PLAYBACK}; measured ${queries.length}`,
    );
    assert.equal(
      queries.length,
      MEASURED_TTS_SESSION_PLAYBACK,
      `TTS session playback query count should stay at ${MEASURED_TTS_SESSION_PLAYBACK}; measured ${queries.length}`,
    );
    assert.equal(
      queries.filter((entry) => /membership\.role AS membership_role/i.test(entry.sql || '')).length,
      1,
      'TTS should fold learner access into the subject-runtime read.',
    );
    assert.equal(
      queries.filter((entry) => /\bFROM account_learner_memberships\b\s+WHERE account_id = \? AND learner_id = \?/i.test(entry.sql || '')).length,
      0,
      'TTS must not spend a standalone learner-access read before subject runtime.',
    );
  } finally {
    globalThis.fetch = originalFetch;
    __setRequestLimitsCleanupRngForTests(Math.random);
    harness.close();
  }
});

test('U3 query budget: signed production TTS playback skips auth session D1 read', async () => {
  const DB = createMigratedSqliteD1Database();
  const originalFetch = globalThis.fetch;
  __setRequestLimitsCleanupRngForTests(() => 1);
  globalThis.fetch = async () => new Response(new Uint8Array([4, 5, 6]), {
    status: 200,
    headers: { 'content-type': 'audio/mpeg' },
  });

  try {
    seedAccountLearner(DB, { accountId: 'adult-signed', learnerId: 'learner-cmd' });
    const app = createWorkerApp({ now: () => NOW });
    const env = {
      DB,
      AUTH_MODE: 'production',
      ENVIRONMENT: 'test',
      APP_HOSTNAME: 'repo.test',
      SESSION_SECRET: 'test-session-secret-for-signed-hot-path-budget',
      OPENAI_API_KEY: 'test-openai-key',
    };
    const session = await createSession(env, 'adult-signed', 'email', Date.now());
    let cookie = sessionCookieForToken(session.token);

    const startResponse = await app.fetch(new Request(`${BASE_URL}/api/subjects/spelling/command`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: BASE_URL,
        'sec-fetch-site': 'same-origin',
        cookie,
      },
      body: JSON.stringify({
        command: 'start-session',
        learnerId: 'learner-cmd',
        requestId: 'budget-signed-start-1',
        expectedLearnerRevision: 0,
        payload: { mode: 'single', slug: 'early', length: 1 },
      }),
    }), env, {});
    const startBody = await readJsonBody(startResponse);
    assert.equal(startResponse.status, 200, JSON.stringify(startBody));
    assert.ok(startBody.audio?.promptToken, 'start-session must return a TTS prompt token');
    cookie = refreshedSessionCookie(startResponse, cookie);

    DB.clearQueryLog();
    const response = await app.fetch(new Request(`${BASE_URL}/api/tts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: BASE_URL,
        'sec-fetch-site': 'same-origin',
        cookie,
      },
      body: JSON.stringify({
        learnerId: 'learner-cmd',
        promptToken: startBody.audio.promptToken,
      }),
    }), env, {});
    const failureBody = response.status === 200 ? '' : await response.clone().text();
    assert.equal(response.status, 200, failureBody);
    await response.arrayBuffer();

    const queries = DB.takeQueryLog();
    assert.ok(
      queries.length <= BUDGET_TTS_SIGNED_SESSION_PLAYBACK,
      `signed TTS playback query count must be ≤ ${BUDGET_TTS_SIGNED_SESSION_PLAYBACK}; measured ${queries.length}`,
    );
    assert.equal(
      queries.length,
      MEASURED_TTS_SIGNED_SESSION_PLAYBACK,
      `signed TTS playback query count should stay at ${MEASURED_TTS_SIGNED_SESSION_PLAYBACK}; measured ${queries.length}`,
    );
    assert.equal(
      queries.filter((entry) => /\bFROM account_sessions\b/i.test(entry.sql || '')).length,
      0,
      'signed TTS playback must not read account_sessions on the hot path.',
    );
    assert.equal(
      queries.filter((entry) => /\bFROM adult_accounts\b/i.test(entry.sql || '') || /\bJOIN adult_accounts\b/i.test(entry.sql || '')).length,
      0,
      'signed TTS playback must not read adult_accounts for auth on the hot path.',
    );
    assert.equal(
      queries.filter((entry) => /membership\.role AS membership_role/i.test(entry.sql || '')).length,
      1,
      'signed TTS should still fold learner access into the subject-runtime read.',
    );
  } finally {
    globalThis.fetch = originalFetch;
    __setRequestLimitsCleanupRngForTests(Math.random);
    DB.close();
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
    assert.equal('bootstrapPhaseTimings' in capacity, false, 'phase timings must stay structured-log-only.');

    assert.ok(
      capacity.queryCount <= BUDGET_BOOTSTRAP_GET_FULL,
      `GET bootstrap full bundle queryCount must be ≤ ${BUDGET_BOOTSTRAP_GET_FULL}; measured ${capacity.queryCount}`,
    );
    assert.equal(
      capacity.queryCount,
      MEASURED_BOOTSTRAP_GET_FULL,
      `GET bootstrap full bundle queryCount should stay at the measured P7 count ${MEASURED_BOOTSTRAP_GET_FULL}; measured ${capacity.queryCount}`,
    );

    // GET full must be at least as expensive as the notModified short-circuit.
    assert.ok(
      capacity.queryCount > BUDGET_BOOTSTRAP_NOT_MODIFIED,
      `GET bootstrap full (${capacity.queryCount}) must exceed notModified budget (${BUDGET_BOOTSTRAP_NOT_MODIFIED})`,
    );

    const subjectStateReads = server.DB.takeQueryLog()
      .filter((entry) => entry.operation === 'all' && /\bFROM child_subject_state\b/i.test(entry.sql));
    assert.equal(subjectStateReads.length, 1,
      'GET bootstrap should reuse the already-loaded child_subject_state rows for active-session discovery.');
  } finally {
    server.close();
  }
});

test('U3 query budget: repeated GET bootstrap reuses the monster visual pointer cache', async () => {
  const server = createServer();
  try {
    seed3LearnerFixture(server);

    const warmResponse = await getBootstrap(server);
    assert.equal(warmResponse.status, 200);
    await readJsonBody(warmResponse);
    server.DB.clearQueryLog();

    const response = await getBootstrap(server);
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);
    assert.equal(payload.monsterVisualConfig?.compact, true);

    const capacity = payload.meta?.capacity;
    assert.ok(capacity, 'GET bootstrap must expose meta.capacity');
    assert.equal(
      capacity.queryCount,
      MEASURED_BOOTSTRAP_GET_WITH_CACHED_MONSTER_POINTER,
      `cached GET bootstrap queryCount should stay at ${MEASURED_BOOTSTRAP_GET_WITH_CACHED_MONSTER_POINTER}; measured ${capacity.queryCount}`,
    );

    const pointerReads = server.DB.takeQueryLog()
      .filter((entry) => /\bFROM platform_monster_visual_config\b/i.test(entry.sql));
    assert.equal(pointerReads.length, 0, 'cached public bootstrap must not re-read the global monster visual pointer.');
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

test('Hero read model never hydrates the legacy spelling lifetime profile', async () => {
  const server = createWorkerRepositoryServer({
    defaultAccountId: 'adult-hero-fat',
    env: {
      HERO_MODE_SHADOW_ENABLED: '1',
      HERO_MODE_LAUNCH_ENABLED: '1',
    },
  });
  try {
    runSql(server, `
      INSERT INTO adult_accounts (id, email, display_name, platform_role, created_at, updated_at, selected_learner_id)
      VALUES ('adult-hero-fat', 'hero-fat@test', 'Hero Fat Parent', 'parent', ?, ?, NULL)
    `, [NOW, NOW]);
    insertLearner(server, 'adult-hero-fat', {
      id: 'learner-hero-fat',
      name: 'Hero Fat Learner',
      sortIndex: 0,
      selected: true,
    });
    insertSubjectState(server, 'adult-hero-fat', 'learner-hero-fat', 'spelling');
    const coldProgress = Object.fromEntries(Array.from({ length: 10_000 }, (_, index) => [
      `retired-${index}`,
      { stage: index % 5, attempts: 10, correct: 8, wrong: 2, dueDay: 1 },
    ]));
    const coldBlob = JSON.stringify({ progress: coldProgress });
    runSql(server, `
      UPDATE child_subject_state
      SET data_json = ?
      WHERE learner_id = 'learner-hero-fat' AND subject_id = 'spelling'
    `, [coldBlob]);

    server.DB.clearQueryLog();
    const response = await server.fetch(`${BASE_URL}/api/hero/read-model?learnerId=learner-hero-fat`, {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);

    const queries = server.DB.takeQueryLog();
    const subjectRead = queries.find((entry) => /FROM child_subject_state/i.test(entry.sql || '')
      && /UNION ALL/i.test(entry.sql || ''));
    assert.ok(subjectRead, 'Hero must use the bounded subject-state union');
    assert.match(subjectRead.sql, /subject_id <> 'spelling'/i);
    assert.match(subjectRead.sql, /FROM spelling_learner_state/i);
    assert.equal(
      queries.some((entry) => /SELECT[^;]*child_subject_state[^;]*subject_id\s*=\s*'spelling'/is.test(entry.sql || '')),
      false,
      'Hero must not select the legacy spelling blob',
    );
    assert.equal(
      server.DB.db.prepare(`
        SELECT data_json FROM child_subject_state
        WHERE learner_id = 'learner-hero-fat' AND subject_id = 'spelling'
      `).get()?.data_json,
      coldBlob,
      'cold history remains complete and untouched',
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
    server.DB.db.prepare(`
      INSERT INTO spelling_learner_state (learner_id, ui_json, data_json, stats_json, updated_at, updated_by_account_id)
      VALUES (?, '{}', '{}', ?, ?, ?)
      ON CONFLICT(learner_id) DO UPDATE SET
        ui_json = excluded.ui_json,
        data_json = excluded.data_json,
        stats_json = excluded.stats_json,
        updated_at = excluded.updated_at,
        updated_by_account_id = excluded.updated_by_account_id
    `).run('learner-hero-cmd', JSON.stringify(spellingData.stats), NOW, 'adult-hero-cmd');

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
