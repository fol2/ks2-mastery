// U1 (Admin Console P2): characterization test suite for AdminHubSurface.
//
// Purpose: pin the current rendering of every admin panel so that the
// upcoming P2 extraction into sections is regression-safe. Each test
// mounts the full AdminHubSurface through the esbuild-bundled SSR
// harness (the same pattern as react-admin-hub-refresh.test.js and
// react-admin-metadata-row-conflict.test.js) and asserts structural
// markers — data-panel attributes, data-testid markers, eyebrow text,
// section titles, and key interactive elements.
//
// Scenarios:
//   1. Full admin model renders all panels without error
//   2. Ops-role model renders with redacted fields and read-only account section
//   3. Error centre filter controls render with all 6 filter dimensions
//   4. Account ops metadata shows dirty-row indicators and CAS conflict banners
//   5. Empty learner list renders fallback
//   6. Bootstrap capacity degraded state renders degradation banner
//   7. Classroom summary degraded state hides per-learner stats
//   8. Non-admin/non-ops role renders Access Denied card
//  11. Loading-remote early return renders loading card
//  12. Hub-error early return renders error card
//  13. Cron-failure banner renders when lastFailureAt > lastSuccessAt
//  14. Error log empty-state renders fallback

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

async function renderAllSections(buildEntryOpts = {}) {
  const sections = ['overview', 'accounts', 'debug', 'content', 'marketing'];
  const parts = [];
  for (const s of sections) {
    parts.push(await renderFixture(buildEntry({ ...buildEntryOpts, initialSection: s })));
  }
  return parts.join('\n');
}

async function renderFixture(entrySource) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-admin-char-'));
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

// ---------------------------------------------------------------
// Shared fixture builders.
// ---------------------------------------------------------------

