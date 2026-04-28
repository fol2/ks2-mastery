// P6 Unit 10: Characterisation tests for admin-refresh-envelope.js
//
// Verifies:
// 1. formatAdminTimestamp — valid / invalid / edge-case timestamps
// 2. buildRefreshErrorEnvelope — correct shape from various error inputs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatAdminTimestamp,
  buildRefreshErrorEnvelope,
} from '../src/platform/hubs/admin-refresh-envelope.js';

// ---------------------------------------------------------------------------
// formatAdminTimestamp
// ---------------------------------------------------------------------------

describe('formatAdminTimestamp', () => {
  it('formats a valid numeric timestamp to ISO-like UTC string', () => {
    // 1700000000000 = 2023-11-14T22:13:20.000Z
    const result = formatAdminTimestamp(1700000000000);
    assert.equal(result, '2023-11-14 22:13:20 UTC');
  });

  it('formats a non-.000Z timestamp preserving sub-second precision', () => {
    // 1700000000123 = 2023-11-14T22:13:20.123Z — .000Z regex does not match
    const result = formatAdminTimestamp(1700000000123);
    assert.match(result, /2023-11-14 22:13:20\.123Z/);
  });

  it('returns em-dash for null', () => {
    assert.equal(formatAdminTimestamp(null), '—');
  });

  it('returns em-dash for undefined', () => {
    assert.equal(formatAdminTimestamp(undefined), '—');
  });

  it('returns em-dash for zero', () => {
    assert.equal(formatAdminTimestamp(0), '—');
  });

  it('returns em-dash for negative numbers', () => {
    assert.equal(formatAdminTimestamp(-1), '—');
  });

  it('returns em-dash for NaN', () => {
    assert.equal(formatAdminTimestamp(NaN), '—');
  });

  it('returns em-dash for non-numeric strings', () => {
    assert.equal(formatAdminTimestamp('bad'), '—');
  });

  it('returns em-dash for Infinity', () => {
    assert.equal(formatAdminTimestamp(Infinity), '—');
  });

  it('handles string-coercible numeric values', () => {
    const result = formatAdminTimestamp('1700000000000');
    assert.equal(result, '2023-11-14 22:13:20 UTC');
  });
});

// ---------------------------------------------------------------------------
// buildRefreshErrorEnvelope
// ---------------------------------------------------------------------------

describe('buildRefreshErrorEnvelope', () => {
  it('produces correct shape with code and message from error object', () => {
    const error = { code: 'rate_limited', message: 'Too many requests' };
    const envelope = buildRefreshErrorEnvelope(error);
    assert.equal(envelope.code, 'rate_limited');
    assert.equal(envelope.message, 'Too many requests');
    assert.equal(envelope.correlationId, null);
    assert.equal(typeof envelope.at, 'number');
    assert.ok(envelope.at > 0);
  });

  it('falls back to "network" code when code is missing', () => {
    const error = { message: 'fetch failed' };
    const envelope = buildRefreshErrorEnvelope(error);
    assert.equal(envelope.code, 'network');
    assert.equal(envelope.message, 'fetch failed');
  });

  it('falls back to "network" code when code is empty string', () => {
    const error = { code: '', message: 'empty' };
    const envelope = buildRefreshErrorEnvelope(error);
    assert.equal(envelope.code, 'network');
  });

  it('falls back to empty message when message is not a string', () => {
    const error = { code: 'test', message: 123 };
    const envelope = buildRefreshErrorEnvelope(error);
    assert.equal(envelope.message, '');
  });

  it('extracts correlationId from error.payload.correlationId', () => {
    const error = { code: 'x', message: 'y', payload: { correlationId: 'abc-123' } };
    const envelope = buildRefreshErrorEnvelope(error);
    assert.equal(envelope.correlationId, 'abc-123');
  });

  it('extracts correlationId from error.correlationId as fallback', () => {
    const error = { code: 'x', message: 'y', correlationId: 'def-456' };
    const envelope = buildRefreshErrorEnvelope(error);
    assert.equal(envelope.correlationId, 'def-456');
  });

  it('prefers error.payload.correlationId over error.correlationId', () => {
    const error = {
      code: 'x',
      message: 'y',
      payload: { correlationId: 'from-payload' },
      correlationId: 'from-root',
    };
    const envelope = buildRefreshErrorEnvelope(error);
    assert.equal(envelope.correlationId, 'from-payload');
  });

  it('returns null correlationId when neither source provides one', () => {
    const error = { code: 'x', message: 'y' };
    const envelope = buildRefreshErrorEnvelope(error);
    assert.equal(envelope.correlationId, null);
  });

  it('handles null error gracefully', () => {
    const envelope = buildRefreshErrorEnvelope(null);
    assert.equal(envelope.code, 'network');
    assert.equal(envelope.message, '');
    assert.equal(envelope.correlationId, null);
    assert.equal(typeof envelope.at, 'number');
  });

  it('handles undefined error gracefully', () => {
    const envelope = buildRefreshErrorEnvelope(undefined);
    assert.equal(envelope.code, 'network');
    assert.equal(envelope.message, '');
    assert.equal(envelope.correlationId, null);
  });

  it('at field is a recent numeric timestamp', () => {
    const before = Date.now();
    const envelope = buildRefreshErrorEnvelope({ code: 'x', message: 'y' });
    const after = Date.now();
    assert.ok(envelope.at >= before);
    assert.ok(envelope.at <= after);
  });
});
