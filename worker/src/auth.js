import {
  AccountPaymentHoldError,
  AccountSuspendedError,
  AuthConfigurationError,
  BadRequestError,
  BackendUnavailableError,
  ConflictError,
  SessionInvalidatedError,
  UnauthenticatedError,
} from './errors.js';
import { normalisePlatformRole } from '../../src/platform/access/roles.js';
import {
  batch,
  bindStatement,
  first,
  requireDatabase,
  requireDatabaseWithCapacity,
  run,
  scalar,
  withTransaction,
} from './d1.js';
import { requireSameOrigin } from './request-origin.js';
import { consumeRateLimit, rateLimitSubject } from './rate-limit.js';

const SESSION_COOKIE_NAME = 'ks2_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OAUTH_TTL_SECONDS = 10 * 60;
const AUTH_WINDOW_MS = 10 * 60 * 1000;
const AUTH_LIMITS = {
  register: { ip: 6, email: 4 },
  login: { ip: 10, email: 8 },
  oauthStart: { ip: 12 },
};
const OAUTH_PROVIDERS = Object.freeze(['google', 'facebook', 'x', 'apple']);
const encoder = new TextEncoder();
const PBKDF2_ITERATIONS = 100000;
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function cleanText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function safeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mutationChanges(result) {
  return Number(result?.meta?.changes) || 0;
}

function demoConversionMetricStatement(db, accountId, now) {
  return bindStatement(db, `
    INSERT INTO demo_operation_metrics (metric_key, metric_count, updated_at)
    SELECT 'conversions', 1, ?
    WHERE EXISTS (
      SELECT 1
      FROM adult_accounts
      WHERE id = ?
        AND account_type = 'real'
        AND demo_expires_at IS NULL
        AND converted_from_demo_at = ?
    )
    ON CONFLICT(metric_key) DO UPDATE SET
      metric_count = demo_operation_metrics.metric_count + 1,
      updated_at = excluded.updated_at
  `, [now, accountId, now]);
}

function deleteDemoSessionsStatement(db, accountId) {
  return bindStatement(db, `
    DELETE FROM account_sessions
    WHERE account_id = ?
      AND (
        session_kind = 'demo'
        OR provider = 'demo'
      )
  `, [accountId]);
}

async function findRegisteredEmailAccountId(db, email, { excludeAccountId = null } = {}) {
  const normalisedEmail = safeEmail(email);
  if (!normalisedEmail) return null;
  const excluded = cleanText(excludeAccountId);
  return scalar(db, `
    SELECT account_id FROM (
      SELECT id AS account_id
      FROM adult_accounts
      WHERE lower(email) = lower(?)
        AND (? IS NULL OR id <> ?)
        AND COALESCE(account_type, 'real') <> 'demo'
      UNION
      SELECT account_id
      FROM account_credentials
      WHERE lower(email) = lower(?)
        AND (? IS NULL OR account_id <> ?)
      UNION
      SELECT account_id
      FROM account_identities
      WHERE lower(email) = lower(?)
        AND (? IS NULL OR account_id <> ?)
    )
    LIMIT 1
  `, [
    normalisedEmail,
    excluded,
    excluded,
    normalisedEmail,
    excluded,
    excluded,
    normalisedEmail,
    excluded,
    excluded,
  ], 'account_id');
}

async function runDemoConversionBatch(db, statements) {
  const filtered = statements.filter(Boolean);
  if (!filtered.length) return [];
  if (typeof db?.batch === 'function') return db.batch(filtered);
  // NOTE: kept by design — `withTransaction` here is the legacy-D1 fallback
  // for a shim that lacks `batch()` but supports SAVEPOINT via `exec()`.
  // The production path ALWAYS enters the `db.batch()` branch above; this
  // wrapper only triggers inside test doubles that deliberately omit
  // `batch`. Removing it would regress those tests.
  if (db?.supportsSqlTransactions === true && typeof db.exec === 'function') {
    return withTransaction(db, async () => {
      const results = [];
      for (const statement of filtered) results.push(await statement.run());
      return results;
    });
  }
  throw new BackendUnavailableError('Demo account conversion requires transactional batch support.', {
    code: 'demo_conversion_transaction_unavailable',
  });
}

function requireDemoConversionApplied(results, { credentialIndex = null, identityIndex = null } = {}) {
  if (mutationChanges(results?.[0]) !== 1) {
    throw new BadRequestError('Demo session expired. Start a new demo before creating an account.', {
      code: 'demo_session_required',
    });
  }
  if (credentialIndex !== null && mutationChanges(results?.[credentialIndex]) !== 1) {
    throw new BadRequestError('Demo session expired. Start a new demo before creating an account.', {
      code: 'demo_session_required',
    });
  }
  if (identityIndex !== null && mutationChanges(results?.[identityIndex]) !== 1) {
    throw new BadRequestError('Demo session expired. Start a new demo before creating an account.', {
      code: 'demo_session_required',
    });
  }
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const normalised = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalised + '='.repeat((4 - (normalised.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function base64UrlToJson(value) {
  const bytes = base64UrlToBytes(value);
  return safeJsonParse(new TextDecoder().decode(bytes), {});
}

export function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value)));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function hashPassword(password, salt = randomToken(16)) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(String(password)),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: base64UrlToBytes(salt),
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    256,
  );
  return {
    salt,
    hash: bytesToBase64Url(new Uint8Array(bits)),
  };
}

async function verifyPassword(password, salt, expectedHash) {
  const derived = await hashPassword(password, salt);
  return derived.hash === expectedHash;
}

function normaliseEnvironmentMode(env = {}) {
  const explicit = cleanText(env.AUTH_MODE);
  if (explicit) return explicit;
  const stage = String(env.ENVIRONMENT || env.NODE_ENV || '').trim().toLowerCase();
  if (stage === 'development' || stage === 'dev' || stage === 'test') return 'development-stub';
  return 'production';
}

function normaliseProvider(provider) {
  const key = String(provider || '').trim().toLowerCase();
  if (!OAUTH_PROVIDERS.includes(key)) {
    throw new BadRequestError('Unknown sign-in provider.', { code: 'unknown_auth_provider' });
  }
  return key;
}

function requestUrl(request) {
  return new URL(request.url);
}

function secureCookieForRequest(request) {
  const url = requestUrl(request);
  if (url.protocol === 'https:') return true;
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return false;
  return String(request.headers.get('x-forwarded-proto') || '').toLowerCase() === 'https';
}

