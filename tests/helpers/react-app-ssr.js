import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const moduleUrl = typeof import.meta.url === 'string' ? import.meta.url : null;
const rootDir = moduleUrl ? path.resolve(path.dirname(fileURLToPath(moduleUrl)), '../..') : process.cwd();
const require = createRequire(moduleUrl || path.join(rootDir, 'tests/helpers/react-app-ssr.js'));

let renderer = null;
let rendererDir = null;

function nodePaths() {
  return [
    path.join(rootDir, 'node_modules'),
    ...String(process.env.NODE_PATH || '').split(path.delimiter),
  ].filter((entry) => entry && existsSync(entry));
}

function loadRenderer() {
  if (renderer) return renderer;
  rendererDir = mkdtempSync(path.join(tmpdir(), 'ks2-react-app-ssr-'));
  const entryPath = path.join(rendererDir, 'entry.jsx');
  const bundlePath = path.join(rendererDir, 'entry.cjs');
  writeFileSync(entryPath, `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { App } from ${JSON.stringify(path.join(rootDir, 'src/app/App.jsx'))};
    import { SUBJECTS } from ${JSON.stringify(path.join(rootDir, 'src/platform/core/subject-registry.js'))};

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

    function actionsFor(controller) {
      return {
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
    }

    function runtimeFor(controller) {
      function buildDashboardStats(appState, subjects) {
        const out = {};
        const learnerId = appState.learners.selectedId;
        for (const subject of subjects) {
          if (!subject.getDashboardStats) continue;
          try {
            out[subject.id] = subject.getDashboardStats(appState, controller.contextFor(subject.id));
          } catch (error) {
            controller.runtimeBoundary.capture({
              learnerId,
              subject,
              tab: 'dashboard',
              phase: 'dashboard-stats',
              methodName: 'getDashboardStats',
              error,
            });
            out[subject.id] = { pct: 0, due: 0, streak: 0, nextUp: 'Temporarily unavailable', unavailable: true };
          }
        }
        return out;
      }

      return {
        contextFor: controller.contextFor,
        buildSurfaceActions: () => actionsFor(controller),
        buildSurfaceChromeModel: chrome,
        buildHomeModel(appState) {
          const subjects = controller.contextFor().subjects || SUBJECTS;
          return {
            ...chrome(appState),
            monsterSummary: [],
            subjects,
            dashboardStats: buildDashboardStats(appState, subjects),
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
    }

    export function renderControllerApp(controller) {
      const originalError = console.error;
      console.error = (...args) => {
        const first = String(args[0] || '');
        if (first.startsWith('Warning: useLayoutEffect does nothing on the server')) return;
        originalError(...args);
      };
      try {
        return renderToStaticMarkup(React.createElement(App, {
          controller,
          runtime: runtimeFor(controller),
        }));
      } finally {
        console.error = originalError;
      }
    }
  `);
  buildSync({
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
  renderer = require(bundlePath);
  return renderer;
}

export function renderReactControllerApp(controller) {
  return loadRenderer().renderControllerApp(controller);
}

export function cleanupReactAppRenderer() {
  renderer = null;
  if (rendererDir) rmSync(rendererDir, { recursive: true, force: true });
  rendererDir = null;
}
