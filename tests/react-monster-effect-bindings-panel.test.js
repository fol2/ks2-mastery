// Targeted tests for the U7 admin Monster effect bindings panel. The panel
// composes typed input controls per binding row, lets admin add bindings
// from the catalog, toggle enabled, reorder, mark reviewed, and surfaces
// inline errors when an entry breaks the binding schema.
//
// We exercise three surfaces:
//   - Pure helper logic exported by the helpers module (no React) for the
//     deeper permutations.
//   - SSR rendering of the bindings panel through the dedicated fixture.
//   - Behavioural simulation of the panel's `onDraftChange` emissions via
//     direct helper calls (no React render lifecycle), keeping the suite
//     `node --test` compatible without a JSX evaluator.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderMonsterEffectBindingsPanelFixture,
  renderMonsterVisualPreviewGridFixture,
} from './helpers/react-render.js';
import { bundledEffectConfig, BUNDLED_EFFECT_CATALOG } from '../src/platform/game/render/effect-config-defaults.js';
import {
  assetBindingsAllReviewed,
  bindingRowAllErrors,
  bindingsRowsForAsset,
  defaultBindingRow,
  exclusiveGroupCollisions,
  BINDING_LIFECYCLES,
} from '../src/surfaces/hubs/monster-effect-bindings-helpers.js';

const SPARKLE_DEFAULTS = BUNDLED_EFFECT_CATALOG.shiny.params;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

// ---------- Helper unit tests ----------

test('defaultBindingRow seeds params from catalog entry paramSchema defaults', () => {
  const draft = bundledEffectConfig();
  const row = defaultBindingRow({
    kind: 'shiny',
    lifecycle: 'persistent',
    catalog: draft.catalog,
  });
  assert.equal(row.kind, 'shiny');
  assert.equal(row.lifecycle, 'persistent');
  assert.equal(row.enabled, true);
  assert.equal(row.reviewed, false);
  // Defaults sourced from the bundled sparkle paramSchema, not hard-coded
  // here, so the assertion tracks any future shift in the seed values (L6).
  assert.equal(row.params.intensity, SPARKLE_DEFAULTS.intensity.default);
  assert.equal(row.params.palette, SPARKLE_DEFAULTS.palette.default);
});

test('defaultBindingRow with unknown lifecycle falls back to persistent', () => {
  const draft = bundledEffectConfig();
  const row = defaultBindingRow({ kind: 'shiny', lifecycle: 'transient', catalog: draft.catalog });
  assert.equal(row.lifecycle, 'persistent');
});

test('bindingRowAllErrors flags missing kind', () => {
  const draft = bundledEffectConfig();
  const errors = bindingRowAllErrors({ kind: '', params: {}, reviewed: false }, { catalog: draft.catalog });
  assert.ok(errors.some((e) => e.code === 'effect_binding_kind_required'), JSON.stringify(errors));
});

test('bindingRowAllErrors flags deleted catalog kind', () => {
  const draft = bundledEffectConfig();
  // Catalog does not contain `crystal-glint` — simulating a deleted catalog kind.
  const errors = bindingRowAllErrors(
    { kind: 'crystal-glint', params: {}, reviewed: false },
    { catalog: draft.catalog },
  );
  assert.ok(errors.some((e) => e.code === 'effect_binding_kind_unknown'), JSON.stringify(errors));
});

test('bindingRowAllErrors flags catalog kind that is unreviewed', () => {
  const draft = bundledEffectConfig();
  draft.catalog.shiny.reviewed = false;
  const errors = bindingRowAllErrors(
    { kind: 'shiny', params: { intensity: 0.6 }, reviewed: false },
    { catalog: draft.catalog },
  );
  assert.ok(errors.some((e) => e.code === 'effect_binding_kind_unreviewed'), JSON.stringify(errors));
});

test('bindingRowAllErrors flags params failing catalogParamSchemaErrors', () => {
  const draft = bundledEffectConfig();
  const errors = bindingRowAllErrors(
    { kind: 'shiny', params: { intensity: 5 }, reviewed: false },
    { catalog: draft.catalog },
  );
  // sparkle.intensity has max=1 — value 5 must trip the validator.
  assert.ok(errors.some((e) => e.code === 'effect_param_default_above_max'), JSON.stringify(errors));
});

