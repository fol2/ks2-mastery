import test from 'node:test';
import assert from 'node:assert/strict';

import { SqliteD1Database, createMigratedSqliteD1Database, migrationSql } from './helpers/sqlite-d1.js';

function columnMap(rows) {
  const out = Object.create(null);
  for (const row of rows) {
    out[row.name] = row;
  }
  return out;
}

function indexExists(db, name) {
  const row = db.db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?").get(name);
  return Boolean(row);
}

function tableExists(db, name) {
  const row = db.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  return Boolean(row);
}

test('migration 0010 creates admin_kpi_metrics with expected shape', () => {
  const db = createMigratedSqliteD1Database();
  try {
    assert.equal(tableExists(db, 'admin_kpi_metrics'), true);
    const columns = columnMap(db.db.prepare('PRAGMA table_info(admin_kpi_metrics)').all());
    assert.deepEqual(Object.keys(columns).sort(), ['metric_count', 'metric_key', 'updated_at']);
    assert.equal(columns.metric_key.type, 'TEXT');
    assert.equal(columns.metric_key.pk, 1);
    assert.equal(columns.metric_count.type, 'INTEGER');
    assert.equal(columns.metric_count.notnull, 1);
    assert.equal(columns.metric_count.dflt_value, '0');
    assert.equal(columns.updated_at.type, 'INTEGER');
    assert.equal(columns.updated_at.notnull, 1);
  } finally {
    db.close();
  }
});

test('migration 0010 creates account_ops_metadata with PK, FKs, and ops_status CHECK', () => {
  const db = createMigratedSqliteD1Database();
  try {
    assert.equal(tableExists(db, 'account_ops_metadata'), true);
    const columns = columnMap(db.db.prepare('PRAGMA table_info(account_ops_metadata)').all());
    assert.deepEqual(Object.keys(columns).sort(), [
      'account_id',
      'internal_notes',
      'ops_status',
      'plan_label',
      'tags_json',
      'updated_at',
      'updated_by_account_id',
    ]);
    assert.equal(columns.account_id.pk, 1);
    assert.equal(columns.ops_status.notnull, 1);
    assert.equal(columns.ops_status.dflt_value, "'active'");
    assert.equal(columns.tags_json.notnull, 1);
    assert.equal(columns.tags_json.dflt_value, "'[]'");
    assert.equal(columns.updated_at.notnull, 1);

    const fkRows = db.db.prepare('PRAGMA foreign_key_list(account_ops_metadata)').all();
    const fkByColumn = Object.create(null);
    for (const row of fkRows) fkByColumn[row.from] = row;
    assert.equal(fkByColumn.account_id.table, 'adult_accounts');
    assert.equal(fkByColumn.account_id.on_delete, 'CASCADE');
    assert.equal(fkByColumn.updated_by_account_id.table, 'adult_accounts');
    assert.equal(fkByColumn.updated_by_account_id.on_delete, 'SET NULL');
  } finally {
    db.close();
  }
});

test('migration 0010 creates ops_error_events with expected columns, defaults, and FK', () => {
  const db = createMigratedSqliteD1Database();
  try {
    assert.equal(tableExists(db, 'ops_error_events'), true);
    const columns = columnMap(db.db.prepare('PRAGMA table_info(ops_error_events)').all());
    assert.deepEqual(Object.keys(columns).sort(), [
      'account_id',
      'error_kind',
      'fingerprint',
      'first_frame',
      'first_seen',
      'id',
      'last_seen',
      'message_first_line',
      'occurrence_count',
      'route_name',
      'status',
      'user_agent',
    ]);
    assert.equal(columns.id.pk, 1);
    assert.equal(columns.fingerprint.notnull, 1);
    assert.equal(columns.error_kind.notnull, 1);
    assert.equal(columns.message_first_line.notnull, 1);
    assert.equal(columns.first_seen.notnull, 1);
    assert.equal(columns.last_seen.notnull, 1);
    assert.equal(columns.occurrence_count.notnull, 1);
    assert.equal(columns.occurrence_count.dflt_value, '1');
    assert.equal(columns.status.notnull, 1);
    assert.equal(columns.status.dflt_value, "'open'");

    const fkRows = db.db.prepare('PRAGMA foreign_key_list(ops_error_events)').all();
    assert.equal(fkRows.length, 1);
    assert.equal(fkRows[0].from, 'account_id');
    assert.equal(fkRows[0].table, 'adult_accounts');
    assert.equal(fkRows[0].on_delete, 'SET NULL');
  } finally {
    db.close();
  }
});

test('migration 0010 is idempotent: re-applying 0010 emits no DDL error', () => {
  const db = createMigratedSqliteD1Database();
  try {
    const sqls = migrationSql();
    const latest = sqls[sqls.length - 1];
    // Reapplying the final migration must not raise due to IF NOT EXISTS.
    db.db.exec(latest);
    db.db.exec(latest);
    assert.equal(tableExists(db, 'admin_kpi_metrics'), true);
    assert.equal(tableExists(db, 'account_ops_metadata'), true);
    assert.equal(tableExists(db, 'ops_error_events'), true);
  } finally {
    db.close();
  }
});

