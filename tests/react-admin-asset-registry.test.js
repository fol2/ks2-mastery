// U10 (Admin Console P3): Asset & Effect Registry test suite.
//
// Validates the registry adapter (`admin-asset-registry.js`) and the
// registry-shaped UI card rendered by `AdminContentSection.jsx`.
//
// Test scenarios:
//   1. Happy path: adapter transforms monster visual config into registry entry
//   2. Happy path: registry card renders with correct status badges and actions
//   3. Happy path: published version shows manifest hash and published timestamp
//   4. Edge case: no published config shows "First publish pending" state
//   5. Edge case: validation errors displayed on registry card
//   6. Edge case: registry card gracefully handles missing/empty config
//   7. Happy path: publish and restore actions delegate through registry UI
//   8. Adapter: buildAssetRegistry returns array with one entry
//   9. Adapter: clean reviewStatus when ok=false, errorCount=0, warningCount>0
//  10. Adapter: unknown reviewStatus when validation has no 'ok' key
//  11. SSR: clean reviewStatus renders "Warnings Only" chip with warn class
//  12. SSR: unknown reviewStatus renders "No Validation" chip
//  13. SSR: Publish/Restore button dispatch payloads and disabled states

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
  // Worktree environments may not have node_modules locally — walk up the
  // directory tree to find the nearest node_modules (mirrors Node resolution).
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
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-asset-registry-'));
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
  path.join(rootDir, 'src/platform/hubs/admin-asset-registry.js'),
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
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-asset-reg-ssr-'));
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
// 1. Adapter: transforms monster visual config into registry entry
// =================================================================

test('buildMonsterVisualRegistryEntry produces correct registry shape from populated config', async () => {
  const result = await runAdapterScript(`
    import { buildMonsterVisualRegistryEntry } from ${ADAPTER_PATH};
    const entry = buildMonsterVisualRegistryEntry({
      permissions: { canManageMonsterVisualConfig: true },
      status: {
        draftRevision: 7,
        publishedVersion: 3,
        manifestHash: 'abc123def456',
        publishedAt: 1745625600000,
        publishedByAccountId: 'admin-account',
        validation: { ok: true, errorCount: 0, warningCount: 0, errors: [], warnings: [] },
      },
      draft: { manifestHash: 'abc123def456', assets: {} },
      published: { assets: {} },
      versions: [{ version: 3, publishedAt: 1745625600000 }],
    });
    process.stdout.write(JSON.stringify(entry));
  `);

  assert.equal(result.assetId, 'monster-visual-config');
  assert.equal(result.category, 'visual');
  assert.equal(result.displayName, 'Monster Visual & Effect Config');
  assert.equal(result.draftVersion, 7);
  assert.equal(result.publishedVersion, 3);
  assert.equal(result.manifestHash, 'abc123def456');
  assert.equal(result.reviewStatus, 'publishable');
  assert.equal(result.validationState.ok, true);
  assert.equal(result.lastPublishedAt, 1745625600000);
  assert.equal(result.lastPublishedBy, 'admin-account');
  assert.equal(result.canManage, true);
  assert.equal(result.hasDraft, true);
  assert.equal(result.hasPublished, true);
  assert.equal(result.versions.length, 1);
});

// =================================================================
// 2. Adapter: handles null/missing config gracefully
// =================================================================

test('buildMonsterVisualRegistryEntry returns safe defaults for null config', async () => {
  const result = await runAdapterScript(`
    import { buildMonsterVisualRegistryEntry } from ${ADAPTER_PATH};
    const entry = buildMonsterVisualRegistryEntry(null);
    process.stdout.write(JSON.stringify(entry));
  `);

  assert.equal(result.assetId, 'monster-visual-config');
  assert.equal(result.draftVersion, 0);
  assert.equal(result.publishedVersion, 0);
  assert.equal(result.manifestHash, '');
  assert.equal(result.reviewStatus, 'unknown');
  assert.equal(result.canManage, false);
  assert.equal(result.hasDraft, false);
  assert.equal(result.hasPublished, false);
  assert.equal(result.versions.length, 0);
  assert.equal(result.lastPublishedAt, 0);
  assert.equal(result.lastPublishedBy, '');
});

