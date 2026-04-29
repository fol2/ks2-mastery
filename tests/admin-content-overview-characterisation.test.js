// U9 (Admin Console P6): characterisation test suite for admin-content-overview.
//
// Purpose: pin the current behaviour of the pure content-overview normaliser
// and helper functions so that subsequent refactoring or P6 units are
// regression-safe. Tests exercise the exported functions directly without
// needing DOM or SSR harness since the module is a pure logic leaf.
//
// Scenarios:
//   1. buildSubjectContentOverview — multiple subjects (live, gated, placeholder)
//   2. buildSubjectContentOverview — single subject model
//   3. buildSubjectContentOverview — empty/minimal payload
//   4. buildSubjectContentOverview — sorts by lifecycle priority
//   5. normaliseSubjectStatus — valid envelope passes through
//   6. normaliseSubjectStatus — missing/invalid fields default safely
//   7. normaliseSubjectStatus — null/undefined input
//   8. normaliseSubjectStatus — numeric releaseVersion coercion
//   9. deriveDrilldownAction — known subjects with panel mappings
//  10. deriveDrilldownAction — placeholder always returns 'placeholder'
//  11. deriveDrilldownAction — unknown subject returns 'none'
//  12. drilldownPanelSelector — diagnostics action produces data-panel selector
//  13. drilldownPanelSelector — none/placeholder returns null
//  14. statusBadgeClass — maps statuses to CSS suffixes
//  15. statusLabel — maps statuses to human-readable labels

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSubjectContentOverview,
  normaliseSubjectStatus,
  deriveDrilldownAction,
  drilldownPanelSelector,
  statusBadgeClass,
  statusLabel,
} from '../src/platform/hubs/admin-content-overview.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const LIVE_SPELLING = {
  subjectKey: 'spelling',
  displayName: 'Spelling',
  status: 'live',
  releaseVersion: '2.4.1',
  validationErrors: 0,
  errorCount7d: 3,
  supportLoadSignal: 'low',
};

const GATED_GRAMMAR = {
  subjectKey: 'grammar',
  displayName: 'Grammar',
  status: 'gated',
  releaseVersion: '1.0.0',
  validationErrors: 2,
  errorCount7d: 0,
  supportLoadSignal: 'medium',
};

const PLACEHOLDER_SCIENCE = {
  subjectKey: 'science',
  displayName: 'Science',
  status: 'placeholder',
  releaseVersion: null,
  validationErrors: 0,
  errorCount7d: 0,
  supportLoadSignal: 'none',
};

const LIVE_PUNCTUATION = {
  subjectKey: 'punctuation',
  displayName: 'Punctuation',
  status: 'live',
  releaseVersion: '3.1.0',
  validationErrors: 1,
  errorCount7d: 12,
  supportLoadSignal: 'high',
};

// ─── buildSubjectContentOverview ─────────────────────────────────────────────

describe('buildSubjectContentOverview', () => {
  it('normalises and returns multiple subjects from payload', () => {
    const payload = { subjects: [LIVE_SPELLING, GATED_GRAMMAR, PLACEHOLDER_SCIENCE] };
    const result = buildSubjectContentOverview(payload);

    assert.equal(result.length, 3);
    assert.equal(result[0].subjectKey, 'spelling');
    assert.equal(result[1].subjectKey, 'grammar');
    assert.equal(result[2].subjectKey, 'science');
  });

  it('sorts live before gated before placeholder', () => {
    // Input in reverse order: placeholder, gated, live
    const payload = { subjects: [PLACEHOLDER_SCIENCE, GATED_GRAMMAR, LIVE_SPELLING] };
    const result = buildSubjectContentOverview(payload);

    assert.equal(result[0].status, 'live');
    assert.equal(result[1].status, 'gated');
    assert.equal(result[2].status, 'placeholder');
  });

  it('preserves within-group order when multiple subjects share same status', () => {
    const payload = { subjects: [LIVE_PUNCTUATION, PLACEHOLDER_SCIENCE, LIVE_SPELLING] };
    const result = buildSubjectContentOverview(payload);

    // Both live subjects retain their relative order
    assert.equal(result[0].subjectKey, 'punctuation');
    assert.equal(result[1].subjectKey, 'spelling');
    assert.equal(result[2].subjectKey, 'science');
  });

  it('handles single-subject payload', () => {
    const payload = { subjects: [LIVE_SPELLING] };
    const result = buildSubjectContentOverview(payload);

    assert.equal(result.length, 1);
    assert.equal(result[0].subjectKey, 'spelling');
    assert.equal(result[0].displayName, 'Spelling');
  });

  it('returns empty array for empty subjects list', () => {
    const result = buildSubjectContentOverview({ subjects: [] });
    assert.deepEqual(result, []);
  });

  it('returns empty array for null payload', () => {
    const result = buildSubjectContentOverview(null);
    assert.deepEqual(result, []);
  });

  it('returns empty array for undefined payload', () => {
    const result = buildSubjectContentOverview(undefined);
    assert.deepEqual(result, []);
  });

  it('returns empty array when subjects key is missing', () => {
    const result = buildSubjectContentOverview({});
    assert.deepEqual(result, []);
  });

  it('returns empty array when subjects is not an array', () => {
    const result = buildSubjectContentOverview({ subjects: 'not-an-array' });
    assert.deepEqual(result, []);
  });

  it('attaches drilldownAction to each entry', () => {
    const payload = { subjects: [LIVE_SPELLING, GATED_GRAMMAR, PLACEHOLDER_SCIENCE] };
    const result = buildSubjectContentOverview(payload);

    assert.equal(result[0].drilldownAction, 'diagnostics'); // spelling
    assert.equal(result[1].drilldownAction, 'diagnostics'); // grammar
    assert.equal(result[2].drilldownAction, 'placeholder'); // science
  });

  it('assigns drilldownAction "none" for unknown live subject', () => {
    const unknownLive = { ...LIVE_SPELLING, subjectKey: 'maths', displayName: 'Maths' };
    const payload = { subjects: [unknownLive] };
    const result = buildSubjectContentOverview(payload);

    assert.equal(result[0].drilldownAction, 'none');
  });
});

