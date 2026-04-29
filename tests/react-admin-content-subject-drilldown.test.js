// U9 (Admin Console P5): Content subject drilldown truth tests.
//
// Validates that buildSubjectContentOverview adds a `drilldownAction`
// field and that the SubjectOverviewPanel renders honest action labels
// with correct clickability.
//
// Test scenarios:
//   1. Adapter: deriveDrilldownAction maps spelling → diagnostics
//   2. Adapter: deriveDrilldownAction maps grammar → diagnostics
//   3. Adapter: deriveDrilldownAction maps placeholder → placeholder
//   4. Adapter: deriveDrilldownAction maps live-but-unmapped → none
//   5. Adapter: drilldownPanelSelector returns correct panel selectors
//   6. Adapter: drilldownPanelSelector returns null for none/placeholder
//   7. Adapter: buildSubjectContentOverview includes drilldownAction
//   8. SSR: clickable subjects have data-clickable attribute
//   9. SSR: non-clickable subjects omit data-clickable attribute
//  10. SSR: action column renders "Open diagnostics" for spelling
//  11. SSR: action column renders "Open diagnostics" for grammar
//  12. SSR: action column renders "No drilldown yet" for punctuation
//  13. SSR: action column renders "Placeholder — not live" for placeholder subjects
//  14. SSR: table header includes "Action" column
//  15. SSR: data-drilldown-action attribute is rendered per row

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
// Pure adapter tests.
// ---------------------------------------------------------------

async function runAdapterScript(script) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-drilldown-'));
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

const ADAPTER_PATH = JSON.stringify(
  path.join(rootDir, 'src/platform/hubs/admin-content-overview.js'),
);

// ---------------------------------------------------------------
// SSR rendering harness.
// ---------------------------------------------------------------

const CONTENT_SECTION_PATH = JSON.stringify(
  path.join(rootDir, 'src/surfaces/hubs/AdminContentSection.jsx'),
);

function baseModel(overrides = {}) {
  return {
    account: { id: 'adult-admin', repoRevision: 1, selectedLearnerId: '' },
    permissions: {
      canViewAdminHub: true,
      platformRole: 'admin',
      platformRoleLabel: 'Admin',
      canManageMonsterVisualConfig: true,
    },
    monsterVisualConfig: {
      permissions: { canManageMonsterVisualConfig: true, canViewMonsterVisualConfig: true },
      status: {
        schemaVersion: 2,
        manifestHash: 'abc123def456',
        draftRevision: 7,
        draftUpdatedAt: Date.UTC(2026, 3, 27),
        draftUpdatedByAccountId: 'adult-admin',
        publishedVersion: 3,
        publishedAt: Date.UTC(2026, 3, 26),
        publishedByAccountId: 'adult-admin',
        validation: { ok: true, errorCount: 0, warningCount: 0, errors: [], warnings: [] },
      },
      draft: { manifestHash: 'abc123def456', assets: {} },
      published: { manifestHash: 'prev-hash', assets: {} },
      versions: [
        { version: 3, publishedAt: Date.UTC(2026, 3, 26) },
        { version: 2, publishedAt: Date.UTC(2026, 3, 20) },
      ],
      mutation: {},
    },
    contentReleaseStatus: {
      publishedVersion: 1,
      publishedReleaseId: 'rel-001',
      runtimeWordCount: 120,
      runtimeSentenceCount: 40,
      currentDraftId: 'draft-001',
      currentDraftVersion: 2,
      draftUpdatedAt: Date.UTC(2026, 3, 27),
    },
    importValidationStatus: {
      ok: true,
      errorCount: 0,
      warningCount: 0,
      source: 'bundled baseline',
      importedAt: Date.UTC(2026, 3, 20),
      errors: [],
    },
    learnerSupport: {
      selectedLearnerId: '',
      accessibleLearners: [],
      selectedDiagnostics: null,
      punctuationReleaseDiagnostics: null,
      entryPoints: [],
    },
    postMegaSeedHarness: { shapes: [] },
    contentOverview: {
      subjects: [
        {
          subjectKey: 'spelling',
          displayName: 'Spelling',
          status: 'live',
          releaseVersion: '3',
          validationErrors: 0,
          errorCount7d: 2,
          supportLoadSignal: 'low',
          hasRealDiagnostics: true,
        },
        {
          subjectKey: 'grammar',
          displayName: 'Grammar',
          status: 'live',
          releaseVersion: null,
          validationErrors: 0,
          errorCount7d: 0,
          supportLoadSignal: 'none',
          hasRealDiagnostics: true,
        },
        {
          subjectKey: 'punctuation',
          displayName: 'Punctuation',
          status: 'live',
          releaseVersion: null,
          validationErrors: 0,
          errorCount7d: 5,
          supportLoadSignal: 'medium',
        },
        {
          subjectKey: 'arithmetic',
          displayName: 'Arithmetic',
          status: 'placeholder',
          releaseVersion: null,
          validationErrors: 0,
          errorCount7d: 0,
          supportLoadSignal: 'none',
        },
        {
          subjectKey: 'reasoning',
          displayName: 'Reasoning',
          status: 'placeholder',
          releaseVersion: null,
          validationErrors: 0,
          errorCount7d: 0,
          supportLoadSignal: 'none',
        },
      ],
    },
    ...overrides,
  };
}

