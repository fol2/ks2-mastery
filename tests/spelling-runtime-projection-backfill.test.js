import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRuntimeProjectionBackfillSql } from '../scripts/backfill-spelling-runtime-projections.mjs';
import {
  decodeContentOperationSnapshot,
  encodeContentOperationSnapshot,
} from '../src/subjects/spelling/content/release-snapshot-codec.js';
import {
  isSpellingRuntimeReleaseProjection,
} from '../src/subjects/spelling/content/runtime-release-projection.js';
import { readSeededSpellingContentBundle } from '../worker/src/generated-spelling-content-seed.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';

test('0025 adds separate authoring, runtime, and compact-summary release columns', () => {
  const DB = createMigratedSqliteD1Database();
  try {
    const columns = DB.db.prepare('PRAGMA table_info(content_operation_releases)').all();
    const names = new Set(columns.map((column) => column.name));
    assert.equal(names.has('snapshot_json'), true);
    assert.equal(names.has('runtime_snapshot_json'), true);
    assert.equal(names.has('runtime_summary_json'), true);
  } finally {
    DB.close();
  }
});

test('runtime projection backfill compiles an existing immutable release before request time', async () => {
  const DB = createMigratedSqliteD1Database();
  try {
    const bundle = await readSeededSpellingContentBundle();
    const authoringSnapshot = await encodeContentOperationSnapshot(bundle);
    DB.db.prepare(`
      INSERT INTO content_operation_releases (
        release_id, subject_id, status, snapshot_json, snapshot_hash,
        base_release_id, package_id, published_at, published_by_account_id,
        rollback_of_release_id, proof_json, created_at
      )
      VALUES ('corel-backfill-test', 'spelling', 'published', ?, 'backfill-hash',
        NULL, NULL, 1777000000000, 'admin-a', NULL, NULL, 1777000000000)
    `).run(authoringSnapshot);

    const plan = await buildRuntimeProjectionBackfillSql([{
      release_id: 'corel-backfill-test',
      snapshot_hash: 'backfill-hash',
      snapshot_json: authoringSnapshot,
      published_at: 1_777_000_000_000,
    }]);
    DB.db.exec(plan.sql);

    const row = DB.db.prepare(`
      SELECT runtime_snapshot_json, runtime_summary_json
      FROM content_operation_releases
      WHERE release_id = 'corel-backfill-test'
    `).get();
    const projection = JSON.parse(await decodeContentOperationSnapshot(row.runtime_snapshot_json));
    const summary = JSON.parse(row.runtime_summary_json);

    assert.equal(isSpellingRuntimeReleaseProjection(projection, { releaseId: 'corel-backfill-test' }), true);
    assert.equal(summary.publishedReleaseId, 'corel-backfill-test');
    assert.equal(summary.runtimeWordCount, projection.snapshot.words.length);
    assert.ok(row.runtime_snapshot_json.length < authoringSnapshot.length);
  } finally {
    DB.close();
  }
});
