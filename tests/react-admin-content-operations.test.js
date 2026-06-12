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

const CONTENT_OPS_SECTION_PATH = JSON.stringify(
  path.join(rootDir, 'src/surfaces/hubs/AdminContentOperationsSection.jsx'),
);

const CONTENT_SECTION_PATH = JSON.stringify(
  path.join(rootDir, 'src/surfaces/hubs/AdminContentSection.jsx'),
);

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

const contentPackage = {
  packageId: 'pkg-draft-1',
  subjectId: 'spelling',
  templateId: 'word-family',
  title: 'Word family update',
  state: 'draft',
  operationCount: 1,
  updatedAt: Date.UTC(2026, 5, 11, 10, 0, 0),
  operations: [
    {
      operationId: 'op-1',
      entityType: 'spelling.word',
      entityId: 'metamorphosis',
      fieldPath: 'explanation',
      action: 'set',
    },
  ],
  blockers: {
    validation: { status: 'passed', errorCount: 0, warningCount: 0, errors: [], warnings: [] },
    audio: { status: 'blocked', blockers: ['word_audio_missing'], warnings: [] },
    assets: { status: 'not_scanned', blockers: [], warnings: ['asset_scan_pending'] },
    rewards: { status: 'passed', blockers: [], warnings: [] },
    visibility: { status: 'passed', blockers: [], warnings: [] },
    exposure: { status: 'passed', blockers: [], warnings: [] },
    publishReadiness: { status: 'not_ready', blockers: ['approval_required'], warnings: [] },
  },
};

const cleanLifecycleBlockers = {
  validation: { status: 'passed', errorCount: 0, warningCount: 0, errors: [], warnings: [] },
  conflicts: { status: 'passed', count: 0, items: [] },
  audio: { status: 'passed', blockers: [], warnings: [] },
  assets: { status: 'passed', blockers: [], warnings: [] },
  rewards: { status: 'passed', blockers: [], warnings: [] },
  visibility: { status: 'passed', blockers: [], warnings: [] },
  exposure: { status: 'passed', blockers: [], warnings: [] },
  publishReadiness: { status: 'not_ready', blockers: ['approval_required'], warnings: [] },
};

const lifecycleCandidate = {
  candidateId: 'cand-ready-1',
  packageId: 'pkg-draft-1',
  baseReleaseId: 'rel-global-1',
  currentReleaseId: 'rel-global-1',
  operationsHash: 'ops-ready-1',
  candidateHash: 'candidate-ready-1',
  validation: { ok: true, errorCount: 0, warningCount: 0, errors: [], warnings: [] },
  blockers: cleanLifecycleBlockers,
  conflicts: [],
  createdAt: Date.UTC(2026, 5, 11, 10, 5, 0),
};

const conflictedLifecycleCandidate = {
  ...lifecycleCandidate,
  candidateId: 'cand-conflict-1',
  operationsHash: 'ops-conflict-1',
  candidateHash: 'candidate-conflict-1',
  blockers: {
    ...cleanLifecycleBlockers,
    conflicts: {
      status: 'blocked',
      count: 1,
      items: [{
        conflictId: 'conflict-word-explanation',
        code: 'same_field_conflict',
        entityType: 'spelling.word',
        entityId: 'metamorphosis',
        fieldPath: 'explanation',
      }],
    },
  },
  conflicts: [{
    conflictId: 'conflict-word-explanation',
    code: 'same_field_conflict',
    entityType: 'spelling.word',
    entityId: 'metamorphosis',
    fieldPath: 'explanation',
    packageValue: 'Package explanation.',
    currentValue: 'Current release explanation.',
    baseValue: 'Original explanation.',
  }],
};

const release = {
  releaseId: 'rel-global-1',
  subjectId: 'spelling',
  status: 'published',
  snapshotHash: 'hash-1',
  publishedAt: Date.UTC(2026, 5, 11, 9, 0, 0),
  proof: { source: 'test' },
};

const overview = {
  subjectId: 'spelling',
  latestRelease: release,
  packageCounts: { draft: 1, blocked: 1, approved: 1 },
  lanes: {
    blocked: [{ ...contentPackage, packageId: 'pkg-blocked-1', title: 'Blocked pool edit', state: 'blocked' }],
    readyForApproval: [{ ...contentPackage, packageId: 'pkg-ready-1', title: 'Ready word edit', state: 'ready_for_approval' }],
    approvedPendingPublish: [{ ...contentPackage, packageId: 'pkg-approved-1', title: 'Approved audio edit', state: 'approved' }],
    drafts: [contentPackage],
    recentReleases: [release],
  },
  actor: {
    accountId: 'admin-a',
    platformRole: 'admin',
    capabilities: {
      'content_operations.edit': true,
      'content_operations.approve': true,
      'content_operations.publish': true,
    },
  },
};

const spellingBrowse = {
  browse: {
    subjectId: 'spelling',
    release,
    packageDraft: {
      active: true,
      status: 'available',
      packageId: 'pkg-draft-1',
      packageTitle: 'Word family update',
      packageState: 'draft',
      candidateId: 'cand-ready-1',
      candidateHash: 'candidate-ready-1',
      validation: { status: 'passed', ok: true, errorCount: 0, warningCount: 0, errors: [], warnings: [] },
    },
    filters: { query: '', pool: 'all', listId: '', limit: 75 },
    totals: { words: 1, displayedWords: 1, matchedWords: 1, wordLists: 1, sentences: 2, variants: 1, families: 1 },
    draftStateCounts: { added: 0, modified: 1, removed: 0, unchanged: 0 },
    pools: [{ pool: 'extra', wordCount: 1, sentenceCount: 2, variantCount: 1, draftStateCounts: { modified: 1 } }],
    wordLists: [{
      id: 'extra-greek',
      title: 'Extra Greek roots',
      spellingPool: 'extra',
      coverageTier: 'enrichment-extra',
      yearGroups: [],
      wordCount: 1,
      draftState: 'unchanged',
    }],
    words: [{
      slug: 'metamorphosis',
      word: 'metamorphosis',
      family: 'shape-change',
      listId: 'extra-greek',
      listTitle: 'Extra Greek roots',
      spellingPool: 'extra',
      coverageTier: 'enrichment-extra',
      yearGroups: [],
      tags: [],
      patternIds: [],
      acceptedCount: 1,
      sentenceCount: 1,
      variantCount: 1,
      variantSentenceCount: 1,
      familySize: 1,
      draftState: 'modified',
      hasCurrent: true,
      hasPackageDraft: true,
      audioReadiness: {
        status: 'not_scanned',
        wordProfiles: ['male.natural', 'female.natural'],
        sentenceProfiles: ['male.normal', 'male.slow', 'female.normal', 'female.slow'],
        wordAudioRequired: 4,
        sentenceAudioRequired: 8,
        totalRequired: 12,
      },
      validationState: { status: 'passed', ok: true, errorCount: 0, warningCount: 0, errors: [], warnings: [] },
      rewardImpact: {
        status: 'not_mapped',
        spellingPool: 'extra',
        coverageTier: 'enrichment-extra',
        familySize: 1,
        wordListId: 'extra-greek',
        monsterBinding: { mode: 'pool', poolId: 'extra', assignment: 'unresolved' },
      },
    }],
  },
};

