// U2 (refactor ui-consolidation): platform `HeroWelcome` + `heroWelcomeLine`
// characterisation tests.
//
// The helper lives at `src/platform/ui/hero-copy.js` and the component at
// `src/platform/ui/HeroWelcome.jsx`. Grammar (`GrammarSetupScene`) and
// Punctuation (`PunctuationSetupScene`) both consume `HeroWelcome`; both
// used to render the same inline "Hi {name} — ready for a short round?"
// line. The extraction centralises:
//   - The copy string and its em-dash (U+2014).
//   - The null-when-name-absent rule (no orphan "Hi  — ready for a
//     short round?" and no "Hi friend" fallback).
//   - The className passthrough (preserves `.grammar-hero-welcome` and
//     `.punctuation-hero-welcome` subject-namespaced CSS hooks).
//
// Test harness mirrors `tests/platform-length-picker.test.js`: bundles
// a probe entry through esbuild, runs renderToStaticMarkup in a child
// Node process, and asserts on the emitted HTML. The pure helper is
// also tested directly (no React needed for the string contract).

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

import { heroWelcomeLine } from '../src/platform/ui/hero-copy.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const componentSpec = path.join(rootDir, 'src/platform/ui/HeroWelcome.jsx');

function nodePaths() {
  return [
    path.join(rootDir, 'node_modules'),
    ...String(process.env.NODE_PATH || '').split(path.delimiter),
  ].filter((entry) => entry && existsSync(entry));
}

function normaliseLineEndings(value) {
  return String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

async function runFixture(entrySource) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-hero-welcome-'));
  const entryPath = path.join(tmpDir, 'entry.jsx');
  const bundlePath = path.join(tmpDir, 'entry.cjs');
  try {
    await writeFile(entryPath, entrySource);
    await build({
      absWorkingDir: rootDir,
      entryPoints: [entryPath],
      outfile: bundlePath,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: ['node24'],
      jsx: 'automatic',
      jsxImportSource: 'react',
      loader: { '.js': 'jsx' },
      nodePaths: nodePaths(),
      logLevel: 'silent',
    });
    const output = execFileSync(process.execPath, [bundlePath], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return normaliseLineEndings(output).replace(/\n+$/, '');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

function renderHeader(spec) {
  return `
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const { HeroWelcome } = require(${JSON.stringify(spec)});
  `;
}

// ---------------------------------------------------------------
// Pure helper: heroWelcomeLine(name)
// ---------------------------------------------------------------
//
// The string helper is pure and synchronous — it needs no React tree,
// so it runs inline in this test process rather than through the
// esbuild bundler harness.

test('heroWelcomeLine: returns "Hi <name> — ready for a short round?" for a plain name', () => {
  assert.equal(heroWelcomeLine('James'), 'Hi James — ready for a short round?');
});

test('heroWelcomeLine: returns "" for empty string', () => {
  assert.equal(heroWelcomeLine(''), '');
});

test('heroWelcomeLine: returns "" for whitespace-only string', () => {
  assert.equal(heroWelcomeLine('  '), '');
  assert.equal(heroWelcomeLine('\t'), '');
  assert.equal(heroWelcomeLine('\n'), '');
});

test('heroWelcomeLine: returns "" for null and undefined', () => {
  assert.equal(heroWelcomeLine(null), '');
  assert.equal(heroWelcomeLine(undefined), '');
});

test('heroWelcomeLine: returns "" for non-string inputs (numbers, objects, booleans)', () => {
  // Defensive: the callers pass user-entered strings, but the helper's
  // typeof guard protects against accidental numeric IDs or objects.
  assert.equal(heroWelcomeLine(42), '');
  assert.equal(heroWelcomeLine({}), '');
  assert.equal(heroWelcomeLine(true), '');
  assert.equal(heroWelcomeLine(false), '');
});

test('heroWelcomeLine: trims leading/trailing whitespace before interpolation', () => {
  assert.equal(heroWelcomeLine('  Ava  '), 'Hi Ava — ready for a short round?');
  assert.equal(heroWelcomeLine('\tSam\n'), 'Hi Sam — ready for a short round?');
});

test('heroWelcomeLine: uses em-dash (U+2014), not en-dash (U+2013) or ASCII hyphen', () => {
  // Characterisation pin — CSS / typography elsewhere assumes the em-dash
  // glyph spacing, and the inline Grammar/Punctuation sources were both
  // confirmed as U+2014 prior to extraction. A refactor to U+2013 or "-"
  // would silently change the rendered typography on both subjects.
  const line = heroWelcomeLine('James');
  assert.ok(line.includes('—'), 'line must contain U+2014 em-dash');
  assert.ok(!line.includes('–'), 'line must NOT contain U+2013 en-dash');
  // Space-around: "Hi James — ready" has a single space on each side of
  // the dash; pin the exact sequence.
  assert.ok(line.includes(' — '), 'em-dash must be surrounded by single spaces');
});

// ---------------------------------------------------------------
// Component: <HeroWelcome name="..." />
// ---------------------------------------------------------------

test('HeroWelcome: renders <p> with the line for a plain name (no className → no class attribute)', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(HeroWelcome, { name: 'James' });
    console.log(renderToStaticMarkup(tree));
  `);
  // No className passed → rendered <p> carries no `class` attribute.
  assert.equal(html, '<p>Hi James — ready for a short round?</p>');
});

test('HeroWelcome: renders null for empty string name', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(HeroWelcome, { name: '' });
    console.log(renderToStaticMarkup(tree));
  `);
  // renderToStaticMarkup returns "" when the tree is null.
  assert.equal(html, '');
});

test('HeroWelcome: renders null for whitespace-only name', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(HeroWelcome, { name: '   ' });
    console.log(renderToStaticMarkup(tree));
  `);
  assert.equal(html, '');
});

test('HeroWelcome: renders null for undefined name (no `name` prop passed)', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(HeroWelcome, {});
    console.log(renderToStaticMarkup(tree));
  `);
  assert.equal(html, '');
});

