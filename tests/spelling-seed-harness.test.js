// P2 U3 tests — QA seed harness for post-Mega fixtures.
//
// Plan: docs/plans/2026-04-26-006-feat-post-mega-spelling-p2-visibility-pattern-foundation-plan.md §U3
//
// Coverage:
//   - Happy path (fresh-graduate): every core slug at stage 4, empty guardian,
//     no persisted postMega. The selector's pre-v3 backfill should still
//     make the dashboard available on read.
//   - Happy path (guardian-first-patrol): 8 guardian entries with
//     nextDueDay === today + 3, progress stage 4 for every core slug.
//   - Happy path (content-added-after-graduation):
//     `postMega.unlockedContentReleaseId === 'spelling-p1.5-legacy'`,
//     `newCoreWordsSinceGraduation > 0`, `postMegaDashboardAvailable === true`.
//   - Edge case: Worker path auto-creates the learner if missing.
//   - Error path: non-admin role → 403 with `post_mega_seed_forbidden`.
//   - Error path: invalid shape → 400 `unknown_shape`.
//   - Integration: CLI `buildSeedSql` emits well-formed SQL that contains
//     the expected data blob and that subsequent dry-run output is
//     readable by a downstream wrangler pipeline.
//   - Integration (child-UI-safe): the AdminHubSurface rendered under
//     `platformRole: 'parent'` via the `canViewAdminHub` gate denies entry
//     BEFORE the seed harness panel can render (the parent hub never
//     renders AdminHubSurface at all, so the panel is structurally
//     unreachable for child / parent roles — pinning that here).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { SEEDED_SPELLING_CONTENT_BUNDLE } from '../src/subjects/spelling/data/content-data.js';
import { resolveRuntimeSnapshot } from '../src/subjects/spelling/content/model.js';
import { isStatutoryCoreWord } from '../src/subjects/spelling/content/taxonomy.js';
import { getSpellingPostMasteryState } from '../src/subjects/spelling/read-model.js';
import {
  POST_MEGA_SEED_SHAPES,
  POST_MEGA_LEGACY_PLACEHOLDER_RELEASE_ID,
  resolvePostMegaSeedShape,
} from '../shared/spelling/post-mastery-seed-shapes.js';
import {
  applyPostMegaSeedShape,
  seedFullCoreMega,
} from './helpers/post-mastery-seeds.js';
import { buildSeedSql } from '../scripts/seed-post-mega.mjs';
import { renderHubSurfaceFixture } from './helpers/react-render.js';
import { SqliteD1Database } from './helpers/sqlite-d1.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const TODAY_MS = Date.UTC(2026, 0, 10);
const TODAY_DAY = Math.floor(TODAY_MS / DAY_MS);
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function createDatabaseThrough(lastMigrationFilename) {
  const database = new SqliteD1Database();
  const migrationsDir = path.join(ROOT_DIR, 'worker', 'migrations');
  for (const filename of fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql') && name <= lastMigrationFilename)
    .sort()) {
    database.db.exec(fs.readFileSync(path.join(migrationsDir, filename), 'utf8'));
  }
  return database;
}

function seedAdultAccount(server, { id, email, platformRole = 'admin', now = 1 }) {
  server.DB.db.prepare(`
    INSERT INTO adult_accounts (
      id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, repo_revision, account_type, demo_expires_at
    )
    VALUES (?, ?, ?, ?, NULL, ?, ?, 0, 'real', NULL)
  `).run(id, email, 'Admin', platformRole, now, now);
}

async function seedViaApi(server, as, body, { role = 'admin' } = {}) {
  return server.fetchAs(as, 'https://repo.test/api/admin/spelling/seed-post-mega', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-platform-role': role,
    },
    body: JSON.stringify(body),
  });
}

async function restoreViaApi(server, as, body, { role = 'admin' } = {}) {
  return server.fetchAs(as, 'https://repo.test/api/admin/spelling/restore-post-mega', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-platform-role': role,
    },
    body: JSON.stringify(body),
  });
}

function readChildSubjectState(server, learnerId) {
  const row = server.DB.db.prepare(`
    SELECT data_json FROM child_subject_state
    WHERE learner_id = ? AND subject_id = 'spelling'
  `).get(learnerId);
  if (!row) return null;
  try { return JSON.parse(row.data_json); } catch { return null; }
}

function readAuthoritativeSpellingState(server, learnerId) {
  const learnerState = server.DB.db.prepare(`
    SELECT data_json FROM spelling_learner_state WHERE learner_id = ?
  `).get(learnerId);
  if (!learnerState) return readChildSubjectState(server, learnerId);
  const data = JSON.parse(learnerState.data_json);
  data.progress = {};
  data.guardian = {};
  const wobbling = {};
  const rows = server.DB.db.prepare(`
    SELECT slug, progress_json, guardian_json, pattern_json
    FROM spelling_item_state
    WHERE learner_id = ?
    ORDER BY slug
  `).all(learnerId);
  for (const row of rows) {
    if (row.progress_json) data.progress[row.slug] = JSON.parse(row.progress_json);
    if (row.guardian_json) data.guardian[row.slug] = JSON.parse(row.guardian_json);
    if (row.pattern_json) wobbling[row.slug] = JSON.parse(row.pattern_json);
  }
  if (Object.keys(wobbling).length) data.pattern = { wobbling };
  return data;
}

function readExactAuthoritativeSpellingState(server, learnerId) {
  const learner = server.DB.db.prepare(`
    SELECT ui_json, data_json, stats_json, updated_at, updated_by_account_id
    FROM spelling_learner_state
    WHERE learner_id = ?
  `).get(learnerId);
  if (!learner) return null;
  const items = server.DB.db.prepare(`
    SELECT slug, progress_json, guardian_json, pattern_json,
           updated_at, updated_by_account_id
    FROM spelling_item_state
    WHERE learner_id = ?
    ORDER BY slug
  `).all(learnerId);
  const achievements = server.DB.db.prepare(`
    SELECT achievement_id, record_json, updated_at, updated_by_account_id
    FROM spelling_achievement_state
    WHERE learner_id = ?
    ORDER BY achievement_id
  `).all(learnerId);
  const parseNullable = (value) => (value == null ? null : JSON.parse(value));
  return {
    ui: JSON.parse(learner.ui_json),
    data: JSON.parse(learner.data_json),
    stats: JSON.parse(learner.stats_json),
    updatedAt: learner.updated_at,
    updatedByAccountId: learner.updated_by_account_id,
    items: items.map((item) => ({
      slug: item.slug,
      progress: parseNullable(item.progress_json),
      guardian: parseNullable(item.guardian_json),
      pattern: parseNullable(item.pattern_json),
      updatedAt: item.updated_at,
      updatedByAccountId: item.updated_by_account_id,
    })),
    achievements: achievements.map((achievement) => ({
      achievementId: achievement.achievement_id,
      recordJson: achievement.record_json,
      record: JSON.parse(achievement.record_json),
      updatedAt: achievement.updated_at,
      updatedByAccountId: achievement.updated_by_account_id,
    })),
  };
}

