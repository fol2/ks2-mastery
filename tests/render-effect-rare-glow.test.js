import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderMonsterRenderFixture } from './helpers/react-render.js';

// `rare-glow` registers through the bundled `pulse-halo` template, exercised
// here via `runtimeRegistration` — the production registration path.

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const REGISTER_VIA_RUNTIME = `
  import { runtimeRegistration } from ${JSON.stringify(path.join(rootDir, 'src/platform/game/render/runtime-registration.js'))};
  runtimeRegistration({ catalog: undefined });
`;

function makeMonster(overrides = {}) {
  return {
    id: 'inklet',
    name: 'Inklet',
    accent: '#3E6FA8',
    secondary: '#FFE9A8',
    pale: '#F8F4EA',
    nameByStage: ['Inklet egg', 'Inklet'],
    masteredMax: 100,
    displayState: 'monster',
    img: '/assets/monsters/inklet/inklet-1-640.png',
    srcSet: '/assets/monsters/inklet/inklet-1-320.png 320w, /assets/monsters/inklet/inklet-1-640.png 640w',
    sizes: '(max-width: 640px) 320px, 640px',
    imageAlt: 'Inklet',
    placeholder: '',
    ...overrides,
  };
}

async function run(opts) {
  const out = await renderMonsterRenderFixture({
    ...opts,
    registrations: `${REGISTER_VIA_RUNTIME}\n${opts.registrations || ''}`,
  });
  return JSON.parse(out);
}

test('rare-glow: happy path — single overlay element with aria-hidden and pale palette CSS var', async () => {
  const { html } = await run({
    monster: makeMonster(),
    context: 'codex',
    effects: [{ kind: 'rare-glow' }],
  });

  assert.match(html, /class="fx fx-rare-glow"/);
  assert.match(html, /aria-hidden="true"/);
  // Default palette is `pale` -> resolves to monster.pale (#F8F4EA).
  assert.match(html, /--fx-rare-color:\s*#F8F4EA/);
  assert.match(html, /--fx-rare-intensity:\s*0\.5/);
  const overlayCount = (html.match(/class="fx fx-rare-glow/g) || []).length;
  assert.equal(overlayCount, 1);
});

test('rare-glow: edge case — intensity out of range (2.5) clamps to 1', async () => {
  const { html } = await run({
    monster: makeMonster(),
    context: 'codex',
    effects: [{ kind: 'rare-glow', params: { intensity: 2.5 } }],
  });

  assert.match(html, /--fx-rare-intensity:\s*1(?![\d.])/);
});

test('rare-glow: edge case — monster missing pale palette falls back to accent and dev-warns', async () => {
  const { html, warnings } = await run({
    monster: makeMonster({ pale: '' }),
    context: 'codex',
    effects: [{ kind: 'rare-glow' }],
  });

  // Falls back to accent.
  assert.match(html, /--fx-rare-color:\s*#3E6FA8/);
  assert.ok(
    warnings.some((w) => w.key.startsWith('rare-glow-palette-missing:')),
    `expected rare-glow-palette-missing warning, got ${JSON.stringify(warnings)}`,
  );
});

test('rare-glow: edge case — surface "lesson" filtered out, no overlay rendered', async () => {
  const { html, warnings } = await run({
    monster: makeMonster(),
    context: 'lesson',
    effects: [{ kind: 'rare-glow' }],
  });

  assert.equal(html.includes('fx-rare-glow'), false);
  assert.ok(
    warnings.some((w) => w.key.startsWith('surface-mismatch:lesson:rare-glow')),
    `expected surface-mismatch warning, got ${JSON.stringify(warnings)}`,
  );
});

test('rare-glow: integration — reducedMotion=true emits is-simplified class', async () => {
  const { html } = await run({
    monster: makeMonster(),
    context: 'codex',
    effects: [{ kind: 'rare-glow' }],
    reducedMotion: true,
  });

  assert.match(html, /class="fx fx-rare-glow is-simplified"/);
});