test('HeroWelcome: renders null for null name', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(HeroWelcome, { name: null });
    console.log(renderToStaticMarkup(tree));
  `);
  assert.equal(html, '');
});

test('HeroWelcome: className="grammar-hero-welcome" threads onto the <p> (Grammar parity)', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(HeroWelcome, {
      name: 'James',
      className: 'grammar-hero-welcome',
    });
    console.log(renderToStaticMarkup(tree));
  `);
  assert.equal(html, '<p class="grammar-hero-welcome">Hi James — ready for a short round?</p>');
});

test('HeroWelcome: className="punctuation-hero-welcome" threads onto the <p> (Punctuation parity)', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(HeroWelcome, {
      name: 'James',
      className: 'punctuation-hero-welcome',
    });
    console.log(renderToStaticMarkup(tree));
  `);
  assert.equal(html, '<p class="punctuation-hero-welcome">Hi James — ready for a short round?</p>');
});

test('HeroWelcome: empty-string className collapses to no class attribute (not class="")', async () => {
  // Characterisation: the component uses `className || undefined` so an
  // empty-string className is NOT rendered as `class=""` on the `<p>`.
  // If someone "simplifies" to `className={className}` directly, React
  // would serialise `class=""` (an empty attribute) — this test locks
  // the attribute-absent output.
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(HeroWelcome, {
      name: 'James',
      className: '',
    });
    console.log(renderToStaticMarkup(tree));
  `);
  assert.equal(html, '<p>Hi James — ready for a short round?</p>');
  assert.doesNotMatch(html, /class=""/);
});

test('HeroWelcome: trims a name with surrounding whitespace before interpolation', async () => {
  // Composition with the pure helper — the rendered line matches
  // heroWelcomeLine('  Ava  ') exactly.
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(HeroWelcome, {
      name: '  Ava  ',
      className: 'grammar-hero-welcome',
    });
    console.log(renderToStaticMarkup(tree));
  `);
  assert.equal(html, '<p class="grammar-hero-welcome">Hi Ava — ready for a short round?</p>');
});
