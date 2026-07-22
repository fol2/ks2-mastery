import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';
import { createWorkerRepository } from '../worker/src/repository.js';
import {
  createMigratedSqliteD1Database,
  SqliteD1Database,
} from './helpers/sqlite-d1.js';

const BASE_URL = 'https://repo.test';
const MIGRATION_0023 = '0023_bounded_gameplay_state.sql';
const NOW = Date.UTC(2026, 0, 1);

const READ_SURFACES = [
  {
    name: 'public bootstrap',
    path: '/api/bootstrap?preferredLearnerId=learner-a',
    headers: { 'x-ks2-public-read-models': '1' },
  },
  { name: 'Parent Hub', path: '/api/hubs/parent?learnerId=learner-a' },
  { name: 'Admin Hub', path: '/api/hubs/admin?learnerId=learner-a' },
  { name: 'Hero read model', path: '/api/hero/read-model?learnerId=learner-a' },
];

function rootDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function readMigration(filename) {
  return fs.readFileSync(path.join(rootDir(), 'worker', 'migrations', filename), 'utf8');
}

function createDatabaseBefore0023() {
  const DB = new SqliteD1Database();
  const migrationsDir = path.join(rootDir(), 'worker', 'migrations');
  for (const filename of fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql') && name < MIGRATION_0023)
    .sort()) {
    DB.db.exec(readMigration(filename));
  }
  return DB;
}

function seedReadSurfaceFixture(DB, { bounded = true } = {}) {
  DB.db.prepare(`
    INSERT INTO adult_accounts (
      id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, repo_revision
    ) VALUES ('adult-a', 'adult@example.test', 'Adult', 'admin', NULL, ?, ?, 0)
  `).run(NOW, NOW);
  DB.db.prepare(`
    INSERT INTO learner_profiles (
      id, name, year_group, avatar_color, goal, daily_minutes,
      created_at, updated_at, state_revision
    ) VALUES ('learner-a', 'Learner', 'Y5', '#123456', 'sats', 15, ?, ?, 0)
  `).run(NOW, NOW);
  DB.db.prepare(`
    INSERT INTO account_learner_memberships (
      account_id, learner_id, role, sort_index, created_at, updated_at
    ) VALUES ('adult-a', 'learner-a', 'owner', 0, ?, ?)
  `).run(NOW, NOW);
  DB.db.prepare(`
    UPDATE adult_accounts SET selected_learner_id = 'learner-a' WHERE id = 'adult-a'
  `).run();
  DB.db.prepare(`
    INSERT INTO child_subject_state (
      learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id
    ) VALUES ('learner-a', 'spelling', ?, ?, ?, 'adult-a')
  `).run(
    JSON.stringify({ phase: 'dashboard' }),
    JSON.stringify({
      prefs: { mode: 'smart' },
      progress: {
        possess: {
          stage: 3,
          attempts: 2,
          correct: 1,
          wrong: 1,
          dueDay: 0,
        },
      },
    }),
    NOW,
  );

  if (!bounded) return;

  const emptyStats = {
    total: 0,
    secure: 0,
    due: 0,
    fresh: 0,
    trouble: 0,
    attempts: 0,
    correct: 0,
    accuracy: null,
  };
  DB.db.prepare(`
    INSERT INTO spelling_learner_state (
      learner_id, ui_json, data_json, stats_json, updated_at, updated_by_account_id
    ) VALUES ('learner-a', ?, ?, ?, ?, 'adult-a')
    ON CONFLICT(learner_id) DO UPDATE SET
      ui_json = excluded.ui_json,
      data_json = excluded.data_json,
      stats_json = excluded.stats_json,
      updated_at = excluded.updated_at,
      updated_by_account_id = excluded.updated_by_account_id
  `).run(
    JSON.stringify({ phase: 'dashboard' }),
    JSON.stringify({ prefs: { mode: 'smart' } }),
    JSON.stringify({
      all: { ...emptyStats, total: 1, due: 1, attempts: 2, correct: 1, accuracy: 50 },
      core: { ...emptyStats, total: 1, due: 1, attempts: 2, correct: 1, accuracy: 50 },
      y34: emptyStats,
      y56: emptyStats,
      secureExtension: emptyStats,
      extra: emptyStats,
    }),
    NOW,
  );
}

function createSurfaceServer({ before0023 = false } = {}) {
  const DB = before0023
    ? createDatabaseBefore0023()
    : createMigratedSqliteD1Database();
  seedReadSurfaceFixture(DB, { bounded: !before0023 });
  const server = createWorkerRepositoryServer({
    db: DB,
    defaultAccountId: 'adult-a',
    defaultHeaders: { 'x-ks2-dev-platform-role': 'admin' },
    env: { HERO_MODE_SHADOW_ENABLED: 'true' },
    now: () => NOW,
  });
  return { DB, server };
}

async function fetchSurface(server, surface) {
  return server.fetch(`${BASE_URL}${surface.path}`, {
    headers: surface.headers || {},
  });
}

async function assertBoundedStateUnavailable(response, surfaceName, cacheState) {
  const payload = await response.json();
  assert.equal(response.status, 503, `${surfaceName} (${cacheState}): ${JSON.stringify(payload)}`);
  assert.equal(payload.code, 'bounded_gameplay_state_unavailable', `${surfaceName} (${cacheState})`);
  assert.equal(payload.retryable, true, `${surfaceName} (${cacheState})`);
  assert.equal(response.headers.get('retry-after'), '5', `${surfaceName} (${cacheState})`);
}