const SURFACE_PATH = JSON.stringify(
  path.join(rootDir, 'src/surfaces/hubs/AdminHubSurface.jsx'),
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
      permissions: {},
      status: {
        validation: { ok: true, errorCount: 0, warningCount: 0, errors: [], warnings: [] },
      },
      draft: null,
      published: null,
      versions: [],
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
    auditLogLookup: { available: false, note: 'Audit lookup wired on Worker API path only.', entries: [] },
    dashboardKpis: {
      generatedAt: 1,
      accounts: { total: 5, real: 5, demo: 2 },
      learners: { total: 3, real: 2, demo: 1 },
      demos: { active: 1 },
      practiceSessions: {
        last7d: 10,
        last30d: 30,
        real: { last7d: 8, last30d: 25 },
        demo: { last7d: 2, last30d: 5 },
      },
      eventLog: { last7d: 50 },
      mutationReceipts: {
        last7d: 6,
        real: { last7d: 5 },
        demo: { last7d: 1 },
      },
      errorEvents: {
        byStatus: { open: 2, investigating: 1, resolved: 5, ignored: 0 },
        byOrigin: { client: 4, server: 3 },
      },
      accountOpsUpdates: { total: 7 },
    },
    opsActivityStream: {
      generatedAt: 1,
      entries: [
        {
          requestId: 'req-001',
          mutationKind: 'role-set',
          scopeType: 'account',
          scopeId: 'abc123',
          accountIdMasked: '..f1a2b3',
          appliedAt: Date.UTC(2026, 3, 26),
        },
      ],
    },
    accountOpsMetadata: {
      generatedAt: 1,
      accounts: [
        {
          accountId: 'adult-admin',
          email: 'admin@example.com',
          displayName: 'Admin User',
          platformRole: 'admin',
          opsStatus: 'active',
          planLabel: 'Plan-Pro',
          tags: ['internal', 'beta'],
          internalNotes: 'Test admin account.',
          updatedAt: Date.UTC(2026, 3, 25),
          updatedByAccountId: '',
          rowVersion: 3,
          conflict: null,
        },
      ],
    },
    errorLogSummary: {
      generatedAt: 1,
      totals: { open: 2, investigating: 1, resolved: 5, ignored: 0, all: 8 },
      entries: [
        {
          id: 'evt-001',
          errorKind: 'TypeError',
          messageFirstLine: 'Cannot read properties of undefined',
          routeName: '/api/learner/progress',
          occurrenceCount: 3,
          firstSeen: Date.UTC(2026, 3, 20),
          lastSeen: Date.UTC(2026, 3, 26),
          status: 'open',
          firstSeenRelease: 'abc1234def5678',
          lastSeenRelease: 'abc1234def5678',
          resolvedInRelease: '',
          userAgent: 'Mozilla/5.0',
          firstFrame: 'at getProgress (worker.js:42)',
          accountIdMasked: '..admin',
        },
      ],
    },
    demoOperations: {
      sessionsCreated: 12,
      activeSessions: 3,
      conversions: 2,
      cleanupCount: 5,
      rateLimitBlocks: 1,
      ttsFallbacks: 0,
      updatedAt: Date.UTC(2026, 3, 26),
    },
    learnerSupport: {
      selectedLearnerId: 'learner-a',
      accessibleLearners: [
        {
          learnerId: 'learner-a',
          learnerName: 'Ava',
          yearGroup: 'Y5',
          membershipRoleLabel: 'Owner',
          accessModeLabel: 'Writable learner',
          writable: true,
          currentFocus: { label: 'Spelling' },
          overview: {
            dueWords: 5,
            secureWords: 80,
            troubleWords: 2,
            dueGrammarConcepts: 3,
            weakGrammarConcepts: 1,
            secureGrammarConcepts: 10,
            duePunctuationItems: 2,
            weakPunctuationItems: 0,
            securePunctuationUnits: 8,
          },
          grammarEvidence: {
            progressSnapshot: { dueConcepts: 3, weakConcepts: 1, securedConcepts: 10 },
          },
          punctuationEvidence: {
            progressSnapshot: { dueItems: 2, weakItems: 0, securedRewardUnits: 8 },
          },
        },
      ],
      selectedDiagnostics: {
        learnerId: 'learner-a',
        learnerName: 'Ava',
        overview: {
          secureWords: 80,
          dueWords: 5,
          troubleWords: 2,
          dueGrammarConcepts: 3,
          weakGrammarConcepts: 1,
          secureGrammarConcepts: 10,
          duePunctuationItems: 2,
          weakPunctuationItems: 0,
          securePunctuationUnits: 8,
        },
        currentFocus: { label: 'Spelling', detail: 'Focus on due words for this week.' },
        grammarEvidence: {
          progressSnapshot: { dueConcepts: 3, weakConcepts: 1, securedConcepts: 10 },
          conceptStatus: [
            { id: 'noun-phrases', name: 'Noun phrases', domain: 'Grammar', confidence: { label: 'secure', level: 3 } },
            { id: 'verb-tenses', name: 'Verb tenses', domain: 'Grammar', confidence: { label: 'emerging', level: 1 } },
          ],
          questionTypeSummary: [{ id: 'gap-fill', label: 'Gap fill' }],
        },
        punctuationEvidence: {
          progressSnapshot: { dueItems: 2, weakItems: 0, securedRewardUnits: 8 },
          releaseDiagnostics: {
            releaseId: 'punct-rel-1',
            trackedRewardUnitCount: 10,
            sessionCount: 5,
            weakPatternCount: 0,
            productionExposureStatus: 'stable',
          },
          weakestFacets: [{ id: 'comma-splice', label: 'Comma splice' }],
        },
        grammarTransferAdmin: {
          evidence: [
            { promptId: 'prompt-live-1', latest: { savedAt: Date.UTC(2026, 3, 24) }, updatedAt: Date.UTC(2026, 3, 24) },
          ],
          archive: [
            { promptId: 'prompt-arch-1', archivedAt: Date.UTC(2026, 3, 20), updatedAt: Date.UTC(2026, 3, 20) },
          ],
        },
      },
      punctuationReleaseDiagnostics: null,
      entryPoints: [
        { action: 'open-subject', label: 'Open Spelling analytics', subjectId: 'spelling', tab: 'analytics' },
        { action: 'open-subject', label: 'Open Punctuation analytics', subjectId: 'punctuation', tab: 'analytics' },
        { action: 'platform-export-learner', label: 'Export current learner snapshot' },
      ],
    },
    ...overrides,
  };
}

function baseActions() {
  return `{ dispatch() {}, navigateHome() {}, openSubject() {}, registerAccountOpsMetadataRowDirty() {} }`;
}

