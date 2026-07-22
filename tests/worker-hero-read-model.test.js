import test from 'node:test';
import assert from 'node:assert/strict';

import { createApiPlatformRepositories } from '../src/platform/core/repositories/index.js';
import {
  __clearHeroReadModelInFlightForTests,
  __heroReadModelInFlightSizeForTests,
  __readHeroReadModelInFlightForTests,
} from '../worker/src/hero/routes.js';
import {
  buildContentOperationHeroExposureProjection,
  CONTENT_OPERATION_HERO_EXPOSURE_PROOF_KEY,
} from '../worker/src/content-operations/release-projections.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

// ── Helpers ────────────────────────────────────────────────────────────

const HERO_URL = 'https://repo.test/api/hero/read-model';

const NOW = Date.UTC(2026, 0, 1);

function runSql(server, sql, params = []) {
  server.DB.db.prepare(sql).run(...params);
}

function createServerWithHeroFlag(enabled = true) {
  return createWorkerRepositoryServer({
    env: { HERO_MODE_SHADOW_ENABLED: enabled ? 'true' : 'false' },
  });
}

async function seedLearner(server, accountId, learnerId) {
  const repos = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    authSession: server.authSessionFor(accountId),
  });
  await repos.hydrate();
  repos.learners.write({
    byId: {
      [learnerId]: {
        id: learnerId,
        name: 'Hero Test Learner',
        yearGroup: 'Y5',
        goal: 'sats',
        dailyMinutes: 15,
        avatarColor: '#3E6FA8',
        createdAt: 1,
      },
    },
    allIds: [learnerId],
    selectedId: learnerId,
  });
  await repos.flush();
  return repos;
}

function insertSpellingSubjectState(server, accountId, learnerId) {
  runSql(server, `
    INSERT INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
    VALUES (?, 'spelling', ?, ?, ?, ?)
  `, [
    learnerId,
    JSON.stringify({ phase: 'idle' }),
    JSON.stringify({ prefs: { mode: 'smart' } }),
    NOW,
    accountId,
  ]);
}

function insertLargeSpellingContentRow(server, accountId) {
  runSql(server, `
    INSERT INTO account_subject_content (account_id, subject_id, content_json, updated_at, updated_by_account_id)
    VALUES (?, 'spelling', ?, ?, ?)
  `, [
    accountId,
    JSON.stringify({ huge: 'x'.repeat(1_100_000) }),
    NOW,
    accountId,
  ]);
}