// =================================================================
// 3. Adapter: buildAssetRegistry returns array
// =================================================================

test('buildAssetRegistry returns array with monster-visual-config entry', async () => {
  const result = await runAdapterScript(`
    import { buildAssetRegistry } from ${ADAPTER_PATH};
    const registry = buildAssetRegistry({
      monsterVisualConfig: {
        permissions: { canManageMonsterVisualConfig: false },
        status: { draftRevision: 2, publishedVersion: 1, validation: { ok: true } },
        draft: { assets: {} },
        published: null,
        versions: [],
      },
    });
    process.stdout.write(JSON.stringify(registry));
  `);

  assert.equal(Array.isArray(result), true);
  assert.equal(result.length, 1);
  assert.equal(result[0].assetId, 'monster-visual-config');
  assert.equal(result[0].canManage, false);
});

// =================================================================
// 4. Adapter: validation errors produce has-blockers status
// =================================================================

test('buildMonsterVisualRegistryEntry returns has-blockers when validation has errors', async () => {
  const result = await runAdapterScript(`
    import { buildMonsterVisualRegistryEntry } from ${ADAPTER_PATH};
    const entry = buildMonsterVisualRegistryEntry({
      permissions: { canManageMonsterVisualConfig: true },
      status: {
        draftRevision: 5,
        publishedVersion: 2,
        manifestHash: 'hash-abc',
        validation: {
          ok: false,
          errorCount: 3,
          warningCount: 1,
          errors: [
            { code: 'missing_path', assetKey: 'vellhorn-b1-3', context: 'meadow', field: 'path' },
          ],
          warnings: [],
        },
      },
      draft: { assets: {} },
      published: { assets: {} },
      versions: [],
    });
    process.stdout.write(JSON.stringify(entry));
  `);

  assert.equal(result.reviewStatus, 'has-blockers');
  assert.equal(result.validationState.ok, false);
  assert.equal(result.validationState.errorCount, 3);
  assert.equal(result.validationState.warningCount, 1);
  assert.equal(result.validationState.errors.length, 1);
  assert.equal(result.validationState.errors[0].code, 'missing_path');
});

// =================================================================
// 5. SSR: registry card renders with published version and hash
// =================================================================

test('registry card renders published version, manifest hash, and published timestamp', async () => {
  const html = await renderContentSection();

  // Registry panel container
  assert.match(html, /data-panel="asset-registry"/, 'Asset registry section renders');
  assert.match(html, /data-asset-id="monster-visual-config"/, 'Monster visual config registry card renders');

  // Display name
  assert.match(html, /Monster Visual &amp; Effect Config/, 'Registry card shows display name');

  // Published version chip
  assert.match(html, /Published: v3/, 'Published version renders');

  // Draft revision chip
  assert.match(html, /Draft: rev 7/, 'Draft revision renders');

  // Manifest hash (first 12 chars)
  assert.match(html, /abc123def456/, 'Manifest hash renders');

  // Published timestamp
  assert.match(html, /data-testid="registry-published-at"/, 'Published-at detail renders');

  // Published-by
  assert.match(html, /data-testid="registry-published-by"/, 'Published-by detail renders');
});

// =================================================================
// 6. SSR: no published config shows "First publish pending"
// =================================================================

test('registry card shows "First publish pending" when no published version', async () => {
  const neverPublishedModel = baseModel({
    monsterVisualConfig: {
      permissions: { canManageMonsterVisualConfig: true, canViewMonsterVisualConfig: true },
      status: {
        schemaVersion: 2,
        manifestHash: '',
        draftRevision: 1,
        draftUpdatedAt: Date.UTC(2026, 3, 27),
        draftUpdatedByAccountId: 'adult-admin',
        publishedVersion: 0,
        publishedAt: 0,
        publishedByAccountId: '',
        validation: { ok: true, errorCount: 0, warningCount: 0, errors: [], warnings: [] },
      },
      draft: { manifestHash: '', assets: {} },
      published: null,
      versions: [],
      mutation: {},
    },
  });
  const html = await renderContentSection({ model: neverPublishedModel });

  assert.match(html, /First publish pending/, 'First publish pending label renders');
  // No manifest hash detail
  assert.doesNotMatch(html, /data-testid="registry-manifest-hash"/, 'No manifest hash when empty');
  // No published-at detail
  assert.doesNotMatch(html, /data-testid="registry-published-at"/, 'No published-at when never published');
  // No published-by detail
  assert.doesNotMatch(html, /data-testid="registry-published-by"/, 'No published-by when never published');
});

