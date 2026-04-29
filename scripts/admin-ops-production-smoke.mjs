#!/usr/bin/env node
//
// U6 (P1.5 Phase B) + U7 (P4): production same-origin smoke for the
// admin-ops console. Exercises the live `https://ks2.eugnel.uk`
// deployment through an end-to-end workflow equivalent to the
// operator opening the admin hub, clicking each of the four narrow
// refresh buttons, saving an account-ops-metadata update (then
// reversing it), posting a synthetic error event, generating a
// Debug Bundle, reading the denial log, exercising account search +
// detail, verifying content overview, and performing a marketing
// message lifecycle round-trip. Every mutation carries a
// `smoke-<iso-date>-<sequence>` requestId so admin-activity metrics
// can filter it out of real telemetry.
//
// Credentials are read from env:
//   KS2_SMOKE_ACCOUNT_EMAIL     (required)
//   KS2_SMOKE_ACCOUNT_PASSWORD  (required)
//   KS2_SMOKE_BASE_URL          (optional, default https://ks2.eugnel.uk)
//   KS2_SMOKE_TIMEOUT_MS        (optional, default 15_000)
//
// Setup: see `docs/hardening/admin-ops-smoke-setup.md` for how to
// provision the dedicated smoke service account.
//
// Exit codes:
//   0 — all steps green.
//   1 — one or more steps returned non-2xx. stdout includes the
//       correlation id + status of the first failure.
//   2 — usage error (missing env var, malformed base URL, or
//       `SMOKE_ACCOUNT_DIRTY` pre-run canary failure).
//   3 — `STATE_DRIFT_DETECTED`: the forward mutation stamped the smoke
//       account but the reverse mutation failed even after one retry.
//       Operator must manually reset the smoke account's `plan_label`
//       before the next run — see the runbook's "State drift recovery"
//       section in `docs/hardening/admin-ops-smoke-setup.md`.
//
// CLI entrypoint guard uses `pathToFileURL(process.argv[1]).href ===
// import.meta.url` per Windows hygiene — avoids the POSIX-only form
// that misbehaves on Windows where drive letters diverge.

import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

export const EXIT_OK = 0;
export const EXIT_FAILURE = 1;
export const EXIT_USAGE = 2;
// I3 (reviewer): state-drift is a distinct failure mode — the forward
// mutation succeeded but the reverse did not, so the smoke account is
// left with a stamped `smoke-<iso>` plan label that will be captured
// as the "original" on the next run. Loud, grep-friendly exit code so
// operators can alert on it in CI without parsing the JSON envelope.
// `3` is used rather than overloading `2` (usage error) so the two
// root causes stay separable at the shell level.
export const EXIT_STATE_DRIFT = 3;

const DEFAULT_BASE_URL = 'https://ks2.eugnel.uk';
const DEFAULT_TIMEOUT_MS = 15_000;

function resolveBaseUrl(env = process.env) {
  const raw = env.KS2_SMOKE_BASE_URL || DEFAULT_BASE_URL;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (error) {
    throw new Error(`KS2_SMOKE_BASE_URL is not a valid URL: ${raw} (${error?.message || error})`);
  }
  // I7 (reviewer): HTTPS-only. The smoke run POSTs the smoke account
  // password to `/api/auth/login`; allowing an HTTP base URL would let
  // a misconfigured runner leak the credential in plain text. Reject
  // any non-HTTPS scheme at startup with a clear message.
  if (parsed.protocol !== 'https:') {
    throw new Error(`KS2_SMOKE_BASE_URL must use https:// (got ${parsed.protocol}//${parsed.host})`);
  }
  return parsed.origin;
}

function resolveTimeout(env = process.env) {
  const parsed = Number(env.KS2_SMOKE_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function requireEnvCredentials(env = process.env) {
  const email = (env.KS2_SMOKE_ACCOUNT_EMAIL || '').trim();
  const password = env.KS2_SMOKE_ACCOUNT_PASSWORD || '';
  if (!email) throw new Error('KS2_SMOKE_ACCOUNT_EMAIL is required.');
  if (!password) throw new Error('KS2_SMOKE_ACCOUNT_PASSWORD is required.');
  return { email, password };
}

function timeoutSignal(timeoutMs) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  return controller.signal;
}

function sessionCookieFromResponse(response) {
  const values = response.headers.getSetCookie?.();
  const raw = Array.isArray(values) && values.length
    ? values
    : String(response.headers.get('set-cookie') || '').split(/,\s*(?=ks2_)/).filter(Boolean);
  for (const entry of raw) {
    const first = String(entry || '').split(';')[0];
    if (first.startsWith('ks2_session=')) return first;
  }
  return '';
}

async function readJsonSafe(response) {
  const text = await response.text().catch(() => '');
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { rawBody: text };
  }
}

