// Strict-publish validation for the effect sub-document. The permissive
// envelope validator (U1) tolerates a missing `effect`; this strict gate
// (U5) requires every catalog entry, binding row, and celebration tunable
// to be reviewed AND template-conformant.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateEffectConfigForPublish,
} from '../src/platform/game/render/effect-config-schema.js';
import {
  validatePublishedConfigForPublish,
  BUNDLED_MONSTER_VISUAL_CONFIG,
  MONSTER_VISUAL_CONTEXTS,
} from '../src/platform/game/monster-visual-config.js';
import {
  bundledEffectConfig,
  BUNDLED_EFFECT_CATALOG,
} from '../src/platform/game/render/effect-config-defaults.js';
import { MONSTER_ASSET_MANIFEST } from '../src/platform/game/monster-asset-manifest.js';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function reviewedVisualConfig() {
  const reviewed = clone(BUNDLED_MONSTER_VISUAL_CONFIG);
  for (const entry of Object.values(reviewed.assets || {})) {
    entry.review = entry.review || { contexts: {} };
    entry.review.contexts = entry.review.contexts || {};
    for (const context of MONSTER_VISUAL_CONTEXTS) {
      entry.review.contexts[context] = {
        reviewed: true,
        reviewedAt: 0,
        reviewedBy: 'test-admin',
      };
    }
  }
  return reviewed;
}

function knownKindsFromCatalog(catalog) {
  return new Set([
    ...Object.keys(catalog || {}),
    ...Object.keys(BUNDLED_EFFECT_CATALOG),
  ]);
}

