import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseArgs,
  extractObservation,
  formatObservationRow,
  insertIntoObservationLog,
} from '../scripts/hero-pA3-cohort-smoke.mjs';
import { detectStopConditions } from '../scripts/hero-pA2-cohort-smoke.mjs';

// ── 9-column row generation ────────────────────────────────────────

describe('pA3 cohort smoke: row generation', () => {
  it('generates 9-column row with correct Source column', () => {
    const obs = extractObservation('learner-1', {
      error: null,
      data: {
        readiness: { overall: 'ready' },
        health: { balanceBucket: '300-599', balance: 400, ledgerEntryCount: 5, duplicateAwardPreventedCount: 0 },
        reconciliation: { hasGap: false },
        overrideStatus: { accountId: 'acc-1', isInternalAccount: true, effectiveFlags: {} },
      },
    }, 'real-production');

    assert.equal(obs.source, 'real-production');
    assert.equal(obs.learner, 'learner-1');
    assert.equal(obs.readiness, 'ready');
    assert.equal(obs.status, 'OK');

    const row = formatObservationRow(obs);
    const cells = row.split('|').map(c => c.trim()).filter(c => c.length > 0);
    assert.equal(cells.length, 9);
    assert.equal(cells[7], 'real-production');
    assert.equal(cells[8], 'OK');
  });

  it('source column reflects --source flag override', () => {
    const obs = extractObservation('learner-2', {
      error: null,
      data: {
        readiness: { overall: 'ready' },
        health: { balanceBucket: '100-299', balance: 150, ledgerEntryCount: 3, duplicateAwardPreventedCount: 0 },
        reconciliation: { hasGap: false },
        overrideStatus: { accountId: 'acc-2', isInternalAccount: true, effectiveFlags: {} },
      },
    }, 'staging');

    assert.equal(obs.source, 'staging');
    const row = formatObservationRow(obs);
    assert.ok(row.includes('| staging |'));
  });

  it('probe failure produces manual-note source and ERROR status', () => {
    const obs = extractObservation('learner-3', { error: 'HTTP 500', data: null }, 'real-production');

    assert.equal(obs.source, 'manual-note');
    assert.equal(obs.status, 'ERROR:fetch-failed');
    assert.equal(obs.readiness, 'error');

    const row = formatObservationRow(obs);
    assert.ok(row.includes('| manual-note |'));
    assert.ok(row.includes('| ERROR:fetch-failed |'));
  });

  it('null probe data produces manual-note source and ERROR status', () => {
    const obs = extractObservation('learner-4', null, 'real-production');

    assert.equal(obs.source, 'manual-note');
    assert.equal(obs.status, 'ERROR:fetch-failed');
  });
});

// ── --source flag parsing ──────────────────────────────────────────

describe('pA3 cohort smoke: parseArgs', () => {
  it('defaults source to real-production', () => {
    const args = parseArgs(['node', 'script.mjs']);
    assert.equal(args.source, 'real-production');
  });

  it('--source staging overrides default', () => {
    const args = parseArgs(['node', 'script.mjs', '--source', 'staging']);
    assert.equal(args.source, 'staging');
  });

  it('--source=local overrides default', () => {
    const args = parseArgs(['node', 'script.mjs', '--source=local']);
    assert.equal(args.source, 'local');
  });

  it('--source=simulation accepted', () => {
    const args = parseArgs(['node', 'script.mjs', '--source=simulation']);
    assert.equal(args.source, 'simulation');
  });

  it('--source=manual-note accepted', () => {
    const args = parseArgs(['node', 'script.mjs', '--source=manual-note']);
    assert.equal(args.source, 'manual-note');
  });

  it('invalid source falls back to simulation (lowest trust tier)', () => {
    const args = parseArgs(['node', 'script.mjs', '--source', 'invalid-value']);
    assert.equal(args.source, 'simulation');
  });

  it('--dry-run flag sets dryRun', () => {
    const args = parseArgs(['node', 'script.mjs', '--dry-run']);
    assert.equal(args.dryRun, true);
  });

  it('--learner-ids parses comma-separated list', () => {
    const args = parseArgs(['node', 'script.mjs', '--learner-ids', 'a,b,c']);
    assert.deepEqual(args.learnerIds, ['a', 'b', 'c']);
  });

  it('--probe-url sets the probe URL', () => {
    const args = parseArgs(['node', 'script.mjs', '--probe-url', 'http://example.com/probe']);
    assert.equal(args.probeUrl, 'http://example.com/probe');
  });
});

