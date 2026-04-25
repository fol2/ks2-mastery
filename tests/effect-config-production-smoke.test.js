import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BUNDLED_CELEBRATION_TUNABLES,
  BUNDLED_EFFECT_BINDINGS,
  BUNDLED_EFFECT_CATALOG,
  bundledEffectConfig,
} from '../src/platform/game/render/effect-config-defaults.js';
import { collectFailures } from '../scripts/effect-config-production-smoke.mjs';

function cloneBundled() {
  return bundledEffectConfig();
}

test('collectFailures returns empty for the bundled effect config (all 8 kinds present)', () => {
  const failures = collectFailures(cloneBundled());
  assert.deepEqual(failures, []);
  // Sanity: confirm the bundled config really is the eight-kind shape so this
  // test catches a future drift in BUNDLED_EFFECT_CATALOG too.
  assert.equal(Object.keys(BUNDLED_EFFECT_CATALOG).length, 8);
  assert.ok(Object.keys(BUNDLED_EFFECT_BINDINGS).length > 0);
  assert.ok(Object.keys(BUNDLED_CELEBRATION_TUNABLES).length > 0);
});

test('collectFailures reports an empty catalog as a seed failure', () => {
  const config = cloneBundled();
  config.catalog = {};
  const failures = collectFailures(config);
  assert.ok(failures.some((message) => message.includes('catalog: empty')));
});

test('collectFailures reports a missing required bundled kind by name', () => {
  const config = cloneBundled();
  delete config.catalog['mega-aura'];
  const failures = collectFailures(config);
  assert.ok(failures.some((message) => message.includes('missing required bundled kind "mega-aura"')));
});

test('collectFailures reports a missing bindings sub-document', () => {
  const config = cloneBundled();
  delete config.bindings;
  const failures = collectFailures(config);
  assert.ok(failures.some((message) => message.includes('effect_config_bindings_required')));
});

test('collectFailures reports a missing celebrationTunables sub-document', () => {
  const config = cloneBundled();
  delete config.celebrationTunables;
  const failures = collectFailures(config);
  assert.ok(failures.some((message) => message.includes('effect_config_celebrationTunables_required')));
});

test('collectFailures flags an asset whose bindings row is present but empty when its tunables are also empty', () => {
  const config = cloneBundled();
  const [assetKey] = Object.keys(config.bindings);
  config.bindings[assetKey] = { persistent: [], continuous: [] };
  config.celebrationTunables[assetKey] = {};
  const failures = collectFailures(config);
  assert.ok(failures.some((message) => message.includes(`asset ${assetKey}: bindings and celebrationTunables both empty`)));
});

test('collectFailures handles malformed bindings + celebrationTunables without throwing', () => {
  const config = cloneBundled();
  config.bindings = 'not-an-object';
  config.celebrationTunables = null;
  assert.doesNotThrow(() => {
    const failures = collectFailures(config);
    assert.ok(failures.length > 0);
  });
});
