// U3 (refactor ui-consolidation): platform `SetupSidePanel`
// characterisation tests.
//
// The component lives at `src/platform/ui/SetupSidePanel.jsx`. Spelling
// and Grammar setup scenes both consume it; Punctuation does NOT adopt
// this pass (see plan R3). The DOM + class rhythm MUST stay
// byte-identical to the prior inline <aside class="setup-side"><div
// class="ss-card">…</div></aside> trees so existing `.ss-card`,
// `.ss-head`, `.ss-bank-link`, `.grammar-setup-sidebar*` selectors, and
// Playwright / surface test locators all still resolve.
//
// Test harness: bundles a small probe entry through esbuild, invokes
// `renderToStaticMarkup` in a child Node process, and asserts on the
// emitted HTML. Pattern mirrors `tests/platform-length-picker.test.js`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const componentSpec = path.join(rootDir, 'src/platform/ui/SetupSidePanel.jsx');

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
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-setup-side-panel-'));
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
    const { SetupSidePanel } = require(${JSON.stringify(spec)});
  `;
}

// ---------------------------------------------------------------
// Happy path: all three slots populated.
// ---------------------------------------------------------------

test('SetupSidePanel: renders aside > card > head + body + footer when all three slots populated (Spelling-shape defaults)', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(SetupSidePanel, {
      head: React.createElement('p', { className: 'eyebrow' }, 'Where you stand'),
      body: React.createElement('div', { className: 'body-content' }, 'body'),
      footer: React.createElement('button', { className: 'ss-bank-link' }, 'Browse'),
    });
    console.log(renderToStaticMarkup(tree));
  `);
  // Outer <aside> carries only .setup-side with no extra class and no aria-label.
  assert.match(html, /^<aside class="setup-side">/);
  assert.doesNotMatch(html, /aria-label=/);
  // Inner card is the bare .ss-card (default Spelling shape).
  assert.match(html, /<div class="ss-card">/);
  // Head renders inside a <div class="ss-head"> — `headTag` default is 'div'.
  assert.match(html, /<div class="ss-head"><p class="eyebrow">Where you stand<\/p><\/div>/);
  // Body + footer render bare after the head.
  assert.match(html, /<div class="body-content">body<\/div>/);
  assert.match(html, /<button class="ss-bank-link">Browse<\/button>/);
  // Closure.
  assert.match(html, /<\/div><\/aside>$/);
});

// ---------------------------------------------------------------
// Happy path: only `body` slot — no head, no footer.
// ---------------------------------------------------------------

