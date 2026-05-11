import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function source(path) {
  return readFileSync(path, 'utf8');
}

function nodePaths() {
  return [
    path.join(rootDir, 'node_modules'),
    ...String(process.env.NODE_PATH || '').split(path.delimiter),
  ].filter((entry) => entry && existsSync(entry));
}

function absoluteSpecifier(relativePath) {
  return JSON.stringify(path.join(rootDir, relativePath));
}

async function renderFixture(entrySource) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-reading-interface-'));
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

test('reading surface implements delegated full-list session UI inside the app frame', () => {
  const ui = source('src/subjects/reading/components/ReadingPracticeSurface.jsx');
  assert.match(ui, /function QuestionListPanel/);
  assert.match(ui, /session\.viewMode === 'list'/);
  assert.match(ui, /reading-save-section/);
  assert.match(ui, /data-reading-active-form="true"/);
});

test('reading landing uses the shared subject setup shell used by mature subjects', () => {
  const ui = source('src/subjects/reading/components/ReadingPracticeSurface.jsx');
  assert.match(ui, /PracticeStage subjectId="reading"/);
  assert.match(ui, /SubjectThemeScope subjectId="reading" className="setup-grid reading-setup-grid"/);
  assert.match(ui, /className=\{setupClasses\.join\(' '\)\}/);
  assert.match(ui, /HeroBackdrop url=\{heroBg\}/);
  assert.match(ui, /SubjectCompanionPanel/);
  assert.match(ui, /SetupMorePractice/);
  assert.match(ui, /dataAction="reading-start"/);
  assert.doesNotMatch(ui, /<form onSubmit=\{start\} className="setup-form reading-setup-form"/);
});

test('reading marking controls use mode-specific labels instead of a generic finish action', () => {
  const ui = source('src/subjects/reading/components/ReadingPracticeSurface.jsx');
  assert.match(ui, /function markActionLabel/);
  assert.match(ui, /Mark now/);
  assert.match(ui, /Mark this section/);
  assert.match(ui, /Mark whole paper/);
  assert.match(ui, /markActionHint/);
  assert.doesNotMatch(ui, /Finish now/);
});



test('reading one-question delayed-feedback surface has one save-and-next path', () => {
  const ui = source('src/subjects/reading/components/ReadingPracticeSurface.jsx');
  const saveAndNextCount = (ui.match(/Save and next/g) || []).length;
  assert.equal(saveAndNextCount, 1);
  assert.match(ui, /showDraftNextButton/);
  assert.match(ui, /Save draft and next/);
  assert.match(ui, /function primarySubmitLabel/);
  assert.match(ui, /Save answer/);
});

test('reading command actions serialise section responses and preserve stale guards', () => {
  const commands = source('src/subjects/reading/command-actions.js');
  assert.match(commands, /function responsesFromFormData/);
  assert.match(commands, /function hasSectionFormFields/);
  assert.match(commands, /expectedSectionIndex/);
  assert.match(commands, /'reading-save-section'/);
  assert.match(commands, /command: 'mark-section'/);
});

test('reading read model exposes section question lists without pre-attempt feedback fields', () => {
  const models = source('worker/src/subjects/reading/read-models.js');
  assert.match(models, /function sectionQuestionList/);
  assert.match(models, /includeFeedback: Boolean\(result\)/);
  assert.match(models, /questions: sectionQuestionList\(session, section\)/);
});

test('reading list-mode surface renders prefixed full-section form controls without feedback leakage', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { createServerReadingEngine } from ${absoluteSpecifier('worker/src/subjects/reading/engine.js')};
    import { buildReadingReadModel } from ${absoluteSpecifier('worker/src/subjects/reading/read-models.js')};
    import { ReadingPracticeSurface } from ${absoluteSpecifier('src/subjects/reading/components/ReadingPracticeSurface.jsx')};

    const engine = createServerReadingEngine({ now: () => 1000, random: () => 0 });
    const started = engine.apply({
      learnerId: 'l1',
      command: 'start-session',
      payload: { mode: 'guided', viewMode: 'list' },
      requestId: 'r1',
    });
    const subjectReadModel = buildReadingReadModel({
      learnerId: 'l1',
      state: started.state,
      data: started.data,
      stats: started.stats,
      analytics: started.analytics,
    });
    const appState = { learners: { selectedId: 'l1' }, subjectUi: { reading: subjectReadModel } };
    console.log(renderToStaticMarkup(<ReadingPracticeSurface appState={appState} actions={{ dispatch() {} }} />));
  `);

  assert.match(html, /Answer this text/);
  assert.match(html, /data-reading-active-form="true"/);
  assert.match(html, /name="q_[^"]+_answer"/);
  assert.match(html, /Mark this section/);
  assert.doesNotMatch(html, /Model answer/);
});

test('reading setup renders aligned landing landmarks and one primary start action', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { createInitialReadingState } from ${absoluteSpecifier('src/subjects/reading/metadata.js')};
    import { ReadingPracticeSurface } from ${absoluteSpecifier('src/subjects/reading/components/ReadingPracticeSurface.jsx')};

    const appState = {
      learners: {
        selectedId: 'l1',
        byId: { l1: { id: 'l1', name: 'Maya' } },
      },
      subjectUi: { reading: createInitialReadingState() },
    };
    console.log(renderToStaticMarkup(<ReadingPracticeSurface appState={appState} actions={{ dispatch() {} }} repositories={null} />));
  `);

  assert.match(html, /class="subject-theme setup-grid reading-setup-grid"/);
  assert.match(html, /Moonleaf Archive/);
  assert.match(html, /class="reading-primary-mode mode-card selected"/);
  assert.match(html, /data-action="reading-start"/);
  assert.match(html, /data-testid="companion-panel"/);
  assert.match(html, /More Reading practice/);
  assert.doesNotMatch(html, /class="card border-top reading-accent-card"/);
});

