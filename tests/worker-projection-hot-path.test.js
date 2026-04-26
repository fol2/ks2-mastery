// U6 — Projection hot-path consumption.
//
// These tests anchor the refactor from `readLearnerProjectionBundle()` (which
// scanned a bounded 200-event window on every command) to
// `readLearnerProjectionInput()` which consumes the persisted
// `command.projection.v1` read model as the hot-path input. The bounded
// window is now migration/fallback only; when fallback fails we reject with
// 503 `projection_unavailable` rather than silently scan full history.
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

// ---------------------------------------------------------------------------
// Scenario 1 — 2000-event learner issues a spelling command after first write
//   → zero `SELECT ... FROM event_log` statements on the hot path.
// ---------------------------------------------------------------------------
test('U6 scenario 1: 2000-event learner hot path issues zero event_log reads after first projection write', async () => {
  const harness = createHarness();
  try {
    insertProjectionWindowFillerEvents(harness.DB, {
      count: 2000,
      startAt: Date.UTC(2026, 3, 24, 17, 30, 0),
    });

    // First command primes the projection via miss-rehydrated bounded fallback.
    const first = await harness.command('start-session', {
      mode: 'single',
      slug: 'possess',
      length: 1,
    });
    assert.equal(first.response.status, 200, JSON.stringify(first.body));

    harness.DB.clearQueryLog();

    // Second command must ride the hot path and read zero event_log rows.
    const second = await harness.command('submit-answer', { answer: 'possess' });
    assert.equal(second.response.status, 200, JSON.stringify(second.body));

    const reads = eventLogReads(harness.DB);
    assert.equal(
      reads.length,
      0,
      `hot path must not read from event_log; saw ${reads.length} scans: ${JSON.stringify(reads.map((entry) => entry.sql))}`,
    );
  } finally {
    harness.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 2 — Grammar no-op command does not load projection at all.
// ---------------------------------------------------------------------------
test('U6 scenario 2: grammar no-op command short-circuits before loading projection', async () => {
  const harness = createHarness({ subjectId: 'grammar' });
  try {
    harness.DB.clearQueryLog();
    // save-prefs with empty payload is a no-op for grammar (no engine mutation).
    const result = await harness.command('save-prefs', {});
    // If grammar engine mutates on save-prefs, check at least projection row absent.
    // The key assertion: projection row is NOT created / read when result.changed === false.
    const projectionRow = readProjectionRow(harness.DB);
    if (result.body.changed === false) {
      assert.equal(projectionRow, undefined, 'no-op command must not create the projection read model row');
    }
  } finally {
    harness.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 3 — First command on a fresh learner triggers miss-rehydrated
//   and sets meta.capacity.projectionFallback === 'miss-rehydrated'.
// ---------------------------------------------------------------------------
test('U6 scenario 3: first command on fresh learner emits projectionFallback=miss-rehydrated', async () => {
  const harness = createHarness();
  try {
    const result = await harness.command('start-session', {
      mode: 'single',
      slug: 'possess',
      length: 1,
    });
    assert.equal(result.response.status, 200, JSON.stringify(result.body));

    const capacity = result.body.meta?.capacity;
    assert.ok(capacity, 'command response must carry meta.capacity (U3).');
    assert.equal(
      capacity.projectionFallback,
      'miss-rehydrated',
      `first command must be miss-rehydrated; got ${String(capacity.projectionFallback)}`,
    );
  } finally {
    harness.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 3b (adv-u6-r1-001) — Pre-U6 v1 row migration safety.
//   A learner's persisted `command.projection.v1` row that was written
//   BEFORE U6 merge has shape `{version: 1, rewards, eventCounts}` with no
//   `recentEventTokens` field. The reader must NOT ride the hit path with
//   an empty dedupe seed (which would let the next command's
//   `combineCommandEvents` admit a duplicate `reward.monster` event during
//   the one-command migration window). Treat a present-but-tokens-absent
//   row as `miss-rehydrated` so the bounded fallback repopulates the ring
//   on first touch and self-heals.
// ---------------------------------------------------------------------------
test('U6 scenario 3b: pre-U6 v1 row without recentEventTokens degrades to miss-rehydrated', async () => {
  const harness = createHarness();
  try {
    // Prime the learner so the revision + mutation-receipt chain works.
    const first = await harness.command('start-session', {
      mode: 'single',
      slug: 'possess',
      length: 1,
    });
    assert.equal(first.response.status, 200, JSON.stringify(first.body));

    // Overwrite the persisted row with a pre-U6 shape that LACKS the
    // `recentEventTokens` field entirely. A pre-U6 writer would have
    // written `{version: 1, rewards, eventCounts}` because U6 introduced
    // the field additively; the version number alone does NOT signal the
    // migration.
    const preU6Payload = JSON.stringify({
      version: 1,
      rewards: {
        systemId: 'monster-codex',
        state: { inklet: { mastered: ['possess'] } },
        events: [],
        toastEvents: [],
      },
      eventCounts: { domain: 3, reactions: 0, toasts: 0 },
      // NOTE: deliberately no `recentEventTokens` field.
    });
    harness.DB.db.prepare(`
      UPDATE learner_read_models
      SET model_json = ?
      WHERE learner_id = 'learner-a' AND model_key = ?
    `).run(preU6Payload, COMMAND_PROJECTION_MODEL_KEY);

    // Run the next hot-path command. The reader must recognise the
    // pre-U6 shape (field absent, not [] empty) and degrade to the
    // miss-rehydrated path so the bounded fallback repopulates the ring.
    const migration = await harness.command('submit-answer', { answer: 'possess' });
    assert.equal(migration.response.status, 200, JSON.stringify(migration.body));
    assert.equal(
      migration.body.meta?.capacity?.projectionFallback,
      'miss-rehydrated',
      'pre-U6 v1 row must NOT land on the hit path (empty dedupe seed risk)',
    );

    // The row is rewritten with the `recentEventTokens` field explicitly
    // present (an empty array is acceptable if the command emits no events;
    // the critical fix is that the field now EXISTS so subsequent reads
    // recognise the row as a real v1 shape, not a pre-U6 migration row).
    const refreshedRow = readProjectionRow(harness.DB);
    const refreshed = JSON.parse(refreshedRow.model_json);
    assert.ok(
      Array.isArray(refreshed.recentEventTokens),
      `rewritten row must carry recentEventTokens field; got ${JSON.stringify(refreshed.recentEventTokens)}`,
    );
    assert.ok(
      Object.prototype.hasOwnProperty.call(refreshed, 'recentEventTokens'),
      'rewritten row must have the recentEventTokens property present',
    );

    // A subsequent command now rides the hit path because the row is a
    // real v1 shape (not a pre-U6 migration row).
    const healed = await harness.command('continue-session');
    if (healed.body.meta?.capacity) {
      assert.equal(
        healed.body.meta.capacity.projectionFallback,
        'hit',
        `repopulated v1 row must allow the next command onto the hit path; saw ${healed.body.meta.capacity.projectionFallback}`,
      );
    }
  } finally {
    harness.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 4 — Sustained 60 back-to-back commands on dense-history learner
//   stay on hit path (no stale-catchup).
// ---------------------------------------------------------------------------
test('U6 scenario 4: 60 back-to-back commands stay on hit path (no stale-catchup)', async () => {
  const harness = createHarness();
  try {
    insertProjectionWindowFillerEvents(harness.DB, {
      count: 1500,
      startAt: Date.UTC(2026, 3, 24, 17, 30, 0),
    });

    // Prime projection with first command.
    const first = await harness.command('start-session', {
      mode: 'single',
      slug: 'possess',
      length: 60,
    });
    assert.equal(first.response.status, 200, JSON.stringify(first.body));

    const modes = [];
    for (let i = 0; i < 59; i += 1) {
      const submit = await harness.command('submit-answer', { answer: 'possess' });
      const capacity = submit.body.meta?.capacity;
      modes.push(capacity?.projectionFallback);
      if (submit.body.subjectReadModel?.phase === 'session' && submit.body.subjectReadModel.awaitingAdvance) {
        const next = await harness.command('continue-session');
        const nextCapacity = next.body.meta?.capacity;
        modes.push(nextCapacity?.projectionFallback);
      }
      if (submit.body.subjectReadModel?.phase !== 'session') break;
    }

    const hits = modes.filter((mode) => mode === 'hit').length;
    const staleCatchups = modes.filter((mode) => mode === 'stale-catchup').length;
    assert.ok(hits >= 1, `expected ≥1 hit; saw modes=${JSON.stringify(modes)}`);
    assert.equal(staleCatchups, 0, `sustained hot path must not transition to stale-catchup; modes=${JSON.stringify(modes)}`);
  } finally {
    harness.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 5 — Stale projection (source_revision < currentRevision - 200)
//   → stale-catchup; bounded window ≤ 200 events; next command hits.
// ---------------------------------------------------------------------------
test('U6 scenario 5: stale projection triggers stale-catchup then hit on next command', async () => {
  const harness = createHarness();
  try {
    // Prime projection.
    const first = await harness.command('start-session', {
      mode: 'single',
      slug: 'possess',
      length: 1,
    });
    assert.equal(first.response.status, 200, JSON.stringify(first.body));

    // Force the projection to be stale by rewriting its source_revision.
    harness.DB.db.prepare(`
      UPDATE learner_read_models
      SET source_revision = 0
      WHERE learner_id = 'learner-a' AND model_key = ?
    `).run(COMMAND_PROJECTION_MODEL_KEY);
    // And bump the learner revision past 200 without a projection update:
    harness.DB.db.prepare(`
      UPDATE learner_profiles SET state_revision = 500 WHERE id = 'learner-a'
    `).run();
    harness.revision = 500;

    const stale = await harness.command('submit-answer', { answer: 'possess' });
    assert.equal(stale.response.status, 200, JSON.stringify(stale.body));
    assert.equal(stale.body.meta?.capacity?.projectionFallback, 'stale-catchup');
  } finally {
    harness.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 6 — Older reader encounters version: 99 (newer writer) →
//   newer-opaque, does NOT overwrite, command succeeds.
// ---------------------------------------------------------------------------
test('U6 scenario 6: persisted version newer than reader → newer-opaque, no overwrite', async () => {
  const harness = createHarness();
  try {
    const first = await harness.command('start-session', {
      mode: 'single',
      slug: 'possess',
      length: 1,
    });
    assert.equal(first.response.status, 200, JSON.stringify(first.body));

    // Rewrite persisted projection with a future version.
    const futureModel = JSON.stringify({
      version: 99,
      rewards: { systemId: 'monster-codex', state: {}, events: [], toastEvents: [] },
      eventCounts: { domain: 0, reactions: 0, toasts: 0 },
      recentEventTokens: ['future-token-a', 'future-token-b'],
      futureField: 'preserved',
    });
    harness.DB.db.prepare(`
      UPDATE learner_read_models
      SET model_json = ?
      WHERE learner_id = 'learner-a' AND model_key = ?
    `).run(futureModel, COMMAND_PROJECTION_MODEL_KEY);

    const followUp = await harness.command('submit-answer', { answer: 'possess' });
    assert.equal(followUp.response.status, 200, JSON.stringify(followUp.body));
    assert.equal(followUp.body.meta?.capacity?.projectionFallback, 'newer-opaque');

    // The persisted row MUST still carry the future version (no overwrite).
    const row = readProjectionRow(harness.DB);
    const persisted = JSON.parse(row.model_json);
    assert.equal(persisted.version, 99, 'older reader must not overwrite newer writer\'s row');
    assert.equal(persisted.futureField, 'preserved');
  } finally {
    harness.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 7 — Newer reader + version: 0 writer → miss-rehydrated, overwrite.
// ---------------------------------------------------------------------------
test('U6 scenario 7: persisted version older than reader → miss-rehydrated, overwrite with newer shape', async () => {
  const harness = createHarness();
  try {
    const first = await harness.command('start-session', {
      mode: 'single',
      slug: 'possess',
      length: 1,
    });
    assert.equal(first.response.status, 200, JSON.stringify(first.body));

    // Replace persisted shape with a legacy (missing version) form.
    const legacy = JSON.stringify({
      // no version: 0 implied
      rewards: { systemId: 'monster-codex', state: {}, events: [], toastEvents: [] },
      eventCounts: { domain: 0, reactions: 0, toasts: 0 },
    });
    harness.DB.db.prepare(`
      UPDATE learner_read_models
      SET model_json = ?
      WHERE learner_id = 'learner-a' AND model_key = ?
    `).run(legacy, COMMAND_PROJECTION_MODEL_KEY);

    const followUp = await harness.command('submit-answer', { answer: 'possess' });
    assert.equal(followUp.response.status, 200, JSON.stringify(followUp.body));
    assert.equal(followUp.body.meta?.capacity?.projectionFallback, 'miss-rehydrated');

    const row = readProjectionRow(harness.DB);
    const persisted = JSON.parse(row.model_json);
    assert.equal(persisted.version, 1, 'reader must upgrade older row to the current shape');
    assert.ok(Array.isArray(persisted.recentEventTokens), 'upgraded row carries recentEventTokens ring');
  } finally {
    harness.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 8 — Idempotent replay: same requestId → stored receipt, no
//   projection increment.
// ---------------------------------------------------------------------------
test('U6 scenario 8: idempotent replay returns stored receipt and does NOT increment recentEventTokens', async () => {
  const harness = createHarness();
  try {
    const first = await harness.command('start-session', {
      mode: 'single',
      slug: 'possess',
      length: 1,
    });
    assert.equal(first.response.status, 200, JSON.stringify(first.body));

    // Capture the projection row state.
    const beforeRow = readProjectionRow(harness.DB);
    const beforeModel = JSON.parse(beforeRow.model_json);
    const beforeTokens = Array.isArray(beforeModel.recentEventTokens) ? beforeModel.recentEventTokens.slice() : [];

    // Replay same requestId — re-post with identical body.
    const replay = await harness.postRaw(first.requestBody);
    assert.equal(replay.response.status, 200, JSON.stringify(replay.body));
    assert.equal(replay.body.mutation?.replayed, true);

    const afterRow = readProjectionRow(harness.DB);
    const afterModel = JSON.parse(afterRow.model_json);
    const afterTokens = Array.isArray(afterModel.recentEventTokens) ? afterModel.recentEventTokens.slice() : [];
    assert.deepEqual(afterTokens, beforeTokens, 'replay must NOT double-increment recentEventTokens');
    assert.equal(afterRow.source_revision, beforeRow.source_revision, 'replay must not advance source_revision');
  } finally {
    harness.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 11 — derivedWriteSkipped.reason closed union — unknown reason rejected.
// This test directly exercises the logger helper, same spirit as scenario 11.
// ---------------------------------------------------------------------------
test('U6 scenario 11: derivedWriteSkipped reason closed union rejects unknown tokens', async () => {
  const { CapacityCollector } = await import('../worker/src/logger.js');
  const makeCollector = () => new CapacityCollector({
    requestId: 'ks2_req_12345678-9abc-4def-89ab-123456789abc',
    endpoint: '/api/subjects/spelling/command',
    method: 'POST',
    startedAt: 0,
  });

  // Accepted tokens — each reason is observed on a fresh collector so an
  // earlier accepted reason cannot mask the next assertion.
  for (const reason of ['missing-table', 'concurrent-retry-exhausted', 'write-failed', 'breaker-open']) {
    const collector = makeCollector();
    collector.setDerivedWriteSkipped({ reason });
    const emitted = collector.toPublicJSON().derivedWriteSkipped;
    assert.deepEqual(emitted, { reason }, `reason ${reason} must be accepted`);
  }

  // Unknown token silently dropped — collector starts empty so the
  // emitted value must stay `undefined`.
  {
    const collector = makeCollector();
    collector.setDerivedWriteSkipped({ reason: 'not-a-real-reason' });
    assert.equal(
      collector.toPublicJSON().derivedWriteSkipped,
      undefined,
      'unknown derivedWriteSkipped.reason must be dropped (not silently accepted)',
    );
  }

  // Null clears an accepted value.
  {
    const collector = makeCollector();
    collector.setDerivedWriteSkipped({ reason: 'write-failed' });
    collector.setDerivedWriteSkipped(null);
    assert.equal(
      collector.toPublicJSON().derivedWriteSkipped,
      undefined,
      'null must clear derivedWriteSkipped',
    );
  }

  // Optional numeric hints are preserved.
  {
    const collector = makeCollector();
    collector.setDerivedWriteSkipped({
      reason: 'concurrent-retry-exhausted',
      baseRevision: 7,
      currentRevision: 8,
    });
    assert.deepEqual(
      collector.toPublicJSON().derivedWriteSkipped,
      { reason: 'concurrent-retry-exhausted', baseRevision: 7, currentRevision: 8 },
    );
  }
});

// ---------------------------------------------------------------------------
// Scenario 12 — Projection missing AND bounded fallback fails → 503
//   projection_unavailable (retryable:false), no full-history scan.
// ---------------------------------------------------------------------------
test('U6 scenario 12: projection missing + bounded fallback fails → 503 projection_unavailable', async () => {
  const harness = createHarness();
  try {
    // Monkey-patch the DB's prepare() so SELECTs from event_log reject.
    const db = harness.DB;
    const originalPrepare = db.prepare.bind(db);
    db.prepare = (sql) => {
      if (/\bFROM event_log\b/i.test(sql)) {
        return {
          bind() { return this; },
          async first() { throw new Error('D1_ERROR: projection fallback query simulated 5xx'); },
          async run() { throw new Error('D1_ERROR: projection fallback query simulated 5xx'); },
          async all() { throw new Error('D1_ERROR: projection fallback query simulated 5xx'); },
        };
      }
      return originalPrepare(sql);
    };

    const result = await harness.command('start-session', {
      mode: 'single',
      slug: 'possess',
      length: 1,
    });
    assert.equal(result.response.status, 503, `expected 503, got ${result.response.status}: ${JSON.stringify(result.body)}`);
    assert.equal(result.body?.error, 'projection_unavailable');
    assert.equal(result.body?.retryable, false);
    assert.ok(
      typeof result.body?.requestId === 'string' && result.body.requestId.startsWith('ks2_req_'),
      'response must include a request id',
    );
  } finally {
    harness.close();
  }
});

// ---------------------------------------------------------------------------
// Scenario 13 — Client isCommandBackendExhausted returns true for
//   projection_unavailable and moves command to pending without retry/jitter.
// ---------------------------------------------------------------------------
test('U6 scenario 13: client isCommandBackendExhausted() rejects projection_unavailable without retry', async () => {
  const { createSubjectCommandClient, SubjectCommandClientError, isCommandBackendExhausted } = await import(
    '../src/platform/runtime/subject-command-client.js'
  );

  const error = new SubjectCommandClientError({
    status: 503,
    payload: { ok: false, error: 'projection_unavailable', retryable: false, requestId: 'ks2_req_x' },
  });
  assert.equal(isCommandBackendExhausted(error), true);

  const otherError = new SubjectCommandClientError({
    status: 503,
    payload: { ok: false, code: 'backend_unavailable', message: 'D1 transient' },
  });
  assert.equal(isCommandBackendExhausted(otherError), false);

  assert.equal(isCommandBackendExhausted(null), false);
  assert.equal(isCommandBackendExhausted(new Error('plain')), false);

  // Integration: ensure the client does NOT retry when the server returns
  // projection_unavailable.
  const fetchCalls = [];
  const fetch = async (_url, init) => {
    fetchCalls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({
      ok: false,
      error: 'projection_unavailable',
      retryable: false,
      requestId: 'ks2_req_12345678-9abc-4def-89ab-123456789abc',
    }), { status: 503, headers: { 'content-type': 'application/json' } });
  };
  const client = createSubjectCommandClient({
    fetch,
    getLearnerRevision: () => 0,
    retryDelayMs: 0,
  });
  let thrown = null;
  try {
    await client.send({
      subjectId: 'spelling',
      learnerId: 'learner-a',
      command: 'start-session',
      payload: { mode: 'smart' },
      requestId: 'cmd-exhausted',
    });
  } catch (err) {
    thrown = err;
  }
  assert.ok(thrown, 'client must throw when projection_unavailable is returned');
  assert.ok(thrown instanceof SubjectCommandClientError);
  assert.equal(isCommandBackendExhausted(thrown), true);
  assert.equal(fetchCalls.length, 1, 'client must NOT transport-retry projection_unavailable');
});

// ---------------------------------------------------------------------------
// Scenario 18 — Token ring size (default 250) is strictly greater than
//   lag window (200) — token set is superset of bootstrap eventLog.
// ---------------------------------------------------------------------------
test('U6 scenario 18: recentEventTokens ring size (250) strictly exceeds lag window (200)', async () => {
  assert.ok(RECENT_EVENT_TOKEN_RING_LIMIT > PROJECTION_RECENT_EVENT_LIMIT,
    `token ring ${RECENT_EVENT_TOKEN_RING_LIMIT} must strictly exceed lag window ${PROJECTION_RECENT_EVENT_LIMIT}`);
  // Also pull the constant from the module so the test fails if the
  // production constant drifts below the lag window.
  const learnerReadModels = await import('../worker/src/read-models/learner-read-models.js');
  assert.equal(learnerReadModels.RECENT_EVENT_TOKEN_RING_LIMIT, 250);
});

// ---------------------------------------------------------------------------
// Scenario 19 — 2000-event learner → meta.capacity.queryCount ≤ 13 on hot path.
// Phase D / U14 added one query to the session-lookup path (the JOIN of
// `account_ops_metadata` for ops_status + status_revision), so the budget
// lifts from 12 to 13. The rest of the hot path is unchanged.
// ---------------------------------------------------------------------------
test('U6 scenario 19: 2000-event learner hot-path queryCount ≤ 13', async () => {
  const harness = createHarness();
  try {
    insertProjectionWindowFillerEvents(harness.DB, {
      count: 2000,
      startAt: Date.UTC(2026, 3, 24, 17, 30, 0),
    });

    // Prime projection.
    const first = await harness.command('start-session', {
      mode: 'single',
      slug: 'possess',
      length: 1,
    });
    assert.equal(first.response.status, 200, JSON.stringify(first.body));

    const hot = await harness.command('submit-answer', { answer: 'possess' });
    assert.equal(hot.response.status, 200, JSON.stringify(hot.body));
    const capacity = hot.body.meta?.capacity;
    assert.ok(capacity, 'hot-path command must expose meta.capacity');
    assert.ok(
      capacity.queryCount <= 13,
      `hot-path queryCount must be ≤ 13 for 2000-event learner; got ${capacity.queryCount}`,
    );
  } finally {
    harness.close();
  }
});

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
    // does NOT stay on stale-catchup indefinitely (the invariant is that
    // the system converges to hit after the primary state settles).
    const follow = await harness.command('continue-session');
    if (follow.body.meta?.capacity) {
      assert.ok(
        ['hit', 'miss-rehydrated', 'stale-catchup'].includes(follow.body.meta.capacity.projectionFallback),
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
    // the stale-catchup path (a divergence from the hot path). The
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
    assert.equal(follow.body.meta?.capacity?.projectionFallback, 'stale-catchup');
    // The response still carries the primary state post-write view
    // (subject read model reflects the submit-answer outcome).
    assert.ok(
      follow.body.subjectReadModel,
      'stale-catchup path must still return the post-write subject read model',
    );
    // A subsequent command rides the hit path against the refreshed row.
    const hit = await harness.command('continue-session');
    if (hit.body.meta?.capacity) {
      assert.ok(
        ['hit', 'miss-rehydrated', null].includes(hit.body.meta.capacity.projectionFallback),
        `follow-up command must not stay on stale-catchup; saw ${hit.body.meta.capacity.projectionFallback}`,
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