function serialiseCookie(name, value, {
  maxAge = SESSION_TTL_MS / 1000,
  httpOnly = true,
  secure = true,
  sameSite = 'Lax',
  path = '/',
} = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value || '')}`,
    `Path=${path}`,
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
    `SameSite=${sameSite}`,
  ];
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function parseCookies(request) {
  const header = request.headers.get('cookie') || '';
  const cookies = {};
  header.split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index < 0) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) return;
    cookies[key] = decodeURIComponent(value || '');
  });
  return cookies;
}

function readSessionToken(request) {
  const cookies = parseCookies(request);
  const cookieToken = cookies[SESSION_COOKIE_NAME] || '';
  if (cookieToken) return cookieToken;
  const auth = request.headers.get('authorization') || '';
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}

export function sessionCookie(request, token, options = {}) {
  return serialiseCookie(SESSION_COOKIE_NAME, token, {
    secure: secureCookieForRequest(request),
    maxAge: options.maxAge || SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(request) {
  return serialiseCookie(SESSION_COOKIE_NAME, '', {
    secure: secureCookieForRequest(request),
    maxAge: 0,
  });
}

function oauthCookieName(part) {
  return `ks2_oauth_${part}`;
}

function oauthCookie(request, part, value, maxAge = OAUTH_TTL_SECONDS) {
  return serialiseCookie(oauthCookieName(part), value, {
    secure: secureCookieForRequest(request),
    maxAge,
  });
}

function oauthAttemptCookies(request, provider, attempt) {
  const cookies = [
    oauthCookie(request, 'provider', provider),
    oauthCookie(request, 'state', attempt.state),
    oauthCookie(request, 'verifier', attempt.codeVerifier || ''),
    oauthCookie(request, 'nonce', attempt.nonce || ''),
  ];
  if (attempt.demoAccountId && attempt.demoSessionId && attempt.demoBinding) {
    cookies.push(
      oauthCookie(request, 'demo_account', attempt.demoAccountId),
      oauthCookie(request, 'demo_session', attempt.demoSessionId),
      oauthCookie(request, 'demo_binding', attempt.demoBinding),
    );
  }
  return cookies;
}

function clearOauthCookies(request) {
  return ['provider', 'state', 'verifier', 'nonce', 'demo_account', 'demo_session', 'demo_binding']
    .map((part) => oauthCookie(request, part, '', 0));
}

function readOauthAttempt(request) {
  const cookies = parseCookies(request);
  return {
    provider: cleanText(cookies[oauthCookieName('provider')]),
    state: cleanText(cookies[oauthCookieName('state')]),
    codeVerifier: cleanText(cookies[oauthCookieName('verifier')]),
    nonce: cleanText(cookies[oauthCookieName('nonce')]),
    demoAccountId: cleanText(cookies[oauthCookieName('demo_account')]),
    demoSessionId: cleanText(cookies[oauthCookieName('demo_session')]),
    demoBinding: cleanText(cookies[oauthCookieName('demo_binding')]),
  };
}

// U5 (P1.5 Phase B): the former local `clientIp` helper is replaced by
// `rateLimitSubject(request, env)` from `worker/src/rate-limit.js`, which
// returns a tiered bucket key (v4:<addr> / v6/64:<prefix> /
// unknown:<reason>). Turnstile still wants a human-readable remote IP,
// so `turnstileRemoteIp` below keeps the raw CF-Connecting-IP lookup
// for that specific API contract only. Rate-limit identifiers come
// from the helper.

function turnstileRemoteIp(request) {
  return cleanText(
    request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]
    || request.headers.get('x-real-ip'),
  ) || '';
}

// U7: `currentWindowStart` + `consumeRateLimit` extracted to
// `worker/src/rate-limit.js` so the CSP report endpoint, demo/auth, and
// TTS all share one limiter implementation (feasibility F-06).

function turnstileEnabled(env = {}) {
  return Boolean(cleanText(env.TURNSTILE_SITE_KEY || env.TURNSTILE_SITEKEY) && cleanText(env.TURNSTILE_SECRET_KEY || env.TURNSTILE_SECRET));
}

async function verifyTurnstile(env, token, remoteIp) {
  if (!turnstileEnabled(env)) return;
  if (!cleanText(token)) {
    throw new BadRequestError('Complete the security check and try again.', { code: 'turnstile_required' });
  }
  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      secret: cleanText(env.TURNSTILE_SECRET_KEY || env.TURNSTILE_SECRET),
      response: token,
      remoteip: remoteIp || undefined,
      idempotency_key: await sha256(token),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success) {
    throw new BadRequestError('The security check could not be verified. Please try again.', {
      code: 'turnstile_failed',
    });
  }
}

async function protectEmailAuth(env, request, { action, email, turnstileToken }) {
  await verifyTurnstile(env, turnstileToken, turnstileRemoteIp(request));
  const limits = AUTH_LIMITS[action];
  const { bucketKey } = rateLimitSubject(request, env);
  const ipResult = await consumeRateLimit(env, {
    bucket: `auth-${action}-ip`,
    identifier: bucketKey,
    limit: limits.ip,
    windowMs: AUTH_WINDOW_MS,
  });
  const emailResult = await consumeRateLimit(env, {
    bucket: `auth-${action}-email`,
    identifier: email,
    limit: limits.email,
    windowMs: AUTH_WINDOW_MS,
  });
  if (!ipResult.allowed || !emailResult.allowed) {
    throw new BadRequestError('Too many sign-in attempts. Please wait a few minutes and try again.', {
      code: 'rate_limited',
      retryAfterSeconds: Math.max(ipResult.retryAfterSeconds, emailResult.retryAfterSeconds),
    });
  }
}

async function protectOAuthStart(env, request, { provider, turnstileToken }) {
  await verifyTurnstile(env, turnstileToken, turnstileRemoteIp(request));
  const { bucketKey } = rateLimitSubject(request, env);
  const result = await consumeRateLimit(env, {
    bucket: `oauth-start-${provider}`,
    identifier: bucketKey,
    limit: AUTH_LIMITS.oauthStart.ip,
    windowMs: AUTH_WINDOW_MS,
  });
  if (!result.allowed) {
    throw new BadRequestError('Too many social sign-in attempts. Please wait a few minutes and try again.', {
      code: 'rate_limited',
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
}

async function ensureAccountRow(db, {
  accountId,
  email = null,
  displayName = null,
  now,
}) {
  await run(db, `
    INSERT INTO adult_accounts (id, email, display_name, selected_learner_id, created_at, updated_at)
    VALUES (?, ?, ?, NULL, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      email = COALESCE(excluded.email, adult_accounts.email),
      display_name = COALESCE(excluded.display_name, adult_accounts.display_name),
      updated_at = excluded.updated_at
  `, [accountId, email, displayName, now, now]);
  return first(db, 'SELECT * FROM adult_accounts WHERE id = ?', [accountId]);
}

/**
 * Phase D / U13 sentinel thrown by `createSession` when the target account's
 * `ops_status` is `suspended`. Callers (OAuth callback, email login,
 * email register, demo bootstrap) catch this and issue a 302 redirect to
 * `/?auth=account_suspended` with NO cookie set, rather than minting a
 * session that would immediately 403 on the next authenticated request.
 *
 * We do not throw a structured HTTP error because the UX is a redirect,
 * not a JSON envelope — the user lands on the unauthenticated shell with a
 * banner explaining the state.
 */
export class SessionCreationSuspendedError extends Error {
  constructor(accountId) {
    super('Session creation refused — account is suspended.');
    this.name = 'SessionCreationSuspendedError';
    this.code = 'account_suspended';
    this.accountId = accountId;
  }
}

// Phase D / U13: read ops_status + status_revision so createSession can
// (a) refuse suspended accounts and (b) stamp status_revision_at_issue.
// Missing row → treated as active with revision 0 (legacy accounts
// predate migration 0011). Missing column (partial migration) → soft-fail
// to active/0 so deploy order is not load-bearing.
async function readAccountOpsStatusForSession(db, accountId) {
  if (!accountId) return { opsStatus: 'active', statusRevision: 0 };
  try {
    const row = await first(
      db,
      'SELECT ops_status, status_revision FROM account_ops_metadata WHERE account_id = ?',
      [accountId],
    );
    if (!row) return { opsStatus: 'active', statusRevision: 0 };
    return {
      opsStatus: typeof row.ops_status === 'string' && row.ops_status
        ? row.ops_status
        : 'active',
      statusRevision: Math.max(0, Number(row.status_revision) || 0),
    };
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('no such column') || message.includes('no such table')) {
      // Migration 0011 not yet applied on this instance — fall through to
      // pre-Phase-D semantics so partial-deploy ordering is not a
      // lockout risk. Next deploy snaps back to enforced.
      try {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify({
          event: 'capacity.auth.enforcement_unavailable',
          reason: 'missing_column_or_table',
          phase: 'create_session',
        }));
      } catch {
        // Swallow — telemetry is best-effort.
      }
      return { opsStatus: 'active', statusRevision: 0 };
    }
    throw error;
  }
}

export async function createSession(env, accountId, provider, now = Date.now(), options = {}) {
  const db = requireDatabase(env);
  // U13: pre-check ops_status BEFORE minting token/hash/row so a suspended
  // account never produces a session artefact. payment_hold still gets a
  // session (user needs to reach billing UI — U14 enforces mutation
  // capability at the request boundary).
  const { opsStatus, statusRevision } = await readAccountOpsStatusForSession(db, accountId);
  if (opsStatus === 'suspended') {
    try {
      // Capacity telemetry: repeated rejections signal a returning-after-
      // suspend flow and should be visible to ops.
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({
        event: 'capacity.auth.session_creation_refused.suspended',
        provider: provider || null,
      }));
    } catch {
      // Swallow — telemetry is best-effort.
    }
    throw new SessionCreationSuspendedError(accountId);
  }
  const token = randomToken(32);
  const hash = await sha256(token);
  const sessionId = `session-${randomToken(12)}`;
  const expiresAt = Number.isFinite(Number(options.expiresAt))
    ? Number(options.expiresAt)
    : now + SESSION_TTL_MS;
  const sessionKind = cleanText(options.sessionKind) || (provider === 'demo' ? 'demo' : 'real');
  // U13: stamp the account's current `status_revision` so U14's per-request
  // comparison can invalidate this session on the next transition. Legacy
  // accounts / missing-migration paths stamp 0, which remains valid until
  // the account's revision bumps above 0.
  try {
    await run(db, `
      INSERT INTO account_sessions (
        id, account_id, session_hash, provider, created_at, expires_at,
        session_kind, status_revision_at_issue
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [sessionId, accountId, hash, provider, now, expiresAt, sessionKind, statusRevision]);
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (!(message.includes('no such column') || message.includes('has no column'))) {
      throw error;
    }
    // Partial migration: the column isn't there yet. Fall back to the
    // pre-Phase-D INSERT shape so the deploy ordering remains safe.
    try {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({
        event: 'capacity.auth.enforcement_unavailable',
        reason: 'missing_column_on_insert',
        phase: 'create_session',
      }));
    } catch {
      // Swallow.
    }
    await run(db, `
      INSERT INTO account_sessions (id, account_id, session_hash, provider, created_at, expires_at, session_kind)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [sessionId, accountId, hash, provider, now, expiresAt, sessionKind]);
  }
  return { token, hash, sessionId, expiresAt, sessionKind, statusRevisionAtIssue: statusRevision };
}

// Phase D / U14: log enforcement-unavailable once per request so a partial
// migration (column/table missing) surfaces in telemetry while the auth
// boundary falls through to pre-Phase-D semantics. The throttle is local
// to the D1 proxy; we do not need session-scoped dedup here because the
// same JOIN is called at most a handful of times per request.
function logEnforcementUnavailable(phase, reason) {
  try {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      event: 'capacity.auth.enforcement_unavailable',
      phase,
      reason,
    }));
  } catch {
    // Swallow — telemetry is best-effort.
  }
}

async function accountSessionFromToken(env, token, now = Date.now(), capacity = null) {
  if (!token) return null;
  // U3 round 1 (P1 #03): when a capacity collector is present, wrap the
  // D1 handle so the session-lookup `first()` is counted. Production
  // authenticated requests previously undercounted by 1 because the
  // raw `requireDatabase(env)` call bypassed the proxy.
  const db = capacity != null
    ? requireDatabaseWithCapacity(env, capacity)
    : requireDatabase(env);
  const hash = await sha256(token);
  // Phase D / U14: JOIN `account_ops_metadata` so each authenticated
  // request carries `ops_status` + `status_revision` + the session's
  // `status_revision_at_issue`. LEFT JOIN so legacy accounts with no
  // metadata row survive. Wrapped in try/catch so missing columns (partial
  // migration 0011) soft-fail to pre-Phase-D semantics rather than
  // locking everyone out.
  const selectSql = `
    SELECT
      s.id AS session_id,
      s.session_hash,
      s.provider,
      s.session_kind,
      s.expires_at,
      s.status_revision_at_issue AS session_status_revision,
      a.id AS account_id,
      a.email,
      a.display_name,
      a.platform_role,
      a.account_type,
      a.demo_expires_at,
      COALESCE(m.ops_status, 'active') AS ops_status,
      COALESCE(m.status_revision, 0) AS current_status_revision
    FROM account_sessions s
    JOIN adult_accounts a ON a.id = s.account_id
    LEFT JOIN account_ops_metadata m ON m.account_id = a.id
    WHERE s.session_hash = ?
      AND s.expires_at > ?
      AND (
        (
          COALESCE(s.session_kind, CASE WHEN s.provider = 'demo' THEN 'demo' ELSE 'real' END) <> 'demo'
          AND s.provider <> 'demo'
        )
        OR (
          COALESCE(a.account_type, 'real') = 'demo'
          AND a.demo_expires_at > ?
        )
      )
  `;
  let row = null;
  try {
    row = await first(db, selectSql, [hash, now, now]);
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (!(message.includes('no such column') || message.includes('no such table'))) {
      throw error;
    }
    logEnforcementUnavailable('require_session', 'missing_column_or_table');
    // Fall back to the pre-Phase-D SELECT so legacy tests / partial
    // migrations continue to resolve sessions. `opsStatus` defaults to
    // active; revision comparison is skipped.
    row = await first(db, `
      SELECT
        s.id AS session_id,
        s.session_hash,
        s.provider,
        s.session_kind,
        s.expires_at,
        a.id AS account_id,
        a.email,
        a.display_name,
        a.platform_role,
        a.account_type,
        a.demo_expires_at
      FROM account_sessions s
      JOIN adult_accounts a ON a.id = s.account_id
      WHERE s.session_hash = ?
        AND s.expires_at > ?
        AND (
          (
            COALESCE(s.session_kind, CASE WHEN s.provider = 'demo' THEN 'demo' ELSE 'real' END) <> 'demo'
            AND s.provider <> 'demo'
          )
          OR (
            COALESCE(a.account_type, 'real') = 'demo'
            AND a.demo_expires_at > ?
          )
        )
    `, [hash, now, now]);
  }
  if (!row) return null;
  const accountType = row.account_type || 'real';
  const sessionKind = row.provider === 'demo'
    ? 'demo'
    : (row.session_kind || 'real');
  const demoExpiresAt = Number(row.demo_expires_at) || null;
  // Phase D / U14: stale-revision check. When the session's
  // `status_revision_at_issue` is strictly less than the account's
  // current `status_revision`, the admin bumped the target since this
  // session was issued — force re-auth via `session_invalidated`.
  const opsStatus = typeof row.ops_status === 'string' && row.ops_status
    ? row.ops_status
    : 'active';
  const currentStatusRevision = Number(row.current_status_revision);
  const statusRevisionAtIssue = Number(row.session_status_revision);
  const enforcementAvailable = Number.isFinite(currentStatusRevision)
    && Number.isFinite(statusRevisionAtIssue);
  if (enforcementAvailable && statusRevisionAtIssue < currentStatusRevision) {
    throw new SessionInvalidatedError();
  }
  return {
    accountId: row.account_id,
    email: row.email || null,
    displayName: row.display_name || null,
    platformRole: normalisePlatformRole(row.platform_role),
    provider: row.provider || 'session',
    sessionKind,
    sessionId: row.session_id,
    sessionHash: row.session_hash,
    accountType,
    demo: sessionKind === 'demo' && accountType === 'demo',
    demoExpiresAt,
    opsStatus,
    statusRevision: enforcementAvailable ? currentStatusRevision : 0,
    statusRevisionAtIssue: enforcementAvailable ? statusRevisionAtIssue : 0,
  };
}

export async function deleteCurrentSession(env, request) {
  const token = readSessionToken(request);
  if (!token) return;
  const db = requireDatabase(env);
  await run(db, 'DELETE FROM account_sessions WHERE session_hash = ?', [await sha256(token)]);
}

export async function registerWithEmail(env, request, payload = {}) {
  const email = safeEmail(payload.email);
  const password = String(payload.password || '');
  if (!email || !email.includes('@')) {
    throw new BadRequestError('Enter a valid email address.', { code: 'invalid_email' });
  }
  if (password.length < 8) {
    throw new BadRequestError('Password must be at least eight characters.', { code: 'weak_password' });
  }
  await protectEmailAuth(env, request, {
    action: 'register',
    email,
    turnstileToken: payload.turnstileToken,
  });

  const db = requireDatabase(env);
  const now = Date.now();
  const demoSession = payload.convertDemo === true
    ? await accountSessionFromToken(env, readSessionToken(request), now)
    : null;
  if (payload.convertDemo === true && !demoSession?.demo) {
    throw new BadRequestError('Demo session expired. Start a new demo before creating an account.', {
      code: 'demo_session_required',
    });
  }
  const accountId = demoSession?.accountId || `adult-${randomToken(12)}`;
  const credential = await hashPassword(password);

  try {
    if (demoSession?.demo) {
      const existingEmailAccount = await findRegisteredEmailAccountId(db, email, { excludeAccountId: accountId });
      if (existingEmailAccount) {
        throw new ConflictError('That email address is already registered.', { code: 'email_already_registered' });
      }
      const results = await runDemoConversionBatch(db, [
        bindStatement(db, `
          UPDATE adult_accounts
          SET email = ?,
              display_name = COALESCE(?, display_name, ?),
              account_type = 'real',
              demo_expires_at = NULL,
              converted_from_demo_at = ?,
              updated_at = ?
          WHERE id = ?
            AND account_type = 'demo'
            AND demo_expires_at > ?
        `, [
          email,
          cleanText(payload.displayName),
          email,
          now,
          now,
          accountId,
          now,
        ]),
        bindStatement(db, `
          INSERT INTO account_credentials (account_id, email, password_hash, password_salt, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1
            FROM adult_accounts
            WHERE id = ?
              AND account_type = 'real'
              AND demo_expires_at IS NULL
              AND converted_from_demo_at = ?
          )
        `, [accountId, email, credential.hash, credential.salt, now, now, accountId, now]),
        demoConversionMetricStatement(db, accountId, now),
        deleteDemoSessionsStatement(db, accountId),
      ]);
      requireDemoConversionApplied(results, { credentialIndex: 1 });
    } else {
      // U12: converted from `withTransaction` (production no-op) to
      // `batch()` so the account row + credentials row commit atomically.
      // Pure SQL, no intermediate branching, no external I/O, no
      // lastrowid dependency — rubric case 2 (genuinely recoverable).
      const resolvedDisplayName = cleanText(payload.displayName) || email;
      await batch(db, [
        bindStatement(db, `
          INSERT INTO adult_accounts (id, email, display_name, selected_learner_id, created_at, updated_at)
          VALUES (?, ?, ?, NULL, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            email = COALESCE(excluded.email, adult_accounts.email),
            display_name = COALESCE(excluded.display_name, adult_accounts.display_name),
            updated_at = excluded.updated_at
        `, [accountId, email, resolvedDisplayName, now, now]),
        bindStatement(db, `
          INSERT INTO account_credentials (account_id, email, password_hash, password_salt, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [accountId, email, credential.hash, credential.salt, now, now]),
      ]);
    }
  } catch (error) {
    if (error instanceof ConflictError) throw error;
    if (String(error?.message || '').toLowerCase().includes('unique')) {
      throw new ConflictError('That email address is already registered.', { code: 'email_already_registered' });
    }
    throw error;
  }

  const session = await createSession(env, accountId, 'email', now);
  return {
    status: 201,
    cookies: [sessionCookie(request, session.token)],
    payload: {
      ok: true,
      session: { accountId, provider: 'email', demo: false },
    },
  };
}

