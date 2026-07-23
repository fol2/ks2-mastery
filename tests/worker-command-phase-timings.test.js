// Subject-command phase timings — structured-log only diagnostics for
// Nelson-shaped 1102 investigation. Must never appear on child-facing
// meta.capacity (same redaction contract as bootstrapPhaseTimings).

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerApp } from '../worker/src/app.js';
import { COMMAND_PHASE_TIMING_NAMES } from '../worker/src/subjects/command-contract.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';

const BASE_URL = 'https://repo.test';
const NOW = Date.UTC(2026, 0, 1);

function seedAccountLearner(DB, {
  accountId = 'adult-phase',
  learnerId = 'learner-phase',
} = {}) {
  DB.db.prepare(`
    INSERT INTO learner_profiles (
      id, name, year_group, avatar_color, goal, daily_minutes,
      created_at, updated_at, state_revision
    ) VALUES (?, 'Phase Learner', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(learnerId, NOW, NOW);
  DB.db.prepare(`
    INSERT INTO adult_accounts (
      id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, repo_revision
    ) VALUES (?, ?, 'Phase Adult', 'parent', ?, ?, ?, 0)
  `).run(accountId, `${accountId}@example.test`, learnerId, NOW, NOW);
  DB.db.prepare(`
    INSERT INTO account_learner_memberships (
      account_id, learner_id, role, sort_index, created_at, updated_at
    ) VALUES (?, ?, 'owner', 0, ?, ?)
  `).run(accountId, learnerId, NOW, NOW);
}

function captureConsole() {
  const lines = [];
  const original = console.log;
  console.log = (...args) => {
    lines.push(args.map(String).join(' '));
  };
  return {
    lines,
    restore() { console.log = original; },
  };
}

test('spelling submit-answer records commandPhaseTimings in structured log only', async () => {
  const DB = createMigratedSqliteD1Database();
  seedAccountLearner(DB);
  const app = createWorkerApp({ now: () => NOW });
  const env = {
    DB,
    AUTH_MODE: 'development-stub',
    ENVIRONMENT: 'test',
    CAPACITY_LOG_SAMPLE_RATE: '1',
  };
  const capture = captureConsole();

  try {
    const start = await app.fetch(new Request(`${BASE_URL}/api/subjects/spelling/command`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ks2-dev-account-id': 'adult-phase',
      },
      body: JSON.stringify({
        command: 'start-session',
        learnerId: 'learner-phase',
        requestId: 'phase-start-1',
        expectedLearnerRevision: 0,
        payload: { mode: 'single', slug: 'possess', length: 1 },
      }),
    }), env, {});
    const startBody = await start.json();
    assert.equal(start.status, 200, JSON.stringify(startBody));
    assert.equal('commandPhaseTimings' in (startBody.meta?.capacity || {}), false,
      'commandPhaseTimings must never appear on child-facing meta.capacity');

    const revision = Number(startBody.mutation?.appliedRevision) || 1;
    const submit = await app.fetch(new Request(`${BASE_URL}/api/subjects/spelling/command`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ks2-dev-account-id': 'adult-phase',
      },
      body: JSON.stringify({
        command: 'submit-answer',
        learnerId: 'learner-phase',
        requestId: 'phase-submit-1',
        expectedLearnerRevision: revision,
        payload: { typed: 'posess' },
      }),
    }), env, {});
    const submitBody = await submit.json();
    assert.equal(submit.status, 200, JSON.stringify(submitBody));
    assert.equal('commandPhaseTimings' in (submitBody.meta?.capacity || {}), false);

    const capacityLogs = capture.lines
      .filter((line) => line.startsWith('[ks2-worker] '))
      .map((line) => {
        try {
          return JSON.parse(line.slice('[ks2-worker] '.length));
        } catch {
          return null;
        }
      })
      .filter((entry) => entry?.event === 'capacity.request'
        && entry.endpoint === '/api/subjects/spelling/command');

    assert.ok(capacityLogs.length >= 2, `expected command capacity logs, got ${capacityLogs.length}`);
    const submitLog = capacityLogs.find((entry) => {
      const names = (entry.commandPhaseTimings || []).map((phase) => phase.name);
      return names.includes('engineApply') || names.includes('content');
    }) || capacityLogs[capacityLogs.length - 1];

    assert.ok(Array.isArray(submitLog.commandPhaseTimings), 'structured log must carry commandPhaseTimings');
    const allowed = new Set(COMMAND_PHASE_TIMING_NAMES);
    const names = new Set();
    for (const phase of submitLog.commandPhaseTimings) {
      names.add(phase.name);
      assert.ok(allowed.has(phase.name), `phase "${phase.name}" must be allowlisted`);
      assert.ok(Number.isFinite(phase.durationMs));
      assert.ok(phase.durationMs >= 0 && phase.durationMs <= 60_000);
      assert.deepEqual(Object.keys(phase).sort(), ['durationMs', 'name']);
    }
    for (const expected of ['preflight', 'content', 'engineApply', 'rewardProjection', 'readModelBuild', 'd1Batch']) {
      assert.ok(names.has(expected), `expected command phase "${expected}", got ${[...names].join(',')}`);
    }
    const phaseJson = JSON.stringify(submitLog.commandPhaseTimings);
    assert.equal(phaseJson.includes('posess'), false, 'typed answer must not leak into phase timings');
    assert.equal(phaseJson.includes('learner-phase'), false, 'learner id must not leak into phase timings');
  } finally {
    capture.restore();
    DB.close();
  }
});
