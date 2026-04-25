import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderMonsterRenderFixture } from './helpers/react-render.js';
import {
  EFFECT_TEMPLATE_IDS,
  lookupTemplate,
  applyTemplate,
} from '../src/platform/game/render/effect-templates/index.js';
import motionTemplate from '../src/platform/game/render/effect-templates/motion.js';
import sparkleTemplate from '../src/platform/game/render/effect-templates/sparkle.js';
import { BUNDLED_EFFECT_CATALOG } from '../src/platform/game/render/effect-config-defaults.js';
import { defineEffect } from '../src/platform/game/render/define-effect.js';
import {
  computeEggBreatheStyle,
} from '../src/platform/game/render/effects/egg-breathe.js';
import {
  computeMonsterMotionStyle,
} from '../src/platform/game/render/effects/monster-motion-float.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Helper: bundle + render via the existing fixture by feeding `registrations`
// that build a spec from the template module and register it before render.
async function renderViaTemplate({
  templateModulePath,
  catalogEntry,
  monster,
  context = 'codex',
  reducedMotion = false,
}) {
  const templateAbs = path.join(rootDir, templateModulePath);
  const registrations = `
    import * as __tplMod from ${JSON.stringify(templateAbs)};
    const __spec = __tplMod.default.buildEffectSpec(${JSON.stringify(catalogEntry)});
    registerEffect(defineEffect(__spec));
  `;
  const out = await renderMonsterRenderFixture({
    monster,
    context,
    effects: [{ kind: catalogEntry.kind, params: {} }],
    reducedMotion,
    registrations,
  });
  return JSON.parse(out);
}

// Helper for celebration templates: invoke the spec's render() directly with
// the canonical reward.monster event as `params`. This mirrors what
// <CelebrationLayer> does at runtime (it bypasses composeEffects' schema-
// driven param resolution and forwards the event verbatim).
async function renderCelebrationViaTemplate({
  templateModulePath,
  catalogEntry,
  rewardEvent,
}) {
  const templateAbs = path.join(rootDir, templateModulePath);
  // We reuse `renderMonsterRenderFixture`'s esbuild bundling by executing
  // a render snippet via `registrations` that emits the result through the
  // dev-warn channel. This avoids inventing a third bundling helper.
  const registrations = `
    import * as __tplMod from ${JSON.stringify(templateAbs)};
    import { MonsterVisualConfigProvider } from ${JSON.stringify(
      path.join(rootDir, 'src/platform/game/MonsterVisualConfigContext.jsx'),
    )};
    const __spec = __tplMod.default.buildEffectSpec(${JSON.stringify(catalogEntry)});
    const __event = ${JSON.stringify(rewardEvent)};
    const __node = __spec.render({ params: __event, monster: __event.monster, context: 'lesson' });
    const __wrapped = React.createElement(MonsterVisualConfigProvider, { value: null }, __node);
    const __celebrationHtml = renderToStaticMarkup(__wrapped);
    __warnings.push({ key: '__celebration', message: __celebrationHtml });
  `;
  const out = await renderMonsterRenderFixture({
    monster: { id: 'inklet', displayState: 'fresh', placeholder: '', imageAlt: 'shell' },
    context: 'codex',
    effects: [],
    registrations,
  });
  const parsed = JSON.parse(out);
  const found = parsed.warnings.find((w) => w.key === '__celebration');
  return { html: found ? found.message : '' };
}

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
    srcSet: '/assets/monsters/inklet/inklet-1-320.png 320w',
    sizes: '(max-width: 640px) 320px, 640px',
    imageAlt: 'Inklet',
    placeholder: '',
    ...overrides,
  };
}

// 1. Happy path: lookupTemplate('sparkle') returns the sparkle template module.
test('lookupTemplate("sparkle") returns the sparkle template module', () => {
  const tpl = lookupTemplate('sparkle');
  assert.ok(tpl, 'expected sparkle template');
  assert.equal(tpl.id, 'sparkle');
  assert.equal(typeof tpl.buildEffectSpec, 'function');
  assert.ok(tpl.paramSchema, 'sparkle template paramSchema present');
});

