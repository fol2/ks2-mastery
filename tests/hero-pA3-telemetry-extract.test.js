import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseArgs,
  classifyConfidence,
  validateAllRowsPrivacy,
  parseRows,
  extractQuestShown,
  extractQuestStartRate,
  extractFirstTaskStartRate,
  extractTaskCompletionRate,
  extractDailyCompletionRate,
  extractAbandonmentReasons,
  extractSubjectMix,
  extractTaskIntentDistribution,
  extractClaimSuccessAndRejections,
  extractDuplicateClaimPrevention,
  extractCoinAwards,
  extractCampEvents,
  extractExtraPracticeAfterCap,
  extractRushingSignals,
  extractMasteryDrift,
  extractPrivacyCompliance,
  assembleReport,
} from '../scripts/hero-pA3-telemetry-extract.mjs';

// ── Test data factories ─────────────────────────────────────────────

function makeTaskRow(overrides = {}) {
  return {
    id: overrides.id || 'hero-evt-req1-hero-task-completed',
    learnerId: overrides.learnerId || 'learner-1',
    subjectId: overrides.subjectId || 'grammar',
    systemId: 'hero-mode',
    eventType: 'hero.task.completed',
    eventJson: overrides.eventJson || { data: { questId: 'q1', taskId: 't1', subjectId: 'grammar', effortCredited: 1 } },
    createdAt: overrides.createdAt || '2026-04-28T10:00:00.000Z',
  };
}

function makeDailyRow(overrides = {}) {
  return {
    id: overrides.id || 'hero-evt-req1-hero-daily-completed',
    learnerId: overrides.learnerId || 'learner-1',
    subjectId: null,
    systemId: 'hero-mode',
    eventType: 'hero.daily.completed',
    eventJson: overrides.eventJson || { data: { questId: 'q1', dateKey: '2026-04-28', effortCompleted: 3 } },
    createdAt: overrides.createdAt || '2026-04-28T10:05:00.000Z',
  };
}

function makeCoinRow(overrides = {}) {
  return {
    id: overrides.id || 'hero-evt-ledger-1',
    learnerId: overrides.learnerId || 'learner-1',
    subjectId: null,
    systemId: 'hero-mode',
    eventType: 'hero.coins.awarded',
    eventJson: overrides.eventJson || { questId: 'q1', dateKey: '2026-04-28', amount: 100, ledgerEntryId: 'ledger-1', balanceAfter: 200 },
    createdAt: overrides.createdAt || '2026-04-28T10:05:01.000Z',
  };
}

function makeCampInviteRow(overrides = {}) {
  return {
    id: overrides.id || 'hero-evt-camp-1',
    learnerId: overrides.learnerId || 'learner-1',
    subjectId: null,
    systemId: 'hero-mode',
    eventType: 'hero.camp.monster.invited',
    eventJson: overrides.eventJson || { command: 'unlock-monster', monsterId: 'dragon-1', ledgerEntryId: 'camp-1' },
    createdAt: overrides.createdAt || '2026-04-28T11:00:00.000Z',
  };
}

function makeCampGrowRow(overrides = {}) {
  return {
    id: overrides.id || 'hero-evt-camp-2',
    learnerId: overrides.learnerId || 'learner-1',
    subjectId: null,
    systemId: 'hero-mode',
    eventType: 'hero.camp.monster.grown',
    eventJson: overrides.eventJson || { command: 'evolve-monster', monsterId: 'dragon-1', ledgerEntryId: 'camp-2' },
    createdAt: overrides.createdAt || '2026-04-28T12:00:00.000Z',
  };
}

// ── parseArgs ───────────────────────────────────────────────────────

describe('parseArgs', () => {
  it('parses --db-path, --learner-ids, --date-from, --date-to', () => {
    const args = parseArgs(['node', 'script', '--db-path', './test.db', '--learner-ids', 'a,b,c', '--date-from', '2026-04-01', '--date-to', '2026-04-30']);
    assert.ok(args.dbPath.endsWith('test.db'));
    assert.deepEqual(args.learnerIds, ['a', 'b', 'c']);
    assert.equal(args.dateFrom, '2026-04-01');
    assert.equal(args.dateTo, '2026-04-30');
  });

  it('defaults format to json', () => {
    const args = parseArgs(['node', 'script']);
    assert.equal(args.format, 'json');
  });
});

