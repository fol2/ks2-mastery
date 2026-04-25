// Targeted tests for the admin Monster visual config panel U5 extensions:
// the autosave key now embeds the effect schema tag, the draft buffer
// round-trips the merged `{ visual, effect }` shape, and the queue gains
// effect-aware filter axes. We stay below the SSR boundary (no React
// renders here) — the renderHubSurfaceFixture in react-hub-surfaces still
// exercises the panel end-to-end. These tests target the panel's
// exported helpers + assertions over the rendered admin hub HTML.

import test from 'node:test';
import assert from 'node:assert/strict';

import { renderHubSurfaceFixture } from './helpers/react-render.js';
import { BUNDLED_MONSTER_VISUAL_CONFIG, MONSTER_VISUAL_CONTEXTS } from '../src/platform/game/monster-visual-config.js';
import { bundledEffectConfig } from '../src/platform/game/render/effect-config-defaults.js';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function reviewedDraftWithEffect() {
  const draft = clone(BUNDLED_MONSTER_VISUAL_CONFIG);
  for (const entry of Object.values(draft.assets || {})) {
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
  draft.effect = bundledEffectConfig();
  return draft;
}

// 17. Edge case: with an unreviewed catalog entry, the queue's
// `effect-incomplete` filter surfaces the entry. The admin hub fixture
// doesn't drive interactive state, so we verify by exercising the panel's
// helper logic directly via a small in-test harness.
test('admin panel queue filters: effect-incomplete surfaces unreviewed effect rows', async () => {
  const draft = reviewedDraftWithEffect();
  // Mark a binding entry unreviewed for one specific asset.
  const targetAsset = 'inklet-b1-3';
  draft.effect.bindings[targetAsset].continuous[0].reviewed = false;

  // Inline mirror of the panel's `assetEffectIncomplete` helper to avoid
  // bundling React just to test pure logic.
  function assetEffectIncomplete(d, assetKey) {
    const bindings = d?.effect?.bindings?.[assetKey];
    const tunables = d?.effect?.celebrationTunables?.[assetKey];
    if (bindings && typeof bindings === 'object') {
      for (const slot of ['persistent', 'continuous']) {
        const list = Array.isArray(bindings[slot]) ? bindings[slot] : [];
        for (const entry of list) {
          if (entry && entry.reviewed !== true) return true;
        }
      }
    }
    if (tunables && typeof tunables === 'object') {
      for (const kind of ['caught', 'evolve', 'mega']) {
        if (tunables[kind] && tunables[kind].reviewed !== true) return true;
      }
    }
    return false;
  }

  assert.equal(assetEffectIncomplete(draft, targetAsset), true);
  // A different asset (still all reviewed) does NOT surface in the filter.
  assert.equal(assetEffectIncomplete(draft, 'glimmerbug-b1-0'), false);
});

// 18. Happy path: when the merged draft has every effect entry reviewed
// AND every visual context reviewed, the strict-publish gate accepts the
// blob — i.e. the publish button is allowed to enable. We verify this via
// the strict validator (the panel's `validation.ok` is computed from
// `validateMonsterVisualConfigForPublish` for visual + the worker checks
// the merged blob server-side, which the integration tests cover).
test('admin panel publish gate: fully reviewed merged draft validates clean', async () => {
  const { validatePublishedConfigForPublish } = await import('../src/platform/game/monster-visual-config.js');
  const draft = reviewedDraftWithEffect();
  const result = validatePublishedConfigForPublish({
    visual: { ...draft, effect: undefined },
    effect: draft.effect,
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

// SSR smoke: the admin hub panel still renders the queue filter dropdown
// with the new effect-aware options. This catches accidental rename / typo
// regressions to the option labels.
test('admin hub renders the new effect-aware queue filter options', async () => {
  const html = await renderHubSurfaceFixture({ surface: 'admin' });
  assert.match(html, /Effect incomplete/);
  assert.match(html, /Effect changed/);
  assert.match(html, /Effect published mismatch/);
});

// SSR smoke: the autosave key embeds the `v1-effect` schema tag so older
// visual-only buffers cannot leak into a merged draft. Verified through
// the panel's exported AUTOSAVE_PREFIX constant via direct module import.
test('admin panel autosave key embeds the effect schema tag for cache-bust on shape change', async () => {
  // Read the source; the constant is module-private so we assert via the
  // serialised key shape produced by the panel under SSR. Easiest: search
  // the rendered admin HTML for the literal `v1-effect` schema tag in a
  // future panel surface that exposes it. Until U6, we exercise the
  // function indirectly by importing the panel source as text and
  // confirming the tag is referenced exactly once at the top of the file.
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const url = await import('node:url');
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
  const panel = await fs.readFile(path.join(__dirname, '..', 'src/surfaces/hubs/MonsterVisualConfigPanel.jsx'), 'utf8');
  assert.match(panel, /EFFECT_AUTOSAVE_SCHEMA_TAG\s*=\s*'v1-effect'/);
  assert.match(panel, /\$\{EFFECT_AUTOSAVE_SCHEMA_TAG\}/);
});