function learnerRow(server, learnerId) {
  return server.DB.db.prepare(`
    SELECT id, name, year_group FROM learner_profiles WHERE id = ?
  `).get(learnerId) || null;
}

// -----------------------------------------------------------------------------
// Shape-pure tests — the 8 shapes can be validated without booting the Worker.
// -----------------------------------------------------------------------------

test('POST_MEGA_SEED_SHAPES lists exactly the 8 plan shapes in order', () => {
  assert.deepEqual([...POST_MEGA_SEED_SHAPES], [
    'fresh-graduate',
    'guardian-first-patrol',
    'guardian-wobbling',
    'guardian-rested',
    'guardian-optional-patrol',
    'boss-ready',
    'boss-mixed-summary',
    'content-added-after-graduation',
  ]);
});

test('fresh-graduate: every core slug stage 4, empty guardian, no postMega persisted', () => {
  const runtimeSnapshot = resolveRuntimeSnapshot(SEEDED_SPELLING_CONTENT_BUNDLE, {
    referenceBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
  });
  const wordBySlug = Object.fromEntries((runtimeSnapshot?.words || []).map((w) => [w.slug, w]));
  const data = resolvePostMegaSeedShape('fresh-graduate', wordBySlug, TODAY_DAY);
  assert.ok(data.progress && typeof data.progress === 'object');
  assert.deepEqual(data.guardian, {});
  assert.equal(Object.prototype.hasOwnProperty.call(data, 'postMega'), false,
    'fresh-graduate simulates the moment before the first sticky write');
  const coreSlugs = Object.keys(wordBySlug).filter((slug) => isStatutoryCoreWord(wordBySlug[slug]));
  for (const slug of coreSlugs) {
    assert.equal(data.progress[slug].stage, 4, `${slug} should be at Mega`);
  }
});

test('guardian-first-patrol: 8 guardian entries with nextDueDay === today + 3', () => {
  const runtimeSnapshot = resolveRuntimeSnapshot(SEEDED_SPELLING_CONTENT_BUNDLE, {
    referenceBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
  });
  const wordBySlug = Object.fromEntries((runtimeSnapshot?.words || []).map((w) => [w.slug, w]));
  const data = resolvePostMegaSeedShape('guardian-first-patrol', wordBySlug, TODAY_DAY);
  const entries = Object.values(data.guardian);
  assert.equal(entries.length, 8, 'exactly 8 guardian entries seeded');
  for (const entry of entries) {
    assert.equal(entry.nextDueDay, TODAY_DAY + 3, 'first-patrol guardian entries due at today+3');
    assert.equal(entry.reviewLevel, 0);
    assert.equal(entry.wobbling, false);
  }
});

test('content-added-after-graduation: postMega stamped with spelling-p1.5-legacy, new core words > 0', () => {
  const runtimeSnapshot = resolveRuntimeSnapshot(SEEDED_SPELLING_CONTENT_BUNDLE, {
    referenceBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
  });
  const wordBySlug = Object.fromEntries((runtimeSnapshot?.words || []).map((w) => [w.slug, w]));
  const data = resolvePostMegaSeedShape('content-added-after-graduation', wordBySlug, TODAY_DAY);
  assert.equal(data.postMega.unlockedContentReleaseId, POST_MEGA_LEGACY_PLACEHOLDER_RELEASE_ID);
  assert.equal(data.postMega.unlockedContentReleaseId, 'spelling-p1.5-legacy');
  // Run the selector and confirm postMegaDashboardAvailable + newCoreWordsSinceGraduation > 0.
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  repositories.subjectStates.writeData('learner-content-add', 'spelling', data);
  const record = repositories.subjectStates.read('learner-content-add', 'spelling');
  const selectorOutput = getSpellingPostMasteryState({
    subjectStateRecord: record,
    runtimeSnapshot,
    now: () => TODAY_MS,
  });
  assert.equal(selectorOutput.postMegaDashboardAvailable, true,
    'post-graduation content add must NOT revoke the dashboard');
  assert.ok(selectorOutput.newCoreWordsSinceGraduation > 0,
    'new-core-words counter must flag at least one newly-arrived slug');
});

test('resolvePostMegaSeedShape throws BadRequestError-shaped error for unknown shape', () => {
  const runtimeSnapshot = resolveRuntimeSnapshot(SEEDED_SPELLING_CONTENT_BUNDLE, {
    referenceBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
  });
  const wordBySlug = Object.fromEntries((runtimeSnapshot?.words || []).map((w) => [w.slug, w]));
  assert.throws(
    () => resolvePostMegaSeedShape('totally-made-up', wordBySlug, TODAY_DAY),
    (err) => err.code === 'unknown_shape' && Array.isArray(err.allowed) && err.allowed.includes('fresh-graduate'),
  );
});

// -----------------------------------------------------------------------------
// Helper-through-repository tests — the tests/helpers/post-mastery-seeds.js
// re-exported helper must write through `repositories.subjectStates.writeData`
// so a test that swaps the helper for a live repository writes through the
// same channel the production surface uses.
// -----------------------------------------------------------------------------

