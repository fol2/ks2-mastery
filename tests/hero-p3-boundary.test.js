// Hero Mode P3 U12 — Boundary hardening tests.
//
// Structural boundaries proving P3 maintains architectural invariants:
//
// 1. shared/hero/ stays pure (no worker/, src/, or node: imports)
// 2. No child_subject_state write from Hero claim
// 3. No coins/monster/economy fields in persisted progress state
// 4. No economy vocabulary in child UI progress copy
// 5. Event log boundary (only hero.task.completed and hero.daily.completed)
// 6. P2→P3 boundary evolution (Hero writes only to child_game_state + mutation_receipts + event_log + learner_profiles)
// 7. No new D1 tables for Hero

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApiPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';
import { HERO_FORBIDDEN_VOCABULARY, HERO_PROGRESS_COPY } from '../shared/hero/hero-copy.js';

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
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.jsx'))) {
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
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'worker', 'migrations');

const SHARED_HERO_FILES = collectJsFiles(SHARED_HERO_DIR);

const HERO_COMMAND_URL = 'https://repo.test/api/hero/command';
const HERO_READ_MODEL_URL = 'https://repo.test/api/hero/read-model';

// ── Fixture data ──────────────────────────────────────────────────────

const HERO_SPELLING_DATA = {
  stats: {
    core: { total: 50, secure: 30, due: 10, fresh: 5, trouble: 5, attempts: 200, correct: 160, accuracy: 0.8 },
    all: { total: 50, secure: 30, due: 10, fresh: 5, trouble: 5, attempts: 200, correct: 160, accuracy: 0.8 },
  },
};

const HERO_PUNCTUATION_DATA = {
  availability: { status: 'ready' },
  stats: { total: 20, secure: 8, due: 5, fresh: 3, weak: 2, attempts: 100, correct: 75, accuracy: 75 },
};

// ── Server + seeding helpers ──────────────────────────────────────────

