#!/usr/bin/env node

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function argValue(name, fallback = '') {
  const equalsArg = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function configuredOrigin() {
  const raw = argValue('--origin', 'https://ks2.eugnel.uk');
  return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).origin;
}

async function isVisible(locator) {
  return locator.first().isVisible().catch(() => false);
}

async function firstVisible(page, selectors, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastSelector = selectors[0] || '';
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      lastSelector = selector;
      const locator = page.locator(selector).first();
      if (await isVisible(locator)) return { selector, locator };
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`Timed out waiting for one of: ${selectors.join(', ')}; last=${lastSelector}`);
}

async function fillGrammarAnswer(page) {
  const form = page.locator('.grammar-answer-form').first();

  const freeText = form.locator('input[name="answer"]:not([type="radio"]):not([type="checkbox"]), textarea[name="answer"]').first();
  if (await isVisible(freeText)) {
    await freeText.fill('hard refresh smoke response');
    return 'freeText';
  }

  const tableRoot = form.locator('.grammar-table-choice').first();
  if (await isVisible(tableRoot)) {
    const radios = tableRoot.locator('input[type="radio"]');
    const count = await radios.count();
    const seen = new Set();
    for (let index = 0; index < count; index += 1) {
      const radio = radios.nth(index);
      const name = await radio.getAttribute('name');
      if (!name || seen.has(name)) continue;
      seen.add(name);
      await radio.check({ force: true }).catch(() => radio.click({ force: true }));
    }
    return 'tableChoice';
  }

  const radio = form.locator('input[type="radio"]').first();
  if (await isVisible(radio)) {
    await radio.check({ force: true }).catch(() => radio.click({ force: true }));
    return 'radio';
  }

  const checkbox = form.locator('input[type="checkbox"]').first();
  if (await isVisible(checkbox)) {
    await checkbox.check({ force: true }).catch(() => checkbox.click({ force: true }));
    return 'checkbox';
  }

  const multiRoot = form.locator('.grammar-multi-fields').first();
  if (await isVisible(multiRoot)) {
    const selects = multiRoot.locator('select');
    for (let index = 0; index < await selects.count(); index += 1) {
      const select = selects.nth(index);
      const value = await select.locator('option').nth(0).getAttribute('value');
      if (value != null) await select.selectOption(value).catch(() => {});
    }
    const inputs = multiRoot.locator('input:not([type="radio"]):not([type="checkbox"])');
    for (let index = 0; index < await inputs.count(); index += 1) {
      await inputs.nth(index).fill('hard refresh smoke response').catch(() => {});
    }
    const multiRadio = multiRoot.locator('input[type="radio"]').first();
    if (await isVisible(multiRadio)) {
      await multiRadio.check({ force: true }).catch(() => multiRadio.click({ force: true }));
    }
    return 'multi';
  }

  throw new Error('No supported Grammar answer control was visible after hard refresh.');
}

async function fetchVersion(origin) {
  const response = await fetch(new URL('/api/version', origin));
  const body = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    body: body ? JSON.parse(body) : null,
  };
}

async function main() {
  const origin = configuredOrigin();
  const outPath = argValue(
    '--out',
    'docs/plans/james/hotfixes/25. grammar-production-grade-handoff-package/validation/production-grammar-hard-refresh-2026-05-16.json',
  );
  const screenshotPath = argValue(
    '--screenshot',
    'docs/plans/james/hotfixes/25. grammar-production-grade-handoff-package/validation/production-grammar-hard-refresh-2026-05-16.png',
  );
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: false,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];
  const httpFailures = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error?.message || String(error));
  });
  page.on('requestfailed', (request) => {
    requestFailures.push({
      method: request.method(),
      url: request.url(),
      failure: request.failure()?.errorText || '',
    });
  });
  page.on('response', (response) => {
    const status = response.status();
    const url = response.url();
    if (status >= 400 && !/\/favicon\.ico(?:\?|$)/.test(url)) {
      httpFailures.push({ status, url });
    }
  });

  const evidence = {
    ok: false,
    origin,
    timestamp: new Date().toISOString(),
    journey: [
      'open /demo',
      'open Grammar dashboard',
      'start a Grammar round',
      'hard reload while the active Grammar item is visible',
      'reopen Grammar if the reload returns to the subject grid',
      'submit the active item after reload',
      'observe Grammar feedback',
    ],
    hardRefreshPerformed: true,
    answerKind: '',
    promptBeforeReload: '',
    promptAfterReload: '',
    postReloadSurface: '',
    versionBefore: null,
    versionAfter: null,
    screenshotPath,
    consoleErrors,
    pageErrors,
    requestFailures,
    httpFailures,
  };

  try {
    evidence.versionBefore = await fetchVersion(origin);
    await page.goto(new URL('/demo', origin).href, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.locator('.subject-grid').waitFor({ state: 'visible', timeout: 15_000 });
    await page.locator('.subject-card[data-action="open-subject"][data-subject-id="grammar"]').first().click();
    await page.locator('.grammar-dashboard').waitFor({ state: 'visible', timeout: 15_000 });
    await page.locator('.grammar-start-row button[data-featured="true"]').first().click();
    await page.locator('.grammar-session .grammar-answer-form').waitFor({ state: 'visible', timeout: 15_000 });
    evidence.promptBeforeReload = ((await page.locator('.grammar-prompt').first().textContent().catch(() => '')) || '').trim();

    await page.reload({ waitUntil: 'networkidle', timeout: 30_000 });
    const postReload = await firstVisible(page, ['.grammar-session .grammar-answer-form', '.grammar-dashboard', '.subject-grid']);
    if (postReload.selector === '.subject-grid') {
      await page.locator('.subject-card[data-action="open-subject"][data-subject-id="grammar"]').first().click();
      await firstVisible(page, ['.grammar-session .grammar-answer-form', '.grammar-dashboard']);
    }
    if (await isVisible(page.locator('.grammar-dashboard'))) {
      await page.locator('.grammar-start-row button[data-featured="true"]').first().click();
      await page.locator('.grammar-session .grammar-answer-form').waitFor({ state: 'visible', timeout: 15_000 });
    }
    evidence.postReloadSurface = await isVisible(page.locator('.grammar-session .grammar-answer-form'))
      ? 'session'
      : 'dashboard';
    evidence.promptAfterReload = ((await page.locator('.grammar-prompt').first().textContent().catch(() => '')) || '').trim();
    evidence.answerKind = await fillGrammarAnswer(page);
    await page.locator('.grammar-answer-form button[type="submit"].primary').first().click();
    await page.locator('[data-grammar-session-feedback-live]').waitFor({ state: 'visible', timeout: 15_000 });
    evidence.feedbackText = ((await page.locator('[data-grammar-session-feedback-live]').first().textContent()) || '').trim();
    evidence.versionAfter = await fetchVersion(origin);

    mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });

    evidence.ok = consoleErrors.length === 0
      && pageErrors.length === 0
      && requestFailures.length === 0
      && httpFailures.length === 0
      && evidence.postReloadSurface === 'session'
      && Boolean(evidence.feedbackText);
  } finally {
    await browser.close();
  }

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(evidence, null, 2));
  if (!evidence.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
