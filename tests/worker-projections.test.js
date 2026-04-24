import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerApp } from '../worker/src/app.js';
import { MONSTER_CELEBRATION_REPLAY_REQUEST_TYPE } from '../worker/src/projections/monster-replays.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function seedAccountLearner(DB, { accountId = 'adult-a', learnerId = 'learner-a' } = {}) {
  const now = Date.UTC(2026, 0, 1);
  DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES (?, 'Learner A', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(learnerId, now, now);
  DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES (?, ?, ?, 'parent', ?, ?, ?, 0)
  `).run(accountId, `${accountId}@example.test`, 'Adult A', learnerId, now, now);
  DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, ?, 'owner', 0, ?, ?)
  `).run(accountId, learnerId, now, now);
}

function createCommandHarness() {
  const nowRef = { value: Date.UTC(2026, 0, 1) };
  const DB = createMigratedSqliteD1Database();
  seedAccountLearner(DB);
  const app = createWorkerApp({ now: () => nowRef.value });
  const env = {
    DB,
    AUTH_MODE: 'development-stub',
    ENVIRONMENT: 'test',
  };
  let revision = 0;
  let sequence = 0;

  async function postRaw(body) {
    const response = await app.fetch(new Request('https://repo.test/api/subjects/spelling/command', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ks2-dev-account-id': 'adult-a',
      },
      body: JSON.stringify(body),
    }), env, {});
    return {
      response,
      body: await response.json(),
      requestBody: body,
    };
  }

  async function command(commandName, payload = {}) {
    sequence += 1;
    const result = await postRaw({
      command: commandName,
      learnerId: 'learner-a',
      requestId: `projection-command-${sequence}`,
      expectedLearnerRevision: revision,
      payload,
    });
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    revision = result.body.mutation.appliedRevision;
    return result;
  }

  return {
    DB,
    nowRef,
    close() {
      DB.close();
    },
    command,
    postRaw,
    get revision() {
      return revision;
    },
  };
}

function insertEvent(DB, event) {
  DB.db.prepare(`
    INSERT INTO event_log (id, learner_id, subject_id, system_id, event_type, event_json, created_at, actor_account_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'adult-a')
  `).run(
    event.id,
    event.learnerId,
    event.subjectId || null,
    event.systemId || null,
    event.type,
    JSON.stringify(event),
    event.createdAt,
  );
}

function insertProjectionWindowFillerEvents(DB, { learnerId = 'learner-a', count = 1005, startAt }) {
  for (let index = 0; index < count; index += 1) {
    insertEvent(DB, {
      id: `spelling.projection-window-filler:${index}`,
      type: 'spelling.session-completed',
      learnerId,
      subjectId: 'spelling',
      createdAt: startAt + index,
    });
  }
}

async function completePossessRound(harness) {
  let latest = await harness.command('start-session', {
    mode: 'single',
    slug: 'possess',
    length: 1,
  });
  let secureSubmit = null;

  while (latest.body.subjectReadModel.phase === 'session') {
    latest = await harness.command('submit-answer', { answer: 'possess' });
    if (latest.body.domainEvents.some((event) => event.type === 'spelling.word-secured')) {
      secureSubmit = latest;
    }
    if (latest.body.subjectReadModel.phase === 'session' && latest.body.subjectReadModel.awaitingAdvance) {
      latest = await harness.command('continue-session');
    }
  }

  return { latest, secureSubmit };
}

test('spelling command projection applies monster rewards and returns celebration read models atomically', async () => {
  const harness = createCommandHarness();

  try {
    let secureSubmit = null;
    for (let round = 0; round < 4; round += 1) {
      const completed = await completePossessRound(harness);
      if (completed.secureSubmit) secureSubmit = completed.secureSubmit;
      harness.nowRef.value += DAY_MS * 2;
    }

    assert.ok(secureSubmit, 'the fourth round should emit a secure-word event');
    assert.ok(secureSubmit.body.domainEvents.some((event) => event.type === 'spelling.word-secured'));
    assert.ok(secureSubmit.body.reactionEvents.some((event) => (
      event.type === 'reward.monster'
      && event.kind === 'caught'
      && event.monsterId === 'inklet'
    )));
    assert.ok(secureSubmit.body.toastEvents.some((event) => event.monsterId === 'inklet'));
    assert.equal(secureSubmit.body.projections.rewards.systemId, 'monster-codex');
    assert.ok(secureSubmit.body.projections.rewards.state.inklet.mastered.includes('possess'));

    const gameRow = harness.DB.db.prepare(`
      SELECT state_json
      FROM child_game_state
      WHERE learner_id = 'learner-a' AND system_id = 'monster-codex'
    `).get();
    const gameState = JSON.parse(gameRow.state_json);
    assert.ok(gameState.inklet.mastered.includes('possess'));

    const rewardCount = harness.DB.db.prepare(`
      SELECT COUNT(*) AS count
      FROM event_log
      WHERE learner_id = 'learner-a' AND event_type = 'reward.monster'
    `).get().count;
    assert.equal(rewardCount, 1);

    const replay = await harness.postRaw(secureSubmit.requestBody);
    assert.equal(replay.response.status, 200);
    assert.equal(replay.body.mutation.replayed, true);
    const rewardCountAfterReplay = harness.DB.db.prepare(`
      SELECT COUNT(*) AS count
      FROM event_log
      WHERE learner_id = 'learner-a' AND event_type = 'reward.monster'
    `).get().count;
    assert.equal(rewardCountAfterReplay, rewardCount);
  } finally {
    harness.close();
  }
});

