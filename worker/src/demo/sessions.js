import { randomToken, sessionCookie, sha256, createSession } from '../auth.js';
import { BadRequestError, ForbiddenError, UnauthenticatedError } from '../errors.js';
import { batch, bindStatement, first, requireDatabase, run } from '../d1.js';
import { DEMO_TEMPLATE_ID, demoLearnerTemplate } from './template.js';

export const DEMO_TTL_MS = 24 * 60 * 60 * 1000;

const DEMO_WINDOW_MS = 10 * 60 * 1000;
const DEMO_LIMITS = {
  createIp: 30,
  resetAccount: 12,
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

function appOrigin(env = {}, request) {
  const configured = cleanText(env.APP_ORIGIN);
  if (configured) return configured.replace(/\/$/, '');
  const url = new URL(request.url);
  const hostname = cleanText(env.APP_HOSTNAME);
  if (hostname && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    return `https://${hostname}`;
  }
  return `${url.protocol}//${url.host}`;
}

export function requireSameOrigin(request, env = {}) {
  const origin = cleanText(request.headers.get('origin'));
  if (!origin) return;
  const expected = appOrigin(env, request);
  if (origin !== expected) {
    throw new ForbiddenError('This request must come from the KS2 Mastery app origin.', {
      code: 'same_origin_required',
    });
  }
}

async function consumeRateLimit(db, { bucket, identifier, limit, windowMs, now }) {
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

export async function createDemoSession({ env, request, now = Date.now() } = {}) {
  const db = requireDatabase(env);
  requireSameOrigin(request, env);
  await protectDemoCreate(db, request, now);

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
