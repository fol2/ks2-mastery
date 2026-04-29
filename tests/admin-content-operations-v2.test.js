// U6 (Admin Console P6): Content operations v2 test suite.
//
// Tests the release readiness classification module, the updated
// buildSubjectContentOverview with new fields, and the truthful
// clickability logic for subject rows.
//
// Scenarios:
//   1. classifyReleaseReadiness — all 4 states
//   2. buildReleaseReadinessModel — mixed subjects
//   3. buildSubjectContentOverview — includes releaseReadiness + isClickable
//   4. Non-clickable placeholder subjects
//   5. Subjects with blockers show BLOCKED state
//   6. readinessBadge — returns correct badge metadata

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyReleaseReadiness,
  buildReleaseReadinessModel,
  readinessBadge,
  RELEASE_READINESS,
} from '../src/platform/hubs/admin-content-release-readiness.js';

import {
  buildSubjectContentOverview,
  normaliseSubjectStatus,
} from '../src/platform/hubs/admin-content-overview.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const LIVE_SPELLING_WITH_BLOCKERS = {
  subjectKey: 'spelling',
  displayName: 'Spelling',
  status: 'live',
  releaseVersion: '2.4.1',
  validationErrors: 2,
  errorCount7d: 3,
  supportLoadSignal: 'low',
  validationBlockers: ['Missing audio for word "receipt"', 'Duplicate sentence in unit 5'],
  validationWarnings: ['Long sentence in unit 3'],
  hasRealDiagnostics: true,
  recentErrorCount7d: 3,
};

const LIVE_GRAMMAR_CLEAN = {
  subjectKey: 'grammar',
  displayName: 'Grammar',
  status: 'live',
  releaseVersion: '1.0.0',
  validationErrors: 0,
  errorCount7d: 0,
  supportLoadSignal: 'none',
  validationBlockers: [],
  validationWarnings: [],
  hasRealDiagnostics: true,
  recentErrorCount7d: 0,
};

const LIVE_PUNCTUATION_WARNINGS_ONLY = {
  subjectKey: 'punctuation',
  displayName: 'Punctuation',
  status: 'live',
  releaseVersion: '3.1.0',
  validationErrors: 0,
  errorCount7d: 1,
  supportLoadSignal: 'low',
  validationBlockers: [],
  validationWarnings: ['Deprecated template in unit 7'],
  hasRealDiagnostics: true,
  recentErrorCount7d: 1,
};

const PLACEHOLDER_SCIENCE = {
  subjectKey: 'science',
  displayName: 'Science',
  status: 'placeholder',
  releaseVersion: null,
  validationErrors: 0,
  errorCount7d: 0,
  supportLoadSignal: 'none',
  validationBlockers: [],
  validationWarnings: [],
  hasRealDiagnostics: false,
  recentErrorCount7d: 0,
};

const LIVE_MATHS_NO_DIAGNOSTICS = {
  subjectKey: 'maths',
  displayName: 'Maths',
  status: 'live',
  releaseVersion: null,
  validationErrors: 0,
  errorCount7d: 0,
  supportLoadSignal: 'none',
  validationBlockers: [],
  validationWarnings: [],
  hasRealDiagnostics: false,
  recentErrorCount7d: 0,
};

// ─── classifyReleaseReadiness ───────────────────────────────────────────────

