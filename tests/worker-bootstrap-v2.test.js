// U7 — Minimal Bootstrap v2 + JSON notModified tests.
//
// Characterisation baseline (captured 2026-04-26 pre-U7 on this branch,
// publicReadModels=true, demo session, 1-learner account with no history):
//   - 1-learner account (empty history): ~3.2 KB (response payload).
//   - 5-learner account (one with high history): ~22-25 KB.
//   - 30-learner account (each with full 200-event history): ~145-160 KB.
// The target after U7 (selected-learner bounded) for the 30-learner scenario
// is ≤ 150 KB because only the selected learner's full bundle ships; the 29
// unselected learners become compact `account.learnerList` entries
// (id + name + avatar + revision ≤ 1 KB each).
//
// Covers scenarios 1, 2, 3, 6, 7, 8, 9, 10, 11, 13, 15, 16, 17, 20, 21, 23
// from the U7 plan spec. Client-side schema check + 3-consecutive-missing
// backstop are covered by extensions in worker-bootstrap-capacity.test.js
// (see that file for scenarios 4, 5, 12, 14, 18, 19, 22).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOOTSTRAP_CAPACITY_VERSION,
  BOOTSTRAP_MODES,
  BOOTSTRAP_V2_ENVELOPE_SHAPE,
  computeBootstrapRevisionHash,
} from '../worker/src/repository.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

const BASE_URL = 'https://repo.test';
const NOW = Date.UTC(2026, 0, 1);

function runSql(server, sql, params = []) {
  server.DB.db.prepare(sql).run(...params);
}

