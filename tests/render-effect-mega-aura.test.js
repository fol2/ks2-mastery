import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderMonsterRenderFixture } from './helpers/react-render.js';

// `mega-aura` and `shiny` register through the bundled effect catalog +
// templates, exercised here via `runtimeRegistration` — the same path
// production uses on app boot.

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

test('mega-aura: happy path — single overlay with aria-hidden and accent + secondary CSS vars', async () => {
  const { html } = await run({
    monster: makeMonster(),
    context: 'codex',
    effects: [{ kind: 'mega-aura' }],
  });

  assert.match(html, /class="fx fx-mega-aura"/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /--fx-mega-color-a:\s*#3E6FA8/);
  assert.match(html, /--fx-mega-color-b:\s*#FFE9A8/);
  assert.match(html, /--fx-mega-intensity:\s*0\.8/);
  const overlayCount = (html.match(/class="fx fx-mega-aura/g) || []).length;
  assert.equal(overlayCount, 1);
});

test('mega-aura: edge case — intensity out of range (-0.5) clamps to 0', async () => {
  const { html } = await run({
    monster: makeMonster(),
    context: 'codex',
    effects: [{ kind: 'mega-aura', params: { intensity: -0.5 } }],
  });

  assert.match(html, /--fx-mega-intensity:\s*0(?![\d.])/);
});

test('mega-aura: edge case — monster missing secondary falls back to accent', async () => {
  const { html } = await run({
    monster: makeMonster({ secondary: '' }),
    context: 'codex',
    effects: [{ kind: 'mega-aura' }],
  });

  // Both colour vars resolve to accent when secondary is missing.
  assert.match(html, /--fx-mega-color-a:\s*#3E6FA8/);
  assert.match(html, /--fx-mega-color-b:\s*#3E6FA8/);
});

test('mega-aura: edge case — surface "lesson" filtered out, no overlay rendered', async () => {
  const { html, warnings } = await run({
    monster: makeMonster(),
    context: 'lesson',
    effects: [{ kind: 'mega-aura' }],
  });

  assert.equal(html.includes('fx-mega-aura'), false);
  assert.ok(
    warnings.some((w) => w.key.startsWith('surface-mismatch:lesson:mega-aura')),
    `expected surface-mismatch warning, got ${JSON.stringify(warnings)}`,
  );
});

test('mega-aura: integration — reducedMotion=true emits is-simplified class', async () => {
  const { html } = await run({
    monster: makeMonster(),
    context: 'codex',
    effects: [{ kind: 'mega-aura' }],
    reducedMotion: true,
  });

  assert.match(html, /class="fx fx-mega-aura is-simplified"/);
});

test('mega-aura: stacks freely with shiny — both render, no exclusive-group conflict', async () => {
  const { html, warnings } = await run({
    monster: makeMonster(),
    context: 'codex',
    effects: [{ kind: 'shiny' }, { kind: 'mega-aura' }],
  });

  assert.match(html, /class="fx fx-shiny"/);
  assert.match(html, /class="fx fx-mega-aura"/);
  // Order: shiny zIndex 10, mega-aura zIndex 12 — shiny first in DOM.
  const shinyIdx = html.indexOf('fx-shiny');
  const megaIdx = html.indexOf('fx-mega-aura');
  assert.ok(shinyIdx > -1 && megaIdx > -1, 'both overlays present');
  assert.ok(shinyIdx < megaIdx, 'shiny (zIndex 10) renders before mega-aura (zIndex 12)');
  // No exclusive-group warning emitted.
  assert.equal(
    warnings.some((w) => w.key.startsWith('exclusive-group:')),
    false,
    `did not expect exclusive-group warning, got ${JSON.stringify(warnings)}`,
  );
});