const spellingWordDetail = {
  detail: {
    type: 'word',
    slug: 'metamorphosis',
    found: true,
    draftState: 'modified',
    release,
    packageDraft: spellingBrowse.browse.packageDraft,
    validationState: { status: 'passed', ok: true, errorCount: 0, warningCount: 0, errors: [], warnings: [] },
    current: {
      slug: 'metamorphosis',
      word: 'metamorphosis',
      family: 'shape-change',
      spellingPool: 'extra',
      coverageTier: 'enrichment-extra',
      accepted: ['metamorphosis'],
      sentenceEntryIds: ['meta-s1'],
      explanation: 'Current release explanation.',
      sourceNote: 'Seed fixture.',
      provenance: { source: 'test-fixture' },
      progressKey: 'metamorphosis',
      sentences: [{ id: 'meta-s1', wordSlug: 'metamorphosis', text: 'The tadpole changes.', tags: [] }],
      variants: [{
        word: 'metamorphic',
        accepted: ['metamorphic'],
        explanation: 'Metamorphic shares the same changing root.',
        sentenceEntryIds: ['meta-v1'],
        sourceNote: 'Seed fixture.',
        provenance: { source: 'test-fixture' },
        progressKey: 'metamorphic',
        sentenceCount: 1,
      }],
      familyMembers: [{ slug: 'metamorphosis', word: 'metamorphosis' }],
      audioReadiness: spellingBrowse.browse.words[0].audioReadiness,
      rewardImpact: spellingBrowse.browse.words[0].rewardImpact,
    },
    packageValue: {
      slug: 'metamorphosis',
      word: 'metamorphosis',
      family: 'shape-change',
      spellingPool: 'extra',
      coverageTier: 'enrichment-extra',
      accepted: ['metamorphosis'],
      sentenceEntryIds: ['meta-s1'],
      explanation: 'Package draft explanation.',
      sourceNote: 'Seed fixture.',
      provenance: { source: 'test-fixture' },
      progressKey: 'metamorphosis',
      sentences: [{ id: 'meta-s1', wordSlug: 'metamorphosis', text: 'The tadpole changes completely.', tags: [] }],
      variants: [{
        word: 'metamorphic',
        accepted: ['metamorphic'],
        explanation: 'Metamorphic shares the same changing root.',
        sentenceEntryIds: ['meta-v1'],
        sourceNote: 'Seed fixture.',
        provenance: { source: 'test-fixture' },
        progressKey: 'metamorphic',
        sentenceCount: 1,
      }],
      familyMembers: [{ slug: 'metamorphosis', word: 'metamorphosis' }],
      audioReadiness: spellingBrowse.browse.words[0].audioReadiness,
      rewardImpact: spellingBrowse.browse.words[0].rewardImpact,
    },
  },
};

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
      versions: [{ version: 3, publishedAt: Date.UTC(2026, 3, 26) }],
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
      ],
    },
    contentOperations: {
      overview,
      packages: { packages: [contentPackage] },
      releases: { releases: [release] },
      packageDetail: {
        package: contentPackage,
        events: [{ eventId: 'event-1', eventType: 'package.created', createdAt: Date.UTC(2026, 5, 11) }],
      },
    },
    ...overrides,
  };
}

async function renderEntry(entrySource) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-content-ops-ssr-'));
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

