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
  runSql(server, `
    INSERT INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    learnerId,
    subjectId,
    typeof ui === 'string' ? ui : JSON.stringify(ui),
    // Grammar preserves `data` verbatim through `subjectStateRowToRecord`.
    // Spelling and punctuation return `data: {}` through `publicSubjectStateRowToRecord`
    // — the fixture marker does NOT survive those code paths.
    // All identity assertions in this file use grammar for this reason.
    JSON.stringify(stateData),
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
  // learner's game state through the public transform.
  runSql(server, `
    INSERT INTO child_game_state (learner_id, system_id, state_json, updated_at, updated_by_account_id)
    VALUES (?, 'monster-codex', ?, ?, ?)
  `, [
    learnerId,
    JSON.stringify({
      inklet: { mastered: [`${learnerId}-ink-word`], caught: true, branch: branches.inklet },
      glimmerbug: { mastered: [`${learnerId}-glim-word`], caught: true, branch: branches.glimmerbug },
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

// #1 — Happy path: POST bootstrap ships child_subject_state for all 3 writable learners.
test('multi-learner #1: POST bootstrap ships child_subject_state for all 3 writable learners', async () => {
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
      'learner-b::grammar',
      'learner-b::punctuation',
      'learner-b::spelling',
      'learner-c::grammar',
      'learner-c::punctuation',
      'learner-c::spelling',
    ];
    assert.deepEqual(subjectKeys, expectedKeys,
      `subjectStates must include all writable learners across all 3 subjects, got ${JSON.stringify(subjectKeys)}`);

    // Verify data identity via the grammar path (grammar preserves `data`
    // verbatim through `subjectStateRowToRecord`; spelling/punctuation
    // redact private session fields but keep `prefs` + `progress`).
    const aGrammar = payload.subjectStates['learner-a::grammar'];
    assert.ok(aGrammar, 'learner-a grammar subject state present');
    assert.equal(aGrammar?.data?.prefs?.marker?.fixture, 'learner-a-grammar',
      `learner-a grammar fixture marker identity, got ${JSON.stringify(aGrammar?.data?.prefs?.marker)}`);
    assert.equal(aGrammar?.data?.prefs?.marker?.progress, 88);

    const bGrammar = payload.subjectStates['learner-b::grammar'];
    assert.ok(bGrammar, 'learner-b grammar subject state present');
    assert.equal(bGrammar?.data?.prefs?.marker?.fixture, 'learner-b-grammar',
      `learner-b grammar fixture marker identity, got ${JSON.stringify(bGrammar?.data?.prefs?.marker)}`);
    assert.equal(bGrammar?.data?.prefs?.marker?.progress, 53);

    const cGrammar = payload.subjectStates['learner-c::grammar'];
    assert.ok(cGrammar, 'learner-c grammar subject state present');
    assert.equal(cGrammar?.data?.prefs?.marker?.fixture, 'learner-c-grammar',
      `learner-c grammar fixture marker identity, got ${JSON.stringify(cGrammar?.data?.prefs?.marker)}`);
    assert.equal(cGrammar?.data?.prefs?.marker?.progress, 12);

    // Spelling and punctuation entries exist but data is stripped by public transform.
    // Grammar preserves `data` verbatim — spelling/punctuation return `data: {}`.
    // Check each writable learner's spelling + punctuation entries confirm the
    // public transform ran (data stripped) while verifying correct learner routing.
    const aSpelling = payload.subjectStates['learner-a::spelling'];
    assert.ok(aSpelling, 'learner-a spelling entry present');
    assert.deepEqual(aSpelling.data, {}, 'learner-a spelling data stripped by public transform');
    const aPunctuation = payload.subjectStates['learner-a::punctuation'];
    assert.ok(aPunctuation, 'learner-a punctuation entry present');
    assert.deepEqual(aPunctuation.data, {}, 'learner-a punctuation data stripped by public transform');

    const bSpelling = payload.subjectStates['learner-b::spelling'];
    assert.ok(bSpelling, 'learner-b spelling entry present');
    assert.deepEqual(bSpelling.data, {}, 'learner-b spelling data stripped by public transform');
    const bPunctuation = payload.subjectStates['learner-b::punctuation'];
    assert.ok(bPunctuation, 'learner-b punctuation entry present');
    assert.deepEqual(bPunctuation.data, {}, 'learner-b punctuation data stripped by public transform');

    const cSpelling = payload.subjectStates['learner-c::spelling'];
    assert.ok(cSpelling, 'learner-c spelling entry present');
    assert.deepEqual(cSpelling.data, {}, 'learner-c spelling data stripped by public transform');
    const cPunctuation = payload.subjectStates['learner-c::punctuation'];
    assert.ok(cPunctuation, 'learner-c punctuation entry present');
    assert.deepEqual(cPunctuation.data, {}, 'learner-c punctuation data stripped by public transform');

    // No learner-d entries.
    const dKeys = subjectKeys.filter((k) => k.startsWith('learner-d'));
    assert.equal(dKeys.length, 0, 'viewer learner-d excluded from subjectStates');
  } finally {
    server.close();
  }
});

// #2 — Happy path: POST bootstrap ships child_game_state for all 3 writable learners.
test('multi-learner #2: POST bootstrap ships child_game_state for all 3 writable learners', async () => {
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
      'learner-b::monster-codex',
      'learner-c::monster-codex',
    ];
    assert.deepEqual(gameKeys, expectedKeys,
      `gameState must include all writable learners' monster-codex entries, got ${JSON.stringify(gameKeys)}`);

    // Verify data identity via the (inklet.branch, glimmerbug.branch) tuple.
    // The spelling-progress merge overwrites masteredCount/caught, but
    // preserves `branch` from the existing state.
    const aGame = payload.gameState['learner-a::monster-codex'];
    assert.ok(aGame, 'learner-a game state present');
    assert.equal(aGame?.inklet?.branch, 'b1',
      `learner-a inklet branch identity, got ${JSON.stringify(aGame?.inklet)}`);
    assert.equal(aGame?.glimmerbug?.branch, 'b2',
      `learner-a glimmerbug branch identity, got ${JSON.stringify(aGame?.glimmerbug)}`);

    const bGame = payload.gameState['learner-b::monster-codex'];
    assert.ok(bGame, 'learner-b game state present');
    assert.equal(bGame?.inklet?.branch, 'b2',
      `learner-b inklet branch identity, got ${JSON.stringify(bGame?.inklet)}`);
    assert.equal(bGame?.glimmerbug?.branch, 'b1',
      `learner-b glimmerbug branch identity, got ${JSON.stringify(bGame?.glimmerbug)}`);

    const cGame = payload.gameState['learner-c::monster-codex'];
    assert.ok(cGame, 'learner-c game state present');
    assert.equal(cGame?.inklet?.branch, 'b1',
      `learner-c inklet branch identity, got ${JSON.stringify(cGame?.inklet)}`);
    assert.equal(cGame?.glimmerbug?.branch, 'b1',
      `learner-c glimmerbug branch identity, got ${JSON.stringify(cGame?.glimmerbug)}`);

    // No learner-d entries.
    const dKeys = gameKeys.filter((k) => k.startsWith('learner-d'));
    assert.equal(dKeys.length, 0, 'viewer learner-d excluded from gameState');
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
    const activeSessionReads = queryLog.filter((entry) => entry.operation === 'all' && /\bFROM practice_sessions\b/i.test(entry.sql) && /\bAND id IN\b/i.test(entry.sql));
    assert.equal(activeSessionReads.length, 1, 'active session row lookup still runs when a preloaded active id exists');
    assert.deepEqual(activeSessionReads[0].params.filter((param) => param === 'learner-a-active-old'), ['learner-a-active-old'],
      'active session lookup receives the id derived from preloaded subject state');
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

    // Subject states for all writable learners.
    const subjectKeys = Object.keys(payload.subjectStates || {}).sort();
    assert.equal(subjectKeys.length, 9,
      `GET: 9 subject-state entries (3 learners x 3 subjects), got ${subjectKeys.length}`);
    assert.equal(subjectKeys.filter((k) => k.startsWith('learner-d')).length, 0,
      'GET: viewer excluded from subjectStates');

    // Game state for all writable learners.
    const gameKeys = Object.keys(payload.gameState || {}).sort();
    assert.deepEqual(gameKeys, [
      'learner-a::monster-codex',
      'learner-b::monster-codex',
      'learner-c::monster-codex',
    ], 'GET: gameState keys match writable learners');

    // Identity check via grammar data.
    assert.equal(
      payload.subjectStates['learner-b::grammar']?.data?.prefs?.marker?.fixture,
      'learner-b-grammar',
      'GET: learner-b grammar fixture identity',
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

// #7 — Edge case: preferredLearnerId switches selected learner.
test('multi-learner #7: preferredLearnerId switches selected learner', async () => {
  const server = createServer();
  try {
    seed4LearnerFixture(server);

    const response = await postBootstrap(server, { preferredLearnerId: 'learner-b' });
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);

    // B becomes selected.
    assert.equal(payload.account?.selectedLearnerId, 'learner-b',
      'B is selected after preferredLearnerId');
    assert.equal(payload.learners?.selectedId, 'learner-b',
      'learners.selectedId reflects B');

    // B gets full first-paint data (sessions/events bounded to B).
    // B was seeded with 2 sessions and 20 events — guard against vacuous-truth.
    assert.equal(payload.practiceSessions.length, 2, 'B has 2 sessions');
    assert.equal(
      payload.practiceSessions.every((s) => s.learnerId === 'learner-b'),
      true,
      'sessions bounded to B after switch',
    );
    assert.equal(payload.eventLog.length, 20, 'B has 20 events');
    assert.equal(
      payload.eventLog.every((e) => e.learnerId === 'learner-b'),
      true,
      'events bounded to B after switch',
    );

    // A and C appear as compact siblings.
    const siblingIds = (payload.account?.learnerList || []).map((e) => e.id).sort();
    assert.deepEqual(siblingIds, ['learner-a', 'learner-c'],
      'A and C appear as compact siblings when B is selected');

    // Subject states still include ALL writable learners.
    const subjectKeys = Object.keys(payload.subjectStates || {}).sort();
    assert.equal(subjectKeys.filter((k) => k.startsWith('learner-a')).length, 3, 'A subject states present');
    assert.equal(subjectKeys.filter((k) => k.startsWith('learner-b')).length, 3, 'B subject states present');
    assert.equal(subjectKeys.filter((k) => k.startsWith('learner-c')).length, 3, 'C subject states present');
  } finally {
    server.close();
  }
});

// #8 — Edge case: preferredLearnerId pointing at viewer falls back.
test('multi-learner #8: preferredLearnerId pointing at viewer falls back to persisted writable learner', async () => {
  const server = createServer();
  try {
    seed4LearnerFixture(server);

    // Point at viewer D — should silently fall back.
    const response = await postBootstrap(server, { preferredLearnerId: 'learner-d' });
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);

    // Falls back to persisted writable learner (learner-a was selected in seed).
    assert.equal(payload.account?.selectedLearnerId, 'learner-a',
      'falls back to learner-a when preferred is viewer');
    assert.equal(payload.learners?.selectedId, 'learner-a');

    // Verify the data envelope is populated, not just metadata.
    assert.ok(Object.keys(payload.subjectStates || {}).length >= 3,
      'viewer fallback: subject states populated');
    assert.equal(payload.practiceSessions.length, 5,
      'viewer fallback envelope includes A sessions');

    // No error.
    assert.equal(payload.error, undefined, 'no error returned');
    assert.equal(payload.code, undefined, 'no error code returned');

    // Exercise true alphabetical fallback: clear the persisted selection
    // so neither preferredLearnerId nor selected_learner_id resolve.
    runSql(server, 'UPDATE adult_accounts SET selected_learner_id = NULL WHERE id = ?', [ACCOUNT_ID]);
    const fallbackRes = await postBootstrap(server, { preferredLearnerId: 'learner-d' });
    assert.equal(fallbackRes.status, 200);
    const fallbackPayload = await readJsonBody(fallbackRes);
    assert.equal(fallbackPayload.ok, true);
    assert.equal(fallbackPayload.account?.selectedLearnerId, 'learner-a',
      'viewer + no persisted selection falls back to alphabetical first writable');
  } finally {
    server.close();
  }
});

