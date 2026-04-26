import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SqliteD1Database, createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';

const MIGRATION_0011_FILENAME = '0011_admin_ops_p1_5_hardening.sql';

function rootDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function migration0011Sql() {
  return fs.readFileSync(
    path.join(rootDir(), 'worker', 'migrations', MIGRATION_0011_FILENAME),
    'utf8',
  );
}

function pre0011MigrationSql() {
  const migrationsDir = path.join(rootDir(), 'worker', 'migrations');
  return fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql') && name !== MIGRATION_0011_FILENAME)
    .sort()
    .map((name) => fs.readFileSync(path.join(migrationsDir, name), 'utf8'));
}

function createPre0011Database() {
  const db = new SqliteD1Database();
  for (const sql of pre0011MigrationSql()) {
    db.db.exec(sql);
  }
  return db;
}

function splitSqlStatements(sql) {
  // Strip SQL line comments then split on `;`. Matches the per-statement
  // approach Wrangler uses when applying migrations.
  const withoutComments = sql
    .split('\n')
    .map((line) => {
      const commentIdx = line.indexOf('--');
      return commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    })
    .join('\n');
  return withoutComments
    .split(';')
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0);
}

function applyMigration0011Idempotent(db) {
  // Simulates Wrangler's per-migration tracker: a duplicate-column error on
  // re-apply is swallowed (the column is already there, which is the
  // desired end-state). All other errors bubble.
  const statements = splitSqlStatements(migration0011Sql());
  for (const stmt of statements) {
    try {
      db.db.exec(stmt);
    } catch (err) {
      const message = String(err && err.message ? err.message : err);
      if (/duplicate column name/i.test(message)) continue;
      throw err;
    }
  }
}

function tableColumnNames(db, table) {
  return db.db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
}

function columnInfo(db, table, name) {
  return db.db.prepare(`PRAGMA table_info(${table})`).all().find((row) => row.name === name) ?? null;
}

function indexExists(db, indexName) {
  const row = db.db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?")
    .get(indexName);
  return Boolean(row);
}

test('migration 0011 adds row_version + status_revision to account_ops_metadata', () => {
  const db = createMigratedSqliteD1Database();
  try {
    const rowVersion = columnInfo(db, 'account_ops_metadata', 'row_version');
    assert.ok(rowVersion, 'row_version column must exist');
    assert.equal(rowVersion.type, 'INTEGER');
    assert.equal(rowVersion.notnull, 1);
    assert.equal(rowVersion.dflt_value, '0');

    const statusRevision = columnInfo(db, 'account_ops_metadata', 'status_revision');
    assert.ok(statusRevision, 'status_revision column must exist');
    assert.equal(statusRevision.type, 'INTEGER');
    assert.equal(statusRevision.notnull, 1);
    assert.equal(statusRevision.dflt_value, '0');
  } finally {
    db.close();
  }
});

test('migration 0011 adds status_revision_at_issue to account_sessions', () => {
  const db = createMigratedSqliteD1Database();
  try {
    const column = columnInfo(db, 'account_sessions', 'status_revision_at_issue');
    assert.ok(column, 'status_revision_at_issue column must exist');
    assert.equal(column.type, 'INTEGER');
    assert.equal(column.notnull, 1);
    assert.equal(column.dflt_value, '0');
  } finally {
    db.close();
  }
});

test('migration 0011 adds release-tracking columns to ops_error_events', () => {
  const db = createMigratedSqliteD1Database();
  try {
    for (const name of ['first_seen_release', 'last_seen_release', 'resolved_in_release']) {
      const column = columnInfo(db, 'ops_error_events', name);
      assert.ok(column, `${name} column must exist`);
      assert.equal(column.type, 'TEXT');
      // Nullable for forensic-data tolerance.
      assert.equal(column.notnull, 0);
    }
    const lastStatusChange = columnInfo(db, 'ops_error_events', 'last_status_change_at');
    assert.ok(lastStatusChange, 'last_status_change_at column must exist');
    assert.equal(lastStatusChange.type, 'INTEGER');
    assert.equal(lastStatusChange.notnull, 0);
  } finally {
    db.close();
  }
});

test('migration 0011 registers the two release-tracking indexes', () => {
  const db = createMigratedSqliteD1Database();
  try {
    assert.equal(indexExists(db, 'idx_ops_error_events_last_seen_release'), true);
    assert.equal(indexExists(db, 'idx_ops_error_events_status_change'), true);
  } finally {
    db.close();
  }
});

test('migration 0011 applies cleanly on a 0010-shaped database (fresh apply)', () => {
  const db = createPre0011Database();
  try {
    // Confirm the new columns do not exist before 0011 runs.
    assert.equal(tableColumnNames(db, 'account_ops_metadata').includes('row_version'), false);
    assert.equal(tableColumnNames(db, 'account_sessions').includes('status_revision_at_issue'), false);
    assert.equal(tableColumnNames(db, 'ops_error_events').includes('first_seen_release'), false);

    // Apply migration.
    db.db.exec(migration0011Sql());

    // All 7 new columns land.
    assert.equal(tableColumnNames(db, 'account_ops_metadata').includes('row_version'), true);
    assert.equal(tableColumnNames(db, 'account_ops_metadata').includes('status_revision'), true);
    assert.equal(tableColumnNames(db, 'account_sessions').includes('status_revision_at_issue'), true);
    assert.equal(tableColumnNames(db, 'ops_error_events').includes('first_seen_release'), true);
    assert.equal(tableColumnNames(db, 'ops_error_events').includes('last_seen_release'), true);
    assert.equal(tableColumnNames(db, 'ops_error_events').includes('resolved_in_release'), true);
    assert.equal(tableColumnNames(db, 'ops_error_events').includes('last_status_change_at'), true);

    // Both indexes present.
    assert.equal(indexExists(db, 'idx_ops_error_events_last_seen_release'), true);
    assert.equal(indexExists(db, 'idx_ops_error_events_status_change'), true);
  } finally {
    db.close();
  }
});

