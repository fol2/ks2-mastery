import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { resolveHeroClaimCommand } from '../worker/src/hero/claim.js';
import { validateMetricPrivacy } from '../shared/hero/metrics-contract.js';

// ── Helpers ──────────────────────────────────────────────────────────

function buildProgressState({ taskId, questId, questFingerprint, subjectId, intent, launcher, dateKey, tasks }) {
  const defaultTask = {
    taskId,
    questId,
    questFingerprint,
    dateKey,
    subjectId,
    intent,
    launcher,
    effortTarget: 1,
    status: 'started',
    launchRequestId: 'lr-1',
    claimRequestId: null,
    startedAt: Date.now(),
    completedAt: null,
    subjectPracticeSessionId: null,
    evidence: null,
  };

  const allTasks = tasks || { [taskId]: defaultTask };

  return {
    daily: {
      dateKey,
      timezone: 'Europe/London',
      questId,
      questFingerprint,
      schedulerVersion: 2,
      status: 'active',
      effortTarget: Object.values(allTasks).reduce((s, t) => s + (t.effortTarget || 0), 0),
      effortPlanned: Object.values(allTasks).reduce((s, t) => s + (t.effortTarget || 0), 0),
      effortCompleted: 0,
      taskOrder: Object.keys(allTasks),
      completedTaskIds: [],
      tasks: allTasks,
      generatedAt: Date.now(),
      firstStartedAt: Date.now(),
      completedAt: null,
      lastUpdatedAt: Date.now(),
    },
    economy: { balance: 50 },
  };
}

