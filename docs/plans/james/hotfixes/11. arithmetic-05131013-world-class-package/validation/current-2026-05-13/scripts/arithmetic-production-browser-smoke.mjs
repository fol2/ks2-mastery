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

function writeJson(outPath, value) {
  if (!outPath) return;
  const absolute = path.resolve(ROOT_DIR, outPath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function resolveOutPath(rawPath) {
  if (!rawPath) return '';
  const absolute = path.resolve(ROOT_DIR, rawPath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  return absolute;
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

async function main() {
  const origin = configuredOrigin();
  const outPath = argValue('--out', '');
  const screenshotPath = resolveOutPath(argValue('--screenshot', ''));
  const demo = await createDemoSession(origin);
  const cookie = cookieParts(demo.cookie);
  const url = new URL(origin);

  const consoleErrors = [];
  const consoleWarnings = [];
  const pageErrors = [];
  const requestFailures = [];
  const httpFailures = [];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    baseURL: origin,
  });
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
  page.on('console', (message) => {
    const entry = {
      type: message.type(),
      text: message.text(),
      location: message.location(),
    };
    if (message.type() === 'error') consoleErrors.push(entry);
    if (message.type() === 'warning') consoleWarnings.push(entry);
  });
  page.on('pageerror', (error) => {
    pageErrors.push({ message: error?.message || String(error), stack: error?.stack || '' });
  });
  page.on('requestfailed', (request) => {
    requestFailures.push({
      method: request.method(),
      url: request.url(),
      failure: request.failure()?.errorText || '',
      resourceType: request.resourceType(),
    });
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      httpFailures.push({
        status: response.status(),
        url: response.url(),
        requestMethod: response.request().method(),
        resourceType: response.request().resourceType(),
      });
    }
  });

  try {
    await page.goto(origin, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.locator('button[data-action="open-subject"][data-subject-id="arithmetic"]').click({ timeout: 15_000 });
    await page.getByRole('heading', { name: 'Arithmetic mission' }).waitFor({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Start Arithmetic' }).click({ timeout: 15_000 });
    await page.locator('form.arithmetic-answer-form input[name="answer"]').waitFor({ timeout: 15_000 });
    await page.locator('form.arithmetic-answer-form input[name="answer"]').fill('999999');
    await page.getByRole('button', { name: 'Submit answer' }).click({ timeout: 15_000 });
    await page.getByText('Worked solution').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(1_000);

    if (screenshotPath) {
      await page.screenshot({ path: screenshotPath, fullPage: false });
    }

    assert.equal(consoleErrors.length, 0, `Console errors: ${JSON.stringify(consoleErrors, null, 2)}`);
    assert.equal(pageErrors.length, 0, `Page errors: ${JSON.stringify(pageErrors, null, 2)}`);
    assert.equal(requestFailures.length, 0, `Request failures: ${JSON.stringify(requestFailures, null, 2)}`);
    assert.equal(httpFailures.length, 0, `HTTP failures: ${JSON.stringify(httpFailures, null, 2)}`);

    const evidence = {
      ok: true,
      smokeType: argValue('--smoke-type', 'arithmetic-production-browser'),
      environment: origin === 'https://ks2.eugnel.uk' ? 'production' : 'non-production',
      origin,
      learnerFixtureType: 'demo-session-cookie',
      accountId: demo.session.accountId,
      learnerId: demo.session.learnerId,
      browser: 'chromium',
      viewport: { width: 1440, height: 1000 },
      flow: [
        'open dashboard with demo session cookie',
        'open Arithmetic subject',
        'start Smart Arithmetic practice',
        'submit an incorrect answer',
        'observe worked solution feedback',
      ],
      consoleErrors,
      consoleWarnings,
      pageErrors,
      requestFailures,
      httpFailures,
      screenshot: screenshotPath ? path.relative(ROOT_DIR, screenshotPath).replaceAll(path.sep, '/') : null,
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
      smokeType: argValue('--smoke-type', 'arithmetic-production-browser'),
      error: error?.stack || error?.message || String(error),
      finishedAt: new Date().toISOString(),
    };
    writeJson(argValue('--out', ''), evidence);
    console.error(`[arithmetic-production-browser-smoke] ${evidence.error}`);
    process.exit(1);
  });
}