async function runClientEntry(entrySource) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-content-ops-client-'));
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
      external: ['jsdom'],
      nodePaths: nodePaths(),
      logLevel: 'silent',
    });
    const output = execFileSync(process.execPath, [bundlePath], {
      cwd: rootDir,
      env: {
        ...process.env,
        NODE_PATH: nodePaths().join(path.delimiter),
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 20_000,
    });
    return normaliseLineEndings(output).replace(/\n+$/, '');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

function buildContentOpsEntry(props = {}) {
  const allProps = {
    model: baseModel(),
    actions: {},
    ...props,
  };
  return `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminContentOperationsSection } from ${CONTENT_OPS_SECTION_PATH};
    const props = ${JSON.stringify(allProps)};
    const html = renderToStaticMarkup(<AdminContentOperationsSection {...props} />);
    process.stdout.write(html);
  `;
}

function buildAdminContentEntry(model = baseModel()) {
  return `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminContentSection } from ${CONTENT_SECTION_PATH};
    const model = ${JSON.stringify(model)};
    const actions = ${baseActions()};
    const appState = ${JSON.stringify(baseAppState())};
    const accessContext = ${JSON.stringify(baseAccessContext())};
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

test('Content Operations Centre SSR renders home lanes and required top-level areas', async () => {
  const html = await renderEntry(buildContentOpsEntry());

  assert.match(html, /Content Operations Centre/);
  assert.match(html, /Spelling package workflow/);
  assert.match(html, /Blocked/);
  assert.match(html, /Ready for approval/);
  assert.match(html, /Approved pending publish/);
  assert.match(html, /Open drafts/);
  assert.match(html, /Audio \/ asset warnings/);
  assert.match(html, /Recent releases/);
  assert.match(html, /Word family update/);
  assert.match(html, /Blocked pool edit/);
  assert.match(html, /rel-global-1/);
  assert.match(html, /Release history/);
  assert.doesNotMatch(html, />Package detail<\/button>/);
  for (const label of ['Packages', 'Spelling', 'Audio', 'Pools &amp; Rewards', 'Monsters &amp; Assets', 'Hero / Codex', 'Approvals']) {
    assert.match(html, new RegExp(label));
  }
});

test('Content Operations Centre SSR renders package-scoped domain tabs and audit state', async () => {
  const html = await renderEntry(buildContentOpsEntry({
    initialActiveTab: 'detail',
    initialDetailTab: 'spelling',
  }));

  assert.match(html, /data-package-detail="pkg-draft-1"/);
  assert.match(html, /Package detail/);
  assert.match(html, /Spelling operations/);
  assert.match(html, /metamorphosis/);
  assert.match(html, /explanation/);
  for (const label of ['Spelling', 'Audio', 'Pools &amp; Rewards', 'Monsters &amp; Assets', 'Hero / Codex', 'Approvals', 'Audit']) {
    assert.match(html, new RegExp(label));
  }
});

test('Content Operations Centre area pages browse without package mutation controls', async () => {
  const html = await renderEntry(buildContentOpsEntry({
    model: baseModel({
      contentOperations: {
        overview: {
          ...overview,
          lanes: {
            blocked: [],
            readyForApproval: [],
            approvedPendingPublish: [],
            drafts: [],
            recentReleases: [release],
          },
        },
        packages: { packages: [] },
        releases: { releases: [release] },
        packageDetail: null,
      },
    }),
    initialActiveTab: 'audio',
  }));

  assert.match(html, /Published state/);
  assert.match(html, /Audio/);
  assert.match(html, /No package selected/);
  assert.match(html, /No mutation controls/);
  assert.doesNotMatch(html, /scan-audio/);
  assert.doesNotMatch(html, /generate-audio/);
});

test('Content Operations Centre area pages show selected package readiness without mutation controls', async () => {
  const audioHtml = await renderEntry(buildContentOpsEntry({
    initialActiveTab: 'audio',
    initialSelectedPackageId: 'pkg-draft-1',
  }));
  assert.match(audioHtml, /Published state/);
  assert.match(audioHtml, /Package pkg-draft-1/);
  assert.match(audioHtml, /blocked/);
  assert.match(audioHtml, /1 blockers/);
  assert.match(audioHtml, /word_audio_missing/);
  assert.match(audioHtml, /No mutation controls/);

  const assetHtml = await renderEntry(buildContentOpsEntry({
    initialActiveTab: 'monstersAssets',
    initialSelectedPackageId: 'pkg-draft-1',
  }));
  assert.match(assetHtml, /Monsters &amp; Assets/);
  assert.match(assetHtml, /1 warnings/);
  assert.match(assetHtml, /No mutation controls/);
});

test('Content Operations Centre SSR handles missing local data without breaking the panel', async () => {
  const html = await renderEntry(buildContentOpsEntry({
    model: baseModel({ contentOperations: null }),
    actions: {},
  }));

  assert.match(html, /Content Operations Centre/);
  assert.match(html, /No content operation package data/);
});

test('Admin Content section keeps existing overview and asset registry with the new centre', async () => {
  const html = await renderEntry(buildAdminContentEntry());

  assert.match(html, /data-panel="subject-overview"/);
  assert.match(html, /Content Operations Centre/);
  assert.match(html, /data-panel="asset-registry"/);
  assert.match(html, /Content release status/);
  assert.ok(
    html.indexOf('data-panel="subject-overview"') < html.indexOf('Content Operations Centre'),
    'Subject Overview should remain before the Content Operations Centre',
  );
  assert.ok(
    html.indexOf('Content release status') < html.indexOf('Content Operations Centre'),
    'Existing content release controls should remain before the Content Operations Centre',
  );
  assert.ok(
    html.indexOf('Content Operations Centre') < html.indexOf('data-panel="asset-registry"'),
    'Asset registry should remain reachable after the Content Operations Centre',
  );
});

test('Content Operations Centre mounted shell loads API data without implicit package selection', async () => {
  const output = await runClientEntry(`
    const { JSDOM } = require('jsdom');

    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'https://ks2.eugnel.uk/admin',
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.navigator = dom.window.navigator;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Event = dom.window.Event;

    const React = require('react');
    const { createRoot } = require('react-dom/client');
    const { AdminContentOperationsSection } = require(${CONTENT_OPS_SECTION_PATH});
    const { act } = React;

    const model = ${JSON.stringify(baseModel({ contentOperations: null }))};
    const overview = ${JSON.stringify(overview)};
    const contentPackage = ${JSON.stringify(contentPackage)};
    const compactPackage = { ...contentPackage };
    delete compactPackage.operationCount;
    delete compactPackage.operations;
    const release = ${JSON.stringify(release)};
    const calls = [];
    const actions = {
      contentOperationsApi: {
        async readOverview(args) {
          calls.push({ method: 'overview', args });
          return overview;
        },
        async readPackages(args) {
          calls.push({ method: 'packages', args });
          return { packages: [compactPackage] };
        },
        async readReleases(args) {
          calls.push({ method: 'releases', args });
          return { releases: [release] };
        },
      },
    };

    async function flush() {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    async function main() {
      const root = createRoot(document.getElementById('root'));
      await act(async () => {
        root.render(React.createElement(AdminContentOperationsSection, { model, actions }));
      });
      await flush();
      await flush();

      const overviewText = document.body.textContent;
      const packagesTab = Array.from(document.querySelectorAll('[role="tab"]'))
        .find((entry) => entry.textContent === 'Packages');
      await act(async () => {
        packagesTab.click();
      });
      const selectedRows = document.querySelectorAll('[data-selected="true"]').length;
      const packageTableText = document.body.textContent;
      process.stdout.write(JSON.stringify({ calls, overviewText, packageTableText, selectedRows }));

      await act(async () => {
        root.unmount();
      });
      dom.window.close();
      process.exit(0);
    }

    main().catch((error) => {
      process.stderr.write(error.stack || error.message);
      process.exitCode = 1;
    });
  `);
  const result = JSON.parse(output);

  assert.deepEqual(result.calls, [
    { method: 'overview', args: { limit: 30 } },
    { method: 'packages', args: { limit: 50 } },
    { method: 'releases', args: { limit: 20 } },
  ]);
  assert.match(result.overviewText, /Word family update/);
  assert.match(result.overviewText, /Audio \/ asset warnings/);
  assert.match(result.overviewText, /rel-global-1/);
  assert.match(result.packageTableText, /Pending/);
  assert.equal(result.selectedRows, 0);
});

test('Content Operations Centre spelling tab browses words and loads package draft detail', async () => {
  const output = await runClientEntry(`
    const { JSDOM } = require('jsdom');

    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'https://ks2.eugnel.uk/admin',
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.navigator = dom.window.navigator;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Event = dom.window.Event;

    const React = require('react');
    const { createRoot } = require('react-dom/client');
    const { AdminContentOperationsSection } = require(${CONTENT_OPS_SECTION_PATH});
    const { act } = React;

    const calls = [];
    const model = ${JSON.stringify(baseModel({
      contentOperations: {
        overview,
        packages: { packages: [contentPackage] },
        releases: { releases: [release] },
        spellingBrowse,
        spellingItemDetail: null,
      },
    }))};
    const actions = {
      contentOperationsApi: {
        async readSpellingWord(args) {
          calls.push({ method: 'readSpellingWord', args });
          return ${JSON.stringify(spellingWordDetail)};
        },
      },
    };

    async function flush() {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    async function main() {
      const root = createRoot(document.getElementById('root'));
      await act(async () => {
        root.render(React.createElement(AdminContentOperationsSection, {
          model,
          actions,
          initialActiveTab: 'spelling',
          initialSelectedPackageId: 'pkg-draft-1',
        }));
      });
      await flush();

      const beforeClickText = document.body.textContent;
      const wordButton = document.querySelector('[data-content-ops-spelling-word="metamorphosis"]');
      await act(async () => {
        wordButton.click();
      });
      await flush();
      const afterClickText = document.body.textContent;
      process.stdout.write(JSON.stringify({ calls, beforeClickText, afterClickText }));

      await act(async () => {
        root.unmount();
      });
      dom.window.close();
      process.exit(0);
    }

    main().catch((error) => {
      process.stderr.write(error.stack || error.message);
      process.exitCode = 1;
    });
  `);
  const result = JSON.parse(output);

  assert.match(result.beforeClickText, /Spelling browse/);
  assert.match(result.beforeClickText, /Extra Greek roots/);
  assert.match(result.beforeClickText, /Package draft available/);
  assert.deepEqual(result.calls, [
    { method: 'readSpellingWord', args: { slug: 'metamorphosis', packageId: 'pkg-draft-1' } },
  ]);
  assert.match(result.afterClickText, /Package draft explanation/);
  assert.match(result.afterClickText, /The tadpole changes/);
});

test('Content Operations Centre spelling word editor appends word upsert operations', async () => {
  const output = await runClientEntry(`
    const { JSDOM } = require('jsdom');

    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'https://ks2.eugnel.uk/admin',
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.navigator = dom.window.navigator;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Event = dom.window.Event;

    const React = require('react');
    const { createRoot } = require('react-dom/client');
    const { AdminContentOperationsSection } = require(${CONTENT_OPS_SECTION_PATH});
    const { act } = React;

    const calls = [];
    const model = ${JSON.stringify(baseModel({
      contentOperations: {
        overview,
        packages: { packages: [contentPackage] },
        releases: { releases: [release] },
        spellingBrowse,
        spellingItemDetail: null,
      },
    }))};
    const actions = {
      contentOperationsApi: {
        async readSpellingWord(args) {
          calls.push({ method: 'readSpellingWord', args });
          return ${JSON.stringify(spellingWordDetail)};
        },
        async appendOperation(args) {
          calls.push({ method: 'appendOperation', args });
          return { ok: true, operation: { operationId: 'op-word-save-1', ...args.operation } };
        },
      },
    };

    async function flush() {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    async function setControl(selector, value) {
      const control = document.querySelector(selector);
      const prototype = control.tagName === 'TEXTAREA'
        ? dom.window.HTMLTextAreaElement.prototype
        : dom.window.HTMLInputElement.prototype;
      const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
      valueSetter.call(control, value);
      await act(async () => {
        control.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        control.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });
    }

    async function main() {
      const root = createRoot(document.getElementById('root'));
      await act(async () => {
        root.render(React.createElement(AdminContentOperationsSection, {
          model,
          actions,
          initialActiveTab: 'spelling',
          initialSelectedPackageId: 'pkg-draft-1',
        }));
      });
      await flush();

      const wordButton = document.querySelector('[data-content-ops-spelling-word="metamorphosis"]');
      await act(async () => {
        wordButton.click();
      });
      await flush();

      await setControl('[data-content-ops-word-field="accepted"]', 'metamorphosis');
      await setControl('[data-content-ops-word-field="sentenceEntryIds"]', 'meta-s1');
      await setControl('[data-content-ops-word-field="explanation"]', 'Package draft explanation for editorial save.');
      await setControl('[data-content-ops-word-field="sourceNote"]', 'Edited in Content Operations Centre.');
      await setControl('[data-content-ops-word-field="provenanceSource"]', 'admin-editor');
      const saveButton = Array.from(document.querySelectorAll('button'))
        .find((button) => button.textContent === 'Save word');
      await act(async () => {
        saveButton.click();
      });
      await flush();
      await flush();

      process.stdout.write(JSON.stringify({
        calls,
        text: document.body.textContent,
      }));

      await act(async () => {
        root.unmount();
      });
      dom.window.close();
      process.exit(0);
    }

    main().catch((error) => {
      process.stderr.write(error.stack || error.message);
      process.exitCode = 1;
    });
  `);
  const result = JSON.parse(output);
  const appendCall = result.calls.find((entry) => entry.method === 'appendOperation');

  assert.ok(appendCall, 'word editor should append an operation');
  assert.equal(appendCall.args.packageId, 'pkg-draft-1');
  assert.equal(appendCall.args.operation.entityType, 'spelling.word');
  assert.equal(appendCall.args.operation.action, 'upsert');
  assert.equal(appendCall.args.operation.entityId, 'metamorphosis');
  assert.equal(appendCall.args.operation.payload.explanation, 'Package draft explanation for editorial save.');
  assert.equal(appendCall.args.operation.payload.sourceNote, 'Edited in Content Operations Centre.');
  assert.equal(appendCall.args.operation.payload.progressKey, 'metamorphosis');
  assert.equal(appendCall.args.mutation.requestId.startsWith('content-ops-word-upsert-pkg-draft-1-'), true);
  assert.match(result.text, /Word operation saved/);
});

test('Content Operations Centre spelling sentence editor appends sentence upsert operations', async () => {
  const output = await runClientEntry(`
    const { JSDOM } = require('jsdom');

    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'https://ks2.eugnel.uk/admin',
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.navigator = dom.window.navigator;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Event = dom.window.Event;

    const React = require('react');
    const { createRoot } = require('react-dom/client');
    const { AdminContentOperationsSection } = require(${CONTENT_OPS_SECTION_PATH});
    const { act } = React;

    const calls = [];
    const model = ${JSON.stringify(baseModel({
      contentOperations: {
        overview,
        packages: { packages: [contentPackage] },
        releases: { releases: [release] },
        spellingBrowse,
        spellingItemDetail: null,
      },
    }))};
    const actions = {
      contentOperationsApi: {
        async readSpellingWord(args) {
          calls.push({ method: 'readSpellingWord', args });
          return ${JSON.stringify(spellingWordDetail)};
        },
        async appendOperation(args) {
          calls.push({ method: 'appendOperation', args });
          return { ok: true, operation: { operationId: 'op-sentence-save-1', ...args.operation } };
        },
      },
    };

    async function flush() {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    async function setControl(selector, value) {
      const control = document.querySelector(selector);
      const prototype = control.tagName === 'TEXTAREA'
        ? dom.window.HTMLTextAreaElement.prototype
        : dom.window.HTMLInputElement.prototype;
      const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
      valueSetter.call(control, value);
      await act(async () => {
        control.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        control.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });
    }

    async function main() {
      const root = createRoot(document.getElementById('root'));
      await act(async () => {
        root.render(React.createElement(AdminContentOperationsSection, {
          model,
          actions,
          initialActiveTab: 'spelling',
          initialSelectedPackageId: 'pkg-draft-1',
        }));
      });
      await flush();

      const wordButton = document.querySelector('[data-content-ops-spelling-word="metamorphosis"]');
      await act(async () => {
        wordButton.click();
      });
      await flush();

      const newSentenceButton = Array.from(document.querySelectorAll('button'))
        .find((button) => button.textContent === 'New sentence');
      await act(async () => {
        newSentenceButton.click();
      });
      await setControl('[data-content-ops-sentence-field="id"]', 'meta-s2');
      await setControl('[data-content-ops-sentence-field="wordSlug"]', 'metamorphosis');
      await setControl('[data-content-ops-sentence-field="text"]', 'The moth completes metamorphosis in the summer.');
      await setControl('[data-content-ops-sentence-field="variantLabel"]', 'default');
      await setControl('[data-content-ops-sentence-field="tags"]', 'dictation, extra');
      await setControl('[data-content-ops-sentence-field="sourceNote"]', 'Added in Content Operations Centre.');
      await setControl('[data-content-ops-sentence-field="provenanceSource"]', 'admin-editor');
      const saveButton = Array.from(document.querySelectorAll('button'))
        .find((button) => button.textContent === 'Save sentence');
      await act(async () => {
        saveButton.click();
      });
      await flush();
      await flush();

      process.stdout.write(JSON.stringify({
        calls,
        text: document.body.textContent,
      }));

      await act(async () => {
        root.unmount();
      });
      dom.window.close();
      process.exit(0);
    }

    main().catch((error) => {
      process.stderr.write(error.stack || error.message);
      process.exitCode = 1;
    });
  `);
  const result = JSON.parse(output);
  const appendCall = result.calls.find((entry) => entry.method === 'appendOperation');

  assert.ok(appendCall, 'sentence editor should append an operation');
  assert.equal(appendCall.args.packageId, 'pkg-draft-1');
  assert.equal(appendCall.args.operation.entityType, 'spelling.sentenceEntry');
  assert.equal(appendCall.args.operation.action, 'upsert');
  assert.equal(appendCall.args.operation.entityId, 'meta-s2');
  assert.equal(appendCall.args.operation.payload.wordSlug, 'metamorphosis');
  assert.equal(appendCall.args.operation.payload.text, 'The moth completes metamorphosis in the summer.');
  assert.deepEqual(appendCall.args.operation.payload.tags, ['dictation', 'extra']);
  assert.equal(appendCall.args.mutation.requestId.startsWith('content-ops-sentence-upsert-pkg-draft-1-'), true);
  assert.match(result.text, /Sentence operation saved/);
});

test('Content Operations Centre spelling word-list editor appends list upsert operations', async () => {
  const output = await runClientEntry(`
    const { JSDOM } = require('jsdom');

    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'https://ks2.eugnel.uk/admin',
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.navigator = dom.window.navigator;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Event = dom.window.Event;

    const React = require('react');
    const { createRoot } = require('react-dom/client');
    const { AdminContentOperationsSection } = require(${CONTENT_OPS_SECTION_PATH});
    const { act } = React;

    const calls = [];
    const model = ${JSON.stringify(baseModel({
      contentOperations: {
        overview,
        packages: { packages: [contentPackage] },
        releases: { releases: [release] },
        spellingBrowse,
        spellingItemDetail: spellingWordDetail,
      },
    }))};
    const actions = {
      contentOperationsApi: {
        async readSpellingWord(args) {
          calls.push({ method: 'readSpellingWord', args });
          return ${JSON.stringify(spellingWordDetail)};
        },
        async appendOperation(args) {
          calls.push({ method: 'appendOperation', args });
          return { ok: true, operation: { operationId: 'op-list-save-1', ...args.operation } };
        },
      },
    };

    async function flush() {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    async function setControl(selector, value) {
      const control = document.querySelector(selector);
      const prototype = control.tagName === 'TEXTAREA'
        ? dom.window.HTMLTextAreaElement.prototype
        : dom.window.HTMLInputElement.prototype;
      const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
      valueSetter.call(control, value);
      await act(async () => {
        control.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        control.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });
    }

    async function main() {
      const root = createRoot(document.getElementById('root'));
      await act(async () => {
        root.render(React.createElement(AdminContentOperationsSection, {
          model,
          actions,
          initialActiveTab: 'spelling',
          initialSelectedPackageId: 'pkg-draft-1',
        }));
      });
      await flush();

      await setControl('[data-content-ops-word-list-field="title"]', 'Extra Greek roots revised');
      await setControl('[data-content-ops-word-list-field="wordSlugs"]', 'metamorphosis');
      await setControl('[data-content-ops-word-list-field="sourceNote"]', 'Edited in Content Operations Centre.');
      await setControl('[data-content-ops-word-list-field="provenanceSource"]', 'admin-editor');
      const saveButton = Array.from(document.querySelectorAll('button'))
        .find((button) => button.textContent === 'Save list');
      await act(async () => {
        saveButton.click();
      });
      await flush();
      await flush();

      process.stdout.write(JSON.stringify({
        calls,
        text: document.body.textContent,
      }));

      await act(async () => {
        root.unmount();
      });
      dom.window.close();
      process.exit(0);
    }

    main().catch((error) => {
      process.stderr.write(error.stack || error.message);
      process.exitCode = 1;
    });
  `);
  const result = JSON.parse(output);
  const appendCall = result.calls.find((entry) => entry.method === 'appendOperation');

  assert.ok(appendCall, 'word-list editor should append an operation');
  assert.equal(appendCall.args.packageId, 'pkg-draft-1');
  assert.equal(appendCall.args.operation.entityType, 'spelling.wordList');
  assert.equal(appendCall.args.operation.action, 'upsert');
  assert.equal(appendCall.args.operation.entityId, 'extra-greek');
  assert.equal(appendCall.args.operation.payload.title, 'Extra Greek roots revised');
  assert.deepEqual(appendCall.args.operation.payload.wordSlugs, ['metamorphosis']);
  assert.equal(Object.prototype.hasOwnProperty.call(appendCall.args.operation.payload, 'sentences'), false);
  assert.equal(appendCall.args.mutation.requestId.startsWith('content-ops-word-list-upsert-pkg-draft-1-'), true);
  assert.match(result.text, /Word list operation saved/);
});

test('Content Operations Centre spelling pool editor appends pool upsert operations', async () => {
  const spellingBrowseWithFuturePool = {
    browse: {
      ...spellingBrowse.browse,
      pools: [
        ...spellingBrowse.browse.pools,
        {
          id: 'secure-vocabulary',
          pool: 'secure-vocabulary',
          title: 'Secure vocabulary',
          type: 'extension',
          visibility: { state: 'hidden', learnerVisible: false },
          wordCount: 0,
          totalWordCount: 0,
          sentenceCount: 0,
          variantCount: 0,
          draftStateCounts: {},
          draftState: 'added',
        },
      ],
    },
  };
  const output = await runClientEntry(`
    const { JSDOM } = require('jsdom');

    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'https://ks2.eugnel.uk/admin',
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.navigator = dom.window.navigator;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Event = dom.window.Event;

    const React = require('react');
    const { createRoot } = require('react-dom/client');
    const { AdminContentOperationsSection } = require(${CONTENT_OPS_SECTION_PATH});
    const { act } = React;

    const calls = [];
    const model = ${JSON.stringify(baseModel({
      contentOperations: {
        overview,
        packages: { packages: [contentPackage] },
        releases: { releases: [release] },
        spellingBrowse: spellingBrowseWithFuturePool,
        spellingItemDetail: spellingWordDetail,
      },
    }))};
    const actions = {
      contentOperationsApi: {
        async readSpellingWord(args) {
          calls.push({ method: 'readSpellingWord', args });
          return ${JSON.stringify(spellingWordDetail)};
        },
        async appendOperation(args) {
          calls.push({ method: 'appendOperation', args });
          return { ok: true, operation: { operationId: 'op-pool-save-1', ...args.operation } };
        },
      },
    };

    async function flush() {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    async function setControl(selector, value) {
      const control = document.querySelector(selector);
      const prototype = control.tagName === 'TEXTAREA'
        ? dom.window.HTMLTextAreaElement.prototype
        : (control.tagName === 'SELECT'
            ? dom.window.HTMLSelectElement.prototype
            : dom.window.HTMLInputElement.prototype);
      const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
      valueSetter.call(control, value);
      await act(async () => {
        control.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        control.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });
    }

    async function main() {
      const root = createRoot(document.getElementById('root'));
      await act(async () => {
        root.render(React.createElement(AdminContentOperationsSection, {
          model,
          actions,
          initialActiveTab: 'spelling',
          initialSelectedPackageId: 'pkg-draft-1',
        }));
      });
      await flush();
      const optionValues = {
        browse: Array.from(document.querySelector('[data-content-ops-spelling-pool="true"]').options).map((option) => option.value),
        word: Array.from(document.querySelector('[data-content-ops-word-field="spellingPool"]').options).map((option) => option.value),
        wordList: Array.from(document.querySelector('[data-content-ops-word-list-field="spellingPool"]').options).map((option) => option.value),
      };

      await setControl('[data-content-ops-pool-field="title"]', 'Extra spelling revised');
      await setControl('[data-content-ops-pool-field="type"]', 'enrichment');
      await setControl('[data-content-ops-pool-field="visibilityState"]', 'hidden');
      await setControl('[data-content-ops-pool-field="sourceNote"]', 'Edited in Content Operations Centre.');
      await setControl('[data-content-ops-pool-field="provenanceSource"]', 'admin-editor');
      const saveButton = Array.from(document.querySelectorAll('button'))
        .find((button) => button.textContent === 'Save pool');
      await act(async () => {
        saveButton.click();
      });
      await flush();
      await flush();

      process.stdout.write(JSON.stringify({
        calls,
        text: document.body.textContent,
        optionValues,
      }));

      await act(async () => {
        root.unmount();
      });
      dom.window.close();
      process.exit(0);
    }

    main().catch((error) => {
      process.stderr.write(error.stack || error.message);
      process.exitCode = 1;
    });
  `);
  const result = JSON.parse(output);
  const appendCall = result.calls.find((entry) => entry.method === 'appendOperation');

  assert.ok(appendCall, 'pool editor should append an operation');
  assert.equal(appendCall.args.packageId, 'pkg-draft-1');
  assert.equal(appendCall.args.operation.entityType, 'spelling.pool');
  assert.equal(appendCall.args.operation.action, 'upsert');
  assert.equal(appendCall.args.operation.entityId, 'extra');
  assert.equal(appendCall.args.operation.payload.title, 'Extra spelling revised');
  assert.equal(appendCall.args.operation.payload.type, 'enrichment');
  assert.equal(appendCall.args.operation.payload.visibility.state, 'hidden');
  assert.equal(appendCall.args.mutation.requestId.startsWith('content-ops-pool-upsert-pkg-draft-1-'), true);
  assert.match(result.text, /Pool operation saved/);
  assert.match(result.text, /Secure vocabulary/);
  assert.ok(result.optionValues.browse.includes('secure-vocabulary'));
  assert.ok(result.optionValues.word.includes('secure-vocabulary'));
  assert.ok(result.optionValues.wordList.includes('secure-vocabulary'));
});

test('Content Operations Centre spelling tab reloads browse data after package selection changes', async () => {
  const packageB = {
    ...contentPackage,
    packageId: 'pkg-draft-2',
    title: 'Second word package',
    operations: [{ operationId: 'op-b', entityType: 'spelling.word', entityId: 'beta', action: 'set' }],
    operationCount: 1,
  };
  const spellingBrowseB = {
    browse: {
      ...spellingBrowse.browse,
      packageDraft: {
        ...spellingBrowse.browse.packageDraft,
        packageId: 'pkg-draft-2',
        packageTitle: 'Second word package',
        candidateId: 'cand-ready-2',
        candidateHash: 'candidate-ready-2',
      },
      totals: { words: 1, displayedWords: 1, matchedWords: 1, wordLists: 1, sentences: 1, variants: 0, families: 1 },
      draftStateCounts: { added: 0, modified: 1, removed: 0, unchanged: 0 },
      pools: [{ pool: 'core', wordCount: 1, sentenceCount: 1, variantCount: 0, draftStateCounts: { modified: 1 } }],
      wordLists: [{
        id: 'core-y34',
        title: 'Second core list',
        spellingPool: 'core',
        coverageTier: 'statutory-core',
        yearGroups: ['Y3', 'Y4'],
        wordCount: 1,
        draftState: 'unchanged',
      }],
      words: [{
        ...spellingBrowse.browse.words[0],
        slug: 'beta',
        word: 'beta',
        family: 'greek-root',
        listId: 'core-y34',
        listTitle: 'Second core list',
        spellingPool: 'core',
        coverageTier: 'statutory-core',
        variantCount: 0,
        variantSentenceCount: 0,
        audioReadiness: {
          status: 'not_scanned',
          wordProfiles: ['male.natural', 'female.natural'],
          sentenceProfiles: ['male.normal', 'male.slow', 'female.normal', 'female.slow'],
          wordAudioRequired: 2,
          sentenceAudioRequired: 4,
          totalRequired: 6,
        },
      }],
    },
  };
  const output = await runClientEntry(`
    const { JSDOM } = require('jsdom');

    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'https://ks2.eugnel.uk/admin',
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.navigator = dom.window.navigator;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Event = dom.window.Event;

    const React = require('react');
    const { createRoot } = require('react-dom/client');
    const { AdminContentOperationsSection } = require(${CONTENT_OPS_SECTION_PATH});
    const { act } = React;

    const packageB = ${JSON.stringify(packageB)};
    const spellingBrowseB = ${JSON.stringify(spellingBrowseB)};
    const calls = [];
    const model = ${JSON.stringify(baseModel({
      contentOperations: {
        overview: {
          ...overview,
          lanes: {
            blocked: [],
            readyForApproval: [],
            approvedPendingPublish: [],
            drafts: [contentPackage, packageB],
            recentReleases: [release],
          },
        },
        packages: { packages: [contentPackage, packageB] },
        releases: { releases: [release] },
        packageDetail: null,
        spellingBrowse,
        spellingItemDetail: null,
      },
    }))};
    const actions = {
      contentOperationsApi: {
        async readPackage({ packageId }) {
          calls.push({ method: 'readPackage', packageId });
          return { package: packageB, events: [] };
        },
        async readSpellingBrowse(args) {
          calls.push({ method: 'readSpellingBrowse', args });
          return spellingBrowseB;
        },
      },
    };

    async function flush() {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    async function main() {
      const root = createRoot(document.getElementById('root'));
      await act(async () => {
        root.render(React.createElement(AdminContentOperationsSection, {
          model,
          actions,
          initialActiveTab: 'spelling',
          initialSelectedPackageId: 'pkg-draft-1',
        }));
      });
      const packageTab = Array.from(document.querySelectorAll('[role="tab"]'))
        .find((entry) => entry.textContent === 'Packages');
      await act(async () => {
        packageTab.click();
      });
      const packageButton = Array.from(document.querySelectorAll('.content-ops-row-button'))
        .find((entry) => entry.textContent === 'Second word package');
      await act(async () => {
        packageButton.click();
      });
      await flush();
      const spellingTab = Array.from(document.querySelectorAll('[role="tab"]'))
        .find((entry) => entry.textContent === 'Spelling');
      await act(async () => {
        spellingTab.click();
      });
      await flush();
      await flush();
      process.stdout.write(JSON.stringify({
        calls,
        text: document.body.textContent,
      }));

      await act(async () => {
        root.unmount();
      });
      dom.window.close();
      process.exit(0);
    }

    main().catch((error) => {
      process.stderr.write(error.stack || error.message);
      process.exitCode = 1;
    });
  `);
  const result = JSON.parse(output);

  assert.deepEqual(result.calls, [
    { method: 'readPackage', packageId: 'pkg-draft-2' },
    {
      method: 'readSpellingBrowse',
      args: { packageId: 'pkg-draft-2', query: '', pool: null, listId: null, limit: 75 },
    },
  ]);
  assert.match(result.text, /Second core list/);
  assert.match(result.text, /Package draft available/);
  assert.doesNotMatch(result.text, /Extra Greek roots/);
});

test('Content Operations Centre mounted package detail runs validate, approve, and publish actions', async () => {
  const output = await runClientEntry(`
    const { JSDOM } = require('jsdom');

    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'https://ks2.eugnel.uk/admin',
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.navigator = dom.window.navigator;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Event = dom.window.Event;

    const React = require('react');
    const { createRoot } = require('react-dom/client');
    const { AdminContentOperationsSection } = require(${CONTENT_OPS_SECTION_PATH});
    const { act } = React;

    const candidate = ${JSON.stringify(lifecycleCandidate)};
    const cleanBlockers = ${JSON.stringify(cleanLifecycleBlockers)};
    const release = ${JSON.stringify(release)};
    const basePackage = {
      ...${JSON.stringify(contentPackage)},
      blockers: cleanBlockers,
      latestCandidate: null,
    };
    let packageState = 'draft';
    let latestCandidate = null;
    const calls = [];

    function packageForState() {
      return {
        ...basePackage,
        state: packageState,
        latestCandidate,
        approvedAt: packageState === 'approved' || packageState === 'published'
          ? ${Date.UTC(2026, 5, 11, 10, 10, 0)}
          : null,
        publishedAt: packageState === 'published'
          ? ${Date.UTC(2026, 5, 11, 10, 20, 0)}
          : null,
        blockers: {
          ...cleanBlockers,
          publishReadiness: packageState === 'approved'
            ? { status: 'ready', blockers: [], warnings: [] }
            : cleanBlockers.publishReadiness,
        },
      };
    }

    const model = ${JSON.stringify(baseModel({
      contentOperations: {
        overview: {
          ...overview,
          lanes: {
            blocked: [],
            readyForApproval: [],
            approvedPendingPublish: [],
            drafts: [],
            recentReleases: [],
          },
        },
        packages: { packages: [] },
        releases: { releases: [] },
        packageDetail: null,
      },
    }))};
    model.contentOperations.overview.lanes.drafts = [basePackage];
    model.contentOperations.packages.packages = [basePackage];
    model.contentOperations.releases.releases = [release];
    model.contentOperations.packageDetail = {
      package: basePackage,
      actor: model.contentOperations.overview.actor,
      events: [{ eventId: 'event-created', eventType: 'package.created', createdAt: ${Date.UTC(2026, 5, 11, 10, 0, 0)}, event: {} }],
    };

    const actions = {
      contentOperationsApi: {
        async validatePackage(args) {
          calls.push({ method: 'validate', args });
          latestCandidate = candidate;
          return { candidate };
        },
        async approvePackage(args) {
          calls.push({ method: 'approve', args });
          packageState = 'approved';
          return {
            approval: {
              approvalId: 'approval-1',
              packageId: basePackage.packageId,
              candidateId: candidate.candidateId,
              candidateHash: candidate.candidateHash,
              approvedAt: ${Date.UTC(2026, 5, 11, 10, 10, 0)},
              notes: args.notes,
            },
          };
        },
        async publishPackage(args) {
          calls.push({ method: 'publish', args });
          packageState = 'published';
          return {
            release: {
              ...release,
              releaseId: 'rel-published-1',
              packageId: basePackage.packageId,
              proof: args.proof,
            },
          };
        },
        async readPackage({ packageId }) {
          calls.push({ method: 'readPackage', packageId, state: packageState });
          return {
            package: packageForState(),
            actor: model.contentOperations.overview.actor,
            events: [
              { eventId: 'event-created', eventType: 'package.created', createdAt: ${Date.UTC(2026, 5, 11, 10, 0, 0)}, event: {} },
              { eventId: 'event-approved', eventType: 'package.approved', actorAccountId: 'admin-a', createdAt: ${Date.UTC(2026, 5, 11, 10, 10, 0)}, event: { candidateHash: candidate.candidateHash, notes: 'Ready to publish.' } },
            ],
          };
        },
        async readOverview(args) {
          calls.push({ method: 'overview', args, state: packageState });
          const packageEntry = packageForState();
          return {
            ...model.contentOperations.overview,
            latestRelease: packageState === 'published' ? { ...release, releaseId: 'rel-published-1' } : release,
            lanes: {
              blocked: [],
              readyForApproval: [],
              approvedPendingPublish: packageState === 'approved' ? [packageEntry] : [],
              drafts: packageState === 'draft' ? [packageEntry] : [],
              recentReleases: packageState === 'published' ? [{ ...release, releaseId: 'rel-published-1' }] : [],
            },
          };
        },
        async readPackages(args) {
          calls.push({ method: 'packages', args, state: packageState });
          return { packages: [packageForState()] };
        },
        async readReleases(args) {
          calls.push({ method: 'releases', args, state: packageState });
          return { releases: packageState === 'published' ? [{ ...release, releaseId: 'rel-published-1' }] : [release] };
        },
      },
    };

    async function flush() {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    async function clickAction(action) {
      const button = document.querySelector('[data-content-ops-action="' + action + '"]');
      await act(async () => {
        button.click();
      });
      await flush();
      await flush();
      await flush();
    }

    async function main() {
      const root = createRoot(document.getElementById('root'));
      await act(async () => {
        root.render(React.createElement(AdminContentOperationsSection, {
          model,
          actions,
          initialActiveTab: 'detail',
        }));
      });

      const notes = document.querySelector('[data-content-ops-approval-notes="true"]');
      const valueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set;
      valueSetter.call(notes, 'Ready to publish.');
      await act(async () => {
        notes.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        notes.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });

      await clickAction('validate');
      const textAfterValidate = document.body.textContent;
      const approveDisabledAfterValidate = document.querySelector('[data-content-ops-action="approve"]').disabled;

      await clickAction('approve');
      const textAfterApprove = document.body.textContent;
      const publishDisabledAfterApprove = document.querySelector('[data-content-ops-action="publish"]').disabled;

      await clickAction('publish');
      const textAfterPublish = document.body.textContent;

      process.stdout.write(JSON.stringify({
        calls,
        textAfterValidate,
        approveDisabledAfterValidate,
        textAfterApprove,
        publishDisabledAfterApprove,
        textAfterPublish,
      }));

      await act(async () => {
        root.unmount();
      });
      dom.window.close();
      process.exit(0);
    }

    main().catch((error) => {
      process.stderr.write(error.stack || error.message);
      process.exitCode = 1;
    });
  `);
  const result = JSON.parse(output);
  const lifecycleCalls = result.calls.filter((entry) => ['validate', 'approve', 'publish'].includes(entry.method));

  assert.deepEqual(lifecycleCalls.map((entry) => entry.method), ['validate', 'approve', 'publish']);
  assert.equal(lifecycleCalls[0].args.packageId, 'pkg-draft-1');
  assert.equal(lifecycleCalls[1].args.candidateId, 'cand-ready-1');
  assert.equal(lifecycleCalls[1].args.notes, 'Ready to publish.');
  assert.equal(lifecycleCalls[2].args.proof.candidateHash, 'candidate-ready-1');
  assert.match(result.textAfterValidate, /candidate-ready-1/);
  assert.equal(result.approveDisabledAfterValidate, false);
  assert.match(result.textAfterApprove, /Candidate approved/);
  assert.equal(result.publishDisabledAfterApprove, false);
  assert.match(result.textAfterPublish, /Package published/);
  assert.match(result.textAfterPublish, /rel-published-1/);
});

test('Content Operations Centre mounted package detail resolves same-field conflicts', async () => {
  const output = await runClientEntry(`
    const { JSDOM } = require('jsdom');

    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'https://ks2.eugnel.uk/admin',
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.navigator = dom.window.navigator;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Event = dom.window.Event;

    const React = require('react');
    const { createRoot } = require('react-dom/client');
    const { AdminContentOperationsSection } = require(${CONTENT_OPS_SECTION_PATH});
    const { act } = React;

    const conflictedCandidate = ${JSON.stringify(conflictedLifecycleCandidate)};
    const resolvedCandidate = {
      ...${JSON.stringify(lifecycleCandidate)},
      candidateId: 'cand-resolved-1',
      operationsHash: 'ops-resolved-1',
      candidateHash: 'candidate-resolved-1',
    };
    const basePackage = {
      ...${JSON.stringify(contentPackage)},
      blockers: conflictedCandidate.blockers,
      latestCandidate: conflictedCandidate,
    };
    let latestCandidate = conflictedCandidate;
    const calls = [];
    const model = ${JSON.stringify(baseModel({
      contentOperations: {
        overview,
        packages: { packages: [] },
        releases: { releases: [release] },
        packageDetail: null,
      },
    }))};
    model.contentOperations.overview.lanes.drafts = [basePackage];
    model.contentOperations.packages.packages = [basePackage];
    model.contentOperations.packageDetail = {
      package: basePackage,
      actor: model.contentOperations.overview.actor,
      events: [],
    };

    function packageForState() {
      return {
        ...basePackage,
        latestCandidate,
        blockers: latestCandidate.blockers,
      };
    }

    const actions = {
      contentOperationsApi: {
        async resolveConflict(args) {
          calls.push({ method: 'resolve', args });
          latestCandidate = resolvedCandidate;
          return {
            conflict: conflictedCandidate.conflicts[0],
            resolution: args.resolution,
            operation: {
              operationId: 'op-resolution-1',
              entityType: 'spelling.word',
              entityId: 'metamorphosis',
              fieldPath: 'explanation',
              action: 'set',
              payload: args.value,
            },
            candidate: resolvedCandidate,
          };
        },
        async approvePackage(args) {
          calls.push({ method: 'approve', args });
          return { approval: { candidateId: args.candidateId } };
        },
        async readPackage({ packageId }) {
          calls.push({ method: 'readPackage', packageId });
          return {
            package: packageForState(),
            actor: model.contentOperations.overview.actor,
            events: [],
          };
        },
        async readOverview(args) {
          calls.push({ method: 'overview', args });
          return {
            ...model.contentOperations.overview,
            lanes: {
              blocked: [],
              readyForApproval: [packageForState()],
              approvedPendingPublish: [],
              drafts: [],
              recentReleases: [${JSON.stringify(release)}],
            },
          };
        },
        async readPackages(args) {
          calls.push({ method: 'packages', args });
          return { packages: [packageForState()] };
        },
        async readReleases(args) {
          calls.push({ method: 'releases', args });
          return { releases: [${JSON.stringify(release)}] };
        },
      },
    };

    async function flush() {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    async function main() {
      const root = createRoot(document.getElementById('root'));
      await act(async () => {
        root.render(React.createElement(AdminContentOperationsSection, {
          model,
          actions,
          initialActiveTab: 'detail',
        }));
      });

      const approveDisabledBefore = document.querySelector('[data-content-ops-action="approve"]').disabled;
      const editor = document.querySelector('[data-content-ops-conflict-edit="conflict-word-explanation"]');
      const valueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set;
      valueSetter.call(editor, 'Merged explanation.');
      await act(async () => {
        editor.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        editor.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });
      const saveButton = Array.from(document.querySelectorAll('button'))
        .find((button) => button.textContent === 'Save merged value');
      await act(async () => {
        saveButton.click();
      });
      await flush();
      await flush();
      await flush();

      const approveDisabledAfter = document.querySelector('[data-content-ops-action="approve"]').disabled;
      process.stdout.write(JSON.stringify({
        calls,
        approveDisabledBefore,
        approveDisabledAfter,
        text: document.body.textContent,
      }));

      await act(async () => {
        root.unmount();
      });
      dom.window.close();
      process.exit(0);
    }

    main().catch((error) => {
      process.stderr.write(error.stack || error.message);
      process.exitCode = 1;
    });
  `);
  const result = JSON.parse(output);
  const resolveCall = result.calls.find((entry) => entry.method === 'resolve');

  assert.equal(result.approveDisabledBefore, true);
  assert.equal(resolveCall.args.conflictId, 'conflict-word-explanation');
  assert.equal(resolveCall.args.resolution, 'edit');
  assert.equal(resolveCall.args.value, 'Merged explanation.');
  assert.match(result.text, /Conflict resolved/);
  assert.match(result.text, /candidate-resolved-1/);
  assert.equal(result.approveDisabledAfter, false);
});

test('Content Operations Centre mounted package detail ignores stale out-of-order reads', async () => {
  const packageA = {
    ...contentPackage,
    packageId: 'pkg-a',
    title: 'Alpha package',
    operations: [{ operationId: 'op-a', entityType: 'spelling.word', entityId: 'alpha', action: 'set' }],
    operationCount: 1,
  };
  const packageB = {
    ...contentPackage,
    packageId: 'pkg-b',
    title: 'Beta package',
    operations: [{ operationId: 'op-b', entityType: 'spelling.word', entityId: 'beta', action: 'set' }],
    operationCount: 1,
  };
  const raceOverview = {
    ...overview,
    lanes: {
      blocked: [],
      readyForApproval: [],
      approvedPendingPublish: [],
      drafts: [packageA, packageB],
      recentReleases: [],
    },
  };
  const output = await runClientEntry(`
    const { JSDOM } = require('jsdom');

    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'https://ks2.eugnel.uk/admin',
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.navigator = dom.window.navigator;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Event = dom.window.Event;

    const React = require('react');
    const { createRoot } = require('react-dom/client');
    const { AdminContentOperationsSection } = require(${CONTENT_OPS_SECTION_PATH});
    const { act } = React;

    function deferred() {
      const holder = {};
      holder.promise = new Promise((resolve, reject) => {
        holder.resolve = resolve;
        holder.reject = reject;
      });
      return holder;
    }

    const packageA = ${JSON.stringify(packageA)};
    const packageB = ${JSON.stringify(packageB)};
    const defers = { 'pkg-a': deferred(), 'pkg-b': deferred() };
    const calls = [];
    const model = ${JSON.stringify(baseModel({
      contentOperations: {
        overview: raceOverview,
        packages: { packages: [packageA, packageB] },
        releases: { releases: [] },
        packageDetail: null,
      },
    }))};
    const actions = {
      contentOperationsApi: {
        readPackage({ packageId }) {
          calls.push(packageId);
          return defers[packageId].promise;
        },
      },
    };

    async function flush() {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    async function main() {
      const root = createRoot(document.getElementById('root'));
      await act(async () => {
        root.render(React.createElement(AdminContentOperationsSection, { model, actions }));
      });

      const summaries = Array.from(document.querySelectorAll('.content-ops-package-summary'));
      await act(async () => {
        summaries[0].click();
        summaries[1].click();
      });

      await act(async () => {
        defers['pkg-a'].resolve({ package: packageA, events: [] });
      });
      await flush();
      const textAfterA = document.body.textContent;

      await act(async () => {
        defers['pkg-b'].resolve({ package: packageB, events: [] });
      });
      await flush();
      const detail = document.querySelector('[data-package-detail]');
      process.stdout.write(JSON.stringify({
        calls,
        textAfterA,
        textAfterB: document.body.textContent,
        detailPackageId: detail?.getAttribute('data-package-detail') || '',
      }));

      await act(async () => {
        root.unmount();
      });
      dom.window.close();
      process.exit(0);
    }

    main().catch((error) => {
      process.stderr.write(error.stack || error.message);
      process.exitCode = 1;
    });
  `);
  const result = JSON.parse(output);

  assert.deepEqual(result.calls, ['pkg-a', 'pkg-b']);
  assert.doesNotMatch(result.textAfterA, /alpha/);
  assert.match(result.textAfterA, /Package detail is loading/);
  assert.equal(result.detailPackageId, 'pkg-b');
  assert.match(result.textAfterB, /beta/);
  assert.doesNotMatch(result.textAfterB, /alpha/);
});

test('Content Operations Centre mounted refresh ignores stale out-of-order overview reads', async () => {
  const oldPackage = {
    ...contentPackage,
    packageId: 'pkg-old',
    title: 'Old package state',
    operations: [{ operationId: 'op-old', entityType: 'spelling.word', entityId: 'old', action: 'set' }],
    operationCount: 1,
  };
  const newPackage = {
    ...contentPackage,
    packageId: 'pkg-new',
    title: 'New package state',
    operations: [{ operationId: 'op-new', entityType: 'spelling.word', entityId: 'new', action: 'set' }],
    operationCount: 1,
  };
  const oldOverview = {
    ...overview,
    lanes: { ...overview.lanes, drafts: [oldPackage], recentReleases: [] },
  };
  const newOverview = {
    ...overview,
    lanes: { ...overview.lanes, drafts: [newPackage], recentReleases: [] },
  };
  const output = await runClientEntry(`
    const { JSDOM } = require('jsdom');

    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'https://ks2.eugnel.uk/admin',
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.navigator = dom.window.navigator;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Event = dom.window.Event;

    const React = require('react');
    const { createRoot } = require('react-dom/client');
    const { AdminContentOperationsSection } = require(${CONTENT_OPS_SECTION_PATH});
    const { act } = React;

    function deferred() {
      const holder = {};
      holder.promise = new Promise((resolve, reject) => {
        holder.resolve = resolve;
        holder.reject = reject;
      });
      return holder;
    }

    const oldOverview = ${JSON.stringify(oldOverview)};
    const newOverview = ${JSON.stringify(newOverview)};
    const oldPackage = ${JSON.stringify(oldPackage)};
    const newPackage = ${JSON.stringify(newPackage)};
    const defers = [deferred(), deferred()];
    const calls = [];
    let refreshIndex = -1;
    const model = ${JSON.stringify(baseModel())};
    const actions = {
      contentOperationsApi: {
        readOverview(args) {
          refreshIndex += 1;
          calls.push({ method: 'overview', args, refreshIndex });
          return defers[refreshIndex].promise;
        },
        readPackages(args) {
          calls.push({ method: 'packages', args, refreshIndex });
          return Promise.resolve({ packages: [refreshIndex === 0 ? oldPackage : newPackage] });
        },
        readReleases(args) {
          calls.push({ method: 'releases', args, refreshIndex });
          return Promise.resolve({ releases: [] });
        },
      },
    };

    async function flush() {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    async function main() {
      const root = createRoot(document.getElementById('root'));
      await act(async () => {
        root.render(React.createElement(AdminContentOperationsSection, { model, actions }));
      });
      const refreshButton = Array.from(document.querySelectorAll('button'))
        .find((entry) => entry.textContent === 'Refresh');
      await act(async () => {
        refreshButton.click();
        refreshButton.click();
      });

      await act(async () => {
        defers[1].resolve(newOverview);
      });
      await flush();
      const textAfterNew = document.body.textContent;

      await act(async () => {
        defers[0].resolve(oldOverview);
      });
      await flush();

      process.stdout.write(JSON.stringify({
        calls,
        textAfterNew,
        finalText: document.body.textContent,
      }));

      await act(async () => {
        root.unmount();
      });
      dom.window.close();
      process.exit(0);
    }

    main().catch((error) => {
      process.stderr.write(error.stack || error.message);
      process.exitCode = 1;
    });
  `);
  const result = JSON.parse(output);

  assert.equal(result.calls.filter((entry) => entry.method === 'overview').length, 2);
  assert.match(result.textAfterNew, /New package state/);
  assert.match(result.finalText, /New package state/);
  assert.doesNotMatch(result.finalText, /Old package state/);
});

test('Content Operations Centre mounted package detail exposes read errors', async () => {
  const output = await runClientEntry(`
    const { JSDOM } = require('jsdom');

    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'https://ks2.eugnel.uk/admin',
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.navigator = dom.window.navigator;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Event = dom.window.Event;

    const React = require('react');
    const { createRoot } = require('react-dom/client');
    const { AdminContentOperationsSection } = require(${CONTENT_OPS_SECTION_PATH});
    const { act } = React;

    const contentPackage = ${JSON.stringify(contentPackage)};
    const model = ${JSON.stringify(baseModel({
      contentOperations: {
        overview: {
          ...overview,
          lanes: {
            blocked: [],
            readyForApproval: [],
            approvedPendingPublish: [],
            drafts: [contentPackage],
            recentReleases: [],
          },
        },
        packages: { packages: [contentPackage] },
        releases: { releases: [] },
        packageDetail: null,
      },
    }))};
    const calls = [];
    const actions = {
      contentOperationsApi: {
        async readPackage({ packageId }) {
          calls.push(packageId);
          throw new Error('package detail unavailable');
        },
      },
    };

    async function flush() {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    async function main() {
      const root = createRoot(document.getElementById('root'));
      await act(async () => {
        root.render(React.createElement(AdminContentOperationsSection, { model, actions }));
      });
      const summary = document.querySelector('.content-ops-package-summary');
      await act(async () => {
        summary.click();
      });
      await flush();
      process.stdout.write(JSON.stringify({
        calls,
        text: document.body.textContent,
        hasError: Boolean(document.querySelector('[data-content-ops-detail-error="true"]')),
      }));

      await act(async () => {
        root.unmount();
      });
      dom.window.close();
      process.exit(0);
    }

    main().catch((error) => {
      process.stderr.write(error.stack || error.message);
      process.exitCode = 1;
    });
  `);
  const result = JSON.parse(output);

  assert.deepEqual(result.calls, ['pkg-draft-1']);
  assert.equal(result.hasError, true);
  assert.match(result.text, /Package detail could not be loaded/);
});

test('Content Operations Centre mounted package detail success clears stale detail errors', async () => {
  const packageA = {
    ...contentPackage,
    packageId: 'pkg-fail',
    title: 'Failing package',
    operations: [{ operationId: 'op-fail', entityType: 'spelling.word', entityId: 'fail', action: 'set' }],
    operationCount: 1,
  };
  const packageB = {
    ...contentPackage,
    packageId: 'pkg-success',
    title: 'Recovered package',
    operations: [{ operationId: 'op-success', entityType: 'spelling.word', entityId: 'recover', action: 'set' }],
    operationCount: 1,
  };
  const output = await runClientEntry(`
    const { JSDOM } = require('jsdom');

    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'https://ks2.eugnel.uk/admin',
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.navigator = dom.window.navigator;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Event = dom.window.Event;

    const React = require('react');
    const { createRoot } = require('react-dom/client');
    const { AdminContentOperationsSection } = require(${CONTENT_OPS_SECTION_PATH});
    const { act } = React;

    const packageA = ${JSON.stringify(packageA)};
    const packageB = ${JSON.stringify(packageB)};
    const model = ${JSON.stringify(baseModel({
      contentOperations: {
        overview: {
          ...overview,
          lanes: {
            blocked: [],
            readyForApproval: [],
            approvedPendingPublish: [],
            drafts: [packageA, packageB],
            recentReleases: [],
          },
        },
        packages: { packages: [packageA, packageB] },
        releases: { releases: [] },
        packageDetail: null,
      },
    }))};
    const calls = [];
    const actions = {
      contentOperationsApi: {
        async readPackage({ packageId }) {
          calls.push(packageId);
          if (packageId === 'pkg-fail') throw new Error('package detail unavailable');
          return { package: packageB, events: [] };
        },
      },
    };

    async function flush() {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    async function main() {
      const root = createRoot(document.getElementById('root'));
      await act(async () => {
        root.render(React.createElement(AdminContentOperationsSection, { model, actions }));
      });
      const summaries = Array.from(document.querySelectorAll('.content-ops-package-summary'));
      await act(async () => {
        summaries[0].click();
      });
      await flush();
      const textAfterFailure = document.body.textContent;
      const overviewTab = Array.from(document.querySelectorAll('[role="tab"]'))
        .find((entry) => entry.textContent === 'Overview');
      await act(async () => {
        overviewTab.click();
      });
      const successSummary = document.querySelector('[data-package-id="pkg-success"]');
      await act(async () => {
        successSummary.click();
      });
      await flush();
      process.stdout.write(JSON.stringify({
        calls,
        textAfterFailure,
        finalText: document.body.textContent,
        hasPartialFailure: document.body.textContent.includes('A more recent refresh failed'),
        hasDetailError: Boolean(document.querySelector('[data-content-ops-detail-error="true"]')),
      }));

      await act(async () => {
        root.unmount();
      });
      dom.window.close();
      process.exit(0);
    }

    main().catch((error) => {
      process.stderr.write(error.stack || error.message);
      process.exitCode = 1;
    });
  `);
  const result = JSON.parse(output);

  assert.deepEqual(result.calls, ['pkg-fail', 'pkg-success']);
  assert.match(result.textAfterFailure, /Package detail could not be loaded/);
  assert.match(result.finalText, /Recovered package/);
  assert.match(result.finalText, /recover/);
  assert.equal(result.hasDetailError, false);
  assert.equal(result.hasPartialFailure, false);
});
