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

function readSafeGitCommitSha() {
  try {
    return execSync('git rev-parse HEAD', {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

function normaliseOrigin(value) {
  return String(value || DEFAULT_ORIGIN).replace(/\/+$/, '');
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

async function collectReadingLandingState(page) {
  return page.evaluate(() => {
    const text = (selector) => document.querySelector(selector)?.textContent?.trim() || '';
    const exists = (selector) => Boolean(document.querySelector(selector));
    const activeLayer = document.querySelector('[data-hero-layer="true"]');
    const heroBg = activeLayer ? getComputedStyle(activeLayer).getPropertyValue('--hero-bg') : '';
    const primaryModes = Array.from(document.querySelectorAll('.reading-primary-mode')).map((button) => ({
      mode: button.getAttribute('data-mode-id'),
      pressed: button.getAttribute('aria-pressed'),
      text: button.textContent.trim(),
    }));
    const selectNames = Array.from(document.querySelectorAll('.reading-setup-select select')).map((select) => select.getAttribute('name'));
    return {
      title: text('.reading-hero-title'),
      lede: text('.reading-hero-subtitle'),
      hasSetupGrid: exists('.reading-setup-grid'),
      hasSetupMain: exists('.reading-setup-main'),
      hasHeroBackdrop: exists('.reading-setup-main .hero-backdrop [data-hero-layer="true"]'),
      heroBg,
      primaryModes,
      selectNames,
      startLabel: text('[data-action="reading-start"]'),
      companionText: text('[data-testid="companion-panel"][data-subject="reading"]'),
      morePracticeText: text('.reading-more-practice'),
      bodyWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
}

async function runViewport({ browser, origin, viewport, screenshotDir, startListMode = false }) {
  const failures = {
    pageErrors: [],
    consoleErrors: [],
    requestFailures: [],
    httpFailures: [],
  };
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
    const status = response.status();
    if (status >= 400) failures.httpFailures.push(`${status} ${response.url()}`);
  });

  const screenshotBase = `${viewport.width}x${viewport.height}`;
  try {
    await page.goto(`${origin}/demo`, { waitUntil: 'networkidle', timeout: 45_000 });
    await page.waitForSelector('.subject-grid', { timeout: 20_000 });
    await page.click('[data-action="open-subject"][data-subject-id="reading"]');
    await page.waitForSelector('.reading-setup-main', { timeout: 20_000 });
    await page.waitForSelector('[data-testid="companion-panel"][data-subject="reading"]', { timeout: 10_000 });

    const landingState = await collectReadingLandingState(page);
    assert.equal(landingState.hasSetupGrid, true, 'Reading setup grid did not render.');
    assert.equal(landingState.hasSetupMain, true, 'Reading setup main panel did not render.');
    assert.equal(landingState.hasHeroBackdrop, true, 'Reading hero backdrop did not render.');
    assert.match(landingState.heroBg, /the-moonleaf-archive-/);
    assert.equal(landingState.primaryModes.length, 3, 'Reading primary mode card count mismatch.');
    assert.ok(landingState.primaryModes.some((entry) => entry.mode === 'smart' && entry.pressed === 'true'), 'Smart Review should be the default selected Reading card.');
    assert.deepEqual(landingState.selectNames.sort(), ['difficulty', 'focusSkillId', 'genre', 'viewMode'].sort());
    assert.match(landingState.startLabel, /Start Smart review/i);
    assert.match(landingState.companionText, /Marked/);
    assert.match(landingState.morePracticeText, /More Reading practice/);
    assert.ok(landingState.bodyWidth <= landingState.viewportWidth + 1, `Horizontal overflow detected: body ${landingState.bodyWidth}, viewport ${landingState.viewportWidth}.`);

    const landingScreenshot = path.join(screenshotDir, `reading-landing-${screenshotBase}.png`);
    await page.screenshot({ path: landingScreenshot, fullPage: true });

    let sessionState = null;
    let sessionScreenshot = null;
    if (startListMode) {
      await page.selectOption('select[name="viewMode"]', 'list');
      await page.waitForFunction(() => document.querySelector('select[name="viewMode"]')?.value === 'list', null, { timeout: 15_000 });
      await page.waitForSelector('[data-action="reading-start"]:not([disabled])', { timeout: 15_000 });
      await page.click('[data-action="reading-start"]');
      await page.waitForSelector('.reading-question-list-card, .reading-question-card', { timeout: 20_000 });
      sessionState = await page.evaluate(() => ({
        hasList: Boolean(document.querySelector('.reading-question-list-card')),
        hasQuestionCard: Boolean(document.querySelector('.reading-question-card')),
        hasActiveForm: Boolean(document.querySelector('[data-reading-active-form="true"]')),
        title: document.querySelector('.reading-question-card .section-title')?.textContent?.trim() || '',
      }));
      assert.equal(sessionState.hasActiveForm, true, 'Reading session active form did not render after landing start.');
      sessionScreenshot = path.join(screenshotDir, `reading-session-${screenshotBase}.png`);
      await page.screenshot({ path: sessionScreenshot, fullPage: true });
    }

    assertNoBrowserFailures(failures);
    return {
      viewport,
      landingState,
      sessionState,
      screenshots: {
        landing: landingScreenshot,
        session: sessionScreenshot,
      },
      failures,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const origin = normaliseOrigin(argValue('--origin', process.env.KS2_SMOKE_ORIGIN || DEFAULT_ORIGIN));
  const outPath = path.resolve(ROOT_DIR, argValue('--out', 'reports/reading/reading-landing-production-smoke.json'));
  const screenshotDir = path.resolve(ROOT_DIR, argValue('--screenshot-dir', path.join(path.dirname(outPath), 'reading-landing-production-screenshots')));
  mkdirSync(path.dirname(outPath), { recursive: true });
  mkdirSync(screenshotDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const desktop = await runViewport({
      browser,
      origin,
      viewport: { width: 1280, height: 800 },
      screenshotDir,
      startListMode: true,
    });
    const mobile = await runViewport({
      browser,
      origin,
      viewport: { width: 390, height: 844 },
      screenshotDir,
      startListMode: false,
    });
    const report = {
      ok: true,
      smokeType: 'reading-landing-production',
      origin,
      commitSha: readSafeGitCommitSha(),
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
    smokeType: 'reading-landing-production',
    origin: normaliseOrigin(argValue('--origin', process.env.KS2_SMOKE_ORIGIN || DEFAULT_ORIGIN)),
    commitSha: readSafeGitCommitSha(),
    generatedAt: new Date().toISOString(),
    error: error?.stack || error?.message || String(error),
  }, null, 2));
  process.exitCode = 1;
});