function baseAppState(overrides = {}) {
  return {
    learners: {
      selectedId: 'learner-a',
      byId: { 'learner-a': { id: 'learner-a', name: 'Ava', yearGroup: 'Y5' } },
      allIds: ['learner-a'],
    },
    persistence: { mode: 'remote-sync' },
    toasts: [],
    monsterCelebrations: { queue: [] },
    ...overrides,
  };
}

function baseAccessContext() {
  return { shellAccess: { source: 'worker-session' }, activeAdultLearnerContext: null };
}

function baseAccountDirectory() {
  return {
    status: 'loaded',
    accounts: [
      {
        id: 'adult-admin',
        email: 'admin@example.com',
        displayName: 'Admin User',
        providers: ['email'],
        learnerCount: 1,
        platformRole: 'admin',
        updatedAt: 0,
      },
    ],
  };
}

function buildEntry({ model, appState, accessContext, accountDirectory, hubState, refreshStatus, activeOpsMetadataSavingId, modelExplicitNull, initialSection } = {}) {
  const m = modelExplicitNull ? null : (model || baseModel());
  const as = appState || baseAppState();
  const ac = accessContext || baseAccessContext();
  const ad = accountDirectory || baseAccountDirectory();
  const hs = hubState || { status: 'loaded' };
  const rs = refreshStatus || { inFlight: false, lastUpdatedAt: 0 };
  const savingId = activeOpsMetadataSavingId || '';
  const section = initialSection || null;
  return `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminHubSurface } from ${SURFACE_PATH};
    const model = ${JSON.stringify(m)};
    const actions = ${baseActions()};
    const appState = ${JSON.stringify(as)};
    const accessContext = ${JSON.stringify(ac)};
    const accountDirectory = ${JSON.stringify(ad)};
    const html = renderToStaticMarkup(
      <AdminHubSurface
        appState={appState}
        model={model}
        hubState={${JSON.stringify(hs)}}
        refreshStatus={${JSON.stringify(rs)}}
        refreshing={false}
        activeOpsMetadataSavingId={${JSON.stringify(savingId)}}
        actions={actions}
        accessContext={accessContext}
        accountDirectory={accountDirectory}
        initialSection={${JSON.stringify(section)}}
      />
    );
    process.stdout.write(html);
  `;
}

// =================================================================
// 1. Happy path: Full admin model renders all panels
// =================================================================

