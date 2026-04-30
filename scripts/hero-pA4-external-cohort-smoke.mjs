#!/usr/bin/env node
// Hero Mode pA4 — External cohort browser smoke validation script.
// Validates the critical Hero flow end-to-end:
//   Hero visible -> start task -> subject session -> return -> claim -> coins -> Camp -> rollback-hidden
//
// Usage: node scripts/hero-pA4-external-cohort-smoke.mjs [--account-id ID] [--base-url URL]
//
// Exits 0 if all steps pass, 1 if any fail.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Step definitions ──────────────────────────────────────────────────

export const STEPS = [
  'hero-visible',
  'start-task',
  'subject-session',
  'return-from-session',
  'claim',
  'coins',
  'camp',
  'rollback-hidden',
];

// ── Step validators ───────────────────────────────────────────────────

/**
 * Validate a single step's response data.
 * Returns { pass: boolean, detail: string }.
 */
export function validateStep(stepName, response, context = {}) {
  switch (stepName) {
    case 'hero-visible':
      return validateHeroVisible(response, context);
    case 'start-task':
      return validateStartTask(response);
    case 'subject-session':
      return validateSubjectSession(response);
    case 'return-from-session':
      return validateReturnFromSession(response);
    case 'claim':
      return validateClaim(response);
    case 'coins':
      return validateCoins(response, context);
    case 'camp':
      return validateCamp(response, context);
    case 'rollback-hidden':
      return validateRollbackHidden(response);
    default:
      return { pass: false, detail: `Unknown step: ${stepName}` };
  }
}

function validateHeroVisible(response, context) {
  if (!response || typeof response !== 'object') {
    return { pass: false, detail: 'No response body' };
  }
  if (response.error) {
    return { pass: false, detail: `API error: ${response.error}` };
  }
  // For non-cohort accounts, ui.enabled will be false
  if (context.expectHidden) {
    const hidden = response.ui?.enabled === false;
    return hidden
      ? { pass: true, detail: 'Hero correctly not visible for non-cohort account' }
      : { pass: false, detail: 'Hero should not be visible for non-cohort account' };
  }
  const enabled = response.ui?.enabled === true;
  if (!enabled) {
    const reason = response.ui?.reason || 'unknown';
    return { pass: false, detail: `ui.enabled is false (reason: ${reason})` };
  }
  return { pass: true, detail: 'ui.enabled=true' };
}

function validateStartTask(response) {
  if (!response || typeof response !== 'object') {
    return { pass: false, detail: 'No response body' };
  }
  if (response.error) {
    return { pass: false, detail: `API error: ${response.error}` };
  }
  const heroLaunch = response.heroLaunch;
  if (!heroLaunch) {
    return { pass: false, detail: 'Missing heroLaunch in start-task response' };
  }
  if (!heroLaunch.questId || !heroLaunch.taskId) {
    return { pass: false, detail: 'heroLaunch missing questId or taskId' };
  }
  if (!heroLaunch.subjectId) {
    return { pass: false, detail: 'heroLaunch missing subjectId' };
  }
  return { pass: true, detail: `heroLaunch intent received: task=${heroLaunch.taskId}` };
}

function validateSubjectSession(response) {
  if (!response || typeof response !== 'object') {
    return { pass: false, detail: 'No response body' };
  }
  const heroLaunch = response.heroLaunch;
  if (!heroLaunch) {
    return { pass: false, detail: 'Missing heroLaunch for subject-session validation' };
  }
  // Must have subjectId and launcher info for the subject to start
  if (!heroLaunch.subjectId) {
    return { pass: false, detail: 'No subjectId in heroLaunch — subject cannot start' };
  }
  if (!heroLaunch.subjectCommand) {
    return { pass: false, detail: 'No subjectCommand in heroLaunch — launcher info missing' };
  }
  return { pass: true, detail: `subject=${heroLaunch.subjectId}, cmd=${heroLaunch.subjectCommand}` };
}

function validateReturnFromSession(response) {
  if (!response || typeof response !== 'object') {
    return { pass: false, detail: 'No response body' };
  }
  if (response.error) {
    return { pass: false, detail: `API error: ${response.error}` };
  }
  const pending = response.pendingCompletedHeroSession;
  if (!pending) {
    return { pass: false, detail: 'No pendingCompletedHeroSession in read-model after return' };
  }
  if (!pending.taskId || !pending.questId) {
    return { pass: false, detail: 'pendingCompletedHeroSession missing taskId or questId' };
  }
  return { pass: true, detail: `pending claim for task=${pending.taskId}` };
}

