// Phase E / U18 coverage: the error-log-centre per-row <details> drawer.
//
// The drawer exposes release-tracking + full metadata with R25 redaction:
//   - admin sees all fields including `accountIdMasked`
//   - ops sees the same EXCEPT `accountIdMasked` is null / hidden
//
// NULL releases surface as the stable "unknown" fallback so the drawer
// renders cleanly on legacy events predating migration 0011 and on
// dirty-tree dev builds that stamped `null`.
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U18

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
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-error-drawer-'));
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

const adminHubSurfacePath = path.join(rootDir, 'src/surfaces/hubs/AdminHubSurface.jsx');

function drawerFixture({ platformRole, entry }) {
  // Render the full AdminHubSurface in admin or ops mode with a model
  // that includes exactly one error-log-centre entry. The surface
  // renders the drawer inline; we read the static markup back and
  // assert on the data-testid-tagged cells.
  return renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminHubSurface } from ${JSON.stringify(adminHubSurfacePath)};
    const model = {
      account: { id: 'adult-admin', repoRevision: 0, selectedLearnerId: null, platformRole: ${JSON.stringify(platformRole)} },
      permissions: { canViewAdminHub: true, platformRole: ${JSON.stringify(platformRole)}, platformRoleLabel: ${JSON.stringify(platformRole)} },
      learnerSupport: { accessibleLearners: [], selectedLearnerId: '', punctuationReleaseDiagnostics: {} },
      auditLogLookup: { entries: [] },
      demoOperations: { demoBuckets: [] },
      contentReleaseStatus: { publishedVersion: 1, publishedReleaseId: 'r1', runtimeWordCount: 0, runtimeSentenceCount: 0, currentDraftId: 'd1', currentDraftVersion: 1, draftUpdatedAt: 0 },
      importValidationStatus: { ok: true, errorCount: 0, warningCount: 0, errors: [], source: 'bundled baseline', importedAt: 0 },
      errorLogSummary: {
        generatedAt: 1_700_000_000_000,
        totals: { open: 1, investigating: 0, resolved: 0, ignored: 0, all: 1 },
        savingEventId: '',
        entries: [${JSON.stringify(entry)}],
      },
      dashboardKpis: { computedAt: 0, statusCounts: {}, retentionStatus: { lastSuccess: null }, reconcileInFlight: false },
      accountOpsMetadata: { generatedAt: 0, accounts: [] },
      opsActivityStream: { generatedAt: 0, entries: [] },
    };
    const html = renderToStaticMarkup(
      <AdminHubSurface
        appState={{ learners: { byId: {}, selectedId: null } }}
        model={model}
        hubState={{ status: 'ready' }}
        accountDirectory={{ accounts: [], status: 'idle' }}
        accessContext={{ shellAccess: { source: 'worker-session' } }}
        actions={{
          dispatch: () => {},
          openSubject: () => {},
          navigateHome: () => {},
          registerAccountOpsMetadataRowDirty: () => {},
        }}
      />
    );
    console.log(html);
  `);
}

const baseEntry = {
  id: 'evt-1',
  errorKind: 'TypeError',
  messageFirstLine: 'x is undefined',
  firstFrame: 'at foo (bar.js:1)',
  routeName: '/dashboard',
  userAgent: 'Mozilla/5.0',
  accountIdMasked: '••abcd12',
  occurrenceCount: 3,
  firstSeen: 1_700_000_000_000,
  lastSeen: 1_700_000_100_000,
  status: 'open',
  firstSeenRelease: 'abc1234',
  lastSeenRelease: 'def5678',
  resolvedInRelease: 'abc1234',
  lastStatusChangeAt: 1_700_000_050_000,
};

test('U18 drawer — admin view renders all fields including linked account', async () => {
  const html = await drawerFixture({ platformRole: 'admin', entry: baseEntry });
  assert.ok(html.includes('data-testid="error-event-row-evt-1"'), 'row anchor present');
  assert.ok(html.includes('data-testid="error-event-drawer-evt-1"'), 'drawer anchor present');
  assert.ok(html.includes('data-testid="error-drawer-first-release"'), 'first release cell');
  assert.ok(html.includes('abc1234'), 'first release value');
  assert.ok(html.includes('data-testid="error-drawer-last-release"'), 'last release cell');
  assert.ok(html.includes('def5678'), 'last release value');
  assert.ok(html.includes('data-testid="error-drawer-resolved-release"'), 'resolved release cell');
  assert.ok(html.includes('data-testid="error-drawer-account"'), 'account cell present for admin');
  assert.ok(html.includes('••abcd12'), 'account last 6 chars rendered');
});

test('U18 drawer — ops view hides linked account cell entirely', async () => {
  const html = await drawerFixture({ platformRole: 'ops', entry: baseEntry });
  assert.ok(html.includes('data-testid="error-event-drawer-evt-1"'), 'drawer anchor present');
  // Release cells still visible — release strings are not PII.
  assert.ok(html.includes('abc1234'));
  assert.ok(html.includes('def5678'));
  // Account cell is NOT rendered for ops per R25.
  assert.ok(!html.includes('data-testid="error-drawer-account"'), 'account cell hidden for ops');
  // The admin-only status select must ALSO be absent (canManage === false).
  assert.ok(html.includes('class="chip"'), 'ops sees status chip instead of select');
});

test('U18 drawer — NULL release columns render the "unknown" fallback stably', async () => {
  const html = await drawerFixture({
    platformRole: 'admin',
    entry: {
      ...baseEntry,
      firstSeenRelease: null,
      lastSeenRelease: null,
      resolvedInRelease: null,
    },
  });
  const extractCell = (testId) => {
    const match = html.match(new RegExp(`data-testid="${testId}"[^>]*>([^<]*)<`));
    return match ? match[1] : null;
  };
  assert.equal(extractCell('error-drawer-first-release'), 'unknown');
  assert.equal(extractCell('error-drawer-last-release'), 'unknown');
  assert.equal(extractCell('error-drawer-resolved-release'), 'unknown');
});

test('U18 drawer — missing lastStatusChangeAt renders "status unchanged"', async () => {
  const html = await drawerFixture({
    platformRole: 'admin',
    entry: {
      ...baseEntry,
      lastStatusChangeAt: null,
    },
  });
  const match = html.match(/data-testid="error-drawer-status-change"[^>]*>([^<]*)</);
  assert.ok(match, 'status-change cell present');
  assert.equal(match[1], 'status unchanged');
});

test('U18 drawer — messageFirstLine is mirrored into the drawer body', async () => {
  const html = await drawerFixture({ platformRole: 'admin', entry: baseEntry });
  const match = html.match(/data-testid="error-drawer-message"[^>]*>([^<]*)</);
  assert.ok(match);
  assert.equal(match[1], 'x is undefined');
});
