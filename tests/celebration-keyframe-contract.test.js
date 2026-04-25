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
// MUST be appended here. We do not auto-discover every `@keyframes
// monster-celebration-*` block because that namespace also covers the
// opposite-contract self-centred halo/white/burst keyframes. Instead, a
// separate enumeration-completeness test below scans every CSS rule that
// references `.monster-celebration-art` and verifies the keyframe name it
// drives is present in this list — so adding a new overlay kind with a
// self-centring translate will fail a test, not silently pass.
const ART_KEYFRAMES = Object.freeze([
  'monster-celebration-before',
  'monster-celebration-after',
  'monster-celebration-egg-wobble',
  'monster-celebration-monster-pop',
  'monster-celebration-mega-before',
  'monster-celebration-mega-after',
]);

// Entrance keyframes — these carry a drop-from-above choreography beat
// via `translateY(Npx)` at 0%. Pinned separately so that a silent removal
// of the entrance delta (which would make sprites appear to pop in from
// their resting position rather than drift down into it) triggers a
// regression rather than sliding through.
const ENTRANCE_KEYFRAMES = Object.freeze([
  'monster-celebration-before',
  'monster-celebration-egg-wobble',
  'monster-celebration-monster-pop',
  'monster-celebration-mega-before',
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

test('art base rule premise: .monster-celebration-art stays position:absolute; inset:0 — the precondition that makes dropping translate(-50%, …) correct', () => {
  // Match the base .monster-celebration-art rule specifically — not variant
  // selectors like `.monster-celebration-art.before` or `.egg-crack .monster-celebration-art.before`.
  // The base rule is the sole owner of the layout premise. If a future
  // refactor re-homes the <img> at top:50%;left:50% and re-introduces a
  // self-centring wrapper translate (the pre-PR-119 DOM shape), the
  // art-keyframe contract above would pass while re-admitting the bug —
  // because the premise "inner img is inset:0 inside a var-driven wrapper"
  // would have silently changed.
  const baseRuleMatch = css.match(/^\.monster-celebration-art\s*\{[^}]*\}/m);
  assert.ok(baseRuleMatch, 'expected a base .monster-celebration-art rule in styles/app.css at the start of a line (no leading selectors)');
  const rule = baseRuleMatch[0];
  assert.ok(
    /position\s*:\s*absolute/.test(rule),
    'base .monster-celebration-art rule must declare position: absolute — this is load-bearing for the inset:0 layout premise. If the DOM has legitimately moved to a centred-img model, update this assertion deliberately and revisit the keyframe contract.',
  );
  assert.ok(
    /inset\s*:\s*0/.test(rule),
    'base .monster-celebration-art rule must declare inset: 0 — this is what makes dropping translate(-50%, …) from the art keyframes correct. Without inset:0, the img is not aligned to the wrapper and the keyframes would need to re-centre it.',
  );
});

test('egg-crack pivot contract: .egg-crack .monster-celebration-art.before/.after carry transform-origin: 50% 80%', () => {
  // The wobble and pop choreography pivots on the egg base, not the img
  // centre. That pivot is declared at rule level (outside the keyframes),
  // so it is not caught by the per-keyframe transform assertions above.
  // If a future refactor drops or moves these declarations, the wobble
  // silently switches to a centre pivot and the choreography breaks.
  const wobbleRule = css.match(/\.monster-celebration-overlay\.egg-crack\s+\.monster-celebration-art\.before\s*\{[^}]*\}/);
  const popRule = css.match(/\.monster-celebration-overlay\.egg-crack\s+\.monster-celebration-art\.after\s*\{[^}]*\}/);
  assert.ok(wobbleRule, 'expected a .egg-crack .monster-celebration-art.before rule in styles/app.css');
  assert.ok(popRule, 'expected a .egg-crack .monster-celebration-art.after rule in styles/app.css');
  for (const [label, rule] of [['egg-wobble', wobbleRule[0]], ['monster-pop', popRule[0]]]) {
    assert.ok(
      /transform-origin\s*:\s*50%\s+80%/.test(rule),
      `${label} rule must declare transform-origin: 50% 80% — the wobble/pop choreography pivots on the egg base, not the img centre. If the pivot has legitimately moved, update this assertion deliberately.`,
    );
  }
});