test('spelling command projection emits requested monster celebration replays on session completion once', async () => {
  const harness = createCommandHarness();
  const replayRequestId = 'ops.monster-celebration-replay-request:learner-a:test';
  const replaySourceEvents = [
    {
      id: 'reward.monster:learner-a:inklet:evolve:3:6',
      type: 'reward.monster',
      kind: 'evolve',
      learnerId: 'learner-a',
      subjectId: 'spelling',
      systemId: 'monster-codex',
      monsterId: 'inklet',
      monster: { id: 'inklet', name: 'Inklet', accent: '#3E6FA8' },
      previous: { mastered: 59, stage: 2, level: 5, caught: true, branch: 'b1' },
      next: { mastered: 60, stage: 3, level: 6, caught: true, branch: 'b1' },
      createdAt: Date.UTC(2026, 3, 24, 16, 35, 9),
    },
    {
      id: 'reward.monster:learner-a:glimmerbug:evolve:1:1',
      type: 'reward.monster',
      kind: 'evolve',
      learnerId: 'learner-a',
      subjectId: 'spelling',
      systemId: 'monster-codex',
      monsterId: 'glimmerbug',
      monster: { id: 'glimmerbug', name: 'Glimmerbug', accent: '#B43CD9' },
      previous: { mastered: 9, stage: 0, level: 0, caught: true, branch: 'b1' },
      next: { mastered: 10, stage: 1, level: 1, caught: true, branch: 'b1' },
      createdAt: Date.UTC(2026, 3, 24, 17, 8, 9),
    },
  ];

  try {
    replaySourceEvents.forEach((event) => insertEvent(harness.DB, event));
    insertProjectionWindowFillerEvents(harness.DB, {
      startAt: Date.UTC(2026, 3, 24, 17, 30, 0),
    });
    insertEvent(harness.DB, {
      id: replayRequestId,
      type: MONSTER_CELEBRATION_REPLAY_REQUEST_TYPE,
      learnerId: 'learner-a',
      subjectId: 'spelling',
      eventIds: replaySourceEvents.map((event) => event.id),
      reason: 'manual-production-replay-test',
      createdAt: Date.UTC(2026, 3, 24, 18, 0, 0),
    });

    const firstCompletion = await completePossessRound(harness);
    const firstReplayEvents = firstCompletion.latest.body.projections.rewards.events
      .filter((event) => event.replayRequestId === replayRequestId);

    assert.deepEqual(firstReplayEvents.map((event) => event.replayOf), replaySourceEvents.map((event) => event.id));
    assert.deepEqual(firstReplayEvents.map((event) => event.monsterId), ['inklet', 'glimmerbug']);
    assert.ok(firstReplayEvents.every((event) => event.type === 'reward.monster' && event.kind === 'evolve'));

    const replayRows = harness.DB.db.prepare(`
      SELECT id
      FROM event_log
      WHERE learner_id = 'learner-a'
        AND event_type = 'reward.monster'
        AND id LIKE 'reward.monster.replay:%'
      ORDER BY created_at ASC, id ASC
    `).all();
    assert.deepEqual(replayRows.map((row) => row.id), firstReplayEvents.map((event) => event.id));

    const secondCompletion = await completePossessRound(harness);
    assert.equal(
      secondCompletion.latest.body.projections.rewards.events
        .some((event) => event.replayRequestId === replayRequestId),
      false,
    );
  } finally {
    harness.close();
  }
});
