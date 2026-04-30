// P2 U7 (refactor-ui shared primitives): primary-CTA contract parser test.
//
// Plan: docs/plans/2026-04-29-011-refactor-ui-shared-primitives-plan.md §U7 line 568.
//
// Locks in two contracts on every surface that hosts a primary call-to-action:
//   1. Each top-level render branch (function-level `return (...)` block)
//      must contain AT MOST ONE primary CTA signature. Multiple sibling
//      primaries inside the same branch are an inadvertent hierarchy
//      collision.
//   2. No surface in the allowlist may re-introduce a raw
//      `<button className="...btn...primary...xl...">` element. The
//      shared `Button` primitive is the only legitimate way to render
//      the canonical primary CTA shape; falling back to a hand-rolled
//      class-string would silently bypass the primitive's contracts.
//
// Branched-render handling: many surfaces (`HeroQuestCard`,
// `HomeSurface`, the subject SetupScenes) return different JSX trees in
// different states. The "at most one primary per branch" rule applies
// WITHIN each branch — a surface with claiming + ready branches each
// holding a primary is fine because the branches never co-render.
//
// Primary signature: `<Button` with `variant="primary"` OR `size="xl"`,
// excluding ghost / secondary variants. Default Button render also
// resolves to primary at runtime, but by convention every intentional
// primary in this codebase carries `size="xl"` so the intent is loud
// at the call-site.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// Closed allowlist of production surfaces that host a primary CTA. New
// surfaces are added deliberately rather than discovered by accident.
const PRIMARY_CTA_SURFACES = [
  'src/surfaces/home/HomeSurface.jsx',
  'src/surfaces/home/HeroQuestCard.jsx',
  'src/subjects/grammar/components/GrammarSetupScene.jsx',
  'src/subjects/punctuation/components/PunctuationSetupScene.jsx',
  'src/subjects/spelling/components/SpellingSetupScene.jsx',
];

function stripJsComments(source) {
  const blockStripped = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return blockStripped.replace(/\/\/[^\n]*/g, '');
}

// Walk the source, isolate every `return (...)` JSX block, and return
// the JSX text inside each. Known limitations (disclosed so the
// assertion message stays truthful):
//   1. Nested `.map(() => return (...))` callbacks count as their own
//      branches alongside top-level function returns. The contract
//      "at most one primary per branch" still holds — a nested map
//      that grew two primary <Button>s would correctly fail — but
//      branch indices in the failure message do NOT track the
//      function-level vs callback-level distinction.
//   2. Top-level conditional ternaries inside one return
//      (`return (cond ? <A primary /> : <B primary />)`) become a
//      single branch containing both, which would trip the gate even
//      though only one renders. No allowlisted surface uses this
//      pattern today; refactor into separate function components if
//      the gate fires.
//   3. The parenthesis counter does not track string / template /
//      comment scopes — an unbalanced paren inside a JSX attribute
//      string would silently truncate a branch slice.
// Renamed from extractReturnBranches → extractAllReturnBranches to
// signal the limitation: every `return (` matches, not just the
// top-level function return.
function extractAllReturnBranches(source) {
  const branches = [];
  const re = /return\s*\(/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    let depth = 1;
    let i = match.index + match[0].length;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      i += 1;
    }
    if (depth === 0) {
      branches.push(source.slice(match.index + match[0].length, i - 1));
    }
  }
  return branches;
}

// Match every `<Button ...>` opening tag (single line OR multi-line),
// returning the opening tag text including the trailing `>`. The
// brace-depth tracker keeps embedded JSX in prop values
// (`endIcon={<Icon />}`) from terminating the outer tag prematurely.
function extractButtonOpenings(branchSource) {
  const openings = [];
  const re = /<Button\b/g;
  let match;
  while ((match = re.exec(branchSource)) !== null) {
    let i = match.index;
    let braceDepth = 0;
    let endIdx = -1;
    while (i < branchSource.length) {
      const ch = branchSource[i];
      if (ch === '{') braceDepth += 1;
      else if (ch === '}') braceDepth -= 1;
      else if (ch === '>' && braceDepth === 0) {
        endIdx = i;
        break;
      }
      i += 1;
    }
    if (endIdx !== -1) {
      openings.push(branchSource.slice(match.index, endIdx + 1));
    }
  }
  return openings;
}