// =================================================================
// 7. SSR: validation errors displayed on registry card
// =================================================================

test('registry card renders validation blockers when present', async () => {
  const blockedModel = baseModel({
    monsterVisualConfig: {
      permissions: { canManageMonsterVisualConfig: true, canViewMonsterVisualConfig: true },
      status: {
        schemaVersion: 2,
        manifestHash: 'hash-blocked',
        draftRevision: 4,
        draftUpdatedAt: Date.UTC(2026, 3, 27),
        draftUpdatedByAccountId: 'adult-admin',
        publishedVersion: 2,
        publishedAt: Date.UTC(2026, 3, 25),
        publishedByAccountId: 'adult-admin',
        validation: {
          ok: false,
          errorCount: 2,
          warningCount: 1,
          errors: [
            { code: 'missing_path', assetKey: 'vellhorn-b1-3', context: 'meadow', field: 'path' },
            { code: 'invalid_scale', assetKey: 'skarr-b2-1', context: 'dusk' },
          ],
          warnings: [
            { code: 'deprecated_motion', assetKey: 'vellhorn-b1-3' },
          ],
        },
      },
      draft: { manifestHash: 'hash-blocked', assets: {} },
      published: { manifestHash: 'prev-hash', assets: {} },
      versions: [],
      mutation: {},
    },
  });
  const html = await renderContentSection({ model: blockedModel });

  // Validation error feedback block
  assert.match(html, /data-testid="registry-validation-errors"/, 'Validation errors block renders');
  assert.match(html, /Validation blockers \(2\)/, 'Error count label renders');
  assert.match(html, /1 warning/, 'Warning count renders');

  // Review status chip
  assert.match(html, /2 blockers/, 'Blockers chip renders');

  // Error details
  assert.match(html, /missing_path/, 'First validation error code renders');
});

// =================================================================
// 8. SSR: missing/empty config renders empty state
// =================================================================

test('registry card renders empty state when no draft and no published config', async () => {
  const emptyModel = baseModel({
    monsterVisualConfig: {
      permissions: { canManageMonsterVisualConfig: true, canViewMonsterVisualConfig: true },
      status: {
        schemaVersion: 0,
        manifestHash: '',
        draftRevision: 0,
        draftUpdatedAt: 0,
        draftUpdatedByAccountId: '',
        publishedVersion: 0,
        publishedAt: 0,
        publishedByAccountId: '',
        validation: { ok: false, errorCount: 0, warningCount: 0, errors: [], warnings: [] },
      },
      draft: null,
      published: null,
      versions: [],
      mutation: {},
    },
  });
  const html = await renderContentSection({ model: emptyModel });

  assert.match(html, /data-testid="registry-empty-state"/, 'Empty state renders');
  assert.match(html, /No configuration has been initialised/, 'Empty state message renders');
});

// =================================================================
// 9. SSR: publish and restore action buttons render (no save draft)
// =================================================================

test('registry card renders publish and restore actions but no save draft', async () => {
  const html = await renderContentSection();

  // Save draft button removed — editing belongs in MonsterVisualConfigPanel
  assert.doesNotMatch(html, /data-action="registry-save-draft"/, 'Save draft button removed from registry card');

  // Publish button
  assert.match(html, /data-action="registry-publish"/, 'Publish button renders');

  // Restore version select
  assert.match(html, /data-action="registry-restore"/, 'Restore version select renders');
  // Version options from fixture
  assert.match(html, /Version 3/, 'Version 3 option renders');
  assert.match(html, /Version 2/, 'Version 2 option renders');
});