export async function loginWithEmail(env, request, payload = {}) {
  const email = safeEmail(payload.email);
  const password = String(payload.password || '');
  if (!email || !password) {
    throw new BadRequestError('Incorrect email or password.', { code: 'invalid_credentials' });
  }
  await protectEmailAuth(env, request, {
    action: 'login',
    email,
    turnstileToken: payload.turnstileToken,
  });

  const db = requireDatabase(env);
  const credential = await first(db, 'SELECT * FROM account_credentials WHERE email = ?', [email]);
  if (!credential || !(await verifyPassword(password, credential.password_salt, credential.password_hash))) {
    throw new BadRequestError('Incorrect email or password.', { code: 'invalid_credentials' });
  }

  const session = await createSession(env, credential.account_id, 'email');
  return {
    status: 200,
    cookies: [sessionCookie(request, session.token)],
    payload: {
      ok: true,
      session: { accountId: credential.account_id, provider: 'email' },
    },
  };
}

function socialAuthEnabled(env) {
  return String(env.SOCIAL_LOGIN_WIRE_ENABLED || 'true').toLowerCase() !== 'false';
}

function pemToArrayBuffer(value) {
  const cleaned = String(value || '')
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  return base64UrlToBytes(cleaned.replace(/\+/g, '-').replace(/\//g, '_'));
}

async function buildAppleClientSecret(env) {
  const header = {
    alg: 'ES256',
    kid: String(env.APPLE_KEY_ID || ''),
    typ: 'JWT',
  };
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    iss: String(env.APPLE_TEAM_ID || ''),
    iat: issuedAt,
    exp: issuedAt + (60 * 5),
    aud: 'https://appleid.apple.com',
    sub: String(env.APPLE_CLIENT_ID || ''),
  };
  const signingInput = `${bytesToBase64Url(encoder.encode(JSON.stringify(header)))}.${bytesToBase64Url(encoder.encode(JSON.stringify(payload)))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(env.APPLE_PRIVATE_KEY),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(signingInput),
  );
  return `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

function providerDefinitions(env, origin) {
  const enabled = socialAuthEnabled(env);
  return {
    google: {
      enabled: enabled && Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
      clientId: String(env.GOOGLE_CLIENT_ID || ''),
      clientSecret: String(env.GOOGLE_CLIENT_SECRET || ''),
      authoriseUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      redirectUri: `${origin}/api/auth/google/callback`,
      scope: 'openid email profile',
      usePkce: true,
      extraAuthParams: { access_type: 'online', prompt: 'select_account' },
      async fetchProfile(tokenPayload) {
        const profile = await fetchBearerJson(
          'https://openidconnect.googleapis.com/v1/userinfo',
          tokenPayload.access_token,
          'Google did not return a profile.',
        );
        return {
          subject: cleanText(profile.sub),
          email: safeEmail(profile.email),
          emailVerified: Boolean(profile.email_verified),
        };
      },
    },
    facebook: {
      enabled: enabled && Boolean(env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET),
      clientId: String(env.FACEBOOK_CLIENT_ID || ''),
      clientSecret: String(env.FACEBOOK_CLIENT_SECRET || ''),
      authoriseUrl: 'https://www.facebook.com/dialog/oauth',
      tokenUrl: 'https://graph.facebook.com/oauth/access_token',
      redirectUri: `${origin}/api/auth/facebook/callback`,
      scope: 'public_profile,email',
      async fetchProfile(tokenPayload) {
        const profile = await fetchBearerJson(
          'https://graph.facebook.com/me?fields=id,name,email',
          tokenPayload.access_token,
          'Facebook did not return a profile.',
        );
        return {
          subject: cleanText(profile.id),
          email: safeEmail(profile.email),
          emailVerified: Boolean(profile.email),
        };
      },
    },
    x: {
      enabled: enabled && Boolean(env.X_CLIENT_ID),
      clientId: String(env.X_CLIENT_ID || ''),
      clientSecret: String(env.X_CLIENT_SECRET || ''),
      authoriseUrl: 'https://twitter.com/i/oauth2/authorize',
      tokenUrl: 'https://api.x.com/2/oauth2/token',
      redirectUri: `${origin}/api/auth/x/callback`,
      scope: 'tweet.read users.read',
      usePkce: true,
      async fetchProfile(tokenPayload) {
        const profile = await fetchBearerJson(
          'https://api.x.com/2/users/me?user.fields=name,username',
          tokenPayload.access_token,
          'X did not return a profile.',
        );
        return {
          subject: cleanText(profile?.data?.id),
          email: '',
          emailVerified: false,
        };
      },
    },
    apple: {
      enabled: enabled && Boolean(env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY),
      clientId: String(env.APPLE_CLIENT_ID || ''),
      authoriseUrl: 'https://appleid.apple.com/auth/authorize',
      tokenUrl: 'https://appleid.apple.com/auth/token',
      redirectUri: `${origin}/api/auth/apple/callback`,
      scope: 'name email',
      useNonce: true,
      extraAuthParams: { response_mode: 'form_post' },
      async buildClientSecret() {
        return buildAppleClientSecret(env);
      },
      async fetchProfile(tokenPayload, callbackPayload, expectedNonce) {
        const claims = base64UrlToJson(String(tokenPayload.id_token || '').split('.')[1] || '');
        if (expectedNonce && claims.nonce && claims.nonce !== expectedNonce) {
          throw new Error('Apple sign-in did not return the expected nonce.');
        }
        const callbackUser = safeJsonParse(callbackPayload?.user, {});
        return {
          subject: cleanText(claims.sub),
          email: safeEmail(claims.email || callbackUser?.email),
          emailVerified: String(claims.email_verified || '').toLowerCase() === 'true' || claims.email_verified === true,
        };
      },
    },
  };
}

function configuredProvider(env, providerKey, origin) {
  const provider = providerDefinitions(env, origin)[providerKey];
  if (!provider) throw new BadRequestError('That sign-in provider is not supported.', { code: 'unknown_auth_provider' });
  if (!socialAuthEnabled(env)) throw new BadRequestError('Social sign-in is currently disabled.', { code: 'social_auth_disabled' });
  if (!provider.enabled) throw new AuthConfigurationError('That sign-in provider is not configured yet.', { code: 'auth_provider_not_configured' });
  return provider;
}

async function readJsonResponse(response, fallbackMessage) {
  const text = await response.text();
  const payload = safeJsonParse(text, null);
  if (!response.ok) {
    throw new Error(payload?.error_description || payload?.message || text || fallbackMessage);
  }
  return payload || {};
}

async function fetchBearerJson(url, accessToken, fallbackMessage) {
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
    },
  });
  return readJsonResponse(response, fallbackMessage);
}

