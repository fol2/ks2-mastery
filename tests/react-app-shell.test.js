import test from 'node:test';
import assert from 'node:assert/strict';

import { renderAppFixture } from './helpers/react-render.js';

test('React app shell renders dashboard without legacy island mount globals', async () => {
  const html = await renderAppFixture({ route: 'dashboard' });

  assert.match(html, /Your subjects/);
  assert.match(html, /KS2 Mastery/);
  assert.doesNotMatch(html, /data-home-mount/);
  assert.doesNotMatch(html, /__ks2HomeSurface/);
});

test('React app shell renders subject chrome without global subject top-nav mount', async () => {
  const html = await renderAppFixture({ route: 'subject' });

  assert.match(html, /Round setup/);
  assert.match(html, /KS2 Mastery/);
  assert.match(html, /class="app-shell subject-entry-shell"/);
  assert.match(html, /class="subject-entry-content"/);
  assert.match(html, /class="subject-breadcrumb-current"[^>]*>\s*Spelling\s*<\/button>/);
  assert.doesNotMatch(html, /data-subject-topnav-mount/);
});