test('reading setup keeps selected primary mode semantics while pending', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { createInitialReadingState } from ${absoluteSpecifier('src/subjects/reading/metadata.js')};
    import { ReadingPracticeSurface } from ${absoluteSpecifier('src/subjects/reading/components/ReadingPracticeSurface.jsx')};

    const reading = { ...createInitialReadingState(), pendingCommand: 'save-prefs' };
    const appState = {
      learners: {
        selectedId: 'l1',
        byId: { l1: { id: 'l1', name: 'Maya' } },
      },
      subjectUi: { reading },
    };
    console.log(renderToStaticMarkup(<ReadingPracticeSurface appState={appState} actions={{ dispatch() {} }} repositories={null} />));
  `);

  assert.match(html, /class="reading-primary-mode mode-card selected is-disabled"[^>]*aria-pressed="true"/);
  assert.match(html, /aria-disabled="true"/);
});

test('reading setup degrades when monster-codex repository read fails', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { createInitialReadingState } from ${absoluteSpecifier('src/subjects/reading/metadata.js')};
    import { ReadingPracticeSurface } from ${absoluteSpecifier('src/subjects/reading/components/ReadingPracticeSurface.jsx')};

    const appState = {
      learners: {
        selectedId: 'l1',
        byId: { l1: { id: 'l1', name: 'Maya' } },
      },
      subjectUi: { reading: createInitialReadingState() },
    };
    const repositories = { gameState: { read() { throw new Error('poisoned game state'); } } };
    console.log(renderToStaticMarkup(<ReadingPracticeSurface appState={appState} actions={{ dispatch() {} }} repositories={repositories} />));
  `);

  assert.match(html, /Reading missions/);
  assert.match(html, /Start practising to discover your Reading creatures/);
});

test('reading setup renders progressed monsters through existing visual asset aliases', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { createInitialReadingState } from ${absoluteSpecifier('src/subjects/reading/metadata.js')};
    import { readingMasteryKey, READING_REWARD_RELEASE_ID } from ${absoluteSpecifier('src/platform/game/mastery/reading.js')};
    import { ReadingPracticeSurface } from ${absoluteSpecifier('src/subjects/reading/components/ReadingPracticeSurface.jsx')};

    const appState = {
      learners: {
        selectedId: 'l1',
        byId: { l1: { id: 'l1', name: 'Maya' } },
      },
      subjectUi: { reading: createInitialReadingState() },
    };
    const repositories = {
      gameState: {
        read() {
          return {
            readbloom: {
              caught: true,
              branch: 'b1',
              releaseId: READING_REWARD_RELEASE_ID,
              mastered: [readingMasteryKey('2a')],
            },
          };
        },
      },
    };
    console.log(renderToStaticMarkup(<ReadingPracticeSurface appState={appState} actions={{ dispatch() {} }} repositories={repositories} />));
  `);

  assert.match(html, /class="ss-meadow-art"/);
  assert.match(html, /assets\/monsters\/glossbloom\/b1\/glossbloom-b1-/);
  assert.doesNotMatch(html, /assets\/monsters\/readbloom\//);
});

test('reading setup fallback monster list is not shadowed by empty meadow copy', async () => {
  const output = await renderFixture(`
    import { readingMonsterImageVisual } from ${absoluteSpecifier('src/subjects/reading/components/ReadingPracticeSurface.jsx')};

    console.log(JSON.stringify({
      missingVisual: readingMonsterImageVisual('missing-reading-monster', { branch: 'b1', stage: 1 }, null),
    }));
  `);

  assert.equal(JSON.parse(output).missingVisual, null);
  const ui = source('src/subjects/reading/components/ReadingPracticeSurface.jsx');
  assert.match(ui, /monsters=\{panelMonsterVisuals\.length \? \[\] : panelMonsterFallbacks\}/);
  assert.match(ui, /meadowEmpty=\{panelMonsterFallbacks\.length \? '' : 'Start practising to discover your Reading creatures\.'\}/);
});