async function exchangeCode(provider, env, code, redirectUri, codeVerifier) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code: String(code || ''),
    client_id: provider.clientId,
    redirect_uri: redirectUri,
  });
  if (provider.clientSecret) params.set('client_secret', provider.clientSecret);
  if (provider.buildClientSecret) params.set('client_secret', await provider.buildClientSecret(env));
  if (provider.usePkce) params.set('code_verifier', String(codeVerifier || ''));

  const response = await fetch(provider.tokenUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: params.toString(),
  });
  return readJsonResponse(response, 'The provider did not return an access token.');
}

function oauthAttemptHasDemoBinding(attempt = {}) {
  return Boolean(attempt.demoAccountId || attempt.demoSessionId || attempt.demoBinding);
}

async function oauthDemoBindingDigest(state, session) {
  return sha256([
    'oauth-demo-binding-v1',
    state,
    session?.accountId,
    session?.sessionId,
    session?.sessionHash,
  ].join('|'));
}

async function oauthDemoBindingForSession(state, session) {
  if (!session?.demo) return {};
  return {
    demoAccountId: session.accountId,
    demoSessionId: session.sessionId,
    demoBinding: await oauthDemoBindingDigest(state, session),
  };
}

async function boundDemoSessionForAttempt(attempt, activeSession) {
  if (!oauthAttemptHasDemoBinding(attempt)) return null;
  if (!attempt.demoAccountId || !attempt.demoSessionId || !attempt.demoBinding) {
    throw new BadRequestError('Demo sign-in session expired. Start the social sign-in again from this demo.', {
      code: 'demo_oauth_binding_invalid',
    });
  }
  if (
    !activeSession?.demo
    || activeSession.accountId !== attempt.demoAccountId
    || activeSession.sessionId !== attempt.demoSessionId
  ) {
    throw new BadRequestError('Demo sign-in session changed. Start the social sign-in again from this demo.', {
      code: 'demo_oauth_binding_mismatch',
    });
  }
  const expectedBinding = await oauthDemoBindingDigest(attempt.state, activeSession);
  if (attempt.demoBinding !== expectedBinding) {
    throw new BadRequestError('Demo sign-in session could not be verified. Start the social sign-in again from this demo.', {
      code: 'demo_oauth_binding_mismatch',
    });
  }
  return activeSession;
}

