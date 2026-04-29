// P6 Unit 1: Characterisation baseline — admin-production-evidence.js
//
// Exhaustive pin of existing behaviour for classifyEvidenceMetric,
// buildEvidencePanelModel, isValidEvidenceState, and exported constants.
// These tests document the current contract so that P6 refactors can be
// verified against a known-good baseline.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  EVIDENCE_STATES,
  EVIDENCE_FRESH_THRESHOLD_MS,
  isValidEvidenceState,
  classifyEvidenceMetric,
  buildEvidencePanelModel,
} from '../src/platform/hubs/admin-production-evidence.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('EVIDENCE_FRESH_THRESHOLD_MS', () => {
  it('equals exactly 24 hours in milliseconds', () => {
    assert.equal(EVIDENCE_FRESH_THRESHOLD_MS, 24 * 60 * 60 * 1000);
    assert.equal(EVIDENCE_FRESH_THRESHOLD_MS, 86_400_000);
  });
});

describe('EVIDENCE_STATES', () => {
  it('is frozen', () => {
    assert.equal(Object.isFrozen(EVIDENCE_STATES), true);
  });

  it('has exactly 11 values (P7: +PREFLIGHT_ONLY)', () => {
    assert.equal(Object.keys(EVIDENCE_STATES).length, 11);
  });

  it('maps to expected string values', () => {
    assert.equal(EVIDENCE_STATES.NOT_AVAILABLE, 'not_available');
    assert.equal(EVIDENCE_STATES.STALE, 'stale');
    assert.equal(EVIDENCE_STATES.FAILING, 'failing');
    assert.equal(EVIDENCE_STATES.NON_CERTIFYING, 'non_certifying');
    assert.equal(EVIDENCE_STATES.SMOKE_PASS, 'smoke_pass');
    assert.equal(EVIDENCE_STATES.SMALL_PILOT_PROVISIONAL, 'small_pilot_provisional');
    assert.equal(EVIDENCE_STATES.CERTIFIED_30, 'certified_30_learner_beta');
    assert.equal(EVIDENCE_STATES.CERTIFIED_60, 'certified_60_learner_stretch');
    assert.equal(EVIDENCE_STATES.CERTIFIED_100, 'certified_100_plus');
    assert.equal(EVIDENCE_STATES.UNKNOWN, 'unknown');
  });
});

// ---------------------------------------------------------------------------
// isValidEvidenceState
// ---------------------------------------------------------------------------

describe('isValidEvidenceState', () => {
  it('accepts all 10 enum values', () => {
    for (const value of Object.values(EVIDENCE_STATES)) {
      assert.equal(isValidEvidenceState(value), true, `expected ${value} to be valid`);
    }
  });

  it('rejects invalid string "bogus"', () => {
    assert.equal(isValidEvidenceState('bogus'), false);
  });

  it('rejects empty string', () => {
    assert.equal(isValidEvidenceState(''), false);
  });

  it('rejects null', () => {
    assert.equal(isValidEvidenceState(null), false);
  });

  it('rejects undefined', () => {
    assert.equal(isValidEvidenceState(undefined), false);
  });

  it('rejects number 42', () => {
    assert.equal(isValidEvidenceState(42), false);
  });

  it('rejects case-variant "SMOKE_PASS"', () => {
    assert.equal(isValidEvidenceState('SMOKE_PASS'), false);
  });

  it('rejects close-but-wrong "not-available" (hyphen instead of underscore)', () => {
    assert.equal(isValidEvidenceState('not-available'), false);
  });

  it('rejects fabricated high-tier "certified_999_learner_galaxy"', () => {
    assert.equal(isValidEvidenceState('certified_999_learner_galaxy'), false);
  });
});

// ---------------------------------------------------------------------------
// classifyEvidenceMetric
// ---------------------------------------------------------------------------

