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

export function renderMonsterVisualRendererFixture() {
  return renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { MonsterVisualConfigProvider } from ${JSON.stringify(absoluteSpecifier('src/platform/game/MonsterVisualConfigContext.jsx'))};
    import { BUNDLED_MONSTER_VISUAL_CONFIG } from ${JSON.stringify(absoluteSpecifier('src/platform/game/monster-visual-config.js'))};
    import { CodexCreatureVisual } from ${JSON.stringify(absoluteSpecifier('src/surfaces/home/CodexCreature.jsx'))};
    import { MonsterMeadow } from ${JSON.stringify(absoluteSpecifier('src/surfaces/home/MonsterMeadow.jsx'))};
    import { SetupMeadow } from ${JSON.stringify(absoluteSpecifier('src/subjects/spelling/components/SpellingSetupScene.jsx'))};
    import { MonsterCelebrationOverlay } from ${JSON.stringify(absoluteSpecifier('src/surfaces/shell/MonsterCelebrationOverlay.jsx'))};
    import { ToastShelf } from ${JSON.stringify(absoluteSpecifier('src/surfaces/shell/ToastShelf.jsx'))};
    import { MONSTERS } from ${JSON.stringify(absoluteSpecifier('src/platform/game/monsters.js'))};

    const config = structuredClone(BUNDLED_MONSTER_VISUAL_CONFIG);
    config.assets['vellhorn-b1-3'].baseline.facing = 'right';
    config.assets['vellhorn-b1-3'].baseline.opacity = 0.82;
    config.assets['vellhorn-b1-3'].baseline.anchorX = 0.25;
    config.assets['vellhorn-b1-3'].contexts.codexCard.offsetX = 12;
    config.assets['vellhorn-b1-3'].contexts.codexCard.offsetY = -6;
    config.assets['vellhorn-b1-3'].contexts.codexCard.scale = 1.18;
    config.assets['vellhorn-b1-3'].contexts.codexCard.anchorX = 0.25;
    config.assets['vellhorn-b1-3'].contexts.codexCard.anchorY = 0.72;
    config.assets['vellhorn-b1-3'].contexts.codexCard.filter = 'brightness(1.1)';
    config.assets['vellhorn-b1-3'].contexts.codexCard.cropX = 0.05;
    config.assets['vellhorn-b1-3'].contexts.codexCard.cropY = 0.10;
    config.assets['vellhorn-b1-3'].contexts.codexCard.cropWidth = 0.80;
    config.assets['vellhorn-b1-3'].contexts.codexCard.cropHeight = 0.85;
    config.assets['vellhorn-b1-3'].contexts.celebrationOverlay.offsetX = 18;
    config.assets['vellhorn-b1-3'].contexts.celebrationOverlay.offsetY = -14;
    config.assets['vellhorn-b1-3'].contexts.celebrationOverlay.scale = 1.12;
    config.assets['vellhorn-b1-3'].contexts.celebrationOverlay.anchorX = 0.42;
    config.assets['vellhorn-b1-3'].contexts.celebrationOverlay.anchorY = 0.78;
    config.assets['vellhorn-b1-3'].contexts.celebrationOverlay.shadowX = 7;
    config.assets['vellhorn-b1-3'].contexts.celebrationOverlay.shadowY = 9;
    config.assets['vellhorn-b1-3'].contexts.celebrationOverlay.shadowScale = 1.35;
    config.assets['vellhorn-b1-3'].contexts.celebrationOverlay.shadowOpacity = 0.34;
    config.assets['vellhorn-b1-3'].contexts.celebrationOverlay.duration = 6.25;
    config.assets['vellhorn-b1-3'].contexts.celebrationOverlay.delay = 0.40;
    config.assets['vellhorn-b1-3'].contexts.celebrationOverlay.bob = 5;
    config.assets['vellhorn-b1-3'].contexts.celebrationOverlay.tilt = 3;
    config.assets['inklet-b1-1'].contexts.toastPortrait.scale = 1.25;

    const html = renderToStaticMarkup(
      <MonsterVisualConfigProvider value={{ config }}>
        <>
          <CodexCreatureVisual
            entry={{
              id: 'vellhorn',
              branch: 'b1',
              stage: 3,
              displayState: 'monster',
              imageAlt: 'Vellhorn',
              img: '',
              srcSet: '',
            }}
            sizes="160px"
          />
          <MonsterMeadow
            monsters={[{
              id: 'vellhorn-caught',
              species: 'vellhorn',
              variant: 'b1',
              stage: 3,
              x: '50%',
              footY: '80%',
              size: 160,
              path: 'walk',
              lane: 'ground',
              footPct: 80,
            }]}
          />
          <SetupMeadow
            codex={[{
              monster: { id: 'vellhorn', name: 'Vellhorn' },
              progress: { branch: 'b1', stage: 3, caught: true },
            }]}
          />
          <MonsterCelebrationOverlay
            queue={[{
              kind: 'caught',
              monster: MONSTERS.vellhorn,
              previous: null,
              next: { stage: 3, branch: 'b1' },
            }]}
            onDismiss={() => {}}
          />
          <ToastShelf
            toasts={[{
              id: 'toast-a',
              type: 'reward.monster',
              kind: 'caught',
              monster: { id: 'inklet', name: 'Inklet' },
              next: { stage: 1, branch: 'b1' },
            }]}
            onDismiss={() => {}}
          />
        </>
      </MonsterVisualConfigProvider>
    );
    console.log(html);
  `);
}

export function renderMonsterCelebrationOverlayFixture() {
  return renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { MonsterCelebrationOverlay } from ${JSON.stringify(absoluteSpecifier('src/surfaces/shell/MonsterCelebrationOverlay.jsx'))};
    import { MONSTERS } from ${JSON.stringify(absoluteSpecifier('src/platform/game/monsters.js'))};

    const event = {
      id: 'reward.monster:learner-a:vellhorn:evolve:1:1',
      type: 'reward.monster',
      kind: 'evolve',
      learnerId: 'learner-a',
      monsterId: 'vellhorn',
      monster: MONSTERS.vellhorn,
      previous: { mastered: 9, stage: 0, level: 0, caught: true, branch: 'b2' },
      next: { mastered: 10, stage: 1, level: 1, caught: true, branch: 'b2' },
      createdAt: Date.UTC(2026, 0, 1),
    };
    const html = renderToStaticMarkup(<MonsterCelebrationOverlay queue={[event]} onDismiss={() => {}} />);
    console.log(html);
  `);
}