// ── classifyConfidence ──────────────────────────────────────────────

describe('classifyConfidence', () => {
  it('>=100 is high', () => assert.equal(classifyConfidence(100), 'high'));
  it('>=30 is medium', () => assert.equal(classifyConfidence(30), 'medium'));
  it('>=10 is low', () => assert.equal(classifyConfidence(10), 'low'));
  it('<10 is insufficient', () => assert.equal(classifyConfidence(9), 'insufficient'));
  it('0 is insufficient', () => assert.equal(classifyConfidence(0), 'insufficient'));
  it('exactly 99 is medium', () => assert.equal(classifyConfidence(99), 'medium'));
  it('exactly 29 is low', () => assert.equal(classifyConfidence(29), 'low'));
});

// ── parseRows ───────────────────────────────────────────────────────

describe('parseRows', () => {
  it('parses valid event_json', () => {
    const raw = [{ id: '1', learner_id: 'l1', subject_id: 's1', system_id: 'hero-mode', event_type: 'hero.task.completed', event_json: '{"data":{"taskId":"t1"}}', created_at: '2026-04-28T10:00:00Z' }];
    const parsed = parseRows(raw);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].eventType, 'hero.task.completed');
    assert.deepEqual(parsed[0].eventJson, { data: { taskId: 't1' } });
  });

  it('handles malformed event_json gracefully (sets to null)', () => {
    const raw = [{ id: '1', learner_id: 'l1', subject_id: null, system_id: 'hero-mode', event_type: 'hero.task.completed', event_json: '{invalid json', created_at: '2026-04-28T10:00:00Z' }];
    const parsed = parseRows(raw);
    assert.equal(parsed[0].eventJson, null);
  });

  it('handles null event_json', () => {
    const raw = [{ id: '1', learner_id: 'l1', subject_id: null, system_id: 'hero-mode', event_type: 'hero.task.completed', event_json: null, created_at: '2026-04-28T10:00:00Z' }];
    const parsed = parseRows(raw);
    assert.equal(parsed[0].eventJson, null);
  });
});

// ── Privacy validation ──────────────────────────────────────────────

describe('validateAllRowsPrivacy', () => {
  it('clean data passes', () => {
    const rows = [makeTaskRow(), makeCoinRow(), makeCampInviteRow()];
    const result = validateAllRowsPrivacy(rows);
    assert.equal(result.passed, true);
    assert.equal(result.rowsChecked, 3);
    assert.deepEqual(result.violations, []);
  });

  it('privacy violation detected and reported', () => {
    const rows = [
      makeTaskRow({ eventJson: { data: { taskId: 't1' }, rawAnswer: 'child secret' } }),
    ];
    const result = validateAllRowsPrivacy(rows);
    assert.equal(result.passed, false);
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].rowIndex, 0);
    assert.ok(result.violations[0].violations.includes('rawAnswer'));
  });

  it('nested privacy violation detected', () => {
    const rows = [
      makeTaskRow({ eventJson: { data: { nested: { childFreeText: 'secret' } } } }),
    ];
    const result = validateAllRowsPrivacy(rows);
    assert.equal(result.passed, false);
  });

  it('rows with null eventJson are skipped (not counted)', () => {
    const rows = [{ ...makeTaskRow(), eventJson: null }];
    const result = validateAllRowsPrivacy(rows);
    assert.equal(result.passed, true);
    assert.equal(result.rowsChecked, 0);
  });
});

// ── Signal extraction: zero events ──────────────────────────────────

describe('signal extraction with zero events', () => {
  const emptyRows = [];

  it('questShown returns zero', () => {
    const r = extractQuestShown(emptyRows);
    assert.equal(r.count, 0);
  });

  it('dailyCompletionRate returns zeros without errors', () => {
    const r = extractDailyCompletionRate(emptyRows);
    assert.equal(r.dailyCompleted, 0);
    assert.equal(r.sessionsStarted, 0);
    assert.equal(r.value, 0);
  });

  it('subjectMix returns empty distribution', () => {
    const r = extractSubjectMix(emptyRows);
    assert.deepEqual(r.distribution, {});
    assert.equal(r.total, 0);
  });

  it('coinAwards returns zeros', () => {
    const r = extractCoinAwards(emptyRows);
    assert.equal(r.awardCount, 0);
    assert.equal(r.totalCoins, 0);
  });

  it('campEvents returns zeros', () => {
    const r = extractCampEvents(emptyRows);
    assert.equal(r.invited, 0);
    assert.equal(r.grown, 0);
  });

  it('rushingSignals returns zeros', () => {
    const r = extractRushingSignals(emptyRows);
    assert.equal(r.suspiciousSessionCount, 0);
    assert.equal(r.sessionsAnalysed, 0);
  });
});

