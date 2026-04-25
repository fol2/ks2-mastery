import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function nodePaths() {
  return [
    path.join(rootDir, 'node_modules'),
    ...String(process.env.NODE_PATH || '').split(path.delimiter),
  ].filter((entry) => entry && existsSync(entry));
}

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
      nodePaths: nodePaths(),
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

export function renderMonsterRenderFixture({
  monster,
  context = 'card',
  effects = [],
  reducedMotion = false,
  sizes,
  registrations = '',
  effectModules = [],
  effectConfigValue = undefined,
  omitEffectsProp = false,
} = {}) {
  // `registrations` is a JS source snippet that runs before render so
  // tests can register inline test-only effects (with custom render /
  // applyTransform) without us having to invent a serialisation format
  // for functions. `effectModules` is an array of { path, exports[] }
  // entries — each named export from `path` is rebound and passed to
  // registerEffect() after the registry reset.
  //
  // `effectConfigValue` (when set) wraps the render in
  // `<MonsterEffectConfigProvider value=...>` so tests can stamp bindings /
  // celebrationTunables. `omitEffectsProp=true` skips passing the `effects`
  // prop to <MonsterRender>, exercising the U4 context-resolution path.
  const moduleImports = effectModules
    .map((mod, idx) => `import * as __mod${idx} from ${JSON.stringify(absoluteSpecifier(mod.path))};`)
    .join('\n    ');
  const moduleRegistrations = effectModules
    .map((mod, idx) => mod.exports
      .map((name) => `registerEffect(__mod${idx}[${JSON.stringify(name)}]);`)
      .join('\n    '))
    .join('\n    ');
  const useProvider = effectConfigValue !== undefined;
  return renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { MonsterRender } from ${JSON.stringify(absoluteSpecifier('src/platform/game/render/MonsterRender.jsx'))};
    import { defineEffect } from ${JSON.stringify(absoluteSpecifier('src/platform/game/render/define-effect.js'))};
    import { registerEffect, resetRegistry } from ${JSON.stringify(absoluteSpecifier('src/platform/game/render/registry.js'))};
    import { resetWarnOnce, setDevMode, __setWarnSink } from ${JSON.stringify(absoluteSpecifier('src/platform/game/render/composition.js'))};
    ${useProvider ? `import { MonsterEffectConfigProvider } from ${JSON.stringify(absoluteSpecifier('src/platform/game/MonsterEffectConfigContext.jsx'))};` : ''}
    ${moduleImports}

    resetRegistry();
    ${moduleRegistrations}
    resetWarnOnce();
    setDevMode(true);
    const __warnings = [];
    __setWarnSink((key, message) => { __warnings.push({ key, message }); });

    ${registrations}

    const monster = ${JSON.stringify(monster)};
    const effects = ${JSON.stringify(effects)};
    const sizes = ${JSON.stringify(sizes != null ? sizes : null)};
    const reducedMotion = ${reducedMotion ? 'true' : 'false'};
    const omitEffectsProp = ${omitEffectsProp ? 'true' : 'false'};
    const renderProps = {
      monster,
      context: ${JSON.stringify(context)},
      reducedMotion,
      sizes,
    };
    if (!omitEffectsProp) renderProps.effects = effects;
    const __mrTree = React.createElement(MonsterRender, renderProps);
    ${useProvider
      ? `const __mrWrapped = React.createElement(MonsterEffectConfigProvider, { value: ${JSON.stringify(effectConfigValue)} }, __mrTree);`
      : 'const __mrWrapped = __mrTree;'}
    const html = renderToStaticMarkup(__mrWrapped);
    // Emit a structured payload so tests can assert on dev-warns alongside
    // the rendered HTML in a single execFile round-trip.
    process.stdout.write(JSON.stringify({ html, warnings: __warnings }));
  `);
}

export function renderCelebrationLayerFixture({
  registrations = '',
  setup = '',
  context = 'lesson',
  effectConfigValue = undefined,
} = {}) {
  // Run the full integration in-process so we can drive the store via the
  // existing API and assert on store state, ack storage, and rendered HTML
  // in one round-trip. `setup` is a JS source snippet executed after the
  // store is built; it can call playCelebration / store.pushMonsterCelebrations
  // / etc. The result is a JSON payload with everything tests need.
  //
  // `effectConfigValue`, when supplied, wraps the rendered <CelebrationLayer>
  // in <MonsterEffectConfigProvider value=...> so tests can stamp tunables.
  const useProvider = effectConfigValue !== undefined;
  return renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { CelebrationLayer } from ${JSON.stringify(absoluteSpecifier('src/platform/game/render/CelebrationLayer.jsx'))};
    import { playCelebration } from ${JSON.stringify(absoluteSpecifier('src/platform/game/render/play-celebration.js'))};
    import { defineEffect } from ${JSON.stringify(absoluteSpecifier('src/platform/game/render/define-effect.js'))};
    import { registerEffect, resetRegistry } from ${JSON.stringify(absoluteSpecifier('src/platform/game/render/registry.js'))};
    import { resetWarnOnce, setDevMode, __setWarnSink } from ${JSON.stringify(absoluteSpecifier('src/platform/game/render/composition.js'))};
    import { createStore } from ${JSON.stringify(absoluteSpecifier('src/platform/core/store.js'))};
    import { createLocalPlatformRepositories } from ${JSON.stringify(absoluteSpecifier('src/platform/core/repositories/index.js'))};
    import { SUBJECTS } from ${JSON.stringify(absoluteSpecifier('src/platform/core/subject-registry.js'))};
    import { installMemoryStorage } from ${JSON.stringify(absoluteSpecifier('tests/helpers/memory-storage.js'))};
    import { acknowledgedMonsterCelebrationIds } from ${JSON.stringify(absoluteSpecifier('src/platform/game/monster-celebration-acks.js'))};
    ${useProvider ? `import { MonsterEffectConfigProvider } from ${JSON.stringify(absoluteSpecifier('src/platform/game/MonsterEffectConfigContext.jsx'))};` : ''}

    installMemoryStorage();
    resetRegistry();
    resetWarnOnce();
    setDevMode(true);
    const __warnings = [];
    __setWarnSink((key, message) => { __warnings.push({ key, message }); });

    const __repositories = createLocalPlatformRepositories({ storage: globalThis.localStorage });
    const store = createStore(SUBJECTS, { repositories: __repositories });

    ${registrations}

    ${setup}

    function snapshot() {
      const state = store.getState();
      const learnerId = state.learners.selectedId;
      return {
        queue: state.monsterCelebrations.queue,
        pending: state.monsterCelebrations.pending,
        learnerId,
        ackedIds: [...acknowledgedMonsterCelebrationIds(learnerId)],
      };
    }

    const __before = snapshot();
    const __layerNode = React.createElement(CelebrationLayer, { store, context: ${JSON.stringify(context)} });
    ${useProvider
      ? `const __layerWrapped = React.createElement(MonsterEffectConfigProvider, { value: ${JSON.stringify(effectConfigValue)} }, __layerNode);`
      : 'const __layerWrapped = __layerNode;'}
    const html = renderToStaticMarkup(__layerWrapped);
    const __after = snapshot();

    process.stdout.write(JSON.stringify({
      html,
      warnings: __warnings,
      before: __before,
      after: __after,
    }));
  `);
}

