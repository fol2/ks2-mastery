import test from 'node:test';
import assert from 'node:assert/strict';

import { MONSTER_ASSET_MANIFEST } from '../src/platform/game/monster-asset-manifest.js';
import {
  BUNDLED_MONSTER_VISUAL_CONFIG,
  MONSTER_VISUAL_CONTEXTS,
  MONSTER_VISUAL_FILTER_OPTIONS,
  MONSTER_VISUAL_MOTION_PROFILE_OPTIONS,
  MONSTER_VISUAL_PATH_OPTIONS,
  buildMonsterAssetKey,
  monsterVisualAssetSources,
  normaliseMonsterVisualRuntimeConfig,
  resolveMonsterVisual,
  validateMonsterVisualConfigForPublish,
} from '../src/platform/game/monster-visual-config.js';

function reviewedConfig(config = BUNDLED_MONSTER_VISUAL_CONFIG) {
  const reviewed = structuredClone(config);
  for (const entry of Object.values(reviewed.assets || {})) {
    entry.review = entry.review || { contexts: {} };
    entry.review.contexts = entry.review.contexts || {};
    for (const context of MONSTER_VISUAL_CONTEXTS) {
      entry.review.contexts[context] = {
        reviewed: true,
        reviewedAt: Date.UTC(2026, 3, 24, 12, 0),
        reviewedBy: 'test-admin',
      };
    }
  }
  return reviewed;
}

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
  const validation = validateMonsterVisualConfigForPublish(reviewedConfig());

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

test('generated neutral defaults start unreviewed so publish has a review backlog', () => {
  const generatedAssets = MONSTER_ASSET_MANIFEST.assets.filter((asset) => (
    BUNDLED_MONSTER_VISUAL_CONFIG.assets[asset.key]?.provenance === 'generated-neutral-default'
  ));
  const tunedAssets = MONSTER_ASSET_MANIFEST.assets.filter((asset) => (
    BUNDLED_MONSTER_VISUAL_CONFIG.assets[asset.key]?.provenance === 'current-tuned-default'
  ));

  assert.equal(generatedAssets.length, 140);
  assert.equal(tunedAssets.length, 40);
  assert.ok(generatedAssets.every((asset) => (
    MONSTER_VISUAL_CONTEXTS.every((context) => (
      BUNDLED_MONSTER_VISUAL_CONFIG.assets[asset.key].review.contexts[context].reviewed === false
    ))
  )));
  assert.ok(tunedAssets.every((asset) => (
    MONSTER_VISUAL_CONTEXTS.every((context) => (
      BUNDLED_MONSTER_VISUAL_CONFIG.assets[asset.key].review.contexts[context].reviewed === true
    ))
  )));

  const validation = validateMonsterVisualConfigForPublish(BUNDLED_MONSTER_VISUAL_CONFIG);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((issue) => (
    issue.code === 'monster_visual_review_required'
    && issue.assetKey === generatedAssets[0].key
    && issue.context === 'meadow'
  )));
});