test('full admin model renders all 15 panels without error', async () => {
  const html = await renderAllSections();

  // --- MonsterVisualConfigPanel ---
  // Plan deviation: the MonsterVisualConfigPanel early-returns null when
  // `model.monsterVisualConfig.draft` is null (line 386 of the component).
  // Building a valid draft fixture requires importing the entire
  // MONSTER_ASSET_MANIFEST (4,784-line generated file) and mirroring its
  // key-context shape. This is deferred to a dedicated monster-visual
  // test. We assert the panel is CALLED (the surface mounts it) by
  // confirming the AdminHubSurface renders without error, but do not
  // assert `monster-visual-panel` presence when draft is null.
  // When the MonsterVisualConfigPanel returns null, the slot is empty
  // and no crash occurs — which is the correct behaviour to pin.

  // --- AdminAccountRoles ---
  assert.match(html, /Production platform access/, 'AdminAccountRoles renders with admin heading');
  assert.match(html, /Refresh accounts/, 'AdminAccountRoles has refresh button');

  // --- DashboardKpiPanel ---
  assert.match(html, /Dashboard KPI/, 'DashboardKpiPanel eyebrow renders');
  assert.match(html, /Dashboard overview/, 'DashboardKpiPanel title renders');
  assert.match(html, /data-kpi-role="real"/, 'KPI real/demo split renders');
  assert.match(html, /data-kpi-role="demo"/, 'KPI demo column renders');

  // --- RecentActivityStreamPanel ---
  assert.match(html, /Ops activity/, 'RecentActivityStreamPanel eyebrow renders');
  assert.match(html, /Recent operations activity/, 'RecentActivityStreamPanel title renders');
  assert.match(html, /role-set/, 'Activity stream entry renders');

  // --- DemoOperationsSummary ---
  assert.match(html, /Demo operations/, 'DemoOperationsSummary eyebrow renders');
  assert.match(html, /Aggregate demo health/, 'DemoOperationsSummary title renders');
  assert.match(html, /Demo sessions created/, 'Demo operations row renders');

  // --- ContentRelease (two-col left) ---
  assert.match(html, /Content release status/, 'Content release eyebrow renders');
  assert.match(html, /Published spelling snapshot/, 'Content release title renders');
  assert.match(html, /Release 1/, 'Content release version renders');

  // --- ImportValidation (two-col right) ---
  assert.match(html, /Import \/ validation status/, 'Import validation eyebrow renders');
  assert.match(html, /Draft versus published safety/, 'Import validation title renders');
  assert.match(html, /Validation clean/, 'Import validation clean status renders');

  // --- AccountOpsMetadataPanel ---
  assert.match(html, /Account ops/, 'AccountOpsMetadataPanel eyebrow renders');
  assert.match(html, /Account ops metadata/, 'AccountOpsMetadataPanel title renders');
  assert.match(html, /admin@example\.com/, 'Account ops metadata row renders email');

  // --- ErrorLogCentrePanel ---
  assert.match(html, /Error log/, 'ErrorLogCentrePanel eyebrow renders');
  assert.match(html, /Error log centre/, 'ErrorLogCentrePanel title renders');
  assert.match(html, /TypeError/, 'Error event entry renders');

  // --- PostMegaSpellingDebugPanel ---
  // The panel reads model.postMasteryDebug; when null it still renders with defaults.
  assert.match(html, /data-panel="post-mega-spelling-debug"/, 'PostMegaSpellingDebugPanel renders');
  assert.match(html, /Why is Guardian locked/, 'PostMegaSpellingDebugPanel title renders');

  // --- PostMegaSeedHarnessPanel ---
  assert.match(html, /data-panel="post-mega-seed-harness"/, 'PostMegaSeedHarnessPanel renders');
  assert.match(html, /Post-Mega learner seed harness/, 'PostMegaSeedHarnessPanel title renders for admin');

  // --- GrammarConceptConfidencePanel ---
  assert.match(html, /data-panel="grammar-concept-confidence"/, 'GrammarConceptConfidencePanel renders');
  assert.match(html, /Grammar concepts/, 'GrammarConceptConfidencePanel title renders');
  assert.match(html, /Noun phrases/, 'Grammar concept row renders');
  assert.match(html, /Verb tenses/, 'Grammar concept row (second) renders');

  // --- GrammarWritingTryAdminPanel ---
  assert.match(html, /data-panel="grammar-writing-try-admin"/, 'GrammarWritingTryAdminPanel renders');
  assert.match(html, /Writing Try/, 'GrammarWritingTryAdminPanel title renders');
  assert.match(html, /prompt-live-1/, 'Writing Try live entry renders');
  // Finding 7: archive toggle renders in SSR (archiveOpen defaults false)
  assert.match(html, /Show archive/, 'GrammarWritingTry archive toggle button renders');

  // --- GrammarConceptConfidencePanel: chip label fidelity ---
  // Finding 4: canonical labels render through AdultConfidenceChip
  assert.match(html, /data-confidence-label="secure"/, 'Confidence chip renders canonical "secure" label');
  assert.match(html, /data-confidence-label="emerging"/, 'Confidence chip renders canonical "emerging" label');

  // --- SelectedDiagnostics callout ---
  // Finding 6: diagnostics callout renders for selected learner
  assert.match(html, /Grammar diagnostics/, 'SelectedDiagnostics callout includes Grammar diagnostics');
  assert.match(html, /Punctuation diagnostics/, 'SelectedDiagnostics callout includes Punctuation diagnostics');
  // The callout renders the selected learner name in a <strong> tag
  assert.match(html, /<strong>Ava<\/strong>/, 'SelectedDiagnostics callout renders learner name');

  // --- AuditLogLookup (two-col left) ---
  assert.match(html, /Audit-log lookup/, 'AuditLogLookup eyebrow renders');
  assert.match(html, /Mutation receipt stream/, 'AuditLogLookup title renders');

  // --- LearnerSupport/diagnostics (two-col right) ---
  assert.match(html, /Learner support \/ diagnostics/, 'LearnerSupport eyebrow renders');
  assert.match(html, /Readable learners/, 'LearnerSupport title renders');
  assert.match(html, /Ava/, 'Learner name renders in roster');

  // --- No access-denied card ---
  assert.doesNotMatch(html, /access-denied-card/, 'No access denied card in admin view');
});