export async function startSocialLogin(env, request, providerKey, payload = {}) {
  const providerName = normaliseProvider(providerKey);
  await protectOAuthStart(env, request, {
    provider: providerName,
    turnstileToken: payload.turnstileToken,
  });
  const origin = appOrigin(env, request);
  const provider = configuredProvider(env, providerName, origin);
  const state = randomToken(18);
  const codeVerifier = provider.usePkce ? randomToken(32) : '';
  const nonce = provider.useNonce ? randomToken(18) : '';
  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: provider.redirectUri,
    response_type: 'code',
    scope: provider.scope,
    state,
    ...(provider.extraAuthParams || {}),
  });
  if (provider.usePkce) {
    params.set('code_challenge_method', 'S256');
    params.set('code_challenge', await sha256(codeVerifier));
  }
  if (nonce) params.set('nonce', nonce);
  const activeSession = await accountSessionFromToken(env, readSessionToken(request));
  const demoBinding = await oauthDemoBindingForSession(state, activeSession);
  return {
    status: 200,
    cookies: oauthAttemptCookies(request, providerName, {
      state,
      codeVerifier,
      nonce,
      ...demoBinding,
    }),
    payload: {
      ok: true,
      redirectUrl: `${provider.authoriseUrl}?${params.toString()}`,
    },
  };
}

