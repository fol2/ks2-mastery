import test from 'node:test';
import assert from 'node:assert/strict';

import { renderMonsterRenderFixture } from './helpers/react-render.js';

const SHINY_MODULE = {
  path: 'src/platform/game/render/effects/shiny.js',
  exports: ['shinyEffect'],
};

const RARE_GLOW_MODULE = {
  path: 'src/platform/game/render/effects/rare-glow.js',
  exports: ['rareGlowEffect'],
};

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
  const out = await renderMonsterRenderFixture(opts);
  return JSON.parse(out);
}

test('shiny: happy path — single overlay element with aria-hidden and accent palette CSS var', async () => {
  const { html } = await run({
    monster: makeMonster(),
    context: 'codex',
    effects: [{ kind: 'shiny' }],
    effectModules: [SHINY_MODULE],
  });

  // Single overlay span carrying fx-shiny class and aria-hidden.
  assert.match(html, /class="fx fx-shiny"/);
  assert.match(html, /aria-hidden="true"/);
  // Default palette is `accent` -> resolves to monster.accent (#3E6FA8).
  assert.match(html, /--fx-shiny-color:\s*#3E6FA8/);
  // Default intensity is 0.6.
  assert.match(html, /--fx-shiny-intensity:\s*0\.6/);
  // Exactly one effect overlay span.
  const overlayCount = (html.match(/class="fx fx-shiny/g) || []).length;
  assert.equal(overlayCount, 1);
});

test('shiny: happy path — palette=secondary uses monster.secondary', async () => {
  const { html } = await run({
    monster: makeMonster(),
    context: 'codex',
    effects: [{ kind: 'shiny', params: { palette: 'secondary' } }],
    effectModules: [SHINY_MODULE],
  });

  assert.match(html, /--fx-shiny-color:\s*#FFE9A8/);
});

test('shiny: edge case — intensity out of range (1.5) clamps to 1', async () => {
  const { html } = await run({
    monster: makeMonster(),
    context: 'codex',
    effects: [{ kind: 'shiny', params: { intensity: 1.5 } }],
    effectModules: [SHINY_MODULE],
  });

  assert.match(html, /--fx-shiny-intensity:\s*1(?![\d.])/);
});

test('shiny: edge case — monster missing pale palette falls back to accent and dev-warns', async () => {
  const { warnings, html } = await run({
    // Strip pale; with palette=pale we must fall back to accent.
    monster: makeMonster({ pale: '' }),
    context: 'codex',
    effects: [{ kind: 'shiny', params: { palette: 'pale' } }],
    effectModules: [SHINY_MODULE],
  });

  assert.match(html, /--fx-shiny-color:\s*#3E6FA8/);
  assert.ok(
    warnings.some((w) => w.key.startsWith('shiny-palette-missing:')),
    `expected shiny-palette-missing warning, got ${JSON.stringify(warnings)}`,
  );
});

test('shiny: edge case — surface "lesson" filtered out, no overlay rendered', async () => {
  const { html, warnings } = await run({
    monster: makeMonster(),
    context: 'lesson',
    effects: [{ kind: 'shiny' }],
    effectModules: [SHINY_MODULE],
  });

  assert.equal(html.includes('fx-shiny'), false);
  assert.ok(
    warnings.some((w) => w.key.startsWith('surface-mismatch:lesson:shiny')),
    `expected surface-mismatch warning for lesson:shiny, got ${JSON.stringify(warnings)}`,
  );
});

test('shiny: integration — reducedMotion=true emits is-simplified class', async () => {
  const { html } = await run({
    monster: makeMonster(),
    context: 'codex',
    effects: [{ kind: 'shiny' }],
    reducedMotion: true,
    effectModules: [SHINY_MODULE],
  });

  assert.match(html, /class="fx fx-shiny is-simplified"/);
});

test('shiny: exclusiveGroup conflict — rare-glow (later) wins, shiny dropped with dev-warn', async () => {
  const { html, warnings } = await run({
    monster: makeMonster(),
    context: 'codex',
    // Both share exclusiveGroup 'rarity'; rare-glow appears later, so it wins.
    effects: [{ kind: 'shiny' }, { kind: 'rare-glow' }],
    effectModules: [SHINY_MODULE, RARE_GLOW_MODULE],
  });

  // rare-glow renders, shiny does not.
  assert.match(html, /class="fx fx-rare-glow"/);
  assert.equal(html.includes('fx-shiny'), false);
  assert.ok(
    warnings.some((w) => w.key.startsWith('exclusive-group:rarity:')),
    `expected exclusive-group:rarity warning, got ${JSON.stringify(warnings)}`,
  );
});
