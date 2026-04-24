import test from 'node:test';
import assert from 'node:assert/strict';

import { renderMonsterVisualRendererFixture } from './helpers/react-render.js';

test('monster visual renderers use published config for meadow and reward toast', async () => {
  const html = await renderMonsterVisualRendererFixture();

  assert.match(html, /--face:1/);
  assert.match(html, /vellhorn-b1-3\.640\.webp/);
  assert.match(html, /inklet-b1-1\.320\.webp/);
  assert.match(html, /scale\(1.25\)/);
});
