import test from 'node:test';
import assert from 'node:assert/strict';

import { renderSubjectRouteFixture } from './helpers/react-render.js';

test('React subject route renders placeholder subjects through PracticeComponent', async () => {
  const html = await renderSubjectRouteFixture({ subject: 'placeholder' });

  assert.match(html, /Future subject module/);
  assert.match(html, /practice component/);
  assert.match(html, /Subject breadcrumb/);
  assert.doesNotMatch(html, /data-subject-topnav-mount/);
});

test('React subject route renders the expansion fixture through the React practice component', async () => {
  const html = await renderSubjectRouteFixture({ subject: 'expansion' });

  assert.match(html, /Expansion fixture practice/);
  assert.match(html, /Start deterministic round/);
  assert.doesNotMatch(html, /data-action="fixture-start"/);
});

test('React subject route contains renderPracticeComponent failures inside the subject fallback', async () => {
  const html = await renderSubjectRouteFixture({ subject: 'broken' });

  assert.match(html, /Broken React · Practice temporarily unavailable/);
  assert.match(html, /react practice exploded|could not render/);
  assert.match(html, /Try this tab again/);
});
