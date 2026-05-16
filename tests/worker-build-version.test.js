import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

test('/api/version exposes the current build id with no-store caching', async () => {
  const server = createWorkerRepositoryServer({
    env: {
      BUILD_HASH: 'abc1234',
      RELEASE: 'release-2026-05-16',
    },
  });
  try {
    const response = await server.fetchRaw('https://repo.test/api/version');
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(payload.ok, true);
    assert.equal(payload.buildId, 'abc1234');
    assert.equal(payload.buildHash, 'abc1234');
    assert.equal(payload.release, 'release-2026-05-16');
    assert.equal(payload.source, 'env.BUILD_HASH');
    assert.equal(payload.generatedAt, null);
  } finally {
    server.close();
  }
});

test('/api/version has a stable explicit generated fallback when no env build id exists', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const first = await server.fetchRaw('https://repo.test/api/version');
    const second = await server.fetchRaw('https://repo.test/api/version');
    const firstPayload = await first.json();
    const secondPayload = await second.json();

    assert.equal(first.status, 200);
    assert.equal(first.headers.get('cache-control'), 'no-store');
    assert.ok(firstPayload.buildId === null || typeof firstPayload.buildId === 'string');
    assert.ok(firstPayload.buildHash === null || /^[a-f0-9]{6,40}$/.test(firstPayload.buildHash));
    assert.equal(firstPayload.release, null);
    assert.equal(typeof firstPayload.source, 'string');
    assert.ok(firstPayload.source.length > 0);
    assert.ok(firstPayload.generatedAt === null || typeof firstPayload.generatedAt === 'string');
    assert.deepEqual(secondPayload, firstPayload);
  } finally {
    server.close();
  }
});