test('applyPostMegaSeedShape writes through repositories.subjectStates.writeData for every shape', () => {
  const runtimeSnapshot = resolveRuntimeSnapshot(SEEDED_SPELLING_CONTENT_BUNDLE, {
    referenceBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
  });
  const wordBySlug = Object.fromEntries((runtimeSnapshot?.words || []).map((w) => [w.slug, w]));

  for (const shapeName of POST_MEGA_SEED_SHAPES) {
    const storage = installMemoryStorage();
    const repositories = createLocalPlatformRepositories({ storage });
    const data = applyPostMegaSeedShape({
      repositories,
      learnerId: 'learner-a',
      shapeName,
      wordBySlug,
      today: TODAY_DAY,
    });
    const record = repositories.subjectStates.read('learner-a', 'spelling');
    assert.ok(record?.data?.progress, `${shapeName}: progress persisted`);
    // Every non-fresh-graduate shape carries a persisted postMega; fresh-graduate deliberately does not.
    if (shapeName === 'fresh-graduate') {
      assert.equal(record.data.postMega, undefined,
        'fresh-graduate must leave data.postMega unset so the first submit can mint the sticky');
    } else {
      assert.ok(record.data.postMega,
        `${shapeName}: postMega sticky must be pre-populated`);
    }
    assert.deepEqual(
      record.data.progress,
      data.progress,
      `${shapeName}: repository returns the exact progress map written`,
    );
  }
});

test('seedFullCoreMega from shared helper still produces a uniform mega baseline', () => {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const progress = seedFullCoreMega(repositories, 'learner-a', {
    today: TODAY_DAY,
    guardian: {},
    postMega: null,
    variation: false,
  });
  const record = repositories.subjectStates.read('learner-a', 'spelling');
  assert.deepEqual(record.data.progress, progress);
  for (const entry of Object.values(progress)) {
    assert.equal(entry.stage, 4);
    assert.equal(entry.dueDay, TODAY_DAY + 60);
    assert.equal(entry.lastDay, TODAY_DAY - 7);
    assert.equal(entry.lastResult, 'correct');
    assert.equal(entry.attempts, 6);
    assert.equal(entry.correct, 5);
  }
});

// -----------------------------------------------------------------------------
// Worker API tests — the POST /api/admin/spelling/seed-post-mega endpoint.
// -----------------------------------------------------------------------------

test('Worker POST seed-post-mega: fresh-graduate writes bounded Spelling state, auto-creates learner, mutation receipt scopeType=platform', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin', email: 'admin@example.com', platformRole: 'admin' });
    const response = await seedViaApi(server, 'adult-admin', {
      learnerId: 'learner-seed-1',
      shapeName: 'fresh-graduate',
      today: TODAY_DAY,
      mutation: { requestId: 'req-seed-1', correlationId: 'corr-seed-1' },
    });
    const payload = await response.json();
    assert.equal(response.status, 200, `expected 200, got ${response.status}: ${JSON.stringify(payload)}`);
    assert.equal(payload.ok, true);
    assert.equal(payload.postMegaSeed.learnerId, 'learner-seed-1');
    assert.equal(payload.postMegaSeed.shapeName, 'fresh-graduate');
    assert.equal(payload.postMegaSeed.createdLearner, true, 'learner auto-created on first seed');
    assert.equal(payload.postMegaSeedMutation.scopeType, 'platform');
    assert.equal(payload.postMegaSeedMutation.scopeId, 'post-mega-seed:learner-seed-1');
    assert.equal(payload.postMegaSeedMutation.kind, 'admin.spelling.post-mega-seed');
    assert.equal(payload.postMegaSeedMutation.replayed, false);

    // Learner profile exists.
    const learner = learnerRow(server, 'learner-seed-1');
    assert.ok(learner, 'learner_profiles row created by seed');
    assert.equal(learner.year_group, 'Y5');
    assert.equal(learner.name, 'Seed learner');

    // The authoritative split store has the shape's data.
    const state = readAuthoritativeSpellingState(server, 'learner-seed-1');
    assert.ok(state, 'bounded Spelling state persisted');
    assert.ok(state.progress, 'progress map on persisted data');
    assert.deepEqual(state.guardian, {});
    assert.equal(Object.prototype.hasOwnProperty.call(state, 'postMega'), false);
    // Every statutory core slug should be Mega.
    const runtimeSnapshot = resolveRuntimeSnapshot(SEEDED_SPELLING_CONTENT_BUNDLE, {
      referenceBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
    });
    const coreSlugs = (runtimeSnapshot?.words || [])
      .filter(isStatutoryCoreWord)
      .map((w) => w.slug);
    for (const slug of coreSlugs) {
      assert.equal(state.progress[slug].stage, 4);
    }

    // Receipt row carries scope platform / post-mega-seed prefix.
    const receipt = server.DB.db.prepare(`
      SELECT scope_type, scope_id, mutation_kind FROM mutation_receipts WHERE request_id = ?
    `).get('req-seed-1');
    assert.ok(receipt);
    assert.equal(receipt.scope_type, 'platform');
    assert.equal(receipt.scope_id, 'post-mega-seed:learner-seed-1');
    assert.equal(receipt.mutation_kind, 'admin.spelling.post-mega-seed');
  } finally {
    server.close();
  }
});

test('Worker POST seed-post-mega: guardian-first-patrol persists 8 guardian entries at today+3', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin', email: 'admin@example.com', platformRole: 'admin' });
    const response = await seedViaApi(server, 'adult-admin', {
      learnerId: 'learner-first-patrol',
      shapeName: 'guardian-first-patrol',
      today: TODAY_DAY,
      mutation: { requestId: 'req-seed-fp', correlationId: 'corr-seed-fp' },
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    const state = readAuthoritativeSpellingState(server, 'learner-first-patrol');
    assert.ok(state);
    const guardianEntries = Object.values(state.guardian);
    assert.equal(guardianEntries.length, 8);
    for (const entry of guardianEntries) {
      assert.equal(entry.nextDueDay, TODAY_DAY + 3);
    }
    assert.ok(state.postMega, 'guardian-first-patrol persists sticky');
    assert.equal(state.postMega.unlockedContentReleaseId, 'spelling-p2-baseline-2026-04-26');
  } finally {
    server.close();
  }
});

test('Worker POST seed-post-mega: content-added-after-graduation stamps spelling-p1.5-legacy', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin', email: 'admin@example.com', platformRole: 'admin' });
    const response = await seedViaApi(server, 'adult-admin', {
      learnerId: 'learner-content-add',
      shapeName: 'content-added-after-graduation',
      today: TODAY_DAY,
      mutation: { requestId: 'req-seed-ca', correlationId: 'corr-seed-ca' },
    });
    assert.equal(response.status, 200);
    const state = readAuthoritativeSpellingState(server, 'learner-content-add');
    assert.equal(state.postMega.unlockedContentReleaseId, 'spelling-p1.5-legacy');
    assert.ok(
      state.postMega.unlockedPublishedCoreCount
        < Object.keys(state.progress).length,
      'stamp must record a pre-expansion core count so the selector computes new-core-words > 0',
    );
  } finally {
    server.close();
  }
});