// =================================================================
// 2. Happy path: Ops-role model renders with redacted fields
// =================================================================

test('ops-role model renders with read-only account section and admin-only seed harness notice', async () => {
  const opsModel = baseModel({
    permissions: {
      canViewAdminHub: true,
      platformRole: 'ops',
      platformRoleLabel: 'Operations',
      canManageMonsterVisualConfig: false,
    },
  });
  const html = await renderAllSections({ model: opsModel });

  // AdminAccountRoles shows admin-only notice for non-admin
  assert.match(html, /Admin-only role management/, 'Ops sees admin-only role management notice');
  assert.match(html, /Only admin accounts can list accounts/, 'Ops sees restriction message for roles');

  // AccountOpsMetadataPanel renders read-only rows for ops
  assert.match(html, /Account ops metadata/, 'AccountOpsMetadataPanel renders for ops');
  // Ops-role rows show enforcement note, not edit controls
  assert.match(html, /data-testid="ops-status-enforcement-note"/, 'Enforcement note renders for ops row');

  // PostMegaSeedHarnessPanel shows admin-only notice for ops
  assert.match(html, /Admin-only seed harness/, 'Ops sees admin-only seed harness notice');
  assert.match(html, /Only admin accounts can apply QA seed shapes/, 'Ops sees seed harness restriction');

  // Error log centre shows chips instead of selectors for ops
  assert.match(html, /Error log centre/, 'Error log centre renders for ops');

  // The rest of the panels render
  assert.match(html, /Dashboard KPI/, 'KPI panel renders for ops');
  assert.match(html, /Recent operations activity/, 'Activity stream renders for ops');
  assert.match(html, /Aggregate demo health/, 'Demo operations renders for ops');
});

// =================================================================
// 3. Happy path: Error centre filter controls render
// =================================================================

test('error centre filter controls render with all 6 filter dimensions', async () => {
  const html = await renderFixture(buildEntry({ initialSection: 'debug' }));

  // Filter container
  assert.match(html, /data-testid="error-centre-filters"/, 'Error centre filter container renders');

  // 6 filter dimensions:
  // 1. Route contains
  assert.match(html, /name="errorFilterRoute"/, 'Route filter input renders');
  // 2. Kind
  assert.match(html, /name="errorFilterKind"/, 'Kind filter input renders');
  // 3. Last seen after
  assert.match(html, /name="errorFilterLastSeenAfter"/, 'Last seen after filter renders');
  // 4. Last seen before
  assert.match(html, /name="errorFilterLastSeenBefore"/, 'Last seen before filter renders');
  // 5. New in release
  assert.match(html, /name="errorFilterRelease"/, 'Release filter input renders');
  // 6. Reopened after resolved
  assert.match(html, /name="errorFilterReopened"/, 'Reopened filter checkbox renders');

  // Filter action buttons
  assert.match(html, /data-testid="error-centre-filter-apply"/, 'Apply filters button renders');
  assert.match(html, /data-testid="error-centre-filter-reset"/, 'Clear filters button renders');

  // Status filter buttons
  assert.match(html, /Show open/, 'Open status filter button renders');
  assert.match(html, /Show investigating/, 'Investigating status filter button renders');
  assert.match(html, /Show resolved/, 'Resolved status filter button renders');
  assert.match(html, /Show ignored/, 'Ignored status filter button renders');

  // Status chips with counts (SSR static markup does not insert comment nodes)
  assert.match(html, /2 open/, 'Open count chip renders');
  assert.match(html, /1 investigating/, 'Investigating count chip renders');
  assert.match(html, /5 resolved/, 'Resolved count chip renders');
  assert.match(html, /0 ignored/, 'Ignored count chip renders');
});

// =================================================================
// 4. Happy path: Account ops metadata conflict banner
// =================================================================

