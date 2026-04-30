import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildOperatorLookup } from '../scripts/hero-pA4-operator-lookup.mjs';
import { HERO_FLAG_KEYS } from '../shared/hero/account-override.js';
import { PRIVACY_FORBIDDEN_FIELDS } from '../shared/hero/metrics-privacy.js';

// ── Fixtures ──────────────────────────────────────────────────────────

function makeHealthyState() {
  return {
    version: 2,
    economy: {
      balance: 450,
      ledger: [
        { type: 'daily_award', date: new Date().toISOString().slice(0, 10), amount: 100 },
        { type: 'camp_spend', date: new Date().toISOString().slice(0, 10), amount: -50 },
      ],
    },
    heroPool: {
      monsters: { 'monster-1': { id: 'monster-1', level: 3 } },
    },
  };
}

function makeUnhealthyState() {
  return {
    version: 2,
    economy: {
      balance: -10,
      ledger: [
        { type: 'daily_award', date: new Date().toISOString().slice(0, 10), amount: 100 },
        null,
      ],
    },
    heroPool: {
      monsters: { 'monster-1': { id: 'monster-1', level: 1 } },
    },
  };
}

function makeInternalEnv(accountId) {
  return {
    HERO_INTERNAL_ACCOUNTS: JSON.stringify([accountId]),
    HERO_EXTERNAL_ACCOUNTS: JSON.stringify([]),
  };
}

function makeExternalEnv(accountId) {
  return {
    HERO_INTERNAL_ACCOUNTS: JSON.stringify([]),
    HERO_EXTERNAL_ACCOUNTS: JSON.stringify([accountId]),
  };
}

function makeNoMatchEnv() {
  return {
    HERO_INTERNAL_ACCOUNTS: JSON.stringify(['other-acc']),
    HERO_EXTERNAL_ACCOUNTS: JSON.stringify(['another-acc']),
  };
}

// ── Internal account ──────────────────────────────────────────────────

describe('buildOperatorLookup: internal account', () => {
  it('returns overrideStatus=internal with all flags enabled', () => {
    const report = buildOperatorLookup({
      accountId: 'int-acc-1',
      env: makeInternalEnv('int-acc-1'),
      heroState: makeHealthyState(),
      eventLog: [{ eventType: 'daily_complete', data: {} }],
    });

    assert.equal(report.ok, true);
    assert.equal(report.overrideStatus, 'internal');
    for (const key of HERO_FLAG_KEYS) {
      assert.equal(report.resolvedFlags[key], true, `${key} must be enabled`);
    }
  });

  it('cohortClassification explains internal membership', () => {
    const report = buildOperatorLookup({
      accountId: 'int-acc-1',
      env: makeInternalEnv('int-acc-1'),
      heroState: makeHealthyState(),
      eventLog: [],
    });

    assert.equal(report.cohortClassification.enabled, true);
    assert.ok(report.cohortClassification.reason.includes('HERO_INTERNAL_ACCOUNTS'));
  });
});

// ── External account ──────────────────────────────────────────────────

describe('buildOperatorLookup: external account', () => {
  it('returns overrideStatus=external with all flags enabled', () => {
    const report = buildOperatorLookup({
      accountId: 'ext-acc-1',
      env: makeExternalEnv('ext-acc-1'),
      heroState: makeHealthyState(),
      eventLog: [{ eventType: 'quest_start', data: {} }],
    });

    assert.equal(report.ok, true);
    assert.equal(report.overrideStatus, 'external');
    for (const key of HERO_FLAG_KEYS) {
      assert.equal(report.resolvedFlags[key], true, `${key} must be enabled`);
    }
  });

  it('cohortClassification explains external membership', () => {
    const report = buildOperatorLookup({
      accountId: 'ext-acc-1',
      env: makeExternalEnv('ext-acc-1'),
      heroState: makeHealthyState(),
      eventLog: [],
    });

    assert.equal(report.cohortClassification.enabled, true);
    assert.ok(report.cohortClassification.reason.includes('HERO_EXTERNAL_ACCOUNTS'));
  });
});

