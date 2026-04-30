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

// P2 U7 (refactor-ui shared primitives): broader hex-literal ratchet.
//
// Plan: docs/plans/2026-04-29-011-refactor-ui-shared-primitives-plan.md §U7 line 569.
//
// Locks every file under the curated path glob against re-introduction
// of raw 6-char hex literals. The glob deliberately covers the
// shared-primitive surface area (`src/platform/ui/**`), the Punctuation
// setup scene (the U6 token-unification site), and the Home surface
// tree (`src/surfaces/home/**`). It excludes `PunctuationMapScene.jsx`,
// `PunctuationSessionScene.jsx`, and `PunctuationSummaryScene.jsx`
// because they still carry `#B8873F` literals and are deferred to a
// post-P2 sweep — keeping them out of the glob keeps this ratchet
// honest.
//
// Allowlist: `src/surfaces/home/data.js` is a subject-metadata fixture
// exporting `SUBJECT_DECOR` (linear-gradient accent strings keyed by
// subject id). These are content fixtures, not styling tokens — they
// are consumed by the SubjectCard render layer and intentionally live
// outside the var(--*-accent) chain. The plan §U7 line 569 explicitly
// allowlists "subject metadata fixtures" exactly because of this case.

import { readdir } from 'node:fs/promises';

const TOKEN_GLOB_DIRS = [
  path.resolve(REPO_ROOT, 'src/platform/ui'),
  path.resolve(REPO_ROOT, 'src/surfaces/home'),
];
const TOKEN_GLOB_FILES = [
  path.resolve(REPO_ROOT, 'src/subjects/punctuation/components/PunctuationSetupScene.jsx'),
  // U7 review: extend the ratchet to the other two SetupScenes in scope.
  // Grammar already passed token unification, Spelling threads accent
  // inline through Button (deferred remap noted in completion report
  // §6.2). Locking both files prevents future drift even though they
  // contain zero hex literals today.
  path.resolve(REPO_ROOT, 'src/subjects/grammar/components/GrammarSetupScene.jsx'),
  path.resolve(REPO_ROOT, 'src/subjects/spelling/components/SpellingSetupScene.jsx'),
];
// Subject-metadata fixtures: linear-gradient accent strings keyed by
// subject id, consumed as content rather than as token-driven styling.
// Adding to this allowlist requires a deliberate decision — the
// per-file justification belongs in the entry comment.
const TOKEN_ALLOWLIST = new Set([
  path.resolve(REPO_ROOT, 'src/surfaces/home/data.js'),
]);

async function collectTokenGlobFiles() {
  const collected = new Set(TOKEN_GLOB_FILES);
  for (const dir of TOKEN_GLOB_DIRS) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.js') && !entry.name.endsWith('.jsx')) continue;
      collected.add(path.join(dir, entry.name));
    }
  }
  return [...collected].filter((p) => !TOKEN_ALLOWLIST.has(p)).sort();
}

test('curated-glob hex-literal ratchet — no raw #XXXXXX literals in shared primitives or Home tree (comments stripped)', async () => {
  const files = await collectTokenGlobFiles();
  // Floor pinned close to the live count so a directory rename / file
  // disappearance lands a loud failure instead of silently weakening
  // the ratchet. Bump in a paired commit if a deliberate file move
  // shrinks the glob, mirroring the reasoning at line 81 of
  // tests/bundle-byte-budget.test.js.
  const MIN_GLOB_FILES = 25;
  assert.ok(
    files.length >= MIN_GLOB_FILES,
    `Expected ≥ ${MIN_GLOB_FILES} files under the token glob; got ${files.length}. `
    + 'A sudden drop suggests a directory move or rename — refresh TOKEN_GLOB_DIRS.',
  );
  const offences = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const stripped = stripJsComments(source);
    const lines = stripped.split('\n');
    lines.forEach((line, idx) => {
      const hexMatch = line.match(/#[0-9A-Fa-f]{6}\b/);
      if (hexMatch) {
        const relative = path.relative(REPO_ROOT, file);
        offences.push(`${relative}:${idx + 1}  ${hexMatch[0]}  ←  ${line.trim().slice(0, 100)}`);
      }
    });
  }
  assert.equal(
    offences.length,
    0,
    'Raw 6-char hex literals found in curated-glob files. Replace with a `var(--*-accent)` '
    + 'token (or, if the value is a subject-metadata fixture, add the file to TOKEN_ALLOWLIST '
    + 'with a per-entry justification). Offences:\n  - ' + offences.join('\n  - '),
  );
});

// Note: the completion-report wording guard (plan §574 "no forbidden
// claims") lives in `tests/ui-completion-report-claims.test.js` —
// extracted from this file so `ui-token-contract` stays focused on
// CSS-variable plumbing and hex-literal ratchets.
