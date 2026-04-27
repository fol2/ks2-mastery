import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerApp } from '../worker/src/app.js';
import { createWorkerSubjectRuntime } from '../worker/src/subjects/runtime.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';

// Phase 4 U9 — Worker `record-event` command handler tests. Covers:
//   - Happy path: valid kind + allowlisted payload → 200, one row inserted.
//   - Reject unknown kind with 400 `punctuation_event_unknown_kind`.
//   - Reject unknown field with 400 `punctuation_event_field_rejected`.
//   - Reject `answerText` on `answer-submitted` (PII wall, HIGH).
//   - Reject wrong-typed field (e.g. `correct: 'yes'` instead of boolean).
//   - Feature flag OFF → 200 with `{recorded: false}` and zero rows written.
//   - Authz fail: non-owner learnerId → 403 and zero rows written.
//   - Query endpoint returns inserted events in reverse-chronological order.
//   - Query endpoint enforces the limit cap (max 1000; default 100).
//   - Query endpoint rejects non-owner learnerId with 403.

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

function seedSecondLearner(DB, { learnerId = 'learner-b' } = {}) {
  const now = Date.UTC(2026, 0, 1);
  DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES (?, 'Learner B', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(learnerId, now, now);
  // No membership → adult-a cannot write or read for learner-b.
}

function createHarness({ eventsEnabled = true, envOverrides = {} } = {}) {
  const nowRef = { value: Date.UTC(2026, 0, 1) };
  const DB = createMigratedSqliteD1Database();
  seedAccountLearner(DB);
  seedSecondLearner(DB);
  const app = createWorkerApp({
    now: () => nowRef.value,
    subjectRuntime: createWorkerSubjectRuntime({ punctuation: { random: () => 0 } }),
  });
  const env = {
    DB,
    AUTH_MODE: 'development-stub',
    ENVIRONMENT: 'test',
    PUNCTUATION_SUBJECT_ENABLED: 'true',
    PUNCTUATION_EVENTS_ENABLED: eventsEnabled ? 'true' : 'false',
    ...envOverrides,
  };
  let sequence = 0;

  async function post(body, headers = {}) {
    const response = await app.fetch(new Request('https://repo.test/api/subjects/punctuation/command', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://repo.test',
        'x-ks2-dev-account-id': 'adult-a',
        ...headers,
      },
      body: JSON.stringify(body),
    }), env, {});
    return { response, body: await response.json() };
  }

  async function recordEvent({
    kind,
    payload = {},
    learnerId = 'learner-a',
    expectedLearnerRevision = 0,
  } = {}) {
    sequence += 1;
    return post({
      command: 'record-event',
      learnerId,
      requestId: `punctuation-event-${sequence}`,
      expectedLearnerRevision,
      payload: { event: kind, payload },
    });
  }

  async function getEvents({
    learnerId = 'learner-a',
    kind = null,
    since = null,
    limit = null,
    headers = {},
  } = {}) {
    const params = new URLSearchParams();
    if (learnerId) params.set('learner', learnerId);
    if (kind) params.set('kind', kind);
    if (since != null) params.set('since', String(since));
    if (limit != null) params.set('limit', String(limit));
    const url = `https://repo.test/api/subjects/punctuation/events?${params.toString()}`;
    const response = await app.fetch(new Request(url, {
      method: 'GET',
      headers: {
        origin: 'https://repo.test',
        'x-ks2-dev-account-id': 'adult-a',
        ...headers,
      },
    }), env, {});
    return { response, body: await response.json() };
  }

  function eventRowCount() {
    return Number(DB.db.prepare('SELECT COUNT(*) AS n FROM punctuation_events').get().n) || 0;
  }

  return {
    DB, app, env, nowRef, post, recordEvent, getEvents, eventRowCount,
    close() { DB.close(); },
  };
}

test('record-event inserts a row with an allowlisted payload', async () => {
  const h = createHarness();
  try {
    const { response, body } = await h.recordEvent({
      kind: 'card-opened',
      payload: { cardId: 'smart' },
    });
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.ok, true);
    assert.equal(body.recorded, true);
    assert.equal(body.enabled, true);

    assert.equal(h.eventRowCount(), 1);
    const row = h.DB.db.prepare(
      'SELECT learner_id, event_kind, payload_json, occurred_at_ms FROM punctuation_events LIMIT 1',
    ).get();
    assert.equal(row.learner_id, 'learner-a');
    assert.equal(row.event_kind, 'card-opened');
    const parsed = JSON.parse(row.payload_json);
    assert.deepEqual(parsed, { cardId: 'smart' });
    assert.equal(Number(row.occurred_at_ms) > 0, true);
  } finally {
    h.close();
  }
});

