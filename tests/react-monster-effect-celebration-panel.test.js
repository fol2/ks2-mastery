// Targeted tests for the U7 admin Monster celebration tunables panel. The
// panel surfaces three tabs (caught / evolve / mega) and lets admin toggle
// `showParticles` / `showShine` and pick a `modifierClass` from a closed
// allow-list. Admin must mark each kind reviewed before publish.
//
// We exercise:
//   - Pure helper logic (defaultCelebrationTunables, celebrationTunablesAllErrors).
//   - SSR rendering of the panel's tabbed pill layout + read-only mode.
//   - Behavioural simulation of the panel's onDraftChange path via direct
//     helper calls — keeping the suite `node --test` compatible without
//     mounting React lifecycle.

import test from 'node:test';
import assert from 'node:assert/strict';

import { renderMonsterEffectCelebrationPanelFixture } from './helpers/react-render.js';
import { bundledEffectConfig, BUNDLED_CELEBRATION_TUNABLES } from '../src/platform/game/render/effect-config-defaults.js';
import {
  CELEBRATION_KINDS,
  assetCelebrationAllReviewed,
  celebrationTunableFromDraft,
  celebrationTunablesAllErrors,
  defaultCelebrationTunables,
} from '../src/surfaces/hubs/monster-effect-celebration-helpers.js';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

// ---------- Helper unit tests ----------

test('defaultCelebrationTunables(kind) seeds from BUNDLED_CELEBRATION_TUNABLES byte-for-byte', () => {
  // Pull a sample asset's bundled tunables — every asset shares the same shell.
  const sample = Object.values(BUNDLED_CELEBRATION_TUNABLES)[0];
  for (const kind of CELEBRATION_KINDS) {
    const seeded = defaultCelebrationTunables(kind);
    const baseline = sample[kind];
    assert.equal(seeded.showParticles, baseline.showParticles, `${kind} showParticles drift`);
    assert.equal(seeded.showShine, baseline.showShine, `${kind} showShine drift`);
    assert.equal(seeded.modifierClass, baseline.modifierClass, `${kind} modifierClass drift`);
    // Seeded tunables start unreviewed — admin re-confirms after editing.
    assert.equal(seeded.reviewed, false);
  }
});

test('celebrationTunablesAllErrors flags modifierClass containing < or >', () => {
  const errors = celebrationTunablesAllErrors(
    { showParticles: true, showShine: false, modifierClass: '<script>', reviewed: false },
    { kind: 'caught' },
  );
  assert.ok(errors.some((e) => /modifierClass/i.test(e.message)), JSON.stringify(errors));
});

test('celebrationTunablesAllErrors flags modifierClass containing semicolon', () => {
  const errors = celebrationTunablesAllErrors(
    { showParticles: true, showShine: false, modifierClass: 'a;b', reviewed: false },
    { kind: 'caught' },
  );
  assert.ok(errors.some((e) => /modifierClass/i.test(e.message)), JSON.stringify(errors));
});

test('celebrationTunablesAllErrors flags modifierClass containing double quote', () => {
  const errors = celebrationTunablesAllErrors(
    { showParticles: true, showShine: false, modifierClass: 'a"b', reviewed: false },
    { kind: 'caught' },
  );
  assert.ok(errors.some((e) => /modifierClass/i.test(e.message)), JSON.stringify(errors));
});

test('celebrationTunablesAllErrors flags modifierClass not in XSS allowlist', () => {
  const errors = celebrationTunablesAllErrors(
    { showParticles: true, showShine: false, modifierClass: 'unknown-class', reviewed: false },
    { kind: 'caught' },
  );
  assert.ok(errors.some((e) => /modifierClass/i.test(e.message)), JSON.stringify(errors));
});

test('celebrationTunablesAllErrors accepts the allowlisted "egg-crack" modifier', () => {
  const errors = celebrationTunablesAllErrors(
    { showParticles: true, showShine: false, modifierClass: 'egg-crack', reviewed: false },
    { kind: 'caught' },
  );
  assert.equal(errors.length, 0, JSON.stringify(errors));
});

test('celebrationTunablesAllErrors flags an unknown celebration kind argument', () => {
  const errors = celebrationTunablesAllErrors(
    { showParticles: true, showShine: false, modifierClass: '', reviewed: false },
    { kind: 'phantom' },
  );
  assert.ok(errors.some((e) => e.code === 'celebration_tunable_kind_invalid'));
});

test('celebrationTunablesAllErrors clean tunable returns empty error array', () => {
  const errors = celebrationTunablesAllErrors(
    { showParticles: true, showShine: false, modifierClass: '', reviewed: false },
    { kind: 'caught' },
  );
  assert.equal(errors.length, 0, JSON.stringify(errors));
});

test('celebrationTunableFromDraft falls back to a fresh default when missing', () => {
  const draft = { celebrationTunables: {} };
  const tunable = celebrationTunableFromDraft(draft, 'never-bound', 'caught');
  assert.equal(tunable.reviewed, false);
  assert.equal(typeof tunable.showParticles, 'boolean');
});

test('celebrationTunableFromDraft returns a clone (not a reference) of stored tunable', () => {
  const draft = bundledEffectConfig();
  const stored = draft.celebrationTunables['inklet-b1-3'].caught;
  const out = celebrationTunableFromDraft(draft, 'inklet-b1-3', 'caught');
  out.showParticles = !out.showParticles;
  assert.equal(stored.showParticles !== out.showParticles, true, 'mutating clone must not affect draft');
});

