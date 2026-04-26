// U9 coverage: AccountOpsMetadataRow renders the 409 conflict banner with
// a diff and two resolution buttons (Keep mine / Use theirs). The pure
// helper `buildAccountOpsMetadataConflictDiff` computes the diff rows; the
// SSR render asserts the banner surfaces + contains the expected buttons.
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U9

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
  buildAccountOpsMetadataConflictDiff,
  formatAccountOpsMetadataConflictValue,
} from '../src/platform/hubs/admin-metadata-conflict-diff.js';
// C2/C3 (Phase C reviewer fix): the "Keep mine" / "Use theirs" click
// handlers delegate to pure helpers. The component wires them; these
// tests exercise the dispatch payload + state-update decisions without
// JSDOM/RTL (neither of which is installed in this repo — see the
// resolver's deviation note).
import {
  buildKeepMineDispatchPayload,
  applyUseTheirsStateUpdate,
} from '../src/platform/hubs/admin-metadata-conflict-actions.js';

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
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-row-conflict-'));
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

// ---------------------------------------------------------------------
// 1. Pure diff helper.
// ---------------------------------------------------------------------

test('buildAccountOpsMetadataConflictDiff returns rows only for fields that differ', () => {
  const draft = {
    opsStatus: 'active',
    planLabel: 'Plan-A',
    tags: ['alpha', 'beta'],
    internalNotes: 'local note',
  };
  const currentState = {
    opsStatus: 'suspended',
    planLabel: 'Plan-A',
    tags: ['alpha', 'beta'],
    internalNotes: 'server note',
    rowVersion: 4,
  };
  const rows = buildAccountOpsMetadataConflictDiff(draft, currentState);
  const fields = rows.map((row) => row.field).sort();
  assert.deepEqual(fields, ['internalNotes', 'opsStatus']);
});

test('buildAccountOpsMetadataConflictDiff omits internalNotes when currentState echo is null (R25)', () => {
  // Ops-role 409 body nulls internalNotes. The banner must not surface a
  // diff for that field so the banner does not leak that an admin note
  // exists.
  const draft = { opsStatus: 'active', planLabel: '', tags: [], internalNotes: 'local secret' };
  const currentState = {
    opsStatus: 'suspended', planLabel: '', tags: [], internalNotes: null, rowVersion: 3,
  };
  const rows = buildAccountOpsMetadataConflictDiff(draft, currentState);
  assert.deepEqual(rows.map((row) => row.field), ['opsStatus']);
});

test('buildAccountOpsMetadataConflictDiff handles tag-array differences', () => {
  const draft = { opsStatus: 'active', planLabel: '', tags: ['alpha', 'gamma'], internalNotes: '' };
  const currentState = {
    opsStatus: 'active', planLabel: '', tags: ['alpha', 'beta'], internalNotes: '', rowVersion: 2,
  };
  const rows = buildAccountOpsMetadataConflictDiff(draft, currentState);
  assert.deepEqual(rows.map((row) => row.field), ['tags']);
  assert.equal(rows[0].draftValue, 'alpha, gamma');
  assert.equal(rows[0].serverValue, 'alpha, beta');
});

test('buildAccountOpsMetadataConflictDiff returns empty array when draft and server state match', () => {
  const draft = { opsStatus: 'suspended', planLabel: 'Plan-X', tags: ['t1'], internalNotes: 'same' };
  const currentState = {
    opsStatus: 'suspended', planLabel: 'Plan-X', tags: ['t1'], internalNotes: 'same', rowVersion: 5,
  };
  assert.deepEqual(buildAccountOpsMetadataConflictDiff(draft, currentState), []);
});

test('buildAccountOpsMetadataConflictDiff rejects non-objects gracefully', () => {
  assert.deepEqual(buildAccountOpsMetadataConflictDiff(null, null), []);
  assert.deepEqual(buildAccountOpsMetadataConflictDiff({}, null), []);
  assert.deepEqual(buildAccountOpsMetadataConflictDiff(null, {}), []);
});

// ---------------------------------------------------------------------
// 2. SSR render of the conflict banner.
// ---------------------------------------------------------------------