test('record-event rejects an unknown event kind with 400 punctuation_event_unknown_kind', async () => {
  const h = createHarness();
  try {
    const { response, body } = await h.recordEvent({
      kind: 'nonsense',
      payload: {},
    });
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(body.error?.code || body.code, 'punctuation_event_unknown_kind');
    assert.equal(h.eventRowCount(), 0);
  } finally {
    h.close();
  }
});

test('record-event rejects an unknown field with 400 punctuation_event_field_rejected', async () => {
  const h = createHarness();
  try {
    const { response, body } = await h.recordEvent({
      kind: 'card-opened',
      payload: { cardId: 'smart', sneaky: 'extra' },
    });
    assert.equal(response.status, 400, JSON.stringify(body));
    const code = body.error?.code || body.code;
    assert.equal(code, 'punctuation_event_field_rejected');
    const rejectedField = body.error?.rejectedField || body.rejectedField;
    assert.equal(rejectedField, 'sneaky');
    assert.equal(h.eventRowCount(), 0);
  } finally {
    h.close();
  }
});

test('record-event rejects answerText on answer-submitted (PII wall)', async () => {
  const h = createHarness();
  try {
    const { response, body } = await h.recordEvent({
      kind: 'answer-submitted',
      payload: {
        sessionId: 's1',
        itemId: 'i1',
        correct: true,
        answerText: 'here is the child answer',
      },
    });
    assert.equal(response.status, 400, JSON.stringify(body));
    const code = body.error?.code || body.code;
    assert.equal(code, 'punctuation_event_field_rejected');
    assert.equal(h.eventRowCount(), 0);
  } finally {
    h.close();
  }
});

test('record-event rejects a wrong-typed field', async () => {
  const h = createHarness();
  try {
    const { response, body } = await h.recordEvent({
      kind: 'answer-submitted',
      payload: { sessionId: 's1', itemId: 'i1', correct: 'yes' },
    });
    assert.equal(response.status, 400, JSON.stringify(body));
    const code = body.error?.code || body.code;
    assert.equal(code, 'punctuation_event_field_type_invalid');
    assert.equal(h.eventRowCount(), 0);
  } finally {
    h.close();
  }
});

test('record-event accepts the 12th kind (command-failed) with the sanctioned allowlist', async () => {
  const h = createHarness();
  try {
    const { response } = await h.recordEvent({
      kind: 'command-failed',
      payload: { command: 'start-session', errorCode: 'backend_unavailable' },
    });
    assert.equal(response.status, 200);
    assert.equal(h.eventRowCount(), 1);
  } finally {
    h.close();
  }
});

test('record-event with feature flag OFF returns 200 recorded:false and does not insert', async () => {
  const h = createHarness({ eventsEnabled: false });
  try {
    const { response, body } = await h.recordEvent({
      kind: 'card-opened',
      payload: { cardId: 'smart' },
    });
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.recorded, false);
    assert.equal(body.enabled, false);
    assert.equal(h.eventRowCount(), 0);
  } finally {
    h.close();
  }
});

test('record-event with non-owner learnerId returns 403 via requireLearnerWriteAccess', async () => {
  const h = createHarness();
  try {
    const { response, body } = await h.recordEvent({
      kind: 'card-opened',
      payload: { cardId: 'smart' },
      learnerId: 'learner-b',
    });
    assert.equal(response.status, 403, JSON.stringify(body));
    assert.equal(h.eventRowCount(), 0);
  } finally {
    h.close();
  }
});

test('GET /api/subjects/punctuation/events returns inserted rows in reverse-chronological order', async () => {
  const h = createHarness();
  try {
    // Insert three events at deterministic times.
    h.nowRef.value = Date.UTC(2026, 0, 1, 10, 0, 0);
    await h.recordEvent({ kind: 'card-opened', payload: { cardId: 'smart' } });
    h.nowRef.value = Date.UTC(2026, 0, 1, 10, 5, 0);
    await h.recordEvent({ kind: 'map-opened', payload: {} });
    h.nowRef.value = Date.UTC(2026, 0, 1, 10, 10, 0);
    await h.recordEvent({ kind: 'summary-reached', payload: { sessionId: 's1', total: 4, correct: 3, accuracy: 75 } });

    const { response, body } = await h.getEvents();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.ok(Array.isArray(body.events), 'events should be an array');
    assert.equal(body.events.length, 3);
    assert.equal(body.events[0].kind, 'summary-reached');
    assert.equal(body.events[1].kind, 'map-opened');
    assert.equal(body.events[2].kind, 'card-opened');
  } finally {
    h.close();
  }
});

