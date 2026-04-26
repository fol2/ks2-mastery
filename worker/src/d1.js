import { BackendUnavailableError } from './errors.js';

function cloneRow(row) {
  if (!row || typeof row !== 'object') return row;
  return { ...row };
}

export function requireDatabase(env = {}) {
  if (!env.DB || typeof env.DB.prepare !== 'function') {
    throw new BackendUnavailableError('D1 binding DB is required for repository routes.');
  }
  return env.DB;
}

/**
 * Acquire the D1 handle and — when a capacity collector is supplied —
 * wrap it so every `prepare()` statement records row counts and duration
 * on the collector. When `capacity` is absent, returns the raw handle
 * untouched (zero overhead for fixture paths that do not emit
 * `capacity.request`). U3 round 1 (P1 #03): threading this helper
 * through `accountSessionFromToken`, demo rate-limit protection, and the
 * demo bootstrap guard closes the proxy bypass where session-lookup and
 * 5-per-command rate-limit queries were not counted by the collector.
 *
 * @param {object} env
 * @param {object|null} capacity
 * @returns {object}
 */
export function requireDatabaseWithCapacity(env = {}, capacity = null) {
  const db = requireDatabase(env);
  if (!capacity) return db;
  return withCapacityCollector(db, capacity);
}

function nowMs() {
  return typeof performance?.now === 'function' ? performance.now() : Date.now();
}

/**
 * Extract a short, bounded statement name from raw SQL for capacity
 * telemetry. Never returns the full SQL verbatim — we do not want
 * multi-kilobyte log lines, and even though parameters are bound (not
 * interpolated), defence-in-depth keeps the statement name bounded.
 *
 * @param {string} sql
 * @returns {string}
 */
