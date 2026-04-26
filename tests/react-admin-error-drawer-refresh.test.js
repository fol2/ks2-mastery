// Phase E / U20 coverage: drawer + narrow-refresh interaction.
//
// The Admin Hub error-log-centre panel uses native <details>/<summary>
// for the per-row drawer. When a narrow refresh arrives via
// `applyAdminHubErrorLogSummaryPatch`, the row's React element key
// (`entry.id`) stays stable as long as the row still exists in the
// new payload — React preserves the DOM node, and so the native
// drawer's open/closed state is preserved too.
//
// The tests below lock in the two pieces of this contract that CAN
// regress:
//   1. `applyAdminHubErrorLogSummaryPatch` composes a new entries list
//      but preserves per-panel scalars like `savingEventId` (a mid-
//      save refresh must not wipe the save-guard).
//   2. When an entry is present in both the old and the new payload,
//      the entry's `id` is identical in both — so React's keyed
//      reconciliation preserves the DOM node (which is what keeps the
//      drawer open).
//   3. When a drawer-open row is DROPPED from the new payload (a
//      filter narrowed past it), the drawer necessarily unmounts —
//      this is the correct behaviour: the row is no longer visible.
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U20

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

import { applyAdminHubErrorLogSummaryPatch } from '../src/platform/hubs/admin-panel-patches.js';

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
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-drawer-refresh-'));
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

test('U20 drawer refresh — patch preserves savingEventId across narrow refresh', () => {
  // Before the refresh, a save is in-flight: savingEventId = 'evt-1'.
  const hub = {
    errorLogSummary: {
      generatedAt: 1_700_000_000_000,
      savingEventId: 'evt-1',
      totals: { open: 1, investigating: 0, resolved: 0, ignored: 0, all: 1 },
      entries: [
        { id: 'evt-1', errorKind: 'TypeError', status: 'open' },
      ],
    },
  };

  // Server payload from a narrow refresh (no savingEventId — it's a
  // read-only GET that does not know about client save state).
  const payload = {
    ok: true,
    generatedAt: 1_700_000_100_000,
    totals: { open: 1, investigating: 0, resolved: 0, ignored: 0, all: 1 },
    entries: [
      { id: 'evt-1', errorKind: 'TypeError', status: 'open' },
      { id: 'evt-2', errorKind: 'ReferenceError', status: 'open' },
    ],
  };

  const nextHub = applyAdminHubErrorLogSummaryPatch(hub, payload);
  // Entries get the new payload's list.
  assert.equal(nextHub.errorLogSummary.entries.length, 2);
  // savingEventId is preserved from the previous state (the mid-save guard).
  assert.equal(nextHub.errorLogSummary.savingEventId, 'evt-1');
  // generatedAt lands from the server payload.
  assert.equal(nextHub.errorLogSummary.generatedAt, 1_700_000_100_000);
});

test('U20 drawer refresh — entry ids stable across refresh so React key reconciliation preserves drawer DOM', () => {
  const hub = {
    errorLogSummary: {
      generatedAt: 1_700_000_000_000,
      savingEventId: '',
      totals: { open: 2, investigating: 0, resolved: 0, ignored: 0, all: 2 },
      entries: [
        { id: 'evt-1', errorKind: 'TypeError', status: 'open' },
        { id: 'evt-2', errorKind: 'ReferenceError', status: 'open' },
      ],
    },
  };

  // Narrow refresh: same ids, different occurrence count (simulates
  // another client firing more events between refreshes).
  const payload = {
    ok: true,
    generatedAt: 1_700_000_100_000,
    totals: { open: 2, investigating: 0, resolved: 0, ignored: 0, all: 2 },
    entries: [
      { id: 'evt-1', errorKind: 'TypeError', status: 'open', occurrenceCount: 5 },
      { id: 'evt-2', errorKind: 'ReferenceError', status: 'open', occurrenceCount: 3 },
    ],
  };

  const nextHub = applyAdminHubErrorLogSummaryPatch(hub, payload);
  const beforeIds = hub.errorLogSummary.entries.map((entry) => entry.id).sort();
  const afterIds = nextHub.errorLogSummary.entries.map((entry) => entry.id).sort();
  // Ids stay stable — React reconciles by key, preserves the <details>
  // DOM node, and the drawer's open/closed state carries over.
  assert.deepEqual(afterIds, beforeIds);
});

test('U20 drawer refresh — drawer-open row dropped by filter: entry absent in new payload so React unmounts the row (correct behaviour)', () => {
  // The refresh here simulates a filter that narrowed the list past
  // the currently-open drawer row. The row's entry is absent from the
  // new payload, so the patch returns a smaller list and React
  // unmounts the row entirely. The drawer cannot stay open on a row
  // that no longer exists — this is the correct trade-off (filter
  // intent wins over drawer-open state).
  const hub = {
    errorLogSummary: {
      generatedAt: 1_700_000_000_000,
      savingEventId: '',
      totals: { open: 2, investigating: 0, resolved: 0, ignored: 0, all: 2 },
      entries: [
        { id: 'evt-1', errorKind: 'TypeError', status: 'open' },
        { id: 'evt-2', errorKind: 'ReferenceError', status: 'open' },
      ],
    },
  };

  const payload = {
    ok: true,
    generatedAt: 1_700_000_100_000,
    totals: { open: 1, investigating: 0, resolved: 0, ignored: 0, all: 1 },
    entries: [
      { id: 'evt-2', errorKind: 'ReferenceError', status: 'open' },
    ],
  };

  const nextHub = applyAdminHubErrorLogSummaryPatch(hub, payload);
  const ids = nextHub.errorLogSummary.entries.map((entry) => entry.id);
  assert.deepEqual(ids, ['evt-2']);
});

