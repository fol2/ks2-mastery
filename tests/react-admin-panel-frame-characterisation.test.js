// P5 Unit 1: Characterisation tests for AdminPanelFrame adoption.
//
// Verifies that existing panels still render their structural markers
// (eyebrow, titles, data-testid, section headings) after AdminPanelFrame
// wrapping. Uses the same esbuild-SSR harness as the existing admin hub
// characterisation tests.
//
// Scenarios:
//   1. DashboardKpiPanel renders data-panel-frame attribute and KPI rows
//   2. RecentActivityStreamPanel renders frame attribute and entry rows
//   3. AdminDebuggingSection renders framed error log and denial log panels
//   4. AdminPanelFrame stale warning renders when data is old
//   5. AdminPanelFrame empty state renders for empty data

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

const OVERVIEW_PATH = JSON.stringify(
  path.join(rootDir, 'src/surfaces/hubs/AdminOverviewSection.jsx'),
);
const DEBUGGING_PATH = JSON.stringify(
  path.join(rootDir, 'src/surfaces/hubs/AdminDebuggingSection.jsx'),
);
const FRAME_PATH = JSON.stringify(
  path.join(rootDir, 'src/surfaces/hubs/AdminPanelFrame.jsx'),
);

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
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-frame-char-'));
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

// ---------------------------------------------------------------------------
// Scenario 1: DashboardKpiPanel renders with frame wrapper
// ---------------------------------------------------------------------------
test('DashboardKpiPanel renders data-panel-frame attribute and KPI rows', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminOverviewSection } from ${OVERVIEW_PATH};

    const model = {
      dashboardKpis: {
        refreshedAt: ${Date.now()},
        accounts: { real: 42, demo: 5 },
        learners: { real: 100, demo: 10 },
        demos: { active: 3 },
        practiceSessions: { last7d: 200, last30d: 800 },
        eventLog: { last7d: 55 },
        mutationReceipts: { last7d: 12 },
        errorEvents: { byStatus: { open: 2 }, byOrigin: { client: 1 } },
        accountOpsUpdates: { total: 7 },
        cronReconcile: { lastSuccessAt: ${Date.now() - 1000} },
      },
      opsActivityStream: { refreshedAt: ${Date.now()}, entries: [] },
      demoOperations: {},
    };
    const actions = { dispatch: () => {} };
    const html = renderToStaticMarkup(<AdminOverviewSection model={model} actions={actions} />);
    process.stdout.write(html);
  `);

  // AdminPanelFrame renders data-panel-frame attribute
  assert.ok(html.includes('data-panel-frame="Dashboard overview"'),
    'DashboardKpiPanel should be wrapped in AdminPanelFrame with correct title');
  // KPI data renders
  assert.ok(html.includes('data-kpi-role="real"'),
    'KPI rows should render real/demo split');
  // Eyebrow renders
  assert.ok(html.includes('Dashboard KPI'),
    'Eyebrow text should render');
});

// ---------------------------------------------------------------------------
// Scenario 2: RecentActivityStreamPanel renders frame and entries
// ---------------------------------------------------------------------------
test('RecentActivityStreamPanel renders frame attribute and activity entries', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminOverviewSection } from ${OVERVIEW_PATH};

    const model = {
      dashboardKpis: { refreshedAt: ${Date.now()}, accounts: { real: 1 } },
      opsActivityStream: {
        refreshedAt: ${Date.now()},
        entries: [
          { requestId: 'r1', mutationKind: 'account_create', scopeType: 'account', scopeId: 'abc123', accountIdMasked: '***123', appliedAt: ${Date.now() - 60000} },
          { requestId: 'r2', mutationKind: 'learner_update', scopeType: 'learner', scopeId: 'def456', accountIdMasked: '***456', appliedAt: ${Date.now() - 120000} },
        ],
      },
      demoOperations: {},
    };
    const actions = { dispatch: () => {} };
    const html = renderToStaticMarkup(<AdminOverviewSection model={model} actions={actions} />);
    process.stdout.write(html);
  `);

  assert.ok(html.includes('data-panel-frame="Recent operations activity"'),
    'RecentActivityStreamPanel should be wrapped in AdminPanelFrame');
  assert.ok(html.includes('account_create'),
    'Activity entries should render mutation kinds');
  assert.ok(html.includes('learner_update'),
    'Second entry should render');
});

// ---------------------------------------------------------------------------
// Scenario 3: AdminDebuggingSection renders framed panels
// ---------------------------------------------------------------------------
test('AdminDebuggingSection renders framed error log and denial log', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminDebuggingSection } from ${DEBUGGING_PATH};

    const model = {
      errorLogSummary: {
        refreshedAt: ${Date.now()},
        totals: { open: 1 },
        entries: [{ id: 'e1', errorKind: 'TypeError', occurrenceCount: 3, firstSeen: ${Date.now() - 3600000}, lastSeen: ${Date.now()} }],
      },
      denialLog: {
        refreshedAt: ${Date.now()},
        entries: [{ id: 'd1', reason: 'rate_limit_exceeded', route: '/api/submit', occurredAt: ${Date.now()} }],
      },
      permissions: { platformRole: 'admin' },
      learnerSupport: { accessibleLearners: [] },
    };
    const appState = { persistence: {} };
    const accessContext = {};
    const actions = { dispatch: () => {} };
    const html = renderToStaticMarkup(
      <AdminDebuggingSection model={model} appState={appState} accessContext={accessContext} actions={actions} />
    );
    process.stdout.write(html);
  `);

  assert.ok(html.includes('data-panel-frame="Error log centre"'),
    'Error log panel should be inside AdminPanelFrame');
  assert.ok(html.includes('data-panel-frame="Denial log"'),
    'Denial log panel should be inside AdminPanelFrame');
});

// ---------------------------------------------------------------------------
// Scenario 4: Stale warning renders when data is old
// ---------------------------------------------------------------------------
test('AdminPanelFrame renders stale warning for old data', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminPanelFrame } from ${FRAME_PATH};

    const html = renderToStaticMarkup(
      <AdminPanelFrame
        eyebrow="Test"
        title="Stale panel"
        refreshedAt={${Date.now() - 600000}}
        refreshError={null}
        onRefresh={() => {}}
        data={{ something: true }}
        loading={false}
        staleThresholdMs={300000}
      >
        <p>Body content</p>
      </AdminPanelFrame>
    );
    process.stdout.write(html);
  `);

  assert.ok(html.includes('data-panel-frame-stale="true"'),
    'Stale warning banner should render');
  assert.ok(html.includes('Data may be stale'),
    'Stale warning text should appear');
  assert.ok(html.includes('Body content'),
    'Panel body should still render');
});

// ---------------------------------------------------------------------------
// Scenario 5: Empty state renders for empty data
// ---------------------------------------------------------------------------
test('AdminPanelFrame renders empty state for empty data', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminPanelFrame } from ${FRAME_PATH};

    const html = renderToStaticMarkup(
      <AdminPanelFrame
        eyebrow="Test"
        title="Empty panel"
        refreshedAt={${Date.now()}}
        refreshError={null}
        onRefresh={() => {}}
        data={[]}
        loading={false}
        emptyState={<p className="custom-empty">Nothing here yet.</p>}
      >
        <p>Body content</p>
      </AdminPanelFrame>
    );
    process.stdout.write(html);
  `);

  assert.ok(html.includes('data-panel-frame-empty="true"'),
    'Empty state container should render');
  assert.ok(html.includes('Nothing here yet'),
    'Custom empty state content should render');
  assert.ok(!html.includes('Body content'),
    'Panel body should NOT render when empty state is shown');
});
