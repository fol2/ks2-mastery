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
//
// U1 (Phase 4) also exposes `renderPrimaryModeCardElement(props)` — returns
// the raw React element for a single `PrimaryModeCard`. Tests can read
// `element.props.onClick` and invoke it directly to exercise the real click
// closure without needing jsdom. This is the coverage gap the Phase 3 SSR
// harness had: `renderToStaticMarkup` discards event-handler props, so a
// regression in the click target (e.g. dispatching `punctuation-set-mode`
// instead of `punctuation-start`) was invisible.

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
    import { PrimaryModeCard, PunctuationSetupScene } from ${JSON.stringify(path.join(rootDir, 'src/subjects/punctuation/components/PunctuationSetupScene.jsx'))};
    import { PunctuationSummaryScene } from ${JSON.stringify(path.join(rootDir, 'src/subjects/punctuation/components/PunctuationSummaryScene.jsx'))};
    import { PunctuationMapScene } from ${JSON.stringify(path.join(rootDir, 'src/subjects/punctuation/components/PunctuationMapScene.jsx'))};
    import { PunctuationSessionScene } from ${JSON.stringify(path.join(rootDir, 'src/subjects/punctuation/components/PunctuationSessionScene.jsx'))};

    export function renderPunctuationSetupSceneStandalone(props) {
      return renderToStaticMarkup(React.createElement(PunctuationSetupScene, props));
    }

    // U6 review follow-on (FINDING B): standalone renderers for the scenes
    // that carry a Back / close affordance. Lets tests pass \`ui={null}\` so
    // \`composeIsNavigationDisabled\` flips \`true\` — the only code path
    // under which the navigation helper hard-disables — without routing
    // through the app-harness (which always seeds a non-null ui).
    export function renderPunctuationSummarySceneStandalone(props) {
      return renderToStaticMarkup(React.createElement(PunctuationSummaryScene, props));
    }

    export function renderPunctuationMapSceneStandalone(props) {
      return renderToStaticMarkup(React.createElement(PunctuationMapScene, props));
    }

    // U6 review follow-on (FINDING C): standalone renderer for the session
    // scene so the feedback-phase regression guard can assert that no Back
    // affordance lives inside the feedback-phase JSX — mirroring the
    // scope that R7 names ("the navigation guard applies to every scene's
    // Back affordance — Map back button, Skill Detail close, Feedback
    // back"). If a future unit adds one, the guard fails as a reminder to
    // thread \`composeIsNavigationDisabled\` through it.
    export function renderPunctuationSessionSceneStandalone(props) {
      return renderToStaticMarkup(React.createElement(PunctuationSessionScene, props));
    }

    // Returns the raw React element for PrimaryModeCard so tests can
    // invoke the real onClick closure. PrimaryModeCard is a pure
    // function component (no hooks), so calling it directly is
    // equivalent to what React would do on mount — but we get the
    // element back with its onClick prop intact.
    export function renderPrimaryModeCardElement(props) {
      return PrimaryModeCard(props);
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

export function renderPunctuationSummarySceneStandalone(props) {
  return loadRenderer().renderPunctuationSummarySceneStandalone(props);
}

export function renderPunctuationMapSceneStandalone(props) {
  return loadRenderer().renderPunctuationMapSceneStandalone(props);
}

export function renderPunctuationSessionSceneStandalone(props) {
  return loadRenderer().renderPunctuationSessionSceneStandalone(props);
}

export function renderPrimaryModeCardElement(props) {
  return loadRenderer().renderPrimaryModeCardElement(props);
}

export function cleanupPunctuationSceneRenderer() {
  renderer = null;
  if (rendererDir) rmSync(rendererDir, { recursive: true, force: true });
  rendererDir = null;
}
