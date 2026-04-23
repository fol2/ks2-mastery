import test from 'node:test';
import assert from 'node:assert/strict';

import { startBrowserAppServer } from './helpers/browser-app-server.js';

test('browser app smoke server proxies Worker demo session cookies', async () => {
  const server = await startBrowserAppServer({ withWorkerApi: true });
  try {
    const demo = await fetch(`${server.origin}/api/demo/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const cookie = (demo.headers.get('set-cookie') || '').split(';')[0];
    const demoPayload = await demo.json();

    assert.equal(demo.status, 201);
    assert.equal(demoPayload.session.demo, true);
    assert.match(cookie, /^ks2_session=/);

    const session = await fetch(`${server.origin}/api/session`, {
      headers: { cookie },
    });
    const sessionPayload = await session.json();

    assert.equal(session.status, 200);
    assert.equal(sessionPayload.session.demo, true);
    assert.equal(sessionPayload.account.accountType, 'demo');
  } finally {
    await server.close();
  }
});
