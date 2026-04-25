import test from 'node:test';
import assert from 'node:assert/strict';

import { backfillLearnerReadModels } from '../scripts/backfill-learner-read-models.mjs';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';

const NOW = Date.UTC(2026, 0, 1);

function runSql(db, sql, params = []) {
  db.db.prepare(sql).run(...params);
}

function scalar(db, sql, params = []) {
  const row = db.db.prepare(sql).get(...params);
  return row ? Object.values(row)[0] : null;
}

function seedLearner(db, learnerId) {
  runSql(db, `
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES (?, ?, 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 8)
  `, [learnerId, learnerId, NOW, NOW]);
}

function insertEvent(db, {
  id,
  learnerId,
  type = 'spelling.word-secured',
  createdAt,
}) {
  runSql(db, `
    INSERT INTO event_log (id, learner_id, subject_id, system_id, event_type, event_json, created_at)
    VALUES (?, ?, 'spelling', 'spelling', ?, ?, ?)
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

test('learner read-model backfill is idempotent and stores public activity only', async () => {
  const db = createMigratedSqliteD1Database();
  seedLearner(db, 'learner-a');
  seedLearner(db, 'learner-b');
  insertEvent(db, { id: 'event-a-1', learnerId: 'learner-a', createdAt: NOW + 1 });
  insertEvent(db, { id: 'event-a-private', learnerId: 'learner-a', type: 'spelling.private-debug', createdAt: NOW + 2 });
  insertEvent(db, { id: 'event-b-1', learnerId: 'learner-b', createdAt: NOW + 3 });

  const first = await backfillLearnerReadModels(db, {
    batchSize: 1,
    now: () => NOW + 10,
  });
  assert.equal(first.processedLearners, 1);
  assert.equal(first.remainingLearners, 1);
  assert.equal(first.lastLearnerId, 'learner-a');

  const second = await backfillLearnerReadModels(db, {
    afterLearnerId: first.lastLearnerId,
    batchSize: 5,
    now: () => NOW + 20,
  });
  assert.equal(second.processedLearners, 1);
  assert.equal(second.remainingLearners, 0);

  const activityCount = scalar(db, 'SELECT COUNT(*) AS count FROM learner_activity_feed');
  const readModelCount = scalar(db, 'SELECT COUNT(*) AS count FROM learner_read_models');
  assert.equal(activityCount, 2);
  assert.equal(readModelCount, 2);

  const beforeRerunActivityCount = activityCount;
  await backfillLearnerReadModels(db, {
    batchSize: 5,
    now: () => NOW + 30,
  });
  assert.equal(scalar(db, 'SELECT COUNT(*) AS count FROM learner_activity_feed'), beforeRerunActivityCount);
  assert.equal(scalar(db, 'SELECT COUNT(*) AS count FROM learner_read_models'), 2);

  const storedActivity = db.db.prepare(`
    SELECT activity_json
    FROM learner_activity_feed
    WHERE source_event_id = 'event-a-1'
  `).get();
  assert.equal(JSON.stringify(storedActivity).includes('secret-prompt-sentence'), false);
  assert.equal(JSON.parse(storedActivity.activity_json).type, 'spelling.word-secured');

  const storedModel = db.db.prepare(`
    SELECT model_json, source_revision
    FROM learner_read_models
    WHERE learner_id = 'learner-a' AND model_key = 'learner.summary.v1'
  `).get();
  const model = JSON.parse(storedModel.model_json);
  assert.equal(storedModel.source_revision, 8);
  assert.equal(model.counts.events, 2);
  assert.equal(model.counts.publicActivity, 1);

  db.close();
});