// ── Signal extraction: task completion events ───────────────────────

describe('extractSubjectMix', () => {
  it('counts subjects from task.completed events', () => {
    const rows = [
      makeTaskRow({ subjectId: 'grammar' }),
      makeTaskRow({ id: '2', subjectId: 'spelling' }),
      makeTaskRow({ id: '3', subjectId: 'grammar' }),
    ];
    const r = extractSubjectMix(rows);
    assert.equal(r.distribution['grammar'], 2);
    assert.equal(r.distribution['spelling'], 1);
    assert.equal(r.total, 3);
  });
});

describe('extractTaskIntentDistribution', () => {
  it('counts intent values from event_json', () => {
    const rows = [
      makeTaskRow({ eventJson: { data: { taskId: 't1' }, heroTaskIntent: 'weak-repair' } }),
      makeTaskRow({ id: '2', eventJson: { data: { taskId: 't2' }, heroTaskIntent: 'due-review' } }),
      makeTaskRow({ id: '3', eventJson: { data: { taskId: 't3' }, heroTaskIntent: 'weak-repair' } }),
    ];
    const r = extractTaskIntentDistribution(rows);
    assert.equal(r.distribution['weak-repair'], 2);
    assert.equal(r.distribution['due-review'], 1);
    assert.equal(r.total, 3);
  });

  it('uses "unknown" for missing intent', () => {
    const rows = [makeTaskRow({ eventJson: { data: { taskId: 't1' } } })];
    const r = extractTaskIntentDistribution(rows);
    assert.equal(r.distribution['unknown'], 1);
  });
});

// ── Signal extraction: daily completion rate ────────────────────────

describe('extractDailyCompletionRate', () => {
  it('computes rate from daily.completed and task sessions', () => {
    const rows = [
      makeTaskRow({ createdAt: '2026-04-28T10:00:00Z' }),
      makeTaskRow({ id: '2', learnerId: 'learner-2', createdAt: '2026-04-28T10:00:00Z' }),
      makeDailyRow({ createdAt: '2026-04-28T10:05:00Z' }),
    ];
    const r = extractDailyCompletionRate(rows);
    assert.equal(r.dailyCompleted, 1);
    assert.equal(r.sessionsStarted, 2); // 2 unique learner-day combos
    assert.equal(r.value, 0.5);
  });
});

// ── Signal extraction: coin awards ──────────────────────────────────

describe('extractCoinAwards', () => {
  it('counts awards and sums amounts', () => {
    const rows = [
      makeCoinRow({ eventJson: { amount: 100, balanceAfter: 200 } }),
      makeCoinRow({ id: '2', eventJson: { amount: 100, balanceAfter: 300 } }),
    ];
    const r = extractCoinAwards(rows);
    assert.equal(r.awardCount, 2);
    assert.equal(r.totalCoins, 200);
  });
});

// ── Signal extraction: camp events ──────────────────────────────────

describe('extractCampEvents', () => {
  it('counts invited and grown events', () => {
    const rows = [
      makeCampInviteRow(),
      makeCampInviteRow({ id: '2' }),
      makeCampGrowRow(),
    ];
    const r = extractCampEvents(rows);
    assert.equal(r.invited, 2);
    assert.equal(r.grown, 1);
  });
});

// ── Signal extraction: extra practice after cap ─────────────────────