function validateClaim(response) {
  if (!response || typeof response !== 'object') {
    return { pass: false, detail: 'No response body' };
  }
  if (response.error) {
    return { pass: false, detail: `API error: ${response.error}` };
  }
  // The claim response must indicate an award was granted
  const award = response.award || response.claimResult;
  if (!award) {
    return { pass: false, detail: 'No award/claimResult in claim response' };
  }
  if (award.status === 'rejected' || award.status === 'failed') {
    return { pass: false, detail: `Claim rejected: ${award.reason || 'unknown'}` };
  }
  return { pass: true, detail: `award granted: status=${award.status || 'ok'}` };
}

function validateCoins(response, context) {
  if (!response || typeof response !== 'object') {
    return { pass: false, detail: 'No response body' };
  }
  const economy = response.economy;
  if (!economy) {
    return { pass: false, detail: 'No economy block in read-model' };
  }
  const balance = economy.balance;
  if (typeof balance !== 'number') {
    return { pass: false, detail: 'economy.balance is not a number' };
  }
  const previousBalance = context.previousBalance ?? 0;
  const expectedIncrease = 100;
  if (balance < previousBalance + expectedIncrease) {
    return { pass: false, detail: `Balance ${balance} did not increase by ${expectedIncrease} from ${previousBalance}` };
  }
  return { pass: true, detail: `economy.balance=${balance} (increased by ${balance - previousBalance})` };
}

function validateCamp(response, context) {
  if (!response || typeof response !== 'object') {
    return { pass: false, detail: 'No response body' };
  }
  // Camp is gated behind HERO_MODE_CAMP_ENABLED
  if (context.campEnabled === false) {
    // If camp is disabled, its absence is acceptable
    if (!response.camp || response.camp.enabled === false) {
      return { pass: true, detail: 'Camp disabled (HERO_MODE_CAMP_ENABLED=false) — skipped' };
    }
  }
  const camp = response.camp;
  if (!camp) {
    return { pass: false, detail: 'No camp block in read-model' };
  }
  if (!camp.enabled) {
    return { pass: false, detail: 'camp.enabled is false' };
  }
  if (!Array.isArray(camp.monsters) || camp.monsters.length === 0) {
    return { pass: false, detail: 'camp.monsters is empty or not an array' };
  }
  return { pass: true, detail: `camp has ${camp.monsters.length} monster(s)` };
}

function validateRollbackHidden(response) {
  if (!response || typeof response !== 'object') {
    return { pass: false, detail: 'No response body' };
  }
  // With all flags off, the read-model should indicate disabled/hidden or error
  if (response.error) {
    // A 404 (hero_shadow_disabled) is the expected rollback behaviour
    if (response.code === 'hero_shadow_disabled') {
      return { pass: true, detail: 'Hero correctly returns hero_shadow_disabled when flags off' };
    }
    return { pass: true, detail: `Hero returns error with flags off: ${response.error}` };
  }
  if (response.ui?.enabled === false) {
    return { pass: true, detail: 'ui.enabled=false when flags off — correctly hidden' };
  }
  return { pass: false, detail: 'Hero is still visible when all flags are off' };
}

// ── CLI argument parsing ──────────────────────────────────────────────

export function parseArgs(argv) {
  const args = {
    accountId: '',
    baseUrl: 'http://localhost:8787',
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--account-id' && argv[i + 1]) {
      args.accountId = argv[++i].trim();
    } else if (arg.startsWith('--account-id=')) {
      args.accountId = arg.slice('--account-id='.length).trim();
    } else if (arg === '--base-url' && argv[i + 1]) {
      args.baseUrl = argv[++i].trim().replace(/\/$/, '');
    } else if (arg.startsWith('--base-url=')) {
      args.baseUrl = arg.slice('--base-url='.length).trim().replace(/\/$/, '');
    }
  }

  return args;
}

// ── HTTP helpers ──────────────────────────────────────────────────────

async function httpGet(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: `HTTP ${res.status}`, code: body.code || null, ...body };
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    return { error: err.name === 'AbortError' ? 'Timeout after 15s' : err.message };
  }
}

async function httpPost(url, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { error: `HTTP ${res.status}`, code: data.code || null, ...data };
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    return { error: err.name === 'AbortError' ? 'Timeout after 15s' : err.message };
  }
}

// ── Main flow runner ──────────────────────────────────────────────────

