import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const DEFAULT_ORIGIN = 'https://ks2.eugnel.uk';
const DEFAULT_OUT = 'reports/punctuation/punctuation-guidance-options-production-smoke-2026-05-10.json';
const DEFAULT_SCREENSHOT_DIR = 'output/playwright/punctuation-guidance-options-production-2026-05-10';

function argValue(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return '';
  return argv[index + 1] || '';
}

function normaliseOrigin(value) {
  return String(value || DEFAULT_ORIGIN).replace(/\/+$/, '');
}

function resolveCommitSha(value = '') {
  const explicit = String(value || '').trim();
  if (explicit) return explicit;
  try {
    return String(execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })).trim();
  } catch {
    return '';
  }
}

async function waitForCondition(page, predicate, { timeoutMs = 15_000, intervalMs = 100, label = 'condition' } = {}) {
  const startedAt = Date.now();
  let lastValue = null;
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await predicate();
    if (lastValue) return lastValue;
    await page.waitForTimeout(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function openPunctuationSetup(page, origin) {
  await page.goto(`${origin}/demo`, { waitUntil: 'domcontentloaded' });
  const card = page.locator('[data-action="open-subject"][data-subject-id="punctuation"]').first();
  await card.waitFor({ state: 'visible', timeout: 20_000 });
  await card.click();
  await page.locator('[data-punctuation-phase="setup"]').waitFor({ state: 'visible', timeout: 20_000 });
}

function attachPageDiagnostics(page, result) {
  page.on('console', (message) => {
    if (message.type() === 'error') result.consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    result.requestFailures.push({
      url: request.url(),
      failure: request.failure()?.errorText || '',
    });
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
      result.httpFailures.push({ url: response.url(), status: response.status() });
    }
  });
}

async function disableGuidanceOptions(page) {
  const faded = page.locator('[data-action="punctuation-toggle-pref"][data-pref="showFadedGuidance"]').first();
  const nonScored = page.locator('[data-action="punctuation-toggle-pref"][data-pref="showNonScoredBanner"]').first();
  await faded.waitFor({ state: 'visible', timeout: 15_000 });
  await nonScored.waitFor({ state: 'visible', timeout: 15_000 });
  if (await faded.getAttribute('aria-pressed') !== 'false') await faded.click();
  if (await nonScored.getAttribute('aria-pressed') !== 'false') await nonScored.click();
  await waitForCondition(page, async () => {
    const fadedPressed = await faded.getAttribute('aria-pressed');
    const nonScoredPressed = await nonScored.getAttribute('aria-pressed');
    return fadedPressed === 'false' && nonScoredPressed === 'false';
  }, { label: 'both guidance options disabled' });
  return {
    showFadedGuidancePressed: await faded.getAttribute('aria-pressed') || '',
    showNonScoredBannerPressed: await nonScored.getAttribute('aria-pressed') || '',
  };
}

async function runGpsProbe(browser, origin, screenshotDir) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await context.newPage();
  const result = {
    name: 'gps-non-scored-banner-disabled',
    ok: false,
    showFadedGuidancePressed: '',
    showNonScoredBannerPressed: '',
    gpsBannerVisible: true,
    consoleErrors: [],
    requestFailures: [],
    httpFailures: [],
    setupScreenshot: path.join(screenshotDir, 'gps-options-disabled.png').replace(/\\/g, '/'),
  };
  attachPageDiagnostics(page, result);
  try {
    await openPunctuationSetup(page, origin);
    Object.assign(result, await disableGuidanceOptions(page));
    await mkdir(screenshotDir, { recursive: true });
    await page.screenshot({ path: result.setupScreenshot, fullPage: true });
    const gpsCard = page.locator('[data-action="punctuation-set-mode"][data-value="gps"]').first();
    await gpsCard.click();
    await waitForCondition(page, async () => {
      return await gpsCard.getAttribute('aria-pressed') === 'true';
    }, { label: 'GPS Check mode selected' });
    await page.locator('[data-punctuation-cta]').first().click();
    await page.locator('[data-punctuation-session-scene]').waitFor({ state: 'visible', timeout: 20_000 });
    result.gpsBannerVisible = await page.locator('[data-gps-banner]').isVisible().catch(() => false);
    result.ok = result.showNonScoredBannerPressed === 'false'
      && result.gpsBannerVisible === false
      && result.consoleErrors.length === 0
      && result.requestFailures.length === 0
      && result.httpFailures.length === 0;
  } catch (error) {
    result.error = error?.message || String(error);
  } finally {
    await context.close();
  }
  return result;
}

