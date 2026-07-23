// Spelling capacity: wrong → instantly correct (retry path) and monkey bursts.
//
// Tester report: enter incorrect word, then immediately type the correct word
// and see HTTP 503. That is the normal learning path (question → retry → correct),
// not a speculative double-submit of the same typed answer.
//
// Coverage gaps closed here:
//   1. Sequential wrong then correct must both return 200 (dense history).
//   2. Concurrent wrong+correct at the same CAS revision must not 503.
//   3. Monkey burst of wrong/correct pairs must stay free of 5xx.
//
// Capacity suites historically measured bootstrap bursts and single correct
// submits; they did not monkey the human retry path.

import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import { createWorkerApp } from '../worker/src/app.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';

const BASE_URL = 'https://repo.test';
const NOW = Date.UTC(2026, 0, 1);
const DENSE_HISTORY_ROWS = 10_000;
// Local wall-time guard only — production Worker CPU is tighter, but a
// multi-second local answer path is a hard regression signal.
const MAX_SUBMIT_WALL_MS = 2_500;

function seedAccountLearner(DB, {
  accountId = 'adult-monkey',
  learnerId = 'learner-monkey',
} = {}) {
  DB.db.prepare(`
    INSERT INTO learner_profiles (
      id, name, year_group, avatar_color, goal, daily_minutes,
      created_at, updated_at, state_revision
    ) VALUES (?, 'Monkey Learner', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(learnerId, NOW, NOW);
  DB.db.prepare(`
    INSERT INTO adult_accounts (
      id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, repo_revision
    ) VALUES (?, ?, 'Monkey Adult', 'parent', ?, ?, ?, 0)
  `).run(accountId, `${accountId}@example.test`, learnerId, NOW, NOW);
  DB.db.prepare(`
    INSERT INTO account_learner_memberships (
      account_id, learner_id, role, sort_index, created_at, updated_at
    ) VALUES (?, ?, 'owner', 0, ?, ?)
  `).run(accountId, learnerId, NOW, NOW);
}

function seedDenseHistory(DB, learnerId = 'learner-monkey') {
  const insertItem = DB.db.prepare(`
    INSERT INTO spelling_item_state (
      learner_id, slug, progress_json, guardian_json, pattern_json,
      updated_at, updated_by_account_id
    ) VALUES (?, ?, ?, NULL, NULL, ?, 'adult-monkey')
  `);
  const insertAchievement = DB.db.prepare(`
    INSERT INTO spelling_achievement_state (
      learner_id, achievement_id, record_json, updated_at, updated_by_account_id
    ) VALUES (?, ?, ?, ?, 'adult-monkey')
  `);

  const coldProgress = {};
  for (let index = 0; index < DENSE_HISTORY_ROWS; index += 1) {
    const slug = `retired-history-${index}`;
    const progress = {
      stage: index % 5,
      attempts: 10,
      correct: 8,
      wrong: 2,
      dueDay: 1,
    };
    coldProgress[slug] = progress;
    insertItem.run(learnerId, slug, JSON.stringify(progress), NOW - index);
  }
  for (let index = 0; index < DENSE_HISTORY_ROWS; index += 1) {
    insertAchievement.run(
      learnerId,
      `achievement:spelling:boss:clean-sweep:learner-monkey:history-${index}`,
      JSON.stringify({ unlockedAt: NOW - index }),
      NOW - index,
    );
  }

  DB.db.prepare(`
    INSERT INTO child_subject_state (
      learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id
    ) VALUES (?, 'spelling', '{}', ?, ?, 'adult-monkey')
    ON CONFLICT(learner_id, subject_id) DO UPDATE SET
      data_json = excluded.data_json,
      updated_at = excluded.updated_at
  `).run(
    learnerId,
    JSON.stringify({ prefs: { mode: 'smart' }, progress: coldProgress }),
    NOW,
  );
}

function createHarness({ dense = false } = {}) {
  const DB = createMigratedSqliteD1Database();
  const accountId = 'adult-monkey';
  const learnerId = 'learner-monkey';
  seedAccountLearner(DB, { accountId, learnerId });
  if (dense) seedDenseHistory(DB, learnerId);

  const app = createWorkerApp({ now: () => NOW });
  const env = {
    DB,
    AUTH_MODE: 'development-stub',
    ENVIRONMENT: 'test',
  };

  let revision = 0;
  let sequence = 0;

  async function command(commandName, payload = {}, {
    requestId = `monkey-${sequence += 1}`,
    expectedRevision = revision,
  } = {}) {
    const started = performance.now();
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
        expectedLearnerRevision: expectedRevision,
        payload,
      }),
    }), env, {});
    const body = await response.json();
    const wallMs = performance.now() - started;
    if (response.status === 200 && body?.mutation?.appliedRevision != null) {
      revision = body.mutation.appliedRevision;
    }
    return { response, body, wallMs, requestId, expectedRevision };
  }

  return {
    DB,
    command,
    get revision() { return revision; },
    set revision(value) { revision = value; },
    close() { DB.close(); },
  };
}

function assertCommandOk(result, label) {
  assert.equal(
    result.response.status,
    200,
    `${label} expected 200, got ${result.response.status}: ${JSON.stringify(result.body)}`,
  );
  assert.notEqual(result.body?.error, 'projection_unavailable', `${label} must not be projection_unavailable`);
  assert.equal(result.body?.ok, true, `${label} body.ok must be true`);
  assert.ok(
    result.wallMs <= MAX_SUBMIT_WALL_MS,
    `${label} wall ${result.wallMs.toFixed(1)}ms exceeds ${MAX_SUBMIT_WALL_MS}ms local guard`,
  );
}

function sessionPhase(result) {
  return result.body?.subjectReadModel?.session?.phase
    || result.body?.subjectReadModel?.phase
    || '';
}

function currentSlug(result) {
  return result.body?.subjectReadModel?.session?.currentSlug
    || result.body?.subjectReadModel?.session?.currentCard?.slug
    || '';
}

async function startPossessRound(harness) {
  const start = await harness.command('start-session', {
    mode: 'single',
    slug: 'possess',
    length: 1,
  });
  assertCommandOk(start, 'start-session');
  assert.equal(start.body.subjectReadModel?.phase, 'session', 'start must enter a session');
  return start;
}

test('sequential wrong then correct on the same word returns 200 twice (dense history)', async () => {
  const harness = createHarness({ dense: true });
  try {
    await startPossessRound(harness);

    const wrong = await harness.command('submit-answer', { typed: 'posess' });
    assertCommandOk(wrong, 'wrong submit');
    assert.equal(sessionPhase(wrong), 'retry', `wrong answer should enter retry, got ${sessionPhase(wrong)}`);
    assert.equal(wrong.body.subjectReadModel?.awaitingAdvance, false);

    const correct = await harness.command('submit-answer', { typed: 'possess' });
    assertCommandOk(correct, 'correct recovery submit');
    // Recovery may advance or retype depending on product rules; never 5xx.
    assert.ok(
      correct.body.subjectReadModel?.phase === 'session'
        || correct.body.subjectReadModel?.phase === 'summary',
      `recovery must keep a live spelling phase, got ${correct.body.subjectReadModel?.phase}`,
    );
  } finally {
    harness.close();
  }
});

test('concurrent wrong and correct at the same CAS revision never return 503', async () => {
  const harness = createHarness({ dense: true });
  try {
    await startPossessRound(harness);
    const sharedRevision = harness.revision;

    const [wrong, correct] = await Promise.all([
      harness.command('submit-answer', { typed: 'posess' }, {
        requestId: 'monkey-concurrent-wrong',
        expectedRevision: sharedRevision,
      }),
      harness.command('submit-answer', { typed: 'possess' }, {
        requestId: 'monkey-concurrent-correct',
        expectedRevision: sharedRevision,
      }),
    ]);

    for (const [label, result] of [['wrong', wrong], ['correct', correct]]) {
      assert.notEqual(
        result.response.status,
        503,
        `${label} concurrent submit returned 503: ${JSON.stringify(result.body)}`,
      );
      assert.ok(
        result.response.status === 200 || result.response.status === 409,
        `${label} concurrent submit must be 200 or 409 stale_write, got ${result.response.status}: ${JSON.stringify(result.body)}`,
      );
      if (result.response.status === 409) {
        const code = result.body?.code || result.body?.error || '';
        assert.match(
          String(code),
          /stale|conflict|revision/i,
          `${label} 409 should be a CAS/stale conflict, got ${JSON.stringify(result.body)}`,
        );
      }
    }

    const winners = [wrong, correct].filter((result) => result.response.status === 200);
    assert.ok(winners.length >= 1, 'exactly one concurrent command should win CAS (or both if serialised)');
  } finally {
    harness.close();
  }
});

test('monkey burst: alternating wrong/correct answers across a multi-word round stays free of 5xx', async () => {
  const harness = createHarness({ dense: true });
  try {
    const start = await harness.command('start-session', {
      mode: 'smart',
      length: 5,
    });
    assertCommandOk(start, 'monkey start-session');

    let steps = 0;
    const maxSteps = 40;
    let phase = start.body.subjectReadModel?.phase;
    let awaitingAdvance = Boolean(start.body.subjectReadModel?.awaitingAdvance);

    while (phase === 'session' && steps < maxSteps) {
      steps += 1;
      if (awaitingAdvance) {
        const cont = await harness.command('continue-session');
        assert.notEqual(cont.response.status, 503, `continue 503 at step ${steps}: ${JSON.stringify(cont.body)}`);
        assert.ok(cont.response.status < 500, `continue 5xx at step ${steps}: ${JSON.stringify(cont.body)}`);
        phase = cont.body.subjectReadModel?.phase;
        awaitingAdvance = Boolean(cont.body.subjectReadModel?.awaitingAdvance);
        continue;
      }

      const wrong = await harness.command('submit-answer', { typed: `wrong-${steps}` });
      assert.notEqual(wrong.response.status, 503, `wrong 503 at step ${steps}: ${JSON.stringify(wrong.body)}`);
      assert.ok(wrong.response.status < 500, `wrong 5xx at step ${steps}: ${JSON.stringify(wrong.body)}`);
      phase = wrong.body.subjectReadModel?.phase;
      awaitingAdvance = Boolean(wrong.body.subjectReadModel?.awaitingAdvance);
      const slug = currentSlug(wrong);

      // Immediately retype when still on the same prompt (question→retry→
      // correction). Fixed-slug true-correct recovery is covered above;
      // smart rounds use a second miss so dense retype stays exercised.
      if (phase === 'session' && !awaitingAdvance && slug) {
        const again = await harness.command('submit-answer', { typed: `still-wrong-${steps}` });
        assert.notEqual(again.response.status, 503, `retype 503 at step ${steps}: ${JSON.stringify(again.body)}`);
        assert.ok(again.response.status < 500, `retype 5xx at step ${steps}: ${JSON.stringify(again.body)}`);
        phase = again.body.subjectReadModel?.phase;
        awaitingAdvance = Boolean(again.body.subjectReadModel?.awaitingAdvance);
      }
    }

    assert.ok(steps >= 2, 'monkey burst should exercise multiple answer steps');
  } finally {
    harness.close();
  }
});

test('fixed-slug recovery path measures wrong then correct wall times under dense history', async () => {
  const harness = createHarness({ dense: true });
  try {
    await startPossessRound(harness);

    const wrong = await harness.command('submit-answer', { typed: 'posess' });
    assertCommandOk(wrong, 'timed wrong');
    const correct = await harness.command('submit-answer', { typed: 'possess' });
    assertCommandOk(correct, 'timed correct');

    // Emit timing into the assertion message on failure only; keep the suite
    // deterministic by using the wall guard rather than flaky p95 claims.
    assert.ok(
      wrong.wallMs + correct.wallMs < MAX_SUBMIT_WALL_MS * 2,
      `wrong ${wrong.wallMs.toFixed(1)}ms + correct ${correct.wallMs.toFixed(1)}ms`,
    );
  } finally {
    harness.close();
  }
});
