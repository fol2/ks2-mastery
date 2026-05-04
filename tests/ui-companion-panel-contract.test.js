// U5 (ui-refactor-p3): SubjectCompanionPanel contract tests.
//
// Validates:
//   - Empty monsters/stats → emptyState text rendered
//   - Stats rendered with dl/dt/dd semantics
//   - Unknown subjectId → safe render (no crash)
//   - No mastery mutation (source check: no store imports)
//   - SectionHeader adopted (import check)
//   - 3-subject adoption gate (spelling, punctuation, grammar)
//   - No forbidden copy patterns
//
// Pattern mirrors tests/platform-setup-side-panel.test.js — esbuild +
// renderToStaticMarkup probe in a child process.

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

function renderHeader() {
  return `
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const { SubjectCompanionPanel } = require(${JSON.stringify(componentSpec)});
  `;
}

// ---------------------------------------------------------------
// Empty state: no monsters, no stats → emptyState text rendered
// ---------------------------------------------------------------

test('SubjectCompanionPanel: empty monsters and stats renders emptyState text', async () => {
  const html = await runFixture(`
    ${renderHeader()}
    const tree = React.createElement(SubjectCompanionPanel, {
      subjectId: 'spelling',
      monsters: [],
      stats: [],
      emptyState: 'Nothing here yet.',
    });
    console.log(renderToStaticMarkup(tree));
  `);
  assert.match(html, /Nothing here yet\./);
  assert.match(html, /companion-panel-empty/);
  assert.doesNotMatch(html, /<dl/);
  assert.doesNotMatch(html, /<ul/);
});

// ---------------------------------------------------------------
// Stats rendered with dl/dt/dd semantic markup
// ---------------------------------------------------------------

test('SubjectCompanionPanel: stats render as dl/dt/dd elements', async () => {
  const html = await runFixture(`
    ${renderHeader()}
    const tree = React.createElement(SubjectCompanionPanel, {
      subjectId: 'punctuation',
      monsters: [],
      stats: [
        { label: 'Due', value: '5', tone: 'warn' },
        { label: 'Secure', value: '20' },
      ],
    });
    console.log(renderToStaticMarkup(tree));
  `);
  assert.match(html, /class="ss-stat-grid"/);
  assert.match(html, /class="ss-stat-label">Due<\/div>/);
  assert.match(html, /class="ss-stat-value">5<\/div>/);
  assert.match(html, /class="ss-stat-label">Secure<\/div>/);
  assert.match(html, /class="ss-stat-value">20<\/div>/);
  assert.match(html, /ss-stat--warn/);
});

// ---------------------------------------------------------------
// Unknown subjectId → safe render (no crash)
// ---------------------------------------------------------------

test('SubjectCompanionPanel: unknown subjectId renders empty state without crash', async () => {
  const html = await runFixture(`
    ${renderHeader()}
    const tree = React.createElement(SubjectCompanionPanel, {
      subjectId: 'unknown-future-subject',
      monsters: [],
      stats: [],
      emptyState: 'Coming soon.',
    });
    console.log(renderToStaticMarkup(tree));
  `);
  assert.match(html, /data-subject="unknown-future-subject"/);
  assert.match(html, /Coming soon\./);
});

// ---------------------------------------------------------------
// Monsters render as list items
// ---------------------------------------------------------------

test('SubjectCompanionPanel: monsters render as ul/li with discovered attribute', async () => {
  const html = await runFixture(`
    ${renderHeader()}
    const tree = React.createElement(SubjectCompanionPanel, {
      subjectId: 'grammar',
      monsters: [
        { name: 'Grammox', discovered: true },
        { name: 'Syntaxon', discovered: false },
      ],
      stats: [],
    });
    console.log(renderToStaticMarkup(tree));
  `);
  assert.match(html, /<ul class="companion-panel-monster-list">/);
  assert.match(html, /<li data-discovered="true">.*?Grammox.*?<\/li>/);
  assert.match(html, /<li data-discovered="false">.*?Syntaxon.*?<\/li>/);
});

// ---------------------------------------------------------------
// No mastery mutation: source file has no store imports
// ---------------------------------------------------------------

test('SubjectCompanionPanel: source has no mastery store imports (display-only)', () => {
  const source = readFileSync(componentSpec, 'utf8');
  // Must not import from any mastery/store/reward module
  assert.doesNotMatch(source, /import.*from.*mastery/i);
  assert.doesNotMatch(source, /import.*from.*store/i);
  assert.doesNotMatch(source, /import.*from.*reward/i);
  assert.doesNotMatch(source, /import.*from.*star/i);
  assert.doesNotMatch(source, /dispatch/);
  assert.doesNotMatch(source, /mutation/i);
});

