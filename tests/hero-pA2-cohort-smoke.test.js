import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectStopConditions,
  insertIntoObservationLog,
} from '../scripts/hero-pA2-cohort-smoke.mjs';

// ── detectStopConditions ────────────────────────────────────────────

describe('detectStopConditions', () => {
  function makeHealthy() {
    return {
      balance: 500,
      balanceBucket: '300-599',
      hasGap: false,
      health: {
        duplicateAwardPreventedCount: 0,
        staleWriteCount: 0,
        balanceBucket: '300-599',
        balance: 500,
        ledgerEntryCount: 5,
        fullyGrownMonsterCount: 0,
        monsterDistribution: {},
      },
      readiness: { overall: 'ready', flags: true, state: true },
      overrideStatus: { accountId: 'acc-1', isInternalAccount: true, effectiveFlags: {} },
    };
  }

  it('all-healthy response returns no stop conditions', () => {
    const conditions = detectStopConditions(makeHealthy());
    assert.deepStrictEqual(conditions, []);
  });

  it('negative balance fires a stop condition', () => {
    const input = makeHealthy();
    input.balance = -10;
    const conditions = detectStopConditions(input);
    const keys = conditions.map(c => c.key);
    assert.ok(keys.includes('negative-balance'));
    const neg = conditions.find(c => c.key === 'negative-balance');
    assert.equal(neg.level, 'stop');
  });

  it('zero balance does NOT fire negative-balance', () => {
    const input = makeHealthy();
    input.balance = 0;
    const conditions = detectStopConditions(input);
    const keys = conditions.map(c => c.key);
    assert.ok(!keys.includes('negative-balance'));
  });

  it('duplicate award prevented fires a warn condition', () => {
    const input = makeHealthy();
    input.health = { ...input.health, duplicateAwardPreventedCount: 3 };
    const conditions = detectStopConditions(input);
    const dup = conditions.find(c => c.key === 'duplicate-award-prevented');
    assert.ok(dup, 'expected duplicate-award-prevented condition');
    assert.equal(dup.level, 'warn');
    assert.equal(dup.detail, 'count=3');
  });

  it('reconciliation gap fires a stop condition', () => {
    const input = makeHealthy();
    input.hasGap = true;
    const conditions = detectStopConditions(input);
    const gap = conditions.find(c => c.key === 'reconciliation-gap');
    assert.ok(gap, 'expected reconciliation-gap condition');
    assert.equal(gap.level, 'stop');
  });

  it('override mismatch (isInternalAccount false) fires a warn', () => {
    const input = makeHealthy();
    input.overrideStatus = { accountId: 'ext-1', isInternalAccount: false, effectiveFlags: {} };
    const conditions = detectStopConditions(input);
    const ovr = conditions.find(c => c.key === 'override-not-internal');
    assert.ok(ovr, 'expected override-not-internal condition');
    assert.equal(ovr.level, 'warn');
  });

  it('readiness degraded fires a warn with failed checks', () => {
    const input = makeHealthy();
    input.readiness = { overall: 'degraded', flags: true, state: false, economy: 'missing' };
    const conditions = detectStopConditions(input);
    const rd = conditions.find(c => c.key === 'readiness-degraded');
    assert.ok(rd, 'expected readiness-degraded condition');
    assert.equal(rd.level, 'warn');
    assert.ok(rd.detail.includes('state'));
    assert.ok(rd.detail.includes('economy'));
  });

  it('multiple simultaneous stop conditions all fire', () => {
    const input = makeHealthy();
    input.balance = -5;
    input.hasGap = true;
    input.health = { ...input.health, duplicateAwardPreventedCount: 1 };
    input.overrideStatus = { accountId: 'x', isInternalAccount: false, effectiveFlags: {} };
    const conditions = detectStopConditions(input);
    const keys = conditions.map(c => c.key);
    assert.ok(keys.includes('negative-balance'));
    assert.ok(keys.includes('reconciliation-gap'));
    assert.ok(keys.includes('duplicate-award-prevented'));
    assert.ok(keys.includes('override-not-internal'));
    assert.equal(conditions.length, 4);
  });

  it('null balance does not fire negative-balance', () => {
    const input = makeHealthy();
    input.balance = null;
    const conditions = detectStopConditions(input);
    const keys = conditions.map(c => c.key);
    assert.ok(!keys.includes('negative-balance'));
  });
});

// ── insertIntoObservationLog ────────────────────────────────────────

describe('insertIntoObservationLog', () => {
  const TEMPLATE = `# Hero Mode pA2 — Internal Cohort Evidence

## Observation Log

| Date | Learner | Readiness | Balance Bucket | Ledger Entries | Reconciliation | Override | Status |
|------|---------|-----------|----------------|----------------|----------------|----------|--------|

## Stop Conditions

| Condition | Observed | Date | Details |
|-----------|----------|------|---------|
| Negative balance | No | | |
| Reconciliation gap | No | | |
`;

  it('inserts observation rows before Stop Conditions section', () => {
    const row = '| 2026-04-30 | learner-1 | ready | 300-599 | 5 | no-gap | override-active | OK |';
    const result = insertIntoObservationLog(TEMPLATE, row, []);
    // Row should appear between the header separator and "## Stop Conditions"
    const obsLogIdx = result.indexOf('|------|');
    const stopIdx = result.indexOf('## Stop Conditions');
    const rowIdx = result.indexOf(row);
    assert.ok(rowIdx > obsLogIdx, 'row should be after observation log header');
    assert.ok(rowIdx < stopIdx, 'row should be before stop conditions section');
  });

  it('appends stop condition rows to the Stop Conditions table', () => {
    const obsRow = '| 2026-04-30 | l-1 | ready | 0 | 0 | gap | no-override | STOP:reconciliation-gap |';
    const stopRows = ['| reconciliation-gap | Yes | 2026-04-30 | Learner: l-1 [stop] |'];
    const result = insertIntoObservationLog(TEMPLATE, obsRow, stopRows);
    assert.ok(result.includes(stopRows[0]), 'stop row should be present');
    // It should be after the existing stop conditions table rows
    const existingRowIdx = result.indexOf('| Negative balance |');
    const newRowIdx = result.indexOf(stopRows[0]);
    assert.ok(newRowIdx > existingRowIdx, 'new stop row after existing rows');
  });

  it('handles content without Stop Conditions section (fallback)', () => {
    const minimal = `## Observation Log

| Date | Learner |
|------|---------|
`;
    const row = '| 2026-04-30 | test |';
    const result = insertIntoObservationLog(minimal, row, []);
    assert.ok(result.includes(row));
    const headerEnd = result.indexOf('|------|');
    const rowIdx = result.indexOf(row);
    assert.ok(rowIdx > headerEnd, 'row after header separator');
  });
});