test('GET events filters by kind when the kind query parameter is supplied', async () => {
  const h = createHarness();
  try {
    await h.recordEvent({ kind: 'card-opened', payload: { cardId: 'smart' } });
    await h.recordEvent({ kind: 'map-opened', payload: {} });
    await h.recordEvent({ kind: 'card-opened', payload: { cardId: 'weak' } });

    const { body } = await h.getEvents({ kind: 'card-opened' });
    assert.equal(body.events.length, 2);
    assert.ok(body.events.every((ev) => ev.kind === 'card-opened'));
  } finally {
    h.close();
  }
});

test('GET events clamps the limit to the documented maximum (500, P7-U6 hard ceiling)', async () => {
  const h = createHarness();
  try {
    const { body } = await h.getEvents({ limit: 5000 });
    // P7-U6: hard ceiling reduced from 1000 to 500 per R4 "bounded reads".
    assert.equal(body.appliedLimit, 500);
  } finally {
    h.close();
  }
});

test('GET events limit=N is honoured in range (review follow-on FINDING E.2)', async () => {
  // Plan review FINDING E.2: query branches untested. Insert 5 events
  // and confirm limit=2 returns exactly 2 rows + appliedLimit === 2.
  const h = createHarness();
  try {
    for (let i = 0; i < 5; i += 1) {
      h.nowRef.value = Date.UTC(2026, 0, 1, 10, 0, i);
      await h.recordEvent({ kind: 'card-opened', payload: { cardId: `smart-${i}` } });
    }
    const { response, body } = await h.getEvents({ limit: 2 });
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.events.length, 2);
    assert.equal(body.appliedLimit, 2);
  } finally {
    h.close();
  }
});

test('GET events limit defaults to 100 when absent (review follow-on FINDING E.3)', async () => {
  const h = createHarness();
  try {
    const { body } = await h.getEvents({});
    assert.equal(body.appliedLimit, 100, 'default limit is 100');
  } finally {
    h.close();
  }
});

test('GET events limit=0 / limit=-1 / limit=abc clamps to default 100 (review follow-on FINDING E.5)', async () => {
  const h = createHarness();
  try {
    for (const limit of [0, -1, 'abc']) {
      // eslint-disable-next-line no-await-in-loop
      const { body } = await h.getEvents({ limit });
      assert.equal(body.appliedLimit, 100, `expected default for limit=${limit}`);
    }
  } finally {
    h.close();
  }
});

test('GET events since=<timestamp> filters to events occurring at or after the cutoff (review follow-on FINDING E.1)', async () => {
  const h = createHarness();
  try {
    const t1 = Date.UTC(2026, 0, 1, 10, 0, 0);
    const t2 = Date.UTC(2026, 0, 1, 10, 5, 0);
    const t3 = Date.UTC(2026, 0, 1, 10, 10, 0);
    h.nowRef.value = t1;
    await h.recordEvent({ kind: 'card-opened', payload: { cardId: 'a' } });
    h.nowRef.value = t2;
    await h.recordEvent({ kind: 'card-opened', payload: { cardId: 'b' } });
    h.nowRef.value = t3;
    await h.recordEvent({ kind: 'card-opened', payload: { cardId: 'c' } });
    // Since the midpoint should surface the middle + last event.
    const { body } = await h.getEvents({ since: t2 });
    assert.equal(body.events.length, 2);
    const cardIds = body.events.map((ev) => ev.payload.cardId).sort();
    assert.deepEqual(cardIds, ['b', 'c']);
  } finally {
    h.close();
  }
});

test('GET events since=non-numeric is ignored (treated as "no filter")', async () => {
  // Review follow-on: FINDING E.6 — a malformed `since` should not
  // fall through to an unfiltered query by accident; the handler
  // reads `Number.isFinite(Number(sinceMs))` so garbage is ignored.
  const h = createHarness();
  try {
    await h.recordEvent({ kind: 'card-opened', payload: { cardId: 'smart' } });
    const { body } = await h.getEvents({ since: 'not-a-number' });
    assert.equal(body.events.length, 1);
  } finally {
    h.close();
  }
});