// 2. Edge case: lookupTemplate('unknown') returns null.
test('lookupTemplate("unknown") returns null', () => {
  assert.equal(lookupTemplate('unknown'), null);
  assert.equal(lookupTemplate(''), null);
  assert.equal(lookupTemplate(null), null);
  assert.equal(lookupTemplate(undefined), null);
});

// 3. Happy path: EFFECT_TEMPLATE_IDS contains exactly the 7 ids.
test('EFFECT_TEMPLATE_IDS contains exactly the 7 expected ids', () => {
  const expected = ['motion', 'glow', 'sparkle', 'aura', 'particles-burst', 'shine-streak', 'pulse-halo'];
  assert.equal(EFFECT_TEMPLATE_IDS.length, 7);
  for (const id of expected) {
    assert.ok(EFFECT_TEMPLATE_IDS.includes(id), `expected ${id} in EFFECT_TEMPLATE_IDS`);
  }
});

// 4. Happy path: each NON-CELEBRATION template's buildEffectSpec produces a
//   spec whose required fields match the catalog entry. Celebration kinds
//   (caught, evolve, mega) are exercised through the SSR fixture path
//   (tests 10-12, 17), where their JSX-bearing modules can be parsed.
test('each non-celebration template buildEffectSpec produces a spec whose required fields match the catalog entry', () => {
  const checks = [
    { kind: 'egg-breathe', template: 'motion' },
    { kind: 'monster-motion-float', template: 'motion' },
    { kind: 'shiny', template: 'sparkle' },
    { kind: 'mega-aura', template: 'aura' },
    { kind: 'rare-glow', template: 'pulse-halo' },
  ];
  for (const { kind, template } of checks) {
    const entry = BUNDLED_EFFECT_CATALOG[kind];
    const tpl = lookupTemplate(template);
    assert.ok(tpl, `expected template ${template}`);
    const spec = tpl.buildEffectSpec(entry);
    assert.equal(spec.kind, entry.kind, `${kind}: kind mismatch`);
    assert.equal(spec.lifecycle, entry.lifecycle, `${kind}: lifecycle mismatch`);
    assert.equal(spec.layer, entry.layer, `${kind}: layer mismatch`);
    assert.deepEqual([...spec.surfaces], [...entry.surfaces], `${kind}: surfaces mismatch`);
    assert.equal(spec.reducedMotion, entry.reducedMotion, `${kind}: reducedMotion mismatch`);
    assert.equal(spec.zIndex, entry.zIndex, `${kind}: zIndex mismatch`);
    assert.equal(spec.exclusiveGroup, entry.exclusiveGroup, `${kind}: exclusiveGroup mismatch`);
  }
});

// 5. Happy path: motion template + egg-breathe config produces an EffectSpec
//   whose applyTransform output is byte-identical to today's
//   computeEggBreatheStyle.
test('motion template + egg-breathe config: applyTransform byte-identical to computeEggBreatheStyle', () => {
  const spec = motionTemplate.buildEffectSpec(BUNDLED_EFFECT_CATALOG['egg-breathe']);
  const seed = { id: 'inklet', stage: 0 };
  const expected = computeEggBreatheStyle(seed, 'card');
  const actual = spec.applyTransform({ params: {}, monster: seed, context: 'card' });
  assert.deepEqual(actual, expected);
});

// 6. Happy path: motion template + monster-motion-float across stages × contexts.
test('motion template + monster-motion-float: byte-identical across 4 stages × 3 contexts', () => {
  const spec = motionTemplate.buildEffectSpec(BUNDLED_EFFECT_CATALOG['monster-motion-float']);
  const stages = [1, 2, 3, 4];
  const contexts = ['card', 'feature', 'preview'];
  for (const stage of stages) {
    for (const context of contexts) {
      const seed = { id: 'inklet', stage };
      const expected = computeMonsterMotionStyle(seed, context);
      const actual = spec.applyTransform({ params: {}, monster: seed, context });
      assert.deepEqual(actual, expected, `motion mismatch stage ${stage} context ${context}`);
    }
  }
});

