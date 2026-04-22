import test from 'node:test';
import assert from 'node:assert/strict';

import { renderAuthSurfaceFixture, renderAppFixture } from './helpers/react-render.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import { createAppHarness } from './helpers/app-harness.js';

test('auth and app error surfaces expose live failure feedback', async () => {
  const authHtml = await renderAuthSurfaceFixture();

  assert.match(authHtml, /role="alert"/);
  assert.match(authHtml, /aria-live="polite"/);

  const appHtml = await renderAppFixture({ route: 'throw' });
  assert.match(appHtml, /role="alert"/);
  assert.match(appHtml, /App surface temporarily unavailable/);
});

test('subject route carries the migration accessibility contract for the live spelling scene', async () => {
  const html = await renderAppFixture({ route: 'subject' });

  assert.match(html, /aria-label="Subject breadcrumb"/);
  assert.match(html, /Round setup/);
  assert.match(html, /aria-label="Spelling pool"/);
  assert.match(html, /role="radio"/);
});

test('word-bank modal declares dialog semantics, tabs, replay, and drill controls', () => {
  const harness = createAppHarness({ storage: installMemoryStorage() });

  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-open-word-bank');
  harness.dispatch('spelling-word-detail-open', { slug: 'possess', value: 'drill' });

  const html = harness.render();

  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /aria-labelledby="wb-modal-word"/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /role="tab"/);
  assert.match(html, /aria-label="Close"/);
  assert.match(html, /data-action="spelling-word-bank-drill-replay"/);
  assert.match(html, /name="typed"[^>]*data-autofocus="true"/);
  assert.match(html, /autocomplete="off"/);
  assert.match(html, /spellcheck="false"/);
  assert.doesNotMatch(html, />possess<\/h2>/);
});