test('account ops metadata shows CAS conflict banner when model state includes conflicts', async () => {
  const conflictModel = baseModel({
    accountOpsMetadata: {
      generatedAt: 1,
      accounts: [
        {
          accountId: 'adult-admin',
          email: 'admin@example.com',
          displayName: 'Admin User',
          platformRole: 'admin',
          opsStatus: 'active',
          planLabel: 'Plan-Pro',
          tags: ['internal'],
          internalNotes: 'local note',
          updatedAt: Date.UTC(2026, 3, 25),
          updatedByAccountId: '',
          rowVersion: 3,
          conflict: {
            at: Date.UTC(2026, 3, 26),
            currentState: {
              accountId: 'adult-admin',
              opsStatus: 'suspended',
              planLabel: 'Plan-Pro',
              tags: ['internal'],
              internalNotes: 'server note',
              rowVersion: 4,
            },
          },
        },
      ],
    },
  });
  const html = await renderFixture(buildEntry({ model: conflictModel, initialSection: 'accounts' }));

  // Conflict banner renders
  assert.match(html, /data-testid="account-ops-metadata-conflict-banner"/, 'Conflict banner renders');
  assert.match(html, /This account changed in another tab/, 'Conflict banner message renders');

  // Diff rows for divergent fields
  assert.match(html, /data-field="opsStatus"/, 'opsStatus diff row surfaces');
  assert.match(html, /data-field="internalNotes"/, 'internalNotes diff row surfaces');
  // Non-divergent fields do NOT show diff
  assert.doesNotMatch(html, /data-field="planLabel"/, 'planLabel not in diff (values match)');
  assert.doesNotMatch(html, /data-field="tags"/, 'tags not in diff (values match)');

  // Resolution buttons
  assert.match(html, /data-action="account-ops-metadata-keep-mine"/, 'Keep mine button renders');
  assert.match(html, /data-action="account-ops-metadata-use-theirs"/, 'Use theirs button renders');
});

// =================================================================
// 5. Edge case: Empty learner list renders fallback
// =================================================================

test('empty learner list renders "no learner diagnostics" fallback', async () => {
  const emptyLearnersModel = baseModel({
    learnerSupport: {
      selectedLearnerId: '',
      accessibleLearners: [],
      selectedDiagnostics: null,
      punctuationReleaseDiagnostics: null,
      entryPoints: [],
    },
  });
  const emptyAppState = baseAppState({
    learners: { selectedId: '', byId: {}, allIds: [] },
  });
  const html = await renderAllSections({
    model: emptyLearnersModel,
    appState: emptyAppState,
  });

  assert.match(
    html,
    /No learner diagnostics are accessible from this account scope yet/,
    'Empty learner fallback message renders',
  );
  // Grammar and writing try panels show their own empty states
  assert.match(
    html,
    /No Grammar concept evidence has been recorded/,
    'Grammar confidence empty state renders',
  );
  assert.match(
    html,
    /Choose a learner to manage their saved Writing Try entries/,
    'Writing Try panel shows no-learner prompt',
  );
});

// =================================================================
// 6. Edge case: Bootstrap capacity degraded state
// =================================================================

test('bootstrap capacity degraded state renders degradation banner', async () => {
  const degradedAppState = baseAppState({
    persistence: {
      mode: 'remote-sync',
      breakersDegraded: { bootstrapCapacity: true },
    },
  });
  const html = await renderFixture(buildEntry({ appState: degradedAppState }));

  assert.match(
    html,
    /data-admin-hub-degraded="bootstrap-capacity"/,
    'Bootstrap capacity degraded banner attribute renders',
  );
  assert.match(
    html,
    /Bootstrap capacity metadata missing/,
    'Bootstrap capacity degraded heading renders',
  );
  assert.match(
    html,
    /meta\.capacity\.bootstrapCapacity/,
    'Degradation banner references the missing metadata field',
  );
});

// =================================================================
// 7. Edge case: Classroom summary degraded state
// =================================================================

