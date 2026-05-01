import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PA6_METRIC_REGISTRY,
  PA6_SOURCE_TYPES,
  assertNoConceptualTables,
  buildA6MetricsReport,
} from '../scripts/hero-pA6-metrics-extract.mjs';
import {
  REQUIRED_LAUNCH_METRICS,
  REQUIRED_SAFETY_METRICS,
} from '../scripts/hero-pA4-metrics-validator.mjs';

function getMetric(report, id) {
  return report.metrics.find((metric) => metric.id === id);
}

function makeHealthyInput() {
  const state = {
    version: 3,
    daily: {
      dateKey: '2026-05-01',
      questId: 'quest-1',
      status: 'completed',
      firstStartedAt: '2026-05-01T09:00:00.000Z',
      tasks: {
        task1: { taskId: 'task1', status: 'completed', intent: 'weak-repair', subjectId: 'spelling' },
        task2: { taskId: 'task2', status: 'completed', intent: 'due-review', subjectId: 'grammar' },
      },
    },
    economy: {
      version: 1,
      balance: 50,
      lifetimeEarned: 100,
      lifetimeSpent: 50,
      ledger: [
        {
          entryId: 'award-1',
          idempotencyKey: 'award-key-1',
          type: 'daily-completion-award',
          amount: 100,
          balanceAfter: 100,
          learnerId: 'learner-1',
          dateKey: '2026-05-01',
          questId: 'quest-1',
        },
        {
          entryId: 'invite-1',
          idempotencyKey: 'invite-key-1',
          type: 'monster-invite',
          amount: -50,
          balanceAfter: 50,
          learnerId: 'learner-1',
          monsterId: 'glossbloom',
          branch: 'b1',
        },
      ],
    },
    heroPool: {
      monsters: {
        glossbloom: { owned: true, stage: 0, branch: 'b1' },
      },
    },
  };

  return {
    child_game_state: [
      {
        learner_id: 'learner-1',
        system_id: 'hero-mode',
        state_json: JSON.stringify(state),
        updated_at: '2026-05-01T09:15:00.000Z',
      },
    ],
    event_log: [
      {
        id: 'evt-task-1',
        learner_id: 'learner-1',
        subject_id: 'spelling',
        system_id: 'hero-mode',
        event_type: 'hero.task.completed',
        event_json: JSON.stringify({ data: { questId: 'quest-1', taskId: 'task1', subjectId: 'spelling', dateKey: '2026-05-01' } }),
        created_at: '2026-05-01T09:05:00.000Z',
        actor_account_id: 'account-1',
      },
      {
        id: 'evt-daily-1',
        learner_id: 'learner-1',
        subject_id: null,
        system_id: 'hero-mode',
        event_type: 'hero.daily.completed',
        event_json: JSON.stringify({ data: { questId: 'quest-1', dateKey: '2026-05-01' } }),
        created_at: '2026-05-01T09:10:00.000Z',
        actor_account_id: 'account-1',
      },
      {
        id: 'evt-coins-1',
        learner_id: 'learner-1',
        subject_id: null,
        system_id: 'hero-mode',
        event_type: 'hero.coins.awarded',
        event_json: JSON.stringify({ questId: 'quest-1', dateKey: '2026-05-01', amount: 100, ledgerEntryId: 'award-1', balanceAfter: 100 }),
        created_at: '2026-05-01T09:10:01.000Z',
        actor_account_id: 'account-1',
      },
      {
        id: 'evt-camp-1',
        learner_id: 'learner-1',
        subject_id: null,
        system_id: 'hero-mode',
        event_type: 'hero.camp.monster.invited',
        event_json: JSON.stringify({ command: 'unlock-monster', monsterId: 'glossbloom', ledgerEntryId: 'invite-1' }),
        created_at: '2026-05-01T09:20:00.000Z',
        actor_account_id: 'account-1',
      },
    ],
    child_subject_state: [
      { learner_id: 'learner-1', subject_id: 'spelling' },
      { learner_id: 'learner-2', subject_id: 'arithmetic' },
    ],
    account_learner_memberships: [
      { account_id: 'account-1', learner_id: 'learner-1' },
    ],
    support_issues: [
      { category: 'comprehension', status: 'resolved' },
    ],
  };
}

