// U10 (Admin Console P7): Content quality summary test suite.
//
// Validates the buildContentQualitySummary() reducer and the
// ContentQualitySummaryPanel rendered by AdminContentSection.jsx.
//
// Test scenarios:
//   1. Subject with quality signal data renders "Good learning signal"
//   2. Subject with no data renders "No data yet" (not zero counts)
//   3. Subject with signal endpoint failure renders "Signal unavailable"
//   4. Placeholder subject renders "Signal unavailable", not fabricated data
//   5. Attention priority ordering (blocked > no_data > unavailable > good)
//   6. buildContentQualitySummary does not import any subject content bundles

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function nodePaths() {
  const candidates = [path.join(rootDir, 'node_modules')];
  let current = rootDir;
  for (let i = 0; i < 10; i += 1) {
    const parent = path.dirname(current);
    if (parent === current) break;
    candidates.push(path.join(parent, 'node_modules'));
    current = parent;
  }
  return [
    ...candidates,
    ...String(process.env.NODE_PATH || '').split(path.delimiter),
  ].filter((entry) => entry && existsSync(entry));
}

function normaliseLineEndings(value) {
  return String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// ---------------------------------------------------------------
// Pure adapter tests (no DOM / SSR — runs the module directly).
// ---------------------------------------------------------------

async function runAdapterScript(script) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-quality-summary-'));
  const entryPath = path.join(tmpDir, 'entry.mjs');
  const bundlePath = path.join(tmpDir, 'entry.cjs');
  try {
    await writeFile(entryPath, script);
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
    return JSON.parse(normaliseLineEndings(output).replace(/\n+$/, ''));
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

const SIGNALS_PATH = JSON.stringify(
  path.join(rootDir, 'src/platform/hubs/admin-content-quality-signals.js'),
);

// ---------------------------------------------------------------
// SSR rendering harness.
// ---------------------------------------------------------------

const CONTENT_SECTION_PATH = JSON.stringify(
  path.join(rootDir, 'src/surfaces/hubs/AdminContentSection.jsx'),
);

async function renderSSR(modelJson) {
  const script = `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminContentSection } from ${CONTENT_SECTION_PATH};

    const model = ${modelJson};
    const actions = { dispatch() {}, openSubject() {} };
    const accessContext = { role: 'admin' };
    const html = renderToStaticMarkup(
      React.createElement(AdminContentSection, { model, appState: {}, accessContext, actions })
    );
    console.log(JSON.stringify({ html }));
  `;
  return runAdapterScript(script);
}

// ---------------------------------------------------------------
// 1. Subject with quality signal data renders "Good learning signal"
// ---------------------------------------------------------------

describe('ContentQualitySummaryPanel', () => {
  it('subject with quality signal data renders "Good learning signal"', async () => {
    const model = JSON.stringify({
      account: { id: 'admin-1' },
      permissions: { platformRole: 'admin', canManageMonsterVisualConfig: true },
      monsterVisualConfig: { permissions: { canManageMonsterVisualConfig: true, canViewMonsterVisualConfig: true }, status: {}, draft: {}, published: {}, versions: [], mutation: {} },
      contentReleaseStatus: { publishedVersion: 1, publishedReleaseId: 'r1', runtimeWordCount: 10, runtimeSentenceCount: 5, currentDraftId: 'd1', currentDraftVersion: 1, draftUpdatedAt: 0 },
      importValidationStatus: { ok: true, errorCount: 0, warningCount: 0, source: 'test', importedAt: 0, errors: [] },
      learnerSupport: { selectedLearnerId: '', accessibleLearners: [], selectedDiagnostics: null, entryPoints: [] },
      postMegaSeedHarness: { shapes: [] },
      contentOverview: { subjects: [] },
      contentQualitySignals: {
        subjectSignals: [
          {
            subjectKey: 'spelling',
            subjectName: 'Spelling',
            signals: {
              skillCoverage: { status: 'available', value: 14, total: 18 },
              templateCoverage: { status: 'available', value: 40, total: 50 },
              itemCoverage: { status: 'available', value: 80, total: 100 },
              commonMisconceptions: { status: 'available', items: [] },
              highWrongRate: { status: 'available', items: [] },
              recentlyChangedUnevidenced: { status: 'available', items: [] },
            },
          },
        ],
      },
    });

    const { html } = await renderSSR(model);
    assert.ok(html.includes('Good learning signal'), 'Should show "Good learning signal"');
    assert.ok(html.includes('data-testid="quality-status-spelling"'), 'Should have spelling status testid');
    assert.ok(html.includes('100% coverage'), 'Should show 100% coverage when all subjects have data');
  });

  // ---------------------------------------------------------------
  // 2. Subject with no data renders "No data yet" (not zero counts)
  // ---------------------------------------------------------------

  it('subject with no data renders "No data yet" not zero counts', async () => {
    const model = JSON.stringify({
      account: { id: 'admin-1' },
      permissions: { platformRole: 'admin', canManageMonsterVisualConfig: true },
      monsterVisualConfig: { permissions: { canManageMonsterVisualConfig: true, canViewMonsterVisualConfig: true }, status: {}, draft: {}, published: {}, versions: [], mutation: {} },
      contentReleaseStatus: { publishedVersion: 1, publishedReleaseId: 'r1', runtimeWordCount: 10, runtimeSentenceCount: 5, currentDraftId: 'd1', currentDraftVersion: 1, draftUpdatedAt: 0 },
      importValidationStatus: { ok: true, errorCount: 0, warningCount: 0, source: 'test', importedAt: 0, errors: [] },
      learnerSupport: { selectedLearnerId: '', accessibleLearners: [], selectedDiagnostics: null, entryPoints: [] },
      postMegaSeedHarness: { shapes: [] },
      contentOverview: { subjects: [] },
      contentQualitySignals: {
        subjectSignals: [
          {
            subjectKey: 'grammar',
            subjectName: 'Grammar',
            signals: {
              skillCoverage: { status: 'not_available', value: 0, total: 0 },
              templateCoverage: { status: 'not_available', value: 0, total: 0 },
              itemCoverage: { status: 'not_available', value: 0, total: 0 },
              commonMisconceptions: { status: 'not_available', items: [] },
              highWrongRate: { status: 'not_available', items: [] },
              recentlyChangedUnevidenced: { status: 'not_available', items: [] },
            },
          },
        ],
      },
    });

    const { html } = await renderSSR(model);
    assert.ok(html.includes('No data yet'), 'Should show "No data yet"');
    assert.ok(!html.includes('0 / 0'), 'Should NOT show fabricated zero counts');
    assert.ok(html.includes('data-quality-status="no_data_yet"'), 'Row should have no_data_yet status');
  });

  // ---------------------------------------------------------------
  // 3. Subject with signal endpoint failure renders "Signal unavailable"
  // ---------------------------------------------------------------

  it('subject with signal endpoint failure renders "Signal unavailable"', async () => {
    const model = JSON.stringify({
      account: { id: 'admin-1' },
      permissions: { platformRole: 'admin', canManageMonsterVisualConfig: true },
      monsterVisualConfig: { permissions: { canManageMonsterVisualConfig: true, canViewMonsterVisualConfig: true }, status: {}, draft: {}, published: {}, versions: [], mutation: {} },
      contentReleaseStatus: { publishedVersion: 1, publishedReleaseId: 'r1', runtimeWordCount: 10, runtimeSentenceCount: 5, currentDraftId: 'd1', currentDraftVersion: 1, draftUpdatedAt: 0 },
      importValidationStatus: { ok: true, errorCount: 0, warningCount: 0, source: 'test', importedAt: 0, errors: [] },
      learnerSupport: { selectedLearnerId: '', accessibleLearners: [], selectedDiagnostics: null, entryPoints: [] },
      postMegaSeedHarness: { shapes: [] },
      contentOverview: { subjects: [] },
      contentQualitySignals: {
        subjectSignals: [
          {
            subjectKey: 'arithmetic',
            subjectName: 'Arithmetic',
            signals: {
              skillCoverage: { status: 'partial', value: 0, total: 0 },
              templateCoverage: { status: 'partial', value: 0, total: 0 },
              itemCoverage: { status: 'partial', value: 0, total: 0 },
              commonMisconceptions: { status: 'partial', items: [] },
              highWrongRate: { status: 'partial', items: [] },
              recentlyChangedUnevidenced: { status: 'partial', items: [] },
            },
          },
        ],
      },
    });

    const { html } = await renderSSR(model);
    assert.ok(html.includes('Signal unavailable'), 'Should show "Signal unavailable"');
    assert.ok(html.includes('data-quality-status="signal_unavailable"'), 'Row should have signal_unavailable status');
  });

  // ---------------------------------------------------------------
  // 4. Placeholder subject renders "Signal unavailable", not fabricated data
  // ---------------------------------------------------------------

  it('placeholder subject renders "Signal unavailable" not fabricated data', async () => {
    // A placeholder subject would have all signals as NOT_AVAILABLE — which
    // maps to no_data_yet. But if the subject has *no signals object at all*
    // (malformed entry), it should show "Signal unavailable".
    const result = await runAdapterScript(`
      import {
        buildContentQualitySignals,
        buildContentQualitySummary,
        QUALITY_SUMMARY_STATUS,
      } from ${SIGNALS_PATH};

      // Simulate a placeholder subject: entry exists but signals are empty/malformed.
      const signals = buildContentQualitySignals([
        { subjectKey: 'reading', subjectName: 'Reading', signals: null },
      ]);
      const summary = buildContentQualitySummary(signals);

      console.log(JSON.stringify({
        status: summary.subjectRows[0].status,
        label: summary.subjectRows[0].label,
        hasFabricatedData: summary.subjectRows[0].label.includes('0 /'),
      }));
    `);

    assert.equal(result.status, 'signal_unavailable', 'Placeholder should get signal_unavailable');
    assert.equal(result.label, 'Signal unavailable', 'Label should be "Signal unavailable"');
    assert.equal(result.hasFabricatedData, false, 'Should not fabricate data');
  });

  // ---------------------------------------------------------------
  // 5. Attention priority ordering (blocked > no_data > unavailable > good)
  // ---------------------------------------------------------------

  it('attention priority orders blocked > no_data > unavailable > good', async () => {
    const result = await runAdapterScript(`
      import {
        buildContentQualitySignals,
        buildContentQualitySummary,
        QUALITY_SUMMARY_STATUS,
      } from ${SIGNALS_PATH};

      const signals = buildContentQualitySignals([
        {
          subjectKey: 'spelling',
          subjectName: 'Spelling',
          signals: {
            skillCoverage: { status: 'available', value: 14, total: 18 },
            templateCoverage: { status: 'available', value: 40, total: 50 },
            itemCoverage: { status: 'available', value: 80, total: 100 },
            commonMisconceptions: { status: 'available', items: [] },
            highWrongRate: { status: 'available', items: [] },
            recentlyChangedUnevidenced: { status: 'available', items: [] },
          },
        },
        {
          subjectKey: 'grammar',
          subjectName: 'Grammar',
          signals: {
            skillCoverage: { status: 'not_available', value: 0, total: 0 },
            templateCoverage: { status: 'not_available', value: 0, total: 0 },
            itemCoverage: { status: 'not_available', value: 0, total: 0 },
            commonMisconceptions: { status: 'not_available', items: [] },
            highWrongRate: { status: 'not_available', items: [] },
            recentlyChangedUnevidenced: { status: 'not_available', items: [] },
          },
        },
        {
          subjectKey: 'punctuation',
          subjectName: 'Punctuation',
          signals: {
            skillCoverage: { status: 'partial', value: 0, total: 0 },
            templateCoverage: { status: 'partial', value: 0, total: 0 },
            itemCoverage: { status: 'partial', value: 0, total: 0 },
            commonMisconceptions: { status: 'partial', items: [] },
            highWrongRate: { status: 'partial', items: [] },
            recentlyChangedUnevidenced: { status: 'partial', items: [] },
          },
        },
      ]);

      const summary = buildContentQualitySummary(signals);
      console.log(JSON.stringify({
        attentionPriority: summary.attentionPriority,
        statuses: summary.subjectRows.map(r => ({ subject: r.subject, status: r.status })),
      }));
    `);

    // spelling = good (not in attention), grammar = no_data, punctuation = unavailable
    assert.ok(!result.attentionPriority.includes('spelling'), 'Good signal subjects should not be in attention list');
    assert.ok(result.attentionPriority.includes('grammar'), 'No-data subjects should be in attention list');
    assert.ok(result.attentionPriority.includes('punctuation'), 'Unavailable subjects should be in attention list');

    // Ordering: no_data (weight 3) before unavailable (weight 2)
    const grammarIdx = result.attentionPriority.indexOf('grammar');
    const punctuationIdx = result.attentionPriority.indexOf('punctuation');
    assert.ok(grammarIdx < punctuationIdx, 'no_data should come before unavailable in priority');
  });

  // ---------------------------------------------------------------
  // 6. buildContentQualitySummary does not import any subject content bundles
  // ---------------------------------------------------------------

  it('buildContentQualitySummary does not import any subject content bundles', () => {
    // Read the source file and ensure no imports from subject content directories.
    const sourcePath = path.join(
      rootDir,
      'src/platform/hubs/admin-content-quality-signals.js',
    );
    const source = readFileSync(sourcePath, 'utf8');

    // Subject content bundles live under src/subjects/*/content/ or shared/*/content/
    const contentBundlePattern = /import\s.*(?:subjects|shared)\/(?:spelling|grammar|punctuation|arithmetic|reasoning|reading)\/content/;
    assert.ok(
      !contentBundlePattern.test(source),
      'admin-content-quality-signals.js must not import subject content bundles',
    );

    // Also check for any dynamic require/import of content datasets.
    const dynamicContentPattern = /(?:require|import)\s*\(\s*.*content.*dataset/i;
    assert.ok(
      !dynamicContentPattern.test(source),
      'admin-content-quality-signals.js must not dynamically import content datasets',
    );
  });
});
