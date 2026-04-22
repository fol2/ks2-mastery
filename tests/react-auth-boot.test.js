import test from 'node:test';
import assert from 'node:assert/strict';

import { renderAuthSurfaceFixture } from './helpers/react-render.js';

test('auth surface renders through React with credential and social sign-in states', async () => {
  const html = await renderAuthSurfaceFixture();

  assert.match(html, /Sign in to continue/);
  assert.match(html, /expired/);
  assert.match(html, /autoComplete="email"/);
  assert.match(html, /Social sign-in/);
  assert.match(html, />Google</);
});
