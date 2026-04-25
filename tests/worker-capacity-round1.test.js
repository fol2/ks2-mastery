import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerApp } from '../worker/src/app.js';
import {
  CapacityCollector,
  capacityRequest,
} from '../worker/src/logger.js';
import { withCapacityCollector } from '../worker/src/d1.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';

const BASE_URL = 'https://repo.test';
const NOW = Date.UTC(2026, 0, 1);
const VALID_REQUEST_ID = 'ks2_req_12345678-9abc-4def-89ab-123456789abc';

function seedAccount(DB, {
  accountId = 'adult-a',
  learnerId = 'learner-a',
  accountType = 'real',
  demoExpiresAt = null,
} = {}) {
  DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES (?, 'Learner', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(learnerId, NOW, NOW);
  DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, account_type, demo_expires_at, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES (?, ?, 'Adult', 'parent', ?, ?, ?, ?, ?, 0)
  `).run(
    accountId,
    accountType === 'demo' ? null : `${accountId}@example.test`,
    accountType,
    demoExpiresAt,
    learnerId,
    NOW,
    NOW,
  );
  DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, ?, 'owner', 0, ?, ?)
  `).run(accountId, learnerId, NOW, NOW);
}

function createHarness(opts = {}) {
  const DB = createMigratedSqliteD1Database();
  seedAccount(DB, opts);
  const app = createWorkerApp({ now: () => NOW });
  const env = { DB, AUTH_MODE: 'development-stub', ENVIRONMENT: 'test' };
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => { logs.push(args); };
  return {
    DB,
    app,
    env,
    logs,
    close() {
      console.log = originalLog;
      DB.close();
    },
    extractCapacityLogs() {
      return logs
        .filter(([prefix, payload]) => prefix === '[ks2-worker]' && typeof payload === 'string')
        .map(([, payload]) => { try { return JSON.parse(payload); } catch { return null; } })
        .filter((entry) => entry && entry.event === 'capacity.request');
    },
  };
}

//
// P0 #01 — signals[] allowlist (r1-adv-01)
//
test('P0#01 addSignal rejects arbitrary tokens outside the documented allowlist', () => {
  const collector = new CapacityCollector({ requestId: VALID_REQUEST_ID });
  const pii = 'db_error: learner-emma-1999 duplicate INSERT token=abc123';
  collector.addSignal(pii);
  collector.addSignal('rateLimited'); // allowed
  collector.setFinal({ status: 200, wallMs: 1, responseBytes: 100 });

  assert.ok(!collector.signals.includes(pii), 'PII token must be silently rejected');
  assert.ok(collector.signals.includes('rateLimited'), 'allowlisted token must be retained');
  assert.equal(collector.signalsRejected, 1, 'rejected count must track misuse');

  const publicJson = collector.toPublicJSON();
  const log = collector.toStructuredLog();
  assert.ok(!publicJson.signals.includes(pii), 'PII must never reach public JSON');
  assert.ok(!log.signals.includes(pii), 'PII must never reach structured log');
  // Internal counter is NOT in toPublicJSON().
  assert.ok(!('signalsRejected' in publicJson), 'signalsRejected must not leak publicly');
});

test('P0#01 addSignal accepts every documented allowlist token', () => {
  const collector = new CapacityCollector({ requestId: VALID_REQUEST_ID });
  const allowed = [
    'exceededCpu',
    'd1Overloaded',
    'd1DailyLimit',
    'rateLimited',
    'networkFailure',
    'server5xx',
    'bootstrapFallback',
    'projectionFallback',
    'derivedWriteSkipped',
    'breakerTransition',
  ];
  for (const token of allowed) collector.addSignal(token);
  assert.equal(collector.signals.length, allowed.length);
  assert.equal(collector.signalsRejected, 0);
});

//
// P0 #02 — Buffer runtime (r1-adv-02)
//
test('P0#02 app.js does not reference the Node-only Buffer global', async () => {
  // Scan the source code: Workers runtime does not expose `Buffer`
  // without `nodejs_compat`, and we intentionally do NOT enable that
  // flag (wrangler.jsonc keeps the existing TextEncoder-only pattern
  // shared with auth.js, http.js, repository.js). A runtime probe is
  // infeasible here because Node's `fetch()` depends on undici which in
  // turn calls `Buffer.alloc()` internally; the surgical contract is the
  // source-level absence of `Buffer.` in our worker entrypoints.
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const appSrc = fs.readFileSync(path.join(here, '..', 'worker', 'src', 'app.js'), 'utf8');
  assert.equal(
    appSrc.includes('Buffer.'),
    false,
    'worker/src/app.js must not reference Buffer; use measureUtf8Bytes instead.',
  );
  const loggerSrc = fs.readFileSync(path.join(here, '..', 'worker', 'src', 'logger.js'), 'utf8');
  assert.equal(
    loggerSrc.includes('Buffer.'),
    false,
    'worker/src/logger.js must not reference Buffer.',
  );
});