// ── Non-cohort account (flags off) ────────────────────────────────────

describe('buildOperatorLookup: non-cohort account', () => {
  it('returns overrideStatus=none with Hero hidden', () => {
    const report = buildOperatorLookup({
      accountId: 'random-acc',
      env: makeNoMatchEnv(),
      heroState: null,
      eventLog: [],
    });

    assert.equal(report.ok, true);
    assert.equal(report.overrideStatus, 'none');
    for (const key of HERO_FLAG_KEYS) {
      assert.equal(report.resolvedFlags[key], false, `${key} must be disabled`);
    }
  });

  it('cohortClassification shows hidden with reason', () => {
    const report = buildOperatorLookup({
      accountId: 'random-acc',
      env: makeNoMatchEnv(),
      heroState: null,
      eventLog: [],
    });

    assert.equal(report.cohortClassification.enabled, false);
    assert.ok(report.cohortClassification.reason.includes('not in any cohort list'));
  });

  it('recommendation mentions not in any cohort list', () => {
    const report = buildOperatorLookup({
      accountId: 'random-acc',
      env: makeNoMatchEnv(),
      heroState: null,
      eventLog: [],
    });

    const cohortRec = report.recommendations.find(r => r.includes('not in any cohort list'));
    assert.ok(cohortRec, 'Must have recommendation about cohort membership');
  });
});

// ── Unhealthy state (negative balance) ────────────────────────────────

describe('buildOperatorLookup: unhealthy state', () => {
  it('readiness shows failure for negative balance', () => {
    const report = buildOperatorLookup({
      accountId: 'int-acc-1',
      env: makeInternalEnv('int-acc-1'),
      heroState: makeUnhealthyState(),
      eventLog: [],
    });

    assert.equal(report.readinessChecks.overall, 'not_ready');
    const economyCheck = report.readinessChecks.checks.find(c => c.name === 'economyHealthy');
    assert.equal(economyCheck.status, 'fail');
  });

  it('economyHealth reports anomalies', () => {
    const report = buildOperatorLookup({
      accountId: 'int-acc-1',
      env: makeInternalEnv('int-acc-1'),
      heroState: makeUnhealthyState(),
      eventLog: [],
    });

    assert.equal(report.economyHealth.status, 'unhealthy');
    assert.ok(report.economyHealth.anomalies.includes('negative-balance'));
    assert.ok(report.economyHealth.anomalies.includes('null-ledger-entry'));
  });

  it('recommendations mention economy anomalies', () => {
    const report = buildOperatorLookup({
      accountId: 'int-acc-1',
      env: makeInternalEnv('int-acc-1'),
      heroState: makeUnhealthyState(),
      eventLog: [],
    });

    const econRec = report.recommendations.find(r => r.includes('Economy anomalies'));
    assert.ok(econRec, 'Must recommend action for economy issues');
  });
});

// ── No event log entries ──────────────────────────────────────────────

describe('buildOperatorLookup: no event log', () => {
  it('graceful message when no events exist', () => {
    const report = buildOperatorLookup({
      accountId: 'int-acc-1',
      env: makeInternalEnv('int-acc-1'),
      heroState: makeHealthyState(),
      eventLog: [],
    });

    assert.equal(report.recentEvents.count, 0);
    assert.equal(report.recentEvents.message, 'No observations yet.');
  });

  it('recommendation mentions no observations', () => {
    const report = buildOperatorLookup({
      accountId: 'int-acc-1',
      env: makeInternalEnv('int-acc-1'),
      heroState: makeHealthyState(),
      eventLog: [],
    });

    const noObsRec = report.recommendations.find(r => r.includes('No event log observations'));
    assert.ok(noObsRec, 'Must mention no observations');
  });
});

// ── Privacy stripping ─────────────────────────────────────────────────