function makeRequestId(sequence) {
  // I2 (reviewer): previously `smoke-<YYYY-MM-DD>-<sequence>`, which
  // collides between two same-day runs so the receipt cache keyed on
  // (accountId, requestId) sees replay ambiguity. Append the first
  // 8 hex chars of a UUID to guarantee per-invocation uniqueness while
  // keeping the request id human-scannable in the admin activity panel.
  const today = new Date().toISOString().slice(0, 10);
  const uuid = randomUUID();
  return `smoke-${today}-${sequence}-${uuid.slice(0, 8)}`;
}

function sameOriginHeaders(origin, cookie, extra = {}) {
  return {
    accept: 'application/json',
    origin,
    referer: `${origin}/`,
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty',
    ...(cookie ? { cookie } : {}),
    ...extra,
  };
}

async function apiGet({ baseUrl, path, cookie, timeoutMs }) {
  const response = await fetch(new URL(path, baseUrl), {
    method: 'GET',
    headers: sameOriginHeaders(baseUrl, cookie),
    signal: timeoutSignal(timeoutMs),
  });
  const payload = await readJsonSafe(response);
  return { response, payload };
}

async function apiSend({ baseUrl, method, path, cookie, body, timeoutMs }) {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: sameOriginHeaders(baseUrl, cookie, { 'content-type': 'application/json' }),
    body: JSON.stringify(body || {}),
    signal: timeoutSignal(timeoutMs),
  });
  const payload = await readJsonSafe(response);
  return { response, payload };
}

function correlationIdFromPayload(payload) {
  return (
    payload?.correlationId
    || payload?.receipt?.correlationId
    || payload?.mutation?.correlationId
    || null
  );
}

class SmokeFailure extends Error {
  constructor({ step, status, correlationId, payload }) {
    super(`Smoke step "${step}" failed with status ${status}.`);
    this.step = step;
    this.status = status;
    this.correlationId = correlationId || null;
    this.payload = payload;
  }
}

function assertStepOk(step, { response, payload }) {
  if (response.ok && payload?.ok !== false) return;
  throw new SmokeFailure({
    step,
    status: response.status,
    correlationId: correlationIdFromPayload(payload),
    payload,
  });
}

function assertAdminHubPanels(payload) {
  // B1 (reviewer): the admin hub emits `{ ok, adminHub: { dashboardKpis,
  // opsActivityStream, accountOpsMetadata, errorLogSummary, ... } }`
  // (see `worker/src/repository.js::readAdminHub`). The previous shape
  // (`panels`, `adminOps`, top-level `kpi`/`activity`) never existed, so
  // the assertion was effectively a no-op. Read from `payload.adminHub`
  // and check the four canonical keys. Reject explicitly if `adminHub`
  // is missing too — absent-envelope is a distinct failure mode and
  // deserves its own error message.
  const adminHub = payload && typeof payload === 'object' ? payload.adminHub : null;
  if (!adminHub || typeof adminHub !== 'object') {
    throw new SmokeFailure({
      step: 'admin-hub panels',
      status: 200,
      correlationId: correlationIdFromPayload(payload),
      payload: { missing: ['adminHub'] },
    });
  }
  const requiredKeys = ['dashboardKpis', 'opsActivityStream', 'errorLogSummary', 'accountOpsMetadata'];
  const missing = requiredKeys.filter((key) => adminHub[key] === undefined || adminHub[key] === null);
  if (missing.length > 0) {
    throw new SmokeFailure({
      step: 'admin-hub panels',
      status: 200,
      correlationId: correlationIdFromPayload(payload),
      payload: { missing },
    });
  }
}

function findSmokeAccountRow(payload, targetEmail) {
  const rows = payload?.rows || payload?.accounts || payload?.results || [];
  const normalisedTarget = String(targetEmail || '').toLowerCase();
  return rows.find((row) => String(row.email || '').toLowerCase() === normalisedTarget) || null;
}

// U3 (P7): Persist the smoke result to reports/admin-smoke/latest.json
// so the evidence generator can ingest it as a source.
function resolveRepoRoot() {
  const url = import.meta.url;
  if (url.startsWith('file://')) {
    const scriptDir = new URL('.', url).pathname.replace(/^\/([A-Z]:)/i, '$1');
    return resolve(scriptDir, '..');
  }
  return process.cwd();
}

