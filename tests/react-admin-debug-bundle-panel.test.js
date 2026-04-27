// U6 (P3): Client-side Debug Bundle panel test suite.
//
// Validates the content-free leaf normaliser in
// `src/platform/hubs/admin-debug-bundle-panel.js`.
//
// Test scenarios:
//   1. normaliseDebugBundleResponse — happy path full payload
//   2. normaliseDebugBundleResponse — empty / missing fields
//   3. normaliseBundle — all sections normalised
//   4. isSectionEmpty — array and object sections
//   5. formatBundleTimestamp — valid and invalid timestamps
//   6. BUNDLE_SECTIONS — complete set of section keys
//   7. normaliseDebugBundleResponse — ops role flags
//   8. normaliseBundle — null sections

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normaliseDebugBundleResponse,
  normaliseBundle,
  isSectionEmpty,
  formatBundleTimestamp,
  BUNDLE_SECTIONS,
  BUNDLE_SECTION_LABELS,
} from '../src/platform/hubs/admin-debug-bundle-panel.js';

// =================================================================
// 1. normaliseDebugBundleResponse — happy path
// =================================================================

test('normaliseDebugBundleResponse normalises full payload', () => {
  const raw = {
    ok: true,
    bundle: {
      generatedAt: 1700000000000,
      query: { accountId: 'acct-1', learnerId: null, timeFrom: 1000, timeTo: 2000 },
      buildHash: 'abc1234',
      accountSummary: {
        accountId: 'acct-1',
        email: 'test@test.com',
        displayName: 'Test',
        platformRole: 'admin',
        accountType: 'real',
        createdAt: 1000,
        updatedAt: 2000,
      },
      linkedLearners: [
        { learnerId: 'lrn-1', learnerName: 'Alice', yearGroup: 'Year 4', membershipRole: 'owner' },
      ],
      recentErrors: [
        { id: 'e1', fingerprint: 'fp-1', errorKind: 'TypeError', status: 'open', occurrenceCount: 3 },
      ],
      errorOccurrences: [
        { id: 'o1', eventId: 'fp-1', occurredAt: 1500, routeName: '/api/test' },
      ],
      recentDenials: [
        { id: 'd1', deniedAt: 1200, denialReason: 'rate_limit_exceeded' },
      ],
      recentMutations: [
        { requestId: 'r1', mutationKind: 'update-role', appliedAt: 1300 },
      ],
      capacityState: [
        { metricKey: 'total_accounts', metricCount: 42, updatedAt: 1400 },
      ],
    },
    humanSummary: 'Debug Bundle summary...',
    actorRole: 'admin',
    canExportJson: true,
  };

  const result = normaliseDebugBundleResponse(raw);

  assert.equal(result.ok, true);
  assert.equal(result.canExportJson, true);
  assert.equal(result.actorRole, 'admin');
  assert.equal(result.humanSummary, 'Debug Bundle summary...');
  assert.equal(result.bundle.generatedAt, 1700000000000);
  assert.equal(result.bundle.buildHash, 'abc1234');
  assert.equal(result.bundle.accountSummary.accountId, 'acct-1');
  assert.equal(result.bundle.linkedLearners.length, 1);
  assert.equal(result.bundle.recentErrors.length, 1);
  assert.equal(result.bundle.recentErrors[0].occurrenceCount, 3);
  assert.equal(result.bundle.errorOccurrences.length, 1);
  assert.equal(result.bundle.recentDenials.length, 1);
  assert.equal(result.bundle.recentMutations.length, 1);
  assert.equal(result.bundle.capacityState.length, 1);
});

// =================================================================
// 2. normaliseDebugBundleResponse — empty / missing fields
// =================================================================

test('normaliseDebugBundleResponse handles empty payload', () => {
  const result = normaliseDebugBundleResponse({});

  assert.equal(result.ok, false);
  assert.equal(result.canExportJson, false);
  assert.equal(result.actorRole, 'ops');
  assert.equal(result.humanSummary, '');
  assert.equal(result.bundle.generatedAt, 0);
  assert.equal(result.bundle.accountSummary, null);
  assert.equal(result.bundle.linkedLearners.length, 0);
  assert.equal(result.bundle.recentErrors.length, 0);
});

test('normaliseDebugBundleResponse handles null', () => {
  const result = normaliseDebugBundleResponse(null);
  assert.equal(result.ok, false);
  assert.equal(result.bundle.generatedAt, 0);
});

// =================================================================
// 3. normaliseBundle — all sections normalised
// =================================================================

