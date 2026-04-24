import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerApp } from '../worker/src/app.js';
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
