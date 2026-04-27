import test from 'node:test';
import assert from 'node:assert/strict';

import { renderTopNavFixture } from './helpers/react-render.js';

test('Admin user sees "Admin" link in TopNav', async () => {
  const html = await renderTopNavFixture({ platformRole: 'admin' });

  assert.match(html, /class="topnav-link topnav-admin-link"/);
  assert.match(html, /data-action="open-admin-hub"/);
  assert.match(html, /href="\/admin"/);
  assert.match(html, />Admin<\/a>/);
});

test('Ops user sees "Admin" link in TopNav', async () => {
  const html = await renderTopNavFixture({ platformRole: 'ops' });

  assert.match(html, /class="topnav-link topnav-admin-link"/);
  assert.match(html, /data-action="open-admin-hub"/);
  assert.match(html, /href="\/admin"/);
  assert.match(html, />Admin<\/a>/);
});

test('Parent user does NOT see "Admin" link in TopNav', async () => {
  const html = await renderTopNavFixture({ platformRole: 'parent' });

  assert.doesNotMatch(html, /topnav-admin-link/);
  assert.doesNotMatch(html, /data-action="open-admin-hub"/);
});

test('Demo session does NOT see "Admin" link in TopNav', async () => {
  const html = await renderTopNavFixture({ platformRole: 'parent', demo: true });

  assert.doesNotMatch(html, /topnav-admin-link/);
  assert.doesNotMatch(html, /data-action="open-admin-hub"/);
});

test('Undefined platformRole does NOT show "Admin" link', async () => {
  const html = await renderTopNavFixture({ platformRole: undefined });

  assert.doesNotMatch(html, /topnav-admin-link/);
  assert.doesNotMatch(html, /data-action="open-admin-hub"/);
});

test('Clicking Admin link targets the no-store /admin document route', async () => {
  const html = await renderTopNavFixture({ platformRole: 'admin' });

  // Use a document navigation so stale app shells do not fetch an old
  // code-split AdminHubSurface chunk after a deploy.
  assert.match(html, /data-action="open-admin-hub"/);
  assert.match(html, /<a[^>]*class="topnav-link topnav-admin-link"[^>]*href="\/admin"[^>]*>/);
});

test('When on admin screen, link shows active state', async () => {
  const html = await renderTopNavFixture({ platformRole: 'admin', currentScreen: 'admin-hub' });

  assert.match(html, /topnav-admin-link is-active/);
  assert.match(html, /aria-current="page"/);
});

test('When NOT on admin screen, link does not show active state', async () => {
  const html = await renderTopNavFixture({ platformRole: 'admin', currentScreen: 'dashboard' });

  assert.match(html, /class="topnav-link topnav-admin-link"/);
  assert.doesNotMatch(html, /is-active/);
  assert.doesNotMatch(html, /aria-current/);
});
