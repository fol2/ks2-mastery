import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SqliteD1Database, createMigratedSqliteD1Database, migrationSql } from './helpers/sqlite-d1.js';

const MIGRATION_0013_FILENAME = '0013_admin_console_p3.sql';

function rootDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function migration0013Sql() {
  return fs.readFileSync(
    path.join(rootDir(), 'worker', 'migrations', MIGRATION_0013_FILENAME),
    'utf8',
  );
}

function pre0013MigrationSql() {
  const migrationsDir = path.join(rootDir(), 'worker', 'migrations');
  return fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql') && name !== MIGRATION_0013_FILENAME)
    .sort()
    .map((name) => fs.readFileSync(path.join(migrationsDir, name), 'utf8'));
}

function createPre0013Database() {
  const db = new SqliteD1Database();
  for (const sql of pre0013MigrationSql()) {
    db.db.exec(sql);
  }
  return db;
}

function columnMap(rows) {
  const out = Object.create(null);
  for (const row of rows) {
    out[row.name] = row;
  }
  return out;
}

function tableExists(db, name) {
  const row = db.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  return Boolean(row);
}

function indexExists(db, name) {
  const row = db.db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?").get(name);
  return Boolean(row);
}

// ---------------------------------------------------------------------------
// ops_error_event_occurrences (R6)
// ---------------------------------------------------------------------------

test('migration 0013 creates ops_error_event_occurrences with expected columns and types', () => {
  const db = createMigratedSqliteD1Database();
  try {
    assert.equal(tableExists(db, 'ops_error_event_occurrences'), true);
    const columns = columnMap(db.db.prepare('PRAGMA table_info(ops_error_event_occurrences)').all());
    assert.deepEqual(Object.keys(columns).sort(), [
      'account_id',
      'event_id',
      'id',
      'is_demo',
      'occurred_at',
      'release',
      'request_id',
      'route_name',
      'user_agent',
    ]);
    assert.equal(columns.id.type, 'TEXT');
    assert.equal(columns.id.pk, 1);
    assert.equal(columns.event_id.type, 'TEXT');
    assert.equal(columns.event_id.notnull, 1);
    assert.equal(columns.occurred_at.type, 'INTEGER');
    assert.equal(columns.occurred_at.notnull, 1);
    assert.equal(columns.is_demo.type, 'INTEGER');
    assert.equal(columns.is_demo.dflt_value, '0');
    // Nullable columns.
    assert.equal(columns.release.notnull, 0);
    assert.equal(columns.route_name.notnull, 0);
    assert.equal(columns.account_id.notnull, 0);
    assert.equal(columns.user_agent.notnull, 0);
    assert.equal(columns.request_id.notnull, 0);
  } finally {
    db.close();
  }
});