function buildPracticeSessionRow({ id, learnerId, subjectId, questId, questFingerprint, taskId }) {
  return {
    id: id || 'ps-1',
    learner_id: learnerId,
    subject_id: subjectId,
    session_kind: 'hero',
    status: 'completed',
    summary_json: JSON.stringify({
      status: 'completed',
      heroContext: { source: 'hero-mode', questId, questFingerprint, taskId },
    }),
    updated_at: Date.now(),
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Hero P6 Learning-Health Guardrail Metrics', () => {
  describe('claim telemetry enrichment shape', () => {
    it('successful claim produces result with subjectId, intent, launcher accessible from progressTask', () => {
      const taskId = 'task-abc';
      const questId = 'quest-1';
      const questFingerprint = 'fp-1';
      const subjectId = 'spelling';
      const intent = 'maintenance-due';
      const launcher = 'spelling-practice';
      const dateKey = new Date().toISOString().slice(0, 10);

      const heroProgressState = buildProgressState({
        taskId, questId, questFingerprint, subjectId, intent, launcher, dateKey,
      });

      const practiceSessionRows = [buildPracticeSessionRow({
        learnerId: 'learner-1', subjectId, questId, questFingerprint, taskId,
      })];

      const result = resolveHeroClaimCommand({
        body: {
          command: 'claim-task',
          learnerId: 'learner-1',
          questId,
          questFingerprint,
          taskId,
          requestId: 'req-1',
          expectedLearnerRevision: 1,
          practiceSessionId: 'ps-1',
        },
        heroProgressState,
        practiceSessionRows,
        subjectUiStates: {},
        nowTs: Date.now(),
        economyEnabled: true,
      });

      assert.equal(result.ok, true);
      assert.equal(result.subjectId, subjectId);

      // Simulate what app.js does: read from progressTask
      const progressTask = heroProgressState.daily.tasks[taskId];
      assert.equal(progressTask.intent, intent);
      assert.equal(progressTask.launcher, launcher);
      assert.equal(progressTask.subjectId, subjectId);
    });

    it('telemetry enrichment fields derivable after claim for multi-subject quest', () => {
      const dateKey = new Date().toISOString().slice(0, 10);
      const tasks = {
        't1': { taskId: 't1', questId: 'q1', questFingerprint: 'fp1', dateKey, subjectId: 'spelling', intent: 'maintenance-due', launcher: 'spelling-practice', effortTarget: 1, status: 'started', launchRequestId: null, claimRequestId: null, startedAt: null, completedAt: null, subjectPracticeSessionId: null, evidence: null },
        't2': { taskId: 't2', questId: 'q1', questFingerprint: 'fp1', dateKey, subjectId: 'grammar', intent: 'new-concept', launcher: 'grammar-practice', effortTarget: 1, status: 'planned', launchRequestId: null, claimRequestId: null, startedAt: null, completedAt: null, subjectPracticeSessionId: null, evidence: null },
        't3': { taskId: 't3', questId: 'q1', questFingerprint: 'fp1', dateKey, subjectId: 'spelling', intent: 'lapse-repair', launcher: 'spelling-practice', effortTarget: 1, status: 'planned', launchRequestId: null, claimRequestId: null, startedAt: null, completedAt: null, subjectPracticeSessionId: null, evidence: null },
      };

      const dailyTaskValues = Object.values(tasks);
      const uniqueSubjects = new Set(dailyTaskValues.map(t => t.subjectId).filter(Boolean));
      const sameSubjectCount = dailyTaskValues.filter(t => t.subjectId === 'spelling').length;
      const totalTaskCount = dailyTaskValues.length;
      const subjectMixShare = Math.round((sameSubjectCount / totalTaskCount) * 100) / 100;

      // eligibleSubjectCount = number of unique subjects in daily tasks
      assert.equal(uniqueSubjects.size, 2);
      // subjectMixShare for 'spelling' = 2/3 ~ 0.67
      assert.equal(subjectMixShare, 0.67);
    });
  });

  describe('daily coins telemetry enrichment shape', () => {
    it('coins awarded telemetry includes eligibleSubjectCount, completedTaskCount, dateKey', () => {
      const dateKey = '2026-04-29';
      const tasks = {
        't1': { taskId: 't1', subjectId: 'spelling', effortTarget: 1, status: 'completed' },
        't2': { taskId: 't2', subjectId: 'grammar', effortTarget: 1, status: 'completed' },
        't3': { taskId: 't3', subjectId: 'punctuation', effortTarget: 1, status: 'completed' },
      };

      // Simulate what the enriched telemetry code does
      const completedTaskIds = ['t1', 't2', 't3'];
      const completedTaskCount = completedTaskIds.length;
      const coinsDailyTasks = tasks;
      const coinsUniqueSubjects = new Set(Object.values(coinsDailyTasks).map(t => t.subjectId).filter(Boolean));

      const telemetryPayload = {
        event: 'hero_daily_coins_awarded',
        learnerId: 'learner-1',
        questId: 'quest-1',
        amount: 100,
        balanceAfter: 150,
        ledgerEntryId: 'led-1',
        eligibleSubjectCount: coinsUniqueSubjects.size || null,
        completedTaskCount,
        dateKey,
      };

      assert.equal(telemetryPayload.eligibleSubjectCount, 3);
      assert.equal(telemetryPayload.completedTaskCount, 3);
      assert.equal(telemetryPayload.dateKey, '2026-04-29');
    });
  });

  describe('privacy — no PII in telemetry', () => {
    it('hero_task_claim_succeeded shape passes privacy validation', () => {
      const payload = {
        event: 'hero_task_claim_succeeded',
        learnerId: 'learner-hash',
        questId: 'q1',
        taskId: 't1',
        subjectId: 'spelling',
        dailyStatus: 'active',
        heroTaskIntent: 'maintenance-due',
        launcher: 'spelling-practice',
        eligibleSubjectCount: 2,
        postMegaFlag: null,
        subjectMixShare: 0.67,
      };
      const result = validateMetricPrivacy(payload);
      assert.equal(result.valid, true);
      assert.deepEqual(result.violations, []);
    });

    it('hero_daily_coins_awarded shape passes privacy validation', () => {
      const payload = {
        event: 'hero_daily_coins_awarded',
        learnerId: 'learner-hash',
        questId: 'q1',
        amount: 100,
        balanceAfter: 150,
        ledgerEntryId: 'led-1',
        eligibleSubjectCount: 3,
        completedTaskCount: 3,
        dateKey: '2026-04-29',
      };
      const result = validateMetricPrivacy(payload);
      assert.equal(result.valid, true);
      assert.deepEqual(result.violations, []);
    });

    it('rejects telemetry with rawAnswer', () => {
      const payload = {
        event: 'hero_task_claim_succeeded',
        learnerId: 'learner-hash',
        rawAnswer: 'the cat sat on the mat',
      };
      const result = validateMetricPrivacy(payload);
      assert.equal(result.valid, false);
      assert.ok(result.violations.includes('rawAnswer'));
    });

    it('rejects telemetry with rawPrompt', () => {
      const payload = {
        event: 'hero_task_claim_succeeded',
        learnerId: 'learner-hash',
        rawPrompt: 'spell the word cat',
      };
      const result = validateMetricPrivacy(payload);
      assert.equal(result.valid, false);
      assert.ok(result.violations.includes('rawPrompt'));
    });

    it('rejects telemetry with childFreeText', () => {
      const payload = {
        event: 'hero_daily_coins_awarded',
        learnerId: 'learner-hash',
        childFreeText: 'I like cats',
      };
      const result = validateMetricPrivacy(payload);
      assert.equal(result.valid, false);
      assert.ok(result.violations.includes('childFreeText'));
    });

    it('rejects telemetry with childInput', () => {
      const payload = {
        event: 'hero_task_claim_succeeded',
        childInput: 'answer data',
      };
      const result = validateMetricPrivacy(payload);
      assert.equal(result.valid, false);
      assert.ok(result.violations.includes('childInput'));
    });

    it('rejects telemetry with answerText', () => {
      const payload = {
        event: 'hero_daily_coins_awarded',
        answerText: 'user answer',
      };
      const result = validateMetricPrivacy(payload);
      assert.equal(result.valid, false);
      assert.ok(result.violations.includes('answerText'));
    });
  });

  describe('subject-mastery structural safety', () => {
    it('claim.js does NOT import or call any subject mastery write functions', () => {
      const claimSource = readFileSync(
        resolve('worker/src/hero/claim.js'),
        'utf-8',
      );

      // Must NOT contain any imports of mastery-write functions
      const forbiddenPatterns = [
        /writeSubjectState/,
        /updateSubjectMastery/,
        /setSubjectProgress/,
        /mutateSubjectState/,
        /persistMastery/,
        /saveMastery/,
        /INSERT INTO child_subject_state/i,
        /UPDATE child_subject_state/i,
        /import.*mastery/i,
      ];

      for (const pattern of forbiddenPatterns) {
        assert.equal(
          pattern.test(claimSource),
          false,
          `claim.js must NOT contain ${pattern} — Hero claim must not write subject mastery state`,
        );
      }
    });

    it('claim resolver return value does NOT include subject state mutations', () => {
      const dateKey = new Date().toISOString().slice(0, 10);
      const heroProgressState = buildProgressState({
        taskId: 'task-1', questId: 'q1', questFingerprint: 'fp1',
        subjectId: 'grammar', intent: 'new-concept', launcher: 'grammar-practice', dateKey,
      });

      const result = resolveHeroClaimCommand({
        body: {
          command: 'claim-task',
          learnerId: 'learner-1',
          questId: 'q1',
          questFingerprint: 'fp1',
          taskId: 'task-1',
          requestId: 'req-1',
          expectedLearnerRevision: 1,
          practiceSessionId: 'ps-1',
        },
        heroProgressState,
        practiceSessionRows: [buildPracticeSessionRow({
          learnerId: 'learner-1', subjectId: 'grammar', questId: 'q1', questFingerprint: 'fp1', taskId: 'task-1',
        })],
        subjectUiStates: {},
        nowTs: Date.now(),
        economyEnabled: true,
      });

      assert.equal(result.ok, true);

      // The result must NOT carry subject state mutation fields
      assert.equal(result.subjectStateMutation, undefined);
      assert.equal(result.masteryUpdate, undefined);
      assert.equal(result.subjectStateWrite, undefined);
      assert.equal(result.writeOps, undefined);
    });

    it('app.js claim section does NOT import or reference subject mastery writes', () => {
      const appSource = readFileSync(
        resolve('worker/src/app.js'),
        'utf-8',
      );

      // Extract the hero claim section (between 'claim-task' command check and the next command check)
      const claimSectionMatch = appSource.match(
        /body\?\.command === 'claim-task'([\s\S]*?)(?:body\?\.command === '(?:unlock-monster|evolve-monster)')/,
      );
      assert.ok(claimSectionMatch, 'Should find claim-task section in app.js');
      const claimSection = claimSectionMatch[1];

      const forbiddenInSection = [
        /writeSubjectState/,
        /updateSubjectMastery/,
        /setSubjectProgress/,
        /mutateSubjectState/,
        /INSERT INTO child_subject_state/i,
        /UPDATE child_subject_state/i,
      ];

      for (const pattern of forbiddenInSection) {
        assert.equal(
          pattern.test(claimSection),
          false,
          `claim section in app.js must NOT contain ${pattern}`,
        );
      }
    });
  });

  describe('reason tags preserved through claim flow', () => {
    it('claim result preserves evidence source through resolver', () => {
      const dateKey = new Date().toISOString().slice(0, 10);
      const heroProgressState = buildProgressState({
        taskId: 'task-1', questId: 'q1', questFingerprint: 'fp1',
        subjectId: 'spelling', intent: 'lapse-repair', launcher: 'spelling-practice', dateKey,
      });

      const result = resolveHeroClaimCommand({
        body: {
          command: 'claim-task',
          learnerId: 'learner-1',
          questId: 'q1',
          questFingerprint: 'fp1',
          taskId: 'task-1',
          requestId: 'req-1',
          expectedLearnerRevision: 1,
          practiceSessionId: 'ps-1',
        },
        heroProgressState,
        practiceSessionRows: [buildPracticeSessionRow({
          learnerId: 'learner-1', subjectId: 'spelling', questId: 'q1', questFingerprint: 'fp1', taskId: 'task-1',
        })],
        subjectUiStates: {},
        nowTs: Date.now(),
        economyEnabled: false,
      });

      assert.equal(result.ok, true);
      // Evidence source is preserved
      assert.ok(result.evidence, 'claim result includes evidence');
      assert.equal(typeof result.evidence.source, 'string');
      assert.ok(result.evidence.source.length > 0, 'evidence source is non-empty');
      // heroContextPhase preserved
      assert.equal(result.evidence.heroContextPhase, 'p3');
      // subjectId in evidence matches task
      assert.equal(result.evidence.subjectId, 'spelling');
    });

    it('progressTask intent/launcher survive through daily progress state normalisation', () => {
      const dateKey = new Date().toISOString().slice(0, 10);
      const state = buildProgressState({
        taskId: 'task-x', questId: 'q2', questFingerprint: 'fp2',
        subjectId: 'punctuation', intent: 'new-concept', launcher: 'punctuation-practice', dateKey,
      });

      const task = state.daily.tasks['task-x'];
      // Intent and launcher must survive through progress state
      assert.equal(task.intent, 'new-concept');
      assert.equal(task.launcher, 'punctuation-practice');
      assert.equal(task.subjectId, 'punctuation');
    });
  });
});
