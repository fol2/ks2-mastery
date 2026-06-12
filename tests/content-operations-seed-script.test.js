import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFirstGlobalReleaseSeedPlan,
  parseArgs,
} from '../scripts/migrate-spelling-content-to-global-release.mjs';
import {
  decodeContentOperationSnapshot,
  isEncodedContentOperationSnapshot,
} from '../src/subjects/spelling/content/release-snapshot-codec.js';
import {
  SPELLING_CONTENT_MODEL_VERSION,
} from '../src/subjects/spelling/content/model.js';
import {
  readSeededSpellingContentBundle,
} from '../worker/src/generated-spelling-content-seed.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';

test('content operations seed script builds idempotent first-release SQL', async () => {
  const DB = createMigratedSqliteD1Database();
  try {
    const plan = await buildFirstGlobalReleaseSeedPlan({
      now: () => 1_777_000_000_000,
      releaseId: 'corel-seed-script-test',
      eventId: 'coevt-seed-script-test',
      actorAccountId: 'admin-a',
    });
    const bundledContent = await readSeededSpellingContentBundle();

    assert.equal(plan.release.subjectId, 'spelling');
    assert.equal(plan.release.publishedAt, 1_777_000_000_000);
    assert.equal(plan.proof.seed.source.type, 'bundled_fallback');
    assert.equal(plan.snapshotStorage.encoding, 'gzip-base64');
    assert.ok(plan.snapshotStorage.byteLength < 2_000_000);
    assert.ok(plan.snapshotStorage.sqlChunkCount > 1);
    assert.ok(plan.summary.wordCount > 0);
    assert.match(plan.sql, /INSERT INTO content_operation_releases/);
    assert.match(plan.sql, /WHERE NOT EXISTS/);
    assert.match(plan.sql, /_content_operation_seed_snapshot_chunks/);

    DB.db.exec(plan.sql);
    DB.db.exec(plan.sql);

    const releaseRows = DB.db.prepare(`
      SELECT release_id, published_at, published_by_account_id, snapshot_json
      FROM content_operation_releases
      WHERE subject_id = 'spelling'
    `).all();
    assert.equal(releaseRows.length, 1);
    assert.equal(releaseRows[0].release_id, 'corel-seed-script-test');
    assert.equal(releaseRows[0].published_at, 1_777_000_000_000);
    assert.equal(releaseRows[0].published_by_account_id, 'admin-a');
    assert.equal(isEncodedContentOperationSnapshot(releaseRows[0].snapshot_json), true);
    const decoded = JSON.parse(await decodeContentOperationSnapshot(releaseRows[0].snapshot_json));
    assert.equal(decoded.modelVersion, SPELLING_CONTENT_MODEL_VERSION);
    assert.ok(decoded.modelVersion >= bundledContent.modelVersion);

    const eventRows = DB.db.prepare(`
      SELECT event_id, event_type, actor_account_id
      FROM content_operation_events
      WHERE release_id = ?
    `).all('corel-seed-script-test');
    assert.equal(eventRows.length, 1);
    assert.equal(eventRows[0].event_id, 'coevt-seed-script-test');
    assert.equal(eventRows[0].event_type, 'release.seeded');
    assert.equal(eventRows[0].actor_account_id, 'admin-a');
  } finally {
    DB.close();
  }
});

test('content operations seed script can seed from supplied legacy content source', async () => {
  const DB = createMigratedSqliteD1Database();
  try {
    const legacyContent = await readSeededSpellingContentBundle();
    legacyContent.draft.notes = 'Legacy D1 content should win during cutover.';
    const plan = await buildFirstGlobalReleaseSeedPlan({
      now: () => 1_777_000_000_123,
      releaseId: 'corel-legacy-seed-script-test',
      eventId: 'coevt-legacy-seed-script-test',
      actorAccountId: 'admin-a',
      sourceBundle: legacyContent,
      source: {
        type: 'account_subject_content',
        accountId: 'adult-a',
        updatedAt: 1_777_000_000_111,
        updatedByAccountId: 'admin-a',
        script: 'test',
      },
    });

    assert.equal(plan.proof.seed.source.type, 'account_subject_content');
    assert.equal(plan.proof.seed.source.accountId, 'adult-a');

    DB.db.exec(plan.sql);
    const row = DB.db.prepare(`
      SELECT snapshot_json, proof_json
      FROM content_operation_releases
      WHERE release_id = ?
    `).get('corel-legacy-seed-script-test');
    const decoded = JSON.parse(await decodeContentOperationSnapshot(row.snapshot_json));
    const proof = JSON.parse(row.proof_json);
    assert.equal(decoded.draft.notes, 'Legacy D1 content should win during cutover.');
    assert.equal(proof.seed.source.type, 'account_subject_content');
  } finally {
    DB.close();
  }
});

test('content operations seed script defaults apply target to local D1', () => {
  assert.deepEqual(parseArgs(['--apply', '--actor', 'admin-a']), {
    apply: true,
    dryRun: false,
    remote: false,
    local: true,
    yes: false,
    actorAccountId: 'admin-a',
    outFile: null,
  });
});