// ---------------------------------------------------------------
// SectionHeader adopted (import check)
// ---------------------------------------------------------------

test('SubjectCompanionPanel: imports SectionHeader from platform/ui', () => {
  const source = readFileSync(componentSpec, 'utf8');
  assert.match(source, /import.*SectionHeader.*from.*['"]\.\/SectionHeader/);
});

// ---------------------------------------------------------------
// 3-subject adoption gate: spelling, punctuation, grammar
// ---------------------------------------------------------------

test('SubjectCompanionPanel: adopted by all three ready subjects', () => {
  const spellingSource = readFileSync(
    path.join(rootDir, 'src/subjects/spelling/components/SpellingSetupScene.jsx'),
    'utf8',
  );
  const punctuationSource = readFileSync(
    path.join(rootDir, 'src/subjects/punctuation/components/PunctuationSetupScene.jsx'),
    'utf8',
  );
  const grammarSource = readFileSync(
    path.join(rootDir, 'src/subjects/grammar/components/GrammarSetupScene.jsx'),
    'utf8',
  );
  assert.match(spellingSource, /SubjectCompanionPanel/);
  assert.match(punctuationSource, /SubjectCompanionPanel/);
  assert.match(grammarSource, /SubjectCompanionPanel/);
});

test('P4 U5: ready-subject setup call-sites make the companion panel visible', () => {
  const subjects = [
    ['spelling', 'src/subjects/spelling/components/SpellingSetupScene.jsx'],
    ['punctuation', 'src/subjects/punctuation/components/PunctuationSetupScene.jsx'],
    ['grammar', 'src/subjects/grammar/components/GrammarSetupScene.jsx'],
  ];

  for (const [subject, relativePath] of subjects) {
    const text = readFileSync(path.join(rootDir, relativePath), 'utf8');
    assert.ok(text.includes('<SubjectCompanionPanel'), `${subject} must use SubjectCompanionPanel`);
    assert.ok(text.includes(`subjectId="${subject}"`), `${subject} must set subjectId`);
    assert.ok(
      text.includes('visible') && text.includes('SubjectCompanionPanel'),
      `${subject} setup must pass visible or an equivalent visible disclosure path`,
    );
  }
});

// ---------------------------------------------------------------
// monsterVisuals prop renders ss-meadow grid with images
// ---------------------------------------------------------------

test('SubjectCompanionPanel: monsterVisuals renders ss-meadow grid with img elements', async () => {
  const html = await runFixture(`
    ${renderHeader()}
    const tree = React.createElement(SubjectCompanionPanel, {
      subjectId: 'spelling',
      monsterVisuals: [
        { id: 'inklet', visual: { style: { '--visual-scale': '1' }, imageProps: { src: '/img/inklet.webp', width: 64, height: 64 } }, isEgg: false },
        { id: 'glimmer', visual: { style: {}, imageProps: { src: '/img/glimmer.webp', width: 64, height: 64 } }, isEgg: true },
      ],
      stats: [],
    });
    console.log(renderToStaticMarkup(tree));
  `);
  assert.match(html, /class="ss-meadow"/);
  assert.match(html, /class="ss-meadow-cell"/);
  assert.match(html, /class="ss-meadow-cell egg"/);
  assert.match(html, /class="ss-meadow-art"/);
  assert.match(html, /src="\/img\/inklet\.webp"/);
  assert.match(html, /src="\/img\/glimmer\.webp"/);
  assert.doesNotMatch(html, /companion-panel-monster-list/);
});

// ---------------------------------------------------------------
// head prop renders ss-head wrapper
// ---------------------------------------------------------------

test('SubjectCompanionPanel: head prop renders ss-head div', async () => {
  const html = await runFixture(`
    ${renderHeader()}
    const tree = React.createElement(SubjectCompanionPanel, {
      subjectId: 'spelling',
      head: React.createElement('p', { className: 'eyebrow' }, 'Where you stand'),
      monsters: [],
      stats: [{ label: 'Total', value: '50' }],
    });
    console.log(renderToStaticMarkup(tree));
  `);
  assert.match(html, /class="ss-head"/);
  assert.match(html, /Where you stand/);
  assert.doesNotMatch(html, /companion-panel-empty/);
});

// ---------------------------------------------------------------
// No forbidden copy patterns
// ---------------------------------------------------------------

test('SubjectCompanionPanel: no forbidden copy patterns in source', () => {
  const source = readFileSync(componentSpec, 'utf8');
  // No hardcoded child-facing copy that could drift from the subject layer
  assert.doesNotMatch(source, /well done/i);
  assert.doesNotMatch(source, /congratulations/i);
  assert.doesNotMatch(source, /amazing/i);
  assert.doesNotMatch(source, /fantastic/i);
});
