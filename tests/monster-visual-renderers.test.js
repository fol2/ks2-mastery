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
  assert.match(html, /clip-path:inset\(10\.0% 15\.0% 5\.0% 5\.0%\)/);
  assert.match(html, /class="ss-meadow-visual" style="--visual-offset-x:12\.00px/);
  assert.match(html, /class="monster-celebration-visual after" data-stage="3" style="--visual-offset-x:18\.00px/);
  assert.match(html, /src="\.\/assets\/monsters\/phaeton\/b1\/phaeton-b1-4\.1280\.webp\?v=20260421-branches"/);
  assert.match(html, /sizes="\(max-width: 820px\) 76vw, 700px"/);
  assert.match(html, /--visual-shadow-x:7\.00px/);
  assert.match(html, /--visual-shadow-scale:1\.350/);
  assert.match(html, /--visual-shadow-opacity:0\.340/);
  assert.match(html, /--mc-duration:6\.25s/);
  assert.match(html, /--mc-art-delay:0\.40s/);
  assert.match(html, /--visual-bob:5\.00px/);
  assert.match(html, /--visual-tilt:3\.00deg/);
  assert.match(html, /inklet-b1-1\.320\.webp/);
  assert.match(html, /scale\(1.25\)/);
});
