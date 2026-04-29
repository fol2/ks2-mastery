#!/usr/bin/env node
//
// pA1 U6: Hero Mode staging smoke script — Ring 2 validation.
//
// Exercises the deployed Hero Mode surface and verifies:
//   1. Read model health (GET /api/hero/read-model)
//   2. Flag state (graceful flags-off detection)
//   3. Telemetry probe (GET /api/admin/hero/telemetry-probe)
//   4. Command route reachability (POST /api/hero/command)
//
// Usage:
//   node scripts/hero-pA1-staging-smoke.mjs [--url <url>] [--learner-id <id>] [--cookie <cookie>]
//
// Env vars:
//   STAGING_URL              Equivalent to --url (default http://localhost:8787)
//   KS2_SMOKE_COOKIE        Equivalent to --cookie
//   KS2_SMOKE_LEARNER_ID    Equivalent to --learner-id
//
// Exit codes:
//   0 — all steps green (or flags-off detected cleanly)
//   1 — one or more verification steps failed
//   2 — usage error (malformed URL)
//   10 — flags-off: Hero is disabled in the target environment (not a failure)

import { pathToFileURL } from 'node:url';

const DEFAULT_URL = 'http://localhost:8787';
const DEFAULT_LEARNER_ID = 'smoke-test-learner-001';
const DEFAULT_TIMEOUT_MS = 15_000;

// Exit codes
const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;
const EXIT_FLAGS_OFF = 10;

// --- Argument parsing ---

function argValue(argv, ...names) {
  for (const name of names) {
    const index = argv.indexOf(name);
    if (index !== -1 && index + 1 < argv.length) return argv[index + 1];
  }
  return '';
}

function parseArgs(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { help: true };
  }

  const url = argValue(argv, '--url')
    || process.env.STAGING_URL
    || DEFAULT_URL;

  const learnerId = argValue(argv, '--learner-id')
    || process.env.KS2_SMOKE_LEARNER_ID
    || DEFAULT_LEARNER_ID;

  const cookie = argValue(argv, '--cookie')
    || process.env.KS2_SMOKE_COOKIE
    || '';

  let parsed;
  try {
    parsed = new URL(url);
  } catch (error) {
    throw new Error(`Invalid --url: ${url} (${error?.message || error})`);
  }

  return {
    help: false,
    origin: parsed.origin,
    learnerId,
    cookie,
  };
}

// --- Fetch helpers ---

function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  timer.unref?.();
  return controller.signal;
}

async function fetchJson(url, init = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...init,
      signal: init.signal || timeoutSignal(DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      payload: null,
      error: `Request to ${url} failed: ${error?.message || error}`,
    };
  }

  let payload = null;
  try {
    const text = await response.text();
    payload = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON response is acceptable for some error codes
  }

  return {
    ok: response.ok,
    status: response.status,
    payload,
    error: null,
  };
}

// --- Step runners ---

function stepResult(name, passed, details = {}) {
  return { name, passed, ...details };
}

async function stepReadModelHealth(origin, learnerId, cookie) {
  const url = `${origin}/api/hero/read-model?learnerId=${encodeURIComponent(learnerId)}`;
  const headers = { accept: 'application/json' };
  if (cookie) headers.cookie = cookie;

  const result = await fetchJson(url, { method: 'GET', headers });

  // Flag-gate returns 404 with code hero_shadow_disabled
  if (result.status === 404) {
    const code = result.payload?.error?.code || result.payload?.code || '';
    if (code === 'hero_shadow_disabled') {
      return stepResult('read-model-health', false, {
        flagsOff: true,
        status: 404,
        message: 'Hero shadow read model is disabled (HERO_MODE_SHADOW_ENABLED = false)',
      });
    }
  }

  if (!result.ok) {
    return stepResult('read-model-health', false, {
      status: result.status,
      error: result.error || `HTTP ${result.status}`,
      payload: result.payload,
    });
  }

  const hero = result.payload?.hero;
  const failures = [];

  if (!hero) {
    failures.push('Response missing "hero" object');
  } else {
    if (typeof hero.version !== 'number' || hero.version < 3) {
      failures.push(`Expected version >= 3, got ${JSON.stringify(hero.version)}`);
    }
    if (hero.mode === undefined && hero.ui === undefined) {
      failures.push('Neither "mode" nor "ui" present in hero object');
    }
    if (!Array.isArray(hero.eligibleSubjects)) {
      failures.push(`Expected eligibleSubjects to be an array, got ${typeof hero.eligibleSubjects}`);
    }
  }

  return stepResult('read-model-health', failures.length === 0, {
    status: result.status,
    version: hero?.version,
    mode: hero?.mode,
    eligibleSubjectsCount: Array.isArray(hero?.eligibleSubjects) ? hero.eligibleSubjects.length : 0,
    failures: failures.length > 0 ? failures : undefined,
    hero: hero ? { version: hero.version, mode: hero.mode, eligibleSubjects: hero.eligibleSubjects } : null,
  });
}

