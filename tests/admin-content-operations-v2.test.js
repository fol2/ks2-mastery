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

import { createHubApi } from '../src/platform/hubs/api.js';

import {
  CONTENT_OPERATION_DETAIL_TABS,
  CONTENT_OPERATION_LANES,
  normaliseContentOperationPackage,
  normaliseContentOperationsOverview,
  normaliseContentOperationsPackageDetail,
  normaliseContentOperationsPackageList,
  normaliseContentOperationsReleaseList,
} from '../src/platform/hubs/admin-content-operations.js';

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

// --- Content Operations Centre shell contract ------------------------------

const CONTENT_OPS_PACKAGE = {
  packageId: 'pkg-draft-1',
  subjectId: 'spelling',
  templateId: 'word-family',
  title: 'Word family update',
  state: 'draft',
  operationCount: 2,
  updatedAt: Date.UTC(2026, 5, 11, 10, 0, 0),
  operations: [
    {
      operationId: 'op-1',
      entityType: 'spelling.word',
      entityId: 'metamorphosis',
      fieldPath: 'explanation',
      action: 'set',
    },
  ],
  blockers: {
    validation: { status: 'passed', errorCount: 0, warningCount: 0, errors: [], warnings: [] },
    audio: { status: 'blocked', blockers: ['word_audio_missing'], warnings: [] },
    assets: { status: 'not_scanned', blockers: [], warnings: ['asset_scan_pending'] },
    rewards: { status: 'passed', blockers: [], warnings: [] },
    visibility: { status: 'passed', blockers: [], warnings: [] },
    exposure: { status: 'passed', blockers: [], warnings: [] },
    publishReadiness: { status: 'not_ready', blockers: ['approval_required'], warnings: [] },
  },
};

const CONTENT_OPS_OVERVIEW = {
  ok: true,
  overview: {
    subjectId: 'spelling',
    latestRelease: {
      releaseId: 'rel-global-1',
      subjectId: 'spelling',
      status: 'published',
      snapshotHash: 'hash-1',
      publishedAt: Date.UTC(2026, 5, 11, 9, 0, 0),
      proof: { source: 'test' },
    },
    packageCounts: { draft: 1, blocked: 1, approved: 1 },
    lanes: {
      blocked: [{ ...CONTENT_OPS_PACKAGE, packageId: 'pkg-blocked-1', title: 'Blocked pool edit', state: 'blocked' }],
      readyForApproval: [{ ...CONTENT_OPS_PACKAGE, packageId: 'pkg-ready-1', title: 'Ready word edit', state: 'ready_for_approval' }],
      approvedPendingPublish: [{ ...CONTENT_OPS_PACKAGE, packageId: 'pkg-approved-1', title: 'Approved audio edit', state: 'approved' }],
      drafts: [CONTENT_OPS_PACKAGE],
      recentReleases: [
        {
          releaseId: 'rel-global-1',
          subjectId: 'spelling',
          status: 'published',
          snapshotHash: 'hash-1',
          publishedAt: Date.UTC(2026, 5, 11, 9, 0, 0),
          proof: { source: 'test' },
        },
      ],
    },
    actor: {
      accountId: 'admin-a',
      platformRole: 'admin',
      capabilities: {
        'content_operations.edit': true,
        'content_operations.approve': true,
        'content_operations.publish': true,
      },
    },
  },
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Content Operations Centre normalisers', () => {
  it('pins the required home lanes and package detail domain tabs', () => {
    assert.deepEqual(CONTENT_OPERATION_LANES.map((lane) => lane.label), [
      'Blocked',
      'Ready for approval',
      'Approved pending publish',
      'Open drafts',
    ]);
    assert.deepEqual(CONTENT_OPERATION_DETAIL_TABS.map((tab) => tab.label), [
      'Spelling',
      'Audio',
      'Pools & Rewards',
      'Monsters & Assets',
      'Hero / Codex',
      'Approvals',
      'Audit',
    ]);
  });

  it('normalises overview lanes, warning sections, releases, and actor capabilities', () => {
    const overview = normaliseContentOperationsOverview(CONTENT_OPS_OVERVIEW);

    assert.equal(overview.subjectId, 'spelling');
    assert.equal(overview.latestRelease.releaseId, 'rel-global-1');
    assert.equal(overview.openPackageCount, 4);
    assert.equal(overview.laneCounts.blocked, 1);
    assert.equal(overview.laneCounts.readyForApproval, 1);
    assert.equal(overview.laneCounts.approvedPendingPublish, 1);
    assert.equal(overview.laneCounts.drafts, 1);
    assert.equal(overview.lanes.drafts[0].stateLabel, 'Draft');
    assert.equal(overview.lanes.drafts[0].blockers.warningCount, 1);
    assert.equal(overview.recentReleases[0].proof.source, 'test');
    assert.equal(overview.actor.capabilities['content_operations.approve'], true);
  });

  it('normalises package lists, release lists, and package detail array payloads', () => {
    const packages = normaliseContentOperationsPackageList([CONTENT_OPS_PACKAGE]);
    const releases = normaliseContentOperationsReleaseList({
      releases: CONTENT_OPS_OVERVIEW.overview.lanes.recentReleases,
    });
    const detail = normaliseContentOperationsPackageDetail({
      package: CONTENT_OPS_PACKAGE,
      events: [{ eventId: 'event-1', eventType: 'package.created', createdAt: Date.UTC(2026, 5, 11) }],
    });

    assert.equal(packages[0].packageId, 'pkg-draft-1');
    assert.equal(packages[0].blockers.blockingSections.includes('audio'), true);
    assert.equal(releases[0].releaseId, 'rel-global-1');
    assert.equal(detail.package.operations[0].fieldPath, 'explanation');
    assert.equal(detail.events[0].eventType, 'package.created');
  });

  it('keeps compact package operation counts unknown instead of inventing zero', () => {
    const missingCountPackage = normaliseContentOperationPackage({
      packageId: 'pkg-summary-only',
      title: 'Summary only package',
      state: 'draft',
    });
    const nullCountPackage = normaliseContentOperationPackage({
      packageId: 'pkg-summary-null',
      title: 'Summary null package',
      state: 'draft',
      operationCount: null,
    });

    assert.equal(missingCountPackage.operationCount, null);
    assert.equal(nullCountPackage.operationCount, null);
  });
});

