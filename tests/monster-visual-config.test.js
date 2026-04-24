import test from 'node:test';
import assert from 'node:assert/strict';

import { MONSTER_ASSET_MANIFEST } from '../src/platform/game/monster-asset-manifest.js';
import {
  BUNDLED_MONSTER_VISUAL_CONFIG,
  MONSTER_VISUAL_CONTEXTS,
  buildMonsterAssetKey,
  monsterVisualAssetSources,
  normaliseMonsterVisualRuntimeConfig,
  resolveMonsterVisual,
  validateMonsterVisualConfigForPublish,
} from '../src/platform/game/monster-visual-config.js';

test('monster asset manifest covers every current monster asset folder deterministically', () => {
  const monsterIds = MONSTER_ASSET_MANIFEST.monsters.map((monster) => monster.id);

  assert.ok(MONSTER_ASSET_MANIFEST.manifestHash.length >= 16);
  assert.deepEqual(monsterIds.slice(0, 3), ['bracehart', 'carillon', 'chronalyx']);
  assert.ok(monsterIds.includes('inklet'));
  assert.ok(monsterIds.includes('vellhorn'));
  assert.ok(monsterIds.includes('couronnail'));
  assert.equal(MONSTER_ASSET_MANIFEST.assets.length, 180);

  const couronnail = MONSTER_ASSET_MANIFEST.assets.find((asset) => asset.key === 'couronnail-b2-4');
  assert.deepEqual(couronnail.sizes, [320, 640, 1280]);
  assert.equal(couronnail.srcBySize['640'], './assets/monsters/couronnail/b2/couronnail-b2-4.640.webp');
});

test('bundled monster visual config preserves current tuned defaults', () => {
  const visual = resolveMonsterVisual({
    monsterId: 'vellhorn',
    branch: 'b1',
    stage: 3,
    context: 'meadow',
  });

  assert.equal(visual.assetKey, 'vellhorn-b1-3');
  assert.equal(visual.facing, 'left');
  assert.equal(visual.faceSign, -1);
  assert.equal(visual.path, 'walk-b');

  const feature = resolveMonsterVisual({
    monsterId: 'phaeton',
    branch: 'b1',
    stage: 4,
    context: 'codexFeature',
  });

  assert.equal(feature.footPad, 4);
  assert.equal(feature.source, 'bundled');
});

test('bundled config has complete context values for every manifest asset', () => {
  const validation = validateMonsterVisualConfigForPublish(BUNDLED_MONSTER_VISUAL_CONFIG);

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);

  for (const asset of MONSTER_ASSET_MANIFEST.assets) {
    const entry = BUNDLED_MONSTER_VISUAL_CONFIG.assets[asset.key];
    assert.ok(entry, `expected bundled entry for ${asset.key}`);
    for (const context of MONSTER_VISUAL_CONTEXTS) {
      assert.ok(entry.contexts[context], `expected ${context} for ${asset.key}`);
    }
  }
});

test('publish validation blocks missing contexts while render resolution falls back', () => {
  const broken = structuredClone(BUNDLED_MONSTER_VISUAL_CONFIG);
  delete broken.assets['vellhorn-b1-3'].contexts.codexFeature;

  const validation = validateMonsterVisualConfigForPublish(broken);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((issue) => (
    issue.code === 'monster_visual_context_required'
    && issue.assetKey === 'vellhorn-b1-3'
    && issue.context === 'codexFeature'
  )));

  const visual = resolveMonsterVisual({
    monsterId: 'vellhorn',
    branch: 'b1',
    stage: 3,
    context: 'codexFeature',
    config: broken,
  });

  assert.equal(visual.source, 'bundled');
  assert.equal(visual.facing, 'left');
});

test('publish validation reports out-of-range visual fields', () => {
  const broken = structuredClone(BUNDLED_MONSTER_VISUAL_CONFIG);
  broken.assets['vellhorn-b1-3'].baseline.opacity = 1.2;
  broken.assets['vellhorn-b1-3'].contexts.toastPortrait.scale = 0;

  const validation = validateMonsterVisualConfigForPublish(broken);

  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((issue) => (
    issue.code === 'monster_visual_field_out_of_range'
    && issue.assetKey === 'vellhorn-b1-3'
    && issue.field === 'opacity'
  )));
  assert.ok(validation.errors.some((issue) => (
    issue.code === 'monster_visual_field_out_of_range'
    && issue.assetKey === 'vellhorn-b1-3'
    && issue.context === 'toastPortrait'
    && issue.field === 'scale'
  )));
});

test('asset source helper preserves existing image path convention', () => {
  const sources = monsterVisualAssetSources(buildMonsterAssetKey('inklet', 'b1', 0), {
    preferredSize: 640,
  });

  assert.equal(sources.src, './assets/monsters/inklet/b1/inklet-b1-0.640.webp?v=20260421-branches');
  assert.match(sources.srcSet, /inklet-b1-0\.320\.webp\?v=20260421-branches 320w/);
  assert.match(sources.srcSet, /inklet-b1-0\.1280\.webp\?v=20260421-branches 1280w/);
});

test('runtime visual config normaliser accepts published config and rejects incompatible schemas', () => {
  const runtime = normaliseMonsterVisualRuntimeConfig({
    schemaVersion: 1,
    manifestHash: BUNDLED_MONSTER_VISUAL_CONFIG.manifestHash,
    publishedVersion: 2,
    publishedAt: 1234,
    config: BUNDLED_MONSTER_VISUAL_CONFIG,
  });

  assert.equal(runtime.publishedVersion, 2);
  assert.equal(runtime.manifestHashMismatch, false);
  assert.equal(runtime.config.assets['vellhorn-b1-3'].baseline.facing, 'left');

  assert.equal(normaliseMonsterVisualRuntimeConfig({
    schemaVersion: 999,
    config: BUNDLED_MONSTER_VISUAL_CONFIG,
  }), null);
});
