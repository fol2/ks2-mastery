import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepository } from '../worker/src/repository.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

const NOW = Date.UTC(2026, 0, 1);

function runSql(server, sql, params = []) {
  server.DB.db.prepare(sql).run(...params);
}

function countRows(server, tableName, learnerId = 'learner-read-model') {
  return server.DB.db.prepare(`SELECT COUNT(*) AS count FROM ${tableName} WHERE learner_id = ?`).get(learnerId).count;
}

function seedLearner(server, learnerId = 'learner-read-model') {
  runSql(server, `
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES (?, 'Ava', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 4)
  `, [learnerId, NOW, NOW]);
}

function seedParentAccess(server, {
  accountId = 'adult-parent',
  learnerId = 'learner-read-model',
} = {}) {
  runSql(server, `
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES (?, ?, 'Parent', 'parent', NULL, ?, ?, 0)
  `, [accountId, `${accountId}@example.test`, NOW, NOW]);
  seedLearner(server, learnerId);
  runSql(server, `
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, ?, 'owner', 0, ?, ?)
  `, [accountId, learnerId, NOW, NOW]);
  runSql(server, 'UPDATE adult_accounts SET selected_learner_id = ? WHERE id = ?', [learnerId, accountId]);
}

test('capacity read-model migration creates indexed summary and activity stores', () => {
  const server = createWorkerRepositoryServer();
  const tableRows = server.DB.db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name IN ('learner_read_models', 'learner_activity_feed')
    ORDER BY name
  `).all();
  const indexRows = server.DB.db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'index'
      AND name IN (
        'idx_learner_read_models_key_updated',
        'idx_learner_activity_feed_source_event',
        'idx_learner_activity_feed_learner_created',
        'idx_learner_activity_feed_subject_created'
      )
    ORDER BY name
  `).all();

  assert.deepEqual(tableRows.map((row) => row.name), ['learner_activity_feed', 'learner_read_models']);
  assert.deepEqual(indexRows.map((row) => row.name), [
    'idx_learner_activity_feed_learner_created',
    'idx_learner_activity_feed_source_event',
    'idx_learner_activity_feed_subject_created',
    'idx_learner_read_models_key_updated',
  ]);

  server.close();
});

test('event appends update learner activity feed after backfill rows exist', async () => {
  const server = createWorkerRepositoryServer();
  seedParentAccess(server);
  const repository = createWorkerRepository({ env: server.env, now: () => NOW + 10 });

  await repository.upsertLearnerActivityFeedRows([
    {
      id: 'activity-existing',
      learnerId: 'learner-read-model',
      subjectId: 'spelling',
      activityType: 'spelling.word-secured',
      activity: {
        type: 'spelling.word-secured',
        learnerId: 'learner-read-model',
        subjectId: 'spelling',
        createdAt: NOW + 1,
        secureCount: 1,
      },
      sourceEventId: 'event-existing',
      createdAt: NOW + 1,
      updatedAt: NOW + 1,
    },
  ]);

  await repository.appendEvent('adult-parent', {
    id: 'event-after-backfill',
    learnerId: 'learner-read-model',
    subjectId: 'spelling',
    type: 'spelling.word-secured',
    mode: 'smart',
    sessionType: 'learning',
    secureCount: 9,
    privatePrompt: 'secret-prompt-sentence',
    createdAt: NOW + 10,
  }, {
    requestId: 'append-after-backfill',
    expectedLearnerRevision: 4,
  });

  server.DB.clearQueryLog();
  const response = await server.fetchAs(
    'adult-parent',
    'https://repo.test/api/hubs/parent/activity?learnerId=learner-read-model&limit=2',
  );
  const payload = await response.json();
  const queryLog = server.DB.takeQueryLog();

  assert.equal(response.status, 200);
  assert.equal(payload.source, 'learner_activity_feed');
  assert.deepEqual(payload.activity.map((event) => event.secureCount), [9, 1]);
  assert.equal(JSON.stringify(payload).includes('secret-prompt-sentence'), false);
  assert.equal(queryLog.some((entry) => /\bFROM event_log\b/i.test(entry.sql)), false);

  server.close();
});

test('subject runtime persistence writes public activity feed rows', async () => {
  const server = createWorkerRepositoryServer();
  seedParentAccess(server);
  const repository = createWorkerRepository({ env: server.env, now: () => NOW + 20 });

  await repository.persistSubjectRuntime('adult-parent', 'learner-read-model', 'spelling', {
    events: [
      {
        id: 'runtime-public-event',
        type: 'spelling.word-secured',
        learnerId: 'learner-read-model',
        subjectId: 'spelling',
        mode: 'smart',
        sessionType: 'learning',
        secureCount: 4,
        privatePrompt: 'secret-prompt-sentence',
        createdAt: NOW + 20,
      },
    ],
  });

  const response = await server.fetchAs(
    'adult-parent',
    'https://repo.test/api/hubs/parent/activity?learnerId=learner-read-model&limit=1',
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.source, 'learner_activity_feed');
  assert.deepEqual(payload.activity.map((event) => event.secureCount), [4]);
  assert.equal(JSON.stringify(payload).includes('secret-prompt-sentence'), false);

  server.close();
});