describe('classifyReleaseReadiness', () => {
  it('returns READY when no blockers and no warnings', () => {
    assert.equal(classifyReleaseReadiness(LIVE_GRAMMAR_CLEAN), RELEASE_READINESS.READY);
  });

  it('returns BLOCKED when subject has validation blockers', () => {
    assert.equal(classifyReleaseReadiness(LIVE_SPELLING_WITH_BLOCKERS), RELEASE_READINESS.BLOCKED);
  });

  it('returns WARNINGS_ONLY when subject has warnings but no blockers', () => {
    assert.equal(classifyReleaseReadiness(LIVE_PUNCTUATION_WARNINGS_ONLY), RELEASE_READINESS.WARNINGS_ONLY);
  });

  it('returns NOT_APPLICABLE for placeholder subjects', () => {
    assert.equal(classifyReleaseReadiness(PLACEHOLDER_SCIENCE), RELEASE_READINESS.NOT_APPLICABLE);
  });

  it('returns NOT_APPLICABLE for null input', () => {
    assert.equal(classifyReleaseReadiness(null), RELEASE_READINESS.NOT_APPLICABLE);
  });

  it('returns NOT_APPLICABLE for undefined input', () => {
    assert.equal(classifyReleaseReadiness(undefined), RELEASE_READINESS.NOT_APPLICABLE);
  });

  it('returns NOT_APPLICABLE for array input', () => {
    assert.equal(classifyReleaseReadiness([1, 2]), RELEASE_READINESS.NOT_APPLICABLE);
  });

  it('returns READY when blockers and warnings are missing (defaults to empty)', () => {
    const subject = { status: 'live' };
    assert.equal(classifyReleaseReadiness(subject), RELEASE_READINESS.READY);
  });

  it('blockers take priority over warnings', () => {
    const subject = {
      status: 'gated',
      validationBlockers: ['Critical issue'],
      validationWarnings: ['Minor issue'],
    };
    assert.equal(classifyReleaseReadiness(subject), RELEASE_READINESS.BLOCKED);
  });
});

// ─── buildReleaseReadinessModel ─────────────────────────────────────────────

describe('buildReleaseReadinessModel', () => {
  it('maps mixed subjects to their readiness states', () => {
    const subjects = [
      LIVE_SPELLING_WITH_BLOCKERS,
      LIVE_GRAMMAR_CLEAN,
      LIVE_PUNCTUATION_WARNINGS_ONLY,
      PLACEHOLDER_SCIENCE,
    ];
    const model = buildReleaseReadinessModel(subjects);

    assert.equal(model.length, 4);
    assert.equal(model[0].readiness, RELEASE_READINESS.BLOCKED);
    assert.equal(model[0].subjectKey, 'spelling');
    assert.equal(model[0].blockerCount, 2);
    assert.equal(model[0].warningCount, 1);

    assert.equal(model[1].readiness, RELEASE_READINESS.READY);
    assert.equal(model[1].subjectKey, 'grammar');
    assert.equal(model[1].blockerCount, 0);
    assert.equal(model[1].warningCount, 0);

    assert.equal(model[2].readiness, RELEASE_READINESS.WARNINGS_ONLY);
    assert.equal(model[2].subjectKey, 'punctuation');
    assert.equal(model[2].blockerCount, 0);
    assert.equal(model[2].warningCount, 1);

    assert.equal(model[3].readiness, RELEASE_READINESS.NOT_APPLICABLE);
    assert.equal(model[3].subjectKey, 'science');
  });

  it('returns empty array for non-array input', () => {
    assert.deepEqual(buildReleaseReadinessModel(null), []);
    assert.deepEqual(buildReleaseReadinessModel(undefined), []);
    assert.deepEqual(buildReleaseReadinessModel('not-array'), []);
  });

  it('handles empty array input', () => {
    assert.deepEqual(buildReleaseReadinessModel([]), []);
  });

  it('provides badge metadata for each entry', () => {
    const model = buildReleaseReadinessModel([LIVE_GRAMMAR_CLEAN]);
    assert.equal(model[0].badge.label, 'Ready');
    assert.equal(model[0].badge.chipClass, 'good');
  });

  it('provides BLOCKED badge for subjects with blockers', () => {
    const model = buildReleaseReadinessModel([LIVE_SPELLING_WITH_BLOCKERS]);
    assert.equal(model[0].badge.label, 'Blocked');
    assert.equal(model[0].badge.chipClass, 'bad');
  });
});

