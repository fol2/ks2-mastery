import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { SqliteD1Database } from './helpers/sqlite-d1.js';

const migrationPath = resolve(
  import.meta.dirname || '.',
  '../worker/migrations/0018_capacity_cleanup_legacy_schema.sql',
);

const migrationSql = readFileSync(migrationPath, 'utf-8');

function tableExists(db, name) {
  const row = db.db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(name);
  return Boolean(row);
}

function indexExists(db, name) {
  const row = db.db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'index' AND name = ?
  `).get(name);
  return Boolean(row);
}

test('migration 0018 drops legacy platform tables and the duplicate request limit index', () => {
  const db = new SqliteD1Database();
  try {
    for (const table of [
      'spelling_sessions',
      'child_state',
      'sessions',
      'subscriptions',
      'user_identities',
      'children',
      'users',
      'learners',
      'reward_events',
    ]) {
      db.db.exec(`CREATE TABLE ${table} (id TEXT PRIMARY KEY);`);
    }
    db.db.exec(`
      CREATE TABLE request_limits (
        limiter_key TEXT PRIMARY KEY,
        window_started_at INTEGER NOT NULL,
        request_count INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_request_limits_updated ON request_limits(updated_at);
      CREATE INDEX idx_request_limits_updated_at ON request_limits(updated_at);
      CREATE TABLE account_sessions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        session_hash TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        session_kind TEXT NOT NULL DEFAULT 'real',
        status_revision_at_issue INTEGER NOT NULL DEFAULT 0
      );
    `);

    db.db.exec(migrationSql);

    for (const table of [
      'spelling_sessions',
      'child_state',
      'sessions',
      'subscriptions',
      'user_identities',
      'children',
      'users',
      'learners',
      'reward_events',
    ]) {
      assert.equal(tableExists(db, table), false, `${table} should be removed`);
    }
    assert.equal(indexExists(db, 'idx_request_limits_updated'), true);
    assert.equal(indexExists(db, 'idx_request_limits_updated_at'), false);
  } finally {
    db.close();
  }
});

test('migration 0018 drains expired account sessions without removing live sessions', () => {
  const db = new SqliteD1Database();
  try {
    db.db.exec(`
      CREATE TABLE account_sessions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        session_hash TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        session_kind TEXT NOT NULL DEFAULT 'real',
        status_revision_at_issue INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO account_sessions (
        id, account_id, session_hash, provider, created_at, expires_at,
        session_kind, status_revision_at_issue
      )
      VALUES
        ('expired', 'adult-a', 'hash-expired', 'email', 1, 1, 'real', 0),
        ('live', 'adult-a', 'hash-live', 'email', 1, 4102444800000, 'real', 0);
    `);

    db.db.exec(migrationSql);

    const remaining = db.db
      .prepare('SELECT id FROM account_sessions ORDER BY id')
      .all()
      .map((row) => row.id);
    assert.deepEqual(remaining, ['live']);
  } finally {
    db.close();
  }
});