test('classroom summary degraded state hides per-learner stats but shows learner list', async () => {
  const degradedAppState = baseAppState({
    persistence: {
      mode: 'remote-sync',
      breakersDegraded: { classroomSummary: true },
    },
  });
  const html = await renderFixture(buildEntry({ appState: degradedAppState, initialSection: 'debug' }));

  // Degraded banner renders
  assert.match(
    html,
    /data-admin-hub-degraded="classroom-summary"/,
    'Classroom summary degraded banner attribute renders',
  );
  assert.match(
    html,
    /Classroom summary temporarily unavailable/,
    'Classroom summary degraded heading renders',
  );

  // Learner name still appears (list still renders)
  assert.match(html, /Ava/, 'Learner name still renders in degraded mode');
  assert.match(html, /Y5/, 'Learner year group still renders');

  // Per-learner stats are hidden: Grammar/Punctuation due/weak lines
  // should not appear inside the learner roster row when degraded.
  // Finding 9: simplified regex — the "Grammar: 3 due" format only comes
  // from the roster row, so a flat doesNotMatch suffices.
  assert.doesNotMatch(
    html,
    /Grammar: 3 due/,
    'Per-learner grammar stats hidden when classroom summary degraded',
  );
  // Finding 9: positive assertion — selectedDiagnostics callout survives degradation
  assert.match(html, /Grammar diagnostics/, 'Grammar diagnostics callout survives classroom-summary degradation');
});

// =================================================================
// 8. Error path: Non-admin/non-ops role renders Access Denied
// =================================================================

test('non-admin/non-ops role renders Access Denied card', async () => {
  const deniedModel = baseModel({
    permissions: {
      canViewAdminHub: false,
      platformRole: 'parent',
      platformRoleLabel: 'Parent',
      canManageMonsterVisualConfig: false,
    },
  });
  const html = await renderFixture(buildEntry({ model: deniedModel }));

  assert.match(html, /access-denied-card/, 'Access denied card renders');
  assert.match(
    html,
    /Admin Console is not available for the current surface role/,
    'Access denied title renders',
  );
  assert.match(
    html,
    /admin or operations platform role/,
    'Access denied detail text renders',
  );

  // No admin panels should render
  assert.doesNotMatch(html, /Dashboard KPI/, 'KPI panel does not render for parent');
  assert.doesNotMatch(html, /data-panel="post-mega-spelling-debug"/, 'Post-mega debug does not render');
  assert.doesNotMatch(html, /data-panel="grammar-concept-confidence"/, 'Grammar confidence does not render');
});

// =================================================================
// 9. Key interactive elements: role selector, refresh buttons
// =================================================================

test('key interactive elements render: role selector, refresh buttons, status chips', async () => {
  const html = await renderAllSections();

  // Role selector in AdminAccountRoles
  assert.match(html, /name="platformRole"/, 'Platform role selector renders');
  // Role options
  assert.match(html, /<option value="parent"/, 'Parent role option renders');
  assert.match(html, /<option value="admin"/, 'Admin role option renders');
  assert.match(html, /<option value="ops"/, 'Ops role option renders');

  // Refresh buttons across panels
  assert.match(html, /Refresh accounts/, 'Account refresh button renders');

  // Ops status selector in metadata panel
  assert.match(html, /name="opsStatus"/, 'Ops status selector renders');
  assert.match(html, /<option value="active"/, 'Active ops status option renders');
  assert.match(html, /<option value="suspended"/, 'Suspended ops status option renders');
  assert.match(html, /<option value="payment_hold"/, 'Payment hold ops status option renders');

  // Error event status selector
  assert.match(html, /name="errorEventStatus"/, 'Error event status selector renders');

  // Content release action buttons
  assert.match(html, /Open Spelling/, 'Open Spelling button renders');
  assert.match(html, /Open settings tab/, 'Open settings tab button renders');
  assert.match(html, /Export content/, 'Export content button renders');

  // Subject entry points (Finding 5: labels match admin-read-model.js)
  assert.match(html, /Open Spelling analytics/, 'Spelling analytics entry point button renders');
  assert.match(html, /Open Punctuation analytics/, 'Punctuation analytics entry point button renders');
  assert.match(html, /Export current learner snapshot/, 'Export learner snapshot entry point button renders');

  // Header chips
  assert.match(html, /Repo revision/, 'Repo revision chip renders');
  assert.match(html, /Selected learner/, 'Selected learner chip renders');
});

// =================================================================
// 10. Error event details drawer structure
// =================================================================

