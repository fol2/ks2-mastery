import assert from 'node:assert/strict';
import test from 'node:test';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  parseSpellingDenseArgs,
  runCli,
  runSpellingDenseHistorySmoke,
  EXIT_OK,
  EXIT_USAGE,
  EXIT_VALIDATION,
  EXIT_TRANSPORT,
} from '../scripts/spelling-dense-history-smoke.mjs';
import { verifyCapacityDoc } from '../scripts/verify-capacity-evidence.mjs';

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

// --- Exit-code taxonomy tests (PR #233 review blocker-2) -----------------
//
// Every branch of the `runCli` catch block maps an error class to an exit
// code. These tests pin the mapping so a future refactor cannot silently
// demote a validation failure to EXIT_TRANSPORT (or vice versa).

function silenceLogs() {
  const previousLog = console.log;
  const previousError = console.error;
  console.log = () => {};
  console.error = () => {};
  return () => {
    console.log = previousLog;
    console.error = previousError;
  };
}

function installLeakyWordHandlers() {
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
        learners: { selectedId: 'learner-a', byId: { 'learner-a': { stateRevision: 7 } } },
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
  return () => { globalThis.fetch = previousFetch; };
}

test('runCli returns EXIT_VALIDATION when start-session leaks the raw word', async () => {
  const restoreFetch = installLeakyWordHandlers();
  const restoreLogs = silenceLogs();
  try {
    const code = await runCli(['--origin', 'https://preview.example.test']);
    assert.equal(code, EXIT_VALIDATION);
  } finally {
    restoreLogs();
    restoreFetch();
  }
});

test('runCli returns EXIT_VALIDATION when start-session leaks the raw sentence', async () => {
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
        learners: { selectedId: 'learner-a', byId: { 'learner-a': { stateRevision: 7 } } },
      });
    }
    if (pathname === '/api/subjects/spelling/command') {
      const body = JSON.parse(init.body || '{}');
      if (body.command === 'start-session') {
        return jsonResponse(buildCommandResponse({
          appliedRevision: 8,
          subjectReadModel: buildSpellingStartModel({ leakSentence: true }),
        }));
      }
    }
    return jsonResponse({ ok: false }, { status: 500 });
  };
  const restoreLogs = silenceLogs();
  try {
    const code = await runCli(['--origin', 'https://preview.example.test']);
    assert.equal(code, EXIT_VALIDATION);
  } finally {
    restoreLogs();
    globalThis.fetch = previousFetch;
  }
});

test('runCli returns EXIT_VALIDATION when a rename-class forbidden key appears in the response', async () => {
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
        learners: { selectedId: 'learner-a', byId: { 'learner-a': { stateRevision: 7 } } },
      });
    }
    if (pathname === '/api/subjects/spelling/command') {
      const body = JSON.parse(init.body || '{}');
      if (body.command === 'start-session') {
        const model = buildSpellingStartModel();
        // Rename-class leak: a future refactor renamed `word` to
        // `canonical`. The extended forbidden-key floor catches this.
        model.session.currentCard.canonical = 'cow';
        return jsonResponse(buildCommandResponse({
          appliedRevision: 8,
          subjectReadModel: model,
        }));
      }
    }
    return jsonResponse({ ok: false }, { status: 500 });
  };
  const restoreLogs = silenceLogs();
  try {
    const code = await runCli(['--origin', 'https://preview.example.test']);
    assert.equal(code, EXIT_VALIDATION);
  } finally {
    restoreLogs();
    globalThis.fetch = previousFetch;
  }
});

test('runCli returns EXIT_VALIDATION when exceededCpu is surfaced', async () => {
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
        learners: { selectedId: 'learner-a', byId: { 'learner-a': { stateRevision: 7 } } },
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
  const restoreLogs = silenceLogs();
  try {
    const code = await runCli(['--origin', 'https://preview.example.test']);
    assert.equal(code, EXIT_VALIDATION);
  } finally {
    restoreLogs();
    globalThis.fetch = previousFetch;
  }
});

test('runCli returns EXIT_VALIDATION when bootstrap lacks capacity metadata under --require-bootstrap-capacity', async () => {
  const fixture = installDemoBootstrapHandlers({ bootstrapCapacity: null });
  const restoreLogs = silenceLogs();
  try {
    const code = await runCli([
      '--origin', 'https://preview.example.test',
      '--require-bootstrap-capacity',
    ]);
    assert.equal(code, EXIT_VALIDATION);
  } finally {
    restoreLogs();
    fixture.restore();
  }
});

