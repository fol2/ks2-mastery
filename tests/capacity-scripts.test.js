import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  parseClassroomLoadArgs,
  runClassroomLoadTest,
  summariseCapacityResults,
  validateClassroomLoadOptions,
} from '../scripts/classroom-load-test.mjs';
import { createGrammarQuestion } from '../worker/src/subjects/grammar/content.js';
import {
  buildTeardownCommand,
  buildWranglerSpawnCommand,
  parseLocalWorkerArgs,
  runLocalWorkerOrchestrator,
  sanitiseWranglerEnv,
  selectAvailablePort,
} from '../scripts/capacity-local-worker.mjs';
import {
  createRedactionStream,
  redactLogChunk,
  redactLogLine,
} from '../scripts/lib/log-redaction.mjs';

function jsonResponse(payload, init = {}) {
  const status = Number(init.status) || 200;
  const headers = Object.fromEntries(
    Object.entries({
      'content-type': 'application/json',
      ...(init.headers || {}),
    }).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return headers[String(name).toLowerCase()] || null;
      },
      getSetCookie() {
        const value = headers['set-cookie'];
        if (Array.isArray(value)) return value;
        return value ? [value] : [];
      },
    },
    async text() {
      return JSON.stringify(payload);
    },
  };
}

test('classroom load script dry-run reports the planned scenarios without network', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('dry-run should not fetch');
  };

  try {
    const report = await runClassroomLoadTest([
      '--dry-run',
      '--learners', '4',
      '--bootstrap-burst', '8',
      '--rounds', '2',
    ]);

    assert.equal(report.ok, true);
    assert.equal(report.dryRun, true);
    assert.equal(report.plan.virtualLearners.length, 4);
    assert.equal(report.plan.scenarios[0].name, 'cold-bootstrap-burst');
    assert.equal(report.plan.scenarios[0].requests, 8);
    assert.equal(report.plan.scenarios[1].name, 'human-paced-grammar-round');
    assert.equal(report.plan.scenarios[1].rounds, 2);
    assert.equal(report.plan.expectedRequests, 36);
    assert.equal(report.summary.totalRequests, 0);
    // Back-compat: absent threshold flags do not change the exit contract;
    // the block is reported but has zero configured limits and zero
    // violations so a script running with the old invocation keeps exiting 0.
    assert.equal(report.thresholds.configured, false);
    assert.deepEqual(report.thresholds.violations, []);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('classroom load local fixture creates isolated learners and request ids', async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  const commandBodies = [];
  const grammarQuestion = createGrammarQuestion({
    templateId: 'fronted_adverbial_choose',
    seed: 1,
  });

  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    calls.push({ url: String(url), init });

    if (parsed.pathname === '/api/demo/session') {
      const index = calls.filter((call) => new URL(call.url).pathname === '/api/demo/session').length;
      return jsonResponse({
        ok: true,
        session: {
          demo: true,
          accountId: `account-${index}`,
          learnerId: `learner-${index}`,
        },
      }, {
        status: 201,
        headers: {
          'set-cookie': `ks2_session=demo-${index}; Path=/; HttpOnly`,
        },
      });
    }

    const cookie = String(init.headers?.cookie || '');
    const learnerIndex = /demo-(\d+)/.exec(cookie)?.[1] || '1';
    const learnerId = `learner-${learnerIndex}`;

    if (parsed.pathname === '/api/bootstrap') {
      return jsonResponse({
        ok: true,
        learners: {
          selectedId: learnerId,
          byId: {
            [learnerId]: {
              id: learnerId,
              name: `Learner ${learnerIndex}`,
              stateRevision: 0,
            },
          },
          allIds: [learnerId],
        },
      });
    }

    if (parsed.pathname === '/api/subjects/grammar/command') {
      const body = JSON.parse(init.body);
      commandBodies.push(body);
      const appliedRevision = Number(body.expectedLearnerRevision || 0) + 1;
      const subjectReadModel = body.command === 'start-session'
        ? {
            phase: 'session',
            session: {
              currentItem: {
                templateId: 'fronted_adverbial_choose',
                seed: 1,
                inputSpec: grammarQuestion.inputSpec,
              },
            },
          }
        : { phase: body.command === 'submit-answer' ? 'feedback' : 'summary' };
      return jsonResponse({
        ok: true,
        mutation: { appliedRevision },
        subjectReadModel,
      });
    }

    return jsonResponse({ ok: false, code: 'not_found' }, { status: 404 });
  };

  try {
    const report = await runClassroomLoadTest([
      '--local-fixture',
      '--origin', 'http://localhost:8787',
      '--demo-sessions',
      '--bearer', 'real-token',
      '--header', 'cookie: ks2_session=header-real',
      '--header', 'x-trace-id: capacity-test',
      '--learners', '2',
      '--bootstrap-burst', '2',
      '--rounds', '1',
    ]);

    assert.equal(report.ok, true);
    assert.equal(report.summary.totalRequests, 12);
    assert.deepEqual(report.summary.statusCounts, { 200: 10, 201: 2 });
    assert.equal(commandBodies.length, 6);
    assert.deepEqual(new Set(commandBodies.map((body) => body.learnerId)), new Set(['learner-1', 'learner-2']));
    assert.equal(new Set(commandBodies.map((body) => body.requestId)).size, commandBodies.length);
    assert.equal(commandBodies.every((body) => body.requestId.startsWith(`load-${body.learnerId}-`)), true);
    const demoSessionCalls = calls.filter((call) => new URL(call.url).pathname === '/api/demo/session');
    const learnerCalls = calls.filter((call) => new URL(call.url).pathname !== '/api/demo/session');
    assert.equal(demoSessionCalls.length, 2);
    assert.equal(demoSessionCalls.every((call) => !call.init.headers.authorization), true);
    assert.equal(demoSessionCalls.every((call) => !call.init.headers.cookie), true);
    assert.equal(demoSessionCalls.every((call) => call.init.headers['x-trace-id'] === 'capacity-test'), true);
    assert.equal(learnerCalls.every((call) => !call.init.headers.authorization), true);
    assert.equal(learnerCalls.every((call) => String(call.init.headers.cookie || '').startsWith('ks2_session=demo-')), true);
    assert.equal(learnerCalls.every((call) => call.init.headers['x-trace-id'] === 'capacity-test'), true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('classroom load production mode refuses to run without explicit confirmation and auth', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('production guard should run before fetch');
  };

  try {
    await assert.rejects(
      () => runClassroomLoadTest([
        '--production',
        '--origin', 'https://ks2.eugnel.uk',
        '--learners', '1',
      ]),
      /production load requires --confirm-production-load and explicit auth configuration/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('classroom load production auth guard does not treat arbitrary headers as auth', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('production guard should run before fetch');
  };

  try {
    await assert.rejects(
      () => runClassroomLoadTest([
        '--production',
        '--origin', 'https://ks2.eugnel.uk',
        '--confirm-production-load',
        '--header', 'x-trace-id: only-trace',
        '--learners', '1',
      ]),
      /production load requires --confirm-production-load and explicit auth configuration/,
    );
    await assert.rejects(
      () => runClassroomLoadTest([
        '--production',
        '--origin', 'https://ks2.eugnel.uk',
        '--confirm-production-load',
        '--header', 'authorization:',
        '--learners', '1',
      ]),
      /production load requires --confirm-production-load and explicit auth configuration/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('classroom load production auth guard accepts explicit authorization headers', async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  const grammarQuestion = createGrammarQuestion({
    templateId: 'fronted_adverbial_choose',
    seed: 1,
  });

  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const parsed = new URL(String(url));
    if (parsed.pathname === '/api/bootstrap') {
      return jsonResponse({
        ok: true,
        learners: {
          selectedId: 'learner-real',
          byId: { 'learner-real': { stateRevision: 0 } },
          allIds: ['learner-real'],
        },
      });
    }
    if (parsed.pathname === '/api/subjects/grammar/command') {
      const body = JSON.parse(init.body);
      const subjectReadModel = body.command === 'start-session'
        ? {
            phase: 'session',
            session: {
              currentItem: {
                templateId: 'fronted_adverbial_choose',
                seed: 1,
                inputSpec: grammarQuestion.inputSpec,
              },
            },
          }
        : { phase: body.command === 'submit-answer' ? 'feedback' : 'summary' };
      return jsonResponse({
        ok: true,
        mutation: { appliedRevision: Number(body.expectedLearnerRevision || 0) + 1 },
        subjectReadModel,
      });
    }
    return jsonResponse({ ok: false, code: 'not_found' }, { status: 404 });
  };

  try {
    const report = await runClassroomLoadTest([
      '--production',
      '--origin', 'https://ks2.eugnel.uk',
      '--confirm-production-load',
      '--header', 'authorization: Bearer explicit',
      '--learners', '1',
      '--bootstrap-burst', '1',
      '--rounds', '1',
    ]);

    assert.equal(report.ok, true);
    assert.equal(report.summary.expectedRequests, 5);
    assert.equal(report.summary.totalRequests, 5);
    assert.equal(calls.every((call) => call.init.headers.authorization === 'Bearer explicit'), true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('classroom load demo sessions fail closed instead of falling back to operator cookies', async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (new URL(String(url)).pathname === '/api/demo/session') {
      return jsonResponse({
        ok: false,
        code: 'demo_unavailable',
        message: 'Demo session unavailable.',
      }, { status: 503 });
    }
    return jsonResponse({
      ok: true,
      learners: {
        selectedId: 'real-learner',
        byId: { 'real-learner': { stateRevision: 0 } },
        allIds: ['real-learner'],
      },
    });
  };

  try {
    await assert.rejects(
      () => runClassroomLoadTest([
        '--local-fixture',
        '--origin', 'http://localhost:8787',
        '--demo-sessions',
        '--cookie', 'ks2_session=real',
        '--learners', '1',
        '--bootstrap-burst', '1',
        '--rounds', '1',
      ]),
      /Demo session setup failed for learner-01; refusing to reuse global auth/,
    );
    assert.equal(calls.length, 1);
    assert.equal(new URL(calls[0].url).pathname, '/api/demo/session');
    assert.equal(calls[0].init.headers.cookie, undefined);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('classroom load summary groups operational failure signals', () => {
  const summary = summariseCapacityResults([
    {
      scenario: 'cold-bootstrap-burst',
      method: 'GET',
      endpoint: '/api/bootstrap',
      status: 503,
      ok: false,
      wallMs: 40,
      responseBytes: 120,
      code: 'exceeded_cpu',
      message: 'Worker CPU limit exceeded during bootstrap.',
    },
    {
      scenario: 'human-paced-grammar-round',
      method: 'POST',
      endpoint: '/api/subjects/grammar/command',
      status: 503,
      ok: false,
      wallMs: 55,
      responseBytes: 80,
      code: 'd1_overloaded',
      message: 'D1 overloaded.',
    },
    {
      scenario: 'initial-bootstrap',
      method: 'GET',
      endpoint: '/api/bootstrap',
      status: 401,
      ok: false,
      wallMs: 10,
      responseBytes: 40,
      code: 'unauthenticated',
      message: 'Authentication required.',
    },
  ], { expectedRequests: 3 });

  assert.equal(summary.ok, false);
  assert.deepEqual(summary.statusCounts, { 503: 2, 401: 1 });
  assert.equal(summary.endpointStatus['GET /api/bootstrap 503'], 1);
  assert.equal(summary.endpointStatus['POST /api/subjects/grammar/command 503'], 1);
  assert.equal(summary.endpointStatus['GET /api/bootstrap 401'], 1);
  assert.deepEqual(summary.signals, {
    exceededCpu: 1,
    d1Overloaded: 1,
    authFailure: 1,
  });
});

test('classroom load summary detects Worker 1102 from non-json failure text without exposing the body', async () => {
  const previousFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    headers: {
      get() { return 'text/html'; },
      getSetCookie() { return []; },
    },
    async text() {
      return '<html><title>Error 1102</title><body>Worker exceeded CPU time limit.</body></html>';
    },
  });

  try {
    const report = await runClassroomLoadTest([
      '--production',
      '--origin', 'https://ks2.eugnel.uk',
      '--confirm-production-load',
      '--cookie', 'ks2_session=real',
      '--learners', '1',
      '--bootstrap-burst', '1',
      '--rounds', '1',
    ]);

    assert.equal(report.ok, false);
    assert.equal(report.summary.signals.exceededCpu, report.summary.totalRequests);
    assert.equal(JSON.stringify(report).includes('Worker exceeded CPU time limit'), false);
    assert.equal(JSON.stringify(report).includes('Error 1102'), false);
    assert.equal(JSON.stringify(report).includes('Unexpected token'), false);
    assert.equal(JSON.stringify(report).includes('<html'), false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('parseClassroomLoadArgs collects threshold flags into options.thresholds', () => {
  const options = parseClassroomLoadArgs([
    '--dry-run',
    '--max-5xx', '0',
    '--max-network-failures', '0',
    '--max-bootstrap-p95-ms', '1000',
    '--max-command-p95-ms', '750',
    '--max-response-bytes', '600000',
    '--require-zero-signals',
    '--require-bootstrap-capacity',
    '--output', 'tmp/evidence.json',
    '--include-request-samples',
  ]);
  assert.equal(options.thresholds.max5xx, 0);
  assert.equal(options.thresholds.maxNetworkFailures, 0);
  assert.equal(options.thresholds.maxBootstrapP95Ms, 1000);
  assert.equal(options.thresholds.maxCommandP95Ms, 750);
  assert.equal(options.thresholds.maxResponseBytes, 600000);
  assert.equal(options.thresholds.requireZeroSignals, true);
  assert.equal(options.thresholds.requireBootstrapCapacity, true);
  assert.equal(options.output, 'tmp/evidence.json');
  assert.equal(options.includeRequestSamples, true);
});

test('parseClassroomLoadArgs rejects negative or non-integer threshold values', () => {
  assert.throws(() => parseClassroomLoadArgs(['--max-5xx', '-1']), /non-negative integer/);
  assert.throws(() => parseClassroomLoadArgs(['--max-bootstrap-p95-ms', '0']), /greater than zero/);
  assert.throws(() => parseClassroomLoadArgs(['--max-5xx', 'abc']), /non-negative integer/);
});

test('validateClassroomLoadOptions rejects --max-5xx without --max-network-failures', () => {
  // The pairing rule fires in local-fixture/production and in dry-run when
  // the paired flag is missing. In dry-run with both flags paired, PR #177
  // adv-001 then rejects the combination; that interaction is exercised by
  // the dedicated adv-001 test in capacity-thresholds.test.js.
  assert.throws(
    () => validateClassroomLoadOptions({
      mode: 'local-fixture',
      origin: 'http://localhost:8787',
      demoSessions: true,
      thresholds: { max5xx: 0 },
    }),
    /--max-5xx requires --max-network-failures/,
  );
  assert.doesNotThrow(
    () => validateClassroomLoadOptions({
      mode: 'local-fixture',
      origin: 'http://localhost:8787',
      demoSessions: true,
      thresholds: { max5xx: 0, maxNetworkFailures: 0 },
    }),
  );
});

test('classroom load happy-path test with all network-failure-paired thresholds passes and writes evidence', async () => {
  // PR #177 adv-001 forbids thresholds + dry-run: run this against a local
  // fixture with a mocked fetch so thresholds can be meaningfully evaluated.
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-capacity-'));
  const outputPath = join(tempDir, 'evidence.json');
  const previousFetch = globalThis.fetch;
  const okBootstrap = (overrides = {}) => ({
    ok: true,
    status: 200,
    headers: {
      get(name) {
        if (String(name).toLowerCase() === 'content-type') return 'application/json';
        if (String(name).toLowerCase() === 'set-cookie') return overrides.cookie || null;
        return null;
      },
      getSetCookie() { return overrides.cookie ? [overrides.cookie] : []; },
    },
    async text() { return JSON.stringify(overrides.payload || {}); },
  });
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/api/demo/session') {
      return okBootstrap({ cookie: 'ks2_session=fake; Path=/', payload: { session: { learnerId: 'l1', accountId: 'a1' } } });
    }
    if (parsed.pathname === '/api/bootstrap') {
      return okBootstrap({ payload: { learners: { selectedId: 'l1', byId: { l1: { stateRevision: 0 } } } } });
    }
    if (parsed.pathname === '/api/subjects/grammar/command') {
      return okBootstrap({ payload: { mutation: { appliedRevision: 1 }, subjectReadModel: { session: { currentItem: null } } } });
    }
    return okBootstrap();
  };
  try {
    const report = await runClassroomLoadTest([
      '--local-fixture',
      '--origin', 'http://localhost:8787',
      '--demo-sessions',
      '--learners', '2',
      '--bootstrap-burst', '4',
      '--rounds', '1',
      '--max-5xx', '0',
      '--max-network-failures', '0',
      '--max-bootstrap-p95-ms', '10000',
      '--output', outputPath,
    ]);
    assert.equal(report.ok, true);
    assert.equal(report.failures.length, 0);
    assert.equal(report.thresholds.max5xx.passed, true);
    assert.equal(report.thresholds.maxBootstrapP95Ms.configured, 10000);
    assert.equal(report.reportMeta.evidenceSchemaVersion, 1);
    assert.equal(report.evidencePath, outputPath);

    const written = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.equal(written.ok, true);
    // Evidence library normalises 'local-fixture' to 'local' for environment.
    assert.equal(written.reportMeta.environment, 'local');
    assert.equal(written.thresholds.max5xx.configured, 0);
    assert.equal(written.thresholds.max5xx.observed, 0);
    assert.equal(written.thresholds.max5xx.passed, true);
  } finally {
    globalThis.fetch = previousFetch;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('classroom load threshold-failing run exits ok=false and lists failing thresholds', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-capacity-'));
  const outputPath = join(tempDir, 'evidence.json');
  const previousFetch = globalThis.fetch;

  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/api/demo/session') {
      return {
        ok: true,
        status: 200,
        headers: {
          get(name) {
            if (String(name).toLowerCase() === 'content-type') return 'application/json';
            if (String(name).toLowerCase() === 'set-cookie') return 'ks2_session=fake; Path=/';
            return null;
          },
          getSetCookie() { return ['ks2_session=fake; Path=/']; },
        },
        async text() {
          return JSON.stringify({ session: { learnerId: 'l1', accountId: 'a1' } });
        },
      };
    }
    if (parsed.pathname === '/api/bootstrap') {
      return {
        ok: false,
        status: 500,
        headers: {
          get() { return 'application/json'; },
          getSetCookie() { return []; },
        },
        async text() { return JSON.stringify({ error: 'server error' }); },
      };
    }
    return {
      ok: false,
      status: 500,
      headers: {
        get() { return 'application/json'; },
        getSetCookie() { return []; },
      },
      async text() { return JSON.stringify({ error: 'server error' }); },
    };
  };

  try {
    const report = await runClassroomLoadTest([
      '--local-fixture',
      '--origin', 'http://localhost:8787',
      '--demo-sessions',
      '--learners', '1',
      '--bootstrap-burst', '1',
      '--rounds', '1',
      '--max-5xx', '0',
      '--max-network-failures', '0',
      '--output', outputPath,
    ]);
    assert.equal(report.ok, false);
    assert.ok(report.failures.includes('max5xx'));
    assert.equal(report.thresholds.max5xx.passed, false);
    const written = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.equal(written.ok, false);
    assert.ok(written.failures.includes('max5xx'));
  } finally {
    globalThis.fetch = previousFetch;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('classroom load loads pinned threshold config via --config', async () => {
  // PR #177 adv-001: thresholds + dry-run is rejected. Use --local-fixture
  // with a mocked fetch so the config-loaded thresholds can be evaluated.
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-capacity-'));
  const configPath = join(tempDir, 'test-config.json');
  const outputPath = join(tempDir, 'evidence.json');
  const previousFetch = globalThis.fetch;
  const ok = (payload, cookie) => ({
    ok: true,
    status: 200,
    headers: {
      get(name) {
        const n = String(name).toLowerCase();
        if (n === 'content-type') return 'application/json';
        if (n === 'set-cookie') return cookie || null;
        return null;
      },
      getSetCookie() { return cookie ? [cookie] : []; },
    },
    async text() { return JSON.stringify(payload); },
  });
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/api/demo/session') {
      return ok({ session: { learnerId: 'l1', accountId: 'a1' } }, 'ks2_session=fake; Path=/');
    }
    if (parsed.pathname === '/api/bootstrap') {
      return ok({ learners: { selectedId: 'l1', byId: { l1: { stateRevision: 0 } } } });
    }
    return ok({ mutation: { appliedRevision: 1 }, subjectReadModel: { session: { currentItem: null } } });
  };

  const { writeFileSync } = await import('node:fs');
  writeFileSync(configPath, JSON.stringify({
    tier: 'small-pilot-provisional',
    minEvidenceSchemaVersion: 1,
    thresholds: {
      max5xx: 0,
      maxNetworkFailures: 0,
      maxBootstrapP95Ms: 10000,
    },
  }));

  try {
    const report = await runClassroomLoadTest([
      '--local-fixture',
      '--origin', 'http://localhost:8787',
      '--demo-sessions',
      '--learners', '1',
      '--bootstrap-burst', '1',
      '--rounds', '1',
      '--config', configPath,
      '--output', outputPath,
    ]);
    assert.equal(report.ok, true);
    assert.equal(report.thresholds.max5xx.configured, 0);
    assert.equal(report.thresholds.maxBootstrapP95Ms.configured, 10000);
    assert.equal(report.tier.tier, 'small-pilot-provisional');
    assert.equal(report.tier.minEvidenceSchemaVersion, 1);
  } finally {
    globalThis.fetch = previousFetch;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('classroom load --output auto-names when no path given but flag requires value', () => {
  // The flag contract: --output requires a value. Auto-naming only happens in
  // a caller that chooses to pass an empty string explicitly. This test
  // documents the parse-level requirement.
  assert.throws(() => parseClassroomLoadArgs(['--output']), /--output requires a value/);
});

test('classroom load without --output does not persist evidence (no always-on write)', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('dry-run should not fetch'); };
  try {
    const report = await runClassroomLoadTest(['--dry-run', '--learners', '2']);
    assert.equal(report.evidencePath, undefined);
    // The report itself still carries the evidence envelope fields so that
    // callers can persist it manually if they wish — persistence is opt-in.
    assert.ok(report.reportMeta);
    assert.ok(report.thresholds);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('classroom load config-only max5xx is validated against maxNetworkFailures', async () => {
  // PR #177 adv-001 rejects thresholds + dry-run before the pairing rule fires,
  // so exercise the pairing rule against a local-fixture invocation where
  // thresholds are meaningful.
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-capacity-'));
  const configPath = join(tempDir, 'bad-config.json');
  const { writeFileSync } = await import('node:fs');
  // max5xx set, maxNetworkFailures deliberately missing.
  writeFileSync(configPath, JSON.stringify({
    tier: 'small-pilot-provisional',
    thresholds: { max5xx: 0 },
  }));
  try {
    await assert.rejects(
      runClassroomLoadTest([
        '--local-fixture',
        '--origin', 'http://localhost:8787',
        '--demo-sessions',
        '--config', configPath,
      ]),
      /--max-5xx requires --max-network-failures/,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('classroom load --config rejects unknown threshold keys', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-capacity-'));
  const configPath = join(tempDir, 'typo-config.json');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(configPath, JSON.stringify({
    tier: 'small-pilot-provisional',
    thresholds: { maxFivexx: 0, maxNetworkFailures: 0 },  // typo
  }));
  try {
    await assert.rejects(
      runClassroomLoadTest(['--dry-run', '--config', configPath]),
      /unknown keys: maxFivexx/,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('classroom load --config rejects missing file with clear error', async () => {
  await assert.rejects(
    runClassroomLoadTest(['--dry-run', '--config', '/nonexistent/path/config.json']),
    /Failed to read threshold config/,
  );
});

test('classroom load --config rejects invalid JSON with clear error', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-capacity-'));
  const configPath = join(tempDir, 'bad.json');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(configPath, 'not valid json {');
  try {
    await assert.rejects(
      runClassroomLoadTest(['--dry-run', '--config', configPath]),
      /is not valid JSON/,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('classroom load CLI threshold override beats config value (CLI precedence)', async () => {
  // PR #177 adv-001: thresholds + dry-run is rejected. Drive through
  // local-fixture + mocked fetch so the merged thresholds get evaluated.
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-capacity-'));
  const configPath = join(tempDir, 'config.json');
  const outputPath = join(tempDir, 'ev.json');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(configPath, JSON.stringify({
    tier: 'small-pilot-provisional',
    thresholds: { max5xx: 5, maxNetworkFailures: 5, maxBootstrapP95Ms: 2000 },
  }));
  const previousFetch = globalThis.fetch;
  const ok = (payload, cookie) => ({
    ok: true,
    status: 200,
    headers: {
      get(name) {
        const n = String(name).toLowerCase();
        if (n === 'content-type') return 'application/json';
        if (n === 'set-cookie') return cookie || null;
        return null;
      },
      getSetCookie() { return cookie ? [cookie] : []; },
    },
    async text() { return JSON.stringify(payload); },
  });
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/api/demo/session') {
      return ok({ session: { learnerId: 'l1', accountId: 'a1' } }, 'ks2_session=fake; Path=/');
    }
    if (parsed.pathname === '/api/bootstrap') {
      return ok({ learners: { selectedId: 'l1', byId: { l1: { stateRevision: 0 } } } });
    }
    return ok({ mutation: { appliedRevision: 1 }, subjectReadModel: { session: { currentItem: null } } });
  };
  try {
    const report = await runClassroomLoadTest([
      '--local-fixture',
      '--origin', 'http://localhost:8787',
      '--demo-sessions',
      '--learners', '1',
      '--bootstrap-burst', '1',
      '--rounds', '1',
      '--config', configPath,
      '--max-bootstrap-p95-ms', '500',
      '--output', outputPath,
    ]);
    assert.equal(report.thresholds.maxBootstrapP95Ms.configured, 500);
    assert.equal(report.thresholds.max5xx.configured, 5);
  } finally {
    globalThis.fetch = previousFetch;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// -----------------------------------------------------------------------------
// U4: capacity-local-worker orchestrator
// -----------------------------------------------------------------------------
//
// These tests mock the subprocess + network boundary so `wrangler dev` is
// never actually spawned. They exercise the port-selection, readiness-poll,
// teardown, redaction, and evidence-passthrough logic in isolation.

import { EventEmitter } from 'node:events';

// A deterministic fake child-process handle. Tests drive stdout/stderr and
// exit events explicitly so the orchestrator's polling + teardown paths are
// reproducible.
function createFakeChild({ pid = 9999 } = {}) {
  const child = new EventEmitter();
  child.pid = pid;
  child.killed = false;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = (signal) => {
    child.killed = true;
    child.lastSignal = signal || 'SIGTERM';
    return true;
  };
  return child;
}

// A fake port-bind probe. `busyPorts` is a Set of port numbers that should
// report EADDRINUSE; every other port succeeds immediately.
function createFakePortProbe(busyPorts = new Set()) {
  return (port) => {
    if (busyPorts.has(port)) {
      return Promise.resolve(false);
    }
    return Promise.resolve(true);
  };
}

// Happy-path readiness fetch mock. Two-stage: first call to /api/health → 200,
// second call to /api/demo/session (POST) → 200. Subsequent calls echo 200.
function createReadyFetch() {
  return async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/api/health') {
      return { ok: true, status: 200, async text() { return 'ok'; } };
    }
    if (parsed.pathname === '/api/demo/session') {
      return {
        ok: true,
        status: 200,
        async text() { return JSON.stringify({ ok: true }); },
      };
    }
    return { ok: true, status: 200, async text() { return ''; } };
  };
}

test('parseLocalWorkerArgs: --help, --fresh, --port-start, --readiness-timeout-ms, -- passthrough', () => {
  const a = parseLocalWorkerArgs([
    '--fresh',
    '--port-start', '9000',
    '--readiness-timeout-ms', '5000',
    '--',
    '--learners', '5',
    '--bootstrap-burst', '5',
    '--rounds', '1',
  ]);
  assert.equal(a.fresh, true);
  assert.equal(a.portStart, 9000);
  assert.equal(a.readinessTimeoutMs, 5000);
  assert.deepEqual(a.driverArgs, ['--learners', '5', '--bootstrap-burst', '5', '--rounds', '1']);

  const defaults = parseLocalWorkerArgs([]);
  assert.equal(defaults.fresh, false);
  assert.equal(defaults.portStart, 8787);
  assert.equal(defaults.readinessTimeoutMs, 30000);
  assert.deepEqual(defaults.driverArgs, []);

  const help = parseLocalWorkerArgs(['--help']);
  assert.equal(help.help, true);
});

test('sanitiseWranglerEnv strips CLOUDFLARE_API_TOKEN by default (defence-in-depth)', () => {
  const source = {
    PATH: '/usr/bin',
    CLOUDFLARE_API_TOKEN: 'secret-token-value',
    CLOUDFLARE_ACCOUNT_ID: 'acct-123',
  };
  const cleaned = sanitiseWranglerEnv(source);
  assert.equal(Object.prototype.hasOwnProperty.call(cleaned, 'CLOUDFLARE_API_TOKEN'), false);
  assert.equal(cleaned.PATH, '/usr/bin');
  assert.equal(cleaned.CLOUDFLARE_ACCOUNT_ID, 'acct-123');
  // Defensive: source object must not be mutated.
  assert.equal(source.CLOUDFLARE_API_TOKEN, 'secret-token-value');
});

test('sanitiseWranglerEnv keeps CLOUDFLARE_API_TOKEN when WORKERS_CI=1 (matches wrangler-oauth.mjs)', () => {
  const cleaned = sanitiseWranglerEnv({
    PATH: '/usr/bin',
    WORKERS_CI: '1',
    CLOUDFLARE_API_TOKEN: 'ci-token',
  });
  assert.equal(cleaned.CLOUDFLARE_API_TOKEN, 'ci-token');
});

test('buildWranglerSpawnCommand routes through scripts/wrangler-oauth.mjs', () => {
  const { cmd, args } = buildWranglerSpawnCommand({ port: 8787, platform: 'linux' });
  // Must invoke node on wrangler-oauth.mjs; never raw npx wrangler. This keeps
  // the oauth env stripper in the critical path.
  assert.equal(cmd, process.execPath);
  assert.ok(args[0] && args[0].endsWith('wrangler-oauth.mjs'), `expected oauth script, got ${args[0]}`);
  assert.ok(args.includes('dev'), 'must spawn wrangler dev');
  assert.ok(args.includes('--local'), 'must pass --local');
  assert.ok(args.includes('--port'), 'must specify --port');
  const portIndex = args.indexOf('--port');
  assert.equal(args[portIndex + 1], '8787');
});

test('buildTeardownCommand returns SIGINT descriptor on POSIX, taskkill descriptor on Windows', () => {
  const posix = buildTeardownCommand({ platform: 'linux', pid: 12345 });
  assert.equal(posix.kind, 'signal');
  assert.equal(posix.signal, 'SIGINT');

  const windows = buildTeardownCommand({ platform: 'win32', pid: 12345 });
  assert.equal(windows.kind, 'spawn');
  assert.equal(windows.cmd, 'taskkill');
  // /F force + /PID must be present; /T (tree) kills wrangler's child processes.
  assert.ok(windows.args.includes('/F'));
  assert.ok(windows.args.includes('/PID'));
  const pidIndex = windows.args.indexOf('/PID');
  assert.equal(windows.args[pidIndex + 1], '12345');
});

test('buildTeardownCommand rejects pids that are not positive integers (no injection via spaces)', () => {
  // Guard against any future code path that might accidentally pass a
  // string with spaces into taskkill's argv. argv-style spawn already avoids
  // shell quoting issues, but reject the malformed input early.
  assert.throws(
    () => buildTeardownCommand({ platform: 'win32', pid: '12345; evil.exe' }),
    /pid/i,
  );
  assert.throws(
    () => buildTeardownCommand({ platform: 'win32', pid: '' }),
    /pid/i,
  );
});

test('selectAvailablePort probes candidates in order and returns first free port', async () => {
  const probe = createFakePortProbe(new Set());
  const chosen = await selectAvailablePort([8787, 8788, 8789], { probe });
  assert.equal(chosen, 8787);
});

test('selectAvailablePort falls through busy ports to the next free one', async () => {
  const probe = createFakePortProbe(new Set([8787]));
  const chosen = await selectAvailablePort([8787, 8788, 8789], { probe });
  assert.equal(chosen, 8788);
});

test('selectAvailablePort returns null when every candidate is busy', async () => {
  const probe = createFakePortProbe(new Set([8787, 8788, 8789]));
  const chosen = await selectAvailablePort([8787, 8788, 8789], { probe });
  assert.equal(chosen, null);
});

test('redactLogLine scrubs ks2_session cookies, Bearer tokens, CLOUDFLARE_API_TOKEN assignments', () => {
  assert.equal(
    redactLogLine('cookie: ks2_session=abc.def.ghi; Path=/'),
    'cookie: ks2_session=[redacted]; Path=/',
  );
  assert.equal(
    redactLogLine('Authorization: Bearer eyJhbGci.realjwt.value'),
    'Authorization: Bearer [redacted]',
  );
  assert.equal(
    redactLogLine('env CLOUDFLARE_API_TOKEN=abc123xyz loaded'),
    'env CLOUDFLARE_API_TOKEN=[redacted] loaded',
  );
  // Idempotent: already-redacted strings must not be re-tagged.
  assert.equal(
    redactLogLine('cookie: ks2_session=[redacted]; Path=/'),
    'cookie: ks2_session=[redacted]; Path=/',
  );
  // Benign strings untouched.
  assert.equal(redactLogLine('wrangler ready on http://localhost:8787'), 'wrangler ready on http://localhost:8787');
});

test('redactLogLine redacts all three artefact classes in the same line', () => {
  // Matches the scenario-10 requirement: one line can carry all three leaks.
  const line = 'sent cookie: ks2_session=tok1; Authorization: Bearer tok2; CLOUDFLARE_API_TOKEN=tok3';
  const out = redactLogLine(line);
  assert.ok(!out.includes('tok1'), `token tok1 leaked: ${out}`);
  assert.ok(!out.includes('tok2'), `token tok2 leaked: ${out}`);
  assert.ok(!out.includes('tok3'), `token tok3 leaked: ${out}`);
  assert.ok(out.includes('[redacted]'));
});

// ---------------------------------------------------------------------------
// U4 scenario 1: happy path
// ---------------------------------------------------------------------------
test('capacity-local-worker orchestrator: happy path selects 8787, ready, driver runs, teardown, exit 0', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-localworker-'));
  const logPath = join(tempDir, 'local-worker-stdout.log');
  const evidencePath = join(tempDir, 'latest-local.json');

  const child = createFakeChild({ pid: 11111 });
  const spawnCalls = [];
  const migrationCalls = [];
  const driverCalls = [];
  const killCalls = [];

  // Write fake evidence eagerly when the driver "runs" so the orchestrator's
  // output check can find it.
  const { writeFileSync } = await import('node:fs');
  writeFileSync(evidencePath, JSON.stringify({ ok: true, reportMeta: { environment: 'local' } }));

  const injections = {
    platform: 'linux',
    spawn: (cmd, args, opts) => {
      spawnCalls.push({ cmd, args, env: opts && opts.env });
      // Emit a ready banner shortly so readiness log line is captured.
      setImmediate(() => child.stdout.emit('data', Buffer.from('Ready on http://localhost:8787\n')));
      return child;
    },
    probePort: createFakePortProbe(new Set()),
    fetch: createReadyFetch(),
    runMigrations: (env) => {
      migrationCalls.push({ env: { ...env } });
      return Promise.resolve({ exitCode: 0 });
    },
    runDriver: ({ argv, env }) => {
      driverCalls.push({ argv: [...argv], env: { ...env } });
      // Schedule child exit so teardown path completes.
      setImmediate(() => child.emit('exit', 0, null));
      return Promise.resolve({ exitCode: 0 });
    },
    killChild: (c, plan) => {
      killCalls.push({ pid: c.pid, plan });
      c.emit('exit', 0, null);
      return Promise.resolve();
    },
    logPath,
    evidencePath,
    nowMs: (() => { let n = 0; return () => { n += 50; return n; }; })(),
    sleep: () => Promise.resolve(),
  };

  const result = await runLocalWorkerOrchestrator([], injections);

  assert.equal(result.exitCode, 0);
  assert.equal(result.originResolved, 'http://localhost:8787');
  assert.equal(result.port, 8787);
  // Migrations ran before wrangler spawn.
  assert.equal(migrationCalls.length, 1);
  // Exactly one wrangler spawn (through oauth wrapper).
  assert.equal(spawnCalls.length, 1);
  const oauthScriptArg = spawnCalls[0].args[0];
  assert.ok(typeof oauthScriptArg === 'string' && oauthScriptArg.endsWith('wrangler-oauth.mjs'));
  // Driver invoked with --local-fixture and --origin localhost:8787.
  assert.equal(driverCalls.length, 1);
  assert.ok(driverCalls[0].argv.includes('--local-fixture'));
  assert.ok(driverCalls[0].argv.includes('--origin'));
  const originIdx = driverCalls[0].argv.indexOf('--origin');
  assert.equal(driverCalls[0].argv[originIdx + 1], 'http://localhost:8787');
  assert.ok(driverCalls[0].argv.includes('--demo-sessions'));
  // Teardown was invoked.
  assert.equal(killCalls.length, 1);
  // Evidence file exists.
  assert.ok(readFileSync(evidencePath, 'utf8'));

  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// U4 scenario 2: 8787 busy → falls through to 8788, logs chosen port
// ---------------------------------------------------------------------------
test('capacity-local-worker orchestrator: port 8787 busy falls through to 8788 and records in safety.originResolved', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-localworker-'));
  const logPath = join(tempDir, 'local-worker-stdout.log');
  const evidencePath = join(tempDir, 'latest-local.json');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(evidencePath, JSON.stringify({ ok: true, reportMeta: { environment: 'local' } }));

  const child = createFakeChild();
  const injections = {
    platform: 'linux',
    spawn: () => {
      setImmediate(() => child.stdout.emit('data', Buffer.from('Ready on http://localhost:8788\n')));
      return child;
    },
    probePort: createFakePortProbe(new Set([8787])),
    fetch: createReadyFetch(),
    runMigrations: () => Promise.resolve({ exitCode: 0 }),
    runDriver: () => {
      setImmediate(() => child.emit('exit', 0, null));
      return Promise.resolve({ exitCode: 0 });
    },
    killChild: (c) => { c.emit('exit', 0, null); return Promise.resolve(); },
    logPath,
    evidencePath,
    nowMs: (() => { let n = 0; return () => { n += 50; return n; }; })(),
    sleep: () => Promise.resolve(),
  };

  const result = await runLocalWorkerOrchestrator([], injections);
  assert.equal(result.exitCode, 0);
  assert.equal(result.port, 8788);
  assert.equal(result.originResolved, 'http://localhost:8788');

  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// U4 scenario 3: wrangler fails to start within 30s → kill, exit 2
// ---------------------------------------------------------------------------
test('capacity-local-worker orchestrator: readiness timeout kills subprocess, writes partial log, exits 2', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-localworker-'));
  const logPath = join(tempDir, 'local-worker-stdout.log');
  const evidencePath = join(tempDir, 'latest-local.json');

  const child = createFakeChild();
  const killCalls = [];
  // Fetch never returns ok (simulating wrangler never reaching readiness).
  const neverReadyFetch = async () => ({ ok: false, status: 503, async text() { return 'not ready'; } });

  const injections = {
    platform: 'linux',
    spawn: () => {
      setImmediate(() => child.stdout.emit('data', Buffer.from('starting...\n')));
      return child;
    },
    probePort: createFakePortProbe(new Set()),
    fetch: neverReadyFetch,
    runMigrations: () => Promise.resolve({ exitCode: 0 }),
    // Readiness timeout should prevent runDriver from being called at all.
    runDriver: () => { throw new Error('runDriver MUST NOT be called after readiness timeout'); },
    killChild: (c, plan) => { killCalls.push({ plan }); c.emit('exit', 1, 'SIGTERM'); return Promise.resolve(); },
    logPath,
    evidencePath,
    // Crank nowMs so the 30 000 ms hard cap is exceeded after the first few polls.
    nowMs: (() => {
      let n = 0;
      return () => {
        n += 5000;
        return n;
      };
    })(),
    sleep: () => Promise.resolve(),
    readinessTimeoutMs: 1000,
  };

  const result = await runLocalWorkerOrchestrator(['--readiness-timeout-ms', '1000'], injections);
  assert.equal(result.exitCode, 2, `expected exit 2, got ${result.exitCode}`);
  assert.equal(killCalls.length, 1);
  assert.ok(result.error && /readiness/i.test(result.error), `expected readiness error, got ${result.error}`);
  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// U4 scenario 4: load driver exits non-zero → still tears down, propagates exit
// ---------------------------------------------------------------------------
test('capacity-local-worker orchestrator: driver non-zero exit tears down wrangler and propagates exit code', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-localworker-'));
  const logPath = join(tempDir, 'local-worker-stdout.log');
  const evidencePath = join(tempDir, 'latest-local.json');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(evidencePath, JSON.stringify({ ok: false }));

  const child = createFakeChild();
  const killCalls = [];

  const injections = {
    platform: 'linux',
    spawn: () => {
      setImmediate(() => child.stdout.emit('data', Buffer.from('Ready\n')));
      return child;
    },
    probePort: createFakePortProbe(new Set()),
    fetch: createReadyFetch(),
    runMigrations: () => Promise.resolve({ exitCode: 0 }),
    runDriver: () => Promise.resolve({ exitCode: 7 }),
    killChild: (c, plan) => { killCalls.push({ plan }); c.emit('exit', 0, null); return Promise.resolve(); },
    logPath,
    evidencePath,
    nowMs: (() => { let n = 0; return () => { n += 50; return n; }; })(),
    sleep: () => Promise.resolve(),
  };

  const result = await runLocalWorkerOrchestrator([], injections);
  assert.equal(result.exitCode, 7);
  assert.equal(killCalls.length, 1, 'must still tear down wrangler when driver fails');
  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// U4 scenario 5: --fresh passthrough to driver, no auto-reset of .wrangler/state
// ---------------------------------------------------------------------------
test('capacity-local-worker orchestrator: --fresh is forwarded to the load driver, never auto-resets .wrangler/state', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-localworker-'));
  const logPath = join(tempDir, 'local-worker-stdout.log');
  const evidencePath = join(tempDir, 'latest-local.json');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(evidencePath, JSON.stringify({ ok: true }));

  const child = createFakeChild();
  let driverArgv = null;
  let stateResetCalled = false;

  const injections = {
    platform: 'linux',
    spawn: () => {
      setImmediate(() => child.stdout.emit('data', Buffer.from('Ready\n')));
      return child;
    },
    probePort: createFakePortProbe(new Set()),
    fetch: createReadyFetch(),
    runMigrations: () => Promise.resolve({ exitCode: 0 }),
    runDriver: ({ argv }) => { driverArgv = [...argv]; return Promise.resolve({ exitCode: 0 }); },
    killChild: (c) => { c.emit('exit', 0, null); return Promise.resolve(); },
    resetWranglerState: () => { stateResetCalled = true; },
    logPath,
    evidencePath,
    nowMs: (() => { let n = 0; return () => { n += 50; return n; }; })(),
    sleep: () => Promise.resolve(),
  };

  const result = await runLocalWorkerOrchestrator(['--fresh', '--', '--learners', '2'], injections);
  assert.equal(result.exitCode, 0);
  assert.ok(driverArgv.includes('--fresh'), `expected --fresh to be forwarded, got ${JSON.stringify(driverArgv)}`);
  assert.ok(driverArgv.includes('--learners'));
  assert.equal(stateResetCalled, false, 'v1 MUST NOT auto-reset .wrangler/state');

  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// U4 scenario 6: SIGINT during load → both children shut down, temp files cleaned
// ---------------------------------------------------------------------------
test('capacity-local-worker orchestrator: SIGINT during load tears down wrangler + driver and cleans temp files', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-localworker-'));
  const logPath = join(tempDir, 'local-worker-stdout.log');
  const evidencePath = join(tempDir, 'latest-local.json');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(evidencePath, JSON.stringify({ ok: false }));

  const child = createFakeChild();
  const killCalls = [];
  let driverAborted = false;

  const injections = {
    platform: 'linux',
    spawn: () => {
      setImmediate(() => child.stdout.emit('data', Buffer.from('Ready\n')));
      return child;
    },
    probePort: createFakePortProbe(new Set()),
    fetch: createReadyFetch(),
    runMigrations: () => Promise.resolve({ exitCode: 0 }),
    runDriver: ({ signal } = {}) => new Promise((resolve) => {
      // Listen for abort to mimic a real AbortController wiring.
      if (signal) {
        signal.addEventListener('abort', () => { driverAborted = true; resolve({ exitCode: 130 }); });
      }
    }),
    killChild: (c, plan) => { killCalls.push({ plan }); c.emit('exit', 130, 'SIGINT'); return Promise.resolve(); },
    logPath,
    evidencePath,
    nowMs: (() => { let n = 0; return () => { n += 50; return n; }; })(),
    sleep: () => Promise.resolve(),
    triggerSigint: true, // tells the orchestrator test-hook to fire SIGINT once readiness confirmed
  };

  const result = await runLocalWorkerOrchestrator([], injections);
  assert.equal(killCalls.length, 1, 'wrangler child torn down on SIGINT');
  assert.equal(driverAborted, true, 'driver abort signalled on SIGINT');
  assert.equal(result.exitCode, 130);

  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// U4 scenario 7: Windows path with spaces → taskkill argv array quoted safely
// ---------------------------------------------------------------------------
test('capacity-local-worker orchestrator: Windows teardown passes pid via argv array (never shell-quoted string)', () => {
  // Regression against shell-string injection: the teardown descriptor MUST be
  // argv-style so a path with spaces or shell metacharacters in the operator
  // environment cannot interact with taskkill's argv parser.
  const plan = buildTeardownCommand({ platform: 'win32', pid: 4567 });
  assert.equal(plan.kind, 'spawn');
  assert.ok(Array.isArray(plan.args), 'args MUST be argv array, not a concatenated string');
  // No entry should look like a concatenated PID-with-surrounding-whitespace.
  assert.ok(!plan.args.some((arg) => typeof arg === 'string' && /\s/.test(arg.trim()) && arg.trim() !== arg));
  // PID value specifically must be an exact match.
  const pidIdx = plan.args.indexOf('/PID');
  assert.equal(plan.args[pidIdx + 1], '4567');
});

// ---------------------------------------------------------------------------
// U4 scenario 8: integration — evidence JSON has env=local, origin=http://localhost:<port>
// ---------------------------------------------------------------------------
test('capacity-local-worker orchestrator: result reports env=local and origin=http://localhost:<port>', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-localworker-'));
  const logPath = join(tempDir, 'local-worker-stdout.log');
  const evidencePath = join(tempDir, 'latest-local.json');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(evidencePath, JSON.stringify({
    ok: true,
    reportMeta: { environment: 'local', origin: 'http://localhost:8789' },
  }));

  const child = createFakeChild();
  const injections = {
    platform: 'linux',
    spawn: () => {
      setImmediate(() => child.stdout.emit('data', Buffer.from('Ready\n')));
      return child;
    },
    probePort: createFakePortProbe(new Set([8787, 8788])),
    fetch: createReadyFetch(),
    runMigrations: () => Promise.resolve({ exitCode: 0 }),
    runDriver: () => Promise.resolve({ exitCode: 0 }),
    killChild: (c) => { c.emit('exit', 0, null); return Promise.resolve(); },
    logPath,
    evidencePath,
    nowMs: (() => { let n = 0; return () => { n += 50; return n; }; })(),
    sleep: () => Promise.resolve(),
  };

  const result = await runLocalWorkerOrchestrator([], injections);
  assert.equal(result.exitCode, 0);
  assert.equal(result.environment, 'local');
  assert.equal(result.originResolved, 'http://localhost:8789');
  assert.equal(result.port, 8789);
  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// U4 scenario 9 (CRITICAL): child-process env does NOT contain CLOUDFLARE_API_TOKEN
// ---------------------------------------------------------------------------
test('capacity-local-worker orchestrator: wrangler spawn env MUST NOT contain CLOUDFLARE_API_TOKEN', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-localworker-'));
  const logPath = join(tempDir, 'local-worker-stdout.log');
  const evidencePath = join(tempDir, 'latest-local.json');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(evidencePath, JSON.stringify({ ok: true }));

  const child = createFakeChild();
  let spawnEnv = null;

  // Seed a CLOUDFLARE_API_TOKEN in process.env for the duration of this test.
  const previousToken = process.env.CLOUDFLARE_API_TOKEN;
  const previousWorkersCi = process.env.WORKERS_CI;
  process.env.CLOUDFLARE_API_TOKEN = 'secret-that-must-not-leak';
  delete process.env.WORKERS_CI; // force stripper path (non-CI)

  try {
    const injections = {
      platform: 'linux',
      spawn: (_cmd, _args, opts) => {
        spawnEnv = opts && opts.env ? { ...opts.env } : null;
        setImmediate(() => child.stdout.emit('data', Buffer.from('Ready\n')));
        return child;
      },
      probePort: createFakePortProbe(new Set()),
      fetch: createReadyFetch(),
      runMigrations: () => Promise.resolve({ exitCode: 0 }),
      runDriver: () => Promise.resolve({ exitCode: 0 }),
      killChild: (c) => { c.emit('exit', 0, null); return Promise.resolve(); },
      logPath,
      evidencePath,
      nowMs: (() => { let n = 0; return () => { n += 50; return n; }; })(),
      sleep: () => Promise.resolve(),
    };

    const result = await runLocalWorkerOrchestrator([], injections);
    assert.equal(result.exitCode, 0);
    assert.ok(spawnEnv, 'spawn was not invoked');
    assert.equal(
      Object.prototype.hasOwnProperty.call(spawnEnv, 'CLOUDFLARE_API_TOKEN'),
      false,
      'CLOUDFLARE_API_TOKEN leaked into wrangler child-process env',
    );
    // Defence: stringifying the env must not contain the literal secret.
    assert.equal(
      JSON.stringify(spawnEnv).includes('secret-that-must-not-leak'),
      false,
      'secret token value leaked into spawn env',
    );
  } finally {
    if (previousToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = previousToken;
    if (previousWorkersCi === undefined) delete process.env.WORKERS_CI;
    else process.env.WORKERS_CI = previousWorkersCi;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// U4 scenario 10 (CRITICAL): log redaction, end-to-end write-through
// ---------------------------------------------------------------------------
test('capacity-local-worker orchestrator: redaction filter scrubs wrangler stdout before writing log file', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-localworker-'));
  const logPath = join(tempDir, 'local-worker-stdout.log');
  const evidencePath = join(tempDir, 'latest-local.json');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(evidencePath, JSON.stringify({ ok: true }));

  const child = createFakeChild();
  const injections = {
    platform: 'linux',
    spawn: () => {
      // Seed leaking lines into wrangler stdout BEFORE readiness resolves, so
      // the redaction filter has to handle them in the real write path.
      setImmediate(() => {
        child.stdout.emit('data', Buffer.from('cookie: ks2_session=leaky.jwt.here; Path=/\n'));
        child.stdout.emit('data', Buffer.from('Authorization: Bearer leaky-bearer-value\n'));
        child.stderr.emit('data', Buffer.from('env CLOUDFLARE_API_TOKEN=leaky-env-value active\n'));
        child.stdout.emit('data', Buffer.from('Ready on http://localhost:8787\n'));
      });
      return child;
    },
    probePort: createFakePortProbe(new Set()),
    fetch: createReadyFetch(),
    runMigrations: () => Promise.resolve({ exitCode: 0 }),
    runDriver: () => Promise.resolve({ exitCode: 0 }),
    killChild: (c) => { c.emit('exit', 0, null); return Promise.resolve(); },
    logPath,
    evidencePath,
    nowMs: (() => { let n = 0; return () => { n += 50; return n; }; })(),
    sleep: () => Promise.resolve(),
  };

  const result = await runLocalWorkerOrchestrator([], injections);
  assert.equal(result.exitCode, 0);
  const written = readFileSync(logPath, 'utf8');
  assert.ok(!written.includes('leaky.jwt.here'), `cookie value leaked: ${written}`);
  assert.ok(!written.includes('leaky-bearer-value'), `bearer token leaked: ${written}`);
  assert.ok(!written.includes('leaky-env-value'), `api token leaked: ${written}`);
  assert.ok(written.includes('[redacted]'), 'redaction marker missing');
  // Benign content preserved.
  assert.ok(written.includes('Ready on http://localhost:8787'));

  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// U4 Round 1: P0 adv-u4-001 — readiness must accept any 2xx (real Worker
// createDemoSession returns 201 Created, not 200)
// ---------------------------------------------------------------------------
test('capacity-local-worker orchestrator: readiness treats POST /api/demo/session 201 as ready (adv-u4-001 regression)', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-localworker-'));
  const logPath = join(tempDir, 'local-worker-stdout.log');
  const evidencePath = join(tempDir, 'latest-local.json');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(evidencePath, JSON.stringify({ ok: true }));

  const child = createFakeChild();
  // Mirror the real Worker: health → 200, demo session → 201 Created.
  const realWorkerShapeFetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/api/health') return { ok: true, status: 200, async text() { return 'ok'; } };
    if (parsed.pathname === '/api/demo/session') {
      return { ok: true, status: 201, async text() { return JSON.stringify({ ok: true }); } };
    }
    return { ok: true, status: 200, async text() { return ''; } };
  };

  let driverInvoked = false;
  const injections = {
    platform: 'linux',
    spawn: () => {
      setImmediate(() => child.stdout.emit('data', Buffer.from('Ready\n')));
      return child;
    },
    probePort: createFakePortProbe(new Set()),
    fetch: realWorkerShapeFetch,
    runMigrations: () => Promise.resolve({ exitCode: 0 }),
    runDriver: () => { driverInvoked = true; return Promise.resolve({ exitCode: 0 }); },
    killChild: (c) => { c.emit('exit', 0, null); return Promise.resolve(); },
    logPath,
    evidencePath,
    nowMs: (() => { let n = 0; return () => { n += 50; return n; }; })(),
    sleep: () => Promise.resolve(),
  };

  const result = await runLocalWorkerOrchestrator([], injections);
  assert.equal(result.exitCode, 0, 'orchestrator must treat 201 Created as ready (real Worker contract)');
  assert.equal(driverInvoked, true, 'driver must run after 201 readiness');
  rmSync(tempDir, { recursive: true, force: true });
});

test('capacity-local-worker orchestrator: readiness treats 204 No Content as ready (permissive 2xx)', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-localworker-'));
  const logPath = join(tempDir, 'local-worker-stdout.log');
  const evidencePath = join(tempDir, 'latest-local.json');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(evidencePath, JSON.stringify({ ok: true }));

  const child = createFakeChild();
  const twoHundredFourFetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/api/health') return { ok: true, status: 204, async text() { return ''; } };
    if (parsed.pathname === '/api/demo/session') return { ok: true, status: 204, async text() { return ''; } };
    return { ok: true, status: 200, async text() { return ''; } };
  };

  const injections = {
    platform: 'linux',
    spawn: () => {
      setImmediate(() => child.stdout.emit('data', Buffer.from('Ready\n')));
      return child;
    },
    probePort: createFakePortProbe(new Set()),
    fetch: twoHundredFourFetch,
    runMigrations: () => Promise.resolve({ exitCode: 0 }),
    runDriver: () => Promise.resolve({ exitCode: 0 }),
    killChild: (c) => { c.emit('exit', 0, null); return Promise.resolve(); },
    logPath,
    evidencePath,
    nowMs: (() => { let n = 0; return () => { n += 50; return n; }; })(),
    sleep: () => Promise.resolve(),
  };

  const result = await runLocalWorkerOrchestrator([], injections);
  assert.equal(result.exitCode, 0, '204 No Content must count as ready');
  rmSync(tempDir, { recursive: true, force: true });
});

test('capacity-local-worker orchestrator: readiness does NOT treat 301/3xx as ready (must be 2xx specifically)', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-localworker-'));
  const logPath = join(tempDir, 'local-worker-stdout.log');
  const evidencePath = join(tempDir, 'latest-local.json');

  const child = createFakeChild();
  // A 3xx redirect must NOT be treated as ready — a misconfigured proxy
  // returning 301 must still time out rather than invoke the driver.
  const threeHundredOneFetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/api/health') return { ok: false, status: 301, async text() { return ''; } };
    if (parsed.pathname === '/api/demo/session') return { ok: false, status: 301, async text() { return ''; } };
    return { ok: false, status: 301, async text() { return ''; } };
  };

  const injections = {
    platform: 'linux',
    spawn: () => {
      setImmediate(() => child.stdout.emit('data', Buffer.from('starting...\n')));
      return child;
    },
    probePort: createFakePortProbe(new Set()),
    fetch: threeHundredOneFetch,
    runMigrations: () => Promise.resolve({ exitCode: 0 }),
    runDriver: () => { throw new Error('driver MUST NOT run on 3xx readiness'); },
    killChild: (c) => { c.emit('exit', 1, null); return Promise.resolve(); },
    logPath,
    evidencePath,
    nowMs: (() => { let n = 0; return () => { n += 5000; return n; }; })(),
    sleep: () => Promise.resolve(),
  };

  const result = await runLocalWorkerOrchestrator(['--readiness-timeout-ms', '1000'], injections);
  assert.equal(result.exitCode, 2, '3xx must not count as ready — orchestrator should exit 2 on timeout');
  rmSync(tempDir, { recursive: true, force: true });
});

test('capacity-local-worker orchestrator: readiness does NOT treat 500 as ready', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-localworker-'));
  const logPath = join(tempDir, 'local-worker-stdout.log');
  const evidencePath = join(tempDir, 'latest-local.json');

  const child = createFakeChild();
  const fiveHundredFetch = async () => ({ ok: false, status: 500, async text() { return 'nope'; } });

  const injections = {
    platform: 'linux',
    spawn: () => {
      setImmediate(() => child.stdout.emit('data', Buffer.from('starting...\n')));
      return child;
    },
    probePort: createFakePortProbe(new Set()),
    fetch: fiveHundredFetch,
    runMigrations: () => Promise.resolve({ exitCode: 0 }),
    runDriver: () => { throw new Error('driver MUST NOT run on 500 readiness'); },
    killChild: (c) => { c.emit('exit', 1, null); return Promise.resolve(); },
    logPath,
    evidencePath,
    nowMs: (() => { let n = 0; return () => { n += 5000; return n; }; })(),
    sleep: () => Promise.resolve(),
  };

  const result = await runLocalWorkerOrchestrator(['--readiness-timeout-ms', '1000'], injections);
  assert.equal(result.exitCode, 2, '500 must not count as ready');
  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// U4 Round 1: P1 adv-u4-002 — stream-chunk redaction across data events
// ---------------------------------------------------------------------------
test('createRedactionStream buffers incomplete lines across chunks (adv-u4-002 regression)', () => {
  const writes = [];
  const stream = createRedactionStream({ write: (s) => writes.push(s) });
  // Split a Set-Cookie payload such that the prefix and value arrive in
  // separate chunks. The naive per-chunk filter leaks the second half.
  stream.write('Set-Cookie: ks2_sess');
  stream.write('ion=abc123secret; Path=/\n');
  stream.end();
  const combined = writes.join('');
  assert.ok(!combined.includes('abc123secret'), `stream-chunk split leaked cookie value: ${combined}`);
  assert.ok(combined.includes('[redacted]'), 'redaction marker expected on stream join');
});

test('createRedactionStream redacts when value boundary falls mid-chunk', () => {
  const writes = [];
  const stream = createRedactionStream({ write: (s) => writes.push(s) });
  // Prefix present in first chunk; value split in two.
  stream.write('Set-Cookie: ks2_session=abc');
  stream.write('123secretvalue; Path=/\n');
  stream.end();
  const combined = writes.join('');
  assert.ok(!combined.includes('abc123secretvalue'), `mid-value split leaked: ${combined}`);
  assert.ok(!combined.includes('123secretvalue'), `value tail leaked: ${combined}`);
  assert.ok(combined.includes('[redacted]'));
});

test('createRedactionStream flushes residual buffer on end() without trailing newline', () => {
  const writes = [];
  const stream = createRedactionStream({ write: (s) => writes.push(s) });
  // No trailing newline — close must still redact the residual.
  stream.write('Authorization: Bearer leaky-trailing-token');
  stream.end();
  const combined = writes.join('');
  assert.ok(!combined.includes('leaky-trailing-token'), `residual buffer leaked on end(): ${combined}`);
  assert.ok(combined.includes('[redacted]'), 'final flush must apply redaction');
});

test('createRedactionStream passes benign multi-chunk text through unmodified', () => {
  const writes = [];
  const stream = createRedactionStream({ write: (s) => writes.push(s) });
  stream.write('wrangler ready on ');
  stream.write('http://localhost:8787\n');
  stream.write('another benign line\n');
  stream.end();
  const combined = writes.join('');
  assert.equal(combined, 'wrangler ready on http://localhost:8787\nanother benign line\n');
});

test('capacity-local-worker orchestrator: redaction handles chunk-split cookie in spawn pipe (end-to-end)', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-localworker-'));
  const logPath = join(tempDir, 'local-worker-stdout.log');
  const evidencePath = join(tempDir, 'latest-local.json');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(evidencePath, JSON.stringify({ ok: true }));

  const child = createFakeChild();
  const injections = {
    platform: 'linux',
    spawn: () => {
      // Emit cookie value across two data chunks (real stream boundary case).
      setImmediate(() => {
        child.stdout.emit('data', Buffer.from('Set-Cookie: ks2_session=leaky'));
        child.stdout.emit('data', Buffer.from('halfsplit.value.here; Path=/\n'));
        child.stdout.emit('data', Buffer.from('Ready\n'));
      });
      return child;
    },
    probePort: createFakePortProbe(new Set()),
    fetch: createReadyFetch(),
    runMigrations: () => Promise.resolve({ exitCode: 0 }),
    runDriver: () => Promise.resolve({ exitCode: 0 }),
    killChild: (c) => { c.emit('exit', 0, null); return Promise.resolve(); },
    logPath,
    evidencePath,
    nowMs: (() => { let n = 0; return () => { n += 50; return n; }; })(),
    sleep: () => Promise.resolve(),
  };

  const result = await runLocalWorkerOrchestrator([], injections);
  assert.equal(result.exitCode, 0);
  const written = readFileSync(logPath, 'utf8');
  assert.ok(!written.includes('leakyhalfsplit.value.here'), `chunk-split cookie leaked: ${written}`);
  assert.ok(!written.includes('halfsplit.value.here'), `tail of chunk-split cookie leaked: ${written}`);
  assert.ok(written.includes('[redacted]'));
  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// U4 Round 1: P1 adv-u4-005 — redaction scope expanded (OAuth artefacts,
// quote-delimited values, JSON-shape tokens)
// ---------------------------------------------------------------------------
test('redactLogLine scrubs OAuth artefacts access_token, refresh_token, id_token (adv-u4-005)', () => {
  const line = 'body: access_token=oauth-access refresh_token=oauth-refresh id_token=oauth-id done';
  const out = redactLogLine(line);
  assert.ok(!out.includes('oauth-access'), `access_token leaked: ${out}`);
  assert.ok(!out.includes('oauth-refresh'), `refresh_token leaked: ${out}`);
  assert.ok(!out.includes('oauth-id'), `id_token leaked: ${out}`);
  assert.ok(out.includes('[redacted]'));
});

test('redactLogLine scrubs quote-delimited ks2_session and Bearer values', () => {
  assert.ok(
    !redactLogLine('cookie: ks2_session="quoted-secret"; Path=/').includes('quoted-secret'),
    'double-quoted cookie value leaked',
  );
  assert.ok(
    !redactLogLine("cookie: ks2_session='single-secret'; Path=/").includes('single-secret'),
    'single-quoted cookie value leaked',
  );
  assert.ok(
    !redactLogLine('header: "Bearer quoted.jwt.value"').includes('quoted.jwt.value'),
    'quoted Bearer token leaked',
  );
});

test('redactLogLine scrubs JSON-shape token/secret/password/key payloads', () => {
  const jsonLine = '{"CLOUDFLARE_API_TOKEN":"json-secret-value","other":"ok"}';
  const out = redactLogLine(jsonLine);
  assert.ok(!out.includes('json-secret-value'), `JSON-shape CF token leaked: ${out}`);
  assert.ok(out.includes('[redacted]'));

  const shaped = '{"database_password":"pw123","access_token":"at456","api_key":"ak789"}';
  const shapedOut = redactLogLine(shaped);
  assert.ok(!shapedOut.includes('pw123'), 'json password leaked');
  assert.ok(!shapedOut.includes('at456'), 'json access_token leaked');
  assert.ok(!shapedOut.includes('ak789'), 'json api_key leaked');
});

test('redactLogLine scrubs common third-party secret env assignments', () => {
  const line = 'env NPM_TOKEN=npm-secret OPENAI_API_KEY=openai-secret AWS_SECRET_ACCESS_KEY=aws-secret';
  const out = redactLogLine(line);
  assert.ok(!out.includes('npm-secret'), 'NPM_TOKEN leaked');
  assert.ok(!out.includes('openai-secret'), 'OPENAI_API_KEY leaked');
  assert.ok(!out.includes('aws-secret'), 'AWS_SECRET_ACCESS_KEY leaked');
});

test('redactLogChunk is idempotent across expanded patterns', () => {
  const line = 'cookie: ks2_session=[redacted]; Bearer [redacted]; access_token=[redacted]';
  assert.equal(redactLogChunk(line), line, 'already-redacted lines must pass through unchanged');
});

// ---------------------------------------------------------------------------
// U4 Round 1: P1 adv-u4-004 — allowlist-based env sanitisation
// ---------------------------------------------------------------------------
test('sanitiseWranglerEnv strips every non-allowlisted secret by name (adv-u4-004)', () => {
  const source = {
    PATH: '/usr/bin',
    HOME: '/home/user',
    CLOUDFLARE_API_TOKEN: 'cf-secret-upper',
    cloudflare_api_token: 'cf-secret-lower',
    CLOUDFLARE_TOKEN: 'cf-token-variant',
    CF_API_TOKEN: 'cf-api-token-variant',
    NPM_TOKEN: 'npm-secret',
    OPENAI_API_KEY: 'openai-secret',
    AWS_SECRET_ACCESS_KEY: 'aws-secret',
    GITHUB_TOKEN: 'gh-secret',
    DATABASE_PASSWORD: 'db-secret',
    OAUTH_CLIENT_SECRET: 'oauth-secret',
  };
  const cleaned = sanitiseWranglerEnv(source);
  for (const key of [
    'CLOUDFLARE_API_TOKEN',
    'cloudflare_api_token',
    'CLOUDFLARE_TOKEN',
    'CF_API_TOKEN',
    'NPM_TOKEN',
    'OPENAI_API_KEY',
    'AWS_SECRET_ACCESS_KEY',
    'GITHUB_TOKEN',
    'DATABASE_PASSWORD',
    'OAUTH_CLIENT_SECRET',
  ]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(cleaned, key),
      false,
      `${key} leaked into wrangler env via denylist gap`,
    );
  }
  // Value-level defence: stringified env must not contain any seeded secret value.
  const seeded = [
    'cf-secret-upper', 'cf-secret-lower', 'cf-token-variant', 'cf-api-token-variant',
    'npm-secret', 'openai-secret', 'aws-secret', 'gh-secret', 'db-secret', 'oauth-secret',
  ];
  const stringified = JSON.stringify(cleaned);
  for (const value of seeded) {
    assert.equal(stringified.includes(value), false, `secret value "${value}" present in sanitised env`);
  }
});

test('sanitiseWranglerEnv keeps essential allowlisted keys (PATH, CLOUDFLARE_ACCOUNT_ID, WRANGLER_LOG)', () => {
  const cleaned = sanitiseWranglerEnv({
    PATH: '/usr/bin',
    HOME: '/home/user',
    USERPROFILE: 'C:\\Users\\u',
    APPDATA: 'C:\\Users\\u\\AppData\\Roaming',
    LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local',
    CLOUDFLARE_ACCOUNT_ID: 'acct-12345',
    CF_ACCOUNT_ID: 'acct-also',
    WRANGLER_LOG: 'debug',
    WRANGLER_SEND_METRICS: 'false',
    NODE_ENV: 'development',
    LANG: 'en_GB.UTF-8',
    CI: 'true',
    TERM: 'xterm-256color',
  });
  assert.equal(cleaned.PATH, '/usr/bin');
  assert.equal(cleaned.CLOUDFLARE_ACCOUNT_ID, 'acct-12345');
  assert.equal(cleaned.CF_ACCOUNT_ID, 'acct-also');
  assert.equal(cleaned.WRANGLER_LOG, 'debug');
  assert.equal(cleaned.WRANGLER_SEND_METRICS, 'false');
  assert.equal(cleaned.NODE_ENV, 'development');
});

test('sanitiseWranglerEnv passes WRANGLER_* prefixed keys through (wildcard allow)', () => {
  const cleaned = sanitiseWranglerEnv({
    PATH: '/usr/bin',
    WRANGLER_LOG: 'debug',
    WRANGLER_CUSTOM_FLAG: 'xyz',
    WRANGLER_SEND_METRICS: 'false',
  });
  assert.equal(cleaned.WRANGLER_CUSTOM_FLAG, 'xyz');
  assert.equal(cleaned.WRANGLER_LOG, 'debug');
});

test('sanitiseWranglerEnv excludes suspicious-suffix keys even if otherwise allowlisted-looking', () => {
  // A rogue WRANGLER_TOKEN would be concerning — pattern-exclude wins over prefix-allow.
  const cleaned = sanitiseWranglerEnv({
    PATH: '/usr/bin',
    WRANGLER_TOKEN: 'rogue-secret',
    WRANGLER_API_KEY: 'rogue-api',
    WRANGLER_PASSWORD: 'rogue-password',
    WRANGLER_SECRET: 'rogue-secret-suffix',
    WRANGLER_LOG: 'debug',
  });
  assert.equal(Object.prototype.hasOwnProperty.call(cleaned, 'WRANGLER_TOKEN'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(cleaned, 'WRANGLER_API_KEY'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(cleaned, 'WRANGLER_PASSWORD'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(cleaned, 'WRANGLER_SECRET'), false);
  assert.equal(cleaned.WRANGLER_LOG, 'debug');
});

test('sanitiseWranglerEnv keeps CLOUDFLARE_API_TOKEN when WORKERS_CI=1 (Workers CI parity)', () => {
  const cleaned = sanitiseWranglerEnv({
    PATH: '/usr/bin',
    WORKERS_CI: '1',
    CLOUDFLARE_API_TOKEN: 'ci-token-value',
  });
  assert.equal(cleaned.CLOUDFLARE_API_TOKEN, 'ci-token-value');
  assert.equal(cleaned.WORKERS_CI, '1');
});

// ---------------------------------------------------------------------------
// U4 Round 1: P1 adv-u4-003 — orchestrator forces --output at position 0
// of driver passthrough; asserts evidence file exists after driver exit 0
// ---------------------------------------------------------------------------
test('capacity-local-worker orchestrator: injects --output <evidencePath> at front of driver argv (adv-u4-003)', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-localworker-'));
  const logPath = join(tempDir, 'local-worker-stdout.log');
  const evidencePath = join(tempDir, 'latest-local.json');

  const child = createFakeChild();
  let capturedArgv = null;

  const injections = {
    platform: 'linux',
    spawn: () => {
      setImmediate(() => child.stdout.emit('data', Buffer.from('Ready\n')));
      return child;
    },
    probePort: createFakePortProbe(new Set()),
    fetch: createReadyFetch(),
    runMigrations: () => Promise.resolve({ exitCode: 0 }),
    runDriver: async ({ argv }) => {
      capturedArgv = [...argv];
      // Simulate driver honouring --output by writing the evidence file.
      const outIdx = capturedArgv.indexOf('--output');
      if (outIdx >= 0) {
        const { writeFileSync } = await import('node:fs');
        writeFileSync(capturedArgv[outIdx + 1], JSON.stringify({ ok: true }));
      }
      return { exitCode: 0 };
    },
    killChild: (c) => { c.emit('exit', 0, null); return Promise.resolve(); },
    logPath,
    evidencePath,
    nowMs: (() => { let n = 0; return () => { n += 50; return n; }; })(),
    sleep: () => Promise.resolve(),
  };

  const result = await runLocalWorkerOrchestrator([], injections);
  assert.equal(result.exitCode, 0);
  assert.ok(capturedArgv.includes('--output'), `--output not injected: ${JSON.stringify(capturedArgv)}`);
  const outIdx = capturedArgv.indexOf('--output');
  assert.equal(capturedArgv[outIdx + 1], evidencePath, '--output value must point at orchestrator evidencePath');
  rmSync(tempDir, { recursive: true, force: true });
});

test('capacity-local-worker orchestrator: operator --output in passthrough wins with warning', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-localworker-'));
  const logPath = join(tempDir, 'local-worker-stdout.log');
  const evidencePath = join(tempDir, 'latest-local.json');
  const customPath = join(tempDir, 'custom-output.json');

  const child = createFakeChild();
  let capturedArgv = null;
  const warnings = [];

  const injections = {
    platform: 'linux',
    spawn: () => {
      setImmediate(() => child.stdout.emit('data', Buffer.from('Ready\n')));
      return child;
    },
    probePort: createFakePortProbe(new Set()),
    fetch: createReadyFetch(),
    runMigrations: () => Promise.resolve({ exitCode: 0 }),
    runDriver: async ({ argv }) => {
      capturedArgv = [...argv];
      const outIdx = capturedArgv.indexOf('--output');
      if (outIdx >= 0) {
        const { writeFileSync } = await import('node:fs');
        writeFileSync(capturedArgv[outIdx + 1], JSON.stringify({ ok: true }));
      }
      return { exitCode: 0 };
    },
    killChild: (c) => { c.emit('exit', 0, null); return Promise.resolve(); },
    logPath,
    evidencePath,
    warn: (msg) => warnings.push(msg),
    nowMs: (() => { let n = 0; return () => { n += 50; return n; }; })(),
    sleep: () => Promise.resolve(),
  };

  const result = await runLocalWorkerOrchestrator(['--', '--output', customPath], injections);
  assert.equal(result.exitCode, 0);
  // Operator override honoured — custom path present; orchestrator default NOT present.
  assert.ok(capturedArgv.includes(customPath), `operator path not honoured: ${JSON.stringify(capturedArgv)}`);
  assert.equal(capturedArgv.filter((a) => a === '--output').length, 1, 'exactly one --output expected');
  assert.ok(warnings.some((m) => /output/i.test(String(m))), 'warning expected when operator overrides --output');
  rmSync(tempDir, { recursive: true, force: true });
});

test('capacity-local-worker orchestrator: missing evidence file after driver exit 0 → exit 3', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-localworker-'));
  const logPath = join(tempDir, 'local-worker-stdout.log');
  const evidencePath = join(tempDir, 'latest-local.json');
  // Note: no one writes evidencePath in this test — driver claims exit 0 yet file is missing.

  const child = createFakeChild();
  const injections = {
    platform: 'linux',
    spawn: () => {
      setImmediate(() => child.stdout.emit('data', Buffer.from('Ready\n')));
      return child;
    },
    probePort: createFakePortProbe(new Set()),
    fetch: createReadyFetch(),
    runMigrations: () => Promise.resolve({ exitCode: 0 }),
    runDriver: () => Promise.resolve({ exitCode: 0 }),
    killChild: (c) => { c.emit('exit', 0, null); return Promise.resolve(); },
    logPath,
    evidencePath,
    nowMs: (() => { let n = 0; return () => { n += 50; return n; }; })(),
    sleep: () => Promise.resolve(),
  };

  const result = await runLocalWorkerOrchestrator([], injections);
  assert.equal(result.exitCode, 3, 'missing evidence must produce exit 3');
  assert.ok(result.error && /evidence/i.test(result.error), `expected evidence error, got ${result.error}`);
  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// U4 Round 1: P2 adv-u4-010 — --port-start upper bound check
// ---------------------------------------------------------------------------
test('parseLocalWorkerArgs rejects --port-start above 65533', () => {
  assert.throws(() => parseLocalWorkerArgs(['--port-start', '99999']), /port-start/i);
  assert.throws(() => parseLocalWorkerArgs(['--port-start', '65534']), /port-start/i);
  // Within range still works.
  const ok = parseLocalWorkerArgs(['--port-start', '9000']);
  assert.equal(ok.portStart, 9000);
});

// ---------------------------------------------------------------------------
// U4 Round 1: P2 adv-u4-009 — reject operator --origin in passthrough
// ---------------------------------------------------------------------------
test('capacity-local-worker orchestrator: rejects operator --origin in driver passthrough upfront', async () => {
  const result = await runLocalWorkerOrchestrator(['--', '--origin', 'http://evil.com'], {
    platform: 'linux',
    // These should never be called — the rejection is upfront.
    spawn: () => { throw new Error('spawn MUST NOT run on --origin collision'); },
    runMigrations: () => { throw new Error('migration MUST NOT run on --origin collision'); },
    probePort: createFakePortProbe(new Set()),
    fetch: createReadyFetch(),
    runDriver: () => { throw new Error('driver MUST NOT run on --origin collision'); },
    killChild: () => Promise.resolve(),
    nowMs: () => 0,
    sleep: () => Promise.resolve(),
  });
  assert.equal(result.exitCode, 2);
  assert.ok(result.error && /origin/i.test(result.error), `expected origin collision error, got ${result.error}`);
});

// adv-u4-r2-001 P1: equals-form (`--origin=http://evil`) previously slipped
// through because the reject used Set.has(arg) on the raw token. Normalising
// via `arg.split('=', 1)[0]` closes the regression.
test('capacity-local-worker orchestrator: rejects equals-form --origin=... upfront (adv-u4-r2-001)', async () => {
  const result = await runLocalWorkerOrchestrator(['--', '--origin=http://evil.com'], {
    platform: 'linux',
    spawn: () => { throw new Error('spawn MUST NOT run on --origin=value collision'); },
    runMigrations: () => { throw new Error('migration MUST NOT run on --origin=value collision'); },
    probePort: createFakePortProbe(new Set()),
    fetch: createReadyFetch(),
    runDriver: () => { throw new Error('driver MUST NOT run on --origin=value collision'); },
    killChild: () => Promise.resolve(),
    nowMs: () => 0,
    sleep: () => Promise.resolve(),
  });
  assert.equal(result.exitCode, 2);
  assert.ok(result.error && /origin/i.test(result.error), `expected origin collision error, got ${result.error}`);
});