function statementNameFromSql(sql) {
  const trimmed = String(sql || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'unknown';
  const firstLine = trimmed.split('\n')[0];
  const capped = firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
  return capped;
}

function recordStatementResult(collector, sql, operation, startedAt, meta = null) {
  if (!collector || typeof collector.recordStatement !== 'function') return;
  const rowsRead = meta && Object.prototype.hasOwnProperty.call(meta, 'rows_read')
    ? Number(meta.rows_read)
    : null;
  const rowsWritten = meta && Object.prototype.hasOwnProperty.call(meta, 'rows_written')
    ? Number(meta.rows_written)
    : null;
  const duration = meta && Object.prototype.hasOwnProperty.call(meta, 'duration')
    ? Number(meta.duration)
    : Math.max(0, nowMs() - startedAt);
  collector.recordStatement({
    name: `${operation}:${statementNameFromSql(sql)}`,
    rowsRead: Number.isFinite(rowsRead) ? rowsRead : null,
    rowsWritten: Number.isFinite(rowsWritten) ? rowsWritten : null,
    durationMs: Number.isFinite(duration) ? duration : null,
  });
}

class CollectingStatement {
  constructor(statement, { sql, collector }) {
    this.statement = statement;
    this.sql = sql;
    this.collector = collector;
    this.boundParams = [];
  }

  bind(...params) {
    this.boundParams = params;
    this.statement = this.statement.bind(...params);
    return this;
  }

  async first(columnName) {
    const startedAt = nowMs();
    const row = await this.statement.first(columnName);
    // D1 .first() does not expose meta; synthesise rows_read from shape.
    const rowsRead = row == null ? 0 : 1;
    recordStatementResult(this.collector, this.sql, 'first', startedAt, { rows_read: rowsRead });
    return row;
  }

  async run() {
    const startedAt = nowMs();
    const result = await this.statement.run();
    recordStatementResult(this.collector, this.sql, 'run', startedAt, result?.meta || null);
    return result;
  }

  async all() {
    const startedAt = nowMs();
    const result = await this.statement.all();
    recordStatementResult(this.collector, this.sql, 'all', startedAt, result?.meta || null);
    return result;
  }

  async raw(...args) {
    const startedAt = nowMs();
    const fn = this.statement.raw;
    const result = typeof fn === 'function' ? await fn.apply(this.statement, args) : null;
    recordStatementResult(this.collector, this.sql, 'raw', startedAt, null);
    return result;
  }
}

/**
 * Wrap a D1 database handle so every `prepare()` invocation returns a
 * statement proxy that records row counts + duration on the supplied
 * capacity collector. When the collector is absent, returns the raw
 * handle untouched (zero overhead for tests and fixture paths).
 *
 * The wrapped handle preserves `exec`, `batch`, and all other members
 * via prototype delegation; only `prepare()` is intercepted.
 *
 * @param {object} db
 * @param {object|null} collector
 * @returns {object}
 */
export function withCapacityCollector(db, collector) {
  if (!db || !collector || typeof collector.recordStatement !== 'function') return db;

  return new Proxy(db, {
    get(target, property, receiver) {
      if (property === 'prepare') {
        return (sql) => new CollectingStatement(target.prepare(sql), { sql, collector });
      }
      if (property === 'batch') {
        const original = target.batch;
        if (typeof original !== 'function') return original;
        return async (statements) => {
          const filtered = Array.isArray(statements) ? statements.filter(Boolean) : [];
          const innerStatements = filtered.map((statement) => (
            statement instanceof CollectingStatement ? statement.statement : statement
          ));
          const startedAt = nowMs();
          const results = await original.call(target, innerStatements);
          const perStatementDuration = results.length > 0
            ? Math.max(0, (nowMs() - startedAt) / results.length)
            : 0;
          for (let i = 0; i < results.length; i += 1) {
            const entry = results[i];
            const sql = filtered[i] instanceof CollectingStatement ? filtered[i].sql : 'batch';
            recordStatementResult(collector, sql, 'batch', nowMs() - perStatementDuration, entry?.meta || null);
          }
          return results;
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

export function bindStatement(db, sql, params = []) {
  return db.prepare(sql).bind(...params);
}

export async function run(db, sql, params = []) {
  return bindStatement(db, sql, params).run();
}

export async function first(db, sql, params = []) {
  const result = await bindStatement(db, sql, params).first();
  return cloneRow(result);
}

export async function all(db, sql, params = []) {
  const result = await bindStatement(db, sql, params).all();
  const rows = Array.isArray(result?.results) ? result.results : [];
  return rows.map(cloneRow);
}

export async function scalar(db, sql, params = [], columnName = null) {
  const row = await first(db, sql, params);
  if (!row) return null;
  if (columnName && Object.prototype.hasOwnProperty.call(row, columnName)) return row[columnName];
  const firstKey = Object.keys(row)[0];
  return firstKey ? row[firstKey] : null;
}

export async function batch(db, statements = []) {
  const filtered = statements.filter(Boolean);
  if (!filtered.length) return [];
  if (typeof db.batch === 'function') return db.batch(filtered);
  return Promise.all(filtered.map((statement) => statement.run()));
}

export function sqlPlaceholders(count) {
  return Array.from({ length: Math.max(0, count) }, () => '?').join(', ');
}

export async function exec(db, sql) {
  if (typeof db.exec !== 'function') {
    throw new BackendUnavailableError('Database exec support is required for transactional mutation handling.');
  }
  return db.exec(sql);
}

export async function withTransaction(db, handler) {
  if (typeof handler !== 'function') throw new TypeError('withTransaction requires a handler function.');
  if (db?.supportsSqlTransactions !== true || typeof db.exec !== 'function') {
    return handler();
  }

  const savepoint = `ks2_tx_${Math.random().toString(36).slice(2, 10)}`;
  await db.exec(`SAVEPOINT ${savepoint};`);
  try {
    const result = await handler();
    await db.exec(`RELEASE SAVEPOINT ${savepoint};`);
    return result;
  } catch (error) {
    try {
      await db.exec(`ROLLBACK TO SAVEPOINT ${savepoint};`);
      await db.exec(`RELEASE SAVEPOINT ${savepoint};`);
    } catch {
      // ignore rollback failures during error unwind
    }
    throw error;
  }
}
