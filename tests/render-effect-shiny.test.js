import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderMonsterRenderFixture } from './helpers/react-render.js';

// `shiny` and `rare-glow` are no longer code-defined effect modules — they
// are catalog entries seeded by the bundled effect config. Tests now register
// them through the same `runtimeRegistration` path production uses (which in
// turn flows through the `sparkle` and `pulse-halo` templates).

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

test('shiny: happy path — single overlay element with aria-hidden and accent palette CSS var', async () => {
  const { html } = await run({
    monster: makeMonster(),
    context: 'codex',
    effects: [{ kind: 'shiny' }],
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
  });

  assert.match(html, /--fx-shiny-color:\s*#FFE9A8/);
});

test('shiny: edge case — intensity out of range (1.5) clamps to 1', async () => {
  const { html } = await run({
    monster: makeMonster(),
    context: 'codex',
    effects: [{ kind: 'shiny', params: { intensity: 1.5 } }],
  });

  assert.match(html, /--fx-shiny-intensity:\s*1(?![\d.])/);
});

test('shiny: edge case — monster missing pale palette falls back to accent and dev-warns', async () => {
  const { warnings, html } = await run({
    // Strip pale; with palette=pale we must fall back to accent.
    monster: makeMonster({ pale: '' }),
    context: 'codex',
    effects: [{ kind: 'shiny', params: { palette: 'pale' } }],
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
  });

  assert.match(html, /class="fx fx-shiny is-simplified"/);
});

test('shiny: exclusiveGroup conflict — rare-glow (later) wins, shiny dropped with dev-warn', async () => {
  const { html, warnings } = await run({
    monster: makeMonster(),
    context: 'codex',
    // Both share exclusiveGroup 'rarity'; rare-glow appears later, so it wins.
    effects: [{ kind: 'shiny' }, { kind: 'rare-glow' }],
  });

  // rare-glow renders, shiny does not.
  assert.match(html, /class="fx fx-rare-glow"/);
  assert.equal(html.includes('fx-shiny'), false);
  assert.ok(
    warnings.some((w) => w.key.startsWith('exclusive-group:rarity:')),
    `expected exclusive-group:rarity warning, got ${JSON.stringify(warnings)}`,
  );
});