test('assetCelebrationAllReviewed: true only when every kind reviewed === true', () => {
  const draft = bundledEffectConfig();
  assert.equal(assetCelebrationAllReviewed(draft, 'inklet-b1-3'), true);
  draft.celebrationTunables['inklet-b1-3'].caught.reviewed = false;
  assert.equal(assetCelebrationAllReviewed(draft, 'inklet-b1-3'), false);
});

test('assetCelebrationAllReviewed: vacuously true when asset has no row', () => {
  assert.equal(assetCelebrationAllReviewed({ celebrationTunables: {} }, 'never-bound'), true);
});

// ---------- React SSR + behavioural simulation ----------

test('celebration panel SSR: tabs + section title rendered', async () => {
  const html = await renderMonsterEffectCelebrationPanelFixture({ canManage: true });
  assert.match(html, /Per-monster celebration overrides/);
  assert.match(html, /Caught/);
  assert.match(html, /Evolve/);
  assert.match(html, /Mega/);
  // Tabs should be a single horizontal row using the celebration-tabs class.
  assert.match(html, /class="monster-effect-celebration-tabs"/);
});

test('celebration panel SSR: read-only mode hides editor controls', async () => {
  const html = await renderMonsterEffectCelebrationPanelFixture({ canManage: false });
  assert.doesNotMatch(html, />\s*Mark reviewed\s*</);
});

test('celebration panel SSR: malicious modifierClass in draft surfaces the inline alert', async () => {
  // The panel's `<select>` sources from the closed allowlist so admin cannot
  // type an XSS payload directly via the UI; this scenario covers a draft
  // that arrived dirty (e.g. cloud autosave race) and verifies the panel
  // still surfaces the inline error.
  const draftMutator = `
    draft.celebrationTunables['inklet-b1-3'].caught.modifierClass = '<script>';
  `;
  const html = await renderMonsterEffectCelebrationPanelFixture({ canManage: true, draftMutator });
  assert.match(html, /modifierClass must be one of/);
});

// Behavioural simulation — the panel's onDraftChange path. Mirrors the
// internal mutator the panel runs when admin toggles `showParticles`.
test('toggling showParticles=false on caught flips reviewed to false in the emitted draft', () => {
  const draft = bundledEffectConfig();
  // Simulate handler: replace the kind's tunable with a flipped flag and
  // reset reviewed=false.
  const target = draft.celebrationTunables['inklet-b1-3'].caught;
  const updated = { ...target, showParticles: false, reviewed: false };
  draft.celebrationTunables['inklet-b1-3'].caught = updated;
  // Subsequent reads pick up the change.
  const after = celebrationTunableFromDraft(draft, 'inklet-b1-3', 'caught');
  assert.equal(after.showParticles, false);
  assert.equal(after.reviewed, false);
  // The `assetCelebrationAllReviewed` chip flips to "Needs review".
  assert.equal(assetCelebrationAllReviewed(draft, 'inklet-b1-3'), false);
});

test('admin sets modifierClass to malicious payload → inline error + Mark-reviewed disabled', () => {
  const draft = bundledEffectConfig();
  // Forcibly mutate the draft as the panel handler would.
  draft.celebrationTunables['inklet-b1-3'].caught.modifierClass = 'x;</style><script>';
  draft.celebrationTunables['inklet-b1-3'].caught.reviewed = false;
  const tunable = celebrationTunableFromDraft(draft, 'inklet-b1-3', 'caught');
  const errors = celebrationTunablesAllErrors(tunable, { kind: 'caught' });
  // Validator catches the malicious payload — the panel's `reviewable`
  // gate (errors.length === 0) keeps the Mark-reviewed button disabled.
  assert.ok(errors.length > 0);
  const reviewable = errors.length === 0 && tunable.reviewed !== true;
  assert.equal(reviewable, false);
});

test('switching active pill from caught → mega: re-render uses mega tunables, no draft change emitted', () => {
  // Simulate: the panel's `setActiveKind('mega')` is internal-only state.
  // Reading the tunable for the new active kind must return mega's row,
  // and the draft itself is untouched by the switch.
  const draft = bundledEffectConfig();
  const before = clone(draft.celebrationTunables['inklet-b1-3']);
  // Active kind changes — we read mega's tunable now.
  const mega = celebrationTunableFromDraft(draft, 'inklet-b1-3', 'mega');
  assert.equal(mega.showShine, true, 'mega tunable surfaces showShine=true from bundled defaults');
  // Draft unchanged after the pill switch.
  assert.deepEqual(draft.celebrationTunables['inklet-b1-3'], before);
});

test('integration: marking every kind reviewed flips assetCelebrationAllReviewed to true', () => {
  const draft = bundledEffectConfig();
  // Stage: mark every kind unreviewed (e.g. after a fresh edit).
  for (const kind of CELEBRATION_KINDS) {
    draft.celebrationTunables['inklet-b1-3'][kind].reviewed = false;
  }
  assert.equal(assetCelebrationAllReviewed(draft, 'inklet-b1-3'), false);
  // After admin clicks Mark reviewed on each tab.
  for (const kind of CELEBRATION_KINDS) {
    draft.celebrationTunables['inklet-b1-3'][kind].reviewed = true;
  }
  assert.equal(assetCelebrationAllReviewed(draft, 'inklet-b1-3'), true);
});
