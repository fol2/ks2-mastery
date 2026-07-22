import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCutoverState,
  buildFirstGlobalReleaseSeedPlan,
  parseArgs,
  resolveFirstGlobalReleaseSeedSource,
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
import {
  buildContentOperationHeroExposureProjection,
  CONTENT_OPERATION_HERO_EXPOSURE_PROOF_KEY,
} from '../worker/src/content-operations/release-projections.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';

function splitSqlStatements(sql) {
  return String(sql || '')
    .split(/;\s*\n/)
    .map((statement) => statement.trim())
    .filter(Boolean)
    .map((statement) => `${statement};`);
}

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
    assert.deepEqual(
      plan.proof[CONTENT_OPERATION_HERO_EXPOSURE_PROOF_KEY],
      buildContentOperationHeroExposureProjection(bundledContent),
    );
    assert.equal(plan.snapshotStorage.encoding, 'gzip-base64');
    assert.ok(plan.snapshotStorage.byteLength < 2_000_000);
    assert.ok(plan.snapshotStorage.sqlChunkCount > 1);
    assert.ok(plan.summary.wordCount > 0);
    assert.deepEqual(plan.compatibilityPolicy, {
      legacyExportRoute: '/api/content/spelling',
      legacyExportMode: 'read_only_after_global_release',
      legacyWriteRoute: '/api/content/spelling',
      legacyWriteMode: 'disabled_after_global_release',
      mutationPath: 'content_operations_package_approval',
      firstReleaseInsertPolicy: 'only_when_no_published_spelling_release_exists',
    });
    assert.match(plan.sql, /INSERT INTO content_operation_releases/);
    assert.match(plan.sql, /WHERE NOT EXISTS/);
    assert.doesNotMatch(plan.sql, /BEGIN TRANSACTION|COMMIT/);
    assert.doesNotMatch(plan.sql, /CREATE TEMP TABLE|DROP TABLE/);
    assert.match(plan.sql, /UPDATE content_operation_releases\s+SET snapshot_json = snapshot_json \|\|/);
    assert.match(plan.sql, /length\(snapshot_json\) = 0/);
    assert.match(plan.sql, /SET status = 'published'/);

    DB.db.exec(plan.sql);
    DB.db.exec(plan.sql);

    const releaseRows = DB.db.prepare(`
      SELECT release_id, status, published_at, published_by_account_id, snapshot_json
      FROM content_operation_releases
      WHERE subject_id = 'spelling'
    `).all();
    assert.equal(releaseRows.length, 1);
    assert.equal(releaseRows[0].release_id, 'corel-seed-script-test');
    assert.equal(releaseRows[0].status, 'published');
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

test('content operations seed script resumes interrupted chunked snapshot appends', async () => {
  const DB = createMigratedSqliteD1Database();
  try {
    const plan = await buildFirstGlobalReleaseSeedPlan({
      now: () => 1_777_000_000_000,
      releaseId: 'corel-interrupted-seed-retry',
      eventId: 'coevt-interrupted-seed-retry',
      actorAccountId: 'admin-a',
    });
    assert.ok(plan.snapshotStorage.sqlChunkCount > 1);

    const statements = splitSqlStatements(plan.sql);
    const releaseInsert = statements.find((statement) => statement.includes('INSERT INTO content_operation_releases'));
    const appendStatements = statements.filter((statement) => statement.includes('snapshot_json = snapshot_json ||'));
    assert.ok(releaseInsert);
    assert.ok(appendStatements.length > 1);

    DB.db.exec(releaseInsert);
    DB.db.exec(appendStatements[0]);

    const interrupted = DB.db.prepare(`
      SELECT status, published_at, length(snapshot_json) AS snapshot_length
      FROM content_operation_releases
      WHERE release_id = ?
    `).get('corel-interrupted-seed-retry');
    assert.equal(interrupted.status, 'seeding');
    assert.equal(interrupted.published_at, null);
    assert.ok(interrupted.snapshot_length > 0);
    assert.ok(interrupted.snapshot_length < plan.snapshotStorage.byteLength);
    assert.equal(DB.db.prepare(`
      SELECT COUNT(*) AS release_count
      FROM content_operation_releases
      WHERE subject_id = 'spelling' AND status = 'published'
    `).get().release_count, 0);
    assert.equal(DB.db.prepare(`
      SELECT COUNT(*) AS event_count
      FROM content_operation_events
      WHERE release_id = ?
    `).get('corel-interrupted-seed-retry').event_count, 0);

    DB.db.exec(plan.sql);
    DB.db.exec(plan.sql);

    const recovered = DB.db.prepare(`
      SELECT status, length(snapshot_json) AS snapshot_length, snapshot_hash
      FROM content_operation_releases
      WHERE release_id = ?
    `).get('corel-interrupted-seed-retry');
    assert.equal(recovered.status, 'published');
    assert.equal(recovered.snapshot_length, plan.snapshotStorage.byteLength);
    assert.equal(recovered.snapshot_hash, plan.release.snapshotHash);
    assert.equal(DB.db.prepare(`
      SELECT COUNT(*) AS event_count
      FROM content_operation_events
      WHERE release_id = ?
    `).get('corel-interrupted-seed-retry').event_count, 1);
  } finally {
    DB.close();
  }
});

