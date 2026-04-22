import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function renderFixture(entrySource) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-react-render-'));
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
      nodePaths: [path.join(rootDir, 'node_modules')],
      logLevel: 'silent',
    });
    return execFileSync(process.execPath, [bundlePath], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

function absoluteSpecifier(relativePath) {
  return path.join(rootDir, relativePath);
}

export function renderAuthSurfaceFixture() {
  return renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AuthSurface } from ${JSON.stringify(absoluteSpecifier('src/surfaces/auth/AuthSurface.jsx'))};

    const html = renderToStaticMarkup(
      <AuthSurface initialError="expired" onSubmit={async () => {}} onSocialStart={async () => {}} />
    );
    console.log(html);
  `);
}

export function renderSharedSurfaceFixture() {
  return renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { PersistenceBanner } from ${JSON.stringify(absoluteSpecifier('src/surfaces/shell/PersistenceBanner.jsx'))};
    import { ToastShelf } from ${JSON.stringify(absoluteSpecifier('src/surfaces/shell/ToastShelf.jsx'))};
    import { MonsterCelebrationOverlay } from ${JSON.stringify(absoluteSpecifier('src/surfaces/shell/MonsterCelebrationOverlay.jsx'))};

    const monster = {
      id: 'inklet',
      name: 'Inklet',
      accent: '#3E6FA8',
      secondary: '#FFE9A8',
      pale: '#F8F4EA',
      nameByStage: ['Inklet egg', 'Inklet'],
    };
    const persistence = {
      mode: 'degraded',
      remoteAvailable: true,
      trustedState: 'local-cache',
      cacheState: 'ahead-of-remote',
      pendingWriteCount: 2,
      inFlightWriteCount: 0,
      lastError: { message: 'remote unavailable', code: 'remote_error', phase: 'remote-write' },
    };
    const toast = { id: 'toast-1', type: 'reward.monster', kind: 'caught', monster, next: { stage: 0, branch: 'b1' } };
    const celebration = { kind: 'caught', monster, previous: null, next: { stage: 0, branch: 'b1' } };
    const html = renderToStaticMarkup(
      <>
        <PersistenceBanner snapshot={persistence} onRetry={() => {}} />
        <ToastShelf toasts={[toast]} onDismiss={() => {}} />
        <MonsterCelebrationOverlay queue={[celebration]} onDismiss={() => {}} />
      </>
    );
    console.log(html);
  `);
}