describe('classifyEvidenceMetric', () => {
  const NOW = 1_700_000_000_000; // fixed reference time
  const FRESH = new Date(NOW - 60_000).toISOString(); // 1 minute ago — well within 24h
  const STALE_DATE = new Date(NOW - EVIDENCE_FRESH_THRESHOLD_MS - 1000).toISOString();
  const freshMetric = (overrides = {}) => ({ finishedAt: FRESH, ...overrides });

  describe('returns NOT_AVAILABLE', () => {
    it('when metricValue is null', () => {
      assert.equal(
        classifyEvidenceMetric('smoke_pass', null, FRESH, NOW),
        EVIDENCE_STATES.NOT_AVAILABLE,
      );
    });

    it('when metricValue is undefined', () => {
      assert.equal(
        classifyEvidenceMetric('smoke_pass', undefined, FRESH, NOW),
        EVIDENCE_STATES.NOT_AVAILABLE,
      );
    });

    it('when metricValue is a string (not an object)', () => {
      assert.equal(
        classifyEvidenceMetric('smoke_pass', 'not-an-object', FRESH, NOW),
        EVIDENCE_STATES.NOT_AVAILABLE,
      );
    });

    it('when metricValue is a number', () => {
      assert.equal(
        classifyEvidenceMetric('smoke_pass', 42, FRESH, NOW),
        EVIDENCE_STATES.NOT_AVAILABLE,
      );
    });
  });

  describe('returns STALE', () => {
    it('when generatedAt is null', () => {
      assert.equal(
        classifyEvidenceMetric('smoke_pass', { ok: true }, null, NOW),
        EVIDENCE_STATES.STALE,
      );
    });

    it('when generatedAt is empty string (produces NaN → treated as missing)', () => {
      assert.equal(
        classifyEvidenceMetric('smoke_pass', { ok: true }, '', NOW),
        EVIDENCE_STATES.STALE,
      );
    });

    it('when generatedAt is an invalid date string', () => {
      assert.equal(
        classifyEvidenceMetric('smoke_pass', { ok: true }, 'not-a-date', NOW),
        EVIDENCE_STATES.STALE,
      );
    });

    it('when finishedAt is older than 24h', () => {
      assert.equal(
        classifyEvidenceMetric('smoke_pass', freshMetric({ finishedAt: STALE_DATE, ok: true, failures: [] }), FRESH, NOW),
        EVIDENCE_STATES.STALE,
      );
    });

    it('when finishedAt is exactly on the boundary (age === threshold + 1ms)', () => {
      const boundary = new Date(NOW - EVIDENCE_FRESH_THRESHOLD_MS - 1).toISOString();
      assert.equal(
        classifyEvidenceMetric('smoke_pass', freshMetric({ finishedAt: boundary, ok: true }), FRESH, NOW),
        EVIDENCE_STATES.STALE,
      );
    });
  });

  describe('returns NON_CERTIFYING for dryRun', () => {
    it('when dryRun is true even if ok is true', () => {
      assert.equal(
        classifyEvidenceMetric('smoke_pass', freshMetric({ ok: true, dryRun: true, failures: [] }), FRESH, NOW),
        EVIDENCE_STATES.NON_CERTIFYING,
      );
    });

    it('dryRun check runs before failing check', () => {
      // If dryRun AND ok:false, dryRun wins because it is checked first.
      assert.equal(
        classifyEvidenceMetric('smoke_pass', freshMetric({ ok: false, dryRun: true, failures: ['x'] }), FRESH, NOW),
        EVIDENCE_STATES.NON_CERTIFYING,
      );
    });
  });

  describe('returns FAILING', () => {
    it('when ok is false (no failures array)', () => {
      assert.equal(
        classifyEvidenceMetric('certified_30_learner_beta', freshMetric({ ok: false }), FRESH, NOW),
        EVIDENCE_STATES.FAILING,
      );
    });

    it('when ok is false with empty failures array', () => {
      assert.equal(
        classifyEvidenceMetric('certified_30_learner_beta', freshMetric({ ok: false, failures: [] }), FRESH, NOW),
        EVIDENCE_STATES.FAILING,
      );
    });

    it('when ok is true but failures array is non-empty', () => {
      assert.equal(
        classifyEvidenceMetric('certified_30_learner_beta', freshMetric({ ok: true, failures: ['max5xx'] }), FRESH, NOW),
        EVIDENCE_STATES.FAILING,
      );
    });

    it('when ok is false and failures array is non-empty', () => {
      assert.equal(
        classifyEvidenceMetric('smoke_pass', freshMetric({ ok: false, failures: ['latency', 'error_rate'] }), FRESH, NOW),
        EVIDENCE_STATES.FAILING,
      );
    });
  });

  describe('returns correct passing state by tier key', () => {
    it('smoke_pass → SMOKE_PASS', () => {
      assert.equal(
        classifyEvidenceMetric('smoke_pass', freshMetric({ ok: true, failures: [] }), FRESH, NOW),
        EVIDENCE_STATES.SMOKE_PASS,
      );
    });

    it('small_pilot_provisional → SMALL_PILOT_PROVISIONAL', () => {
      assert.equal(
        classifyEvidenceMetric('small_pilot_provisional', freshMetric({ ok: true, failures: [] }), FRESH, NOW),
        EVIDENCE_STATES.SMALL_PILOT_PROVISIONAL,
      );
    });

    it('certified_30_learner_beta → CERTIFIED_30', () => {
      assert.equal(
        classifyEvidenceMetric('certified_30_learner_beta', freshMetric({ ok: true, certifying: true, failures: [] }), FRESH, NOW),
        EVIDENCE_STATES.CERTIFIED_30,
      );
    });

    it('certified_60_learner_stretch → CERTIFIED_60', () => {
      assert.equal(
        classifyEvidenceMetric('certified_60_learner_stretch', freshMetric({ ok: true, certifying: true, failures: [] }), FRESH, NOW),
        EVIDENCE_STATES.CERTIFIED_60,
      );
    });

    it('certified_100_plus → CERTIFIED_100', () => {
      assert.equal(
        classifyEvidenceMetric('certified_100_plus', freshMetric({ ok: true, certifying: true, failures: [] }), FRESH, NOW),
        EVIDENCE_STATES.CERTIFIED_100,
      );
    });

    it('certification tiers without positive certifying proof → NON_CERTIFYING', () => {
      assert.equal(
        classifyEvidenceMetric('certified_30_learner_beta', freshMetric({ ok: true, failures: [] }), FRESH, NOW),
        EVIDENCE_STATES.NON_CERTIFYING,
      );
    });
  });

  describe('returns UNKNOWN for unrecognised tier key', () => {
    it('unknown key with valid passing metric', () => {
      assert.equal(
        classifyEvidenceMetric('totally_new_tier', freshMetric({ ok: true, failures: [] }), FRESH, NOW),
        EVIDENCE_STATES.UNKNOWN,
      );
    });

    it('empty string key with valid passing metric', () => {
      assert.equal(
        classifyEvidenceMetric('', freshMetric({ ok: true, failures: [] }), FRESH, NOW),
        EVIDENCE_STATES.UNKNOWN,
      );
    });
  });

  describe('boundary: freshness threshold is exclusive (> not >=)', () => {
    it('exactly at threshold is NOT stale', () => {
      const atBoundary = new Date(NOW - EVIDENCE_FRESH_THRESHOLD_MS).toISOString();
      // ageMs === EVIDENCE_FRESH_THRESHOLD_MS, condition is > so NOT stale
      assert.notEqual(
        classifyEvidenceMetric('smoke_pass', freshMetric({ finishedAt: atBoundary, ok: true, failures: [] }), FRESH, NOW),
        EVIDENCE_STATES.STALE,
      );
    });

    it('1ms past threshold IS stale', () => {
      const pastBoundary = new Date(NOW - EVIDENCE_FRESH_THRESHOLD_MS - 1).toISOString();
      assert.equal(
        classifyEvidenceMetric('smoke_pass', freshMetric({ finishedAt: pastBoundary, ok: true, failures: [] }), FRESH, NOW),
        EVIDENCE_STATES.STALE,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// buildEvidencePanelModel
// ---------------------------------------------------------------------------

describe('buildEvidencePanelModel', () => {
  const NOW = 1_700_000_000_000;
  const FRESH = new Date(NOW - 60_000).toISOString();
  const STALE_DATE = new Date(NOW - EVIDENCE_FRESH_THRESHOLD_MS - 1000).toISOString();
  const freshMetric = (overrides = {}) => ({ finishedAt: FRESH, ...overrides });

  describe('with empty/null/malformed input', () => {
    it('null → empty metrics, null generatedAt, overallState=NOT_AVAILABLE', () => {
      const result = buildEvidencePanelModel(null, NOW);
      assert.deepEqual(result.metrics, []);
      assert.equal(result.generatedAt, null);
      assert.equal(result.isFresh, false);
      assert.equal(result.overallState, EVIDENCE_STATES.NOT_AVAILABLE);
    });

    it('undefined → same as null', () => {
      const result = buildEvidencePanelModel(undefined, NOW);
      assert.deepEqual(result.metrics, []);
      assert.equal(result.generatedAt, null);
      assert.equal(result.isFresh, false);
      assert.equal(result.overallState, EVIDENCE_STATES.NOT_AVAILABLE);
    });

    it('empty object {} → same as null', () => {
      const result = buildEvidencePanelModel({}, NOW);
      assert.deepEqual(result.metrics, []);
      assert.equal(result.generatedAt, null);
      assert.equal(result.isFresh, false);
      assert.equal(result.overallState, EVIDENCE_STATES.NOT_AVAILABLE);
    });

    it('schema:2, metrics:{}, generatedAt:null → empty, not available', () => {
      const result = buildEvidencePanelModel({ schema: 2, metrics: {}, generatedAt: null }, NOW);
      assert.deepEqual(result.metrics, []);
      assert.equal(result.generatedAt, null);
      assert.equal(result.isFresh, false);
      assert.equal(result.overallState, EVIDENCE_STATES.NOT_AVAILABLE);
    });

    it('string input is treated as empty (not an object)', () => {
      const result = buildEvidencePanelModel('not an object', NOW);
      assert.deepEqual(result.metrics, []);
      assert.equal(result.generatedAt, null);
      assert.equal(result.isFresh, false);
    });
  });

  describe('with fresh summary containing a passing smoke tier', () => {
    it('classifies metric, reports fresh, overall = SMOKE_PASS', () => {
      const summary = {
        schema: 2,
        generatedAt: FRESH,
        metrics: {
          smoke_pass: {
            tier: 'smoke_pass',
            ok: true,
            dryRun: false,
            learners: 1,
            finishedAt: FRESH,
            commit: 'abc1234',
            failures: [],
            fileName: 'smoke-v1.json',
          },
        },
      };
      const result = buildEvidencePanelModel(summary, NOW);
      assert.equal(result.isFresh, true);
      assert.equal(result.generatedAt, FRESH);
      assert.equal(result.metrics.length, 1);

      const m = result.metrics[0];
      assert.equal(m.key, 'smoke_pass');
      assert.equal(m.tier, 'smoke_pass');
      assert.equal(m.state, EVIDENCE_STATES.SMOKE_PASS);
      assert.equal(m.ok, true);
      assert.equal(m.learners, 1);
      assert.equal(m.finishedAt, FRESH);
      assert.equal(m.commit, 'abc1234');
      assert.deepEqual(m.failures, []);
      assert.equal(m.fileName, 'smoke-v1.json');

      assert.equal(result.overallState, EVIDENCE_STATES.SMOKE_PASS);
    });
  });

  describe('with multiple tiers', () => {
    it('overall state is highest passing tier', () => {
      const summary = {
        schema: 2,
        generatedAt: FRESH,
        metrics: {
          smoke_pass: freshMetric({ tier: 'smoke_pass', ok: true, failures: [] }),
          certified_60_learner_stretch: freshMetric({ tier: 'certified_60_learner_stretch', ok: true, certifying: true, failures: [] }),
          certified_30_learner_beta: freshMetric({ tier: 'certified_30_learner_beta', ok: true, certifying: true, failures: [] }),
        },
      };
      const result = buildEvidencePanelModel(summary, NOW);
      assert.equal(result.metrics.length, 3);
      assert.equal(result.overallState, EVIDENCE_STATES.CERTIFIED_60);
    });

    it('one failing + one passing → overall is the passing tier (higher ranked)', () => {
      const summary = {
        schema: 2,
        generatedAt: FRESH,
        metrics: {
          certified_60_learner_stretch: freshMetric({ tier: 'certified_60_learner_stretch', ok: true, certifying: true, failures: [] }),
          certified_30_learner_beta: freshMetric({ tier: 'certified_30_learner_beta', ok: false, failures: ['err'] }),
        },
      };
      const result = buildEvidencePanelModel(summary, NOW);
      // CERTIFIED_60 rank 6 > FAILING rank 1, so overall = CERTIFIED_60
      assert.equal(result.overallState, EVIDENCE_STATES.CERTIFIED_60);
    });

    it('all failing → overall is FAILING', () => {
      const summary = {
        schema: 2,
        generatedAt: FRESH,
        metrics: {
          smoke_pass: freshMetric({ tier: 'smoke_pass', ok: false, failures: ['x'] }),
          certified_30_learner_beta: freshMetric({ tier: 'certified_30_learner_beta', ok: false, failures: ['y'] }),
        },
      };
      const result = buildEvidencePanelModel(summary, NOW);
      assert.equal(result.overallState, EVIDENCE_STATES.FAILING);
    });

    it('all unknown auxiliary metrics do not drive the capacity overall state', () => {
      const summary = {
        schema: 2,
        generatedAt: FRESH,
        metrics: {
          some_new_tier: freshMetric({ tier: 'some_new_tier', ok: true, failures: [] }),
          another_tier: freshMetric({ tier: 'another_tier', ok: false, failures: ['z'] }),
        },
      };
      const result = buildEvidencePanelModel(summary, NOW);
      assert.equal(result.isFresh, false);
      assert.equal(result.latestEvidenceAt, null);
      assert.equal(result.overallState, EVIDENCE_STATES.NOT_AVAILABLE);
    });
  });

  describe('stale evidence run', () => {
    it('overall is STALE regardless of passing metrics', () => {
      const summary = {
        schema: 2,
        generatedAt: FRESH,
        metrics: {
          certified_100_plus: { tier: 'certified_100_plus', ok: true, certifying: true, failures: [], finishedAt: STALE_DATE },
        },
      };
      const result = buildEvidencePanelModel(summary, NOW);
      assert.equal(result.isFresh, false);
      assert.equal(result.overallState, EVIDENCE_STATES.STALE);
    });
  });

  describe('metric shape — missing optional fields use defaults', () => {
    it('missing tier falls back to key', () => {
      const summary = {
        schema: 2,
        generatedAt: FRESH,
        metrics: {
          smoke_pass: { ok: true, failures: [] },
        },
      };
      const result = buildEvidencePanelModel(summary, NOW);
      assert.equal(result.metrics[0].tier, 'smoke_pass'); // falls back to key
    });

    it('missing learners becomes null', () => {
      const summary = {
        schema: 2,
        generatedAt: FRESH,
        metrics: {
          smoke_pass: { ok: true, failures: [] },
        },
      };
      const result = buildEvidencePanelModel(summary, NOW);
      assert.equal(result.metrics[0].learners, null);
    });

    it('missing finishedAt becomes null', () => {
      const summary = {
        schema: 2,
        generatedAt: FRESH,
        metrics: {
          smoke_pass: { ok: true, failures: [] },
        },
      };
      const result = buildEvidencePanelModel(summary, NOW);
      assert.equal(result.metrics[0].finishedAt, null);
    });

    it('missing commit becomes null', () => {
      const summary = {
        schema: 2,
        generatedAt: FRESH,
        metrics: {
          smoke_pass: { ok: true, failures: [] },
        },
      };
      const result = buildEvidencePanelModel(summary, NOW);
      assert.equal(result.metrics[0].commit, null);
    });

    it('missing fileName becomes null', () => {
      const summary = {
        schema: 2,
        generatedAt: FRESH,
        metrics: {
          smoke_pass: { ok: true, failures: [] },
        },
      };
      const result = buildEvidencePanelModel(summary, NOW);
      assert.equal(result.metrics[0].fileName, null);
    });

    it('non-array failures becomes empty array', () => {
      const summary = {
        schema: 2,
        generatedAt: FRESH,
        metrics: {
          smoke_pass: { ok: true, failures: 'not-array' },
        },
      };
      const result = buildEvidencePanelModel(summary, NOW);
      assert.deepEqual(result.metrics[0].failures, []);
    });
  });

  describe('fresh + empty metrics → NOT_AVAILABLE overall', () => {
    it('returns NOT_AVAILABLE when metrics object is empty but summary is fresh', () => {
      const summary = {
        schema: 2,
        generatedAt: FRESH,
        metrics: {},
      };
      const result = buildEvidencePanelModel(summary, NOW);
      assert.equal(result.isFresh, false);
      assert.deepEqual(result.metrics, []);
      assert.equal(result.overallState, EVIDENCE_STATES.NOT_AVAILABLE);
    });
  });
});
