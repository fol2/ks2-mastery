// P3 U1 — Multi-learner bootstrap regression lock.
//
// Characterisation-first test suite: 4-learner account fixture (owner A,
// member B, member C, viewer D) exercising 13 scenarios that pin the
// selected-learner-bounded envelope contract. Every assertion verifies
// data IDENTITY (the unique fixture JSON), not just presence/count,
// to catch silent data corruption regressions.
//
// No production code changes.

import test from 'node:test';
import assert from 'node:assert/strict';

import { upsertBoundedSpellingState } from './helpers/bounded-spelling-state.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

const BASE_URL = 'https://repo.test';
const NOW = Date.UTC(2026, 0, 1);

// ---------------------------------------------------------------------------
// Helpers (local to this file — mirrors worker-bootstrap-v2.test.js)
// ---------------------------------------------------------------------------

function runSql(server, sql, params = []) {
  server.DB.db.prepare(sql).run(...params);
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

// ---------------------------------------------------------------------------
// Fixture-unique data markers. Each learner gets distinct JSON payloads so
// identity assertions can confirm the right data reaches the right slot.
// ---------------------------------------------------------------------------

const FIXTURE = {
  'learner-a': {
    spelling: { fixture: 'learner-a-spelling', progress: 42 },
    grammar: { fixture: 'learner-a-grammar', progress: 88 },
    punctuation: { fixture: 'learner-a-punctuation', progress: 15 },
    game: { fixture: 'learner-a-game', monstersCollected: 7 },
  },
  'learner-b': {
    spelling: { fixture: 'learner-b-spelling', progress: 21 },
    grammar: { fixture: 'learner-b-grammar', progress: 53 },
    punctuation: { fixture: 'learner-b-punctuation', progress: 9 },
    game: { fixture: 'learner-b-game', monstersCollected: 3 },
  },
  'learner-c': {
    spelling: { fixture: 'learner-c-spelling', progress: 5 },
    grammar: { fixture: 'learner-c-grammar', progress: 12 },
    punctuation: { fixture: 'learner-c-punctuation', progress: 1 },
    game: { fixture: 'learner-c-game', monstersCollected: 1 },
  },
  'learner-d': {
    spelling: { fixture: 'learner-d-spelling', progress: 77 },
    grammar: { fixture: 'learner-d-grammar', progress: 66 },
    punctuation: { fixture: 'learner-d-punctuation', progress: 44 },
    game: { fixture: 'learner-d-game', monstersCollected: 5 },
  },
};

// ---------------------------------------------------------------------------
// Seeding helpers
// ---------------------------------------------------------------------------

const ACCOUNT_ID = 'adult-ml';

function createServer() {
  const server = createWorkerRepositoryServer({ defaultAccountId: ACCOUNT_ID });
  runSql(server, `
    INSERT INTO adult_accounts (id, email, display_name, platform_role, created_at, updated_at, selected_learner_id)
    VALUES (?, 'ml@test', 'ML Adult', 'parent', ?, ?, NULL)
  `, [ACCOUNT_ID, NOW, NOW]);
  return server;
}

function insertLearner(server, { id, name, sortIndex, role = 'owner', selected = false }) {
  runSql(server, `
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES (?, ?, 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `, [id, name, NOW, NOW]);
  runSql(server, `
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [ACCOUNT_ID, id, role, sortIndex, NOW, NOW]);
  if (selected) {
    runSql(server, 'UPDATE adult_accounts SET selected_learner_id = ?, updated_at = ? WHERE id = ?', [id, NOW, ACCOUNT_ID]);
  }
}

function insertSubjectState(server, learnerId, subjectId, {
  ui = { phase: 'idle' },
  data = null,
  updatedAt = NOW,
} = {}) {
  const marker = FIXTURE[learnerId]?.[subjectId] || {};
  const stateData = data || { prefs: { mode: 'smart', marker }, progress: { possess: { stage: marker.progress || 0 } } };
  const publicUi = ui && typeof ui === 'object' && !Array.isArray(ui)
    ? { ...ui, subjectId, learnerId, prefs: stateData.prefs || {} }
    : null;
  if (subjectId === 'spelling') {
    upsertBoundedSpellingState(server.DB.db, {
      learnerId,
      accountId: ACCOUNT_ID,
      ui,
      data: stateData,
      now: updatedAt,
    });
    if (publicUi) {
      runSql(server, `
        UPDATE spelling_learner_state
        SET public_ui_json = ?, public_ui_updated_at = ?
        WHERE learner_id = ?
      `, [JSON.stringify(publicUi), updatedAt, learnerId]);
    }
    return;
  }
  runSql(server, `
    INSERT INTO child_subject_state (
      learner_id, subject_id, ui_json, data_json,
      public_ui_json, public_ui_updated_at, updated_at, updated_by_account_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    learnerId,
    subjectId,
    typeof ui === 'string' ? ui : JSON.stringify(ui),
    // The public transform strips `data` for all child-facing subject
    // projections. Grammar keeps this marker under `ui.prefs` after the
    // Worker read-model is rebuilt.
    JSON.stringify(stateData),
    publicUi ? JSON.stringify(publicUi) : null,
    publicUi ? updatedAt : null,
    updatedAt,
    ACCOUNT_ID,
  ]);
}

// Branch tuple per learner for identity — `publicMonsterCodexEntry` preserves
// the `branch` field when it is in PUBLIC_MONSTER_BRANCHES ('b1'|'b2'). The
// spelling-progress merge (`mergePublicSpellingCodexState`) overwrites
// `masteredCount` and `caught`, but PRESERVES the existing `branch`. So the
// branch tuple is a reliable identity marker that survives the full public
// transform pipeline.
const GAME_BRANCH_MARKERS = {
  'learner-a': { inklet: 'b1', glimmerbug: 'b2' },
  'learner-b': { inklet: 'b2', glimmerbug: 'b1' },
  'learner-c': { inklet: 'b1', glimmerbug: 'b1' },
  'learner-d': { inklet: 'b2', glimmerbug: 'b2' },
};

function insertGameState(server, learnerId) {
  const branches = GAME_BRANCH_MARKERS[learnerId] || { inklet: 'b1', glimmerbug: 'b1' };
  // Only `monster-codex` system_id survives `publicGameStateRowToRecord`.
  // Seed `inklet` + `glimmerbug` entries with per-learner branch values.
  // The (inklet.branch, glimmerbug.branch) tuple uniquely identifies each
  // learner's game state through the public transform. `bracehart` locks the
  // Grammar hydration path: spelling-progress merge must update spelling
  // entries without erasing non-spelling reward state.
  runSql(server, `
    INSERT INTO child_game_state (learner_id, system_id, state_json, updated_at, updated_by_account_id)
    VALUES (?, 'monster-codex', ?, ?, ?)
  `, [
    learnerId,
    JSON.stringify({
      inklet: { mastered: [`${learnerId}-ink-word`], caught: true, branch: branches.inklet },
      glimmerbug: { mastered: [`${learnerId}-glim-word`], caught: true, branch: branches.glimmerbug },
      bracehart: {
        caught: true,
        mastered: ['grammar:grammar-legacy-reviewed-2026-04-24:clauses'],
        starHighWater: 17,
      },
    }),
    NOW,
    ACCOUNT_ID,
  ]);
}

function insertPracticeSession(server, learnerId, {
  id,
  subjectId = 'spelling',
  status = 'completed',
  createdAt = NOW,
  updatedAt = createdAt,
}) {
  runSql(server, `
    INSERT INTO practice_sessions (id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at, updated_by_account_id)
    VALUES (?, ?, ?, 'learning', ?, ?, ?, ?, ?, ?)
  `, [
    id,
    learnerId,
    subjectId,
    status,
    JSON.stringify({}),
    JSON.stringify({ cards: [] }),
    createdAt,
    updatedAt,
    ACCOUNT_ID,
  ]);
}

function insertEvent(server, learnerId, { id }) {
  runSql(server, `
    INSERT INTO event_log (id, learner_id, subject_id, system_id, event_type, event_json, created_at, actor_account_id)
    VALUES (?, ?, 'spelling', 'spelling', 'spelling.word-secured', ?, ?, ?)
  `, [
    id,
    learnerId,
    JSON.stringify({ id, type: 'spelling.word-secured', learnerId, secureCount: 1 }),
    NOW,
    ACCOUNT_ID,
  ]);
}

// ---------------------------------------------------------------------------
// 4-learner fixture seeder
// ---------------------------------------------------------------------------

function seed4LearnerFixture(server) {
  // Learner A — owner, selected, heavy history.
  insertLearner(server, { id: 'learner-a', name: 'Alpha', sortIndex: 0, role: 'owner', selected: true });
  insertSubjectState(server, 'learner-a', 'spelling');
  insertSubjectState(server, 'learner-a', 'grammar');
  insertSubjectState(server, 'learner-a', 'punctuation');
  insertGameState(server, 'learner-a');
  for (let i = 0; i < 5; i += 1) {
    insertPracticeSession(server, 'learner-a', { id: `la-sess-${i}` });
  }
  for (let i = 0; i < 50; i += 1) {
    insertEvent(server, 'learner-a', { id: `la-evt-${String(i).padStart(3, '0')}` });
  }

  // Learner B — member, writable sibling, moderate history.
  insertLearner(server, { id: 'learner-b', name: 'Beta', sortIndex: 1, role: 'member' });
  insertSubjectState(server, 'learner-b', 'spelling');
  insertSubjectState(server, 'learner-b', 'grammar');
  insertSubjectState(server, 'learner-b', 'punctuation');
  insertGameState(server, 'learner-b');
  for (let i = 0; i < 2; i += 1) {
    insertPracticeSession(server, 'learner-b', { id: `lb-sess-${i}` });
  }
  for (let i = 0; i < 20; i += 1) {
    insertEvent(server, 'learner-b', { id: `lb-evt-${String(i).padStart(3, '0')}` });
  }

  // Learner C — member, writable sibling, minimal history.
  insertLearner(server, { id: 'learner-c', name: 'Gamma', sortIndex: 2, role: 'member' });
  insertSubjectState(server, 'learner-c', 'spelling');
  insertSubjectState(server, 'learner-c', 'grammar');
  insertSubjectState(server, 'learner-c', 'punctuation');
  insertGameState(server, 'learner-c');
  // 0 practice sessions.
  for (let i = 0; i < 5; i += 1) {
    insertEvent(server, 'learner-c', { id: `lc-evt-${i}` });
  }

  // Learner D — viewer, read-only (has seeded data — negative-assertion target).
  insertLearner(server, { id: 'learner-d', name: 'Delta', sortIndex: 3, role: 'viewer' });
  insertSubjectState(server, 'learner-d', 'spelling');
  insertSubjectState(server, 'learner-d', 'grammar');
  insertSubjectState(server, 'learner-d', 'punctuation');
  insertGameState(server, 'learner-d');
  insertPracticeSession(server, 'learner-d', { id: 'ld-sess-0' });
  for (let i = 0; i < 3; i += 1) {
    insertEvent(server, 'learner-d', { id: `ld-evt-${i}` });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// #1 — Happy path: POST bootstrap ships child_subject_state for the selected learner.
test('multi-learner #1: POST bootstrap ships selected learner child_subject_state', async () => {
  const server = createServer();
  try {
    seed4LearnerFixture(server);

    const response = await postBootstrap(server, {});
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);

    const subjectKeys = Object.keys(payload.subjectStates || {}).sort();
    const expectedKeys = [
      'learner-a::grammar',
      'learner-a::punctuation',
      'learner-a::spelling',
    ];
    assert.deepEqual(subjectKeys, expectedKeys,
      `subjectStates must include the selected learner across all 3 subjects, got ${JSON.stringify(subjectKeys)}`);

    // Verify identity via the Grammar public read-model. The public transform
    // strips raw data for all three subjects, so subject identity must survive
    // through the redacted UI payload instead.
    const aGrammar = payload.subjectStates['learner-a::grammar'];
    assert.ok(aGrammar, 'learner-a grammar subject state present');
    assert.deepEqual(aGrammar.data, {}, 'learner-a grammar data stripped by public transform');
    assert.equal(aGrammar?.ui?.learnerId, 'learner-a');
    assert.equal(aGrammar?.ui?.prefs?.marker?.fixture, 'learner-a-grammar',
      `learner-a grammar fixture marker identity, got ${JSON.stringify(aGrammar?.ui?.prefs?.marker)}`);
    assert.equal(aGrammar?.ui?.prefs?.marker?.progress, 88);

    // Spelling and punctuation entries also strip raw data in the public
    // transform while preserving the selected learner routing.
    const aSpelling = payload.subjectStates['learner-a::spelling'];
    assert.ok(aSpelling, 'learner-a spelling entry present');
    assert.deepEqual(aSpelling.data, {}, 'learner-a spelling data stripped by public transform');
    const aPunctuation = payload.subjectStates['learner-a::punctuation'];
    assert.ok(aPunctuation, 'learner-a punctuation entry present');
    assert.deepEqual(aPunctuation.data, {}, 'learner-a punctuation data stripped by public transform');

    const nonSelectedKeys = subjectKeys.filter((k) => !k.startsWith('learner-a::'));
    assert.deepEqual(nonSelectedKeys, [], 'sibling and viewer learners excluded from subjectStates');
  } finally {
    server.close();
  }
});

// #2 — Happy path: POST bootstrap ships child_game_state for the selected learner.
test('multi-learner #2: POST bootstrap ships selected learner child_game_state', async () => {
  const server = createServer();
  try {
    seed4LearnerFixture(server);

    const response = await postBootstrap(server, {});
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);

    const gameKeys = Object.keys(payload.gameState || {}).sort();
    // gameStateKey(learnerId, systemId) = `${learnerId}::${systemId}`
    // Only `monster-codex` survives `publicGameStateRowToRecord`.
    const expectedKeys = [
      'learner-a::monster-codex',
    ];
    assert.deepEqual(gameKeys, expectedKeys,
      `gameState must include the selected learner's monster-codex entry, got ${JSON.stringify(gameKeys)}`);

    // Verify data identity via the (inklet.branch, glimmerbug.branch) tuple.
    // The spelling-progress merge overwrites masteredCount/caught, but
    // preserves `branch` from the existing state.
    const aGame = payload.gameState['learner-a::monster-codex'];
    assert.ok(aGame, 'learner-a game state present');
    assert.equal(aGame?.inklet?.branch, 'b1',
      `learner-a inklet branch identity, got ${JSON.stringify(aGame?.inklet)}`);
    assert.equal(aGame?.glimmerbug?.branch, 'b2',
      `learner-a glimmerbug branch identity, got ${JSON.stringify(aGame?.glimmerbug)}`);
    assert.equal(aGame?.bracehart?.caught, true,
      `learner-a Grammar monster survives spelling merge, got ${JSON.stringify(aGame?.bracehart)}`);
    assert.equal(aGame?.bracehart?.starHighWater, 17,
      `learner-a Grammar star high-water survives spelling merge, got ${JSON.stringify(aGame?.bracehart)}`);

    const nonSelectedKeys = gameKeys.filter((k) => !k.startsWith('learner-a::'));
    assert.deepEqual(nonSelectedKeys, [], 'sibling and viewer learners excluded from gameState');
  } finally {
    server.close();
  }
});

// #3 — Happy path: learnerList contains 2 unselected writable siblings.
test('multi-learner #3: learnerList contains 2 unselected writable siblings', async () => {
  const server = createServer();
  try {
    seed4LearnerFixture(server);

    const response = await postBootstrap(server, {});
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);

    const learnerList = payload.account?.learnerList || [];
    assert.equal(learnerList.length, 2, 'exactly 2 unselected writable siblings');

    const ids = learnerList.map((e) => e.id).sort();
    assert.deepEqual(ids, ['learner-b', 'learner-c'],
      'learnerList contains B and C');

    // Each compact entry carries a revision field.
    for (const entry of learnerList) {
      assert.equal(typeof entry.revision, 'number',
        `compact entry ${entry.id} has numeric revision`);
      assert.ok(entry.name, `compact entry ${entry.id} has name`);
    }

    // Positive assertion: allIds carries exactly the 3 writable learners.
    assert.equal(payload.learners?.allIds?.length, 3, 'exactly 3 writable learners in allIds');
    assert.deepEqual([...(payload.learners?.allIds || [])].sort(), ['learner-a', 'learner-b', 'learner-c'],
      'allIds contains exactly the 3 writable learners');

    // Selected learner should be A.
    assert.equal(payload.account?.selectedLearnerId, 'learner-a');

    // Learner D (viewer) must NOT appear.
    const dInList = learnerList.find((e) => e.id === 'learner-d');
    assert.equal(dInList, undefined, 'viewer learner-d excluded from learnerList');
  } finally {
    server.close();
  }
});

