// U5 (P1.5 Phase B): IPv6 /64 propagation proof.
//
// The `normaliseRateLimitSubject` helper is used by every public and
// authenticated endpoint to derive its rate-limit subject identifier.
// This suite hits the representative public endpoints (ops-error
// ingest and CSP report) and proves that two different low-64 IPv6
// suffixes inside the same /64 share a single rate-limit bucket.
//
// The regression the suite prevents: an attacker on an IPv6 /64 that
// rotates the low 64 bits of their `CF-Connecting-IP` header to
// evade the per-IP budget. With the helper in place, both requests
// hit the same `v6/64:<prefix>` bucket and the second request
// increments a counter seeded close to the limit, producing the 429.

import test from 'node:test';
import assert from 'node:assert/strict';

import { sha256 } from '../worker/src/auth.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

async function seedRateLimit(server, bucket, identifier, count) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const windowStartedAt = Math.floor(now / windowMs) * windowMs;
  server.DB.db.prepare(`
    INSERT INTO request_limits (limiter_key, window_started_at, request_count, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(limiter_key) DO UPDATE SET
      window_started_at = excluded.window_started_at,
      request_count = excluded.request_count,
      updated_at = excluded.updated_at
  `).run(`${bucket}:${await sha256(identifier)}`, windowStartedAt, count, now);
}

async function postErrorEvent(server, body, headers) {
  return server.fetchRaw('https://repo.test/api/ops/error-event', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test('ops-error ingest: two distinct /64 suffixes share a single bucket and trip 429 together', async () => {
  const server = createWorkerRepositoryServer();
  try {
    // Seed the v6/64:20010db800000000 bucket to 60 so the next request
    // is over the 60-event limit regardless of low-64 suffix.
    await seedRateLimit(server, 'ops-error-capture-ip', 'v6/64:20010db800000000', 60);

    // Attacker rotates low 64 bits between requests; both should
    // resolve to the same /64 bucket and get throttled.
    const response = await postErrorEvent(
      server,
      { errorKind: 'Error', messageFirstLine: 'boom-a' },
      { 'cf-connecting-ip': '2001:db8::1' },
    );
    const payload = await response.json();
    assert.equal(response.status, 429, 'same /64 with different low-64 must share bucket');
    assert.equal(payload.code, 'ops_error_rate_limited');

    const response2 = await postErrorEvent(
      server,
      { errorKind: 'Error', messageFirstLine: 'boom-b' },
      { 'cf-connecting-ip': '2001:db8::dead:beef' },
    );
    const payload2 = await response2.json();
    assert.equal(response2.status, 429, 'rotated low-64 within same /64 still throttled');
    assert.equal(payload2.code, 'ops_error_rate_limited');
  } finally {
    server.close();
  }
});

test('ops-error ingest: IPv4-mapped IPv6 goes to v4: bucket, not v6/64: bucket', async () => {
  const server = createWorkerRepositoryServer();
  try {
    // Seed ONLY the v6/64 bucket over the limit. If the helper
    // correctly unmaps ::ffff:1.2.3.4 to v4:1.2.3.4, the request
    // will NOT hit the seeded v6/64 bucket and must succeed (200).
    await seedRateLimit(server, 'ops-error-capture-ip', 'v6/64:00000000000000000000ffff01020304', 100);

    const response = await postErrorEvent(
      server,
      { errorKind: 'Error', messageFirstLine: 'mapped' },
      { 'cf-connecting-ip': '::ffff:1.2.3.4' },
    );
    assert.equal(response.status, 200, 'IPv4-mapped address must not share v6/64: bucket');
  } finally {
    server.close();
  }
});

test('ops-error ingest: distinct /64 prefixes keep independent buckets', async () => {
  const server = createWorkerRepositoryServer();
  try {
    // Seed 2001:db8::/64 over the limit. A request from 2001:db9::1
    // (different /64) must succeed.
    await seedRateLimit(server, 'ops-error-capture-ip', 'v6/64:20010db800000000', 100);

    const response = await postErrorEvent(
      server,
      { errorKind: 'Error', messageFirstLine: 'other-64' },
      { 'cf-connecting-ip': '2001:db9::1' },
    );
    assert.equal(response.status, 200, 'different /64 must have independent bucket');
  } finally {
    server.close();
  }
});

test('ops-error ingest: missing CF-Connecting-IP with TRUST_XFF unset lands in unknown:missing bucket', async () => {
  const server = createWorkerRepositoryServer();
  try {
    // Seed the unknown:missing bucket over the limit. Any no-header
    // request must hit that shared bucket.
    await seedRateLimit(server, 'ops-error-capture-ip', 'unknown:missing', 100);

    const response = await postErrorEvent(
      server,
      { errorKind: 'Error', messageFirstLine: 'headerless' },
    );
    const payload = await response.json();
    assert.equal(response.status, 429);
    assert.equal(payload.code, 'ops_error_rate_limited');
  } finally {
    server.close();
  }
});

test('ops-error ingest: X-Forwarded-For ignored when TRUST_XFF is not set (strict prod mode)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    // Seed v4:8.8.8.8 bucket over the limit. Request with only XFF
    // but no CF-Connecting-IP and TRUST_XFF unset must NOT hit that
    // bucket; it must land in unknown:missing instead.
    await seedRateLimit(server, 'ops-error-capture-ip', 'v4:8.8.8.8', 100);

    const response = await postErrorEvent(
      server,
      { errorKind: 'Error', messageFirstLine: 'strict' },
      { 'x-forwarded-for': '8.8.8.8, 1.1.1.1' },
    );
    assert.equal(response.status, 200, 'XFF must be ignored in strict prod mode');
  } finally {
    server.close();
  }
});

