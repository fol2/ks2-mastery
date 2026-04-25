import { randomToken, sessionCookie, sha256, createSession } from '../auth.js';
import { BadRequestError, ForbiddenError, UnauthenticatedError } from '../errors.js';
import { all, batch, bindStatement, first, requireDatabase, run, sqlPlaceholders } from '../d1.js';
import { DEMO_TEMPLATE_ID, demoLearnerTemplate } from './template.js';

export const DEMO_TTL_MS = 24 * 60 * 60 * 1000;

const DEMO_WINDOW_MS = 10 * 60 * 1000;
const DEMO_LIMITS = {
  createIp: 30,
  resetAccount: 12,
  commandIp: 240,
  commandAccount: 180,
  commandSession: 120,
  commandType: 80,
  parentHubIp: 180,
  parentHubAccount: 120,
  parentHubSession: 90,
  ttsIp: 160,
  ttsAccount: 80,
  ttsSession: 60,
  ttsFallbackType: 40,
  ttsLookupIp: 320,
  ttsLookupAccount: 160,
  ttsLookupSession: 120,
};

function cleanText(value) {
  return String(value || '').trim();
}

function clientIp(request) {
  return cleanText(
    request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]
    || request.headers.get('x-real-ip'),
  ) || 'unknown';
}

function currentWindowStart(timestamp, windowMs) {
  return Math.floor(timestamp / windowMs) * windowMs;
}

export function isProductionRuntime(env = {}) {
  const authMode = cleanText(env.AUTH_MODE).toLowerCase();
  const stage = cleanText(env.ENVIRONMENT || env.NODE_ENV).toLowerCase();
  if (authMode === 'development-stub') return false;
  if (authMode === 'production') return true;
  if (stage === 'test' || stage === 'development' || stage === 'dev') return false;
  return stage === 'production' || Boolean(authMode);
}

function requestOrigin(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function explicitAppOrigin(env = {}) {
  const configured = cleanText(env.APP_ORIGIN);
  return configured ? configured.replace(/\/$/, '') : '';
}

function appOrigins(env = {}, request) {
  const explicit = explicitAppOrigin(env);
  if (explicit) return new Set([explicit]);
  const origin = requestOrigin(request);
  const hostname = cleanText(env.APP_HOSTNAME);
  return new Set([
    hostname ? `https://${hostname}` : '',
    origin,
  ].filter(Boolean));
}

export function requireSameOrigin(request, env = {}, { allowMissingOrigin = false } = {}) {
  const origin = cleanText(request.headers.get('origin'));
  if (!origin) {
    if (!allowMissingOrigin && isProductionRuntime(env)) {
      throw new ForbiddenError('This request must come from the KS2 Mastery app origin.', {
        code: 'same_origin_required',
      });
    }
    return;
  }
  if (!appOrigins(env, request).has(origin)) {
    throw new ForbiddenError('This request must come from the KS2 Mastery app origin.', {
      code: 'same_origin_required',
    });
  }
}

export async function consumeRateLimit(db, { bucket, identifier, limit, windowMs, now }) {
  if (!bucket || !identifier || !limit || !windowMs) return { allowed: true, retryAfterSeconds: 0 };
  const windowStartedAt = currentWindowStart(now, windowMs);
  const limiterKey = `${bucket}:${await sha256(identifier)}`;
  const row = await first(db, `
    INSERT INTO request_limits (limiter_key, window_started_at, request_count, updated_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(limiter_key) DO UPDATE SET
      request_count = CASE
        WHEN request_limits.window_started_at = excluded.window_started_at
          THEN request_limits.request_count + 1
        ELSE 1
      END,
      window_started_at = excluded.window_started_at,
      updated_at = excluded.updated_at
    RETURNING request_count, window_started_at
  `, [limiterKey, windowStartedAt, now]);
  const count = Number(row?.request_count || 1);
  const storedWindow = Number(row?.window_started_at || windowStartedAt);
  return {
    allowed: count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil(((storedWindow + windowMs) - now) / 1000)),
  };
}