test('GET events kind=<unknown> rejects with 400 punctuation_event_unknown_kind (review follow-on FINDING A)', async () => {
  // Review follow-on: FINDING A — the previous behaviour was to
  // silently drop the `kind` filter and return the learner's full
  // event dump, which a caller could misread as "no events of that
  // kind exist". Now the Worker rejects the query explicitly.
  const h = createHarness();
  try {
    await h.recordEvent({ kind: 'card-opened', payload: { cardId: 'smart' } });
    const { response, body } = await h.getEvents({ kind: 'nonsense-kind' });
    assert.equal(response.status, 400, JSON.stringify(body));
    const code = body.error?.code || body.code;
    assert.equal(code, 'punctuation_event_unknown_kind');
  } finally {
    h.close();
  }
});

test('record-event with the same requestId twice leaves exactly one row (review follow-on FINDING B)', async () => {
  // Plan review FINDING B: duplicate retries wrote two rows. The fix
  // adds a `(learner_id, request_id)` UNIQUE index + `INSERT OR IGNORE`
  // so the second call is silently deduped. Because `record-event` is
  // a `{changed: false}` observed command, runSubjectCommandMutation
  // never writes a `mutation_receipts` row for it — so every retry
  // reaches the row-layer, where `INSERT OR IGNORE` is the only guard.
  // The handler reports `{recorded: false, deduped: true}` on the
  // dedup path so operators can distinguish a first write from a retry.
  const h = createHarness();
  try {
    const first = await h.post({
      command: 'record-event',
      learnerId: 'learner-a',
      requestId: 'dup-1',
      expectedLearnerRevision: 0,
      payload: { event: 'card-opened', payload: { cardId: 'smart' } },
    });
    assert.equal(first.response.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.recorded, true);
    assert.equal(first.body.deduped, false);
    assert.equal(h.eventRowCount(), 1);

    const second = await h.post({
      command: 'record-event',
      learnerId: 'learner-a',
      requestId: 'dup-1',
      expectedLearnerRevision: 0,
      payload: { event: 'card-opened', payload: { cardId: 'smart' } },
    });
    assert.equal(second.response.status, 200, JSON.stringify(second.body));
    assert.equal(second.body.recorded, false);
    assert.equal(second.body.deduped, true);
    assert.equal(h.eventRowCount(), 1);
  } finally {
    h.close();
  }
});

test('record-event command-failed rejects an off-enum errorCode with 400 (review follow-on FINDING F)', async () => {
  // Plan review FINDING F: `command-failed.errorCode` was free-form
  // and could smuggle PII ("dear-dr-smith-wrote-this"). The Worker now
  // restricts it to the sanctioned enum.
  const h = createHarness();
  try {
    const { response, body } = await h.recordEvent({
      kind: 'command-failed',
      payload: {
        command: 'start-session',
        errorCode: 'dear-dr-smith-wrote-this',
      },
    });
    assert.equal(response.status, 400, JSON.stringify(body));
    const code = body.error?.code || body.code;
    assert.equal(code, 'punctuation_event_errorcode_not_allowed');
    assert.equal(h.eventRowCount(), 0);
  } finally {
    h.close();
  }
});

test('record-event command-failed accepts each of the 7 sanctioned errorCodes', async () => {
  // Review follow-on: verify the complete enum round-trips so future
  // additions need to update both halves together.
  const { PUNCTUATION_TELEMETRY_ERROR_CODES } = await import(
    '../shared/punctuation/telemetry-shapes.js'
  );
  const h = createHarness();
  try {
    for (const errorCode of PUNCTUATION_TELEMETRY_ERROR_CODES) {
      // eslint-disable-next-line no-await-in-loop
      const { response } = await h.recordEvent({
        kind: 'command-failed',
        payload: { command: 'start-session', errorCode },
      });
      assert.equal(response.status, 200, `errorCode=${errorCode} should be accepted`);
    }
    assert.equal(h.eventRowCount(), PUNCTUATION_TELEMETRY_ERROR_CODES.length);
  } finally {
    h.close();
  }
});

