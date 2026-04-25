// Local SQLite-backed D1 double used by the Worker test suite.
//
// U3 (Phase 2) capacity-telemetry note: the synthetic
// `meta.rows_read` / `meta.rows_written` values produced below mirror the
// *shape* of the fields Cloudflare's production D1 exposes, not the exact
// numbers. Production D1 is the source of truth for absolute row metrics
// (indexes, internal page scans, transaction overhead) and the
// `[ks2-worker] {event: 'capacity.request', ...}` telemetry emitted by
// `worker/src/logger.js` (via the `withCapacityCollector` D1 proxy in
// `worker/src/d1.js`) reads those production fields directly in the
// deployed Worker. Local tests use this helper to assert that the
// telemetry *contract* records a non-zero read attribution for
// row-returning reads and a non-zero write attribution for row-modifying
// mutations. Do not treat a local assertion on `rows_read === n` as a
// performance claim — it is a contract check.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

function rootDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

class SqliteD1Statement {
  constructor(statement, { sql = '', recordQuery = null } = {}) {
    this.statement = statement;
    this.sql = sql;
    this.recordQuery = recordQuery;
    this.params = [];
  }

  bind(...params) {
    this.params = params;
    return this;
  }

  async first(columnName = undefined) {
    const row = this.statement.get(...this.params);
    const rowsRead = row ? 1 : 0;
    this.recordQuery?.({
      operation: 'first',
      sql: this.sql,
      params: this.params,
      rowCount: rowsRead,
      // U4: expose synthetic meta.rows_read on `.first()` so capacity
      // telemetry tests can assert non-zero read attribution for
      // single-row lookups. The shape mirrors production D1 as closely
      // as the local SQLite helper can afford; see the module comment
      // below about the local helper being shape-only and production
      // D1 being the source of truth.
      rowsRead,
    });
    if (!row) return null;
    if (typeof columnName === 'string' && columnName) return row[columnName] ?? null;
    return { ...row };
  }

  async run() {
    const meta = this.statement.run(...this.params);
    const rowsWritten = Math.max(0, Number(meta.changes) || 0);
    this.recordQuery?.({
      operation: 'run',
      sql: this.sql,
      params: this.params,
      changes: meta.changes,
      rowCount: meta.changes,
      // U4: synthetic rows_read / rows_written for telemetry tests.
      rowsRead: 0,
      rowsWritten,
    });
    return {
      success: true,
      meta: {
        changes: meta.changes,
        last_row_id: Number(meta.lastInsertRowid || 0),
        // U4: rows_read is 0 for a mutation that does not scan; rows_written
        // reflects the `changes` meta from sqlite so production D1 and the
        // local helper expose the same telemetry shape. Production D1 may
        // surface rows_read for mutations that perform row-by-row scans
        // (e.g. UPDATE with a WHERE clause without an index); the local
        // helper is shape-only, not a performance oracle.
        rows_read: 0,
        rows_written: rowsWritten,
      },
    };
  }

  async all() {
    const rows = this.statement.all(...this.params).map((row) => ({ ...row }));
    this.recordQuery?.({
      operation: 'all',
      sql: this.sql,
      params: this.params,
      rowCount: rows.length,
      rowsRead: rows.length,
      rowsWritten: 0,
    });
    return {
      results: rows,
      meta: {
        // U4: rows_read mirrors the number of rows returned, rows_written
        // stays 0 for a `SELECT`. Production D1 may report a higher
        // rows_read when indexes force extra page reads; again this
        // helper is shape-only and production D1 remains the source of
        // truth for absolute numbers.
        rows_read: rows.length,
        rows_written: 0,
      },
    };
  }
}

export class SqliteD1Database {
  constructor(filename = ':memory:') {
    this.db = new DatabaseSync(filename);
    this.queryLog = [];
    this.supportsSqlTransactions = true;
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  prepare(sql) {
    return new SqliteD1Statement(this.db.prepare(sql), {
      sql,
      recordQuery: (entry) => {
        this.queryLog.push({
          ...entry,
          params: Array.isArray(entry.params) ? [...entry.params] : [],
        });
      },
    });
  }

  async exec(sql) {
    this.db.exec(sql);
  }

  async batch(statements) {
    const savepoint = `sqlite_d1_batch_${Math.random().toString(36).slice(2, 10)}`;
    this.db.exec(`SAVEPOINT ${savepoint};`);
    try {
      const results = [];
      for (const statement of statements) {
        if (!statement) continue;
        results.push(await statement.run());
      }
      this.db.exec(`RELEASE SAVEPOINT ${savepoint};`);
      return results;
    } catch (error) {
      this.db.exec(`ROLLBACK TO SAVEPOINT ${savepoint};`);
      this.db.exec(`RELEASE SAVEPOINT ${savepoint};`);
      throw error;
    }
  }

  close() {
    this.db.close();
  }

  clearQueryLog() {
    this.queryLog = [];
  }

  takeQueryLog() {
    const output = this.queryLog;
    this.clearQueryLog();
    return output;
  }
}

export function migrationSql() {
  const migrationsDir = path.join(rootDir(), 'worker', 'migrations');
  return fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => fs.readFileSync(path.join(migrationsDir, name), 'utf8'));
}

export function createMigratedSqliteD1Database() {
  const db = new SqliteD1Database();
  for (const sql of migrationSql()) {
    db.db.exec(sql);
  }
  return db;
}