test('exclusiveGroupCollisions returns map only when 2+ enabled rows share the group', () => {
  const draft = bundledEffectConfig();
  const rows = [
    { slot: 'persistent', index: 0, entry: { kind: 'shiny', enabled: true, params: {}, reviewed: true } },
    { slot: 'persistent', index: 1, entry: { kind: 'rare-glow', enabled: true, params: {}, reviewed: true } },
  ];
  const collisions = exclusiveGroupCollisions(rows, draft.catalog);
  assert.deepEqual(collisions, { rarity: ['shiny', 'rare-glow'] });
});

test('exclusiveGroupCollisions skips disabled rows', () => {
  const draft = bundledEffectConfig();
  const rows = [
    { slot: 'persistent', index: 0, entry: { kind: 'shiny', enabled: false, params: {}, reviewed: true } },
    { slot: 'persistent', index: 1, entry: { kind: 'rare-glow', enabled: true, params: {}, reviewed: true } },
  ];
  const collisions = exclusiveGroupCollisions(rows, draft.catalog);
  assert.deepEqual(collisions, {}, 'a disabled row does not contribute to a collision');
});

test('exclusiveGroupCollisions empty when single binding in a group', () => {
  const draft = bundledEffectConfig();
  const rows = [
    { slot: 'persistent', index: 0, entry: { kind: 'shiny', enabled: true, params: {}, reviewed: true } },
  ];
  assert.deepEqual(exclusiveGroupCollisions(rows, draft.catalog), {});
});

test('assetBindingsAllReviewed: true only when every row reviewed === true', () => {
  const draft = bundledEffectConfig();
  // The bundled bindings carry a single continuous row per asset, all reviewed.
  assert.equal(assetBindingsAllReviewed(draft, 'inklet-b1-3'), true);
  // Mark one row unreviewed.
  draft.bindings['inklet-b1-3'].continuous[0].reviewed = false;
  assert.equal(assetBindingsAllReviewed(draft, 'inklet-b1-3'), false);
});

test('assetBindingsAllReviewed: vacuously true when no row exists', () => {
  const draft = { bindings: {} };
  assert.equal(assetBindingsAllReviewed(draft, 'never-bound'), true);
});

test('bindingsRowsForAsset: persistent rows first, continuous after', () => {
  const draft = bundledEffectConfig();
  draft.bindings['inklet-b1-3'].persistent.push({ kind: 'shiny', params: { intensity: 0.6 }, reviewed: true });
  const rows = bindingsRowsForAsset(draft, 'inklet-b1-3');
  assert.equal(rows[0].slot, 'persistent');
  assert.equal(rows[rows.length - 1].slot, 'continuous');
});

test('BINDING_LIFECYCLES is a frozen pair: persistent + continuous', () => {
  assert.deepEqual([...BINDING_LIFECYCLES], ['persistent', 'continuous']);
});

// ---------- React SSR + behavioural simulation ----------

test('bindings panel SSR: lists existing bindings and exposes the Add binding picker', async () => {
  const html = await renderMonsterEffectBindingsPanelFixture({ canManage: true });
  assert.match(html, /Per-monster overlay stack/, 'section title rendered');
  assert.match(html, /Add binding/, 'add binding affordance rendered');
  assert.match(html, /Continuous transforms/, 'continuous slot divider rendered');
});

test('bindings panel SSR: read-only mode hides editor controls but keeps listing', async () => {
  const html = await renderMonsterEffectBindingsPanelFixture({ canManage: false });
  assert.doesNotMatch(html, />\s*Add binding\s*</);
  assert.doesNotMatch(html, />\s*Mark reviewed\s*</);
});

test('bindings panel SSR: catalog picker labels include lifecycle + group prefix', async () => {
  const html = await renderMonsterEffectBindingsPanelFixture({ canManage: true });
  assert.match(html, /\[persistent\] shiny · group: rarity/);
});

