// Free-tier CPU: mid-session submit-answer must not hydrate every historical
// session slug. Prod Nelson (build e41ac74d / H2 catalogue cut) still joined
// CF cpuTime p50≈16ms while every wrong/correct bound ~51 item rows from
// uniqueWords/results/status/sentenceHistory. Engine submitAnswer only needs
// the current card slug (Pattern Quest: current + next).

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerApp } from '../worker/src/app.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';

const BASE_URL = 'https://repo.test';
const NOW = Date.UTC(2026, 6, 24);
const HISTORICAL_SLUGS = 50;

function seedAccount(DB, {
  accountId = 'adult-submit-ws',
  learnerId = 'learner-submit-ws',
} = {}) {
  DB.db.prepare(`
    INSERT INTO learner_profiles (
      id, name, year_group, avatar_color, goal, daily_minutes,
      created_at, updated_at, state_revision
    ) VALUES (?, 'Submit WS', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(learnerId, NOW, NOW);
  DB.db.prepare(`
    INSERT INTO adult_accounts (
      id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, repo_revision
    ) VALUES (?, ?, 'Submit WS Adult', 'parent', ?, ?, ?, 0)
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
  const accountId = 'adult-submit-ws';
  const learnerId = 'learner-submit-ws';
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
    const requestId = `submit-ws-${sequence += 1}`;
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
    DB,
    learnerId,
    command,
    close() { DB.close(); },
  };
}

function fattenActiveSessionHistory(DB, learnerId, currentSlug = 'possess') {
  const row = DB.db.prepare(`
    SELECT ui_json
    FROM spelling_learner_state
    WHERE learner_id = ?
  `).get(learnerId);
  assert.ok(row?.ui_json, 'expected spelling_learner_state.ui_json after start-session');
  const ui = JSON.parse(row.ui_json);
  assert.equal(ui?.session?.currentSlug, currentSlug, 'session must still be on the active slug');

  const historical = Array.from({ length: HISTORICAL_SLUGS }, (_, index) => `history-word-${index}`);
  const status = { ...(ui.session.status || {}) };
  const sentenceHistory = { ...(ui.session.sentenceHistory || {}) };
  for (const slug of historical) {
    status[slug] = { done: true, needed: true };
    sentenceHistory[slug] = { lastSentenceId: 's1' };
  }
  ui.session = {
    ...ui.session,
    uniqueWords: [...historical, currentSlug],
    results: historical.map((slug) => ({ slug, correct: true })),
    queue: [currentSlug],
    status,
    sentenceHistory,
    guardianResults: Object.fromEntries(historical.map((slug) => [slug, { ok: true }])),
  };

  DB.db.prepare(`
    UPDATE spelling_learner_state
    SET ui_json = ?
    WHERE learner_id = ?
  `).run(JSON.stringify(ui), learnerId);

  const insertItem = DB.db.prepare(`
    INSERT INTO spelling_item_state (
      learner_id, slug, progress_json, guardian_json, pattern_json,
      updated_at, updated_by_account_id
    ) VALUES (?, ?, ?, NULL, NULL, ?, 'adult-submit-ws')
  `);
  for (const slug of historical) {
    insertItem.run(
      learnerId,
      slug,
      JSON.stringify({ stage: 4, attempts: 4, correct: 4, wrong: 0, dueDay: 1 }),
      NOW,
    );
  }
}

test('submit-answer working-set bind stays on the current slug despite fat session history', async () => {
  const harness = createHarness();
  try {
    const start = await harness.command('start-session', {
      mode: 'single',
      slug: 'possess',
      length: 1,
    });
    assert.equal(start.response.status, 200, JSON.stringify(start.body));
    assert.equal(start.body.ok, true);

    fattenActiveSessionHistory(harness.DB, harness.learnerId, 'possess');

    const wrong = await harness.command('submit-answer', { typed: 'posess' });
    assert.equal(wrong.response.status, 200, JSON.stringify(wrong.body));
    assert.equal(wrong.body.ok, true);

    const slugs = workingSetSlugBind(wrong.queryLog);
    assert.deepEqual(
      slugs,
      ['possess'],
      `submit-answer must bind only the current slug; got ${slugs.length}: ${slugs.slice(0, 12).join(',')}`,
    );
  } finally {
    harness.close();
  }
});
