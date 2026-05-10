import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const DEFAULT_ORIGIN = 'https://ks2.eugnel.uk';
const DEFAULT_OUT = 'reports/punctuation/punctuation-round-length-production-smoke-2026-05-10.json';
const DEFAULT_SCREENSHOT_DIR = 'output/playwright/punctuation-round-length-production-2026-05-10';
const LENGTH_PROBES = Object.freeze([
  { name: 'desktop-1024', viewport: { width: 1024, height: 768 }, length: '8' },
  { name: 'mobile-390', viewport: { width: 390, height: 844 }, length: '12', isMobile: true },
]);

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

async function probeLength(browser, origin, probe, screenshotDir) {
  const context = await browser.newContext({
    viewport: probe.viewport,
    isMobile: probe.isMobile === true,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const requestFailures = [];
  const httpFailures = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    requestFailures.push({
      url: request.url(),
      failure: request.failure()?.errorText || '',
    });
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
      httpFailures.push({ url: response.url(), status: response.status() });
    }
  });

  const result = {
    name: probe.name,
    viewport: probe.viewport,
    length: probe.length,
    ok: false,
    ctaRoundLength: '',
    sessionTextMatched: false,
    selectedAriaChecked: '',
    consoleErrors,
    requestFailures,
    httpFailures,
    screenshot: path.join(screenshotDir, `${probe.name}-selected-${probe.length}.png`).replace(/\\/g, '/'),
  };

  try {
    await openPunctuationSetup(page, origin);
    const option = page.locator(
      `[data-action="punctuation-set-round-length"][data-value="${probe.length}"]`,
    ).first();
    await option.waitFor({ state: 'visible', timeout: 15_000 });
    await option.click();

    await waitForCondition(page, async () => {
      const checked = await option.getAttribute('aria-checked');
      return checked === 'true' ? checked : '';
    }, { label: `${probe.name} selected ${probe.length}` });
    result.selectedAriaChecked = await option.getAttribute('aria-checked') || '';

    const cta = page.locator('[data-punctuation-cta]').first();
    await waitForCondition(page, async () => {
      const roundLength = await cta.getAttribute('data-round-length');
      return roundLength === probe.length ? roundLength : '';
    }, { label: `${probe.name} CTA round length ${probe.length}` });
    result.ctaRoundLength = await cta.getAttribute('data-round-length') || '';

    await mkdir(screenshotDir, { recursive: true });
    await page.screenshot({ path: result.screenshot, fullPage: true });

    await cta.click();
    await page.locator('[data-punctuation-session-scene]').waitFor({ state: 'visible', timeout: 20_000 });
    result.sessionTextMatched = await waitForCondition(page, async () => {
      const text = await page.locator('body').innerText({ timeout: 2_000 });
      return new RegExp(`\\b1\\s+of\\s+${probe.length}\\b`, 'i').test(text);
    }, { label: `${probe.name} session length ${probe.length}` });

    result.ok = result.selectedAriaChecked === 'true'
      && result.ctaRoundLength === probe.length
      && result.sessionTextMatched === true
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
  const probes = [];

  try {
    for (const probe of LENGTH_PROBES) {
      probes.push(await probeLength(browser, origin, probe, screenshotDir));
    }
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
    `punctuation-round-length-production-smoke @ ${origin}`,
    `ok: ${report.ok}`,
    ...probes.map((probe) => (
      `${probe.name}: length ${probe.length}, selected=${probe.selectedAriaChecked}, cta=${probe.ctaRoundLength}, session=${probe.sessionTextMatched}, ok=${probe.ok}`
    )),
    `wrote: ${out}`,
  ];
  console.log(lines.join('\n'));
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[punctuation-round-length-production-smoke] ${error?.stack || error?.message || error}`);
  process.exitCode = 1;
});