function isPrimaryButton(openingTag) {
  if (/\bvariant\s*=\s*["']primary["']/.test(openingTag)) return true;
  if (/\bsize\s*=\s*["']xl["']/.test(openingTag)) {
    if (/\bvariant\s*=\s*["'](?!primary)/.test(openingTag)) return false;
    return true;
  }
  return false;
}

test('every primary-CTA surface renders at most one primary <Button> per `return (` literal', async () => {
  for (const relative of PRIMARY_CTA_SURFACES) {
    const source = await readFile(path.join(REPO_ROOT, relative), 'utf8');
    const stripped = stripJsComments(source);
    const branches = extractAllReturnBranches(stripped);
    assert.ok(
      branches.length >= 1,
      `${relative} must have at least one \`return (\` literal — none extracted.`,
    );
    let foundOnePrimaryBranch = false;
    branches.forEach((branchSource, idx) => {
      const openings = extractButtonOpenings(branchSource);
      const primaries = openings.filter(isPrimaryButton);
      assert.ok(
        primaries.length <= 1,
        `${relative} \`return (\` literal #${idx} renders ${primaries.length} primary <Button> elements. `
        + 'The contract is "at most one primary CTA per `return (` literal" — siblings inside one '
        + 'literal would render simultaneously. If the literal contains a top-level conditional '
        + 'ternary with two primaries (which never co-render), refactor into separate function '
        + 'components so each conditional outcome owns its own `return (`.\n'
        + `Offending tags:\n${primaries.map((tag) => `  - ${tag.replace(/\s+/g, ' ').trim()}`).join('\n')}`,
      );
      if (primaries.length === 1) foundOnePrimaryBranch = true;
    });
    assert.ok(
      foundOnePrimaryBranch,
      `${relative} must have at least one \`return (\` literal with a primary <Button>; `
      + 'the surface is in PRIMARY_CTA_SURFACES because it owns a primary CTA. '
      + 'If the surface no longer hosts a primary CTA, remove it from the allowlist deliberately.',
    );
  }
});

test('no primary-CTA surface contains a raw <button className=".*btn.*primary.*xl"> element', async () => {
  for (const relative of PRIMARY_CTA_SURFACES) {
    const source = await readFile(path.join(REPO_ROOT, relative), 'utf8');
    const stripped = stripJsComments(source);
    const tagPattern = /<button[^>]*className\s*=\s*["'][^"']*\bbtn\b[^"']*["'][^>]*>/g;
    const matches = stripped.match(tagPattern) || [];
    for (const tag of matches) {
      const className = tag.match(/className\s*=\s*["']([^"']+)["']/)?.[1] || '';
      const tokens = className.split(/\s+/);
      const hasBtn = tokens.includes('btn');
      const hasPrimary = tokens.includes('primary');
      const hasXl = tokens.includes('xl');
      if (hasBtn && hasPrimary && hasXl) {
        assert.fail(
          `${relative} contains a raw <button className="..."> with the canonical primary CTA `
          + `class triple (\`btn\` + \`primary\` + \`xl\`). Migrate to the shared <Button> primitive `
          + `at src/platform/ui/Button.jsx so the visible-label / aria-busy / locator contracts apply.\n`
          + `Offending tag: ${tag.replace(/\s+/g, ' ').trim()}`,
        );
      }
    }
  }
});

test('primary CTA surface allowlist matches the U7 plan-mandated five entries', () => {
  // Tight ratchet (===, not >=): the plan names exactly 5 surfaces.
  // A 6th surface entering the allowlist must come with a plan update,
  // not slip in via a routine refactor — `===` makes that explicit.
  assert.equal(
    PRIMARY_CTA_SURFACES.length,
    5,
    `Plan §U7 line 568 names 5 primary-CTA surfaces; got ${PRIMARY_CTA_SURFACES.length}. `
    + 'If a new surface is genuinely a primary-CTA owner, update the plan FIRST and bump '
    + 'this assertion alongside the allowlist entry.',
  );
});
