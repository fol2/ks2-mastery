// UI Refactor P4 U3: subject session adapters must feed the shared
// SessionHUD safely, including loading / zero-total states.

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

async function renderFixture(entrySource) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-session-hud-adapter-'));
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
    }).replace(/\n+$/, '');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

function abs(relativePath) {
  return JSON.stringify(path.join(rootDir, relativePath));
}

function assertSafeHud(html, subjectId) {
  assert.match(html, new RegExp(`data-session-hud[^>]*data-subject="${subjectId}"`));
  assert.match(html, /Getting ready/);
  assert.doesNotMatch(html, /NaN/);
  assert.doesNotMatch(html, /-\d+\s+left/);
  assert.doesNotMatch(html, /You have answered\s+\d+\s+of\s+0/);
}

test('Spelling session HUD adapter handles a zero-total loading session', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { SpellingSessionScene } from ${abs('src/subjects/spelling/components/SpellingSessionScene.jsx')};

    const service = { getPrefs() { return { showCloze: false }; } };
    const ui = {
      awaitingAdvance: false,
      pendingCommand: '',
      feedback: null,
      session: {
        id: 'spelling-zero',
        type: 'smart',
        mode: 'smart',
        phase: 'question',
        currentSlug: 'test',
        promptCount: 0,
        progress: { total: 0, done: 0 },
        currentCard: {
          word: { word: 'test', slug: 'test' },
          prompt: { cloze: 'The answer is ______.' },
        },
      },
    };
    const actions = { dispatch() {} };
    console.log(renderToStaticMarkup(
      <SpellingSessionScene
        learner={{ id: 'learner-a' }}
        service={service}
        ui={ui}
        accent="var(--brand)"
        actions={actions}
      />,
    ));
  `);
  assertSafeHud(html, 'spelling');
  assert.doesNotMatch(html, /class="path-count"/);
});

test('Grammar session HUD adapter handles a zero-target loading session', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { GrammarSessionScene } from ${abs('src/subjects/grammar/components/GrammarSessionScene.jsx')};

    const grammar = {
      phase: 'session',
      awaitingAdvance: false,
      pendingCommand: null,
      error: null,
      feedback: null,
      aiEnrichment: null,
      prefs: {},
      session: {
        id: 'grammar-zero',
        type: 'standard',
        mode: 'standard',
        answered: 0,
        targetCount: 0,
        currentIndex: 0,
        currentItem: {
          promptText: 'Loading the next Grammar item...',
          inputSpec: { type: 'text' },
        },
      },
    };
    const actions = { dispatch() {} };
    console.log(renderToStaticMarkup(
      <GrammarSessionScene grammar={grammar} actions={actions} runtimeReadOnly={false} />,
    ));
  `);
  assertSafeHud(html, 'grammar');
  assert.match(html, /class="grammar-progress-dots" aria-hidden="true"/);
  assert.doesNotMatch(html, /class="grammar-progress"/);
});

test('Punctuation session HUD adapter handles a zero-length loading session', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { PunctuationSessionScene } from ${abs('src/subjects/punctuation/components/PunctuationSessionScene.jsx')};

    const ui = {
      phase: 'active-item',
      error: null,
      pendingCommand: null,
      session: {
        id: 'punctuation-zero',
        mode: 'smart',
        length: 0,
        answeredCount: 0,
        currentItem: {
          id: 'insert-zero',
          mode: 'insert',
          inputKind: 'text',
          prompt: 'Loading the next Punctuation item...',
          stem: 'the boat reached the harbour',
        },
      },
    };
    const actions = { dispatch() {} };
    console.log(renderToStaticMarkup(
      <PunctuationSessionScene ui={ui} actions={actions} />,
    ));
  `);
  assertSafeHud(html, 'punctuation');
  assert.doesNotMatch(html, /Question\s+\d+\s+of\s+0/);
});
