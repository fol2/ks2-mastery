// U8 (P3): SSR render contract for the DenialLogPanel inside AdminDebuggingSection.
//
// Test scenarios from the plan:
//   1. Denial panel renders with filters (reason dropdown, route text, time range)
//   2. Denial entries render with expected fields
//   3. Empty state renders when no denials
//   4. Admin sees account id; ops does not
//   5. Normaliser handles missing/malformed entries

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

function nodePaths() {
  return [
    path.join(rootDir, 'node_modules'),
    ...String(process.env.NODE_PATH || '').split(path.delimiter),
  ].filter((entry) => entry && existsSync(entry));
}

function normaliseLineEndings(value) {
  return String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

async function renderFixture(entrySource) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-denial-panel-'));
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

const debuggingSectionPath = path.join(rootDir, 'src/surfaces/hubs/AdminDebuggingSection.jsx');

function denialPanelFixture({ platformRole, denialLog = {} } = {}) {
  return renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminDebuggingSection } from ${JSON.stringify(debuggingSectionPath)};
    const model = {
      permissions: { canViewAdminHub: true, platformRole: ${JSON.stringify(platformRole)}, platformRoleLabel: ${JSON.stringify(platformRole)} },
      errorLogSummary: { entries: [], totals: {} },
      denialLog: ${JSON.stringify(denialLog)},
      learnerSupport: { accessibleLearners: [], entryPoints: [] },
    };
    const actions = { dispatch: () => {} };
    const html = renderToStaticMarkup(
      <AdminDebuggingSection model={model} appState={{}} accessContext={{}} actions={actions} />
    );
    console.log(html);
  `);
}

test('denial panel renders with filter controls', async () => {
  const html = await denialPanelFixture({ platformRole: 'admin' });

  // Panel container
  assert.ok(html.includes('data-testid="denial-log-panel"'), 'denial panel container missing');
  // Filter controls
  assert.ok(html.includes('data-testid="denial-panel-filters"'), 'filter container missing');
  assert.ok(html.includes('data-testid="denial-filter-reason"'), 'reason dropdown missing');
  assert.ok(html.includes('data-testid="denial-filter-route"'), 'route filter missing');
  assert.ok(html.includes('data-testid="denial-filter-from"'), 'from filter missing');
  assert.ok(html.includes('data-testid="denial-filter-to"'), 'to filter missing');
  assert.ok(html.includes('data-testid="denial-filter-apply"'), 'apply button missing');
  assert.ok(html.includes('data-testid="denial-filter-reset"'), 'reset button missing');
  // Panel header
  assert.ok(html.includes('Denial log'), 'panel title missing');
  assert.ok(html.includes('Request denials'), 'panel eyebrow missing');
});

test('denial panel renders entries with expected fields', async () => {
  const denialLog = {
    generatedAt: Date.now(),
    entries: [
      {
        id: 'deny-1',
        deniedAt: 1700000000000,
        denialReason: 'suspended_account',
        routeName: '/api/bootstrap',
        accountIdMasked: 'abcd1234',
        isDemo: false,
        release: null,
      },
      {
        id: 'deny-2',
        deniedAt: 1700000001000,
        denialReason: 'rate_limited',
        routeName: '/api/subject/command',
        accountIdMasked: 'efgh5678',
        isDemo: true,
        release: null,
      },
    ],
  };

  const html = await denialPanelFixture({ platformRole: 'admin', denialLog });

  assert.ok(html.includes('data-testid="denial-row-deny-1"'), 'first denial row missing');
  assert.ok(html.includes('data-testid="denial-row-deny-2"'), 'second denial row missing');
  assert.ok(html.includes('suspended_account'), 'denial reason missing');
  assert.ok(html.includes('rate_limited'), 'second denial reason missing');
  assert.ok(html.includes('/api/bootstrap'), 'route name missing');
  // Admin sees account id
  assert.ok(html.includes('data-testid="denial-account-deny-1"'), 'admin account id missing');
  assert.ok(html.includes('abcd1234'), 'masked account id missing');
  // Demo chip
  assert.ok(html.includes('demo'), 'demo chip missing');
});

test('denial panel shows empty state when no denials', async () => {
  const html = await denialPanelFixture({
    platformRole: 'admin',
    denialLog: { generatedAt: Date.now(), entries: [] },
  });

  assert.ok(html.includes('data-testid="denial-panel-empty-state"'), 'empty state missing');
  assert.ok(html.includes('No request denials recorded'), 'empty state text missing');
});

test('ops role does not see account linkage in denial panel', async () => {
  const denialLog = {
    generatedAt: Date.now(),
    entries: [
      {
        id: 'deny-ops-1',
        deniedAt: 1700000000000,
        denialReason: 'suspended_account',
        routeName: '/api/bootstrap',
        accountIdMasked: 'abcd1234',
        isDemo: false,
        release: null,
      },
    ],
  };

  const html = await denialPanelFixture({ platformRole: 'ops', denialLog });

  // Ops sees the denial row
  assert.ok(html.includes('data-testid="denial-row-deny-ops-1"'), 'denial row missing for ops');
  assert.ok(html.includes('suspended_account'), 'reason missing for ops');
  assert.ok(html.includes('/api/bootstrap'), 'route missing for ops');
  // Ops does NOT see account id column
  assert.ok(!html.includes('data-testid="denial-account-deny-ops-1"'), 'ops should not see account linkage');
});

// Normaliser unit tests
test('normaliseDenialEntry handles missing/malformed entries', async () => {
  const output = await renderFixture(`
    import { normaliseDenialEntry } from ${JSON.stringify(path.join(rootDir, 'src/platform/hubs/admin-denial-panel.js'))};

    const nullResult = normaliseDenialEntry(null);
    console.log(JSON.stringify(nullResult));

    const emptyResult = normaliseDenialEntry({});
    console.log(JSON.stringify(emptyResult));

    const validResult = normaliseDenialEntry({
      id: 'test-1',
      deniedAt: 1700000000000,
      denialReason: 'forbidden',
      routeName: '/api/test',
      accountIdMasked: 'last8chr',
      isDemo: true,
      release: 'abc1234',
    });
    console.log(JSON.stringify(validResult));
  `);

  const lines = output.split('\n');
  const nullResult = JSON.parse(lines[0]);
  const emptyResult = JSON.parse(lines[1]);
  const validResult = JSON.parse(lines[2]);

  // Null input
  assert.equal(nullResult.id, '');
  assert.equal(nullResult.deniedAt, 0);
  assert.equal(nullResult.denialReason, '');
  assert.equal(nullResult.routeName, null);
  assert.equal(nullResult.accountIdMasked, null);
  assert.equal(nullResult.isDemo, false);

  // Empty object
  assert.equal(emptyResult.id, '');
  assert.equal(emptyResult.denialReason, '');

  // Valid entry
  assert.equal(validResult.id, 'test-1');
  assert.equal(validResult.deniedAt, 1700000000000);
  assert.equal(validResult.denialReason, 'forbidden');
  assert.equal(validResult.routeName, '/api/test');
  assert.equal(validResult.accountIdMasked, 'last8chr');
  assert.equal(validResult.isDemo, true);
  assert.equal(validResult.release, 'abc1234');
});
