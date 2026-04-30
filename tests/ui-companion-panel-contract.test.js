// P3 U5: SubjectCompanionPanel contract test.
//
// Verifies the shared companion panel primitive renders correctly and
// meets the 3-adopter gate (Spelling, Punctuation, Grammar all import).
//
// Test harness: bundles a small probe entry through esbuild, invokes
// `renderToStaticMarkup` in a child Node process, and asserts on the
// emitted HTML. Pattern mirrors `tests/platform-setup-side-panel.test.js`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const componentSpec = path.join(rootDir, 'src/platform/ui/SubjectCompanionPanel.jsx');

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
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-companion-panel-'));
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
    const { SubjectCompanionPanel } = require(${JSON.stringify(spec)});
  `;
}

// ---------------------------------------------------------------
// 1. Empty monsters renders emptyState message
// ---------------------------------------------------------------

test('SubjectCompanionPanel: empty monsters array renders emptyState message', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(SubjectCompanionPanel, {
      subjectId: 'spelling',
      learnerName: 'Alex',
      monsters: [],
      stats: [],
      emptyState: 'Catch your first creature to see companions here.',
    });
    console.log(renderToStaticMarkup(tree));
  `);
  assert.match(html, /Catch your first creature to see companions here\./);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  // No monster grid rendered
  assert.doesNotMatch(html, /companion-monster-grid/);
});

// ---------------------------------------------------------------
// 2. Stats rendered with semantic dl/dt/dd
// ---------------------------------------------------------------

test('SubjectCompanionPanel: stats rendered with semantic dl/dt/dd markup', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(SubjectCompanionPanel, {
      subjectId: 'grammar',
      monsters: [],
      stats: [
        { label: 'Due', value: '5', tone: 'warn' },
        { label: 'Secure', value: '12', tone: '' },
      ],
    });
    console.log(renderToStaticMarkup(tree));
  `);
  assert.match(html, /<dl class="companion-stats-list">/);
  assert.match(html, /<dt>Due<\/dt>/);
  assert.match(html, /<dd>5<\/dd>/);
  assert.match(html, /<dt>Secure<\/dt>/);
  assert.match(html, /<dd>12<\/dd>/);
  // Tone modifier class applied
  assert.match(html, /companion-stat--warn/);
});

// ---------------------------------------------------------------
// 3. Unknown subjectId renders empty state without crash
// ---------------------------------------------------------------

test('SubjectCompanionPanel: unknown subjectId renders without crash', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(SubjectCompanionPanel, {
      subjectId: 'reading',
      monsters: [],
      stats: [],
      emptyState: 'Coming soon.',
    });
    console.log(renderToStaticMarkup(tree));
  `);
  assert.match(html, /data-subject="reading"/);
  assert.match(html, /Coming soon\./);
  // Renders valid HTML without throw
  assert.match(html, /<section/);
});

test('SubjectCompanionPanel: completely unknown subjectId renders data-subject="unknown"', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(SubjectCompanionPanel, {
      subjectId: '',
      monsters: [],
      stats: [],
    });
    console.log(renderToStaticMarkup(tree));
  `);
  assert.match(html, /data-subject="unknown"/);
});

// ---------------------------------------------------------------
// 4. No subject mastery mutation (display-only assertion)
// ---------------------------------------------------------------

test('SubjectCompanionPanel: no store imports — component source contains no mastery/store imports', () => {
  const source = readFileSync(componentSpec, 'utf8');
  // Must not import any store, repository, or service modules
  assert.doesNotMatch(source, /import.*from.*store/i);
  assert.doesNotMatch(source, /import.*from.*repository/i);
  assert.doesNotMatch(source, /import.*from.*service/i);
  assert.doesNotMatch(source, /import.*from.*mastery/i);
  assert.doesNotMatch(source, /import.*from.*reward/i);
  // Must not call any mutation-like functions
  assert.doesNotMatch(source, /\.write\(/);
  assert.doesNotMatch(source, /\.dispatch\(/);
  assert.doesNotMatch(source, /\.mutate\(/);
  assert.doesNotMatch(source, /\.update\(/);
});

// ---------------------------------------------------------------
// 5. Mobile 360px layout — source check for responsive patterns
// ---------------------------------------------------------------

test('SubjectCompanionPanel: no fixed widths that would overflow at 360px', () => {
  const source = readFileSync(componentSpec, 'utf8');
  // Must not contain inline width styles wider than 360px
  assert.doesNotMatch(source, /width:\s*[4-9]\d{2,}px/);
  assert.doesNotMatch(source, /min-width:\s*[4-9]\d{2,}px/);
  // Must not use overflow-x: scroll or horizontal scroll patterns inline
  assert.doesNotMatch(source, /overflow-x:\s*scroll/);
  // Must not use flex-direction: row that would break on narrow viewports
  // (the component uses vertical stacking by default via class-driven layout)
  assert.doesNotMatch(source, /style=.*flex-direction.*row/);
});

// ---------------------------------------------------------------
// 6. SectionHeader adopted (import verified)
// ---------------------------------------------------------------

test('SubjectCompanionPanel: imports SectionHeader from platform/ui', () => {
  const source = readFileSync(componentSpec, 'utf8');
  assert.match(source, /import\s*\{[^}]*SectionHeader[^}]*\}\s*from\s*['"]\.\/SectionHeader\.jsx['"]/);
});

// ---------------------------------------------------------------
// 7. No forbidden copy patterns
// ---------------------------------------------------------------

test('SubjectCompanionPanel: no forbidden copy patterns in source', () => {
  const source = readFileSync(componentSpec, 'utf8');
  // Forbidden patterns from the plan: must not claim mastery or inflate
  assert.doesNotMatch(source, /you('|')ve mastered/i);
  assert.doesNotMatch(source, /well done/i);
  assert.doesNotMatch(source, /congratulations/i);
  assert.doesNotMatch(source, /fantastic/i);
  assert.doesNotMatch(source, /amazing/i);
  assert.doesNotMatch(source, /brilliant/i);
});

// ---------------------------------------------------------------
// 8. Monster images have alt text or aria-hidden
// ---------------------------------------------------------------

test('SubjectCompanionPanel: monster images carry alt text or aria-hidden', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(SubjectCompanionPanel, {
      subjectId: 'spelling',
      monsters: [
        { name: 'Phaeton', imageUrl: '/img/phaeton.webp', discovered: true },
        { name: '', imageUrl: '/img/unknown.webp', discovered: true },
      ],
      stats: [],
    });
    console.log(renderToStaticMarkup(tree));
  `);
  // Named monster gets descriptive alt
  assert.match(html, /alt="Phaeton companion"/);
  // Unnamed monster gets aria-hidden
  assert.match(html, /aria-hidden="true"/);
});

