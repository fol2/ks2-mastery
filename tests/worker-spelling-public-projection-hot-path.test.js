// Spelling commands write a compact public_ui projection (bootstrap-sized)
// while the command subjectReadModel can stay richer for the active UI.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerApp } from '../worker/src/app.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';

const BASE_URL = 'https://repo.test';
const NOW = Date.UTC(2026, 0, 1);

function seed(DB) {
  DB.db.prepare(`
    INSERT INTO learner_profiles (
      id, name, year_group, avatar_color, goal, daily_minutes,
      created_at, updated_at, state_revision
    ) VALUES ('learner-pub', 'Learner', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(NOW, NOW);
  DB.db.prepare(`
    INSERT INTO adult_accounts (
      id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, repo_revision
    ) VALUES ('adult-pub', 'adult-pub@example.test', 'Adult', 'parent', 'learner-pub', ?, ?, 0)
  `).run(NOW, NOW);
  DB.db.prepare(`
    INSERT INTO account_learner_memberships (
      account_id, learner_id, role, sort_index, created_at, updated_at
    ) VALUES ('adult-pub', 'learner-pub', 'owner', 0, ?, ?)
  `).run(NOW, NOW);
}

async function command(app, env, { command: commandName, revision, payload, requestId }) {
  const response = await app.fetch(new Request(`${BASE_URL}/api/subjects/spelling/command`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ks2-dev-account-id': 'adult-pub',
    },
    body: JSON.stringify({
      command: commandName,
      learnerId: 'learner-pub',
      requestId,
      expectedLearnerRevision: revision,
      payload,
    }),
  }), env, {});
  return {
    response,
    body: await response.json(),
  };
}

test('submit-answer persists compact public_ui without feedback/analytics/audio', async () => {
  const DB = createMigratedSqliteD1Database();
  seed(DB);
  const app = createWorkerApp({ now: () => NOW });
  const env = {
    DB,
    AUTH_MODE: 'development-stub',
    ENVIRONMENT: 'test',
  };

  try {
    const start = await command(app, env, {
      command: 'start-session',
      revision: 0,
      payload: { mode: 'single', slug: 'possess', length: 1 },
      requestId: 'pub-start-1',
    });
    assert.equal(start.response.status, 200, JSON.stringify(start.body));
    // publicSubjectReadModel is write-side only (stripped before HTTP body,
    // same as Grammar); assert the persisted D1 projection instead.

    const revision = Number(start.body.mutation?.appliedRevision) || 1;
    const wrong = await command(app, env, {
      command: 'submit-answer',
      revision,
      payload: { typed: 'posess' },
      requestId: 'pub-wrong-1',
    });
    assert.equal(wrong.response.status, 200, JSON.stringify(wrong.body));
    assert.ok(wrong.body.subjectReadModel?.feedback, 'command UI keeps feedback');

    const row = DB.db.prepare(`
      SELECT public_ui_json, public_ui_updated_at, updated_at
      FROM spelling_learner_state
      WHERE learner_id = 'learner-pub'
    `).get();
    assert.ok(row?.public_ui_json, 'public_ui_json must be written');
    assert.equal(Number(row.public_ui_updated_at), Number(row.updated_at), 'public_ui must match source version');
    const publicUi = JSON.parse(row.public_ui_json);
    assert.equal(publicUi.feedback, null);
    assert.equal(publicUi.analytics, null);
    // Active-session projections keep a compact promptToken for bootstrap
    // replay; wrong-answer path remains in session so audio may be present.
    if (publicUi.audio) {
      assert.ok(publicUi.audio.promptToken, 'public audio must be token-only when present');
      assert.equal(Object.prototype.hasOwnProperty.call(publicUi.audio, 'transcript'), false);
    }
    assert.ok(!publicUi.session || !publicUi.session.status, 'public session must not carry status map');
    const publicBytes = Buffer.byteLength(row.public_ui_json, 'utf8');
    const commandBytes = Buffer.byteLength(JSON.stringify(wrong.body.subjectReadModel || {}), 'utf8');
    assert.ok(
      publicBytes <= commandBytes,
      `public_ui (${publicBytes}) should not exceed command subjectReadModel (${commandBytes})`,
    );
    assert.ok(publicBytes < 4_000, `public_ui should stay bootstrap-sized, got ${publicBytes} bytes`);
  } finally {
    DB.close();
  }
});
