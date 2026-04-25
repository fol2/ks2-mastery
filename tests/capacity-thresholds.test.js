import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseClassroomLoadArgs,
  evaluateCapacityThresholds,
  runClassroomLoadTest,
  summariseCapacityResults,
} from '../scripts/classroom-load-test.mjs';
import {
  analyseBootstrapPayload,
  parseProbeArgs,
} from '../scripts/probe-production-bootstrap.mjs';
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

test('classroom threshold flags parse with defaults disabled (back-compat)', () => {
  const options = parseClassroomLoadArgs(['--dry-run']);
  assert.equal(options.max5xx, null);
  assert.equal(options.maxNetworkFailures, null);
  assert.equal(options.maxBootstrapP95Ms, null);
  assert.equal(options.maxCommandP95Ms, null);
  assert.equal(options.maxResponseBytes, null);
  assert.equal(options.requireZeroSignals, false);
  assert.equal(options.confirmHighProductionLoad, false);
});

test('classroom threshold flags parse numeric and boolean flag values', () => {
  const options = parseClassroomLoadArgs([
    '--dry-run',
    '--max-5xx', '0',
    '--max-network-failures', '0',
    '--max-bootstrap-p95-ms', '1000',
    '--max-command-p95-ms', '750',
    '--max-response-bytes', '600000',
    '--require-zero-signals',
    '--confirm-high-production-load',
  ]);
  assert.equal(options.max5xx, 0);
  assert.equal(options.maxNetworkFailures, 0);
  assert.equal(options.maxBootstrapP95Ms, 1000);
  assert.equal(options.maxCommandP95Ms, 750);
  assert.equal(options.maxResponseBytes, 600_000);
  assert.equal(options.requireZeroSignals, true);
  assert.equal(options.confirmHighProductionLoad, true);
});

test('evaluateCapacityThresholds returns empty violations when no flags set', () => {
  const summary = summariseCapacityResults([
    {
      scenario: 'cold-bootstrap-burst',
      method: 'GET',
      endpoint: '/api/bootstrap',
      status: 500,
      ok: false,
      wallMs: 9_000,
      responseBytes: 900_000,
      code: 'exceeded_cpu',
      message: 'CPU limit',
    },
  ], { expectedRequests: 1 });
  const violations = evaluateCapacityThresholds(summary, {});
  assert.deepEqual(violations, []);
});

test('evaluateCapacityThresholds flags --max-5xx violations', () => {
  const summary = summariseCapacityResults([
    {
      scenario: 'cold-bootstrap-burst',
      method: 'GET',
      endpoint: '/api/bootstrap',
      status: 500,
      ok: false,
      wallMs: 20,
      responseBytes: 100,
    },
    {
      scenario: 'cold-bootstrap-burst',
      method: 'GET',
      endpoint: '/api/bootstrap',
      status: 503,
      ok: false,
      wallMs: 20,
      responseBytes: 100,
    },
  ], { expectedRequests: 2 });
  const violations = evaluateCapacityThresholds(summary, { max5xx: 0 });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].threshold, 'max-5xx');
  assert.equal(violations[0].limit, 0);
  assert.equal(violations[0].observed, 2);
});

test('evaluateCapacityThresholds flags --max-network-failures violations', () => {
  const summary = summariseCapacityResults([
    {
      scenario: 'cold-bootstrap-burst',
      method: 'GET',
      endpoint: '/api/bootstrap',
      status: 0,
      ok: false,
      wallMs: 20,
      responseBytes: 0,
    },
  ], { expectedRequests: 1 });
  const violations = evaluateCapacityThresholds(summary, { maxNetworkFailures: 0 });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].threshold, 'max-network-failures');
});

test('evaluateCapacityThresholds flags bootstrap P95 above limit', () => {
  const summary = summariseCapacityResults([
    {
      scenario: 'cold-bootstrap-burst',
      method: 'GET',
      endpoint: '/api/bootstrap',
      status: 200,
      ok: true,
      wallMs: 2000,
      responseBytes: 100,
    },
    {
      scenario: 'cold-bootstrap-burst',
      method: 'GET',
      endpoint: '/api/bootstrap',
      status: 200,
      ok: true,
      wallMs: 2500,
      responseBytes: 100,
    },
  ], { expectedRequests: 2 });
  const violations = evaluateCapacityThresholds(summary, { maxBootstrapP95Ms: 1000 });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].threshold, 'max-bootstrap-p95-ms');
  assert.ok(violations[0].observed >= 2000);
});

test('evaluateCapacityThresholds flags command P95 above limit', () => {
  const summary = summariseCapacityResults([
    {
      scenario: 'human-paced-grammar-round',
      method: 'POST',
      endpoint: '/api/subjects/grammar/command',
      status: 200,
      ok: true,
      wallMs: 1500,
      responseBytes: 100,
    },
  ], { expectedRequests: 1 });
  const violations = evaluateCapacityThresholds(summary, { maxCommandP95Ms: 750 });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].threshold, 'max-command-p95-ms');
});

test('evaluateCapacityThresholds flags max-response-bytes violations', () => {
  const summary = summariseCapacityResults([
    {
      scenario: 'cold-bootstrap-burst',
      method: 'GET',
      endpoint: '/api/bootstrap',
      status: 200,
      ok: true,
      wallMs: 40,
      responseBytes: 900_000,
    },
  ], { expectedRequests: 1 });
  const violations = evaluateCapacityThresholds(summary, { maxResponseBytes: 600_000 });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].threshold, 'max-response-bytes');
  assert.equal(violations[0].observed, 900_000);
});