test('runCli returns EXIT_TRANSPORT when bootstrap replies with HTTP 503', async () => {
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
      return jsonResponse({ ok: false, error: 'degraded' }, { status: 503 });
    }
    return jsonResponse({ ok: false }, { status: 500 });
  };
  const restoreLogs = silenceLogs();
  try {
    const code = await runCli(['--origin', 'https://preview.example.test']);
    assert.equal(code, EXIT_TRANSPORT);
  } finally {
    restoreLogs();
    globalThis.fetch = previousFetch;
  }
});

test('runCli returns EXIT_TRANSPORT when fetch rejects outright (network failure)', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed: ECONNREFUSED');
  };
  const restoreLogs = silenceLogs();
  try {
    const code = await runCli(['--origin', 'https://preview.example.test']);
    assert.equal(code, EXIT_TRANSPORT);
  } finally {
    restoreLogs();
    globalThis.fetch = previousFetch;
  }
});

test('runCli returns EXIT_VALIDATION when start-session replies with HTTP 422 (shape-visible non-5xx)', async () => {
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
        learners: { selectedId: 'learner-a', byId: { 'learner-a': { stateRevision: 7 } } },
      });
    }
    if (pathname === '/api/subjects/spelling/command') {
      return jsonResponse({ ok: false, error: 'bad-request' }, { status: 422 });
    }
    return jsonResponse({ ok: false }, { status: 500 });
  };
  const restoreLogs = silenceLogs();
  try {
    const code = await runCli(['--origin', 'https://preview.example.test']);
    assert.equal(code, EXIT_VALIDATION);
  } finally {
    restoreLogs();
    globalThis.fetch = previousFetch;
  }
});

test('runCli returns EXIT_TRANSPORT when start-session replies with HTTP 500', async () => {
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
        learners: { selectedId: 'learner-a', byId: { 'learner-a': { stateRevision: 7 } } },
      });
    }
    if (pathname === '/api/subjects/spelling/command') {
      return jsonResponse({ ok: false, error: 'upstream-broken' }, { status: 500 });
    }
    return jsonResponse({ ok: false }, { status: 500 });
  };
  const restoreLogs = silenceLogs();
  try {
    const code = await runCli(['--origin', 'https://preview.example.test']);
    assert.equal(code, EXIT_TRANSPORT);
  } finally {
    restoreLogs();
    globalThis.fetch = previousFetch;
  }
});

// --- Submit-answer redaction regression (PR #233 lower-priority #3) -----

test('runCli returns EXIT_VALIDATION when submit-answer leaks the raw word post-marking', async () => {
  // After PR #233 review, the submit-answer path is explicitly redaction-
  // checked alongside start-session. A future regression where the
  // feedback payload carries `word` or `prompt.sentence` in the current
  // card must fail closed.
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
        learners: { selectedId: 'learner-a', byId: { 'learner-a': { stateRevision: 7 } } },
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
        // Leak: feedback payload includes the raw word.
        return jsonResponse(buildCommandResponse({
          appliedRevision: 9,
          subjectReadModel: {
            phase: 'feedback',
            session: { serverAuthority: 'worker', currentCard: { word: 'cow' } },
            feedback: { kind: 'mistake' },
          },
        }));
      }
    }
    return jsonResponse({ ok: false }, { status: 500 });
  };
  const restoreLogs = silenceLogs();
  try {
    const code = await runCli(['--origin', 'https://preview.example.test']);
    assert.equal(code, EXIT_VALIDATION);
  } finally {
    restoreLogs();
    globalThis.fetch = previousFetch;
  }
});

test('runCli returns EXIT_VALIDATION when submit-answer leaks prompt.sentence', async () => {
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
        learners: { selectedId: 'learner-a', byId: { 'learner-a': { stateRevision: 7 } } },
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
          subjectReadModel: {
            phase: 'feedback',
            session: {
              serverAuthority: 'worker',
              currentCard: { prompt: { sentence: 'The cow jumps over the moon.' } },
            },
            feedback: { kind: 'mistake' },
          },
        }));
      }
    }
    return jsonResponse({ ok: false }, { status: 500 });
  };
  const restoreLogs = silenceLogs();
  try {
    const code = await runCli(['--origin', 'https://preview.example.test']);
    assert.equal(code, EXIT_VALIDATION);
  } finally {
    restoreLogs();
    globalThis.fetch = previousFetch;
  }
});

