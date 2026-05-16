#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import {
  configuredOrigin,
  createDemoSession,
  loadBootstrap,
  subjectCommand,
} from '../../../../../../scripts/lib/production-smoke.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../../../../');

const TEMPLATE_ID = 'qg_p21_relative_clauses_explanation_choice_variety';
const SEED = 1;
const CORRECT_ANSWER = 'Who won the race adds information about the girl.';
const INCORRECT_ANSWER = 'Any clause beginning with which is a question.';
const EXPECTED_HINT = 'A relative clause adds extra information about a noun. Find the noun it is attached to.';
const EXPECTED_LEARNING_CUE = `Remember: ${EXPECTED_HINT}`;
const EXPECTED_STRETCH = 'Extra challenge: write one new sentence with who, which, or that.';

function getCommitSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function parseCookie(cookie) {
  const [name, ...rest] = String(cookie || '').split('=');
  const value = rest.join('=');
  assert.ok(name && value, 'Demo session cookie was not parseable.');
  return { name, value };
}

async function prepareGrammarFeedbackCase(origin, { answer, expectedCorrect }) {
  const { cookie, session } = await createDemoSession(origin);
  const bootstrap = await loadBootstrap(origin, cookie, { expectedSession: session });
  let revision = bootstrap.revision;

  let step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'grammar',
    learnerId: bootstrap.learnerId,
    revision,
    command: 'start-session',
    payload: {
      mode: 'smart',
      roundLength: 1,
      templateId: TEMPLATE_ID,
      seed: SEED,
    },
  });
  revision = step.revision;

  const started = step.payload.subjectReadModel;
  assert.equal(started?.phase, 'session', 'Grammar session did not start.');
  assert.equal(started?.session?.currentItem?.templateId, TEMPLATE_ID, 'Production session did not serve the P25 fixture.');
  assert.equal(started?.session?.currentItem?.seed, SEED, 'Production session did not serve the expected seed.');

  step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'grammar',
    learnerId: bootstrap.learnerId,
    revision,
    command: 'submit-answer',
    payload: { response: { answer } },
  });

  const feedback = step.payload.subjectReadModel;
  assert.equal(feedback?.phase, 'feedback', 'Grammar submit did not return feedback phase.');
  assert.equal(Boolean(feedback?.feedback?.result?.correct), expectedCorrect, 'Feedback correctness did not match the fixture.');
  assert.equal(feedback?.feedback?.result?.minimalHint, EXPECTED_HINT, 'Production feedback did not include the expected minimal hint.');

  return {
    cookie,
    learnerId: bootstrap.learnerId,
    revision: step.revision,
    feedback,
  };
}

async function openProductionGrammarFeedback(browser, origin, cookie, { selector, expectedText, screenshotPath }) {
  const { name, value } = parseCookie(cookie);
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
  });
  await context.addCookies([{ name, value, url: origin }]);

  const page = await context.newPage();
  const consoleErrors = [];
  const requestFailures = [];
  const httpFailures = [];
  const originPrefix = new URL(origin).origin;

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (url.startsWith(originPrefix)) {
      requestFailures.push({
        url,
        method: request.method(),
        failure: request.failure()?.errorText || '',
      });
    }
  });
  page.on('response', (response) => {
    const url = response.url();
    if (url.startsWith(originPrefix) && response.status() >= 400) {
      httpFailures.push({
        url,
        status: response.status(),
      });
    }
  });

  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-action="open-subject"][data-subject-id="grammar"]', { timeout: 20_000 });
  await page.click('[data-action="open-subject"][data-subject-id="grammar"]');
  const locator = page.locator(selector);
  await locator.waitFor({ state: 'visible', timeout: 20_000 });
  const observedText = (await locator.innerText()).trim();
  assert.equal(observedText, expectedText, `Unexpected text for ${selector}.`);

  await page.screenshot({ path: screenshotPath, fullPage: true });
  await context.close();

  assert.deepEqual(consoleErrors, [], 'Production browser emitted console errors.');
  assert.deepEqual(requestFailures, [], 'Production browser had request failures.');
  assert.deepEqual(httpFailures, [], 'Production browser had HTTP failures.');

  return {
    selector,
    observedText,
    screenshotPath: path.relative(ROOT_DIR, screenshotPath).replace(/\\/g, '/'),
    consoleErrorCount: consoleErrors.length,
    requestFailureCount: requestFailures.length,
    httpFailureCount: httpFailures.length,
  };
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (primaryError) {
    try {
      return await chromium.launch({ channel: 'chrome', headless: true });
    } catch {
      throw primaryError;
    }
  }
}

async function main() {
  const origin = configuredOrigin();
  mkdirSync(__dirname, { recursive: true });

  const incorrect = await prepareGrammarFeedbackCase(origin, {
    answer: INCORRECT_ANSWER,
    expectedCorrect: false,
  });
  const correct = await prepareGrammarFeedbackCase(origin, {
    answer: CORRECT_ANSWER,
    expectedCorrect: true,
  });

  const browser = await launchBrowser();
  try {
    const incorrectBrowser = await openProductionGrammarFeedback(browser, origin, incorrect.cookie, {
      selector: '[data-grammar-feedback-learning-cue]',
      expectedText: EXPECTED_LEARNING_CUE,
      screenshotPath: path.join(__dirname, 'current-production-p25-incorrect-feedback.png'),
    });
    const correctBrowser = await openProductionGrammarFeedback(browser, origin, correct.cookie, {
      selector: '[data-grammar-feedback-stretch]',
      expectedText: EXPECTED_STRETCH,
      screenshotPath: path.join(__dirname, 'current-production-p25-correct-stretch.png'),
    });

    const evidence = {
      ok: true,
      origin,
      timestamp: new Date().toISOString(),
      commitSha: getCommitSha(),
      templateId: TEMPLATE_ID,
      seed: SEED,
      assertions: {
        incorrectLearningCue: {
          ok: true,
          correct: false,
          minimalHint: incorrect.feedback.feedback.result.minimalHint,
          expectedText: EXPECTED_LEARNING_CUE,
          browser: incorrectBrowser,
        },
        correctStretchCue: {
          ok: true,
          correct: true,
          minimalHint: correct.feedback.feedback.result.minimalHint,
          expectedText: EXPECTED_STRETCH,
          browser: correctBrowser,
        },
      },
    };
    const outPath = path.join(__dirname, 'current-production-p25-ui-smoke.json');
    writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`[production-p25-ui-smoke] ${error?.stack || error?.message || error}`);
  process.exit(1);
});
