// P5 Unit 4: AdminProductionEvidencePanel rendering tests.
//
// Uses the same esbuild SSR harness as the characterization test suite to
// verify the panel renders correctly for fresh, stale, and missing states.

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
  // In worktrees, node_modules lives in the main repo root, not the worktree.
  // Walk up from rootDir to find the nearest node_modules.
  const candidates = [
    path.join(rootDir, 'node_modules'),
  ];
  let dir = rootDir;
  for (let i = 0; i < 5; i++) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
    candidates.push(path.join(dir, 'node_modules'));
  }
  return [
    ...candidates,
    ...String(process.env.NODE_PATH || '').split(path.delimiter),
  ].filter((entry) => entry && existsSync(entry));
}

function normaliseLineEndings(value) {
  return String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

async function renderFixture(entrySource) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-evidence-panel-'));
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

const PANEL_PATH = JSON.stringify(
  path.join(rootDir, 'src/surfaces/hubs/AdminProductionEvidencePanel.jsx'),
);

function buildEntry(model) {
  return `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminProductionEvidencePanel } from ${PANEL_PATH};
    const model = ${JSON.stringify(model)};
    const actions = { dispatch() {} };
    const html = renderToStaticMarkup(
      <AdminProductionEvidencePanel model={model} actions={actions} />
    );
    process.stdout.write(html);
  `;
}

// ---------------------------------------------------------------------------
// 1. Fresh evidence with passing 30-learner metric
// ---------------------------------------------------------------------------

test('renders fresh evidence panel with passing 30-learner certification', async () => {
  const now = Date.now();
  const freshDate = new Date(now - 60_000).toISOString();
  const model = {
    productionEvidence: {
      schema: 2,
      generatedAt: freshDate,
      metrics: {
        certified_30_learner_beta: {
          tier: 'certified_30_learner_beta',
          status: 'passed',
          ok: true,
          certifying: true,
          dryRun: false,
          learners: 30,
          finishedAt: freshDate,
          commit: 'abc1234',
          failures: [],
          fileName: '30-learner.json',
        },
      },
    },
  };
  const html = await renderFixture(buildEntry(model));

  assert.match(html, /Latest certification evidence/, 'renders panel title');
  assert.match(html, /data-panel-frame="Latest certification evidence"/, 'AdminPanelFrame wraps content');
  assert.match(html, /data-testid="evidence-panel-overall"/, 'overall state section present');
  assert.match(html, /data-evidence-state="certified_30_learner_beta"/, 'shows certified_30 badge');
  assert.match(html, /data-testid="evidence-metrics-table"/, 'metrics table present');
  assert.match(html, /30/, 'learner count shown');
  assert.match(html, /\(fresh\)/, 'shows fresh indicator');
});

// ---------------------------------------------------------------------------
// 2. Stale evidence (generatedAt older than 24h)
// ---------------------------------------------------------------------------

test('renders stale evidence panel when generatedAt exceeds 24h', async () => {
  const now = Date.now();
  const staleDate = new Date(now - 25 * 60 * 60 * 1000).toISOString();
  const model = {
    productionEvidence: {
      schema: 2,
      generatedAt: staleDate,
      metrics: {
        certified_30_learner_beta: {
          tier: 'certified_30_learner_beta',
          status: 'passed',
          ok: true,
          certifying: true,
          dryRun: false,
          learners: 30,
          finishedAt: staleDate,
          commit: 'abc1234',
          failures: [],
          fileName: '30-learner.json',
        },
      },
    },
  };
  const html = await renderFixture(buildEntry(model));

  assert.match(html, /Latest certification evidence/, 'renders panel title');
  assert.match(html, /data-evidence-state="stale"/, 'overall state is stale');
  assert.match(html, /\(stale\)/, 'shows stale indicator');
});

// ---------------------------------------------------------------------------
// 3. Missing / null evidence (placeholder summary)
// ---------------------------------------------------------------------------

test('renders empty state when evidence summary has no metrics', async () => {
  const model = {
    productionEvidence: { schema: 2, metrics: {}, generatedAt: null },
  };
  const html = await renderFixture(buildEntry(model));

  assert.match(html, /Latest certification evidence/, 'renders panel title');
  assert.match(html, /data-panel-frame-empty="true"/, 'shows empty state');
  assert.match(html, /Latest evidence: Not available/, 'shows empty state message');
});

// ---------------------------------------------------------------------------
// 4. Null productionEvidence in model
// ---------------------------------------------------------------------------

test('renders empty state when productionEvidence is absent from model', async () => {
  const model = {};
  const html = await renderFixture(buildEntry(model));

  assert.match(html, /Latest certification evidence/, 'renders panel title');
  assert.match(html, /data-panel-frame-empty="true"/, 'shows empty state');
});

// ---------------------------------------------------------------------------
// 5. Failing evidence
// ---------------------------------------------------------------------------

test('renders failing state when evidence has failures', async () => {
  const now = Date.now();
  const freshDate = new Date(now - 60_000).toISOString();
  const model = {
    productionEvidence: {
      schema: 2,
      generatedAt: freshDate,
      metrics: {
        certified_30_learner_beta: {
          tier: 'certified_30_learner_beta',
          status: 'failed',
          ok: false,
          certifying: false,
          dryRun: false,
          learners: 30,
          finishedAt: freshDate,
          commit: 'abc1234',
          failures: ['max5xx'],
          thresholdViolations: [
            {
              threshold: 'max-bootstrap-p95-ms',
              limit: 1000,
              observed: 1167.4,
              message: 'Bootstrap P95 wall time 1167.4 ms exceeds 1000 ms.',
            },
          ],
          fileName: '30-fail.json',
        },
      },
    },
  };
  const html = await renderFixture(buildEntry(model));

  assert.match(html, /data-evidence-state="failing"/, 'shows failing badge');
  assert.match(html, /Failed/, 'failed label present');
  assert.match(html, /Bootstrap P95 wall time 1167.4 ms exceeds 1000 ms/, 'threshold violation present');
});

// ---------------------------------------------------------------------------
// 6. Multiple tiers with mixed states
// ---------------------------------------------------------------------------

test('renders multiple metric rows in table', async () => {
  const now = Date.now();
  const freshDate = new Date(now - 60_000).toISOString();
  const model = {
    productionEvidence: {
      schema: 2,
      generatedAt: freshDate,
      metrics: {
        smoke_pass: {
          tier: 'smoke_pass',
          status: 'passed',
          ok: true,
          dryRun: false,
          learners: 1,
          finishedAt: freshDate,
          commit: 'aaa1111',
          failures: [],
          fileName: 'smoke.json',
        },
        certified_60_learner_stretch: {
          tier: 'certified_60_learner_stretch',
          status: 'passed',
          ok: true,
          certifying: true,
          dryRun: false,
          learners: 60,
          finishedAt: freshDate,
          commit: 'bbb2222',
          failures: [],
          fileName: '60-learner.json',
        },
      },
    },
  };
  const html = await renderFixture(buildEntry(model));

  assert.match(html, /data-metric-key="smoke_pass"/, 'smoke row present');
  assert.match(html, /data-metric-key="certified_60_learner_stretch"/, '60-learner row present');
  assert.match(html, /data-evidence-state="certified_60_learner_stretch"/, 'highest tier badge shown');
});

// ---------------------------------------------------------------------------
// 7. Non-certifying preflight evidence
// ---------------------------------------------------------------------------

test('renders 60-learner preflight as non-certifying rather than certified', async () => {
  const now = Date.now();
  const freshDate = new Date(now - 60_000).toISOString();
  const model = {
    productionEvidence: {
      schema: 2,
      generatedAt: freshDate,
      metrics: {
        certified_60_learner_stretch: {
          tier: 'certified_60_learner_stretch',
          status: 'non_certifying',
          ok: false,
          certifying: false,
          dryRun: false,
          evidenceKind: 'preflight',
          decision: 'invalid-with-named-setup-blocker',
          failureReason: 'session-manifest-preparation-rate-limited',
          learners: 60,
          finishedAt: '2026-04-28T00:00:00.000Z',
          commit: '0f744c3',
          failures: [],
          thresholdViolations: [],
          fileName: '60-learner-stretch-preflight-20260428-p5.json',
        },
      },
    },
  };
  const html = await renderFixture(buildEntry(model));

  assert.match(html, /data-evidence-state="non_certifying"/, 'shows non-certifying badge');
  assert.doesNotMatch(html, /Certified: 60-learner stretch/, 'does not render 60-learner certification');
  assert.match(html, /Reason: session-manifest-preparation-rate-limited/, 'shows setup blocker reason');
});