test('publish validation blocks missing contexts while render resolution falls back', () => {
  const broken = reviewedConfig();
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
  const broken = reviewedConfig();
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

test('publish validation rejects unsupported visual enum values', () => {
  const broken = reviewedConfig();
  broken.assets['vellhorn-b1-3'].baseline.filter = 'url(#monster-filter)';
  broken.assets['vellhorn-b1-3'].contexts.meadow.path = 'teleport';
  broken.assets['vellhorn-b1-3'].contexts.meadow.motionProfile = 'teleport';
  broken.assets['vellhorn-b1-3'].contexts.meadow.filter = 'drop-shadow(0 0 4px red)';

  const validation = validateMonsterVisualConfigForPublish(broken);

  assert.equal(validation.ok, false);
  assert.ok(MONSTER_VISUAL_PATH_OPTIONS.includes('walk-b'));
  assert.ok(MONSTER_VISUAL_MOTION_PROFILE_OPTIONS.includes('egg-breathe'));
  assert.ok(MONSTER_VISUAL_FILTER_OPTIONS.includes('brightness(1.1)'));
  assert.ok(validation.errors.some((issue) => (
    issue.code === 'monster_visual_field_invalid'
    && issue.assetKey === 'vellhorn-b1-3'
    && issue.field === 'path'
  )));
  assert.ok(validation.errors.some((issue) => (
    issue.code === 'monster_visual_field_invalid'
    && issue.assetKey === 'vellhorn-b1-3'
    && issue.field === 'motionProfile'
  )));
  assert.equal(validation.errors.filter((issue) => (
    issue.code === 'monster_visual_field_invalid'
    && issue.assetKey === 'vellhorn-b1-3'
    && issue.field === 'filter'
  )).length, 2);
});

test('publish validation locks celebrationOverlay anchors at defaults until animation-pivot propagation follow-up lands', () => {
  // The .monster-celebration-art keyframes + .egg-crack rules hard-pin
  // transform-origin at centre / 50% 80%. A non-default celebrationOverlay
  // anchor would diverge the wrapper pivot from the art pivot and shift
  // the sprite off-axis mid-animation. Publish validation rejects the
  // non-default until the CSS propagation fix lands (tracked in
  // docs/plans/2026-04-25-002-fix-celebration-sprite-centring-plan.md).
  const broken = reviewedConfig();
  broken.assets['vellhorn-b1-3'].contexts.celebrationOverlay.anchorX = 0.35;
  broken.assets['vellhorn-b1-3'].contexts.celebrationOverlay.anchorY = 0.7;

  const validation = validateMonsterVisualConfigForPublish(broken);

  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((issue) => (
    issue.code === 'monster_visual_celebration_anchor_locked'
    && issue.assetKey === 'vellhorn-b1-3'
    && issue.context === 'celebrationOverlay'
    && issue.field === 'anchorX'
  )), `expected anchorX lock error, got: ${JSON.stringify(validation.errors)}`);
  assert.ok(validation.errors.some((issue) => (
    issue.code === 'monster_visual_celebration_anchor_locked'
    && issue.assetKey === 'vellhorn-b1-3'
    && issue.context === 'celebrationOverlay'
    && issue.field === 'anchorY'
  )), `expected anchorY lock error, got: ${JSON.stringify(validation.errors)}`);
});

test('publish validation accepts default celebrationOverlay anchors (0.5 / 1)', () => {
  // Defensive positive test — guards that the celebrationOverlay lock
  // above does not accidentally reject the bundled/default case.
  const fine = reviewedConfig();
  // Bundled defaults already set anchorX=0.5 / anchorY=1; the assertion
  // is that the validation layer emits NO anchor-lock errors for them.
  const validation = validateMonsterVisualConfigForPublish(fine);

  const anchorLockErrors = validation.errors.filter((issue) => issue.code === 'monster_visual_celebration_anchor_locked');
  assert.deepEqual(anchorLockErrors, [], `expected no anchor-lock errors for bundled defaults, got: ${JSON.stringify(anchorLockErrors)}`);
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

// U7 adv-u7-r1-001: compact pointer preservation.
// Before the fix, the server-emitted pointer envelope
// ({schemaVersion, manifestHash, publishedVersion, publishedAt, compact: true})
// had no `assets` map, so the normaliser returned null and destroyed any
// cached full config on the next persist. The fix recognises the pointer
// shape and returns a pointer-marker so the caller can preserve the cache
// or trigger a lazy refetch.
test('U7 adv-u7-r1-001: normaliser preserves compact pointer envelope as first-class state', () => {
  const pointer = normaliseMonsterVisualRuntimeConfig({
    schemaVersion: 1,
    manifestHash: BUNDLED_MONSTER_VISUAL_CONFIG.manifestHash,
    publishedVersion: 3,
    publishedAt: 1740000000000,
    compact: true,
  });

  assert.ok(pointer, 'pointer envelope must not be silently discarded');
  assert.equal(pointer.compact, true, 'pointer-marker flag preserved');
  assert.equal(pointer.schemaVersion, 1);
  assert.equal(pointer.manifestHash, BUNDLED_MONSTER_VISUAL_CONFIG.manifestHash);
  assert.equal(pointer.publishedVersion, 3);
  assert.equal(pointer.publishedAt, 1740000000000);
  // Pointer has no bundled config payload — consumers detect this via
  // `config === null` and fall back to the cached full config or lazy
  // fetch.
  assert.equal(pointer.config, null, 'pointer has no config payload');
});

test('U7 adv-u7-r1-001: normaliser rejects pointer with incompatible schemaVersion', () => {
  assert.equal(normaliseMonsterVisualRuntimeConfig({
    schemaVersion: 999,
    manifestHash: 'whatever',
    publishedVersion: 1,
    compact: true,
  }), null, 'schema-mismatch pointer still rejected');
});
