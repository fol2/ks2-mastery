// U4 (P1.5 Phase B): pure-function unit tests for
// `normaliseRateLimitSubject`. Drives the implementation in
// `worker/src/rate-limit.js`.
//
// The helper produces a tiered rate-limit subject key for every public
// and authenticated endpoint. It exists so a single attacker on an IPv6
// /64 cannot rotate the low 64 bits of `CF-Connecting-IP` to evade
// per-IP limits, and so malformed / unsafe headers (link-local, ULA,
// loopback, unspecified, missing) land in distinct `unknown:<reason>`
// buckets rather than silently sharing a bucket with a real IP.
//
// Header trust precedence is strict by default:
//   - `CF-Connecting-IP` only (Cloudflare-signed).
//   - `X-Forwarded-For` / `X-Real-IP` fall-back is opt-in through
//     `trustXForwardedFor: true`, which the caller only sets when
//     `env.TRUST_XFF === '1'` (dev / staging behind-origin).
// Production Workers pass `trustXForwardedFor: false`; a missing
// `CF-Connecting-IP` lands in `unknown:missing` with a stricter limit.

import test from 'node:test';
import assert from 'node:assert/strict';

import { normaliseRateLimitSubject } from '../worker/src/rate-limit.js';

function requestWith(headers = {}) {
  return new Request('https://repo.test/anywhere', { headers });
}

test('IPv4 address in CF-Connecting-IP returns v4: bucket key', () => {
  const out = normaliseRateLimitSubject(requestWith({ 'cf-connecting-ip': '1.2.3.4' }));
  assert.equal(out.bucketKey, 'v4:1.2.3.4');
  assert.equal(out.fallbackReason, null);
  assert.equal(out.globalKey, undefined);
});

test('IPv6 addresses in the same /64 collapse to one v6/64: key regardless of hextet form', () => {
  const expanded = normaliseRateLimitSubject(requestWith({ 'cf-connecting-ip': '2001:DB8:0:0:ABCD::1' }));
  const compact = normaliseRateLimitSubject(requestWith({ 'cf-connecting-ip': '2001:db8::abcd:0:0:1' }));
  assert.equal(expanded.bucketKey, 'v6/64:20010db800000000');
  assert.equal(compact.bucketKey, 'v6/64:20010db800000000');
  assert.equal(expanded.fallbackReason, null);
  assert.equal(compact.fallbackReason, null);
});

test('two distinct IPv6 /64 prefixes hash to different buckets', () => {
  const a = normaliseRateLimitSubject(requestWith({ 'cf-connecting-ip': '2001:db8:a::1' }));
  const b = normaliseRateLimitSubject(requestWith({ 'cf-connecting-ip': '2001:db8:b::1' }));
  assert.notEqual(a.bucketKey, b.bucketKey);
  assert.ok(a.bucketKey.startsWith('v6/64:'));
  assert.ok(b.bucketKey.startsWith('v6/64:'));
});

test('IPv4-mapped IPv6 ::ffff:1.2.3.4 resolves to v4:1.2.3.4 (not v6/64:)', () => {
  const out = normaliseRateLimitSubject(requestWith({ 'cf-connecting-ip': '::ffff:1.2.3.4' }));
  assert.equal(out.bucketKey, 'v4:1.2.3.4');
  assert.equal(out.fallbackReason, null);
});

test('mixed-case IPv4-mapped IPv6 also resolves to v4:', () => {
  const out = normaliseRateLimitSubject(requestWith({ 'cf-connecting-ip': '::FFFF:10.0.0.1' }));
  assert.equal(out.bucketKey, 'v4:10.0.0.1');
});

test('link-local fe80::/10 returns unknown:link_local', () => {
  const out = normaliseRateLimitSubject(requestWith({ 'cf-connecting-ip': 'fe80::1' }));
  assert.equal(out.bucketKey, 'unknown:link_local');
  assert.equal(out.fallbackReason, 'link_local');
});

test('link-local with zone id stripped before classification', () => {
  const out = normaliseRateLimitSubject(requestWith({ 'cf-connecting-ip': 'fe80::1%eth0' }));
  assert.equal(out.bucketKey, 'unknown:link_local');
  assert.equal(out.fallbackReason, 'link_local');
});

test('unique-local address fc00::/7 returns unknown:ula', () => {
  const out = normaliseRateLimitSubject(requestWith({ 'cf-connecting-ip': 'fc00::1' }));
  assert.equal(out.bucketKey, 'unknown:ula');
  assert.equal(out.fallbackReason, 'ula');
});

test('loopback ::1 returns unknown:loopback', () => {
  const out = normaliseRateLimitSubject(requestWith({ 'cf-connecting-ip': '::1' }));
  assert.equal(out.bucketKey, 'unknown:loopback');
  assert.equal(out.fallbackReason, 'loopback');
});

test('unspecified :: returns unknown:unspecified', () => {
  const out = normaliseRateLimitSubject(requestWith({ 'cf-connecting-ip': '::' }));
  assert.equal(out.bucketKey, 'unknown:unspecified');
  assert.equal(out.fallbackReason, 'unspecified');
});

test('garbage string returns unknown:malformed', () => {
  const out = normaliseRateLimitSubject(requestWith({ 'cf-connecting-ip': 'not-an-ip' }));
  assert.equal(out.bucketKey, 'unknown:malformed');
  assert.equal(out.fallbackReason, 'malformed');
});

test('IPv6 with too many hextets is malformed', () => {
  const out = normaliseRateLimitSubject(requestWith({ 'cf-connecting-ip': '1:2:3:4:5:6:7:8:9' }));
  assert.equal(out.bucketKey, 'unknown:malformed');
  assert.equal(out.fallbackReason, 'malformed');
});

