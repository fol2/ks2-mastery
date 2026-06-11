import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFirstGlobalReleaseSeedPlan,
  parseArgs,
} from '../scripts/migrate-spelling-content-to-global-release.mjs';
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

    assert.equal(plan.release.subjectId, 'spelling');
    assert.equal(plan.release.publishedAt, 1_777_000_000_000);
    assert.equal(plan.proof.seed.source.type, 'bundled_fallback');
    assert.ok(plan.summary.wordCount > 0);
    assert.match(plan.sql, /INSERT INTO content_operation_releases/);
    assert.match(plan.sql, /WHERE NOT EXISTS/);

    DB.db.exec(plan.sql);
    DB.db.exec(plan.sql);

    const releaseRows = DB.db.prepare(`
      SELECT release_id, published_at, published_by_account_id
      FROM content_operation_releases
      WHERE subject_id = 'spelling'
    `).all();
    assert.equal(releaseRows.length, 1);
    assert.equal(releaseRows[0].release_id, 'corel-seed-script-test');
    assert.equal(releaseRows[0].published_at, 1_777_000_000_000);
    assert.equal(releaseRows[0].published_by_account_id, 'admin-a');

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
