import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

import {
  assertOkResponse,
  configuredOrigin,
  createDemoSession,
  createRequestId,
  getJson,
  loadBootstrap,
  postJson,
  subjectCommand,
} from '../../../../../scripts/lib/production-smoke.mjs';
import {
  assertNoForbiddenPunctuationReadModelKeys,
  assertPunctuationP2RuntimeStats,
  punctuationAnswerFor,
  punctuationExpectedContextFor,
} from '../../../../../scripts/punctuation-production-smoke.mjs';

const OUT = process.env.HERO_SMOKE_OUT
  || 'docs/plans/james/hero-mode/A/hero-mode-click-coin-e2e-smoke-2026-05-11.json';
const SCREENSHOT_DIR = process.env.HERO_SMOKE_SCREENSHOT_DIR
  || 'docs/plans/james/hero-mode/A/hero-mode-click-coin-e2e-screenshots-2026-05-11';
const DATABASE = 'ks2-mastery-db';

function hashId(value) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}

function runWrangler(args, { input = null } = {}) {
  const env = { ...process.env };
  delete env.CLOUDFLARE_API_TOKEN;
  env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD || '1';
  return execFileSync(process.execPath, ['scripts/wrangler-oauth.mjs', ...args], {
    encoding: 'utf8',
    env,
    input,
  });
}

function runD1Query(sql) {
  const stdout = runWrangler(['d1', 'execute', DATABASE, '--remote', '--json', '--command', sql]);
  const parsed = JSON.parse(stdout);
  const first = Array.isArray(parsed) ? parsed[0] : null;
  if (!first?.success) {
    throw new Error(`D1 query failed: ${sql}`);
  }
  return first.results || [];
}

function runD1Statement(sql) {
  const stdout = runWrangler(['d1', 'execute', DATABASE, '--remote', '--json', '--command', sql]);
  const parsed = JSON.parse(stdout);
  const first = Array.isArray(parsed) ? parsed[0] : null;
  if (!first?.success) {
    throw new Error(`D1 statement failed: ${sql}`);
  }
  return first.meta || {};
}

function sqlString(value) {
  return `'${String(value || '').replace(/'/g, "''")}'`;
}

function putSecret(name, value) {
  const stdout = runWrangler(['secret', 'put', name], { input: `${value}\n` });
  return {
    name,
    valueKind: name.endsWith('_ACCOUNTS') ? 'json-array' : 'scalar',
    status: stdout.includes(`Uploaded secret ${name}`) ? 'uploaded' : 'unknown',
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeEvidence(report) {
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function postHeroCommand(origin, cookie, body) {
  const result = await postJson(origin, '/api/hero/command', body, { cookie });
  assertOkResponse(`Hero command ${body.command}`, result);
  return result.payload;
}

function nextRevision(payload, previousRevision) {
  const applied = Number(payload?.mutation?.appliedRevision);
  return Number.isFinite(applied) ? applied : previousRevision;
}

async function completePunctuationHeroSession({ origin, cookie, learnerId, revision, startPayload }) {
  let model = startPayload?.subjectReadModel;
  assert.equal(startPayload?.heroLaunch?.subjectId, 'punctuation', 'Hero smoke selected task was not punctuation.');
  assert.ok(model, 'Hero start-task response did not include a subject read model.');

  const answered = [];
  let guard = 0;
  while (guard < 30) {
    guard += 1;
    assertPunctuationP2RuntimeStats(model, `hero.enabledSmoke.punctuation.${guard}`);
    assertNoForbiddenPunctuationReadModelKeys(model, `hero.enabledSmoke.punctuation.${guard}`);

    if (model?.phase === 'summary') {
      return {
        revision,
        summaryTotal: Number(model.summary?.total) || 0,
        answered,
      };
    }

    if (model?.phase === 'feedback') {
      const step = await subjectCommand({
        origin,
        cookie,
        subjectId: 'punctuation',
        learnerId,
        revision,
        command: 'continue-session',
      });
      revision = step.revision;
      model = step.payload.subjectReadModel;
      continue;
    }

    assert.equal(model?.phase, 'active-item', `Unexpected punctuation phase ${model?.phase}.`);
    const currentItem = model.session?.currentItem;
    const answer = punctuationAnswerFor(currentItem);
    const step = await subjectCommand({
      origin,
      cookie,
      subjectId: 'punctuation',
      learnerId,
      revision,
      command: 'submit-answer',
      payload: {
        ...answer,
        ...punctuationExpectedContextFor(model.session),
      },
    });
    revision = step.revision;
    model = step.payload.subjectReadModel;
    answered.push({ itemId: currentItem.id, phaseAfterSubmit: model?.phase || null });
  }

  throw new Error('Punctuation Hero session did not reach summary within guard limit.');
}

async function primeDemoPunctuation({ origin, cookie, learnerId, revision }) {
  let step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'punctuation',
    learnerId,
    revision,
    command: 'start-session',
    payload: { mode: 'smart', roundLength: '1' },
  });
  revision = step.revision;
  let model = step.payload.subjectReadModel;
  assert.equal(model?.phase, 'active-item', 'Demo punctuation priming did not start an active item.');
  const answer = punctuationAnswerFor(model.session?.currentItem);
  step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'punctuation',
    learnerId,
    revision,
    command: 'submit-answer',
    payload: {
      ...answer,
      ...punctuationExpectedContextFor(model.session),
    },
  });
  revision = step.revision;
  model = step.payload.subjectReadModel;
  if (model?.phase === 'feedback') {
    step = await subjectCommand({
      origin,
      cookie,
      subjectId: 'punctuation',
      learnerId,
      revision,
      command: 'continue-session',
    });
    revision = step.revision;
    model = step.payload.subjectReadModel;
  }
  assert.equal(model?.phase, 'summary', 'Demo punctuation priming did not reach summary.');
  return {
    revision,
    summaryTotal: Number(model.summary?.total) || 0,
  };
}