test('migration 0013 creates idx_occ_event_occurred index on occurrences', () => {
  const db = createMigratedSqliteD1Database();
  try {
    assert.equal(indexExists(db, 'idx_occ_event_occurred'), true);
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// admin_request_denials (R8)
// ---------------------------------------------------------------------------

test('migration 0013 creates admin_request_denials with expected columns and types', () => {
  const db = createMigratedSqliteD1Database();
  try {
    assert.equal(tableExists(db, 'admin_request_denials'), true);
    const columns = columnMap(db.db.prepare('PRAGMA table_info(admin_request_denials)').all());
    assert.deepEqual(Object.keys(columns).sort(), [
      'account_id',
      'denial_reason',
      'denied_at',
      'detail_json',
      'id',
      'is_demo',
      'learner_id',
      'release',
      'route_name',
      'session_id_last8',
    ]);
    assert.equal(columns.id.type, 'TEXT');
    assert.equal(columns.id.pk, 1);
    assert.equal(columns.denied_at.type, 'INTEGER');
    assert.equal(columns.denied_at.notnull, 1);
    assert.equal(columns.denial_reason.type, 'TEXT');
    assert.equal(columns.denial_reason.notnull, 1);
    assert.equal(columns.is_demo.type, 'INTEGER');
    assert.equal(columns.is_demo.dflt_value, '0');
    // Nullable columns.
    assert.equal(columns.route_name.notnull, 0);
    assert.equal(columns.account_id.notnull, 0);
    assert.equal(columns.learner_id.notnull, 0);
    assert.equal(columns.session_id_last8.notnull, 0);
    assert.equal(columns.release.notnull, 0);
    assert.equal(columns.detail_json.notnull, 0);
  } finally {
    db.close();
  }
});

test('migration 0013 creates all three denial indexes', () => {
  const db = createMigratedSqliteD1Database();
  try {
    assert.equal(indexExists(db, 'idx_denials_denied_at'), true);
    assert.equal(indexExists(db, 'idx_denials_account_denied_at'), true);
    assert.equal(indexExists(db, 'idx_denials_reason_denied_at'), true);
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// admin_marketing_messages (R19)
// ---------------------------------------------------------------------------

test('migration 0013 creates admin_marketing_messages with expected columns, defaults, and types', () => {
  const db = createMigratedSqliteD1Database();
  try {
    assert.equal(tableExists(db, 'admin_marketing_messages'), true);
    const columns = columnMap(db.db.prepare('PRAGMA table_info(admin_marketing_messages)').all());
    assert.deepEqual(Object.keys(columns).sort(), [
      'audience',
      'body_text',
      'created_at',
      'created_by',
      'ends_at',
      'id',
      'message_type',
      'published_at',
      'published_by',
      'row_version',
      'severity_token',
      'starts_at',
      'status',
      'title',
      'updated_at',
      'updated_by',
    ]);
    assert.equal(columns.id.type, 'TEXT');
    assert.equal(columns.id.pk, 1);
    assert.equal(columns.message_type.type, 'TEXT');
    assert.equal(columns.message_type.notnull, 1);
    assert.equal(columns.message_type.dflt_value, "'announcement'");
    assert.equal(columns.status.type, 'TEXT');
    assert.equal(columns.status.notnull, 1);
    assert.equal(columns.status.dflt_value, "'draft'");
    assert.equal(columns.title.notnull, 1);
    assert.equal(columns.body_text.notnull, 1);
    assert.equal(columns.severity_token.dflt_value, "'info'");
    assert.equal(columns.audience.notnull, 1);
    assert.equal(columns.audience.dflt_value, "'internal'");
    assert.equal(columns.created_by.notnull, 1);
    assert.equal(columns.updated_by.notnull, 1);
    assert.equal(columns.created_at.type, 'INTEGER');
    assert.equal(columns.created_at.notnull, 1);
    assert.equal(columns.updated_at.type, 'INTEGER');
    assert.equal(columns.updated_at.notnull, 1);
    assert.equal(columns.row_version.type, 'INTEGER');
    assert.equal(columns.row_version.notnull, 1);
    assert.equal(columns.row_version.dflt_value, '0');
    // Nullable columns.
    assert.equal(columns.starts_at.notnull, 0);
    assert.equal(columns.ends_at.notnull, 0);
    assert.equal(columns.published_by.notnull, 0);
    assert.equal(columns.published_at.notnull, 0);
  } finally {
    db.close();
  }
});

test('migration 0013 creates idx_marketing_status_starts index', () => {
  const db = createMigratedSqliteD1Database();
  try {
    assert.equal(indexExists(db, 'idx_marketing_status_starts'), true);
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

test('migration 0013 is idempotent: re-applying does not error', () => {
  const db = createMigratedSqliteD1Database();
  try {
    const sql = migration0013Sql();
    // Second and third apply must not throw due to IF NOT EXISTS.
    db.db.exec(sql);
    db.db.exec(sql);
    assert.equal(tableExists(db, 'ops_error_event_occurrences'), true);
    assert.equal(tableExists(db, 'admin_request_denials'), true);
    assert.equal(tableExists(db, 'admin_marketing_messages'), true);
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// Fresh apply on pre-0013 database (existing 0001-0012 migrations)
// ---------------------------------------------------------------------------

test('migration 0013 applies cleanly on database with existing 0001-0012 migrations', () => {
  const db = createPre0013Database();
  try {
    // Tables must not exist before 0013.
    assert.equal(tableExists(db, 'ops_error_event_occurrences'), false);
    assert.equal(tableExists(db, 'admin_request_denials'), false);
    assert.equal(tableExists(db, 'admin_marketing_messages'), false);

    // Apply 0013.
    db.db.exec(migration0013Sql());

    // All three tables exist.
    assert.equal(tableExists(db, 'ops_error_event_occurrences'), true);
    assert.equal(tableExists(db, 'admin_request_denials'), true);
    assert.equal(tableExists(db, 'admin_marketing_messages'), true);

    // All indexes exist.
    assert.equal(indexExists(db, 'idx_occ_event_occurred'), true);
    assert.equal(indexExists(db, 'idx_denials_denied_at'), true);
    assert.equal(indexExists(db, 'idx_denials_account_denied_at'), true);
    assert.equal(indexExists(db, 'idx_denials_reason_denied_at'), true);
    assert.equal(indexExists(db, 'idx_marketing_status_starts'), true);
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// Fresh in-memory apply (all migrations including 0013)
// ---------------------------------------------------------------------------

test('migration 0013 SQL parses cleanly against a fresh in-memory SQLite with all migrations', () => {
  const db = new SqliteD1Database();
  try {
    const sqls = migrationSql();
    for (const sql of sqls) db.db.exec(sql);
    // Tables are queryable.
    assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM ops_error_event_occurrences').get().n, 0);
    assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM admin_request_denials').get().n, 0);
    assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM admin_marketing_messages').get().n, 0);
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// Index query plans
// ---------------------------------------------------------------------------

test('idx_occ_event_occurred routes occurrence timeline query off table scan', () => {
  const db = createMigratedSqliteD1Database();
  try {
    const plan = db.db.prepare(`
      EXPLAIN QUERY PLAN
      SELECT id FROM ops_error_event_occurrences
      WHERE event_id = ? ORDER BY occurred_at DESC
    `).all();
    const detail = plan.map((row) => row.detail).join(' | ');
    assert.match(detail, /idx_occ_event_occurred/);
  } finally {
    db.close();
  }
});

test('idx_denials_denied_at routes chronological denial query off table scan', () => {
  const db = createMigratedSqliteD1Database();
  try {
    const plan = db.db.prepare(`
      EXPLAIN QUERY PLAN
      SELECT id FROM admin_request_denials ORDER BY denied_at DESC
    `).all();
    const detail = plan.map((row) => row.detail).join(' | ');
    assert.match(detail, /idx_denials_denied_at/);
  } finally {
    db.close();
  }
});

test('idx_denials_account_denied_at routes per-account denial query off table scan', () => {
  const db = createMigratedSqliteD1Database();
  try {
    const plan = db.db.prepare(`
      EXPLAIN QUERY PLAN
      SELECT id FROM admin_request_denials
      WHERE account_id = ? ORDER BY denied_at DESC
    `).all();
    const detail = plan.map((row) => row.detail).join(' | ');
    assert.match(detail, /idx_denials_account_denied_at/);
  } finally {
    db.close();
  }
});

test('idx_denials_reason_denied_at routes per-reason denial query off table scan', () => {
  const db = createMigratedSqliteD1Database();
  try {
    const plan = db.db.prepare(`
      EXPLAIN QUERY PLAN
      SELECT id FROM admin_request_denials
      WHERE denial_reason = ? ORDER BY denied_at DESC
    `).all();
    const detail = plan.map((row) => row.detail).join(' | ');
    assert.match(detail, /idx_denials_reason_denied_at/);
  } finally {
    db.close();
  }
});

test('idx_marketing_status_starts routes active-message query off table scan', () => {
  const db = createMigratedSqliteD1Database();
  try {
    const plan = db.db.prepare(`
      EXPLAIN QUERY PLAN
      SELECT id FROM admin_marketing_messages
      WHERE status = ? AND starts_at <= ?
    `).all();
    const detail = plan.map((row) => row.detail).join(' | ');
    assert.match(detail, /idx_marketing_status_starts/);
  } finally {
    db.close();
  }
});