test('event clear and runtime reset clear learner activity projections', async () => {
  const server = createWorkerRepositoryServer();
  seedParentAccess(server);
  const repository = createWorkerRepository({ env: server.env, now: () => NOW });

  await repository.upsertLearnerReadModel('learner-read-model', 'parent.summary.v1', {
    overview: { secureWords: 1 },
  }, { sourceRevision: 4, generatedAt: NOW });
  await repository.upsertLearnerActivityFeedRows([
    {
      id: 'activity-clearable',
      learnerId: 'learner-read-model',
      subjectId: 'spelling',
      activityType: 'spelling.word-secured',
      activity: {
        type: 'spelling.word-secured',
        learnerId: 'learner-read-model',
        subjectId: 'spelling',
        createdAt: NOW,
        secureCount: 1,
      },
      sourceEventId: 'event-clearable',
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);

  assert.equal(countRows(server, 'learner_activity_feed'), 1);
  assert.equal(countRows(server, 'learner_read_models'), 1);

  await repository.clearEventLog('adult-parent', 'learner-read-model', {
    requestId: 'clear-event-projections',
    expectedLearnerRevision: 4,
  });

  assert.equal(countRows(server, 'learner_activity_feed'), 0);
  assert.equal(countRows(server, 'learner_read_models'), 0);

  await repository.upsertLearnerReadModel('learner-read-model', 'parent.summary.v1', {
    overview: { secureWords: 2 },
  }, { sourceRevision: 5, generatedAt: NOW });
  await repository.upsertLearnerActivityFeedRows([
    {
      id: 'activity-resettable',
      learnerId: 'learner-read-model',
      subjectId: 'spelling',
      activityType: 'spelling.word-secured',
      activity: {
        type: 'spelling.word-secured',
        learnerId: 'learner-read-model',
        subjectId: 'spelling',
        createdAt: NOW + 1,
        secureCount: 2,
      },
      sourceEventId: 'event-resettable',
      createdAt: NOW + 1,
      updatedAt: NOW + 1,
    },
  ]);

  await repository.resetLearnerRuntime('adult-parent', 'learner-read-model', {
    requestId: 'reset-runtime-projections',
    expectedLearnerRevision: 5,
  });

  assert.equal(countRows(server, 'learner_activity_feed'), 0);
  assert.equal(countRows(server, 'learner_read_models'), 0);

  server.close();
});

test('repository read-model helpers upsert, read, and tolerate malformed JSON', async () => {
  const server = createWorkerRepositoryServer();
  seedLearner(server);
  const repository = createWorkerRepository({ env: server.env, now: () => NOW });

  const written = await repository.upsertLearnerReadModel(
    'learner-read-model',
    'parent.summary.v1',
    { overview: { secureWords: 12 } },
    { sourceRevision: 4, generatedAt: NOW },
  );
  assert.equal(written.model.overview.secureWords, 12);
  assert.equal(written.sourceRevision, 4);

  const read = await repository.readLearnerReadModel('learner-read-model', 'parent.summary.v1');
  assert.equal(read.model.overview.secureWords, 12);
  assert.equal(read.missing, false);

  runSql(server, `
    UPDATE learner_read_models
    SET model_json = '{broken'
    WHERE learner_id = 'learner-read-model' AND model_key = 'parent.summary.v1'
  `);
  const malformed = await repository.readLearnerReadModel('learner-read-model', 'parent.summary.v1');
  assert.deepEqual(malformed.model, {});
  assert.equal(malformed.missing, false);

  const missing = await repository.readLearnerReadModel('learner-read-model', 'missing.summary.v1');
  assert.equal(missing.missing, true);
  assert.deepEqual(missing.model, {});

  server.close();
});

test('parent activity route reads backfilled activity feed before event_log fallback', async () => {
  const server = createWorkerRepositoryServer();
  seedParentAccess(server);
  const repository = createWorkerRepository({ env: server.env, now: () => NOW });

  await repository.upsertLearnerActivityFeedRows([
    {
      id: 'activity-2',
      learnerId: 'learner-read-model',
      subjectId: 'spelling',
      activityType: 'spelling.word-secured',
      activity: {
        type: 'spelling.word-secured',
        learnerId: 'learner-read-model',
        subjectId: 'spelling',
        createdAt: NOW + 2,
        secureCount: 2,
      },
      sourceEventId: 'event-2',
      createdAt: NOW + 2,
      updatedAt: NOW + 2,
    },
    {
      id: 'activity-1',
      learnerId: 'learner-read-model',
      subjectId: 'spelling',
      activityType: 'spelling.word-secured',
      activity: {
        type: 'spelling.word-secured',
        learnerId: 'learner-read-model',
        subjectId: 'spelling',
        createdAt: NOW + 1,
        secureCount: 1,
      },
      sourceEventId: 'event-1',
      createdAt: NOW + 1,
      updatedAt: NOW + 1,
    },
  ]);

  server.DB.clearQueryLog();
  const response = await server.fetchAs(
    'adult-parent',
    'https://repo.test/api/hubs/parent/activity?learnerId=learner-read-model&limit=1',
  );
  const payload = await response.json();
  const queryLog = server.DB.takeQueryLog();

  assert.equal(response.status, 200);
  assert.equal(payload.source, 'learner_activity_feed');
  assert.deepEqual(payload.activity.map((event) => event.secureCount), [2]);
  assert.equal(payload.page.hasMore, true);
  assert.equal(queryLog.some((entry) => /\bFROM event_log\b/i.test(entry.sql)), false);

  server.close();
});
