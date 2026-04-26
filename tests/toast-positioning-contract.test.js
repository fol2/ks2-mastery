import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// U12 (sys-hardening p1): toast positioning contract.
//
// The toast shelf lives at fixed bottom-right of the viewport and
// announces mid-session notifications that must never:
//   - sit BEHIND the practice input / submit button at any z-index
//   - overlap the submit button visually because animation transitions
//     changed `top/left` (layout properties) instead of
//     `transform/opacity` (compositor-only)
//   - lose its `prefers-reduced-motion: reduce` carve-out (the toast
//     fade uses `animation:`; a copy of that block without a matching
//     reduced-motion override would animate for learners who asked for
//     motion to stop)
//
// The baseline doc lists "Toast overlap when multiple toasts fire within
// a short window, stacking visually rather than queueing" and "Monster /
// effect sprite layering glitch where celebration sprites render behind
// the learner's current answer card on specific viewport widths" — both
// under `(tracked in U5, U12)`. U12's lock is this parser-level test:
// any regression that would re-admit those two classes of bug now fails
// a cheap test before reaching the browser suite.
//
// Parser strategy mirrors `tests/celebration-keyframe-contract.test.js`:
// we read `styles/app.css` as text, extract the relevant blocks via
// brace-tracking, and assert invariants with regex checks. No CSS parser
// dependency; the format is stable and the assertions are deliberately
// narrow so a legitimate design change updates this file deliberately.

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS_PATH = path.join(rootDir, 'styles', 'app.css');
const css = readFileSync(CSS_PATH, 'utf8');

