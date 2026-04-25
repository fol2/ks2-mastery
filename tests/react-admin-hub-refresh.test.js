// P1.5 Phase A (U1) tests — admin-ops narrow-refresh envelope surfacing.
//
// Covers:
//  1. `routeAdminRefreshError` — authoritative error-code → banner envelope
//     router, including the global-handler / delegate / silent flags. Pure
//     module test — no JSX / DOM needed.
//  2. `applyAdminHubPanelRefreshError` + success patch helpers — state
//     transitions around the refresh envelope.
//  3. `<PanelHeader>` — shared SSR rendering of `generatedAt` plus the
//     routed banner. Runs through an esbuild-bundled subprocess the same
//     way `tests/react-hub-surfaces.test.js` does (node --test cannot
//     consume `.jsx` imports directly, so we bundle the SSR entry for each
//     scenario and read the rendered markup back from stdout).
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
  ADMIN_REFRESH_ERROR_CODES,
  routeAdminRefreshError,
} from '../src/platform/hubs/admin-refresh-error-text.js';
import {
  applyAdminHubAccountOpsMetadataPatch,
  applyAdminHubDashboardKpisPatch,
  applyAdminHubPanelRefreshError,
} from '../src/platform/hubs/admin-panel-patches.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function nodePaths() {
  return [
    path.join(rootDir, 'node_modules'),
    ...String(process.env.NODE_PATH || '').split(path.delimiter),
  ].filter((entry) => entry && existsSync(entry));
}