// ─── readinessBadge ─────────────────────────────────────────────────────────

describe('readinessBadge', () => {
  it('returns correct badge for READY', () => {
    const badge = readinessBadge(RELEASE_READINESS.READY);
    assert.equal(badge.label, 'Ready');
    assert.equal(badge.chipClass, 'good');
  });

  it('returns correct badge for BLOCKED', () => {
    const badge = readinessBadge(RELEASE_READINESS.BLOCKED);
    assert.equal(badge.label, 'Blocked');
    assert.equal(badge.chipClass, 'bad');
  });

  it('returns correct badge for WARNINGS_ONLY', () => {
    const badge = readinessBadge(RELEASE_READINESS.WARNINGS_ONLY);
    assert.equal(badge.label, 'Warnings');
    assert.equal(badge.chipClass, 'warn');
  });

  it('returns correct badge for NOT_APPLICABLE', () => {
    const badge = readinessBadge(RELEASE_READINESS.NOT_APPLICABLE);
    assert.equal(badge.label, 'N/A');
    assert.equal(badge.chipClass, '');
  });

  it('returns N/A badge for unknown readiness value', () => {
    const badge = readinessBadge('unknown_value');
    assert.equal(badge.label, 'N/A');
    assert.equal(badge.chipClass, '');
  });
});

// ─── buildSubjectContentOverview (P6 extended fields) ───────────────────────

describe('buildSubjectContentOverview — P6 release readiness fields', () => {
  it('includes releaseReadiness on each normalised entry', () => {
    const payload = { subjects: [LIVE_SPELLING_WITH_BLOCKERS, LIVE_GRAMMAR_CLEAN, PLACEHOLDER_SCIENCE] };
    const result = buildSubjectContentOverview(payload);

    assert.equal(result[0].releaseReadiness, RELEASE_READINESS.BLOCKED); // spelling (live, sorted first)
    assert.equal(result[1].releaseReadiness, RELEASE_READINESS.READY); // grammar (live)
    assert.equal(result[2].releaseReadiness, RELEASE_READINESS.NOT_APPLICABLE); // science (placeholder)
  });

  it('includes releaseReadinessBadge object on each entry', () => {
    const payload = { subjects: [LIVE_GRAMMAR_CLEAN] };
    const result = buildSubjectContentOverview(payload);

    assert.equal(result[0].releaseReadinessBadge.label, 'Ready');
    assert.equal(result[0].releaseReadinessBadge.chipClass, 'good');
  });

  it('includes isClickable flag — true for spelling (has diagnostics + panel mapping)', () => {
    const payload = { subjects: [LIVE_SPELLING_WITH_BLOCKERS] };
    const result = buildSubjectContentOverview(payload);

    assert.equal(result[0].isClickable, true);
  });

  it('includes isClickable flag — true for grammar (has diagnostics + panel mapping)', () => {
    const payload = { subjects: [LIVE_GRAMMAR_CLEAN] };
    const result = buildSubjectContentOverview(payload);

    assert.equal(result[0].isClickable, true);
  });

  it('isClickable is false for placeholder subjects regardless of other fields', () => {
    const payload = { subjects: [PLACEHOLDER_SCIENCE] };
    const result = buildSubjectContentOverview(payload);

    assert.equal(result[0].isClickable, false);
  });

  it('isClickable is false for live subjects without real diagnostics', () => {
    const payload = { subjects: [LIVE_MATHS_NO_DIAGNOSTICS] };
    const result = buildSubjectContentOverview(payload);

    assert.equal(result[0].isClickable, false);
  });

  it('isClickable is false for live subjects with diagnostics but no panel mapping', () => {
    // A subject with hasRealDiagnostics=true but no entry in DRILLDOWN_PANEL_MAP
    // gets drilldownAction 'none' so isClickable is false
    const unknownLiveWithDiagnostics = {
      subjectKey: 'geography',
      displayName: 'Geography',
      status: 'live',
      releaseVersion: null,
      validationErrors: 0,
      errorCount7d: 0,
      supportLoadSignal: 'none',
      validationBlockers: [],
      validationWarnings: [],
      hasRealDiagnostics: true,
      recentErrorCount7d: 0,
    };
    const payload = { subjects: [unknownLiveWithDiagnostics] };
    const result = buildSubjectContentOverview(payload);

    assert.equal(result[0].drilldownAction, 'none');
    assert.equal(result[0].isClickable, false);
  });

  it('preserves validationBlockers and validationWarnings arrays', () => {
    const payload = { subjects: [LIVE_SPELLING_WITH_BLOCKERS] };
    const result = buildSubjectContentOverview(payload);

    assert.deepEqual(result[0].validationBlockers, [
      'Missing audio for word "receipt"',
      'Duplicate sentence in unit 5',
    ]);
    assert.deepEqual(result[0].validationWarnings, ['Long sentence in unit 3']);
  });

  it('preserves hasRealDiagnostics boolean', () => {
    const payload = { subjects: [LIVE_GRAMMAR_CLEAN, PLACEHOLDER_SCIENCE] };
    const result = buildSubjectContentOverview(payload);

    assert.equal(result[0].hasRealDiagnostics, true);
    assert.equal(result[1].hasRealDiagnostics, false);
  });
});