// 1. Happy path: a complete, reviewed config passes.
test('validateEffectConfigForPublish: bundled defaults pass strict publish', () => {
  const config = bundledEffectConfig();
  const result = validateEffectConfigForPublish(config, {
    knownKinds: knownKindsFromCatalog(config.catalog),
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(result.errors, []);
});

// 2. Catalog entry with reviewed: false fails.
test('validateEffectConfigForPublish: unreviewed catalog entry fails with named error', () => {
  const config = bundledEffectConfig();
  config.catalog['shiny'].reviewed = false;
  const result = validateEffectConfigForPublish(config, {
    knownKinds: knownKindsFromCatalog(config.catalog),
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /shiny/.test(e.message) && /review/i.test(e.message)));
});

// 3. Binding row referencing a kind that's neither in catalog nor in BUNDLED_EFFECT_CATALOG fails.
test('validateEffectConfigForPublish: binding kind unknown to catalog and bundled defaults fails', () => {
  const config = bundledEffectConfig();
  const firstAsset = MONSTER_ASSET_MANIFEST.assets[0].key;
  config.bindings[firstAsset].persistent.push({ kind: 'phantom-glow', params: {}, reviewed: true });
  const result = validateEffectConfigForPublish(config, {
    knownKinds: knownKindsFromCatalog(config.catalog),
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /phantom-glow/.test(e.message)));
});

// 4. Binding row referencing a code-defined kind ONLY succeeds.
test('validateEffectConfigForPublish: binding referencing only a code-defined kind succeeds', () => {
  const config = bundledEffectConfig();
  // Empty the catalog of `shiny` but keep it as a known kind via BUNDLED_EFFECT_CATALOG.
  delete config.catalog['shiny'];
  const firstAsset = MONSTER_ASSET_MANIFEST.assets[0].key;
  config.bindings[firstAsset].persistent.push({ kind: 'shiny', params: { intensity: 0.7 }, reviewed: true });
  const result = validateEffectConfigForPublish(config, {
    knownKinds: knownKindsFromCatalog(config.catalog),
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

// 5. Celebration tunable with whitespace modifierClass fails (XSS hardening).
test('validateEffectConfigForPublish: celebration modifierClass with whitespace fails', () => {
  const config = bundledEffectConfig();
  const firstAsset = MONSTER_ASSET_MANIFEST.assets[0].key;
  config.celebrationTunables[firstAsset].caught.modifierClass = 'foo bar';
  const result = validateEffectConfigForPublish(config, {
    knownKinds: knownKindsFromCatalog(config.catalog),
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /modifierClass/i.test(e.message)));
});

// 6. Missing effect from envelope fails.
test('validatePublishedConfigForPublish: missing effect fails strict publish', () => {
  const result = validatePublishedConfigForPublish({
    visual: reviewedVisualConfig(),
    effect: undefined,
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /effect/i.test(e.message) && /required/i.test(e.message)));
});

// 7. Asset present in manifest is missing from bindings.
test('validateEffectConfigForPublish: asset missing from bindings fails', () => {
  const config = bundledEffectConfig();
  const firstAsset = MONSTER_ASSET_MANIFEST.assets[0].key;
  delete config.bindings[firstAsset];
  const result = validateEffectConfigForPublish(config, {
    knownKinds: knownKindsFromCatalog(config.catalog),
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => new RegExp(firstAsset).test(e.message) && /binding/i.test(e.message)));
});

// 8. Asset present in manifest is missing from celebrationTunables.
test('validateEffectConfigForPublish: asset missing from celebrationTunables fails', () => {
  const config = bundledEffectConfig();
  const firstAsset = MONSTER_ASSET_MANIFEST.assets[0].key;
  delete config.celebrationTunables[firstAsset];
  const result = validateEffectConfigForPublish(config, {
    knownKinds: knownKindsFromCatalog(config.catalog),
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => new RegExp(firstAsset).test(e.message) && /celebrat/i.test(e.message)));
});

// 9. Orchestrator runs both visual + effect validators and aggregates errors.
test('validatePublishedConfigForPublish: aggregates visual + effect errors', () => {
  const visual = clone(BUNDLED_MONSTER_VISUAL_CONFIG); // intentionally unreviewed → visual fails
  const effect = bundledEffectConfig();
  effect.catalog['shiny'].reviewed = false;            // effect fails too
  const result = validatePublishedConfigForPublish({ visual, effect });
  assert.equal(result.ok, false);
  // The visual validator emits review errors keyed by `monster_visual_review_required`.
  assert.ok(result.errors.some((e) => /review/i.test(e.message || '') || e.code === 'monster_visual_review_required'));
  // The effect validator emits a "shiny" review error.
  assert.ok(result.errors.some((e) => /shiny/.test(e.message)));
});

// 10. Orchestrator on a fully valid merged blob succeeds.
test('validatePublishedConfigForPublish: fully valid merged blob succeeds', () => {
  const result = validatePublishedConfigForPublish({
    visual: reviewedVisualConfig(),
    effect: bundledEffectConfig(),
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

// 11. A catalog entry whose params violate its template's paramSchema fails.
test('validateEffectConfigForPublish: catalog params violating template paramSchema fail', () => {
  const config = bundledEffectConfig();
  // sparkle.paramSchema declares intensity: { min: 0, max: 1 }; setting default to 5 violates it.
  config.catalog['shiny'].params.intensity = { type: 'number', default: 5, min: 0, max: 1 };
  const result = validateEffectConfigForPublish(config, {
    knownKinds: knownKindsFromCatalog(config.catalog),
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /intensity/i.test(e.message) && /shiny/.test(e.message)));
});

// 12. Catalog entry with unknown template fails.
test('validateEffectConfigForPublish: catalog entry with unknown template fails', () => {
  const config = bundledEffectConfig();
  config.catalog['shiny'].template = 'banana';
  const result = validateEffectConfigForPublish(config, {
    knownKinds: knownKindsFromCatalog(config.catalog),
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /template/i.test(e.message) && /banana/.test(e.message)));
});

// 12a. Binding row with an unreviewed continuous entry fails — the slot
//     name must surface in the error so the admin can find the row in the
//     queue.
test('validateEffectConfigForPublish: unreviewed continuous binding entry fails with slot named', () => {
  const config = bundledEffectConfig();
  const firstAsset = MONSTER_ASSET_MANIFEST.assets[0].key;
  config.bindings[firstAsset].continuous[0].reviewed = false;
  const result = validateEffectConfigForPublish(config, {
    knownKinds: knownKindsFromCatalog(config.catalog),
  });
  assert.equal(result.ok, false);
  const named = result.errors.find((e) => e.code === 'effect_binding_entry_unreviewed');
  assert.ok(named, `expected effect_binding_entry_unreviewed error; got ${JSON.stringify(result.errors)}`);
  assert.equal(named.assetKey, firstAsset);
  assert.equal(named.field, 'continuous');
  assert.match(named.message, /continuous\[0\]/);
});

// 13. Catalog entry with enum value not in declared values fails.
test('validateEffectConfigForPublish: catalog enum default outside declared values fails', () => {
  const config = bundledEffectConfig();
  config.catalog['shiny'].params.palette = { type: 'enum', default: 'rainbow', values: ['accent', 'secondary', 'pale'] };
  const result = validateEffectConfigForPublish(config, {
    knownKinds: knownKindsFromCatalog(config.catalog),
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /palette/i.test(e.message) || /rainbow/.test(e.message)));
});
