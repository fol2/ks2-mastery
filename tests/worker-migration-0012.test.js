import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SqliteD1Database, createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';

// Phase 4 U9 — migration 0012 creates `punctuation_events` with the
// three indexes required for the plan's R10 query patterns. The test
// covers:
//   - Fresh apply against a 0011-shaped DB → table + indexes land.
//   - Idempotent re-apply (CREATE TABLE IF NOT EXISTS + CREATE INDEX IF
//     NOT EXISTS) does not throw on repeat.
//   - Indexes route the documented read queries off full-table scans.

const MIGRATION_0012_FILENAME = '0012_punctuation_events.sql';

function rootDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function migration0012Sql() {
  return fs.readFileSync(
    path.join(rootDir(), 'worker', 'migrations', MIGRATION_0012_FILENAME),
    'utf8',
  );
}

function pre0012MigrationSql() {
  const migrationsDir = path.join(rootDir(), 'worker', 'migrations');
  return fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql') && name !== MIGRATION_0012_FILENAME)
    .sort()
    .map((name) => fs.readFileSync(path.join(migrationsDir, name), 'utf8'));
}

function createPre0012Database() {
  const db = new SqliteD1Database();
  for (const sql of pre0012MigrationSql()) {
    db.db.exec(sql);
  }
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

test('migration 0012 creates punctuation_events table with expected columns', () => {
  const db = createMigratedSqliteD1Database();
  try {
    const columns = new Set(tableColumnNames(db, 'punctuation_events'));
    assert.ok(columns.has('id'));
    assert.ok(columns.has('learner_id'));
    assert.ok(columns.has('event_kind'));
    assert.ok(columns.has('payload_json'));
    assert.ok(columns.has('occurred_at_ms'));
    assert.ok(columns.has('created_at_ms'));
  } finally {
    db.close();
  }
});

test('migration 0012 applies cleanly on a 0011-shaped database (fresh apply)', () => {
  const db = createPre0012Database();
  try {
    // Table does not exist before 0012 runs.
    const pre = db.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='punctuation_events'")
      .get();
    assert.equal(pre, undefined);

    db.db.exec(migration0012Sql());

    const post = db.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='punctuation_events'")
      .get();
    assert.ok(post);

    assert.equal(indexExists(db, 'idx_punctuation_events_learner_kind_time'), true);
    assert.equal(indexExists(db, 'idx_punctuation_events_learner_time'), true);
  } finally {
    db.close();
  }
});

test('migration 0012 is idempotent on re-apply (CREATE TABLE IF NOT EXISTS)', () => {
  const db = createPre0012Database();
  try {
    db.db.exec(migration0012Sql());
    // Second application must not throw — all statements use IF NOT EXISTS.
    db.db.exec(migration0012Sql());

    assert.ok(tableColumnNames(db, 'punctuation_events').length > 0);
    assert.equal(indexExists(db, 'idx_punctuation_events_learner_kind_time'), true);
    assert.equal(indexExists(db, 'idx_punctuation_events_learner_time'), true);
  } finally {
    db.close();
  }
});

test('migration 0012 indexes route the two documented read queries off table scans', () => {
  const db = createMigratedSqliteD1Database();
  try {
    // Seed a few rows so SQLite's planner has statistics to work with.
    const now = 1_700_000_000_000;
    const insert = db.db.prepare(`
      INSERT INTO punctuation_events (learner_id, event_kind, payload_json, occurred_at_ms, created_at_ms)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (let i = 0; i < 8; i += 1) {
      insert.run(`learner-${i % 2}`, i % 2 === 0 ? 'card-opened' : 'answer-submitted', '{}', now + i, now + i);
    }

    const kindPlan = db.db.prepare(`
      EXPLAIN QUERY PLAN
      SELECT id FROM punctuation_events
      WHERE learner_id = ? AND event_kind = ? AND occurred_at_ms > ?
      ORDER BY occurred_at_ms DESC
    `).all();
    const kindDetail = kindPlan.map((row) => row.detail).join(' | ');
    assert.match(kindDetail, /idx_punctuation_events_learner_kind_time/);

    const learnerPlan = db.db.prepare(`
      EXPLAIN QUERY PLAN
      SELECT id FROM punctuation_events
      WHERE learner_id = ? AND occurred_at_ms > ?
      ORDER BY occurred_at_ms DESC
    `).all();
    const learnerDetail = learnerPlan.map((row) => row.detail).join(' | ');
    // Either of the two indexes can serve this read; both start with
    // `learner_id` so either is acceptable.
    assert.match(learnerDetail, /idx_punctuation_events_learner/);
  } finally {
    db.close();
  }
});