// #4 — Happy path: practiceSessions and eventLog bounded to selected learner only.
test('multi-learner #4: practiceSessions and eventLog bounded to selected learner only', async () => {
  const server = createServer();
  try {
    seed4LearnerFixture(server);

    const response = await postBootstrap(server, {});
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);

    // practiceSessions — only learner-a's 5 sessions.
    assert.equal(payload.practiceSessions.length, 5,
      `expected 5 sessions for learner-a, got ${payload.practiceSessions.length}`);
    assert.equal(
      payload.practiceSessions.every((s) => s.learnerId === 'learner-a'),
      true,
      'all practice sessions belong to learner-a',
    );

    // eventLog — only learner-a's events (up to the limit, seeded 50).
    assert.ok(payload.eventLog.length > 0, 'eventLog non-empty');
    assert.equal(
      payload.eventLog.every((e) => e.learnerId === 'learner-a'),
      true,
      'all events belong to learner-a',
    );

    // Negative: no B/C/D sessions.
    const nonASessionIds = payload.practiceSessions
      .filter((s) => s.learnerId !== 'learner-a')
      .map((s) => s.id);
    assert.deepEqual(nonASessionIds, [], 'no non-A sessions ship');

    // Negative: no B/C/D events.
    const nonAEventIds = payload.eventLog
      .filter((e) => e.learnerId !== 'learner-a')
      .map((e) => e.id);
    assert.deepEqual(nonAEventIds, [], 'no non-A events ship');
  } finally {
    server.close();
  }
});