test('Worker POST seed-post-mega: non-admin role receives 403 with post_mega_seed_forbidden', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-ops', email: 'ops@example.com', platformRole: 'ops' });
    seedAdultAccount(server, { id: 'adult-parent', email: 'parent@example.com', platformRole: 'parent' });

    // Ops role CAN view the admin hub but not run the seed harness.
    const opsResponse = await seedViaApi(server, 'adult-ops', {
      learnerId: 'learner-forbidden',
      shapeName: 'fresh-graduate',
      today: TODAY_DAY,
      mutation: { requestId: 'req-seed-ops', correlationId: 'corr-seed-ops' },
    }, { role: 'ops' });
    const opsPayload = await opsResponse.json();
    assert.equal(opsResponse.status, 403);
    assert.equal(opsPayload.code, 'post_mega_seed_forbidden');

    // Parent role — admin hub is closed entirely.
    const parentResponse = await seedViaApi(server, 'adult-parent', {
      learnerId: 'learner-forbidden-2',
      shapeName: 'fresh-graduate',
      today: TODAY_DAY,
      mutation: { requestId: 'req-seed-parent', correlationId: 'corr-seed-parent' },
    }, { role: 'parent' });
    assert.equal(parentResponse.status, 403);
  } finally {
    server.close();
  }
});

test('Worker POST seed-post-mega: unknown shape returns 400 unknown_shape', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin', email: 'admin@example.com', platformRole: 'admin' });
    const response = await seedViaApi(server, 'adult-admin', {
      learnerId: 'learner-bad-shape',
      shapeName: 'totally-made-up',
      today: TODAY_DAY,
      mutation: { requestId: 'req-seed-bad', correlationId: 'corr-seed-bad' },
    });
    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.equal(payload.code, 'unknown_shape');
    assert.ok(Array.isArray(payload.allowed), 'response lists allowed shapes');
    assert.ok(payload.allowed.includes('fresh-graduate'));
  } finally {
    server.close();
  }
});

test('Worker POST seed-post-mega: idempotent on repeat with identical payload', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin', email: 'admin@example.com', platformRole: 'admin' });
    const body = {
      learnerId: 'learner-idem',
      shapeName: 'fresh-graduate',
      today: TODAY_DAY,
      mutation: { requestId: 'req-seed-idem', correlationId: 'corr-seed-idem' },
    };
    const first = await seedViaApi(server, 'adult-admin', body);
    assert.equal(first.status, 200);
    const firstPayload = await first.json();
    assert.equal(firstPayload.postMegaSeedMutation.replayed, false);

    const second = await seedViaApi(server, 'adult-admin', body);
    assert.equal(second.status, 200);
    const secondPayload = await second.json();
    assert.equal(secondPayload.postMegaSeedMutation.replayed, true,
      'second call with identical requestId must be a receipt replay');
  } finally {
    server.close();
  }
});

// -----------------------------------------------------------------------------
// CLI round-trip — buildSeedSql must emit well-formed SQL that writes the
// seed shape JSON for the target learner. We don't shell out to wrangler
// in CI (the local D1 harness uses better-sqlite3), but we do assert the
// SQL is structurally valid and contains the exact seed shape's JSON.
// -----------------------------------------------------------------------------

test('CLI buildSeedSql emits one schema authority at a time and executes before or after migration 0023', () => {
  const nowTs = TODAY_MS;
  const legacySql = buildSeedSql({
    learnerId: 'learner-cli-1',
    shapeName: 'fresh-graduate',
    today: TODAY_DAY,
    nowTs,
    authority: 'legacy',
  });
  assert.ok(legacySql.includes('PRAGMA foreign_keys = OFF'), 'script disables FKs');
  assert.ok(legacySql.includes('BEGIN'), 'script wraps statements in a transaction');
  assert.ok(legacySql.includes('COMMIT'), 'script commits before re-enabling FKs');
  assert.ok(legacySql.includes('PRAGMA foreign_keys = ON'), 'script re-enables FKs');
  assert.ok(legacySql.includes('INSERT INTO child_subject_state'), 'legacy SQL writes only the legacy authority');
  assert.ok(!legacySql.includes('spelling_learner_state'), 'legacy SQL never parses a bounded table name');
  assert.ok(!legacySql.includes('bounded_gameplay_state_migrations'), 'legacy SQL does not depend on a missing marker table');

  const legacyDb = createDatabaseThrough('0022_practice_sessions_active_hot_path_index.sql');
  try {
    legacyDb.db.exec(legacySql);
    const legacy = legacyDb.db.prepare(`
      SELECT data_json FROM child_subject_state
      WHERE learner_id = 'learner-cli-1' AND subject_id = 'spelling'
    `).get();
    assert.ok(JSON.parse(legacy.data_json).progress, 'legacy authority receives the seed shape');
  } finally {
    legacyDb.close();
  }

  const boundedSql = buildSeedSql({
    learnerId: 'learner-cli-2',
    shapeName: 'fresh-graduate',
    today: TODAY_DAY,
    nowTs,
    authority: 'bounded',
  });
  assert.ok(boundedSql.includes('INSERT INTO spelling_learner_state'), 'bounded SQL writes learner state');
  assert.ok(boundedSql.includes('INSERT INTO spelling_item_state'), 'bounded SQL expands item rows in SQLite');
  assert.ok(boundedSql.includes('INSERT INTO spelling_seed_preimages'), 'bounded SQL archives before overwrite');
  assert.ok(!boundedSql.includes('INSERT INTO child_subject_state'), 'bounded SQL never rewrites the cold legacy blob');

  const boundedDb = createDatabaseThrough('0024_post_mega_seed_preimages.sql');
  try {
    boundedDb.db.exec(boundedSql);
    const learner = boundedDb.db.prepare(`
      SELECT data_json FROM spelling_learner_state WHERE learner_id = 'learner-cli-2'
    `).get();
    const itemCount = boundedDb.db.prepare(`
      SELECT COUNT(*) AS count FROM spelling_item_state WHERE learner_id = 'learner-cli-2'
    `).get().count;
    assert.ok(JSON.parse(learner.data_json), 'bounded learner envelope is valid JSON');
    assert.ok(itemCount > 0, 'bounded authority receives row-addressed item state');
  } finally {
    boundedDb.close();
  }
});