function baseActions() {
  return `{ dispatch() {}, navigateHome() {}, openSubject() {} }`;
}

function baseAppState() {
  return {
    learners: { selectedId: '', byId: {}, allIds: [] },
    persistence: { mode: 'remote-sync' },
    toasts: [],
    monsterCelebrations: { queue: [] },
  };
}

function baseAccessContext() {
  return { shellAccess: { source: 'worker-session' }, activeAdultLearnerContext: null };
}

function buildSsrEntry({ model } = {}) {
  const m = model || baseModel();
  const as = baseAppState();
  const ac = baseAccessContext();
  return `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminContentSection } from ${CONTENT_SECTION_PATH};
    const model = ${JSON.stringify(m)};
    const actions = ${baseActions()};
    const appState = ${JSON.stringify(as)};
    const accessContext = ${JSON.stringify(ac)};
    const html = renderToStaticMarkup(
      <AdminContentSection
        model={model}
        appState={appState}
        accessContext={accessContext}
        actions={actions}
      />
    );
    process.stdout.write(html);
  `;
}

async function renderContentSection(opts = {}) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-drilldown-ssr-'));
  const entryPath = path.join(tmpDir, 'entry.jsx');
  const bundlePath = path.join(tmpDir, 'entry.cjs');
  try {
    await writeFile(entryPath, buildSsrEntry(opts));
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


// =================================================================
// 1. Adapter: deriveDrilldownAction maps spelling → diagnostics
// =================================================================

test('deriveDrilldownAction maps spelling (live) to diagnostics', async () => {
  const result = await runAdapterScript(`
    import { deriveDrilldownAction } from ${ADAPTER_PATH};
    const action = deriveDrilldownAction({
      subjectKey: 'spelling',
      status: 'live',
    });
    process.stdout.write(JSON.stringify(action));
  `);

  assert.equal(result, 'diagnostics');
});

// =================================================================
// 2. Adapter: deriveDrilldownAction maps grammar → diagnostics
// =================================================================

test('deriveDrilldownAction maps grammar (live) to diagnostics', async () => {
  const result = await runAdapterScript(`
    import { deriveDrilldownAction } from ${ADAPTER_PATH};
    const action = deriveDrilldownAction({
      subjectKey: 'grammar',
      status: 'live',
    });
    process.stdout.write(JSON.stringify(action));
  `);

  assert.equal(result, 'diagnostics');
});

// =================================================================
// 3. Adapter: deriveDrilldownAction maps placeholder → placeholder
// =================================================================

test('deriveDrilldownAction maps placeholder status to placeholder', async () => {
  const result = await runAdapterScript(`
    import { deriveDrilldownAction } from ${ADAPTER_PATH};
    const action = deriveDrilldownAction({
      subjectKey: 'arithmetic',
      status: 'placeholder',
    });
    process.stdout.write(JSON.stringify(action));
  `);

  assert.equal(result, 'placeholder');
});

// =================================================================
// 4. Adapter: deriveDrilldownAction maps live-but-unmapped → none
// =================================================================

test('deriveDrilldownAction maps live subject with no panel to none', async () => {
  const result = await runAdapterScript(`
    import { deriveDrilldownAction } from ${ADAPTER_PATH};
    const action = deriveDrilldownAction({
      subjectKey: 'punctuation',
      status: 'live',
    });
    process.stdout.write(JSON.stringify(action));
  `);

  assert.equal(result, 'none');
});

// =================================================================
// 5. Adapter: drilldownPanelSelector returns correct panel selectors
// =================================================================

test('drilldownPanelSelector returns correct selectors for diagnostics', async () => {
  const result = await runAdapterScript(`
    import { drilldownPanelSelector } from ${ADAPTER_PATH};
    const spelling = drilldownPanelSelector({ subjectKey: 'spelling', drilldownAction: 'diagnostics' });
    const grammar = drilldownPanelSelector({ subjectKey: 'grammar', drilldownAction: 'diagnostics' });
    const registry = drilldownPanelSelector({ subjectKey: 'some-asset', drilldownAction: 'asset_registry' });
    const release = drilldownPanelSelector({ subjectKey: 'some-release', drilldownAction: 'content_release' });
    process.stdout.write(JSON.stringify({ spelling, grammar, registry, release }));
  `);

  assert.equal(result.spelling, '[data-panel="post-mega-spelling-debug"]');
  assert.equal(result.grammar, '[data-panel="grammar-concept-confidence"]');
  assert.equal(result.registry, '[data-panel="asset-registry"]');
  assert.equal(result.release, '[data-panel="content-release"]');
});

// =================================================================
// 6. Adapter: drilldownPanelSelector returns null for none/placeholder
// =================================================================

test('drilldownPanelSelector returns null for none and placeholder', async () => {
  const result = await runAdapterScript(`
    import { drilldownPanelSelector } from ${ADAPTER_PATH};
    const none = drilldownPanelSelector({ subjectKey: 'punctuation', drilldownAction: 'none' });
    const placeholder = drilldownPanelSelector({ subjectKey: 'arithmetic', drilldownAction: 'placeholder' });
    process.stdout.write(JSON.stringify({ none, placeholder }));
  `);

  assert.equal(result.none, null);
  assert.equal(result.placeholder, null);
});

// =================================================================
// 7. Adapter: buildSubjectContentOverview includes drilldownAction
// =================================================================

test('buildSubjectContentOverview attaches drilldownAction to each subject', async () => {
  const result = await runAdapterScript(`
    import { buildSubjectContentOverview } from ${ADAPTER_PATH};
    const overview = buildSubjectContentOverview({
      subjects: [
        { subjectKey: 'spelling', displayName: 'Spelling', status: 'live', errorCount7d: 0 },
        { subjectKey: 'grammar', displayName: 'Grammar', status: 'live', errorCount7d: 0 },
        { subjectKey: 'punctuation', displayName: 'Punctuation', status: 'live', errorCount7d: 0 },
        { subjectKey: 'arithmetic', displayName: 'Arithmetic', status: 'placeholder', errorCount7d: 0 },
      ],
    });
    process.stdout.write(JSON.stringify(overview.map(s => ({ key: s.subjectKey, action: s.drilldownAction }))));
  `);

  assert.equal(result.length, 4);
  assert.equal(result[0].key, 'spelling');
  assert.equal(result[0].action, 'diagnostics');
  assert.equal(result[1].key, 'grammar');
  assert.equal(result[1].action, 'diagnostics');
  assert.equal(result[2].key, 'punctuation');
  assert.equal(result[2].action, 'none');
  assert.equal(result[3].key, 'arithmetic');
  assert.equal(result[3].action, 'placeholder');
});

// =================================================================
// 8. SSR: clickable subjects have data-clickable attribute
// =================================================================

test('clickable subjects (spelling, grammar) have data-clickable="true"', async () => {
  const html = await renderContentSection();

  // Spelling and grammar have diagnostics panels → clickable
  assert.match(html, /data-subject-key="spelling"[^>]*data-clickable="true"/, 'Spelling is clickable');
  assert.match(html, /data-subject-key="grammar"[^>]*data-clickable="true"/, 'Grammar is clickable');
});

// =================================================================
// 9. SSR: non-clickable subjects omit data-clickable attribute
// =================================================================

test('non-clickable subjects (punctuation, arithmetic) omit data-clickable', async () => {
  const html = await renderContentSection();

  // Punctuation is live but has no panel → not clickable
  const punctRow = html.match(/data-subject-key="punctuation"[^>]*/);
  assert.ok(punctRow, 'Punctuation row exists');
  assert.doesNotMatch(punctRow[0], /data-clickable/, 'Punctuation is not clickable');

  // Arithmetic is placeholder → not clickable
  const arithRow = html.match(/data-subject-key="arithmetic"[^>]*/);
  assert.ok(arithRow, 'Arithmetic row exists');
  assert.doesNotMatch(arithRow[0], /data-clickable/, 'Arithmetic is not clickable');
});

// =================================================================
// 10. SSR: action column renders "Open diagnostics" for spelling
// =================================================================

test('action column shows "Open diagnostics" for spelling', async () => {
  const html = await renderContentSection();
  assert.match(html, /data-testid="action-spelling"[^>]*>Open diagnostics</, 'Spelling shows Open diagnostics');
});

// =================================================================
// 11. SSR: action column renders "Open diagnostics" for grammar
// =================================================================

test('action column shows "Open diagnostics" for grammar', async () => {
  const html = await renderContentSection();
  assert.match(html, /data-testid="action-grammar"[^>]*>Open diagnostics</, 'Grammar shows Open diagnostics');
});

// =================================================================
// 12. SSR: action column renders "No drilldown yet" for punctuation
// =================================================================

test('action column shows "No drilldown yet" for punctuation', async () => {
  const html = await renderContentSection();
  assert.match(html, /data-testid="action-punctuation"[^>]*>No drilldown yet</, 'Punctuation shows No drilldown yet');
});

// =================================================================
// 13. SSR: action column renders "Placeholder — not live" for placeholders
// =================================================================

test('action column shows "Placeholder — not live" for placeholder subjects', async () => {
  const html = await renderContentSection();
  // Use a looser match to handle HTML entity encoding of the em dash
  assert.match(html, /data-testid="action-arithmetic"/, 'Arithmetic action label exists');
  // The actual text may use &mdash; or — or a literal em dash
  const arithAction = html.match(/data-testid="action-arithmetic"[^>]*>([^<]*)</);
  assert.ok(arithAction, 'Arithmetic action text found');
  assert.ok(
    arithAction[1].includes('Placeholder') && arithAction[1].includes('not live'),
    `Arithmetic action text is honest: "${arithAction[1]}"`,
  );
});

// =================================================================
// 14. SSR: table header includes "Action" column
// =================================================================

test('table header includes Action column', async () => {
  const html = await renderContentSection();
  assert.match(html, /<th[^>]*>Action<\/th>/, 'Action column header renders');
});

// =================================================================
// 15. SSR: data-drilldown-action attribute is rendered per row
// =================================================================

test('each row renders data-drilldown-action attribute', async () => {
  const html = await renderContentSection();
  assert.match(html, /data-drilldown-action="diagnostics"/, 'diagnostics action attr renders');
  assert.match(html, /data-drilldown-action="none"/, 'none action attr renders');
  assert.match(html, /data-drilldown-action="placeholder"/, 'placeholder action attr renders');
});