test('normaliseBundle normalises all section types', () => {
  const raw = {
    generatedAt: 1000,
    query: { accountId: 'a', learnerId: 'b', timeFrom: 100, timeTo: 200, errorFingerprint: 'fp', route: '/api' },
    accountSummary: { accountId: 'a', email: 'e@e.com', displayName: 'D', platformRole: 'admin', accountType: 'real', createdAt: 10, updatedAt: 20 },
    linkedLearners: [{ learnerId: 'l1', learnerName: 'L', yearGroup: 'Y4', membershipRole: 'owner', accessMode: 'rw' }],
    recentErrors: [{ id: 'e1', fingerprint: 'f1', errorKind: 'E', messageFirstLine: 'M', firstFrame: 'F', routeName: 'R', accountId: 'A', firstSeen: 1, lastSeen: 2, occurrenceCount: 5, status: 'open' }],
    errorOccurrences: [{ id: 'o1', eventId: 'ev1', occurredAt: 3, release: 'r1', routeName: 'R', accountId: 'A' }],
    recentDenials: [{ id: 'd1', deniedAt: 4, denialReason: 'dr', routeName: 'R', accountId: 'A', isDemo: true, release: 'r2' }],
    recentMutations: [{ requestId: 'rq1', mutationKind: 'mk', scopeType: 'st', scopeId: 'si', appliedAt: 5, accountId: 'A' }],
    capacityState: [{ metricKey: 'k1', metricCount: 10, updatedAt: 6 }],
  };

  const result = normaliseBundle(raw);

  assert.equal(result.query.accountId, 'a');
  assert.equal(result.query.errorFingerprint, 'fp');
  assert.equal(result.linkedLearners[0].accessMode, 'rw');
  assert.equal(result.recentErrors[0].occurrenceCount, 5);
  assert.equal(result.errorOccurrences[0].release, 'r1');
  assert.equal(result.recentDenials[0].isDemo, true);
  assert.equal(result.recentMutations[0].mutationKind, 'mk');
  assert.equal(result.capacityState[0].metricCount, 10);
});

// =================================================================
// 4. isSectionEmpty
// =================================================================

test('isSectionEmpty — null and empty', () => {
  assert.equal(isSectionEmpty({ accountSummary: null }, 'accountSummary'), true);
  assert.equal(isSectionEmpty({ linkedLearners: [] }, 'linkedLearners'), true);
  assert.equal(isSectionEmpty({ linkedLearners: [{ id: '1' }] }, 'linkedLearners'), false);
  assert.equal(isSectionEmpty({ accountSummary: { id: '1' } }, 'accountSummary'), false);
  assert.equal(isSectionEmpty({}, 'missing'), true);
});

// =================================================================
// 5. formatBundleTimestamp
// =================================================================

test('formatBundleTimestamp formats valid timestamps', () => {
  const result = formatBundleTimestamp(1700000000000);
  assert.ok(result.includes('2023'), 'year present');
  assert.ok(result.includes('UTC') || result.includes('Z') || result.includes(':'), 'time present');
});

test('formatBundleTimestamp returns dash for invalid values', () => {
  assert.equal(formatBundleTimestamp(null), '—');
  assert.equal(formatBundleTimestamp(0), '—');
  assert.equal(formatBundleTimestamp(-1), '—');
  assert.equal(formatBundleTimestamp(NaN), '—');
  assert.equal(formatBundleTimestamp('bad'), '—');
});

// =================================================================
// 6. BUNDLE_SECTIONS is complete
// =================================================================

test('BUNDLE_SECTIONS contains expected keys', () => {
  assert.ok(BUNDLE_SECTIONS.includes('accountSummary'));
  assert.ok(BUNDLE_SECTIONS.includes('linkedLearners'));
  assert.ok(BUNDLE_SECTIONS.includes('recentErrors'));
  assert.ok(BUNDLE_SECTIONS.includes('errorOccurrences'));
  assert.ok(BUNDLE_SECTIONS.includes('recentDenials'));
  assert.ok(BUNDLE_SECTIONS.includes('recentMutations'));
  assert.ok(BUNDLE_SECTIONS.includes('capacityState'));

  // Every section has a label.
  for (const key of BUNDLE_SECTIONS) {
    assert.ok(typeof BUNDLE_SECTION_LABELS[key] === 'string' && BUNDLE_SECTION_LABELS[key].length > 0,
      `label for ${key} exists`);
  }
});

// =================================================================
// 7. normaliseDebugBundleResponse — ops flags
// =================================================================

test('normaliseDebugBundleResponse reflects ops role', () => {
  const raw = {
    ok: true,
    bundle: { generatedAt: 1000 },
    actorRole: 'ops',
    canExportJson: false,
  };

  const result = normaliseDebugBundleResponse(raw);
  assert.equal(result.actorRole, 'ops');
  assert.equal(result.canExportJson, false);
});

// =================================================================
// 8. normaliseBundle — null sections become empty arrays
// =================================================================

test('normaliseBundle converts null arrays to empty', () => {
  const result = normaliseBundle({
    generatedAt: 1000,
    linkedLearners: null,
    recentErrors: undefined,
    recentDenials: 'not-an-array',
  });

  assert.equal(result.linkedLearners.length, 0);
  assert.equal(result.recentErrors.length, 0);
  assert.equal(result.recentDenials.length, 0);
});

// =================================================================
// 9. normaliseBundle — occurrenceCount minimum is 1
// =================================================================

test('normaliseBundle clamps occurrenceCount to minimum 1', () => {
  const result = normaliseBundle({
    recentErrors: [{ id: 'e1', occurrenceCount: 0 }],
  });

  assert.equal(result.recentErrors[0].occurrenceCount, 1);
});
