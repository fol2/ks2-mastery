// Hero Mode P1 — Launch boundary tests.
//
// Structural tests (S-L1 to S-L5) prove that P1 launch code does not
// import subject runtime, subject engines, or economy vocabulary, and
// that client src/ does not import launch internals.
//
// Behavioural tests (B-L1, B-L2) prove that a successful Hero launch
// writes only through the existing subject command path (mutation_receipts
// increases) and creates no hero.* event_log entries.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApiPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

// ── Helpers ──────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

function collectJsFiles(dir) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(full);
    }
  }
  return results;
}

function stripComments(source) {
  return source
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

const SHARED_HERO_DIR = path.join(REPO_ROOT, 'shared', 'hero');
const WORKER_HERO_DIR = path.join(REPO_ROOT, 'worker', 'src', 'hero');
const LAUNCH_ADAPTERS_DIR = path.join(WORKER_HERO_DIR, 'launch-adapters');
const CLIENT_SRC_DIR = path.join(REPO_ROOT, 'src');

const HERO_COMMAND_URL = 'https://repo.test/api/hero/command';
const HERO_READ_MODEL_URL = 'https://repo.test/api/hero/read-model';

// ── Structural test S-L1 ────────────────────────────────────────────

test('S-L1: worker/src/hero/launch.js does not import createWorkerSubjectRuntime or subjects/runtime', () => {
  const launchPath = path.join(WORKER_HERO_DIR, 'launch.js');
  const source = stripComments(fs.readFileSync(launchPath, 'utf8'));

  assert.ok(
    !source.includes('createWorkerSubjectRuntime'),
    'launch.js imports createWorkerSubjectRuntime — launch must not own subject dispatch',
  );
  assert.ok(
    !source.includes('subjects/runtime'),
    'launch.js imports from subjects/runtime — launch must not depend on subject runtime',
  );
});

// ── Structural test S-L2 ────────────────────────────────────────────

test('S-L2: no file in worker/src/hero/launch-adapters/ imports subjects/runtime or subject engine modules', () => {
  const adapterFiles = collectJsFiles(LAUNCH_ADAPTERS_DIR);
  assert.ok(adapterFiles.length > 0, 'Expected at least one launch adapter file');

  const FORBIDDEN_IMPORTS = [
    'subjects/runtime',
    'subjects/spelling/engine',
    'subjects/grammar/engine',
    'subjects/punctuation/engine',
  ];

  for (const filePath of adapterFiles) {
    const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
    const source = stripComments(fs.readFileSync(filePath, 'utf8'));

    for (const token of FORBIDDEN_IMPORTS) {
      assert.ok(
        !source.includes(token),
        `${rel} imports ${token} — launch adapters must be pure mappers with no subject engine dependency`,
      );
    }
  }
});

// ── Structural test S-L3 ────────────────────────────────────────────

test('S-L3: no file in shared/hero/ imports subjects/runtime', () => {
  const sharedFiles = collectJsFiles(SHARED_HERO_DIR);
  assert.ok(sharedFiles.length > 0, 'Expected at least one shared/hero/ file');

  for (const filePath of sharedFiles) {
    const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
    const source = stripComments(fs.readFileSync(filePath, 'utf8'));

    assert.ok(
      !source.includes('subjects/runtime'),
      `${rel} imports from subjects/runtime — shared/hero must not depend on subject runtime`,
    );
  }
});

// ── Structural test S-L4 ────────────────────────────────────────────

test('S-L4: no Hero source file contains economy vocabulary tokens', () => {
  const ECONOMY_TOKENS = [
    /\bcoin\b/i,
    /\bshop\b/i,
    /\bdeal\b/i,
    /\bloot\b/i,
    /streak\s+loss/i,
  ];

  // hero-copy.js is the canonical source-of-truth for the forbidden vocabulary
  // list. It *defines* the ban tokens (HERO_FORBIDDEN_VOCABULARY) but does not
  // use them in child-facing copy. Exclude it from the token scan.
  // claim-contract.js, claim-resolver.js: P3 claim architecture — economy-
  // adjacent terms are legitimate in the server-side reward/claim boundary.
  const EXCLUDED_BASENAMES = new Set(['hero-copy.js', 'claim-contract.js', 'claim-resolver.js']);

  const allHeroFiles = [
    ...collectJsFiles(SHARED_HERO_DIR),
    ...collectJsFiles(WORKER_HERO_DIR),
  ];

  for (const filePath of allHeroFiles) {
    const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
    if (EXCLUDED_BASENAMES.has(path.basename(filePath))) continue;
    const code = stripComments(fs.readFileSync(filePath, 'utf8'));

    for (const pattern of ECONOMY_TOKENS) {
      assert.ok(
        !pattern.test(code),
        `${rel} contains economy token matching ${pattern} — Hero code must not contain reward/economy vocabulary`,
      );
    }
  }
});

// ── Structural test S-L5 ────────────────────────────────────────────

test('S-L5: no client src/ file imports from shared/hero/launch-context, launch-status, or worker/src/hero/launch-adapters', () => {
  const clientFiles = collectJsFiles(CLIENT_SRC_DIR).filter(
    (f) => f.endsWith('.js') || f.endsWith('.jsx'),
  );

  const FORBIDDEN_IMPORT_FRAGMENTS = [
    'shared/hero/launch-context',
    'shared/hero/launch-status',
    'worker/src/hero/launch-adapters',
    'worker/src/hero/launch',
  ];

  for (const filePath of clientFiles) {
    const source = fs.readFileSync(filePath, 'utf8');
    const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');

    for (const fragment of FORBIDDEN_IMPORT_FRAGMENTS) {
      assert.ok(
        !source.includes(fragment),
        `${rel} imports from ${fragment} — P1 Hero launch internals must not be imported by client code`,
      );
    }
  }
});

// ── Behavioural helpers ─────────────────────────────────────────────

function createServerWithFlags({ shadow = true, launch = true, punctuation = true } = {}) {
  return createWorkerRepositoryServer({
    env: {
      HERO_MODE_SHADOW_ENABLED: shadow ? 'true' : 'false',
      HERO_MODE_LAUNCH_ENABLED: launch ? 'true' : 'false',
      PUNCTUATION_SUBJECT_ENABLED: punctuation ? 'true' : 'false',
    },
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
        name: 'Boundary Test Learner',
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

  // Seed spelling subject state so the Hero scheduler produces launchable
  // tasks. Without stats the scheduler has no eligible subjects.
  const spellingData = {
    stats: {
      core: { total: 50, secure: 30, due: 10, fresh: 5, trouble: 5, attempts: 200, correct: 160, accuracy: 0.8 },
      all: { total: 50, secure: 30, due: 10, fresh: 5, trouble: 5, attempts: 200, correct: 160, accuracy: 0.8 },
    },
  };
  const now = Date.now();
  server.DB.db.prepare(`
    INSERT INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
    VALUES (?, 'spelling', '{}', ?, ?, ?)
  `).run(learnerId, JSON.stringify(spellingData), now, accountId);

  return repos;
}

async function getFirstLaunchableTask(server, learnerId = 'learner-a') {
  const response = await server.fetch(`${HERO_READ_MODEL_URL}?learnerId=${learnerId}`);
  const payload = await response.json();
  if (response.status !== 200 || !payload.hero) return null;
  const quest = payload.hero.dailyQuest;
  if (!quest || !quest.tasks) return null;
  const task = quest.tasks.find((t) => t.launchStatus === 'launchable');
  if (!task) return null;
  return { questId: quest.questId, taskId: task.taskId, task };
}

function getLearnerRevision(server, accountId = 'adult-a') {
  const row = server.DB.db.prepare(
    `SELECT lp.state_revision FROM learner_profiles lp
     JOIN account_learner_memberships alm ON alm.learner_id = lp.id
     WHERE alm.account_id = ?`,
  ).get(accountId);
  return row?.state_revision ?? 0;
}

function countRows(server, tableName) {
  return server.DB.db.prepare(
    `SELECT COUNT(*) AS count FROM ${tableName}`,
  ).get()?.count ?? 0;
}

function countHeroEvents(server) {
  return server.DB.db.prepare(
    `SELECT COUNT(*) AS count FROM event_log WHERE event_type LIKE 'hero.%'`,
  ).get()?.count ?? 0;
}

// ── Behavioural test B-L1 ───────────────────────────────────────────

test('B-L1: after a successful Hero launch, mutation_receipts row count increases', async () => {
  const server = createServerWithFlags();
  await seedLearner(server, 'adult-a', 'learner-a');

  const launchable = await getFirstLaunchableTask(server);
  assert.ok(launchable, 'Fixture must produce at least one launchable task');

  const receiptsBefore = countRows(server, 'mutation_receipts');
  const revision = getLearnerRevision(server);

  const response = await server.fetchAs('adult-a', HERO_COMMAND_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      command: 'start-task',
      learnerId: 'learner-a',
      questId: launchable.questId,
      taskId: launchable.taskId,
      requestId: 'boundary-bl1',
      expectedLearnerRevision: revision,
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 200, `Expected 200, got ${response.status}: ${JSON.stringify(payload)}`);

  const receiptsAfter = countRows(server, 'mutation_receipts');
  assert.ok(
    receiptsAfter > receiptsBefore,
    `mutation_receipts did not increase after Hero launch — expected subject command path to write a receipt (before=${receiptsBefore}, after=${receiptsAfter})`,
  );

  server.close();
});

// ── Behavioural test B-L2 ───────────────────────────────────────────

test('B-L2: after a successful Hero launch, no hero.* event types exist in event_log', async () => {
  const server = createServerWithFlags();
  await seedLearner(server, 'adult-a', 'learner-a');

  const launchable = await getFirstLaunchableTask(server);
  assert.ok(launchable, 'Fixture must produce at least one launchable task');

  const revision = getLearnerRevision(server);

  const response = await server.fetchAs('adult-a', HERO_COMMAND_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      command: 'start-task',
      learnerId: 'learner-a',
      questId: launchable.questId,
      taskId: launchable.taskId,
      requestId: 'boundary-bl2',
      expectedLearnerRevision: revision,
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 200, `Expected 200, got ${response.status}: ${JSON.stringify(payload)}`);

  const heroEventCount = countHeroEvents(server);
  assert.equal(
    heroEventCount,
    0,
    `Found ${heroEventCount} hero.* event_log entries after Hero launch — Hero must not create hero-owned events`,
  );

  server.close();
});
