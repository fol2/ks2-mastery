import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateEffectCatalogEntry,
  validateEffectBindingRow,
  validateCelebrationTunables,
  validateEffectConfig,
} from '../src/platform/game/render/effect-config-schema.js';
import {
  validatePublishedConfigEnvelope,
  BUNDLED_MONSTER_VISUAL_CONFIG,
  MONSTER_VISUAL_CONTEXTS,
} from '../src/platform/game/monster-visual-config.js';
import { bundledEffectConfig } from '../src/platform/game/render/effect-config-defaults.js';

function minimalCatalogEntry(overrides = {}) {
  return {
    kind: 'shiny',
    template: 'sparkle',
    lifecycle: 'persistent',
    layer: 'overlay',
    surfaces: ['codex', 'lightbox', 'home'],
    reducedMotion: 'simplify',
    zIndex: 10,
    exclusiveGroup: 'rarity',
    params: {
      intensity: { type: 'number', default: 0.6, min: 0, max: 1 },
      palette: { type: 'enum', default: 'accent', values: ['accent', 'secondary', 'pale'] },
    },
    reviewed: true,
    ...overrides,
  };
}

function reviewedVisualConfig() {
  const reviewed = structuredClone(BUNDLED_MONSTER_VISUAL_CONFIG);
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

// 1. Happy path
test('validateEffectCatalogEntry: minimal valid entry returns ok', () => {
  const result = validateEffectCatalogEntry(minimalCatalogEntry());
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

// 2. Missing template
test('validateEffectCatalogEntry: missing template fails', () => {
  const entry = minimalCatalogEntry();
  delete entry.template;
  const result = validateEffectCatalogEntry(entry);
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors.some((e) => /template/i.test(e.message)));
});

// 3. Unknown template
test('validateEffectCatalogEntry: unknown template fails with descriptive error', () => {
  const result = validateEffectCatalogEntry(minimalCatalogEntry({ template: 'banana' }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /template/i.test(e.message) && /banana/.test(e.message)));
});

// 4. Invalid lifecycle / layer / reducedMotion
test('validateEffectCatalogEntry: invalid lifecycle fails', () => {
  const result = validateEffectCatalogEntry(minimalCatalogEntry({ lifecycle: 'eternal' }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /lifecycle/i.test(e.message)));
});

test('validateEffectCatalogEntry: invalid layer fails', () => {
  const result = validateEffectCatalogEntry(minimalCatalogEntry({ layer: 'particles' }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /layer/i.test(e.message)));
});

test('validateEffectCatalogEntry: invalid reducedMotion fails', () => {
  const result = validateEffectCatalogEntry(minimalCatalogEntry({ reducedMotion: 'maybe' }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /reducedMotion/i.test(e.message)));
});

// 5. Surfaces shape
test('validateEffectCatalogEntry: surfaces not an array fails', () => {
  const result = validateEffectCatalogEntry(minimalCatalogEntry({ surfaces: 'codex' }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /surfaces/i.test(e.message)));
});

test('validateEffectCatalogEntry: empty surfaces array fails (require at least one or "*")', () => {
  const result = validateEffectCatalogEntry(minimalCatalogEntry({ surfaces: [] }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /surfaces/i.test(e.message)));
});

test('validateEffectCatalogEntry: surfaces ["*"] is allowed', () => {
  const result = validateEffectCatalogEntry(minimalCatalogEntry({ surfaces: ['*'] }));
  assert.equal(result.ok, true);
});

// 6. Param type unknown
test('validateEffectCatalogEntry: param.type unknown fails', () => {
  const result = validateEffectCatalogEntry(minimalCatalogEntry({
    params: {
      intensity: { type: 'banana', default: 0.5 },
    },
  }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /type/i.test(e.message) && /banana/.test(e.message)));
});

// 7. Enum missing values
test('validateEffectCatalogEntry: enum param missing values fails', () => {
  const result = validateEffectCatalogEntry(minimalCatalogEntry({
    params: {
      palette: { type: 'enum', default: 'accent' },
    },
  }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /values/i.test(e.message) || /enum/i.test(e.message)));
});

// 8. Happy path bindings
test('validateEffectBindingRow: valid binding row returns ok', () => {
  const knownKinds = new Set(['shiny', 'monster-motion-float']);
  const result = validateEffectBindingRow({
    persistent: [{ kind: 'shiny', params: { intensity: 0.6 }, reviewed: true }],
    continuous: [],
  }, { knownKinds });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

// 9. Edge case: binding references unknown kind
test('validateEffectBindingRow: unknown kind fails when knownKinds set is provided', () => {
  const knownKinds = new Set(['monster-motion-float']);
  const result = validateEffectBindingRow({
    persistent: [{ kind: 'crystal-glint', params: {}, reviewed: true }],
    continuous: [],
  }, { knownKinds });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /crystal-glint/.test(e.message) || /kind/i.test(e.message)));
});

// 10. Happy path celebration tunables
test('validateCelebrationTunables: complete tunables map returns ok', () => {
  const result = validateCelebrationTunables({
    caught: { showParticles: true, showShine: false, modifierClass: '', reviewed: true },
    evolve: { showParticles: false, showShine: false, modifierClass: '', reviewed: true },
    mega: { showParticles: true, showShine: true, modifierClass: '', reviewed: true },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

// 11. XSS hardening — whitespace
test('validateCelebrationTunables: modifierClass with whitespace fails (XSS hardening)', () => {
  const result = validateCelebrationTunables({
    caught: { showParticles: true, showShine: false, modifierClass: 'foo bar', reviewed: true },
    evolve: { showParticles: false, showShine: false, modifierClass: '', reviewed: true },
    mega: { showParticles: true, showShine: true, modifierClass: '', reviewed: true },
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /modifierClass/i.test(e.message)));
});

// 12. XSS hardening — special chars
test('validateCelebrationTunables: modifierClass with special chars fails (XSS hardening)', () => {
  const result = validateCelebrationTunables({
    caught: { showParticles: true, showShine: false, modifierClass: '<script>', reviewed: true },
    evolve: { showParticles: false, showShine: false, modifierClass: '', reviewed: true },
    mega: { showParticles: true, showShine: true, modifierClass: '', reviewed: true },
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /modifierClass/i.test(e.message)));
});

// 13. Edge case — unknown class
test('validateCelebrationTunables: modifierClass unknown value fails', () => {
  const result = validateCelebrationTunables({
    caught: { showParticles: true, showShine: false, modifierClass: 'unknown-class', reviewed: true },
    evolve: { showParticles: false, showShine: false, modifierClass: '', reviewed: true },
    mega: { showParticles: true, showShine: true, modifierClass: '', reviewed: true },
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /modifierClass/i.test(e.message)));
});

// 14. Happy path — egg-crack allowed
test('validateCelebrationTunables: modifierClass "egg-crack" is allowed', () => {
  const result = validateCelebrationTunables({
    caught: { showParticles: true, showShine: false, modifierClass: '', reviewed: true },
    evolve: { showParticles: false, showShine: false, modifierClass: 'egg-crack', reviewed: true },
    mega: { showParticles: true, showShine: true, modifierClass: '', reviewed: true },
  });
  assert.equal(result.ok, true);
});

// 15. Happy path — empty string allowed
test('validateCelebrationTunables: modifierClass "" is allowed', () => {
  const result = validateCelebrationTunables({
    caught: { showParticles: true, showShine: false, modifierClass: '', reviewed: true },
    evolve: { showParticles: false, showShine: false, modifierClass: '', reviewed: true },
    mega: { showParticles: true, showShine: true, modifierClass: '', reviewed: true },
  });
  assert.equal(result.ok, true);
});

// 16. validateEffectConfig — happy path
test('validateEffectConfig: complete config returns ok', () => {
  const result = validateEffectConfig(bundledEffectConfig());
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

// 17. validateEffectConfig — missing key
test('validateEffectConfig: missing top-level key returns error naming the key', () => {
  const config = bundledEffectConfig();
  delete config.bindings;
  const result = validateEffectConfig(config);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /bindings/.test(e.message)));
});

test('validateEffectConfig: missing catalog returns error naming catalog', () => {
  const config = bundledEffectConfig();
  delete config.catalog;
  const result = validateEffectConfig(config);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /catalog/.test(e.message)));
});

test('validateEffectConfig: missing celebrationTunables returns error naming the key', () => {
  const config = bundledEffectConfig();
  delete config.celebrationTunables;
  const result = validateEffectConfig(config);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /celebrationTunables/.test(e.message)));
});

// 18. Integration — envelope happy path
test('validatePublishedConfigEnvelope: visual + effect both valid returns ok', () => {
  const envelope = {
    visual: reviewedVisualConfig(),
    effect: bundledEffectConfig(),
  };
  const result = validatePublishedConfigEnvelope(envelope);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

// 19. Integration — missing effect tolerated with warning
test('validatePublishedConfigEnvelope: missing effect returns ok with warning', () => {
  const envelope = {
    visual: reviewedVisualConfig(),
  };
  const result = validatePublishedConfigEnvelope(envelope);
  assert.equal(result.ok, true);
  assert.ok(Array.isArray(result.warnings));
  assert.ok(result.warnings.some((w) => /effect/i.test(w.message)));
});