test('migration 0011 is idempotent on re-apply via per-statement tolerance', () => {
  // Mirrors Wrangler's d1_migrations tracker semantics: applying a migration
  // whose ALTER TABLE ADD COLUMN targets an already-present column does not
  // error when the runner treats "duplicate column name" as a no-op.
  const db = createPre0011Database();
  try {
    applyMigration0011Idempotent(db);
    // Second application must not throw.
    applyMigration0011Idempotent(db);

    // End state is correct.
    assert.equal(tableColumnNames(db, 'account_ops_metadata').includes('row_version'), true);
    assert.equal(tableColumnNames(db, 'account_ops_metadata').includes('status_revision'), true);
    assert.equal(tableColumnNames(db, 'account_sessions').includes('status_revision_at_issue'), true);
    assert.equal(indexExists(db, 'idx_ops_error_events_last_seen_release'), true);
    assert.equal(indexExists(db, 'idx_ops_error_events_status_change'), true);
  } finally {
    db.close();
  }
});

test('migration 0011 tolerates partially pre-existing columns (hotfix scenario)', () => {
  const db = createPre0011Database();
  try {
    // Simulate hotfix: row_version was manually added ahead of this migration.
    db.db.exec(
      'ALTER TABLE account_ops_metadata ADD COLUMN row_version INTEGER NOT NULL DEFAULT 0',
    );
    assert.equal(tableColumnNames(db, 'account_ops_metadata').includes('row_version'), true);
    assert.equal(tableColumnNames(db, 'account_ops_metadata').includes('status_revision'), false);

    // Migration runner tolerates the duplicate ALTER and applies the rest.
    applyMigration0011Idempotent(db);

    assert.equal(tableColumnNames(db, 'account_ops_metadata').includes('row_version'), true);
    assert.equal(tableColumnNames(db, 'account_ops_metadata').includes('status_revision'), true);
    assert.equal(tableColumnNames(db, 'ops_error_events').includes('first_seen_release'), true);
    assert.equal(tableColumnNames(db, 'ops_error_events').includes('resolved_in_release'), true);
  } finally {
    db.close();
  }
});

test('migration 0011 default-initialises new INTEGER columns on pre-existing rows to 0', () => {
  const db = createPre0011Database();
  try {
    // Seed rows on a 0010-shaped DB.
    const now = 1_700_000_000_000;
    db.db.prepare(`
      INSERT INTO adult_accounts (id, email, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('adult-pre-1', 'pre1@example.test', 'Pre One', now, now);
    db.db.prepare(`
      INSERT INTO account_ops_metadata (
        account_id, ops_status, plan_label, tags_json, internal_notes,
        updated_at, updated_by_account_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('adult-pre-1', 'active', null, '[]', null, now, null);
    db.db.prepare(`
      INSERT INTO account_sessions (
        id, account_id, session_hash, provider, created_at, expires_at, session_kind
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('sess-pre-1', 'adult-pre-1', 'hash-pre-1', 'local', now, now + 86_400_000, 'real');
    db.db.prepare(`
      INSERT INTO ops_error_events (
        id, fingerprint, error_kind, message_first_line, first_frame,
        route_name, user_agent, account_id, first_seen, last_seen,
        occurrence_count, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('evt-pre-1', 'fp-pre-1', 'TypeError', 'pre-existing row', 'at x',
      '/x', 'ua', 'adult-pre-1', now, now, 1, 'open');

    // Apply 0011.
    db.db.exec(migration0011Sql());

    const metaRow = db.db.prepare(
      'SELECT row_version, status_revision FROM account_ops_metadata WHERE account_id = ?',
    ).get('adult-pre-1');
    assert.equal(metaRow.row_version, 0);
    assert.equal(metaRow.status_revision, 0);

    const sessionRow = db.db.prepare(
      'SELECT status_revision_at_issue FROM account_sessions WHERE id = ?',
    ).get('sess-pre-1');
    assert.equal(sessionRow.status_revision_at_issue, 0);

    const errorRow = db.db.prepare(`
      SELECT first_seen_release, last_seen_release, resolved_in_release, last_status_change_at
      FROM ops_error_events WHERE id = ?
    `).get('evt-pre-1');
    assert.equal(errorRow.first_seen_release, null);
    assert.equal(errorRow.last_seen_release, null);
    assert.equal(errorRow.resolved_in_release, null);
    assert.equal(errorRow.last_status_change_at, null);
  } finally {
    db.close();
  }
});

test('migration 0011 indexes route release filters off table scans', () => {
  const db = createMigratedSqliteD1Database();
  try {
    const planRelease = db.db.prepare(`
      EXPLAIN QUERY PLAN
      SELECT id FROM ops_error_events WHERE last_seen_release = ?
    `).all();
    const detailRelease = planRelease.map((row) => row.detail).join(' | ');
    assert.match(detailRelease, /idx_ops_error_events_last_seen_release/);

    const planStatus = db.db.prepare(`
      EXPLAIN QUERY PLAN
      SELECT id FROM ops_error_events WHERE status = ? AND last_status_change_at > ?
    `).all();
    const detailStatus = planStatus.map((row) => row.detail).join(' | ');
    assert.match(detailStatus, /idx_ops_error_events_status_change/);
  } finally {
    db.close();
  }
});