test('ops-error ingest: with TRUST_XFF=1 the X-Forwarded-For first entry drives the bucket', async () => {
  const server = createWorkerRepositoryServer({ env: { TRUST_XFF: '1' } });
  try {
    // Seed v4:8.8.8.8 over the limit. With TRUST_XFF=1 and no
    // CF-Connecting-IP, XFF first entry must drive the bucket.
    await seedRateLimit(server, 'ops-error-capture-ip', 'v4:8.8.8.8', 100);

    const response = await postErrorEvent(
      server,
      { errorKind: 'Error', messageFirstLine: 'trust-xff' },
      { 'x-forwarded-for': '8.8.8.8, 1.1.1.1' },
    );
    const payload = await response.json();
    assert.equal(response.status, 429, 'TRUST_XFF=1 must honour XFF first entry');
    assert.equal(payload.code, 'ops_error_rate_limited');
  } finally {
    server.close();
  }
});

test('csp-report endpoint: IPv6 /64 bucketing shared with ops-error helper', async () => {
  const server = createWorkerRepositoryServer();
  try {
    // Seed the CSP report v6/64 bucket over the 20-request limit.
    await seedRateLimit(server, 'csp-report', 'v6/64:20010db800000000', 25);

    const response = await server.fetchRaw('https://repo.test/api/security/csp-report', {
      method: 'POST',
      headers: {
        'content-type': 'application/csp-report',
        'cf-connecting-ip': '2001:db8::1',
      },
      body: JSON.stringify({
        'csp-report': {
          'document-uri': 'https://ks2.test/',
          'violated-directive': 'script-src',
          'blocked-uri': 'https://evil.test/x.js',
        },
      }),
    });
    assert.equal(response.status, 429, 'CSP report route must also honour /64 bucketing');
  } finally {
    server.close();
  }
});

// -- I7 (reviewer) — auth / demo / tts propagation ---------------------
//
// The ops-error + CSP propagation tests above prove the helper is wired
// to the public ingest routes. These three tests add one call-site per
// remaining consumer so the "single attacker on a /64 rotates low-64
// bits" regression is locked in across the full rate-limit surface.

