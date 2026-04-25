import { BackendUnavailableError } from './errors.js';
import { readCollectorFromEnv, wrapDatabaseForTelemetry } from './capacity/telemetry.js';

function cloneRow(row) {
  if (!row || typeof row !== 'object') return row;
  return { ...row };
}

export function requireDatabase(env = {}) {
  if (!env.DB || typeof env.DB.prepare !== 'function') {
    throw new BackendUnavailableError('D1 binding DB is required for repository routes.');
  }
  // U4: when a request-local capacity collector is attached to env, wrap
  // the D1 binding so every prepare().bind().first/run/all() call feeds
  // row-metric telemetry. The wrapper preserves result shape exactly, so
  // no downstream caller needs to change. Already-wrapped bindings are
  // returned as-is to keep the wrap idempotent across nested calls
  // (requireDatabase may be invoked from auth.js, repository.js, and
  // demo/sessions.js in a single request).
  const collector = readCollectorFromEnv(env);
  if (!collector) return env.DB;
  if (env.DB.__ks2CapacityWrapped) return env.DB;
  return wrapDatabaseForTelemetry(env.DB, collector);
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
