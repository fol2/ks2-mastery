import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  parseSpellingDenseArgs,
  runCli,
  runSpellingDenseHistorySmoke,
  EXIT_OK,
  EXIT_USAGE,
  EXIT_VALIDATION,
} from '../scripts/spelling-dense-history-smoke.mjs';

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

function buildSpellingStartModel({ leakWord = false, leakSentence = false, phase = 'session' } = {}) {
  const currentCard = {
    prompt: {
      cloze: 'The ___ jumps over the moon.',
    },
  };
  if (leakWord) currentCard.word = 'cow';
  if (leakSentence) currentCard.prompt.sentence = 'The cow jumps over the moon.';
  return {
    phase,
    session: {
      id: 'session-1',
      serverAuthority: 'worker',
      progress: { total: 1 },
      currentCard,
    },
    audio: { promptToken: 'token-1' },
  };
}

function buildCommandResponse({ appliedRevision = 8, subjectReadModel, audio, signals = [] } = {}) {
  return {
    ok: true,
    mutation: { appliedRevision },
    subjectReadModel,
    audio: audio || { promptToken: 'token-1' },
    meta: {
      capacity: {
        requestId: 'ks2_req_11111111-2222-3333-4444-555555555555',
        queryCount: 3,
        d1RowsRead: 5,
        d1RowsWritten: 1,
        wallMs: 12.5,
        responseBytes: 4321,
        signals,
      },
    },
  };
}

function installDemoBootstrapHandlers({ bootstrapCapacity = null } = {}) {
  const calls = [];
  const previousFetch = globalThis.fetch;

  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const pathname = new URL(String(url)).pathname;

    if (pathname === '/api/demo/session') {
      return jsonResponse({
        ok: true,
        session: { demo: true, accountId: 'account-a', learnerId: 'learner-a' },
      }, {
        status: 201,
        headers: {
          'set-cookie': ['ks2_session=demo123; Path=/; HttpOnly'],
        },
      });
    }
    if (pathname === '/api/bootstrap') {
      return jsonResponse({
        ok: true,
        session: { demo: true, accountId: 'account-a' },
        learners: {
          selectedId: 'learner-a',
          byId: { 'learner-a': { stateRevision: 7 } },
        },
        bootstrapCapacity,
      });
    }
    if (pathname === '/api/subjects/spelling/command') {
      const body = JSON.parse(init.body || '{}');
      if (body.command === 'start-session') {
        return jsonResponse(buildCommandResponse({
          appliedRevision: 8,
          subjectReadModel: buildSpellingStartModel(),
        }));
      }
      if (body.command === 'submit-answer') {
        return jsonResponse(buildCommandResponse({
          appliedRevision: 9,
          subjectReadModel: { phase: 'feedback', feedback: { kind: 'mistake' } },
        }));
      }
    }
    return jsonResponse({ ok: false, error: 'unexpected' }, { status: 500 });
  };

  return {
    calls,
    restore() {
      globalThis.fetch = previousFetch;
    },
  };
}

test('parseSpellingDenseArgs accepts origin, cookie, max-p95-ms, output, and bootstrap-capacity flags', () => {
  const options = parseSpellingDenseArgs([
    '--origin', 'https://ks2.eugnel.uk',
    '--cookie', 'ks2_session=abc',
    '--max-p95-ms', '500',
    '--require-bootstrap-capacity',
    '--output', 'reports/capacity/spelling-dense-test.json',
  ]);
  assert.equal(options.origin, 'https://ks2.eugnel.uk');
  assert.equal(options.cookie, 'ks2_session=abc');
  assert.equal(options.maxP95Ms, 500);
  assert.equal(options.requireBootstrapCapacity, true);
  assert.equal(options.output, 'reports/capacity/spelling-dense-test.json');
  assert.equal(options.help, false);
});

test('parseSpellingDenseArgs rejects unknown flags', () => {
  assert.throws(() => parseSpellingDenseArgs(['--weird-flag']), /Unknown option: --weird-flag/);
});

test('parseSpellingDenseArgs rejects duplicate threshold flags', () => {
  assert.throws(
    () => parseSpellingDenseArgs(['--max-p95-ms', '500', '--max-p95-ms', '999']),
    /--max-p95-ms specified more than once/,
  );
});