function guardAgainstHeroSpellingContentRead(server) {
  const originalPrepare = server.env.DB.prepare.bind(server.env.DB);
  server.env.DB.prepare = (sql) => {
    const normalised = String(sql || '').replace(/\s+/g, ' ').trim();
    if (/\baccount_subject_content\b/.test(normalised)) {
      throw new Error('Hero read-model paths must not read account_subject_content.');
    }
    return originalPrepare(sql);
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

test('hero read-model in-flight dedupe shares concurrent payloads without retaining resolved cache', async () => {
  __clearHeroReadModelInFlightForTests();
  const payload = {
    ok: true,
    hero: {
      version: 6,
      ui: { enabled: true },
    },
  };
  let resolveLoader;
  let loaderCalls = 0;
  const loaderGate = new Promise((resolve) => { resolveLoader = resolve; });
  const loadPayload = async () => {
    loaderCalls += 1;
    await loaderGate;
    return payload;
  };

  const first = __readHeroReadModelInFlightForTests({
    accountId: 'adult-a',
    learnerId: 'learner-a',
  }, loadPayload);
  const second = __readHeroReadModelInFlightForTests({
    accountId: 'adult-a',
    learnerId: 'learner-a',
  }, loadPayload);

  await Promise.resolve();
  assert.equal(loaderCalls, 1, 'same-key concurrent hero reads share one in-flight loader');
  assert.equal(__heroReadModelInFlightSizeForTests(), 1);
  resolveLoader();

  assert.strictEqual(await first, payload);
  assert.strictEqual(await second, payload);
  assert.equal(
    __heroReadModelInFlightSizeForTests(),
    0,
    'resolved hero payloads are not retained as a stale cache',
  );
});

test('hero read-model: flag on + authenticated returns shadow read model', async () => {
  const server = createServerWithHeroFlag(true);
  await seedLearner(server, 'adult-a', 'learner-a');

  const response = await server.fetch(`${HERO_URL}?learnerId=learner-a`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.hero.mode, 'shadow');
  assert.equal(payload.hero.childVisible, false);
  assert.equal(payload.hero.coinsEnabled, false);
  assert.equal(payload.hero.writesEnabled, false);
  assert.equal(payload.hero.version, 3);
  assert.equal(typeof payload.hero.dateKey, 'string');
  assert.equal(payload.hero.timezone, 'Europe/London');
  assert.equal(payload.hero.schedulerVersion, 'hero-p2-child-ui-v1');

  server.close();
});

test('hero read-model avoids account spelling content rows', async () => {
  const server = createServerWithHeroFlag(true);
  try {
    await seedLearner(server, 'adult-a', 'learner-a');
    insertSpellingSubjectState(server, 'adult-a', 'learner-a');
    insertLargeSpellingContentRow(server, 'adult-a');
    guardAgainstHeroSpellingContentRead(server);

    const response = await server.fetch(`${HERO_URL}?learnerId=learner-a`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.hero.mode, 'shadow');
  } finally {
    server.close();
  }
});

test('hero read-model filters Camp from release metadata without reading the content snapshot', async () => {
  const server = createWorkerRepositoryServer({
    env: {
      HERO_MODE_SHADOW_ENABLED: 'true',
      HERO_MODE_PROGRESS_ENABLED: 'true',
      HERO_MODE_ECONOMY_ENABLED: 'true',
      HERO_MODE_CAMP_ENABLED: 'true',
    },
  });
  try {
    await seedLearner(server, 'adult-a', 'learner-a');
    const projection = buildContentOperationHeroExposureProjection({
      rewardTracks: [
        {
          id: 'hero-camp-glossbloom',
          poolId: 'core',
          monsterId: 'glossbloom',
          active: true,
          heroExposure: { state: 'hidden', surfaces: ['heroCamp'] },
        },
        {
          id: 'hero-camp-colisk',
          poolId: 'core',
          monsterId: 'colisk',
          active: true,
          heroExposure: { state: 'visible', surfaces: ['heroCamp'] },
        },
      ],
    });
    runSql(server, `
      INSERT INTO content_operation_releases (
        release_id, subject_id, status, snapshot_json, snapshot_hash,
        base_release_id, package_id, published_at, published_by_account_id,
        rollback_of_release_id, proof_json, created_at
      ) VALUES (?, 'spelling', 'published', ?, ?, NULL, NULL, ?, ?, NULL, ?, ?)
    `, [
      'corel-hero-exposure-projection',
      'x'.repeat(1_100_000),
      'release-hero-exposure-projection',
      NOW,
      'adult-a',
      JSON.stringify({ [CONTENT_OPERATION_HERO_EXPOSURE_PROOF_KEY]: projection }),
      NOW,
    ]);

    server.DB.clearQueryLog();
    const response = await server.fetch(`${HERO_URL}?learnerId=learner-a`);
    const payload = await response.json();
    const releaseQueries = server.DB.takeQueryLog()
      .filter((entry) => /\bcontent_operation_releases\b/i.test(entry.sql || ''));

    assert.equal(response.status, 200);
    assert.deepEqual(
      payload.hero.camp.monsters.map((monster) => monster.monsterId),
      ['colisk'],
    );
    assert.equal(releaseQueries.length, 1, 'Camp reads one compact release metadata row');
    assert.doesNotMatch(
      releaseQueries[0].sql,
      /\br\.snapshot_json\b/i,
      'Camp metadata lookup must project NULL instead of the content snapshot',
    );
  } finally {
    server.close();
  }
});

test('hero read-model: flag on returns eligibleSubjects and lockedSubjects arrays', async () => {
  const server = createServerWithHeroFlag(true);
  await seedLearner(server, 'adult-a', 'learner-a');

  const response = await server.fetch(`${HERO_URL}?learnerId=learner-a`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(payload.hero.eligibleSubjects));
  assert.ok(Array.isArray(payload.hero.lockedSubjects));

  // With no subject state written, providers return unavailable, so
  // ready subjects can still appear locked until their subject state exists.
  // Reasoning remains the only placeholder subject.
  const lockedIds = payload.hero.lockedSubjects.map((s) => s.subjectId);
  assert.ok(lockedIds.includes('arithmetic'));
  assert.ok(lockedIds.includes('reasoning'));
  assert.ok(lockedIds.includes('reading'));

  // Each entry has subjectId and reason
  for (const entry of payload.hero.lockedSubjects) {
    assert.equal(typeof entry.subjectId, 'string');
    assert.equal(typeof entry.reason, 'string');
  }
  for (const entry of payload.hero.eligibleSubjects) {
    assert.equal(typeof entry.subjectId, 'string');
    assert.equal(typeof entry.reason, 'string');
  }

  server.close();
});

test('hero read-model: flag on returns dailyQuest with tasks and strips debug over HTTP', async () => {
  const server = createServerWithHeroFlag(true);
  await seedLearner(server, 'adult-a', 'learner-a');

  const response = await server.fetch(`${HERO_URL}?learnerId=learner-a`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  const quest = payload.hero.dailyQuest;
  assert.equal(typeof quest.questId, 'string');
  assert.ok(quest.questId.startsWith('hero-quest-'));
  assert.equal(quest.status, 'shadow');
  assert.equal(typeof quest.effortTarget, 'number');
  assert.equal(typeof quest.effortPlanned, 'number');
  assert.ok(Array.isArray(quest.tasks));

  assert.equal('debug' in payload.hero, false);

  server.close();
});

test('hero read-model: flag off returns 404 with code hero_shadow_disabled', async () => {
  const server = createServerWithHeroFlag(false);
  await seedLearner(server, 'adult-a', 'learner-a');

  const response = await server.fetch(`${HERO_URL}?learnerId=learner-a`);
  const payload = await response.json();

  assert.equal(response.status, 404);
  assert.equal(payload.code, 'hero_shadow_disabled');

  server.close();
});

test('hero read-model: unauthenticated request returns 401', async () => {
  const server = createServerWithHeroFlag(true);

  const response = await server.fetchRaw(HERO_URL);
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.code, 'unauthenticated');

  server.close();
});

test('hero read-model: cross-account learner access returns 403', async () => {
  const server = createServerWithHeroFlag(true);
  // adult-a owns learner-a
  await seedLearner(server, 'adult-a', 'learner-a');

  // adult-b tries to read learner-a's hero read model
  const nowTs = Date.now();
  server.DB.db.exec(`
    INSERT OR IGNORE INTO adult_accounts (id, email, display_name, created_at, updated_at, repo_revision)
    VALUES ('adult-b', 'b@example.test', 'Adult B', ${nowTs}, ${nowTs}, 0)
  `);

  const response = await server.fetchAs(
    'adult-b',
    `${HERO_URL}?learnerId=learner-a`,
  );
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.code, 'forbidden');

  server.close();
});

test('hero read-model: repeated calls do not change repo_revision', async () => {
  const server = createServerWithHeroFlag(true);
  await seedLearner(server, 'adult-a', 'learner-a');

  // Read the current repo_revision
  const revBefore = server.DB.db.prepare(
    "SELECT repo_revision FROM adult_accounts WHERE id = 'adult-a'",
  ).get()?.repo_revision;

  // Call the hero read-model route twice
  await server.fetch(`${HERO_URL}?learnerId=learner-a`);
  await server.fetch(`${HERO_URL}?learnerId=learner-a`);

  const revAfter = server.DB.db.prepare(
    "SELECT repo_revision FROM adult_accounts WHERE id = 'adult-a'",
  ).get()?.repo_revision;

  assert.equal(revBefore, revAfter, 'repo_revision must not change from read-only hero route');

  server.close();
});

test('hero read-model: repeated calls do not create mutation_receipts', async () => {
  const server = createServerWithHeroFlag(true);
  await seedLearner(server, 'adult-a', 'learner-a');

  const countBefore = server.DB.db.prepare(
    'SELECT COUNT(*) AS count FROM mutation_receipts',
  ).get()?.count;

  await server.fetch(`${HERO_URL}?learnerId=learner-a`);
  await server.fetch(`${HERO_URL}?learnerId=learner-a`);

  const countAfter = server.DB.db.prepare(
    'SELECT COUNT(*) AS count FROM mutation_receipts',
  ).get()?.count;

  assert.equal(countBefore, countAfter, 'mutation_receipts must not grow from read-only hero route');

  server.close();
});
