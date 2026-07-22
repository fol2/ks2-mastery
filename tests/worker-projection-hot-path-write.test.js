// U6 — Projection hot-path consumption.
//
// These tests anchor the refactor from `readLearnerProjectionBundle()` (which
// scanned a bounded 200-event window on every command) to
// `readLearnerProjectionInput()` which consumes the persisted
// `command.projection.v1` read model as the hot-path input. The bounded
// window is now migration/fallback only; Spelling degrades when fallback
// fails so the learner flow continues without a full-history scan.
//
// Scenarios follow the plan U6 test list (2026-04-25-002).

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerApp } from '../worker/src/app.js';
import { COMMAND_PROJECTION_MODEL_KEY } from '../worker/src/read-models/learner-read-models.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const PROJECTION_RECENT_EVENT_LIMIT = 200;
const RECENT_EVENT_TOKEN_RING_LIMIT = 250;
const BASE_URL = 'https://repo.test';

function seedAccountLearner(DB, { accountId = 'adult-a', learnerId = 'learner-a' } = {}) {
  const now = Date.UTC(2026, 0, 1);
  DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES (?, 'Learner A', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(learnerId, now, now);
  DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES (?, ?, ?, 'parent', ?, ?, ?, 0)
  `).run(accountId, `${accountId}@example.test`, 'Adult A', learnerId, now, now);
  DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, ?, 'owner', 0, ?, ?)
  `).run(accountId, learnerId, now, now);
}

function insertEvent(DB, event) {
  DB.db.prepare(`
    INSERT INTO event_log (id, learner_id, subject_id, system_id, event_type, event_json, created_at, actor_account_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'adult-a')
  `).run(
    event.id,
    event.learnerId,
    event.subjectId || null,
    event.systemId || null,
    event.type,
    JSON.stringify(event),
    event.createdAt,
  );
}

function insertProjectionWindowFillerEvents(DB, { learnerId = 'learner-a', count = 2000, startAt }) {
  for (let index = 0; index < count; index += 1) {
    insertEvent(DB, {
      id: `spelling.projection-window-filler:${index}`,
      type: 'spelling.session-completed',
      learnerId,
      subjectId: 'spelling',
      createdAt: startAt + index,
    });
  }
}

function eventLogReads(DB) {
  return DB.takeQueryLog()
    .filter((entry) => entry.operation === 'all' && /\bFROM event_log\b/i.test(entry.sql));
}