test('ready marker and missing spelling learner table fail closed on cold read caches', async () => {
  for (const surface of READ_SURFACES) {
    const { DB, server } = createSurfaceServer();
    try {
      DB.db.exec('DROP TABLE spelling_learner_state');
      await assertBoundedStateUnavailable(await fetchSurface(server, surface), surface.name, 'cold');
    } finally {
      server.close();
      DB.close();
    }
  }
});

test('ready marker and missing spelling learner table fail closed on warm read caches', async () => {
  for (const surface of READ_SURFACES) {
    const { DB, server } = createSurfaceServer();
    try {
      const warmResponse = await fetchSurface(server, surface);
      const warmPayload = await warmResponse.json();
      assert.equal(warmResponse.status, 200, `${surface.name} warm-up: ${JSON.stringify(warmPayload)}`);

      DB.db.exec('DROP TABLE spelling_learner_state');
      await assertBoundedStateUnavailable(await fetchSurface(server, surface), surface.name, 'warm');
    } finally {
      server.close();
      DB.close();
    }
  }
});

test('ready marker and missing per-learner spelling row fail closed on cold and warm read caches', async () => {
  for (const cacheState of ['cold', 'warm']) {
    for (const surface of READ_SURFACES) {
      const { DB, server } = createSurfaceServer();
      try {
        if (cacheState === 'warm') {
          const warmResponse = await fetchSurface(server, surface);
          const warmPayload = await warmResponse.json();
          assert.equal(warmResponse.status, 200, `${surface.name} warm-up: ${JSON.stringify(warmPayload)}`);
        }

        DB.db.prepare(`
          DELETE FROM spelling_learner_state WHERE learner_id = 'learner-a'
        `).run();
        await assertBoundedStateUnavailable(
          await fetchSurface(server, surface),
          surface.name,
          `${cacheState} missing row`,
        );
      } finally {
        server.close();
        DB.close();
      }
    }
  }
});

test('missing per-learner spelling row makes commands fail closed without writes on cold and warm caches', async () => {
  for (const cacheState of ['cold', 'warm']) {
    const { DB, server } = createSurfaceServer();
    try {
      if (cacheState === 'warm') {
        const warmResponse = await fetchSurface(server, READ_SURFACES[0]);
        assert.equal(warmResponse.status, 200, await warmResponse.text());
      }

      const legacyBefore = DB.db.prepare(`
        SELECT ui_json, data_json, updated_at
        FROM child_subject_state
        WHERE learner_id = 'learner-a' AND subject_id = 'spelling'
      `).get();
      DB.db.prepare(`
        DELETE FROM spelling_learner_state WHERE learner_id = 'learner-a'
      `).run();

      const requestId = `missing-spelling-row-${cacheState}`;
      const response = await server.fetch(`${BASE_URL}/api/subjects/spelling/command`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: BASE_URL,
        },
        body: JSON.stringify({
          command: 'start-session',
          learnerId: 'learner-a',
          requestId,
          expectedLearnerRevision: 0,
          payload: { mode: 'smart', roundLength: 1 },
        }),
      });
      await assertBoundedStateUnavailable(response, 'Spelling command', `${cacheState} missing row`);

      assert.equal(DB.db.prepare(`
        SELECT state_revision FROM learner_profiles WHERE id = 'learner-a'
      `).get().state_revision, 0, `${cacheState}: learner revision must not change`);
      assert.equal(DB.db.prepare(`
        SELECT COUNT(*) AS count FROM mutation_receipts WHERE request_id = ?
      `).get(requestId).count, 0, `${cacheState}: receipt must not be written`);
      assert.equal(DB.db.prepare(`
        SELECT COUNT(*) AS count FROM practice_sessions WHERE learner_id = 'learner-a'
      `).get().count, 0, `${cacheState}: session state must not be written`);
      assert.deepEqual(DB.db.prepare(`
        SELECT ui_json, data_json, updated_at
        FROM child_subject_state
        WHERE learner_id = 'learner-a' AND subject_id = 'spelling'
      `).get(), legacyBefore, `${cacheState}: legacy state must remain cold and unchanged`);
    } finally {
      server.close();
      DB.close();
    }
  }
});

test('missing per-learner spelling row makes direct runtime reads fail closed on cold and warm caches', async () => {
  for (const cacheState of ['cold', 'warm']) {
    const DB = createMigratedSqliteD1Database();
    seedReadSurfaceFixture(DB);
    const repository = createWorkerRepository({ env: { DB }, now: () => NOW });
    try {
      if (cacheState === 'warm') {
        const warmRuntime = await repository.readSubjectRuntime('adult-a', 'learner-a', 'spelling');
        assert.equal(warmRuntime.subjectRecord.data.prefs.mode, 'smart');
      }
      DB.db.prepare(`
        DELETE FROM spelling_learner_state WHERE learner_id = 'learner-a'
      `).run();

      await assert.rejects(
        repository.readSubjectRuntime('adult-a', 'learner-a', 'spelling'),
        error => error?.status === 503
          && error?.extra?.code === 'bounded_gameplay_state_unavailable'
          && error?.extra?.tableName === 'spelling_learner_state',
        `${cacheState}: runtime read must reject instead of hydrating legacy data_json`,
      );
    } finally {
      DB.close();
    }
  }
});

test('pre-0023 marker and bounded table absence preserves legacy read compatibility', async () => {
  const { DB, server } = createSurfaceServer({ before0023: true });
  try {
    for (const surface of READ_SURFACES) {
      const response = await fetchSurface(server, surface);
      const payload = await response.json();
      assert.equal(response.status, 200, `${surface.name}: ${JSON.stringify(payload)}`);
      assert.equal(payload.ok, true, surface.name);
    }
  } finally {
    server.close();
    DB.close();
  }
});