test('P0#02 measureUtf8Bytes computes correct byte length without Buffer', async () => {
  const { measureUtf8Bytes } = await import('../worker/src/logger.js');
  assert.equal(measureUtf8Bytes(''), 0);
  assert.equal(measureUtf8Bytes('abc'), 3);
  assert.equal(measureUtf8Bytes('é'), 2); // e-acute is 2 bytes UTF-8
  assert.equal(measureUtf8Bytes('😀'), 4); // grinning-face emoji
  assert.equal(measureUtf8Bytes(null), 0);
  assert.equal(measureUtf8Bytes(undefined), 0);
});

//
// P1 #03 — Proxy coverage gap (r1-adv-03)
//
test('P1#03 demo subject command queryCount matches actual D1 queries (proxy threaded)', async () => {
  const harness = createHarness({
    accountId: 'demo-c',
    learnerId: 'demo-learner-c',
    accountType: 'demo',
    demoExpiresAt: NOW + 60_000,
  });
  try {
    harness.DB.clearQueryLog();
    await harness.app.fetch(
      new Request(`${BASE_URL}/api/subjects/spelling/command`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: BASE_URL,
          'x-ks2-dev-account-id': 'demo-c',
          'x-ks2-dev-demo': '1',
          'x-ks2-dev-demo-expires-at': String(NOW + 60_000),
          'x-ks2-request-id': VALID_REQUEST_ID,
        },
        body: JSON.stringify({
          command: 'start-session',
          learnerId: 'demo-learner-c',
          requestId: 'demo-start-1',
          expectedLearnerRevision: 0,
          payload: { mode: 'single', slug: 'possess', length: 1 },
        }),
      }),
      harness.env,
      {},
    );
    const actualQueries = harness.DB.queryLog.length;
    const capLogs = harness.extractCapacityLogs().filter((e) => e.requestId === VALID_REQUEST_ID);
    assert.equal(capLogs.length, 1, 'exactly one capacity log for the command');
    const reported = capLogs[0].queryCount;
    // After the fix, reported MUST equal actualQueries (every query goes
    // through the collector proxy). Before the fix, reported was strictly
    // less because demo rate-limit queries + requireActiveDemoAccount
    // bypassed the wrapper.
    assert.equal(
      reported,
      actualQueries,
      `demo command queryCount (${reported}) must match sqlite oracle (${actualQueries})`,
    );
  } finally {
    harness.close();
  }
});

test('P1#03 demo bootstrap requireActiveDemoAccount query is counted', async () => {
  const harness = createHarness({
    accountId: 'demo-d',
    learnerId: 'demo-learner-d',
    accountType: 'demo',
    demoExpiresAt: NOW + 60_000,
  });
  try {
    harness.DB.clearQueryLog();
    await harness.app.fetch(
      new Request(`${BASE_URL}/api/bootstrap`, {
        method: 'GET',
        headers: {
          'x-ks2-dev-account-id': 'demo-d',
          'x-ks2-dev-demo': '1',
          'x-ks2-dev-demo-expires-at': String(NOW + 60_000),
          'x-ks2-request-id': VALID_REQUEST_ID,
        },
      }),
      harness.env,
      {},
    );
    const actualQueries = harness.DB.queryLog.length;
    const capLogs = harness.extractCapacityLogs().filter((e) => e.requestId === VALID_REQUEST_ID);
    assert.equal(capLogs.length, 1);
    assert.equal(
      capLogs[0].queryCount,
      actualQueries,
      `bootstrap queryCount (${capLogs[0].queryCount}) must match sqlite oracle (${actualQueries})`,
    );
  } finally {
    harness.close();
  }
});

//
// P1 #04 — Pre-route 401 force-log (r1-adv-04)
//
test('P1#04 pre-route 401 is force-logged regardless of sample rate', () => {
  const collector = new CapacityCollector({ requestId: VALID_REQUEST_ID });
  collector.setFinal({ status: 401, wallMs: 2, responseBytes: 50, phase: 'pre-route' });
  const captured = [];
  const consoleRef = { log: (...args) => captured.push(args) };
  // Simulate sample rate 0.1 with random() returning 0.5 (would suppress).
  for (let i = 0; i < 10; i += 1) {
    capacityRequest(collector, {
      env: { CAPACITY_LOG_SAMPLE_RATE: '0.1' },
      random: () => 0.5,
      console: consoleRef,
    });
  }
  assert.equal(captured.length, 10, 'pre-route 401 must force-log all 10 attempts');
});