test('GET events ORDER BY adds id DESC tiebreaker so same-ms events return in deterministic order (review follow-on FINDING C)', async () => {
  // Plan review FINDING C: `context.now` yields identical
  // `occurred_at_ms` for events emitted back-to-back inside one
  // handler invocation. Without a tiebreaker the JSON response was
  // non-deterministic. The fix adds `, id DESC` to the ORDER BY so
  // later inserts sort first.
  const h = createHarness();
  try {
    h.nowRef.value = Date.UTC(2026, 0, 1, 10, 0, 0);
    await h.recordEvent({ kind: 'card-opened', payload: { cardId: 'a' } });
    await h.recordEvent({ kind: 'card-opened', payload: { cardId: 'b' } });
    await h.recordEvent({ kind: 'card-opened', payload: { cardId: 'c' } });
    const { body } = await h.getEvents({ kind: 'card-opened' });
    assert.equal(body.events.length, 3);
    assert.equal(body.events[0].payload.cardId, 'c');
    assert.equal(body.events[1].payload.cardId, 'b');
    assert.equal(body.events[2].payload.cardId, 'a');
  } finally {
    h.close();
  }
});

test('GET events with non-owner learnerId returns 403', async () => {
  const h = createHarness();
  try {
    const { response } = await h.getEvents({ learnerId: 'learner-b' });
    assert.equal(response.status, 403);
  } finally {
    h.close();
  }
});

test('record-event rejects command-failed with a raw error message (PII wall)', async () => {
  // command-failed's allowlist is `{ command, errorCode }` — no raw
  // error string, no stack. A client that tries to send `errorMessage`
  // or `stack` is rejected with 400.
  const h = createHarness();
  try {
    const { response, body } = await h.recordEvent({
      kind: 'command-failed',
      payload: {
        command: 'start-session',
        errorCode: 'backend_unavailable',
        errorMessage: 'User attempted to submit "Dear Dr Smith" with wrong punctuation',
      },
    });
    assert.equal(response.status, 400, JSON.stringify(body));
    const code = body.error?.code || body.code;
    assert.equal(code, 'punctuation_event_field_rejected');
    assert.equal(h.eventRowCount(), 0);
  } finally {
    h.close();
  }
});

test('record-event rejects an unknown event kind when feature flag is OFF too', async () => {
  // Plan §863 edge case: even with the flag off, the allowlist +
  // authz chain still fires so a misbehaving client cannot probe the
  // server shape via flag-gated silence.
  const h = createHarness({ eventsEnabled: false });
  try {
    const { response, body } = await h.recordEvent({
      kind: 'nonsense',
      payload: {},
    });
    assert.equal(response.status, 400, JSON.stringify(body));
    const code = body.error?.code || body.code;
    assert.equal(code, 'punctuation_event_unknown_kind');
    assert.equal(h.eventRowCount(), 0);
  } finally {
    h.close();
  }
});

test('record-event writes release_id = null when the feature flag-gated write fires', async () => {
  // R10 (plan §787-798) lands `release_id` as a nullable column so a
  // future query pattern can filter by release without another migration.
  // U9 does not populate it (no release-id coupling yet); the column must
  // exist and default to NULL so smoke queries do not fail.
  const h = createHarness();
  try {
    await h.recordEvent({ kind: 'card-opened', payload: { cardId: 'smart' } });
    const row = h.DB.db.prepare(
      'SELECT release_id FROM punctuation_events LIMIT 1',
    ).get();
    // release_id column exists and is null-on-insert.
    assert.equal(Object.prototype.hasOwnProperty.call(row, 'release_id'), true);
    assert.equal(row.release_id, null);
  } finally {
    h.close();
  }
});

// ---------------------------------------------------------------------------
// Phase 6 U9 — Per-session, per-event-kind rate limiting (R16)
// ---------------------------------------------------------------------------

test('rate limit: 10 answer-submitted events in a session are all accepted', async () => {
  const h = createHarness();
  try {
    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const { response, body } = await h.recordEvent({
        kind: 'answer-submitted',
        payload: { sessionId: 'sess-1', itemId: `item-${i}`, correct: true },
      });
      assert.equal(response.status, 200, `event ${i}: ${JSON.stringify(body)}`);
      assert.equal(body.recorded, true, `event ${i} should be recorded`);
      assert.equal(body.rateLimited, undefined, `event ${i} should not be rate limited`);
    }
    assert.equal(h.eventRowCount(), 10);
  } finally {
    h.close();
  }
});

