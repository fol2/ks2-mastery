// U7 (ui-refactor-p3): HomeHeroScene contract tests.
//
// Validates:
//   1. Children (subject cards) rendered unchanged inside the scene wrapper
//   2. One primary action CTA rendered with data-action
//   3. No Hero/Camp/Coin copy introduced (regex assertion)
//   4. todayFocus optional — no crash when absent
//   5. creatureHighlights optional — no crash when absent
//   6. Forward-compat: heroQuest prop accepted without error
//   7. data-action selectors preserved through HomeSurface adoption
//
// Pattern mirrors tests/ui-button-primitive.test.js — esbuild bundle +
// renderToStaticMarkup probe in a child process.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const componentPath = path.join(rootDir, 'src/platform/ui/HomeHeroScene.jsx');

function nodePaths() {
  return [
    path.join(rootDir, 'node_modules'),
    ...String(process.env.NODE_PATH || '').split(path.delimiter),
  ].filter((entry) => entry && existsSync(entry));
}

function normalise(value) {
  return String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

async function renderFixture(entrySource) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-home-hero-scene-'));
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
    const output = execFileSync(process.execPath, [bundlePath], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return normalise(output);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

function abs(rel) {
  return JSON.stringify(path.join(rootDir, rel));
}

// ---------------------------------------------------------------
// 1. Children rendered unchanged inside the scene wrapper
// ---------------------------------------------------------------

test('HomeHeroScene renders children (subject cards) unchanged inside the scene wrapper', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { HomeHeroScene } from ${abs('src/platform/ui/HomeHeroScene.jsx')};
    const html = renderToStaticMarkup(
      <HomeHeroScene
        learner={{ name: 'Alice', id: 'a1' }}
        readySubjects={[{ id: 'spelling', name: 'Spelling' }]}
        primaryAction={{ label: 'Start Spelling', dataAction: 'open-subject', onClick: () => {} }}
      >
        <div className="subject-grid" data-action="open-subject" data-subject-id="spelling">
          <span>Spelling Card</span>
        </div>
      </HomeHeroScene>
    );
    console.log(html);
  `);
  assert.match(html, /class="home-hero-scene"/, 'scene wrapper must render');
  assert.match(html, /data-scene="home-hero"/, 'data-scene attribute preserved');
  assert.match(html, /class="subject-grid"/, 'children subject-grid must render inside wrapper');
  assert.match(html, /data-subject-id="spelling"/, 'data-subject-id preserved on children');
  assert.match(html, /Spelling Card/, 'child content preserved');
});

// ---------------------------------------------------------------
// 2. One primary action CTA rendered with data-action
// ---------------------------------------------------------------

test('HomeHeroScene renders one primary action button with correct data-action', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { HomeHeroScene } from ${abs('src/platform/ui/HomeHeroScene.jsx')};
    const html = renderToStaticMarkup(
      <HomeHeroScene
        learner={{ name: 'Bob', id: 'b1' }}
        readySubjects={[]}
        primaryAction={{ label: 'Continue learning', dataAction: 'open-subject', onClick: () => {} }}
      >
        <div>cards</div>
      </HomeHeroScene>
    );
    console.log(html);
  `);
  assert.match(html, /data-action="open-subject"/, 'primary action data-action attribute rendered');
  assert.match(html, /Continue learning/, 'primary action label rendered');
});

// ---------------------------------------------------------------
// 3. No Hero/Camp/Coin copy introduced
// ---------------------------------------------------------------

test('HomeHeroScene does not introduce Hero/Camp/Coin economy copy', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { HomeHeroScene } from ${abs('src/platform/ui/HomeHeroScene.jsx')};
    const html = renderToStaticMarkup(
      <HomeHeroScene
        learner={{ name: 'Cai', id: 'c1' }}
        readySubjects={[{ id: 'grammar', name: 'Grammar' }]}
        todayFocus="Grammar practice"
        creatureHighlights={['Sparky', 'Noodle']}
        primaryAction={{ label: 'Start Grammar', dataAction: 'open-subject', onClick: () => {} }}
        heroQuest={{ id: 'q1', status: 'active' }}
      >
        <div>subject cards</div>
      </HomeHeroScene>
    );
    console.log(html);
  `);
  // Forbidden economy copy patterns
  assert.doesNotMatch(html, /Hero Coin/i, 'must not introduce Hero Coin copy');
  assert.doesNotMatch(html, /Hero Camp/i, 'must not introduce Hero Camp copy');
  assert.doesNotMatch(html, /\bcoin(?:s)?\b/i, 'must not introduce coin copy');
});

// ---------------------------------------------------------------
// 4. todayFocus optional — no crash when absent
// ---------------------------------------------------------------

test('HomeHeroScene renders without crash when todayFocus is absent', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { HomeHeroScene } from ${abs('src/platform/ui/HomeHeroScene.jsx')};
    const html = renderToStaticMarkup(
      <HomeHeroScene
        learner={{ name: 'Dee', id: 'd1' }}
        readySubjects={[]}
        primaryAction={{ label: 'Go', dataAction: 'open-subject', onClick: () => {} }}
      >
        <div>cards</div>
      </HomeHeroScene>
    );
    console.log(html);
  `);
  assert.match(html, /class="home-hero-scene"/, 'renders without todayFocus');
  assert.doesNotMatch(html, /home-hero-scene-focus/, 'focus block not rendered when prop absent');
});

