import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

import { all, first, run } from '../worker/src/d1.js';
import {
  LEARNER_SUMMARY_MODEL_KEY,
  activityFeedRowFromEventRow,
} from '../worker/src/read-models/learner-read-models.js';

const DEFAULT_BATCH_SIZE = 25;

class SqliteStatement {
  constructor(statement) {
    this.statement = statement;
    this.params = [];
  }

  bind(...params) {
    this.params = params;
    return this;
  }

  async first() {
    const row = this.statement.get(...this.params);
    return row ? { ...row } : null;
  }

  async all() {
    return {
      results: this.statement.all(...this.params).map((row) => ({ ...row })),
    };
  }

  async run() {
    const meta = this.statement.run(...this.params);
    return {
      success: true,
      meta: {
        changes: meta.changes,
        rows_read: 0,
        rows_written: Math.max(0, Number(meta.changes) || 0),
      },
    };
  }
}

class SqliteD1 {
  constructor(filename) {
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  prepare(sql) {
    return new SqliteStatement(this.db.prepare(sql));
  }

  close() {
    this.db.close();
  }
}

function argValue(argv, name, fallback = '') {
  const index = argv.indexOf(name);
  if (index === -1 || index + 1 >= argv.length) return fallback;
  return argv[index + 1];
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function upsertReadModel(db, learnerId, model, nowTs) {
  await run(db, `
    INSERT INTO learner_read_models (learner_id, model_key, model_json, source_revision, generated_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(learner_id, model_key) DO UPDATE SET
      model_json = excluded.model_json,
      source_revision = excluded.source_revision,
      generated_at = excluded.generated_at,
      updated_at = excluded.updated_at
  `, [
    learnerId,
    LEARNER_SUMMARY_MODEL_KEY,
    JSON.stringify(model),
    Math.max(0, Number(model.sourceRevision) || 0),
    nowTs,
    nowTs,
  ]);
}

async function upsertActivityRows(db, activityRows) {
  let written = 0;
  for (const row of activityRows) {
    const result = await run(db, `
      INSERT INTO learner_activity_feed (
        id, learner_id, subject_id, activity_type, activity_json,
        source_event_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        learner_id = excluded.learner_id,
        subject_id = excluded.subject_id,
        activity_type = excluded.activity_type,
        activity_json = excluded.activity_json,
        source_event_id = excluded.source_event_id,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `, [
      row.id,
      row.learnerId,
      row.subjectId || null,
      row.activityType,
      JSON.stringify(row.activity),
      row.sourceEventId || null,
      Math.max(0, Number(row.createdAt) || 0),
      Math.max(0, Number(row.updatedAt) || 0),
    ]);
    written += Math.max(0, Number(result?.meta?.rows_written ?? result?.meta?.changes) || 0);
  }
  return written;
}

async function learnerRows(db, { learnerId = null, afterLearnerId = '', batchSize = DEFAULT_BATCH_SIZE } = {}) {
  if (learnerId) {
    return all(db, `
      SELECT id, state_revision
      FROM learner_profiles
      WHERE id = ?
      ORDER BY id ASC
    `, [learnerId]);
  }
  return all(db, `
    SELECT id, state_revision
    FROM learner_profiles
    WHERE id > ?
    ORDER BY id ASC
    LIMIT ?
  `, [afterLearnerId, batchSize]);
}

async function countRows(db, sql, params = []) {
  const row = await first(db, sql, params);
  return Math.max(0, Number(row?.count) || 0);
}

async function buildLearnerSummary(db, learner, nowTs) {
  const learnerId = learner.id;
  const [subjectStateCount, practiceSessionCount, eventCount, activityCount] = await Promise.all([
    countRows(db, 'SELECT COUNT(*) AS count FROM child_subject_state WHERE learner_id = ?', [learnerId]),
    countRows(db, 'SELECT COUNT(*) AS count FROM practice_sessions WHERE learner_id = ?', [learnerId]),
    countRows(db, 'SELECT COUNT(*) AS count FROM event_log WHERE learner_id = ?', [learnerId]),
    countRows(db, 'SELECT COUNT(*) AS count FROM learner_activity_feed WHERE learner_id = ?', [learnerId]),
  ]);
  return {
    version: 1,
    learnerId,
    generatedAt: nowTs,
    sourceRevision: Math.max(0, Number(learner.state_revision) || 0),
    counts: {
      subjectStates: subjectStateCount,
      practiceSessions: practiceSessionCount,
      events: eventCount,
      publicActivity: activityCount,
    },
  };
}

export async function backfillLearnerReadModels(db, {
  batchSize = DEFAULT_BATCH_SIZE,
  learnerId = null,
  afterLearnerId = '',
  now = Date.now,
} = {}) {
  const resolvedBatchSize = positiveInteger(batchSize, DEFAULT_BATCH_SIZE);
  const nowTs = Number(typeof now === 'function' ? now() : now) || Date.now();
  const learners = await learnerRows(db, { learnerId, afterLearnerId, batchSize: resolvedBatchSize });
  const summary = {
    processedLearners: 0,
    readModelsWritten: 0,
    activityRowsConsidered: 0,
    activityRowsWritten: 0,
    lastLearnerId: afterLearnerId || '',
    remainingLearners: 0,
  };

  for (const learner of learners) {
    const events = await all(db, `
      SELECT id, learner_id, subject_id, system_id, event_type, event_json, created_at
      FROM event_log
      WHERE learner_id = ?
      ORDER BY created_at ASC, id ASC
    `, [learner.id]);
    const activityRows = events
      .map((row) => activityFeedRowFromEventRow(row, { now: nowTs }))
      .filter(Boolean);
    summary.activityRowsConsidered += events.length;
    summary.activityRowsWritten += await upsertActivityRows(db, activityRows);

    const model = await buildLearnerSummary(db, learner, nowTs);
    await upsertReadModel(db, learner.id, model, nowTs);
    summary.readModelsWritten += 1;
    summary.processedLearners += 1;
    summary.lastLearnerId = learner.id;
  }

  if (!learnerId) {
    summary.remainingLearners = await countRows(db, `
      SELECT COUNT(*) AS count
      FROM learner_profiles
      WHERE id > ?
    `, [summary.lastLearnerId]);
  }

  return summary;
}

export function usage() {
  return [
    'Usage: node ./scripts/backfill-learner-read-models.mjs --sqlite <path> [options]',
    '',
    'Options:',
    '  --sqlite <path>       SQLite database file to backfill, usually a verified local/preview copy',
    '  --learner-id <id>     Backfill one learner',
    '  --after-learner-id <id> Resume after a learner id',
    '  --batch-size <n>      Learners per run, default 25',
  ].join('\n');
}

async function runCli(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h') || !argv.includes('--sqlite')) {
    console.log(usage());
    return 0;
  }
  const sqlitePath = argValue(argv, '--sqlite');
  if (!sqlitePath || !existsSync(sqlitePath)) {
    throw new Error(`SQLite database file was not found: ${sqlitePath}`);
  }
  const db = new SqliteD1(sqlitePath);
  try {
    const result = await backfillLearnerReadModels(db, {
      batchSize: positiveInteger(argValue(argv, '--batch-size'), DEFAULT_BATCH_SIZE),
      learnerId: argValue(argv, '--learner-id', null),
      afterLearnerId: argValue(argv, '--after-learner-id', ''),
    });
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
    return 0;
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exitCode = 1;
  });
}