function visibleHero(payload) {
  const hero = payload?.hero || payload;
  return hero?.ui?.enabled === true || hero?.heroEnabled === true;
}

function sessionCookieForBrowser(origin, cookieHeader) {
  const url = new URL(origin);
  const [pair] = String(cookieHeader || '').split(';');
  const separator = pair.indexOf('=');
  if (separator === -1) throw new Error('Demo session cookie did not contain a name/value pair.');
  return {
    name: pair.slice(0, separator).trim(),
    value: pair.slice(separator + 1).trim(),
    domain: url.hostname,
    path: '/',
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'Lax',
  };
}

async function assertNoHorizontalOverflow(page, selector = 'html') {
  return page.evaluate((targetSelector) => {
    const target = document.querySelector(targetSelector) || document.documentElement;
    return {
      selector: targetSelector,
      clientWidth: target.clientWidth,
      scrollWidth: target.scrollWidth,
      ok: target.scrollWidth <= target.clientWidth + 1,
    };
  }, selector);
}

async function runEnabledBrowserUiSmoke({ origin, cookie }) {
  const browser = await chromium.launch();
  const consoleErrors = [];
  const requestFailures = [];
  const httpFailures = [];
  const screenshots = {};
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    await context.addCookies([sessionCookieForBrowser(origin, cookie)]);
    const page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('requestfailed', (request) => {
      requestFailures.push({ url: request.url(), failure: request.failure()?.errorText || '' });
    });
    page.on('response', (response) => {
      if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
        httpFailures.push({ url: response.url(), status: response.status() });
      }
    });

    await mkdir(SCREENSHOT_DIR, { recursive: true });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-hero-card]').waitFor({ state: 'visible', timeout: 30_000 });
    const homeCampPanelCount = await page.locator('[data-hero-camp-panel]').count();
    assert.equal(homeCampPanelCount, 0, 'Hero Camp panel must not render on the dashboard hero.');
    await page.locator('[data-action="open-hero-camp"]').waitFor({ state: 'visible', timeout: 30_000 });
    const homeOverflow = await assertNoHorizontalOverflow(page);
    screenshots.home = path.join(SCREENSHOT_DIR, 'mobile-home-hero-quest.png').replace(/\\/g, '/');
    await page.screenshot({ path: screenshots.home, fullPage: true });

    await page.locator('[data-action="open-hero-camp"]').first().click();
    await page.locator('[data-hero-camp-page]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-hero-camp-panel]').waitFor({ state: 'visible', timeout: 30_000 });
    const campMonsterCount = await page.locator('[data-monster-id]').count();
    const campOverflow = await assertNoHorizontalOverflow(page);
    screenshots.camp = path.join(SCREENSHOT_DIR, 'mobile-hero-camp-page.png').replace(/\\/g, '/');
    await page.screenshot({ path: screenshots.camp, fullPage: true });

    await page.locator('[data-action="hero-camp-back-dashboard"]').first().click();
    await page.locator('[data-hero-card]').waitFor({ state: 'visible', timeout: 30_000 });

    await page.locator('[data-action="open-subject"][data-subject-id="punctuation"]').first().click();
    await page.locator('[data-punctuation-phase="setup"]').waitFor({ state: 'visible', timeout: 30_000 });
    const subjectOverflow = await assertNoHorizontalOverflow(page);
    screenshots.subject = path.join(SCREENSHOT_DIR, 'mobile-subject-punctuation.png').replace(/\\/g, '/');
    await page.screenshot({ path: screenshots.subject, fullPage: true });

    await page.locator('[data-action="open-codex"]').first().click();
    await page.locator('.codex-page').waitFor({ state: 'visible', timeout: 30_000 });
    const codexOverflow = await assertNoHorizontalOverflow(page);
    screenshots.codex = path.join(SCREENSHOT_DIR, 'mobile-codex.png').replace(/\\/g, '/');
    await page.screenshot({ path: screenshots.codex, fullPage: true });

    await page.locator('[data-action="navigate-home"]').first().click();
    await page.locator('[data-hero-card]').waitFor({ state: 'visible', timeout: 30_000 });
    await context.close();

    return {
      name: 'enabled-browser-ui-mobile-390',
      pass: homeOverflow.ok && campOverflow.ok && subjectOverflow.ok && codexOverflow.ok
        && campMonsterCount >= 6
        && consoleErrors.length === 0
        && requestFailures.length === 0
        && httpFailures.length === 0,
      viewport: { width: 390, height: 844 },
      checks: {
        heroQuestCardVisible: true,
        heroCampPanelAbsentOnHome: homeCampPanelCount === 0,
        heroCampEntryVisible: true,
        heroCampPanelVisibleOnCampPage: true,
        heroCampMonsterCount: campMonsterCount,
        homeToSubject: true,
        homeToHeroCamp: true,
        heroCampToHome: true,
        subjectToCodex: true,
        codexToHome: true,
        overflow: {
          home: homeOverflow,
          camp: campOverflow,
          subject: subjectOverflow,
          codex: codexOverflow,
        },
      },
      consoleErrors,
      requestFailures,
      httpFailures,
      screenshots,
    };
  } finally {
    await browser.close();
  }
}