function createP3Server() {
  return createWorkerRepositoryServer({
    env: {
      HERO_MODE_SHADOW_ENABLED: 'true',
      HERO_MODE_LAUNCH_ENABLED: 'true',
      HERO_MODE_CHILD_UI_ENABLED: 'true',
      HERO_MODE_PROGRESS_ENABLED: 'true',
      PUNCTUATION_SUBJECT_ENABLED: 'true',
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

  const now = Date.now();
  server.DB.db.prepare(`
    INSERT INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
    VALUES (?, 'spelling', '{}', ?, ?, ?)
  `).run(learnerId, JSON.stringify(HERO_SPELLING_DATA), now, accountId);
  server.DB.db.prepare(`
    INSERT INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
    VALUES (?, 'punctuation', '{}', ?, ?, ?)
  `).run(learnerId, JSON.stringify(HERO_PUNCTUATION_DATA), now, accountId);

  return repos;
}

async function postHeroCommand(server, body, accountId = 'adult-a') {
  return server.fetchAs(accountId, HERO_COMMAND_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getLearnerRevision(server, accountId = 'adult-a') {
  const row = server.DB.db.prepare(
    `SELECT lp.state_revision FROM learner_profiles lp
     JOIN account_learner_memberships alm ON alm.learner_id = lp.id
     WHERE alm.account_id = ?`,
  ).get(accountId);
  return row?.state_revision ?? 0;
}

async function getReadModel(server, learnerId) {
  const response = await server.fetch(`${HERO_READ_MODEL_URL}?learnerId=${learnerId}`);
  const payload = await response.json();
  assert.equal(response.status, 200, `Read model returned ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

function findFirstLaunchableTask(heroPayload) {
  const quest = heroPayload.hero.dailyQuest;
  if (!quest || !quest.tasks) return null;
  const task = quest.tasks.find((t) => t.launchStatus === 'launchable');
  if (!task) return null;
  return {
    questId: quest.questId,
    questFingerprint: heroPayload.hero.questFingerprint,
    taskId: task.taskId,
    subjectId: task.subjectId,
    task,
  };
}

/**
 * Perform a full start -> complete -> claim cycle.
 */
async function performFullClaimCycle(server, learnerId, accountId) {
  const readModelPayload = await getReadModel(server, learnerId);
  const launchable = findFirstLaunchableTask(readModelPayload);
  if (!launchable) throw new Error('No launchable task for boundary test');

  const rev1 = getLearnerRevision(server, accountId);
  await postHeroCommand(server, {
    command: 'start-task',
    learnerId,
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: `boundary-launch-${Date.now().toString(36)}`,
    expectedLearnerRevision: rev1,
  }, accountId);

  // Seed completed practice session
  const sessionId = `ps-boundary-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const nowTs = Date.now();
  const summaryJson = JSON.stringify({
    heroContext: {
      source: 'hero-mode',
      questId: launchable.questId,
      questFingerprint: launchable.questFingerprint,
      taskId: launchable.taskId,
      intent: launchable.task.intent || 'due-review',
      launcher: launchable.task.launcher || 'smart-practice',
    },
    status: 'completed',
    score: 8,
    total: 10,
  });
  server.DB.db.prepare(`
    INSERT INTO practice_sessions (id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at)
    VALUES (?, ?, ?, 'smart-practice', 'completed', '{}', ?, ?, ?)
  `).run(sessionId, learnerId, launchable.subjectId, summaryJson, nowTs, nowTs);

  // Claim
  const rev2 = getLearnerRevision(server, accountId);
  const claimResp = await postHeroCommand(server, {
    command: 'claim-task',
    learnerId,
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: `boundary-claim-${Date.now().toString(36)}`,
    expectedLearnerRevision: rev2,
  }, accountId);
  const claimPayload = await claimResp.json();
  assert.equal(claimResp.status, 200, `Boundary claim must succeed: ${JSON.stringify(claimPayload)}`);
  return { launchable, claimPayload };
}

// ══════════════════════════════════════════════════════════════════════
// Boundary 1: shared/hero/ stays pure
// ══════════════════════════════════════════════════════════════════════

test('P3 Boundary 1: shared/hero/ has zero imports from worker/, src/, or node: modules', () => {
  assert.ok(SHARED_HERO_FILES.length > 0, 'Expected files in shared/hero/');

  const FORBIDDEN_IMPORT_PATTERNS = [
    /from\s+['"]\.\.\/worker\//,
    /from\s+['"]\.\.\/\.\.\/worker\//,
    /from\s+['"]\.\.\/src\//,
    /from\s+['"]\.\.\/\.\.\/src\//,
    /from\s+['"]worker\//,
    /from\s+['"]src\//,
    /from\s+['"]node:/,
    /require\s*\(\s*['"]node:/,
  ];

  for (const filePath of SHARED_HERO_FILES) {
    const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
    const code = stripComments(fs.readFileSync(filePath, 'utf8'));

    for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
      assert.ok(
        !pattern.test(code),
        `${rel} imports from a forbidden source (matched ${pattern}) — shared/hero/ must be pure`,
      );
    }
  }
});

// ══════════════════════════════════════════════════════════════════════
// Boundary 2: No child_subject_state write from Hero claim
// ══════════════════════════════════════════════════════════════════════

test('P3 Boundary 2: claim-task does NOT write to child_subject_state', async () => {
  const server = createP3Server();
  await seedLearner(server, 'adult-a', 'learner-b2');

  // Start a task first (this writes to child_subject_state as part of subject launch — that is allowed)
  const readModelPayload = await getReadModel(server, 'learner-b2');
  const launchable = findFirstLaunchableTask(readModelPayload);
  assert.ok(launchable, 'Must have a launchable task');

  const rev1 = getLearnerRevision(server, 'adult-a');
  await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-b2',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: 'boundary2-launch',
    expectedLearnerRevision: rev1,
  });

  // Seed completed practice session
  const sessionId = `ps-b2-${Date.now().toString(36)}`;
  const nowTs = Date.now();
  const summaryJson = JSON.stringify({
    heroContext: {
      source: 'hero-mode',
      questId: launchable.questId,
      questFingerprint: launchable.questFingerprint,
      taskId: launchable.taskId,
      intent: launchable.task.intent || 'due-review',
      launcher: launchable.task.launcher || 'smart-practice',
    },
    status: 'completed',
    score: 8,
    total: 10,
  });
  server.DB.db.prepare(`
    INSERT INTO practice_sessions (id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at)
    VALUES (?, ?, ?, 'smart-practice', 'completed', '{}', ?, ?, ?)
  `).run(sessionId, 'learner-b2', launchable.subjectId, summaryJson, nowTs, nowTs);

  // === Snapshot AFTER start-task but BEFORE claim ===
  const snapshotBeforeClaim = JSON.stringify(server.DB.db.prepare(
    `SELECT subject_id, ui_json, data_json, updated_at FROM child_subject_state WHERE learner_id = ? ORDER BY subject_id`,
  ).all('learner-b2'));

  // === Perform claim ===
  const rev2 = getLearnerRevision(server, 'adult-a');
  const claimResp = await postHeroCommand(server, {
    command: 'claim-task',
    learnerId: 'learner-b2',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: 'boundary2-claim',
    expectedLearnerRevision: rev2,
  });
  const claimPayload = await claimResp.json();
  assert.equal(claimResp.status, 200, `Claim must succeed: ${JSON.stringify(claimPayload)}`);

  // === Snapshot AFTER claim ===
  const snapshotAfterClaim = JSON.stringify(server.DB.db.prepare(
    `SELECT subject_id, ui_json, data_json, updated_at FROM child_subject_state WHERE learner_id = ? ORDER BY subject_id`,
  ).all('learner-b2'));

  // The claim must NOT have modified child_subject_state at all
  assert.equal(snapshotAfterClaim, snapshotBeforeClaim,
    'child_subject_state must not be modified by Hero claim (comparing post-start vs post-claim)');

  server.close();
});

// ══════════════════════════════════════════════════════════════════════
// Boundary 3: No coins/monster/economy fields in persisted progress state
// ══════════════════════════════════════════════════════════════════════

test('P3 Boundary 3: persisted hero progress state contains no economy/monster fields', async () => {
  const server = createP3Server();
  await seedLearner(server, 'adult-a', 'learner-b3');
  await performFullClaimCycle(server, 'learner-b3', 'adult-a');

  const row = server.DB.db.prepare(
    `SELECT state_json FROM child_game_state WHERE learner_id = ? AND system_id = 'hero-mode'`,
  ).get('learner-b3');
  assert.ok(row, 'child_game_state hero-mode row must exist after claim');

  const stateJson = row.state_json;
  const FORBIDDEN_FIELDS = [
    'coins',
    'coinBalance',
    'totalEarned',
    'totalSpent',
    'shop',
    'purchase',
    'monsterOwnership',
    'monsterStage',
    'monsterBranch',
    'streakReward',
  ];

  for (const field of FORBIDDEN_FIELDS) {
    assert.ok(
      !stateJson.includes(`"${field}"`),
      `Hero progress state_json contains forbidden economy field "${field}" — Hero Mode must not store economy state`,
    );
  }

  // Also verify the parsed object
  const state = JSON.parse(stateJson);
  for (const field of FORBIDDEN_FIELDS) {
    assert.equal(state[field], undefined, `Top-level field "${field}" must not exist`);
    if (state.daily) {
      assert.equal(state.daily[field], undefined, `daily.${field} must not exist`);
    }
  }

  server.close();
});

// ══════════════════════════════════════════════════════════════════════
// Boundary 4: No economy vocabulary in child UI progress copy
// ══════════════════════════════════════════════════════════════════════

test('P3 Boundary 4: HERO_PROGRESS_COPY contains no HERO_FORBIDDEN_VOCABULARY terms', () => {
  assert.ok(HERO_FORBIDDEN_VOCABULARY.length > 0, 'HERO_FORBIDDEN_VOCABULARY must be non-empty');
  assert.ok(Object.keys(HERO_PROGRESS_COPY).length > 0, 'HERO_PROGRESS_COPY must be non-empty');

  const patterns = HERO_FORBIDDEN_VOCABULARY.map((token) => ({
    token,
    regex: new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
  }));

  for (const [key, copyText] of Object.entries(HERO_PROGRESS_COPY)) {
    for (const { token, regex } of patterns) {
      assert.ok(
        !regex.test(copyText),
        `HERO_PROGRESS_COPY.${key} ("${copyText}") contains forbidden vocabulary "${token}" — child-facing progress copy must not use economy language`,
      );
    }
  }
});

// ══════════════════════════════════════════════════════════════════════
// Boundary 5: Event log boundary — only hero.task.completed and hero.daily.completed
// ══════════════════════════════════════════════════════════════════════

test('P3 Boundary 5: after claim, event_log contains only hero.task.completed or hero.daily.completed events', async () => {
  const server = createP3Server();
  await seedLearner(server, 'adult-a', 'learner-b5');
  await performFullClaimCycle(server, 'learner-b5', 'adult-a');

  const events = server.DB.db.prepare(
    `SELECT event_type FROM event_log WHERE event_type LIKE 'hero.%'`,
  ).all();

  const ALLOWED_EVENT_TYPES = new Set([
    'hero.task.completed',
    'hero.daily.completed',
  ]);

  const FORBIDDEN_EVENT_PATTERNS = [
    /^hero\.coins\./,
    /^hero\.monster\./,
    /^reward\.hero\./,
    /^hero\.shop\./,
    /^hero\.streak\./,
    /^hero\.purchase\./,
  ];

  for (const event of events) {
    // Must be in allowed set
    assert.ok(
      ALLOWED_EVENT_TYPES.has(event.event_type),
      `Unexpected hero event type "${event.event_type}" — only hero.task.completed and hero.daily.completed are permitted`,
    );

    // Must not match any forbidden pattern
    for (const pattern of FORBIDDEN_EVENT_PATTERNS) {
      assert.ok(
        !pattern.test(event.event_type),
        `Event type "${event.event_type}" matches forbidden pattern ${pattern}`,
      );
    }
  }

  server.close();
});

// ══════════════════════════════════════════════════════════════════════
// Boundary 6: P2→P3 boundary evolution — Hero writes ONLY to allowed tables
// ══════════════════════════════════════════════════════════════════════

test('P3 Boundary 6: Hero claim writes only to child_game_state + mutation_receipts + event_log + learner_profiles', async () => {
  const server = createP3Server();
  await seedLearner(server, 'adult-a', 'learner-b6');

  // Start a task first (this writes to child_subject_state as part of subject launch)
  const readModelPayload = await getReadModel(server, 'learner-b6');
  const launchable = findFirstLaunchableTask(readModelPayload);
  assert.ok(launchable, 'Must have a launchable task');

  const rev1 = getLearnerRevision(server, 'adult-a');
  await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-b6',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: 'boundary6-launch',
    expectedLearnerRevision: rev1,
  });

  // Seed completed practice session
  const sessionId = `ps-b6-${Date.now().toString(36)}`;
  const nowTs = Date.now();
  const summaryJson = JSON.stringify({
    heroContext: {
      source: 'hero-mode',
      questId: launchable.questId,
      questFingerprint: launchable.questFingerprint,
      taskId: launchable.taskId,
      intent: launchable.task.intent || 'due-review',
      launcher: launchable.task.launcher || 'smart-practice',
    },
    status: 'completed',
    score: 8,
    total: 10,
  });
  server.DB.db.prepare(`
    INSERT INTO practice_sessions (id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at)
    VALUES (?, ?, ?, 'smart-practice', 'completed', '{}', ?, ?, ?)
  `).run(sessionId, 'learner-b6', launchable.subjectId, summaryJson, nowTs, nowTs);

  // === Snapshot ALL relevant tables BEFORE claim ===
  const cssBeforeClaim = JSON.stringify(server.DB.db.prepare(
    `SELECT * FROM child_subject_state WHERE learner_id = 'learner-b6' ORDER BY subject_id`,
  ).all());
  const practiceSessionsBeforeClaim = JSON.stringify(server.DB.db.prepare(
    `SELECT id, status, summary_json FROM practice_sessions WHERE learner_id = 'learner-b6' ORDER BY id`,
  ).all());

  // Count before
  const heroGameStateBefore = server.DB.db.prepare(
    `SELECT COUNT(*) AS cnt FROM child_game_state WHERE learner_id = 'learner-b6' AND system_id = 'hero-mode'`,
  ).get().cnt;
  const receiptsBefore = server.DB.db.prepare(
    `SELECT COUNT(*) AS cnt FROM mutation_receipts`,
  ).get().cnt;
  const eventsBefore = server.DB.db.prepare(
    `SELECT COUNT(*) AS cnt FROM event_log WHERE event_type LIKE 'hero.%'`,
  ).get().cnt;
  const revisionBefore = getLearnerRevision(server, 'adult-a');

  // === Perform claim ===
  const rev2 = getLearnerRevision(server, 'adult-a');
  const claimResp = await postHeroCommand(server, {
    command: 'claim-task',
    learnerId: 'learner-b6',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: 'boundary6-claim',
    expectedLearnerRevision: rev2,
  });
  const claimPayload = await claimResp.json();
  assert.equal(claimResp.status, 200, `Claim must succeed: ${JSON.stringify(claimPayload)}`);

  // === Verify claim ONLY wrote to allowed tables ===

  // 1. child_game_state (hero-mode) — MUST have been written
  const heroGameStateAfter = server.DB.db.prepare(
    `SELECT COUNT(*) AS cnt FROM child_game_state WHERE learner_id = 'learner-b6' AND system_id = 'hero-mode'`,
  ).get().cnt;
  assert.ok(heroGameStateAfter >= heroGameStateBefore, 'child_game_state hero-mode row must exist');

  // 2. mutation_receipts — MUST have increased
  const receiptsAfter = server.DB.db.prepare(
    `SELECT COUNT(*) AS cnt FROM mutation_receipts`,
  ).get().cnt;
  assert.ok(receiptsAfter > receiptsBefore, 'mutation_receipts must increase');

  // 3. event_log (hero.* types) — MUST have increased
  const eventsAfter = server.DB.db.prepare(
    `SELECT COUNT(*) AS cnt FROM event_log WHERE event_type LIKE 'hero.%'`,
  ).get().cnt;
  assert.ok(eventsAfter > eventsBefore, 'event_log hero.* must increase');

  // 4. learner_profiles.state_revision — MUST have bumped
  const revisionAfter = getLearnerRevision(server, 'adult-a');
  assert.equal(revisionAfter, revisionBefore + 1, 'state_revision must bump by exactly 1');

  // === Verify FORBIDDEN tables are UNCHANGED ===

  // 5. child_subject_state — MUST NOT change from claim
  const cssAfterClaim = JSON.stringify(server.DB.db.prepare(
    `SELECT * FROM child_subject_state WHERE learner_id = 'learner-b6' ORDER BY subject_id`,
  ).all());
  assert.equal(cssAfterClaim, cssBeforeClaim,
    'child_subject_state must not be modified by Hero claim');

  // 6. practice_sessions — MUST NOT change from claim
  const practiceSessionsAfterClaim = JSON.stringify(server.DB.db.prepare(
    `SELECT id, status, summary_json FROM practice_sessions WHERE learner_id = 'learner-b6' ORDER BY id`,
  ).all());
  assert.equal(practiceSessionsAfterClaim, practiceSessionsBeforeClaim,
    'practice_sessions must not be modified by Hero claim');

  server.close();
});

// ══════════════════════════════════════════════════════════════════════
// Boundary 7: No new D1 tables for Hero Mode
// ══════════════════════════════════════════════════════════════════════

test('P3 Boundary 7: no D1 migration file creates hero-specific tables', () => {
  let migrationFiles;
  try {
    migrationFiles = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  } catch {
    // No migrations directory — pass
    return;
  }

  const HERO_TABLE_PATTERNS = [
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?hero_/i,
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?hero_quests?\b/i,
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?hero_tasks?\b/i,
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?hero_sessions?\b/i,
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?hero_launches?\b/i,
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?hero_state\b/i,
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?hero_progress\b/i,
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?hero_claims?\b/i,
  ];

  for (const fileName of migrationFiles) {
    const filePath = path.join(MIGRATIONS_DIR, fileName);
    const content = fs.readFileSync(filePath, 'utf8');

    for (const pattern of HERO_TABLE_PATTERNS) {
      assert.ok(
        !pattern.test(content),
        `Migration ${fileName} creates a hero-specific table (matched ${pattern}) — Hero Mode must reuse existing tables (child_game_state, event_log, mutation_receipts)`,
      );
    }
  }
});

// ══════════════════════════════════════════════════════════════════════
// Boundary 1b: shared/hero/ exports are pure functions (no side effects)
// ══════════════════════════════════════════════════════════════════════

test('P3 Boundary 1b: shared/hero/ files do not contain require(), process, or fetch calls', () => {
  for (const filePath of SHARED_HERO_FILES) {
    const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
    const code = stripComments(fs.readFileSync(filePath, 'utf8'));

    // No CommonJS require
    assert.ok(
      !/\brequire\s*\(/.test(code),
      `${rel} uses require() — shared/hero/ must use ES module imports only`,
    );

    // No process access
    assert.ok(
      !/\bprocess\./.test(code),
      `${rel} accesses process — shared/hero/ must not depend on Node.js process object`,
    );

    // No fetch (network calls)
    assert.ok(
      !/\bfetch\s*\(/.test(code),
      `${rel} calls fetch() — shared/hero/ must not make network requests`,
    );
  }
});

// ══════════════════════════════════════════════════════════════════════
// Boundary 3b: Progress state shape is economy-free at every level
// ══════════════════════════════════════════════════════════════════════

test('P3 Boundary 3b: deep inspection of progress state — all task entries are economy-free', async () => {
  const server = createP3Server();
  await seedLearner(server, 'adult-a', 'learner-b3b');
  await performFullClaimCycle(server, 'learner-b3b', 'adult-a');

  const row = server.DB.db.prepare(
    `SELECT state_json FROM child_game_state WHERE learner_id = ? AND system_id = 'hero-mode'`,
  ).get('learner-b3b');
  const state = JSON.parse(row.state_json);

  const ECONOMY_KEYS = new Set([
    'coins', 'coinBalance', 'totalEarned', 'totalSpent',
    'shop', 'purchase', 'monsterOwnership', 'monsterStage',
    'monsterBranch', 'streakReward', 'reward', 'loot',
    'streak', 'deal', 'treasure',
  ]);

  function assertNoEconomyKeys(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
      assert.ok(
        !ECONOMY_KEYS.has(key),
        `Economy key "${key}" found at ${path}.${key} in hero progress state`,
      );
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        assertNoEconomyKeys(obj[key], `${path}.${key}`);
      }
    }
  }

  assertNoEconomyKeys(state, 'root');

  server.close();
});