test('multi-learner #4a: stale active session is included from preloaded subject state', async () => {
  const server = createServer();
  try {
    insertLearner(server, { id: 'learner-a', name: 'Alpha', sortIndex: 0, role: 'owner', selected: true });
    insertLearner(server, { id: 'learner-b', name: 'Beta', sortIndex: 1, role: 'member' });
    insertSubjectState(server, 'learner-a', 'spelling', {
      ui: { phase: 'session', session: { id: 'learner-a-active-old' } },
      updatedAt: NOW + 30,
    });
    insertSubjectState(server, 'learner-a', 'grammar', { updatedAt: NOW + 20 });
    insertSubjectState(server, 'learner-b', 'spelling');

    insertPracticeSession(server, 'learner-a', {
      id: 'learner-a-active-old',
      status: 'active',
      createdAt: NOW - 1_000,
      updatedAt: NOW - 1_000,
    });
    for (let i = 0; i < 7; i += 1) {
      insertPracticeSession(server, 'learner-a', {
        id: `learner-a-recent-${i}`,
        createdAt: NOW + i,
        updatedAt: NOW + i,
      });
    }
    insertPracticeSession(server, 'learner-b', { id: 'learner-b-recent-0', createdAt: NOW + 100, updatedAt: NOW + 100 });

    server.DB.clearQueryLog();
    const response = await postBootstrap(server, {});
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);

    const sessionIds = payload.practiceSessions.map((session) => session.id);
    assert.equal(sessionIds.includes('learner-a-active-old'), true,
      'active session referenced by preloaded subject state must ship even when it is outside recent sessions');
    assert.equal(sessionIds.filter((id) => id === 'learner-a-active-old').length, 1,
      'active session must not be duplicated with recent sessions');
    assert.equal(payload.practiceSessions.every((session) => session.learnerId === 'learner-a'), true,
      'selected-learner session bound still excludes sibling sessions');

    const queryLog = server.DB.takeQueryLog();
    const subjectStateReads = queryLog.filter((entry) => entry.operation === 'all' && /\bFROM child_subject_state\b/i.test(entry.sql));
    assert.equal(subjectStateReads.length, 1,
      'public bootstrap should reuse the preloaded child_subject_state rows for active-session discovery');
    const activeSessionReads = queryLog.filter((entry) => entry.operation === 'all' && /\bFROM practice_sessions\b/i.test(entry.sql) && /\bUNION ALL\b/i.test(entry.sql));
    assert.equal(activeSessionReads.length, 1, 'active and recent sessions share one bounded selected-learner lookup');
    assert.deepEqual(
      activeSessionReads[0].params.filter((param) => param === 'learner-a-active-old'),
      ['learner-a-active-old', 'learner-a-active-old'],
      'the compact projection point-reads the canonical active session and excludes it from recent history',
    );
  } finally {
    server.close();
  }
});