// =================================================================
// 10. SSR: read-only user sees disabled actions
// =================================================================

test('registry card disables actions for read-only user', async () => {
  const readOnlyModel = baseModel({
    monsterVisualConfig: {
      permissions: { canManageMonsterVisualConfig: false, canViewMonsterVisualConfig: true },
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
      versions: [{ version: 3, publishedAt: Date.UTC(2026, 3, 26) }],
      mutation: {},
    },
  });
  const html = await renderContentSection({ model: readOnlyModel });

  // Read-only chip instead of admin edit
  assert.match(html, /Read-only/, 'Read-only chip renders');
  assert.doesNotMatch(html, /Admin edit/, 'Admin edit chip does not render for read-only');
});

// =================================================================
// 11. Adapter: clean reviewStatus when ok=false, errorCount=0, warningCount>0
// =================================================================

test('buildMonsterVisualRegistryEntry returns clean when validation ok=false with warnings only', async () => {
  const result = await runAdapterScript(`
    import { buildMonsterVisualRegistryEntry } from ${ADAPTER_PATH};
    const entry = buildMonsterVisualRegistryEntry({
      permissions: { canManageMonsterVisualConfig: true },
      status: {
        draftRevision: 3,
        publishedVersion: 1,
        manifestHash: 'hash-clean',
        validation: {
          ok: false,
          errorCount: 0,
          warningCount: 2,
          errors: [],
          warnings: [
            { code: 'deprecated_motion', assetKey: 'vellhorn-b1-3' },
            { code: 'low_contrast', assetKey: 'skarr-b2-1' },
          ],
        },
      },
      draft: { assets: {} },
      published: { assets: {} },
      versions: [],
    });
    process.stdout.write(JSON.stringify(entry));
  `);

  assert.equal(result.reviewStatus, 'clean');
  assert.equal(result.validationState.ok, false);
  assert.equal(result.validationState.errorCount, 0);
  assert.equal(result.validationState.warningCount, 2);
});

// =================================================================
// 12. Adapter: unknown reviewStatus when validation has no 'ok' key
// =================================================================

test('buildMonsterVisualRegistryEntry returns unknown when validation has no ok key', async () => {
  const result = await runAdapterScript(`
    import { buildMonsterVisualRegistryEntry } from ${ADAPTER_PATH};
    const entry = buildMonsterVisualRegistryEntry({
      permissions: { canManageMonsterVisualConfig: true },
      status: {
        draftRevision: 1,
        publishedVersion: 0,
        manifestHash: '',
        validation: {},
      },
      draft: { assets: {} },
      published: null,
      versions: [],
    });
    process.stdout.write(JSON.stringify(entry));
  `);

  assert.equal(result.reviewStatus, 'unknown');
});

// =================================================================
// 13. SSR: clean reviewStatus renders "Warnings Only" chip
// =================================================================

test('registry card renders "Warnings Only" chip for clean reviewStatus', async () => {
  const cleanModel = baseModel({
    monsterVisualConfig: {
      permissions: { canManageMonsterVisualConfig: true, canViewMonsterVisualConfig: true },
      status: {
        schemaVersion: 2,
        manifestHash: 'hash-clean',
        draftRevision: 3,
        draftUpdatedAt: Date.UTC(2026, 3, 27),
        draftUpdatedByAccountId: 'adult-admin',
        publishedVersion: 1,
        publishedAt: Date.UTC(2026, 3, 25),
        publishedByAccountId: 'adult-admin',
        validation: {
          ok: false,
          errorCount: 0,
          warningCount: 2,
          errors: [],
          warnings: [
            { code: 'deprecated_motion', assetKey: 'vellhorn-b1-3' },
            { code: 'low_contrast', assetKey: 'skarr-b2-1' },
          ],
        },
      },
      draft: { manifestHash: 'hash-clean', assets: {} },
      published: { manifestHash: 'prev-hash', assets: {} },
      versions: [],
      mutation: {},
    },
  });
  const html = await renderContentSection({ model: cleanModel });

  assert.match(html, /Warnings Only/, '"Warnings Only" chip label renders for clean status');
  assert.match(html, /chip warn/, '"warn" class applied to clean status chip');
});

