import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { MONSTER_ASSET_MANIFEST } from '../src/platform/game/monster-asset-manifest.js';
import {
  BUNDLED_EFFECT_CATALOG,
  BUNDLED_EFFECT_BINDINGS,
  BUNDLED_CELEBRATION_TUNABLES,
  bundledEffectConfig,
} from '../src/platform/game/render/effect-config-defaults.js';
import { validateEffectConfig } from '../src/platform/game/render/effect-config-schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'effect-config-bundled.snapshot.json');

function stableStringify(value) {
  return JSON.stringify(value, replacer, 2);
}

function replacer(_key, value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = value[key];
        return acc;
      }, {});
  }
  return value;
}

const EXPECTED_KINDS = [
  'caught',
  'egg-breathe',
  'evolve',
  'mega',
  'mega-aura',
  'monster-motion-float',
  'rare-glow',
  'shiny',
];

// 20. Happy path — bundledEffectConfig returns three populated sub-trees
test('bundledEffectConfig: returns catalog, bindings, celebrationTunables all populated', () => {
  const config = bundledEffectConfig();
  assert.ok(config.catalog && Object.keys(config.catalog).length === 8);
  assert.ok(config.bindings && Object.keys(config.bindings).length > 0);
  assert.ok(config.celebrationTunables && Object.keys(config.celebrationTunables).length > 0);
});

// 21. Catalog has eight entries with the right kinds
test('BUNDLED_EFFECT_CATALOG: has eight entries keyed by the eight code-defined kinds', () => {
  const kinds = Object.keys(BUNDLED_EFFECT_CATALOG).sort();
  assert.deepEqual(kinds, EXPECTED_KINDS);
});

// 22. Sparkle template for shiny
test('BUNDLED_EFFECT_CATALOG.shiny.template is "sparkle"', () => {
  assert.equal(BUNDLED_EFFECT_CATALOG['shiny'].template, 'sparkle');
});

// 23. monster-motion-float lifecycle and layer
test('BUNDLED_EFFECT_CATALOG["monster-motion-float"] has lifecycle continuous and layer base', () => {
  const entry = BUNDLED_EFFECT_CATALOG['monster-motion-float'];
  assert.equal(entry.lifecycle, 'continuous');
  assert.equal(entry.layer, 'base');
});

// 24. Surfaces match source modules
test('BUNDLED_EFFECT_CATALOG: surfaces array matches source effect modules', () => {
  assert.deepEqual(BUNDLED_EFFECT_CATALOG['shiny'].surfaces, ['codex', 'lightbox', 'home']);
  assert.deepEqual(BUNDLED_EFFECT_CATALOG['mega-aura'].surfaces, ['codex', 'lightbox', 'home']);
  assert.deepEqual(BUNDLED_EFFECT_CATALOG['rare-glow'].surfaces, ['codex', 'lightbox', 'home']);
  assert.deepEqual(BUNDLED_EFFECT_CATALOG['caught'].surfaces, ['lesson', 'home', 'codex']);
  assert.deepEqual(BUNDLED_EFFECT_CATALOG['evolve'].surfaces, ['lesson', 'home', 'codex']);
  assert.deepEqual(BUNDLED_EFFECT_CATALOG['mega'].surfaces, ['lesson', 'home', 'codex']);
  assert.deepEqual(BUNDLED_EFFECT_CATALOG['egg-breathe'].surfaces, ['*']);
  assert.deepEqual(BUNDLED_EFFECT_CATALOG['monster-motion-float'].surfaces, ['*']);
});

// 25. Every catalog entry is reviewed: true
test('BUNDLED_EFFECT_CATALOG: every entry has reviewed: true', () => {
  for (const [kind, entry] of Object.entries(BUNDLED_EFFECT_CATALOG)) {
    assert.equal(entry.reviewed, true, `expected ${kind} to be reviewed`);
  }
});

// 26. Egg binding stage 0 includes egg-breathe
test('BUNDLED_EFFECT_BINDINGS: stage 0 (egg) binding has egg-breathe in continuous', () => {
  const eggKey = 'inklet-b1-0';
  const row = BUNDLED_EFFECT_BINDINGS[eggKey];
  assert.ok(row, `expected ${eggKey} binding`);
  assert.equal(row.continuous[0].kind, 'egg-breathe');
  assert.deepEqual(row.persistent, []);
});

// 27. Stage 3 binding includes monster-motion-float
test('BUNDLED_EFFECT_BINDINGS: stage 3 binding has monster-motion-float in continuous', () => {
  const key = 'inklet-b1-3';
  const row = BUNDLED_EFFECT_BINDINGS[key];
  assert.ok(row, `expected ${key} binding`);
  assert.equal(row.continuous[0].kind, 'monster-motion-float');
  assert.deepEqual(row.persistent, []);
});

// 28. Every asset has a binding row
test('BUNDLED_EFFECT_BINDINGS: every asset in the manifest has a binding row', () => {
  for (const asset of MONSTER_ASSET_MANIFEST.assets) {
    const row = BUNDLED_EFFECT_BINDINGS[asset.key];
    assert.ok(row, `missing binding row for ${asset.key}`);
    assert.ok(Array.isArray(row.continuous));
    assert.ok(Array.isArray(row.persistent));
  }
});

// 29. caught tunables
test('BUNDLED_CELEBRATION_TUNABLES: caught.showParticles is true', () => {
  const t = BUNDLED_CELEBRATION_TUNABLES['inklet-b1-3'];
  assert.equal(t.caught.showParticles, true);
  assert.equal(t.caught.showShine, false);
  assert.equal(t.caught.modifierClass, '');
  assert.equal(t.caught.reviewed, true);
});

// 30. mega tunables
test('BUNDLED_CELEBRATION_TUNABLES: mega has showParticles and showShine both true', () => {
  const t = BUNDLED_CELEBRATION_TUNABLES['inklet-b1-3'];
  assert.equal(t.mega.showParticles, true);
  assert.equal(t.mega.showShine, true);
  assert.equal(t.mega.modifierClass, '');
});

// 31. evolve tunables
test('BUNDLED_CELEBRATION_TUNABLES: evolve has showParticles false', () => {
  const t = BUNDLED_CELEBRATION_TUNABLES['inklet-b1-3'];
  assert.equal(t.evolve.showParticles, false);
  assert.equal(t.evolve.showShine, false);
  assert.equal(t.evolve.modifierClass, '');
});

// 32. byte-equivalence canary — bundled defaults pass validateEffectConfig
test('validateEffectConfig(bundledEffectConfig()) succeeds with no errors', () => {
  const result = validateEffectConfig(bundledEffectConfig());
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

// 33. Frozen fixture regression guard
test('bundledEffectConfig: serialised output matches frozen fixture', () => {
  const serialised = stableStringify(bundledEffectConfig());

  if (process.env.UPDATE_EFFECT_CONFIG_FIXTURE === '1') {
    writeFileSync(FIXTURE_PATH, `${serialised}\n`, 'utf8');
    return;
  }

  assert.ok(
    existsSync(FIXTURE_PATH),
    `Fixture missing at ${FIXTURE_PATH}. Run with UPDATE_EFFECT_CONFIG_FIXTURE=1 to create it.`,
  );
  const expected = readFileSync(FIXTURE_PATH, 'utf8').replace(/\n$/, '');
  assert.equal(serialised, expected);
});