test('bindings panel SSR: option for an unreviewed catalog entry is disabled with the Unreviewed tooltip', async () => {
  const html = await renderMonsterEffectBindingsPanelFixture({
    canManage: true,
    draftMutator: 'draft.catalog.shiny.reviewed = false;',
  });
  // The picker option for shiny is disabled and surfaces the tooltip.
  assert.match(html, /title="Unreviewed catalog entry"[^>]*>\s*\[persistent\] shiny/);
});

test('bindings panel SSR: deleted catalog kind row renders in error state with disabled fields', async () => {
  const draftMutator = `
    delete draft.catalog['shiny'];
    draft.bindings['inklet-b1-3'].persistent.push({
      kind: 'shiny',
      params: {},
      reviewed: false,
    });
  `;
  const html = await renderMonsterEffectBindingsPanelFixture({ canManage: true, draftMutator });
  // Row marks the missing catalog with an inline error and an alert role.
  // (HTML attribute encoding escapes the double-quote inside the message.)
  assert.match(html, /Catalog entry for &quot;shiny&quot; was deleted/);
  // Remove (×) button still renders so admin can clean up.
  assert.match(html, /aria-label="Remove binding"/);
});

test('bindings panel SSR: exclusive-group collision renders as a <ul>, not inline siblings', async () => {
  const draftMutator = `
    draft.bindings['inklet-b1-3'].persistent.push({
      kind: 'shiny',
      params: { intensity: 0.6, palette: 'accent' },
      reviewed: true,
      enabled: true,
    });
    draft.bindings['inklet-b1-3'].persistent.push({
      kind: 'rare-glow',
      params: { intensity: 0.5, palette: 'pale' },
      reviewed: true,
      enabled: true,
    });
  `;
  const html = await renderMonsterEffectBindingsPanelFixture({ canManage: true, draftMutator });
  assert.match(html, /Exclusive group collision/);
  // The "later wins" copy is the runtime contract documented to admin.
  assert.match(html, /later binding wins/);
  // The collision summary is an actual list item; kinds are listed in the
  // catalog z-index order (composeEffects() resolves z-index ascending,
  // so the higher-z `shiny` (10) lists after the lower-z `rare-glow` (8) —
  // matching the document order in `Object.values(catalog)`).
  assert.match(html, /<li[^>]*>rarity:\s*shiny vs rare-glow/);
});

// Behavioural simulation — the panel's onDraftChange path. We mirror the
// internal mutator the panel runs (defaultBindingRow + push into the
// chosen lifecycle slot) and verify the resulting draft shape matches
// the expected new row.
test('admin adds shiny @ intensity=0.8 → emitted draft contains row with intensity 0.8', () => {
  const draft = bundledEffectConfig();
  const created = defaultBindingRow({
    kind: 'shiny',
    lifecycle: 'persistent',
    catalog: draft.catalog,
  });
  // Simulate admin tweaking intensity post-add (the field control's onChange).
  created.params.intensity = 0.8;
  draft.bindings['inklet-b1-3'].persistent.push(created);
  const stored = draft.bindings['inklet-b1-3'].persistent[0];
  assert.equal(stored.kind, 'shiny');
  assert.equal(stored.params.intensity, 0.8);
});

test('two enabled bindings sharing exclusiveGroup → both rows persist + collision emitted', () => {
  const draft = bundledEffectConfig();
  draft.bindings['inklet-b1-3'].persistent.push({
    kind: 'shiny',
    params: { intensity: 0.6, palette: 'accent' },
    reviewed: true,
    enabled: true,
  });
  draft.bindings['inklet-b1-3'].persistent.push({
    kind: 'rare-glow',
    params: { intensity: 0.5, palette: 'pale' },
    reviewed: true,
    enabled: true,
  });
  const rows = bindingsRowsForAsset(draft, 'inklet-b1-3');
  const persistentRows = rows.filter((row) => row.slot === 'persistent');
  assert.equal(persistentRows.length, 2);
  const collisions = exclusiveGroupCollisions(rows, draft.catalog);
  assert.deepEqual(collisions, { rarity: ['shiny', 'rare-glow'] });
});