// ─── normaliseSubjectStatus (P6 extended fields) ────────────────────────────

describe('normaliseSubjectStatus — P6 validation signal fields', () => {
  it('passes through validationBlockers array', () => {
    const result = normaliseSubjectStatus(LIVE_SPELLING_WITH_BLOCKERS);
    assert.deepEqual(result.validationBlockers, [
      'Missing audio for word "receipt"',
      'Duplicate sentence in unit 5',
    ]);
  });

  it('defaults validationBlockers to empty array when missing', () => {
    const result = normaliseSubjectStatus({ subjectKey: 'test', status: 'live' });
    assert.deepEqual(result.validationBlockers, []);
  });

  it('defaults validationWarnings to empty array when missing', () => {
    const result = normaliseSubjectStatus({ subjectKey: 'test', status: 'live' });
    assert.deepEqual(result.validationWarnings, []);
  });

  it('defaults hasRealDiagnostics to false when missing', () => {
    const result = normaliseSubjectStatus({ subjectKey: 'test', status: 'live' });
    assert.equal(result.hasRealDiagnostics, false);
  });

  it('preserves hasRealDiagnostics true', () => {
    const result = normaliseSubjectStatus(LIVE_GRAMMAR_CLEAN);
    assert.equal(result.hasRealDiagnostics, true);
  });

  it('coerces non-boolean hasRealDiagnostics to false', () => {
    const result = normaliseSubjectStatus({ subjectKey: 'test', status: 'live', hasRealDiagnostics: 'yes' });
    assert.equal(result.hasRealDiagnostics, false);
  });

  it('coerces non-array validationBlockers to empty array', () => {
    const result = normaliseSubjectStatus({ subjectKey: 'test', status: 'live', validationBlockers: 'not-array' });
    assert.deepEqual(result.validationBlockers, []);
  });
});

// ─── RELEASE_READINESS enum ─────────────────────────────────────────────────

describe('RELEASE_READINESS enum', () => {
  it('is frozen', () => {
    assert.ok(Object.isFrozen(RELEASE_READINESS));
  });

  it('has exactly 4 states', () => {
    assert.equal(Object.keys(RELEASE_READINESS).length, 4);
  });

  it('contains expected values', () => {
    assert.equal(RELEASE_READINESS.READY, 'ready');
    assert.equal(RELEASE_READINESS.BLOCKED, 'blocked');
    assert.equal(RELEASE_READINESS.WARNINGS_ONLY, 'warnings_only');
    assert.equal(RELEASE_READINESS.NOT_APPLICABLE, 'not_applicable');
  });
});
