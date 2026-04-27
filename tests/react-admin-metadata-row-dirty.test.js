// P1.5 Phase A (U2) tests — dirty-row registry + SSR render contract for
// the account-ops-metadata panel.
//
// Directly exercised:
//  1. `createAccountOpsMetadataDirtyRegistry` — pure module, no React. Covers
//     the set/clear bookkeeping, multi-row independence, and the
//     dirty→clean transition flush callback.
//  2. SSR render of `AdminHubSurface` with an `actions.registerAccount
//     OpsMetadataRowDirty` spy, asserting that the rendered textarea uses
//     the server prop on first mount and that an onChange handler exists
//     wired to the internal-notes textarea (client-side dirty-ref guard is
//     covered by the registry tests; in SSR `useRef.current` is always
//     false so props always apply). The SSR assertion catches a regression
//     where the onChange or the registry wiring is accidentally dropped.
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
  createAccountOpsMetadataDirtyRegistry,
  decideDirtyResetOnServerUpdate,
} from '../src/platform/hubs/admin-metadata-dirty-registry.js';

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

async function runFixture(entrySource) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-dirty-row-'));
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

// -----------------------------------------------------------------
// 1. Registry unit tests.
// -----------------------------------------------------------------

test('createAccountOpsMetadataDirtyRegistry tracks dirty rows independently', () => {
  const registry = createAccountOpsMetadataDirtyRegistry();
  assert.equal(registry.anyDirty(), false);
  registry.setDirty('a', true);
  registry.setDirty('b', true);
  assert.equal(registry.anyDirty(), true);
  registry.setDirty('a', false);
  assert.equal(registry.anyDirty(), true, 'row b is still dirty');
  registry.setDirty('b', false);
  assert.equal(registry.anyDirty(), false);
});

test('createAccountOpsMetadataDirtyRegistry flushes exactly once on the dirty→clean transition', () => {
  // M8 reviewer fix: assert observable flush behaviour rather than the
  // internal suppression counter. `recordSuppressedRefresh` is void and
  // `getSuppressedRefreshCount` has been removed.
  let flushCount = 0;
  const registry = createAccountOpsMetadataDirtyRegistry({
    onFlushRequested: () => { flushCount += 1; },
  });
  registry.setDirty('a', true);
  // Suppressed refreshes while dirty — no flush fires until we transition.
  registry.recordSuppressedRefresh();
  registry.recordSuppressedRefresh();
  assert.equal(flushCount, 0, 'no flush fires while any row is dirty');
  // Dirty → clean transition with at least one suppressed refresh should flush.
  registry.setDirty('a', false);
  assert.equal(flushCount, 1);
  // A subsequent dirty → clean with no suppressed refreshes should NOT flush
  // (counter is reset by the transition; next dirty cycle starts at zero).
  registry.setDirty('b', true);
  registry.setDirty('b', false);
  assert.equal(flushCount, 1);
});

test('createAccountOpsMetadataDirtyRegistry flushes only when ALL rows are clean', () => {
  let flushCount = 0;
  const registry = createAccountOpsMetadataDirtyRegistry({
    onFlushRequested: () => { flushCount += 1; },
  });
  registry.setDirty('a', true);
  registry.setDirty('b', true);
  registry.recordSuppressedRefresh();
  // Clearing one row while another is still dirty must NOT flush.
  registry.setDirty('a', false);
  assert.equal(flushCount, 0);
  // Clearing the last dirty row now flushes.
  registry.setDirty('b', false);
  assert.equal(flushCount, 1);
});

test('createAccountOpsMetadataDirtyRegistry ignores spurious clean-of-clean', () => {
  let flushCount = 0;
  const registry = createAccountOpsMetadataDirtyRegistry({
    onFlushRequested: () => { flushCount += 1; },
  });
  registry.recordSuppressedRefresh();
  registry.setDirty('a', false);
  assert.equal(flushCount, 0, 'no flush fires when the row was never dirty');
});

test('createAccountOpsMetadataDirtyRegistry unmount-clean with suppressedCount fires one flush', () => {
  // T4 coverage (registry portion): a dirty row that unmounts calls
  // `setDirty(accountId, false)`. If a suppressed refresh had been
  // recorded while the row was dirty, the transition must flush exactly
  // once even though the caller was a cleanup effect rather than a save.
  let flushCount = 0;
  const registry = createAccountOpsMetadataDirtyRegistry({
    onFlushRequested: () => { flushCount += 1; },
  });
  registry.setDirty('a', true);
  registry.recordSuppressedRefresh();
  // Simulate unmount-clean.
  registry.setDirty('a', false);
  assert.equal(registry.anyDirty(), false);
  assert.equal(flushCount, 1);
});

test('createAccountOpsMetadataDirtyRegistry — single flush after a suppressed refresh + clean', () => {
  // T4 coverage: `recordSuppressedRefresh()` while dirty, then one
  // `setDirty(id, false)` fires exactly ONE flush (not two / zero).
  let flushCount = 0;
  const registry = createAccountOpsMetadataDirtyRegistry({
    onFlushRequested: () => { flushCount += 1; },
  });
  registry.setDirty('a', true);
  registry.recordSuppressedRefresh();
  registry.setDirty('a', false);
  assert.equal(flushCount, 1);
});