// ─── normaliseSubjectStatus ──────────────────────────────────────────────────

describe('normaliseSubjectStatus', () => {
  it('passes through a valid envelope with correct types', () => {
    const result = normaliseSubjectStatus(LIVE_SPELLING);

    assert.equal(result.subjectKey, 'spelling');
    assert.equal(result.displayName, 'Spelling');
    assert.equal(result.status, 'live');
    assert.equal(result.releaseVersion, '2.4.1');
    assert.equal(result.validationErrors, 0);
    assert.equal(result.errorCount7d, 3);
    assert.equal(result.supportLoadSignal, 'low');
  });

  it('defaults status to placeholder for invalid status value', () => {
    const result = normaliseSubjectStatus({ ...LIVE_SPELLING, status: 'invalid' });
    assert.equal(result.status, 'placeholder');
  });

  it('defaults supportLoadSignal to none for invalid signal', () => {
    const result = normaliseSubjectStatus({ ...LIVE_SPELLING, supportLoadSignal: 'extreme' });
    assert.equal(result.supportLoadSignal, 'none');
  });

  it('coerces numeric releaseVersion to string', () => {
    const result = normaliseSubjectStatus({ ...LIVE_SPELLING, releaseVersion: 5 });
    assert.equal(result.releaseVersion, '5');
  });

  it('returns null releaseVersion for zero numeric', () => {
    const result = normaliseSubjectStatus({ ...LIVE_SPELLING, releaseVersion: 0 });
    assert.equal(result.releaseVersion, null);
  });

  it('returns null releaseVersion for negative numeric', () => {
    const result = normaliseSubjectStatus({ ...LIVE_SPELLING, releaseVersion: -1 });
    assert.equal(result.releaseVersion, null);
  });

  it('returns null releaseVersion for empty string', () => {
    const result = normaliseSubjectStatus({ ...LIVE_SPELLING, releaseVersion: '' });
    assert.equal(result.releaseVersion, null);
  });

  it('returns null releaseVersion for null', () => {
    const result = normaliseSubjectStatus({ ...LIVE_SPELLING, releaseVersion: null });
    assert.equal(result.releaseVersion, null);
  });

  it('defaults subjectKey to "unknown" for missing key', () => {
    const result = normaliseSubjectStatus({});
    assert.equal(result.subjectKey, 'unknown');
  });

  it('defaults displayName to subjectKey when displayName is absent', () => {
    const result = normaliseSubjectStatus({ subjectKey: 'maths' });
    assert.equal(result.displayName, 'maths');
  });

  it('defaults displayName to "Unknown" when both are absent', () => {
    const result = normaliseSubjectStatus({});
    assert.equal(result.displayName, 'Unknown');
  });

  it('coerces validationErrors from string to number', () => {
    const result = normaliseSubjectStatus({ ...LIVE_SPELLING, validationErrors: '7' });
    assert.equal(result.validationErrors, 7);
  });

  it('defaults validationErrors to 0 for negative value', () => {
    const result = normaliseSubjectStatus({ ...LIVE_SPELLING, validationErrors: -3 });
    assert.equal(result.validationErrors, 0);
  });

  it('defaults errorCount7d to 0 for NaN', () => {
    const result = normaliseSubjectStatus({ ...LIVE_SPELLING, errorCount7d: 'abc' });
    assert.equal(result.errorCount7d, 0);
  });

  it('returns safe defaults for null input', () => {
    const result = normaliseSubjectStatus(null);

    assert.equal(result.subjectKey, 'unknown');
    assert.equal(result.displayName, 'Unknown');
    assert.equal(result.status, 'placeholder');
    assert.equal(result.releaseVersion, null);
    assert.equal(result.validationErrors, 0);
    assert.equal(result.errorCount7d, 0);
    assert.equal(result.supportLoadSignal, 'none');
  });

  it('returns safe defaults for undefined input', () => {
    const result = normaliseSubjectStatus(undefined);

    assert.equal(result.subjectKey, 'unknown');
    assert.equal(result.status, 'placeholder');
  });

  it('returns safe defaults for array input', () => {
    const result = normaliseSubjectStatus([1, 2, 3]);

    assert.equal(result.subjectKey, 'unknown');
    assert.equal(result.status, 'placeholder');
  });
});