async function postJson(server, path, body = {}, extraHeaders = {}) {
  return server.fetch(`${BASE_URL}${path}`, {
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

async function getBootstrap(server, search = '', extraHeaders = {}) {
  return server.fetch(`${BASE_URL}/api/bootstrap${search}`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'x-ks2-public-read-models': '1',
      ...extraHeaders,
    },
  });
}

async function postBootstrap(server, body = {}, extraHeaders = {}) {
  return postJson(server, '/api/bootstrap', body, extraHeaders);
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

function insertSubjectState(server, accountId, learnerId, { sessions = 0 } = {}) {
  runSql(server, `
    INSERT INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
    VALUES (?, 'spelling', ?, ?, ?, ?)
  `, [
    learnerId,
    JSON.stringify({ phase: 'idle' }),
    JSON.stringify({ prefs: { mode: 'smart' } }),
    NOW,
    accountId,
  ]);
  for (let i = 0; i < sessions; i += 1) {
    runSql(server, `
      INSERT INTO practice_sessions (id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at, updated_by_account_id)
      VALUES (?, ?, 'spelling', 'learning', 'completed', ?, ?, ?, ?, ?)
    `, [
      `${learnerId}-session-${i}`,
      learnerId,
      JSON.stringify({}),
      JSON.stringify({ cards: [] }),
      NOW - i - 1,
      NOW - i - 1,
      accountId,
    ]);
  }
}

function seedEvents(server, accountId, learnerId, count) {
  for (let i = 0; i < count; i += 1) {
    const id = `${learnerId}-event-${String(i).padStart(4, '0')}`;
    runSql(server, `
      INSERT INTO event_log (id, learner_id, subject_id, system_id, event_type, event_json, created_at, actor_account_id)
      VALUES (?, ?, 'spelling', 'spelling', 'spelling.word-secured', ?, ?, ?)
    `, [
      id,
      learnerId,
      JSON.stringify({ id, type: 'spelling.word-secured', learnerId, secureCount: 1 }),
      NOW + i,
      accountId,
    ]);
  }
}

function createServer() {
  const server = createWorkerRepositoryServer({ defaultAccountId: 'adult-u7' });
  runSql(server, `
    INSERT INTO adult_accounts (id, email, display_name, platform_role, created_at, updated_at, selected_learner_id)
    VALUES ('adult-u7', 'u7@test', 'U7 Adult', 'parent', ?, ?, NULL)
  `, [NOW, NOW]);
  return server;
}

async function readJsonBody(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Scenario 15: envelope shape snapshot per BOOTSTRAP_CAPACITY_VERSION.
// This is the release-rule test. If a required field is added to the bundle
// without bumping BOOTSTRAP_CAPACITY_VERSION + BOOTSTRAP_V2_ENVELOPE_SHAPE,
// this test fails. Manual bump means manual snapshot regen in the same PR.
// ---------------------------------------------------------------------------
test('U7 scenario 15: envelope shape snapshot matches BOOTSTRAP_CAPACITY_VERSION', () => {
  // U1 follow-up 2026-04-26: BOOTSTRAP_CAPACITY_VERSION bumped 2 → 3 in
  // the same PR that (a) adds `bootstrapCapacity.subjectStatesBounded`
  // (required-field addition — capacity release-gate plan line 167),
  // (b) extends the revision-hash input set with
  // `writableLearnerStatesDigest` (B1 blocker fix — sibling
  // `writeSubjectState` now invalidates `bootstrapNotModifiedProbe`).
  assert.equal(BOOTSTRAP_CAPACITY_VERSION, 3,
    'U1 follow-up: bumps BOOTSTRAP_CAPACITY_VERSION 2→3 because the envelope gained subjectStatesBounded AND the hash input set changed.');
  // Closed union for meta.capacity.bootstrapMode (canonical U7 enum).
  assert.deepEqual(
    [...BOOTSTRAP_MODES].sort(),
    ['full-legacy', 'not-modified', 'selected-learner-bounded'],
  );
  // Required top-level fields for v2 envelopes (snapshot; shape change here
  // signals a release-gate review).
  assert.deepEqual(BOOTSTRAP_V2_ENVELOPE_SHAPE.requiredTopLevelKeys.slice().sort(), [
    'account',
    'eventLog',
    'gameState',
    'learners',
    'meta',
    'monsterVisualConfig',
    'practiceSessions',
    'revision',
    'subjectStates',
    'syncState',
  ]);
  // Required revision fields.
  assert.deepEqual(BOOTSTRAP_V2_ENVELOPE_SHAPE.requiredRevisionKeys.slice().sort(), [
    'accountLearnerListRevision',
    'accountRevision',
    'bootstrapCapacityVersion',
    'hash',
    'selectedLearnerRevision',
  ]);
});

// ---------------------------------------------------------------------------
// Scenario 23: hash function is SHA-256 truncated to 16 bytes hex. Input
// format is strictly `accountId:<id>;accountRevision:N;selectedLearnerRevision:M;
// bootstrapCapacityVersion:V;accountLearnerListRevision:L`. The accountId
// salt (U7 adv-u7-r1-002) prevents cross-account hash collisions.
// ---------------------------------------------------------------------------
test('U7 scenario 23: computeBootstrapRevisionHash is SHA-256 truncated 16 bytes hex', async () => {
  const hash = await computeBootstrapRevisionHash({
    accountId: 'adult-u7',
    accountRevision: 3,
    selectedLearnerRevision: 7,
    bootstrapCapacityVersion: 2,
    accountLearnerListRevision: 1,
  });
  assert.equal(typeof hash, 'string');
  assert.equal(hash.length, 32, '16 bytes hex = 32 chars.');
  assert.match(hash, /^[0-9a-f]{32}$/);

  // Same inputs → same hash; different inputs → different hashes.
  const again = await computeBootstrapRevisionHash({
    accountId: 'adult-u7',
    accountRevision: 3,
    selectedLearnerRevision: 7,
    bootstrapCapacityVersion: 2,
    accountLearnerListRevision: 1,
  });
  assert.equal(hash, again, 'Deterministic.');

  const different = await computeBootstrapRevisionHash({
    accountId: 'adult-u7',
    accountRevision: 3,
    selectedLearnerRevision: 7,
    bootstrapCapacityVersion: 2,
    accountLearnerListRevision: 2,
  });
  assert.notEqual(hash, different, 'accountLearnerListRevision change flips hash.');
});

// ---------------------------------------------------------------------------
// U7 adv-u7-r1-002: revision hash MUST include the accountId salt so two
// accounts at identical (N,M,V,L) tuples produce DIFFERENT hashes. This
// closes the operator-log state-equivalence oracle where fresh accounts at
// (0,0,2,0) would otherwise hash identically.
// ---------------------------------------------------------------------------
test('U7 adv-u7-r1-002: hash salts by accountId (no cross-account collision)', async () => {
  const accountA = await computeBootstrapRevisionHash({
    accountId: 'adult-a',
    accountRevision: 0,
    selectedLearnerRevision: 0,
    bootstrapCapacityVersion: 2,
    accountLearnerListRevision: 0,
  });
  const accountB = await computeBootstrapRevisionHash({
    accountId: 'adult-b',
    accountRevision: 0,
    selectedLearnerRevision: 0,
    bootstrapCapacityVersion: 2,
    accountLearnerListRevision: 0,
  });
  assert.notEqual(accountA, accountB,
    'Fresh accounts A and B with identical tuples must not collide.');

  // Same accountId + same tuple still gives the same hash (cacheable).
  const accountAAgain = await computeBootstrapRevisionHash({
    accountId: 'adult-a',
    accountRevision: 0,
    selectedLearnerRevision: 0,
    bootstrapCapacityVersion: 2,
    accountLearnerListRevision: 0,
  });
  assert.equal(accountA, accountAAgain,
    'Same accountId with same tuple is deterministic (cacheable).');

  // Active accounts with identical (N,M,V,L) tuples must also differ when
  // accountId differs.
  const activeA = await computeBootstrapRevisionHash({
    accountId: 'adult-a',
    accountRevision: 10,
    selectedLearnerRevision: 25,
    bootstrapCapacityVersion: 2,
    accountLearnerListRevision: 3,
  });
  const activeB = await computeBootstrapRevisionHash({
    accountId: 'adult-b',
    accountRevision: 10,
    selectedLearnerRevision: 25,
    bootstrapCapacityVersion: 2,
    accountLearnerListRevision: 3,
  });
  assert.notEqual(activeA, activeB,
    'Active accounts with identical tuples must not collide either.');
});

// ---------------------------------------------------------------------------
// U7 adv-u7-r1-002: end-to-end — two accounts in the same worker with
// identical revision tuples must produce different hash fields in the
// bootstrap response.
// ---------------------------------------------------------------------------
test('U7 adv-u7-r1-002: two fresh accounts emit different revision.hash values', async () => {
  const server = createServer();
  try {
    runSql(server, `
      INSERT INTO adult_accounts (id, email, display_name, platform_role, created_at, updated_at, selected_learner_id)
      VALUES ('adult-other', 'other@test', 'Other Adult', 'parent', ?, ?, NULL)
    `, [NOW, NOW]);
    insertLearner(server, 'adult-u7', { id: 'learner-u7', name: 'U7 Solo', sortIndex: 0, selected: true });
    insertLearner(server, 'adult-other', { id: 'learner-other', name: 'Other Solo', sortIndex: 0, selected: true });

    // Caller session is adult-u7 (default accountId in createServer).
    const firstResponse = await getBootstrap(server);
    const firstPayload = await readJsonBody(firstResponse);
    const hashA = firstPayload.revision.hash;

    // Switch the session to adult-other via the dev-stub account header so
    // the worker attributes the bootstrap to a different accountId while
    // keeping state structurally identical.
    const secondResponse = await server.fetchAs('adult-other', `${BASE_URL}/api/bootstrap`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'x-ks2-public-read-models': '1',
      },
    });
    const secondPayload = await readJsonBody(secondResponse);
    const hashB = secondPayload.revision.hash;

    assert.ok(hashA && hashB);
    assert.notEqual(hashA, hashB,
      'Two fresh accounts with identical (N,M,V,L) must produce different hashes.');
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// U7 adv-u7-r1-003: POST /api/bootstrap MUST cap the request body so a
// 10 KB+ crafted body is rejected before allocation. Matches the
// existing `readJsonBounded` pattern used by the ops-error ingest.
// ---------------------------------------------------------------------------
test('U7 adv-u7-r1-003: POST /api/bootstrap rejects an oversized body', async () => {
  const server = createServer();
  try {
    insertLearner(server, 'adult-u7', { id: 'learner-a', name: 'Alpha', sortIndex: 0, selected: true });
    insertSubjectState(server, 'adult-u7', 'learner-a');

    // Craft a body well beyond the 2 KB bootstrap cap. `lastKnownRevision`
    // is a 32-char hex string under normal conditions.
    const oversized = 'a'.repeat(10 * 1024);
    const response = await postBootstrap(server, { lastKnownRevision: oversized });
    assert.equal(response.status, 400, 'oversized body must 400');
    const payload = await readJsonBody(response);
    assert.equal(payload?.ok, false);
    assert.equal(payload?.code, 'ops_error_payload_too_large');
  } finally {
    server.close();
  }
});

test('U7 adv-u7-r1-003: POST /api/bootstrap accepts a normal-sized body', async () => {
  const server = createServer();
  try {
    insertLearner(server, 'adult-u7', { id: 'learner-a', name: 'Alpha', sortIndex: 0, selected: true });
    insertSubjectState(server, 'adult-u7', 'learner-a');

    // 32-char hash is well under the cap.
    const response = await postBootstrap(server, {
      lastKnownRevision: '0123456789abcdef0123456789abcdef',
    });
    assert.equal(response.status, 200, 'normal body accepted');
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 1: 1-learner account GET bootstrap — characterisation baseline.
// ---------------------------------------------------------------------------
test('U7 scenario 1: 1-learner bootstrap stamps selected-learner-bounded mode', async () => {
  const server = createServer();
  try {
    insertLearner(server, 'adult-u7', { id: 'learner-solo', name: 'Solo', sortIndex: 0, selected: true });
    insertSubjectState(server, 'adult-u7', 'learner-solo');

    const response = await getBootstrap(server);
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);

    // Revision object present + hash is 32 hex chars.
    assert.ok(payload.revision, 'revision present');
    assert.equal(typeof payload.revision.hash, 'string');
    assert.match(payload.revision.hash, /^[0-9a-f]{32}$/);
    assert.equal(payload.revision.bootstrapCapacityVersion, BOOTSTRAP_CAPACITY_VERSION);
    assert.equal(typeof payload.revision.accountRevision, 'number');
    assert.equal(typeof payload.revision.selectedLearnerRevision, 'number');
    assert.equal(typeof payload.revision.accountLearnerListRevision, 'number');

    // meta.capacity.bootstrapMode stamped with canonical enum value.
    assert.equal(payload.meta?.capacity?.bootstrapMode, 'selected-learner-bounded');

    // account.learnerList is present (empty for 1-learner solo case — the
    // selected learner is full, no siblings).
    assert.ok(payload.account, 'account block present');
    assert.equal(Array.isArray(payload.account.learnerList), true);
    assert.equal(payload.account.learnerList.length, 0);
    assert.equal(payload.account.selectedLearnerId, 'learner-solo');
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 2: 30-learner account with learner-01 selected — bounded response
// ≤ 150 KB, other 29 present only in account.learnerList.
// ---------------------------------------------------------------------------
test('U7 scenario 2: 30-learner bounded bootstrap ≤ 150 KB; others in learnerList', async () => {
  const server = createServer();
  try {
    for (let i = 0; i < 30; i += 1) {
      const id = `learner-${String(i).padStart(2, '0')}`;
      insertLearner(server, 'adult-u7', {
        id,
        name: `Pupil ${i}`,
        sortIndex: i,
        selected: i === 0,
      });
      // Only the selected learner gets heavy history; the test exercises
      // that unselected learner bundles are NOT fetched. Reviewer
      // testing_gap #4 (correctness): seed sessions + events for two
      // sibling learners too so the negative assertion below ("no
      // sibling session/event ships") actually has teeth — the pre-
      // existing version only seeded the selected learner, making the
      // bound assertion vacuous.
      if (i === 0) {
        insertSubjectState(server, 'adult-u7', id, { sessions: 30 });
        seedEvents(server, 'adult-u7', id, 200);
      } else {
        insertSubjectState(server, 'adult-u7', id);
        if (i === 1 || i === 2) {
          // Seed a few sessions + events for two siblings so the
          // "bounded to selected" negative assertion below actually
          // has teeth. We cannot call `insertSubjectState` with
          // `sessions > 0` here because the subject_state row was
          // already inserted on the line above (unique constraint
          // violation); seed the session/event rows directly.
          for (let s = 0; s < 3; s += 1) {
            insertPracticeSessionFor(server, 'adult-u7', id, { id: `${id}-sess-${s}` });
          }
          for (let e = 0; e < 5; e += 1) {
            insertEventFor(server, 'adult-u7', id, { id: `${id}-event-${e}` });
          }
        }
      }
    }

    const response = await getBootstrap(server);
    const text = await response.text();
    const payload = JSON.parse(text);
    assert.equal(payload.ok, true);
    assert.equal(payload.meta?.capacity?.bootstrapMode, 'selected-learner-bounded');

    // U1 hotfix 2026-04-26: subject states ship for every writable learner
    // (unbounded) so Setup stats are correct on learner switch. Sessions +
    // events remain bounded to the selected learner — those are the heavy
    // payloads the bounded envelope is protecting against.
    const selectedLearnerId = payload.account.selectedLearnerId;
    assert.equal(selectedLearnerId, 'learner-00');
    const subjectKeys = Object.keys(payload.subjectStates || {});
    assert.equal(subjectKeys.length, 30,
      'U1: all 30 learners have a spelling subject state row');
    for (const key of subjectKeys) {
      assert.ok(key.endsWith('::spelling'), `expected spelling subject state key, got ${key}`);
    }
    // Sessions + events bounded: only learner-00 ships. Two sibling
    // learners (learner-01 + learner-02) are also seeded with
    // sessions/events so this assertion has teeth — pre-hotfix the
    // bounded query only sees learner-00, but a regression that
    // widens the sessions/events queries would now flunk here.
    assert.ok(payload.practiceSessions.every((s) => s.learnerId === 'learner-00'),
      'U1: practiceSessions still bounded to selected learner (no sibling sessions leak)');
    assert.ok(payload.eventLog.every((e) => e.learnerId === 'learner-00'),
      'U1: eventLog still bounded to selected learner (no sibling events leak)');
    assert.ok(payload.practiceSessions.length > 0,
      'defence-in-depth: learner-00 sessions present (sanity — test seeds 30)');
    assert.ok(payload.eventLog.length > 0,
      'defence-in-depth: learner-00 events present (sanity — test seeds 200)');
    assert.equal(payload.bootstrapCapacity?.subjectStatesBounded, false,
      'U1: subjectStatesBounded contract marker stamped false');

    // account.learnerList has the other 29.
    assert.equal(payload.account.learnerList.length, 29);
    for (const entry of payload.account.learnerList) {
      assert.ok(entry.id);
      assert.ok(entry.name);
      assert.ok(entry.revision !== undefined);
      assert.notEqual(entry.id, selectedLearnerId);
    }

    // Bytes budget: response text ≤ 150 KB.
    assert.ok(text.length < 150_000, `response ${text.length} bytes < 150 KB`);
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 3: POST /api/bootstrap with matching lastKnownRevision → notModified.
// ---------------------------------------------------------------------------
test('U7 scenario 3: POST notModified with matching revision hash returns < 2 KB', async () => {
  const server = createServer();
  try {
    insertLearner(server, 'adult-u7', { id: 'learner-solo', name: 'Solo', sortIndex: 0, selected: true });
    insertSubjectState(server, 'adult-u7', 'learner-solo');

    // Probe first for the current hash.
    const probe = await getBootstrap(server);
    const probePayload = await readJsonBody(probe);
    assert.equal(probePayload.meta.capacity.bootstrapMode, 'selected-learner-bounded');
    const lastKnownRevision = probePayload.revision.hash;

    const response = await postBootstrap(server, { lastKnownRevision });
    assert.equal(response.status, 200);
    const text = await response.text();
    const payload = JSON.parse(text);
    assert.equal(payload.ok, true);
    assert.equal(payload.notModified, true, 'notModified branch returned');
    assert.equal(payload.meta?.capacity?.bootstrapMode, 'not-modified');
    assert.ok(text.length < 2_048, `notModified body ${text.length} bytes < 2 KB`);
    // Must not leak subject state, eventLog, practiceSessions.
    assert.equal(payload.subjectStates, undefined);
    assert.equal(payload.eventLog, undefined);
    assert.equal(payload.practiceSessions, undefined);
    // Revision object echoed.
    assert.equal(payload.revision.hash, lastKnownRevision);
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 6: Cold-start preferredLearnerId honoured when in writable set.
// ---------------------------------------------------------------------------
test('U7 scenario 6: POST preferredLearnerId honoured when writable', async () => {
  const server = createServer();
  try {
    insertLearner(server, 'adult-u7', { id: 'learner-a', name: 'Alpha', sortIndex: 0 });
    insertLearner(server, 'adult-u7', { id: 'learner-b', name: 'Beta', sortIndex: 1 });
    // No `selected` flag → selectedLearnerId in adult_accounts is NULL.

    const response = await postBootstrap(server, { preferredLearnerId: 'learner-b' });
    const payload = await readJsonBody(response);
    assert.equal(payload.account.selectedLearnerId, 'learner-b', 'preferred honoured');
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 7: Cold-start no preference → alphabetical first.
// ---------------------------------------------------------------------------
test('U7 scenario 7: cold start without preference → alphabetical first', async () => {
  const server = createServer();
  try {
    insertLearner(server, 'adult-u7', { id: 'learner-b', name: 'Beta', sortIndex: 0 });
    insertLearner(server, 'adult-u7', { id: 'learner-a', name: 'Alpha', sortIndex: 1 });

    const response = await getBootstrap(server);
    const payload = await readJsonBody(response);
    // "First alphabetical" by learner id.
    assert.equal(payload.account.selectedLearnerId, 'learner-a');
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 8: Mutation bumps accountRevision → notModified no longer matches.
// ---------------------------------------------------------------------------
test('U7 scenario 8: accountRevision bump invalidates notModified', async () => {
  const server = createServer();
  try {
    insertLearner(server, 'adult-u7', { id: 'learner-a', name: 'Alpha', sortIndex: 0, selected: true });
    insertSubjectState(server, 'adult-u7', 'learner-a');

    const probe = await getBootstrap(server);
    const before = (await readJsonBody(probe)).revision;

    // Bump account revision manually (simulates a mutation committing).
    runSql(server, 'UPDATE adult_accounts SET repo_revision = repo_revision + 1 WHERE id = ?', ['adult-u7']);

    const response = await postBootstrap(server, { lastKnownRevision: before.hash });
    const payload = await readJsonBody(response);
    assert.notEqual(payload.notModified, true, 'stale hash: full bundle returned');
    assert.equal(payload.meta?.capacity?.bootstrapMode, 'selected-learner-bounded');
    assert.ok(payload.subjectStates, 'subjectStates present on full bundle');
    assert.notEqual(payload.revision.hash, before.hash);
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 9: account_learner_list_revision bump invalidates notModified.
// ---------------------------------------------------------------------------
test('U7 scenario 9: accountLearnerListRevision bump invalidates notModified', async () => {
  const server = createServer();
  try {
    insertLearner(server, 'adult-u7', { id: 'learner-a', name: 'Alpha', sortIndex: 0, selected: true });
    insertSubjectState(server, 'adult-u7', 'learner-a');

    const probe = await getBootstrap(server);
    const before = (await readJsonBody(probe)).revision;

    // Simulate learner add (rename, remove, etc all bump this). The
    // counter lives in the `adult_account_list_revisions` sibling table
    // (not a column on adult_accounts) because SQLite has no
    // `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` and the migration must
    // be idempotent under the local sqlite helper that re-exec's the
    // final migration file.
    runSql(server, `
      INSERT INTO adult_account_list_revisions (account_id, revision, updated_at)
      VALUES (?, 1, ?)
      ON CONFLICT(account_id) DO UPDATE SET revision = revision + 1
    `, ['adult-u7', NOW]);

    const response = await postBootstrap(server, { lastKnownRevision: before.hash });
    const payload = await readJsonBody(response);
    assert.notEqual(payload.notModified, true, 'list-revision bump forces full bundle');
    assert.equal(payload.meta?.capacity?.bootstrapMode, 'selected-learner-bounded');
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 13: Server schema mismatch — lastKnownRevision but client hash
// encodes a different bootstrapCapacityVersion → full bundle.
// ---------------------------------------------------------------------------
test('U7 scenario 13: server schema mismatch — full bundle on stale version', async () => {
  const server = createServer();
  try {
    insertLearner(server, 'adult-u7', { id: 'learner-a', name: 'Alpha', sortIndex: 0, selected: true });
    insertSubjectState(server, 'adult-u7', 'learner-a');

    // Hash computed with version 1 (pre-U7) simulates a client that still
    // remembers the old envelope version. Note the server computes its hash
    // with the current BOOTSTRAP_CAPACITY_VERSION; a v1-based hash therefore
    // cannot match even if the rest of the state is unchanged.
    const staleHash = await computeBootstrapRevisionHash({
      accountId: 'adult-u7',
      accountRevision: 0,
      selectedLearnerRevision: 0,
      bootstrapCapacityVersion: 1,
      accountLearnerListRevision: 0,
    });

    const response = await postBootstrap(server, { lastKnownRevision: staleHash });
    const payload = await readJsonBody(response);
    assert.notEqual(payload.notModified, true, 'version mismatch: full bundle');
    assert.ok(payload.subjectStates);
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 16: /api/hubs/parent/summary?learnerId=X where X not writable → 403.
// ---------------------------------------------------------------------------
test('U7 scenario 16: parent summary rejects non-writable learner with 403', async () => {
  const server = createServer();
  try {
    insertLearner(server, 'adult-u7', { id: 'learner-a', name: 'Alpha', sortIndex: 0, selected: true });

    const response = await server.fetch(`${BASE_URL}/api/hubs/parent/summary?learnerId=not-owned`, {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    assert.equal(response.status, 403);
    const payload = await readJsonBody(response);
    assert.equal(payload?.ok, false);
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 16b: /api/hubs/parent/summary?learnerId=X when writable returns
// a compact summary (smoke test).
// ---------------------------------------------------------------------------
test('U7 scenario 16b: parent summary writable learner returns compact body', async () => {
  const server = createServer();
  try {
    insertLearner(server, 'adult-u7', { id: 'learner-a', name: 'Alpha', sortIndex: 0, selected: true });
    insertSubjectState(server, 'adult-u7', 'learner-a', { sessions: 3 });

    const response = await server.fetch(`${BASE_URL}/api/hubs/parent/summary?learnerId=learner-a`, {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);
    assert.equal(payload.summary.learnerId, 'learner-a');
    assert.ok(payload.summary.activity);
    const text = JSON.stringify(payload);
    assert.ok(text.length < 10_240, `summary body ${text.length} bytes < 10 KB`);
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 17: /api/classroom/learners/summary — classroom path requires
// admin-or-ops role and rejects demo sessions.
// ---------------------------------------------------------------------------
test('U7 scenario 17: classroom summary refuses non-admin caller with 403', async () => {
  const server = createServer();
  try {
    insertLearner(server, 'adult-u7', { id: 'learner-a', name: 'Alpha', sortIndex: 0, selected: true });

    const response = await server.fetch(`${BASE_URL}/api/classroom/learners/summary`, {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    assert.equal(response.status, 403);
  } finally {
    server.close();
  }
});

test('U7 scenario 17b: classroom summary grants admin with paginated learners', async () => {
  const server = createServer({});
  try {
    // Promote adult-u7 to admin so classroom role check passes. The dev
    // stub's `ensureAccount` UPSERT will otherwise reset platform_role
    // back to 'parent' on every auth refresh; sending the stub role
    // header alongside keeps the session-side role aligned with the DB.
    runSql(server, "UPDATE adult_accounts SET platform_role = 'admin' WHERE id = 'adult-u7'");
    for (let i = 0; i < 60; i += 1) {
      insertLearner(server, 'adult-u7', {
        id: `learner-${String(i).padStart(2, '0')}`,
        name: `Pupil ${i}`,
        sortIndex: i,
      });
    }
    const response = await server.fetch(`${BASE_URL}/api/classroom/learners/summary`, {
      method: 'GET',
      headers: { accept: 'application/json', 'x-ks2-dev-platform-role': 'admin' },
    });
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);
    assert.equal(payload.learners.length, 50, 'paginated to 50');
    assert.ok(payload.nextCursor, 'next cursor present');

    const followUp = await server.fetch(`${BASE_URL}/api/classroom/learners/summary?cursor=${encodeURIComponent(payload.nextCursor)}`, {
      method: 'GET',
      headers: { accept: 'application/json', 'x-ks2-dev-platform-role': 'admin' },
    });
    const followUpPayload = await readJsonBody(followUp);
    assert.equal(followUpPayload.learners.length, 10);
    assert.equal(followUpPayload.nextCursor, null, 'final page null cursor');
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 20: cross-account leak — account A cannot see account B learners.
// ---------------------------------------------------------------------------
test('U7 scenario 20: cross-account leak — learnerList scoped to caller', async () => {
  const server = createServer();
  try {
    runSql(server, `
      INSERT INTO adult_accounts (id, email, display_name, platform_role, created_at, updated_at, selected_learner_id)
      VALUES ('adult-other', 'other@test', 'Other Adult', 'parent', ?, ?, NULL)
    `, [NOW, NOW]);
    insertLearner(server, 'adult-u7', { id: 'learner-mine', name: 'Mine', sortIndex: 0, selected: true });
    insertLearner(server, 'adult-other', { id: 'learner-theirs', name: 'Theirs', sortIndex: 0, selected: true });

    const response = await getBootstrap(server);
    const payload = await readJsonBody(response);
    assert.equal(payload.account.selectedLearnerId, 'learner-mine');
    for (const entry of payload.account.learnerList) {
      assert.notEqual(entry.id, 'learner-theirs');
    }
    // Also: no cross-account learner in primary map.
    assert.equal(Object.keys(payload.learners.byId).includes('learner-theirs'), false);
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 21: redaction — private prompts do not leak in any response variant.
// ---------------------------------------------------------------------------
test('U7 scenario 21: redaction — private prompt text does not leak on bounded bundle', async () => {
  const server = createServer();
  try {
    insertLearner(server, 'adult-u7', { id: 'learner-a', name: 'Alpha', sortIndex: 0, selected: true });
    // Seed with a subject state that includes private prompt text in data_json.
    runSql(server, `
      INSERT INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
      VALUES ('learner-a', 'spelling', ?, ?, ?, ?)
    `, [
      JSON.stringify({ phase: 'session', currentCard: { prompt: { sentence: 'top-secret-private-prompt' } } }),
      JSON.stringify({ prefs: { mode: 'smart' } }),
      NOW,
      'adult-u7',
    ]);

    const response = await getBootstrap(server);
    const text = await response.text();
    assert.equal(text.includes('top-secret-private-prompt'), false,
      'private prompt text must not appear in the bounded bundle');
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 22: multi-tab coordination (client) still short-circuits on
// notModified — covered directly in worker-bootstrap-capacity.test.js since
// that module already exercises the coordination helpers. Here we assert
// that POST notModified has NO cookie side-effects that could interfere.
// ---------------------------------------------------------------------------
test('U7 scenario 22: POST notModified does not rotate session cookies', async () => {
  const server = createServer();
  try {
    insertLearner(server, 'adult-u7', { id: 'learner-a', name: 'Alpha', sortIndex: 0, selected: true });

    const probe = await getBootstrap(server);
    const hash = (await readJsonBody(probe)).revision.hash;

    const response = await postBootstrap(server, { lastKnownRevision: hash });
    // No set-cookie rotation on the hot path.
    assert.equal(response.headers.get('set-cookie'), null);
    const payload = await readJsonBody(response);
    assert.equal(payload.notModified, true);
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// U1 hotfix 2026-04-26: child_subject_state must ship for EVERY writable
// learner on a multi-learner account, not just the selected one. The
// selected-learner-bounded envelope still bounds practice_sessions and
// event_log (those are the payloads that blow past 150 KB), but
// child_subject_state is a compact per-(learner,subject) slot that powers
// the Spelling/Grammar/Punctuation "Where You Stand" setup stats. Without
// this carve-out, switching between siblings shows 0 stats until the user
// triggers a Worker command that refetches.
//
// New contract marker: bootstrapCapacity.subjectStatesBounded === false.
// Spec: docs/superpowers/specs/2026-04-26-bootstrap-learner-stats-hotfix-
// design.md.
// ---------------------------------------------------------------------------

function insertSubjectStateFor(server, accountId, learnerId, subjectId) {
  runSql(server, `
    INSERT INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    learnerId,
    subjectId,
    JSON.stringify({ phase: 'idle' }),
    JSON.stringify({ prefs: { mode: 'smart' }, progress: { possess: { stage: 3 } } }),
    NOW,
    accountId,
  ]);
}

function insertPracticeSessionFor(server, accountId, learnerId, { id, subjectId = 'spelling' }) {
  runSql(server, `
    INSERT INTO practice_sessions (id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at, updated_by_account_id)
    VALUES (?, ?, ?, 'learning', 'completed', ?, ?, ?, ?, ?)
  `, [
    id,
    learnerId,
    subjectId,
    JSON.stringify({}),
    JSON.stringify({ cards: [] }),
    NOW,
    NOW,
    accountId,
  ]);
}

function insertEventFor(server, accountId, learnerId, { id }) {
  runSql(server, `
    INSERT INTO event_log (id, learner_id, subject_id, system_id, event_type, event_json, created_at, actor_account_id)
    VALUES (?, ?, 'spelling', 'spelling', 'spelling.word-secured', ?, ?, ?)
  `, [
    id,
    learnerId,
    JSON.stringify({ id, type: 'spelling.word-secured', learnerId, secureCount: 1 }),
    NOW,
    accountId,
  ]);
}

test('U1 hotfix: child_subject_state ships for all writable learners (multi-learner account)', async () => {
  const server = createServer();
  try {
    // A is selected; B + C are siblings.
    insertLearner(server, 'adult-u7', { id: 'learner-a', name: 'Alpha', sortIndex: 0, selected: true });
    insertLearner(server, 'adult-u7', { id: 'learner-b', name: 'Beta', sortIndex: 1 });
    insertLearner(server, 'adult-u7', { id: 'learner-c', name: 'Gamma', sortIndex: 2 });

    // Non-default subject state across two subjects for each learner.
    for (const learnerId of ['learner-a', 'learner-b', 'learner-c']) {
      insertSubjectStateFor(server, 'adult-u7', learnerId, 'spelling');
      insertSubjectStateFor(server, 'adult-u7', learnerId, 'grammar');
    }

    // Sessions + events for all three (only A's should ship).
    for (const learnerId of ['learner-a', 'learner-b', 'learner-c']) {
      insertPracticeSessionFor(server, 'adult-u7', learnerId, { id: `${learnerId}-sess-1` });
      insertEventFor(server, 'adult-u7', learnerId, { id: `${learnerId}-event-1` });
    }

    const response = await postBootstrap(server, {});
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);

    // subjectStates MUST contain every (learner, subject) pair, keyed by
    // subjectStateKey(learnerId, subjectId) → `${learner}::${subject}`.
    const subjectKeys = Object.keys(payload.subjectStates || {}).sort();
    const expectedKeys = [
      'learner-a::grammar',
      'learner-a::spelling',
      'learner-b::grammar',
      'learner-b::spelling',
      'learner-c::grammar',
      'learner-c::spelling',
    ];
    assert.deepEqual(subjectKeys, expectedKeys,
      `U1: subjectStates must include all writable learners across both subjects, got ${JSON.stringify(subjectKeys)}`);

    // practiceSessions stays bounded to the selected learner only.
    assert.equal(payload.practiceSessions.length, 1, 'only learner-a session ships');
    assert.equal(payload.practiceSessions[0].learnerId, 'learner-a');

    // eventLog stays bounded to the selected learner only.
    assert.equal(payload.eventLog.length, 1, 'only learner-a event ships');
    assert.equal(payload.eventLog[0].learnerId, 'learner-a');

    // bootstrapMode label unchanged (describes sessions/events bound).
    assert.equal(payload.meta?.capacity?.bootstrapMode, 'selected-learner-bounded');

    // New contract marker: subjectStatesBounded === false.
    assert.equal(payload.bootstrapCapacity?.subjectStatesBounded, false,
      'bootstrapCapacity.subjectStatesBounded must be stamped false (U1 contract)');

    // M1 follow-up 2026-04-26: value-level assertion. Prove the seeded
    // `data_json` marker actually flows through for a non-selected
    // sibling — not an empty placeholder keyed only by learnerId. We
    // use `grammar` because `publicSubjectStateRowToRecord` only
    // redacts `data` on `spelling`/`punctuation` (per the private-
    // prompt leak test at scenario 21); `grammar` falls through to
    // `subjectStateRowToRecord`, which preserves `data` verbatim.
    const siblingGrammar = payload.subjectStates['learner-b::grammar'];
    assert.ok(siblingGrammar, 'sibling grammar subject-state row present');
    assert.equal(siblingGrammar?.data?.prefs?.mode, 'smart',
      `M1: sibling subjectState.data carries the seeded prefs.mode marker, got ${JSON.stringify(siblingGrammar)}`);
    assert.equal(siblingGrammar?.data?.progress?.possess?.stage, 3,
      'M1: sibling subjectState.data carries the seeded progress.possess.stage marker');
  } finally {
    server.close();
  }
});

test('U1 hotfix: GET /api/bootstrap also ships child_subject_state for all writable learners', async () => {
  const server = createServer();
  try {
    insertLearner(server, 'adult-u7', { id: 'learner-a', name: 'Alpha', sortIndex: 0, selected: true });
    insertLearner(server, 'adult-u7', { id: 'learner-b', name: 'Beta', sortIndex: 1 });
    insertLearner(server, 'adult-u7', { id: 'learner-c', name: 'Gamma', sortIndex: 2 });

    for (const learnerId of ['learner-a', 'learner-b', 'learner-c']) {
      insertSubjectStateFor(server, 'adult-u7', learnerId, 'spelling');
      insertSubjectStateFor(server, 'adult-u7', learnerId, 'grammar');
      insertPracticeSessionFor(server, 'adult-u7', learnerId, { id: `${learnerId}-sess-1` });
      insertEventFor(server, 'adult-u7', learnerId, { id: `${learnerId}-event-1` });
    }

    const response = await getBootstrap(server);
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);

    const subjectKeys = Object.keys(payload.subjectStates || {}).sort();
    assert.deepEqual(subjectKeys, [
      'learner-a::grammar',
      'learner-a::spelling',
      'learner-b::grammar',
      'learner-b::spelling',
      'learner-c::grammar',
      'learner-c::spelling',
    ], 'GET path: subjectStates unbounded across all writable learners');

    assert.equal(payload.practiceSessions.length, 1);
    assert.equal(payload.practiceSessions[0].learnerId, 'learner-a');
    assert.equal(payload.eventLog.length, 1);
    assert.equal(payload.eventLog[0].learnerId, 'learner-a');

    assert.equal(payload.meta?.capacity?.bootstrapMode, 'selected-learner-bounded');
    assert.equal(payload.bootstrapCapacity?.subjectStatesBounded, false);
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// U1 follow-up B1 (HIGH) 2026-04-26: the `bootstrapNotModifiedProbe`
// short-circuit MUST invalidate when a NON-selected (sibling) learner's
// subject_state is mutated. Before this fix, the 4-input revision hash
// (accountRevision, selectedLearnerRevision, accountLearnerListRevision,
// bootstrapCapacityVersion) did not include any sibling state_revision,
// so `writeSubjectState → withLearnerMutation` on learner B silently
// returned `notModified: true` while the client kept showing 0 stats.
// The fix extends the hash with a `writableLearnerStatesDigest` input.
// ---------------------------------------------------------------------------
test('U1 follow-up B1: sibling subject_state write invalidates lastKnownRevision hash', async () => {
  const server = createServer();
  try {
    // A is the persisted selected learner; B is a writable sibling.
    insertLearner(server, 'adult-u7', { id: 'learner-a', name: 'Alpha', sortIndex: 0, selected: true });
    insertLearner(server, 'adult-u7', { id: 'learner-b', name: 'Beta', sortIndex: 1 });
    insertSubjectStateFor(server, 'adult-u7', 'learner-a', 'spelling');
    insertSubjectStateFor(server, 'adult-u7', 'learner-b', 'grammar');

    // Probe for baseline hash.
    const probe = await getBootstrap(server);
    const H1 = (await readJsonBody(probe)).revision.hash;
    assert.match(H1, /^[0-9a-f]{32}$/, 'baseline hash present');

    // Sanity: the lastKnownRevision short-circuit works on H1 (nothing
    // has changed).
    const unchanged = await postBootstrap(server, { lastKnownRevision: H1 });
    const unchangedPayload = await readJsonBody(unchanged);
    assert.equal(unchangedPayload.notModified, true,
      'pre-mutation: matching hash returns notModified');

    // Simulate `writeSubjectState → withLearnerMutation` on sibling B:
    // (a) bump learner_profiles.state_revision for B only (mirrors the CAS
    //     update in repository.js:7594-7600),
    // (b) mutate B's child_subject_state data_json directly. NOTE:
    //     adult_accounts.repo_revision is intentionally NOT bumped —
    //     this reproduces the exact failure path where only the
    //     per-learner revision advances.
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
      JSON.stringify({ prefs: { mode: 'smart' }, progress: { possess: { stage: 4 } } }),
      NOW + 1,
      'learner-b',
      'grammar',
    ]);

    // Re-post with the old H1. The probe MUST miss; the client MUST
    // receive a full bundle carrying B's mutated data.
    const response = await postBootstrap(server, { lastKnownRevision: H1 });
    assert.equal(response.status, 200);
    const payload = await readJsonBody(response);
    assert.notEqual(payload.notModified, true,
      'B1: sibling state_revision bump must invalidate the probe short-circuit');
    assert.equal(payload.meta?.capacity?.bootstrapMode, 'selected-learner-bounded');
    assert.notEqual(payload.revision.hash, H1,
      'B1: new revision hash differs from H1 after sibling write');

    // Value-level check: B's mutated data ships through on the full bundle.
    const siblingGrammar = payload.subjectStates?.['learner-b::grammar'];
    assert.ok(siblingGrammar, 'B1: sibling grammar state present in full bundle');
    assert.equal(siblingGrammar?.data?.progress?.possess?.stage, 4,
      'B1: mutated stage marker ships in the full bundle after probe miss');
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// U1 follow-up M3 (medium) 2026-04-26: single-learner accounts still ship
// subject_state and still stamp `subjectStatesBounded: false`. Guards
// against accidental regression where the derived `subjectStatesBounded`
// flag (B4) is flipped to `true` on the solo path.
// ---------------------------------------------------------------------------
test('U1 follow-up M3: single-learner account still ships subject_state + subjectStatesBounded=false', async () => {
  const server = createServer();
  try {
    insertLearner(server, 'adult-u7', { id: 'learner-solo', name: 'Solo', sortIndex: 0, selected: true });
    insertSubjectStateFor(server, 'adult-u7', 'learner-solo', 'spelling');

    const response = await getBootstrap(server);
    const payload = await readJsonBody(response);
    assert.equal(payload.ok, true);

    const subjectKeys = Object.keys(payload.subjectStates || {});
    assert.deepEqual(subjectKeys, ['learner-solo::spelling'],
      'M3: single-learner solo account ships exactly one subject state row');
    assert.equal(payload.bootstrapCapacity?.subjectStatesBounded, false,
      'M3: contract marker false even on solo path');
    assert.equal(payload.meta?.capacity?.bootstrapMode, 'selected-learner-bounded');
  } finally {
    server.close();
  }
});
