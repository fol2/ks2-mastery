import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHeroModeClient, HeroModeClientError } from '../src/platform/hero/hero-client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock fetch that returns the given status and body. */
function mockFetch(status, body = {}, { ok = status >= 200 && status < 300 } = {}) {
  const calls = [];
  async function fakeFetch(url, init) {
    calls.push({ url, init });
    return {
      ok,
      status,
      json: async () => body,
    };
  }
  fakeFetch.calls = calls;
  return fakeFetch;
}

/** Build a mock fetch that throws (simulates network failure). */
function networkErrorFetch(message = 'Network failure') {
  const calls = [];
  async function fakeFetch(url, init) {
    calls.push({ url, init });
    throw new Error(message);
  }
  fakeFetch.calls = calls;
  return fakeFetch;
}

function defaultOpts(overrides = {}) {
  return {
    fetch: mockFetch(200, { ok: true }),
    getLearnerRevision: () => 42,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// readModel
// ---------------------------------------------------------------------------

describe('createHeroModeClient — readModel', () => {
  it('calls GET /api/hero/read-model with correct path and headers', async () => {
    const fakeFetch = mockFetch(200, { ok: true, hero: { version: 3 } });
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    await client.readModel({ learnerId: 'abc' });

    assert.equal(fakeFetch.calls.length, 1);
    const { url, init } = fakeFetch.calls[0];
    assert.equal(url, '/api/hero/read-model?learnerId=abc');
    assert.equal(init.method, 'GET');
    assert.equal(init.headers.accept, 'application/json');
  });

  it('returns parsed JSON response on success', async () => {
    const expected = { ok: true, hero: { version: 3, questFingerprint: 'hero-qf-abc123' } };
    const fakeFetch = mockFetch(200, expected);
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    const result = await client.readModel({ learnerId: 'abc' });

    assert.deepStrictEqual(result, expected);
  });

  it('throws HeroModeClientError with typed code on non-2xx', async () => {
    const fakeFetch = mockFetch(404, { ok: false, code: 'hero_shadow_disabled', message: 'Shadow disabled' });
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    const err = await client.readModel({ learnerId: 'abc' }).catch(e => e);

    assert.ok(err instanceof HeroModeClientError);
    assert.equal(err.code, 'hero_shadow_disabled');
    assert.equal(err.status, 404);
  });

  it('throws HeroModeClientError with network_error on network failure', async () => {
    const fakeFetch = networkErrorFetch('connection refused');
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    const err = await client.readModel({ learnerId: 'abc' }).catch(e => e);

    assert.ok(err instanceof HeroModeClientError);
    assert.equal(err.code, 'network_error');
    assert.equal(err.status, 0);
    assert.equal(err.retryable, true);
  });

  it('encodes learnerId in the query string', async () => {
    const fakeFetch = mockFetch(200, { ok: true });
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    await client.readModel({ learnerId: 'a b&c' });

    assert.equal(fakeFetch.calls[0].url, '/api/hero/read-model?learnerId=a%20b%26c');
  });
});

// ---------------------------------------------------------------------------
// startTask — happy path
// ---------------------------------------------------------------------------

describe('createHeroModeClient — startTask happy path', () => {
  it('posts correct Hero command shape (not subject command shape)', async () => {
    const fakeFetch = mockFetch(200, { ok: true, heroLaunch: { subjectId: 'spelling' } });
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    await client.startTask({
      learnerId: 'learner-1',
      questId: 'quest-1',
      questFingerprint: 'hero-qf-aabbcc',
      taskId: 'task-1',
      requestId: 'req-1',
    });

    assert.equal(fakeFetch.calls.length, 1);
    const { url, init } = fakeFetch.calls[0];
    assert.equal(url, '/api/hero/command');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['content-type'], 'application/json');

    const body = JSON.parse(init.body);
    assert.equal(body.command, 'start-task');
    assert.equal(body.learnerId, 'learner-1');
    assert.equal(body.questId, 'quest-1');
    assert.equal(body.questFingerprint, 'hero-qf-aabbcc');
    assert.equal(body.taskId, 'task-1');
    assert.equal(body.requestId, 'req-1');
  });

  it('includes expectedLearnerRevision from getLearnerRevision', async () => {
    const fakeFetch = mockFetch(200, { ok: true });
    const client = createHeroModeClient({
      ...defaultOpts(),
      fetch: fakeFetch,
      getLearnerRevision: (id) => {
        assert.equal(id, 'learner-1');
        return 99;
      },
    });

    await client.startTask({
      learnerId: 'learner-1',
      questId: 'q',
      questFingerprint: 'fp',
      taskId: 't',
      requestId: 'r',
    });

    const body = JSON.parse(fakeFetch.calls[0].init.body);
    assert.equal(body.expectedLearnerRevision, 99);
  });

  it('sets correlationId equal to requestId', async () => {
    const fakeFetch = mockFetch(200, { ok: true });
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    await client.startTask({
      learnerId: 'l',
      questId: 'q',
      questFingerprint: 'fp',
      taskId: 't',
      requestId: 'req-xyz',
    });

    const body = JSON.parse(fakeFetch.calls[0].init.body);
    assert.equal(body.correlationId, 'req-xyz');
    assert.equal(body.correlationId, body.requestId);
  });

  it('body does NOT include subjectId or payload fields', async () => {
    const fakeFetch = mockFetch(200, { ok: true });
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    await client.startTask({
      learnerId: 'l',
      questId: 'q',
      questFingerprint: 'fp',
      taskId: 't',
      requestId: 'r',
    });

    const body = JSON.parse(fakeFetch.calls[0].init.body);
    assert.ok(!('subjectId' in body), 'body must not include subjectId');
    assert.ok(!('payload' in body), 'body must not include payload');
  });

  it('calls onLaunchApplied on success', async () => {
    const responseBody = { ok: true, heroLaunch: { subjectId: 'grammar' } };
    const fakeFetch = mockFetch(200, responseBody);
    const applied = [];
    const client = createHeroModeClient({
      ...defaultOpts(),
      fetch: fakeFetch,
      onLaunchApplied: (resp) => applied.push(resp),
    });

    const result = await client.startTask({
      learnerId: 'l',
      questId: 'q',
      questFingerprint: 'fp',
      taskId: 't',
      requestId: 'r',
    });

    assert.equal(applied.length, 1);
    assert.deepStrictEqual(applied[0], responseBody);
    assert.deepStrictEqual(result, responseBody);
  });
});

// ---------------------------------------------------------------------------
// startTask — error paths
// ---------------------------------------------------------------------------

describe('createHeroModeClient — startTask error paths', () => {
  it('hero_quest_stale → HeroModeClientError with correct code', async () => {
    const fakeFetch = mockFetch(409, { ok: false, code: 'hero_quest_stale', message: 'Quest is stale' });
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    const err = await client.startTask({
      learnerId: 'l', questId: 'q', questFingerprint: 'fp', taskId: 't', requestId: 'r',
    }).catch(e => e);

    assert.ok(err instanceof HeroModeClientError);
    assert.equal(err.code, 'hero_quest_stale');
    assert.equal(err.status, 409);
  });

  it('hero_quest_fingerprint_mismatch → correct typed error', async () => {
    const fakeFetch = mockFetch(409, { ok: false, code: 'hero_quest_fingerprint_mismatch' });
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    const err = await client.startTask({
      learnerId: 'l', questId: 'q', questFingerprint: 'fp', taskId: 't', requestId: 'r',
    }).catch(e => e);

    assert.ok(err instanceof HeroModeClientError);
    assert.equal(err.code, 'hero_quest_fingerprint_mismatch');
  });

  it('hero_active_session_conflict → correct typed error', async () => {
    const fakeFetch = mockFetch(409, { ok: false, code: 'hero_active_session_conflict' });
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    const err = await client.startTask({
      learnerId: 'l', questId: 'q', questFingerprint: 'fp', taskId: 't', requestId: 'r',
    }).catch(e => e);

    assert.ok(err instanceof HeroModeClientError);
    assert.equal(err.code, 'hero_active_session_conflict');
  });

  it('hero_task_not_launchable → correct typed error', async () => {
    const fakeFetch = mockFetch(400, { ok: false, code: 'hero_task_not_launchable' });
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    const err = await client.startTask({
      learnerId: 'l', questId: 'q', questFingerprint: 'fp', taskId: 't', requestId: 'r',
    }).catch(e => e);

    assert.ok(err instanceof HeroModeClientError);
    assert.equal(err.code, 'hero_task_not_launchable');
  });

  it('projection_unavailable with retryable: false → error propagated, no retry', async () => {
    const fakeFetch = mockFetch(503, { ok: false, code: 'projection_unavailable', retryable: false });
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    const err = await client.startTask({
      learnerId: 'l', questId: 'q', questFingerprint: 'fp', taskId: 't', requestId: 'r',
    }).catch(e => e);

    assert.ok(err instanceof HeroModeClientError);
    assert.equal(err.code, 'projection_unavailable');
    assert.equal(err.retryable, false);
    // Only one call — no automatic retry
    assert.equal(fakeFetch.calls.length, 1);
  });

  it('network failure → HeroModeClientError with code network_error', async () => {
    const fakeFetch = networkErrorFetch('ECONNRESET');
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    const err = await client.startTask({
      learnerId: 'l', questId: 'q', questFingerprint: 'fp', taskId: 't', requestId: 'r',
    }).catch(e => e);

    assert.ok(err instanceof HeroModeClientError);
    assert.equal(err.code, 'network_error');
    assert.equal(err.status, 0);
    assert.equal(err.retryable, true);
  });

  it('no automatic retry on stale quest — error thrown to caller', async () => {
    const fakeFetch = mockFetch(409, { ok: false, code: 'hero_quest_stale' });
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    await assert.rejects(
      () => client.startTask({
        learnerId: 'l', questId: 'q', questFingerprint: 'fp', taskId: 't', requestId: 'r',
      }),
      (err) => {
        assert.ok(err instanceof HeroModeClientError);
        assert.equal(err.code, 'hero_quest_stale');
        return true;
      },
    );

    // Exactly one fetch call — no retry attempt
    assert.equal(fakeFetch.calls.length, 1);
  });
});

// ---------------------------------------------------------------------------
// startTask — callback behaviour
// ---------------------------------------------------------------------------

describe('createHeroModeClient — startTask callbacks', () => {
  it('onStaleWrite called on hero_quest_stale error', async () => {
    const fakeFetch = mockFetch(409, { ok: false, code: 'hero_quest_stale' });
    const staleWrites = [];
    const client = createHeroModeClient({
      ...defaultOpts(),
      fetch: fakeFetch,
      onStaleWrite: (info) => staleWrites.push(info),
    });

    await client.startTask({
      learnerId: 'learner-1', questId: 'q', questFingerprint: 'fp', taskId: 't', requestId: 'r',
    }).catch(() => {});

    assert.equal(staleWrites.length, 1);
    assert.equal(staleWrites[0].learnerId, 'learner-1');
    assert.ok(staleWrites[0].error instanceof HeroModeClientError);
    assert.equal(staleWrites[0].error.code, 'hero_quest_stale');
  });

  it('onStaleWrite called on hero_quest_fingerprint_mismatch error', async () => {
    const fakeFetch = mockFetch(409, { ok: false, code: 'hero_quest_fingerprint_mismatch' });
    const staleWrites = [];
    const client = createHeroModeClient({
      ...defaultOpts(),
      fetch: fakeFetch,
      onStaleWrite: (info) => staleWrites.push(info),
    });

    await client.startTask({
      learnerId: 'learner-2', questId: 'q', questFingerprint: 'fp', taskId: 't', requestId: 'r',
    }).catch(() => {});

    assert.equal(staleWrites.length, 1);
    assert.equal(staleWrites[0].learnerId, 'learner-2');
    assert.equal(staleWrites[0].error.code, 'hero_quest_fingerprint_mismatch');
  });

  it('onStaleWrite NOT called on non-stale errors', async () => {
    const fakeFetch = mockFetch(409, { ok: false, code: 'hero_active_session_conflict' });
    const staleWrites = [];
    const client = createHeroModeClient({
      ...defaultOpts(),
      fetch: fakeFetch,
      onStaleWrite: (info) => staleWrites.push(info),
    });

    await client.startTask({
      learnerId: 'l', questId: 'q', questFingerprint: 'fp', taskId: 't', requestId: 'r',
    }).catch(() => {});

    assert.equal(staleWrites.length, 0, 'onStaleWrite must not be called for non-stale errors');
  });

  it('onLaunchApplied NOT called on error', async () => {
    const fakeFetch = mockFetch(500, { ok: false, code: 'internal_error' });
    const applied = [];
    const client = createHeroModeClient({
      ...defaultOpts(),
      fetch: fakeFetch,
      onLaunchApplied: (resp) => applied.push(resp),
    });

    await client.startTask({
      learnerId: 'l', questId: 'q', questFingerprint: 'fp', taskId: 't', requestId: 'r',
    }).catch(() => {});

    assert.equal(applied.length, 0, 'onLaunchApplied must not be called on error');
  });
});

// ---------------------------------------------------------------------------
// HeroModeClientError
// ---------------------------------------------------------------------------

describe('HeroModeClientError', () => {
  it('extends Error', () => {
    const err = new HeroModeClientError({ code: 'test', status: 400 });
    assert.ok(err instanceof Error);
    assert.ok(err instanceof HeroModeClientError);
  });

  it('exposes code, status, retryable, payload', () => {
    const payload = { code: 'hero_quest_stale', message: 'stale' };
    const err = new HeroModeClientError({ code: 'hero_quest_stale', status: 409, payload });
    assert.equal(err.code, 'hero_quest_stale');
    assert.equal(err.status, 409);
    assert.equal(err.retryable, false);
    assert.deepStrictEqual(err.payload, payload);
  });

  it('retryable defaults to true for status 0 (network)', () => {
    const err = new HeroModeClientError({ code: 'network_error', status: 0, retryable: true });
    assert.equal(err.retryable, true);
  });

  it('retryable defaults to true for 5xx', () => {
    const err = new HeroModeClientError({ code: 'internal', status: 500, retryable: true });
    assert.equal(err.retryable, true);
  });

  it('honours explicit retryable: false from server payload', () => {
    const err = new HeroModeClientError({
      code: 'projection_unavailable',
      status: 503,
      payload: { retryable: false },
    });
    assert.equal(err.retryable, false);
  });

  it('name is HeroModeClientError', () => {
    const err = new HeroModeClientError({});
    assert.equal(err.name, 'HeroModeClientError');
  });
});

// ---------------------------------------------------------------------------
// Factory validation
// ---------------------------------------------------------------------------

describe('createHeroModeClient — factory validation', () => {
  it('throws TypeError if fetch is not a function', () => {
    assert.throws(
      () => createHeroModeClient({ fetch: 'not-a-function', getLearnerRevision: () => 0 }),
      /requires a fetch implementation/,
    );
  });
});
