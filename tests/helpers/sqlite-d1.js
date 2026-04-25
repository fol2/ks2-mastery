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
    this.recordQuery?.({
      operation: 'first',
      sql: this.sql,
      params: this.params,
      rowCount: row ? 1 : 0,
    });
    if (!row) return null;
    if (typeof columnName === 'string' && columnName) return row[columnName] ?? null;
    return { ...row };
  }

  async run() {
    const meta = this.statement.run(...this.params);
    this.recordQuery?.({
      operation: 'run',
      sql: this.sql,
      params: this.params,
      changes: meta.changes,
      rowCount: meta.changes,
    });
    return {
      success: true,
      meta: {
        changes: meta.changes,
        last_row_id: Number(meta.lastInsertRowid || 0),
        rows_read: 0,
        rows_written: Math.max(0, Number(meta.changes) || 0),
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
    });
    return {
      results: rows,
      meta: {
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
