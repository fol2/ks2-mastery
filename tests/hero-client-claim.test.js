import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHeroModeClient, HeroModeClientError } from '../src/platform/hero/hero-client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock fetch that returns a sequence of responses.
 * Each call consumes the next response in the list; if exhausted,
 * the last response is reused.
 */
function createMockFetch(responses) {
  let callIndex = 0;
  const calls = [];

  async function mockFetch(url, init) {
    const parsedBody = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, init, body: parsedBody });
    const resp = responses[callIndex] || responses[responses.length - 1];
    callIndex++;
    return {
      ok: resp.ok !== false,
      status: resp.status || 200,
      json: async () => resp.data,
    };
  }

  mockFetch.calls = calls;
  return mockFetch;
}

function defaultOpts(overrides = {}) {
  return {
    fetch: createMockFetch([{ ok: true, status: 200, data: { ok: true } }]),
    getLearnerRevision: () => 42,
    ...overrides,
  };
}

const baseArgs = {
  learnerId: 'learner-1',
  questId: 'quest-1',
  questFingerprint: 'hero-qf-abc123',
  taskId: 'task-1',
  requestId: 'req-1',
};

// ---------------------------------------------------------------------------
// claimTask — happy path
// ---------------------------------------------------------------------------

describe('createHeroModeClient — claimTask happy path', () => {
  it('sends correct request body shape with command claim-task', async () => {
    const fakeFetch = createMockFetch([{
      ok: true, status: 200, data: { ok: true, heroClaim: { status: 'claimed' } },
    }]);
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    await client.claimTask(baseArgs);

    assert.equal(fakeFetch.calls.length, 1);
    const { url, init, body } = fakeFetch.calls[0];
    assert.equal(url, '/api/hero/command');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['content-type'], 'application/json');
    assert.equal(body.command, 'claim-task');
    assert.equal(body.learnerId, 'learner-1');
    assert.equal(body.questId, 'quest-1');
    assert.equal(body.questFingerprint, 'hero-qf-abc123');
    assert.equal(body.taskId, 'task-1');
    assert.equal(body.requestId, 'req-1');
    assert.equal(body.expectedLearnerRevision, 42);
    assert.ok(body.correlationId.startsWith('hero-claim-'), 'correlationId should start with hero-claim-');
  });

  it('successful claim (200) returns parsed data including heroClaim and hero', async () => {
    const responseData = {
      ok: true,
      heroClaim: { status: 'claimed', taskId: 'task-1' },
      hero: { version: 5, questFingerprint: 'hero-qf-abc123' },
    };
    const fakeFetch = createMockFetch([{ ok: true, status: 200, data: responseData }]);
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    const result = await client.claimTask(baseArgs);

    assert.deepStrictEqual(result, responseData);
  });

  it('already-completed response (200) treated as success, not error', async () => {
    const responseData = {
      ok: true,
      heroClaim: { status: 'already-completed', taskId: 'task-1' },
      hero: { version: 6 },
    };
    const fakeFetch = createMockFetch([{ ok: true, status: 200, data: responseData }]);
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    const result = await client.claimTask(baseArgs);

    assert.deepStrictEqual(result, responseData);
    assert.equal(result.heroClaim.status, 'already-completed');
  });
});

// ---------------------------------------------------------------------------
// claimTask — stale_write auto-retry
// ---------------------------------------------------------------------------