test('content operations seed script uses deterministic default ids for remote retries', async () => {
  const plan = await buildFirstGlobalReleaseSeedPlan({
    now: () => 1_777_000_000_000,
  });

  assert.equal(plan.release.releaseId, `corel-seed-${plan.release.snapshotHash}`);
  assert.match(plan.sql, new RegExp(`coevt-seed-${plan.release.snapshotHash}`));
});

test('content operations seed script leaves an existing published release intact', async () => {
  const DB = createMigratedSqliteD1Database();
  try {
    const existingPlan = await buildFirstGlobalReleaseSeedPlan({
      now: () => 1_777_000_000_100,
      releaseId: 'corel-existing-global-release',
      eventId: 'coevt-existing-global-release',
      actorAccountId: 'admin-a',
    });
    const replayPlan = await buildFirstGlobalReleaseSeedPlan({
      now: () => 1_777_000_000_200,
      releaseId: 'corel-replay-should-noop',
      eventId: 'coevt-replay-should-noop',
      actorAccountId: 'admin-b',
    });

    DB.db.exec(existingPlan.sql);
    DB.db.exec(replayPlan.sql);

    const releaseRows = DB.db.prepare(`
      SELECT release_id, published_at, published_by_account_id
      FROM content_operation_releases
      WHERE subject_id = 'spelling'
      ORDER BY published_at ASC
    `).all();
    assert.equal(releaseRows.length, 1);
    assert.equal(releaseRows[0].release_id, 'corel-existing-global-release');
    assert.equal(releaseRows[0].published_at, 1_777_000_000_100);
    assert.equal(releaseRows[0].published_by_account_id, 'admin-a');

    const eventRows = DB.db.prepare(`
      SELECT event_id, release_id, actor_account_id
      FROM content_operation_events
      WHERE subject_id = 'spelling'
      ORDER BY created_at ASC
    `).all();
    assert.equal(eventRows.length, 1);
    assert.equal(eventRows[0].event_id, 'coevt-existing-global-release');
    assert.equal(eventRows[0].release_id, 'corel-existing-global-release');
    assert.equal(eventRows[0].actor_account_id, 'admin-a');
  } finally {
    DB.close();
  }
});

test('content operations seed script reports cutover no-op state for an existing release', () => {
  const cutover = buildCutoverState({
    publishedRelease: {
      releaseId: 'corel-existing-global-release',
      subjectId: 'spelling',
      status: 'published',
      snapshotHash: 'release-hash-existing',
      publishedAt: 1_777_000_000_100,
      publishedByAccountId: 'admin-a',
      createdAt: 1_777_000_000_100,
    },
    plannedRelease: {
      releaseId: 'corel-replay-should-noop',
      snapshotHash: 'release-hash-replay',
    },
  });

  assert.equal(cutover.publishedReleasePresent, true);
  assert.equal(cutover.effectiveReleaseId, 'corel-existing-global-release');
  assert.equal(cutover.effectiveSnapshotHash, 'release-hash-existing');
  assert.equal(cutover.seedSqlWillInsert, false);
  assert.equal(cutover.seedSqlWillNoop, true);
  assert.equal(cutover.legacyExportMode, 'read_only_after_global_release');
  assert.equal(cutover.legacyWriteMode, 'disabled_after_global_release');
  assert.equal(cutover.mutationPath, 'content_operations_package_approval');
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

test('content operations seed script falls back to bundled seed when legacy content is invalid', async () => {
  const bundledContent = await readSeededSpellingContentBundle();
  const invalidLegacyContent = structuredClone(bundledContent);
  invalidLegacyContent.draft.words[0].spellingPool = 'missing-cutover-pool';

  const resolved = await resolveFirstGlobalReleaseSeedSource({
    fallbackBundle: bundledContent,
    legacySource: {
      bundle: invalidLegacyContent,
      source: {
        type: 'account_subject_content',
        accountId: 'adult-a',
        updatedAt: 1_777_000_000_111,
        updatedByAccountId: 'admin-a',
        script: 'test',
      },
    },
  });

  assert.equal(resolved.source.type, 'bundled_fallback');
  assert.equal(resolved.source.fallbackReason, 'legacy_content_invalid');
  assert.equal(resolved.source.rejectedLegacySource.accountId, 'adult-a');
  assert.ok(resolved.source.rejectedLegacyValidation.errorCount > 0);
  assert.ok(resolved.source.rejectedLegacyValidation.errors.length <= 12);

  const plan = await buildFirstGlobalReleaseSeedPlan({
    now: () => 1_777_000_000_123,
    releaseId: 'corel-invalid-legacy-fallback-test',
    eventId: 'coevt-invalid-legacy-fallback-test',
    actorAccountId: 'admin-a',
    sourceBundle: resolved.bundle,
    source: resolved.source,
  });
  assert.equal(plan.proof.seed.source.type, 'bundled_fallback');
  assert.equal(plan.proof.seed.source.fallbackReason, 'legacy_content_invalid');
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