// ---------------------------------------------------------------
// 5. creatureHighlights optional — no crash when absent
// ---------------------------------------------------------------

test('HomeHeroScene renders without crash when creatureHighlights is absent', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { HomeHeroScene } from ${abs('src/platform/ui/HomeHeroScene.jsx')};
    const html = renderToStaticMarkup(
      <HomeHeroScene
        learner={{ name: 'Eve', id: 'e1' }}
        readySubjects={[]}
        primaryAction={{ label: 'Go', dataAction: 'open-subject', onClick: () => {} }}
      >
        <div>cards</div>
      </HomeHeroScene>
    );
    console.log(html);
  `);
  assert.match(html, /class="home-hero-scene"/, 'renders without creatureHighlights');
  assert.doesNotMatch(html, /home-hero-scene-creatures/, 'creatures block not rendered when prop absent');
});

// ---------------------------------------------------------------
// 6. Forward-compat: heroQuest prop accepted without error
// ---------------------------------------------------------------

test('HomeHeroScene accepts heroQuest prop without error (forward-compat)', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { HomeHeroScene } from ${abs('src/platform/ui/HomeHeroScene.jsx')};
    const html = renderToStaticMarkup(
      <HomeHeroScene
        learner={{ name: 'Fay', id: 'f1' }}
        readySubjects={[]}
        primaryAction={{ label: 'Go', dataAction: 'open-subject', onClick: () => {} }}
        heroQuest={{ id: 'quest-99', status: 'active', taskId: 't1' }}
      >
        <div>cards</div>
      </HomeHeroScene>
    );
    console.log(html);
  `);
  assert.match(html, /class="home-hero-scene"/, 'renders with heroQuest without error');
});

// ---------------------------------------------------------------
// 7. data-action selectors preserved through HomeSurface adoption
// ---------------------------------------------------------------

test('HomeSurface wraps subject cards inside HomeHeroScene while preserving data-action selectors', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { HomeSurface } from ${abs('src/surfaces/home/HomeSurface.jsx')};
    const model = {
      learner: { name: 'Test', id: 'learner-1' },
      subjects: [
        { id: 'spelling', name: 'Spelling', blurb: 'Practice words', status: 'live', progress: 0.5 },
      ],
      dashboardStats: {},
      monsterSummary: [],
      theme: 'light',
      now: new Date(2026, 3, 30, 10, 0),
    };
    const actions = {
      toggleTheme() {},
      navigateHome() {},
      selectLearner() {},
      openProfileSettings() {},
      logout() {},
      openSubject() {},
      openCodex() {},
      openParentHub() {},
      openAdminHub() {},
      refreshHeroQuest() {},
    };
    const html = renderToStaticMarkup(React.createElement(HomeSurface, { model, actions }));
    console.log(html);
  `);
  assert.match(html, /data-scene="home-hero"/, 'HomeHeroScene wrapper present in HomeSurface output');
  assert.match(html, /data-action="open-subject"/, 'data-action="open-subject" preserved');
  assert.match(html, /data-subject-id="spelling"/, 'data-subject-id preserved on subject card');
  assert.match(html, /class="subject-grid"/, 'subject-grid class preserved');
});

// ---------------------------------------------------------------
// 8. Source: no Hero/Camp/Coin copy in HomeHeroScene.jsx
// ---------------------------------------------------------------

test('HomeHeroScene.jsx source does not contain Hero/Camp/Coin economy copy in executable code', () => {
  const source = readFileSync(componentPath, 'utf8');
  // Strip block + line comments so documentation describing the constraint
  // does not trigger the regex. Mirrors the pattern in ui-button-primitive.test.js.
  const codeOnly = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(codeOnly, /Hero Coin/i, 'executable code must not contain Hero Coin copy');
  assert.doesNotMatch(codeOnly, /Hero Camp/i, 'executable code must not contain Hero Camp copy');
  assert.doesNotMatch(codeOnly, /\bcoin(?:s)?\b/i, 'executable code must not contain coin copy');
});