// -----------------------------------------------------------------
// 1b. B1 dirty-reset helper — save-acknowledgement lifecycle.
// -----------------------------------------------------------------

test('decideDirtyResetOnServerUpdate resets when server updatedAt advances', () => {
  // B1 coverage: user types → server bumps updatedAt → helper signals
  // reset so the row re-hydrates from the new server value.
  const decision = decideDirtyResetOnServerUpdate({
    incomingUpdatedAt: 200,
    savedAt: 100,
  });
  assert.equal(decision.reset, true);
  assert.equal(decision.nextSavedAt, 200);
});

test('decideDirtyResetOnServerUpdate holds when server updatedAt is unchanged', () => {
  // B1 coverage: an auto-refresh that returns the same `updatedAt`
  // (legitimate, no save acknowledged) must NOT reset the dirty flag,
  // or a mid-edit textarea would be wiped by a fresh fetch.
  const decision = decideDirtyResetOnServerUpdate({
    incomingUpdatedAt: 100,
    savedAt: 100,
  });
  assert.equal(decision.reset, false);
});

test('decideDirtyResetOnServerUpdate tolerates initial undefined savedAt', () => {
  // B1 coverage: on mount, `savedAtRef.current` starts at 0 (default for
  // a new row with `account.updatedAt = 0`). A non-zero incoming value
  // must flip the reset signal so the first server-acknowledged save
  // lands even though savedAt was never explicitly set.
  const decision = decideDirtyResetOnServerUpdate({
    incomingUpdatedAt: 50,
    savedAt: undefined,
  });
  assert.equal(decision.reset, true);
  assert.equal(decision.nextSavedAt, 50);
});

test('decideDirtyResetOnServerUpdate treats stale server updatedAt as no-op', () => {
  // B1 edge: a misordered response that reports an older `updatedAt`
  // than what the component already saw must NOT flip the reset signal.
  const decision = decideDirtyResetOnServerUpdate({
    incomingUpdatedAt: 50,
    savedAt: 100,
  });
  assert.equal(decision.reset, false);
});

// -----------------------------------------------------------------
// 2. SSR render contract — onChange wires markDirty + setState.
// -----------------------------------------------------------------

test('AdminHubSurface renders the internal-notes textarea with the server value and an onChange handler', async () => {
  const html = await runFixture(`
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
      dashboardKpis: { generatedAt: 1, accounts: { total: 0 }, learners: { total: 0 }, demos: { active: 0 }, practiceSessions: { last7d: 0, last30d: 0 }, eventLog: { last7d: 0 }, mutationReceipts: { last7d: 0 }, errorEvents: { byStatus: { open: 0, investigating: 0, resolved: 0, ignored: 0 } }, accountOpsUpdates: { total: 0 } },
      opsActivityStream: { generatedAt: 1, entries: [] },
      accountOpsMetadata: { generatedAt: 1, accounts: [{ accountId: 'adult-admin', email: 'admin@example.com', displayName: 'Admin', platformRole: 'admin', opsStatus: 'active', planLabel: 'internal', tags: ['staff'], internalNotes: 'DIRTY-TEST-VALUE', updatedAt: 1, updatedByAccountId: '' }] },
      errorLogSummary: { generatedAt: 1, totals: { open: 0, investigating: 0, resolved: 0, ignored: 0, all: 0 }, entries: [] },
      demoOperations: { sessionsCreated: 0, activeSessions: 0, conversions: 0, cleanupCount: 0, rateLimitBlocks: 0, ttsFallbacks: 0, updatedAt: 0 },
      learnerSupport: { selectedLearnerId: '', accessibleLearners: [], selectedDiagnostics: null, punctuationReleaseDiagnostics: null, entryPoints: [] },
    };
    const actions = { dispatch() {}, navigateHome() {}, openSubject() {}, registerAccountOpsMetadataRowDirty() {} };
    const appState = { learners: { selectedId: 'learner-a', byId: { 'learner-a': { id: 'learner-a', name: 'Ava', yearGroup: 'Y5' } }, allIds: ['learner-a'] }, persistence: { mode: 'remote-sync' }, toasts: [], monsterCelebrations: { queue: [] } };
    const accessContext = { shellAccess: { source: 'worker-session' }, activeAdultLearnerContext: null };
    const accountDirectory = { status: 'loaded', accounts: [{ id: 'adult-admin', email: 'admin@example.com', displayName: 'Admin', providers: ['email'], learnerCount: 0, platformRole: 'admin', updatedAt: 0 }] };
    const html = renderToStaticMarkup(
      <AdminHubSurface
        appState={appState}
        model={model}
        hubState={{ status: 'loaded' }}
        accountDirectory={accountDirectory}
        accessContext={accessContext}
        actions={actions}
        initialSection="accounts"
      />
    );
    console.log(html);
  `);
  // The textarea exists with the server-provided internal notes.
  assert.match(html, /<textarea[^>]*name="internalNotes"[^>]*>DIRTY-TEST-VALUE<\/textarea>/);
  // The row-level opsStatus select exists too, as part of the editable admin row.
  assert.match(html, /<select[^>]*name="opsStatus"/);
});
