import test from 'node:test';
import assert from 'node:assert/strict';

import { renderAppFixture, renderSharedSurfaceFixture } from './helpers/react-render.js';

test('React profile settings surface owns learner profile and data actions', async () => {
  const html = await renderAppFixture({ route: 'profile' });

  assert.match(html, /Profile settings/);
  assert.match(html, /Learning profile for/);
  assert.match(html, /Dictation voice/);
  assert.match(html, /Portable snapshots/);
  assert.match(html, /Save learner profile/);
  assert.doesNotMatch(html, /data-action="learner-save-form"/);
  assert.doesNotMatch(html, /profile-topnav/);
});

test('React shared shell components render persistence, toasts, and celebration overlay', async () => {
  const html = await renderSharedSurfaceFixture();

  assert.match(html, /Sync degraded/);
  assert.match(html, /Retry sync/);
  assert.match(html, /Notifications/);
  assert.match(html, /Inklet joined your Codex/);
  assert.match(html, /monster-celebration-overlay caught/);
  assert.match(html, /You caught a new friend!/);
});
