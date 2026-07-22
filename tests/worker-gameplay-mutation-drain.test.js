import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerApp } from '../worker/src/app.js';

const PAUSED_ENV = Object.freeze({ GAMEPLAY_MUTATIONS_PAUSED: '1' });

async function request(app, pathname, method = 'POST') {
  return app.fetch(new Request(`https://ks2.example.test${pathname}`, {
    method,
    headers: method === 'GET' ? {} : { 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : '{}',
  }), PAUSED_ENV, { waitUntil() {} });
}

test('the release write fence rejects every learner gameplay mutation before auth or D1 work', async () => {
  const app = createWorkerApp();
  const routes = [
    '/api/demo/session',
    '/api/demo/reset',
    '/api/learners',
    '/api/learners/reset-progress',
    '/api/subjects/spelling/command',
    '/api/subjects/grammar/command',
    '/api/subjects/reading/command',
    '/api/subjects/punctuation/command',
    '/api/hero/command',
    '/api/child-subject-state',
    '/api/practice-sessions',
    '/api/child-game-state',
    '/api/event-log',
    '/api/debug/reset',
    '/api/admin/spelling/seed-post-mega',
    '/api/admin/spelling/restore-post-mega',
    '/api/admin/learners/learner-a/grammar/transfer-evidence/prompt-a/archive',
  ];

  for (const pathname of routes) {
    const response = await request(app, pathname);
    assert.equal(response.status, 503, pathname);
    assert.equal(response.headers.get('retry-after'), '30', pathname);
    const payload = await response.json();
    assert.equal(payload.code, 'gameplay_mutations_paused', pathname);
    assert.equal(payload.retryable, true, pathname);
  }
});

test('the release write fence leaves read traffic available', async () => {
  const app = createWorkerApp({ now: () => Date.UTC(2026, 6, 22) });
  const response = await request(app, '/api/health', 'GET');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
});
