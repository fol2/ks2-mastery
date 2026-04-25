import test from 'node:test';
import assert from 'node:assert/strict';

import {
  runClassroomLoadTest,
  summariseCapacityResults,
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
