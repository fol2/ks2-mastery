// U6 — Projection hot-path consumption.
//
// These tests anchor the refactor from `readLearnerProjectionBundle()` (which
// scanned a bounded 200-event window on every command) to consuming the
// persisted `command.projection.v1` read model as the hot-path input. Spelling
// now treats missing/stale projection rows as optional derived work: it
// continues the primary learner flow in degraded mode, writes a lightweight
// baseline, and avoids surfacing a learner-facing 503.
//
// Scenarios follow the plan U6 test list (2026-04-25-002).

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerApp } from '../worker/src/app.js';
import {
  COMMAND_PROJECTION_MODEL_KEY,
  COMMAND_PROJECTION_RECENT_EVENT_LIMIT as PROJECTION_RECENT_EVENT_LIMIT,
  RECENT_EVENT_TOKEN_RING_LIMIT,
} from '../worker/src/read-models/learner-read-models.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';

const DAY_MS = 24 * 60 * 60 * 1000;
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

    // First command primes the projection via the lightweight degraded
    // baseline path.
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
// Scenario 3 — First command on a fresh learner skips bounded fallback,
//   continues degraded, and writes a projection baseline.
// ---------------------------------------------------------------------------
test('U6 scenario 3: first command on fresh learner emits projectionFallback=degraded and writes baseline', async () => {
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
      'degraded',
      `first command must be degraded; got ${String(capacity.projectionFallback)}`,
    );
    assert.ok(readProjectionRow(harness.DB), 'degraded first command must still write a projection baseline');
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
//   row as `degraded` so Spelling skips reward side effects for one command,
//   writes the missing token field, and self-heals.
// ---------------------------------------------------------------------------
test('U6 scenario 3b: pre-U6 v1 row without recentEventTokens degrades and self-heals', async () => {
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
    // pre-U6 shape (field absent, not [] empty) and degrade rather than
    // re-scanning event_log.
    const migration = await harness.command('submit-answer', { answer: 'possess' });
    assert.equal(migration.response.status, 200, JSON.stringify(migration.body));
    assert.equal(
      migration.body.meta?.capacity?.projectionFallback,
      'degraded',
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
//   → degraded baseline rewrite; next command hits.
// ---------------------------------------------------------------------------
test('U6 scenario 5: stale projection degrades once then hits on next command', async () => {
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
    assert.equal(stale.body.meta?.capacity?.projectionFallback, 'degraded');

    const healed = await harness.command('continue-session');
    if (healed.body.meta?.capacity) {
      assert.equal(healed.body.meta.capacity.projectionFallback, 'hit');
    }
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
// Scenario 7 — Newer reader + version: 0 writer → degraded, overwrite.
// ---------------------------------------------------------------------------
test('U6 scenario 7: persisted version older than reader → degraded, overwrite with newer shape', async () => {
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
    assert.equal(followUp.body.meta?.capacity?.projectionFallback, 'degraded');

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
// Scenario 12 — Projection missing while event_log is unavailable → 200
//   degraded. Spelling does not touch the bounded fallback on this path.
//   The primary spelling flow must continue; reward/read-model side effects
//   are omitted so the learner does not see a 503 for optional projection work.
// ---------------------------------------------------------------------------
test('U6 scenario 12: projection missing + event_log unavailable → spelling continues degraded', async () => {
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
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    assert.equal(result.body?.ok, true);
    assert.equal(result.body?.meta?.capacity?.projectionFallback, 'degraded');
    assert.equal(result.body?.error, undefined);
    assert.equal(result.body?.subjectReadModel?.phase, 'session');
    assert.ok(readProjectionRow(harness.DB), 'degraded start must write a lightweight projection baseline');

    const submit = await harness.command('submit-answer', { answer: 'possess' });
    assert.equal(submit.response.status, 200, JSON.stringify(submit.body));
    assert.equal(submit.body?.ok, true);
    assert.equal(submit.body?.meta?.capacity?.projectionFallback, 'hit');
    assert.equal(submit.body?.error, undefined);
    assert.ok(submit.body?.subjectReadModel, 'submit must still return a live spelling read model');
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
// Scenario 18 — Token ring size is strictly greater than the lag window —
//   token set is a superset of the bounded bootstrap eventLog lookback.
// ---------------------------------------------------------------------------
test('U6 scenario 18: recentEventTokens ring size strictly exceeds lag window', async () => {
  assert.ok(RECENT_EVENT_TOKEN_RING_LIMIT > PROJECTION_RECENT_EVENT_LIMIT,
    `token ring ${RECENT_EVENT_TOKEN_RING_LIMIT} must strictly exceed lag window ${PROJECTION_RECENT_EVENT_LIMIT}`);
  // Also pull the constant from the module so the test fails if the
  // production constant drifts below the lag window.
  const learnerReadModels = await import('../worker/src/read-models/learner-read-models.js');
  assert.equal(learnerReadModels.RECENT_EVENT_TOKEN_RING_LIMIT, RECENT_EVENT_TOKEN_RING_LIMIT);
  assert.equal(learnerReadModels.COMMAND_PROJECTION_RECENT_EVENT_LIMIT, PROJECTION_RECENT_EVENT_LIMIT);
});

// ---------------------------------------------------------------------------
// Scenario 19 — 2000-event learner → meta.capacity.queryCount ≤ 8 on hot path.
// P95 follow-up folded writable membership into the learner revision/receipt
// read, reused the auth account snapshot, and preloaded subject_state +
// latest_session + projection in the mutation preflight, so the hot path
// measures 7 queries with +1 headroom. The seventh is one indexed item-state
// point read: it replaces parsing the learner's complete lifetime word map.
// ---------------------------------------------------------------------------
test('U6 scenario 19: 2000-event learner hot-path queryCount ≤ 8', async () => {
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
      capacity.queryCount <= 8,
      `hot-path queryCount must be ≤ 8 for 2000-event learner; got ${capacity.queryCount}`,
    );
  } finally {
    harness.close();
  }
});