test('multi-learner #4b: malformed subject ui_json does not block other active sessions', async () => {
  const server = createServer();
  try {
    insertLearner(server, { id: 'learner-a', name: 'Alpha', sortIndex: 0, role: 'owner', selected: true });
    insertSubjectState(server, 'learner-a', 'spelling', {
      ui: '{"phase":"session",',
      updatedAt: NOW + 30,
    });
    insertSubjectState(server, 'learner-a', 'grammar', {
      ui: { phase: 'session', session: { id: 'learner-a-valid-active' } },
      updatedAt: NOW + 20,
    });

    insertPracticeSession(server, 'learner-a', {
      id: 'learner-a-valid-active',
      status: 'active',
      createdAt: NOW - 1_000,
      updatedAt: NOW - 1_000,
    });
    for (let i = 0; i < 7; i += 1) {
      insertPracticeSession(server, 'learner-a', {
        id: `learner-a-malformed-recent-${i}`,
        createdAt: NOW + i,
        updatedAt: NOW + i,
      });
    }

    const response = await postBootstrap(server, {});
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);
    assert.equal(payload.practiceSessions.some((session) => session.id === 'learner-a-valid-active'), true,
      'a malformed newer ui_json row must not prevent a later valid active session from shipping');
  } finally {
    server.close();
  }
});