async function runClaimedBrowserUiSmoke({ origin, cookie }) {
  const browser = await chromium.launch();
  const consoleErrors = [];
  const requestFailures = [];
  const httpFailures = [];
  const screenshots = {};
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    await context.addCookies([sessionCookieForBrowser(origin, cookie)]);
    const page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('requestfailed', (request) => {
      requestFailures.push({ url: request.url(), failure: request.failure()?.errorText || '' });
    });
    page.on('response', (response) => {
      if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
        httpFailures.push({ url: response.url(), status: response.status() });
      }
    });

    await mkdir(SCREENSHOT_DIR, { recursive: true });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.locator('.hero-quest-card--complete').waitFor({ state: 'visible', timeout: 30_000 });
    const coinsAddedText = await page.locator('.hero-quest-card__coins-added').first().textContent({ timeout: 30_000 });
    const balanceText = await page.locator('.hero-quest-card__coin-balance').first().textContent({ timeout: 30_000 });
    assert.match(coinsAddedText || '', /\b100\b/, 'Completed Hero UI did not show 100 awarded coins.');
    assert.match(balanceText || '', /Balance:\s*100\b/, 'Completed Hero UI did not show a 100 coin balance.');
    const homeOverflow = await assertNoHorizontalOverflow(page);
    screenshots.postClaimHome = path.join(SCREENSHOT_DIR, 'mobile-home-hero-claim-coins.png').replace(/\\/g, '/');
    await page.screenshot({ path: screenshots.postClaimHome, fullPage: true });
    await context.close();

    return {
      name: 'claimed-browser-ui-mobile-390',
      pass: homeOverflow.ok
        && consoleErrors.length === 0
        && requestFailures.length === 0
        && httpFailures.length === 0,
      viewport: { width: 390, height: 844 },
      checks: {
        heroCompleteCardVisible: true,
        coinsAwardedText: coinsAddedText,
        coinBalanceText: balanceText,
        overflow: {
          home: homeOverflow,
        },
      },
      consoleErrors,
      requestFailures,
      httpFailures,
      screenshots,
    };
  } finally {
    await browser.close();
  }
}

