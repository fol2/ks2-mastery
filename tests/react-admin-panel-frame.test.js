// P5 Unit 1: AdminPanelFrame — pure logic and React rendering tests.
//
// Part A: decidePanelFrameState — 6 core state combinations plus edge cases.
// Part B: AdminPanelFrame React rendering via esbuild-SSR harness.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

import {
  decidePanelFrameState,
  DEFAULT_STALE_THRESHOLD_MS,
} from '../src/platform/hubs/admin-panel-frame.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FRAME_PATH = JSON.stringify(
  path.join(rootDir, 'src/surfaces/hubs/AdminPanelFrame.jsx'),
);

// ===========================================================================
// Part A: Pure logic tests for decidePanelFrameState
// ===========================================================================

test('decidePanelFrameState — default stale threshold is 5 minutes', () => {
  assert.equal(DEFAULT_STALE_THRESHOLD_MS, 300_000);
});

test('decidePanelFrameState — fresh data with content: no warnings', () => {
  const now = Date.now();
  const state = decidePanelFrameState({
    refreshedAt: now - 60_000, // 1 min ago
    refreshError: null,
    data: [{ id: 1 }],
    loading: false,
    now,
  });
  assert.equal(state.showStaleWarning, false);
  assert.equal(state.showLoadingSkeleton, false);
  assert.equal(state.showEmptyState, false);
  assert.equal(state.showRetry, false);
  assert.equal(state.showLastSuccessTimestamp, false);
  assert.equal(state.lastSuccessAt, now - 60_000);
});

test('decidePanelFrameState — stale data: shows stale warning', () => {
  const now = Date.now();
  const state = decidePanelFrameState({
    refreshedAt: now - 400_000, // 6.7 min ago
    refreshError: null,
    data: { count: 5 },
    loading: false,
    now,
  });
  assert.equal(state.showStaleWarning, true);
  assert.equal(state.showLoadingSkeleton, false);
  assert.equal(state.showEmptyState, false);
  assert.equal(state.showRetry, false);
});

test('decidePanelFrameState — loading with no existing data: shows skeleton', () => {
  const now = Date.now();
  const state = decidePanelFrameState({
    refreshedAt: null,
    refreshError: null,
    data: null,
    loading: true,
    now,
  });
  assert.equal(state.showLoadingSkeleton, true);
  assert.equal(state.showStaleWarning, false);
  assert.equal(state.showEmptyState, false);
  assert.equal(state.showRetry, false);
});

test('decidePanelFrameState — loading with existing data: no skeleton, no stale', () => {
  const now = Date.now();
  const state = decidePanelFrameState({
    refreshedAt: now - 400_000,
    refreshError: null,
    data: [{ id: 1 }],
    loading: true,
    now,
  });
  assert.equal(state.showLoadingSkeleton, false);
  // stale is suppressed during loading
  assert.equal(state.showStaleWarning, false);
  assert.equal(state.showEmptyState, false);
});

test('decidePanelFrameState — error with no data: shows retry', () => {
  const now = Date.now();
  const state = decidePanelFrameState({
    refreshedAt: null,
    refreshError: { code: 'network_error', message: 'Failed to fetch' },
    data: null,
    loading: false,
    now,
  });
  assert.equal(state.showRetry, true);
  assert.equal(state.showEmptyState, false);
  assert.equal(state.showLoadingSkeleton, false);
  assert.equal(state.showLastSuccessTimestamp, false);
});

test('decidePanelFrameState — error with prior success: shows retry + last success', () => {
  const now = Date.now();
  const lastSuccess = now - 120_000;
  const state = decidePanelFrameState({
    refreshedAt: lastSuccess,
    refreshError: { code: 'timeout', message: 'Request timed out' },
    data: [{ id: 1 }],
    loading: false,
    now,
  });
  assert.equal(state.showRetry, true);
  assert.equal(state.showLastSuccessTimestamp, true);
  assert.equal(state.lastSuccessAt, lastSuccess);
  // Not stale (within 5 min)
  assert.equal(state.showStaleWarning, false);
});

test('decidePanelFrameState — empty data, no error, no loading: shows empty state', () => {
  const now = Date.now();
  const state = decidePanelFrameState({
    refreshedAt: now - 30_000,
    refreshError: null,
    data: [],
    loading: false,
    now,
  });
  assert.equal(state.showEmptyState, true);
  assert.equal(state.showLoadingSkeleton, false);
  assert.equal(state.showRetry, false);
  assert.equal(state.showStaleWarning, false);
});

test('decidePanelFrameState — custom staleThresholdMs', () => {
  const now = Date.now();
  const state = decidePanelFrameState({
    refreshedAt: now - 70_000, // 70s ago
    refreshError: null,
    data: { items: true },
    loading: false,
    staleThresholdMs: 60_000, // 1 min threshold
    now,
  });
  assert.equal(state.showStaleWarning, true);
});

test('decidePanelFrameState — lastSuccessfulRefreshAt overrides refreshedAt', () => {
  const now = Date.now();
  const state = decidePanelFrameState({
    refreshedAt: now - 600_000, // very old
    refreshError: null,
    data: { items: true },
    loading: false,
    lastSuccessfulRefreshAt: now - 30_000, // recent
    now,
  });
  assert.equal(state.showStaleWarning, false);
  assert.equal(state.lastSuccessAt, now - 30_000);
});