test('U20 drawer refresh — SSR-rendered drawer keeps release + account cells stable across occurrence-count refresh', async () => {
  // Render the same entry twice with different occurrence counts
  // (simulating a narrow refresh that bumps the counter on the same
  // fingerprint). The drawer's release columns, account cell, and
  // status-change cell must render identically across both passes —
  // those are the fields the drawer surfaces for forensic context,
  // so any drift between refresh passes would suggest the column
  // wiring regressed. The occurrence-count line is intentionally
  // excluded from the equality check since a fresh count is the
  // legitimate reason for the refresh in the first place.
  const drawerPath = path.join(rootDir, 'src/surfaces/hubs/AdminHubSurface.jsx');
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminHubSurface } from ${JSON.stringify(drawerPath)};
    const entry = {
      id: 'evt-stable',
      errorKind: 'TypeError',
      messageFirstLine: 'boom',
      firstFrame: 'at x',
      routeName: '/dashboard',
      userAgent: 'UA',
      accountIdMasked: '••abc123',
      occurrenceCount: 1,
      firstSeen: 1_700_000_000_000,
      lastSeen: 1_700_000_100_000,
      status: 'open',
      firstSeenRelease: 'abc1234',
      lastSeenRelease: 'abc1234',
      resolvedInRelease: null,
      lastStatusChangeAt: null,
    };
    const baseModel = {
      account: { id: 'adult-admin', repoRevision: 0, selectedLearnerId: null, platformRole: 'admin' },
      permissions: { canViewAdminHub: true, platformRole: 'admin', platformRoleLabel: 'admin' },
      learnerSupport: { accessibleLearners: [], selectedLearnerId: '', punctuationReleaseDiagnostics: {} },
      auditLogLookup: { entries: [] },
      demoOperations: { demoBuckets: [] },
      contentReleaseStatus: { publishedVersion: 1, publishedReleaseId: 'r1', runtimeWordCount: 0, runtimeSentenceCount: 0, currentDraftId: 'd1', currentDraftVersion: 1, draftUpdatedAt: 0 },
      importValidationStatus: { ok: true, errorCount: 0, warningCount: 0, errors: [], source: 'bundled baseline', importedAt: 0 },
      dashboardKpis: { computedAt: 0, statusCounts: {}, retentionStatus: { lastSuccess: null }, reconcileInFlight: false },
      accountOpsMetadata: { generatedAt: 0, accounts: [] },
      opsActivityStream: { generatedAt: 0, entries: [] },
    };
    const modelA = {
      ...baseModel,
      errorLogSummary: {
        generatedAt: 1_700_000_000_000,
        totals: { open: 1, investigating: 0, resolved: 0, ignored: 0, all: 1 },
        savingEventId: '',
        entries: [entry],
      },
    };
    const modelB = {
      ...baseModel,
      errorLogSummary: {
        generatedAt: 1_700_000_100_000, // timestamp updated
        totals: { open: 1, investigating: 0, resolved: 0, ignored: 0, all: 1 },
        savingEventId: '',
        entries: [{ ...entry, occurrenceCount: 2 }], // count bumped
      },
    };
    function extractDrawerBlock(html) {
      // Pull the drawer subtree from the rendered output so that
      // unrelated header chrome (timestamps, totals chips) does not
      // count as a drift signal.
      const match = html.match(/<details data-testid="error-event-drawer-evt-stable"[^>]*>[\\s\\S]*?<\\/details>/);
      return match ? match[0] : '';
    }
    const htmlA = renderToStaticMarkup(
      <AdminHubSurface
        appState={{ learners: { byId: {}, selectedId: null } }}
        model={modelA}
        hubState={{ status: 'ready' }}
        accountDirectory={{ accounts: [], status: 'idle' }}
        accessContext={{ shellAccess: { source: 'worker-session' } }}
        actions={{ dispatch: () => {}, openSubject: () => {}, navigateHome: () => {}, registerAccountOpsMetadataRowDirty: () => {} }}
      />,
    );
    const htmlB = renderToStaticMarkup(
      <AdminHubSurface
        appState={{ learners: { byId: {}, selectedId: null } }}
        model={modelB}
        hubState={{ status: 'ready' }}
        accountDirectory={{ accounts: [], status: 'idle' }}
        accessContext={{ shellAccess: { source: 'worker-session' } }}
        actions={{ dispatch: () => {}, openSubject: () => {}, navigateHome: () => {}, registerAccountOpsMetadataRowDirty: () => {} }}
      />,
    );
    console.log(JSON.stringify({ drawerA: extractDrawerBlock(htmlA), drawerB: extractDrawerBlock(htmlB) }));
  `);
  const { drawerA, drawerB } = JSON.parse(html);
  assert.ok(drawerA, 'drawer A rendered');
  assert.ok(drawerB, 'drawer B rendered');
  // Strip the occurrence line from both so the equality assertion
  // focuses on the stable release/account/status-change cells.
  const stripOccurrence = (value) => value.replace(/<dt[^>]*>Occurrences<\/dt><dd[^>]*>×\d+[^<]*<\/dd>/, '<OCCURRENCE_ELIDED/>');
  const stableA = stripOccurrence(drawerA);
  const stableB = stripOccurrence(drawerB);
  assert.equal(stableA, stableB, 'drawer subtree identical across refresh (excluding occurrence count)');
  // Release cells are explicitly present in both renders.
  assert.ok(drawerA.includes('data-testid="error-drawer-first-release"'));
  assert.ok(drawerB.includes('data-testid="error-drawer-last-release"'));
});
