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

function normaliseLineEndings(value) {
  return String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

async function runFixture(entrySource) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-arithmetic-surface-'));
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
      external: ['jsdom'],
      nodePaths: nodePaths(),
      logLevel: 'silent',
    });
    const output = execFileSync(process.execPath, [bundlePath], {
      cwd: rootDir,
      env: {
        ...process.env,
        NODE_PATH: nodePaths().join(path.delimiter),
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000,
    });
    return normaliseLineEndings(output).replace(/\n+$/, '');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

function arithmeticSurfaceSpecifier() {
  return JSON.stringify(path.join(rootDir, 'src/subjects/arithmetic/components/ArithmeticPracticeSurface.jsx'));
}

test('ArithmeticPracticeSurface remounts True Test answer fields from the current paper entry', async () => {
  const output = await runFixture(`
    const { JSDOM } = require('jsdom');

    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'https://ks2.eugnel.uk/arithmetic',
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.HTMLInputElement = dom.window.HTMLInputElement;
    globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
    globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
    globalThis.Event = dom.window.Event;
    globalThis.FormData = dom.window.FormData;

    const React = require('react');
    const { createRoot } = require('react-dom/client');
    const { act } = React;
    const { ArithmeticPracticeSurface } = require(${arithmeticSurfaceSpecifier()});

    const questions = [
      {
        id: 'q-one',
        templateLabel: 'Column addition',
        domain: 'arithmetic',
        marks: 1,
        stem: 'What is 24 + 18?',
        inputSpec: { label: 'Answer' },
      },
      {
        id: 'q-two',
        templateLabel: 'Column subtraction',
        domain: 'arithmetic',
        marks: 1,
        stem: 'What is 63 - 27?',
        inputSpec: { label: 'Answer' },
      },
    ];
    const paper = [
      { index: 0, question: questions[0], response: { answer: '42' }, working: '24 + 18 = 42' },
      { index: 1, question: questions[1], response: { answer: '36' }, working: '63 - 27 = 36' },
    ];

    function appStateFor(index) {
      return {
        learners: { selectedId: 'learner-arithmetic' },
        subjectUi: {
          arithmetic: {
            phase: 'test',
            prefs: { mode: 'test', goal: '10q', testForm: 'short' },
            session: {
              id: 'true-test-session',
              mode: 'test',
              currentIndex: index,
              questionCount: paper.length,
              currentQuestion: paper[index].question,
              paper,
            },
          },
        },
      };
    }

    async function main() {
      const root = createRoot(document.getElementById('root'));
      const actions = { dispatch() {}, navigateHome() {} };
      await act(async () => {
        root.render(React.createElement(ArithmeticPracticeSurface, { appState: appStateFor(0), actions }));
      });

      const firstAnswer = document.querySelector('input[name="answer"]');
      const firstWorking = document.querySelector('textarea[name="working"]');
      if (!firstAnswer || !firstWorking) throw new Error('Arithmetic answer fields did not render');
      if (firstAnswer.value !== '42' || firstWorking.value !== '24 + 18 = 42') {
        throw new Error('First question did not hydrate from its paper entry');
      }

      firstAnswer.value = 'stale unsaved answer';
      firstWorking.value = 'stale unsaved working';

      await act(async () => {
        root.render(React.createElement(ArithmeticPracticeSurface, { appState: appStateFor(1), actions }));
      });

      const secondAnswer = document.querySelector('input[name="answer"]');
      const secondWorking = document.querySelector('textarea[name="working"]');
      process.stdout.write(JSON.stringify({
        answer: secondAnswer?.value || '',
        working: secondWorking?.value || '',
        stem: document.querySelector('.question-stem')?.textContent || '',
      }));
      await act(async () => {
        root.unmount();
      });
      dom.window.close();
      process.exit(0);
    }

    main().catch((error) => {
      process.stderr.write(error.stack || error.message);
      process.exit(1);
    });
  `);

  const result = JSON.parse(output);
  assert.equal(result.answer, '36');
  assert.equal(result.working, '63 - 27 = 36');
  assert.match(result.stem, /63 - 27/);
});