test('SetupSidePanel: body-only renders no .ss-head row and no footer node', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(SetupSidePanel, {
      body: React.createElement('div', { className: 'body-only' }, 'body-only'),
    });
    console.log(renderToStaticMarkup(tree));
  `);
  // No .ss-head anywhere.
  assert.doesNotMatch(html, /ss-head/);
  // Card contains only the body child.
  assert.match(html, /<div class="ss-card"><div class="body-only">body-only<\/div><\/div>/);
  // Closure reflects only aside > card > body.
  assert.match(html, /<\/aside>$/);
});

// ---------------------------------------------------------------
// Grammar-shape: aside + card + head class append, plus ariaLabel + headTag='header'.
// ---------------------------------------------------------------

test('SetupSidePanel: asideClassName / cardClassName / headClassName append with single space separators (Grammar shape)', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(SetupSidePanel, {
      asideClassName: 'grammar-setup-sidebar',
      cardClassName: 'grammar-setup-sidebar-card',
      headClassName: 'grammar-setup-sidebar-head',
      headTag: 'header',
      ariaLabel: 'Where you stand',
      head: React.createElement('p', { className: 'eyebrow' }, 'Where you stand'),
      body: React.createElement('section', { className: 'grammar-monster-strip' }, 'monsters'),
      footer: React.createElement('button', { className: 'ss-bank-link grammar-setup-sidebar-bank-link' }, 'Bank'),
    });
    console.log(renderToStaticMarkup(tree));
  `);
  // aside class = exactly "setup-side grammar-setup-sidebar" (single space).
  assert.match(html, /<aside class="setup-side grammar-setup-sidebar" aria-label="Where you stand">/);
  // card class = "ss-card grammar-setup-sidebar-card".
  assert.match(html, /<div class="ss-card grammar-setup-sidebar-card">/);
  // head renders as <header> (not <div>), class composed.
  assert.match(html, /<header class="ss-head grammar-setup-sidebar-head"><p class="eyebrow">Where you stand<\/p><\/header>/);
  // Body + footer still render bare.
  assert.match(html, /<section class="grammar-monster-strip">monsters<\/section>/);
  assert.match(html, /<button class="ss-bank-link grammar-setup-sidebar-bank-link">Bank<\/button>/);
  // Negative: no doubled spaces, no missing separator.
  assert.doesNotMatch(html, /class="setup-sidegrammar-/);
  assert.doesNotMatch(html, /class="setup-side {2,}grammar-/);
  assert.doesNotMatch(html, /class="ss-cardgrammar-/);
  assert.doesNotMatch(html, /class="ss-headgrammar-/);
});

// ---------------------------------------------------------------
// headTag toggle: 'header' vs 'div' vs default.
// ---------------------------------------------------------------

test('SetupSidePanel: headTag="header" renders a <header> element for the head row', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(SetupSidePanel, {
      headTag: 'header',
      head: React.createElement('span', null, 'head-text'),
      body: React.createElement('div', null, 'body'),
    });
    console.log(renderToStaticMarkup(tree));
  `);
  assert.match(html, /<header class="ss-head"><span>head-text<\/span><\/header>/);
  assert.doesNotMatch(html, /<div class="ss-head"/);
});

test('SetupSidePanel: headTag="div" renders a <div> element for the head row', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(SetupSidePanel, {
      headTag: 'div',
      head: React.createElement('span', null, 'head-text'),
      body: React.createElement('div', null, 'body'),
    });
    console.log(renderToStaticMarkup(tree));
  `);
  assert.match(html, /<div class="ss-head"><span>head-text<\/span><\/div>/);
  assert.doesNotMatch(html, /<header class="ss-head"/);
});

test('SetupSidePanel: headTag default (omitted) renders a <div> — preserves Spelling DOM', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(SetupSidePanel, {
      head: React.createElement('span', null, 'head-text'),
      body: React.createElement('div', null, 'body'),
    });
    console.log(renderToStaticMarkup(tree));
  `);
  assert.match(html, /<div class="ss-head"><span>head-text<\/span><\/div>/);
  assert.doesNotMatch(html, /<header class="ss-head"/);
});

// ---------------------------------------------------------------
// ariaLabel: threads to <aside aria-label=...>; absent omits attr.
// ---------------------------------------------------------------

test('SetupSidePanel: ariaLabel threads to the <aside aria-label> attribute', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(SetupSidePanel, {
      ariaLabel: 'Where you stand',
      body: React.createElement('div', null, 'body'),
    });
    console.log(renderToStaticMarkup(tree));
  `);
  assert.match(html, /<aside class="setup-side" aria-label="Where you stand">/);
});

test('SetupSidePanel: empty/omitted ariaLabel omits the aria-label attribute', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(SetupSidePanel, {
      body: React.createElement('div', null, 'body'),
    });
    console.log(renderToStaticMarkup(tree));
  `);
  assert.doesNotMatch(html, /aria-label=/);
  assert.match(html, /<aside class="setup-side">/);
});

// ---------------------------------------------------------------
// Edge case: head=null + footer=null still renders card chrome + body.
// ---------------------------------------------------------------

test('SetupSidePanel: head=null + footer=null still renders card chrome and body only', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(SetupSidePanel, {
      head: null,
      footer: null,
      body: React.createElement('div', { className: 'body' }, 'just-body'),
    });
    console.log(renderToStaticMarkup(tree));
  `);
  // Outer chrome still wraps the body.
  assert.match(html, /^<aside class="setup-side"><div class="ss-card"><div class="body">just-body<\/div><\/div><\/aside>$/);
  // No ss-head, no extra sibling.
  assert.doesNotMatch(html, /ss-head/);
});

// ---------------------------------------------------------------
// Edge case: head explicitly undefined behaves the same as null.
// ---------------------------------------------------------------

