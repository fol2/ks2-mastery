// P2-U6 (refactor-ui shared primitives): UI token-contract parser tests.
//
// Plan: docs/plans/2026-04-29-011-refactor-ui-shared-primitives-plan.md §U6.
//
// Locks the Punctuation accent-token contract so a later refactor cannot
// silently re-introduce raw `#B8873F` literals into PunctuationSetupScene
// or strip the CSS-variable scaffolding that `:where(.punctuation-surface, …)`
// relies on. The Punctuation accent block in `styles/app.css` mirrors the
// Grammar accent block (`--grammar-accent` family + `:where(.grammar-…)`
// remap) so subject-accent tokens stay consistent across surfaces.
//
// Scope-limited on purpose: only PunctuationSetupScene is asserted clean
// here. PunctuationMapScene / PunctuationSessionScene / PunctuationSummaryScene
// still carry inline `#B8873F` literals and are scheduled for a later
// whole-repo purge (see plan §U6 Out-of-scope).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const APP_CSS_PATH = path.resolve(REPO_ROOT, 'styles/app.css');
const PUNCTUATION_SETUP_SCENE_PATH = path.resolve(
  REPO_ROOT,
  'src/subjects/punctuation/components/PunctuationSetupScene.jsx',
);

// Strip JS-style `// line` and `/* block */` comments so the assertion
// only inspects executable JSX. The existing comment block at lines
// ~334-339 in PunctuationSetupScene mentions `#B8873F` for archival
// context — that is informative, not load-bearing, and must NOT block
// the ratchet from going clean.
function stripJsComments(source) {
  const blockStripped = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return blockStripped.replace(/\/\/[^\n]*/g, '');
}

test('styles/app.css declares --punctuation-accent in light mode', async () => {
  const css = await readFile(APP_CSS_PATH, 'utf8');
  // Sibling tokens (-ink / -soft / -border) are deferred until the PR
  // that introduces the first consumer — declaring them now would lock
  // speculative names against future cleanup. See plan §U6.
  assert.match(css, /--punctuation-accent\s*:\s*#B8873F\b/i,
    '--punctuation-accent must be declared with the canonical Bellstorm gold #B8873F');
});

test('styles/app.css declares a dark-mode --punctuation-accent variant', async () => {
  const css = await readFile(APP_CSS_PATH, 'utf8');
  // The dark-mode block must be scoped under `:root[data-theme="dark"]`
  // (Grammar pattern at L11870) and must override --punctuation-accent.
  // We assert the token name appears within ~600 bytes after the
  // `:root[data-theme="dark"]` selector that mentions a `.punctuation-…`
  // class — keeps the regex anchored without becoming brittle.
  const darkBlockPattern = /:root\[data-theme="dark"\][^{]*\.punctuation-[^{]*\{[^}]*--punctuation-accent\s*:/;
  assert.match(css, darkBlockPattern,
    'Dark-mode override must redeclare --punctuation-accent under :root[data-theme="dark"] '
    + '(see Grammar pattern at styles/app.css:11870-11880)');
});

test('styles/app.css remaps --punctuation-accent onto --accent / --btn-accent / --card-accent / --subject-accent', async () => {
  const css = await readFile(APP_CSS_PATH, 'utf8');
  // The remap mirrors the Grammar pattern at line 11899-11902:
  //   .grammar-setup-main { --accent: var(--grammar-accent, var(--brand)); … }
  // For Punctuation we use a `:where(...)` selector list that pins all
  // four stable Punctuation outer classes so the token chain reaches
  // every Punctuation surface without raising specificity.
  assert.match(
    css,
    /:where\([^)]*\.punctuation-surface[^)]*\)\s*\{[^}]*--accent\s*:\s*var\(\s*--punctuation-accent/,
    ':where(...)-scoped block must expose --punctuation-accent as --accent on .punctuation-surface',
  );
  assert.match(
    css,
    /:where\([^)]*\.punctuation-surface[^)]*\)\s*\{[^}]*--btn-accent\s*:\s*var\(\s*--punctuation-accent/,
    ':where(...)-scoped block must expose --punctuation-accent as --btn-accent',
  );
  assert.match(
    css,
    /:where\([^)]*\.punctuation-surface[^)]*\)\s*\{[^}]*--card-accent\s*:\s*var\(\s*--punctuation-accent/,
    ':where(...)-scoped block must expose --punctuation-accent as --card-accent so .card.border-top can read it',
  );
  assert.match(
    css,
    /:where\([^)]*\.punctuation-surface[^)]*\)\s*\{[^}]*--subject-accent\s*:\s*var\(\s*--punctuation-accent/,
    ':where(...)-scoped block must expose --punctuation-accent as --subject-accent '
    + '(consumed by ProgressMeter fill at styles/app.css:13354)',
  );
});

test('canonical .card.border-top reads var(--card-accent) — closes the colour-resolution loop', async () => {
  // This is the consumer side of the --card-accent contract: any
  // subject-scoped remap that exposes --card-accent (Punctuation today,
  // future subjects later) drives the border ribbon automatically. The
  // fallback is `currentColor` so subjects without a remap retain the
  // pre-token default (no visible border colour beyond inherited ink).
  // Lock the canonical rule so a future "cleanup" cannot drop the line.
  const css = await readFile(APP_CSS_PATH, 'utf8');
  assert.match(
    css,
    /\.card\.border-top\s*\{[^}]*border-top-color\s*:\s*var\(\s*--card-accent\s*,\s*currentColor\s*\)/,
    '.card.border-top must read var(--card-accent, currentColor) so subject remaps drive the ribbon',
  );
});

test('PunctuationSetupScene.jsx contains zero raw #B8873F literals (comments stripped)', async () => {
  const source = await readFile(PUNCTUATION_SETUP_SCENE_PATH, 'utf8');
  const stripped = stripJsComments(source);
  assert.equal(
    /#B8873F/i.test(stripped),
    false,
    'PunctuationSetupScene executable code must not carry any raw #B8873F literal — '
    + 'the colour now flows via var(--punctuation-accent) through the .punctuation-surface scope.',
  );
});

test('PunctuationSetupScene.jsx preserves stable journey-spec data-* selectors', async () => {
  const source = await readFile(PUNCTUATION_SETUP_SCENE_PATH, 'utf8');
  // A small, deliberate allowlist of selectors that journey specs +
  // telemetry tests pin against. Renaming any of these is a contract
  // break that needs its own RFC, not a quiet token-refactor PR.
  const stableSelectors = [
    'data-punctuation-phase="setup"',
    'data-punctuation-cta',
    'data-section="hero"',
    'data-section="progress-row"',
    'data-section="monster-row"',
    'data-section="map-link"',
    'data-section="secondary"',
    'data-action="punctuation-start"',
    'data-action="punctuation-open-map"',
  ];
  for (const selector of stableSelectors) {
    assert.ok(
      source.includes(selector),
      `Stable selector "${selector}" missing from PunctuationSetupScene — `
      + 'journey-spec / telemetry tests rely on it. Restore the attribute or open a contract-change RFC.',
    );
  }
});
