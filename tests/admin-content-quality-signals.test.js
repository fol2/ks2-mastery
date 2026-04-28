// U7 (Admin Console P6): test suite for admin-content-quality-signals.
//
// Validates the pure normaliser buildContentQualitySignals and its helpers
// against subjects with full data, partial data, and entirely missing data.
// No DOM or Worker mocking — purely tests the logic leaf.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildContentQualitySignals,
  summariseAvailability,
  formatCoverageLabel,
  coverageChipClass,
  SIGNAL_STATUS,
} from '../src/platform/hubs/admin-content-quality-signals.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const GRAMMAR_FULL_SIGNALS = {
  subjectKey: 'grammar',
  subjectName: 'Grammar',
  signals: {
    skillCoverage: { status: 'available', value: 14, total: 18 },
    templateCoverage: { status: 'available', value: 42, total: 0 },
    itemCoverage: { status: 'not_available', value: 0, total: 0 },
    commonMisconceptions: { status: 'not_available', items: [] },
    highWrongRate: {
      status: 'available',
      items: [
        { id: 'relative_clauses', label: 'relative_clauses', count: 12, detail: '12/25 wrong' },
        { id: 'modal_verbs', label: 'modal_verbs', count: 8, detail: '8/18 wrong' },
      ],
    },
    recentlyChangedUnevidenced: { status: 'not_available', items: [] },
  },
};

const SPELLING_PARTIAL_SIGNALS = {
  subjectKey: 'spelling',
  subjectName: 'Spelling',
  signals: {
    skillCoverage: { status: 'not_available', value: 0, total: 0 },
    templateCoverage: { status: 'not_available', value: 0, total: 0 },
    itemCoverage: { status: 'available', value: 180, total: 320 },
    commonMisconceptions: { status: 'not_available', items: [] },
    highWrongRate: { status: 'not_available', items: [] },
    recentlyChangedUnevidenced: { status: 'not_available', items: [] },
  },
};

const PUNCTUATION_EMPTY_SIGNALS = {
  subjectKey: 'punctuation',
  subjectName: 'Punctuation',
  signals: {
    skillCoverage: { status: 'not_available', value: 0, total: 0 },
    templateCoverage: { status: 'not_available', value: 0, total: 0 },
    itemCoverage: { status: 'not_available', value: 0, total: 0 },
    commonMisconceptions: { status: 'not_available', items: [] },
    highWrongRate: { status: 'not_available', items: [] },
    recentlyChangedUnevidenced: { status: 'not_available', items: [] },
  },
};

// ─── SIGNAL_STATUS constants ────────────────────────────────────────────────

describe('SIGNAL_STATUS', () => {
  it('exposes three frozen status values', () => {
    assert.equal(SIGNAL_STATUS.AVAILABLE, 'available');
    assert.equal(SIGNAL_STATUS.NOT_AVAILABLE, 'not_available');
    assert.equal(SIGNAL_STATUS.PARTIAL, 'partial');
    assert.ok(Object.isFrozen(SIGNAL_STATUS));
  });
});

// ─── buildContentQualitySignals ─────────────────────────────────────────────