describe('createHeroModeClient — claimTask stale_write retry', () => {
  it('auto-retries once with refreshed revision on stale_write, succeeds on retry', async () => {
    let revisionCallCount = 0;
    const getLearnerRevision = () => {
      revisionCallCount++;
      return revisionCallCount === 1 ? 42 : 99;
    };

    const fakeFetch = createMockFetch([
      { ok: false, status: 409, data: { ok: false, code: 'stale_write' } },
      { ok: true, status: 200, data: { ok: true, heroClaim: { status: 'claimed' } } },
    ]);

    const staleWrites = [];
    const client = createHeroModeClient({
      ...defaultOpts(),
      fetch: fakeFetch,
      getLearnerRevision,
      onStaleWrite: (info) => staleWrites.push(info),
    });

    const result = await client.claimTask(baseArgs);

    // Two fetch calls: initial + retry
    assert.equal(fakeFetch.calls.length, 2);

    // First call used revision 42
    assert.equal(fakeFetch.calls[0].body.expectedLearnerRevision, 42);

    // Retry used refreshed revision 99 and appended -retry to requestId
    assert.equal(fakeFetch.calls[1].body.expectedLearnerRevision, 99);
    assert.equal(fakeFetch.calls[1].body.requestId, 'req-1-retry');

    // onStaleWrite was called
    assert.equal(staleWrites.length, 1);
    assert.equal(staleWrites[0].learnerId, 'learner-1');

    // Success returned
    assert.deepStrictEqual(result, { ok: true, heroClaim: { status: 'claimed' } });
  });

  it('stale_write retry failure throws HeroModeClientError with retryable: false', async () => {
    const fakeFetch = createMockFetch([
      { ok: false, status: 409, data: { ok: false, code: 'stale_write' } },
      { ok: false, status: 409, data: { ok: false, code: 'stale_write' } },
    ]);

    const client = createHeroModeClient({
      ...defaultOpts(),
      fetch: fakeFetch,
      onStaleWrite: () => {},
    });

    const err = await client.claimTask(baseArgs).catch(e => e);

    assert.ok(err instanceof HeroModeClientError);
    assert.equal(err.code, 'stale_write');
    assert.equal(err.retryable, false);
    // Exactly two fetch calls: initial + one retry
    assert.equal(fakeFetch.calls.length, 2);
  });
});

// ---------------------------------------------------------------------------
// claimTask — error paths
// ---------------------------------------------------------------------------

describe('createHeroModeClient — claimTask error paths', () => {
  it('hero_quest_stale triggers onStaleWrite callback', async () => {
    const fakeFetch = createMockFetch([{
      ok: false, status: 409, data: { ok: false, code: 'hero_quest_stale' },
    }]);
    const staleWrites = [];
    const client = createHeroModeClient({
      ...defaultOpts(),
      fetch: fakeFetch,
      onStaleWrite: (info) => staleWrites.push(info),
    });

    const err = await client.claimTask(baseArgs).catch(e => e);

    assert.ok(err instanceof HeroModeClientError);
    assert.equal(err.code, 'hero_quest_stale');
    assert.equal(staleWrites.length, 1);
    assert.equal(staleWrites[0].learnerId, 'learner-1');
    assert.ok(staleWrites[0].error instanceof HeroModeClientError);
  });

  it('hero_quest_fingerprint_mismatch triggers onStaleWrite callback', async () => {
    const fakeFetch = createMockFetch([{
      ok: false, status: 409, data: { ok: false, code: 'hero_quest_fingerprint_mismatch' },
    }]);
    const staleWrites = [];
    const client = createHeroModeClient({
      ...defaultOpts(),
      fetch: fakeFetch,
      onStaleWrite: (info) => staleWrites.push(info),
    });

    const err = await client.claimTask(baseArgs).catch(e => e);

    assert.ok(err instanceof HeroModeClientError);
    assert.equal(err.code, 'hero_quest_fingerprint_mismatch');
    assert.equal(staleWrites.length, 1);
    assert.equal(staleWrites[0].error.code, 'hero_quest_fingerprint_mismatch');
  });

  it('hero_claim_disabled throws non-retryable HeroModeClientError', async () => {
    const fakeFetch = createMockFetch([{
      ok: false, status: 403, data: { ok: false, code: 'hero_claim_disabled' },
    }]);
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    const err = await client.claimTask(baseArgs).catch(e => e);

    assert.ok(err instanceof HeroModeClientError);
    assert.equal(err.code, 'hero_claim_disabled');
    assert.equal(err.status, 403);
    assert.equal(err.retryable, false);
  });

  it('hero_claim_no_evidence throws non-retryable error', async () => {
    const fakeFetch = createMockFetch([{
      ok: false, status: 400, data: { ok: false, code: 'hero_claim_no_evidence' },
    }]);
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    const err = await client.claimTask(baseArgs).catch(e => e);

    assert.ok(err instanceof HeroModeClientError);
    assert.equal(err.code, 'hero_claim_no_evidence');
    assert.equal(err.status, 400);
    assert.equal(err.retryable, false);
  });

  it('network failure throws retryable HeroModeClientError', async () => {
    const calls = [];
    async function failingFetch(url, init) {
      calls.push({ url, init });
      throw new Error('ECONNRESET');
    }
    failingFetch.calls = calls;

    const client = createHeroModeClient({
      ...defaultOpts(),
      fetch: failingFetch,
    });

    const err = await client.claimTask(baseArgs).catch(e => e);

    assert.ok(err instanceof HeroModeClientError);
    assert.equal(err.code, 'network_error');
    assert.equal(err.status, 0);
    assert.equal(err.retryable, true);
  });
});

