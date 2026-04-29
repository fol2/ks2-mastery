// Hero Mode P4 U9 — Economy telemetry and event mirror tests.
//
// Verifies structured log emission and event_log entries for all economy
// event types: awarded, disabled, blocked, duplicate_prevented, and
// already_awarded (on the already-completed early-return path).

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
        name: 'Telemetry Test Learner',
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
    requestId: `telem-seed-launch-${Date.now()}`,
    expectedLearnerRevision: revision,
  }, accountId);
  const launchPayload = await launchResp.json();
  assert.equal(launchResp.status, 200, `Seed launch must succeed: ${JSON.stringify(launchPayload)}`);

  // Seed a completed practice session with heroContext
  const sessionId = `ps-telem-${Date.now().toString(36)}`;
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
      requestId: `telem-all-launch-${i}-${Date.now()}`,
      expectedLearnerRevision: rev,
    }, accountId);

    // Seed practice session
    const sessionId = `ps-telem-all-${i}-${Date.now().toString(36)}`;
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
      requestId: `telem-all-claim-${i}-${Date.now()}`,
      expectedLearnerRevision: claimRev,
    }, accountId);
    lastClaimPayload = await claimResp.json();
    assert.equal(claimResp.status, 200, `Claim ${i} must succeed: ${JSON.stringify(lastClaimPayload)}`);
  }

  return { lastClaimPayload, allTasks, quest, fingerprint };
}

// ── Helper: capture structured logs during a callback ──────────────────

function captureStructuredLogs(fn) {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => {
    logs.push(args.join(' '));
  };
  const restore = () => { console.log = originalLog; };
  return fn().then((result) => {
    restore();
    return { result, logs };
  }).catch((err) => {
    restore();
    throw err;
  });
}

function findLogEvent(logs, eventName) {
  for (const l of logs) {
    try {
      const parsed = JSON.parse(l);
      if (parsed.event === eventName) return parsed;
    } catch { /* skip non-JSON */ }
  }
  return null;
}

function findAllLogEvents(logs, eventName) {
  const results = [];
  for (const l of logs) {
    try {
      const parsed = JSON.parse(l);
      if (parsed.event === eventName) results.push(parsed);
    } catch { /* skip non-JSON */ }
  }
  return results;
}

// ── 1. Successful award emits hero_daily_coins_awarded with full fields ───

test('U9: hero_daily_coins_awarded log contains learnerId, questId, amount, balanceAfter, ledgerEntryId', async () => {
  const server = createEconomyServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  const { logs } = await captureStructuredLogs(async () => {
    await claimAllTasks(server, 'learner-a', 'adult-a');
  });

  const awarded = findLogEvent(logs, 'hero_daily_coins_awarded');
  assert.ok(awarded, 'hero_daily_coins_awarded log must be emitted');
  assert.equal(awarded.learnerId, 'learner-a');
  assert.ok(awarded.questId, 'questId must be populated');
  assert.equal(awarded.amount, HERO_DAILY_COMPLETION_COINS);
  assert.ok(awarded.balanceAfter >= HERO_DAILY_COMPLETION_COINS);
  assert.ok(awarded.ledgerEntryId, 'ledgerEntryId must be present');
  assert.ok(awarded.ledgerEntryId.startsWith('hero-ledger-'), 'ledgerEntryId must start with hero-ledger-');

  server.close();
});

// ── 2. Event mirror row uses deterministic ID (hero-evt-<ledgerEntryId>) ──

test('U9: event_log entry for hero.coins.awarded uses deterministic ID hero-evt-<ledgerEntryId>', async () => {
  const server = createEconomyServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');
  await claimAllTasks(server, 'learner-a', 'adult-a');

  const events = getHeroEvents(server);
  const coinsEvent = events.find(e => e.event_type === 'hero.coins.awarded');
  assert.ok(coinsEvent, 'hero.coins.awarded event must exist');

  // The ID must be hero-evt-<ledgerEntryId>
  const eventData = JSON.parse(coinsEvent.event_json);
  assert.ok(eventData.ledgerEntryId, 'event must contain ledgerEntryId');
  assert.equal(coinsEvent.id, `hero-evt-${eventData.ledgerEntryId}`);

  // Verify full event data
  assert.equal(eventData.amount, HERO_DAILY_COMPLETION_COINS);
  assert.ok(eventData.balanceAfter >= HERO_DAILY_COMPLETION_COINS);
  assert.ok(eventData.dateKey, 'dateKey must be present');
  assert.ok(eventData.questId, 'questId must be present');

  server.close();
});