// --- Integration: runCli --output then verify-capacity-evidence ---------
//
// Blocker-1 regression lock: evidence persisted by runCli must have the
// exact shape that verify-capacity-evidence.mjs requires — canonical
// `summary.endpoints[key]` map plus `thresholds.<name>.{configured,
// observed, passed}` block. This test drives the full contract end to
// end by writing a real capacity.md row that cites the emitted JSON
// and asserting verifyCapacityDoc returns ok=true.

test('runCli --output emits evidence that verify-capacity-evidence accepts (integration)', async () => {
  // Resolve HEAD SHA BEFORE chdir so `git rev-parse HEAD` runs against
  // the real repo, not the temp dir fixture.
  const headSha = execCommitSha();

  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-spelling-dense-verify-'));
  const reportsDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(reportsDir, { recursive: true });

  const fixture = installDemoBootstrapHandlers({
    bootstrapCapacity: {
      version: 1,
      mode: 'public-bounded',
      practiceSessions: { returned: 0, bounded: true },
      eventLog: { returned: 0, bounded: true },
    },
  });
  const restoreLogs = silenceLogs();
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const outputPath = 'reports/capacity/spelling-dense-integration.json';
    const code = await runCli([
      '--origin', 'https://preview.example.test',
      '--max-p95-ms', '750',
      '--require-bootstrap-capacity',
      '--output', outputPath,
    ]);
    assert.equal(code, EXIT_OK);

    const written = JSON.parse(readFileSync(join(tempDir, outputPath), 'utf8'));
    // Shape gates the review flagged explicitly.
    assert.ok(written.summary?.endpoints, 'summary.endpoints map must be present.');
    const commandKey = 'POST /api/subjects/spelling/command';
    assert.ok(written.summary.endpoints[commandKey], 'summary.endpoints must key by route.');
    assert.equal(typeof written.summary.endpoints[commandKey].p95WallMs, 'number');
    assert.equal(typeof written.summary.endpoints[commandKey].maxResponseBytes, 'number');
    assert.ok(written.thresholds?.maxP95Ms, 'thresholds.maxP95Ms must be present.');
    assert.equal(typeof written.thresholds.maxP95Ms.configured, 'number');
    assert.equal(typeof written.thresholds.maxP95Ms.passed, 'boolean');

    // Write capacity.md row citing the emitted JSON and point reportMeta
    // at a commit SHA verify-capacity-evidence will accept. The fixture
    // evidence does not carry a real git commit, so we patch the
    // persisted file's `reportMeta.commit` to the test repo HEAD so the
    // row cross-check passes. The SHA was resolved BEFORE chdir above.
    written.reportMeta.commit = headSha;
    writeFileSync(join(tempDir, outputPath), JSON.stringify(written, null, 2));

    const rowCommit = headSha.slice(0, 7);
    const capacityMd = [
      '# capacity.md',
      '',
      '## Capacity Evidence',
      '',
      '| Date | Commit | Env | Plan | Learners | Burst | Rounds | P95 Bootstrap | P95 Command | Max Bytes | 5xx | Signals | Decision | Evidence |',
      '| --- | --- | --- | --- | --: | --: | --: | --: | --: | --: | --: | --- | --- | --- |',
      // Dashes in numeric cells tell verify to skip the drift check for
      // that cell — the dense-history smoke does not populate learners /
      // burst / rounds (the concept is ill-defined for a single-sample
      // smoke) so we let verify skip those comparisons.
      `| 2026-04-25 | ${rowCommit} | preview | Free | — | — | — | — | — | — | — | none | smoke-pass | ${outputPath} |`,
      '',
      '## Next',
      '',
    ].join('\n');
    const docPath = join(tempDir, 'capacity.md');
    writeFileSync(docPath, capacityMd);

    // CAPACITY_VERIFY_SKIP_ANCESTRY is already silent by default; leave
    // it unset so the existence probe runs against the real git repo
    // (which DOES have this commit since we queried HEAD).
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, true, `verify failed: ${JSON.stringify(result.report, null, 2)}`);
  } finally {
    process.chdir(cwd);
    restoreLogs();
    fixture.restore();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

function execCommitSha() {
  return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
}