describe('Content Operations Centre hub API client', () => {
  it('calls read-only Content Operations Centre endpoints with compact queries', async () => {
    const calls = [];
    const api = createHubApi({
      baseUrl: 'https://repo.test',
      fetch: async (url, init = {}) => {
        calls.push({ url: String(url), method: init.method });
        return jsonResponse({ ok: true });
      },
    });

    await api.readContentOperationsOverview({ limit: 7 });
    await api.readContentOperationPackages({ state: 'draft', limit: 11 });
    await api.readContentOperationPackage({ packageId: 'pkg/with/slash' });
    await api.readContentOperationReleases({ limit: 5, includeSnapshot: true });
    await api.readContentOperationRelease({ releaseId: 'rel/with/slash', includeSnapshot: true });

    assert.equal(new URL(calls[0].url).pathname, '/api/admin/content-operations/subjects/spelling/overview');
    assert.equal(new URL(calls[0].url).searchParams.get('limit'), '7');
    assert.equal(new URL(calls[1].url).pathname, '/api/admin/content-operations/packages');
    assert.equal(new URL(calls[1].url).searchParams.get('state'), 'draft');
    assert.equal(new URL(calls[2].url).pathname, '/api/admin/content-operations/packages/pkg%2Fwith%2Fslash');
    assert.equal(new URL(calls[3].url).pathname, '/api/admin/content-operations/subjects/spelling/releases');
    assert.equal(new URL(calls[3].url).searchParams.get('includeSnapshot'), 'true');
    assert.equal(new URL(calls[4].url).pathname, '/api/admin/content-operations/subjects/spelling/releases/rel%2Fwith%2Fslash');
    assert.equal(new URL(calls[4].url).searchParams.get('includeSnapshot'), 'true');
    assert.deepEqual(calls.map((call) => call.method), ['GET', 'GET', 'GET', 'GET', 'GET']);
  });

  it('rejects package and release detail reads without explicit ids', async () => {
    const api = createHubApi({
      baseUrl: 'https://repo.test',
      fetch: async () => jsonResponse({ ok: true }),
    });

    await assert.rejects(
      () => api.readContentOperationPackage({ packageId: '' }),
      /Content operation package id is required/,
    );
    await assert.rejects(
      () => api.readContentOperationRelease({ releaseId: '' }),
      /Content operation release id is required/,
    );
  });
});
