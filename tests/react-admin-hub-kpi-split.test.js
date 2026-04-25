// P1.5 Phase A (U3) — React KPI split rendering.
//
// The DashboardKpiPanel now renders each demo-splittable counter as a
// "real / demo" pair with a `—` placeholder when the demo sibling is
// absent from the payload (e.g. legacy servers that emit `accounts.total`
// only, no `accounts.demo`). These tests drive the admin surface through
// the same bundled-subprocess SSR harness used elsewhere and assert:
//  1. Legacy contract: a payload with `accounts.total` only still renders
//     the panel and shows `—` as the demo side.
//  2. Full payload: real+demo pair renders both numbers side by side.
//  3. Error-origin split renders client-origin and server-origin counters.
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

async function renderAdminSurface({ dashboardKpis }) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-kpi-split-'));
  const entryPath = path.join(tmpDir, 'entry.jsx');
  const bundlePath = path.join(tmpDir, 'entry.cjs');
  try {
    await writeFile(entryPath, `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { AdminHubSurface } from ${JSON.stringify(path.join(rootDir, 'src/surfaces/hubs/AdminHubSurface.jsx'))};
      const model = {
        account: { id: 'adult-admin', repoRevision: 1, selectedLearnerId: '' },
        permissions: { canViewAdminHub: true, platformRole: 'admin', platformRoleLabel: 'Admin', canManageMonsterVisualConfig: true },
        monsterVisualConfig: { permissions: {}, status: { validation: { ok: true, errorCount: 0, warningCount: 0, errors: [], warnings: [] } }, draft: null, published: null, versions: [], mutation: {} },
        contentReleaseStatus: { publishedVersion: 1, publishedReleaseId: 'r', runtimeWordCount: 0, runtimeSentenceCount: 0, currentDraftId: 'd', currentDraftVersion: 1, draftUpdatedAt: 0 },
        importValidationStatus: { ok: true, errorCount: 0, warningCount: 0, source: '', importedAt: 0, errors: [] },
        auditLogLookup: { available: false, note: '', entries: [] },
        dashboardKpis: ${JSON.stringify(dashboardKpis)},
        opsActivityStream: { generatedAt: 1, entries: [] },
        accountOpsMetadata: { generatedAt: 1, accounts: [] },
        errorLogSummary: { generatedAt: 1, totals: { open: 0, investigating: 0, resolved: 0, ignored: 0, all: 0 }, entries: [] },
        demoOperations: { sessionsCreated: 0, activeSessions: 0, conversions: 0, cleanupCount: 0, rateLimitBlocks: 0, ttsFallbacks: 0, updatedAt: 0 },
        learnerSupport: { selectedLearnerId: '', accessibleLearners: [], selectedDiagnostics: null, punctuationReleaseDiagnostics: null, entryPoints: [] },
      };
      const actions = { dispatch() {}, navigateHome() {}, openSubject() {}, registerAccountOpsMetadataRowDirty() {} };
      const appState = { learners: { selectedId: 'learner-a', byId: { 'learner-a': { id: 'learner-a', name: 'Ava', yearGroup: 'Y5' } }, allIds: ['learner-a'] }, persistence: { mode: 'remote-sync' }, toasts: [], monsterCelebrations: { queue: [] } };
      const accessContext = { shellAccess: { source: 'worker-session' }, activeAdultLearnerContext: null };
      const accountDirectory = { status: 'loaded', accounts: [] };
      const html = renderToStaticMarkup(
        <AdminHubSurface
          appState={appState}
          model={model}
          hubState={{ status: 'loaded' }}
          accountDirectory={accountDirectory}
          accessContext={accessContext}
          actions={actions}
        />
      );
      console.log(html);
    `);
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

test('legacy KPI payload (no demo siblings) renders the panel with em-dash placeholders', async () => {
  const legacyPayload = {
    generatedAt: 1,
    accounts: { total: 5 },
    learners: { total: 3 },
    demos: { active: 0 },
    practiceSessions: { last7d: 7, last30d: 15 },
    eventLog: { last7d: 100 },
    mutationReceipts: { last7d: 4 },
    errorEvents: { byStatus: { open: 1, investigating: 0, resolved: 2, ignored: 0 } },
    accountOpsUpdates: { total: 5 },
  };
  const html = await renderAdminSurface({ dashboardKpis: legacyPayload });
  // The real side uses the legacy `.total` because `.real` is missing.
  assert.match(html, /<span data-kpi-role="real">5<\/span>/);
  // No demo sibling — the placeholder `—` renders on the demo side.
  assert.match(html, /<span data-kpi-role="demo">—<\/span>/);
  // Error origin split is unset in the legacy payload, rendered as `—`.
  assert.match(html, /Errors: client-origin/);
  assert.match(html, /Errors: server-origin/);
});

test('full KPI payload renders real and demo counters side by side', async () => {
  const fullPayload = {
    generatedAt: 1,
    accounts: { total: 5, real: 5, demo: 3 },
    learners: { total: 4, real: 2, demo: 2 },
    demos: { active: 1 },
    practiceSessions: {
      last7d: 10,
      last30d: 30,
      real: { last7d: 8, last30d: 25 },
      demo: { last7d: 2, last30d: 5 },
    },
    eventLog: { last7d: 100 },
    mutationReceipts: {
      last7d: 6,
      real: { last7d: 5 },
      demo: { last7d: 1 },
    },
    errorEvents: {
      byStatus: { open: 1, investigating: 0, resolved: 2, ignored: 0 },
      byOrigin: { client: 7, server: 3 },
    },
    accountOpsUpdates: { total: 5 },
  };
  const html = await renderAdminSurface({ dashboardKpis: fullPayload });
  // Real=5 / Demo=3 for accounts.
  assert.match(html, /<strong>Adult accounts \(real\)<\/strong><\/div><div><span data-kpi-role="real">5<\/span> \/ <span data-kpi-role="demo">3<\/span>/);
  // Real=2 / Demo=2 for learners.
  assert.match(html, /<strong>Learners<\/strong><\/div><div><span data-kpi-role="real">2<\/span> \/ <span data-kpi-role="demo">2<\/span>/);
  // Practice sessions 7d: real=8 / demo=2.
  assert.match(html, /<strong>Practice sessions \(7d\)<\/strong><\/div><div><span data-kpi-role="real">8<\/span> \/ <span data-kpi-role="demo">2<\/span>/);
  // Mutation receipts 7d: real=5 / demo=1.
  assert.match(html, /<strong>Mutation receipts \(7d\)<\/strong><\/div><div><span data-kpi-role="real">5<\/span> \/ <span data-kpi-role="demo">1<\/span>/);
  // Error origin numbers rendered as non-split rows.
  assert.match(html, /<strong>Errors: client-origin<\/strong><\/div><div>7<\/div>/);
  assert.match(html, /<strong>Errors: server-origin<\/strong><\/div><div>3<\/div>/);
});

test('KPI payload with zero demos renders 0 explicitly (not the em-dash placeholder)', async () => {
  const zeroDemoPayload = {
    generatedAt: 1,
    accounts: { total: 5, real: 5, demo: 0 },
    learners: { total: 2, real: 2, demo: 0 },
    demos: { active: 0 },
    practiceSessions: {
      last7d: 7,
      last30d: 15,
      real: { last7d: 7, last30d: 15 },
      demo: { last7d: 0, last30d: 0 },
    },
    eventLog: { last7d: 10 },
    mutationReceipts: {
      last7d: 4,
      real: { last7d: 4 },
      demo: { last7d: 0 },
    },
    errorEvents: {
      byStatus: { open: 0, investigating: 0, resolved: 0, ignored: 0 },
      byOrigin: { client: 0, server: 0 },
    },
    accountOpsUpdates: { total: 0 },
  };
  const html = await renderAdminSurface({ dashboardKpis: zeroDemoPayload });
  // Zero demos must render explicit `0`, not `—`.
  assert.match(html, /<strong>Adult accounts \(real\)<\/strong><\/div><div><span data-kpi-role="real">5<\/span> \/ <span data-kpi-role="demo">0<\/span>/);
  assert.match(html, /<strong>Learners<\/strong><\/div><div><span data-kpi-role="real">2<\/span> \/ <span data-kpi-role="demo">0<\/span>/);
});
