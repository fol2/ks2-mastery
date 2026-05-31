import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { SqliteD1Database } from './helpers/sqlite-d1.js';

const migrationPath = resolve(
  import.meta.dirname || '.',
  '../worker/migrations/0019_capacity_drop_write_amplifying_indexes.sql',
);

const migrationSql = readFileSync(migrationPath, 'utf-8');

test('migration 0019 drops write-amplifying indexes from command hot-path tables', () => {
  const db = new SqliteD1Database();
  try {
    db.db.exec(`
      CREATE TABLE mutation_receipts (
        account_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        scope_type TEXT NOT NULL,
        scope_id TEXT,
        mutation_kind TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        response_json TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        correlation_id TEXT,
        applied_at INTEGER NOT NULL,
        PRIMARY KEY (account_id, request_id)
      );
      CREATE INDEX idx_mutation_receipts_scope
        ON mutation_receipts(account_id, scope_type, scope_id, applied_at DESC);
      CREATE INDEX idx_mutation_receipts_account_applied
        ON mutation_receipts(account_id, applied_at DESC, request_id);

      CREATE TABLE learner_read_models (
        learner_id TEXT NOT NULL,
        model_key TEXT NOT NULL,
        model_json TEXT NOT NULL,
        source_revision INTEGER NOT NULL DEFAULT 0,
        generated_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (learner_id, model_key)
      );
      CREATE INDEX idx_learner_read_models_key_updated
        ON learner_read_models(model_key, updated_at DESC);

      CREATE TABLE practice_sessions (
        id TEXT PRIMARY KEY,
        learner_id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        session_kind TEXT NOT NULL,
        status TEXT NOT NULL,
        session_state_json TEXT,
        summary_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        updated_by_account_id TEXT
      );
      CREATE INDEX idx_practice_sessions_updated
        ON practice_sessions(updated_at DESC);
    `);

    db.db.exec(migrationSql);

    const rows = db.db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'index'
        AND name IN (
          'idx_mutation_receipts_scope',
          'idx_mutation_receipts_account_applied',
          'idx_learner_read_models_key_updated',
          'idx_practice_sessions_updated'
        )
      ORDER BY name
    `).all();

    assert.deepEqual(rows, []);
  } finally {
    db.close();
  }
});
