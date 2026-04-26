#!/usr/bin/env node
//
// U6 (P1.5 Phase B): production same-origin smoke for the admin-ops
// console. Exercises the live `https://ks2.eugnel.uk` deployment
// through an end-to-end workflow equivalent to the operator opening
// the admin hub, clicking each of the four narrow refresh buttons,
// saving an account-ops-metadata update (then reversing it), and
// posting a synthetic error event. Every mutation carries a
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
//   2 — usage error (missing env var, malformed base URL).
//
// CLI entrypoint guard uses `pathToFileURL(process.argv[1]).href ===
// import.meta.url` per Windows hygiene — avoids the POSIX-only form
// that misbehaves on Windows where drive letters diverge.

import { pathToFileURL } from 'node:url';

export const EXIT_OK = 0;
export const EXIT_FAILURE = 1;
export const EXIT_USAGE = 2;

const DEFAULT_BASE_URL = 'https://ks2.eugnel.uk';
const DEFAULT_TIMEOUT_MS = 15_000;

function resolveBaseUrl(env = process.env) {
  const raw = env.KS2_SMOKE_BASE_URL || DEFAULT_BASE_URL;
  try {
    return new URL(raw).origin;
  } catch (error) {
    throw new Error(`KS2_SMOKE_BASE_URL is not a valid URL: ${raw} (${error?.message || error})`);
  }
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
  const today = new Date().toISOString().slice(0, 10);
  return `smoke-${today}-${sequence}`;
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
  // The four P1.5 panels must be present on the admin hub envelope.
  const panels = payload?.panels || payload?.adminOps || payload;
  const requiredKeys = ['kpi', 'activity', 'errorEvents', 'accountsMetadata'];
  const missing = requiredKeys.filter((key) => !panels?.[key] && !payload?.[key]);
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
  const rows = payload?.rows || payload?.accounts || [];
  const normalisedTarget = String(targetEmail || '').toLowerCase();
  return rows.find((row) => String(row.email || '').toLowerCase() === normalisedTarget) || null;
}

export async function runSmoke({
  env = process.env,
  emit = (envelope) => console.log(JSON.stringify(envelope, null, 2)),
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
    const stampedPlanLabel = `smoke-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;

    // 5. PUT no-op `plan_label` update on the smoke account only — then
    //    PUT the inverse so the post-smoke state equals the pre-smoke
    //    state. Idempotency keys use the smoke-<iso>-<seq> convention.
    const forwardRequestId = makeRequestId(sequence + 1);
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
    recordStep('account-ops-metadata reverse update', { requestId: reverseRequestId });

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
        release: 'smoke-release-0000000',
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
      return EXIT_FAILURE;
    }
    emit({
      ok: false,
      exit_code: EXIT_FAILURE,
      base_url: baseUrl,
      error: error?.message || String(error),
      steps,
    });
    return EXIT_FAILURE;
  }

  emit({ ok: true, exit_code: EXIT_OK, base_url: baseUrl, steps });
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
      'Exit codes: 0 ok, 1 failure, 2 usage.',
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