async function runGuidedProbe(browser, origin, screenshotDir) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await context.newPage();
  const result = {
    name: 'guided-faded-guidance-disabled',
    ok: false,
    showFadedGuidancePressed: '',
    showNonScoredBannerPressed: '',
    teachBoxVisible: true,
    consoleErrors: [],
    requestFailures: [],
    httpFailures: [],
    setupScreenshot: path.join(screenshotDir, 'guided-options-disabled.png').replace(/\\/g, '/'),
  };
  attachPageDiagnostics(page, result);
  try {
    await openPunctuationSetup(page, origin);
    Object.assign(result, await disableGuidanceOptions(page));
    await mkdir(screenshotDir, { recursive: true });
    await page.screenshot({ path: result.setupScreenshot, fullPage: true });
    await page.locator('[data-action="punctuation-open-map"]').first().click();
    await page.locator('.punctuation-map-scene').waitFor({ state: 'visible', timeout: 20_000 });
    await page.locator('[data-action="punctuation-skill-detail-open"][data-value="practise"]').first().click();
    await page.locator('[data-punctuation-start-skill]').first().waitFor({ state: 'visible', timeout: 15_000 });
    await page.locator('[data-punctuation-start-skill]').first().click();
    await page.locator('[data-punctuation-session-scene]').waitFor({ state: 'visible', timeout: 20_000 });
    result.teachBoxVisible = await page.locator('[data-punctuation-session-teach]').isVisible().catch(() => false);
    result.ok = result.showFadedGuidancePressed === 'false'
      && result.teachBoxVisible === false
      && result.consoleErrors.length === 0
      && result.requestFailures.length === 0
      && result.httpFailures.length === 0;
  } catch (error) {
    result.error = error?.message || String(error);
  } finally {
    await context.close();
  }
  return result;
}

async function main() {
  const argv = process.argv.slice(2);
  const origin = normaliseOrigin(argValue(argv, '--origin') || process.env.KS2_PRODUCTION_ORIGIN);
  const out = argValue(argv, '--out') || DEFAULT_OUT;
  const screenshotDir = argValue(argv, '--screenshot-dir') || DEFAULT_SCREENSHOT_DIR;
  const workerCommitSha = resolveCommitSha(argValue(argv, '--commit-sha') || process.env.KS2_WORKER_COMMIT_SHA);
  const workerVersionId = String(argValue(argv, '--worker-version-id') || process.env.KS2_WORKER_VERSION_ID || '').trim();
  const startedAt = new Date().toISOString();
  const browser = await chromium.launch();
  let probes = [];

  try {
    probes = [
      await runGpsProbe(browser, origin, screenshotDir),
      await runGuidedProbe(browser, origin, screenshotDir),
    ];
  } finally {
    await browser.close();
  }

  const report = {
    ok: probes.every((probe) => probe.ok),
    origin,
    workerCommitSha,
    workerVersionId,
    startedAt,
    completedAt: new Date().toISOString(),
    probes,
  };
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const lines = [
    `punctuation-guidance-options-production-smoke @ ${origin}`,
    `ok: ${report.ok}`,
    ...probes.map((probe) => `${probe.name}: ok=${probe.ok}`),
    `wrote: ${out}`,
  ];
  console.log(lines.join('\n'));
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[punctuation-guidance-options-production-smoke] ${error?.stack || error?.message || error}`);
  process.exitCode = 1;
});
