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
      toggleTheme() {},
      selectLearner(value) { controller.dispatch('learner-select', { value }); },
      navigateHome() { controller.dispatch('navigate-home'); },
      openProfileSettings() { controller.dispatch('open-profile-settings'); },
      openSubject(subjectId) { controller.dispatch('open-subject', { subjectId }); },
      openCodex() { controller.dispatch('open-codex'); },
      openParentHub() { controller.dispatch('open-parent-hub'); },
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