test('decidePanelFrameState — empty object data counts as no data', () => {
  const now = Date.now();
  const state = decidePanelFrameState({
    refreshedAt: now,
    refreshError: null,
    data: {},
    loading: false,
    now,
  });
  assert.equal(state.showEmptyState, true);
});

test('decidePanelFrameState — null/undefined input returns safe defaults', () => {
  const state = decidePanelFrameState();
  assert.equal(state.showStaleWarning, false);
  assert.equal(state.showLoadingSkeleton, false);
  assert.equal(state.showEmptyState, true);
  assert.equal(state.showRetry, false);
  assert.equal(state.showLastSuccessTimestamp, false);
  assert.equal(state.lastSuccessAt, null);
});

// ===========================================================================
// Part B: React rendering tests via esbuild-SSR harness
// ===========================================================================

function nodePaths() {
  const candidates = [
    path.join(rootDir, 'node_modules'),
    ...String(process.env.NODE_PATH || '').split(path.delimiter),
  ];
  // Worktree support: walk up from rootDir until we find node_modules.
  let dir = rootDir;
  while (dir !== path.dirname(dir)) {
    const nm = path.join(dir, 'node_modules');
    if (existsSync(nm) && !candidates.includes(nm)) candidates.push(nm);
    dir = path.dirname(dir);
  }
  return candidates.filter((entry) => entry && existsSync(entry));
}

function normaliseLineEndings(value) {
  return String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

async function renderFixture(entrySource) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-frame-'));
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

test('AdminPanelFrame — renders PanelHeader within frame section', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminPanelFrame } from ${FRAME_PATH};

    const html = renderToStaticMarkup(
      <AdminPanelFrame
        eyebrow="Test eyebrow"
        title="Test panel"
        subtitle="A test subtitle"
        refreshedAt={${Date.now()}}
        refreshError={null}
        onRefresh={() => {}}
        data={{ something: true }}
        loading={false}
      >
        <div data-testid="body">Hello world</div>
      </AdminPanelFrame>
    );
    process.stdout.write(html);
  `);

  assert.ok(html.includes('data-panel-frame="Test panel"'), 'Frame wrapper renders');
  assert.ok(html.includes('Test eyebrow'), 'Eyebrow renders');
  assert.ok(html.includes('Test panel'), 'Title renders');
  assert.ok(html.includes('A test subtitle'), 'Subtitle renders');
  assert.ok(html.includes('Hello world'), 'Children render');
  assert.ok(!html.includes('data-panel-frame-stale'), 'No stale warning');
  assert.ok(!html.includes('data-panel-frame-empty'), 'No empty state');
  assert.ok(!html.includes('data-panel-frame-loading'), 'No loading skeleton');
});

test('AdminPanelFrame — loading skeleton renders, children hidden', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminPanelFrame } from ${FRAME_PATH};

    const html = renderToStaticMarkup(
      <AdminPanelFrame
        eyebrow="Loading"
        title="Loading panel"
        refreshedAt={null}
        refreshError={null}
        onRefresh={() => {}}
        data={null}
        loading={true}
        loadingSkeleton={<div data-testid="custom-skeleton">Loading...</div>}
      >
        <div data-testid="body">Should not appear</div>
      </AdminPanelFrame>
    );
    process.stdout.write(html);
  `);

  assert.ok(html.includes('data-panel-frame-loading="true"'), 'Loading container renders');
  assert.ok(html.includes('data-testid="custom-skeleton"'), 'Custom skeleton renders');
  assert.ok(!html.includes('Should not appear'), 'Children hidden during loading');
});

test('AdminPanelFrame — partial failure shows last-success message', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminPanelFrame } from ${FRAME_PATH};

    const html = renderToStaticMarkup(
      <AdminPanelFrame
        eyebrow="Partial"
        title="Partial failure panel"
        refreshedAt={${Date.now() - 60000}}
        refreshError={{ code: 'timeout', message: 'timed out' }}
        onRefresh={() => {}}
        data={[{ id: 1 }]}
        loading={false}
      >
        <div data-testid="body">Stale content</div>
      </AdminPanelFrame>
    );
    process.stdout.write(html);
  `);

  assert.ok(html.includes('data-panel-frame-partial-failure="true"'),
    'Partial failure indicator renders');
  assert.ok(html.includes('A more recent refresh failed'),
    'Partial failure text renders');
  assert.ok(html.includes('Stale content'),
    'Children still render (showing last-known-good data)');
});

test('AdminPanelFrame — refresh button renders in stale banner', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminPanelFrame } from ${FRAME_PATH};

    const html = renderToStaticMarkup(
      <AdminPanelFrame
        eyebrow="Stale"
        title="Stale panel"
        refreshedAt={${Date.now() - 600000}}
        refreshError={null}
        onRefresh={() => {}}
        data={{ items: [1] }}
        loading={false}
        staleThresholdMs={300000}
      >
        <div>Content</div>
      </AdminPanelFrame>
    );
    process.stdout.write(html);
  `);

  assert.ok(html.includes('data-panel-frame-stale="true"'), 'Stale warning renders');
  assert.ok(html.includes('Refresh now'), 'Refresh button in stale banner');
});