// #5 — Happy path: GET bootstrap returns same multi-learner structure.
test('multi-learner #5: GET bootstrap returns same multi-learner structure', async () => {
  const server = createServer();
  try {
    seed4LearnerFixture(server);

    const response = await getBootstrap(server);
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);

    // Subject states for the selected learner only.
    const subjectKeys = Object.keys(payload.subjectStates || {}).sort();
    assert.deepEqual(subjectKeys, [
      'learner-a::grammar',
      'learner-a::punctuation',
      'learner-a::spelling',
    ], `GET: selected learner subject-state entries, got ${JSON.stringify(subjectKeys)}`);

    // Game state for the selected learner only.
    const gameKeys = Object.keys(payload.gameState || {}).sort();
    assert.deepEqual(gameKeys, [
      'learner-a::monster-codex',
    ], 'GET: gameState keys match selected learner');

    // Identity check via the Grammar public read-model.
    assert.equal(
      payload.subjectStates['learner-a::grammar']?.ui?.prefs?.marker?.fixture,
      'learner-a-grammar',
      'GET: learner-a grammar fixture identity',
    );

    // learnerList shape.
    const learnerList = payload.account?.learnerList || [];
    assert.equal(learnerList.length, 2, 'GET: 2 siblings in learnerList');

    // Sessions bounded to A — guard against vacuous-truth `[].every()`.
    assert.ok(payload.practiceSessions.length > 0, 'GET: sessions non-empty');
    assert.equal(
      payload.practiceSessions.every((s) => s.learnerId === 'learner-a'),
      true,
      'GET: sessions bounded to selected learner',
    );

    // Events bounded to A — guard against vacuous-truth `[].every()`.
    assert.ok(payload.eventLog.length > 0, 'GET: eventLog non-empty');
    assert.equal(
      payload.eventLog.every((e) => e.learnerId === 'learner-a'),
      true,
      'GET: events bounded to selected learner',
    );
  } finally {
    server.close();
  }
});