async function findOrCreateAccountFromIdentity(env, {
  provider,
  providerSubject,
  email,
}) {
  const db = requireDatabase(env);
  const now = Date.now();
  const existing = await first(db, `
    SELECT account_id FROM account_identities WHERE provider = ? AND provider_subject = ?
  `, [provider, providerSubject]);
  if (existing?.account_id) return existing.account_id;

  const emailAccountId = email
    ? await findRegisteredEmailAccountId(db, email)
    : null;
  const accountId = emailAccountId || `adult-${randomToken(12)}`;
  // U12: converted from `withTransaction` (production no-op) to `batch()`
  // so the adult account row + identity row commit atomically. Pure SQL,
  // no intermediate branching, no external I/O — rubric case 2.
  const resolvedDisplayName = email || provider;
  await batch(db, [
    bindStatement(db, `
      INSERT INTO adult_accounts (id, email, display_name, selected_learner_id, created_at, updated_at)
      VALUES (?, ?, ?, NULL, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        email = COALESCE(excluded.email, adult_accounts.email),
        display_name = COALESCE(excluded.display_name, adult_accounts.display_name),
        updated_at = excluded.updated_at
    `, [accountId, email || null, resolvedDisplayName, now, now]),
    bindStatement(db, `
      INSERT INTO account_identities (id, account_id, provider, provider_subject, email, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [`identity-${randomToken(12)}`, accountId, provider, providerSubject, email || null, now, now]),
  ]);
  return accountId;
}

async function convertDemoAccountFromIdentity(env, {
  demoSession,
  provider,
  providerSubject,
  email,
}) {
  const db = requireDatabase(env);
  const now = Date.now();
  const accountId = demoSession?.accountId;
  if (!accountId || !demoSession?.demo) {
    throw new BadRequestError('Demo session expired. Start a new demo before creating an account.', {
      code: 'demo_session_required',
    });
  }

  const existingIdentity = await first(db, `
    SELECT account_id FROM account_identities WHERE provider = ? AND provider_subject = ?
  `, [provider, providerSubject]);
  if (existingIdentity?.account_id && existingIdentity.account_id !== accountId) {
    throw new ConflictError('That social account is already registered.', { code: 'identity_already_registered' });
  }

  if (email) {
    const emailAccountId = await findRegisteredEmailAccountId(db, email, { excludeAccountId: accountId });
    if (emailAccountId) {
      throw new ConflictError('That email address is already registered.', { code: 'email_already_registered' });
    }
  }

  const statements = [
    bindStatement(db, `
      UPDATE adult_accounts
      SET email = COALESCE(?, email),
          display_name = COALESCE(?, display_name, ?),
          account_type = 'real',
          demo_expires_at = NULL,
          converted_from_demo_at = ?,
          updated_at = ?
      WHERE id = ?
        AND account_type = 'demo'
        AND demo_expires_at > ?
    `, [email || null, email || provider, provider, now, now, accountId, now]),
  ];
  let identityIndex = null;
  if (!existingIdentity?.account_id) {
    identityIndex = statements.length;
    statements.push(bindStatement(db, `
      INSERT INTO account_identities (id, account_id, provider, provider_subject, email, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1
        FROM adult_accounts
        WHERE id = ?
          AND account_type = 'real'
          AND demo_expires_at IS NULL
          AND converted_from_demo_at = ?
      )
    `, [`identity-${randomToken(12)}`, accountId, provider, providerSubject, email || null, now, now, accountId, now]));
  }
  statements.push(demoConversionMetricStatement(db, accountId, now));
  statements.push(deleteDemoSessionsStatement(db, accountId));

  try {
    const results = await runDemoConversionBatch(db, statements);
    requireDemoConversionApplied(results, { identityIndex });
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    if (String(error?.message || '').toLowerCase().includes('unique')) {
      throw new ConflictError('That social account is already registered.', { code: 'identity_already_registered' });
    }
    throw error;
  }

  return accountId;
}

export async function completeSocialLogin(env, request, providerKey, callbackPayload = {}) {
  const providerName = normaliseProvider(providerKey);
  const attempt = readOauthAttempt(request);
  if (!attempt.state || attempt.provider !== providerName) {
    throw new BadRequestError('Sign-in session expired. Please try again.', { code: 'oauth_attempt_missing' });
  }
  if (!callbackPayload.state || callbackPayload.state !== attempt.state) {
    throw new BadRequestError('Sign-in could not be verified. Please try again.', { code: 'oauth_state_mismatch' });
  }
  if (callbackPayload.error) {
    throw new BadRequestError(callbackPayload.error_description || callbackPayload.error, { code: 'oauth_provider_error' });
  }
  if (!callbackPayload.code) {
    throw new BadRequestError('The provider did not return an authorisation code.', { code: 'oauth_code_missing' });
  }

  const activeSession = await accountSessionFromToken(env, readSessionToken(request));
  const boundDemoSession = await boundDemoSessionForAttempt(attempt, activeSession);
  const origin = appOrigin(env, request);
  const provider = configuredProvider(env, providerName, origin);
  const tokenPayload = await exchangeCode(provider, env, callbackPayload.code, provider.redirectUri, attempt.codeVerifier);
  const profile = await provider.fetchProfile(tokenPayload, callbackPayload, attempt.nonce);
  if (!profile?.subject) {
    throw new BadRequestError('The provider did not return a valid account identifier.', { code: 'oauth_subject_missing' });
  }
  const verifiedEmail = profile.emailVerified === false ? '' : profile.email;
  const accountId = boundDemoSession
    ? await convertDemoAccountFromIdentity(env, {
        demoSession: boundDemoSession,
        provider: providerName,
        providerSubject: profile.subject,
        email: verifiedEmail,
      })
    : await findOrCreateAccountFromIdentity(env, {
        provider: providerName,
        providerSubject: profile.subject,
        email: verifiedEmail,
      });
  const session = await createSession(env, accountId, providerName);
  return {
    cookies: [...clearOauthCookies(request), sessionCookie(request, session.token)],
  };
}

function appOrigin(env, request) {
  const configured = cleanText(env.APP_ORIGIN);
  if (configured) return configured.replace(/\/$/, '');
  const url = requestUrl(request);
  const hostname = cleanText(env.APP_HOSTNAME);
  if (hostname && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    return `https://${hostname}`;
  }
  return `${url.protocol}//${url.host}`;
}

export function createDevelopmentSessionProvider() {
  return {
    kind: 'development-stub',
    async getSession(request, env, { capacity = null } = {}) {
      const accountId = cleanText(
        request.headers.get('x-ks2-dev-account-id')
        || request.headers.get('x-ks2-account-id'),
      );
      if (!accountId) return null;
      // TEST-ONLY: the `x-ks2-dev-demo` and `x-ks2-dev-demo-expires-at` headers
      // exist so tests can drive the F-10 demo guard (requireActiveDemoAccount)
      // through the dev-stub session provider. Production auth never reads
      // these headers because it resolves sessions from the D1 cookie token.
      const isDemo = String(request.headers.get('x-ks2-dev-demo') || '').trim() === '1';
      const demoExpiresAtRaw = request.headers.get('x-ks2-dev-demo-expires-at');
      const demoExpiresAt = Number.isFinite(Number(demoExpiresAtRaw))
        ? Number(demoExpiresAtRaw)
        : null;
      // Phase D / U14: when the test DB has a metadata row, apply the
      // same enforcement the production provider applies (suspend /
      // stale-revision). Tests can exercise the full matrix through the
      // dev-stub without having to spin up the production auth flow.
      // Absent D1 binding → no enforcement (unit tests that inject a
      // header-only session).
      let opsStatus = 'active';
      let currentStatusRevision = 0;
      let statusRevisionAtIssue = 0;
      let enforcementAvailable = false;
      const rawBinding = env?.DB;
      // Route the metadata lookup through the capacity-wrapped D1 handle
      // so the query is counted in request-level telemetry (mirrors the
      // P1 #03 pattern that ensures dev-stub queries are not invisible).
      const dbBinding = rawBinding && capacity != null
        ? requireDatabaseWithCapacity(env, capacity)
        : rawBinding;
      if (dbBinding) {
        try {
          const row = await first(dbBinding, `
            SELECT COALESCE(m.ops_status, 'active') AS ops_status,
                   COALESCE(m.status_revision, 0) AS current_status_revision
            FROM adult_accounts a
            LEFT JOIN account_ops_metadata m ON m.account_id = a.id
            WHERE a.id = ?
          `, [accountId]);
          if (row) {
            opsStatus = typeof row.ops_status === 'string' && row.ops_status
              ? row.ops_status
              : 'active';
            currentStatusRevision = Math.max(0, Number(row.current_status_revision) || 0);
            enforcementAvailable = true;
          }
        } catch (error) {
          const message = String(error?.message || '').toLowerCase();
          if (message.includes('no such column') || message.includes('no such table')) {
            logEnforcementUnavailable('require_session_dev_stub', 'missing_column_or_table');
          } else {
            throw error;
          }
        }
        // The dev-stub has no `account_sessions` row, so use the header
        // override when provided (lets tests simulate stale sessions).
        const headerRevision = request.headers.get('x-ks2-dev-status-revision-at-issue');
        if (headerRevision != null && Number.isFinite(Number(headerRevision))) {
          statusRevisionAtIssue = Number(headerRevision);
        } else {
          statusRevisionAtIssue = currentStatusRevision;
        }
      }
      if (enforcementAvailable && statusRevisionAtIssue < currentStatusRevision) {
        throw new SessionInvalidatedError();
      }
      return {
        accountId,
        email: cleanText(request.headers.get('x-ks2-dev-email')),
        displayName: cleanText(request.headers.get('x-ks2-dev-name')),
        platformRole: normalisePlatformRole(request.headers.get('x-ks2-dev-platform-role')),
        provider: isDemo ? 'demo' : 'development-stub',
        sessionId: `dev:${accountId}`,
        accountType: isDemo ? 'demo' : 'real',
        demo: isDemo,
        demoExpiresAt,
        opsStatus,
        statusRevision: currentStatusRevision,
        statusRevisionAtIssue,
      };
    },
  };
}

export function createProductionSessionProvider() {
  return {
    kind: 'production',
    async getSession(request, env, { capacity = null } = {}) {
      // U3 round 1 (P1 #03): thread the per-request capacity collector
      // so the session-lookup query is counted.
      return accountSessionFromToken(env, readSessionToken(request), Date.now(), capacity);
    },
  };
}

export function createPlaceholderSessionProvider(kind = 'production-placeholder') {
  return {
    kind,
    async getSession() {
      throw new AuthConfigurationError(`Auth mode "${kind}" is reserved but not implemented in this pass.`);
    },
  };
}

export function resolveSessionProvider(env = {}) {
  const mode = normaliseEnvironmentMode(env);
  if (mode === 'development-stub') return createDevelopmentSessionProvider();
  if (mode === 'production') return createProductionSessionProvider();
  return createPlaceholderSessionProvider(mode);
}

/**
 * Phase D / U14: reject suspended accounts at the auth boundary. Called
 * implicitly from `requireSession` so every authenticated route (including
 * GETs) fails fast when the account is suspended — there is no "read-only
 * access for suspended accounts" mode.
 *
 * @param {object|null|undefined} session  Session object returned by
 *                                         `auth.getSession` / `requireSession`.
 * @throws {AccountSuspendedError}         When `session.opsStatus === 'suspended'`.
 */
export function requireActiveAccount(session) {
  if (!session) return;
  if (session.opsStatus === 'suspended') {
    throw new AccountSuspendedError();
  }
}

/**
 * Phase D / U14: reject mutation attempts on payment_hold accounts.
 * Called explicitly by every mutation-receipt-bearing route in `app.js`
 * AFTER `requireSession`. Suspended → `AccountSuspendedError` (defence in
 * depth — `requireActiveAccount` already fired inside `requireSession`,
 * but the capability helper remains the single entry point for mutation
 * gating). payment_hold → `AccountPaymentHoldError`.
 *
 * @param {object|null|undefined} session
 * @throws {AccountSuspendedError}    when the account is suspended.
 * @throws {AccountPaymentHoldError}  when the account is on payment hold.
 */
export function requireMutationCapability(session) {
  if (!session) return;
  if (session.opsStatus === 'suspended') {
    throw new AccountSuspendedError();
  }
  if (session.opsStatus === 'payment_hold') {
    throw new AccountPaymentHoldError();
  }
}

export function createSessionAuthBoundary({ env = {}, sessionProvider, capacity = null } = {}) {
  const provider = sessionProvider || resolveSessionProvider(env);

  return {
    provider,
    describe() {
      return {
        mode: provider.kind,
        developmentStub: provider.kind === 'development-stub',
        productionReady: provider.kind === 'production',
      };
    },
    async getSession(request) {
      // U3 round 1 (P1 #03): the production session provider uses this
      // third argument to thread the capacity collector through to
      // `accountSessionFromToken()`. Development stub ignores it.
      return provider.getSession(request, env, { capacity });
    },
    async requireSession(request) {
      const session = await provider.getSession(request, env, { capacity });
      if (!session) throw new UnauthenticatedError();
      // U6 (plan KTD F-07): default-on Sec-Fetch-Site check for every
      // authenticated route. Running it here means any route that calls
      // `auth.requireSession()` inherits the same-origin enforcement without
      // a per-route opt-in. We run in `sec-fetch-only` mode so the default
      // path relies on the Sec-Fetch-Site signal and does not double-enforce
      // the Origin header check (mutation routes keep the explicit strict
      // `requireSameOrigin(request, env)` calls at the app.js boundary).
      requireSameOrigin(request, env, { mode: 'sec-fetch-only' });
      // Phase D / U14: reject suspended accounts at the boundary so every
      // authenticated route (including GETs) fails fast. payment_hold is
      // permitted here — the mutation routes add `requireMutationCapability`.
      requireActiveAccount(session);
      return session;
    },
  };
}

// I-RE-4 (re-review Important): test-only named export of
// `findOrCreateAccountFromIdentity` so the U12 batch-atomicity test can
// drive the exact production call site with a forced mid-batch failure,
// rather than falling through to a synthetic shim probe whose behaviour
// diverges from the production path. Matches the pattern established by
// `__resetTrustXffWarningForTests` in worker/src/rate-limit.js. The
// leading underscores signal "internal-only" to callers and keep this out
// of grep results for the public surface.
export const __findOrCreateAccountFromIdentityForTests = findOrCreateAccountFromIdentity;
