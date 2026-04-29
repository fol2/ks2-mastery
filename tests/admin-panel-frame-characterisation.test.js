import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// P2 U5 — checked-in SSR characterisation baseline for AdminPanelFrame.
//
// This test pins the rendered HTML for the three default-slot
// scenarios that U5 migrates:
//   1. Default loading slot (no consumer-supplied `loadingSkeleton`).
//   2. Default empty slot (no consumer-supplied `emptyState`).
//   3. Present-data branch — sanity check that body content still
//      renders unchanged when `data` is non-empty and `loading` is
//      false. This is the regression fence post-migration.
//
// Mirrors the shape of `tests/empty-state-primitive.test.js`:
// esbuild bundles a temp entry that imports the production source +
// `react-dom/server`, then spawns it via `execFileSync` and asserts
// on `console.log` output. The `NODE_PATH` resolver pattern keeps the
// symlinked `node_modules` working.

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function nodePaths() {
  return [
    path.join(rootDir, 'node_modules'),
    ...String(process.env.NODE_PATH || '').split(path.delimiter),
  ].filter((entry) => entry && existsSync(entry));
}

async function renderFixture(entrySource) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-admin-frame-char-'));
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
    return execFileSync(process.execPath, [bundlePath], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

function absoluteSpecifier(relativePath) {
  return JSON.stringify(path.join(rootDir, relativePath));
}

// ---------- Scenario 1: default loading slot ---------- //

test('AdminPanelFrame default loading slot renders the shared LoadingSkeleton primitive', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminPanelFrame } from ${absoluteSpecifier('src/surfaces/hubs/AdminPanelFrame.jsx')};
    const html = renderToStaticMarkup(
      <AdminPanelFrame
        eyebrow="Test"
        title="Loading panel"
        refreshedAt={null}
        refreshError={null}
        onRefresh={() => {}}
        data={null}
        loading={true}
      >
        <p>Body content should not appear during loading.</p>
      </AdminPanelFrame>
    );
    console.log(html);
  `);
  assert.match(html, /data-panel-frame-loading="true"/, 'Loading container wrapper still emits the data-panel-frame-loading marker for selectors');
  assert.match(html, /data-testid="loading-skeleton"/, 'default loading slot must use the shared LoadingSkeleton primitive');
  assert.match(html, /aria-label="Loading"/, 'LoadingSkeleton announces via aria-label');
  assert.doesNotMatch(html, /Body content/, 'children must not render during loading');
  // Belt-and-braces: the legacy `admin-panel-frame-placeholder` text
  // marker must be gone — if it ever returns it implies a regression
  // dropped the LoadingSkeleton import.
  assert.doesNotMatch(html, /admin-panel-frame-placeholder/, 'legacy placeholder class should be removed once LoadingSkeleton is wired');
  assert.doesNotMatch(html, /Loading panel data/, 'legacy "Loading panel data..." placeholder text is replaced by LoadingSkeleton');
});

// ---------- Scenario 2: default empty slot ---------- //

test('AdminPanelFrame default empty slot renders the shared EmptyState primitive with operator-tone copy', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminPanelFrame } from ${absoluteSpecifier('src/surfaces/hubs/AdminPanelFrame.jsx')};
    const html = renderToStaticMarkup(
      <AdminPanelFrame
        eyebrow="Test"
        title="Empty panel"
        refreshedAt={Date.now()}
        refreshError={null}
        onRefresh={() => {}}
        data={[]}
        loading={false}
      >
        <p>Body content should not appear when empty.</p>
      </AdminPanelFrame>
    );
    console.log(html);
  `);
  assert.match(html, /data-panel-frame-empty="true"/, 'Empty container wrapper still emits the data-panel-frame-empty marker');
  assert.match(html, /data-testid="empty-state"/, 'default empty slot must use the shared EmptyState primitive');
  assert.match(html, /No data available/, 'EmptyState title carries the canonical operator-tone copy');
  assert.match(
    html,
    /panel has nothing to display for the current filters or window/,
    'EmptyState body anchors on filters/window so the operator knows where to look',
  );
  assert.doesNotMatch(html, /Body content/, 'children must not render when empty state is shown');
  assert.doesNotMatch(html, /admin-panel-frame-placeholder/, 'legacy placeholder class should be removed once EmptyState is wired');
});

// ---------- Scenario 3: present-data branch (sanity) ---------- //

test('AdminPanelFrame present-data branch renders children unchanged (no state-primitive interference)', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminPanelFrame } from ${absoluteSpecifier('src/surfaces/hubs/AdminPanelFrame.jsx')};
    const html = renderToStaticMarkup(
      <AdminPanelFrame
        eyebrow="Test"
        title="Live panel"
        refreshedAt={Date.now()}
        refreshError={null}
        onRefresh={() => {}}
        data={[{ id: 1 }]}
        loading={false}
      >
        <p data-testid="live-body">Live panel body</p>
      </AdminPanelFrame>
    );
    console.log(html);
  `);
  assert.match(html, /data-panel-frame="Live panel"/, 'frame wraps with title attribute');
  assert.match(html, /data-testid="live-body"/, 'children render in present-data branch');
  assert.match(html, /Live panel body/, 'children content text appears');
  // Neither default state primitive should fire when data is present.
  assert.doesNotMatch(html, /data-panel-frame-loading="true"/, 'no loading wrapper when data present');
  assert.doesNotMatch(html, /data-panel-frame-empty="true"/, 'no empty wrapper when data present');
  assert.doesNotMatch(html, /data-testid="loading-skeleton"/, 'LoadingSkeleton must not bleed into present-data branch');
  assert.doesNotMatch(html, /data-testid="empty-state"/, 'EmptyState must not bleed into present-data branch');
});