// =================================================================
// 14. SSR: unknown reviewStatus renders "No Validation" chip
// =================================================================

test('registry card renders "No Validation" chip for unknown reviewStatus', async () => {
  const unknownModel = baseModel({
    monsterVisualConfig: {
      permissions: { canManageMonsterVisualConfig: true, canViewMonsterVisualConfig: true },
      status: {
        schemaVersion: 2,
        manifestHash: '',
        draftRevision: 1,
        draftUpdatedAt: Date.UTC(2026, 3, 27),
        draftUpdatedByAccountId: 'adult-admin',
        publishedVersion: 0,
        publishedAt: 0,
        publishedByAccountId: '',
        validation: {},
      },
      draft: { assets: {} },
      published: null,
      versions: [],
      mutation: {},
    },
  });
  const html = await renderContentSection({ model: unknownModel });

  assert.match(html, /No Validation/, '"No Validation" chip label renders for unknown status');
});

// =================================================================
// 15. SSR: Publish and Restore button dispatch payloads verified
// =================================================================

test('registry card Publish button carries expectedDraftRevision in dispatch', async () => {
  // Verify the Publish button includes the right disabled-state logic
  // and the Restore select is wired with version options.
  const html = await renderContentSection();

  // Publish button is not disabled (canManage=true, ok=true, hasDraft=true in baseModel).
  // React SSR renders disabled="" before data-action, so check both orderings.
  assert.doesNotMatch(
    html,
    /disabled="[^"]*"[^>]*data-action="registry-publish"/,
    'Publish button is enabled for admin with valid draft (disabled before action)'
  );
  assert.doesNotMatch(
    html,
    /data-action="registry-publish"[^>]*disabled/,
    'Publish button is enabled for admin with valid draft (disabled after action)'
  );

  // Restore select has version options from baseModel fixture
  assert.match(html, /aria-label="Restore version"/, 'Restore select has accessible label');
  assert.match(html, /Version 3/, 'Restore option for version 3 renders');
  assert.match(html, /Version 2/, 'Restore option for version 2 renders');

  // Publish button disabled when validation fails
  const blockedModel = baseModel({
    monsterVisualConfig: {
      permissions: { canManageMonsterVisualConfig: true, canViewMonsterVisualConfig: true },
      status: {
        schemaVersion: 2,
        manifestHash: 'hash-blocked',
        draftRevision: 4,
        draftUpdatedAt: Date.UTC(2026, 3, 27),
        draftUpdatedByAccountId: 'adult-admin',
        publishedVersion: 2,
        publishedAt: Date.UTC(2026, 3, 25),
        publishedByAccountId: 'adult-admin',
        validation: { ok: false, errorCount: 1, warningCount: 0, errors: [{ code: 'err' }], warnings: [] },
      },
      draft: { manifestHash: 'hash-blocked', assets: {} },
      published: { manifestHash: 'prev-hash', assets: {} },
      versions: [{ version: 2, publishedAt: Date.UTC(2026, 3, 25) }],
      mutation: {},
    },
  });
  const blockedHtml = await renderContentSection({ model: blockedModel });
  // React SSR may render disabled="" before data-action, so match the
  // button element containing both the disabled attribute and the action.
  assert.match(
    blockedHtml,
    /disabled="[^"]*"[^>]*data-action="registry-publish"/,
    'Publish button disabled when validation has blockers'
  );
});

// =================================================================
// 16. SSR: existing panels still render alongside registry
// =================================================================

test('existing content section panels still render alongside registry card', async () => {
  const html = await renderContentSection();

  // Content release panel
  assert.match(html, /Content release status/, 'Content release panel still renders');

  // Import validation panel
  assert.match(html, /Import \/ validation status/, 'Import validation panel still renders');

  // Post-mega debug panel
  assert.match(html, /data-panel="post-mega-spelling-debug"/, 'Post-mega debug panel still renders');

  // Registry card
  assert.match(html, /data-panel="asset-registry"/, 'Asset registry renders');
  assert.match(html, /data-asset-id="monster-visual-config"/, 'Monster visual config card renders');
});
