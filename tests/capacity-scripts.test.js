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