// #9 — Edge case: cold-start alphabetical selection.
test('multi-learner #9: cold-start alphabetical selection (no preferredLearnerId, no persisted)', async () => {
  const server = createServer();
  try {
    // Seed WITHOUT selecting any learner (no `selected: true`).
    insertLearner(server, { id: 'learner-a', name: 'Alpha', sortIndex: 0, role: 'owner' });
    insertLearner(server, { id: 'learner-b', name: 'Beta', sortIndex: 1, role: 'member' });
    insertLearner(server, { id: 'learner-c', name: 'Gamma', sortIndex: 2, role: 'member' });
    insertSubjectState(server, 'learner-a', 'spelling');
    insertSubjectState(server, 'learner-b', 'grammar');

    const response = await postBootstrap(server, {});
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);

    // Alphabetical first writable learner selected.
    assert.equal(payload.account?.selectedLearnerId, 'learner-a',
      'cold-start: alphabetical first writable learner selected');
    assert.equal(payload.learners?.selectedId, 'learner-a');

    // No practice sessions were seeded for any learner in this cold-start
    // fixture — assert explicitly empty rather than relying on vacuous `[].every()`.
    assert.equal(payload.practiceSessions.length, 0,
      'cold-start: zero sessions seeded, array is empty-but-correct');

    // Subject states must ship for writable learners — the PR #316 regression
    // was invisible without inspecting this envelope in cold-start scenarios.
    const subjectKeys = Object.keys(payload.subjectStates || {});
    assert.ok(subjectKeys.length >= 2, 'cold-start: subject states ship for writable learners');
    // Check that sibling (learner-b) subject state is present, not just selected (learner-a).
    assert.ok(subjectKeys.some((k) => k.startsWith('learner-b')),
      'cold-start: sibling learner-b subject state present');
  } finally {
    server.close();
  }
});

