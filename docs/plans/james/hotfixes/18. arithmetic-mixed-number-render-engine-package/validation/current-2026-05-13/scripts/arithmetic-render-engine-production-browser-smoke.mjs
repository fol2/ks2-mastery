#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium } from '@playwright/test';

import {
  configuredOrigin,
  createDemoSession,
} from '../../../../../../../../scripts/lib/production-smoke.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), '../../../../../../../..');

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function resolveOutPath(rawPath) {
  if (!rawPath) return '';
  const absolute = path.resolve(ROOT_DIR, rawPath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  return absolute;
}

function relativePath(absolutePath) {
  return path.relative(ROOT_DIR, absolutePath).replaceAll(path.sep, '/');
}

function writeJson(outPath, value) {
  if (!outPath) return;
  const absolute = path.resolve(ROOT_DIR, outPath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function cookieParts(cookieHeader) {
  const [pair] = String(cookieHeader || '').split(';');
  const separator = pair.indexOf('=');
  assert.ok(separator > 0, 'Demo session cookie was malformed.');
  return {
    name: pair.slice(0, separator),
    value: pair.slice(separator + 1),
  };
}

function collectSignals(page, signals) {
  page.on('console', (message) => {
    const entry = {
      type: message.type(),
      text: message.text(),
      location: message.location(),
    };
    if (message.type() === 'error') signals.consoleErrors.push(entry);
    if (message.type() === 'warning') signals.consoleWarnings.push(entry);
  });
  page.on('pageerror', (error) => {
    signals.pageErrors.push({ message: error?.message || String(error), stack: error?.stack || '' });
  });
  page.on('requestfailed', (request) => {
    signals.requestFailures.push({
      method: request.method(),
      url: request.url(),
      failure: request.failure()?.errorText || '',
      resourceType: request.resourceType(),
    });
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      signals.httpFailures.push({
        status: response.status(),
        url: response.url(),
        requestMethod: response.request().method(),
        resourceType: response.request().resourceType(),
      });
    }
  });
}

async function newDemoPage(browser, origin, viewport, signals) {
  const demo = await createDemoSession(origin);
  const url = new URL(origin);
  const cookie = cookieParts(demo.cookie);
  const context = await browser.newContext({ viewport, baseURL: origin });
  await context.addCookies([{
    name: cookie.name,
    value: cookie.value,
    domain: url.hostname,
    path: '/',
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'Lax',
  }]);
  const page = await context.newPage();
  collectSignals(page, signals);
  return { context, page, demo };
}

async function openArithmetic(page, origin) {
  await page.goto(origin, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.locator('button[data-action="open-subject"][data-subject-id="arithmetic"]').click({ timeout: 15_000 });
  await page.getByRole('heading', { name: 'Arithmetic mission' }).waitFor({ timeout: 15_000 });
}

async function startSkillSession(page, skillId) {
  await page.locator('select[name="mode"]').selectOption('skill');
  await page.locator('select[name="focusSkillId"]').selectOption(skillId);
  await page.locator('select[name="goal"]').selectOption('20q');
  await page.getByRole('button', { name: 'Start Arithmetic' }).click({ timeout: 15_000 });
  await page.locator('form.arithmetic-answer-form input[name="answer"]').waitFor({ timeout: 15_000 });
}

async function submitWrongAnswer(page, answer = '999999') {
  const input = page.locator('form.arithmetic-answer-form input[name="answer"]');
  await input.fill(answer);
  await page.getByRole('button', { name: 'Submit answer' }).click({ timeout: 15_000 });
  await page.getByText('Worked solution').waitFor({ timeout: 15_000 });
}

async function continueToNextQuestion(page) {
  await page.getByRole('button', { name: 'Next question' }).click({ timeout: 15_000 });
  await page.waitForFunction(() => {
    const input = document.querySelector('form.arithmetic-answer-form input[name="answer"]');
    const feedback = document.querySelector('.question-card .feedback[role="status"]');
    return input && !input.disabled && !feedback;
  }, null, { timeout: 15_000 });
}

async function renderedQuestion(page) {
  return page.locator('.question-card .question-stem [role="math"]').evaluate((node) => ({
    text: node.textContent || '',
    label: node.getAttribute('aria-label') || '',
    tokenCount: node.querySelectorAll('[data-arithmetic-token]').length,
    mixedNumberCount: node.querySelectorAll('.arithmetic-mixed-number').length,
    fractionCount: node.querySelectorAll('.arithmetic-fraction').length,
    operatorCount: node.querySelectorAll('.arithmetic-operator').length,
    hiddenTokenCount: Array.from(node.querySelectorAll('[data-arithmetic-token]'))
      .filter((token) => token.getAttribute('aria-hidden') === 'true').length,
  }));
}

async function renderedFeedback(page) {
  return page.locator('.question-card .feedback[role="status"]').evaluate((node) => ({
    text: node.textContent || '',
    expressions: Array.from(node.querySelectorAll('[role="math"]')).map((expression) => ({
      text: expression.textContent || '',
      label: expression.getAttribute('aria-label') || '',
    })),
    mixedNumbers: Array.from(node.querySelectorAll('.arithmetic-mixed-number')).map((token) => ({
      text: token.textContent || '',
      label: token.getAttribute('data-arithmetic-label') || token.getAttribute('aria-label') || '',
      ariaHidden: token.getAttribute('aria-hidden') || '',
    })),
  }));
}

async function findMixedNumberQuestionWithFeedback(page) {
  const attempts = [];
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const question = await renderedQuestion(page);
    attempts.push(question.label);
    await submitWrongAnswer(page);
    const feedback = await renderedFeedback(page);
    if (
      question.mixedNumberCount >= 1
      && question.label.includes(' and ')
      && question.label.includes('equals')
      && feedback.mixedNumbers.length >= 1
    ) {
      return { attempt, attempts, question, feedback };
    }
    await continueToNextQuestion(page);
  }
  assert.fail(`Could not find a rendered mixed-number equation with a rendered mixed-number answer in 20 attempts. Labels: ${attempts.join(' | ')}`);
}

async function captureScreenshot(page, screenshotPath, viewport) {
  await page.setViewportSize(viewport);
  await page.waitForTimeout(500);
  await page.screenshot({ path: screenshotPath, fullPage: false });
}

async function runMixedNumberFlow(browser, origin, paths, signals) {
  const desktop = { width: 1280, height: 900 };
  const mobile = { width: 390, height: 844 };
  const { context, page, demo } = await newDemoPage(browser, origin, desktop, signals);
  try {
    await openArithmetic(page, origin);
    await startSkillSession(page, 'fractions_calc');
    const found = await findMixedNumberQuestionWithFeedback(page);
    assert.equal(found.question.hiddenTokenCount, found.question.tokenCount, 'Question visual tokens were not hidden from the accessibility tree.');
    assert.equal(found.question.text.includes('/'), false, 'Question still exposed slash-format raw fraction text.');

    const feedback = found.feedback;
    assert.ok(feedback.expressions.length >= 2, 'Feedback did not render answer/worked-solution text as math expressions.');
    assert.ok(feedback.mixedNumbers.length >= 1, 'Feedback did not render mixed-number answer tokens.');
    assert.equal(feedback.mixedNumbers.every((token) => token.ariaHidden === 'true'), true, 'Feedback visual tokens were not hidden from the accessibility tree.');
    assert.equal(/\d+\s+\d+\/\d+/.test(feedback.text), false, 'Feedback still exposed collapsed mixed-number slash text.');

    await captureScreenshot(page, paths.mixedDesktop, desktop);
    await captureScreenshot(page, paths.mixedMobile, mobile);

    return {
      learnerFixtureType: 'demo-session-cookie',
      accountId: demo.session.accountId,
      learnerId: demo.session.learnerId,
      attemptsBeforeMixedQuestion: found.attempt,
      attemptedQuestionLabels: found.attempts,
      beforeSubmit: found.question,
      feedback,
      screenshots: [relativePath(paths.mixedDesktop), relativePath(paths.mixedMobile)],
    };
  } finally {
    await context.close();
  }
}

async function runFormalVisualFlow(browser, origin, paths, signals) {
  const desktop = { width: 1280, height: 900 };
  const mobile = { width: 390, height: 844 };
  const { context, page, demo } = await newDemoPage(browser, origin, desktop, signals);
  try {
    await openArithmetic(page, origin);
    await startSkillSession(page, 'column_addition');
    await page.locator('.question-card .arithmetic-visual').waitFor({ timeout: 15_000 });

    const rendered = await page.locator('.question-card').evaluate((card) => {
      const visual = card.querySelector('.arithmetic-visual');
      const lines = Array.from(visual?.querySelectorAll('.arithmetic-visual-line') || []);
      return {
        stemLabel: card.querySelector('.question-stem [role="math"]')?.getAttribute('aria-label') || '',
        visualText: visual?.textContent || '',
        lineCount: lines.length,
        expressionLabels: lines
          .map((line) => line.querySelector('[role="math"]')?.getAttribute('aria-label') || '')
          .filter(Boolean),
        tokens: Array.from(visual?.querySelectorAll('[data-arithmetic-token]') || []).map((token) => ({
          type: token.getAttribute('data-arithmetic-token') || '',
          text: token.textContent || '',
          label: token.getAttribute('data-arithmetic-label') || token.getAttribute('aria-label') || '',
          ariaHidden: token.getAttribute('aria-hidden') || '',
        })),
        underlinePresent: Boolean(lines.find((line) => !line.querySelector('[role="math"]') && (line.textContent || '').trim().length > 0)),
      };
    });

    assert.equal(rendered.stemLabel, '', 'Column visual smoke expected the stem prose to stay non-math while the formal visual renders.');
    assert.ok(rendered.lineCount >= 3, 'Formal visual did not preserve the column-layout rows.');
    assert.ok(rendered.expressionLabels.length >= 2, 'Formal visual did not render both operand rows as math expressions.');
    assert.match(rendered.expressionLabels[0], /^\d+$/, 'First operand row did not expose a numeric math label.');
    assert.match(rendered.expressionLabels[1], /^plus \d+$/, 'Second operand row did not expose an operator math label.');
    assert.ok(rendered.tokens.some((token) => token.type === 'number'), 'Formal visual did not render number tokens.');
    assert.ok(rendered.tokens.some((token) => token.type === 'operator'), 'Formal visual did not render operator tokens.');
    assert.equal(rendered.tokens.every((token) => token.ariaHidden === 'true'), true, 'Formal visual tokens were not hidden from the accessibility tree.');
    assert.equal(rendered.underlinePresent, true, 'Formal visual did not preserve the underline row.');

    await captureScreenshot(page, paths.visualDesktop, desktop);
    await captureScreenshot(page, paths.visualMobile, mobile);

    return {
      learnerFixtureType: 'demo-session-cookie',
      accountId: demo.session.accountId,
      learnerId: demo.session.learnerId,
      rendered,
      screenshots: [relativePath(paths.visualDesktop), relativePath(paths.visualMobile)],
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const origin = configuredOrigin();
  const outPath = argValue('--out', '');
  const smokeType = argValue('--smoke-type', 'arithmetic-render-engine-production-browser');
  const paths = {
    mixedDesktop: resolveOutPath(argValue('--mixed-desktop-screenshot', '')),
    mixedMobile: resolveOutPath(argValue('--mixed-mobile-screenshot', '')),
    visualDesktop: resolveOutPath(argValue('--visual-desktop-screenshot', '')),
    visualMobile: resolveOutPath(argValue('--visual-mobile-screenshot', '')),
  };
  Object.entries(paths).forEach(([name, value]) => {
    assert.ok(value, `${name} output path is required.`);
  });

  const signals = {
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    requestFailures: [],
    httpFailures: [],
  };

  const browser = await chromium.launch({ headless: true });
  try {
    const mixedNumberFlow = await runMixedNumberFlow(browser, origin, paths, signals);
    const formalVisualFlow = await runFormalVisualFlow(browser, origin, paths, signals);

    assert.equal(signals.consoleErrors.length, 0, `Console errors: ${JSON.stringify(signals.consoleErrors, null, 2)}`);
    assert.equal(signals.pageErrors.length, 0, `Page errors: ${JSON.stringify(signals.pageErrors, null, 2)}`);
    assert.equal(signals.requestFailures.length, 0, `Request failures: ${JSON.stringify(signals.requestFailures, null, 2)}`);
    assert.equal(signals.httpFailures.length, 0, `HTTP failures: ${JSON.stringify(signals.httpFailures, null, 2)}`);

    const evidence = {
      ok: true,
      smokeType,
      environment: origin === 'https://ks2.eugnel.uk' ? 'production' : 'non-production',
      origin,
      browser: 'chromium',
      flows: [
        'Demo -> Arithmetic -> Skill Builder -> Fraction calculations -> mixed-number equation -> wrong answer feedback',
        'Demo -> Arithmetic -> Skill Builder -> Column addition -> formal visual equation',
      ],
      mixedNumberFlow,
      formalVisualFlow,
      viewportChecks: [
        { name: 'mixed-desktop', width: 1280, height: 900, screenshot: relativePath(paths.mixedDesktop) },
        { name: 'mixed-mobile', width: 390, height: 844, screenshot: relativePath(paths.mixedMobile) },
        { name: 'visual-desktop', width: 1280, height: 900, screenshot: relativePath(paths.visualDesktop) },
        { name: 'visual-mobile', width: 390, height: 844, screenshot: relativePath(paths.visualMobile) },
      ],
      ...signals,
      finishedAt: new Date().toISOString(),
    };
    writeJson(outPath, evidence);
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const evidence = {
      ok: false,
      smokeType: argValue('--smoke-type', 'arithmetic-render-engine-production-browser'),
      error: error?.stack || error?.message || String(error),
      finishedAt: new Date().toISOString(),
    };
    writeJson(argValue('--out', ''), evidence);
    console.error(`[arithmetic-render-engine-production-browser-smoke] ${evidence.error}`);
    process.exit(1);
  });
}
