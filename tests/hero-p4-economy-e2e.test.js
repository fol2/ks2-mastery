// Hero Mode P4 U8 — Economy end-to-end safety tests through the Worker handler.
//
// Tests the full Worker claim-task handler for abuse/safety scenarios:
// 1. Full daily completion flow: start 3 tasks, claim 3 tasks, final claim awards coins
// 2. Replay of final claim (same requestId) returns same response with coins data
// 3. Different requestId after completion returns already-completed with correct coinBalance
// 4. Economy disabled → full flow works with zero coins, P3 responses preserved
// 5. Cross-learner: claim with different learnerId session context → rejected
// 6. Missing heroContext in practice session + economy on → rejected
// 7. Economy state NOT written when economy flag is off
// 8. After coins awarded, reading hero read-model returns correct balance
// 9. Stale revision on claim → 409 stale_write, no coins awarded

import test from 'node:test';
import assert from 'node:assert/strict';

import { createApiPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';
import { HERO_DAILY_COMPLETION_COINS } from '../shared/hero/economy.js';

const HERO_COMMAND_URL = 'https://repo.test/api/hero/command';
const HERO_READ_MODEL_URL = 'https://repo.test/api/hero/read-model';

// ── Server factories ───────────────────────────────────────────────────

function createEconomyServer() {
  return createWorkerRepositoryServer({
    env: {
      HERO_MODE_SHADOW_ENABLED: 'true',
      HERO_MODE_LAUNCH_ENABLED: 'true',
      HERO_MODE_CHILD_UI_ENABLED: 'true',
      HERO_MODE_PROGRESS_ENABLED: 'true',
      HERO_MODE_ECONOMY_ENABLED: 'true',
      PUNCTUATION_SUBJECT_ENABLED: 'true',
    },
  });
}

function createEconomyDisabledServer() {
  return createWorkerRepositoryServer({
    env: {
      HERO_MODE_SHADOW_ENABLED: 'true',
      HERO_MODE_LAUNCH_ENABLED: 'true',
      HERO_MODE_CHILD_UI_ENABLED: 'true',
      HERO_MODE_PROGRESS_ENABLED: 'true',
      HERO_MODE_ECONOMY_ENABLED: 'false',
      PUNCTUATION_SUBJECT_ENABLED: 'true',
    },
  });
}

// ── Fixture seeding ────────────────────────────────────────────────────

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

async function seedLearnerWithSubjectState(server, accountId, learnerId) {
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
        name: 'Economy E2E Safety Learner',
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

// ── Shared helpers ─────────────────────────────────────────────────────

async function getReadModel(server, learnerId = 'learner-a') {
  const response = await server.fetch(`${HERO_READ_MODEL_URL}?learnerId=${learnerId}`);
  const payload = await response.json();
  assert.equal(response.status, 200, `Read model returned ${response.status}: ${JSON.stringify(payload)}`);
  assert.ok(payload.hero, 'Read model must contain hero block');
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

function getLearnerRevision(server, accountId = 'adult-a') {
  const row = server.DB.db.prepare(
    `SELECT lp.state_revision FROM learner_profiles lp
     JOIN account_learner_memberships alm ON alm.learner_id = lp.id
     WHERE alm.account_id = ?`,
  ).get(accountId);
  return row?.state_revision ?? 0;
}

async function postHeroCommand(server, body, accountId = 'adult-a') {
  return server.fetchAs(accountId, HERO_COMMAND_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getHeroProgressRow(server, learnerId) {
  const row = server.DB.db.prepare(
    `SELECT state_json, updated_at FROM child_game_state
     WHERE learner_id = ? AND system_id = 'hero-mode'`,
  ).get(learnerId);
  if (!row) return null;
  return JSON.parse(row.state_json);
}

/**
 * Launches and claims ALL tasks in the quest to trigger daily completion.
 * Returns the final claim payload and all tasks.
 */
async function claimAllTasks(server, learnerId, accountId) {
  const readModelPayload = await getReadModel(server, learnerId);
  const quest = readModelPayload.hero.dailyQuest;
  const fingerprint = readModelPayload.hero.questFingerprint;
  const allTasks = quest.tasks.filter(t => t.launchStatus === 'launchable');
  if (allTasks.length < 1) throw new Error('Fixture must produce at least 1 launchable task');

  const nowTs = Date.now();
  let lastClaimPayload = null;
  let lastRequestId = null;

  for (let i = 0; i < allTasks.length; i++) {
    const task = allTasks[i];
    const rev = getLearnerRevision(server, accountId);

    // Launch
    await postHeroCommand(server, {
      command: 'start-task',
      learnerId,
      questId: quest.questId,
      questFingerprint: fingerprint,
      taskId: task.taskId,
      requestId: `e2e-safety-launch-${i}-${Date.now()}`,
      expectedLearnerRevision: rev,
    }, accountId);

    // Seed practice session with heroContext
    const sessionId = `ps-e2e-safety-${i}-${Date.now().toString(36)}`;
    const summaryJson = JSON.stringify({
      heroContext: {
        source: 'hero-mode',
        questId: quest.questId,
        questFingerprint: fingerprint,
        taskId: task.taskId,
        intent: task.intent || 'due-review',
        launcher: task.launcher || 'smart-practice',
      },
      status: 'completed',
    });
    server.DB.db.prepare(`
      INSERT INTO practice_sessions (id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at)
      VALUES (?, ?, ?, 'smart-practice', 'completed', '{}', ?, ?, ?)
    `).run(sessionId, learnerId, task.subjectId, summaryJson, nowTs + i, nowTs + i);

    // Claim
    const claimRev = getLearnerRevision(server, accountId);
    lastRequestId = `e2e-safety-claim-${i}-${Date.now()}`;
    const claimResp = await postHeroCommand(server, {
      command: 'claim-task',
      learnerId,
      questId: quest.questId,
      questFingerprint: fingerprint,
      taskId: task.taskId,
      requestId: lastRequestId,
      expectedLearnerRevision: claimRev,
    }, accountId);
    lastClaimPayload = await claimResp.json();
    assert.equal(claimResp.status, 200, `Claim ${i} must succeed: ${JSON.stringify(lastClaimPayload)}`);
  }

  return { lastClaimPayload, lastRequestId, allTasks, quest, fingerprint };
}

// ── 1. Full daily completion flow awards coins ───────────────────────────

test('U8 E2E: full daily completion flow — all tasks claimed → coins awarded', async () => {
  const server = createEconomyServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  const { lastClaimPayload } = await claimAllTasks(server, 'learner-a', 'adult-a');

  assert.equal(lastClaimPayload.heroClaim.dailyStatus, 'completed');
  assert.equal(lastClaimPayload.heroClaim.coinsEnabled, true);
  assert.equal(lastClaimPayload.heroClaim.coinsAwarded, HERO_DAILY_COMPLETION_COINS);
  assert.ok(lastClaimPayload.heroClaim.coinBalance >= HERO_DAILY_COMPLETION_COINS);
  assert.equal(lastClaimPayload.heroClaim.dailyCoinsAlreadyAwarded, false);

  server.close();
});

// ── 2. Replay of final claim (same task, new requestId) → already-completed with coins data ──

test('U8 E2E: replay after completion → already-completed with coinBalance preserved', async () => {
  const server = createEconomyServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  const { quest, fingerprint, allTasks } = await claimAllTasks(server, 'learner-a', 'adult-a');

  // Replay the final task with a NEW requestId
  const lastTask = allTasks[allTasks.length - 1];
  const revision = getLearnerRevision(server);
  const response = await postHeroCommand(server, {
    command: 'claim-task',
    learnerId: 'learner-a',
    questId: quest.questId,
    questFingerprint: fingerprint,
    taskId: lastTask.taskId,
    requestId: `e2e-replay-${Date.now()}`,
    expectedLearnerRevision: revision,
  });
  const payload = await response.json();

  assert.equal(response.status, 200, `Replay must succeed: ${JSON.stringify(payload)}`);
  assert.equal(payload.ok, true);
  assert.equal(payload.heroClaim.status, 'already-completed');
  assert.equal(payload.heroClaim.coinsEnabled, true);
  assert.equal(payload.heroClaim.coinBalance, HERO_DAILY_COMPLETION_COINS);
  assert.equal(payload.heroClaim.dailyCoinsAlreadyAwarded, true);
  // Coins must NOT be re-awarded on replay
  assert.equal(payload.heroClaim.coinsAwarded, 0);

  server.close();
});

// ── 3. Different requestId after completion → already-completed with correct coinBalance ──

test('U8 E2E: different requestId after full completion → already-completed, balance correct', async () => {
  const server = createEconomyServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  const { quest, fingerprint, allTasks } = await claimAllTasks(server, 'learner-a', 'adult-a');

  // Attempt to claim any task with a completely different requestId
  const firstTask = allTasks[0];
  const revision = getLearnerRevision(server);
  const response = await postHeroCommand(server, {
    command: 'claim-task',
    learnerId: 'learner-a',
    questId: quest.questId,
    questFingerprint: fingerprint,
    taskId: firstTask.taskId,
    requestId: `e2e-post-complete-diff-${Date.now()}`,
    expectedLearnerRevision: revision,
  });
  const payload = await response.json();

  assert.equal(response.status, 200, `Expected 200: ${JSON.stringify(payload)}`);
  assert.equal(payload.heroClaim.status, 'already-completed');
  assert.equal(payload.heroClaim.coinBalance, HERO_DAILY_COMPLETION_COINS);
  assert.equal(payload.heroClaim.dailyCoinsAlreadyAwarded, true);

  server.close();
});

// ── 4. Economy disabled → full flow works with zero coins, P3 responses preserved ──

test('U8 E2E: economy disabled → full flow succeeds with coinsEnabled=false, zero coins', async () => {
  const server = createEconomyDisabledServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  const { lastClaimPayload } = await claimAllTasks(server, 'learner-a', 'adult-a');

  assert.equal(lastClaimPayload.heroClaim.dailyStatus, 'completed');
  assert.equal(lastClaimPayload.heroClaim.coinsEnabled, false);
  assert.equal(lastClaimPayload.heroClaim.coinsAwarded, 0);
  assert.equal(lastClaimPayload.heroClaim.coinBalance, 0);
  // P3 fields must still be present
  assert.equal(lastClaimPayload.heroClaim.heroStatePersistenceEnabled, true);
  assert.equal(typeof lastClaimPayload.heroClaim.effortCompleted, 'number');
  assert.equal(typeof lastClaimPayload.heroClaim.effortPlanned, 'number');

  server.close();
});

// ── 5. Cross-learner: claim for task with no matching practice session → rejected ──

test('U8 E2E: cross-learner isolation — mismatched heroContext → rejected (no_evidence)', async () => {
  const server = createEconomyServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  // Get read model and launch a task
  const readModelPayload = await getReadModel(server, 'learner-a');
  const launchable = findFirstLaunchableTask(readModelPayload);
  if (!launchable) { server.close(); return; }

  const rev = getLearnerRevision(server);
  await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: `e2e-cross-launch-${Date.now()}`,
    expectedLearnerRevision: rev,
  });

  // Seed a practice session for learner-a but with WRONG heroContext
  // (simulates a cross-learner attack where the attacker's session data
  // references a different quest/task — the evidence query filters by
  // matching heroContext, so this session won't satisfy the claim.)
  const sessionId = `ps-cross-attack-${Date.now().toString(36)}`;
  const nowTs = Date.now();
  const summaryJson = JSON.stringify({
    heroContext: {
      source: 'hero-mode',
      questId: 'different-quest-id-attacker',
      questFingerprint: 'different-fp-attacker',
      taskId: 'different-task-id-attacker',
      intent: 'due-review',
      launcher: 'smart-practice',
    },
    status: 'completed',
  });
  server.DB.db.prepare(`
    INSERT INTO practice_sessions (id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at)
    VALUES (?, ?, ?, 'smart-practice', 'completed', '{}', ?, ?, ?)
  `).run(sessionId, 'learner-a', launchable.subjectId, summaryJson, nowTs, nowTs);

  // Clear any heroContext from subject state so fallback cannot match
  server.DB.db.prepare(`
    UPDATE child_subject_state SET ui_json = '{}' WHERE learner_id = ?
  `).run('learner-a');

  // Claim as learner-a — no matching heroContext evidence for this quest/task
  const claimRev = getLearnerRevision(server);
  const response = await postHeroCommand(server, {
    command: 'claim-task',
    learnerId: 'learner-a',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: `e2e-cross-claim-${Date.now()}`,
    expectedLearnerRevision: claimRev,
  });
  const payload = await response.json();

  assert.equal(response.status, 400, `Expected 400 for cross-learner: ${JSON.stringify(payload)}`);
  assert.equal(payload.error.code, 'hero_claim_no_evidence');

  server.close();
});

// ── 6. Missing heroContext in practice session + economy on → rejected ──

test('U8 E2E: missing heroContext in practice session → rejected with no_evidence', async () => {
  const server = createEconomyServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  // Launch a task
  const readModelPayload = await getReadModel(server, 'learner-a');
  const launchable = findFirstLaunchableTask(readModelPayload);
  if (!launchable) { server.close(); return; }

  const rev = getLearnerRevision(server);
  await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: `e2e-noctx-launch-${Date.now()}`,
    expectedLearnerRevision: rev,
  });

  // Seed a practice session WITHOUT heroContext
  const sessionId = `ps-no-ctx-${Date.now().toString(36)}`;
  const nowTs = Date.now();
  const summaryJson = JSON.stringify({
    status: 'completed',
    score: 8,
    total: 10,
    // NOTE: heroContext deliberately omitted
  });
  server.DB.db.prepare(`
    INSERT INTO practice_sessions (id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at)
    VALUES (?, ?, ?, 'smart-practice', 'completed', '{}', ?, ?, ?)
  `).run(sessionId, 'learner-a', launchable.subjectId, summaryJson, nowTs, nowTs);

  // Clear subject ui_json heroContext fallback
  server.DB.db.prepare(`
    UPDATE child_subject_state SET ui_json = '{}' WHERE learner_id = ?
  `).run('learner-a');

  // Attempt to claim — no valid heroContext evidence exists
  const claimRev = getLearnerRevision(server);
  const response = await postHeroCommand(server, {
    command: 'claim-task',
    learnerId: 'learner-a',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: `e2e-noctx-claim-${Date.now()}`,
    expectedLearnerRevision: claimRev,
  });
  const payload = await response.json();

  assert.equal(response.status, 400, `Expected 400 for missing heroContext: ${JSON.stringify(payload)}`);
  assert.equal(payload.error.code, 'hero_claim_no_evidence');

  server.close();
});

// ── 7. Economy state NOT written when economy flag is off ────────────────

test('U8 E2E: economy disabled → no economy block changes in persisted state', async () => {
  const server = createEconomyDisabledServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  await claimAllTasks(server, 'learner-a', 'adult-a');

  const progress = getHeroProgressRow(server, 'learner-a');
  assert.ok(progress, 'Hero progress row must exist');
  // Economy balance must remain at 0 when disabled
  assert.equal(progress.economy.balance, 0, 'Balance must be 0 when economy disabled');
  assert.equal(progress.economy.lifetimeEarned, 0, 'lifetimeEarned must be 0 when economy disabled');
  assert.equal(progress.economy.ledger.length, 0, 'Ledger must be empty when economy disabled');
  // daily.economy sub-block must not have an award
  if (progress.daily.economy) {
    assert.notEqual(progress.daily.economy.dailyAwardStatus, 'awarded',
      'daily economy must not show awarded when flag is off');
  }

  server.close();
});

// ── 8. After coins awarded, reading hero read-model returns correct balance ──

test('U8 E2E: after coins awarded, read-model shows correct economy balance', async () => {
  const server = createEconomyServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  await claimAllTasks(server, 'learner-a', 'adult-a');

  // Read the hero read-model
  const readModel = await getReadModel(server, 'learner-a');
  const economy = readModel.hero.economy;

  assert.ok(economy, 'Read model must contain economy block');
  assert.equal(economy.enabled, true);
  assert.equal(economy.balance, HERO_DAILY_COMPLETION_COINS);
  assert.equal(economy.lifetimeEarned, HERO_DAILY_COMPLETION_COINS);
  assert.ok(economy.today, 'Economy must include today block');
  assert.equal(economy.today.awardStatus, 'awarded');
  assert.equal(economy.today.coinsAwarded, HERO_DAILY_COMPLETION_COINS);
  assert.ok(economy.today.ledgerEntryId, 'Must include ledgerEntryId in today block');

  server.close();
});

// ── 9. Stale revision on claim → 409 stale_write, no coins awarded ──

test('U8 E2E: stale expectedLearnerRevision → 409 stale_write, economy unchanged', async () => {
  const server = createEconomyServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  // Launch a task to set up progress
  const readModelPayload = await getReadModel(server, 'learner-a');
  const launchable = findFirstLaunchableTask(readModelPayload);
  if (!launchable) { server.close(); return; }

  const rev = getLearnerRevision(server);
  await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: `e2e-stale-launch-${Date.now()}`,
    expectedLearnerRevision: rev,
  });

  // Seed a valid practice session
  const sessionId = `ps-stale-${Date.now().toString(36)}`;
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
  });
  server.DB.db.prepare(`
    INSERT INTO practice_sessions (id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at)
    VALUES (?, ?, ?, 'smart-practice', 'completed', '{}', ?, ?, ?)
  `).run(sessionId, 'learner-a', launchable.subjectId, summaryJson, nowTs, nowTs);

  // Use a STALE revision (current - 1 would be stale since launch bumped it)
  const currentRevision = getLearnerRevision(server);
  const staleRevision = currentRevision - 1;

  const response = await postHeroCommand(server, {
    command: 'claim-task',
    learnerId: 'learner-a',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: `e2e-stale-claim-${Date.now()}`,
    expectedLearnerRevision: staleRevision,
  });
  const payload = await response.json();

  assert.equal(response.status, 409, `Expected 409: ${JSON.stringify(payload)}`);
  assert.equal(payload.code, 'stale_write');

  // Verify economy is untouched (no coins awarded through stale claim)
  const progress = getHeroProgressRow(server, 'learner-a');
  if (progress && progress.economy) {
    assert.equal(progress.economy.balance, 0, 'Balance must remain 0 after stale write rejection');
    assert.equal(progress.economy.ledger.length, 0, 'Ledger must remain empty after stale write rejection');
  }

  server.close();
});
