import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Regression pin for the celebration-overlay nested-wrapper contract.
//
// `.monster-celebration-visual` (the outer span emitted by CelebrationShell
// and MonsterCelebrationOverlay) is absolutely positioned at the stage
// centre and owns the var-driven `translate(calc(-50% + var(--visual-offset-x))
// ...)` transform that applies per-monster offset, anchor, and scale from
// monster-visual-config. `.monster-celebration-art` (the inner <img>) is
// `position: absolute; inset: 0` inside that wrapper, so its animation
// transforms must animate only scale + choreography deltas — never a
// self-centring `translate(-50%, -50%)` that would shift the image out of
// the wrapper and stomp on the wrapper's per-monster offset/anchor.
//
// The halo / white-flash / burst-halo elements are the opposite shape:
// they are positioned at `top:50%; left:50%` in their base rules, so their
// keyframes *must* carry `translate(-50%, -50%)` to stay self-centred.
//
// This test pins both invariants so the specific collision pattern that
// survived PR #119 and PR #141 cannot silently reappear.

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS_PATH = path.join(rootDir, 'styles', 'app.css');

// Load-bearing enumeration: if a new .monster-celebration-art keyframe is
// ever added (e.g. a stage-4-only variant or a new overlay kind), its name
// MUST be appended here. Auto-discovery via regex is intentionally avoided —
// the six names are known today, a seventh does not exist, and a dynamic
// scan would be speculative complexity that hides omissions as "we'll find
// it next time".
const ART_KEYFRAMES = Object.freeze([
  'monster-celebration-before',
  'monster-celebration-after',
  'monster-celebration-egg-wobble',
  'monster-celebration-monster-pop',
  'monster-celebration-mega-before',
  'monster-celebration-mega-after',
]);

// Self-centred elements whose keyframes must continue to carry
// `translate(-50%, -50%)` (these elements live at top:50%;left:50% in their
// base rule and deliberately pivot on their own centre). The mega shine
// keyframe is deliberately excluded: it animates translateX only and has
// never used a self-centring translate.
const SELF_CENTRED_KEYFRAMES = Object.freeze([
  'monster-celebration-halo-anim',
  'monster-celebration-white-anim',
  'monster-celebration-egg-halo',
  'monster-celebration-egg-white',
  'monster-celebration-mega-halo',
  'monster-celebration-mega-white',
]);

const css = readFileSync(CSS_PATH, 'utf8');

function extractKeyframeBlock(source, name) {
  const marker = `@keyframes ${name}`;
  const start = source.indexOf(marker);
  if (start === -1) return null;
  const braceOpen = source.indexOf('{', start);
  if (braceOpen === -1) return null;
  let depth = 1;
  let i = braceOpen + 1;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    i += 1;
  }
  return source.slice(braceOpen + 1, i - 1);
}

function transformValues(block) {
  const results = [];
  const re = /transform\s*:\s*([^;]+);/g;
  let match;
  while ((match = re.exec(block)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

test('celebration art keyframes: every .monster-celebration-art keyframe is present', () => {
  for (const name of ART_KEYFRAMES) {
    const block = extractKeyframeBlock(css, name);
    assert.ok(
      block !== null,
      `expected @keyframes ${name} to exist in styles/app.css — if this keyframe was renamed or removed, update the ART_KEYFRAMES list in this test to reflect the new contract`,
    );
  }
});

test('celebration art keyframes: no frame contains translate(-50%, …) — wrapper owns centring, art owns only scale + choreography deltas', () => {
  for (const name of ART_KEYFRAMES) {
    const block = extractKeyframeBlock(css, name);
    const transforms = transformValues(block);
    assert.ok(transforms.length > 0, `@keyframes ${name} has no transform rules — this test cannot pin the contract`);
    for (const value of transforms) {
      assert.ok(
        !value.includes('translate(-50%'),
        `@keyframes ${name} contains a self-centring translate(-50%, …) in "${value}". The inner .monster-celebration-art is position:absolute; inset:0 inside the .monster-celebration-visual wrapper, so translate(-50%, …) shifts it out of the wrapper and stomps on per-monster offset/anchor/scale from monster-visual-config. Animate only scale (and, where the choreography needs it, translateY or rotate).`,
      );
    }
  }
});

test('celebration wrapper contract: .monster-celebration-visual still carries the var-driven translate', () => {
  const wrapperRuleMatch = css.match(/\.monster-celebration-visual\s*\{[^}]*\}/);
  assert.ok(wrapperRuleMatch, 'expected a base .monster-celebration-visual rule in styles/app.css');
  const rule = wrapperRuleMatch[0];
  assert.ok(
    rule.includes('translate(calc(-50% + var(--visual-offset-x'),
    'expected .monster-celebration-visual transform to start with translate(calc(-50% + var(--visual-offset-x …)) — this is the wrapper-level centring + per-monster offset contract from monster-visual-config. If the wrapper contract has legitimately changed, update this assertion deliberately.',
  );
});

test('self-centred overlay elements: halo / white-flash / burst-halo keyframes still carry translate(-50%, -50%)', () => {
  for (const name of SELF_CENTRED_KEYFRAMES) {
    const block = extractKeyframeBlock(css, name);
    assert.ok(block !== null, `expected @keyframes ${name} to exist — these rings/flashes are positioned at top:50%;left:50% and must keep animating translate(-50%, -50%)`);
    const transforms = transformValues(block);
    assert.ok(
      transforms.some((value) => value.includes('translate(-50%, -50%)')),
      `@keyframes ${name} must continue to contain translate(-50%, -50%) in at least one frame — these elements live at top:50%;left:50% and their self-centring contract is deliberately the opposite of the art layer's.`,
    );
  }
});
