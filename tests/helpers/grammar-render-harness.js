// Grammar render harness — bundles GrammarSessionScene via esbuild and renders
// serialised question items through React's `renderToStaticMarkup`. Returns the
// raw HTML string for each call so callers can parse with jsdom and assert on
// real DOM structure rather than serialised data objects.
//
// Pattern mirrors `tests/helpers/punctuation-scene-render.js`.

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const moduleUrl = typeof import.meta.url === 'string' ? import.meta.url : null;
const rootDir = moduleUrl
  ? path.resolve(path.dirname(fileURLToPath(moduleUrl)), '../..')
  : process.cwd();
const require = createRequire(
  moduleUrl || path.join(rootDir, 'tests/helpers/grammar-render-harness.js'),
);

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
  rendererDir = mkdtempSync(path.join(tmpdir(), 'ks2-grammar-render-harness-'));
  const entryPath = path.join(rendererDir, 'entry.jsx');
  const bundlePath = path.join(rendererDir, 'entry.cjs');
  writeFileSync(entryPath, `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { GrammarSessionScene } from ${JSON.stringify(path.join(rootDir, 'src/subjects/grammar/components/GrammarSessionScene.jsx'))};

    /**
     * Render a serialised grammar item through GrammarSessionScene and return
     * the HTML string. The \`serialisedItem\` is the output of
     * \`serialiseGrammarQuestion()\` — it carries \`promptParts\`, \`inputSpec\`,
     * \`promptText\`, etc.
     */
    export function renderGrammarItem(serialisedItem) {
      const grammar = {
        phase: 'session',
        awaitingAdvance: false,
        pendingCommand: null,
        error: null,
        feedback: null,
        aiEnrichment: null,
        session: {
          id: 'test-session',
          type: 'standard',
          answered: 0,
          targetCount: 10,
          currentIndex: 0,
          currentItem: serialisedItem,
          supportGuidance: null,
          goal: null,
        },
        prefs: {},
      };
      const actions = { dispatch() {} };
      return renderToStaticMarkup(
        React.createElement(GrammarSessionScene, { grammar, actions, runtimeReadOnly: false }),
      );
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

/**
 * Render a serialised grammar item (from `serialiseGrammarQuestion()`) through
 * the real GrammarSessionScene React component and return the resulting HTML.
 */
export function renderGrammarItem(serialisedItem) {
  return loadRenderer().renderGrammarItem(serialisedItem);
}

export function cleanupGrammarRenderHarness() {
  renderer = null;
  if (rendererDir) rmSync(rendererDir, { recursive: true, force: true });
  rendererDir = null;
}