// #10 — Integration: notModified invalidation on sibling subject-state write.
test('multi-learner #10: notModified invalidation on sibling subject-state write', async () => {
  const server = createServer();
  try {
    seed4LearnerFixture(server);

    // Get baseline hash H1.
    const baseline = await postBootstrap(server, {});
    const basePayload = await readJsonBody(baseline);
    assert.equal(basePayload.ok, true);
    const H1 = basePayload.revision?.hash;
    assert.match(H1, /^[0-9a-f]{32}$/, 'baseline hash present');

    // Confirm notModified on same hash.
    const unchanged = await postBootstrap(server, { lastKnownRevision: H1 });
    const unchangedPayload = await readJsonBody(unchanged);
    assert.equal(unchangedPayload.notModified, true,
      'pre-mutation: matching hash returns notModified');

    // Simulate sibling B subject-state write: bump state_revision + mutate data.
    runSql(server, `
      UPDATE learner_profiles
      SET state_revision = state_revision + 1, updated_at = ?
      WHERE id = ?
    `, [NOW + 1, 'learner-b']);
    runSql(server, `
      UPDATE child_subject_state
      SET data_json = ?, updated_at = ?
      WHERE learner_id = ? AND subject_id = ?
    `, [
      JSON.stringify({ prefs: { mode: 'smart', marker: { fixture: 'learner-b-grammar-mutated', progress: 99 } }, progress: { possess: { stage: 99 } } }),
      NOW + 1,
      'learner-b',
      'grammar',
    ]);

    // Re-post with old H1 — must get full bundle, NOT notModified.
    const response = await postBootstrap(server, { lastKnownRevision: H1 });
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.notEqual(payload.notModified, true,
      'sibling subject-state write must invalidate notModified');
    assert.notEqual(payload.revision?.hash, H1,
      'new hash differs from H1 after sibling write');

    // Value-level: mutated data ships through.
    const bGrammar = payload.subjectStates?.['learner-b::grammar'];
    assert.ok(bGrammar, 'B grammar state present in full bundle');
    assert.equal(bGrammar?.data?.prefs?.marker?.fixture, 'learner-b-grammar-mutated',
      'mutated fixture marker ships through');
    assert.equal(bGrammar?.data?.progress?.possess?.stage, 99,
      'mutated progress stage ships through');
  } finally {
    server.close();
  }
});