describe('buildContentQualitySignals', () => {
  it('normalises and returns multiple subjects from array', () => {
    const result = buildContentQualitySignals([
      GRAMMAR_FULL_SIGNALS,
      SPELLING_PARTIAL_SIGNALS,
      PUNCTUATION_EMPTY_SIGNALS,
    ]);

    assert.equal(result.length, 3);
    assert.equal(result[0].subjectKey, 'grammar');
    assert.equal(result[1].subjectKey, 'spelling');
    assert.equal(result[2].subjectKey, 'punctuation');
  });

  it('returns empty array for null input', () => {
    assert.deepEqual(buildContentQualitySignals(null), []);
  });

  it('returns empty array for undefined input', () => {
    assert.deepEqual(buildContentQualitySignals(undefined), []);
  });

  it('returns empty array for non-array input (object)', () => {
    assert.deepEqual(buildContentQualitySignals({ foo: 'bar' }), []);
  });

  it('filters out entries with unknown subjectKey', () => {
    const result = buildContentQualitySignals([
      GRAMMAR_FULL_SIGNALS,
      { signals: {} }, // missing subjectKey -> 'unknown' -> filtered
      null, // non-object -> 'unknown' -> filtered
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].subjectKey, 'grammar');
  });

  it('normalises coverage signals to safe numeric values', () => {
    const result = buildContentQualitySignals([{
      subjectKey: 'grammar',
      signals: {
        skillCoverage: { status: 'available', value: 'not-a-number', total: -5 },
        templateCoverage: { status: 'partial', value: 10.7, total: 20.3 },
      },
    }]);

    assert.equal(result[0].signals.skillCoverage.value, 0);
    assert.equal(result[0].signals.skillCoverage.total, 0);
    assert.equal(result[0].signals.templateCoverage.value, 10);
    assert.equal(result[0].signals.templateCoverage.total, 20);
  });

  it('normalises list signals with mixed valid/invalid items', () => {
    const result = buildContentQualitySignals([{
      subjectKey: 'grammar',
      signals: {
        highWrongRate: {
          status: 'available',
          items: [
            { id: 'relative_clauses', label: 'Relative clauses', count: 12, detail: '12/25 wrong' },
            'not-an-object', // skipped
            null, // skipped
            { id: 'modal_verbs', label: 'Modal verbs', count: 8 },
          ],
        },
      },
    }]);

    const items = result[0].signals.highWrongRate.items;
    assert.equal(items.length, 2);
    assert.equal(items[0].id, 'relative_clauses');
    assert.equal(items[0].count, 12);
    assert.equal(items[0].detail, '12/25 wrong');
    assert.equal(items[1].id, 'modal_verbs');
    assert.equal(items[1].detail, null); // missing detail -> null
  });

  it('uses display name fallback from internal map when subjectName missing', () => {
    const result = buildContentQualitySignals([{
      subjectKey: 'punctuation',
      signals: {},
    }]);
    assert.equal(result[0].subjectName, 'Punctuation');
  });

  it('preserves explicit subjectName when provided', () => {
    const result = buildContentQualitySignals([{
      subjectKey: 'grammar',
      subjectName: 'KS2 Grammar',
      signals: {},
    }]);
    assert.equal(result[0].subjectName, 'KS2 Grammar');
  });

  it('defaults all signals to NOT_AVAILABLE when signals object is null', () => {
    const result = buildContentQualitySignals([{
      subjectKey: 'grammar',
      signals: null,
    }]);
    const signals = result[0].signals;
    assert.equal(signals.skillCoverage.status, SIGNAL_STATUS.NOT_AVAILABLE);
    assert.equal(signals.templateCoverage.status, SIGNAL_STATUS.NOT_AVAILABLE);
    assert.equal(signals.itemCoverage.status, SIGNAL_STATUS.NOT_AVAILABLE);
    assert.equal(signals.commonMisconceptions.status, SIGNAL_STATUS.NOT_AVAILABLE);
    assert.equal(signals.highWrongRate.status, SIGNAL_STATUS.NOT_AVAILABLE);
    assert.equal(signals.recentlyChangedUnevidenced.status, SIGNAL_STATUS.NOT_AVAILABLE);
  });

  it('clamps invalid status values to NOT_AVAILABLE', () => {
    const result = buildContentQualitySignals([{
      subjectKey: 'grammar',
      signals: {
        skillCoverage: { status: 'invalid_status', value: 5, total: 10 },
      },
    }]);
    assert.equal(result[0].signals.skillCoverage.status, SIGNAL_STATUS.NOT_AVAILABLE);
  });

  it('accepts PARTIAL status', () => {
    const result = buildContentQualitySignals([{
      subjectKey: 'grammar',
      signals: {
        skillCoverage: { status: 'partial', value: 5, total: 10 },
      },
    }]);
    assert.equal(result[0].signals.skillCoverage.status, SIGNAL_STATUS.PARTIAL);
  });
});

// ─── summariseAvailability ──────────────────────────────────────────────────

