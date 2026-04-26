#!/usr/bin/env node
//
// U10 (P1.5 Phase C): KPI reconciliation script.
//
// Posts a reconciliation request to `/api/admin/ops/reconcile-kpis`. The
// Worker route re-computes authoritative counters server-side; the
// client-side `computedValues` here are forensic-diff log fodder only
// (the route does NOT trust them for writes).
//
// Credentials (same env as scripts/admin-ops-production-smoke.mjs):
//   KS2_SMOKE_ACCOUNT_EMAIL      (required)
//   KS2_SMOKE_ACCOUNT_PASSWORD   (required)
//   KS2_SMOKE_BASE_URL           (optional, default https://ks2.eugnel.uk)
//   KS2_SMOKE_TIMEOUT_MS         (optional, default 15_000)
//
// CLI entrypoint guard uses `pathToFileURL(process.argv[1]).href ===
// import.meta.url` per Windows hygiene.
//
// Exit codes:
//   0 — reconciliation returned 200, counters written.
//   1 — reconciliation returned non-2xx (including 409 reconcile_in_progress).
//   2 — usage error (missing env var, malformed base URL).

import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

export const EXIT_OK = 0;
export const EXIT_FAILURE = 1;
export const EXIT_USAGE = 2;

const DEFAULT_BASE_URL = 'https://ks2.eugnel.uk';
const DEFAULT_TIMEOUT_MS = 15_000;

export function resolveBaseUrl(env = process.env) {
  const raw = env.KS2_SMOKE_BASE_URL || DEFAULT_BASE_URL;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (error) {
    throw new Error(`KS2_SMOKE_BASE_URL is not a valid URL: ${raw} (${error?.message || error})`);
  }
  // HTTPS-only to avoid leaking the reconcile-service credential.
  if (parsed.protocol !== 'https:') {
    throw new Error(`KS2_SMOKE_BASE_URL must use https:// (got ${parsed.protocol}//${parsed.host})`);
  }
  return parsed.origin;
}

export function resolveTimeout(env = process.env) {
  const parsed = Number(env.KS2_SMOKE_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

export function requireEnvCredentials(env = process.env) {
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
  const sessionHeader = raw.find((entry) => entry.startsWith('ks2_session='));
  if (!sessionHeader) return '';
  return sessionHeader.split(';', 1)[0];
}

export function buildRequestId(date = new Date(), uuid = randomUUID) {
  // smoke-<iso-date>-<uuid> so admin-activity filters can exclude
  // reconciliation requests from real-user telemetry.
  return `reconcile-${date.toISOString().replace(/[:.]/g, '-')}-${String(uuid()).slice(0, 8)}`;
}

export async function runReconcile({
  baseUrl,
  email,
  password,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchFn = globalThis.fetch,
  now = () => new Date(),
  uuid = randomUUID,
} = {}) {
  if (typeof fetchFn !== 'function') {
    throw new Error('fetch is not available.');
  }
  const requestId = buildRequestId(now(), uuid);
  const correlationId = requestId;

  // Sign in and capture the session cookie.
  const loginResponse = await fetchFn(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: baseUrl,
    },
    body: JSON.stringify({ email, password }),
    signal: timeoutSignal(timeoutMs),
  });
  if (!loginResponse.ok) {
    throw new Error(`Sign-in failed (${loginResponse.status}).`);
  }
  const cookie = sessionCookieFromResponse(loginResponse);
  if (!cookie) {
    throw new Error('Sign-in returned no session cookie.');
  }

  // Post the reconciliation request. The body's `computedValues` is
  // optional and used only for forensic-diff logging server-side.
  const response = await fetchFn(`${baseUrl}/api/admin/ops/reconcile-kpis`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: baseUrl,
      cookie,
    },
    body: JSON.stringify({
      mutation: { requestId, correlationId },
      // Script does not pre-compute counters locally. Reconciliation
      // authoritative-recompute is server-side.
      computedValues: null,
    }),
    signal: timeoutSignal(timeoutMs),
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, payload, requestId, correlationId };
}

export function usage() {
  return [
    'Usage: node ./scripts/admin-reconcile-kpis.mjs',
    '',
    'Environment:',
    '  KS2_SMOKE_ACCOUNT_EMAIL     (required) admin service account email',
    '  KS2_SMOKE_ACCOUNT_PASSWORD  (required) admin service account password',
    '  KS2_SMOKE_BASE_URL          (optional) base URL (default https://ks2.eugnel.uk)',
    '  KS2_SMOKE_TIMEOUT_MS        (optional) timeout per request (default 15000)',
  ].join('\n');
}

async function runCli(argv = process.argv.slice(2), env = process.env) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage());
    return EXIT_OK;
  }
  let credentials;
  let baseUrl;
  let timeoutMs;
  try {
    credentials = requireEnvCredentials(env);
    baseUrl = resolveBaseUrl(env);
    timeoutMs = resolveTimeout(env);
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    return EXIT_USAGE;
  }
  try {
    const result = await runReconcile({
      baseUrl,
      email: credentials.email,
      password: credentials.password,
      timeoutMs,
    });
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? EXIT_OK : EXIT_FAILURE;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2));
    return EXIT_FAILURE;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2));
    process.exitCode = EXIT_FAILURE;
  });
}
