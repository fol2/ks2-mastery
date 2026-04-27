// U9 (Admin Console P3): React-side content overview test suite.
//
// Validates the admin-content-overview.js normaliser and the
// SubjectOverviewPanel rendered by AdminContentSection.jsx.
//
// Test scenarios:
//   1. Adapter: normalises a full subjects array
//   2. Adapter: handles missing/empty payload gracefully
//   3. Adapter: sorts subjects by lifecycle priority (live first)
//   4. Adapter: statusBadgeClass and statusLabel return correct values
//   5. SSR: overview panel renders with status badges
//   6. SSR: live subjects show "Live" green badge
//   7. SSR: placeholder subjects show "Placeholder" badge with opacity
//   8. SSR: zero errors render as "0" not "N/A"
//   9. SSR: error state renders error banner
//  10. SSR: overview panel coexists with existing panels
//  11. SSR: no content release shows "No release" state

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
// Pure adapter tests (no DOM / SSR — runs the module directly).
// ---------------------------------------------------------------

async function runAdapterScript(script) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-content-overview-'));
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
        },
        {
          subjectKey: 'grammar',
          displayName: 'Grammar',
          status: 'live',
          releaseVersion: null,
          validationErrors: 0,
          errorCount7d: 0,
          supportLoadSignal: 'none',
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
        {
          subjectKey: 'reading',
          displayName: 'Reading',
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
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-content-ov-ssr-'));
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
// 1. Adapter: normalises a full subjects array
// =================================================================

test('buildSubjectContentOverview normalises subjects from payload', async () => {
  const result = await runAdapterScript(`
    import { buildSubjectContentOverview } from ${ADAPTER_PATH};
    const overview = buildSubjectContentOverview({
      subjects: [
        { subjectKey: 'spelling', displayName: 'Spelling', status: 'live', releaseVersion: '2', validationErrors: 0, errorCount7d: 1, supportLoadSignal: 'low' },
        { subjectKey: 'arithmetic', displayName: 'Arithmetic', status: 'placeholder', releaseVersion: null, validationErrors: 0, errorCount7d: 0, supportLoadSignal: 'none' },
      ],
    });
    process.stdout.write(JSON.stringify(overview));
  `);

  assert.equal(Array.isArray(result), true);
  assert.equal(result.length, 2);
  assert.equal(result[0].subjectKey, 'spelling');
  assert.equal(result[0].status, 'live');
  assert.equal(result[0].releaseVersion, '2');
  assert.equal(result[0].errorCount7d, 1);
  assert.equal(result[1].subjectKey, 'arithmetic');
  assert.equal(result[1].status, 'placeholder');
});

// =================================================================
// 2. Adapter: handles missing/empty payload gracefully
// =================================================================

test('buildSubjectContentOverview handles null payload', async () => {
  const result = await runAdapterScript(`
    import { buildSubjectContentOverview } from ${ADAPTER_PATH};
    const overview = buildSubjectContentOverview(null);
    process.stdout.write(JSON.stringify(overview));
  `);

  assert.equal(Array.isArray(result), true);
  assert.equal(result.length, 0);
});

test('buildSubjectContentOverview handles empty subjects', async () => {
  const result = await runAdapterScript(`
    import { buildSubjectContentOverview } from ${ADAPTER_PATH};
    const overview = buildSubjectContentOverview({ subjects: [] });
    process.stdout.write(JSON.stringify(overview));
  `);

  assert.equal(Array.isArray(result), true);
  assert.equal(result.length, 0);
});

// =================================================================
// 3. Adapter: sorts subjects by lifecycle priority
// =================================================================

test('buildSubjectContentOverview sorts live before placeholder', async () => {
  const result = await runAdapterScript(`
    import { buildSubjectContentOverview } from ${ADAPTER_PATH};
    const overview = buildSubjectContentOverview({
      subjects: [
        { subjectKey: 'reading', displayName: 'Reading', status: 'placeholder', errorCount7d: 0 },
        { subjectKey: 'spelling', displayName: 'Spelling', status: 'live', errorCount7d: 0 },
        { subjectKey: 'arithmetic', displayName: 'Arithmetic', status: 'placeholder', errorCount7d: 0 },
        { subjectKey: 'grammar', displayName: 'Grammar', status: 'live', errorCount7d: 0 },
      ],
    });
    process.stdout.write(JSON.stringify(overview));
  `);

  assert.equal(result[0].status, 'live');
  assert.equal(result[1].status, 'live');
  assert.equal(result[2].status, 'placeholder');
  assert.equal(result[3].status, 'placeholder');
});

// =================================================================
// 4. Adapter: statusBadgeClass and statusLabel
// =================================================================

test('statusBadgeClass returns correct class for each status', async () => {
  const result = await runAdapterScript(`
    import { statusBadgeClass, statusLabel } from ${ADAPTER_PATH};
    process.stdout.write(JSON.stringify({
      liveClass: statusBadgeClass('live'),
      gatedClass: statusBadgeClass('gated'),
      placeholderClass: statusBadgeClass('placeholder'),
      liveLabel: statusLabel('live'),
      gatedLabel: statusLabel('gated'),
      placeholderLabel: statusLabel('placeholder'),
    }));
  `);

  assert.equal(result.liveClass, 'good');
  assert.equal(result.gatedClass, 'warn');
  assert.equal(result.placeholderClass, '');
  assert.equal(result.liveLabel, 'Live');
  assert.equal(result.gatedLabel, 'Gated');
  assert.equal(result.placeholderLabel, 'Placeholder');
});

// =================================================================
// 5. SSR: overview panel renders with status badges
// =================================================================

test('overview panel renders with subject status badges', async () => {
  const html = await renderContentSection();

  assert.match(html, /data-panel="subject-overview"/, 'Subject overview panel renders');
  assert.match(html, /Subject Overview/, 'Panel title renders');
  assert.match(html, /Cross-subject operating surface/, 'Description renders');
  assert.match(html, /data-subject-key="spelling"/, 'Spelling row renders');
  assert.match(html, /data-subject-key="grammar"/, 'Grammar row renders');
  assert.match(html, /data-subject-key="punctuation"/, 'Punctuation row renders');
  assert.match(html, /data-subject-key="arithmetic"/, 'Arithmetic row renders');
});

// =================================================================
// 6. SSR: live subjects show "Live" green badge
// =================================================================

test('live subjects show Live badge with good class', async () => {
  const html = await renderContentSection();

  assert.match(html, /data-testid="status-badge-spelling"[^>]*>Live</, 'Spelling has Live badge');
  assert.match(html, /data-testid="status-badge-grammar"[^>]*>Live</, 'Grammar has Live badge');
  assert.match(html, /chip good[^>]*data-testid="status-badge-spelling"/, 'Spelling badge has good class');
});

// =================================================================
// 7. SSR: placeholder subjects show Placeholder badge
// =================================================================

test('placeholder subjects show Placeholder badge', async () => {
  const html = await renderContentSection();

  assert.match(html, /data-testid="status-badge-arithmetic"[^>]*>Placeholder</, 'Arithmetic has Placeholder badge');
  assert.match(html, /data-subject-status="placeholder"/, 'Placeholder data attribute renders');
});

// =================================================================
// 8. SSR: zero errors render as "0"
// =================================================================

test('zero errors render as "0" not "N/A"', async () => {
  const html = await renderContentSection();

  // Grammar has errorCount7d = 0 in fixture
  assert.match(html, /data-testid="errors-grammar"[^>]*>0</, 'Grammar shows 0 errors');
});

// =================================================================
// 9. SSR: error state renders error banner
// =================================================================

test('error state renders error banner instead of table', async () => {
  const errorModel = baseModel({
    contentOverviewError: 'Network timeout fetching content overview',
    contentOverview: null,
  });
  const html = await renderContentSection({ model: errorModel });

  assert.match(html, /data-panel="subject-overview"/, 'Panel still renders');
  assert.match(html, /Unable to load subject overview/, 'Error title renders');
  assert.match(html, /Network timeout/, 'Error message renders');
  assert.doesNotMatch(html, /data-subject-key="spelling"/, 'Subject rows do not render in error state');
});

// =================================================================
// 10. SSR: overview panel coexists with existing panels
// =================================================================

test('overview panel renders alongside existing content section panels', async () => {
  const html = await renderContentSection();

  // Subject overview (new)
  assert.match(html, /data-panel="subject-overview"/, 'Subject overview renders');

  // Existing panels
  assert.match(html, /Content release status/, 'Content release panel still renders');
  assert.match(html, /Import \/ validation status/, 'Import validation panel still renders');
  assert.match(html, /data-panel="post-mega-spelling-debug"/, 'Post-mega debug panel still renders');
  assert.match(html, /data-panel="asset-registry"/, 'Asset registry renders');
});

// =================================================================
// 11. SSR: no content release shows "No release" state
// =================================================================

test('subject with no release shows "No release" label', async () => {
  const html = await renderContentSection();

  // Grammar has releaseVersion: null in fixture
  assert.match(html, /data-testid="release-grammar"[^>]*>No release</, 'Grammar shows No release');
});

// =================================================================
// 12. Adapter: normaliseSubjectStatus coerces bad input
// =================================================================

test('normaliseSubjectStatus coerces missing fields to safe defaults', async () => {
  const result = await runAdapterScript(`
    import { normaliseSubjectStatus } from ${ADAPTER_PATH};
    const entry = normaliseSubjectStatus({});
    process.stdout.write(JSON.stringify(entry));
  `);

  assert.equal(result.subjectKey, 'unknown');
  assert.equal(result.status, 'placeholder');
  assert.equal(result.releaseVersion, null);
  assert.equal(result.validationErrors, 0);
  assert.equal(result.errorCount7d, 0);
  assert.equal(result.supportLoadSignal, 'none');
});

test('normaliseSubjectStatus handles non-object input', async () => {
  const result = await runAdapterScript(`
    import { normaliseSubjectStatus } from ${ADAPTER_PATH};
    const entry = normaliseSubjectStatus('garbage');
    process.stdout.write(JSON.stringify(entry));
  `);

  assert.equal(result.subjectKey, 'unknown');
  assert.equal(result.status, 'placeholder');
});