// ---------------------------------------------------------------
// 9. 3-subject adoption gate (all 3 setups import SubjectCompanionPanel)
// ---------------------------------------------------------------

test('SubjectCompanionPanel: 3-subject adoption gate — Spelling imports SubjectCompanionPanel', () => {
  const spellingSetup = readFileSync(
    path.join(rootDir, 'src/subjects/spelling/components/SpellingSetupScene.jsx'),
    'utf8',
  );
  assert.match(spellingSetup, /import\s*\{[^}]*SubjectCompanionPanel[^}]*\}\s*from/);
});

test('SubjectCompanionPanel: 3-subject adoption gate — Punctuation imports SubjectCompanionPanel', () => {
  const punctuationSetup = readFileSync(
    path.join(rootDir, 'src/subjects/punctuation/components/PunctuationSetupScene.jsx'),
    'utf8',
  );
  assert.match(punctuationSetup, /import\s*\{[^}]*SubjectCompanionPanel[^}]*\}\s*from/);
});

test('SubjectCompanionPanel: 3-subject adoption gate — Grammar imports SubjectCompanionPanel', () => {
  const grammarSetup = readFileSync(
    path.join(rootDir, 'src/subjects/grammar/components/GrammarSetupScene.jsx'),
    'utf8',
  );
  assert.match(grammarSetup, /import\s*\{[^}]*SubjectCompanionPanel[^}]*\}\s*from/);
});

// ---------------------------------------------------------------
// 10. Monsters with discovered: false are not rendered in the grid
// ---------------------------------------------------------------

test('SubjectCompanionPanel: undiscovered monsters are excluded from the grid', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(SubjectCompanionPanel, {
      subjectId: 'punctuation',
      monsters: [
        { name: 'Bellstorm', imageUrl: '/img/b.webp', discovered: true },
        { name: 'Hidden', imageUrl: '/img/h.webp', discovered: false },
      ],
      stats: [],
    });
    console.log(renderToStaticMarkup(tree));
  `);
  assert.match(html, /companion-monster-grid/);
  assert.match(html, /data-monster-name="Bellstorm"/);
  assert.doesNotMatch(html, /data-monster-name="Hidden"/);
});

// ---------------------------------------------------------------
// 11. SectionHeader renders in the output HTML
// ---------------------------------------------------------------

test('SubjectCompanionPanel: SectionHeader renders section-header class in output', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(SubjectCompanionPanel, {
      subjectId: 'grammar',
      monsters: [{ name: 'Glyph', imageUrl: '/img/g.webp', discovered: true }],
      stats: [{ label: 'Secure', value: '10', tone: '' }],
      nextFocus: 'Review verb forms.',
    });
    console.log(renderToStaticMarkup(tree));
  `);
  // SectionHeader renders with .section-header class
  assert.match(html, /class="section-header"/);
  // The "Your companions" title appears
  assert.match(html, /Your companions/);
  // The "At a glance" section header
  assert.match(html, /At a glance/);
  // The "Next focus" section header
  assert.match(html, /Next focus/);
  // The next focus text
  assert.match(html, /Review verb forms\./);
});