// #6 — Edge case: Viewer learner D excluded from everything.
test('multi-learner #6: viewer learner D excluded from everything', async () => {
  const server = createServer();
  try {
    seed4LearnerFixture(server);

    const response = await postBootstrap(server, {});
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);

    // D has seeded data — this is a real exclusion test.
    // subjectStates.
    const dSubjectKeys = Object.keys(payload.subjectStates || {}).filter((k) => k.startsWith('learner-d'));
    assert.deepEqual(dSubjectKeys, [], 'D excluded from subjectStates');

    // gameState.
    const dGameKeys = Object.keys(payload.gameState || {}).filter((k) => k.startsWith('learner-d'));
    assert.deepEqual(dGameKeys, [], 'D excluded from gameState');

    // learnerList.
    const dInLearnerList = (payload.account?.learnerList || []).find((e) => e.id === 'learner-d');
    assert.equal(dInLearnerList, undefined, 'D excluded from learnerList');

    // learners.byId.
    assert.equal(payload.learners?.byId?.['learner-d'], undefined,
      'D excluded from learners.byId');

    // learners.allIds.
    assert.equal((payload.learners?.allIds || []).includes('learner-d'), false,
      'D excluded from learners.allIds');

    // practiceSessions (D has 1 seeded session).
    const dSessions = (payload.practiceSessions || []).filter((s) => s.learnerId === 'learner-d');
    assert.equal(dSessions.length, 0, 'D sessions excluded');

    // eventLog (D has 3 seeded events).
    const dEvents = (payload.eventLog || []).filter((e) => e.learnerId === 'learner-d');
    assert.equal(dEvents.length, 0, 'D events excluded');
  } finally {
    server.close();
  }
});