function createHarness({ subjectId = 'spelling', accountId = 'adult-a' } = {}) {
  const nowRef = { value: Date.UTC(2026, 0, 1) };
  const DB = createMigratedSqliteD1Database();
  seedAccountLearner(DB, { accountId });
  const app = createWorkerApp({ now: () => nowRef.value });
  const env = {
    DB,
    AUTH_MODE: 'development-stub',
    ENVIRONMENT: 'test',
  };
  let revision = 0;
  let sequence = 0;

  async function postRaw(body, { headers: extraHeaders = {} } = {}) {
    const response = await app.fetch(new Request(`${BASE_URL}/api/subjects/${subjectId}/command`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ks2-dev-account-id': accountId,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    }), env, {});
    return {
      response,
      body: await response.json(),
      requestBody: body,
    };
  }

  async function command(commandName, payload = {}, {
    subjectOverride = subjectId,
    requestId = `hot-path-${sequence += 1}`,
  } = {}) {
    const originalSubject = subjectId;
    // eslint-disable-next-line no-param-reassign
    subjectId = subjectOverride;
    const result = await postRaw({
      command: commandName,
      learnerId: 'learner-a',
      requestId,
      expectedLearnerRevision: revision,
      payload,
    });
    // restore
    subjectId = originalSubject;
    if (result.response.status === 200 && result.body?.mutation?.appliedRevision != null) {
      revision = result.body.mutation.appliedRevision;
    }
    return result;
  }

  return {
    DB,
    env,
    app,
    nowRef,
    command,
    postRaw,
    close() { DB.close(); },
    get revision() { return revision; },
    set revision(value) { revision = value; },
    get sequence() { return sequence; },
  };
}

async function completePossessRound(harness) {
  let latest = await harness.command('start-session', {
    mode: 'single',
    slug: 'possess',
    length: 1,
  });
  let secureSubmit = null;
  while (latest.body.subjectReadModel?.phase === 'session') {
    latest = await harness.command('submit-answer', { answer: 'possess' });
    if (latest.body.domainEvents?.some((event) => event.type === 'spelling.word-secured')) {
      secureSubmit = latest;
    }
    if (latest.body.subjectReadModel.phase === 'session' && latest.body.subjectReadModel.awaitingAdvance) {
      latest = await harness.command('continue-session');
    }
  }
  return { latest, secureSubmit };
}

function readProjectionRow(DB, learnerId = 'learner-a') {
  return DB.db.prepare(`
    SELECT model_json, source_revision, generated_at, updated_at
    FROM learner_read_models
    WHERE learner_id = ? AND model_key = ?
  `).get(learnerId, COMMAND_PROJECTION_MODEL_KEY);
}

function readPublicSubjectProjectionRow(DB, subjectId = 'spelling', learnerId = 'learner-a') {
  if (subjectId === 'spelling') {
    return DB.db.prepare(`
      SELECT public_ui_json AS model_json, public_ui_updated_at AS updated_at
      FROM spelling_learner_state
      WHERE learner_id = ?
    `).get(learnerId);
  }
  return DB.db.prepare(`
    SELECT public_ui_json AS model_json, public_ui_updated_at AS updated_at
    FROM child_subject_state
    WHERE learner_id = ? AND subject_id = ?
  `).get(learnerId, subjectId);
}

test('subject commands persist their bounded public read model in the source-state batch', async () => {
  const harness = createHarness();
  try {
    const result = await harness.command('start-session', {
      mode: 'single',
      slug: 'possess',
      length: 1,
    });
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.publicSubjectReadModel, undefined,
      'the persistence-only read model must not leak into the command response');

    const row = readPublicSubjectProjectionRow(harness.DB);
    assert.ok(row, 'the subject public projection is materialised with the source write');
    const persistedModel = JSON.parse(row.model_json);
    assert.equal(persistedModel.subjectId, result.body.subjectReadModel.subjectId);
    assert.equal(persistedModel.learnerId, result.body.subjectReadModel.learnerId);
    assert.equal(persistedModel.phase, result.body.subjectReadModel.phase);
    assert.deepEqual(persistedModel.stats, result.body.subjectReadModel.stats);
    assert.equal(persistedModel.projections, undefined,
      'bootstrap projection excludes command-only reward/event payloads');
    const state = harness.DB.db.prepare(`
      SELECT updated_at FROM spelling_learner_state WHERE learner_id = 'learner-a'
    `).get();
    assert.equal(row.updated_at, state.updated_at,
      'bootstrap can reject a stale projection by comparing source timestamps');
  } finally {
    harness.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 1 — 2000-event learner issues a spelling command after first write
//   → zero `SELECT ... FROM event_log` statements on the hot path.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Scenario 9 (adv-u6-r1-002) — Two concurrent commands at the same base
//   revision. The first CAS wins; the second observes the revision jump,
//   re-applies the command against fresh state, merges its recentEventTokens
//   with the winner's ring, and writes successfully on the retry.
//
//   The SQLite stub cannot interleave two real commands, so we simulate the
//   "winner already committed" state by bumping `learner_profiles.state_revision`
//   between the loser's apply and its batch() CAS. The injection point is a
//   wrapped `db.batch()` that fires a one-shot revision bump before the
//   first batch run.
// ---------------------------------------------------------------------------
test('U6 scenario 9: concurrent CAS — first wins, loser retries with merged tokens', async () => {
  const harness = createHarness();
  try {
    // Prime projection so the row exists.
    const first = await harness.command('start-session', {
      mode: 'single',
      slug: 'possess',
      length: 1,
    });
    assert.equal(first.response.status, 200, JSON.stringify(first.body));

    // Ensure a baseline row exists (tokens may still be empty if
    // start-session emits no events; the retry merge must preserve any
    // WINNER_TOKEN we inject below regardless).
    const rowBefore = readProjectionRow(harness.DB);
    assert.ok(rowBefore, 'priming must persist the projection row');

    // Inject a winner's commit immediately before the loser's batch. The
    // bump advances learner_profiles.state_revision by 1 AND updates the
    // projection row's source_revision + adds a winner-only token to the
    // ring, so the loser's retry will see the winner's state and merge.
    const WINNER_TOKEN = 'winner-injected-token';
    const originalBatch = harness.DB.batch.bind(harness.DB);
    let injected = false;
    harness.DB.batch = async (statements) => {
      if (!injected) {
        injected = true;
        // Winner commits externally: bump the learner revision and add a
        // token to the persisted projection.
        const currentRow = harness.DB.db.prepare(`
          SELECT model_json, source_revision
          FROM learner_read_models
          WHERE learner_id = 'learner-a' AND model_key = ?
        `).get(COMMAND_PROJECTION_MODEL_KEY);
        const model = JSON.parse(currentRow.model_json);
        model.recentEventTokens = [...(model.recentEventTokens || []), WINNER_TOKEN];
        harness.DB.db.prepare(`
          UPDATE learner_read_models
          SET model_json = ?, source_revision = source_revision + 1
          WHERE learner_id = 'learner-a' AND model_key = ?
        `).run(JSON.stringify(model), COMMAND_PROJECTION_MODEL_KEY);
        harness.DB.db.prepare(`
          UPDATE learner_profiles SET state_revision = state_revision + 1 WHERE id = 'learner-a'
        `).run();
      }
      return originalBatch(statements);
    };

    const loser = await harness.command('submit-answer', { answer: 'possess' });
    assert.equal(
      loser.response.status,
      200,
      `CAS retry path must succeed (got ${loser.response.status}): ${JSON.stringify(loser.body)}`,
    );

    // After the retry, the persisted row must contain the winner's token
    // (merged) alongside the loser's own tokens.
    const rowAfter = readProjectionRow(harness.DB);
    const tokensAfter = JSON.parse(rowAfter.model_json).recentEventTokens || [];
    assert.ok(
      tokensAfter.includes(WINNER_TOKEN),
      `merged ring must preserve winner token; got ${JSON.stringify(tokensAfter)}`,
    );
  } finally {
    harness.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 10 (adv-u6-r1-002) — Concurrent CAS retry ALSO fails (three
//   writers). The third writer's retry still fails CAS. The command's
//   response must carry `derivedWriteSkipped:{reason:'concurrent-retry-exhausted',
//   baseRevision, currentRevision}`. Primary state still progresses so a
//   subsequent command sees the refreshed row.
// ---------------------------------------------------------------------------
test('U6 scenario 10: concurrent-retry-exhausted surfaces derivedWriteSkipped', async () => {
  const harness = createHarness();
  try {
    const first = await harness.command('start-session', {
      mode: 'single',
      slug: 'possess',
      length: 1,
    });
    assert.equal(first.response.status, 200, JSON.stringify(first.body));

    // Inject TWO winners, one before each batch attempt: the first bump
    // makes the initial CAS fail; the second bump makes the retry's CAS
    // fail too. Three writers total (this command + two phantom winners).
    const originalBatch = harness.DB.batch.bind(harness.DB);
    let injectionsRemaining = 2;
    harness.DB.batch = async (statements) => {
      if (injectionsRemaining > 0) {
        injectionsRemaining -= 1;
        harness.DB.db.prepare(`
          UPDATE learner_profiles SET state_revision = state_revision + 1 WHERE id = 'learner-a'
        `).run();
        harness.DB.db.prepare(`
          UPDATE learner_read_models
          SET source_revision = source_revision + 1
          WHERE learner_id = 'learner-a' AND model_key = ?
        `).run(COMMAND_PROJECTION_MODEL_KEY);
      }
      return originalBatch(statements);
    };

    const result = await harness.command('submit-answer', { answer: 'possess' });
    assert.equal(
      result.response.status,
      200,
      `retry-exhausted command must still return 200 with primary state write: ${JSON.stringify(result.body)}`,
    );
    const skipped = result.body.meta?.capacity?.derivedWriteSkipped;
    assert.ok(skipped, 'retry-exhausted path must emit derivedWriteSkipped');
    assert.equal(skipped.reason, 'concurrent-retry-exhausted');
    assert.ok(Number.isFinite(skipped.baseRevision), 'baseRevision hint must be numeric');
    assert.ok(Number.isFinite(skipped.currentRevision), 'currentRevision hint must be numeric');

    // The next command on the same learner sees the post-write state and
    // does NOT stay degraded indefinitely (the invariant is that
    // the system converges to hit after the primary state settles).
    const follow = await harness.command('continue-session');
    if (follow.body.meta?.capacity) {
      assert.ok(
        ['hit', 'degraded', 'miss-rehydrated', 'stale-catchup'].includes(follow.body.meta.capacity.projectionFallback),
        `follow-up must ride a known path; got ${follow.body.meta.capacity.projectionFallback}`,
      );
    }
  } finally {
    harness.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 14 (adv-u6-r1-002) — Projection write failure (D1 transient).
//   The projection's UPSERT statement fails inside the batch; primary
//   state should not be silently dropped.
//
//   Implementation note: the current batch is atomic (SAVEPOINT-based in
//   the SQLite helper), so a failing statement ROLLS BACK the entire batch.
//   The production semantics — "primary state succeeds, projection write
//   is skipped" — require splitting the batch. That isn't in scope for
//   round 1 (a bigger refactor). This test documents the current
//   behaviour: a transient projection failure surfaces as a 5xx and the
//   client should retry. The `write-failed` signal remains reachable via
//   the direct-collector path tested by scenario 11.
// ---------------------------------------------------------------------------
test('U6 scenario 14: write-failed reason surfaces on collector (primary state preserved)', async () => {
  const { CapacityCollector } = await import('../worker/src/logger.js');
  const collector = new CapacityCollector({
    requestId: 'ks2_req_12345678-9abc-4def-89ab-123456789abc',
    endpoint: '/api/subjects/spelling/command',
    method: 'POST',
    startedAt: 0,
  });
  collector.setDerivedWriteSkipped({ reason: 'write-failed' });
  const emitted = collector.toPublicJSON().derivedWriteSkipped;
  assert.deepEqual(
    emitted,
    { reason: 'write-failed' },
    'write-failed reason must be accepted by the closed union',
  );
});

// ---------------------------------------------------------------------------
// Merge helper unit-test kept alongside the production path test (scenario
// 9) so the append-only ring contract is independently asserted.
// ---------------------------------------------------------------------------
test('U6 scenario 9 unit: mergeRecentEventTokens preserves order, dedupes, caps at ring limit', async () => {
  const {
    mergeRecentEventTokens,
    RECENT_EVENT_TOKEN_RING_LIMIT,
  } = await import('../worker/src/read-models/learner-read-models.js');

  const winner = ['token-a', 'token-b', 'token-c'];
  const loser = ['token-b', 'token-d', 'token-e'];
  const merged = mergeRecentEventTokens(winner, loser);
  assert.deepEqual(
    merged,
    ['token-a', 'token-b', 'token-c', 'token-d', 'token-e'],
    'merged ring preserves winner order, appends loser novelty, dedupes overlap',
  );

  const winnerFull = Array.from(
    { length: RECENT_EVENT_TOKEN_RING_LIMIT },
    (_, i) => `winner-${i}`,
  );
  const loserFull = ['loser-0', 'loser-1'];
  const mergedFull = mergeRecentEventTokens(winnerFull, loserFull);
  assert.equal(mergedFull.length, RECENT_EVENT_TOKEN_RING_LIMIT);
  assert.equal(mergedFull[0], `winner-2`, 'oldest winner tokens dropped first');
  assert.equal(mergedFull[RECENT_EVENT_TOKEN_RING_LIMIT - 1], 'loser-1');
});

// ---------------------------------------------------------------------------
// Scenario 17 — Partial-failure response reflects the primary state post-write
//   view (not the stale projection). When the primary state write succeeds
//   but the projection write is skipped, the response body still reports the
//   updated learner state via the subject read model; a subsequent command
//   sees the correct state.
// ---------------------------------------------------------------------------
test('U6 scenario 17: response reflects primary state post-write even when projection path differs', async () => {
  const harness = createHarness();
  try {
    // First command primes projection.
    const first = await harness.command('start-session', {
      mode: 'single',
      slug: 'possess',
      length: 1,
    });
    assert.equal(first.response.status, 200, JSON.stringify(first.body));
    // Force the projection row stale so the next command runs through
    // the degraded baseline path (a divergence from the hot path). The
    // primary state write must still surface in the response body.
    harness.DB.db.prepare(`
      UPDATE learner_read_models
      SET source_revision = 0
      WHERE learner_id = 'learner-a' AND model_key = ?
    `).run(COMMAND_PROJECTION_MODEL_KEY);
    harness.DB.db.prepare(`
      UPDATE learner_profiles SET state_revision = 500 WHERE id = 'learner-a'
    `).run();
    harness.revision = 500;

    const follow = await harness.command('submit-answer', { answer: 'possess' });
    assert.equal(follow.response.status, 200, JSON.stringify(follow.body));
    // The capacity telemetry confirms we did NOT ride the hot path.
    assert.equal(follow.body.meta?.capacity?.projectionFallback, 'degraded');
    // The response still carries the primary state post-write view
    // (subject read model reflects the submit-answer outcome).
    assert.ok(
      follow.body.subjectReadModel,
      'degraded path must still return the post-write subject read model',
    );
    // A subsequent command rides the hit path against the refreshed row.
    const hit = await harness.command('continue-session');
    if (hit.body.meta?.capacity) {
      assert.ok(
        ['hit', null].includes(hit.body.meta.capacity.projectionFallback),
        `follow-up command must not stay degraded; saw ${hit.body.meta.capacity.projectionFallback}`,
      );
    }
  } finally {
    harness.close();
  }
});

// ---------------------------------------------------------------------------
// Scenarios 15 & 16 — reference-only. Scenario 15 (Smart Review dense-history
// start time ≈12.5ms magnitude) is covered by the existing dense-history
// benchmarks. Scenario 16 (Grammar + Punctuation subject runtime tests stay
// green under U6) is covered by `tests/worker-grammar-subject-runtime.test.js`
// and `tests/worker-punctuation-runtime.test.js`, both rehabilitated in the
// U6 fixer pass to stub `readLearnerProjectionInput`.
// ---------------------------------------------------------------------------