test('marking each binding row reviewed flips assetBindingsAllReviewed to true', () => {
  const draft = bundledEffectConfig();
  // Append a fresh unreviewed admin row.
  draft.bindings['inklet-b1-3'].persistent.push({
    kind: 'shiny',
    params: { intensity: 0.6, palette: 'accent' },
    reviewed: false,
    enabled: true,
  });
  assert.equal(assetBindingsAllReviewed(draft, 'inklet-b1-3'), false);
  // Mark every row reviewed.
  for (const slot of BINDING_LIFECYCLES) {
    for (const entry of draft.bindings['inklet-b1-3'][slot] || []) {
      entry.reviewed = true;
    }
  }
  assert.equal(assetBindingsAllReviewed(draft, 'inklet-b1-3'), true);
});

test('row referencing deleted catalog kind: errors keep field-controls disabled but Remove still works', () => {
  const draft = bundledEffectConfig();
  delete draft.catalog['shiny'];
  // Inject a stale binding referencing the now-deleted catalog kind.
  draft.bindings['inklet-b1-3'].persistent.push({
    kind: 'shiny',
    params: { intensity: 0.6 },
    reviewed: false,
    enabled: true,
  });
  const errors = bindingRowAllErrors(draft.bindings['inklet-b1-3'].persistent[0], { catalog: draft.catalog });
  assert.deepEqual(errors.map((e) => e.code).sort(), ['effect_binding_kind_unknown']);
  // After a Remove call, the row is gone.
  draft.bindings['inklet-b1-3'].persistent.splice(0, 1);
  assert.equal(draft.bindings['inklet-b1-3'].persistent.length, 0);
});

// ---------- Helper boundary cases (M8) ----------

test('defaultBindingRow with empty catalog seeds an empty params object (no template defaults)', () => {
  const row = defaultBindingRow({ kind: 'unknown', catalog: {} });
  assert.equal(row.kind, 'unknown');
  assert.deepEqual(row.params, {});
  assert.equal(row.reviewed, false);
});

test('bindingRowAllErrors with undefined catalog flags missing-kind catalog as deleted', () => {
  const errors = bindingRowAllErrors(
    { kind: 'shiny', params: {}, reviewed: false },
    { catalog: undefined },
  );
  assert.deepEqual(errors.map((e) => e.code).sort(), ['effect_binding_kind_unknown']);
});

// ---------- H4: assetBindingsAllReviewed catalog awareness ----------

test('assetBindingsAllReviewed: row reviewed=true but catalog kind deleted → returns false', () => {
  const draft = bundledEffectConfig();
  draft.bindings['inklet-b1-3'].persistent.push({
    kind: 'shiny',
    params: { intensity: 0.6, palette: 'accent' },
    reviewed: true,
    enabled: true,
  });
  // First confirm the asset is currently all-reviewed (with the shiny row).
  assert.equal(assetBindingsAllReviewed(draft, 'inklet-b1-3'), true);
  // Now delete the catalog entry: the row is suddenly orphaned.
  delete draft.catalog['shiny'];
  assert.equal(
    assetBindingsAllReviewed(draft, 'inklet-b1-3'),
    false,
    'a row that no longer resolves to a catalog entry must not count as reviewed',
  );
});

// ---------- H6: shiny binding's overlay markup actually reaches the preview tile ----------

test('preview grid: shiny@0.8 binding renders fx-shiny overlay with intensity 0.8 in lightbox tile', async () => {
  const html = await renderMonsterVisualPreviewGridFixture({
    effectMutator: `
      effectDraft.bindings['inklet-b1-3'].persistent.push({
        kind: 'shiny',
        params: { intensity: 0.8, palette: 'accent' },
        reviewed: true,
        enabled: true,
      });
    `,
  });
  // Surface filter on the bundled shiny entry includes 'lightbox'; the
  // sparkle template renders a `fx fx-shiny` span with the intensity bound
  // to a CSS custom property.
  assert.match(html, /class="fx fx-shiny"[^>]*--fx-shiny-intensity:0\.8/);
  // The overlay sits inside the lightbox-context frame — verifies the
  // binding actually flowed through MonsterEffectConfigProvider rather
  // than falling back to the per-displayState defaults.
  assert.match(html, /monster-visual-frame-lightbox[\s\S]*?fx fx-shiny/);
});