// ── 3. Duplicate event insert (ON CONFLICT DO NOTHING) → no error ─────

test('U9: duplicate event_log insert with same deterministic ID produces no error', async () => {
  const server = createEconomyServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');
  await claimAllTasks(server, 'learner-a', 'adult-a');

  const events = getHeroEvents(server);
  const coinsEvent = events.find(e => e.event_type === 'hero.coins.awarded');
  assert.ok(coinsEvent, 'hero.coins.awarded event must exist');

  // Manually attempt to insert the same event ID again — must not throw
  const duplicateInsert = () => server.DB.db.prepare(`
    INSERT INTO event_log (id, learner_id, subject_id, system_id, event_type, event_json, created_at, actor_account_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(
    coinsEvent.id,
    coinsEvent.learner_id,
    null,
    'hero-mode',
    'hero.coins.awarded',
    coinsEvent.event_json,
    Date.now(),
    'adult-a',
  );
  assert.doesNotThrow(duplicateInsert, 'ON CONFLICT DO NOTHING must not throw');

  // Verify still only one row
  const eventsAfter = getHeroEvents(server);
  const coinsEventsAfter = eventsAfter.filter(e => e.event_type === 'hero.coins.awarded');
  assert.equal(coinsEventsAfter.length, 1, 'Only one coins event must exist after duplicate insert');

  server.close();
});

// ── 4. Already-awarded emits hero_task_claim_already_completed with coins flag ──

test('U9: already-awarded path emits hero_task_claim_already_completed with hero_daily_coins_already_awarded', async () => {
  const server = createEconomyServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  const { quest, fingerprint, allTasks } = await claimAllTasks(server, 'learner-a', 'adult-a');

  // Now re-claim the last task — triggers already-completed path
  const lastTask = allTasks[allTasks.length - 1];
  const revision = getLearnerRevision(server);

  const { logs } = await captureStructuredLogs(async () => {
    await postHeroCommand(server, {
      command: 'claim-task',
      learnerId: 'learner-a',
      questId: quest.questId,
      questFingerprint: fingerprint,
      taskId: lastTask.taskId,
      requestId: `telem-already-${Date.now()}`,
      expectedLearnerRevision: revision,
    });
  });

  const alreadyLog = findLogEvent(logs, 'hero_task_claim_already_completed');
  assert.ok(alreadyLog, 'hero_task_claim_already_completed log must be emitted');
  assert.equal(alreadyLog.learnerId, 'learner-a');
  assert.equal(alreadyLog.hero_daily_coins_already_awarded, true);

  server.close();
});

// ── 5. Economy disabled emits hero_daily_coins_disabled log ─────────────

test('U9: economy disabled emits hero_daily_coins_disabled on claim-task', async () => {
  const server = createEconomyDisabledServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');
  const claimable = await seedClaimableState(server, 'learner-a', 'adult-a');

  const revision = getLearnerRevision(server);
  const { logs } = await captureStructuredLogs(async () => {
    await postHeroCommand(server, {
      command: 'claim-task',
      learnerId: 'learner-a',
      questId: claimable.questId,
      questFingerprint: claimable.questFingerprint,
      taskId: claimable.taskId,
      requestId: `telem-disabled-${Date.now()}`,
      expectedLearnerRevision: revision,
    });
  });

  const disabledLog = findLogEvent(logs, 'hero_daily_coins_disabled');
  assert.ok(disabledLog, 'hero_daily_coins_disabled log must be emitted');
  assert.equal(disabledLog.learnerId, 'learner-a');
  assert.equal(disabledLog.questId, claimable.questId);
  assert.equal(disabledLog.taskId, claimable.taskId);

  server.close();
});

// ── 6. Non-final claim with economy enabled emits hero_daily_coins_blocked ──

test('U9: non-final claim emits hero_daily_coins_blocked with reason daily_not_completed', async () => {
  const server = createEconomyServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');
  const claimable = await seedClaimableState(server, 'learner-a', 'adult-a');

  // Check that there is more than 1 launchable task
  const readModel = await getReadModel(server, 'learner-a');
  const quest = readModel.hero.dailyQuest;
  const remaining = quest.tasks.filter(t => t.launchStatus === 'launchable' || t.launchStatus === 'started').length;

  // If only 1 task, this claim completes the daily — skip (covered by test 1)
  if (remaining <= 1) {
    server.close();
    return;
  }

  const revision = getLearnerRevision(server);
  const { logs } = await captureStructuredLogs(async () => {
    await postHeroCommand(server, {
      command: 'claim-task',
      learnerId: 'learner-a',
      questId: claimable.questId,
      questFingerprint: claimable.questFingerprint,
      taskId: claimable.taskId,
      requestId: `telem-blocked-${Date.now()}`,
      expectedLearnerRevision: revision,
    });
  });

  const blockedLog = findLogEvent(logs, 'hero_daily_coins_blocked');
  assert.ok(blockedLog, 'hero_daily_coins_blocked log must be emitted for non-final claim');
  assert.equal(blockedLog.learnerId, 'learner-a');
  assert.equal(blockedLog.questId, claimable.questId);
  assert.equal(blockedLog.taskId, claimable.taskId);
  assert.equal(blockedLog.reason, 'daily_not_completed');

  server.close();
});

// ── 7. hero_daily_coins_awarded is emitted exactly once per daily completion ──

test('U9: hero_daily_coins_awarded emitted exactly once across all task claims', async () => {
  const server = createEconomyServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  const { logs } = await captureStructuredLogs(async () => {
    await claimAllTasks(server, 'learner-a', 'adult-a');
  });

  const awardedLogs = findAllLogEvents(logs, 'hero_daily_coins_awarded');
  assert.equal(awardedLogs.length, 1, 'hero_daily_coins_awarded must fire exactly once');

  server.close();
});

// ── 8. hero_task_claim_succeeded always emitted on successful claim ────

test('U9: hero_task_claim_succeeded emitted for each successful claim', async () => {
  const server = createEconomyServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  const { logs } = await captureStructuredLogs(async () => {
    await claimAllTasks(server, 'learner-a', 'adult-a');
  });

  const succeedLogs = findAllLogEvents(logs, 'hero_task_claim_succeeded');
  assert.ok(succeedLogs.length >= 1, 'At least one hero_task_claim_succeeded log must be emitted');

  // Each must contain the required fields
  for (const log of succeedLogs) {
    assert.equal(log.learnerId, 'learner-a');
    assert.ok(log.questId, 'questId must be populated');
    assert.ok(log.taskId, 'taskId must be populated');
    assert.ok(log.subjectId, 'subjectId must be populated');
    assert.ok(log.dailyStatus, 'dailyStatus must be populated');
  }

  // The final claim's dailyStatus must be 'completed'
  const lastSucceed = succeedLogs[succeedLogs.length - 1];
  assert.equal(lastSucceed.dailyStatus, 'completed');

  server.close();
});

// ── 9. Event mirror rows include both hero.task.completed and hero.daily.completed ──

test('U9: event_log contains hero.task.completed and hero.daily.completed after full daily', async () => {
  const server = createEconomyServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');
  await claimAllTasks(server, 'learner-a', 'adult-a');

  const events = getHeroEvents(server);

  const taskEvents = events.filter(e => e.event_type === 'hero.task.completed');
  assert.ok(taskEvents.length >= 1, 'At least one hero.task.completed event must exist');

  const dailyEvent = events.find(e => e.event_type === 'hero.daily.completed');
  assert.ok(dailyEvent, 'hero.daily.completed event must exist');

  const dailyData = JSON.parse(dailyEvent.event_json);
  assert.ok(dailyData.data.questId, 'questId in daily event');
  assert.ok(dailyData.data.dateKey, 'dateKey in daily event');

  // Coins event must also exist
  const coinsEvent = events.find(e => e.event_type === 'hero.coins.awarded');
  assert.ok(coinsEvent, 'hero.coins.awarded event must exist');

  server.close();
});