export function renderMonsterVisualRendererFixture() {
  return renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { MonsterVisualConfigProvider } from ${JSON.stringify(absoluteSpecifier('src/platform/game/MonsterVisualConfigContext.jsx'))};
    import { BUNDLED_MONSTER_VISUAL_CONFIG } from ${JSON.stringify(absoluteSpecifier('src/platform/game/monster-visual-config.js'))};
    import { CodexCard } from ${JSON.stringify(absoluteSpecifier('src/surfaces/home/CodexCard.jsx'))};
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
          <CodexCreatureVisual
            entry={{
              id: 'phaeton',
              branch: 'b1',
              stage: 4,
              displayState: 'monster',
              imageAlt: 'Phaeton',
              img: '',
              srcSet: '',
            }}
            context="feature"
            sizes="(max-width: 820px) 76vw, 700px"
          />
          <CodexCard
            entry={{
              id: 'glimmerbug',
              subjectId: 'spelling',
              name: 'Mega Lanternwing',
              speciesName: 'Glimmerbug',
              blurb: 'Review card fixture.',
              caught: true,
              stage: 4,
              mastered: 100,
              progressPct: 100,
              colour: '#B43CD9',
              soft: '#F8E7F1',
              branch: 'b1',
              displayState: 'monster',
              imageAlt: 'Mega Lanternwing',
              stageLabel: 'Stage 4',
              secureLabel: '100 secure words',
              wordBand: 'Year 5-6 spellings',
            }}
            onPractice={() => {}}
            onPreview={() => {}}
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

export function renderMonsterEffectCatalogPanelFixture({ canManage = true } = {}) {
  // SSR fixture for the U6 catalog panel. We feed it the bundled effect
  // config as the draft + published state so the listing covers all eight
  // bundled-default kinds. The `canManage` flag mirrors the role-based gate
  // the visual panel uses (admin vs operations read-only).
  return renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { MonsterEffectCatalogPanel } from ${JSON.stringify(absoluteSpecifier('src/surfaces/hubs/MonsterEffectCatalogPanel.jsx'))};
    import { bundledEffectConfig } from ${JSON.stringify(absoluteSpecifier('src/platform/game/render/effect-config-defaults.js'))};

    const draft = bundledEffectConfig();
    const published = bundledEffectConfig();
    const canManage = ${canManage ? 'true' : 'false'};
    const onChange = () => {};
    const html = renderToStaticMarkup(
      <MonsterEffectCatalogPanel
        draft={draft}
        published={published}
        canManage={canManage}
        onDraftChange={onChange}
      />
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
      learnerOverview: { secureWords: 8, dueWords: 2, troubleWords: 1, accuracyPercent: 82, secureGrammarConcepts: 2, dueGrammarConcepts: 1, weakGrammarConcepts: 1, grammarAccuracyPercent: 67, securePunctuationUnits: 1, duePunctuationItems: 1, weakPunctuationItems: 1, punctuationAccuracyPercent: 50 },
      dueWork: [{ label: 'Review due spellings', detail: 'Two words are ready.' }, { subjectId: 'grammar', label: 'Repair Grammar misconceptions', detail: 'Adverbials need another pass.' }, { subjectId: 'punctuation', label: 'Run a Punctuation weak spots drill next', detail: 'Speech - Insert punctuation' }],
      recentSessions: [{ id: 'session-1', label: 'Smart Review', status: 'completed', sessionKind: 'spelling', mistakeCount: 1, updatedAt: Date.UTC(2026, 3, 22, 12, 0), headline: 'Good recall' }, { id: 'punctuation-session-1', subjectId: 'punctuation', label: 'Guided punctuation', status: 'completed', sessionKind: 'guided', mistakeCount: 1, updatedAt: Date.UTC(2026, 3, 22, 13, 0), headline: '1/2' }],
      strengths: [{ label: 'Suffixes', detail: 'Secure recall', secureCount: 4, troubleCount: 0 }],
      weaknesses: [{ label: 'Possession', detail: 'Needs another pass', secureCount: 1, troubleCount: 1 }],
      misconceptionPatterns: [{ label: 'Double consonant', source: 'event log', count: 2, lastSeenAt: Date.UTC(2026, 3, 22, 12, 0) }, { subjectId: 'punctuation', label: 'Speech Quote Missing pattern', source: 'punctuation-attempts', count: 1, lastSeenAt: Date.UTC(2026, 3, 22, 13, 0) }],
      progressSnapshots: [
        { subjectId: 'spelling', trackedWords: 213, totalPublishedWords: 235 },
        { subjectId: 'grammar', trackedConcepts: 3, totalConcepts: 18, securedConcepts: 2, dueConcepts: 1, weakConcepts: 1 },
        { subjectId: 'punctuation', totalRewardUnits: 14, trackedRewardUnits: 1, securedRewardUnits: 1, dueItems: 1, weakItems: 1, attempts: 2, accuracyPercent: 50 },
      ],
      grammarEvidence: {
        subjectId: 'grammar',
        hasEvidence: true,
        progressSnapshot: { subjectId: 'grammar', trackedConcepts: 3, totalConcepts: 18, securedConcepts: 2, dueConcepts: 1, weakConcepts: 1 },
        conceptStatus: [
          { id: 'adverbials', name: 'Adverbials', domain: 'Clauses and phrases', status: 'weak', attempts: 3, correct: 1, wrong: 2, accuracyPercent: 33 },
        ],
        dueConcepts: [{ id: 'relative-clauses', name: 'Relative clauses', domain: 'Clauses and phrases', status: 'due', attempts: 2, correct: 1, wrong: 1, accuracyPercent: 50 }],
        weakConcepts: [{ id: 'adverbials', name: 'Adverbials', domain: 'Clauses and phrases', status: 'weak', attempts: 3, correct: 1, wrong: 2, accuracyPercent: 33 }],
        questionTypeSummary: [{ id: 'choose', label: 'Choose the correct sentence', status: 'weak', attempts: 4, correct: 1, wrong: 3, accuracyPercent: 25 }],
        misconceptionPatterns: [{ id: 'fronted_adverbial_confusion', label: 'Fronted Adverbial pattern', count: 2, lastSeenAt: Date.UTC(2026, 3, 22, 12, 0) }],
        recentActivity: [{ itemId: 'grammar-item-1', templateId: 'fronted-adverbial-choice', label: 'Choose the correct sentence', correct: false, score: 0, maxScore: 1, createdAt: Date.UTC(2026, 3, 22, 12, 0) }],
        recentSessions: [],
        parentSummaryDraft: {
          title: 'Parent summary draft',
          body: 'Ava should revisit fronted adverbials before the next mixed review.',
          nextSteps: ['Practise two fronted adverbial choices'],
          generatedAt: Date.UTC(2026, 3, 22, 12, 0),
        },
      },
      punctuationEvidence: {
        subjectId: 'punctuation',
        hasEvidence: true,
        progressSnapshot: { subjectId: 'punctuation', totalRewardUnits: 14, trackedRewardUnits: 1, securedRewardUnits: 1, dueItems: 1, weakItems: 1, attempts: 2, accuracyPercent: 50 },
        bySessionMode: [{ id: 'guided', label: 'Guided learn', attempts: 1, correct: 0, wrong: 1, accuracy: 0 }],
        byItemMode: [{ id: 'insert', label: 'Insert punctuation', attempts: 1, correct: 0, wrong: 1, accuracy: 0 }],
        weakestFacets: [{ id: 'speech::insert', label: 'Speech - Insert punctuation', status: 'weak', attempts: 1, correct: 0, wrong: 1, accuracy: 0 }],
        recentMistakes: [{ itemId: 'sp_insert_question', label: 'Inverted commas and speech punctuation - Insert punctuation', sessionMode: 'guided', sessionModeLabel: 'Guided learn', createdAt: Date.UTC(2026, 3, 22, 13, 0), supportKind: 'guided' }],
        misconceptionPatterns: [{ id: 'speech.quote_missing', label: 'Speech Quote Missing pattern', count: 1, lastSeenAt: Date.UTC(2026, 3, 22, 13, 0) }],
        recentSessions: [],
        dailyGoal: { targetAttempts: 4, attemptsToday: 1, correctToday: 0, completed: false, progressPercent: 25 },
        streak: { currentDays: 1, bestDays: 1, activeDays: 1 },
        releaseDiagnostics: { releaseId: 'punctuation-r4-full-14-skill-structure', trackedRewardUnitCount: 1, sessionCount: 1, weakPatternCount: 1, productionExposureStatus: 'enabled' },
      },
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
        selectedDiagnostics: {
          learnerId: 'learner-a',
          learnerName: 'Ava',
          overview: { secureWords: 8, dueWords: 2, troubleWords: 1, secureGrammarConcepts: 2, dueGrammarConcepts: 1, weakGrammarConcepts: 1, securePunctuationUnits: 1, duePunctuationItems: 1, weakPunctuationItems: 1 },
          currentFocus: { detail: 'Review due spellings' },
          grammarEvidence: {
            progressSnapshot: { securedConcepts: 2, dueConcepts: 1, weakConcepts: 1 },
            questionTypeSummary: [{ id: 'choose', label: 'Choose the correct sentence' }],
          },
          punctuationEvidence: {
            progressSnapshot: { securedRewardUnits: 1, dueItems: 1, weakItems: 1 },
            weakestFacets: [{ id: 'speech::insert', label: 'Speech - Insert punctuation' }],
            releaseDiagnostics: { releaseId: 'punctuation-r4-full-14-skill-structure', trackedRewardUnitCount: 1, sessionCount: 1, weakPatternCount: 1, productionExposureStatus: 'enabled' },
          },
        },
        accessibleLearners: [{
          learnerId: 'learner-a',
          learnerName: 'Ava',
          yearGroup: 'Y5',
          membershipRoleLabel: 'Viewer',
          accessModeLabel: 'Read-only learner',
          writable: false,
          overview: { dueWords: 2, dueGrammarConcepts: 1, weakGrammarConcepts: 1, duePunctuationItems: 1, weakPunctuationItems: 1 },
          grammarEvidence: { progressSnapshot: { dueConcepts: 1, weakConcepts: 1 } },
          punctuationEvidence: { progressSnapshot: { dueItems: 1, weakItems: 1 } },
          currentFocus: { label: 'Due spellings' },
        }],
        punctuationReleaseDiagnostics: { releaseId: 'punctuation-r4-full-14-skill-structure', trackedRewardUnitCount: 1, sessionCount: 1, weakPatternCount: 1, productionExposureStatus: 'enabled' },
        entryPoints: [{ action: 'open-subject', label: 'Open Spelling', subjectId: 'spelling' }, { action: 'open-subject', label: 'Open Punctuation analytics', subjectId: 'punctuation', tab: 'analytics' }],
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
