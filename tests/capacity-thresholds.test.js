import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseClassroomLoadArgs,
  evaluateCapacityThresholds,
  runClassroomLoadTest,
  summariseCapacityResults,
  validateClassroomLoadOptions,
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

test('evaluateCapacityThresholds includes meta.capacity signals on successful responses', () => {
  const summary = summariseCapacityResults([
    {
      scenario: 'cold-bootstrap-burst',
      method: 'GET',
      endpoint: '/api/bootstrap',
      status: 200,
      ok: true,
      wallMs: 40,
      responseBytes: 200,
      capacity: {
        queryCount: 3,
        d1RowsRead: 4,
        signals: ['d1Overloaded'],
      },
    },
  ], { expectedRequests: 1 });

  assert.deepEqual(summary.signals, { d1Overloaded: 1 });
  assert.equal(summary.ok, false);

  const violations = evaluateCapacityThresholds(summary, { requireZeroSignals: true });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].threshold, 'require-zero-signals');
  assert.deepEqual(violations[0].signals, ['d1Overloaded']);
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
      // U1 pairing rule requires --max-network-failures alongside --max-5xx
      // so a silent success on total network failure is impossible.
      '--max-5xx', '0',
      '--max-network-failures', '0',
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
  // Adversarial review C-02 / testing-gap: pin the structured thresholdViolations contents.
  const triggered = analysis.thresholdViolations.map((entry) => entry.threshold).sort();
  assert.deepEqual(triggered, ['max-events', 'max-sessions']);
  const byThreshold = Object.fromEntries(analysis.thresholdViolations.map((entry) => [entry.threshold, entry]));
  assert.equal(byThreshold['max-sessions'].limit, 12);
  assert.equal(byThreshold['max-sessions'].observed, 20);
  assert.equal(byThreshold['max-events'].limit, 100);
  assert.equal(byThreshold['max-events'].observed, 150);
});

test('probe bootstrap max-bytes violation emits structured thresholdViolations entry', () => {
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
  assert.equal(analysis.thresholdViolations.length, 1);
  assert.equal(analysis.thresholdViolations[0].threshold, 'max-bytes');
  assert.equal(analysis.thresholdViolations[0].limit, 1);
  assert.equal(analysis.thresholdViolations[0].observed, 5_000);
});

test('probe bootstrap populates thresholdViolations even when body fails to parse (adv-004)', () => {
  // Early-return path for non-JSON-object body must still fire the byte gate.
  const analysis = analyseBootstrapPayload(null, {
    responseBytes: 2_000_000,
    maxBytes: 600_000,
  });
  assert.equal(analysis.ok, false);
  assert.ok(analysis.failures.some((entry) => entry.includes('Response body is not a JSON object')));
  assert.equal(analysis.thresholdViolations.length, 1);
  assert.equal(analysis.thresholdViolations[0].threshold, 'max-bytes');
  assert.equal(analysis.thresholdViolations[0].limit, 600_000);
  assert.equal(analysis.thresholdViolations[0].observed, 2_000_000);
});

test('classroom dry-run with threshold flags is rejected (adv-001)', async () => {
  await assert.rejects(
    runClassroomLoadTest(['--dry-run', '--max-5xx', '0']),
    /Threshold flags .* cannot be combined with --dry-run/,
  );
});

test('classroom dry-run with --require-zero-signals is rejected (adv-001)', async () => {
  await assert.rejects(
    runClassroomLoadTest(['--dry-run', '--require-zero-signals']),
    /Threshold flags .* cannot be combined with --dry-run/,
  );
});

test('classroom rejects duplicate --max-5xx flag (adv-002)', () => {
  assert.throws(
    () => parseClassroomLoadArgs(['--dry-run', '--max-5xx', '0', '--max-5xx', '500']),
    /--max-5xx specified more than once/,
  );
});

test('classroom rejects duplicate --learners flag', () => {
  assert.throws(
    () => parseClassroomLoadArgs(['--dry-run', '--learners', '3', '--learners', '30']),
    /--learners specified more than once/,
  );
});

test('classroom rejects conflicting --production --dry-run (adv-005)', () => {
  assert.throws(
    () => parseClassroomLoadArgs(['--production', '--dry-run']),
    /Conflicting mode flags: --production and --dry-run/,
  );
});

test('classroom rejects conflicting --dry-run --local-fixture (adv-005)', () => {
  assert.throws(
    () => parseClassroomLoadArgs(['--dry-run', '--local-fixture']),
    /Conflicting mode flags: --dry-run and --local-fixture/,
  );
});

test('classroom allows --header repeated (cumulative by design)', () => {
  const options = parseClassroomLoadArgs([
    '--dry-run',
    '--header', 'x-custom: a',
    '--header', 'x-custom2: b',
  ]);
  assert.deepEqual(options.headers, ['x-custom: a', 'x-custom2: b']);
});

test('classroom validates confirm-high-production-load for 30 learners (adv-003)', async () => {
  await assert.rejects(
    runClassroomLoadTest([
      '--production',
      '--origin', 'https://ks2.eugnel.uk',
      '--confirm-production-load',
      '--cookie', 'ks2_session=real',
      '--learners', '30',
      '--bootstrap-burst', '1',
      '--rounds', '1',
    ]),
    /--confirm-high-production-load/,
  );
});

