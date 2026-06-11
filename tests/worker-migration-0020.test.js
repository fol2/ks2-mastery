import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { SqliteD1Database } from './helpers/sqlite-d1.js';

const migrationPath = resolve(
  import.meta.dirname || '.',
  '../worker/migrations/0020_content_operations_centre.sql',
);

const migrationSql = readFileSync(migrationPath, 'utf-8');

function tableNames(db) {
  return db.db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name LIKE 'content_operation_%'
    ORDER BY name
  `).all().map((row) => row.name);
}

function indexNames(db) {
  return db.db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'index' AND name LIKE 'idx_content_operation_%'
    ORDER BY name
  `).all().map((row) => row.name);
}

test('migration 0020 creates the Content Operations Centre tables and indexes', () => {
  const db = new SqliteD1Database();
  try {
    db.db.exec(migrationSql);
    db.db.exec(migrationSql);

    assert.deepEqual(tableNames(db), [
      'content_operation_account_overrides',
      'content_operation_asset_uploads',
      'content_operation_audio_jobs',
      'content_operation_events',
      'content_operation_package_approvals',
      'content_operation_package_candidates',
      'content_operation_package_operations',
      'content_operation_packages',
      'content_operation_releases',
    ]);

    assert.deepEqual(indexNames(db), [
      'idx_content_operation_account_overrides_active',
      'idx_content_operation_asset_uploads_monster',
      'idx_content_operation_asset_uploads_package',
      'idx_content_operation_audio_jobs_content_key',
      'idx_content_operation_audio_jobs_package_status',
      'idx_content_operation_events_package',
      'idx_content_operation_events_release',
      'idx_content_operation_events_subject',
      'idx_content_operation_package_approvals_package',
      'idx_content_operation_package_candidates_package',
      'idx_content_operation_package_operations_entity',
      'idx_content_operation_package_operations_order',
      'idx_content_operation_packages_base_release',
      'idx_content_operation_packages_subject_state',
      'idx_content_operation_releases_package',
      'idx_content_operation_releases_subject_status',
    ]);
  } finally {
    db.close();
  }
});
