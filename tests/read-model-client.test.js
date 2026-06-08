import test from 'node:test';
import assert from 'node:assert/strict';

import { createReadModelClient } from '../src/platform/runtime/read-model-client.js';

test('read model client bounds slow requests with a structured timeout error', async () => {
  let calls = 0;
  let aborted = false;
  const fetch = (input, init = {}) => {
    calls += 1;
    init.signal?.addEventListener('abort', () => {
      aborted = true;
    });
    return new Promise(() => {});
  };
  const client = createReadModelClient({ fetch, timeoutMs: 1 });

  await assert.rejects(
    client.readJson('/api/read-models/spelling/demo'),
    (error) => {
      assert.equal(error.status, 0);
      assert.equal(error.code, 'read_model_timeout');
      assert.deepEqual(error.payload, { code: 'read_model_timeout' });
      return true;
    },
  );

  assert.equal(calls, 1);
  assert.equal(aborted, true);
});