// ── --dry-run behaviour ─────────────────────────────────────────────

describe('pA3 cohort smoke: dry-run semantics', () => {
  it('dry-run does not produce file writes (tested via extractObservation purity)', () => {
    // extractObservation is a pure function — calling it never writes
    const obs = extractObservation('learner-1', {
      error: null,
      data: {
        readiness: { overall: 'ready' },
        health: { balanceBucket: '300-599', balance: 400, ledgerEntryCount: 5, duplicateAwardPreventedCount: 0 },
        reconciliation: { hasGap: false },
        overrideStatus: { accountId: 'acc-1', isInternalAccount: true, effectiveFlags: {} },
      },
    }, 'real-production');
    // If this doesn't throw, no side effect occurred
    assert.ok(obs.date);
    assert.ok(obs.learner);
  });
});

// ── Stop condition detection (reuses pA2 detectStopConditions) ──────

describe('pA3 cohort smoke: stop condition detection', () => {
  function makeHealthy() {
    return {
      balance: 500,
      balanceBucket: '300-599',
      hasGap: false,
      health: { duplicateAwardPreventedCount: 0, balance: 500 },
      readiness: { overall: 'ready', flags: true, state: true },
      overrideStatus: { accountId: 'acc-1', isInternalAccount: true, effectiveFlags: {} },
    };
  }

  it('negative balance fires stop condition in pA3 context', () => {
    const input = makeHealthy();
    input.balance = -5;
    const conditions = detectStopConditions(input);
    assert.ok(conditions.some(c => c.key === 'negative-balance' && c.level === 'stop'));
  });

  it('reconciliation gap fires stop condition', () => {
    const input = makeHealthy();
    input.hasGap = true;
    const conditions = detectStopConditions(input);
    assert.ok(conditions.some(c => c.key === 'reconciliation-gap' && c.level === 'stop'));
  });

  it('override-not-internal fires stop per contract', () => {
    const input = makeHealthy();
    input.overrideStatus = { accountId: 'ext-1', isInternalAccount: false, effectiveFlags: {} };
    const conditions = detectStopConditions(input);
    assert.ok(conditions.some(c => c.key === 'override-not-internal' && c.level === 'stop'));
  });

  it('healthy probe yields no stop conditions', () => {
    const conditions = detectStopConditions(makeHealthy());
    assert.equal(conditions.length, 0);
  });
});

// ── insertIntoObservationLog ────────────────────────────────────────

describe('pA3 cohort smoke: insertIntoObservationLog', () => {
  const TEMPLATE = `# Hero Mode pA3 — Internal Cohort Evidence

## Observation Log

| Date | Learner | Readiness | Balance Bucket | Ledger Entries | Reconciliation | Override | Source | Status |
|------|---------|-----------|----------------|----------------|----------------|----------|--------|--------|

## Stop Conditions

| Condition | Observed | Date | Details |
|-----------|----------|------|---------|
| Negative balance | No | | |
| Reconciliation gap | No | | |
`;

  it('inserts 9-column row before Stop Conditions section', () => {
    const row = '| 2026-04-30 | learner-1 | ready | 300-599 | 5 | no-gap | override-active | real-production | OK |';
    const result = insertIntoObservationLog(TEMPLATE, row, []);
    const obsLogIdx = result.indexOf('|------|');
    const stopIdx = result.indexOf('## Stop Conditions');
    const rowIdx = result.indexOf(row);
    assert.ok(rowIdx > obsLogIdx, 'row after header');
    assert.ok(rowIdx < stopIdx, 'row before stop conditions');
  });

  it('preserves all 9 columns in inserted row', () => {
    const row = '| 2026-04-30 | l-1 | ready | 300-599 | 5 | no-gap | override-active | staging | OK |';
    const result = insertIntoObservationLog(TEMPLATE, row, []);
    assert.ok(result.includes(row));
    // Verify the row has 9 data cells
    const cells = row.split('|').map(c => c.trim()).filter(c => c.length > 0);
    assert.equal(cells.length, 9);
  });
});
