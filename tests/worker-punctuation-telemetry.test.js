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

test('GET events clamps the limit to the documented maximum (1000)', async () => {
  const h = createHarness();
  try {
    const { body } = await h.getEvents({ limit: 5000 });
    // The response should include an `appliedLimit` that clamps to 1000.
    assert.equal(body.appliedLimit, 1000);
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