// ---------------------------------------------------------------------------
// claimTask — forbidden fields boundary
// ---------------------------------------------------------------------------

describe('createHeroModeClient — claimTask forbidden fields', () => {
  it('request body NEVER contains subjectId, payload, coins, or reward', async () => {
    const fakeFetch = createMockFetch([{
      ok: true, status: 200, data: { ok: true, heroClaim: { status: 'claimed' } },
    }]);
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    await client.claimTask(baseArgs);

    const body = fakeFetch.calls[0].body;
    assert.ok(!('subjectId' in body), 'body must not include subjectId');
    assert.ok(!('payload' in body), 'body must not include payload');
    assert.ok(!('coins' in body), 'body must not include coins');
    assert.ok(!('reward' in body), 'body must not include reward');
  });

  it('forbidden fields absent even during stale_write retry', async () => {
    const fakeFetch = createMockFetch([
      { ok: false, status: 409, data: { ok: false, code: 'stale_write' } },
      { ok: true, status: 200, data: { ok: true, heroClaim: { status: 'claimed' } } },
    ]);
    const client = createHeroModeClient({
      ...defaultOpts(),
      fetch: fakeFetch,
      onStaleWrite: () => {},
    });

    await client.claimTask(baseArgs);

    for (const call of fakeFetch.calls) {
      assert.ok(!('subjectId' in call.body), 'retry body must not include subjectId');
      assert.ok(!('payload' in call.body), 'retry body must not include payload');
      assert.ok(!('coins' in call.body), 'retry body must not include coins');
      assert.ok(!('reward' in call.body), 'retry body must not include reward');
    }
  });
});

// ---------------------------------------------------------------------------
// claimTask — practiceSessionId boundary
// ---------------------------------------------------------------------------

describe('createHeroModeClient — claimTask practiceSessionId', () => {
  it('practiceSessionId included when provided', async () => {
    const fakeFetch = createMockFetch([{
      ok: true, status: 200, data: { ok: true },
    }]);
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    await client.claimTask({ ...baseArgs, practiceSessionId: 'ps-abc' });

    const body = fakeFetch.calls[0].body;
    assert.equal(body.practiceSessionId, 'ps-abc');
  });

  it('practiceSessionId not present in body when not provided', async () => {
    const fakeFetch = createMockFetch([{
      ok: true, status: 200, data: { ok: true },
    }]);
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    await client.claimTask(baseArgs);

    const body = fakeFetch.calls[0].body;
    assert.ok(!('practiceSessionId' in body), 'body must not include practiceSessionId when not provided');
  });

  it('practiceSessionId not present in body when explicitly null', async () => {
    const fakeFetch = createMockFetch([{
      ok: true, status: 200, data: { ok: true },
    }]);
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    await client.claimTask({ ...baseArgs, practiceSessionId: null });

    const body = fakeFetch.calls[0].body;
    assert.ok(!('practiceSessionId' in body), 'body must not include practiceSessionId when null');
  });
});
