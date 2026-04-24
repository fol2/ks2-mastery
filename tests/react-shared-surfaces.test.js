import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderAppFixture,
  renderMonsterCelebrationOverlayFixture,
  renderProfileSurfaceFixture,
  renderSharedSurfaceFixture,
} from './helpers/react-render.js';

test('React profile settings surface owns learner profile and data actions', async () => {
  const html = await renderAppFixture({ route: 'profile' });

  assert.match(html, /Profile settings/);
  assert.match(html, /Learning profile for/);
  assert.match(html, /Dictation voice/);
  assert.match(html, /profile-tts-test-btn/);
  assert.match(html, /Portable snapshots/);
  assert.match(html, /Save learner profile/);
  assert.doesNotMatch(html, /data-action="learner-save-form"/);
  assert.doesNotMatch(html, /profile-topnav/);
});

test('profile settings disables write controls for demo while exposing conversion', async () => {
  const html = await renderProfileSurfaceFixture({ demo: true });

  assert.match(html, /Demo profile writes are read-only/);
  assert.match(html, /Create account from demo/);
  assert.match(html, /Social sign-in/);
  assert.match(html, /Reset learner progress<\/button>/);
  assert.match(html, /Reset learner progress<\/button>/);
  assert.match(html, /<button class="btn primary xl" type="button" disabled=""/);
  assert.match(html, /<button class="btn ghost" type="button" disabled="">Import JSON<\/button>/);
});

test('profile settings disables JSON import for server-synced accounts only', async () => {
  const html = await renderProfileSurfaceFixture();

  assert.match(html, /JSON import is available only for local recovery/);
  assert.match(html, /<button class="btn ghost" type="button" disabled="">Import JSON<\/button>/);
  assert.match(html, /Save learner profile<\/button>/);
  assert.doesNotMatch(html, /type="submit" disabled="">Save learner profile/);
});

test('profile settings disables write controls when persistence is degraded', async () => {
  const html = await renderProfileSurfaceFixture({ persistenceMode: 'degraded' });

  assert.match(html, /Sync is degraded, so profile writes are disabled/);
  assert.doesNotMatch(html, /Create account from demo/);
  assert.match(html, /<button class="btn primary lg" style="background:#3E6FA8" type="submit" disabled="">Save learner profile<\/button>/);
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

test('React monster celebration overlay uses high-resolution stage artwork', async () => {
  const html = await renderMonsterCelebrationOverlayFixture();

  assert.match(html, /monster-celebration-overlay evolve egg-crack/);
  assert.match(html, /assets\/monsters\/vellhorn\/b2\/vellhorn-b2-0\.640\.webp/);
  assert.match(html, /assets\/monsters\/vellhorn\/b2\/vellhorn-b2-1\.640\.webp/);
  assert.match(html, /assets\/monsters\/vellhorn\/b2\/vellhorn-b2-1\.1280\.webp/);
});