test('parseSpellingDenseArgs --help returns help flag', () => {
  const options = parseSpellingDenseArgs(['--help']);
  assert.equal(options.help, true);
});

test('runSpellingDenseHistorySmoke happy path reports start-session wall time under threshold', async () => {
  const fixture = installDemoBootstrapHandlers({
    bootstrapCapacity: {
      version: 1,
      mode: 'public-bounded',
      practiceSessions: { returned: 0, bounded: true },
      eventLog: { returned: 0, bounded: true },
    },
  });

  try {
    const evidence = await runSpellingDenseHistorySmoke({
      origin: 'https://preview.example.test',
      maxP95Ms: 750,
      requireBootstrapCapacity: true,
    });
    assert.equal(evidence.ok, true);
    assert.equal(evidence.thresholds.violations.length, 0);
    assert.equal(evidence.commands.length, 2);
    assert.equal(evidence.commands[0].command, 'start-session');
    assert.equal(evidence.commands[0].status, 200);
    assert.equal(evidence.commands[1].command, 'submit-answer');
    assert.equal(evidence.bootstrap.capacity?.mode, 'public-bounded');
    assert.ok(evidence.commands[0].wallMs >= 0, 'wallMs must be a non-negative number');
    assert.equal(evidence.commands[0].serverCapacity?.queryCount, 3);
    assert.deepEqual(evidence.commands[0].signals, []);
  } finally {
    fixture.restore();
  }
});

test('runSpellingDenseHistorySmoke flags a P95 wall-time violation below a strict gate', async () => {
  // Set maxP95Ms to -1 so any positive wall time violates the gate; this
  // proves the gate actually fires without needing to slow the fixture.
  const fixture = installDemoBootstrapHandlers();
  try {
    const evidence = await runSpellingDenseHistorySmoke({
      origin: 'https://preview.example.test',
      maxP95Ms: -1,
    });
    assert.equal(evidence.ok, false);
    assert.ok(evidence.thresholds.violations.length > 0);
    assert.equal(evidence.thresholds.violations[0].threshold, 'max-p95-ms');
  } finally {
    fixture.restore();
  }
});

test('runSpellingDenseHistorySmoke rejects missing bootstrapCapacity when required', async () => {
  const fixture = installDemoBootstrapHandlers({ bootstrapCapacity: null });
  try {
    await assert.rejects(
      () => runSpellingDenseHistorySmoke({
        origin: 'https://preview.example.test',
        requireBootstrapCapacity: true,
      }),
      /missing bootstrapCapacity metadata/,
    );
  } finally {
    fixture.restore();
  }
});

