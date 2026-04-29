// Hero Mode P6 U10 — Date/time edge-case tests for deriveDateKey.
//
// Validates:
// - dateKey is stable for same timestamp regardless of timezone arg
// - dateKey changes at midnight boundary (23:59:59 -> 00:00:00)
// - DST transition dates for Europe/London:
//   - 2026-03-29 (clocks spring forward)
//   - 2026-10-25 (clocks fall back)
// - dateKey format is YYYY-MM-DD
//
// Uses node:test + node:assert/strict. Pure function testing, no server.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { deriveDateKey } from '../shared/hero/seed.js';
import { HERO_DEFAULT_TIMEZONE } from '../shared/hero/constants.js';

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Create a UTC timestamp for a specific date/time.
 * Note: month is 0-indexed in Date.UTC.
 */
function utcMs(year, month, day, hour = 0, minute = 0, second = 0) {
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

// ── dateKey format validation ────────────────────────────────────────

describe('P6-U10: deriveDateKey — format', () => {
  it('dateKey format is YYYY-MM-DD', () => {
    const ts = utcMs(2026, 4, 29, 10, 30, 0); // 2026-04-29 10:30 UTC
    const key = deriveDateKey(ts, 'Europe/London');
    assert.match(key, /^\d{4}-\d{2}-\d{2}$/, `Expected YYYY-MM-DD format, got: ${key}`);
  });

  it('dateKey includes zero-padded month and day', () => {
    // 2026-01-05 in UTC — still Jan 5 in Europe/London (GMT)
    const ts = utcMs(2026, 1, 5, 8, 0, 0);
    const key = deriveDateKey(ts, 'Europe/London');
    assert.equal(key, '2026-01-05');
  });

  it('dateKey for a known fixed date is deterministic', () => {
    const ts = utcMs(2026, 6, 15, 14, 0, 0); // 2026-06-15 14:00 UTC -> BST = 15:00
    const key1 = deriveDateKey(ts, 'Europe/London');
    const key2 = deriveDateKey(ts, 'Europe/London');
    assert.equal(key1, key2, 'Must be deterministic for same input');
    assert.equal(key1, '2026-06-15');
  });
});

// ── Stability across repeated calls ─────────────────────────────────

describe('P6-U10: deriveDateKey — stability', () => {
  it('same timestamp produces same dateKey on repeated calls', () => {
    const ts = utcMs(2026, 4, 29, 12, 0, 0);
    const results = new Set();
    for (let i = 0; i < 100; i++) {
      results.add(deriveDateKey(ts, HERO_DEFAULT_TIMEZONE));
    }
    assert.equal(results.size, 1, 'All 100 calls must produce the same dateKey');
  });

  it('same UTC instant maps to same dateKey regardless of which timezone string is passed (within same local date)', () => {
    // 2026-04-29 at noon UTC — this is still April 29 in both UTC and Europe/London (BST+1)
    const ts = utcMs(2026, 4, 29, 12, 0, 0);
    const keyLondon = deriveDateKey(ts, 'Europe/London');
    const keyUtc = deriveDateKey(ts, 'UTC');
    // Both should be 2026-04-29 since noon UTC is 13:00 BST (same day)
    assert.equal(keyLondon, '2026-04-29');
    assert.equal(keyUtc, '2026-04-29');
  });
});

// ── Midnight boundary ────────────────────────────────────────────────

describe('P6-U10: deriveDateKey — midnight boundary', () => {
  it('dateKey changes at midnight boundary in the configured timezone', () => {
    // In Europe/London during GMT (January): midnight is 00:00 UTC
    const justBefore = utcMs(2026, 1, 14, 23, 59, 59); // 23:59:59 UTC = 23:59:59 GMT
    const justAfter = utcMs(2026, 1, 15, 0, 0, 0);      // 00:00:00 UTC = 00:00:00 GMT

    const keyBefore = deriveDateKey(justBefore, 'Europe/London');
    const keyAfter = deriveDateKey(justAfter, 'Europe/London');

    assert.equal(keyBefore, '2026-01-14');
    assert.equal(keyAfter, '2026-01-15');
    assert.notEqual(keyBefore, keyAfter, 'dateKey must change at midnight');
  });

  it('timestamps within the same day produce the same dateKey', () => {
    // All within 2026-01-20 in GMT
    const morning = utcMs(2026, 1, 20, 6, 0, 0);
    const noon = utcMs(2026, 1, 20, 12, 0, 0);
    const evening = utcMs(2026, 1, 20, 23, 59, 0);

    const k1 = deriveDateKey(morning, 'Europe/London');
    const k2 = deriveDateKey(noon, 'Europe/London');
    const k3 = deriveDateKey(evening, 'Europe/London');

    assert.equal(k1, '2026-01-20');
    assert.equal(k2, '2026-01-20');
    assert.equal(k3, '2026-01-20');
  });
});

// ── DST spring forward: 2026-03-29 (Europe/London) ──────────────────

describe('P6-U10: deriveDateKey — DST spring forward (2026-03-29)', () => {
  // On 2026-03-29 at 01:00 UTC, clocks in Europe/London move from GMT to BST (UTC+1).
  // So 01:00 UTC = 02:00 BST. The hour 01:00 local does not exist.

  it('23:59 UTC on March 28 is still March 28 in London (GMT)', () => {
    const ts = utcMs(2026, 3, 28, 23, 59, 59);
    const key = deriveDateKey(ts, 'Europe/London');
    assert.equal(key, '2026-03-28');
  });

  it('00:00 UTC on March 29 is March 29 in London (still GMT until 01:00)', () => {
    const ts = utcMs(2026, 3, 29, 0, 0, 0);
    const key = deriveDateKey(ts, 'Europe/London');
    assert.equal(key, '2026-03-29');
  });

  it('00:59 UTC on March 29 is still March 29 in London (last minute of GMT)', () => {
    const ts = utcMs(2026, 3, 29, 0, 59, 59);
    const key = deriveDateKey(ts, 'Europe/London');
    assert.equal(key, '2026-03-29');
  });

  it('01:00 UTC on March 29 is 02:00 BST — still March 29 (no date skip)', () => {
    // Clocks spring forward: 01:00 UTC = 02:00 BST. Same calendar date.
    const ts = utcMs(2026, 3, 29, 1, 0, 0);
    const key = deriveDateKey(ts, 'Europe/London');
    assert.equal(key, '2026-03-29');
  });

  it('midnight boundary still works on DST day: 23:00 UTC March 29 is March 30 00:00 BST', () => {
    // 23:00 UTC on March 29 = 00:00 BST on March 30 (because BST = UTC+1)
    const ts = utcMs(2026, 3, 29, 23, 0, 0);
    const key = deriveDateKey(ts, 'Europe/London');
    assert.equal(key, '2026-03-30', '23:00 UTC on 29 March is midnight BST on 30 March');
  });

  it('dateKey still changes at local midnight during spring forward', () => {
    // Last second of March 29 in BST: 22:59:59 UTC = 23:59:59 BST
    const lastSecondMar29 = utcMs(2026, 3, 29, 22, 59, 59);
    // First second of March 30 in BST: 23:00:00 UTC = 00:00:00 BST
    const firstSecondMar30 = utcMs(2026, 3, 29, 23, 0, 0);

    const keyBefore = deriveDateKey(lastSecondMar29, 'Europe/London');
    const keyAfter = deriveDateKey(firstSecondMar30, 'Europe/London');

    assert.equal(keyBefore, '2026-03-29');
    assert.equal(keyAfter, '2026-03-30');
    assert.notEqual(keyBefore, keyAfter);
  });
});

// ── DST fall back: 2026-10-25 (Europe/London) ───────────────────────

describe('P6-U10: deriveDateKey — DST fall back (2026-10-25)', () => {
  // On 2026-10-25 at 01:00 UTC, clocks in Europe/London move from BST to GMT.
  // So 01:00 UTC was 02:00 BST, becomes 01:00 GMT. The hour 01:00 local happens twice.

  it('23:59 UTC on October 24 is October 25 00:59 BST (still Oct 25 in London)', () => {
    // 23:59 UTC on Oct 24 = 00:59 BST on Oct 25 (BST = UTC+1 still active)
    const ts = utcMs(2026, 10, 24, 23, 59, 59);
    const key = deriveDateKey(ts, 'Europe/London');
    assert.equal(key, '2026-10-25', '23:59 UTC on Oct 24 is 00:59 BST on Oct 25');
  });

  it('00:00 UTC on October 25 is 01:00 BST — still October 25', () => {
    const ts = utcMs(2026, 10, 25, 0, 0, 0);
    const key = deriveDateKey(ts, 'Europe/London');
    assert.equal(key, '2026-10-25');
  });

  it('the repeated hour (01:00 UTC = 01:00 GMT after fallback) is still October 25', () => {
    // At 01:00 UTC on Oct 25, clocks fall back. 01:00 UTC = 01:00 GMT.
    const ts = utcMs(2026, 10, 25, 1, 0, 0);
    const key = deriveDateKey(ts, 'Europe/London');
    assert.equal(key, '2026-10-25');
  });

  it('dateKey does not double-count the repeated hour — same date throughout', () => {
    // Both 00:30 UTC and 01:30 UTC on Oct 25 map to October 25 in London
    const beforeFallback = utcMs(2026, 10, 25, 0, 30, 0); // 01:30 BST
    const afterFallback = utcMs(2026, 10, 25, 1, 30, 0);  // 01:30 GMT

    const keyBefore = deriveDateKey(beforeFallback, 'Europe/London');
    const keyAfter = deriveDateKey(afterFallback, 'Europe/London');

    assert.equal(keyBefore, '2026-10-25');
    assert.equal(keyAfter, '2026-10-25');
    assert.equal(keyBefore, keyAfter, 'Both sides of the repeated hour must be the same date');
  });

  it('midnight boundary still works during fall-back: 00:00 UTC Oct 26 = 00:00 GMT Oct 26', () => {
    // After fallback, midnight in London is 00:00 UTC again.
    const lastSecondOct25 = utcMs(2026, 10, 25, 23, 59, 59); // 23:59 GMT = Oct 25
    const firstSecondOct26 = utcMs(2026, 10, 26, 0, 0, 0);    // 00:00 GMT = Oct 26

    const keyBefore = deriveDateKey(lastSecondOct25, 'Europe/London');
    const keyAfter = deriveDateKey(firstSecondOct26, 'Europe/London');

    assert.equal(keyBefore, '2026-10-25');
    assert.equal(keyAfter, '2026-10-26');
    assert.notEqual(keyBefore, keyAfter);
  });
});

// ── Edge cases ───────────────────────────────────────────────────────

describe('P6-U10: deriveDateKey — edge cases', () => {
  it('handles NaN timestamp gracefully (falls back to Date.now())', () => {
    const key = deriveDateKey(NaN, 'Europe/London');
    // Should not throw; returns today's date
    assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('handles Infinity timestamp gracefully (falls back to Date.now())', () => {
    const key = deriveDateKey(Infinity, 'Europe/London');
    assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('handles negative timestamp gracefully (falls back to Date.now())', () => {
    const key = deriveDateKey(-Infinity, 'Europe/London');
    assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('accepts a function as timestamp source (like () => Date.now())', () => {
    const ts = utcMs(2026, 7, 1, 12, 0, 0);
    const key = deriveDateKey(() => ts, 'Europe/London');
    assert.equal(key, '2026-07-01');
  });

  it('default timezone is Europe/London', () => {
    assert.equal(HERO_DEFAULT_TIMEZONE, 'Europe/London');
  });

  it('deriveDateKey uses default timezone when none provided', () => {
    const ts = utcMs(2026, 4, 29, 12, 0, 0);
    const keyDefault = deriveDateKey(ts);
    const keyExplicit = deriveDateKey(ts, 'Europe/London');
    assert.equal(keyDefault, keyExplicit);
  });
});
