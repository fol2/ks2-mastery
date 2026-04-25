import test from 'node:test';
import assert from 'node:assert/strict';

import { renderHubSurfaceFixture } from './helpers/react-render.js';

test('React Parent Hub surface renders readable learner payload and read-only notice', async () => {
  const html = await renderHubSurfaceFixture({ surface: 'parent' });

  assert.match(html, /Parent Hub thin slice/);
  assert.match(html, /Ava/);
  assert.match(html, /Read-only learner/);
  assert.match(html, /viewer memberships/);
  assert.match(html, /Trouble words/);
  assert.match(html, /Grammar secured/);
  assert.match(html, /Grammar: 3\/18 concepts/);
  assert.match(html, /Grammar evidence/);
  assert.match(html, /Adverbials/);
  assert.match(html, /Question-type evidence/);
  assert.match(html, /Recent Grammar activity/);
  assert.match(html, /Parent summary draft/);
  assert.match(html, /Punctuation secured/);
  assert.match(html, /Punctuation: 1\/14 units/);
  assert.match(html, /Punctuation evidence/);
  assert.match(html, /Speech - Insert punctuation/);
  assert.match(html, /Recent Punctuation mistakes/);
  assert.doesNotMatch(html, /Subject: spelling/);
  assert.match(html, /Export current learner/);
  assert.match(html, /disabled=""/);
});

test('React Admin Operations surface renders content, audit, account roles, and diagnostics', async () => {
  const html = await renderHubSurfaceFixture({ surface: 'admin' });

  assert.match(html, /Admin \/ operations skeleton/);
  assert.match(html, /Monster visuals/);
  assert.match(html, /vellhorn-b1-3/);
  assert.match(html, /Save draft/);
  assert.match(html, /Publish/);
  assert.match(html, /Production platform access/);
  assert.match(html, /Published spelling snapshot/);
  assert.match(html, /Mutation receipt stream/);
  assert.match(html, /admin@example.com/);
  assert.match(html, /Readable learners/);
  assert.match(html, /Grammar diagnostics/);
  assert.match(html, /Punctuation diagnostics/);
  assert.match(html, /punctuation-r4-full-14-skill-structure/);
  assert.match(html, /Open Punctuation analytics/);
  assert.match(html, /Choose the correct sentence/);
});