test('IPv6 with non-hex hextet is malformed', () => {
  const out = normaliseRateLimitSubject(requestWith({ 'cf-connecting-ip': '2001:db8::zzzz' }));
  assert.equal(out.bucketKey, 'unknown:malformed');
  assert.equal(out.fallbackReason, 'malformed');
});

test('IPv4 out of range octets are malformed', () => {
  const out = normaliseRateLimitSubject(requestWith({ 'cf-connecting-ip': '999.1.1.1' }));
  assert.equal(out.bucketKey, 'unknown:malformed');
  assert.equal(out.fallbackReason, 'malformed');
});

test('missing CF-Connecting-IP with trustXForwardedFor=false returns unknown:missing', () => {
  const out = normaliseRateLimitSubject(requestWith({}));
  assert.equal(out.bucketKey, 'unknown:missing');
  assert.equal(out.fallbackReason, 'missing');
});

test('missing CF-Connecting-IP with trustXForwardedFor=false ignores X-Forwarded-For (strict prod mode)', () => {
  const out = normaliseRateLimitSubject(requestWith({
    'x-forwarded-for': '8.8.8.8, 1.1.1.1',
    'x-real-ip': '9.9.9.9',
  }));
  assert.equal(out.bucketKey, 'unknown:missing');
  assert.equal(out.fallbackReason, 'missing');
});

test('missing CF-Connecting-IP with trustXForwardedFor=true falls back to X-Forwarded-For first entry', () => {
  const out = normaliseRateLimitSubject(
    requestWith({ 'x-forwarded-for': '8.8.8.8, 1.1.1.1' }),
    { trustXForwardedFor: true },
  );
  assert.equal(out.bucketKey, 'v4:8.8.8.8');
  assert.equal(out.fallbackReason, null);
});

test('missing CF-Connecting-IP with trustXForwardedFor=true falls back to X-Real-IP when X-Forwarded-For absent', () => {
  const out = normaliseRateLimitSubject(
    requestWith({ 'x-real-ip': '7.7.7.7' }),
    { trustXForwardedFor: true },
  );
  assert.equal(out.bucketKey, 'v4:7.7.7.7');
  assert.equal(out.fallbackReason, null);
});

test('X-Forwarded-For with trailing spaces is trimmed before parsing', () => {
  const out = normaliseRateLimitSubject(
    requestWith({ 'x-forwarded-for': '  8.8.8.8  ,  1.1.1.1  ' }),
    { trustXForwardedFor: true },
  );
  assert.equal(out.bucketKey, 'v4:8.8.8.8');
});

test('CF-Connecting-IP takes precedence over X-Forwarded-For even when trust is enabled', () => {
  const out = normaliseRateLimitSubject(
    requestWith({ 'cf-connecting-ip': '4.4.4.4', 'x-forwarded-for': '8.8.8.8' }),
    { trustXForwardedFor: true },
  );
  assert.equal(out.bucketKey, 'v4:4.4.4.4');
});

test('globalBudgetKey set to a route name emits globalKey: global:<route>', () => {
  const out = normaliseRateLimitSubject(
    requestWith({ 'cf-connecting-ip': '1.2.3.4' }),
    { globalBudgetKey: 'ops-error-capture' },
  );
  assert.equal(out.bucketKey, 'v4:1.2.3.4');
  assert.equal(out.globalKey, 'global:ops-error-capture');
});

test('globalBudgetKey unset leaves globalKey undefined', () => {
  const out = normaliseRateLimitSubject(
    requestWith({ 'cf-connecting-ip': '1.2.3.4' }),
    { globalBudgetKey: null },
  );
  assert.equal(out.globalKey, undefined);
});

test('empty string globalBudgetKey leaves globalKey undefined', () => {
  const out = normaliseRateLimitSubject(
    requestWith({ 'cf-connecting-ip': '1.2.3.4' }),
    { globalBudgetKey: '' },
  );
  assert.equal(out.globalKey, undefined);
});

test('globalBudgetKey also applies when bucketKey is unknown:', () => {
  const out = normaliseRateLimitSubject(
    requestWith({}),
    { globalBudgetKey: 'ops-error-capture' },
  );
  assert.equal(out.bucketKey, 'unknown:missing');
  assert.equal(out.globalKey, 'global:ops-error-capture');
});

test('fully-written IPv6 with all eight hextets produces the /64 prefix', () => {
  const out = normaliseRateLimitSubject(
    requestWith({ 'cf-connecting-ip': '2001:0db8:0000:0000:1234:5678:9abc:def0' }),
  );
  assert.equal(out.bucketKey, 'v6/64:20010db800000000');
});

test('IPv6 leading :: expands to 8 hextets with zero-filled prefix', () => {
  const out = normaliseRateLimitSubject(
    requestWith({ 'cf-connecting-ip': '::1234' }),
  );
  // Leading :: means all zeros in prefix; /64 bucket key is all zeros.
  assert.equal(out.bucketKey, 'v6/64:0000000000000000');
});

test('IPv6 trailing :: treated symmetrically', () => {
  const out = normaliseRateLimitSubject(
    requestWith({ 'cf-connecting-ip': '2001:db8::' }),
  );
  assert.equal(out.bucketKey, 'v6/64:20010db800000000');
});

test('request with whitespace-only CF-Connecting-IP treated as missing', () => {
  const out = normaliseRateLimitSubject(requestWith({ 'cf-connecting-ip': '   ' }));
  assert.equal(out.bucketKey, 'unknown:missing');
  assert.equal(out.fallbackReason, 'missing');
});