async function waitForHeroVisibility({ origin, cookie, learnerId, expectedVisible, label, timeoutMs = 180_000 }) {
  const started = Date.now();
  const observations = [];
  let lastResult = null;
  while (Date.now() - started < timeoutMs) {
    const result = await getJson(origin, `/api/hero/read-model?learnerId=${encodeURIComponent(learnerId)}`, { cookie });
    const isVisible = result.response.ok && visibleHero(result.payload);
    const isHidden = result.response.status === 404
      || result.payload?.code === 'hero_shadow_disabled'
      || result.payload?.hero?.ui?.enabled === false;
    observations.push({
      status: result.response.status,
      visible: isVisible,
      hidden: isHidden,
      code: result.payload?.code || result.payload?.error?.code || null,
    });
    lastResult = result;
    if (expectedVisible ? isVisible : isHidden) {
      return {
        result,
        observations,
        waitedMs: Date.now() - started,
      };
    }
    await sleep(5_000);
  }
  throw new Error(`${label} did not reach expected Hero visibility ${expectedVisible ? 'visible' : 'hidden'}; last=${JSON.stringify(observations.at(-1) || null)}`);
}

function cleanupDemoRuntimeRows({ accountId, learnerId }) {
  const account = sqlString(accountId);
  const learner = sqlString(learnerId);
  const ownershipRows = runD1Query(`
    SELECT COUNT(1) AS count
    FROM account_learner_memberships m
    JOIN adult_accounts a ON a.id = m.account_id
    WHERE m.account_id = ${account}
      AND m.learner_id = ${learner}
      AND a.account_type = 'demo'
  `);
  assert.equal(Number(ownershipRows[0]?.count) || 0, 1, 'Refusing direct cleanup because learner was not owned by the demo account.');

  const statements = [
    ['event_log', `DELETE FROM event_log WHERE learner_id = ${learner}`],
    ['child_game_state', `DELETE FROM child_game_state WHERE learner_id = ${learner}`],
    ['practice_sessions', `DELETE FROM practice_sessions WHERE learner_id = ${learner}`],
    ['child_subject_state', `DELETE FROM child_subject_state WHERE learner_id = ${learner}`],
    ['learner_activity_feed', `DELETE FROM learner_activity_feed WHERE learner_id = ${learner}`],
    ['learner_read_models', `DELETE FROM learner_read_models WHERE learner_id = ${learner}`],
    ['mutation_receipts', `DELETE FROM mutation_receipts WHERE account_id = ${account} AND scope_id = ${learner}`],
  ];
  return statements.map(([table, sql]) => ({
    table,
    meta: runD1Statement(sql),
  }));
}

function readSubjectIntegritySnapshot(learnerId) {
  const learner = sqlString(learnerId);
  const subjectRows = runD1Query(`
    SELECT subject_id, COALESCE(data_json, '') AS data_json
    FROM child_subject_state
    WHERE learner_id = ${learner}
      AND subject_id IN ('spelling', 'grammar', 'punctuation')
    ORDER BY subject_id
  `);
  const codexRows = runD1Query(`
    SELECT COALESCE(state_json, '') AS state_json
    FROM child_game_state
    WHERE learner_id = ${learner}
      AND system_id = 'monster-codex'
    LIMIT 1
  `);
  return {
    subjectDataHashes: subjectRows.map((row) => ({
      subjectId: row.subject_id,
      hash: `sha256-16:${hashId(row.data_json || '')}`,
      bytes: String(row.data_json || '').length,
    })),
    monsterCodexHash: codexRows.length
      ? `sha256-16:${hashId(codexRows[0].state_json || '')}`
      : null,
    monsterCodexBytes: codexRows.length ? String(codexRows[0].state_json || '').length : 0,
  };
}

