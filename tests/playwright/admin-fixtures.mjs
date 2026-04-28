// P5 U5: Frozen state factories for admin Playwright tests.
//
// These fixtures return deterministic payloads matching the shape returned by
// the Worker's `/api/admin/debug-bundle` endpoint. Each factory returns a
// frozen object so callers cannot mutate shared test state between assertions.
//
// Two factory personas:
//   1. createAdminFixtureAccount() — admin role: full identifiers, JSON export
//   2. createOpsFixtureAccount()   — ops role: masked identifiers, no JSON export
//
// The payloads include all 7 bundle sections with representative rows so the
// Playwright scene can verify section rendering without hitting a real DB.

/**
 * Admin-role fixture: full identifiers, canExportJson = true, 7 populated sections.
 */
export function createAdminFixtureAccount() {
  const fixture = Object.freeze({
    ok: true,
    bundle: Object.freeze({
      generatedAt: 1714300000000,
      query: Object.freeze({
        accountId: 'acct-fixture-admin-001',
        learnerId: null,
        timeFrom: 1714200000000,
        timeTo: 1714300000000,
        errorFingerprint: null,
        errorEventId: null,
        route: null,
      }),
      buildHash: 'a1b2c3d',
      accountSummary: Object.freeze({
        accountId: 'acct-fixture-admin-001',
        email: 'operator@ks2-mastery.test',
        displayName: 'Fixture Operator',
        platformRole: 'admin',
        accountType: 'real',
        createdAt: 1710000000000,
        updatedAt: 1714200000000,
      }),
      linkedLearners: Object.freeze([
        Object.freeze({
          learnerId: 'lrn-fixture-a1',
          learnerName: 'Alice Fixture',
          yearGroup: 'Year 4',
          membershipRole: 'owner',
          accessMode: 'full',
        }),
        Object.freeze({
          learnerId: 'lrn-fixture-b2',
          learnerName: 'Bob Fixture',
          yearGroup: 'Year 5',
          membershipRole: 'viewer',
          accessMode: 'read-only',
        }),
      ]),
      recentErrors: Object.freeze([
        Object.freeze({
          id: 'err-fix-001',
          fingerprint: 'fp-timeout-bootstrap',
          errorKind: 'TimeoutError',
          messageFirstLine: 'Bootstrap fetch exceeded 5000ms deadline',
          firstFrame: '  at fetchBootstrap (worker/src/bootstrap.js:42:11)',
          routeName: '/api/bootstrap',
          accountId: 'acct-fixture-admin-001',
          firstSeen: 1714210000000,
          lastSeen: 1714290000000,
          occurrenceCount: 7,
          status: 'open',
        }),
        Object.freeze({
          id: 'err-fix-002',
          fingerprint: 'fp-d1-write-conflict',
          errorKind: 'D1WriteConflict',
          messageFirstLine: 'SQLITE_BUSY: database table is locked',
          firstFrame: '  at batch (worker/src/d1.js:18:5)',
          routeName: '/api/subjects/grammar/command',
          accountId: 'acct-fixture-admin-001',
          firstSeen: 1714250000000,
          lastSeen: 1714280000000,
          occurrenceCount: 3,
          status: 'open',
        }),
      ]),
      errorOccurrences: Object.freeze([
        Object.freeze({
          id: 'occ-fix-001',
          eventId: 'evt-fix-001',
          occurredAt: 1714290000000,
          release: 'v2.14.3',
          routeName: '/api/bootstrap',
          accountId: 'acct-fixture-admin-001',
        }),
        Object.freeze({
          id: 'occ-fix-002',
          eventId: 'evt-fix-002',
          occurredAt: 1714280000000,
          release: 'v2.14.2',
          routeName: '/api/subjects/grammar/command',
          accountId: 'acct-fixture-admin-001',
        }),
      ]),
      recentDenials: Object.freeze([
        Object.freeze({
          id: 'den-fix-001',
          deniedAt: 1714270000000,
          denialReason: 'rate_limit_exceeded',
          routeName: '/api/bootstrap',
          accountId: 'acct-fixture-admin-001',
          isDemo: false,
          release: 'v2.14.3',
        }),
        Object.freeze({
          id: 'den-fix-002',
          deniedAt: 1714265000000,
          denialReason: 'session_expired',
          routeName: '/api/subjects/spelling/command',
          accountId: 'acct-fixture-admin-001',
          isDemo: false,
          release: 'v2.14.2',
        }),
      ]),
      recentMutations: Object.freeze([
        Object.freeze({
          requestId: 'req-fix-001',
          mutationKind: 'spelling-save-answer',
          scopeType: 'learner',
          scopeId: 'lrn-fixture-a1',
          appliedAt: 1714295000000,
          accountId: 'acct-fixture-admin-001',
        }),
        Object.freeze({
          requestId: 'req-fix-002',
          mutationKind: 'grammar-save-answer',
          scopeType: 'learner',
          scopeId: 'lrn-fixture-b2',
          appliedAt: 1714292000000,
          accountId: 'acct-fixture-admin-001',
        }),
      ]),
      capacityState: Object.freeze([
        Object.freeze({
          metricKey: 'bootstrapCapacity',
          metricCount: 142,
          updatedAt: 1714298000000,
        }),
        Object.freeze({
          metricKey: 'commandCapacity',
          metricCount: 891,
          updatedAt: 1714297000000,
        }),
      ]),
    }),
    humanSummary: 'Debug Bundle for acct-fixture-admin-001: 2 linked learners, 2 recent errors (7 + 3 occurrences), 2 denials, 2 mutations, 2 capacity metrics. Generated 2024-04-28T14:26:40 UTC.',
    actorRole: 'admin',
    canExportJson: true,
  });
  return fixture;
}