test('classroom validates confirm-high-production-load for 30 bootstrap burst (adv-003)', async () => {
  await assert.rejects(
    runClassroomLoadTest([
      '--production',
      '--origin', 'https://ks2.eugnel.uk',
      '--confirm-production-load',
      '--cookie', 'ks2_session=real',
      '--learners', '1',
      '--bootstrap-burst', '30',
      '--rounds', '1',
    ]),
    /--confirm-high-production-load/,
  );
});

test('classroom allows <20 learner production runs without --confirm-high-production-load (adv-003 lower bound)', () => {
  // Must parse + validate cleanly; actual run is not invoked here.
  const options = parseClassroomLoadArgs([
    '--production',
    '--origin', 'https://ks2.eugnel.uk',
    '--confirm-production-load',
    '--cookie', 'ks2_session=real',
    '--learners', '10',
    '--bootstrap-burst', '10',
    '--rounds', '1',
  ]);
  assert.equal(options.confirmHighProductionLoad, false);
  // Validate must pass for a 10-learner production run without the flag.
  // C-T1 testing-gap: previously only parsed without asserting validation outcome.
  assert.doesNotThrow(() => validateClassroomLoadOptions(options));
});

test('classroom production validation fires at exactly 20 learners (adv-003 boundary)', () => {
  // Boundary pinned: >= 20 enforces the flag, < 20 does not.
  const options20 = parseClassroomLoadArgs([
    '--production',
    '--origin', 'https://ks2.eugnel.uk',
    '--confirm-production-load',
    '--cookie', 'ks2_session=real',
    '--learners', '20',
    '--bootstrap-burst', '1',
    '--rounds', '1',
  ]);
  assert.throws(() => validateClassroomLoadOptions(options20), /--confirm-high-production-load/);

  const options19 = parseClassroomLoadArgs([
    '--production',
    '--origin', 'https://ks2.eugnel.uk',
    '--confirm-production-load',
    '--cookie', 'ks2_session=real',
    '--learners', '19',
    '--bootstrap-burst', '19',
    '--rounds', '1',
  ]);
  assert.doesNotThrow(() => validateClassroomLoadOptions(options19));
});

test('P95 bootstrap gate fails closed when no measurements captured (adv-006)', () => {
  const summary = summariseCapacityResults([
    // Only command measurements; no bootstrap endpoint key.
    {
      scenario: 'human-paced-grammar-round',
      method: 'POST',
      endpoint: '/api/subjects/grammar/command',
      status: 200,
      ok: true,
      wallMs: 100,
      responseBytes: 500,
    },
  ], { expectedRequests: 1 });
  const violations = evaluateCapacityThresholds(summary, { maxBootstrapP95Ms: 1000 });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].threshold, 'max-bootstrap-p95-ms');
  assert.equal(violations[0].observed, null);
  assert.ok(violations[0].message.includes('No measurements'));
});

test('P95 command gate fails closed when no measurements captured (adv-006)', () => {
  const summary = summariseCapacityResults([
    // Only bootstrap measurements; no command endpoint key.
    {
      scenario: 'cold-bootstrap-burst',
      method: 'GET',
      endpoint: '/api/bootstrap',
      status: 200,
      ok: true,
      wallMs: 100,
      responseBytes: 500,
    },
  ], { expectedRequests: 1 });
  const violations = evaluateCapacityThresholds(summary, { maxCommandP95Ms: 750 });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].threshold, 'max-command-p95-ms');
  assert.equal(violations[0].observed, null);
});

test('integer parser rejects non-integer values for threshold flags (C-04)', () => {
  for (const flag of ['--max-5xx', '--max-network-failures', '--max-bootstrap-p95-ms', '--max-command-p95-ms', '--max-response-bytes']) {
    assert.throws(
      () => parseClassroomLoadArgs(['--dry-run', flag, '1.5']),
      /must be a non-negative integer/,
      `${flag} should reject 1.5`,
    );
    assert.throws(
      () => parseClassroomLoadArgs(['--dry-run', flag, '-1']),
      /must be a non-negative integer/,
      `${flag} should reject -1`,
    );
    assert.throws(
      () => parseClassroomLoadArgs(['--dry-run', flag, 'abc']),
      /must be a non-negative integer/,
      `${flag} should reject abc`,
    );
  }
});

test('integer parser rejects missing value for threshold flag (C-04)', () => {
  assert.throws(
    () => parseClassroomLoadArgs(['--dry-run', '--max-5xx']),
    /--max-5xx requires a value/,
  );
});

test('probe parser rejects duplicate --max-bytes (adv-residual-1)', () => {
  assert.throws(
    () => parseProbeArgs(['--max-bytes', '500000', '--max-bytes', '1000000']),
    /--max-bytes specified more than once/,
  );
});

test('probe parser rejects duplicate --max-sessions', () => {
  assert.throws(
    () => parseProbeArgs(['--max-sessions', '10', '--max-sessions', '1000']),
    /--max-sessions specified more than once/,
  );
});

test('probe parser allows --header and --forbidden-token repeated (cumulative)', () => {
  const options = parseProbeArgs([
    '--header', 'x-a: 1',
    '--header', 'x-b: 2',
    '--forbidden-token', 'alpha',
    '--forbidden-token', 'beta',
  ]);
  assert.deepEqual(options.headers, ['x-a: 1', 'x-b: 2']);
  assert.deepEqual(options.forbiddenTokens, ['alpha', 'beta']);
});
