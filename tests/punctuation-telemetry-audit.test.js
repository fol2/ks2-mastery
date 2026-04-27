import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerApp } from '../worker/src/app.js';
import { createWorkerSubjectRuntime } from '../worker/src/subjects/runtime.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';

// P7-U6 — Audit trail assertion for event timeline reads.
//
// When a caller reads a learner's punctuation event timeline via
// GET /api/subjects/punctuation/events, a `punctuation.telemetry-read`
// mutation receipt must be recorded in the ops audit surface so the
// read is auditable.

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

function createHarness() {
  const nowRef = { value: Date.UTC(2026, 0, 1) };
  const DB = createMigratedSqliteD1Database();
  seedAccountLearner(DB);
  const app = createWorkerApp({
    now: () => nowRef.value,
    subjectRuntime: createWorkerSubjectRuntime({ punctuation: { random: () => 0 } }),
  });
  const env = {
    DB,
    AUTH_MODE: 'development-stub',
    ENVIRONMENT: 'test',
    PUNCTUATION_SUBJECT_ENABLED: 'true',
    PUNCTUATION_EVENTS_ENABLED: 'true',
  };
  let sequence = 0;

  async function recordEvent({ kind, payload = {}, learnerId = 'learner-a' } = {}) {
    sequence += 1;
    const response = await app.fetch(new Request('https://repo.test/api/subjects/punctuation/command', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://repo.test',
        'x-ks2-dev-account-id': 'adult-a',
      },
      body: JSON.stringify({
        command: 'record-event',
        learnerId,
        requestId: `punctuation-event-${sequence}`,
        expectedLearnerRevision: 0,
        payload: { event: kind, payload },
      }),
    }), env, {});
    return response.json();
  }

  async function getEvents({ learnerId = 'learner-a', kind = null, limit = null } = {}) {
    const params = new URLSearchParams();
    if (learnerId) params.set('learner', learnerId);
    if (kind) params.set('kind', kind);
    if (limit != null) params.set('limit', String(limit));
    const url = `https://repo.test/api/subjects/punctuation/events?${params.toString()}`;
    const response = await app.fetch(new Request(url, {
      method: 'GET',
      headers: {
        origin: 'https://repo.test',
        'x-ks2-dev-account-id': 'adult-a',
      },
    }), env, {});
    return { response, body: await response.json() };
  }

  function auditReceipts() {
    const rows = DB.db.prepare(
      "SELECT * FROM mutation_receipts WHERE mutation_kind = 'punctuation.telemetry-read' ORDER BY applied_at DESC",
    ).all();
    return rows;
  }

  return { DB, nowRef, recordEvent, getEvents, auditReceipts, close() { DB.close(); } };
}

test('P7-U6 audit: event timeline read fires a mutation receipt with correct learnerId', async () => {
  const h = createHarness();
  try {
    // Seed some events so the read returns data.
    await h.recordEvent({ kind: 'card-opened', payload: { cardId: 'a' } });
    await h.recordEvent({ kind: 'card-opened', payload: { cardId: 'b' } });

    // Read events — this should fire the audit trail.
    const { response } = await h.getEvents();
    assert.equal(response.status, 200);

    // Check audit receipt.
    const receipts = h.auditReceipts();
    assert.ok(receipts.length >= 1, 'at least one telemetry-read receipt exists');
    const receipt = receipts[0];
    assert.equal(receipt.account_id, 'adult-a');
    assert.equal(receipt.scope_type, 'learner');
    assert.equal(receipt.scope_id, 'learner-a');
    assert.equal(receipt.mutation_kind, 'punctuation.telemetry-read');
    assert.equal(receipt.status_code, 200);

    // The response_json should include the resultCount.
    const responsePayload = JSON.parse(receipt.response_json);
    assert.equal(responsePayload.resultCount, 2);
  } finally {
    h.close();
  }
});

test('P7-U6 audit: event timeline read with kind filter records audit', async () => {
  const h = createHarness();
  try {
    await h.recordEvent({ kind: 'card-opened', payload: { cardId: 'a' } });
    await h.recordEvent({ kind: 'map-opened', payload: {} });

    // Read only card-opened events.
    const { response } = await h.getEvents({ kind: 'card-opened' });
    assert.equal(response.status, 200);

    const receipts = h.auditReceipts();
    assert.ok(receipts.length >= 1, 'audit receipt exists for filtered read');
    assert.equal(receipts[0].mutation_kind, 'punctuation.telemetry-read');
  } finally {
    h.close();
  }
});

test('P7-U6 audit: empty learner (no events) still fires audit receipt', async () => {
  const h = createHarness();
  try {
    // Read with no events inserted.
    const { response } = await h.getEvents();
    assert.equal(response.status, 200);

    const receipts = h.auditReceipts();
    assert.ok(receipts.length >= 1, 'audit receipt fires even for empty result');
    const responsePayload = JSON.parse(receipts[0].response_json);
    assert.equal(responsePayload.resultCount, 0);
  } finally {
    h.close();
  }
});

test('P7-U6 audit: GET events hard-limits to 500 rows', async () => {
  const h = createHarness();
  try {
    // Request a limit above 500.
    const { response, body } = await h.getEvents({ limit: 999 });
    assert.equal(response.status, 200);
    // P7-U6: hard ceiling is 500.
    assert.equal(body.appliedLimit, 500, 'limit clamped to 500 hard ceiling');
  } finally {
    h.close();
  }
});