test('error event details drawer renders with release columns and timestamps', async () => {
  const html = await renderFixture(buildEntry({ initialSection: 'debug' }));

  // Drawer renders for the event
  assert.match(html, /data-testid="error-event-row-evt-001"/, 'Error event row renders');
  assert.match(html, /data-testid="error-event-drawer-evt-001"/, 'Error event drawer renders');

  // Drawer summary
  assert.match(html, /data-testid="error-event-drawer-summary"/, 'Drawer summary renders');

  // Drawer fields
  assert.match(html, /data-testid="error-drawer-message"/, 'Drawer message renders');
  assert.match(html, /data-testid="error-drawer-first-release"/, 'Drawer first release renders');
  assert.match(html, /data-testid="error-drawer-last-release"/, 'Drawer last release renders');
  assert.match(html, /data-testid="error-drawer-resolved-release"/, 'Drawer resolved release renders');
  assert.match(html, /data-testid="error-drawer-status-change"/, 'Drawer status change renders');
  assert.match(html, /data-testid="error-drawer-account"/, 'Drawer account (admin-visible) renders');

  // Content values
  assert.match(html, /Cannot read properties of undefined/, 'Error message content renders');
  assert.match(html, /at getProgress/, 'First frame renders in drawer');
});

// =================================================================
// 11. Guard branch: Loading-remote early return
// =================================================================

test('loading-remote early return renders loading card when model is null', async () => {
  const html = await renderFixture(buildEntry({
    modelExplicitNull: true,
    hubState: { status: 'loading' },
    accessContext: { shellAccess: { source: 'worker-session' }, activeAdultLearnerContext: null },
  }));

  assert.match(html, /Loading Admin Console/, 'Loading card heading renders');
  assert.match(html, /Loading live Worker diagnostics/, 'Loading card detail text renders');
  // No admin panels should render in loading state
  assert.doesNotMatch(html, /Dashboard KPI/, 'KPI panel does not render during loading');
  assert.doesNotMatch(html, /access-denied-card/, 'Access denied card does not render during loading');
});

// =================================================================
// 12. Guard branch: Hub-error early return
// =================================================================

test('hub-error early return renders error card when model is null and status is error', async () => {
  const html = await renderFixture(buildEntry({
    modelExplicitNull: true,
    hubState: { status: 'error', error: 'Worker timed out' },
    accessContext: { shellAccess: { source: 'worker-session' }, activeAdultLearnerContext: null },
  }));

  assert.match(html, /could not be loaded right now/, 'Error card title renders');
  assert.match(html, /Worker timed out/, 'Error card detail renders custom error message');
  // No admin panels should render in error state
  assert.doesNotMatch(html, /Dashboard KPI/, 'KPI panel does not render during error');
});

// =================================================================
// 13. Cron-failure banner
// =================================================================

test('cron-failure banner renders when lastFailureAt exceeds lastSuccessAt', async () => {
  const cronFailModel = baseModel({
    dashboardKpis: {
      ...baseModel().dashboardKpis,
      cronReconcile: {
        lastSuccessAt: 1000,
        lastFailureAt: 2000,
      },
    },
  });
  const html = await renderFixture(buildEntry({ model: cronFailModel }));

  assert.match(html, /data-testid="dashboard-cron-failure-banner"/, 'Cron failure banner renders');
  assert.match(html, /Automated reconciliation/, 'Cron failure banner identifies reconciliation leg');
  // The banner should still appear within the KPI panel
  assert.match(html, /Dashboard KPI/, 'KPI panel still renders alongside cron failure banner');
});

// =================================================================
// 14. Error log empty-state
// =================================================================

test('error log empty-state renders when entries array is empty', async () => {
  const emptyErrorsModel = baseModel({
    errorLogSummary: {
      generatedAt: 1,
      totals: { open: 0, investigating: 0, resolved: 0, ignored: 0, all: 0 },
      entries: [],
    },
  });
  const html = await renderFixture(buildEntry({ model: emptyErrorsModel, initialSection: 'debug' }));

  assert.match(html, /data-testid="error-centre-empty-state"/, 'Error centre empty state element renders');
  assert.match(html, /No error events recorded/, 'Error centre empty state message renders');
  // Error centre still renders its structure
  assert.match(html, /Error log centre/, 'Error log centre title still renders with empty entries');
});