// CRLF guard: Windows worktrees write fixture output through the OS shell,
// which injects \r\n in execFileSync's utf8 return value. Normalise before
// any regex compare.
function normaliseLineEndings(value) {
  return String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

async function renderFixture(entrySource) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-admin-refresh-'));
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

function panelHeaderFixture({ refreshError, generatedAt = Date.UTC(2026, 0, 1, 12, 0) } = {}) {
  return renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { PanelHeader } from ${JSON.stringify(path.join(rootDir, 'src/surfaces/hubs/admin-panel-header.jsx'))};
    const html = renderToStaticMarkup(
      <PanelHeader
        eyebrow="Dashboard KPI"
        title="Dashboard overview"
        generatedAt={${JSON.stringify(generatedAt)}}
        refreshError={${JSON.stringify(refreshError)}}
        onRefresh={() => {}}
      />
    );
    console.log(html);
  `);
}

// -----------------------------------------------------------------
// 1. Pure router unit tests.
// -----------------------------------------------------------------

test('routeAdminRefreshError maps rate_limited to a retry-able throttle banner', () => {
  const result = routeAdminRefreshError('rate_limited');
  assert.equal(result.text, 'Refresh throttled — retry in a moment');
  assert.equal(result.kind, 'warn');
  assert.equal(result.hasRetry, true);
  assert.ok(!result.globalHandler);
  assert.ok(!result.delegate);
  assert.ok(!result.silent);
});

test('routeAdminRefreshError maps admin_hub_forbidden to an error banner with re-auth CTA', () => {
  const result = routeAdminRefreshError('admin_hub_forbidden');
  assert.equal(result.text, 'Your session no longer has permission — please sign in again');
  assert.equal(result.kind, 'error');
  assert.equal(result.hasRetry, false);
  assert.equal(result.ctaKind, 're-auth');
});

test('routeAdminRefreshError hands session_invalidated off to the global handler', () => {
  const result = routeAdminRefreshError('session_invalidated');
  assert.equal(result.globalHandler, 'global.session-invalidated');
  assert.ok(!result.text, 'no banner text should be emitted; handler replaces the panel');
});

test('routeAdminRefreshError hands account_suspended off to the global handler', () => {
  const result = routeAdminRefreshError('account_suspended');
  assert.equal(result.globalHandler, 'global.account-suspended');
  assert.equal(result.kind, 'error');
});

test('routeAdminRefreshError surfaces account_payment_hold as a warn banner', () => {
  const result = routeAdminRefreshError('account_payment_hold');
  assert.equal(result.text, 'This action requires active billing. Contact ops.');
  assert.equal(result.kind, 'warn');
  assert.equal(result.ctaKind, 'billing');
});

test('routeAdminRefreshError delegates account_ops_metadata_stale to the row-conflict banner', () => {
  const result = routeAdminRefreshError('account_ops_metadata_stale');
  assert.equal(result.delegate, 'row-conflict');
  assert.ok(!result.text);
});

test('routeAdminRefreshError marks validation_failed silent so the form owns the error', () => {
  const result = routeAdminRefreshError('validation_failed');
  assert.equal(result.silent, true);
  assert.ok(!result.text);
});

test('routeAdminRefreshError falls back to a generic network banner with retry + correlation id', () => {
  const anonymous = routeAdminRefreshError(null);
  assert.ok(anonymous.text.includes('Refresh failed'));
  assert.equal(anonymous.hasRetry, true);
  const withCorrelation = routeAdminRefreshError('unknown-code', { correlationId: 'corr-123' });
  assert.ok(withCorrelation.text.includes('corr-123'));
});

test('ADMIN_REFRESH_ERROR_CODES includes every P1.5-referenced code', () => {
  const expected = [
    'rate_limited',
    'admin_hub_forbidden',
    'session_invalidated',
    'account_suspended',
    'account_payment_hold',
    'self_suspend_forbidden',
    'last_admin_locked_out',
    'account_ops_metadata_stale',
    'reconcile_in_progress',
    'validation_failed',
  ];
  for (const code of expected) {
    assert.ok(
      ADMIN_REFRESH_ERROR_CODES.includes(code),
      `expected admin-refresh-error-text registry to include '${code}'`,
    );
  }
});

// -----------------------------------------------------------------
// 2. Pure state-patch unit tests.
// -----------------------------------------------------------------

test('applyAdminHubPanelRefreshError writes the envelope without stomping other panels', () => {
  const adminHub = {
    dashboardKpis: { generatedAt: 10, refreshedAt: 10 },
    opsActivityStream: { generatedAt: 11 },
    errorLogSummary: { generatedAt: 12 },
    accountOpsMetadata: { generatedAt: 13 },
  };
  const next = applyAdminHubPanelRefreshError(adminHub, 'dashboardKpis', {
    code: 'rate_limited',
    message: 'throttled',
    at: 50,
  });
  assert.equal(next.dashboardKpis.refreshError.code, 'rate_limited');
  // Preserve refreshedAt verbatim so the header still shows the last
  // successful refresh timestamp alongside the new error banner.
  assert.equal(next.dashboardKpis.refreshedAt, 10);
  // Sibling panels untouched.
  assert.equal(next.opsActivityStream, adminHub.opsActivityStream);
  assert.equal(next.errorLogSummary, adminHub.errorLogSummary);
  assert.equal(next.accountOpsMetadata, adminHub.accountOpsMetadata);
});

test('applyAdminHubDashboardKpisPatch clears refreshError on success and copies generatedAt into refreshedAt', () => {
  const adminHub = {
    dashboardKpis: {
      generatedAt: 10,
      refreshedAt: 10,
      refreshError: { code: 'rate_limited', message: 'throttled', at: 50 },
    },
  };
  const nextKpis = applyAdminHubDashboardKpisPatch(adminHub, {
    generatedAt: 200,
    accounts: { total: 3 },
  });
  assert.equal(nextKpis.dashboardKpis.refreshError, null);
  assert.equal(nextKpis.dashboardKpis.refreshedAt, 200);
  assert.equal(nextKpis.dashboardKpis.accounts.total, 3);
});

test('applyAdminHubAccountOpsMetadataPatch preserves savingAccountId on successful refresh', () => {
  const adminHub = {
    accountOpsMetadata: {
      generatedAt: 5,
      savingAccountId: 'adult-admin',
      refreshError: { code: 'network', message: 'boom', at: 50 },
    },
  };
  const next = applyAdminHubAccountOpsMetadataPatch(adminHub, {
    generatedAt: 20,
    accounts: [],
  });
  assert.equal(next.accountOpsMetadata.savingAccountId, 'adult-admin');
  assert.equal(next.accountOpsMetadata.refreshError, null);
  assert.equal(next.accountOpsMetadata.refreshedAt, 20);
});

// -----------------------------------------------------------------
// 3. SSR tests for <PanelHeader> via the esbuild-bundled subprocess harness.
// -----------------------------------------------------------------

test('PanelHeader renders the Generated chip and no banner when refreshError is null', async () => {
  const html = await panelHeaderFixture({ refreshError: null });
  assert.match(html, /Generated/);
  assert.doesNotMatch(html, /data-admin-refresh-error-code/);
});

test('PanelHeader renders a throttle banner with a retry CTA when code is rate_limited', async () => {
  const html = await panelHeaderFixture({
    refreshError: { code: 'rate_limited', message: 'throttled', at: 50 },
  });
  assert.match(html, /Refresh throttled/);
  assert.match(html, /Retry refresh/);
  assert.match(html, /data-admin-refresh-error-code="rate_limited"/);
});

test('PanelHeader skips the banner when the error hands off to a global handler', async () => {
  const html = await panelHeaderFixture({
    refreshError: { code: 'account_suspended', message: '', at: 50 },
  });
  assert.doesNotMatch(html, /data-admin-refresh-error-code/);
});

test('PanelHeader skips the banner when the error delegates to the row-conflict UI', async () => {
  const html = await panelHeaderFixture({
    refreshError: { code: 'account_ops_metadata_stale', message: 'stale', at: 50 },
  });
  assert.doesNotMatch(html, /data-admin-refresh-error-code/);
});

test('PanelHeader skips the banner for silent validation_failed responses', async () => {
  const html = await panelHeaderFixture({
    refreshError: { code: 'validation_failed', message: '', at: 50 },
  });
  assert.doesNotMatch(html, /data-admin-refresh-error-code/);
});

test('PanelHeader renders a network banner with correlation id when provided', async () => {
  const html = await panelHeaderFixture({
    refreshError: { code: 'network', message: 'fetch failed', at: 50, correlationId: 'abc-123' },
  });
  assert.match(html, /Refresh failed/);
  assert.match(html, /abc-123/);
  assert.match(html, /data-admin-refresh-error-code="network"/);
});
