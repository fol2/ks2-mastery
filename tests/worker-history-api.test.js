import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

const BASE_URL = 'https://repo.test';
const NOW = Date.UTC(2026, 0, 1);

function runSql(server, sql, params = []) {
  server.DB.db.prepare(sql).run(...params);
}

function seedAccount(server, {
  accountId,
  learnerId = 'learner-history',
  role = 'owner',
  platformRole = 'parent',
} = {}) {
  runSql(server, `
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES (?, ?, 'Parent', ?, NULL, ?, ?, 0)
  `, [accountId, `${accountId}@example.test`, platformRole, NOW, NOW]);
  runSql(server, `
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES (?, 'Ava', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `, [learnerId, NOW, NOW]);
  runSql(server, `
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, ?, ?, 0, ?, ?)
  `, [accountId, learnerId, role, NOW, NOW]);
  runSql(server, 'UPDATE adult_accounts SET selected_learner_id = ? WHERE id = ?', [learnerId, accountId]);
}

function insertSession(server, {
  id,
  learnerId = 'learner-history',
  subjectId = 'spelling',
  sessionKind = 'learning',
  summary = {
    label: 'Smart review',
    cards: [{ label: 'Correct', value: '6/8' }],
    mistakes: [{ word: 'secret-word', year: '5-6' }],
  },
  updatedAt,
}) {
  runSql(server, `
    INSERT INTO practice_sessions (id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at, updated_by_account_id)
    VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?, 'adult-parent')
  `, [
    id,
    learnerId,
    subjectId,
    sessionKind,
    JSON.stringify({
      currentCard: {
        word: { word: 'secret-word' },
        prompt: { sentence: 'secret-prompt-sentence' },
      },
    }),
    JSON.stringify(summary),
    updatedAt - 1,
    updatedAt,
  ]);
}

function insertEvent(server, {
  id,
  learnerId = 'learner-history',
  type = 'spelling.word-secured',
  createdAt,
}) {
  runSql(server, `
    INSERT INTO event_log (id, learner_id, subject_id, system_id, event_type, event_json, created_at, actor_account_id)
    VALUES (?, ?, 'spelling', 'spelling', ?, ?, ?, 'adult-parent')
  `, [
    id,
    learnerId,
    type,
    JSON.stringify({
      id,
      type,
      learnerId,
      subjectId: 'spelling',
      mode: 'smart',
      sessionType: 'learning',
      yearBand: '5-6',
      secureCount: 1,
      privatePrompt: 'secret-prompt-sentence',
      createdAt,
    }),
    createdAt,
  ]);
}

test('parent recent sessions route is paginated, scoped, and redacted', async () => {
  const server = createWorkerRepositoryServer();
  seedAccount(server, { accountId: 'adult-parent' });
  seedAccount(server, { accountId: 'adult-other', learnerId: 'learner-other' });

  for (let index = 0; index < 8; index += 1) {
    insertSession(server, {
      id: `session-${index}`,
      updatedAt: NOW + index,
    });
  }
  insertSession(server, {
    id: 'other-session',
    learnerId: 'learner-other',
    updatedAt: NOW + 100,
  });

  const firstResponse = await server.fetchAs(
    'adult-parent',
    `${BASE_URL}/api/hubs/parent/recent-sessions?learnerId=learner-history&limit=3`,
  );
  const firstPayload = await firstResponse.json();

  assert.equal(firstResponse.status, 200);
  assert.deepEqual(firstPayload.sessions.map((session) => session.id), ['session-7', 'session-6', 'session-5']);
  assert.deepEqual(firstPayload.recentSessions.map((session) => session.id), ['session-7', 'session-6', 'session-5']);
  assert.equal(firstPayload.sessions.every((session) => session.sessionState === null), true);
  assert.equal(JSON.stringify(firstPayload).includes('secret-word'), false);
  assert.equal(JSON.stringify(firstPayload).includes('secret-prompt-sentence'), false);
  assert.equal(firstPayload.page.hasMore, true);
  assert.ok(firstPayload.page.nextCursor);

  const secondResponse = await server.fetchAs(
    'adult-parent',
    `${BASE_URL}/api/hubs/parent/recent-sessions?learnerId=learner-history&limit=3&cursor=${encodeURIComponent(firstPayload.page.nextCursor)}`,
  );
  const secondPayload = await secondResponse.json();

  assert.equal(secondResponse.status, 200);
  assert.deepEqual(secondPayload.sessions.map((session) => session.id), ['session-4', 'session-3', 'session-2']);
  assert.equal(secondPayload.sessions.some((session) => firstPayload.sessions.some((first) => first.id === session.id)), false);

  server.close();
});

test('parent recent sessions route treats Grammar manual-review saves as non-scored', async () => {
  const server = createWorkerRepositoryServer();
  seedAccount(server, { accountId: 'adult-parent' });

  insertSession(server, {
    id: 'grammar-manual-review',
    subjectId: 'grammar',
    sessionKind: 'practice',
    summary: {
      mode: 'practice',
      answered: 1,
      scoredAnswered: 0,
      nonScoredAnswered: 1,
      correct: 0,
    },
    updatedAt: NOW + 1,
  });

  const response = await server.fetchAs(
    'adult-parent',
    `${BASE_URL}/api/hubs/parent/recent-sessions?learnerId=learner-history&limit=1`,
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.recentSessions[0].id, 'grammar-manual-review');
  assert.equal(payload.recentSessions[0].mistakeCount, 0);
  assert.equal(payload.recentSessions[0].headline, 'Saved for review');

  server.close();
});

test('parent activity route returns public event rows only', async () => {
  const server = createWorkerRepositoryServer();
  seedAccount(server, { accountId: 'adult-parent' });

  insertEvent(server, { id: 'event-public-1', createdAt: NOW + 1 });
  insertEvent(server, { id: 'event-private', type: 'spelling.private-debug', createdAt: NOW + 2 });
  insertEvent(server, { id: 'event-public-2', createdAt: NOW + 3 });

  const response = await server.fetchAs(
    'adult-parent',
    `${BASE_URL}/api/hubs/parent/activity?learnerId=learner-history&limit=1`,
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.source, 'event_log');
  assert.deepEqual(payload.activity.map((event) => event.createdAt), [NOW + 3]);
  assert.equal(payload.activity.some((event) => event.id === 'event-private'), false);
  assert.equal(JSON.stringify(payload).includes('secret-prompt-sentence'), false);
  assert.equal(payload.page.hasMore, true);

  const secondResponse = await server.fetchAs(
    'adult-parent',
    `${BASE_URL}/api/hubs/parent/activity?learnerId=learner-history&limit=1&cursor=${encodeURIComponent(payload.page.nextCursor)}`,
  );
  const secondPayload = await secondResponse.json();

  assert.equal(secondResponse.status, 200);
  assert.equal(secondPayload.source, 'event_log');
  assert.deepEqual(secondPayload.activity.map((event) => event.createdAt), [NOW + 1]);

  server.close();
});

test('parent history routes reuse learner read-access boundaries', async () => {
  const server = createWorkerRepositoryServer();
  seedAccount(server, { accountId: 'adult-parent' });
  seedAccount(server, { accountId: 'adult-outsider', learnerId: 'learner-outsider' });

  const response = await server.fetchAs(
    'adult-outsider',
    `${BASE_URL}/api/hubs/parent/recent-sessions?learnerId=learner-history`,
  );
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.code, 'forbidden');

  server.close();
});
