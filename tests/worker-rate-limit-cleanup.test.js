import test from 'node:test';
import assert from 'node:assert/strict';

import {
  __setRequestLimitsCleanupRngForTests,
  consumeRateLimit,
} from '../worker/src/rate-limit.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

test('consumeRateLimit can skip opportunistic stale-row cleanup on hot paths', async () => {
  const server = createWorkerRepositoryServer();
  const now = Date.UTC(2026, 5, 14, 20, 45, 0);
  const staleWindow = now - (2 * 24 * 60 * 60 * 1000);

  try {
    server.DB.db.prepare(`
      INSERT INTO request_limits (limiter_key, window_started_at, request_count, updated_at)
      VALUES (?, ?, ?, ?)
    `).run('stale-cleanup-test', staleWindow, 1, staleWindow);

    __setRequestLimitsCleanupRngForTests(() => 0);

    const hotPath = await consumeRateLimit(server.DB, {
      bucket: 'demo-command-ip',
      identifier: 'v4:203.0.113.42',
      limit: 100,
      windowMs: 10 * 60 * 1000,
      now,
      cleanup: false,
    });
    assert.equal(hotPath.allowed, true);

    let staleCount = server.DB.db
      .prepare('SELECT COUNT(*) AS count FROM request_limits WHERE limiter_key = ?')
      .get('stale-cleanup-test').count;
    assert.equal(staleCount, 1, 'cleanup:false must leave stale limiter rows untouched');

    const regularPath = await consumeRateLimit(server.DB, {
      bucket: 'demo-create-ip',
      identifier: 'v4:203.0.113.43',
      limit: 100,
      windowMs: 10 * 60 * 1000,
      now,
      cleanup: true,
    });
    assert.equal(regularPath.allowed, true);

    staleCount = server.DB.db
      .prepare('SELECT COUNT(*) AS count FROM request_limits WHERE limiter_key = ?')
      .get('stale-cleanup-test').count;
    assert.equal(staleCount, 0, 'cleanup:true keeps the existing opportunistic cleanup behaviour');
  } finally {
    __setRequestLimitsCleanupRngForTests(null);
    server.close();
  }
});
