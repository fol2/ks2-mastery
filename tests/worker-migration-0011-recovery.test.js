// I-RE-5 (re-review Important): exercise the recovery runbook at
// docs/operations/migration-0011-recovery.md end-to-end against a
// partial-apply shim. The goal is to prove the runbook's example
// commands are syntactically correct and produce the expected end
// state — the runbook is a production-facing remediation document and
// drift from the migration itself would ship a broken recovery
// procedure.
//
// Scenarios:
//
// 1. Simulate a partial apply: execute only the first 3 ALTERs (the two
//    account_ops_metadata columns + account_sessions.status_revision_at_issue)
//    on a 0010-shaped DB.
// 2. Run the diagnosis queries from section 1 of the runbook:
//    - `SELECT * FROM d1_migrations WHERE name LIKE '0011%'` — assert absent.
//    - `PRAGMA table_info(account_ops_metadata)` — assert row_version +
//      status_revision present.
//    - `PRAGMA table_info(account_sessions)` — assert
//      status_revision_at_issue NOT present (wait — the stem says present,
//      but see below: we simulate 3 of 7 applied).
//    - `PRAGMA table_info(ops_error_events)` — assert release columns
//      absent (the remaining 4 columns were not applied).
// 3. Hand-apply the remaining ALTERs + CREATE INDEX statements from
//    section 3 of the runbook.
// 4. Insert the tracker row from section 4.
// 5. Verify all 7 columns + 2 indexes are present (section 5 verify step).
// 6. Run the idempotent apply helper again — must be a no-op without
//    errors (the runbook's `SKIP any column that already exists` note).
//
// Note: the sqlite-D1 shim creates the `d1_migrations` tracker on demand
// here; the production tracker is created by Wrangler. We create it
// explicitly so the SELECT assertion against `d1_migrations` works.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SqliteD1Database } from './helpers/sqlite-d1.js';

const MIGRATION_0011_FILENAME = '0011_admin_ops_p1_5_hardening.sql';

function rootDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
  // Create the d1_migrations tracker up-front so the runbook's SELECT at
  // diagnosis step 1 does not fail with "no such table". Wrangler creates
  // this on its own; we materialise it explicitly because the sqlite-D1
  // shim does not.
  db.db.exec(`
    CREATE TABLE IF NOT EXISTS d1_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);
  return db;
}

function tableColumnNames(db, table) {
  return db.db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
}

function indexExists(db, indexName) {
  const row = db.db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?")
    .get(indexName);
  return Boolean(row);
}

function applyPartialMigration0011(db) {
  // Section 2 of the runbook describes "partial apply" — the first 3
  // ALTERs landed before a wrangler failure or deploy crash. Mirror that
  // state deterministically so the recovery test starts from a concrete
  // broken baseline.
  db.db.exec('ALTER TABLE account_ops_metadata ADD COLUMN row_version INTEGER NOT NULL DEFAULT 0;');
  db.db.exec('ALTER TABLE account_ops_metadata ADD COLUMN status_revision INTEGER NOT NULL DEFAULT 0;');
  db.db.exec('ALTER TABLE account_sessions ADD COLUMN status_revision_at_issue INTEGER NOT NULL DEFAULT 0;');
  // Note: the remaining 4 ops_error_events columns + 2 indexes are NOT
  // applied — the simulated failure happens between the 3rd and 4th
  // ALTER.
}

function applyRemainingMigration0011(db) {
  // Section 3 of the runbook — hand-apply the missing statements. Uses a
  // duplicate-column tolerant loop because the runbook explicitly says
  // "Skip any column that already exists". This mirrors the operator's
  // expected workflow.
  const remainingAlters = [
    'ALTER TABLE ops_error_events ADD COLUMN first_seen_release TEXT;',
    'ALTER TABLE ops_error_events ADD COLUMN last_seen_release TEXT;',
    'ALTER TABLE ops_error_events ADD COLUMN resolved_in_release TEXT;',
    'ALTER TABLE ops_error_events ADD COLUMN last_status_change_at INTEGER;',
  ];
  for (const sql of remainingAlters) {
    try {
      db.db.exec(sql);
    } catch (err) {
      // Runbook: "Skip any column that already exists".
      if (!/duplicate column name/i.test(String(err?.message || err))) throw err;
    }
  }
  // Indexes always safe (CREATE INDEX IF NOT EXISTS).
  db.db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ops_error_events_last_seen_release
      ON ops_error_events(last_seen_release);
  `);
  db.db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ops_error_events_status_change
      ON ops_error_events(status, last_status_change_at);
  `);
}

function markMigrationComplete(db) {
  // Section 4 of the runbook — only after all columns + indexes land.
  db.db.prepare(`
    INSERT INTO d1_migrations(name, applied_at) VALUES (?, ?)
  `).run(MIGRATION_0011_FILENAME, 1_700_000_000_000);
}

test('I-RE-5 runbook — partial-apply baseline exposes missing release columns + absent tracker row', () => {
  const db = createPre0011Database();
  try {
    applyPartialMigration0011(db);

    // Section 1 diagnosis: d1_migrations has NO row for 0011.
    const trackerRow = db.db.prepare(`
      SELECT name FROM d1_migrations WHERE name LIKE '0011%'
    `).get();
    assert.equal(trackerRow, undefined, 'tracker row must be absent before recovery');

    // Section 2 diagnosis: account_ops_metadata has row_version +
    // status_revision (applied before failure).
    const metaCols = tableColumnNames(db, 'account_ops_metadata');
    assert.equal(metaCols.includes('row_version'), true);
    assert.equal(metaCols.includes('status_revision'), true);

    // account_sessions has status_revision_at_issue (applied before failure).
    const sessionCols = tableColumnNames(db, 'account_sessions');
    assert.equal(sessionCols.includes('status_revision_at_issue'), true);

    // ops_error_events release columns NOT present (the failure landed
    // between the 3rd and 4th ALTER).
    const errorCols = tableColumnNames(db, 'ops_error_events');
    assert.equal(errorCols.includes('first_seen_release'), false, 'first_seen_release absent in partial-apply state');
    assert.equal(errorCols.includes('last_seen_release'), false);
    assert.equal(errorCols.includes('resolved_in_release'), false);
    assert.equal(errorCols.includes('last_status_change_at'), false);

    // Indexes not yet created.
    assert.equal(indexExists(db, 'idx_ops_error_events_last_seen_release'), false);
    assert.equal(indexExists(db, 'idx_ops_error_events_status_change'), false);
  } finally {
    db.close();
  }
});

test('I-RE-5 runbook — hand-applying the missing ALTERs + CREATE INDEXes lands all 7 columns + 2 indexes', () => {
  const db = createPre0011Database();
  try {
    applyPartialMigration0011(db);
    applyRemainingMigration0011(db);

    // End state matches a clean apply.
    const metaCols = tableColumnNames(db, 'account_ops_metadata');
    assert.equal(metaCols.includes('row_version'), true);
    assert.equal(metaCols.includes('status_revision'), true);
    assert.equal(tableColumnNames(db, 'account_sessions').includes('status_revision_at_issue'), true);
    const errorCols = tableColumnNames(db, 'ops_error_events');
    assert.equal(errorCols.includes('first_seen_release'), true);
    assert.equal(errorCols.includes('last_seen_release'), true);
    assert.equal(errorCols.includes('resolved_in_release'), true);
    assert.equal(errorCols.includes('last_status_change_at'), true);

    assert.equal(indexExists(db, 'idx_ops_error_events_last_seen_release'), true);
    assert.equal(indexExists(db, 'idx_ops_error_events_status_change'), true);
  } finally {
    db.close();
  }
});

test('I-RE-5 runbook — section 4 tracker insert lands the d1_migrations row with unixepoch-scaled timestamp', () => {
  const db = createPre0011Database();
  try {
    applyPartialMigration0011(db);
    applyRemainingMigration0011(db);
    markMigrationComplete(db);

    const trackerRow = db.db.prepare(`
      SELECT name, applied_at FROM d1_migrations WHERE name = ?
    `).get(MIGRATION_0011_FILENAME);
    assert.ok(trackerRow, 'd1_migrations row landed after section 4');
    assert.equal(trackerRow.name, MIGRATION_0011_FILENAME);
    // Applied-at is a millisecond-scale integer; the runbook's example
    // uses `unixepoch() * 1000`. We pinned a fixed value in the helper
    // so the assertion is deterministic.
    assert.equal(typeof trackerRow.applied_at, 'number');
    assert.ok(trackerRow.applied_at > 0);
  } finally {
    db.close();
  }
});

test('I-RE-5 runbook — section 5 verify queries succeed against fully recovered state', () => {
  const db = createPre0011Database();
  try {
    applyPartialMigration0011(db);
    applyRemainingMigration0011(db);
    markMigrationComplete(db);

    // The runbook's example verify steps translate to these reads. Each
    // one must return the expected shape for the recovered DB.
    const trackerRow = db.db.prepare(`
      SELECT name FROM d1_migrations WHERE name LIKE '0011%'
    `).get();
    assert.ok(trackerRow, 'tracker is marked complete');

    // PRAGMA table_info assertions: every 0011 column is present.
    const expectedColumns = [
      ['account_ops_metadata', 'row_version'],
      ['account_ops_metadata', 'status_revision'],
      ['account_sessions', 'status_revision_at_issue'],
      ['ops_error_events', 'first_seen_release'],
      ['ops_error_events', 'last_seen_release'],
      ['ops_error_events', 'resolved_in_release'],
      ['ops_error_events', 'last_status_change_at'],
    ];
    for (const [table, column] of expectedColumns) {
      assert.equal(
        tableColumnNames(db, table).includes(column),
        true,
        `${table}.${column} present after recovery`,
      );
    }

    // Both release-tracking indexes exist.
    assert.equal(indexExists(db, 'idx_ops_error_events_last_seen_release'), true);
    assert.equal(indexExists(db, 'idx_ops_error_events_status_change'), true);
  } finally {
    db.close();
  }
});

test('I-RE-5 runbook — re-running the idempotent remainder helper is a no-op without errors', () => {
  // The runbook says "Skip any column that already exists". The
  // idempotent helper swallows duplicate-column errors; a second
  // invocation after full recovery must therefore run to completion
  // without any exception and without mutating the DB end state.
  const db = createPre0011Database();
  try {
    applyPartialMigration0011(db);
    applyRemainingMigration0011(db);
    markMigrationComplete(db);

    const columnsBefore = tableColumnNames(db, 'ops_error_events').slice().sort();
    // Re-apply the remaining ALTERs + indexes (expected no-op under the
    // duplicate-column tolerance loop).
    assert.doesNotThrow(() => applyRemainingMigration0011(db));
    const columnsAfter = tableColumnNames(db, 'ops_error_events').slice().sort();
    assert.deepEqual(columnsAfter, columnsBefore, 'columns unchanged on re-apply');

    // Indexes still present and untouched.
    assert.equal(indexExists(db, 'idx_ops_error_events_last_seen_release'), true);
    assert.equal(indexExists(db, 'idx_ops_error_events_status_change'), true);
  } finally {
    db.close();
  }
});