test('AccountOpsMetadataRow renders a conflict banner when account.conflict is set', async () => {
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
      accountOpsMetadata: { generatedAt: 1, accounts: [{
        accountId: 'adult-admin',
        email: 'admin@example.com',
        displayName: 'Admin',
        platformRole: 'admin',
        opsStatus: 'active',
        planLabel: 'Plan-X',
        tags: ['t1'],
        internalNotes: 'local note',
        updatedAt: 1,
        updatedByAccountId: '',
        rowVersion: 3,
        conflict: {
          at: 1,
          currentState: {
            accountId: 'adult-admin',
            opsStatus: 'suspended',
            planLabel: 'Plan-X',
            tags: ['t1'],
            internalNotes: 'server note',
            rowVersion: 4,
          },
        },
      }] },
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
        refreshStatus={{ inFlight: false, lastUpdatedAt: 0 }}
        refreshing={false}
        activeOpsMetadataSavingId={''}
        actions={actions}
        accessContext={accessContext}
        accountDirectory={accountDirectory}
      />
    );
    process.stdout.write(html);
  `);
  // Banner rendered.
  assert.match(html, /data-testid="account-ops-metadata-conflict-banner"/);
  assert.match(html, /data-account-id="adult-admin"/);
  // Diff rows for the two divergent fields (opsStatus + internalNotes).
  assert.match(html, /data-field="opsStatus"/);
  assert.match(html, /data-field="internalNotes"/);
  // Tags and planLabel match → should NOT produce diff rows.
  assert.doesNotMatch(html, /data-field="tags"/);
  assert.doesNotMatch(html, /data-field="planLabel"/);
  // Both resolution buttons present.
  assert.match(html, /data-action="account-ops-metadata-keep-mine"/);
  assert.match(html, /data-action="account-ops-metadata-use-theirs"/);
});

// ---------------------------------------------------------------------
// 3. Click handlers — C2/C3 pure-helper coverage.
//
// RTL/JSDOM are not installed. The React component delegates to pure
// helpers (admin-metadata-conflict-actions.js), so these tests exercise
// the production decision logic — the same code path that fires when a
// human clicks the buttons — without mounting a component tree.
// ---------------------------------------------------------------------

test('C2 Keep mine dispatch payload — carries fresh expectedRowVersion from 409 currentState', () => {
  const payload = buildKeepMineDispatchPayload({
    accountId: 'adult-parent',
    currentState: {
      accountId: 'adult-parent',
      opsStatus: 'suspended',
      planLabel: 'Plan-X',
      tags: ['t1'],
      internalNotes: 'server note',
      rowVersion: 4,
    },
    opsStatus: 'active',
    planLabel: 'Plan-MINE',
    tagsText: 'alpha, beta',
    internalNotes: 'local note',
  });
  assert.equal(payload.action, 'account-ops-metadata-save');
  assert.equal(payload.data.accountId, 'adult-parent');
  // The retry MUST carry the server-observed row_version (=4), NOT the
  // user's stale pre-image that triggered the 409 in the first place.
  assert.equal(payload.data.expectedRowVersion, 4);
  // The user's live draft (Plan-MINE, opsStatus=active) wins — that's the
  // whole point of Keep-mine.
  assert.equal(payload.data.patch.opsStatus, 'active');
  assert.equal(payload.data.patch.planLabel, 'Plan-MINE');
  assert.deepEqual(payload.data.patch.tags, ['alpha', 'beta']);
  assert.equal(payload.data.patch.internalNotes, 'local note');
});

test('C2 Keep mine — blank planLabel/internalNotes trim to null', () => {
  const payload = buildKeepMineDispatchPayload({
    accountId: 'adult-parent',
    currentState: { rowVersion: 2 },
    opsStatus: 'active',
    planLabel: '   ',
    tagsText: '',
    internalNotes: '   ',
  });
  assert.equal(payload.data.patch.planLabel, null);
  assert.equal(payload.data.patch.internalNotes, null);
  assert.deepEqual(payload.data.patch.tags, []);
});

test('C2 Keep mine — tags capped at 10 entries (matches server ceiling)', () => {
  const tagsText = Array.from({ length: 15 }, (_, i) => `tag-${i}`).join(', ');
  const payload = buildKeepMineDispatchPayload({
    accountId: 'adult-parent',
    currentState: { rowVersion: 1 },
    opsStatus: 'active',
    planLabel: 'Plan',
    tagsText,
    internalNotes: '',
  });
  assert.equal(payload.data.patch.tags.length, 10);
  assert.equal(payload.data.patch.tags[0], 'tag-0');
  assert.equal(payload.data.patch.tags[9], 'tag-9');
});

test('C2 Keep mine — missing currentState returns null (no dispatch fired)', () => {
  assert.equal(buildKeepMineDispatchPayload({ accountId: 'a' }), null);
  assert.equal(buildKeepMineDispatchPayload({ accountId: 'a', currentState: null }), null);
  assert.equal(buildKeepMineDispatchPayload({ accountId: '', currentState: { rowVersion: 1 } }), null);
});

test('C3 Use theirs — adopts server state verbatim', () => {
  const result = applyUseTheirsStateUpdate({
    accountId: 'adult-parent',
    currentState: {
      accountId: 'adult-parent',
      opsStatus: 'payment_hold',
      planLabel: 'Plan-SERVER',
      tags: ['server-a', 'server-b'],
      internalNotes: 'server note',
      rowVersion: 7,
    },
  });
  assert.equal(result.dispatch.action, 'account-ops-metadata-use-theirs');
  assert.equal(result.dispatch.data.accountId, 'adult-parent');
  assert.equal(result.nextState.opsStatus, 'payment_hold');
  assert.equal(result.nextState.planLabel, 'Plan-SERVER');
  assert.equal(result.nextState.tagsText, 'server-a, server-b');
  assert.equal(result.nextState.internalNotes, 'server note');
});

test('C3 Use theirs (R25) — ops-role null internalNotes normalises to empty string, never leaks diff', () => {
  // Ops-role viewers see `currentState.internalNotes = null` (R25 redaction).
  // The adopted local state must be '' (matching the component's empty-string
  // initialiser), NOT the literal `null` which would render as "null" in the
  // textarea and confuse the user. The pure helper enforces that default.
  const result = applyUseTheirsStateUpdate({
    accountId: 'adult-parent',
    currentState: {
      opsStatus: 'suspended',
      planLabel: null,
      tags: [],
      internalNotes: null,
      rowVersion: 3,
    },
  });
  assert.equal(result.nextState.internalNotes, '');
  assert.equal(result.nextState.planLabel, '');
  assert.equal(result.nextState.tagsText, '');
});

test('C3 Use theirs — missing currentState returns null (no state update, no dispatch)', () => {
  assert.equal(applyUseTheirsStateUpdate({ accountId: 'a' }), null);
  assert.equal(applyUseTheirsStateUpdate({ accountId: 'a', currentState: null }), null);
  assert.equal(applyUseTheirsStateUpdate({ accountId: '', currentState: { rowVersion: 1 } }), null);
});

test('AccountOpsMetadataRow does NOT render the conflict banner when account.conflict is null', async () => {
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
      accountOpsMetadata: { generatedAt: 1, accounts: [{
        accountId: 'adult-admin',
        email: 'admin@example.com',
        displayName: 'Admin',
        platformRole: 'admin',
        opsStatus: 'active',
        planLabel: 'Plan-X',
        tags: ['t1'],
        internalNotes: 'local note',
        updatedAt: 1,
        updatedByAccountId: '',
        rowVersion: 3,
        conflict: null,
      }] },
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
        refreshStatus={{ inFlight: false, lastUpdatedAt: 0 }}
        refreshing={false}
        activeOpsMetadataSavingId={''}
        actions={actions}
        accessContext={accessContext}
        accountDirectory={accountDirectory}
      />
    );
    process.stdout.write(html);
  `);
  assert.doesNotMatch(html, /data-testid="account-ops-metadata-conflict-banner"/);
});
