// Standalone SSR renderer for the PunctuationSetupScene. Used by tests that
// need to inject a production-shaped `actions` object (e.g. `dispatch` wired
// through `createSubjectCommandActionHandler` + mock subject commands + the
// real `handleRemotePunctuationAction` routing) rather than the
// app-harness's single-path dispatch.
//
// Mirrors the approach in `react-app-ssr.js` — compiles the Scene module via
// esbuild on first call and reuses the bundle for subsequent renders. No
// controller / store / subject-command-client plumbing; the caller owns all
// that.

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const moduleUrl = typeof import.meta.url === 'string' ? import.meta.url : null;
const rootDir = moduleUrl ? path.resolve(path.dirname(fileURLToPath(moduleUrl)), '../..') : process.cwd();
const require = createRequire(moduleUrl || path.join(rootDir, 'tests/helpers/punctuation-scene-render.js'));

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
  rendererDir = mkdtempSync(path.join(tmpdir(), 'ks2-punctuation-scene-render-'));
  const entryPath = path.join(rendererDir, 'entry.jsx');
  const bundlePath = path.join(rendererDir, 'entry.cjs');
  writeFileSync(entryPath, `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { PunctuationSetupScene } from ${JSON.stringify(path.join(rootDir, 'src/subjects/punctuation/components/PunctuationSetupScene.jsx'))};

    export function renderPunctuationSetupSceneStandalone(props) {
      return renderToStaticMarkup(React.createElement(PunctuationSetupScene, props));
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

export function renderPunctuationSetupSceneStandalone(props) {
  return loadRenderer().renderPunctuationSetupSceneStandalone(props);
}

export function cleanupPunctuationSceneRenderer() {
  renderer = null;
  if (rendererDir) rmSync(rendererDir, { recursive: true, force: true });
  rendererDir = null;
}