test('ops_error_events CHECK constraint rejects unknown status', () => {
  const db = createMigratedSqliteD1Database();
  try {
    db.db.prepare(`
      INSERT INTO adult_accounts (id, email, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('adult-1', 'admin@example.test', 'Admin', 1, 1);

    assert.throws(() => {
      db.db.prepare(`
        INSERT INTO ops_error_events (
          id, fingerprint, error_kind, message_first_line, first_frame,
          route_name, user_agent, account_id, first_seen, last_seen,
          occurrence_count, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'evt-bad', 'fp-bad', 'TypeError', 'boom', 'at foo',
        '/x', 'ua', 'adult-1', 1, 1,
        1, 'bogus',
      );
    }, /CHECK constraint failed/i);
  } finally {
    db.close();
  }
});

test('account_ops_metadata CHECK constraint rejects unknown ops_status', () => {
  const db = createMigratedSqliteD1Database();
  try {
    db.db.prepare(`
      INSERT INTO adult_accounts (id, email, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('adult-2', 'ops@example.test', 'Ops', 1, 1);

    assert.throws(() => {
      db.db.prepare(`
        INSERT INTO account_ops_metadata (
          account_id, ops_status, plan_label, tags_json, internal_notes,
          updated_at, updated_by_account_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('adult-2', 'unknown', null, '[]', null, 1, null);
    }, /CHECK constraint failed/i);
  } finally {
    db.close();
  }
});

test('ops_error_events fingerprint UNIQUE index blocks duplicate insert', () => {
  const db = createMigratedSqliteD1Database();
  try {
    const insert = db.db.prepare(`
      INSERT INTO ops_error_events (
        id, fingerprint, error_kind, message_first_line, first_frame,
        route_name, user_agent, account_id, first_seen, last_seen,
        occurrence_count, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(
      'evt-1', 'fp-shared', 'TypeError', 'boom', 'at foo',
      '/x', 'ua', null, 1, 1,
      1, 'open',
    );
    assert.throws(() => {
      insert.run(
        'evt-2', 'fp-shared', 'TypeError', 'boom', 'at foo',
        '/x', 'ua', null, 2, 2,
        1, 'open',
      );
    }, /UNIQUE constraint failed/i);
  } finally {
    db.close();
  }
});

test('migration 0010 registers all required new indexes', () => {
  const db = createMigratedSqliteD1Database();
  try {
    for (const name of [
      'idx_ops_error_events_fingerprint',
      'idx_ops_error_events_status_last_seen',
      'idx_ops_error_events_last_seen',
      'idx_ops_error_events_tuple',
      'idx_practice_sessions_updated',
      'idx_event_log_created',
      'idx_mutation_receipts_applied',
    ]) {
      assert.equal(indexExists(db, name), true, `missing index ${name}`);
    }
  } finally {
    db.close();
  }
});

test('idx_ops_error_events_tuple supports (error_kind, message_first_line, first_frame) preflight lookup', () => {
  const db = createMigratedSqliteD1Database();
  try {
    const plan = db.db.prepare(`
      EXPLAIN QUERY PLAN
      SELECT id FROM ops_error_events
      WHERE error_kind = ? AND message_first_line = ? AND first_frame = ?
    `).all();
    const detail = plan.map((row) => row.detail).join(' | ');
    assert.match(detail, /SEARCH .*ops_error_events/i);
    assert.match(detail, /idx_ops_error_events_tuple/);
  } finally {
    db.close();
  }
});

test('windowed KPI COUNT queries use the new DESC indexes (not full table scan)', () => {
  const db = createMigratedSqliteD1Database();
  try {
    const eventPlan = db.db.prepare('EXPLAIN QUERY PLAN SELECT COUNT(*) FROM event_log WHERE created_at > ?').all();
    const eventDetail = eventPlan.map((row) => row.detail).join(' | ');
    assert.match(eventDetail, /SEARCH .*event_log/i);
    assert.match(eventDetail, /idx_event_log_created/);
    assert.doesNotMatch(eventDetail, /SCAN TABLE event_log/i);

    const sessionsPlan = db.db.prepare('EXPLAIN QUERY PLAN SELECT COUNT(*) FROM practice_sessions WHERE updated_at > ?').all();
    const sessionsDetail = sessionsPlan.map((row) => row.detail).join(' | ');
    assert.match(sessionsDetail, /SEARCH .*practice_sessions/i);
    assert.match(sessionsDetail, /idx_practice_sessions_updated/);
    assert.doesNotMatch(sessionsDetail, /SCAN TABLE practice_sessions/i);

    const receiptsPlan = db.db.prepare('EXPLAIN QUERY PLAN SELECT COUNT(*) FROM mutation_receipts WHERE applied_at > ?').all();
    const receiptsDetail = receiptsPlan.map((row) => row.detail).join(' | ');
    assert.match(receiptsDetail, /SEARCH .*mutation_receipts/i);
    assert.match(receiptsDetail, /idx_mutation_receipts_applied/);
    assert.doesNotMatch(receiptsDetail, /SCAN TABLE mutation_receipts/i);
  } finally {
    db.close();
  }
});

test('migration 0010 SQL file parses cleanly against a fresh in-memory SQLite', () => {
  const db = new SqliteD1Database();
  try {
    const sqls = migrationSql();
    for (const sql of sqls) db.db.exec(sql);
    // Fresh apply succeeds and the three new tables are queryable.
    assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM admin_kpi_metrics').get().n, 0);
    assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM account_ops_metadata').get().n, 0);
    assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM ops_error_events').get().n, 0);
  } finally {
    db.close();
  }
});