test('rate limit: 51st answer-submitted in a session is silently dropped', async () => {
  const { MAX_TELEMETRY_EVENTS_PER_SESSION_PER_KIND } = await import(
    '../worker/src/subjects/punctuation/events.js'
  );
  assert.equal(MAX_TELEMETRY_EVENTS_PER_SESSION_PER_KIND, 50, 'constant must be 50');

  const h = createHarness();
  try {
    // Insert exactly 50 events.
    for (let i = 0; i < 50; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const { response, body } = await h.recordEvent({
        kind: 'answer-submitted',
        payload: { sessionId: 'sess-flood', itemId: `item-${i}`, correct: i % 2 === 0 },
      });
      assert.equal(response.status, 200, `event ${i}: ${JSON.stringify(body)}`);
      assert.equal(body.recorded, true, `event ${i} should be recorded`);
    }
    assert.equal(h.eventRowCount(), 50);

    // 51st event should be silently dropped.
    const { response, body } = await h.recordEvent({
      kind: 'answer-submitted',
      payload: { sessionId: 'sess-flood', itemId: 'item-overflow', correct: true },
    });
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.ok, true);
    assert.equal(body.recorded, false, '51st event must not be recorded');
    assert.equal(body.rateLimited, true, '51st event must report rateLimited');
    assert.equal(body.eventKind, 'answer-submitted');
    // Row count unchanged.
    assert.equal(h.eventRowCount(), 50);
  } finally {
    h.close();
  }
});

test('rate limit: 50 of kind A + 50 of kind B are both accepted (caps are per-kind)', async () => {
  const h = createHarness();
  try {
    for (let i = 0; i < 50; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await h.recordEvent({
        kind: 'answer-submitted',
        payload: { sessionId: 'sess-cross', itemId: `a-${i}`, correct: true },
      });
    }
    for (let i = 0; i < 50; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await h.recordEvent({
        kind: 'feedback-rendered',
        payload: { sessionId: 'sess-cross', itemId: `b-${i}`, correct: false },
      });
    }
    assert.equal(h.eventRowCount(), 100, 'both kinds fill their own quota');

    // 51st of kind A → dropped.
    const { body: bodyA } = await h.recordEvent({
      kind: 'answer-submitted',
      payload: { sessionId: 'sess-cross', itemId: 'overflow-a', correct: true },
    });
    assert.equal(bodyA.rateLimited, true, 'kind A 51st is rate-limited');

    // 51st of kind B → dropped.
    const { body: bodyB } = await h.recordEvent({
      kind: 'feedback-rendered',
      payload: { sessionId: 'sess-cross', itemId: 'overflow-b', correct: false },
    });
    assert.equal(bodyB.rateLimited, true, 'kind B 51st is rate-limited');

    assert.equal(h.eventRowCount(), 100, 'no new rows after rate limit');
  } finally {
    h.close();
  }
});

test('rate limit: new session resets the counter', async () => {
  const h = createHarness();
  try {
    // Fill session-1 to the cap.
    for (let i = 0; i < 50; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await h.recordEvent({
        kind: 'answer-submitted',
        payload: { sessionId: 'sess-old', itemId: `old-${i}`, correct: true },
      });
    }
    // Confirm session-1 is capped.
    const { body: capped } = await h.recordEvent({
      kind: 'answer-submitted',
      payload: { sessionId: 'sess-old', itemId: 'blocked', correct: true },
    });
    assert.equal(capped.rateLimited, true);

    // A new session starts fresh.
    const { body: fresh } = await h.recordEvent({
      kind: 'answer-submitted',
      payload: { sessionId: 'sess-new', itemId: 'new-0', correct: true },
    });
    assert.equal(fresh.recorded, true, 'new session is not rate-limited');
    assert.equal(fresh.rateLimited, undefined);

    assert.equal(h.eventRowCount(), 51, '50 old + 1 new');
  } finally {
    h.close();
  }
});

test('rate limit: kinds without sessionId are rate-limited by (learner, kind)', async () => {
  // card-opened does not carry a sessionId, so the cap applies per-learner per-kind.
  const h = createHarness();
  try {
    for (let i = 0; i < 50; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await h.recordEvent({
        kind: 'card-opened',
        payload: { cardId: `card-${i}` },
      });
    }
    assert.equal(h.eventRowCount(), 50);

    // 51st card-opened → dropped.
    const { response, body } = await h.recordEvent({
      kind: 'card-opened',
      payload: { cardId: 'overflow' },
    });
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.rateLimited, true);
    assert.equal(body.recorded, false);
    assert.equal(h.eventRowCount(), 50);
  } finally {
    h.close();
  }
});