function stepFlagState(readModelResult) {
  if (readModelResult.flagsOff) {
    return stepResult('flag-state', true, {
      flagsOff: true,
      message: 'Hero Mode flags are OFF — this is a valid operational state, not a failure.',
    });
  }

  if (!readModelResult.passed) {
    return stepResult('flag-state', false, {
      message: 'Cannot assess flag state: read model step failed',
    });
  }

  const hero = readModelResult.hero;
  const uiEnabled = hero?.ui?.enabled ?? null;
  const childVisible = hero?.ui?.childVisible ?? hero?.childVisible ?? null;

  return stepResult('flag-state', true, {
    flagsOff: false,
    uiEnabled,
    childVisible,
    message: uiEnabled
      ? 'Hero Mode is fully enabled (ui.enabled = true)'
      : 'Hero Mode shadow is active but child UI is not visible',
  });
}

async function stepTelemetryProbe(origin, cookie) {
  const url = `${origin}/api/admin/hero/telemetry-probe?limit=10`;
  const headers = {
    accept: 'application/json',
    origin,
  };
  if (cookie) headers.cookie = cookie;

  const result = await fetchJson(url, { method: 'GET', headers });

  // Admin routes require authentication — a 401/403 is expected without
  // proper credentials and is not a routing failure.
  if (result.status === 401 || result.status === 403) {
    return stepResult('telemetry-probe', true, {
      status: result.status,
      skipped: true,
      message: `Admin endpoint returned ${result.status} — auth required (expected without admin credentials)`,
    });
  }

  if (!result.ok) {
    return stepResult('telemetry-probe', false, {
      status: result.status,
      error: result.error || `HTTP ${result.status}`,
    });
  }

  const events = result.payload?.events;
  const privacyCheck = result.payload?.privacyValidation;
  const failures = [];

  if (!Array.isArray(events)) {
    failures.push('Response missing "events" array');
  } else {
    // Check no privacy fields leaked
    const PRIVACY_FIELDS = ['email', 'password', 'passwordHash', 'sessionToken'];
    for (const event of events) {
      const eventStr = JSON.stringify(event);
      for (const field of PRIVACY_FIELDS) {
        if (eventStr.includes(`"${field}"`)) {
          failures.push(`Event contains privacy field: ${field}`);
        }
      }
    }
  }

  return stepResult('telemetry-probe', failures.length === 0, {
    status: result.status,
    eventCount: Array.isArray(events) ? events.length : 0,
    privacyValidation: privacyCheck,
    failures: failures.length > 0 ? failures : undefined,
  });
}

async function stepCommandReachability(origin, cookie) {
  const url = `${origin}/api/hero/command`;
  const headers = {
    accept: 'application/json',
    'content-type': 'application/json',
    origin,
  };
  if (cookie) headers.cookie = cookie;

  // Send an empty body — we expect 400 (bad request) or 404 (launch disabled),
  // which both prove the route is reachable and responding.
  const result = await fetchJson(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });

  // 400 = route exists, body validation failed (expected)
  // 404 with hero_launch_disabled = launch flag off (valid)
  // 404 with hero_launch_misconfigured = shadow off (valid)
  // 401/403 = auth gate hit before command processing (valid)
  const reachable = [400, 401, 403, 404, 409, 422].includes(result.status);

  if (reachable) {
    const code = result.payload?.error?.code || result.payload?.code || '';
    return stepResult('command-reachability', true, {
      status: result.status,
      code,
      message: `Command route is reachable (HTTP ${result.status}${code ? `, code: ${code}` : ''})`,
    });
  }

  // Status 0 means network failure / timeout
  if (result.status === 0) {
    return stepResult('command-reachability', false, {
      status: 0,
      error: result.error,
      message: 'Command route is unreachable (network failure)',
    });
  }

  // Any 5xx is a genuine failure
  return stepResult('command-reachability', result.status < 500, {
    status: result.status,
    error: result.error,
    message: `Command route returned unexpected HTTP ${result.status}`,
  });
}