test('runSpellingDenseHistorySmoke surfaces bootstrap 5xx as transport failure', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const pathname = new URL(String(url)).pathname;
    if (pathname === '/api/demo/session') {
      return jsonResponse({
        ok: true,
        session: { demo: true, accountId: 'account-a', learnerId: 'learner-a' },
      }, { status: 201, headers: { 'set-cookie': ['ks2_session=demo123'] } });
    }
    if (pathname === '/api/bootstrap') {
      return jsonResponse({ ok: false, error: 'service unavailable' }, { status: 503 });
    }
    return jsonResponse({ ok: false }, { status: 500 });
  };
  try {
    await assert.rejects(
      () => runSpellingDenseHistorySmoke({ origin: 'https://preview.example.test' }),
      /Bootstrap failed with 503/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('runSpellingDenseHistorySmoke fails when the subject read model leaks the raw word', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const pathname = new URL(String(url)).pathname;
    if (pathname === '/api/demo/session') {
      return jsonResponse({
        ok: true,
        session: { demo: true, accountId: 'account-a', learnerId: 'learner-a' },
      }, { status: 201, headers: { 'set-cookie': ['ks2_session=demo123'] } });
    }
    if (pathname === '/api/bootstrap') {
      return jsonResponse({
        ok: true,
        session: { demo: true, accountId: 'account-a' },
        learners: {
          selectedId: 'learner-a',
          byId: { 'learner-a': { stateRevision: 7 } },
        },
      });
    }
    if (pathname === '/api/subjects/spelling/command') {
      const body = JSON.parse(init.body || '{}');
      if (body.command === 'start-session') {
        return jsonResponse(buildCommandResponse({
          appliedRevision: 8,
          subjectReadModel: buildSpellingStartModel({ leakWord: true }),
        }));
      }
    }
    return jsonResponse({ ok: false }, { status: 500 });
  };
  try {
    await assert.rejects(
      () => runSpellingDenseHistorySmoke({ origin: 'https://preview.example.test' }),
      /currentCard\.word must not expose the raw word/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('runSpellingDenseHistorySmoke fails when the start response surfaces exceededCpu', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const pathname = new URL(String(url)).pathname;
    if (pathname === '/api/demo/session') {
      return jsonResponse({
        ok: true,
        session: { demo: true, accountId: 'account-a', learnerId: 'learner-a' },
      }, { status: 201, headers: { 'set-cookie': ['ks2_session=demo123'] } });
    }
    if (pathname === '/api/bootstrap') {
      return jsonResponse({
        ok: true,
        session: { demo: true, accountId: 'account-a' },
        learners: {
          selectedId: 'learner-a',
          byId: { 'learner-a': { stateRevision: 7 } },
        },
      });
    }
    if (pathname === '/api/subjects/spelling/command') {
      const body = JSON.parse(init.body || '{}');
      if (body.command === 'start-session') {
        return jsonResponse(buildCommandResponse({
          appliedRevision: 8,
          subjectReadModel: buildSpellingStartModel(),
          signals: ['exceededCpu'],
        }));
      }
    }
    return jsonResponse({ ok: false }, { status: 500 });
  };
  try {
    await assert.rejects(
      () => runSpellingDenseHistorySmoke({ origin: 'https://preview.example.test' }),
      /exceededCpu/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('runCli --output persists evidence JSON with reportMeta + summary envelope', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-spelling-dense-'));
  const outputPath = join(tempDir, 'spelling-dense.json');
  const fixture = installDemoBootstrapHandlers({
    bootstrapCapacity: {
      version: 1,
      mode: 'public-bounded',
      practiceSessions: { returned: 0, bounded: true },
      eventLog: { returned: 0, bounded: true },
    },
  });
  const previousLog = console.log;
  console.log = () => {};

  try {
    const code = await runCli([
      '--origin', 'https://preview.example.test',
      '--max-p95-ms', '750',
      '--require-bootstrap-capacity',
      '--output', outputPath,
    ]);
    assert.equal(code, EXIT_OK);
    const written = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.equal(written.ok, true);
    assert.ok(written.reportMeta, 'envelope must include reportMeta');
    assert.ok(written.summary, 'envelope must include summary');
    assert.ok(Array.isArray(written.failures), 'envelope must include failures[]');
    assert.ok(written.thresholds, 'envelope must include thresholds object');
    assert.ok(written.safety, 'envelope must include safety block');
    assert.equal(written.safety.mode, 'production-spelling-dense-smoke');
    assert.equal(Array.isArray(written.summary.commands), true);
    assert.equal(written.summary.commands.length, 2);
    assert.match(written.summary.startedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(written.summary.finishedAt, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    console.log = previousLog;
    fixture.restore();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('runCli --help exits 0 without running the smoke', async () => {
  const previousLog = console.log;
  const logged = [];
  console.log = (...args) => logged.push(args.map(String).join(' '));
  try {
    const code = await runCli(['--help']);
    assert.equal(code, EXIT_OK);
    assert.ok(logged.some((line) => line.includes('Usage: node ./scripts/spelling-dense-history-smoke.mjs')));
  } finally {
    console.log = previousLog;
  }
});

test('runCli unknown flag returns EXIT_USAGE without calling fetch', async () => {
  const previousFetch = globalThis.fetch;
  const previousError = console.error;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return jsonResponse({ ok: false }, { status: 500 });
  };
  console.error = () => {};
  try {
    const code = await runCli(['--totally-unknown']);
    assert.equal(code, EXIT_USAGE);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = previousFetch;
    console.error = previousError;
  }
});

test('runCli P95 violation exits EXIT_VALIDATION', async () => {
  const fixture = installDemoBootstrapHandlers();
  const previousLog = console.log;
  console.log = () => {};
  try {
    const code = await runCli([
      '--origin', 'https://preview.example.test',
      '--max-p95-ms', '0',
    ]);
    assert.equal(code, EXIT_VALIDATION);
  } finally {
    console.log = previousLog;
    fixture.restore();
  }
});