async function resolveSmokeCommit() {
  const envSha = process.env.GITHUB_SHA || process.env.KS2_CAPACITY_COMMIT_SHA;
  if (envSha && /^[0-9a-f]{7,40}$/i.test(envSha)) return envSha;
  try {
    const { execSync } = await import('node:child_process');
    return execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).toString().trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

function persistSmokeResult({ ok, failures, steps, rootDir }) {
  const reportsDir = resolve(rootDir || resolveRepoRoot(), 'reports', 'admin-smoke');
  const outputPath = resolve(reportsDir, 'latest.json');
  if (!existsSync(reportsDir)) {
    mkdirSync(reportsDir, { recursive: true });
  }
  const commit = process.env.GITHUB_SHA
    || process.env.KS2_CAPACITY_COMMIT_SHA
    || 'unknown';
  const payload = {
    ok: Boolean(ok),
    finishedAt: new Date().toISOString(),
    smokeType: 'admin',
    failures: Array.isArray(failures) ? failures.map(String) : [],
    commit,
  };
  writeFileSync(outputPath, JSON.stringify(payload, null, 2) + '\n');
  return outputPath;
}

export async function runSmoke({
  env = process.env,
  emit = (envelope) => console.log(JSON.stringify(envelope, null, 2)),
  rootDir = null,
} = {}) {
  const steps = [];
  let sequence = 0;
  const recordStep = (step, detail = {}) => {
    sequence += 1;
    steps.push({ step, sequence, ...detail });
  };

  let baseUrl;
  let credentials;
  try {
    baseUrl = resolveBaseUrl(env);
    credentials = requireEnvCredentials(env);
  } catch (error) {
    emit({ ok: false, exit_code: EXIT_USAGE, error: error?.message || String(error) });
    return EXIT_USAGE;
  }
  const timeoutMs = resolveTimeout(env);

  try {
    // 1. Login with the dedicated smoke account. Cookie carries through
    //    every subsequent call.
    const loginResult = await apiSend({
      baseUrl,
      method: 'POST',
      path: '/api/auth/login',
      body: { email: credentials.email, password: credentials.password },
      timeoutMs,
    });
    assertStepOk('login', loginResult);
    const cookie = sessionCookieFromResponse(loginResult.response);
    if (!cookie) {
      throw new SmokeFailure({
        step: 'login',
        status: loginResult.response.status,
        correlationId: correlationIdFromPayload(loginResult.payload),
        payload: { hint: 'ks2_session cookie missing from login response' },
      });
    }
    recordStep('login');

    // 2. Admin hub — a single GET returns all four panel envelopes.
    const hub = await apiGet({ baseUrl, path: '/api/hubs/admin', cookie, timeoutMs });
    assertStepOk('admin-hub', hub);
    assertAdminHubPanels(hub.payload);
    recordStep('admin-hub', { generatedAt: hub.payload?.generatedAt || null });

    // 3. Four narrow refresh routes — each GET must return a fresh
    //    `generatedAt` under its `ok: true` envelope.
    const narrowRoutes = [
      '/api/admin/ops/kpi',
      '/api/admin/ops/activity',
      '/api/admin/ops/error-events',
      '/api/admin/ops/accounts-metadata',
    ];
    for (const path of narrowRoutes) {
      const result = await apiGet({ baseUrl, path, cookie, timeoutMs });
      assertStepOk(`narrow-refresh ${path}`, result);
      recordStep(`narrow-refresh ${path}`);
    }

    // 4. Locate the smoke account's own row in the accounts-metadata
    //    panel so we have its current `plan_label` (or equivalent)
    //    to set up a reversible mutation.
    const accountsMetadata = await apiGet({
      baseUrl,
      path: '/api/admin/ops/accounts-metadata',
      cookie,
      timeoutMs,
    });
    assertStepOk('accounts-metadata lookup', accountsMetadata);
    const smokeRow = findSmokeAccountRow(accountsMetadata.payload, credentials.email);
    if (!smokeRow || !smokeRow.accountId) {
      throw new SmokeFailure({
        step: 'accounts-metadata lookup',
        status: accountsMetadata.response.status,
        correlationId: correlationIdFromPayload(accountsMetadata.payload),
        payload: { hint: 'smoke account row not found in accounts-metadata panel' },
      });
    }
    const originalPlanLabel = typeof smokeRow.planLabel === 'string' ? smokeRow.planLabel : '';
    // I3 (reviewer) pre-run canary: a stamped `smoke-<iso>` label on the
    // smoke account means the previous run's reverse mutation never
    // landed. Treating that value as the "original" would propagate the
    // drift forever. Refuse to run and emit a `SMOKE_ACCOUNT_DIRTY`
    // error with clear remediation instructions.
    if (originalPlanLabel.startsWith('smoke-')) {
      emit({
        ok: false,
        exit_code: EXIT_USAGE,
        base_url: baseUrl,
        error: 'SMOKE_ACCOUNT_DIRTY',
        details: {
          accountId: smokeRow.accountId,
          currentPlanLabel: originalPlanLabel,
          hint:
            'The smoke account\'s plan_label still carries a smoke-<iso> stamp from a '
            + 'prior run whose reverse mutation did not land. Reset it manually to a '
            + 'non-smoke value via the admin hub before re-running. See '
            + '`docs/hardening/admin-ops-smoke-setup.md` "State drift recovery".',
        },
        steps,
      });
      return EXIT_USAGE;
    }
    const stampedPlanLabel = `smoke-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;

    // 5. PUT no-op `plan_label` update on the smoke account only — then
    //    PUT the inverse so the post-smoke state equals the pre-smoke
    //    state. Idempotency keys use the smoke-<iso>-<seq> convention.
    // I3 (reviewer): the forward/reverse pair is wrapped in a try/finally
    // so a failing reverse PUT still gets retried exactly once. If the
    // retry also fails, the script exits with `EXIT_STATE_DRIFT` so CI
    // can alert on the distinct failure mode. The forward mutation
    // tracks success via `forwardApplied` so the finally block only
    // attempts cleanup when a stamp actually landed.
    const forwardRequestId = makeRequestId(sequence + 1);
    let forwardApplied = false;
    let reverseApplied = false;
    try {
      const forward = await apiSend({
        baseUrl,
        method: 'PUT',
        path: `/api/admin/accounts/${encodeURIComponent(smokeRow.accountId)}/ops-metadata`,
        cookie,
        timeoutMs,
        body: {
          patch: { planLabel: stampedPlanLabel },
          requestId: forwardRequestId,
          correlationId: forwardRequestId,
        },
      });
      assertStepOk('account-ops-metadata forward update', forward);
      forwardApplied = true;
      recordStep('account-ops-metadata forward update', { requestId: forwardRequestId });

      const reverseRequestId = makeRequestId(sequence + 1);
      const reverse = await apiSend({
        baseUrl,
        method: 'PUT',
        path: `/api/admin/accounts/${encodeURIComponent(smokeRow.accountId)}/ops-metadata`,
        cookie,
        timeoutMs,
        body: {
          patch: { planLabel: originalPlanLabel },
          requestId: reverseRequestId,
          correlationId: reverseRequestId,
        },
      });
      assertStepOk('account-ops-metadata reverse update', reverse);
      reverseApplied = true;
      recordStep('account-ops-metadata reverse update', { requestId: reverseRequestId });
    } finally {
      // If we stamped the smoke account but the reverse never landed,
      // retry once. If that second attempt still fails, emit a loud
      // `STATE_DRIFT_DETECTED` envelope and exit with `EXIT_STATE_DRIFT`.
      if (forwardApplied && !reverseApplied) {
        const retryRequestId = makeRequestId(sequence + 1);
        try {
          const retry = await apiSend({
            baseUrl,
            method: 'PUT',
            path: `/api/admin/accounts/${encodeURIComponent(smokeRow.accountId)}/ops-metadata`,
            cookie,
            timeoutMs,
            body: {
              patch: { planLabel: originalPlanLabel },
              requestId: retryRequestId,
              correlationId: retryRequestId,
            },
          });
          if (retry.response.ok && retry.payload?.ok !== false) {
            reverseApplied = true;
            recordStep('account-ops-metadata reverse retry', { requestId: retryRequestId });
          }
        } catch {
          // Fall through — drift envelope follows.
        }
        if (!reverseApplied) {
          emit({
            ok: false,
            exit_code: EXIT_STATE_DRIFT,
            base_url: baseUrl,
            error: 'STATE_DRIFT_DETECTED',
            details: {
              accountId: smokeRow.accountId,
              lastKnownGoodPlanLabel: originalPlanLabel,
              stampedPlanLabel,
              hint:
                'The forward mutation stamped the smoke account, both reverse '
                + 'attempts failed, and the account plan_label remains smoke-<iso>. '
                + 'Manually reset the plan_label via the admin hub before re-running.',
            },
            steps,
          });
          return EXIT_STATE_DRIFT;
        }
      }
    }

    // 6. POST a synthetic error event from a fake SHA release so the
    //    ingest path is exercised end-to-end. Receipt accepts or dedups
    //    against any prior smoke ingest.
    const errorIngest = await apiSend({
      baseUrl,
      method: 'POST',
      path: '/api/ops/error-event',
      cookie,
      timeoutMs,
      body: {
        errorKind: 'SmokeCheckError',
        messageFirstLine: `smoke ingest ${new Date().toISOString()}`,
        firstFrame: 'at smokeProducer (smoke.mjs:1)',
        routeName: '/smoke',
        userAgent: 'ks2-admin-ops-smoke',
        // I10 (reviewer): Phase E validates `release` against
        // `/^[a-f0-9]{6,40}$/` (SHA-shaped). `smoke-release-0000000`
        // will fail that regex once shipped. `0000000` is a 7-char hex
        // string that passes validation, is clearly a placeholder, and
        // still lets the admin hub filter out smoke ingest by release.
        release: '0000000',
      },
    });
    assertStepOk('ops-error-event ingest', errorIngest);
    recordStep('ops-error-event ingest', {
      eventId: errorIngest.payload?.eventId || null,
      deduped: Boolean(errorIngest.payload?.deduped),
    });

    // 7. Optional: transition the synthetic error through investigating
    //    then back to open. If the ingest deduped, we still exercise
    //    the status-transition route against the repeated id.
    const eventId = errorIngest.payload?.eventId;
    if (eventId) {
      const investigateRequestId = makeRequestId(sequence + 1);
      const investigate = await apiSend({
        baseUrl,
        method: 'PUT',
        path: `/api/admin/ops/error-events/${encodeURIComponent(eventId)}/status`,
        cookie,
        timeoutMs,
        body: {
          status: 'investigating',
          requestId: investigateRequestId,
          correlationId: investigateRequestId,
        },
      });
      assertStepOk('ops-error-event status investigating', investigate);
      recordStep('ops-error-event status investigating', { requestId: investigateRequestId });

      const openRequestId = makeRequestId(sequence + 1);
      const reopen = await apiSend({
        baseUrl,
        method: 'PUT',
        path: `/api/admin/ops/error-events/${encodeURIComponent(eventId)}/status`,
        cookie,
        timeoutMs,
        body: {
          status: 'open',
          requestId: openRequestId,
          correlationId: openRequestId,
          expectedPreviousStatus: 'investigating',
        },
      });
      assertStepOk('ops-error-event status reopen', reopen);
      recordStep('ops-error-event status reopen', { requestId: openRequestId });
    }

    // ---------------------------------------------------------------
    // P3 panel coverage (steps 8-14). Each step is wrapped in its own
    // try/catch so a failure escalates exitCode to EXIT_FAILURE but
    // does NOT abort subsequent steps — the smoke run reports as many
    // data-points as possible in a single invocation.
    // ---------------------------------------------------------------
    let exitCode = EXIT_OK;
    const failedSteps = [];

    // 8. Debug Bundle generation — exercises the fan-out query behind
    //    /api/admin/debug-bundle with the smoke account's own ID and
    //    a recent 24-hour time window.
    try {
      const timeNow = Date.now();
      const debugBundle = await apiGet({
        baseUrl,
        path: `/api/admin/debug-bundle?account_id=${encodeURIComponent(smokeRow.accountId)}`
          + `&time_from=${timeNow - 86_400_000}&time_to=${timeNow}`,
        cookie,
        timeoutMs,
      });
      assertStepOk('debug-bundle', debugBundle);
      // Verify the bundle contains the expected section keys. Each
      // section may be null (e.g. no errors for the smoke account) but
      // the keys themselves must be present in the response envelope.
      const bundle = debugBundle.payload?.bundle;
      const requiredBundleKeys = [
        'accountSummary', 'recentErrors', 'errorOccurrences',
        'recentDenials', 'recentMutations', 'linkedLearners', 'capacityState',
      ];
      const missingBundleKeys = requiredBundleKeys.filter(
        (key) => bundle === null || bundle === undefined || !(key in bundle),
      );
      if (missingBundleKeys.length > 0) {
        throw new SmokeFailure({
          step: 'debug-bundle sections',
          status: 200,
          correlationId: correlationIdFromPayload(debugBundle.payload),
          payload: { missing: missingBundleKeys },
        });
      }
      recordStep('debug-bundle', { sections: requiredBundleKeys.length });
    } catch (error) {
      exitCode = EXIT_FAILURE;
      failedSteps.push(error instanceof SmokeFailure ? error : { step: 'debug-bundle', message: error?.message });
      recordStep('debug-bundle FAILED', { error: error?.message || String(error) });
    }

    // 9. Denial log read — GET /api/admin/ops/request-denials?limit=5.
    //    An empty array is a valid success (the smoke account may have
    //    no denials).
    try {
      const denials = await apiGet({
        baseUrl,
        path: '/api/admin/ops/request-denials?limit=5',
        cookie,
        timeoutMs,
      });
      assertStepOk('denial-log', denials);
      // The response contains `{ ok, entries: [...] }` — verify entries is
      // an array (empty is fine).
      const rows = denials.payload?.entries;
      if (!Array.isArray(rows)) {
        throw new SmokeFailure({
          step: 'denial-log shape',
          status: 200,
          correlationId: correlationIdFromPayload(denials.payload),
          payload: { hint: 'expected entries array in denial-log response' },
        });
      }
      recordStep('denial-log', { count: rows.length });
    } catch (error) {
      exitCode = EXIT_FAILURE;
      failedSteps.push(error instanceof SmokeFailure ? error : { step: 'denial-log', message: error?.message });
      recordStep('denial-log FAILED', { error: error?.message || String(error) });
    }

    // 10. Account search — verify the smoke account appears when
    //     searched by its own email.
    try {
      const search = await apiGet({
        baseUrl,
        path: `/api/admin/accounts/search?q=${encodeURIComponent(credentials.email)}&limit=5`,
        cookie,
        timeoutMs,
      });
      assertStepOk('account-search', search);
      const searchRow = findSmokeAccountRow(search.payload, credentials.email);
      if (!searchRow) {
        throw new SmokeFailure({
          step: 'account-search match',
          status: 200,
          correlationId: correlationIdFromPayload(search.payload),
          payload: { hint: 'smoke account not found in search results' },
        });
      }
      recordStep('account-search', { matchedAccountId: searchRow.accountId || searchRow.id });
    } catch (error) {
      exitCode = EXIT_FAILURE;
      failedSteps.push(error instanceof SmokeFailure ? error : { step: 'account-search', message: error?.message });
      recordStep('account-search FAILED', { error: error?.message || String(error) });
    }

    // 11. Account detail — GET /api/admin/accounts/:id/detail for the
    //     smoke account. Verify the expected top-level section keys.
    try {
      const detail = await apiGet({
        baseUrl,
        path: `/api/admin/accounts/${encodeURIComponent(smokeRow.accountId)}/detail`,
        cookie,
        timeoutMs,
      });
      assertStepOk('account-detail', detail);
      const requiredDetailKeys = [
        'account', 'learners', 'recentErrors',
        'recentDenials', 'recentMutations', 'opsMetadata',
      ];
      const missingDetailKeys = requiredDetailKeys.filter(
        (key) => !(key in (detail.payload || {})),
      );
      if (missingDetailKeys.length > 0) {
        throw new SmokeFailure({
          step: 'account-detail sections',
          status: 200,
          correlationId: correlationIdFromPayload(detail.payload),
          payload: { missing: missingDetailKeys },
        });
      }
      recordStep('account-detail', { sections: requiredDetailKeys.length });
    } catch (error) {
      exitCode = EXIT_FAILURE;
      failedSteps.push(error instanceof SmokeFailure ? error : { step: 'account-detail', message: error?.message });
      recordStep('account-detail FAILED', { error: error?.message || String(error) });
    }

    // 12. Content overview — GET /api/admin/ops/content-overview.
    //     Verifies the narrow panel route returns ok.
    try {
      const content = await apiGet({
        baseUrl,
        path: '/api/admin/ops/content-overview',
        cookie,
        timeoutMs,
      });
      assertStepOk('content-overview', content);
      recordStep('content-overview');
    } catch (error) {
      exitCode = EXIT_FAILURE;
      failedSteps.push(error instanceof SmokeFailure ? error : { step: 'content-overview', message: error?.message });
      recordStep('content-overview FAILED', { error: error?.message || String(error) });
    }

    // 13. Marketing messages list — GET /api/admin/marketing/messages.
    //     Verify 200 and array-shaped response.
    try {
      const mktList = await apiGet({
        baseUrl,
        path: '/api/admin/marketing/messages',
        cookie,
        timeoutMs,
      });
      assertStepOk('marketing-messages-list', mktList);
      const messages = mktList.payload?.messages;
      if (!Array.isArray(messages)) {
        throw new SmokeFailure({
          step: 'marketing-messages-list shape',
          status: 200,
          correlationId: correlationIdFromPayload(mktList.payload),
          payload: { hint: 'expected messages array in marketing list response' },
        });
      }
      recordStep('marketing-messages-list', { count: messages.length });
    } catch (error) {
      exitCode = EXIT_FAILURE;
      failedSteps.push(error instanceof SmokeFailure ? error : { step: 'marketing-messages-list', message: error?.message });
      recordStep('marketing-messages-list FAILED', { error: error?.message || String(error) });
    }

    // 14. Marketing write-path round-trip — create draft → archive.
    //     Uses `audience: 'internal'` to avoid the broad-publish gate.
    //     If the create succeeds but the archive fails, the script
    //     exits with EXIT_STATE_DRIFT (code 3) since a visible draft
    //     is left behind. This mirrors the ops-metadata drift pattern.
    try {
      const mktCreateRequestId = makeRequestId(sequence + 1);
      let mktDraftCreated = false;
      let mktArchived = false;
      let createdMessageId = null;
      let createdRowVersion = null;

      try {
        const create = await apiSend({
          baseUrl,
          method: 'POST',
          path: '/api/admin/marketing/messages',
          cookie,
          timeoutMs,
          body: {
            title: `Smoke test ${new Date().toISOString().slice(0, 19)}`,
            body_text: `Automated smoke run — safe to delete. requestId: ${mktCreateRequestId}`,
            message_type: 'announcement',
            audience: 'internal',
          },
        });
        assertStepOk('marketing-create', create);
        mktDraftCreated = true;
        createdMessageId = create.payload?.message?.id || null;
        createdRowVersion = create.payload?.message?.row_version ?? 0;
        recordStep('marketing-create', { requestId: mktCreateRequestId, messageId: createdMessageId });

        if (!createdMessageId) {
          throw new SmokeFailure({
            step: 'marketing-create id',
            status: create.response.status,
            correlationId: correlationIdFromPayload(create.payload),
            payload: { hint: 'created message missing id in response' },
          });
        }

        // Transition to archived to clean up. Uses CAS via
        // expectedRowVersion to exercise the concurrency guard.
        const archiveRequestId = makeRequestId(sequence + 1);
        const archive = await apiSend({
          baseUrl,
          method: 'PUT',
          path: `/api/admin/marketing/messages/${encodeURIComponent(createdMessageId)}`,
          cookie,
          timeoutMs,
          body: {
            action: 'archived',
            expectedRowVersion: createdRowVersion,
            requestId: archiveRequestId,
            correlationId: archiveRequestId,
          },
        });
        assertStepOk('marketing-archive', archive);
        mktArchived = true;
        recordStep('marketing-archive', { requestId: archiveRequestId, messageId: createdMessageId });
      } finally {
        // State-drift guard: if the draft was created but archiving
        // failed, retry once. If the retry also fails, escalate to
        // EXIT_STATE_DRIFT.
        if (mktDraftCreated && !mktArchived && createdMessageId) {
          const retryArchiveRequestId = makeRequestId(sequence + 1);
          try {
            // Re-read the message to get the current row_version
            // in case a concurrent write bumped it.
            const reRead = await apiGet({
              baseUrl,
              path: `/api/admin/marketing/messages/${encodeURIComponent(createdMessageId)}`,
              cookie,
              timeoutMs,
            });
            const currentRowVersion = reRead.payload?.message?.row_version ?? 0;

            const retryArchive = await apiSend({
              baseUrl,
              method: 'PUT',
              path: `/api/admin/marketing/messages/${encodeURIComponent(createdMessageId)}`,
              cookie,
              timeoutMs,
              body: {
                action: 'archived',
                expectedRowVersion: currentRowVersion,
                requestId: retryArchiveRequestId,
                correlationId: retryArchiveRequestId,
              },
            });
            if (retryArchive.response.ok && retryArchive.payload?.ok !== false) {
              mktArchived = true;
              recordStep('marketing-archive retry', { requestId: retryArchiveRequestId, messageId: createdMessageId });
            }
          } catch {
            // Fall through — drift envelope follows.
          }
          if (!mktArchived) {
            emit({
              ok: false,
              exit_code: EXIT_STATE_DRIFT,
              base_url: baseUrl,
              error: 'STATE_DRIFT_DETECTED',
              details: {
                resource: 'marketing_message',
                messageId: createdMessageId,
                hint:
                  'A smoke draft marketing message was created but could not be '
                  + 'archived. The draft remains visible in the admin marketing '
                  + 'panel. Manually archive or delete it via the admin hub.',
              },
              steps,
            });
            exitCode = EXIT_STATE_DRIFT;
          }
        }
      }
    } catch (error) {
      exitCode = EXIT_FAILURE;
      failedSteps.push(error instanceof SmokeFailure ? error : { step: 'marketing-roundtrip', message: error?.message });
      recordStep('marketing-roundtrip FAILED', { error: error?.message || String(error) });
    }

    // ---------------------------------------------------------------
    // If any P3 step failed, report the first failure for triage but
    // still include all steps in the envelope.
    // ---------------------------------------------------------------
    if (exitCode !== EXIT_OK) {
      const first = failedSteps[0];
      const failureNames = failedSteps.map((f) => f?.step || 'unknown');
      emit({
        ok: false,
        exit_code: exitCode,
        base_url: baseUrl,
        failed_step: first?.step || 'unknown',
        status: first?.status || null,
        correlation_id: first?.correlationId || null,
        payload: first?.payload || { message: first?.message || null },
        failed_step_count: failedSteps.length,
        steps,
      });
      try { persistSmokeResult({ ok: false, failures: failureNames, steps, rootDir }); } catch { /* best-effort */ }
      return exitCode;
    }
  } catch (error) {
    if (error instanceof SmokeFailure) {
      emit({
        ok: false,
        exit_code: EXIT_FAILURE,
        base_url: baseUrl,
        failed_step: error.step,
        status: error.status,
        correlation_id: error.correlationId,
        payload: error.payload,
        steps,
      });
      try { persistSmokeResult({ ok: false, failures: [error.step], steps, rootDir }); } catch { /* best-effort */ }
      return EXIT_FAILURE;
    }
    emit({
      ok: false,
      exit_code: EXIT_FAILURE,
      base_url: baseUrl,
      error: error?.message || String(error),
      steps,
    });
    try { persistSmokeResult({ ok: false, failures: [error?.message || 'unknown'], steps, rootDir }); } catch { /* best-effort */ }
    return EXIT_FAILURE;
  }

  emit({ ok: true, exit_code: EXIT_OK, base_url: baseUrl, steps });

  // U3 (P7): Persist result for evidence generator ingestion.
  try {
    persistSmokeResult({ ok: true, failures: [], steps, rootDir });
  } catch {
    // Non-fatal — the smoke run itself passed; file write is best-effort.
  }

  return EXIT_OK;
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log([
      'Usage: KS2_SMOKE_ACCOUNT_EMAIL=... KS2_SMOKE_ACCOUNT_PASSWORD=...',
      '       node scripts/admin-ops-production-smoke.mjs',
      '',
      'Env:',
      '  KS2_SMOKE_ACCOUNT_EMAIL     (required)',
      '  KS2_SMOKE_ACCOUNT_PASSWORD  (required)',
      '  KS2_SMOKE_BASE_URL          (default https://ks2.eugnel.uk)',
      '  KS2_SMOKE_TIMEOUT_MS        (default 15000)',
      '',
      'Steps exercised:',
      '   1. Login (POST /api/auth/login)',
      '   2. Admin hub read (GET /api/hubs/admin) + panel assertion',
      '   3. Four narrow refresh routes (kpi, activity, error-events, accounts-metadata)',
      '   4. Locate smoke account row in accounts-metadata + dirty canary',
      '   5. Ops-metadata forward/reverse mutation round-trip',
      '   6. Synthetic error-event ingest (POST /api/ops/error-event)',
      '   7. Error-event status transition (investigating -> open)',
      '   8. Debug Bundle generation (GET /api/admin/debug-bundle)',
      '   9. Denial log read (GET /api/admin/ops/request-denials)',
      '  10. Account search (GET /api/admin/accounts/search)',
      '  11. Account detail (GET /api/admin/accounts/:id/detail)',
      '  12. Content overview (GET /api/admin/ops/content-overview)',
      '  13. Marketing messages list (GET /api/admin/marketing/messages)',
      '  14. Marketing write-path round-trip (create draft -> archive)',
      '',
      'Exit codes:',
      '  0 — all steps green',
      '  1 — one or more steps returned non-2xx or unexpected shape',
      '  2 — usage error (missing env, malformed URL, SMOKE_ACCOUNT_DIRTY)',
      '  3 — state drift (forward mutation applied but reverse failed)',
      '',
      'Steps 1-7 abort on first failure. Steps 8-14 continue on failure',
      'so the report covers as many data-points as possible.',
      '',
      'See docs/hardening/admin-ops-smoke-setup.md for the runbook.',
    ].join('\n'));
    return EXIT_OK;
  }
  return runSmoke();
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, exit_code: EXIT_FAILURE, error: error?.message || String(error) }, null, 2));
      process.exit(EXIT_FAILURE);
    });
}
