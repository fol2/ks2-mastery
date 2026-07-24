import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerApp } from '../worker/src/app.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';

const BASE_URL = 'https://repo.test';
const NOW = Date.UTC(2026, 6, 24);

function seedAccount(DB, {
  accountId = 'adult-stale-stats',
  learnerId = 'learner-stale-stats',
} = {}) {
  DB.db.prepare(`
    INSERT INTO learner_profiles (
      id, name, year_group, avatar_color, goal, daily_minutes,
      created_at, updated_at, state_revision
    ) VALUES (?, 'Stale Stats', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(learnerId, NOW, NOW);
  DB.db.prepare(`
    INSERT INTO adult_accounts (
      id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, repo_revision
    ) VALUES (?, ?, 'Stale Adult', 'parent', ?, ?, ?, 0)
  `).run(accountId, `${accountId}@example.test`, learnerId, NOW, NOW);
  DB.db.prepare(`
    INSERT INTO account_learner_memberships (
      account_id, learner_id, role, sort_index, created_at, updated_at
    ) VALUES (?, ?, 'owner', 0, ?, ?)
  `).run(accountId, learnerId, NOW, NOW);
}

function workingSetSlugBind(queryLog) {
  const entry = queryLog.find((row) => (
    /spelling_item_state/i.test(row.sql || '')
    && /json_each/i.test(row.sql || '')
  ));
  assert.ok(entry, 'expected spelling gameplay working-set query');
  const raw = (entry.params || []).find((value) => (
    typeof value === 'string' && value.startsWith('[')
  ));
  assert.ok(raw, 'expected json_each slug bind on working-set query');
  const slugs = JSON.parse(raw);
  assert.ok(Array.isArray(slugs), 'slug bind must be a JSON array');
  return slugs;
}

function createHarness() {
  const DB = createMigratedSqliteD1Database();
  const accountId = 'adult-stale-stats';
  const learnerId = 'learner-stale-stats';
  seedAccount(DB, { accountId, learnerId });

  const app = createWorkerApp({ now: () => NOW });
  const env = {
    DB,
    AUTH_MODE: 'development-stub',
    ENVIRONMENT: 'test',
  };

  let revision = 0;
  let sequence = 0;

  async function command(commandName, payload = {}) {
    DB.clearQueryLog();
    const requestId = `stale-stats-${sequence += 1}`;
    const response = await app.fetch(new Request(`${BASE_URL}/api/subjects/spelling/command`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ks2-dev-account-id': accountId,
      },
      body: JSON.stringify({
        command: commandName,
        learnerId,
        requestId,
        expectedLearnerRevision: revision,
        payload,
      }),
    }), env, {});
    const body = await response.json();
    if (response.status === 200 && body?.mutation?.appliedRevision != null) {
      revision = body.mutation.appliedRevision;
    }
    return {
      response,
      body,
      queryLog: DB.takeQueryLog(),
    };
  }

  return {
    command,
    close() { DB.close(); },
  };
}

test('fresh learner single-slug start must not bind the full published catalogue into D1 working-set reads', async () => {
  const harness = createHarness();
  try {
    const start = await harness.command('start-session', {
      mode: 'single',
      slug: 'possess',
      length: 1,
    });
    assert.equal(start.response.status, 200, JSON.stringify(start.body));
    assert.equal(start.body.ok, true);

    const slugs = workingSetSlugBind(start.queryLog);
    assert.deepEqual(
      slugs,
      ['possess'],
      `single-slug start must request only the explicit slug; got ${slugs.length} slugs`,
    );
  } finally {
    harness.close();
  }
});

test('stale-stats submit-answer stays on active session slugs instead of expanding to the full catalogue', async () => {
  const harness = createHarness();
  try {
    const start = await harness.command('start-session', {
      mode: 'single',
      slug: 'possess',
      length: 1,
    });
    assert.equal(start.response.status, 200, JSON.stringify(start.body));

    const wrong = await harness.command('submit-answer', { typed: 'posess' });
    assert.equal(wrong.response.status, 200, JSON.stringify(wrong.body));

    const slugs = workingSetSlugBind(wrong.queryLog);
    assert.ok(
      slugs.length <= 8,
      `submit-answer must stay session-bounded; got ${slugs.length} slugs: ${slugs.slice(0, 12).join(',')}`,
    );
    assert.equal(slugs.includes('possess'), true, 'active slug must remain in the working set');
  } finally {
    harness.close();
  }
});
