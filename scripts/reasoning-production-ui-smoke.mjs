#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), '..');
const DEFAULT_ORIGIN = 'https://ks2.eugnel.uk';

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function originValue() {
  return String(argValue('--origin', process.env.KS2_SMOKE_ORIGIN || DEFAULT_ORIGIN)).replace(/\/+$/, '');
}

function currentCommit() {
  try {
    return execSync('git rev-parse HEAD', {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function assertNoBrowserFailures(failures) {
  const allFailures = [
    ...failures.pageErrors.map((entry) => `pageerror: ${entry}`),
    ...failures.consoleErrors.map((entry) => `console: ${entry}`),
    ...failures.requestFailures.map((entry) => `request: ${entry}`),
    ...failures.httpFailures.map((entry) => `http: ${entry}`),
  ];
  assert.deepEqual(allFailures, [], `Browser smoke failures:\n${allFailures.join('\n')}`);
}

async function collectSetupState(page) {
  return page.evaluate(() => {
    const text = (selector) => document.querySelector(selector)?.textContent?.trim() || '';
    const exists = (selector) => Boolean(document.querySelector(selector));
    const activeLayer = document.querySelector('[data-hero-layer="true"]');
    const heroBg = activeLayer ? getComputedStyle(activeLayer).getPropertyValue('--hero-bg') : '';
    const primaryModes = Array.from(document.querySelectorAll('.reasoning-mode-row [data-mode-id]')).map((button) => ({
      mode: button.getAttribute('data-mode-id'),
      pressed: button.classList.contains('selected'),
      text: button.textContent.trim(),
    }));
    const selectNames = Array.from(document.querySelectorAll('.reasoning-setup-main select')).map((select) => select.getAttribute('name'));
    return {
      title: text('.reasoning-setup-main .reading-hero-title'),
      lede: text('.reasoning-setup-main .reading-hero-subtitle'),
      hasSetupGrid: exists('.reasoning-setup-grid'),
      hasSetupMain: exists('.reasoning-setup-main'),
      hasHeroBackdrop: exists('.reasoning-setup-main .hero-backdrop [data-hero-layer="true"]'),
      heroBg,
      primaryModes,
      selectNames,
      startLabel: text('[data-action="reasoning-start"]'),
      companionText: text('[data-testid="companion-panel"][data-subject="reasoning"]'),
      morePracticeText: text('.reasoning-more-practice'),
      analyticsText: text('.reasoning-analytics'),
      bodyWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
}

async function collectSessionState(page) {
  return page.evaluate(() => ({
    hasHud: Boolean(document.querySelector('.reasoning-session-hud')),
    hasQuestionCard: Boolean(document.querySelector('.reasoning-question-card, .reasoning-question-list-card')),
    hasActiveForm: Boolean(document.querySelector('[data-reasoning-active-form="true"]')),
    title: document.querySelector('.reasoning-question-card .section-title, .reasoning-question-list-card .section-title')?.textContent?.trim() || '',
    guidance: document.querySelector('.reasoning-session-guidance')?.textContent?.trim() || '',
    bodyWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
}

async function runViewport({ browser, origin, viewport, screenshotDir, startSession }) {
  const failures = { pageErrors: [], consoleErrors: [], requestFailures: [], httpFailures: [] };
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.pageErrors.push(error?.message || String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    failures.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`.trim());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) failures.httpFailures.push(`${response.status()} ${response.url()}`);
  });

  const viewportLabel = `${viewport.width}x${viewport.height}`;
  try {
    await page.goto(`${origin}/demo`, { waitUntil: 'networkidle', timeout: 45_000 });
    await page.waitForSelector('.subject-grid', { timeout: 20_000 });
    await page.click('[data-action="open-subject"][data-subject-id="reasoning"]');
    await page.waitForSelector('.reasoning-setup-main', { timeout: 20_000 });
    await page.waitForSelector('[data-testid="companion-panel"][data-subject="reasoning"]', { timeout: 10_000 });

    const setupState = await collectSetupState(page);
    assert.equal(setupState.hasSetupGrid, true, 'Reasoning setup grid did not render.');
    assert.equal(setupState.hasSetupMain, true, 'Reasoning setup main panel did not render.');
    assert.equal(setupState.hasHeroBackdrop, true, 'Reasoning hero backdrop did not render.');
    assert.match(setupState.heroBg, /paradox-spires-/);
    assert.equal(setupState.primaryModes.length, 3, 'Reasoning primary mode count mismatch.');
    assert.ok(setupState.primaryModes.some((entry) => entry.mode === 'smart' && entry.pressed === true), 'Smart Review should be selected by default.');
    assert.deepEqual(setupState.selectNames.sort(), ['focusSkillId', 'roundLength', 'setSize', 'viewMode'].sort());
    assert.match(setupState.startLabel, /Start Smart Review/i);
    assert.match(setupState.companionText, /Marked/);
    assert.match(setupState.morePracticeText, /More Reasoning practice/);
    assert.match(setupState.analyticsText, /Reasoning strength/);
    assert.ok(setupState.bodyWidth <= setupState.viewportWidth + 1, `Setup horizontal overflow: body ${setupState.bodyWidth}, viewport ${setupState.viewportWidth}.`);

    const setupScreenshot = path.join(screenshotDir, `reasoning-setup-${viewportLabel}.png`);
    await page.screenshot({ path: setupScreenshot, fullPage: true });

    let sessionState = null;
    let sessionScreenshot = null;
    if (startSession) {
      await page.waitForSelector('[data-action="reasoning-start"]:not([disabled])', { timeout: 20_000 });
      await page.click('[data-action="reasoning-start"]');
      await page.waitForSelector('[data-reasoning-active-form="true"]', { timeout: 20_000 });
      sessionState = await collectSessionState(page);
      assert.equal(sessionState.hasHud, true, 'Reasoning session HUD did not render.');
      assert.equal(sessionState.hasQuestionCard, true, 'Reasoning question card did not render.');
      assert.equal(sessionState.hasActiveForm, true, 'Reasoning active form did not render.');
      assert.match(sessionState.title, /Solve the reasoning problem|Answer the question list/);
      assert.ok(sessionState.bodyWidth <= sessionState.viewportWidth + 1, `Session horizontal overflow: body ${sessionState.bodyWidth}, viewport ${sessionState.viewportWidth}.`);
      sessionScreenshot = path.join(screenshotDir, `reasoning-session-${viewportLabel}.png`);
      await page.screenshot({ path: sessionScreenshot, fullPage: true });
    }

    assertNoBrowserFailures(failures);
    return {
      viewport,
      setupState,
      sessionState,
      screenshots: {
        setup: setupScreenshot,
        session: sessionScreenshot,
      },
      failures,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const origin = originValue();
  const outPath = path.resolve(ROOT_DIR, argValue('--out', 'reports/reasoning/reasoning-production-ui-smoke.json'));
  const screenshotDir = path.resolve(ROOT_DIR, argValue('--screenshot-dir', path.join(path.dirname(outPath), 'screenshots')));
  mkdirSync(path.dirname(outPath), { recursive: true });
  mkdirSync(screenshotDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const desktop = await runViewport({
      browser,
      origin,
      viewport: { width: 1280, height: 800 },
      screenshotDir,
      startSession: true,
    });
    const mobile = await runViewport({
      browser,
      origin,
      viewport: { width: 390, height: 844 },
      screenshotDir,
      startSession: false,
    });
    const report = {
      ok: true,
      smokeType: 'reasoning-production-ui',
      origin,
      sourceCommit: currentCommit(),
      generatedAt: new Date().toISOString(),
      viewports: [desktop, mobile],
    };
    writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({
    ok: false,
    smokeType: 'reasoning-production-ui',
    origin: originValue(),
    sourceCommit: currentCommit(),
    generatedAt: new Date().toISOString(),
    error: error?.stack || error?.message || String(error),
  }, null, 2));
  process.exitCode = 1;
});