test('CLI bounded seed aborts without writes when an existing learner has lost its parent state row', () => {
  const db = createDatabaseThrough('0024_post_mega_seed_preimages.sql');
  try {
    db.db.prepare(`
      INSERT INTO learner_profiles (
        id, name, year_group, avatar_color, goal, daily_minutes,
        created_at, updated_at, state_revision
      ) VALUES ('learner-cli-row-hole', 'Learner', 'Y5', '#8A4FFF', '', 15, ?, ?, 0)
    `).run(TODAY_MS, TODAY_MS);
    db.db.prepare(`
      DELETE FROM spelling_learner_state
      WHERE learner_id = 'learner-cli-row-hole'
    `).run();
    db.db.prepare(`
      INSERT INTO spelling_item_state (
        learner_id, slug, progress_json, guardian_json, pattern_json,
        updated_at, updated_by_account_id
      ) VALUES ('learner-cli-row-hole', 'cold-history', ?, NULL, NULL, ?, NULL)
    `).run(JSON.stringify({ stage: 3, attempts: 4, correct: 3, wrong: 1 }), TODAY_MS);

    const sql = buildSeedSql({
      learnerId: 'learner-cli-row-hole',
      shapeName: 'guardian-first-patrol',
      today: TODAY_DAY,
      nowTs: TODAY_MS + 1,
      authority: 'bounded',
    });
    assert.throws(
      () => db.db.exec(sql),
      /existing learner is missing bounded Spelling state/,
    );
    assert.equal(db.db.isTransaction, false, 'the guard rolls back the complete CLI transaction');
    assert.equal(db.db.prepare(`
      SELECT COUNT(*) AS count FROM spelling_learner_state
      WHERE learner_id = 'learner-cli-row-hole'
    `).get().count, 0, 'the missing parent row is not silently recreated');
    assert.equal(db.db.prepare(`
      SELECT COUNT(*) AS count FROM spelling_item_state
      WHERE learner_id = 'learner-cli-row-hole'
    `).get().count, 1, 'cold item history is untouched');
    assert.equal(db.db.prepare(`
      SELECT COUNT(*) AS count FROM spelling_seed_preimages
      WHERE learner_id = 'learner-cli-row-hole'
    `).get().count, 0, 'a failed seed cannot claim to have captured a preimage');
  } finally {
    db.close();
  }
});

test('CLI buildSeedSql throws unknown_shape on bogus shape', () => {
  assert.throws(
    () => buildSeedSql({ learnerId: 'x', shapeName: 'nope', today: TODAY_DAY, nowTs: TODAY_MS }),
    (err) => err.code === 'unknown_shape',
  );
});

test('CLI buildSeedSql shape-for-shape: content-added-after-graduation embeds spelling-p1.5-legacy', () => {
  const sql = buildSeedSql({
    learnerId: 'learner-cli-legacy',
    shapeName: 'content-added-after-graduation',
    today: TODAY_DAY,
    nowTs: TODAY_MS,
  });
  assert.ok(sql.includes('spelling-p1.5-legacy'),
    'content-added-after-graduation SQL must carry the synthetic placeholder release id');
});

// -----------------------------------------------------------------------------
// U3 reviewer follow-up tests (2026-04-26) — HIGH correctness, HIGH
// adversarial, P2 security, MEDIUM regressions. Every block below is tagged
// with the reviewer finding it pins so a future reviewer can trace intent.
// -----------------------------------------------------------------------------

test('[U3 HIGH correctness] missing `today` in the request body falls back to ts-derived day (not 1970-01-01)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin', email: 'admin@example.com', platformRole: 'admin' });
    // POST WITHOUT a `today` field — the Admin UI never sends one.
    const response = await seedViaApi(server, 'adult-admin', {
      learnerId: 'learner-no-today',
      shapeName: 'fresh-graduate',
      // `today` omitted intentionally — mirrors the real admin-hub payload.
      mutation: { requestId: 'req-seed-no-today', correlationId: 'corr-seed-no-today' },
    });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    // `today` must be the current day's floor, not 0 (which would have been
    // the `Number(null) === 0` trap before the fix). Any finite value > 10000
    // proves we took the ts-derived fallback (day ~20k for today ≈ 2026).
    assert.ok(
      Number.isFinite(payload.postMegaSeed.today) && payload.postMegaSeed.today > 10000,
      `expected todayDay to be derived from server ts, got ${payload.postMegaSeed.today}`,
    );
  } finally {
    server.close();
  }
});

test('[0023 integrity] seed fails closed when an existing learner loses the bounded Spelling row', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin', email: 'admin@example.com', platformRole: 'admin' });
    const first = await seedViaApi(server, 'adult-admin', {
      learnerId: 'learner-missing-bounded-row',
      shapeName: 'fresh-graduate',
      today: TODAY_DAY,
      mutation: { requestId: 'req-seed-hole-1', correlationId: 'corr-seed-hole-1' },
    });
    assert.equal(first.status, 200, await first.text());

    const itemCountBefore = server.DB.db.prepare(`
      SELECT COUNT(*) AS count
      FROM spelling_item_state
      WHERE learner_id = 'learner-missing-bounded-row'
    `).get().count;
    assert.ok(itemCountBefore > 0);
    server.DB.db.prepare(`
      DELETE FROM spelling_learner_state
      WHERE learner_id = 'learner-missing-bounded-row'
    `).run();

    const blocked = await seedViaApi(server, 'adult-admin', {
      learnerId: 'learner-missing-bounded-row',
      shapeName: 'guardian-first-patrol',
      today: TODAY_DAY,
      mutation: { requestId: 'req-seed-hole-2', correlationId: 'corr-seed-hole-2' },
    });
    const payload = await blocked.json();
    assert.equal(blocked.status, 503, JSON.stringify(payload));
    assert.equal(payload.code, 'bounded_gameplay_state_unavailable');
    assert.equal(server.DB.db.prepare(`
      SELECT COUNT(*) AS count
      FROM spelling_item_state
      WHERE learner_id = 'learner-missing-bounded-row'
    `).get().count, itemCountBefore, 'cold item history must not be replaced');
    assert.equal(server.DB.db.prepare(`
      SELECT state_revision
      FROM learner_profiles
      WHERE id = 'learner-missing-bounded-row'
    `).get().state_revision, 0, 'blocked seed must not advance learner revision');
    assert.equal(server.DB.db.prepare(`
      SELECT COUNT(*) AS count
      FROM mutation_receipts
      WHERE request_id = 'req-seed-hole-2'
    `).get().count, 0, 'blocked seed must not write a receipt');
  } finally {
    server.close();
  }
});