test('auth login: IPv6 /64 bucketing — two low-64 suffixes share the bucket and trip 429', async () => {
  const server = createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
    },
  });
  try {
    // `login` has `ip: 10` over a 10-minute window.
    await seedRateLimit(server, 'auth-login-ip', 'v6/64:20010db800000000', 10);

    const response = await server.fetchRaw('https://repo.test/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://repo.test',
        'cf-connecting-ip': '2001:db8::dead:beef',
      },
      body: JSON.stringify({ email: 'never-hits-db@example.test', password: 'hunter2' }),
    });
    const payload = await response.json().catch(() => ({}));
    assert.equal(response.status, 400, 'login should return a BadRequestError when rate-limited');
    assert.equal(payload.code, 'rate_limited', 'login rate-limit code must propagate');
  } finally {
    server.close();
  }
});

test('demo create: IPv6 /64 bucketing — low-64 rotation still hits the seeded bucket', async () => {
  const server = createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
    },
  });
  try {
    // `demo-create-ip` has `createIp: 30` over a 10-minute window.
    await seedRateLimit(server, 'demo-create-ip', 'v6/64:20010db800000000', 30);

    const response = await server.fetchRaw('https://repo.test/api/demo/session', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://repo.test',
        'cf-connecting-ip': '2001:db8::face:feed',
      },
      body: JSON.stringify({}),
    });
    const payload = await response.json().catch(() => ({}));
    assert.equal(response.status, 400, 'demo create should return a BadRequestError when rate-limited');
    assert.equal(payload.code, 'demo_rate_limited', 'demo rate-limit code must propagate');
  } finally {
    server.close();
  }
});

test('tts endpoint: IPv6 /64 bucketing — rotated low-64 still hits the seeded ip bucket', async () => {
  // TTS requires a valid spelling prompt before `protectTts` fires.
  // Seed the minimum learner + adult + membership rows so the prompt
  // command succeeds, then start a session to obtain a prompt token,
  // then seed the tts-ip /64 bucket over its 240-event cap. The next
  // `/api/tts` POST with a distinct low-64 suffix must still hit the
  // seeded bucket and return `tts_rate_limited`.
  const server = createWorkerRepositoryServer();
  try {
    const accountId = 'adult-a';
    const learnerId = 'learner-a';
    const ts = Date.UTC(2026, 0, 1);
    server.DB.db.prepare(`
      INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
      VALUES (?, 'Learner A', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
    `).run(learnerId, ts, ts);
    server.DB.db.prepare(`
      INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
      VALUES (?, ?, ?, 'parent', ?, ?, ?, 0)
    `).run(accountId, `${accountId}@example.test`, 'Adult A', learnerId, ts, ts);
    server.DB.db.prepare(`
      INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
      VALUES (?, ?, 'owner', 0, ?, ?)
    `).run(accountId, learnerId, ts, ts);

    const startResponse = await server.fetchAs(accountId, 'https://repo.test/api/subjects/spelling/command', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        command: 'start-session',
        learnerId,
        requestId: 'propagation-tts-start',
        expectedLearnerRevision: 0,
        payload: { mode: 'single', slug: 'early', length: 1 },
      }),
    });
    const startPayload = await startResponse.json();
    assert.equal(startResponse.status, 200, JSON.stringify(startPayload));
    const promptToken = startPayload?.audio?.promptToken;
    assert.ok(promptToken, 'prompt token must be present');

    // `cacheLookupOnly: true` routes through `protectTtsLookup` which
    // consumes `tts-lookup-ip`. Seed that bucket at its 480/10-min cap
    // so the next request hits 429 purely on the /64 identifier.
    await seedRateLimit(server, 'tts-lookup-ip', 'v6/64:20010db800000000', 480);

    const response = await server.fetchAs(accountId, 'https://repo.test/api/tts', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://repo.test',
        'cf-connecting-ip': '2001:db8::cafe:babe',
      },
      body: JSON.stringify({
        learnerId,
        promptToken,
        provider: 'gemini',
        cacheLookupOnly: true,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    assert.equal(response.status, 400, 'tts should return a BadRequestError when rate-limited');
    assert.equal(payload.code, 'tts_lookup_rate_limited', 'tts lookup rate-limit code must propagate');
  } finally {
    server.close();
  }
});