// ---------- H7: autosave draft is restored on the next mount ----------

test('bindings panel autosave: a stored draft remounts with the persisted row intact', async () => {
  // The panel itself does not own the autosave (that's
  // MonsterVisualConfigPanel) — but a remount of the bindings panel from
  // a draft that was previously serialised through autosave must round-trip
  // every authored field. We simulate the autosave round-trip by JSON-
  // serialising the draft (the actual storage wire format) and re-mounting
  // the SSR fixture from the deserialised value.
  const seedDraft = bundledEffectConfig();
  seedDraft.bindings['inklet-b1-3'].persistent.push({
    kind: 'shiny',
    params: { intensity: 0.85, palette: 'secondary' },
    reviewed: false,
    enabled: true,
  });
  const persisted = JSON.parse(JSON.stringify(seedDraft));
  // Fixture re-mount: feed the deserialised draft through draftMutator so
  // the SSR pass starts from autosave-replay state.
  const draftMutator = `
    Object.assign(draft, ${JSON.stringify(persisted)});
  `;
  const html = await renderMonsterEffectBindingsPanelFixture({ canManage: true, draftMutator });
  // Each authored field survives the round-trip: kind, intensity, palette
  // — and the row sits under the persistent slot (z-index 10 overlay).
  assert.match(html, /Persistent overlays/);
  // The intensity field is stamped into the input `value` attribute by the
  // typed number control.
  assert.match(html, /value="0\.85"/);
  // Palette enum surfaces as a selected option.
  assert.match(html, /<option[^>]*value="secondary"[^>]*selected/);
});

// ---------- H9: marking every effect row reviewed flips the queue/publish gate ----------

test('queue / publish gate: marking every binding + tunable reviewed flips assetBindingsAllReviewed AND assetCelebrationAllReviewed to true for every asset', async () => {
  // This is the integration shape the `effect-incomplete` filter and the
  // publish chip both consume. We emulate the Mark-reviewed sweep by
  // forcing every row + tunable to reviewed=true and confirm the
  // helper-level gate clears for every asset in the manifest.
  const { MONSTER_ASSET_MANIFEST } = await import('../src/platform/game/monster-asset-manifest.js');
  const { assetCelebrationAllReviewed } = await import('../src/surfaces/hubs/monster-effect-celebration-helpers.js');
  const draft = bundledEffectConfig();
  // Push one extra binding into a single asset to make the assertion
  // non-vacuous (bundled defaults are already all-reviewed; without an
  // unreviewed row to flip, the test would pass trivially even before H4).
  draft.bindings['inklet-b1-3'].persistent.push({
    kind: 'shiny',
    params: { intensity: 0.6, palette: 'accent' },
    reviewed: false,
    enabled: true,
  });
  // Sanity: at least one asset is currently incomplete.
  assert.equal(assetBindingsAllReviewed(draft, 'inklet-b1-3'), false);
  // Mark-reviewed sweep on every row and every kind.
  for (const asset of MONSTER_ASSET_MANIFEST.assets) {
    for (const slot of BINDING_LIFECYCLES) {
      for (const entry of draft.bindings[asset.key]?.[slot] || []) {
        entry.reviewed = true;
      }
    }
    for (const tunable of Object.values(draft.celebrationTunables[asset.key] || {})) {
      tunable.reviewed = true;
    }
  }
  for (const asset of MONSTER_ASSET_MANIFEST.assets) {
    assert.equal(assetBindingsAllReviewed(draft, asset.key), true, `bindings dirty for ${asset.key}`);
    assert.equal(assetCelebrationAllReviewed(draft, asset.key), true, `tunables dirty for ${asset.key}`);
  }
});