test('SetupSidePanel: head=undefined behaves like head=null (no head row rendered)', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(SetupSidePanel, {
      head: undefined,
      body: React.createElement('div', null, 'body'),
    });
    console.log(renderToStaticMarkup(tree));
  `);
  assert.doesNotMatch(html, /ss-head/);
  assert.match(html, /<aside class="setup-side"><div class="ss-card"><div>body<\/div><\/div><\/aside>/);
});

// ---------------------------------------------------------------
// Characterisation: a complex nested body subtree passes through
// unchanged (Grammar-shape monster strip + today cards).
// ---------------------------------------------------------------

test('SetupSidePanel: complex nested body subtree passes through byte-identical', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const body = React.createElement(
      React.Fragment,
      null,
      React.createElement(
        'section',
        { className: 'grammar-monster-strip', 'aria-label': 'Your Grammar creatures' },
        React.createElement('div', { className: 'grammar-monster-strip-entry', key: 'a' }, 'A'),
        React.createElement('div', { className: 'grammar-monster-strip-entry', key: 'b' }, 'B'),
        React.createElement('p', { className: 'grammar-monster-strip-hint' }, 'Hint line'),
      ),
      React.createElement(
        'section',
        { className: 'grammar-today', 'aria-label': 'Today at a glance' },
        React.createElement(
          'div',
          { className: 'grammar-today-grid' },
          React.createElement('div', { className: 'grammar-today-card', 'data-today-id': 't1' }, 'card1'),
        ),
      ),
    );
    const tree = React.createElement(SetupSidePanel, {
      asideClassName: 'grammar-setup-sidebar',
      cardClassName: 'grammar-setup-sidebar-card',
      headClassName: 'grammar-setup-sidebar-head',
      headTag: 'header',
      ariaLabel: 'Where you stand',
      head: React.createElement('p', { className: 'eyebrow' }, 'Where you stand'),
      body,
      footer: React.createElement('button', { className: 'ss-bank-link grammar-setup-sidebar-bank-link' }, 'Bank'),
    });
    console.log(renderToStaticMarkup(tree));
  `);
  // Byte-identical expected shell.
  assert.match(html, /^<aside class="setup-side grammar-setup-sidebar" aria-label="Where you stand"><div class="ss-card grammar-setup-sidebar-card"><header class="ss-head grammar-setup-sidebar-head"><p class="eyebrow">Where you stand<\/p><\/header>/);
  // Monster strip section intact.
  assert.match(html, /<section class="grammar-monster-strip" aria-label="Your Grammar creatures"><div class="grammar-monster-strip-entry">A<\/div><div class="grammar-monster-strip-entry">B<\/div><p class="grammar-monster-strip-hint">Hint line<\/p><\/section>/);
  // Today section intact.
  assert.match(html, /<section class="grammar-today" aria-label="Today at a glance"><div class="grammar-today-grid"><div class="grammar-today-card" data-today-id="t1">card1<\/div><\/div><\/section>/);
  // Footer intact.
  assert.match(html, /<button class="ss-bank-link grammar-setup-sidebar-bank-link">Bank<\/button><\/div><\/aside>$/);
});

// ---------------------------------------------------------------
// Child ordering: head always precedes body, body always precedes footer.
// ---------------------------------------------------------------

test('SetupSidePanel: slot ordering is strictly head → body → footer inside the card', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(SetupSidePanel, {
      head: React.createElement('p', { className: 'H' }, 'H'),
      body: React.createElement('p', { className: 'B' }, 'B'),
      footer: React.createElement('p', { className: 'F' }, 'F'),
    });
    console.log(renderToStaticMarkup(tree));
  `);
  const headIndex = html.indexOf('class="H"');
  const bodyIndex = html.indexOf('class="B"');
  const footerIndex = html.indexOf('class="F"');
  assert.ok(headIndex >= 0 && bodyIndex >= 0 && footerIndex >= 0, 'all three slots should render');
  assert.ok(headIndex < bodyIndex, 'head must appear before body');
  assert.ok(bodyIndex < footerIndex, 'body must appear before footer');
});