test('evaluateCapacityThresholds flags --require-zero-signals with any operational signal', () => {
  const summary = summariseCapacityResults([
    {
      scenario: 'cold-bootstrap-burst',
      method: 'GET',
      endpoint: '/api/bootstrap',
      status: 503,
      ok: false,
      wallMs: 40,
      responseBytes: 200,
      code: 'exceeded_cpu',
      message: 'Worker CPU limit',
    },
  ], { expectedRequests: 1 });
  const violations = evaluateCapacityThresholds(summary, { requireZeroSignals: true });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].threshold, 'require-zero-signals');
  assert.ok(Array.isArray(violations[0].signals));
  assert.ok(violations[0].signals.includes('exceededCpu'));
});

test('classroom load dry-run with thresholds absent exits ok (back-compat)', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('dry-run should not fetch');
  };
  try {
    const report = await runClassroomLoadTest([
      '--dry-run',
      '--learners', '3',
      '--bootstrap-burst', '3',
      '--rounds', '1',
    ]);
    assert.equal(report.ok, true);
    assert.equal(report.dryRun, true);
    assert.equal(report.thresholds?.configured || false, false);
    assert.equal(report.thresholds?.violations?.length || 0, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('classroom load fails when --max-5xx is violated by a 500 response', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse({ ok: false, code: 'server_error' }, { status: 500 });
  try {
    const report = await runClassroomLoadTest([
      '--production',
      '--origin', 'https://ks2.eugnel.uk',
      '--confirm-production-load',
      '--cookie', 'ks2_session=real',
      '--learners', '1',
      '--bootstrap-burst', '1',
      '--rounds', '1',
      '--max-5xx', '0',
    ]);
    assert.equal(report.ok, false);
    assert.equal(report.thresholds.configured, true);
    const triggered = report.thresholds.violations.map((entry) => entry.threshold);
    assert.ok(triggered.includes('max-5xx'));
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('classroom load fails when --require-zero-signals observes an operational signal', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse({
    ok: false,
    code: 'exceeded_cpu',
    message: 'Worker CPU limit exceeded.',
  }, { status: 503 });
  try {
    const report = await runClassroomLoadTest([
      '--production',
      '--origin', 'https://ks2.eugnel.uk',
      '--confirm-production-load',
      '--cookie', 'ks2_session=real',
      '--learners', '1',
      '--bootstrap-burst', '1',
      '--rounds', '1',
      '--require-zero-signals',
    ]);
    assert.equal(report.ok, false);
    const triggered = report.thresholds.violations.map((entry) => entry.threshold);
    assert.ok(triggered.includes('require-zero-signals'));
    // The triggered block names the signals but does not expose the raw
    // failure body; the summary JSON stays bounded.
    assert.equal(JSON.stringify(report).includes('<html'), false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('classroom load with all thresholds satisfied exits ok and reports a clean threshold block', async () => {
  const previousFetch = globalThis.fetch;
  const grammarQuestion = createGrammarQuestion({
    templateId: 'fronted_adverbial_choose',
    seed: 1,
  });
  globalThis.fetch = async (url, init = {}) => {
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
    return jsonResponse({ ok: false }, { status: 404 });
  };
  try {
    const report = await runClassroomLoadTest([
      '--production',
      '--origin', 'https://ks2.eugnel.uk',
      '--confirm-production-load',
      '--cookie', 'ks2_session=real',
      '--learners', '1',
      '--bootstrap-burst', '1',
      '--rounds', '1',
      '--max-5xx', '0',
      '--max-network-failures', '0',
      '--max-bootstrap-p95-ms', '60000',
      '--max-command-p95-ms', '60000',
      '--max-response-bytes', '600000',
    ]);
    assert.equal(report.ok, true);
    assert.equal(report.thresholds.configured, true);
    assert.deepEqual(report.thresholds.violations, []);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('probe bootstrap with --max-bytes 1 hard-fails and does not expose raw body', () => {
  const payload = {
    ok: true,
    bootstrapCapacity: {
      mode: 'public-bounded',
      practiceSessions: { returned: 0, bounded: true },
      eventLog: { returned: 0, bounded: true },
    },
    practiceSessions: [],
    eventLog: [],
  };
  const analysis = analyseBootstrapPayload(payload, {
    responseBytes: 5_000,
    maxBytes: 1,
  });
  assert.equal(analysis.ok, false);
  const failuresJoined = analysis.failures.join('\n');
  assert.ok(failuresJoined.includes('5000'));
  assert.ok(failuresJoined.includes('above 1'));
});

test('probe bootstrap parses --max-sessions and --max-events as hard gates', () => {
  const options = parseProbeArgs([
    '--max-bytes', '500000',
    '--max-sessions', '12',
    '--max-events', '100',
  ]);
  assert.equal(options.maxBytes, 500_000);
  assert.equal(options.maxSessions, 12);
  assert.equal(options.maxEvents, 100);

  const payload = {
    ok: true,
    bootstrapCapacity: {
      mode: 'public-bounded',
      practiceSessions: { returned: 20, bounded: true },
      eventLog: { returned: 150, bounded: true },
    },
    practiceSessions: new Array(20).fill({ id: 'session', subjectId: 'grammar', sessionState: null }),
    eventLog: new Array(150).fill({ type: 'example' }),
  };
  const analysis = analyseBootstrapPayload(payload, {
    responseBytes: 400,
    maxBytes: 500_000,
    maxSessions: 12,
    maxEvents: 100,
  });
  assert.equal(analysis.ok, false);
  assert.ok(analysis.failures.some((entry) => entry.includes('practice sessions')));
  assert.ok(analysis.failures.some((entry) => entry.includes('events')));
});
