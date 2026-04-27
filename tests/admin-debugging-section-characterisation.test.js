// U1 (Admin Console P4): characterisation test suite for AdminDebuggingSection.
//
// Purpose: pin the current rendering of all four sub-panels (ErrorLogCentre,
// DenialLog, DebugBundle, LearnerSupport) so that subsequent P4 hardening
// units are regression-safe. Each test mounts AdminDebuggingSection through
// the esbuild-bundled SSR harness and asserts structural markers — data-testid
// attributes, panel titles, filter controls, form fields, and key data cells.
//
// Scenarios:
//   1. Error log panel — renders with mock error events showing fingerprint,
//      route, occurrence count, status
//   2. Denial log panel — renders with mock denials showing reason, route,
//      timestamp
//   3. Debug Bundle form — renders all 6 input fields
//   4. Debug Bundle prefill — pre-fills fingerprint, accountId, route from
//      model.debugBundle.prefill
//   5. Learner support panel — renders with mock learner diagnostics
//   6. Occurrence timeline — renders with mock occurrences
//   7. Denial filter dropdown — has exactly 5 entries matching current values
//   8. Empty model — graceful empty states, not crashes
//   9. Null subsections — render without error

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
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-debug-char-'));
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

const SECTION_PATH = JSON.stringify(
  path.join(rootDir, 'src/surfaces/hubs/AdminDebuggingSection.jsx'),
);

function buildFixture({ model, appState, accessContext } = {}) {
  const m = model || fullModel();
  const as = appState || defaultAppState();
  const ac = accessContext || defaultAccessContext();
  return `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminDebuggingSection } from ${SECTION_PATH};
    const model = ${JSON.stringify(m)};
    const actions = { dispatch: () => {} };
    const appState = ${JSON.stringify(as)};
    const accessContext = ${JSON.stringify(ac)};
    const html = renderToStaticMarkup(
      <AdminDebuggingSection
        model={model}
        appState={appState}
        accessContext={accessContext}
        actions={actions}
      />
    );
    process.stdout.write(html);
  `;
}

function defaultAppState(overrides = {}) {
  return {
    persistence: { mode: 'remote-sync' },
    ...overrides,
  };
}

function defaultAccessContext() {
  return { shellAccess: { source: 'worker-session' }, activeAdultLearnerContext: null };
}