describe('summariseAvailability', () => {
  it('returns "all" when every signal is AVAILABLE', () => {
    const signals = {
      skillCoverage: { status: SIGNAL_STATUS.AVAILABLE },
      templateCoverage: { status: SIGNAL_STATUS.AVAILABLE },
      itemCoverage: { status: SIGNAL_STATUS.AVAILABLE },
      commonMisconceptions: { status: SIGNAL_STATUS.AVAILABLE },
      highWrongRate: { status: SIGNAL_STATUS.AVAILABLE },
      recentlyChangedUnevidenced: { status: SIGNAL_STATUS.AVAILABLE },
    };
    assert.equal(summariseAvailability(signals), 'all');
  });

  it('returns "none" when every signal is NOT_AVAILABLE', () => {
    const signals = {
      skillCoverage: { status: SIGNAL_STATUS.NOT_AVAILABLE },
      templateCoverage: { status: SIGNAL_STATUS.NOT_AVAILABLE },
      itemCoverage: { status: SIGNAL_STATUS.NOT_AVAILABLE },
      commonMisconceptions: { status: SIGNAL_STATUS.NOT_AVAILABLE },
      highWrongRate: { status: SIGNAL_STATUS.NOT_AVAILABLE },
      recentlyChangedUnevidenced: { status: SIGNAL_STATUS.NOT_AVAILABLE },
    };
    assert.equal(summariseAvailability(signals), 'none');
  });

  it('returns "some" for mixed availability', () => {
    const signals = {
      skillCoverage: { status: SIGNAL_STATUS.AVAILABLE },
      templateCoverage: { status: SIGNAL_STATUS.NOT_AVAILABLE },
      itemCoverage: { status: SIGNAL_STATUS.AVAILABLE },
      commonMisconceptions: { status: SIGNAL_STATUS.NOT_AVAILABLE },
      highWrongRate: { status: SIGNAL_STATUS.NOT_AVAILABLE },
      recentlyChangedUnevidenced: { status: SIGNAL_STATUS.NOT_AVAILABLE },
    };
    assert.equal(summariseAvailability(signals), 'some');
  });

  it('returns "none" for null input', () => {
    assert.equal(summariseAvailability(null), 'none');
  });

  it('returns "none" for undefined input', () => {
    assert.equal(summariseAvailability(undefined), 'none');
  });

  it('returns "none" for empty object', () => {
    assert.equal(summariseAvailability({}), 'none');
  });

  it('treats PARTIAL status as not AVAILABLE for summary', () => {
    const signals = {
      skillCoverage: { status: SIGNAL_STATUS.PARTIAL },
      templateCoverage: { status: SIGNAL_STATUS.PARTIAL },
    };
    assert.equal(summariseAvailability(signals), 'none');
  });
});

// ─── formatCoverageLabel ────────────────────────────────────────────────────

describe('formatCoverageLabel', () => {
  it('formats available signal with unit', () => {
    const signal = { status: SIGNAL_STATUS.AVAILABLE, value: 14, total: 18 };
    assert.equal(formatCoverageLabel(signal, 'concepts'), '14 / 18 concepts covered');
  });

  it('returns "Not available yet" for NOT_AVAILABLE status', () => {
    const signal = { status: SIGNAL_STATUS.NOT_AVAILABLE, value: 0, total: 0 };
    assert.equal(formatCoverageLabel(signal, 'skills'), 'Not available yet');
  });

  it('returns "Not available yet" for null input', () => {
    assert.equal(formatCoverageLabel(null, 'items'), 'Not available yet');
  });

  it('returns "Not available yet" for undefined input', () => {
    assert.equal(formatCoverageLabel(undefined, 'items'), 'Not available yet');
  });

  it('handles zero values correctly', () => {
    const signal = { status: SIGNAL_STATUS.AVAILABLE, value: 0, total: 10 };
    assert.equal(formatCoverageLabel(signal, 'templates'), '0 / 10 templates covered');
  });
});

// ─── coverageChipClass ──────────────────────────────────────────────────────

describe('coverageChipClass', () => {
  it('returns "good" for 90%+ coverage', () => {
    assert.equal(coverageChipClass({ status: SIGNAL_STATUS.AVAILABLE, value: 9, total: 10 }), 'good');
    assert.equal(coverageChipClass({ status: SIGNAL_STATUS.AVAILABLE, value: 10, total: 10 }), 'good');
  });

  it('returns "warn" for 60-89% coverage', () => {
    assert.equal(coverageChipClass({ status: SIGNAL_STATUS.AVAILABLE, value: 6, total: 10 }), 'warn');
    assert.equal(coverageChipClass({ status: SIGNAL_STATUS.AVAILABLE, value: 8, total: 10 }), 'warn');
  });

  it('returns "bad" for below 60% coverage', () => {
    assert.equal(coverageChipClass({ status: SIGNAL_STATUS.AVAILABLE, value: 5, total: 10 }), 'bad');
    assert.equal(coverageChipClass({ status: SIGNAL_STATUS.AVAILABLE, value: 0, total: 10 }), 'bad');
  });

  it('returns empty string for NOT_AVAILABLE', () => {
    assert.equal(coverageChipClass({ status: SIGNAL_STATUS.NOT_AVAILABLE, value: 0, total: 0 }), '');
  });

  it('returns empty string for null input', () => {
    assert.equal(coverageChipClass(null), '');
  });

  it('returns empty string when total is 0', () => {
    assert.equal(coverageChipClass({ status: SIGNAL_STATUS.AVAILABLE, value: 5, total: 0 }), '');
  });
});