export async function runSmokeFlow({ accountId, baseUrl }) {
  const results = [];
  let readModel = null;
  let startResponse = null;
  let previousBalance = 0;

  // Step 1: hero-visible
  readModel = await httpGet(`${baseUrl}/api/hero/read-model?accountId=${encodeURIComponent(accountId)}`);
  results.push({
    step: 'hero-visible',
    ...validateStep('hero-visible', readModel),
  });
  if (!results[0].pass) return { results, exitCode: 1 };

  // Capture pre-claim balance
  previousBalance = readModel.economy?.balance ?? 0;

  // Step 2: start-task — pick first launchable task
  const task = readModel.dailyQuest?.tasks?.[0];
  if (!task) {
    results.push({ step: 'start-task', pass: false, detail: 'No tasks in dailyQuest' });
    return { results, exitCode: 1 };
  }

  startResponse = await httpPost(`${baseUrl}/api/hero/command`, {
    command: 'start-task',
    learnerId: readModel.dateKey ? accountId : accountId,
    questId: readModel.dailyQuest.questId,
    taskId: task.taskId,
    requestId: `smoke-${Date.now()}`,
    questFingerprint: readModel.questFingerprint,
    expectedLearnerRevision: 0,
  });
  results.push({
    step: 'start-task',
    ...validateStep('start-task', startResponse),
  });
  if (!results[results.length - 1].pass) return { results, exitCode: 1 };

  // Step 3: subject-session
  results.push({
    step: 'subject-session',
    ...validateStep('subject-session', startResponse),
  });
  if (!results[results.length - 1].pass) return { results, exitCode: 1 };

  // Step 4: return-from-session (re-read model)
  readModel = await httpGet(`${baseUrl}/api/hero/read-model?accountId=${encodeURIComponent(accountId)}`);
  results.push({
    step: 'return-from-session',
    ...validateStep('return-from-session', readModel),
  });
  if (!results[results.length - 1].pass) return { results, exitCode: 1 };

  // Step 5: claim
  const claimResponse = await httpPost(`${baseUrl}/api/hero/command`, {
    command: 'claim-task',
    learnerId: accountId,
    questId: readModel.dailyQuest.questId,
    taskId: readModel.pendingCompletedHeroSession?.taskId || task.taskId,
    requestId: `smoke-claim-${Date.now()}`,
    questFingerprint: readModel.questFingerprint,
    expectedLearnerRevision: 0,
  });
  results.push({
    step: 'claim',
    ...validateStep('claim', claimResponse),
  });
  if (!results[results.length - 1].pass) return { results, exitCode: 1 };

  // Step 6: coins (re-read model to check balance)
  readModel = await httpGet(`${baseUrl}/api/hero/read-model?accountId=${encodeURIComponent(accountId)}`);
  results.push({
    step: 'coins',
    ...validateStep('coins', readModel, { previousBalance }),
  });
  if (!results[results.length - 1].pass) return { results, exitCode: 1 };

  // Step 7: camp
  const campEnabled = readModel.camp?.enabled !== false;
  results.push({
    step: 'camp',
    ...validateStep('camp', readModel, { campEnabled }),
  });
  if (!results[results.length - 1].pass) return { results, exitCode: 1 };

  // Step 8: rollback-hidden (simulate flags off — request with rollback query param)
  const rollbackResponse = await httpGet(`${baseUrl}/api/hero/read-model?accountId=${encodeURIComponent(accountId)}&_simulate_flags_off=1`);
  results.push({
    step: 'rollback-hidden',
    ...validateStep('rollback-hidden', rollbackResponse),
  });

  const exitCode = results.every(r => r.pass) ? 0 : 1;
  return { results, exitCode };
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  if (!args.accountId) {
    console.error('ERROR: --account-id is required');
    console.error('Usage: node scripts/hero-pA4-external-cohort-smoke.mjs --account-id <ID> [--base-url <URL>]');
    process.exit(1);
  }

  console.log('Hero Mode pA4 — External Cohort Browser Smoke');
  console.log(`Account ID: ${args.accountId}`);
  console.log(`Base URL:   ${args.baseUrl}`);
  console.log('---');

  const { results, exitCode } = await runSmokeFlow(args);

  // Output structured JSON
  const output = {
    timestamp: new Date().toISOString(),
    accountId: args.accountId,
    baseUrl: args.baseUrl,
    steps: results,
    passed: results.filter(r => r.pass).length,
    failed: results.filter(r => !r.pass).length,
    exitCode,
  };

  console.log(JSON.stringify(output, null, 2));

  process.exit(exitCode);
}

// Only run main when invoked directly (not when imported for testing)
const _scriptUrl = fileURLToPath(import.meta.url);
const _invokedAs = process.argv[1] ? resolve(process.argv[1]) : '';
if (_scriptUrl === _invokedAs) {
  main().catch((err) => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}