test('[U3 HIGH adversarial] bounded pre-image restores exact current state without fat receipts', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin', email: 'admin@example.com', platformRole: 'admin' });
    // First seed writes the baseline shape.
    const first = await seedViaApi(server, 'adult-admin', {
      learnerId: 'learner-preimage',
      shapeName: 'fresh-graduate',
      today: TODAY_DAY,
      mutation: { requestId: 'req-seed-preimage-1', correlationId: 'corr-preimage-1' },
    });
    const firstPayload = await first.json();
    assert.equal(first.status, 200, JSON.stringify(firstPayload));
    // On fresh learner creation there is no pre-image.
    assert.equal(firstPayload.postMegaSeed.preimageId, null);
    assert.equal(firstPayload.postMegaSeed.previousDataJson, null);
    const probeItem = server.DB.db.prepare(`
      SELECT slug, progress_json
      FROM spelling_item_state
      WHERE learner_id = 'learner-preimage'
      ORDER BY slug
      LIMIT 1
    `).get();
    const probeProgress = JSON.parse(probeItem.progress_json);
    probeProgress.restoreProbe = 'exact-source-row';
    server.DB.db.prepare(`
      UPDATE spelling_learner_state
      SET ui_json = ?, stats_json = ?, updated_at = ?, updated_by_account_id = ?
      WHERE learner_id = 'learner-preimage'
    `).run(
      JSON.stringify({ phase: 'restore-probe' }),
      JSON.stringify({ restoreProbe: 'exact-source-row' }),
      TODAY_MS - 12_345,
      'adult-admin',
    );
    server.DB.db.prepare(`
      UPDATE spelling_item_state
      SET progress_json = ?, updated_at = ?, updated_by_account_id = ?
      WHERE learner_id = 'learner-preimage' AND slug = ?
    `).run(
      JSON.stringify(probeProgress),
      TODAY_MS - 54_321,
      'adult-admin',
      probeItem.slug,
    );
    const achievementRows = [
      {
        achievementId: 'achievement:spelling:guardian:7-day:restore-probe',
        record: { unlockedAt: TODAY_MS - 90_000, source: 'guardian' },
        updatedAt: TODAY_MS - 80_000,
      },
      {
        achievementId: 'achievement:spelling:boss:clean-sweep:restore-probe',
        record: { unlockedAt: TODAY_MS - 70_000, source: 'boss', score: 8 },
        updatedAt: TODAY_MS - 60_000,
      },
    ];
    const insertAchievement = server.DB.db.prepare(`
      INSERT INTO spelling_achievement_state (
        learner_id, achievement_id, record_json, updated_at, updated_by_account_id
      ) VALUES (?, ?, ?, ?, ?)
    `);
    for (const achievement of achievementRows) {
      insertAchievement.run(
        'learner-preimage',
        achievement.achievementId,
        JSON.stringify(achievement.record),
        achievement.updatedAt,
        'adult-admin',
      );
    }
    const baseline = readAuthoritativeSpellingState(server, 'learner-preimage');
    const exactBaseline = readExactAuthoritativeSpellingState(server, 'learner-preimage');

    // Second seed OVERWRITES — D1 captures the authoritative split rows.
    const second = await seedViaApi(server, 'adult-admin', {
      learnerId: 'learner-preimage',
      shapeName: 'guardian-first-patrol',
      today: TODAY_DAY,
      mutation: { requestId: 'req-seed-preimage-2', correlationId: 'corr-preimage-2' },
    });
    const secondPayload = await second.json();
    assert.equal(second.status, 200, JSON.stringify(secondPayload));
    assert.ok(
      typeof secondPayload.postMegaSeed.preimageId === 'string'
        && secondPayload.postMegaSeed.preimageId.length > 0,
      'overwrite must return a bounded preimage id',
    );
    assert.equal(secondPayload.postMegaSeed.previousDataJson, null);
    assert.equal(secondPayload.postMegaSeed.rollbackAuthority, 'spelling_seed_preimages');

    // The receipt carries only the id, never the learner's item history.
    const receipt = server.DB.db.prepare(`
      SELECT response_json FROM mutation_receipts WHERE request_id = ?
    `).get('req-seed-preimage-2');
    const storedResponse = JSON.parse(receipt.response_json);
    assert.equal(
      storedResponse.postMegaSeed.preimageId,
      secondPayload.postMegaSeed.preimageId,
      'receipt must point to the D1 preimage',
    );
    assert.ok(receipt.response_json.length < 2_000, 'receipt size is independent of word history');

    const archive = server.DB.db.prepare(`
      SELECT item_count, achievement_count
      FROM spelling_seed_preimages WHERE preimage_id = ?
    `).get(secondPayload.postMegaSeed.preimageId);
    const archivedItems = server.DB.db.prepare(`
      SELECT COUNT(*) AS count FROM spelling_seed_preimage_items WHERE preimage_id = ?
    `).get(secondPayload.postMegaSeed.preimageId);
    assert.equal(archivedItems.count, archive.item_count);
    const archivedAchievements = server.DB.db.prepare(`
      SELECT achievement_id, record_json, source_updated_at,
             source_updated_by_account_id
      FROM spelling_seed_preimage_achievements
      WHERE preimage_id = ?
      ORDER BY achievement_id
    `).all(secondPayload.postMegaSeed.preimageId).map((row) => ({ ...row }));
    assert.equal(archive.achievement_count, achievementRows.length);
    assert.deepEqual(
      archivedAchievements,
      exactBaseline.achievements.map((achievement) => ({
        achievement_id: achievement.achievementId,
        record_json: achievement.recordJson,
        source_updated_at: achievement.updatedAt,
        source_updated_by_account_id: achievement.updatedByAccountId,
      })),
      'overwrite archives every achievement value and source field exactly',
    );
    assert.deepEqual(
      readExactAuthoritativeSpellingState(server, 'learner-preimage').achievements,
      [],
      'replacement seed clears achievements which are absent from the selected shape',
    );

    const restore = await restoreViaApi(server, 'adult-admin', {
      learnerId: 'learner-preimage',
      preimageId: secondPayload.postMegaSeed.preimageId,
      mutation: { requestId: 'req-seed-restore-1', correlationId: 'corr-seed-restore-1' },
    });
    const restorePayload = await restore.json();
    assert.equal(restore.status, 200, JSON.stringify(restorePayload));
    assert.equal(restorePayload.postMegaSeedRestore.preimageId, secondPayload.postMegaSeed.preimageId);
    assert.equal(restorePayload.postMegaSeedRestore.achievementCount, achievementRows.length);
    assert.deepEqual(readAuthoritativeSpellingState(server, 'learner-preimage'), baseline);
    assert.deepEqual(
      readExactAuthoritativeSpellingState(server, 'learner-preimage'),
      exactBaseline,
      'rollback restores learner, item, and achievement values and source fields exactly',
    );
  } finally {
    server.close();
  }
});

