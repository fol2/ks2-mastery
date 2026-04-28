import test from 'node:test';
import assert from 'node:assert/strict';

import { createApiPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

// ── Helpers ────────────────────────────────────────────────────────────

const HERO_URL = 'https://repo.test/api/hero/read-model';

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

// ── Tests ──────────────────────────────────────────────────────────────

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

test('hero read-model: flag on returns eligibleSubjects and lockedSubjects arrays', async () => {
  const server = createServerWithHeroFlag(true);
  await seedLearner(server, 'adult-a', 'learner-a');

  const response = await server.fetch(`${HERO_URL}?learnerId=learner-a`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(payload.hero.eligibleSubjects));
  assert.ok(Array.isArray(payload.hero.lockedSubjects));

  // With no subject state written, providers return unavailable, so
  // all ready subjects end up locked. The three placeholder subjects
  // (arithmetic, reasoning, reading) are always locked.
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

test('hero read-model: flag on returns dailyQuest with tasks, effort, debug', async () => {
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

  // Debug object
  const debug = payload.hero.debug;
  assert.equal(typeof debug.candidateCount, 'number');
  assert.ok(Array.isArray(debug.rejectedCandidates));
  assert.equal(typeof debug.subjectMix, 'object');
  assert.equal(typeof debug.safety, 'object');
  assert.equal(debug.safety.noWrites, true);
  assert.equal(debug.safety.noCoins, true);
  assert.equal(debug.safety.noChildUi, true);
  assert.equal(debug.safety.noSubjectMutation, true);

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