// ─── deriveDrilldownAction ───────────────────────────────────────────────────

describe('deriveDrilldownAction', () => {
  it('returns "diagnostics" for spelling', () => {
    const entry = { subjectKey: 'spelling', status: 'live' };
    assert.equal(deriveDrilldownAction(entry), 'diagnostics');
  });

  it('returns "diagnostics" for grammar', () => {
    const entry = { subjectKey: 'grammar', status: 'gated' };
    assert.equal(deriveDrilldownAction(entry), 'diagnostics');
  });

  it('returns "placeholder" when status is placeholder regardless of subjectKey', () => {
    const entry = { subjectKey: 'spelling', status: 'placeholder' };
    assert.equal(deriveDrilldownAction(entry), 'placeholder');
  });

  it('returns "none" for unknown subject with live status', () => {
    const entry = { subjectKey: 'history', status: 'live' };
    assert.equal(deriveDrilldownAction(entry), 'none');
  });

  it('returns "none" for unknown subject with gated status', () => {
    const entry = { subjectKey: 'geography', status: 'gated' };
    assert.equal(deriveDrilldownAction(entry), 'none');
  });
});

// ─── drilldownPanelSelector ──────────────────────────────────────────────────

describe('drilldownPanelSelector', () => {
  it('returns spelling diagnostics panel selector', () => {
    const entry = { subjectKey: 'spelling', drilldownAction: 'diagnostics' };
    assert.equal(drilldownPanelSelector(entry), '[data-panel="post-mega-spelling-debug"]');
  });

  it('returns grammar diagnostics panel selector', () => {
    const entry = { subjectKey: 'grammar', drilldownAction: 'diagnostics' };
    assert.equal(drilldownPanelSelector(entry), '[data-panel="grammar-concept-confidence"]');
  });

  it('returns null for diagnostics action with unknown subject', () => {
    const entry = { subjectKey: 'maths', drilldownAction: 'diagnostics' };
    assert.equal(drilldownPanelSelector(entry), null);
  });

  it('returns asset-registry panel selector for asset_registry action', () => {
    const entry = { subjectKey: 'anything', drilldownAction: 'asset_registry' };
    assert.equal(drilldownPanelSelector(entry), '[data-panel="asset-registry"]');
  });

  it('returns content-release panel selector for content_release action', () => {
    const entry = { subjectKey: 'anything', drilldownAction: 'content_release' };
    assert.equal(drilldownPanelSelector(entry), '[data-panel="content-release"]');
  });

  it('returns null for "none" action', () => {
    const entry = { subjectKey: 'anything', drilldownAction: 'none' };
    assert.equal(drilldownPanelSelector(entry), null);
  });

  it('returns null for "placeholder" action', () => {
    const entry = { subjectKey: 'science', drilldownAction: 'placeholder' };
    assert.equal(drilldownPanelSelector(entry), null);
  });
});

// ─── statusBadgeClass ────────────────────────────────────────────────────────

describe('statusBadgeClass', () => {
  it('returns "good" for live', () => {
    assert.equal(statusBadgeClass('live'), 'good');
  });

  it('returns "warn" for gated', () => {
    assert.equal(statusBadgeClass('gated'), 'warn');
  });

  it('returns empty string for placeholder', () => {
    assert.equal(statusBadgeClass('placeholder'), '');
  });

  it('returns empty string for unknown status', () => {
    assert.equal(statusBadgeClass('other'), '');
  });
});

// ─── statusLabel ─────────────────────────────────────────────────────────────

describe('statusLabel', () => {
  it('returns "Live" for live', () => {
    assert.equal(statusLabel('live'), 'Live');
  });

  it('returns "Gated" for gated', () => {
    assert.equal(statusLabel('gated'), 'Gated');
  });

  it('returns "Placeholder" for placeholder', () => {
    assert.equal(statusLabel('placeholder'), 'Placeholder');
  });

  it('returns "Placeholder" for unknown status', () => {
    assert.equal(statusLabel('anything'), 'Placeholder');
  });
});