describe('buildOperatorLookup: privacy stripping', () => {
  it('removes forbidden fields from event log entries', () => {
    const rawEvents = [
      {
        eventType: 'quest_complete',
        data: {
          score: 5,
          childFreeText: 'My secret answer',
          rawAnswer: 'raw answer text',
          nested: { childContent: 'deep private', ok: true },
        },
      },
      {
        eventType: 'daily_award',
        rawText: 'should be removed',
        data: { amount: 100 },
      },
    ];

    const report = buildOperatorLookup({
      accountId: 'int-acc-1',
      env: makeInternalEnv('int-acc-1'),
      heroState: makeHealthyState(),
      eventLog: rawEvents,
    });

    // Verify no forbidden fields in output
    const outputStr = JSON.stringify(report.recentEvents);
    for (const field of PRIVACY_FORBIDDEN_FIELDS) {
      assert.ok(
        !outputStr.includes(`"${field}"`),
        `Forbidden field "${field}" must be stripped from output`,
      );
    }

    // Verify allowed fields survive
    const firstEvent = report.recentEvents.events[0];
    assert.equal(firstEvent.eventType, 'quest_complete');
    assert.equal(firstEvent.data.score, 5);
    assert.equal(firstEvent.data.nested.ok, true);
  });
});

// ── Null/undefined accountId ──────────────────────────────────────────

describe('buildOperatorLookup: null/undefined accountId', () => {
  it('null accountId returns graceful error output', () => {
    const report = buildOperatorLookup({
      accountId: null,
      env: makeInternalEnv('int-acc-1'),
      heroState: makeHealthyState(),
      eventLog: [],
    });

    assert.equal(report.ok, false);
    assert.ok(report.error.includes('required'));
    assert.equal(report.accountId, null);
    assert.equal(report.overrideStatus, null);
    assert.ok(Array.isArray(report.recommendations));
  });

  it('undefined accountId returns graceful error output', () => {
    const report = buildOperatorLookup({
      accountId: undefined,
      env: makeInternalEnv('int-acc-1'),
      heroState: makeHealthyState(),
      eventLog: [],
    });

    assert.equal(report.ok, false);
    assert.ok(report.error.includes('required'));
  });

  it('empty string accountId returns graceful error output', () => {
    const report = buildOperatorLookup({
      accountId: '',
      env: makeInternalEnv('int-acc-1'),
      heroState: makeHealthyState(),
      eventLog: [],
    });

    assert.equal(report.ok, false);
    assert.ok(report.error.includes('required'));
  });
});

// ── Healthy fully-enabled account produces no-action recommendation ───

describe('buildOperatorLookup: healthy fully-enabled', () => {
  it('healthy internal account with events produces no-action recommendation', () => {
    const report = buildOperatorLookup({
      accountId: 'int-acc-1',
      env: makeInternalEnv('int-acc-1'),
      heroState: makeHealthyState(),
      eventLog: [{ eventType: 'daily_complete', data: {} }],
    });

    assert.equal(report.ok, true);
    assert.equal(report.readinessChecks.overall, 'ready');
    assert.equal(report.economyHealth.status, 'healthy');
    assert.ok(
      report.recommendations.some(r => r.includes('No action required')),
      'Must indicate no action needed',
    );
  });
});

// ── Event log limiting ────────────────────────────────────────────────

describe('buildOperatorLookup: event log limiting', () => {
  it('limits to 10 most recent events', () => {
    const manyEvents = Array.from({ length: 25 }, (_, i) => ({
      eventType: `event-${i}`,
      data: { index: i },
    }));

    const report = buildOperatorLookup({
      accountId: 'int-acc-1',
      env: makeInternalEnv('int-acc-1'),
      heroState: makeHealthyState(),
      eventLog: manyEvents,
    });

    assert.equal(report.recentEvents.count, 10);
    assert.equal(report.recentEvents.events.length, 10);
    // First 10 events (assuming input is already ordered newest-first)
    assert.equal(report.recentEvents.events[0].eventType, 'event-0');
    assert.equal(report.recentEvents.events[9].eventType, 'event-9');
  });
});
