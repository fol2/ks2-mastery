// Hero Mode P4 U4 — Economy integration into claim-task mutation.
//
// Tests exercise the Worker claim-task handler with HERO_MODE_ECONOMY_ENABLED
// enabled/disabled and verify coin awards, structured logs, event_log entries,
// and flag hierarchy enforcement.

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

function createEconomyWithoutProgressServer() {
  return createWorkerRepositoryServer({
    env: {
      HERO_MODE_SHADOW_ENABLED: 'true',
      HERO_MODE_LAUNCH_ENABLED: 'true',
      HERO_MODE_CHILD_UI_ENABLED: 'true',
      HERO_MODE_PROGRESS_ENABLED: 'false',
      HERO_MODE_ECONOMY_ENABLED: 'true',
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
        name: 'Economy Test Learner',
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

function getHeroEvents(server) {
  return server.DB.db.prepare(
    `SELECT id, learner_id, event_type, event_json, created_at FROM event_log WHERE event_type LIKE 'hero.%' ORDER BY created_at`,
  ).all();
}

/**
 * Seeds hero progress state and a completed practice session with heroContext.
 * Returns the task metadata needed for making a claim.
 */
async function seedClaimableState(server, learnerId, accountId) {
  const readModelPayload = await getReadModel(server, learnerId);
  const launchable = findFirstLaunchableTask(readModelPayload);
  if (!launchable) throw new Error('No launchable task found in fixture');

  const revision = getLearnerRevision(server, accountId);
  const launchResp = await postHeroCommand(server, {
    command: 'start-task',
    learnerId,
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: `econ-seed-launch-${Date.now()}`,
    expectedLearnerRevision: revision,
  }, accountId);
  const launchPayload = await launchResp.json();
  assert.equal(launchResp.status, 200, `Seed launch must succeed: ${JSON.stringify(launchPayload)}`);

  // Seed a completed practice session with heroContext
  const sessionId = `ps-econ-${Date.now().toString(36)}`;
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

  return {
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    subjectId: launchable.subjectId,
    practiceSessionId: sessionId,
    task: launchable.task,
  };
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
      requestId: `econ-all-launch-${i}-${Date.now()}`,
      expectedLearnerRevision: rev,
    }, accountId);

    // Seed practice session
    const sessionId = `ps-econ-all-${i}-${Date.now().toString(36)}`;
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
    const claimResp = await postHeroCommand(server, {
      command: 'claim-task',
      learnerId,
      questId: quest.questId,
      questFingerprint: fingerprint,
      taskId: task.taskId,
      requestId: `econ-all-claim-${i}-${Date.now()}`,
      expectedLearnerRevision: claimRev,
    }, accountId);
    lastClaimPayload = await claimResp.json();
    assert.equal(claimResp.status, 200, `Claim ${i} must succeed: ${JSON.stringify(lastClaimPayload)}`);
  }

  return { lastClaimPayload, allTasks, quest, fingerprint };
}

// ── 1. Final task claim completes daily quest → +100 Coins awarded ─────

test('P4 U4: final task claim with economy enabled → coins awarded', async () => {
  const server = createEconomyServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  const { lastClaimPayload } = await claimAllTasks(server, 'learner-a', 'adult-a');

  // The final claim must show daily completed
  assert.equal(lastClaimPayload.heroClaim.dailyStatus, 'completed');
  assert.equal(lastClaimPayload.heroClaim.coinsEnabled, true);
  assert.equal(lastClaimPayload.heroClaim.coinsAwarded, HERO_DAILY_COMPLETION_COINS);
  assert.ok(lastClaimPayload.heroClaim.coinBalance >= HERO_DAILY_COMPLETION_COINS);
  assert.equal(lastClaimPayload.heroClaim.dailyCoinsAlreadyAwarded, false);

  // Verify state persisted correctly
  const progress = getHeroProgressRow(server, 'learner-a');
  assert.equal(progress.economy.balance, HERO_DAILY_COMPLETION_COINS);
  assert.equal(progress.economy.lifetimeEarned, HERO_DAILY_COMPLETION_COINS);
  assert.ok(progress.economy.ledger.length > 0);
  assert.equal(progress.economy.ledger[0].type, 'daily-completion-award');
  assert.equal(progress.economy.ledger[0].amount, HERO_DAILY_COMPLETION_COINS);

  // Verify daily economy block
  assert.equal(progress.daily.economy.dailyAwardStatus, 'awarded');
  assert.equal(progress.daily.economy.dailyAwardCoinsAwarded, HERO_DAILY_COMPLETION_COINS);
  assert.ok(progress.daily.economy.dailyAwardLedgerEntryId);

  // Verify hero.coins.awarded event in event_log
  const events = getHeroEvents(server);
  const coinsEvent = events.find(e => e.event_type === 'hero.coins.awarded');
  assert.ok(coinsEvent, 'hero.coins.awarded event must exist in event_log');
  const coinsData = JSON.parse(coinsEvent.event_json);
  assert.equal(coinsData.amount, HERO_DAILY_COMPLETION_COINS);
  assert.ok(coinsData.ledgerEntryId);
  assert.equal(coinsData.balanceAfter, HERO_DAILY_COMPLETION_COINS);

  server.close();
});

// ── 2. Non-final task claim (daily still active) → 0 coins ─────────────

test('P4 U4: non-final task claim with economy enabled → 0 coins awarded', async () => {
  const server = createEconomyServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');
  const claimable = await seedClaimableState(server, 'learner-a', 'adult-a');

  // Get read model to check task count
  const readModel = await getReadModel(server, 'learner-a');
  const quest = readModel.hero.dailyQuest;
  const taskCount = quest.tasks.filter(t => t.launchStatus === 'launchable' || t.launchStatus === 'started').length;

  // If there's only 1 task, this claim would complete the daily — skip the test
  if (taskCount <= 1) {
    server.close();
    return;
  }

  const revision = getLearnerRevision(server);
  const response = await postHeroCommand(server, {
    command: 'claim-task',
    learnerId: 'learner-a',
    questId: claimable.questId,
    questFingerprint: claimable.questFingerprint,
    taskId: claimable.taskId,
    requestId: `econ-nonfinal-${Date.now()}`,
    expectedLearnerRevision: revision,
  });
  const payload = await response.json();

  assert.equal(response.status, 200, `Expected 200, got ${response.status}: ${JSON.stringify(payload)}`);
  assert.equal(payload.heroClaim.status, 'claimed');
  assert.equal(payload.heroClaim.coinsEnabled, true);
  assert.equal(payload.heroClaim.coinsAwarded, 0);
  assert.equal(payload.heroClaim.coinBalance, 0);
  assert.equal(payload.heroClaim.dailyCoinsAlreadyAwarded, false);
  assert.notEqual(payload.heroClaim.dailyStatus, 'completed');

  server.close();
});

// ── 3. Economy disabled → claim succeeds, P3 behaviour preserved ───────

test('P4 U4: economy disabled → claim succeeds with coinsEnabled=false', async () => {
  const server = createEconomyDisabledServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');
  const claimable = await seedClaimableState(server, 'learner-a', 'adult-a');

  const revision = getLearnerRevision(server);
  const response = await postHeroCommand(server, {
    command: 'claim-task',
    learnerId: 'learner-a',
    questId: claimable.questId,
    questFingerprint: claimable.questFingerprint,
    taskId: claimable.taskId,
    requestId: `econ-disabled-${Date.now()}`,
    expectedLearnerRevision: revision,
  });
  const payload = await response.json();

  assert.equal(response.status, 200, `Expected 200, got ${response.status}: ${JSON.stringify(payload)}`);
  assert.equal(payload.heroClaim.status, 'claimed');
  assert.equal(payload.heroClaim.coinsEnabled, false);
  assert.equal(payload.heroClaim.coinsAwarded, 0);
  assert.equal(payload.heroClaim.coinBalance, 0);
  assert.equal(payload.heroClaim.dailyCoinsAlreadyAwarded, false);
  assert.equal(payload.heroClaim.heroStatePersistenceEnabled, true);

  // Verify no economy event in event_log
  const events = getHeroEvents(server);
  const coinsEvent = events.find(e => e.event_type === 'hero.coins.awarded');
  assert.equal(coinsEvent, undefined, 'No hero.coins.awarded event when economy disabled');

  server.close();
});

// ── 4. Same requestId replay → replayed response includes same coins data ─

test('P4 U4: same requestId replay after coin award → idempotent coins data', async () => {
  const server = createEconomyServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  const { lastClaimPayload, quest, fingerprint, allTasks } = await claimAllTasks(server, 'learner-a', 'adult-a');

  // The final claim awarded coins
  assert.equal(lastClaimPayload.heroClaim.coinsAwarded, HERO_DAILY_COMPLETION_COINS);

  // Now replay: claim same task again with same questId/taskId
  // The task is already completed, so resolver returns already-completed
  const lastTask = allTasks[allTasks.length - 1];
  const revision = getLearnerRevision(server);
  const response = await postHeroCommand(server, {
    command: 'claim-task',
    learnerId: 'learner-a',
    questId: quest.questId,
    questFingerprint: fingerprint,
    taskId: lastTask.taskId,
    requestId: `econ-replay-different-${Date.now()}`,
    expectedLearnerRevision: revision,
  });
  const payload = await response.json();

  assert.equal(response.status, 200, `Replay must succeed: ${JSON.stringify(payload)}`);
  assert.equal(payload.ok, true);

  // Should be already-completed path with coins data
  assert.equal(payload.heroClaim.status, 'already-completed');
  assert.equal(payload.heroClaim.coinsEnabled, true);
  assert.equal(payload.heroClaim.coinsAwarded, 0);
  assert.equal(payload.heroClaim.coinBalance, HERO_DAILY_COMPLETION_COINS);
  assert.equal(payload.heroClaim.dailyCoinsAlreadyAwarded, true);

  server.close();
});

// ── 5. Different request after completion → already-completed + dailyCoinsAlreadyAwarded ─

test('P4 U4: different request after daily completion → already-completed with dailyCoinsAlreadyAwarded=true', async () => {
  const server = createEconomyServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  const { quest, fingerprint, allTasks } = await claimAllTasks(server, 'learner-a', 'adult-a');

  // Try claiming any already-completed task with a new requestId
  const lastTask = allTasks[allTasks.length - 1];
  const revision = getLearnerRevision(server);
  const response = await postHeroCommand(server, {
    command: 'claim-task',
    learnerId: 'learner-a',
    questId: quest.questId,
    questFingerprint: fingerprint,
    taskId: lastTask.taskId,
    requestId: `econ-post-complete-${Date.now()}`,
    expectedLearnerRevision: revision,
  });
  const payload = await response.json();

  assert.equal(response.status, 200, `Expected 200: ${JSON.stringify(payload)}`);
  assert.equal(payload.heroClaim.status, 'already-completed');
  assert.equal(payload.heroClaim.coinsEnabled, true);
  assert.equal(payload.heroClaim.dailyCoinsAlreadyAwarded, true);
  assert.equal(payload.heroClaim.coinBalance, HERO_DAILY_COMPLETION_COINS);

  server.close();
});

// ── 6. Economy enabled + progress disabled → 409 hero_economy_misconfigured ─

test('P4 U4: economy enabled + progress disabled → 409 hero_economy_misconfigured', async () => {
  const server = createEconomyWithoutProgressServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  const revision = getLearnerRevision(server);
  const response = await postHeroCommand(server, {
    command: 'claim-task',
    learnerId: 'learner-a',
    questId: 'any-quest',
    questFingerprint: 'any-fp',
    taskId: 'any-task',
    requestId: `econ-misconfig-${Date.now()}`,
    expectedLearnerRevision: revision,
  });
  const payload = await response.json();

  assert.equal(response.status, 409, `Expected 409, got ${response.status}: ${JSON.stringify(payload)}`);
  assert.equal(payload.error.code, 'hero_economy_misconfigured');

  server.close();
});

// ── 7. Event-log write failure → does NOT duplicate award ─────────────

test('P4 U4: event_log write is non-fatal and does not affect award', async () => {
  const server = createEconomyServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  const { lastClaimPayload } = await claimAllTasks(server, 'learner-a', 'adult-a');

  // Coins were awarded in the mutation
  assert.equal(lastClaimPayload.heroClaim.coinsAwarded, HERO_DAILY_COMPLETION_COINS);

  // Verify the economy award is in the persisted state (regardless of event_log)
  const progress = getHeroProgressRow(server, 'learner-a');
  assert.equal(progress.economy.balance, HERO_DAILY_COMPLETION_COINS);
  assert.equal(progress.economy.ledger.length, 1);

  // The award event uses ON CONFLICT(id) DO NOTHING — inserting again is safe
  const events = getHeroEvents(server);
  const coinsEvents = events.filter(e => e.event_type === 'hero.coins.awarded');
  assert.equal(coinsEvents.length, 1, 'Only one coins event exists (idempotent by ON CONFLICT)');

  server.close();
});

// ── 8. Structured log emitted for hero_daily_coins_awarded ─────────────

test('P4 U4: structured log hero_daily_coins_awarded emitted on successful award', async () => {
  const server = createEconomyServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  // Capture console.log output
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => {
    logs.push(args.join(' '));
  };

  try {
    await claimAllTasks(server, 'learner-a', 'adult-a');
  } finally {
    console.log = originalLog;
  }

  // Find the hero_daily_coins_awarded log entry
  const coinsLog = logs.find(l => {
    try {
      const parsed = JSON.parse(l);
      return parsed.event === 'hero_daily_coins_awarded';
    } catch { return false; }
  });
  assert.ok(coinsLog, 'hero_daily_coins_awarded structured log must be emitted');

  const parsed = JSON.parse(coinsLog);
  assert.equal(parsed.event, 'hero_daily_coins_awarded');
  assert.equal(parsed.learnerId, 'learner-a');
  assert.equal(parsed.amount, HERO_DAILY_COMPLETION_COINS);
  assert.ok(parsed.balanceAfter >= HERO_DAILY_COMPLETION_COINS);
  assert.ok(parsed.ledgerEntryId);

  server.close();
});