export function renderProfileSurfaceFixture({ demo = false, persistenceMode = 'remote-sync' } = {}) {
  return renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { ProfileSettingsSurface } from ${JSON.stringify(absoluteSpecifier('src/surfaces/profile/ProfileSettingsSurface.jsx'))};

    const appState = {
      learners: {
        selectedId: 'learner-a',
        byId: {
          'learner-a': {
            id: 'learner-a',
            name: 'Ava',
            yearGroup: 'Y5',
            goal: 'sats',
            dailyMinutes: 15,
            avatarColor: '#3E6FA8',
          },
        },
        allIds: ['learner-a'],
      },
      persistence: {
        mode: ${JSON.stringify(persistenceMode)},
        trustedState: ${JSON.stringify(persistenceMode === 'degraded' ? 'local-cache' : 'remote')},
        pendingWriteCount: ${JSON.stringify(persistenceMode === 'degraded' ? 1 : 0)},
        remoteAvailable: true,
      },
    };
    const chrome = {
      theme: 'light',
      learner: { id: 'learner-a', name: 'Ava', yearGroup: 'Y5' },
      learnerLabel: 'Ava · Y5',
      learnerOptions: [{ id: 'learner-a', name: 'Ava', yearGroup: 'Y5' }],
      signedInAs: ${JSON.stringify(demo ? '' : 'parent@example.test')},
      session: {
        signedIn: true,
        demo: ${demo ? 'true' : 'false'},
        mode: ${JSON.stringify(demo ? 'demo-sync' : 'remote-sync')},
      },
      persistence: {
        mode: appState.persistence.mode,
        label: appState.persistence.mode,
        snapshot: appState.persistence,
      },
    };
    const actions = {
      dispatch() {},
      toggleTheme() {},
      navigateHome() {},
      selectLearner() {},
      openProfileSettings() {},
      logout() {},
      retryPersistence() {},
    };
    const html = renderToStaticMarkup(
      <ProfileSettingsSurface appState={appState} chrome={chrome} actions={actions} subjectCount={3} liveSubjectCount={1} />
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
    import { BUNDLED_MONSTER_VISUAL_CONFIG } from ${JSON.stringify(absoluteSpecifier('src/platform/game/monster-visual-config.js'))};

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
      learnerOverview: { secureWords: 8, dueWords: 2, troubleWords: 1, accuracyPercent: 82, secureGrammarConcepts: 2, dueGrammarConcepts: 1, weakGrammarConcepts: 1, grammarAccuracyPercent: 67 },
      dueWork: [{ label: 'Review due spellings', detail: 'Two words are ready.' }, { subjectId: 'grammar', label: 'Repair Grammar misconceptions', detail: 'Adverbials need another pass.' }],
      recentSessions: [{ id: 'session-1', label: 'Smart Review', status: 'completed', sessionKind: 'spelling', mistakeCount: 1, updatedAt: Date.UTC(2026, 3, 22, 12, 0), headline: 'Good recall' }],
      strengths: [{ label: 'Suffixes', detail: 'Secure recall', secureCount: 4, troubleCount: 0 }],
      weaknesses: [{ label: 'Possession', detail: 'Needs another pass', secureCount: 1, troubleCount: 1 }],
      misconceptionPatterns: [{ label: 'Double consonant', source: 'event log', count: 2, lastSeenAt: Date.UTC(2026, 3, 22, 12, 0) }],
      progressSnapshots: [
        { subjectId: 'spelling', trackedWords: 213, totalPublishedWords: 235 },
        { subjectId: 'grammar', trackedConcepts: 3, totalConcepts: 18, securedConcepts: 2, dueConcepts: 1, weakConcepts: 1 },
      ],
      exportEntryPoints: [{ action: 'platform-export-learner', label: 'Export current learner' }],
      accessibleLearners: [{ learnerId: 'learner-a', learnerName: 'Ava', yearGroup: 'Y5', membershipRoleLabel: 'Viewer', writable: false }],
      selectedLearnerId: 'learner-a',
      permissions: { canViewParentHub: true, canMutateLearnerData: false, platformRoleLabel: 'Parent', membershipRoleLabel: 'Viewer', accessModeLabel: 'Read-only learner' },
    };
    const adminModel = {
      account: { id: 'adult-a', repoRevision: 5, selectedLearnerId: 'learner-a' },
      permissions: { canViewAdminHub: true, platformRole: 'admin', platformRoleLabel: 'Admin', canManageMonsterVisualConfig: true },
      monsterVisualConfig: {
        permissions: { canManageMonsterVisualConfig: true, canViewMonsterVisualConfig: true },
        status: {
          schemaVersion: 1,
          manifestHash: BUNDLED_MONSTER_VISUAL_CONFIG.manifestHash,
          draftRevision: 0,
          publishedVersion: 1,
          publishedAt: Date.UTC(2026, 3, 22, 12, 0),
          validation: { ok: true, errorCount: 0, warningCount: 0, errors: [], warnings: [] },
        },
        draft: BUNDLED_MONSTER_VISUAL_CONFIG,
        published: BUNDLED_MONSTER_VISUAL_CONFIG,
        versions: [{ version: 1, manifestHash: BUNDLED_MONSTER_VISUAL_CONFIG.manifestHash, schemaVersion: 1, publishedAt: Date.UTC(2026, 3, 22, 12, 0), publishedByAccountId: 'system' }],
        mutation: { policyVersion: 1, scopeType: 'platform', scopeId: 'monster-visual-config', draftRevision: 0 },
      },
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

export function renderSubjectRouteFixture({ subject = 'placeholder' } = {}) {
  return renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { SubjectRoute } from ${JSON.stringify(absoluteSpecifier('src/surfaces/subject/SubjectRoute.jsx'))};
    import { createLocalAppController } from ${JSON.stringify(absoluteSpecifier('src/platform/app/create-local-app-controller.js'))};
    import { SUBJECTS } from ${JSON.stringify(absoluteSpecifier('src/platform/core/subject-registry.js'))};
    import { installMemoryStorage } from ${JSON.stringify(absoluteSpecifier('tests/helpers/memory-storage.js'))};
    import { createExpansionFixtureHarness } from ${JSON.stringify(absoluteSpecifier('tests/helpers/expansion-fixture-subject.js'))};

    installMemoryStorage();
    const brokenSubject = {
      id: 'broken-react',
      name: 'Broken React',
      blurb: 'Broken React subject fixture.',
      accent: '#7C3AED',
      available: true,
      initState() { return { phase: 'dashboard' }; },
      getDashboardStats() { return { pct: 0, due: 0, streak: 0, nextUp: 'Broken' }; },
      renderPracticeComponent() { throw new Error('react practice exploded'); },
      handleAction() { return false; },
    };
    const selected = ${JSON.stringify(subject)};
    const harness = selected === 'expansion'
      ? createExpansionFixtureHarness({ storage: globalThis.localStorage })
      : null;
    const controller = harness || createLocalAppController({
      subjects: selected === 'broken' ? [...SUBJECTS, brokenSubject] : SUBJECTS,
    });
    const subjectId = selected === 'expansion'
      ? 'expansion-fixture'
      : selected === 'broken'
        ? 'broken-react'
        : 'reasoning';
    controller.dispatch('open-subject', { subjectId });
    const appState = controller.store.getState();
    const context = controller.contextFor(subjectId);
    const actions = {
      dispatch(action, data) { controller.dispatch(action, data); },
      navigateHome() { controller.dispatch('navigate-home'); },
      openParentHub() { controller.store.openParentHub(); },
      openAdminHub() { controller.store.openAdminHub(); },
    };
    const html = renderToStaticMarkup(<SubjectRoute appState={appState} context={context} actions={actions} />);
    console.log(html);
  `);
}

export function renderSpellingSurfaceFixture({ phase = 'setup', pendingCommand = '' } = {}) {
  return renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { SubjectRoute } from ${JSON.stringify(absoluteSpecifier('src/surfaces/subject/SubjectRoute.jsx'))};
    import { createLocalAppController } from ${JSON.stringify(absoluteSpecifier('src/platform/app/create-local-app-controller.js'))};
    import { installMemoryStorage } from ${JSON.stringify(absoluteSpecifier('tests/helpers/memory-storage.js'))};

    installMemoryStorage();
    const controller = createLocalAppController();
    const selectedPhase = ${JSON.stringify(phase)};
    const learnerId = controller.store.getState().learners.selectedId;
    controller.dispatch('open-subject', { subjectId: 'spelling' });
    if (selectedPhase === 'session' || selectedPhase === 'summary') {
      controller.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '1' });
      controller.dispatch('spelling-start');
    }
    if (selectedPhase === 'summary') {
      while (controller.store.getState().subjectUi.spelling.phase === 'session') {
        const ui = controller.store.getState().subjectUi.spelling;
        const formData = new FormData();
        formData.set('typed', ui.session.currentCard.word.word);
        controller.dispatch('spelling-submit-form', { formData });
        if (
          controller.store.getState().subjectUi.spelling.phase === 'session'
          && controller.store.getState().subjectUi.spelling.awaitingAdvance
        ) {
          controller.dispatch('spelling-continue');
        }
      }
    }
    if (selectedPhase === 'word-bank' || selectedPhase === 'modal') {
      controller.dispatch('spelling-open-word-bank');
    }
    if (selectedPhase === 'modal') {
      controller.dispatch('spelling-word-detail-open', { slug: 'possess', value: 'drill' });
    }
    const pendingCommand = ${JSON.stringify(pendingCommand)};
    if (pendingCommand) {
      controller.store.patch((current) => ({
        transientUi: {
          ...current.transientUi,
          spellingPendingCommand: pendingCommand,
        },
      }));
    }
    const appState = controller.store.getState();
    const context = controller.contextFor('spelling');
    const actions = {
      dispatch(action, data) { controller.dispatch(action, data); },
      navigateHome() { controller.dispatch('navigate-home'); },
      openParentHub() { controller.dispatch('open-parent-hub'); },
      openAdminHub() { controller.dispatch('open-admin-hub'); },
    };
    const html = renderToStaticMarkup(<SubjectRoute appState={appState} context={context} actions={actions} />);
    console.log(html);
  `);
}

export function renderSpellingClozeFixture({ sentence, answer = '', revealAnswer = false } = {}) {
  return renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { Cloze } from ${JSON.stringify(absoluteSpecifier('src/subjects/spelling/components/SpellingCommon.jsx'))};

    const html = renderToStaticMarkup(
      <Cloze
        sentence=${JSON.stringify(sentence || '')}
        answer=${JSON.stringify(answer)}
        revealAnswer={${revealAnswer ? 'true' : 'false'}}
      />
    );
    console.log(html);
  `);
}

export function renderAppFixture({ route = 'dashboard' } = {}) {
  return renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { App } from ${JSON.stringify(absoluteSpecifier('src/app/App.jsx'))};
    import { DefaultErrorFallback } from ${JSON.stringify(absoluteSpecifier('src/platform/react/ErrorBoundary.jsx'))};
    import { createLocalAppController } from ${JSON.stringify(absoluteSpecifier('src/platform/app/create-local-app-controller.js'))};
    import { SUBJECTS } from ${JSON.stringify(absoluteSpecifier('src/platform/core/subject-registry.js'))};
    import { installMemoryStorage } from ${JSON.stringify(absoluteSpecifier('tests/helpers/memory-storage.js'))};

    installMemoryStorage();
    const controller = createLocalAppController();
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