test('[U3 HIGH adversarial] cross-tenant overwrite rejected with 409 seed_requires_membership unless confirmOverwrite=true', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin', email: 'admin@example.com', platformRole: 'admin' });
    seedAdultAccount(server, { id: 'adult-admin-2', email: 'admin2@example.com', platformRole: 'admin' });

    // adult-admin seeds learner-cross first — membership is granted automatically.
    const initial = await seedViaApi(server, 'adult-admin', {
      learnerId: 'learner-cross',
      shapeName: 'fresh-graduate',
      today: TODAY_DAY,
      mutation: { requestId: 'req-seed-cross-1', correlationId: 'corr-cross-1' },
    });
    assert.equal(initial.status, 200);

    // adult-admin-2 tries to overwrite — should 409 with seed_requires_membership.
    const blocked = await seedViaApi(server, 'adult-admin-2', {
      learnerId: 'learner-cross',
      shapeName: 'guardian-first-patrol',
      today: TODAY_DAY,
      mutation: { requestId: 'req-seed-cross-2', correlationId: 'corr-cross-2' },
    });
    const blockedPayload = await blocked.json();
    assert.equal(blocked.status, 409, `expected 409, got ${blocked.status}: ${JSON.stringify(blockedPayload)}`);
    assert.equal(blockedPayload.code, 'seed_requires_membership');

    // Same admin, now with confirmOverwrite=true — should succeed and
    // capture the prior admin's baseline as pre-image.
    const confirmed = await seedViaApi(server, 'adult-admin-2', {
      learnerId: 'learner-cross',
      shapeName: 'guardian-first-patrol',
      today: TODAY_DAY,
      confirmOverwrite: true,
      mutation: { requestId: 'req-seed-cross-3', correlationId: 'corr-cross-3' },
    });
    const confirmedPayload = await confirmed.json();
    assert.equal(confirmed.status, 200, JSON.stringify(confirmedPayload));
    assert.equal(confirmedPayload.postMegaSeed.confirmedOverwrite, true);
    assert.ok(
      typeof confirmedPayload.postMegaSeed.preimageId === 'string'
        && confirmedPayload.postMegaSeed.preimageId.length > 0,
      'confirmed cross-tenant overwrite must archive a bounded pre-image',
    );
  } finally {
    server.close();
  }
});

test('[U3 HIGH adversarial] admin with membership can overwrite their own learner WITHOUT confirmOverwrite', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin', email: 'admin@example.com', platformRole: 'admin' });

    // First seed — learner auto-created, membership granted.
    const first = await seedViaApi(server, 'adult-admin', {
      learnerId: 'learner-own',
      shapeName: 'fresh-graduate',
      today: TODAY_DAY,
      mutation: { requestId: 'req-seed-own-1', correlationId: 'corr-own-1' },
    });
    assert.equal(first.status, 200);

    // Second seed from the same admin — no confirmOverwrite needed.
    const second = await seedViaApi(server, 'adult-admin', {
      learnerId: 'learner-own',
      shapeName: 'guardian-first-patrol',
      today: TODAY_DAY,
      mutation: { requestId: 'req-seed-own-2', correlationId: 'corr-own-2' },
    });
    const secondPayload = await second.json();
    assert.equal(second.status, 200, JSON.stringify(secondPayload));
    // Not confirmedOverwrite because the admin has owner membership.
    assert.equal(secondPayload.postMegaSeed.confirmedOverwrite, false);
    assert.ok(
      typeof secondPayload.postMegaSeed.preimageId === 'string',
      'own-learner overwrite still archives a bounded pre-image for audit',
    );
  } finally {
    server.close();
  }
});

test('[U3 P2 security] 11th POST in 60s window from same IP returns 429 post_mega_seed_rate_limited', async () => {
  const server = createWorkerRepositoryServer();
  const originalDateNow = Date.now;
  try {
    seedAdultAccount(server, { id: 'adult-admin', email: 'admin@example.com', platformRole: 'admin' });
    // Pin the limiter clock away from a minute boundary. Under the full
    // parallel Node suite this test can otherwise straddle a 60s bucket
    // boundary and falsely see the 11th request start a fresh window.
    Date.now = () => Date.UTC(2026, 3, 28, 10, 15, 30);
    // Fire 10 allowed requests from the same `cf-connecting-ip`. Each uses
    // a distinct requestId so the mutation-receipt preflight does not
    // short-circuit them; the 11th should 429.
    const IP = '203.0.113.42';
    let lastOkStatus = null;
    for (let i = 0; i < 10; i += 1) {
      const response = await server.fetchAs('adult-admin', 'https://repo.test/api/admin/spelling/seed-post-mega', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://repo.test',
          'x-ks2-dev-platform-role': 'admin',
          'cf-connecting-ip': IP,
        },
        body: JSON.stringify({
          learnerId: `learner-rate-${i}`,
          shapeName: 'fresh-graduate',
          today: TODAY_DAY,
          mutation: { requestId: `req-seed-rate-${i}`, correlationId: `corr-rate-${i}` },
        }),
      });
      lastOkStatus = response.status;
      // All 10 should succeed.
      assert.equal(response.status, 200, `request ${i} expected 200, got ${response.status}`);
    }
    // The 11th is the rate-limit trip.
    const overLimit = await server.fetchAs('adult-admin', 'https://repo.test/api/admin/spelling/seed-post-mega', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://repo.test',
        'x-ks2-dev-platform-role': 'admin',
        'cf-connecting-ip': IP,
      },
      body: JSON.stringify({
        learnerId: 'learner-rate-11',
        shapeName: 'fresh-graduate',
        today: TODAY_DAY,
        mutation: { requestId: 'req-seed-rate-11', correlationId: 'corr-rate-11' },
      }),
    });
    const overPayload = await overLimit.json();
    assert.equal(overLimit.status, 429, `expected 429, got ${overLimit.status}: ${JSON.stringify(overPayload)}`);
    assert.equal(overPayload.code, 'post_mega_seed_rate_limited');
    assert.ok(typeof overPayload.retryAfterSeconds === 'number' && overPayload.retryAfterSeconds >= 0);
    // RFC 9110 Retry-After header must be present.
    assert.ok(overLimit.headers.get('retry-after'), 'Retry-After header present on 429');

    // Sanity: the previous attempts (lastOkStatus) all cleared.
    assert.equal(lastOkStatus, 200);
  } finally {
    Date.now = originalDateNow;
    server.close();
  }
});