test('P1#04 non-pre-route 401 is still sampled', () => {
  const collector = new CapacityCollector({ requestId: VALID_REQUEST_ID });
  collector.setFinal({ status: 401, wallMs: 2, responseBytes: 50 });
  const captured = [];
  const consoleRef = { log: (...args) => captured.push(args) };
  for (let i = 0; i < 10; i += 1) {
    capacityRequest(collector, {
      env: { CAPACITY_LOG_SAMPLE_RATE: '0.1' },
      random: () => 0.5,
      console: consoleRef,
    });
  }
  // random=0.5 >= rate 0.1, so all suppressed.
  assert.equal(captured.length, 0, 'non-pre-route 401 remains sampled');
});

//
// P1 #05 — bootstrapCapacity shape validation (r1-adv-05)
//
test('P1#05 setBootstrapCapacity strips unknown keys and counts drops', () => {
  const collector = new CapacityCollector({ requestId: VALID_REQUEST_ID });
  collector.setBootstrapCapacity({
    version: 1,
    mode: 'public-bounded',
    password: 'X',
    learnerName: 'emma-secret',
  });
  assert.ok(collector.bootstrapCapacity && typeof collector.bootstrapCapacity === 'object');
  assert.equal(collector.bootstrapCapacity.version, 1);
  assert.equal(collector.bootstrapCapacity.mode, 'public-bounded');
  assert.ok(!('password' in collector.bootstrapCapacity));
  assert.ok(!('learnerName' in collector.bootstrapCapacity));
  assert.ok(collector.bootstrapCapacityDroppedKeys >= 2);
});

test('P1#05 setBootstrapCapacity rejects non-object values', () => {
  const collector = new CapacityCollector({ requestId: VALID_REQUEST_ID });
  collector.setBootstrapCapacity('string');
  assert.equal(collector.bootstrapCapacity, null);
  collector.setBootstrapCapacity(42);
  assert.equal(collector.bootstrapCapacity, null);
  collector.setBootstrapCapacity([1, 2, 3]);
  assert.equal(collector.bootstrapCapacity, null);
});

test('P1#05 setBootstrapMode only accepts closed-set strings', () => {
  const collector = new CapacityCollector({ requestId: VALID_REQUEST_ID });
  collector.setBootstrapMode('fresh');
  assert.equal(collector.bootstrapMode, 'fresh');
  collector.setBootstrapMode('not-a-mode');
  assert.equal(collector.bootstrapMode, 'fresh', 'invalid mode must be ignored');
  collector.setBootstrapMode({ evil: true });
  assert.equal(collector.bootstrapMode, 'fresh');
});

test('P1#05 setProjectionFallback / setDerivedWriteSkipped only accept boolean', () => {
  const collector = new CapacityCollector({ requestId: VALID_REQUEST_ID });
  collector.setProjectionFallback(true);
  assert.equal(collector.projectionFallback, true);
  collector.setProjectionFallback({ ok: false });
  assert.equal(collector.projectionFallback, true, 'non-boolean must be ignored');
  collector.setDerivedWriteSkipped(false);
  assert.equal(collector.derivedWriteSkipped, false);
  collector.setDerivedWriteSkipped('true');
  assert.equal(collector.derivedWriteSkipped, false);
});

//
// P2 #06 — addSignal post-final guard
//
test('P2#06 addSignal after setFinal is a no-op', () => {
  const collector = new CapacityCollector({ requestId: VALID_REQUEST_ID });
  collector.addSignal('rateLimited');
  collector.setFinal({ status: 200, wallMs: 1, responseBytes: 10 });
  collector.addSignal('bootstrapFallback');
  assert.equal(collector.signals.length, 1, 'post-final addSignal must be a no-op');
  assert.deepEqual(collector.signals, ['rateLimited']);
});

//
// P2 #08 — setFinal partial handling (absent keys must not zero-overwrite)
//
test('P2#08 setFinal with partial payload preserves previously set values', () => {
  const collector = new CapacityCollector({ requestId: VALID_REQUEST_ID });
  collector.setFinal({ status: 200, wallMs: 5, responseBytes: 1024 });
  collector.setFinal({ phase: 'pre-route' });
  // pre-setFinal state must survive the second partial call.
  assert.equal(collector.status, 200);
  assert.equal(collector.wallMs, 5);
  assert.equal(collector.responseBytes, 1024);
  assert.equal(collector.phase, 'pre-route');
});

//
// P3 #10 — FIFO retention at STATEMENT_HARD_CAP
//
test('P3#10 statements[] retains FIFO: first 50 kept when 75 recorded', () => {
  const collector = new CapacityCollector({ requestId: VALID_REQUEST_ID });
  for (let i = 0; i < 75; i += 1) {
    collector.recordStatement({
      name: `named-${i}`,
      rowsRead: 1,
      rowsWritten: 0,
      durationMs: 1,
    });
  }
  assert.equal(collector.statements.length, 50);
  assert.equal(collector.statements[0].name, 'named-0');
  assert.equal(collector.statements[49].name, 'named-49');
  assert.equal(collector.statementsTruncated, true);
  assert.equal(collector.queryCount, 75);
});