// 7. Happy path: sparkle template + shiny renders a fx-shiny span with vars.
test('sparkle template + shiny config produces fx-shiny overlay with intensity + colour vars', async () => {
  const { html } = await renderViaTemplate({
    templateModulePath: 'src/platform/game/render/effect-templates/sparkle.js',
    catalogEntry: BUNDLED_EFFECT_CATALOG['shiny'],
    monster: makeMonster(),
    context: 'codex',
  });
  assert.match(html, /class="fx fx-shiny"/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /--fx-shiny-intensity:\s*0\.6/);
  assert.match(html, /--fx-shiny-color:\s*#3E6FA8/);
});

// 8. Happy path: aura template + mega-aura matches today's mega-aura DOM.
test('aura template + mega-aura config produces fx-mega-aura overlay matching legacy', async () => {
  const { html } = await renderViaTemplate({
    templateModulePath: 'src/platform/game/render/effect-templates/aura.js',
    catalogEntry: BUNDLED_EFFECT_CATALOG['mega-aura'],
    monster: makeMonster(),
    context: 'codex',
  });
  assert.match(html, /class="fx fx-mega-aura"/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /--fx-mega-color-a:\s*#3E6FA8/);
  assert.match(html, /--fx-mega-color-b:\s*#FFE9A8/);
  assert.match(html, /--fx-mega-intensity:\s*0\.8/);
});

// 9. Happy path: pulse-halo template + rare-glow matches today's rare-glow DOM.
test('pulse-halo template + rare-glow config produces fx-rare-glow overlay matching legacy', async () => {
  const { html } = await renderViaTemplate({
    templateModulePath: 'src/platform/game/render/effect-templates/pulse-halo.js',
    catalogEntry: BUNDLED_EFFECT_CATALOG['rare-glow'],
    monster: makeMonster(),
    context: 'codex',
  });
  assert.match(html, /class="fx fx-rare-glow"/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /--fx-rare-color:\s*#F8F4EA/);
  assert.match(html, /--fx-rare-intensity:\s*0\.5/);
});

// 10. Happy path: particles-burst + caught config produces a celebration shell
//    with showParticles=true, showShine=false, eyebrow='New friend'.
test('particles-burst + caught config produces celebration shell with showParticles=true and "New friend" eyebrow', async () => {
  const monster = {
    id: 'inklet',
    name: 'Inklet',
    accent: '#3E6FA8',
    secondary: '#FFE9A8',
    pale: '#F8F4EA',
    nameByStage: ['Inklet egg', 'Inklet'],
  };
  const event = {
    monster,
    previous: { stage: 0, branch: 'b1' },
    next: { stage: 0, branch: 'b1' },
  };
  const { html } = await renderCelebrationViaTemplate({
    templateModulePath: 'src/platform/game/render/effect-templates/particles-burst.js',
    catalogEntry: BUNDLED_EFFECT_CATALOG['caught'],
    rewardEvent: event,
  });
  assert.match(html, /class="monster-celebration-overlay caught"/);
  assert.match(html, /You caught a new friend!/);
  assert.match(html, /New friend/);
  // showParticles=true -> particles container present
  assert.match(html, /class="monster-celebration-parts"/);
  // showShine=false -> shine element absent
  assert.equal(html.includes('class="monster-celebration-shine"'), false);
});

// 11. Happy path: particles-burst + evolve config + stage 0→1 produces
//    modifierClass='egg-crack' and eyebrow 'Hatched'.
test('particles-burst + evolve stage 0→1 produces egg-crack modifier and "Hatched" eyebrow', async () => {
  const monster = {
    id: 'inklet',
    name: 'Inklet',
    accent: '#3E6FA8',
    secondary: '#FFE9A8',
    pale: '#F8F4EA',
    nameByStage: ['Inklet egg', 'Inklet'],
  };
  const event = {
    monster,
    previous: { stage: 0, branch: 'b1' },
    next: { stage: 1, branch: 'b1' },
  };
  const { html } = await renderCelebrationViaTemplate({
    templateModulePath: 'src/platform/game/render/effect-templates/particles-burst.js',
    catalogEntry: BUNDLED_EFFECT_CATALOG['evolve'],
    rewardEvent: event,
  });
  assert.match(html, /class="monster-celebration-overlay evolve egg-crack"/);
  assert.match(html, /Hatched/);
  assert.match(html, /Inklet evolved into Inklet\./);
});

// 12. Happy path: shine-streak + mega config produces a celebration shell with
//    showShine=true.
test('shine-streak + mega config produces celebration shell with showShine=true', async () => {
  const monster = {
    id: 'inklet',
    name: 'Inklet',
    accent: '#3E6FA8',
    secondary: '#FFE9A8',
    pale: '#F8F4EA',
    nameByStage: ['Inklet egg', 'Inklet', 'Scribbla', 'Quillorn', 'Mega Quillorn'],
  };
  const event = {
    monster,
    previous: { stage: 3, branch: 'b1' },
    next: { stage: 4, branch: 'b1' },
  };
  const { html } = await renderCelebrationViaTemplate({
    templateModulePath: 'src/platform/game/render/effect-templates/shine-streak.js',
    catalogEntry: BUNDLED_EFFECT_CATALOG['mega'],
    rewardEvent: event,
  });
  assert.match(html, /class="monster-celebration-overlay mega"/);
  assert.match(html, /class="monster-celebration-shine"/);
  assert.match(html, /class="monster-celebration-parts"/);
  assert.match(html, /Final form/);
  assert.match(html, /Inklet reached its mega form: Mega Quillorn\./);
});

// 13. Happy path: glow template + minimal-valid catalog entry produces a fx-glow overlay.
test('glow template + minimal-valid catalog entry produces fx-glow overlay', async () => {
  const catalogEntry = {
    kind: 'crystal-glint',
    template: 'glow',
    lifecycle: 'persistent',
    layer: 'overlay',
    surfaces: ['codex', 'lightbox', 'home'],
    reducedMotion: 'simplify',
    zIndex: 9,
    exclusiveGroup: null,
    params: {
      intensity: { type: 'number', default: 0.7, min: 0, max: 1 },
      palette: { type: 'enum', default: 'accent', values: ['accent', 'secondary', 'pale'] },
    },
    reviewed: true,
  };
  const { html } = await renderViaTemplate({
    templateModulePath: 'src/platform/game/render/effect-templates/glow.js',
    catalogEntry,
    monster: makeMonster(),
    context: 'codex',
  });
  assert.match(html, /class="fx fx-glow"/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /--fx-glow-intensity:\s*0\.7/);
  assert.match(html, /--fx-glow-color:\s*#3E6FA8/);
});

// 14. Edge case: paramSchema validation - calling buildEffectSpec with
//    intensity:2 should NOT clamp inside the template. (Template just returns
//    the spec; clamping is composeEffects' job.)
test('sparkle.buildEffectSpec does not clamp intensity inside the template', () => {
  const entry = {
    ...BUNDLED_EFFECT_CATALOG['shiny'],
    params: {
      intensity: { type: 'number', default: 2, min: 0, max: 1 },
      palette: { type: 'enum', default: 'accent', values: ['accent', 'secondary', 'pale'] },
    },
  };
  const spec = sparkleTemplate.buildEffectSpec(entry);
  // Template hands the raw schema through; clamping is composeEffects' job.
  assert.equal(spec.params.intensity.default, 2);
});

// 15. Edge case: motion template with stage 99 clamps to [1,4] inside applyTransform.
test('motion template applyTransform clamps stage 99 to [1,4]', () => {
  const spec = motionTemplate.buildEffectSpec(BUNDLED_EFFECT_CATALOG['monster-motion-float']);
  const expectedAtFour = computeMonsterMotionStyle({ id: 'inklet', stage: 99 }, 'card');
  const actual = spec.applyTransform({ params: {}, monster: { id: 'inklet', stage: 99 }, context: 'card' });
  assert.deepEqual(actual, expectedAtFour);
});

// 16. Integration: applyTemplate(BUNDLED_EFFECT_CATALOG['shiny']) returns an
//    EffectSpec defineEffect() accepts without throwing.
test('applyTemplate(BUNDLED_EFFECT_CATALOG.shiny) builds a spec accepted by defineEffect()', () => {
  const spec = applyTemplate(BUNDLED_EFFECT_CATALOG['shiny']);
  assert.ok(spec, 'expected spec');
  assert.doesNotThrow(() => defineEffect(spec));
});

// 17. Integration: every entry in BUNDLED_EFFECT_CATALOG round-trips through
//    applyTemplate + defineEffect without throwing. The 5 non-celebration
//    kinds are checked directly. The 3 celebration kinds (caught, evolve,
//    mega) are JSX-bearing and round-trip via the SSR fixture below.
test('every non-celebration BUNDLED_EFFECT_CATALOG entry round-trips through applyTemplate + defineEffect', () => {
  const nonCelebrationKinds = [
    'egg-breathe',
    'monster-motion-float',
    'shiny',
    'mega-aura',
    'rare-glow',
  ];
  for (const kind of nonCelebrationKinds) {
    const entry = BUNDLED_EFFECT_CATALOG[kind];
    const spec = applyTemplate(entry);
    assert.ok(spec, `applyTemplate returned null for ${kind}`);
    assert.doesNotThrow(() => defineEffect(spec), `${kind}: defineEffect threw`);
  }
});

test('all 8 BUNDLED_EFFECT_CATALOG entries round-trip applyTemplate + defineEffect via the SSR pipeline', async () => {
  // Run inside the bundler so JSX-bearing celebration templates parse.
  const fixtureRegistrations = `
    import { applyTemplate, __registerCelebrationTemplates } from ${JSON.stringify(
      path.join(rootDir, 'src/platform/game/render/effect-templates/index.js'),
    )};
    import particlesBurst from ${JSON.stringify(
      path.join(rootDir, 'src/platform/game/render/effect-templates/particles-burst.js'),
    )};
    import shineStreak from ${JSON.stringify(
      path.join(rootDir, 'src/platform/game/render/effect-templates/shine-streak.js'),
    )};
    import { BUNDLED_EFFECT_CATALOG } from ${JSON.stringify(
      path.join(rootDir, 'src/platform/game/render/effect-config-defaults.js'),
    )};
    __registerCelebrationTemplates({ particlesBurst, shineStreak });
    let __result = { ok: true, kinds: [] };
    for (const [kind, entry] of Object.entries(BUNDLED_EFFECT_CATALOG)) {
      const spec = applyTemplate(entry);
      if (!spec) { __result = { ok: false, kind, reason: 'applyTemplate returned null' }; break; }
      try { defineEffect(spec); __result.kinds.push(kind); }
      catch (err) { __result = { ok: false, kind, reason: err.message }; break; }
    }
    globalThis.__roundTripResult = __result;
  `;
  const out = await renderMonsterRenderFixture({
    monster: makeMonster(),
    context: 'codex',
    effects: [],
    registrations: `
      ${fixtureRegistrations}
      // Override the warnings sink to capture round-trip stats too.
      __warnings.push({ key: '__roundTrip', message: JSON.stringify(globalThis.__roundTripResult) });
    `,
  });
  const { warnings } = JSON.parse(out);
  const roundTrip = warnings.find((w) => w.key === '__roundTrip');
  assert.ok(roundTrip, 'expected __roundTrip warning entry');
  const result = JSON.parse(roundTrip.message);
  assert.equal(result.ok, true, `round-trip failed: ${JSON.stringify(result)}`);
  assert.equal(result.kinds.length, 8);
  assert.deepEqual(result.kinds.sort(), [
    'caught',
    'egg-breathe',
    'evolve',
    'mega',
    'mega-aura',
    'monster-motion-float',
    'rare-glow',
    'shiny',
  ]);
});

// 18. Edge case: passing null/undefined to applyTemplate returns null and dev-warns.
test('applyTemplate(null|undefined) returns null without throwing', () => {
  assert.equal(applyTemplate(null), null);
  assert.equal(applyTemplate(undefined), null);
  assert.equal(applyTemplate({}), null);
  // entry with unknown template
  assert.equal(applyTemplate({ kind: 'foo', template: 'unknown' }), null);
});