test('rate limit: telemetry events never mint Stars, stages, or codex entries', async () => {
  // Negative test (R16): the record-event handler never writes to any table
  // besides punctuation_events. Verify no rows appear in mastery-adjacent
  // tables after a burst of telemetry events.
  const h = createHarness();
  try {
    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await h.recordEvent({
        kind: 'answer-submitted',
        payload: { sessionId: 's1', itemId: `item-${i}`, correct: true },
      });
    }
    // The D1 test database has the standard migration set. If any of the
    // mastery tables exist, verify they are empty.
    const tables = h.DB.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('learner_punctuation_state', 'game_state', 'event_log')",
    ).all();
    for (const { name } of tables) {
      const count = Number(h.DB.db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n) || 0;
      assert.equal(count, 0, `${name} must have zero rows — telemetry must never mint state`);
    }
  } finally {
    h.close();
  }
});

test('rate limit: feature flag OFF skips rate-limit check (no D1 count query)', async () => {
  // When the feature flag is OFF, the handler returns before reaching
  // the rate-limit check — no D1 query is issued. Confirm the response
  // shape has no `rateLimited` key.
  const h = createHarness({ eventsEnabled: false });
  try {
    const { response, body } = await h.recordEvent({
      kind: 'answer-submitted',
      payload: { sessionId: 's1', itemId: 'i1', correct: true },
    });
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.enabled, false);
    assert.equal(body.recorded, false);
    assert.equal(body.rateLimited, undefined, 'no rateLimited flag when feature is off');
  } finally {
    h.close();
  }
});

// ---------------------------------------------------------------------------
// Phase 7 U6 — Rolling 7-day window for sessionless telemetry (R4)
// ---------------------------------------------------------------------------

test('P7-U6: sessionless event accepted when window count < 50', async () => {
  const h = createHarness();
  try {
    // Insert 10 card-opened events — well under the 50 cap.
    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const { response, body } = await h.recordEvent({
        kind: 'card-opened',
        payload: { cardId: `card-${i}` },
      });
      assert.equal(response.status, 200, `event ${i}: ${JSON.stringify(body)}`);
      assert.equal(body.recorded, true, `event ${i} should be recorded`);
      assert.equal(body.rateLimited, undefined, `event ${i} should not be rate limited`);
    }
    assert.equal(h.eventRowCount(), 10);
  } finally {
    h.close();
  }
});

test('P7-U6: sessionless event rate-limited when window count >= 50', async () => {
  const h = createHarness();
  try {
    // Fill to the cap within the current window.
    for (let i = 0; i < 50; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await h.recordEvent({
        kind: 'card-opened',
        payload: { cardId: `card-${i}` },
      });
    }
    assert.equal(h.eventRowCount(), 50);

    // 51st event should be rate-limited.
    const { response, body } = await h.recordEvent({
      kind: 'card-opened',
      payload: { cardId: 'overflow' },
    });
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.ok, true);
    assert.equal(body.recorded, false, '51st event must not be recorded');
    assert.equal(body.rateLimited, true, '51st event must report rateLimited');
    assert.equal(h.eventRowCount(), 50);
  } finally {
    h.close();
  }
});

test('P7-U6: after 7 days, old events fall out of window — learner can emit again', async () => {
  const { SESSIONLESS_RATE_LIMIT_WINDOW_MS } = await import(
    '../worker/src/subjects/punctuation/events.js'
  );
  const h = createHarness();
  try {
    const dayZero = Date.UTC(2026, 0, 1);
    h.nowRef.value = dayZero;

    // Fill 50 card-opened events on day zero.
    for (let i = 0; i < 50; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await h.recordEvent({
        kind: 'card-opened',
        payload: { cardId: `old-${i}` },
      });
    }
    assert.equal(h.eventRowCount(), 50);

    // Confirm rate-limited at day zero.
    const { body: capped } = await h.recordEvent({
      kind: 'card-opened',
      payload: { cardId: 'blocked' },
    });
    assert.equal(capped.rateLimited, true, 'day-zero cap reached');

    // Advance past the 7-day window. All 50 events are now outside
    // the window, so the next event should be accepted.
    h.nowRef.value = dayZero + SESSIONLESS_RATE_LIMIT_WINDOW_MS + 1;
    const { body: fresh } = await h.recordEvent({
      kind: 'card-opened',
      payload: { cardId: 'fresh-after-window' },
    });
    assert.equal(fresh.recorded, true, 'event after window expiry should be recorded');
    assert.equal(fresh.rateLimited, undefined, 'no rate limit after window expiry');
    assert.equal(h.eventRowCount(), 51);
  } finally {
    h.close();
  }
});

