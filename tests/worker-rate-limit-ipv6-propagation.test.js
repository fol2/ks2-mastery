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