test('[U3 MEDIUM adversarial] learnerId with control chars or HTML rejected with 400 invalid_learner_id', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin', email: 'admin@example.com', platformRole: 'admin' });
    // NOTE: the regex is `/^[a-z0-9][a-z0-9-]{0,63}$/i` (case-insensitive),
    // so `UPPER` is deliberately accepted — the guard targets control chars /
    // HTML / whitespace / leading-hyphen, not casing.
    const bogus = ['alice\nbob', '<script>', 'has space', '-leading-hyphen', ''];
    for (const learnerId of bogus) {
      const response = await seedViaApi(server, 'adult-admin', {
        learnerId,
        shapeName: 'fresh-graduate',
        today: TODAY_DAY,
        mutation: {
          requestId: `req-seed-invalid-${bogus.indexOf(learnerId)}`,
          correlationId: `corr-invalid-${bogus.indexOf(learnerId)}`,
        },
      });
      const payload = await response.json();
      assert.equal(response.status, 400, `"${learnerId}" should 400, got ${response.status}: ${JSON.stringify(payload)}`);
      // Empty string hits the `learner_id_required` pre-guard; other bogus
      // values hit the regex guard. Both paths are acceptable — the key is
      // 400 status with a stable code the client can branch on.
      assert.ok(
        payload.code === 'invalid_learner_id' || payload.code === 'learner_id_required',
        `"${learnerId}" should be rejected, got code=${payload.code}`,
      );
    }
  } finally {
    server.close();
  }
});

test('[U3 MEDIUM adversarial] CLI --account flag produces membership INSERT; omitting it skips the INSERT', () => {
  const withAccount = buildSeedSql({
    learnerId: 'learner-cli-account',
    shapeName: 'fresh-graduate',
    today: TODAY_DAY,
    nowTs: TODAY_MS,
    accountId: 'adult-admin',
  });
  assert.ok(
    withAccount.includes('INSERT INTO account_learner_memberships'),
    'with --account: membership INSERT present',
  );
  assert.ok(withAccount.includes("'adult-admin'"), 'membership INSERT embeds the account id');
  assert.ok(withAccount.includes("'owner'"), 'membership INSERT grants the owner role');
  assert.ok(
    withAccount.includes('ON CONFLICT(account_id, learner_id) DO NOTHING'),
    'membership INSERT is conflict-safe',
  );

  const withoutAccount = buildSeedSql({
    learnerId: 'learner-cli-no-account',
    shapeName: 'fresh-graduate',
    today: TODAY_DAY,
    nowTs: TODAY_MS,
  });
  assert.ok(
    !withoutAccount.includes('INSERT INTO account_learner_memberships'),
    'no --account: membership INSERT suppressed',
  );
});

test('[U3 MEDIUM adversarial] CLI buildSeedSql rejects malformed learnerId / accountId with invalid_* codes', () => {
  assert.throws(
    () => buildSeedSql({ learnerId: 'alice\nbob', shapeName: 'fresh-graduate', today: TODAY_DAY, nowTs: TODAY_MS }),
    (err) => err.code === 'invalid_learner_id',
  );
  assert.throws(
    () => buildSeedSql({
      learnerId: 'learner-x',
      shapeName: 'fresh-graduate',
      today: TODAY_DAY,
      nowTs: TODAY_MS,
      accountId: '<script>',
    }),
    (err) => err.code === 'invalid_account_id',
  );
});

// -----------------------------------------------------------------------------
// Child UI safety — the seed harness panel must only be reachable from the
// admin hub, which is structurally unavailable to child / parent roles.
// -----------------------------------------------------------------------------

test('child-UI safety: rendered Admin hub under admin role shows the seed harness panel', async () => {
  const html = await renderHubSurfaceFixture({ surface: 'admin', platformRole: 'admin' });
  assert.ok(html.includes('post-mega-seed-harness'),
    'admin render must include the seed harness data-panel marker');
  // The 8 canonical shapes appear in the dropdown.
  for (const shape of POST_MEGA_SEED_SHAPES) {
    assert.ok(html.includes(shape), `admin render includes shape option ${shape}`);
  }
});

test('child-UI safety: rendered Admin hub under ops role shows admin-only guard copy, not the Apply button', async () => {
  const html = await renderHubSurfaceFixture({ surface: 'admin', platformRole: 'ops' });
  // The panel still renders (shape-stable model), but the admin-only guard fires.
  assert.ok(html.includes('post-mega-seed-harness'));
  assert.ok(html.includes('Only admin accounts can apply QA seed shapes'),
    'ops render must carry the admin-only callout');
  assert.ok(!html.includes('Apply seed'),
    'ops render must NOT expose the Apply seed button');
});

test('child-UI safety: rendered Parent hub (child-side surface) never includes the seed harness panel', async () => {
  const html = await renderHubSurfaceFixture({ surface: 'parent', platformRole: 'admin' });
  assert.ok(!html.includes('post-mega-seed-harness'),
    'parent hub must never render the seed harness panel under any role');
  assert.ok(!html.includes('admin.spelling.post-mega-seed'),
    'parent hub must never reference the seed mutation kind');
});