test('P7-U6: per-session cap unchanged (sessionId present path)', async () => {
  // Per-session cap is NOT windowed — it counts ALL events for the
  // (learner, kind, sessionId) triple regardless of age. Verify by
  // filling a session to 50 and confirming the 51st is dropped even
  // when time has advanced.
  const h = createHarness();
  try {
    const dayZero = Date.UTC(2026, 0, 1);
    h.nowRef.value = dayZero;

    for (let i = 0; i < 50; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await h.recordEvent({
        kind: 'answer-submitted',
        payload: { sessionId: 'sess-fixed', itemId: `item-${i}`, correct: true },
      });
    }

    // Advance 8 days — past the sessionless window, but per-session
    // cap does not use a time window.
    h.nowRef.value = dayZero + 8 * 86_400_000;
    const { body: capped } = await h.recordEvent({
      kind: 'answer-submitted',
      payload: { sessionId: 'sess-fixed', itemId: 'item-overflow', correct: true },
    });
    assert.equal(capped.rateLimited, true, 'per-session cap is not time-windowed');
    assert.equal(capped.recorded, false);
    assert.equal(h.eventRowCount(), 50);
  } finally {
    h.close();
  }
});

test('P7-U6: 50 events from 8 days ago — all expired, next event accepted', async () => {
  const { SESSIONLESS_RATE_LIMIT_WINDOW_MS } = await import(
    '../worker/src/subjects/punctuation/events.js'
  );
  const h = createHarness();
  try {
    const eightDaysAgo = Date.UTC(2026, 0, 1);
    h.nowRef.value = eightDaysAgo;

    // Insert exactly 50 card-opened events 8 days ago.
    for (let i = 0; i < 50; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await h.recordEvent({
        kind: 'card-opened',
        payload: { cardId: `ancient-${i}` },
      });
    }
    assert.equal(h.eventRowCount(), 50);

    // Now = 8 days later. All 50 events are outside the 7-day window.
    h.nowRef.value = eightDaysAgo + SESSIONLESS_RATE_LIMIT_WINDOW_MS + 86_400_000;
    const { body } = await h.recordEvent({
      kind: 'card-opened',
      payload: { cardId: 'new-after-expiry' },
    });
    assert.equal(body.recorded, true, 'all 50 expired → next event accepted');
    assert.equal(body.rateLimited, undefined);
    assert.equal(h.eventRowCount(), 51);
  } finally {
    h.close();
  }
});

test('P7-U6: 49 events from 6 days ago + 1 from today — next event rate-limited (total 50 in window)', async () => {
  const h = createHarness();
  try {
    const sixDaysAgo = Date.UTC(2026, 0, 1);
    h.nowRef.value = sixDaysAgo;

    // Insert 49 card-opened events 6 days ago.
    for (let i = 0; i < 49; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await h.recordEvent({
        kind: 'card-opened',
        payload: { cardId: `six-day-${i}` },
      });
    }
    assert.equal(h.eventRowCount(), 49);

    // Advance to "today" (6 days later, still within the 7-day window).
    h.nowRef.value = sixDaysAgo + 6 * 86_400_000;

    // Insert 1 event today → total 50 in window.
    const { body: fiftiethBody } = await h.recordEvent({
      kind: 'card-opened',
      payload: { cardId: 'today-50th' },
    });
    assert.equal(fiftiethBody.recorded, true, '50th event is accepted');
    assert.equal(h.eventRowCount(), 50);

    // 51st event → rate-limited.
    const { body: overflowBody } = await h.recordEvent({
      kind: 'card-opened',
      payload: { cardId: 'today-51st' },
    });
    assert.equal(overflowBody.rateLimited, true, '51st event in window is rate-limited');
    assert.equal(overflowBody.recorded, false);
    assert.equal(h.eventRowCount(), 50);
  } finally {
    h.close();
  }
});

test('P7-U6: rate-limited response returns correct shape { ok: true, recorded: false, rateLimited: true }', async () => {
  const h = createHarness();
  try {
    for (let i = 0; i < 50; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await h.recordEvent({
        kind: 'card-opened',
        payload: { cardId: `fill-${i}` },
      });
    }
    const { response, body } = await h.recordEvent({
      kind: 'card-opened',
      payload: { cardId: 'overflow' },
    });
    assert.equal(response.status, 200, 'status 200 — no learner disruption');
    assert.equal(body.ok, true);
    assert.equal(body.recorded, false);
    assert.equal(body.rateLimited, true);
    assert.equal(body.enabled, true);
    assert.equal(body.eventKind, 'card-opened');
  } finally {
    h.close();
  }
});
