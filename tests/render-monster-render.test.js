import test from 'node:test';
import assert from 'node:assert/strict';

import { renderMonsterRenderFixture } from './helpers/react-render.js';

// Minimal monster shape mirroring `src/surfaces/home/CodexCreature.jsx`.
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
    srcSet: '/assets/monsters/inklet/inklet-1-320.png 320w, /assets/monsters/inklet/inklet-1-640.png 640w',
    sizes: '(max-width: 640px) 320px, 640px',
    imageAlt: 'Inklet',
    placeholder: '',
    ...overrides,
  };
}

async function run(opts) {
  const out = await renderMonsterRenderFixture(opts);
  return JSON.parse(out);
}

test('MonsterRender: happy path — renders monster image with class, src, srcSet, alt', async () => {
  const { html } = await run({
    monster: makeMonster(),
    context: 'codex',
    effects: [],
  });

  assert.match(html, /class="codex-creature-image is-monster"/);
  assert.match(html, /src="\/assets\/monsters\/inklet\/inklet-1-640\.png"/);
  assert.match(html, /srcSet|srcset/);
  assert.match(html, /alt="Inklet"/);
});

test('MonsterRender: happy path — base-layer effect emits CSS variables onto sprite style', async () => {
  const { html } = await run({
    monster: makeMonster(),
    context: 'codex',
    effects: [{ kind: 'test-motion' }],
    registrations: `
      registerEffect(defineEffect({
        kind: 'test-motion',
        lifecycle: 'continuous',
        layer: 'base',
        surfaces: ['*'],
        reducedMotion: 'asis',
        applyTransform: () => ({
          '--monster-float-duration': '4.2s',
          '--monster-float-pan-a': '3px',
        }),
      }));
    `,
  });

  // CSS-variable values flow through React's inline style. React lowercases
  // the attribute and emits the variables verbatim.
  assert.match(html, /--monster-float-duration:\s*4\.2s/);
  assert.match(html, /--monster-float-pan-a:\s*3px/);
});

test('MonsterRender: happy path — two overlay effects render in zIndex order with aria-hidden', async () => {
  const { html } = await run({
    monster: makeMonster(),
    context: 'codex',
    effects: [{ kind: 'lo' }, { kind: 'hi' }],
    registrations: `
      registerEffect(defineEffect({
        kind: 'hi',
        lifecycle: 'persistent',
        layer: 'overlay',
        surfaces: ['*'],
        reducedMotion: 'asis',
        zIndex: 50,
        render: () => <span data-effect="hi" aria-hidden="true">hi-overlay</span>,
      }));
      registerEffect(defineEffect({
        kind: 'lo',
        lifecycle: 'persistent',
        layer: 'overlay',
        surfaces: ['*'],
        reducedMotion: 'asis',
        zIndex: 5,
        render: () => <span data-effect="lo" aria-hidden="true">lo-overlay</span>,
      }));
    `,
  });

  const loIndex = html.indexOf('data-effect="lo"');
  const hiIndex = html.indexOf('data-effect="hi"');
  assert.notEqual(loIndex, -1, `expected lo overlay in html, got ${html}`);
  assert.notEqual(hiIndex, -1, `expected hi overlay in html, got ${html}`);
  assert.ok(loIndex < hiIndex, 'lo (zIndex 5) must render before hi (zIndex 50)');
  // Each overlay carries aria-hidden because the effect itself sets it.
  const ariaCount = (html.match(/aria-hidden="true"/g) || []).length;
  assert.ok(ariaCount >= 2, `expected at least two aria-hidden overlays, got ${ariaCount}`);
});

test('MonsterRender: edge case — empty effects array renders only the base sprite', async () => {
  const { html } = await run({
    monster: makeMonster(),
    context: 'codex',
    effects: [],
  });

  assert.match(html, /class="codex-creature-image is-monster"/);
  assert.equal(html.includes('data-effect='), false);
  // No overlay siblings: there is exactly one element in the fragment.
  const imgCount = (html.match(/<img\b/g) || []).length;
  assert.equal(imgCount, 1);
});

test('MonsterRender: edge case — transient lifecycle entry dev-warns and is dropped, base still renders', async () => {
  const { html, warnings } = await run({
    monster: makeMonster(),
    context: 'codex',
    // Real-world case: caller passes only { kind }. Registry resolves the
    // lifecycle, MonsterRender drops transients post-compose so they never
    // reach the overlay tree.
    effects: [{ kind: 'caught' }],
    registrations: `
      registerEffect(defineEffect({
        kind: 'caught',
        lifecycle: 'transient',
        layer: 'overlay',
        surfaces: ['*'],
        reducedMotion: 'asis',
        render: () => <span data-effect="caught-leak">leak</span>,
      }));
    `,
  });

  assert.match(html, /class="codex-creature-image is-monster"/);
  assert.doesNotMatch(html, /caught-leak/);
  assert.ok(
    warnings.some((w) => w.key.includes('transient-in-monster-render:caught')),
    `expected transient-in-monster-render:caught warning, got ${JSON.stringify(warnings)}`,
  );
});

test('MonsterRender: edge case — displayState "fresh" renders placeholder span and ignores effects', async () => {
  const { html } = await run({
    monster: makeMonster({
      displayState: 'fresh',
      img: null,
      srcSet: '',
      placeholder: '?',
      imageAlt: 'Inklet not caught',
    }),
    context: 'codex',
    effects: [{ kind: 'should-not-render' }],
    registrations: `
      registerEffect(defineEffect({
        kind: 'should-not-render',
        lifecycle: 'persistent',
        layer: 'overlay',
        surfaces: ['*'],
        reducedMotion: 'asis',
        render: () => <span data-effect="leak">leak</span>,
      }));
    `,
  });

  assert.match(html, /<span class="codex-unknown"[^>]*role="img"[^>]*aria-label="Inklet not caught"/);
  assert.match(html, />\?<\/span>/);
  assert.equal(html.includes('codex-creature-image'), false);
  assert.equal(html.includes('data-effect="leak"'), false);
});

test('MonsterRender: integration — reducedMotion=true drops effect with reducedMotion: "omit"', async () => {
  const { html } = await run({
    monster: makeMonster(),
    context: 'codex',
    effects: [{ kind: 'shake' }, { kind: 'glow' }],
    reducedMotion: true,
    registrations: `
      registerEffect(defineEffect({
        kind: 'shake',
        lifecycle: 'continuous',
        layer: 'base',
        surfaces: ['*'],
        reducedMotion: 'omit',
        applyTransform: () => ({ '--shake-amount': '4px' }),
      }));
      registerEffect(defineEffect({
        kind: 'glow',
        lifecycle: 'persistent',
        layer: 'overlay',
        surfaces: ['*'],
        reducedMotion: 'asis',
        render: () => <span data-effect="glow" aria-hidden="true">glow</span>,
      }));
    `,
  });

  // shake omitted, glow survives.
  assert.equal(html.includes('--shake-amount'), false);
  assert.match(html, /data-effect="glow"/);
});