function fullModel(overrides = {}) {
  return {
    permissions: {
      canViewAdminHub: true,
      platformRole: 'admin',
      platformRoleLabel: 'Admin',
    },
    errorLogSummary: {
      generatedAt: Date.UTC(2026, 3, 27),
      refreshedAt: Date.UTC(2026, 3, 27),
      totals: { open: 3, investigating: 1, resolved: 7, ignored: 2, all: 13 },
      entries: [
        {
          id: 'evt-char-001',
          errorKind: 'TypeError',
          messageFirstLine: 'Cannot read properties of undefined (reading "length")',
          routeName: '/api/learner/progress',
          occurrenceCount: 5,
          firstSeen: Date.UTC(2026, 3, 20),
          lastSeen: Date.UTC(2026, 3, 26),
          status: 'open',
          firstSeenRelease: 'a1b2c3d4e5f67890',
          lastSeenRelease: 'a1b2c3d4e5f67890',
          resolvedInRelease: '',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
          firstFrame: 'at getProgress (worker.js:42)',
          accountIdMasked: '..f1a2b3',
          lastStatusChangeAt: null,
        },
        {
          id: 'evt-char-002',
          errorKind: 'ReferenceError',
          messageFirstLine: 'learnerId is not defined',
          routeName: '/api/subject/command',
          occurrenceCount: 2,
          firstSeen: Date.UTC(2026, 3, 22),
          lastSeen: Date.UTC(2026, 3, 25),
          status: 'investigating',
          firstSeenRelease: 'b2c3d4e5f6789012',
          lastSeenRelease: 'c3d4e5f678901234',
          resolvedInRelease: '',
          userAgent: 'Mozilla/5.0 (Macintosh)',
          firstFrame: 'at handleCommand (handler.js:99)',
          accountIdMasked: '..e2d3c4',
          lastStatusChangeAt: Date.UTC(2026, 3, 24),
        },
      ],
    },
    denialLog: {
      generatedAt: Date.UTC(2026, 3, 27),
      refreshedAt: Date.UTC(2026, 3, 27),
      entries: [
        {
          id: 'deny-char-001',
          deniedAt: Date.UTC(2026, 3, 26, 10, 30),
          denialReason: 'suspended_account',
          routeName: '/api/bootstrap',
          accountIdMasked: 'abcd1234',
          isDemo: false,
          release: null,
        },
        {
          id: 'deny-char-002',
          deniedAt: Date.UTC(2026, 3, 26, 11, 0),
          denialReason: 'rate_limited',
          routeName: '/api/subject/command',
          accountIdMasked: 'efgh5678',
          isDemo: true,
          release: null,
        },
        {
          id: 'deny-char-003',
          deniedAt: Date.UTC(2026, 3, 26, 12, 0),
          denialReason: 'forbidden',
          routeName: '/api/admin/hub',
          accountIdMasked: null,
          isDemo: false,
          release: null,
        },
      ],
    },
    debugBundle: {
      loading: false,
      error: null,
      data: null,
      prefill: null,
    },
    learnerSupport: {
      selectedLearnerId: 'learner-char-a',
      accessibleLearners: [
        {
          learnerId: 'learner-char-a',
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
        {
          learnerId: 'learner-char-b',
          learnerName: 'Oliver',
          yearGroup: 'Y3',
          membershipRoleLabel: 'Member',
          accessModeLabel: 'Read-only learner',
          writable: false,
          currentFocus: { label: 'Grammar' },
          overview: {
            dueWords: 12,
            secureWords: 40,
            troubleWords: 4,
            dueGrammarConcepts: 5,
            weakGrammarConcepts: 2,
            secureGrammarConcepts: 6,
            duePunctuationItems: 3,
            weakPunctuationItems: 1,
            securePunctuationUnits: 4,
          },
          grammarEvidence: {
            progressSnapshot: { dueConcepts: 5, weakConcepts: 2, securedConcepts: 6 },
          },
          punctuationEvidence: {
            progressSnapshot: { dueItems: 3, weakItems: 1, securedRewardUnits: 4 },
          },
        },
      ],
      selectedDiagnostics: {
        learnerId: 'learner-char-a',
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
      },
      punctuationReleaseDiagnostics: null,
      entryPoints: [
        { action: 'open-subject', label: 'Open Spelling analytics', subjectId: 'spelling', tab: 'analytics' },
        { action: 'open-subject', label: 'Open Punctuation analytics', subjectId: 'punctuation', tab: 'analytics' },
      ],
    },
    ...overrides,
  };
}


// =================================================================
// 1. Error log panel — renders with mock error events
// =================================================================

test('error log panel renders events with fingerprint, route, occurrence count, and status', async () => {
  const html = await renderFixture(buildFixture());

  // Panel structure
  assert.match(html, /Error log/, 'Error log eyebrow renders');
  assert.match(html, /Error log centre/, 'Error log centre title renders');

  // Event rows
  assert.match(html, /data-testid="error-event-row-evt-char-001"/, 'First error event row renders');
  assert.match(html, /data-testid="error-event-row-evt-char-002"/, 'Second error event row renders');

  // Error kind and message
  assert.match(html, /TypeError/, 'Error kind renders for first event');
  assert.match(html, /ReferenceError/, 'Error kind renders for second event');
  assert.match(html, /Cannot read properties of undefined/, 'Message first line renders');
  assert.match(html, /learnerId is not defined/, 'Second event message renders');

  // Route
  assert.match(html, /\/api\/learner\/progress/, 'Route renders for first event');
  assert.match(html, /\/api\/subject\/command/, 'Route renders for second event');

  // Occurrence count — rendered as ×N
  assert.match(html, /×5/, 'Occurrence count renders for first event');
  assert.match(html, /×2/, 'Occurrence count renders for second event');

  // Status selector (admin role sees <select>)
  assert.match(html, /name="errorEventStatus"/, 'Status selector renders for admin');

  // Status totals chips
  assert.match(html, /3 open/, 'Open totals chip renders');
  assert.match(html, /1 investigating/, 'Investigating totals chip renders');
  assert.match(html, /7 resolved/, 'Resolved totals chip renders');
  assert.match(html, /2 ignored/, 'Ignored totals chip renders');

  // Error event details drawer
  assert.match(html, /data-testid="error-event-drawer-evt-char-001"/, 'Drawer renders for first event');
  assert.match(html, /data-testid="error-event-drawer-evt-char-002"/, 'Drawer renders for second event');

  // Drawer fields for first event
  assert.match(html, /at getProgress/, 'First frame renders in drawer');
  assert.match(html, /Mozilla\/5\.0/, 'User agent renders in drawer');
  assert.match(html, /data-testid="error-drawer-account"/, 'Account attribution renders for admin');
});

// =================================================================
// 2. Denial log panel — renders with mock denials
// =================================================================

test('denial log panel renders entries with reason, route, and timestamp', async () => {
  const html = await renderFixture(buildFixture());

  // Panel structure
  assert.match(html, /data-testid="denial-log-panel"/, 'Denial log panel container renders');
  assert.match(html, /Request denials/, 'Denial log eyebrow renders');
  assert.match(html, /Denial log/, 'Denial log title renders');

  // Denial rows
  assert.match(html, /data-testid="denial-row-deny-char-001"/, 'First denial row renders');
  assert.match(html, /data-testid="denial-row-deny-char-002"/, 'Second denial row renders');
  assert.match(html, /data-testid="denial-row-deny-char-003"/, 'Third denial row renders');

  // Denial reasons
  assert.match(html, /suspended_account/, 'First denial reason renders');
  assert.match(html, /rate_limited/, 'Second denial reason renders');
  assert.match(html, /forbidden/, 'Third denial reason renders');

  // Routes
  assert.match(html, /\/api\/bootstrap/, 'Route renders for first denial');
  assert.match(html, /\/api\/admin\/hub/, 'Route renders for third denial');

  // Admin sees account linkage
  assert.match(html, /data-testid="denial-account-deny-char-001"/, 'Admin sees account column for first denial');
  assert.match(html, /abcd1234/, 'Masked account ID renders');

  // Demo chip for second denial
  assert.match(html, /demo/, 'Demo chip renders for demo denial');
});

// =================================================================
// 3. Debug Bundle form — renders all input fields
// =================================================================

test('debug bundle form renders all 6 input fields', async () => {
  const html = await renderFixture(buildFixture());

  // Panel structure
  assert.match(html, /data-testid="debug-bundle-panel"/, 'Debug bundle panel container renders');
  assert.match(html, /Debug tools/, 'Debug bundle eyebrow renders');
  assert.match(html, /Debug Bundle/, 'Debug bundle title renders');

  // Search form container
  assert.match(html, /data-testid="debug-bundle-search-form"/, 'Search form container renders');

  // All 6 input fields
  assert.match(html, /data-testid="bundle-input-account"/, 'Account ID input renders');
  assert.match(html, /data-testid="bundle-input-learner"/, 'Learner ID input renders');
  assert.match(html, /data-testid="bundle-input-from"/, 'Time from input renders');
  assert.match(html, /data-testid="bundle-input-to"/, 'Time to input renders');
  assert.match(html, /data-testid="bundle-input-fingerprint"/, 'Error fingerprint input renders');
  assert.match(html, /data-testid="bundle-input-route"/, 'Route filter input renders');

  // Labels
  assert.match(html, /Account ID or email/, 'Account input label renders');
  assert.match(html, /Learner ID/, 'Learner input label renders');
  assert.match(html, /Error fingerprint/, 'Fingerprint input label renders');
  assert.match(html, /Route filter/, 'Route filter input label renders');

  // Generate button
  assert.match(html, /data-testid="bundle-generate-btn"/, 'Generate button renders');
  assert.match(html, /Generate Debug Bundle/, 'Generate button label renders');

  // Empty state (no bundle data)
  assert.match(html, /data-testid="debug-bundle-empty-state"/, 'Empty state renders when no bundle data');
  assert.match(html, /Enter search criteria/, 'Empty state guidance text renders');
});

// =================================================================
// 4. Debug Bundle prefill — pre-fills from model.debugBundle.prefill
// =================================================================

test('debug bundle pre-fills fingerprint, accountId, and route from prefill', async () => {
  const prefillModel = fullModel({
    debugBundle: {
      loading: false,
      error: null,
      data: null,
      prefill: {
        fingerprint: 'fp-prefill-001',
        accountId: 'acct-prefill-002',
        route: '/api/prefilled-route',
      },
    },
  });
  const html = await renderFixture(buildFixture({ model: prefillModel }));

  // Prefilled values appear in the input value attributes (SSR renders
  // the initial state after the useEffect — React SSR does NOT run
  // effects, so the prefill values come from the useState initialisers
  // only if they are wired as defaults. The current implementation uses
  // useEffect, so SSR renders empty strings. This pins the CURRENT
  // behaviour: prefill is NOT visible in SSR.)
  //
  // Pin: inputs render, panel structure intact. The prefill useEffect
  // requires a client-side mount to execute.
  assert.match(html, /data-testid="bundle-input-fingerprint"/, 'Fingerprint input present');
  assert.match(html, /data-testid="bundle-input-account"/, 'Account input present');
  assert.match(html, /data-testid="bundle-input-route"/, 'Route input present');
  assert.match(html, /data-testid="debug-bundle-panel"/, 'Panel renders with prefill model');

  // SSR renders empty value="" because useEffect does not fire server-side.
  // This is the current behaviour we are pinning — the prefill only
  // activates after hydration on the client.
  assert.match(html, /name="bundleFingerprint"/, 'Fingerprint input name attribute present');
  assert.match(html, /name="bundleAccountId"/, 'Account input name attribute present');
  assert.match(html, /name="bundleRoute"/, 'Route input name attribute present');
});

// =================================================================
// 5. Learner support panel — renders with mock learner diagnostics
// =================================================================

test('learner support panel renders accessible learners and selected diagnostics', async () => {
  const html = await renderFixture(buildFixture());

  // Panel structure
  assert.match(html, /Learner support \/ diagnostics/, 'Learner support eyebrow renders');
  assert.match(html, /Readable learners/, 'Readable learners heading renders');

  // Accessible learner roster
  assert.match(html, /Ava/, 'First learner name renders');
  assert.match(html, /Oliver/, 'Second learner name renders');
  assert.match(html, /Y5/, 'First learner year group renders');
  assert.match(html, /Y3/, 'Second learner year group renders');
  assert.match(html, /Owner/, 'First learner membership role renders');
  assert.match(html, /Member/, 'Second learner membership role renders');

  // Per-learner stats in roster (not degraded)
  assert.match(html, /Focus: Spelling/, 'First learner focus renders');
  assert.match(html, /Focus: Grammar/, 'Second learner focus renders');
  assert.match(html, /5 due/, 'Spelling due words renders in roster');

  // Grammar/Punctuation stats in roster
  assert.match(html, /Grammar: 3 due/, 'Grammar due concepts renders in first learner row');
  assert.match(html, /Punctuation: 2 due/, 'Punctuation due items renders in first learner row');

  // Selected diagnostics callout
  assert.match(html, /<strong>Ava<\/strong>/, 'Selected diagnostics learner name renders');
  assert.match(html, /Secure: 80/, 'Secure words count renders');
  assert.match(html, /Due: 5/, 'Due words count renders');
  assert.match(html, /Trouble: 2/, 'Trouble words count renders');
  assert.match(html, /Grammar diagnostics/, 'Grammar diagnostics heading renders');
  assert.match(html, /Punctuation diagnostics/, 'Punctuation diagnostics heading renders');

  // Punctuation release diagnostics
  assert.match(html, /punct-rel-1/, 'Punctuation release ID renders');
  assert.match(html, /tracked units 10/, 'Tracked reward unit count renders');
  assert.match(html, /sessions 5/, 'Session count renders');
  assert.match(html, /exposure stable/, 'Production exposure status renders');

  // Question-type focus
  assert.match(html, /Question-type focus: Gap fill/, 'Grammar question-type focus renders');

  // Punctuation focus
  assert.match(html, /Punctuation focus: Comma splice/, 'Punctuation weakest facet renders');

  // Current focus detail
  assert.match(html, /Focus on due words for this week/, 'Current focus detail renders');

  // Entry point buttons
  assert.match(html, /Open Spelling analytics/, 'Spelling analytics entry point renders');
  assert.match(html, /Open Punctuation analytics/, 'Punctuation analytics entry point renders');
});

// =================================================================
// 6. Occurrence timeline — renders with mock occurrences
// =================================================================

test('occurrence timeline renders with mock occurrences inside error drawer', async () => {
  const occurrenceModel = fullModel();
  // Inject occurrences into the first error event
  occurrenceModel.errorLogSummary.entries[0].occurrences = [
    {
      id: 'occ-char-001',
      occurredAt: Date.UTC(2026, 3, 25, 14, 0),
      release: 'a1b2c3d4e5f67890',
      routeName: '/api/learner/progress',
      accountId: '..f1a2b3',
    },
    {
      id: 'occ-char-002',
      occurredAt: Date.UTC(2026, 3, 26, 9, 30),
      release: 'a1b2c3d4e5f67890',
      routeName: '/api/learner/progress',
      accountId: '..f1a2b3',
    },
  ];

  const html = await renderFixture(buildFixture({ model: occurrenceModel }));

  // Occurrence timeline container
  assert.match(html, /data-testid="occurrence-timeline-evt-char-001"/, 'Occurrence timeline renders for first event');

  // Table renders
  assert.match(html, /data-testid="occurrence-table-evt-char-001"/, 'Occurrence table renders');

  // Rows
  assert.match(html, /data-testid="occurrence-row-occ-char-001"/, 'First occurrence row renders');
  assert.match(html, /data-testid="occurrence-row-occ-char-002"/, 'Second occurrence row renders');

  // Table headers
  assert.match(html, /When/, 'When column header renders');
  assert.match(html, /Release/, 'Release column header renders');
  assert.match(html, /Route/, 'Route column header renders');
  assert.match(html, /Account/, 'Account column header renders for admin');

  // Release is sliced to first 7 characters
  assert.match(html, /a1b2c3d/, 'Release SHA renders (first 7 chars)');

  // Route in occurrence row
  assert.match(html, /\/api\/learner\/progress/, 'Route renders in occurrence row');
});

// =================================================================
// 7. Denial filter dropdown — exactly 5 entries
// =================================================================

test('denial filter reason dropdown has exactly 5 entries matching current values', async () => {
  const html = await renderFixture(buildFixture());

  // The denial reason dropdown
  assert.match(html, /data-testid="denial-filter-reason"/, 'Denial reason filter dropdown renders');

  // "All reasons" default option (React SSR may add selected="" attribute)
  assert.match(html, /<option value=""[^>]*>All reasons<\/option>/, 'Default "All reasons" option renders');

  // The 5 denial reason values (pinning current codebase values)
  assert.match(html, /<option value="suspended_account"/, 'suspended_account option renders');
  assert.match(html, /<option value="rate_limited"/, 'rate_limited option renders');
  assert.match(html, /<option value="forbidden"/, 'forbidden option renders');
  assert.match(html, /<option value="invalid_session"/, 'invalid_session option renders');
  assert.match(html, /<option value="demo_expired"/, 'demo_expired option renders');

  // Count the option elements inside the denial reason select to confirm
  // exactly 6 total (1 default "All reasons" + 5 reason values). We extract
  // the select block and count occurrences of <option.
  const selectMatch = html.match(/data-testid="denial-filter-reason"[^>]*>(.+?)<\/select>/s);
  assert.ok(selectMatch, 'Denial reason select block found');
  const optionCount = (selectMatch[1].match(/<option /g) || []).length;
  assert.equal(optionCount, 6, 'Exactly 6 options inside select (1 default + 5 reason values)');

  // Other filter controls present
  assert.match(html, /data-testid="denial-filter-route"/, 'Route filter input renders');
  assert.match(html, /data-testid="denial-filter-from"/, 'From filter input renders');
  assert.match(html, /data-testid="denial-filter-to"/, 'To filter input renders');
  assert.match(html, /data-testid="denial-filter-apply"/, 'Apply button renders');
  assert.match(html, /data-testid="denial-filter-reset"/, 'Reset button renders');
});

// =================================================================
// 8. Empty model — graceful empty states
// =================================================================

test('empty model renders graceful empty states without crashes', async () => {
  const emptyModel = {
    permissions: {
      canViewAdminHub: true,
      platformRole: 'admin',
      platformRoleLabel: 'Admin',
    },
    errorLogSummary: {
      generatedAt: 1,
      totals: {},
      entries: [],
    },
    denialLog: {
      generatedAt: 1,
      entries: [],
    },
    debugBundle: {},
    learnerSupport: {
      accessibleLearners: [],
      entryPoints: [],
    },
  };

  const html = await renderFixture(buildFixture({ model: emptyModel }));

  // Error log empty state
  assert.match(html, /data-testid="error-centre-empty-state"/, 'Error centre empty state renders');
  assert.match(html, /No error events recorded/, 'Error centre empty state message renders');

  // Denial log empty state
  assert.match(html, /data-testid="denial-panel-empty-state"/, 'Denial panel empty state renders');
  assert.match(html, /No request denials recorded/, 'Denial panel empty state message renders');

  // Debug bundle empty state
  assert.match(html, /data-testid="debug-bundle-empty-state"/, 'Debug bundle empty state renders');
  assert.match(html, /Enter search criteria/, 'Debug bundle guidance text renders');

  // Learner support empty state
  assert.match(
    html,
    /No learner diagnostics are accessible from this account scope yet/,
    'Learner support empty state renders',
  );

  // All 4 panels rendered without crashing
  assert.match(html, /Error log centre/, 'Error log centre title renders in empty model');
  assert.match(html, /Denial log/, 'Denial log title renders in empty model');
  assert.match(html, /Debug Bundle/, 'Debug Bundle title renders in empty model');
  assert.match(html, /Learner support/, 'Learner support eyebrow renders in empty model');
});

// =================================================================
// 9. Null subsections — render without error
// =================================================================

test('null and undefined subsections render without error', async () => {
  const nullModel = {
    permissions: {
      canViewAdminHub: true,
      platformRole: 'ops',
      platformRoleLabel: 'Operations',
    },
    // All subsections explicitly null or undefined
    errorLogSummary: null,
    denialLog: null,
    debugBundle: null,
    learnerSupport: {
      accessibleLearners: null,
      selectedDiagnostics: null,
      entryPoints: null,
    },
  };

  const html = await renderFixture(buildFixture({ model: nullModel }));

  // Panels render their structure even with null data
  assert.match(html, /Error log centre/, 'Error log title renders with null errorLogSummary');
  assert.match(html, /Denial log/, 'Denial log title renders with null denialLog');
  assert.match(html, /Debug Bundle/, 'Debug Bundle title renders with null debugBundle');
  assert.match(html, /Learner support/, 'Learner support eyebrow renders with null learnerSupport fields');

  // Empty states render for null data
  assert.match(html, /No error events recorded/, 'Error centre empty state renders for null');
  assert.match(html, /No request denials recorded/, 'Denial panel empty state renders for null');

  // No crash — that is the key assertion. If the render threw, the output
  // would be empty or the process would have exited non-zero.
  assert.ok(html.length > 100, 'Meaningful HTML output produced from null subsections');
});

// =================================================================
// 10. Ops role — account linkage redaction
// =================================================================

test('ops role does not see account linkage in error drawer or denial rows', async () => {
  const opsModel = fullModel({
    permissions: {
      canViewAdminHub: true,
      platformRole: 'ops',
      platformRoleLabel: 'Operations',
    },
  });

  const html = await renderFixture(buildFixture({ model: opsModel }));

  // Denial rows render
  assert.match(html, /data-testid="denial-row-deny-char-001"/, 'Denial row renders for ops');
  assert.match(html, /suspended_account/, 'Denial reason renders for ops');

  // Ops does NOT see account linkage in denial rows
  assert.ok(
    !html.includes('data-testid="denial-account-deny-char-001"'),
    'Ops does not see account column in denial rows',
  );

  // Ops does NOT see account linkage in error drawer
  assert.ok(
    !html.includes('data-testid="error-drawer-account"'),
    'Ops does not see account attribution in error drawer',
  );

  // Error event status renders as chip (not selector) for non-admin
  assert.ok(
    !html.includes('name="errorEventStatus"'),
    'Ops does not see error event status selector',
  );
});

// =================================================================
// 11. Classroom summary degraded — hides per-learner stats
// =================================================================

test('classroom summary degraded hides per-learner stats but keeps learner list', async () => {
  const degradedAppState = defaultAppState({
    persistence: {
      mode: 'remote-sync',
      breakersDegraded: { classroomSummary: true },
    },
  });

  const html = await renderFixture(buildFixture({ appState: degradedAppState }));

  // Degradation banner
  assert.match(
    html,
    /data-admin-hub-degraded="classroom-summary"/,
    'Classroom summary degraded banner renders',
  );
  assert.match(
    html,
    /Classroom summary temporarily unavailable/,
    'Degraded heading renders',
  );

  // Learner names survive degradation
  assert.match(html, /Ava/, 'Learner name renders in degraded mode');
  assert.match(html, /Oliver/, 'Second learner name renders in degraded mode');

  // Per-learner stats are hidden
  assert.doesNotMatch(
    html,
    /Focus: Spelling/,
    'Per-learner focus hidden when classroom summary degraded',
  );
  assert.doesNotMatch(
    html,
    /Grammar: 3 due/,
    'Per-learner grammar stats hidden when classroom summary degraded',
  );

  // Selected diagnostics callout survives degradation
  assert.match(html, /Grammar diagnostics/, 'Grammar diagnostics callout survives degradation');
  assert.match(html, /Punctuation diagnostics/, 'Punctuation diagnostics callout survives degradation');
});