// --- Main ---

function printUsage() {
  console.log(`Hero Mode pA1 Staging Smoke Script — Ring 2 Validation

Usage:
  node scripts/hero-pA1-staging-smoke.mjs [options]

Options:
  --url <url>           Target URL (default: STAGING_URL env or http://localhost:8787)
  --learner-id <id>     Learner ID to probe (default: KS2_SMOKE_LEARNER_ID env or smoke-test-learner-001)
  --cookie <cookie>     Session cookie for authenticated requests
  --help, -h            Show this help

Env vars:
  STAGING_URL             Equivalent to --url
  KS2_SMOKE_COOKIE        Equivalent to --cookie
  KS2_SMOKE_LEARNER_ID    Equivalent to --learner-id

Exit codes:
  0   All steps passed
  1   One or more steps failed
  2   Usage error
  10  Hero Mode flags are OFF (not a failure)`);
}

async function run(argv = process.argv.slice(2)) {
  let config;
  try {
    config = parseArgs(argv);
  } catch (error) {
    console.error(`Usage error: ${error.message}`);
    return EXIT_USAGE;
  }

  if (config.help) {
    printUsage();
    return EXIT_OK;
  }

  const startedAt = new Date().toISOString();
  const results = [];

  console.log(`\n  Hero Mode pA1 Staging Smoke — Ring 2 Validation`);
  console.log(`  Target: ${config.origin}`);
  console.log(`  Learner: ${config.learnerId}`);
  console.log(`  Started: ${startedAt}\n`);

  // Step 1: Read model health
  const readModelResult = await stepReadModelHealth(config.origin, config.learnerId, config.cookie);
  results.push(readModelResult);
  printStep(readModelResult);

  // Step 2: Flag state
  const flagResult = stepFlagState(readModelResult);
  results.push(flagResult);
  printStep(flagResult);

  // If flags are off, report and exit cleanly
  if (readModelResult.flagsOff) {
    const envelope = buildEnvelope(config, results, startedAt, 'flags-off');
    console.log(`\n${JSON.stringify(envelope, null, 2)}`);
    console.log(`\n  Result: FLAGS OFF (exit 10) — Hero Mode is not enabled in this environment.\n`);
    return EXIT_FLAGS_OFF;
  }

  // Step 3: Telemetry probe
  const telemetryResult = await stepTelemetryProbe(config.origin, config.cookie);
  results.push(telemetryResult);
  printStep(telemetryResult);

  // Step 4: Command route reachability
  const commandResult = await stepCommandReachability(config.origin, config.cookie);
  results.push(commandResult);
  printStep(commandResult);

  // Summary
  const allPassed = results.every((r) => r.passed);
  const envelope = buildEnvelope(config, results, startedAt, allPassed ? 'pass' : 'fail');
  console.log(`\n${JSON.stringify(envelope, null, 2)}`);

  const passCount = results.filter((r) => r.passed).length;
  const failCount = results.filter((r) => !r.passed).length;
  console.log(`\n  Result: ${allPassed ? 'PASS' : 'FAIL'} (${passCount} passed, ${failCount} failed)\n`);

  return allPassed ? EXIT_OK : EXIT_FAILURE;
}

function printStep(result) {
  const icon = result.passed ? '[PASS]' : '[FAIL]';
  const suffix = result.skipped ? ' (skipped — auth required)' : '';
  const flagNote = result.flagsOff ? ' [FLAGS OFF]' : '';
  console.log(`  ${icon} ${result.name}${flagNote}${suffix}`);
  if (result.message) console.log(`        ${result.message}`);
  if (result.failures) {
    for (const f of result.failures) console.log(`        - ${f}`);
  }
}

function buildEnvelope(config, results, startedAt, outcome) {
  return {
    ok: outcome === 'pass' || outcome === 'flags-off',
    outcome,
    origin: config.origin,
    learnerId: config.learnerId,
    startedAt,
    finishedAt: new Date().toISOString(),
    steps: results,
  };
}

// CLI entrypoint
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: error.message,
    }, null, 2));
    process.exitCode = EXIT_FAILURE;
  });
}

export { run, parseArgs, stepReadModelHealth, stepFlagState, stepTelemetryProbe, stepCommandReachability };
