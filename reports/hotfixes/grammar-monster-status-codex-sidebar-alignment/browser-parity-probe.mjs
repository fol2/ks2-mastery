import { writeFileSync } from 'node:fs';

import { chromium } from 'playwright';

import { correctResponseFor } from '../../../scripts/grammar-production-smoke.mjs';
import { loadBootstrap, subjectCommand } from '../../../scripts/lib/production-smoke.mjs';

const origin = 'https://ks2.eugnel.uk';
const commitSha = 'e40cc29ef65a02646c39487bb29744e689193f9f';
const workerVersionId = '4026c822-157a-427c-90f3-0362d393adea';
const evidenceDir = 'reports/hotfixes/grammar-monster-status-codex-sidebar-alignment';
const out = `${evidenceDir}/browser-codex-sidebar-parity-2026-05-08.json`;
const sidebarShot = `${evidenceDir}/grammar-sidebar-production-2026-05-08.png`;
const codexShot = `${evidenceDir}/codex-production-2026-05-08.png`;

const cdpUrl = process.env.AGENT_BROWSER_CDP_URL || '';
const browser = cdpUrl
  ? await chromium.connectOverCDP(cdpUrl)
  : await chromium.launch({ headless: true });
const context = browser.contexts()[0] || await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
await page.setViewportSize({ width: 1280, height: 900 });

try {
  await context.clearCookies();
  await page.goto(`${origin}/demo`, { waitUntil: 'networkidle' });
  const cookies = await page.context().cookies(origin);
  const session = cookies.find((cookie) => cookie.name === 'ks2_session');
  if (!session) throw new Error('Missing ks2_session cookie.');

  const cookie = `ks2_session=${session.value}`;
  const bootstrap = await loadBootstrap(origin, cookie);
  let revision = bootstrap.revision;
  const { learnerId } = bootstrap;

  let step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'grammar',
    learnerId,
    revision,
    command: 'start-session',
    payload: {
      mode: 'smart',
      roundLength: 1,
      templateId: 'qg_modal_verb_explain',
      seed: 7,
    },
  });
  revision = step.revision;

  step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'grammar',
    learnerId,
    revision,
    command: 'submit-answer',
    payload: {
      response: correctResponseFor(step.payload.subjectReadModel.session.currentItem),
    },
  });
  revision = step.revision;

  await subjectCommand({
    origin,
    cookie,
    subjectId: 'grammar',
    learnerId,
    revision,
    command: 'continue-session',
  });

  await page.goto(`${origin}/?demo=1`, { waitUntil: 'networkidle' });
  await page.locator('.subject-card[data-subject-id="grammar"]').click();
  await page.waitForSelector('.ss-meadow-art', { timeout: 15_000 });
  const sidebar = await page.evaluate(() => [...document.querySelectorAll('.ss-meadow-art')].map((img) => ({
    src: img.getAttribute('src'),
    srcset: img.getAttribute('srcset'),
    cellClass: img.closest('.ss-meadow-cell')?.className || '',
  })));
  await page.screenshot({ path: sidebarShot, fullPage: true });

  await page.locator('.ss-codex-link[data-action="open-codex"]').click();
  await page.waitForSelector('.codex-page', { timeout: 15_000 });
  const codex = await page.evaluate(() => [...document.querySelectorAll('.codex-card')]
    .map((card) => ({
      className: card.className,
      text: card.textContent.trim().replace(/\s+/g, ' ').slice(0, 220),
      img: card.querySelector('img')?.getAttribute('src') || null,
      imgAlt: card.querySelector('img')?.getAttribute('alt') || null,
    }))
    .filter((entry) => /Chronalyx/i.test(entry.text) || /chronalyx/i.test(entry.img || ''))
    .slice(0, 5));
  await page.screenshot({ path: codexShot, fullPage: true });

  const sidebarChronalyx = sidebar.find((entry) => (
    /chronalyx/i.test(entry.src || '') || /chronalyx/i.test(entry.srcset || '')
  ));
  const codexChronalyx = codex.find((entry) => (
    /chronalyx/i.test(entry.img || '') || /Chronalyx/i.test(entry.text || '')
  ));
  const sidebarMatch = (sidebarChronalyx?.src || '').match(/chronalyx-(b\d+)-(\d+)\./);
  const codexMatch = (codexChronalyx?.img || '').match(/chronalyx-(b\d+)-(\d+)\./);
  const checks = {
    sidebarChronalyxStage0: sidebarMatch?.[2] === '0',
    codexChronalyxStage0: codexMatch?.[2] === '0',
    sidebarCodexBranchMatch: Boolean(sidebarMatch?.[1]) && sidebarMatch?.[1] === codexMatch?.[1],
    sidebarCodexStageMatch: Boolean(sidebarMatch?.[2]) && sidebarMatch?.[2] === codexMatch?.[2],
    codexClassStage0: /stage-0/.test(codexChronalyx?.className || ''),
    codexEggAlt: /Egg/.test(codexChronalyx?.imgAlt || ''),
  };
  const ok = Object.values(checks).every(Boolean);
  const report = {
    ok,
    origin,
    commitSha,
    workerVersionId,
    learnerFixtureType: 'browser-demo-session',
    learnerId,
    checks,
    parsedAssets: {
      sidebarBranch: sidebarMatch?.[1] || null,
      sidebarStage: sidebarMatch?.[2] || null,
      codexBranch: codexMatch?.[1] || null,
      codexStage: codexMatch?.[2] || null,
    },
    sidebar,
    codex,
    screenshots: {
      sidebar: sidebarShot,
      codex: codexShot,
    },
    timestamp: new Date().toISOString(),
  };

  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  if (!ok) {
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
}
