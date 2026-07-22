import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SqliteD1Database } from './helpers/sqlite-d1.js';

const MIGRATION_FILENAME = '0024_post_mega_seed_preimages.sql';
const VERIFICATION_FILENAME = '0024_verify_post_mega_preimages.sql';

function rootDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function migrationSql(filename) {
  return fs.readFileSync(path.join(rootDir(), 'worker', 'migrations', filename), 'utf8');
}

function recoverySql(filename) {
  return fs.readFileSync(path.join(rootDir(), 'worker', 'recovery', filename), 'utf8');
}

function createPreMigrationDatabase() {
  const db = new SqliteD1Database();
  const migrationsDir = path.join(rootDir(), 'worker', 'migrations');
  for (const filename of fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql') && name < MIGRATION_FILENAME)
    .sort()) {
    db.db.exec(migrationSql(filename));
  }
  return db;
}

test('migration 0024 creates row-addressed Post-Mega preimages and is idempotent', () => {
  const db = createPreMigrationDatabase();
  try {
    const sql = migrationSql(MIGRATION_FILENAME);
    db.db.exec(sql);
    db.db.exec(sql);

    const tables = db.db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name LIKE 'spelling_seed_preimage%'
      ORDER BY name
    `).all().map((row) => row.name);
    assert.deepEqual(tables, [
      'spelling_seed_preimage_achievements',
      'spelling_seed_preimage_items',
      'spelling_seed_preimages',
    ]);

    const itemPrimaryKey = db.db.prepare('PRAGMA table_info(spelling_seed_preimage_items)')
      .all()
      .filter((row) => row.pk > 0)
      .sort((left, right) => left.pk - right.pk)
      .map((row) => row.name);
    assert.deepEqual(itemPrimaryKey, ['preimage_id', 'slug']);

    const achievementPrimaryKey = db.db.prepare(
      'PRAGMA table_info(spelling_seed_preimage_achievements)',
    )
      .all()
      .filter((row) => row.pk > 0)
      .sort((left, right) => left.pk - right.pk)
      .map((row) => row.name);
    assert.deepEqual(achievementPrimaryKey, ['preimage_id', 'achievement_id']);

    const index = db.db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'index' AND name = 'idx_spelling_seed_preimages_learner_created'
    `).get();
    assert.equal(index?.name, 'idx_spelling_seed_preimages_learner_created');

    const uniqueIndexes = db.db.prepare(`
      SELECT indexes.name AS index_name,
             group_concat(columns.name, ',') AS columns
      FROM pragma_index_list('spelling_seed_preimages') AS indexes
      JOIN pragma_index_info(indexes.name) AS columns
      WHERE indexes.[unique] = 1
      GROUP BY indexes.name
    `).all();
    assert.ok(uniqueIndexes.some((entry) => (
      entry.columns === 'actor_account_id,seed_request_id'
    )), 'actor/request idempotency key is physically unique');

    const archiveForeignKey = db.db.prepare(`
      SELECT [table], [from], [to], on_delete
      FROM pragma_foreign_key_list('spelling_seed_preimage_items')
    `).get();
    assert.equal(archiveForeignKey?.table, 'spelling_seed_preimages');
    assert.equal(archiveForeignKey?.from, 'preimage_id');
    assert.equal(archiveForeignKey?.to, 'preimage_id');
    assert.equal(archiveForeignKey?.on_delete, 'CASCADE');

    const achievementArchiveForeignKey = db.db.prepare(`
      SELECT [table], [from], [to], on_delete
      FROM pragma_foreign_key_list('spelling_seed_preimage_achievements')
    `).get();
    assert.equal(achievementArchiveForeignKey?.table, 'spelling_seed_preimages');
    assert.equal(achievementArchiveForeignKey?.from, 'preimage_id');
    assert.equal(achievementArchiveForeignKey?.to, 'preimage_id');
    assert.equal(achievementArchiveForeignKey?.on_delete, 'CASCADE');

    const verification = db.db.prepare(recoverySql(VERIFICATION_FILENAME))
      .all()
      .map((row) => ({ ...row }));
    assert.deepEqual(verification, [
      { check_name: 'achievement archive foreign key', expected: 1, actual: 1, ok: 1 },
      { check_name: 'achievement columns', expected: 5, actual: 5, ok: 1 },
      { check_name: 'achievement count integrity', expected: 0, actual: 0, ok: 1 },
      { check_name: 'achievement primary key', expected: 'preimage_id,achievement_id', actual: 'preimage_id,achievement_id', ok: 1 },
      { check_name: 'achievement table', expected: 1, actual: 1, ok: 1 },
      { check_name: 'item archive foreign key', expected: 1, actual: 1, ok: 1 },
      { check_name: 'item columns', expected: 7, actual: 7, ok: 1 },
      { check_name: 'item count integrity', expected: 0, actual: 0, ok: 1 },
      { check_name: 'item primary key', expected: 'preimage_id,slug', actual: 'preimage_id,slug', ok: 1 },
      { check_name: 'item table', expected: 1, actual: 1, ok: 1 },
      { check_name: 'lookup index', expected: 1, actual: 1, ok: 1 },
      { check_name: 'metadata columns', expected: 14, actual: 14, ok: 1 },
      { check_name: 'metadata idempotency key', expected: 1, actual: 1, ok: 1 },
      { check_name: 'metadata table', expected: 1, actual: 1, ok: 1 },
      { check_name: 'orphan archive achievements', expected: 0, actual: 0, ok: 1 },
      { check_name: 'orphan archive items', expected: 0, actual: 0, ok: 1 },
    ]);

    db.db.prepare(`
      INSERT INTO spelling_seed_preimages (
        preimage_id, learner_id, actor_account_id, seed_request_id,
        ui_json, data_json, stats_json, source_updated_at,
        source_updated_by_account_id, item_count, created_at
      ) VALUES ('preimage-a', 'learner-a', 'adult-a', 'request-a',
        'null', '{}', '{}', 10, 'adult-a', 0, 20)
    `).run();
    db.db.prepare(`
      INSERT INTO spelling_seed_preimage_items (
        preimage_id, slug, progress_json, guardian_json, pattern_json,
        source_updated_at, source_updated_by_account_id
      ) VALUES ('preimage-a', 'word-a', '{"stage":2}', NULL, NULL, 10, 'adult-a')
    `).run();
    const inconsistent = db.db.prepare(recoverySql(VERIFICATION_FILENAME)).all();
    const itemCountCheck = inconsistent.find((row) => row.check_name === 'item count integrity');
    assert.equal(itemCountCheck?.actual, 1);
    assert.equal(itemCountCheck?.ok, 0, 'release gate catches an incomplete archive');

    db.db.prepare(`
      UPDATE spelling_seed_preimages SET item_count = 1 WHERE preimage_id = 'preimage-a'
    `).run();
    const repaired = db.db.prepare(recoverySql(VERIFICATION_FILENAME)).all();
    assert.ok(repaired.every((row) => row.ok === 1), JSON.stringify(repaired));

    db.db.prepare(`
      INSERT INTO spelling_seed_preimage_achievements (
        preimage_id, achievement_id, record_json,
        source_updated_at, source_updated_by_account_id
      ) VALUES ('preimage-a', 'achievement-a', '{"unlockedAt":10}', 10, 'adult-a')
    `).run();
    const achievementInconsistent = db.db.prepare(recoverySql(VERIFICATION_FILENAME)).all();
    const achievementCountCheck = achievementInconsistent.find(
      (row) => row.check_name === 'achievement count integrity',
    );
    assert.equal(achievementCountCheck?.actual, 1);
    assert.equal(achievementCountCheck?.ok, 0, 'release gate catches incomplete achievement archive metadata');

    db.db.prepare(`
      UPDATE spelling_seed_preimages
      SET achievement_count = 1
      WHERE preimage_id = 'preimage-a'
    `).run();
    const achievementRepaired = db.db.prepare(recoverySql(VERIFICATION_FILENAME)).all();
    assert.ok(achievementRepaired.every((row) => row.ok === 1), JSON.stringify(achievementRepaired));
  } finally {
    db.close();
  }
});
