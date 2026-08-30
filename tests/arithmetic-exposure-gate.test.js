import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { SUBJECT_EXPOSURE_GATES } from '../src/platform/core/subject-availability.js';
import {
  createWorkerApp,
  subjectExposureGatesFromEnv,
} from '../worker/src/app.js';
import { createWorkerSubjectRuntime } from '../worker/src/subjects/runtime.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';

function seedAccountLearner(DB) {
  const now = Date.UTC(2026, 0, 1);
  DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES ('learner-arithmetic-gate', 'Learner A', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(now, now);
  DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES ('adult-arithmetic-gate', 'adult@example.test', 'Adult A', 'parent', 'learner-arithmetic-gate', ?, ?, 0)
  `).run(now, now);
  DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES ('adult-arithmetic-gate', 'learner-arithmetic-gate', 'owner', 0, ?, ?)
  `).run(now, now);
}

function createHarness({ enabled }) {
  const DB = createMigratedSqliteD1Database();
  seedAccountLearner(DB);
  const app = createWorkerApp({
    now: () => Date.UTC(2026, 0, 1),
    subjectRuntime: createWorkerSubjectRuntime(),
  });
  const env = {
    DB,
    AUTH_MODE: 'development-stub',
    ENVIRONMENT: 'test',
    ARITHMETIC_SUBJECT_ENABLED: enabled ? 'true' : 'false',
  };

  async function startSession() {
    const response = await app.fetch(new Request('https://repo.test/api/subjects/arithmetic/command', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://repo.test',
        'x-ks2-dev-account-id': 'adult-arithmetic-gate',
      },
      body: JSON.stringify({
        command: 'start-session',
        learnerId: 'learner-arithmetic-gate',
        requestId: `arithmetic-gate-${enabled ? 'enabled' : 'disabled'}`,
        expectedLearnerRevision: 0,
        payload: { mode: 'smart', goal: '10q' },
      }),
    }), env, {});
    return { response, body: await response.json() };
  }

  return { DB, startSession };
}

test('Arithmetic exposure gate defaults off and only accepts an explicit enabled env flag', () => {
  assert.equal(
    subjectExposureGatesFromEnv({})[SUBJECT_EXPOSURE_GATES.arithmetic],
    false,
  );
  assert.equal(
    subjectExposureGatesFromEnv({ ARITHMETIC_SUBJECT_ENABLED: 'true' })[SUBJECT_EXPOSURE_GATES.arithmetic],
    true,
  );
});

test('Arithmetic production configuration keeps the exposure gate off', async () => {
  const wranglerConfig = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(wranglerConfig, /"ARITHMETIC_SUBJECT_ENABLED"\s*:\s*"false"/);
});

test('Arithmetic Worker commands fail closed without creating learner runtime rows', async () => {
  const harness = createHarness({ enabled: false });
  try {
    const result = await harness.startSession();
    assert.equal(result.response.status, 404);
    assert.equal(result.body.code, 'subject_command_not_found');

    const subjectRows = harness.DB.db.prepare(`
      SELECT COUNT(*) AS count FROM child_subject_state
      WHERE learner_id = 'learner-arithmetic-gate' AND subject_id = 'arithmetic'
    `).get();
    const sessionRows = harness.DB.db.prepare(`
      SELECT COUNT(*) AS count FROM practice_sessions
      WHERE learner_id = 'learner-arithmetic-gate' AND subject_id = 'arithmetic'
    `).get();
    assert.equal(subjectRows.count, 0);
    assert.equal(sessionRows.count, 0);
  } finally {
    harness.DB.close();
  }
});

test('Enabled Arithmetic Worker path returns a redacted active-question read model', async () => {
  const harness = createHarness({ enabled: true });
  try {
    const result = await harness.startSession();
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.subjectId, 'arithmetic');
    assert.equal(result.body.subjectReadModel.phase, 'session');
    assert.ok(result.body.subjectReadModel.session.currentQuestion.id);
    assert.equal(result.body.subjectReadModel.session.currentQuestion.expected, undefined);
    assert.equal(result.body.subjectReadModel.session.currentQuestion.answer, undefined);
    assert.equal(result.body.subjectReadModel.session.currentQuestion.answerText, undefined);
    assert.equal(result.body.subjectReadModel.session.currentQuestion.solutionLines, undefined);
    assert.equal(result.body.subjectReadModel.session.currentQuestion.templateId, undefined);
    assert.equal(result.body.subjectReadModel.session.currentQuestion.seed, undefined);

    const subjectRows = harness.DB.db.prepare(`
      SELECT COUNT(*) AS count FROM child_subject_state
      WHERE learner_id = 'learner-arithmetic-gate' AND subject_id = 'arithmetic'
    `).get();
    const sessionRows = harness.DB.db.prepare(`
      SELECT COUNT(*) AS count FROM practice_sessions
      WHERE learner_id = 'learner-arithmetic-gate' AND subject_id = 'arithmetic' AND status = 'active'
    `).get();
    assert.equal(subjectRows.count, 1);
    assert.equal(sessionRows.count, 1);
  } finally {
    harness.DB.close();
  }
});