// #11 — Integration: notModified invalidation on sibling game-state write.
test('multi-learner #11: notModified invalidation on sibling game-state write', async () => {
  const server = createServer();
  try {
    seed4LearnerFixture(server);

    // Get baseline hash.
    const baseline = await postBootstrap(server, {});
    const basePayload = await readJsonBody(baseline);
    const H1 = basePayload.revision?.hash;
    assert.match(H1, /^[0-9a-f]{32}$/, 'baseline hash present');

    // Confirm notModified.
    const unchanged = await postBootstrap(server, { lastKnownRevision: H1 });
    assert.equal((await readJsonBody(unchanged)).notModified, true, 'pre-mutation notModified');

    // Simulate sibling C game-state write: bump state_revision.
    runSql(server, `
      UPDATE learner_profiles
      SET state_revision = state_revision + 1, updated_at = ?
      WHERE id = ?
    `, [NOW + 1, 'learner-c']);
    // Mutate C's game state: flip inklet branch from b1 to b2. The branch
    // field survives the public transform pipeline, providing a reliable
    // mutation witness.
    runSql(server, `
      UPDATE child_game_state
      SET state_json = ?, updated_at = ?
      WHERE learner_id = ? AND system_id = ?
    `, [
      JSON.stringify({
        inklet: { mastered: ['learner-c-ink-word'], caught: true, branch: 'b2' },
        glimmerbug: { mastered: ['learner-c-glim-word'], caught: true, branch: 'b1' },
      }),
      NOW + 1,
      'learner-c',
      'monster-codex',
    ]);

    // Re-post with old hash — must get full bundle.
    const response = await postBootstrap(server, { lastKnownRevision: H1 });
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.notEqual(payload.notModified, true,
      'sibling game-state write must invalidate notModified');
    assert.notEqual(payload.revision?.hash, H1,
      'new hash differs after sibling game-state write');

    // Value-level: C's mutated game state ships through with flipped branch.
    const cGame = payload.gameState?.['learner-c::monster-codex'];
    assert.ok(cGame, 'C game state present in full bundle');
    assert.equal(cGame?.inklet?.branch, 'b2',
      'mutated inklet branch ships through (was b1, now b2)');
  } finally {
    server.close();
  }
});