describe('extractExtraPracticeAfterCap', () => {
  it('detects tasks after daily.completed timestamp', () => {
    const rows = [
      makeTaskRow({ createdAt: '2026-04-28T10:00:00Z' }),
      makeDailyRow({ createdAt: '2026-04-28T10:05:00Z', eventJson: { data: { dateKey: '2026-04-28' } } }),
      makeTaskRow({ id: 'extra-1', createdAt: '2026-04-28T10:10:00Z', eventJson: { data: { dateKey: '2026-04-28' } } }),
    ];
    const r = extractExtraPracticeAfterCap(rows);
    assert.equal(r.extraTaskCount, 1);
  });

  it('returns zero when no tasks after completion', () => {
    const rows = [
      makeTaskRow({ createdAt: '2026-04-28T10:00:00Z' }),
      makeDailyRow({ createdAt: '2026-04-28T10:05:00Z', eventJson: { data: { dateKey: '2026-04-28' } } }),
    ];
    const r = extractExtraPracticeAfterCap(rows);
    assert.equal(r.extraTaskCount, 0);
  });
});

// ── Signal extraction: rushing signals ──────────────────────────────

describe('extractRushingSignals', () => {
  it('detects rapid task claims (< 30s apart)', () => {
    const rows = [
      makeTaskRow({ createdAt: '2026-04-28T10:00:00.000Z' }),
      makeTaskRow({ id: '2', createdAt: '2026-04-28T10:00:15.000Z' }), // 15s gap
    ];
    const r = extractRushingSignals(rows);
    assert.equal(r.suspiciousSessionCount, 1);
  });

  it('does not flag normal pace (> 30s apart)', () => {
    const rows = [
      makeTaskRow({ createdAt: '2026-04-28T10:00:00.000Z' }),
      makeTaskRow({ id: '2', createdAt: '2026-04-28T10:01:00.000Z' }), // 60s gap
    ];
    const r = extractRushingSignals(rows);
    assert.equal(r.suspiciousSessionCount, 0);
  });
});

// ── Signal extraction: unmeasurable signals ─────────────────────────

describe('unmeasurable signals', () => {
  it('questShown.measurable is false', () => {
    assert.equal(extractQuestShown([]).measurable, false);
  });

  it('abandonmentReasons.measurable is false', () => {
    assert.equal(extractAbandonmentReasons([]).measurable, false);
  });

  it('masteryDrift.measurable is false', () => {
    assert.equal(extractMasteryDrift([]).measurable, false);
  });

  it('duplicateClaimPrevention.measurable is false', () => {
    assert.equal(extractDuplicateClaimPrevention([]).measurable, false);
  });
});

// ── assembleReport ──────────────────────────────────────────────────

describe('assembleReport', () => {
  it('produces valid report structure with events', () => {
    const rows = [makeTaskRow(), makeDailyRow(), makeCoinRow(), makeCampInviteRow()];
    const args = { dateFrom: '2026-04-28', dateTo: '2026-04-28', learnerIds: ['learner-1'] };
    const report = assembleReport(rows, args);

    assert.ok(report.extractedAt);
    assert.equal(report.totalEvents, 4);
    assert.ok(report.signals);
    assert.ok(report.privacyValidation.passed);
    assert.ok(Array.isArray(report.unmeasurable));
    assert.ok(Array.isArray(report.warnings));
  });

  it('produces empty report without errors for zero events', () => {
    const args = { dateFrom: null, dateTo: null, learnerIds: null };
    const report = assembleReport([], args);

    assert.equal(report.totalEvents, 0);
    assert.ok(report.signals);
    assert.ok(report.warnings.length > 0); // warns about no events
  });

  it('aborts with error report on privacy violation', () => {
    const rows = [
      makeTaskRow({ eventJson: { rawAnswer: 'child secret', taskId: 't1' } }),
    ];
    const args = { dateFrom: null, dateTo: null, learnerIds: null };
    const report = assembleReport(rows, args);

    assert.equal(report.error, 'privacy-violation');
    assert.equal(report.signals, null);
    assert.equal(report.privacyValidation.passed, false);
  });

  it('handles malformed eventJson rows gracefully (skipped in signal extraction)', () => {
    const rows = [
      { ...makeTaskRow(), eventJson: null },
      makeTaskRow({ id: '2' }),
    ];
    const args = { dateFrom: null, dateTo: null, learnerIds: null };
    const report = assembleReport(rows, args);

    assert.ok(report.signals);
    assert.equal(report.privacyValidation.passed, true);
  });
});
