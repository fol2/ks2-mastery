// Spelling command HTTP responses must not re-ship the fat monster-codex
// snapshot on every wrong→correct recovery. Clients keep cached gameState
// when projections.rewards.state is omitted.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerApp } from '../worker/src/app.js';
import { COMMAND_PROJECTION_MODEL_KEY } from '../worker/src/read-models/learner-read-models.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';

const NOW = Date.UTC(2026, 0, 1);
const BASE = 'https://repo.test';
const FAT_MASTERED = Array.from({ length: 180 }, (_, i) => `word-${i}`);

function seedHarness() {
  const DB = createMigratedSqliteD1Database();
  DB.db.prepare(`
    INSERT INTO learner_profiles
      (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES ('learner-slim', 'Slim', 'Y4', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(NOW, NOW);
  DB.db.prepare(`
    INSERT INTO adult_accounts
      (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES ('adult-slim', 'slim@test', 'Slim Adult', 'parent', 'learner-slim', ?, ?, 0)
  `).run(NOW, NOW);
  DB.db.prepare(`
    INSERT INTO account_learner_memberships
      (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES ('adult-slim', 'learner-slim', 'owner', 0, ?, ?)
  `).run(NOW, NOW);
  DB.db.prepare(`
    INSERT INTO child_game_state (learner_id, system_id, state_json, updated_at, updated_by_account_id)
    VALUES ('learner-slim', 'monster-codex', ?, ?, 'adult-slim')
  `).run(JSON.stringify({
    inklet: { mastered: FAT_MASTERED },
    glimmerbug: { mastered: FAT_MASTERED.slice(0, 40) },
  }), NOW);
  // Nelson-shaped command.projection.v1: fat rewards + long token ring.
  const tokens = Array.from({ length: 120 }, (_, i) => `evt-token-${i}-${'x'.repeat(48)}`);
  DB.db.prepare(`
    INSERT INTO learner_read_models
      (learner_id, model_key, model_json, source_revision, generated_at, updated_at)
    VALUES ('learner-slim', ?, ?, 0, ?, ?)
  `).run(
    COMMAND_PROJECTION_MODEL_KEY,
    JSON.stringify({
      version: 1,
      generatedAt: NOW,
      rewards: {
        systemId: 'monster-codex',
        state: {
          inklet: { mastered: FAT_MASTERED },
          glimmerbug: { mastered: FAT_MASTERED.slice(0, 40) },
        },
      },
      eventCounts: { written: 120, domain: 100, reactions: 20 },
      recentEventTokens: tokens,
    }),
    NOW,
    NOW,
  );

  const lines = [];
  const app = createWorkerApp({ now: () => NOW });
  const env = {
    DB,
    AUTH_MODE: 'development-stub',
    ENVIRONMENT: 'test',
    CAPACITY_LOG_SAMPLE_RATE: '1',
  };

  async function command(commandName, payload, revision, requestId) {
    const response = await app.fetch(new Request(`${BASE}/api/subjects/spelling/command`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ks2-dev-account-id': 'adult-slim',
      },
      body: JSON.stringify({
        command: commandName,
        learnerId: 'learner-slim',
        requestId,
        expectedLearnerRevision: revision,
        payload,
      }),
    }), env, {});
    const body = await response.json();
    const bytes = Buffer.byteLength(JSON.stringify(body), 'utf8');
    return {
      status: response.status,
      body,
      bytes,
      revision: body.mutation?.appliedRevision ?? revision,
    };
  }

  return {
    command,
    close() { DB.close(); },
    lines,
  };
}

test('wrong then correct omits unchanged rewards.state and stays under slim byte budget', async () => {
  const harness = seedHarness();
  try {
    let revision = 0;
    const start = await harness.command('start-session', {
      mode: 'single',
      slug: 'possess',
      length: 1,
    }, revision, 'slim-start');
    assert.equal(start.status, 200, JSON.stringify(start.body));
    revision = start.revision;

    const wrong = await harness.command('submit-answer', { typed: 'posess' }, revision, 'slim-wrong');
    assert.equal(wrong.status, 200, JSON.stringify(wrong.body));
    revision = wrong.revision;
    assert.equal(
      wrong.body.projections?.rewards?.state,
      undefined,
      'wrong answer must omit unchanged rewards.state from the HTTP body',
    );
    assert.equal(
      wrong.body.projections?.recentEventTokens,
      undefined,
      'command response must not ship recentEventTokens',
    );

    const correct = await harness.command('submit-answer', { typed: 'possess' }, revision, 'slim-correct');
    assert.equal(correct.status, 200, JSON.stringify(correct.body));
    // Recovery / non-mastery correct should also omit the fat snapshot.
    // If this command did secure a word and mutate codex, state may be present —
    // only assert omit when changedGameState would be empty (no reward.monster).
    const secured = (correct.body.domainEvents || []).some((event) => event?.type === 'spelling.word-secured');
    if (!secured) {
      assert.equal(
        correct.body.projections?.rewards?.state,
        undefined,
        'non-mastery correct must omit unchanged rewards.state',
      );
    }
    assert.ok(
      correct.bytes < 9000,
      `correct response should stay under 9KB without fat rewards; got ${correct.bytes}`,
    );
    assert.ok(
      wrong.bytes < 9000,
      `wrong response should stay under 9KB without fat rewards; got ${wrong.bytes}`,
    );
  } finally {
    harness.close();
  }
});
