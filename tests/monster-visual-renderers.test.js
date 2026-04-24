import test from 'node:test';
import assert from 'node:assert/strict';

import { renderMonsterVisualRendererFixture } from './helpers/react-render.js';

test('monster visual renderers use published config for meadow and reward toast', async () => {
  const html = await renderMonsterVisualRendererFixture();

  assert.match(html, /--face:1/);
  assert.match(html, /vellhorn-b1-3\.640\.webp/);
  assert.match(html, /--visual-offset-x:12\.00px/);
  assert.match(html, /--visual-offset-y:-6\.00px/);
  assert.match(html, /--visual-scale:1\.180/);
  assert.match(html, /--visual-face:1/);
  assert.match(html, /--visual-anchor-x:25\.0%/);
  assert.match(html, /--visual-anchor-y:72\.0%/);
  assert.match(html, /opacity:0\.82/);
  assert.match(html, /filter:brightness\(1\.1\)/);
  assert.match(html, /inklet-b1-1\.320\.webp/);
  assert.match(html, /scale\(1.25\)/);
});