/**
 * Ops-role fixture: masked identifiers, canExportJson = false, 7 populated sections.
 * Matches the redaction contract from redactBundleForRole(bundle, 'ops').
 */
export function createOpsFixtureAccount() {
  const fixture = Object.freeze({
    ok: true,
    bundle: Object.freeze({
      generatedAt: 1714300000000,
      query: Object.freeze({
        accountId: 'dmin-001',
        learnerId: null,
        timeFrom: 1714200000000,
        timeTo: 1714300000000,
        errorFingerprint: null,
        errorEventId: null,
        route: null,
      }),
      buildHash: 'a1b2c3d',
      accountSummary: Object.freeze({
        accountId: 'dmin-001',
        email: '*********************y.test',
        displayName: 'Fixture Operator',
        platformRole: 'admin',
        accountType: 'real',
        createdAt: 1710000000000,
        updatedAt: 1714200000000,
      }),
      linkedLearners: Object.freeze([
        Object.freeze({
          learnerId: 'ture-a1',
          learnerName: 'Alice Fixture',
          yearGroup: 'Year 4',
          membershipRole: 'owner',
          accessMode: 'full',
        }),
        Object.freeze({
          learnerId: 'ture-b2',
          learnerName: 'Bob Fixture',
          yearGroup: 'Year 5',
          membershipRole: 'viewer',
          accessMode: 'read-only',
        }),
      ]),
      recentErrors: Object.freeze([
        Object.freeze({
          id: 'err-fix-001',
          fingerprint: 'fp-timeout-bootstrap',
          errorKind: 'TimeoutError',
          messageFirstLine: 'Bootstrap fetch exceeded 5000ms deadline',
          firstFrame: '  at fetchBootstrap (worker/src/bootstrap.js:42:11)',
          routeName: '/api/bootstrap',
          accountId: 'dmin-001',
          firstSeen: 1714210000000,
          lastSeen: 1714290000000,
          occurrenceCount: 7,
          status: 'open',
        }),
      ]),
      errorOccurrences: Object.freeze([
        Object.freeze({
          id: 'occ-fix-001',
          eventId: 'evt-fix-001',
          occurredAt: 1714290000000,
          release: 'v2.14.3',
          routeName: '/api/bootstrap',
          accountId: 'dmin-001',
        }),
      ]),
      recentDenials: Object.freeze([
        Object.freeze({
          id: 'den-fix-001',
          deniedAt: 1714270000000,
          denialReason: 'rate_limit_exceeded',
          routeName: '/api/bootstrap',
          accountId: 'dmin-001',
          isDemo: false,
          release: 'v2.14.3',
        }),
      ]),
      recentMutations: Object.freeze([
        Object.freeze({
          requestId: 'req-fix-001',
          mutationKind: 'spelling-save-answer',
          scopeType: 'learner',
          scopeId: 'ture-a1',
          appliedAt: 1714295000000,
          accountId: 'dmin-001',
        }),
      ]),
      capacityState: Object.freeze([
        Object.freeze({
          metricKey: 'bootstrapCapacity',
          metricCount: 142,
          updatedAt: 1714298000000,
        }),
      ]),
    }),
    humanSummary: 'Debug Bundle for ***dmin-001: 2 linked learners, 1 recent error, 1 denial, 1 mutation, 1 capacity metric. Generated 2024-04-28T14:26:40 UTC.',
    actorRole: 'ops',
    canExportJson: false,
  });
  return fixture;
}