async function main() {
  const origin = configuredOrigin();
  const startedAt = new Date().toISOString();
  const report = {
    ok: false,
    startedAt,
    completedAt: null,
    origin,
    database: DATABASE,
    internalBoundary: null,
    secretReassertions: [],
    demo: null,
    steps: [],
    cleanup: [],
    browserUi: [],
  };

  let demo = null;
  let revision = 0;
  let externalSecretRestored = false;

  try {
    const boundaryRows = runD1Query(`
      SELECT m.account_id, COALESCE(a.account_type, 'unknown') AS account_type, COUNT(DISTINCT c.learner_id) AS learner_count
      FROM child_game_state c
      JOIN account_learner_memberships m ON m.learner_id = c.learner_id
      LEFT JOIN adult_accounts a ON a.id = m.account_id
      WHERE c.system_id = 'hero-mode'
      GROUP BY m.account_id, COALESCE(a.account_type, 'unknown')
      ORDER BY account_type, m.account_id
    `);
    const realBoundaryRows = boundaryRows.filter((row) => row.account_type === 'real');
    assert.equal(realBoundaryRows.length, 1, `Expected exactly one real Hero boundary account, got ${realBoundaryRows.length}.`);
    const internalAccountId = realBoundaryRows[0].account_id;
    assert.ok(internalAccountId, 'Hero boundary account ID was empty.');
    report.internalBoundary = {
      realAccountCount: realBoundaryRows.length,
      learnerCount: Number(realBoundaryRows[0].learner_count) || 0,
      accountProof: `sha256-16:${hashId(internalAccountId)}`,
      source: 'remote D1 child_game_state joined through account_learner_memberships',
    };

    report.secretReassertions.push(putSecret('HERO_INTERNAL_ACCOUNTS', JSON.stringify([internalAccountId])));
    report.secretReassertions.push(putSecret('HERO_EXTERNAL_ACCOUNTS', JSON.stringify([])));
    report.secretReassertions.push(putSecret('HERO_EXCLUDED_ACCOUNTS', JSON.stringify([])));
    report.secretReassertions.push(putSecret('HERO_EMERGENCY_DISABLED', 'false'));
    report.secretReassertions.push(putSecret('HERO_ROLLOUT_PERCENT', '0'));
    report.steps.push({ name: 'boundary-secrets-reasserted', pass: true });

    const created = await createDemoSession(origin);
    const boot = await loadBootstrap(origin, created.cookie, { expectedSession: created.session });
    demo = {
      cookie: created.cookie,
      accountId: created.session.accountId,
      learnerId: boot.learnerId,
    };
    revision = boot.revision;
    report.demo = {
      accountType: 'demo',
      accountProof: `sha256-16:${hashId(demo.accountId)}`,
      learnerProof: `sha256-16:${hashId(demo.learnerId)}`,
    };

    const primed = await primeDemoPunctuation({ origin, cookie: demo.cookie, learnerId: demo.learnerId, revision });
    revision = primed.revision;
    report.steps.push({ name: 'demo-punctuation-primed', pass: true, summaryTotal: primed.summaryTotal });

    report.secretReassertions.push(putSecret('HERO_EXTERNAL_ACCOUNTS', JSON.stringify([demo.accountId])));
    report.steps.push({ name: 'temporary-demo-external-allowlist-enabled', pass: true });

    const visibleWait = await waitForHeroVisibility({
      origin,
      cookie: demo.cookie,
      learnerId: demo.learnerId,
      expectedVisible: true,
      label: 'Temporary demo external allowlist',
    });
    const readResult = visibleWait.result;
    assertOkResponse('Hero read model', readResult);
    const readModel = readResult.payload.hero;
    assert.equal(visibleHero(readModel), true, 'Hero read model was not enabled for temporary demo external cohort.');
    const task = (readModel.dailyQuest?.tasks || []).find((entry) => entry.subjectId === 'punctuation')
      || readModel.dailyQuest?.tasks?.[0];
    assert.ok(task, 'Hero read model did not return a launchable task.');
    assert.equal(task.subjectId, 'punctuation', `Hero enabled smoke requires a punctuation task, got ${task.subjectId}.`);
    report.steps.push({
      name: 'hero-read-model-enabled',
      pass: true,
      taskCount: readModel.dailyQuest.tasks.length,
      selectedSubject: task.subjectId,
      selectedTaskId: task.taskId,
      initialBalance: readModel.economy?.balance ?? null,
      waitedMs: visibleWait.waitedMs,
      observations: visibleWait.observations,
    });

    const enabledBrowserUi = await runEnabledBrowserUiSmoke({ origin, cookie: demo.cookie });
    report.browserUi.push(enabledBrowserUi);
    assert.equal(enabledBrowserUi.pass, true, 'Enabled Hero browser UI smoke failed.');

    const startRequestId = createRequestId('hero-enabled-smoke-start');
    const startPayload = await postHeroCommand(origin, demo.cookie, {
      command: 'start-task',
      learnerId: demo.learnerId,
      questId: readModel.dailyQuest.questId,
      questFingerprint: readModel.questFingerprint,
      taskId: task.taskId,
      requestId: startRequestId,
      correlationId: startRequestId,
      expectedLearnerRevision: revision,
    });
    revision = nextRevision(startPayload, revision);
    assert.equal(startPayload.heroLaunch?.status || 'started', 'started', 'Hero start-task did not start.');
    report.steps.push({
      name: 'hero-start-task',
      pass: true,
      subjectId: startPayload.heroLaunch?.subjectId || null,
      taskId: startPayload.heroLaunch?.taskId || null,
    });

    const duplicateStartRequestId = createRequestId('hero-enabled-smoke-duplicate-start');
    const duplicateStartPayload = await postHeroCommand(origin, demo.cookie, {
      command: 'start-task',
      learnerId: demo.learnerId,
      questId: readModel.dailyQuest.questId,
      questFingerprint: readModel.questFingerprint,
      taskId: task.taskId,
      requestId: duplicateStartRequestId,
      correlationId: duplicateStartRequestId,
      expectedLearnerRevision: revision,
    });
    assert.equal(
      duplicateStartPayload.heroLaunch?.status,
      'already-started',
      'Duplicate Hero start-task after active-session quest refresh did not return already-started.',
    );
    assert.equal(
      duplicateStartPayload.heroLaunch?.taskId,
      task.taskId,
      'Duplicate Hero start-task did not preserve the active task id.',
    );
    report.steps.push({
      name: 'hero-duplicate-start-same-active-task-already-started',
      pass: true,
      status: duplicateStartPayload.heroLaunch.status,
      taskId: duplicateStartPayload.heroLaunch.taskId,
      subjectId: duplicateStartPayload.heroLaunch.subjectId,
    });

    const completed = await completePunctuationHeroSession({
      origin,
      cookie: demo.cookie,
      learnerId: demo.learnerId,
      revision,
      startPayload,
    });
    revision = completed.revision;
    assert.ok(completed.summaryTotal > 0, 'Hero-launched punctuation session completed zero items.');
    report.steps.push({
      name: 'hero-subject-session-completed',
      pass: true,
      summaryTotal: completed.summaryTotal,
      answeredCount: completed.answered.length,
    });

    const pendingResult = await getJson(origin, `/api/hero/read-model?learnerId=${encodeURIComponent(demo.learnerId)}`, { cookie: demo.cookie });
    assertOkResponse('Hero pending read model', pendingResult);
    const pendingHero = pendingResult.payload.hero;
    const pending = pendingHero.pendingCompletedHeroSession;
    assert.ok(pending, 'Hero read model did not expose pendingCompletedHeroSession after subject completion.');
    assert.equal(pending.taskId, task.taskId, 'Pending completed task did not match selected task.');
    report.steps.push({ name: 'hero-pending-completed-session', pass: true, practiceSessionPresent: Boolean(pending.practiceSessionId) });

    const subjectIntegrityBeforeHeroClaims = readSubjectIntegritySnapshot(demo.learnerId);

    const claimRequestId = createRequestId('hero-enabled-smoke-claim');
    const claimPayload = await postHeroCommand(origin, demo.cookie, {
      command: 'claim-task',
      learnerId: demo.learnerId,
      questId: pending.questId,
      questFingerprint: pending.questFingerprint,
      taskId: pending.taskId,
      practiceSessionId: pending.practiceSessionId,
      requestId: claimRequestId,
      correlationId: claimRequestId,
      expectedLearnerRevision: revision,
    });
    revision = nextRevision(claimPayload, revision);
    assert.equal(claimPayload.heroClaim?.status, 'claimed', 'Hero claim-task did not claim the task.');
    assert.equal(claimPayload.heroClaim?.coinsAwarded, 100, 'Hero claim did not award the expected daily coins.');
    report.steps.push({
      name: 'hero-claim-task',
      pass: true,
      status: claimPayload.heroClaim.status,
      coinsAwarded: claimPayload.heroClaim.coinsAwarded,
      dailyStatus: claimPayload.heroClaim.dailyStatus,
      coinBalance: claimPayload.heroClaim.coinBalance,
    });
    const subjectIntegrityAfterClaim = readSubjectIntegritySnapshot(demo.learnerId);
    assert.deepEqual(
      subjectIntegrityAfterClaim,
      subjectIntegrityBeforeHeroClaims,
      'Hero claim-task mutated subject data or monster-codex state.',
    );

    const duplicateRequestId = createRequestId('hero-enabled-smoke-duplicate-claim');
    const duplicatePayload = await postHeroCommand(origin, demo.cookie, {
      command: 'claim-task',
      learnerId: demo.learnerId,
      questId: pending.questId,
      questFingerprint: pending.questFingerprint,
      taskId: pending.taskId,
      practiceSessionId: pending.practiceSessionId,
      requestId: duplicateRequestId,
      correlationId: duplicateRequestId,
      expectedLearnerRevision: revision,
    });
    assert.equal(duplicatePayload.heroClaim?.status, 'already-completed', 'Duplicate Hero claim was not idempotent.');
    assert.equal(duplicatePayload.heroClaim?.coinsAwarded, 0, 'Duplicate Hero claim awarded coins.');
    report.steps.push({
      name: 'hero-duplicate-claim-idempotent',
      pass: true,
      status: duplicatePayload.heroClaim.status,
      coinsAwarded: duplicatePayload.heroClaim.coinsAwarded,
      dailyCoinsAlreadyAwarded: duplicatePayload.heroClaim.dailyCoinsAlreadyAwarded,
    });
    const subjectIntegrityAfterDuplicateClaim = readSubjectIntegritySnapshot(demo.learnerId);
    assert.deepEqual(
      subjectIntegrityAfterDuplicateClaim,
      subjectIntegrityBeforeHeroClaims,
      'Duplicate Hero claim mutated subject data or monster-codex state.',
    );

    const afterClaimResult = await getJson(origin, `/api/hero/read-model?learnerId=${encodeURIComponent(demo.learnerId)}`, { cookie: demo.cookie });
    assertOkResponse('Hero after-claim read model', afterClaimResult);
    const afterClaimHero = afterClaimResult.payload.hero;
    assert.equal(afterClaimHero.progress?.status, 'completed', 'Hero after-claim read model did not show daily completion.');
    assert.equal(afterClaimHero.economy?.today?.coinsAwarded, 100, 'Hero after-claim read model did not show the awarded daily coins.');
    assert.equal(afterClaimHero.economy?.balance, 100, 'Hero after-claim read model did not show the awarded coin balance.');
    report.steps.push({
      name: 'hero-after-claim-read-model-coins',
      pass: true,
      dailyStatus: afterClaimHero.progress.status,
      coinsAwarded: afterClaimHero.economy.today.coinsAwarded,
      coinBalance: afterClaimHero.economy.balance,
    });
    const claimedBrowserUi = await runClaimedBrowserUiSmoke({ origin, cookie: demo.cookie });
    report.browserUi.push(claimedBrowserUi);
    assert.equal(claimedBrowserUi.pass, true, 'Claimed Hero browser UI smoke failed.');
    const unaffordable = (afterClaimHero.camp?.monsters || []).find((monster) => monster.canInvite && !monster.canAffordInvite);
    assert.ok(unaffordable, 'Hero Camp did not expose an unaffordable invite candidate.');
    const campRequestId = createRequestId('hero-enabled-smoke-camp');
    const campResult = await postJson(origin, '/api/hero/command', {
      command: 'unlock-monster',
      learnerId: demo.learnerId,
      monsterId: unaffordable.monsterId,
      branch: unaffordable.branch || 'b1',
      requestId: campRequestId,
      correlationId: campRequestId,
      expectedLearnerRevision: revision,
    }, { cookie: demo.cookie });
    assert.equal(campResult.response.status, 409, `Expected Hero Camp insufficient coins response, got ${campResult.response.status}.`);
    assert.equal(campResult.payload?.error?.code, 'hero_insufficient_coins', 'Hero Camp did not return hero_insufficient_coins.');
    report.steps.push({
      name: 'hero-camp-insufficient-coins',
      pass: true,
      status: campResult.response.status,
      code: campResult.payload.error.code,
      monsterId: unaffordable.monsterId,
      inviteCost: unaffordable.inviteCost,
      balance: afterClaimHero.camp.balance,
    });
    const subjectIntegrityAfterCampBlock = readSubjectIntegritySnapshot(demo.learnerId);
    assert.deepEqual(
      subjectIntegrityAfterCampBlock,
      subjectIntegrityBeforeHeroClaims,
      'Hero Camp blocked command mutated subject data or monster-codex state.',
    );
    report.steps.push({
      name: 'hero-commands-did-not-mutate-subject-stars-mastery-or-monsters',
      pass: true,
      comparedCommands: ['claim-task', 'duplicate-claim-task', 'blocked-unlock-monster'],
      snapshot: subjectIntegrityBeforeHeroClaims,
    });
  } finally {
    try {
      report.secretReassertions.push(putSecret('HERO_EXTERNAL_ACCOUNTS', JSON.stringify([])));
      externalSecretRestored = true;
      report.cleanup.push({ name: 'external-allowlist-restored-empty', pass: true });
    } catch (error) {
      report.cleanup.push({ name: 'external-allowlist-restored-empty', pass: false, error: error.message });
    }

    if (demo) {
      try {
        const hiddenWait = await waitForHeroVisibility({
          origin,
          cookie: demo.cookie,
          learnerId: demo.learnerId,
          expectedVisible: false,
          label: 'Restored empty external allowlist',
        });
        report.cleanup.push({
          name: 'demo-non-cohort-hidden-after-restore',
          pass: true,
          status: hiddenWait.result.response.status,
          code: hiddenWait.result.payload?.code || (hiddenWait.result.payload?.hero?.ui?.enabled === false ? 'hidden' : null),
          waitedMs: hiddenWait.waitedMs,
          observations: hiddenWait.observations,
        });
      } catch (error) {
        report.cleanup.push({ name: 'demo-non-cohort-hidden-after-restore', pass: false, error: error.message });
      }

      try {
        const cleanup = cleanupDemoRuntimeRows({ accountId: demo.accountId, learnerId: demo.learnerId });
        report.cleanup.push({ name: 'demo-runtime-rows-cleaned', pass: true, tables: cleanup.map((entry) => entry.table) });
      } catch (error) {
        report.cleanup.push({ name: 'demo-runtime-rows-cleaned', pass: false, error: error.message });
      }
    }

    report.completedAt = new Date().toISOString();
    report.ok = externalSecretRestored
      && report.steps.every((step) => step.pass)
      && report.cleanup.every((step) => step.pass)
      && report.browserUi.length >= 2
      && report.browserUi.every((step) => step.pass);
    await writeEvidence(report);
  }

  assert.equal(report.ok, true, `Hero current deploy enabled smoke failed; see ${OUT}`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch(async (error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