test('entrance choreography: every entrance keyframe contains at least one translateY(...) — preserves the drop-in beat', () => {
  for (const name of ENTRANCE_KEYFRAMES) {
    const block = extractKeyframeBlock(css, name);
    const transforms = transformValues(block);
    assert.ok(
      transforms.some((value) => /translateY\(/.test(value)),
      `@keyframes ${name} must contain at least one translateY(...) frame — the entrance beat drops the sprite from above into its resting position. If the drop-in has intentionally been removed, update ENTRANCE_KEYFRAMES.`,
    );
  }
});

test('art keyframe enumeration is complete: every .monster-celebration-art animation reference is in ART_KEYFRAMES', () => {
  // Scan every CSS rule whose selector mentions `.monster-celebration-art`
  // as a whole class (not a substring of a sibling class like
  // `.monster-celebration-art-caption`) and extract each @keyframes name
  // from its animation: declaration. Every extracted name must appear in
  // ART_KEYFRAMES — so a future overlay kind adding a new art keyframe
  // fails this test loudly instead of silently escaping the contract.
  //
  // The rule regex uses a negative lookahead after `-art` to require a
  // word boundary — `.monster-celebration-art-wrapper` would not match.
  // The animation extraction splits on top-level commas so comma-separated
  // animation shorthand (`animation: a 1s, b 2s;`) surfaces both names.
  const ruleRegex = /([^{}]*\.monster-celebration-art(?![A-Za-z0-9_-])[^{}]*)\{([^}]*)\}/g;
  const referencedKeyframes = new Set();
  const varDrivenRules = [];
  let match;
  while ((match = ruleRegex.exec(css)) !== null) {
    const body = match[2];
    const selector = match[1].trim();
    const animationDeclRegex = /animation\s*:\s*([^;]+);?/g;
    let declMatch;
    while ((declMatch = animationDeclRegex.exec(body)) !== null) {
      const declValue = declMatch[1];
      const segments = declValue.split(',').map((s) => s.trim()).filter(Boolean);
      for (const segment of segments) {
        if (/^var\s*\(/.test(segment)) {
          varDrivenRules.push({ selector, segment });
          continue;
        }
        const nameMatch = segment.match(/^([A-Za-z_-][A-Za-z0-9_-]*)/);
        if (!nameMatch) continue;
        const name = nameMatch[1];
        if (name.startsWith('monster-celebration-')) {
          referencedKeyframes.add(name);
        }
      }
    }
  }
  assert.ok(referencedKeyframes.size > 0, 'expected at least one .monster-celebration-art rule to reference a monster-celebration-* animation — the scanner may be broken');
  assert.deepEqual(
    varDrivenRules,
    [],
    `.monster-celebration-art rules must not use CSS custom properties as animation names: ${JSON.stringify(varDrivenRules)}. A var()-driven name is opaque to this contract test — the referenced keyframe could contain translate(-50%, …) without being caught. If you need a var-driven animation name for this element, extend this test to resolve the var's declared value before enforcing the contract.`,
  );
  const listed = new Set(ART_KEYFRAMES);
  const missing = [...referencedKeyframes].filter((name) => !listed.has(name));
  assert.deepEqual(
    missing,
    [],
    `.monster-celebration-art rules reference keyframe(s) not present in ART_KEYFRAMES: ${JSON.stringify(missing)}. Add each missing name to ART_KEYFRAMES (and, if it is an entrance keyframe that drops in from above, to ENTRANCE_KEYFRAMES) so the self-centring-translate contract covers them too.`,
  );
});

test('parser sanity: extractKeyframeBlock + transformValues surface the expected number of transform frames per art keyframe', () => {
  // If a future edit to extractKeyframeBlock or transformValues silently
  // breaks extraction (returns empty strings or loses brace tracking),
  // the "no translate(-50%" assertion above becomes vacuously true. Pin
  // the expected frame counts so a parser regression fails instead of
  // passing green.
  const expectedTransformCount = Object.freeze({
    'monster-celebration-before': 7,       // 0, 14, 28, 42, 50, 56, 62 — the 100% frame is opacity-only
    'monster-celebration-after': 5,        // 0/58, 64, 74, 86, 100
    'monster-celebration-egg-wobble': 12,  // 0, 8, 18, 22, 26, 29, 32, 35, 37, 38, 44, 48 — 100% is opacity-only
    'monster-celebration-monster-pop': 8,  // 0/40, 44, 50, 56, 64, 72, 82, 100
    'monster-celebration-mega-before': 8,  // 0, 10, 24, 36, 46, 52, 58, 64 — 100% is opacity-only
    'monster-celebration-mega-after': 5,   // 0/60, 66, 78, 90, 100
  });
  for (const name of ART_KEYFRAMES) {
    const block = extractKeyframeBlock(css, name);
    const transforms = transformValues(block);
    assert.equal(
      transforms.length,
      expectedTransformCount[name],
      `@keyframes ${name} expected ${expectedTransformCount[name]} transform frames, got ${transforms.length}. Either the choreography has been intentionally restructured (update expectedTransformCount above) or the parser has regressed (debug extractKeyframeBlock / transformValues).`,
    );
  }
});
