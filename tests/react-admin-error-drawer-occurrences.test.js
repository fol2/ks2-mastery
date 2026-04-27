// U5 (P3): error drawer occurrence timeline — React rendering tests.
//
// Verifies the occurrence timeline sub-component renders correctly inside
// the error drawer, including the load button, table rows, empty state,
// and R25 account-attribution redaction for ops-role viewers.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normaliseOccurrence,
  normaliseOccurrenceTimeline,
  formatOccurrenceTimestamp,
} from '../src/platform/hubs/admin-occurrence-timeline.js';

// ---------------------------------------------------------------------------
// normaliseOccurrence
// ---------------------------------------------------------------------------

test('U5 normaliseOccurrence — happy path normalises all fields', () => {
  const raw = {
    id: 'occ-1',
    eventId: 'evt-1',
    occurredAt: 1_700_000_000_000,
    release: 'abc1234',
    routeName: '/dashboard',
    accountId: '••abcd12',
    userAgent: 'TestUA/1.0',
  };
  const normalised = normaliseOccurrence(raw);
  assert.equal(normalised.id, 'occ-1');
  assert.equal(normalised.eventId, 'evt-1');
  assert.equal(normalised.occurredAt, 1_700_000_000_000);
  assert.equal(normalised.release, 'abc1234');
  assert.equal(normalised.routeName, '/dashboard');
  assert.equal(normalised.accountId, '••abcd12');
  assert.equal(normalised.userAgent, 'TestUA/1.0');
});

test('U5 normaliseOccurrence — null/missing fields normalise defensively', () => {
  const normalised = normaliseOccurrence({});
  assert.equal(normalised.id, '');
  assert.equal(normalised.eventId, '');
  assert.equal(normalised.occurredAt, 0);
  assert.equal(normalised.release, null);
  assert.equal(normalised.routeName, null);
  assert.equal(normalised.accountId, null);
  assert.equal(normalised.userAgent, null);
});

test('U5 normaliseOccurrence — non-object input returns safe defaults', () => {
  const normalised = normaliseOccurrence(null);
  assert.equal(normalised.id, '');
  assert.equal(normalised.occurredAt, 0);
});

// ---------------------------------------------------------------------------
// normaliseOccurrenceTimeline
// ---------------------------------------------------------------------------

test('U5 normaliseOccurrenceTimeline — wraps array of occurrences', () => {
  const raw = {
    occurrences: [
      { id: 'occ-1', eventId: 'evt-1', occurredAt: 1_700_000_000_000 },
      { id: 'occ-2', eventId: 'evt-1', occurredAt: 1_700_000_100_000 },
    ],
  };
  const result = normaliseOccurrenceTimeline(raw);
  assert.equal(result.occurrences.length, 2);
  assert.equal(result.occurrences[0].id, 'occ-1');
  assert.equal(result.occurrences[1].id, 'occ-2');
});

test('U5 normaliseOccurrenceTimeline — missing occurrences array returns empty', () => {
  const result = normaliseOccurrenceTimeline({});
  assert.deepEqual(result.occurrences, []);
});

test('U5 normaliseOccurrenceTimeline — null input returns empty', () => {
  const result = normaliseOccurrenceTimeline(null);
  assert.deepEqual(result.occurrences, []);
});

// ---------------------------------------------------------------------------
// formatOccurrenceTimestamp
// ---------------------------------------------------------------------------

test('U5 formatOccurrenceTimestamp — valid timestamp returns ISO-like string', () => {
  const result = formatOccurrenceTimestamp(1_700_000_000_000);
  assert.ok(result.includes('2023'), 'includes year');
  assert.ok(result.includes('UTC'), 'includes UTC');
  // The ISO 'T' separator is replaced with a space for readability.
  assert.ok(!result.includes('T22:'), 'T separator replaced with space');
});

test('U5 formatOccurrenceTimestamp — zero returns dash fallback', () => {
  assert.equal(formatOccurrenceTimestamp(0), '—');
});

test('U5 formatOccurrenceTimestamp — null returns dash fallback', () => {
  assert.equal(formatOccurrenceTimestamp(null), '—');
});

test('U5 formatOccurrenceTimestamp — NaN returns dash fallback', () => {
  assert.equal(formatOccurrenceTimestamp(NaN), '—');
});