describe('Hero Mode pA6 metrics registry', () => {
  it('classifies every metric with the A6 source truth vocabulary', () => {
    assert.equal(PA6_METRIC_REGISTRY.length, 34);

    for (const metric of PA6_METRIC_REGISTRY) {
      assert.ok(PA6_SOURCE_TYPES.includes(metric.sourceType), `${metric.id} has invalid sourceType`);
      assert.ok(['launch', 'product', 'safety'].includes(metric.category), `${metric.id} has invalid category`);
      assert.equal(typeof metric.extraction, 'string');
      assert.ok(metric.extraction.length > 0);
    }
  });

  it('does not reference conceptual Hero tables in A6 or inherited pA4 metric patterns', () => {
    const pa6Check = assertNoConceptualTables();
    assert.equal(pa6Check.ok, true, `A6 offenders: ${pa6Check.offenders.join(', ')}`);

    const inheritedPatterns = [...REQUIRED_LAUNCH_METRICS, ...REQUIRED_SAFETY_METRICS]
      .map((metric) => metric.queryPattern || metric.description || '')
      .join('\n');

    assert.equal(/\b(cohort_members|hero_ledger)\b/i.test(inheritedPatterns), false);
  });
});

describe('Hero Mode pA6 schema extraction', () => {
  it('derives economy and Camp values from child_game_state, not telemetry-only mirrors', () => {
    const report = buildA6MetricsReport(makeHealthyInput(), {
      generatedAt: '2026-05-01T10:00:00.000Z',
    });

    assert.equal(report.sourceTruth.economyAuthority, "child_game_state.state_json where system_id='hero-mode'");
    assert.equal(report.sourceTruth.eventLogRole, 'telemetry mirror only');
    assert.equal(getMetric(report, 'pa6-launch-01').value, 1);
    assert.equal(getMetric(report, 'pa6-launch-02').value, 1);
    assert.equal(getMetric(report, 'pa6-launch-05').value, 2);
    assert.equal(getMetric(report, 'pa6-launch-06').value, 1);
    assert.equal(getMetric(report, 'pa6-launch-10').value, 1);
    assert.equal(getMetric(report, 'pa6-launch-12').value, 1);
    assert.equal(getMetric(report, 'pa6-safety-01').value, 0);
    assert.equal(getMetric(report, 'pa6-safety-02').value, 0);
    assert.equal(getMetric(report, 'pa6-safety-03').value, 0);
    assert.equal(getMetric(report, 'pa6-safety-06').value, 0);
    assert.equal(report.evidenceState, 'computed-from-supplied-export');
    assert.equal(report.privacy.status, 'passed');
    assert.equal(report.privacy.passed, true);
    assert.equal(report.decisionImpact.recommendedOutcome, 'HOLD AT CURRENT ROLLOUT PERCENTAGE');
  });

  it('marks an empty export as not evaluated rather than a privacy pass', () => {
    const report = buildA6MetricsReport({}, {
      generatedAt: '2026-05-01T10:00:00.000Z',
    });

    assert.equal(report.evidenceState, 'no-live-export-supplied');
    assert.equal(report.privacy.status, 'not-evaluated');
    assert.equal(report.privacy.passed, null);
    assert.equal(report.privacy.failureCount, 0);
    assert.equal(getMetric(report, 'pa6-safety-06').evidenceState, 'no-live-export-supplied');
    assert.ok(report.decisionImpact.reasons.some((reason) => reason.includes('No supplied live Hero production export rows')));
  });

  it('keeps client-only blind spots explicit instead of counting them as covered', () => {
    const report = buildA6MetricsReport(makeHealthyInput());
    const questShown = getMetric(report, 'pa6-launch-03');
    const route5xx = getMetric(report, 'pa6-launch-14');

    assert.equal(questShown.sourceType, 'not-observable-yet');
    assert.equal(questShown.value, null);
    assert.equal(route5xx.sourceType, 'not-observable-yet');
    assert.equal(route5xx.value, null);
    assert.ok(report.blindSpots.some((spot) => spot.id === 'pa6-launch-03'));
  });

  it('flags zero-tolerance safety breaches from authoritative Hero JSON', () => {
    const input = makeHealthyInput();
    const state = JSON.parse(input.child_game_state[0].state_json);
    state.economy.balance = -1;
    state.economy.ledger.push({
      entryId: 'award-2',
      idempotencyKey: 'award-key-1',
      type: 'daily-completion-award',
      amount: 100,
      balanceAfter: 200,
      learnerId: 'learner-1',
      dateKey: '2026-05-01',
      questId: 'quest-1',
    });
    input.child_game_state[0].state_json = JSON.stringify(state);

    const report = buildA6MetricsReport(input);
    assert.equal(getMetric(report, 'pa6-safety-01').value, 1);
    assert.equal(getMetric(report, 'pa6-safety-03').value, 1);
    assert.equal(report.decisionImpact.recommendedOutcome, 'ROLL BACK TO COHORT ONLY');
  });

  it('fails the raw-child-content safety metric when event_json contains forbidden child fields', () => {
    const input = makeHealthyInput();
    input.event_log.push({
      id: 'evt-privacy-1',
      learner_id: 'learner-1',
      subject_id: 'spelling',
      system_id: 'hero-mode',
      event_type: 'hero.task.completed',
      event_json: JSON.stringify({ data: { taskId: 'task2' }, rawAnswer: 'secret child text' }),
      created_at: '2026-05-01T09:30:00.000Z',
      actor_account_id: 'account-1',
    });

    const report = buildA6MetricsReport(input);
    assert.equal(report.privacy.passed, false);
    assert.equal(report.privacy.status, 'failed');
    assert.equal(report.privacy.failureCount, 1);
    assert.equal(getMetric(report, 'pa6-safety-06').value, 1);
    assert.equal(report.decisionImpact.recommendedOutcome, 'ROLL BACK TO COHORT ONLY');
  });

  it('fails the raw-child-content safety metric for nested childName fields', () => {
    const input = makeHealthyInput();
    input.event_log.push({
      id: 'evt-privacy-child-name',
      learner_id: 'learner-1',
      subject_id: 'grammar',
      system_id: 'hero-mode',
      event_type: 'hero.task.completed',
      event_json: JSON.stringify({ data: { taskId: 'task3', learner: { childName: 'Private name' } } }),
      created_at: '2026-05-01T09:31:00.000Z',
      actor_account_id: 'account-1',
    });

    const report = buildA6MetricsReport(input);
    assert.equal(report.privacy.passed, false);
    assert.equal(report.privacy.failureCount, 1);
    assert.equal(getMetric(report, 'pa6-safety-06').value, 1);
    assert.ok(report.privacy.violations.some((violation) => (
      Array.isArray(violation.violations) && violation.violations.includes('data.learner.childName')
    )));
  });

  it('fails closed when a Hero event row has malformed event_json', () => {
    const input = makeHealthyInput();
    input.event_log.push({
      id: 'evt-malformed-json',
      learner_id: 'learner-1',
      subject_id: 'grammar',
      system_id: 'hero-mode',
      event_type: 'hero.task.completed',
      event_json: '{not valid json',
      created_at: '2026-05-01T09:32:00.000Z',
      actor_account_id: 'account-1',
    });

    const report = buildA6MetricsReport(input);
    assert.equal(report.privacy.passed, false);
    assert.equal(report.privacy.status, 'failed');
    assert.equal(report.privacy.parseErrorCount, 1);
    assert.equal(report.privacy.failureCount, 1);
    assert.equal(getMetric(report, 'pa6-safety-06').value, 1);
    assert.equal(report.decisionImpact.recommendedOutcome, 'ROLL BACK TO COHORT ONLY');
  });
});
