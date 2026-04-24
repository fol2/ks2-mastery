import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertNoForbiddenObjectKeys,
  configuredOrigin,
  createDemoSession,
  loadBootstrap,
  subjectCommand,
} from '../scripts/lib/production-smoke.mjs';

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
      ...(init.withoutGetSetCookie ? {} : {
        getSetCookie() {
          const value = headers['set-cookie'];
          if (Array.isArray(value)) return value;
          return value ? [value] : [];
        },
      }),
    },
    async text() {
      return JSON.stringify(payload);
    },
  };
}

test('production smoke origin config accepts env and CLI overrides', () => {
  const previousArgv = process.argv;
  const previousOrigin = process.env.KS2_SMOKE_ORIGIN;

  try {
    process.argv = ['node', 'smoke'];
    process.env.KS2_SMOKE_ORIGIN = 'preview.example.test/path';
    assert.equal(configuredOrigin(), 'https://preview.example.test');

    process.argv = ['node', 'smoke', '--origin', 'http://localhost:8787/demo'];
    assert.equal(configuredOrigin(), 'http://localhost:8787');
  } finally {
    process.argv = previousArgv;
    if (previousOrigin === undefined) {
      delete process.env.KS2_SMOKE_ORIGIN;
    } else {
      process.env.KS2_SMOKE_ORIGIN = previousOrigin;
    }
  }
});

test('production smoke helpers create demo, bootstrap, and send subject command envelope', async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1) {
      return jsonResponse({
        ok: true,
        session: { demo: true, accountId: 'account-a' },
      }, {
        status: 201,
        headers: {
          'set-cookie': [
            'theme=dark; Path=/',
            'ks2_session=demo123; Path=/; HttpOnly',
          ],
        },
      });
    }
    if (calls.length === 2) {
      return jsonResponse({
        ok: true,
        learners: {
          selectedId: 'learner-a',
          byId: {
            'learner-a': { stateRevision: 7 },
          },
        },
      });
    }
    return jsonResponse({
      ok: true,
      mutation: { appliedRevision: 8 },
      subjectReadModel: { phase: 'session' },
    });
  };

  try {
    const origin = 'https://preview.example.test';
    const demo = await createDemoSession(origin);
    assert.equal(demo.cookie, 'ks2_session=demo123');
    assert.deepEqual(demo.session, { demo: true, accountId: 'account-a' });

    const bootstrap = await loadBootstrap(origin, demo.cookie);
    assert.equal(bootstrap.learnerId, 'learner-a');
    assert.equal(bootstrap.revision, 7);

    const step = await subjectCommand({
      origin,
      cookie: demo.cookie,
      subjectId: 'grammar',
      learnerId: bootstrap.learnerId,
      revision: bootstrap.revision,
      command: 'start-session',
      payload: { mode: 'smart' },
    });

    assert.equal(step.revision, 8);
    assert.equal(step.payload.subjectReadModel.phase, 'session');
    assert.equal(calls[0].url, 'https://preview.example.test/api/demo/session');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.origin, origin);
    assert.equal(calls[0].init.signal instanceof AbortSignal, true);
    assert.equal(calls[1].url, 'https://preview.example.test/api/bootstrap');
    assert.equal(calls[1].init.headers.cookie, demo.cookie);

    const commandBody = JSON.parse(calls[2].init.body);
    assert.equal(calls[2].url, 'https://preview.example.test/api/subjects/grammar/command');
    assert.equal(calls[2].init.headers.cookie, demo.cookie);
    assert.equal(commandBody.subjectId, 'grammar');
    assert.equal(commandBody.learnerId, 'learner-a');
    assert.equal(commandBody.command, 'start-session');
    assert.equal(commandBody.expectedLearnerRevision, 7);
    assert.deepEqual(commandBody.payload, { mode: 'smart' });
    assert.match(commandBody.requestId, /^grammar-start-session-\d+-\d+$/);
    assert.equal(commandBody.correlationId, commandBody.requestId);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('production smoke demo session parses combined set-cookie fallback', async () => {
  const previousFetch = globalThis.fetch;

  globalThis.fetch = async () => jsonResponse({
    ok: true,
    session: { demo: true, accountId: 'account-a' },
  }, {
    status: 201,
    withoutGetSetCookie: true,
    headers: {
      'set-cookie': 'theme=dark; Path=/, ks2_session=demo123; Path=/; HttpOnly',
    },
  });

  try {
    const demo = await createDemoSession('https://preview.example.test');
    assert.equal(demo.cookie, 'ks2_session=demo123');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('production smoke helper reports fetch failures with timeout context', async () => {
  const previousArgv = process.argv;
  const previousFetch = globalThis.fetch;
  const previousTimeout = process.env.KS2_SMOKE_TIMEOUT_MS;

  process.argv = ['node', 'smoke'];
  process.env.KS2_SMOKE_TIMEOUT_MS = '25';
  globalThis.fetch = async () => {
    throw new Error('network stuck');
  };

  try {
    await assert.rejects(
      () => createDemoSession('https://preview.example.test'),
      /Request to https:\/\/preview\.example\.test\/api\/demo\/session failed or timed out after 25ms: network stuck/,
    );
  } finally {
    process.argv = previousArgv;
    globalThis.fetch = previousFetch;
    if (previousTimeout === undefined) {
      delete process.env.KS2_SMOKE_TIMEOUT_MS;
    } else {
      process.env.KS2_SMOKE_TIMEOUT_MS = previousTimeout;
    }
  }
});

test('production smoke forbidden-key assertion scans nested arrays and objects', () => {
  assert.doesNotThrow(() => {
    assertNoForbiddenObjectKeys({ item: [{ prompt: { text: 'Safe' } }] }, new Set(['answer']));
  });

  assert.throws(() => {
    assertNoForbiddenObjectKeys({ item: [{ prompt: { answer: 'leaked' } }] }, new Set(['answer']));
  }, /readModel\.item\[0\]\.prompt\.answer exposed a server-only field/);
});