function extractRuleBlock(source, selector) {
  // Find a top-level rule whose selector exactly matches `selector` (no
  // trailing combinators, no descendant). Returns the rule body (between
  // the first `{` and its matching `}`), or null if no match.
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ruleRegex = new RegExp(`(^|\\n)\\s*${escaped}\\s*\\{`, 'g');
  const match = ruleRegex.exec(source);
  if (!match) return null;
  const braceOpen = source.indexOf('{', match.index);
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

function animatedProperties(block) {
  // Collect every property name that appears on the left of a `:` inside
  // a keyframe. This catches `top`, `left`, `right`, `bottom`, `width`,
  // `height` etc. — the layout-shifting animations the contract forbids.
  const results = new Set();
  const re = /(?:^|[{;\s])\s*([a-z-]+)\s*:/g;
  let match;
  while ((match = re.exec(block)) !== null) {
    results.add(match[1]);
  }
  return results;
}

test('toast shelf: container is position: fixed with explicit corner placement', () => {
  const block = extractRuleBlock(css, '.toast-shelf');
  assert.ok(
    block !== null,
    'expected a base .toast-shelf rule in styles/app.css — if the shelf has been renamed, update this test to reflect the new anchor selector',
  );
  assert.match(
    block,
    /position\s*:\s*fixed/,
    '.toast-shelf must declare position: fixed so the shelf anchors to the viewport corner rather than scrolling with the document. Without this, the shelf detaches during long-scroll surfaces (word bank, analytics) and floats into the middle of the page.',
  );
  // Corner anchoring: the shelf must have at least one vertical anchor
  // (top OR bottom) AND at least one horizontal anchor (left OR right)
  // so the container cannot fall back to default (0,0) placement. The
  // current design uses bottom-right — either corner is acceptable so
  // the test does not lock the visual corner, only the rooting.
  const hasVertical = /\b(?:top|bottom)\s*:\s*[^;]+;/.test(block);
  const hasHorizontal = /\b(?:left|right)\s*:\s*[^;]+;/.test(block);
  assert.ok(
    hasVertical && hasHorizontal,
    '.toast-shelf must declare at least one vertical (top/bottom) AND one horizontal (left/right) anchor so the fixed-position container is pinned to a viewport corner, not top-left default. Either corner is fine; the current design uses bottom-right.',
  );
});

test('toast shelf: z-index sits ABOVE the practice layer AND below the celebration overlay', () => {
  const shelfBlock = extractRuleBlock(css, '.toast-shelf');
  const zMatch = shelfBlock.match(/z-index\s*:\s*(-?\d+)\s*;/);
  assert.ok(
    zMatch,
    '.toast-shelf must declare z-index explicitly. A missing z-index makes stacking context depend on document order, which means any refactor that moves the shelf before a card with its own positive z-index silently sends toasts behind the card.',
  );
  const shelfZ = Number(zMatch[1]);
  assert.ok(
    shelfZ > 0,
    `.toast-shelf z-index must be > 0 so toasts sit above the default page stacking context. Got ${shelfZ}.`,
  );
  assert.ok(
    shelfZ >= 30,
    `.toast-shelf z-index must be >= 30 so toasts sit above subject-card stacking contexts (.home-overlays uses z-index: 40 and practice cards use up to z-index: 8). Got ${shelfZ}. If the shelf needs to drop below a new high-z surface, introduce that surface with z-index > shelfZ rather than lowering the shelf.`,
  );
  // The monster celebration overlay is a full-viewport dialog that MUST
  // paint on top of the toast shelf — otherwise a catch toast slides
  // in and sits over the celebration art. Lock the inequality.
  const overlayBlock = extractRuleBlock(css, '.monster-celebration-overlay');
  assert.ok(
    overlayBlock !== null,
    'expected a base .monster-celebration-overlay rule — if the overlay selector has changed, update this test to reflect the new anchor',
  );
  const overlayMatch = overlayBlock.match(/z-index\s*:\s*(-?\d+)\s*;/);
  assert.ok(
    overlayMatch,
    '.monster-celebration-overlay must declare z-index explicitly so the overlay-vs-shelf stacking is not order-dependent.',
  );
  const overlayZ = Number(overlayMatch[1]);
  assert.ok(
    overlayZ > shelfZ,
    `.monster-celebration-overlay z-index (${overlayZ}) must be strictly greater than .toast-shelf z-index (${shelfZ}). Otherwise a catch toast that fires the same frame as a celebration would paint on top of the dialog. If the overlay has legitimately moved below the shelf, update this assertion deliberately.`,
  );
});

test('toast shelf: container uses pointer-events: none so the wrapper never blocks input clicks', () => {
  // The shelf spans a narrow column at the corner but its bounding box
  // can extend up the side of the viewport when multiple toasts stack.
  // If the wrapper itself captures pointer events, a long stack could
  // eat clicks that should reach the submit button even though the
  // individual toast items are small. The individual .toast rule
  // re-enables pointer events so close/dismiss still works. This keeps
  // the practice-card submit clickable even as the shelf grows.
  const block = extractRuleBlock(css, '.toast-shelf');
  assert.match(
    block,
    /pointer-events\s*:\s*none/,
    '.toast-shelf must declare pointer-events: none on the container so the shelf bounding box never swallows clicks intended for the practice input / submit button. The individual .toast rule must re-enable pointer-events: auto so close + dismiss still work.',
  );
  const toastBlock = extractRuleBlock(css, '.toast');
  assert.ok(toastBlock !== null, 'expected a base .toast rule in styles/app.css');
  assert.match(
    toastBlock,
    /pointer-events\s*:\s*auto/,
    '.toast must declare pointer-events: auto so the individual toast items still receive clicks after the container disabled them. Without this, the dismiss close button becomes inert.',
  );
});

test('toast keyframes: slide-in + fade-out animate only transform + opacity (compositor-only)', () => {
  // Layout-triggering properties (top/left/right/bottom/width/height/
  // margin) would cause the browser to lay out the page on every frame
  // of the 200-400ms slide-in animation. Aside from the jank, they also
  // shift the toast's bounding box into and out of the submit button's
  // click area during the animation — which is the "toast covers submit"
  // regression the design doc flagged. transform + opacity run on the
  // compositor, never trigger layout, and never change the effective
  // hit-test rect.
  const keyframeNames = ['toast-slide-in', 'toast-fade-out'];
  const allowedProps = new Set(['transform', 'opacity']);
  for (const name of keyframeNames) {
    const block = extractKeyframeBlock(css, name);
    assert.ok(
      block !== null,
      `expected @keyframes ${name} to exist in styles/app.css — if the keyframe has been renamed, update this test to match the new name`,
    );
    const props = animatedProperties(block);
    const forbidden = [...props].filter((prop) => !allowedProps.has(prop));
    assert.deepEqual(
      forbidden,
      [],
      `@keyframes ${name} must animate only transform + opacity (compositor-only). Found layout-shifting properties: ${JSON.stringify(forbidden)}. If a future choreography legitimately needs to animate layout, add the property to the allowlist in this test deliberately — the default is "compositor-only" so mid-session toast animations cannot trigger page layout thrash or shift the toast bounding box across the submit button during the tween.`,
    );
    const transforms = transformValues(block);
    assert.ok(
      transforms.length > 0,
      `@keyframes ${name} must declare at least one transform frame — without it the allowlist check is vacuously true and the animation has no visual motion.`,
    );
  }
});

test('toast motion: @media (prefers-reduced-motion: reduce) carve-out disables the animation', () => {
  // The .toast rule runs animation-shorthand on every mount. Learners
  // who set `prefers-reduced-motion: reduce` MUST get a statically
  // placed toast, not the slide-in + fade-out. The current CSS handles
  // this by overriding .toast inside a top-level reduced-motion block.
  const reducedMotionBlocks = css.match(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g) || [];
  assert.ok(
    reducedMotionBlocks.length > 0,
    'styles/app.css must declare at least one `@media (prefers-reduced-motion: reduce)` block — the shell depends on the cascade to simplify motion for learners who asked for it.',
  );
  const toastOverride = reducedMotionBlocks.find((block) => /\.toast\b(?![-\w])/.test(block));
  assert.ok(
    toastOverride,
    'at least one @media (prefers-reduced-motion: reduce) block must override the .toast rule to disable its slide-in + fade-out animation. Without this, learners who asked for motion to stop still see the corner toast tween in on every notification.',
  );
  assert.match(
    toastOverride,
    /\.toast\b[^{]*\{[^}]*animation\s*:\s*none/,
    'the .toast override inside @media (prefers-reduced-motion: reduce) must set `animation: none` to cancel the slide-in + fade-out shorthand. Setting a shorter duration is not enough — the shorthand would still restart on every mount.',
  );
});

test('toast: ellipsis + max-width guard prevents long monster names from pushing the shelf off-screen', () => {
  // The toast copy column truncates long strings instead of reflowing.
  // Without the ellipsis + max-width pair, a very long monster name
  // (e.g. "Monster reached its final form — the Mega Lanternwing") can
  // push the toast container wider than the shelf's max-width, which
  // the mobile-360 baseline scenario would surface as a visual bug.
  const copyBlock = extractRuleBlock(css, '.toast .cm-title');
  assert.ok(copyBlock !== null, 'expected a base .toast .cm-title rule in styles/app.css');
  assert.match(
    copyBlock,
    /text-overflow\s*:\s*ellipsis/,
    '.toast .cm-title must declare text-overflow: ellipsis so long event titles truncate cleanly. Without it a long monster name pushes the shelf beyond its max-width and overflows the viewport on narrow phones.',
  );
  assert.match(
    copyBlock,
    /overflow\s*:\s*hidden/,
    '.toast .cm-title must declare overflow: hidden — the pair with text-overflow: ellipsis is load-bearing; ellipsis alone does nothing without hidden overflow.',
  );
  assert.match(
    copyBlock,
    /white-space\s*:\s*nowrap/,
    '.toast .cm-title must declare white-space: nowrap so the single-line ellipsis contract applies. Allowing wrap would make the toast expand vertically instead of truncating horizontally.',
  );
  const shelfBlock = extractRuleBlock(css, '.toast-shelf');
  assert.match(
    shelfBlock,
    /max-width\s*:\s*min\(\s*\d+vw\s*,\s*\d+px\s*\)/,
    '.toast-shelf must declare a viewport-bounded max-width (e.g. min(92vw, 360px)) so the shelf never spills past the screen edge on mobile-360. Without the vw bound, a 360px-wide shelf on a 360px viewport has no margin; the vw clamp guarantees a breathing gap.',
  );
});

test('parser sanity: extractRuleBlock + extractKeyframeBlock return non-empty blocks for every assertion above', () => {
  // If a future edit silently breaks the parsers (returns empty strings
  // or loses brace tracking), several assertions above become vacuously
  // true. Pin the expected block presence so a parser regression fails
  // this test, not the later assertions.
  const shelfBlock = extractRuleBlock(css, '.toast-shelf');
  assert.ok(shelfBlock && shelfBlock.length > 40, 'expected .toast-shelf block to contain at least a handful of declarations');
  const toastBlock = extractRuleBlock(css, '.toast');
  assert.ok(toastBlock && toastBlock.length > 40, 'expected .toast block to contain at least a handful of declarations');
  const slideIn = extractKeyframeBlock(css, 'toast-slide-in');
  assert.ok(slideIn && slideIn.length > 20, 'expected @keyframes toast-slide-in to contain frame declarations');
  const fadeOut = extractKeyframeBlock(css, 'toast-fade-out');
  assert.ok(fadeOut && fadeOut.length > 20, 'expected @keyframes toast-fade-out to contain frame declarations');
});