export async function recordDemoMetric(db, key, now) {
  await run(db, `
    INSERT INTO demo_operation_metrics (metric_key, metric_count, updated_at)
    VALUES (?, 1, ?)
    ON CONFLICT(metric_key) DO UPDATE SET
      metric_count = demo_operation_metrics.metric_count + 1,
      updated_at = excluded.updated_at
  `, [key, now]);
}

async function protectDemoCreate(db, request, now) {
  const result = await consumeRateLimit(db, {
    bucket: 'demo-create-ip',
    identifier: clientIp(request),
    limit: DEMO_LIMITS.createIp,
    windowMs: DEMO_WINDOW_MS,
    now,
  });
  if (!result.allowed) {
    await recordDemoMetric(db, 'rate_limit_blocks', now);
    throw new BadRequestError('Too many demo sessions have been created from this connection. Please wait a few minutes and try again.', {
      code: 'demo_rate_limited',
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
}

async function protectDemoReset(db, accountId, now) {
  const result = await consumeRateLimit(db, {
    bucket: 'demo-reset-account',
    identifier: accountId,
    limit: DEMO_LIMITS.resetAccount,
    windowMs: DEMO_WINDOW_MS,
    now,
  });
  if (!result.allowed) {
    await recordDemoMetric(db, 'rate_limit_blocks', now);
    throw new BadRequestError('Too many demo reset requests. Please wait a few minutes and try again.', {
      code: 'demo_rate_limited',
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
}

async function enforceDemoRateLimit(db, checks, now, message) {
  for (const check of checks) {
    const result = await consumeRateLimit(db, {
      ...check,
      now,
      windowMs: check.windowMs || DEMO_WINDOW_MS,
    });
    if (result.allowed) continue;
    await recordDemoMetric(db, 'rate_limit_blocks', now);
    throw new BadRequestError(message, {
      code: 'demo_rate_limited',
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
}

function demoSessionIdentifier(session = {}) {
  return cleanText(session.sessionId || session.sessionHash || session.accountId) || 'unknown-demo-session';
}

export async function protectDemoSubjectCommand({ env, request, session, command, now = Date.now() } = {}) {
  if (!session?.demo) return;
  const db = requireDatabase(env);
  await requireActiveDemoAccount(db, session.accountId, now);
  const commandType = cleanText(`${command?.subjectId || 'subject'}:${command?.command || 'unknown'}`);
  await enforceDemoRateLimit(db, [
    {
      bucket: 'demo-command-ip',
      identifier: clientIp(request),
      limit: DEMO_LIMITS.commandIp,
    },
    {
      bucket: 'demo-command-account',
      identifier: session.accountId,
      limit: DEMO_LIMITS.commandAccount,
    },
    {
      bucket: 'demo-command-session',
      identifier: demoSessionIdentifier(session),
      limit: DEMO_LIMITS.commandSession,
    },
    {
      bucket: 'demo-command-type',
      identifier: `${session.accountId}:${commandType}`,
      limit: DEMO_LIMITS.commandType,
    },
  ], now, 'Too many demo practice requests. Please wait a few minutes and try again.');
}

export async function protectDemoParentHubRead({ env, request, session, now = Date.now() } = {}) {
  if (!session?.demo) return;
  const db = requireDatabase(env);
  await requireActiveDemoAccount(db, session.accountId, now);
  await enforceDemoRateLimit(db, [
    {
      bucket: 'demo-parent-hub-ip',
      identifier: clientIp(request),
      limit: DEMO_LIMITS.parentHubIp,
    },
    {
      bucket: 'demo-parent-hub-account',
      identifier: session.accountId,
      limit: DEMO_LIMITS.parentHubAccount,
    },
    {
      bucket: 'demo-parent-hub-session',
      identifier: demoSessionIdentifier(session),
      limit: DEMO_LIMITS.parentHubSession,
    },
  ], now, 'Too many demo Parent Hub requests. Please wait a few minutes and try again.');
}

export async function protectDemoTtsFallback({ env, request, session, payload = {}, now = Date.now() } = {}) {
  if (!session?.demo) return;
  const db = requireDatabase(env);
  await requireActiveDemoAccount(db, session.accountId, now);
  const scope = cleanText(payload.scope) || 'session';
  const provider = cleanText(payload.provider) || 'remote';
  const mode = payload.wordOnly ? 'word' : 'dictation';
  const fallbackType = `${scope}:${provider}:${mode}`;
  await enforceDemoRateLimit(db, [
    {
      bucket: 'demo-tts-ip',
      identifier: clientIp(request),
      limit: DEMO_LIMITS.ttsIp,
    },
    {
      bucket: 'demo-tts-account',
      identifier: session.accountId,
      limit: DEMO_LIMITS.ttsAccount,
    },
    {
      bucket: 'demo-tts-session',
      identifier: demoSessionIdentifier(session),
      limit: DEMO_LIMITS.ttsSession,
    },
    {
      bucket: 'demo-tts-fallback-type',
      identifier: `${session.accountId}:${fallbackType}`,
      limit: DEMO_LIMITS.ttsFallbackType,
    },
  ], now, 'Too many demo dictation audio requests. Please wait a few minutes and try again.');
}

export async function protectDemoTtsLookup({ env, request, session, now = Date.now() } = {}) {
  if (!session?.demo) return;
  const db = requireDatabase(env);
  await requireActiveDemoAccount(db, session.accountId, now);
  await enforceDemoRateLimit(db, [
    {
      bucket: 'demo-tts-lookup-ip',
      identifier: clientIp(request),
      limit: DEMO_LIMITS.ttsLookupIp,
    },
    {
      bucket: 'demo-tts-lookup-account',
      identifier: session.accountId,
      limit: DEMO_LIMITS.ttsLookupAccount,
    },
    {
      bucket: 'demo-tts-lookup-session',
      identifier: demoSessionIdentifier(session),
      limit: DEMO_LIMITS.ttsLookupSession,
    },
  ], now, 'Too many demo dictation audio lookups. Please wait a few minutes and try again.');
}

export async function cleanupExpiredDemoAccounts(db, now = Date.now(), { accountId = null, limit = 25 } = {}) {
  const cappedLimit = Math.max(1, Math.min(100, Number(limit) || 25));
  const rows = accountId
    ? await all(db, `
      SELECT id
      FROM adult_accounts
      WHERE id = ?
        AND account_type = 'demo'
        AND demo_expires_at <= ?
      LIMIT 1
    `, [accountId, now])
    : await all(db, `
      SELECT id
      FROM adult_accounts
      WHERE account_type = 'demo'
        AND demo_expires_at <= ?
      ORDER BY demo_expires_at ASC
      LIMIT ?
    `, [now, cappedLimit]);
  const accountIds = rows.map((row) => row.id).filter(Boolean);
  if (!accountIds.length) return { cleaned: 0 };

  for (const id of accountIds) {
    const learnerRows = await all(db, `
      SELECT learner_id
      FROM account_learner_memberships
      WHERE account_id = ?
    `, [id]);
    const learnerIds = learnerRows.map((row) => row.learner_id).filter(Boolean);
    if (learnerIds.length) {
      await run(db, `
        DELETE FROM learner_profiles
        WHERE id IN (${sqlPlaceholders(learnerIds.length)})
      `, learnerIds);
    }
    await run(db, 'DELETE FROM adult_accounts WHERE id = ? AND account_type = ?', [id, 'demo']);
  }

  await run(db, `
    INSERT INTO demo_operation_metrics (metric_key, metric_count, updated_at)
    VALUES ('cleanup_count', ?, ?)
    ON CONFLICT(metric_key) DO UPDATE SET
      metric_count = demo_operation_metrics.metric_count + excluded.metric_count,
      updated_at = excluded.updated_at
  `, [accountIds.length, now]);

  return { cleaned: accountIds.length };
}

function demoSessionPayload({ accountId, learnerId, expiresAt }) {
  return {
    accountId,
    learnerId,
    provider: 'demo',
    demo: true,
    expiresAt,
  };
}

async function insertDemoLearner(db, accountId, learnerId, now) {
  const learner = demoLearnerTemplate({ learnerId, now });
  await batch(db, [
    bindStatement(db, `
      INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `, [
      learner.id,
      learner.name,
      learner.yearGroup,
      learner.avatarColor,
      learner.goal,
      learner.dailyMinutes,
      now,
      now,
    ]),
    bindStatement(db, `
      INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
      VALUES (?, ?, 'owner', 0, ?, ?)
    `, [accountId, learner.id, now, now]),
    bindStatement(db, `
      UPDATE adult_accounts
      SET selected_learner_id = ?, updated_at = ?
      WHERE id = ?
    `, [learner.id, now, accountId]),
  ]);
  return learner;
}

export async function createDemoSession({ env, request, now = Date.now(), allowMissingOrigin = false } = {}) {
  const db = requireDatabase(env);
  requireSameOrigin(request, env, { allowMissingOrigin });
  await protectDemoCreate(db, request, now);
  await cleanupExpiredDemoAccounts(db, now);

  const accountId = `demo-${randomToken(10)}`;
  const learnerId = `learner-demo-${randomToken(10)}`;
  const expiresAt = now + DEMO_TTL_MS;

  await run(db, `
    INSERT INTO adult_accounts (
      id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, account_type, demo_expires_at, demo_template_id
    )
    VALUES (?, NULL, 'Demo Visitor', 'parent', NULL, ?, ?, 'demo', ?, ?)
  `, [accountId, now, now, expiresAt, DEMO_TEMPLATE_ID]);
  await insertDemoLearner(db, accountId, learnerId, now);
  await recordDemoMetric(db, 'sessions_created', now);
  await recordDemoMetric(db, 'active_sessions', now);

  const session = await createSession(env, accountId, 'demo', now, { expiresAt, sessionKind: 'demo' });
  return {
    status: 201,
    cookies: [sessionCookie(request, session.token, {
      maxAge: Math.ceil((expiresAt - now) / 1000),
    })],
    payload: {
      ok: true,
      session: demoSessionPayload({ accountId, learnerId, expiresAt }),
    },
  };
}

export async function requireActiveDemoAccount(db, accountId, now = Date.now()) {
  const account = await first(db, `
    SELECT id, account_type, demo_expires_at
    FROM adult_accounts
    WHERE id = ?
  `, [accountId]);
  if (!account || account.account_type !== 'demo') {
    throw new ForbiddenError('This action is only available for demo sessions.', {
      code: 'demo_session_required',
    });
  }
  if (!(Number(account.demo_expires_at) > now)) {
    await cleanupExpiredDemoAccounts(db, now, { accountId, limit: 1 });
    throw new UnauthenticatedError('Demo session expired.', {
      code: 'demo_session_expired',
    });
  }
  return account;
}

export async function resetDemoAccount({ env, request, session, now = Date.now() } = {}) {
  const db = requireDatabase(env);
  requireSameOrigin(request, env);
  await requireActiveDemoAccount(db, session.accountId, now);
  await protectDemoReset(db, session.accountId, now);

  const learnerRows = await db.prepare(`
    SELECT learner_id
    FROM account_learner_memberships
    WHERE account_id = ?
  `).bind(session.accountId).all();
  const learnerIds = (learnerRows?.results || []).map((row) => row.learner_id).filter(Boolean);

  for (const learnerId of learnerIds) {
    await run(db, 'DELETE FROM learner_profiles WHERE id = ?', [learnerId]);
  }

  const learnerId = `learner-demo-${randomToken(10)}`;
  await insertDemoLearner(db, session.accountId, learnerId, now);
  await recordDemoMetric(db, 'resets', now);

  return {
    accountId: session.accountId,
    learnerId,
  };
}
