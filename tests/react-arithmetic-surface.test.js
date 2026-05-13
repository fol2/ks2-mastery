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
      timeout: 30_000,
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
        stemTokens: [...document.querySelectorAll('.question-stem [data-arithmetic-token]')].map((node) => ({
          type: node.getAttribute('data-arithmetic-token'),
          text: node.textContent,
          label: node.getAttribute('data-arithmetic-label') || '',
        })),
        stemExpressionLabel: document.querySelector('.question-stem .arithmetic-expression')?.getAttribute('aria-label') || '',
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
  assert.deepEqual(result.stemTokens, [
    { type: 'number', text: '63', label: '' },
    { type: 'operator', text: '-', label: 'minus' },
    { type: 'number', text: '27', label: '' },
  ]);
  assert.equal(result.stemExpressionLabel, 'What is 63 minus 27?');
});

test('ArithmeticPracticeSurface renders mixed-number stems as grouped fraction UI', async () => {
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

    const question = {
      id: 'mixed-number-regression',
      templateLabel: 'Mixed-number calculations',
      domain: 'Fractions',
      marks: 1,
      stem: '5 3/8 − 1 1/8 =',
      inputSpec: { label: 'Answer as a mixed number, fraction or whole number' },
    };
    const appState = {
      learners: { selectedId: 'learner-arithmetic' },
      subjectUi: {
        arithmetic: {
          phase: 'session',
          prefs: { mode: 'smart', goal: '10q', testForm: 'short' },
          session: {
            id: 'mixed-number-session',
            mode: 'smart',
            currentIndex: 0,
            questionCount: 1,
            currentQuestion: question,
          },
        },
      },
    };

    async function main() {
      const root = createRoot(document.getElementById('root'));
      const actions = { dispatch() {}, navigateHome() {} };
      await act(async () => {
        root.render(React.createElement(ArithmeticPracticeSurface, { appState, actions }));
      });

      const stem = document.querySelector('.question-stem');
      const mixedNumbers = [...document.querySelectorAll('[data-arithmetic-token="mixed-number"]')].map((node) => ({
        text: node.textContent.replace(/\\s+/g, ' ').trim(),
        label: node.getAttribute('data-arithmetic-label'),
        ariaHidden: node.getAttribute('aria-hidden'),
      }));
      const fractions = [...document.querySelectorAll('[data-arithmetic-token="fraction"]')].map((node) => ({
        numerator: node.querySelector('.arithmetic-fraction-numerator')?.textContent || '',
        denominator: node.querySelector('.arithmetic-fraction-denominator')?.textContent || '',
        ariaHidden: node.getAttribute('aria-hidden'),
      }));

      process.stdout.write(JSON.stringify({
        stemText: stem?.textContent.replace(/\\s+/g, ' ').trim() || '',
        stemExpressionLabel: stem?.querySelector('.arithmetic-expression')?.getAttribute('aria-label') || '',
        expressionClassPresent: Boolean(document.querySelector('.arithmetic-expression')),
        mixedNumbers,
        fractions,
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
  assert.equal(result.expressionClassPresent, true);
  assert.deepEqual(result.mixedNumbers, [
    { text: '5 3 8', label: '5 and 3 eighths', ariaHidden: 'true' },
    { text: '1 1 8', label: '1 and 1 eighth', ariaHidden: 'true' },
  ]);
  assert.deepEqual(result.fractions, [
    { numerator: '3', denominator: '8', ariaHidden: 'true' },
    { numerator: '1', denominator: '8', ariaHidden: 'true' },
  ]);
  assert.equal(result.stemExpressionLabel, '5 and 3 eighths minus 1 and 1 eighth equals');
  assert.equal(result.stemText.includes('11/8'), false, 'rendered stem must not collapse the second mixed number into 11/8');
});

test('ArithmeticPracticeSurface renders grouped slash fractions as stacked expression fractions', async () => {
  const output = await runFixture(`
    const { JSDOM } = require('jsdom');

    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'https://ks2.test/arithmetic',
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

    const question = {
      id: 'expression-fraction-regression',
      templateLabel: 'Order of operations',
      domain: 'Mixed arithmetic',
      marks: 1,
      stem: '(5+3)/5 =',
      inputSpec: { type: 'text', label: 'Answer' },
    };
    const appState = {
      learners: { selectedId: 'learner-arithmetic' },
      subjectUi: {
        arithmetic: {
          phase: 'session',
          session: {
            id: 'expression-fraction-session',
            mode: 'smart',
            currentIndex: 0,
            currentQuestion: question,
          },
        },
      },
    };

    async function main() {
      const root = createRoot(document.getElementById('root'));
      const actions = { dispatch() {}, navigateHome() {} };
      await act(async () => {
        root.render(React.createElement(ArithmeticPracticeSurface, { appState, actions }));
      });

      const stem = document.querySelector('.question-stem');
      const expressionFraction = stem?.querySelector('[data-arithmetic-token="expression-fraction"]');
      process.stdout.write(JSON.stringify({
        stemText: stem?.textContent.replace(/\\s+/g, ' ').trim() || '',
        stemExpressionLabel: stem?.querySelector('.arithmetic-expression')?.getAttribute('aria-label') || '',
        tokenLabel: expressionFraction?.getAttribute('data-arithmetic-label') || '',
        numerator: expressionFraction?.querySelector('.arithmetic-fraction-numerator')?.textContent.replace(/\\s+/g, '') || '',
        denominator: expressionFraction?.querySelector('.arithmetic-fraction-denominator')?.textContent.replace(/\\s+/g, '') || '',
        tokenCount: stem?.querySelectorAll('[data-arithmetic-token]').length || 0,
        ariaHidden: expressionFraction?.getAttribute('aria-hidden') || '',
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
  assert.equal(result.stemExpressionLabel, '5 plus 3 over 5 equals');
  assert.equal(result.tokenLabel, '5 plus 3 over 5');
  assert.equal(result.numerator, '5+3');
  assert.equal(result.denominator, '5');
  assert.equal(result.ariaHidden, 'true');
  assert.equal(result.stemText.includes('(5+3)/5'), false, 'grouped slash fraction should not remain raw slash text');
});

test('ArithmeticPracticeSurface renders missing-number placeholders as full answer boxes', async () => {
  const output = await runFixture(`
    const { JSDOM } = require('jsdom');

    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'https://ks2.test/arithmetic',
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

    const question = {
      id: 'placeholder-box-regression',
      templateLabel: 'Missing-number equation',
      domain: 'Addition and subtraction',
      marks: 1,
      stem: '9 × □ = 99',
      inputSpec: { type: 'text', label: 'Answer' },
    };
    const appState = {
      learners: { selectedId: 'learner-arithmetic' },
      subjectUi: {
        arithmetic: {
          phase: 'session',
          session: {
            id: 'placeholder-box-session',
            mode: 'smart',
            currentIndex: 0,
            currentQuestion: question,
          },
        },
      },
    };

    async function main() {
      const root = createRoot(document.getElementById('root'));
      const actions = { dispatch() {}, navigateHome() {} };
      await act(async () => {
        root.render(React.createElement(ArithmeticPracticeSurface, { appState, actions }));
      });

      const stem = document.querySelector('.question-stem');
      const placeholder = stem?.querySelector('[data-arithmetic-token="placeholder"]');
      process.stdout.write(JSON.stringify({
        stemExpressionLabel: stem?.querySelector('.arithmetic-expression')?.getAttribute('aria-label') || '',
        placeholderLabel: placeholder?.getAttribute('data-arithmetic-label') || '',
        placeholderText: placeholder?.textContent || '',
        hasBox: Boolean(placeholder?.querySelector('.arithmetic-placeholder-box')),
        ariaHidden: placeholder?.getAttribute('aria-hidden') || '',
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
  assert.equal(result.stemExpressionLabel, '9 times blank equals 99');
  assert.equal(result.placeholderLabel, 'blank');
  assert.equal(result.placeholderText, '');
  assert.equal(result.hasBox, true);
  assert.equal(result.ariaHidden, 'true');
});

test('ArithmeticPracticeSurface renders short-division visuals as formal long division', async () => {
  const output = await runFixture(`
    const { JSDOM } = require('jsdom');

    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'https://ks2.test/arithmetic',
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

    const question = {
      id: 'short-division-visual-regression',
      templateLabel: 'Short division',
      domain: 'Multiplication and division',
      marks: 1,
      stem: 'Work out:',
      visual: '6 ) 354',
      inputSpec: { type: 'number', label: 'Answer' },
    };
    const appState = {
      learners: { selectedId: 'learner-arithmetic' },
      subjectUi: {
        arithmetic: {
          phase: 'session',
          session: {
            id: 'short-division-visual-session',
            mode: 'smart',
            currentIndex: 0,
            currentQuestion: question,
          },
        },
      },
    };

    async function main() {
      const root = createRoot(document.getElementById('root'));
      const actions = { dispatch() {}, navigateHome() {} };
      await act(async () => {
        root.render(React.createElement(ArithmeticPracticeSurface, { appState, actions }));
      });

      const visual = document.querySelector('.arithmetic-visual');
      const longDivision = visual?.querySelector('[data-arithmetic-token="long-division"]');
      process.stdout.write(JSON.stringify({
        visualText: visual?.textContent.replace(/\\s+/g, ' ').trim() || '',
        tokenLabel: longDivision?.getAttribute('data-arithmetic-label') || '',
        divisor: longDivision?.querySelector('.arithmetic-long-division-divisor')?.textContent.replace(/\\s+/g, '') || '',
        dividend: longDivision?.querySelector('.arithmetic-long-division-dividend')?.textContent.replace(/\\s+/g, '') || '',
        hasBracket: Boolean(longDivision?.querySelector('.arithmetic-long-division-bracket')),
        ariaHidden: longDivision?.getAttribute('aria-hidden') || '',
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
  assert.equal(result.tokenLabel, '354 divided by 6');
  assert.equal(result.divisor, '6');
  assert.equal(result.dividend, '354');
  assert.equal(result.hasBracket, true);
  assert.equal(result.ariaHidden, 'true');
  assert.equal(result.visualText.includes(')'), false, 'raw long-division text should not leave the close-bracket glyph visible');
});

test('ArithmeticPracticeSurface renders arithmetic feedback, answers and review text through the math renderer', async () => {
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

    const question = {
      id: 'mixed-number-feedback-regression',
      templateLabel: 'Mixed-number calculations',
      domain: 'Fractions',
      marks: 1,
      stem: '5 3/8 − 1 1/8 =',
      inputSpec: { label: 'Answer as a mixed number, fraction or whole number' },
      solutionLines: [
        'Convert to improper fractions or work with whole and fractional parts carefully.',
        'The answer is 4 1/4.',
      ],
    };
    const feedback = {
      result: {
        correct: false,
        score: 0,
        maxScore: 1,
        feedbackShort: 'Not quite.',
        feedbackLong: 'The answer is 4 1/4.',
        answerText: '4 1/4',
        minimalHint: 'Check the operation.',
      },
      solutionLines: question.solutionLines,
    };

    function sessionState() {
      return {
        learners: { selectedId: 'learner-arithmetic' },
        subjectUi: {
          arithmetic: {
            phase: 'session',
            prefs: { mode: 'smart', goal: '10q', testForm: 'short' },
            session: {
              id: 'mixed-number-feedback-session',
              mode: 'smart',
              currentIndex: 0,
              questionCount: 1,
              currentQuestion: question,
            },
            feedback,
          },
        },
      };
    }

    function summaryState() {
      return {
        learners: { selectedId: 'learner-arithmetic' },
        subjectUi: {
          arithmetic: {
            phase: 'summary',
            prefs: { mode: 'smart', goal: '10q', testForm: 'short' },
            summary: { correct: 0, answered: 1, questionCount: 1, score: 0, maxScore: 1 },
            session: {
              id: 'mixed-number-summary-session',
              mode: 'smart',
              currentIndex: 0,
              questionCount: 1,
              paper: [{
                index: 0,
                question,
                response: { answer: '4 1/4' },
                result: feedback.result,
              }],
            },
          },
        },
      };
    }

    function mixedLabels(root) {
      return [...root.querySelectorAll('[data-arithmetic-token="mixed-number"]')]
        .map((node) => node.getAttribute('data-arithmetic-label'));
    }

    async function main() {
      const root = createRoot(document.getElementById('root'));
      const actions = { dispatch() {}, navigateHome() {} };
      await act(async () => {
        root.render(React.createElement(ArithmeticPracticeSurface, { appState: sessionState(), actions }));
      });

      const feedbackRoot = document.querySelector('.feedback.bad');
      const feedbackLabels = mixedLabels(feedbackRoot);
      const feedbackExpressionCount = feedbackRoot.querySelectorAll('.arithmetic-expression').length;
      const feedbackText = feedbackRoot.textContent.replace(/\\s+/g, ' ').trim();

      await act(async () => {
        root.render(React.createElement(ArithmeticPracticeSurface, { appState: summaryState(), actions }));
      });

      const reviewRoot = document.querySelector('.review-list');
      const reviewLabels = mixedLabels(reviewRoot);
      const reviewExpressionCount = reviewRoot.querySelectorAll('.arithmetic-expression').length;
      const reviewText = reviewRoot.textContent.replace(/\\s+/g, ' ').trim();

      process.stdout.write(JSON.stringify({
        feedbackLabels,
        feedbackExpressionCount,
        feedbackText,
        reviewLabels,
        reviewExpressionCount,
        reviewText,
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
  assert.equal(result.feedbackExpressionCount, 3, 'feedbackLong, answerText and worked solution should use the renderer');
  assert.equal(result.feedbackLabels.filter((label) => label === '4 and 1 quarter').length, 3);
  assert.equal(result.feedbackText.includes('41/4'), false, 'feedback answer must not collapse into 41/4');
  assert.equal(result.reviewExpressionCount, 4, 'summary question, learner answer, feedback and worked solution should use the renderer');
  assert.equal(result.reviewLabels.filter((label) => label === '4 and 1 quarter').length, 3);
  assert.equal(result.reviewText.includes('41/4'), false, 'summary answer must not collapse into 41/4');
});

test('ArithmeticPracticeSurface renders formal visual equations through the math renderer', async () => {
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

    const question = {
      id: 'formal-visual-equation-regression',
      templateLabel: 'Column addition',
      domain: 'Addition and subtraction',
      marks: 1,
      stem: 'Work out:',
      visual: '  375\\n+ 648\\n────',
      inputSpec: { label: 'Answer' },
      solutionLines: ['375 + 648 = 1,023.'],
    };

    function sessionState() {
      return {
        learners: { selectedId: 'learner-arithmetic' },
        subjectUi: {
          arithmetic: {
            phase: 'session',
            prefs: { mode: 'smart', goal: '10q', testForm: 'short' },
            session: {
              id: 'formal-visual-session',
              mode: 'smart',
              currentIndex: 0,
              questionCount: 1,
              currentQuestion: question,
            },
          },
        },
      };
    }

    function summaryState() {
      return {
        learners: { selectedId: 'learner-arithmetic' },
        subjectUi: {
          arithmetic: {
            phase: 'summary',
            prefs: { mode: 'smart', goal: '10q', testForm: 'short' },
            summary: { correct: 0, answered: 1, questionCount: 1, score: 0, maxScore: 1 },
            session: {
              id: 'formal-visual-summary-session',
              mode: 'smart',
              currentIndex: 0,
              questionCount: 1,
              paper: [{
                index: 0,
                question,
                response: { answer: '1023' },
                result: { correct: false, score: 0, maxScore: 1, feedbackLong: 'The answer is 1,023.' },
              }],
            },
          },
        },
      };
    }

    function visualSnapshot(root = document) {
      const visual = root.querySelector('.arithmetic-visual');
      return {
        lineCount: visual?.querySelectorAll('.arithmetic-visual-line').length || 0,
        expressionLabels: [...(visual?.querySelectorAll('.arithmetic-expression') || [])].map((node) => node.getAttribute('aria-label')),
        tokens: [...(visual?.querySelectorAll('[data-arithmetic-token]') || [])].map((node) => ({
          type: node.getAttribute('data-arithmetic-token'),
          text: node.textContent,
          label: node.getAttribute('data-arithmetic-label') || '',
        })),
        text: visual?.textContent || '',
      };
    }

    async function main() {
      const root = createRoot(document.getElementById('root'));
      const actions = { dispatch() {}, navigateHome() {} };
      await act(async () => {
        root.render(React.createElement(ArithmeticPracticeSurface, { appState: sessionState(), actions }));
      });
      const sessionVisual = visualSnapshot();

      await act(async () => {
        root.render(React.createElement(ArithmeticPracticeSurface, { appState: summaryState(), actions }));
      });
      const reviewVisual = visualSnapshot(document.querySelector('.review-list'));

      process.stdout.write(JSON.stringify({ sessionVisual, reviewVisual }));

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
  for (const visual of [result.sessionVisual, result.reviewVisual]) {
    assert.equal(visual.lineCount, 3);
    assert.deepEqual(visual.expressionLabels, ['375', 'plus 648']);
    assert.deepEqual(visual.tokens, [
      { type: 'number', text: '375', label: '' },
      { type: 'operator', text: '+', label: 'plus' },
      { type: 'number', text: '648', label: '' },
    ]);
    assert.match(visual.text, /────/);
  }
});