// #12 — Edge case: single-learner regression guard.
test('multi-learner #12: single-learner regression guard', async () => {
  const server = createServer();
  try {
    // Separate 1-learner fixture.
    insertLearner(server, { id: 'learner-solo', name: 'Solo', sortIndex: 0, role: 'owner', selected: true });
    insertSubjectState(server, 'learner-solo', 'spelling');
    insertSubjectState(server, 'learner-solo', 'grammar');
    insertGameState(server, 'learner-solo');
    insertPracticeSession(server, 'learner-solo', { id: 'solo-sess-0' });
    insertEvent(server, 'learner-solo', { id: 'solo-evt-0' });

    const response = await postBootstrap(server, {});
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);

    // Subject states present.
    const subjectKeys = Object.keys(payload.subjectStates || {}).sort();
    assert.deepEqual(subjectKeys, ['learner-solo::grammar', 'learner-solo::spelling'],
      'single-learner: both subject states present');

    // Game state present.
    const gameKeys = Object.keys(payload.gameState || {});
    assert.equal(gameKeys.length, 1, 'single-learner: 1 game state entry');
    assert.ok(payload.gameState['learner-solo::monster-codex'], 'single-learner: monster-codex present');

    // Sessions and events present.
    assert.equal(payload.practiceSessions.length, 1, 'single-learner: 1 session');
    assert.equal(payload.eventLog.length, 1, 'single-learner: 1 event');

    // subjectStatesBounded marker.
    assert.equal(payload.bootstrapCapacity?.subjectStatesBounded, false,
      'single-learner: subjectStatesBounded is false');

    // Selected learner.
    assert.equal(payload.account?.selectedLearnerId, 'learner-solo');
    assert.equal(payload.account?.learnerList?.length, 0, 'single-learner: no siblings');
  } finally {
    server.close();
  }
});

// #13 — Edge case: bootstrapCapacity.subjectStatesBounded marker.
test('multi-learner #13: bootstrapCapacity.subjectStatesBounded marker for multi and single', async () => {
  const server = createServer();
  try {
    seed4LearnerFixture(server);

    // Multi-learner: subjectStatesBounded is false.
    const multiResponse = await postBootstrap(server, {});
    const multiPayload = await readJsonBody(multiResponse);
    assert.equal(multiPayload.ok, true);
    assert.equal(multiPayload.bootstrapCapacity?.subjectStatesBounded, false,
      'multi-learner: subjectStatesBounded is false (states shipped for all writable)');
  } finally {
    server.close();
  }

  // Separate server for single-learner.
  const soloServer = createServer();
  try {
    insertLearner(soloServer, { id: 'learner-solo', name: 'Solo', sortIndex: 0, role: 'owner', selected: true });
    insertSubjectState(soloServer, 'learner-solo', 'spelling');

    const soloResponse = await postBootstrap(soloServer, {});
    const soloPayload = await readJsonBody(soloResponse);
    assert.equal(soloPayload.ok, true);
    assert.equal(soloPayload.bootstrapCapacity?.subjectStatesBounded, false,
      'single-learner: subjectStatesBounded is also false');
  } finally {
    soloServer.close();
  }
});
