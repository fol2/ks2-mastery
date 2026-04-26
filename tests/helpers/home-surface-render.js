// Standalone SSR renderer for the HomeSurface. Mirrors the approach in
// `punctuation-scene-render.js`: compile once via esbuild, reuse the bundle
// for subsequent renders. HomeSurface takes a `model` + `actions` shape so
// tests can inject crafted dashboardStats + monsterSummary payloads without
// standing up the full app controller.
//
// Unlike the app-harness render path (which goes through App + runtime +
// buildHomeModel), this helper calls HomeSurface directly with a caller-
// supplied model. Phase 4 U2 tests use it to assert that the rendered CTA
// carries the right `data-subject-id` for arbitrary dashboardStats
// permutations — the harness path does not expose a knob for dashboardStats
// because `buildHomeModel` populates it from the subject modules.

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const moduleUrl = typeof import.meta.url === 'string' ? import.meta.url : null;
const rootDir = moduleUrl ? path.resolve(path.dirname(fileURLToPath(moduleUrl)), '../..') : process.cwd();
const require = createRequire(moduleUrl || path.join(rootDir, 'tests/helpers/home-surface-render.js'));

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
  rendererDir = mkdtempSync(path.join(tmpdir(), 'ks2-home-surface-render-'));
  const entryPath = path.join(rendererDir, 'entry.jsx');
  const bundlePath = path.join(rendererDir, 'entry.cjs');
  writeFileSync(entryPath, `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { HomeSurface } from ${JSON.stringify(path.join(rootDir, 'src/surfaces/home/HomeSurface.jsx'))};

    function noopActions() {
      return {
        toggleTheme() {},
        navigateHome() {},
        selectLearner() {},
        openProfileSettings() {},
        logout() {},
        openSubject() {},
        openCodex() {},
        openParentHub() {},
      };
    }

    export function renderHomeSurfaceStandalone({ model, actions = noopActions() }) {
      return renderToStaticMarkup(React.createElement(HomeSurface, { model, actions }));
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

export function renderHomeSurfaceStandalone(options) {
  return loadRenderer().renderHomeSurfaceStandalone(options);
}

export function cleanupHomeSurfaceRenderer() {
  renderer = null;
  if (rendererDir) rmSync(rendererDir, { recursive: true, force: true });
  rendererDir = null;
}