export function renderHubSurfaceFixture({ surface = 'parent' } = {}) {
  return renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { ParentHubSurface } from ${JSON.stringify(absoluteSpecifier('src/surfaces/hubs/ParentHubSurface.jsx'))};
    import { AdminHubSurface } from ${JSON.stringify(absoluteSpecifier('src/surfaces/hubs/AdminHubSurface.jsx'))};

    const appState = {
      learners: {
        selectedId: 'learner-a',
        byId: { 'learner-a': { id: 'learner-a', name: 'Ava', yearGroup: 'Y5' } },
        allIds: ['learner-a'],
      },
      persistence: { mode: 'remote-sync' },
      toasts: [],
      monsterCelebrations: { queue: [] },
    };
    const accessContext = {
      shellAccess: { source: 'worker-session' },
      activeAdultLearnerContext: {
        learnerId: 'learner-a',
        learnerName: 'Ava',
        writable: false,
        membershipRoleLabel: 'Viewer',
      },
    };
    const actions = {
      navigateHome() {},
      openSubject() {},
      dispatch() {},
    };
    const parentModel = {
      learner: { id: 'learner-a', name: 'Ava', lastActivityAt: Date.UTC(2026, 3, 22, 12, 0) },
      learnerOverview: { secureWords: 8, dueWords: 2, troubleWords: 1, accuracyPercent: 82 },
      dueWork: [{ label: 'Review due spellings', detail: 'Two words are ready.' }],
      recentSessions: [{ id: 'session-1', label: 'Smart Review', status: 'completed', sessionKind: 'spelling', mistakeCount: 1, updatedAt: Date.UTC(2026, 3, 22, 12, 0), headline: 'Good recall' }],
      strengths: [{ label: 'Suffixes', detail: 'Secure recall', secureCount: 4, troubleCount: 0 }],
      weaknesses: [{ label: 'Possession', detail: 'Needs another pass', secureCount: 1, troubleCount: 1 }],
      misconceptionPatterns: [{ label: 'Double consonant', source: 'event log', count: 2, lastSeenAt: Date.UTC(2026, 3, 22, 12, 0) }],
      progressSnapshots: [{ trackedWords: 213, totalPublishedWords: 235 }],
      exportEntryPoints: [{ action: 'platform-export-learner', label: 'Export current learner' }],
      accessibleLearners: [{ learnerId: 'learner-a', learnerName: 'Ava', yearGroup: 'Y5', membershipRoleLabel: 'Viewer', writable: false }],
      selectedLearnerId: 'learner-a',
      permissions: { canViewParentHub: true, canMutateLearnerData: false, platformRoleLabel: 'Parent', membershipRoleLabel: 'Viewer', accessModeLabel: 'Read-only learner' },
    };
    const adminModel = {
      account: { repoRevision: 5, selectedLearnerId: 'learner-a' },
      permissions: { canViewAdminHub: true, platformRole: 'admin', platformRoleLabel: 'Admin' },
      contentReleaseStatus: { publishedVersion: 3, publishedReleaseId: 'release-3', runtimeWordCount: 213, runtimeSentenceCount: 213, currentDraftId: 'draft', currentDraftVersion: 4, draftUpdatedAt: Date.UTC(2026, 3, 22, 12, 0) },
      importValidationStatus: { ok: true, errorCount: 0, warningCount: 1, source: 'seeded', importedAt: Date.UTC(2026, 3, 22, 12, 0), errors: [] },
      auditLogLookup: { available: true, note: 'Recent mutations', entries: [{ requestId: 'req-1', mutationKind: 'learners.write', scopeType: 'account', scopeId: 'adult-a', appliedAt: Date.UTC(2026, 3, 22, 12, 0) }] },
      learnerSupport: {
        selectedLearnerId: 'learner-a',
        selectedDiagnostics: { learnerId: 'learner-a', learnerName: 'Ava', overview: { secureWords: 8, dueWords: 2, troubleWords: 1 }, currentFocus: { detail: 'Review due spellings' } },
        accessibleLearners: [{ learnerId: 'learner-a', learnerName: 'Ava', yearGroup: 'Y5', membershipRoleLabel: 'Viewer', accessModeLabel: 'Read-only learner', writable: false, overview: { dueWords: 2 }, currentFocus: { label: 'Due spellings' } }],
        entryPoints: [{ action: 'open-subject', label: 'Open Spelling', subjectId: 'spelling' }],
      },
    };
    const accountDirectory = {
      status: 'loaded',
      accounts: [{ id: 'adult-a', email: 'admin@example.com', displayName: 'Admin', providers: ['email'], learnerCount: 1, platformRole: 'admin', updatedAt: Date.UTC(2026, 3, 22, 12, 0) }],
    };
    const html = ${JSON.stringify(surface)} === 'admin'
      ? renderToStaticMarkup(<AdminHubSurface appState={appState} model={adminModel} hubState={{ status: 'loaded' }} accountDirectory={accountDirectory} accessContext={accessContext} actions={actions} />)
      : renderToStaticMarkup(<ParentHubSurface appState={appState} model={parentModel} hubState={{ status: 'loaded' }} accessContext={accessContext} actions={actions} />);
    console.log(html);
  `);
}

export function renderAppFixture({ route = 'dashboard' } = {}) {
  return renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { App } from ${JSON.stringify(absoluteSpecifier('src/app/App.jsx'))};
    import { DefaultErrorFallback } from ${JSON.stringify(absoluteSpecifier('src/platform/react/ErrorBoundary.jsx'))};
    import { createAppController } from ${JSON.stringify(absoluteSpecifier('src/platform/app/create-app-controller.js'))};
    import { SUBJECTS } from ${JSON.stringify(absoluteSpecifier('src/platform/core/subject-registry.js'))};
    import { installMemoryStorage } from ${JSON.stringify(absoluteSpecifier('tests/helpers/memory-storage.js'))};

    installMemoryStorage();
    const controller = createAppController();
    if (${JSON.stringify(route)} === 'codex') controller.dispatch('open-codex');
    if (${JSON.stringify(route)} === 'subject') controller.dispatch('open-subject', { subjectId: 'spelling' });
    if (${JSON.stringify(route)} === 'profile') controller.dispatch('open-profile-settings');
    if (${JSON.stringify(route)} === 'parent-hub') controller.store.openParentHub();
    if (${JSON.stringify(route)} === 'admin-hub') controller.store.openAdminHub();

    function learnerModel(appState) {
      const id = appState.learners.selectedId;
      const learner = id ? appState.learners.byId[id] : null;
      return learner ? { id: learner.id, name: learner.name, yearGroup: learner.yearGroup } : null;
    }

    function chrome(appState) {
      const learner = learnerModel(appState);
      return {
        theme: 'light',
        learner,
        learnerLabel: learner ? learner.name + ' · ' + learner.yearGroup : 'No learner selected',
        learnerOptions: appState.learners.allIds.map((id) => appState.learners.byId[id]).filter(Boolean),
        signedInAs: null,
        persistence: {
          mode: appState.persistence?.mode || 'local-only',
          label: appState.persistence?.mode || 'Local-only',
          snapshot: appState.persistence,
        },
      };
    }

    const actions = {
      dispatch(action, data) { controller.dispatch(action, data); },
      toggleTheme() {},
      selectLearner(value) { controller.dispatch('learner-select', { value }); },
      navigateHome() { controller.dispatch('navigate-home'); },
      openProfileSettings() { controller.dispatch('open-profile-settings'); },
      openSubject(subjectId) { controller.dispatch('open-subject', { subjectId }); },
      openCodex() { controller.dispatch('open-codex'); },
      openParentHub() { controller.dispatch('open-parent-hub'); },
      openAdminHub() { controller.store.openAdminHub(); },
      logout() {},
      retryPersistence() { controller.dispatch('persistence-retry'); },
    };

    const runtime = {
      contextFor: controller.contextFor,
      buildSurfaceActions: () => actions,
      buildSurfaceChromeModel: chrome,
      buildHomeModel(appState) {
        return {
          ...chrome(appState),
          monsterSummary: [],
          subjects: SUBJECTS,
          dashboardStats: Object.fromEntries(SUBJECTS.map((subject) => [subject.id, { pct: 0, due: 0, streak: 0, nextUp: 'Ready' }])),
          dueTotal: 0,
          roundNumber: 1,
          now: new Date('2026-04-22T12:00:00Z'),
          permissions: { canOpenParentHub: true },
        };
      },
      buildCodexModel(appState) {
        return {
          ...chrome(appState),
          monsterSummary: [],
          now: new Date('2026-04-22T12:00:00Z'),
        };
      },
      afterRender() {},
    };

    const html = ${JSON.stringify(route === 'throw')}
      ? renderToStaticMarkup(<DefaultErrorFallback error={new Error('fixture boom')} />)
      : renderToStaticMarkup(<App controller={controller} runtime={runtime} />);
    console.log(html);
  `);
}
