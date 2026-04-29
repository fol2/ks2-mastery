import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runCalibration } from '../scripts/grammar-qg-calibrate.mjs';
import { buildTemplateHealthReport } from '../scripts/grammar-qg-health-report.mjs';

// ─── Fixtures ──────────────────────────────────────────────────────────────

function makeExpandedEvent(overrides = {}) {
  return {
    templateId: 'tpl-possessive-01',
    conceptId: 'possessive-apostrophe',
    conceptIds: ['possessive-apostrophe'],
    timestamp: '2026-04-29T10:00:00Z',
    correct: true,
    tags: [],
    firstAttemptIndependent: true,
    supportUsed: false,
    wasRetry: false,
    conceptStatusBefore: 'weak',
    conceptStatusAfter: 'secure',
    mode: 'practice',
    ...overrides,
  };
}

/**
 * Generate N events with specific parameters for threshold testing.
 */
function generateEvents(count, overrides = {}) {
  return Array.from({ length: count }, (_, i) =>
    makeExpandedEvent({ timestamp: `2026-04-29T${String(10 + (i % 12)).padStart(2, '0')}:00:00Z`, ...overrides }),
  );
}

// ─── U4: Calibration runner tests ──────────────────────────────────────────

describe('Grammar QG P7 — Calibration Runner', () => {
  describe('full pipeline produces all outputs', () => {
    it('generates all 4 output objects with provenance', () => {
      const events = generateEvents(15);
      const result = runCalibration(events);

      assert.ok(result.healthReport);
      assert.ok(result.mixedTransferReport);
      assert.ok(result.retentionReport);
      assert.ok(result.classifications);

      // Check provenance on each
      assert.equal(result.healthReport.provenance.calibrationSchemaVersion, 'grammar-qg-p7-calibration-v1');
      assert.equal(result.mixedTransferReport.provenance.calibrationSchemaVersion, 'grammar-qg-p7-calibration-v1');
      assert.equal(result.retentionReport.provenance.calibrationSchemaVersion, 'grammar-qg-p7-calibration-v1');
      assert.equal(result.classifications.provenance.calibrationSchemaVersion, 'grammar-qg-p7-calibration-v1');
    });

    it('schema version present in all outputs', () => {
      const events = generateEvents(5);
      const result = runCalibration(events);
      const stringified = JSON.stringify(result);
      const matches = stringified.match(/grammar-qg-p7-calibration-v1/g);
      assert.ok(matches.length >= 4, 'schema version must appear in all 4 outputs');
    });
  });

  describe('transfer_gap detection', () => {
    it('flags transfer_gap when local >70% AND mixed <50% AND >=10 attempts each', () => {
      const localEvents = generateEvents(12, {
        conceptId: 'concept-a',
        correct: true, // 100% local
        tags: [],
      });
      const mixedEvents = generateEvents(12, {
        conceptId: 'concept-a',
        correct: false, // 0% mixed
        tags: ['mixed-transfer'],
      });
      const events = [...localEvents, ...mixedEvents];
      const result = runCalibration(events);

      assert.ok(result.classifications.transferGaps['concept-a'], 'concept-a must be flagged as transfer_gap');
      assert.ok(result.classifications.transferGaps['concept-a'].localSuccessRate > 0.7);
      assert.ok(result.classifications.transferGaps['concept-a'].mixedSuccessRate < 0.5);
    });

    it('does NOT flag transfer_gap with 0 mixed-transfer attempts', () => {
      const localEvents = generateEvents(15, {
        conceptId: 'concept-b',
        correct: true,
        tags: [],
      });
      // No mixed-transfer events at all
      const result = runCalibration(localEvents);
      assert.equal(result.classifications.transferGaps['concept-b'], undefined);
    });

    it('does NOT flag transfer_gap with <10 local attempts', () => {
      const localEvents = generateEvents(8, {
        conceptId: 'concept-c',
        correct: true,
        tags: [],
      });
      const mixedEvents = generateEvents(12, {
        conceptId: 'concept-c',
        correct: false,
        tags: ['mixed-transfer'],
      });
      const events = [...localEvents, ...mixedEvents];
      const result = runCalibration(events);
      assert.equal(result.classifications.transferGaps['concept-c'], undefined);
    });

    it('does NOT flag transfer_gap with <10 mixed attempts', () => {
      const localEvents = generateEvents(12, {
        conceptId: 'concept-d',
        correct: true,
        tags: [],
      });
      const mixedEvents = generateEvents(8, {
        conceptId: 'concept-d',
        correct: false,
        tags: ['mixed-transfer'],
      });
      const events = [...localEvents, ...mixedEvents];
      const result = runCalibration(events);
      assert.equal(result.classifications.transferGaps['concept-d'], undefined);
    });
  });

  describe('retention_gap detection', () => {
    it('flags retention_gap when lapse >25% with >=30 secured attempts', () => {
      // 20 correct + 12 incorrect = 32 total, lapse rate = 12/32 = 37.5%
      const retainedEvents = generateEvents(20, {
        conceptId: 'concept-retain',
        conceptStatusBefore: 'secured',
        correct: true,
      });
      const lapsedEvents = generateEvents(12, {
        conceptId: 'concept-retain',
        conceptStatusBefore: 'secured',
        correct: false,
      });
      const events = [...retainedEvents, ...lapsedEvents];
      const result = runCalibration(events);

      assert.ok(result.classifications.retentionGaps['concept-retain'], 'must be flagged as retention_gap');
      assert.ok(result.classifications.retentionGaps['concept-retain'].lapseRate > 0.25);
    });

    it('does NOT flag retention_gap with <30 secured attempts', () => {
      const retainedEvents = generateEvents(15, {
        conceptId: 'concept-few',
        conceptStatusBefore: 'secured',
        correct: true,
      });
      const lapsedEvents = generateEvents(10, {
        conceptId: 'concept-few',
        conceptStatusBefore: 'secured',
        correct: false,
      });
      const events = [...retainedEvents, ...lapsedEvents];
      const result = runCalibration(events);
      assert.equal(result.classifications.retentionGaps['concept-few'], undefined);
    });
  });

  describe('weak metrics distinction', () => {
    it('computes weakCorrectAttemptRate as correct/total weak attempts', () => {
      const weakCorrect = generateEvents(6, {
        conceptId: 'concept-w',
        conceptStatusBefore: 'weak',
        correct: true,
        conceptStatusAfter: 'weak', // Stays weak despite correct
      });
      const weakIncorrect = generateEvents(4, {
        conceptId: 'concept-w',
        conceptStatusBefore: 'weak',
        correct: false,
        conceptStatusAfter: 'weak',
      });
      const events = [...weakCorrect, ...weakIncorrect];
      const result = runCalibration(events);

      const wm = result.classifications.weakMetrics['concept-w'];
      assert.ok(wm);
      assert.equal(wm.weakCorrectAttemptRate, 0.6); // 6/10
    });

    it('computes weakToSecureRecoveryRate as weak→secure transitions / total weak', () => {
      const weakToSecure = generateEvents(3, {
        conceptId: 'concept-wr',
        conceptStatusBefore: 'weak',
        correct: true,
        conceptStatusAfter: 'secured',
      });
      const weakStays = generateEvents(7, {
        conceptId: 'concept-wr',
        conceptStatusBefore: 'weak',
        correct: true,
        conceptStatusAfter: 'weak',
      });
      const events = [...weakToSecure, ...weakStays];
      const result = runCalibration(events);

      const wm = result.classifications.weakMetrics['concept-wr'];
      assert.ok(wm);
      assert.equal(wm.weakToSecureRecoveryRate, 0.3); // 3/10
      assert.equal(wm.weakCorrectAttemptRate, 1.0); // 10/10 all correct
    });

    it('distinguishes weakCorrectAttemptRate from weakToSecureRecoveryRate', () => {
      // All correct but only some transition to secure
      const events = [
        ...generateEvents(5, {
          conceptId: 'concept-distinct',
          conceptStatusBefore: 'weak',
          correct: true,
          conceptStatusAfter: 'secure',
        }),
        ...generateEvents(5, {
          conceptId: 'concept-distinct',
          conceptStatusBefore: 'weak',
          correct: true,
          conceptStatusAfter: 'weak',
        }),
      ];
      const result = runCalibration(events);
      const wm = result.classifications.weakMetrics['concept-distinct'];
      assert.equal(wm.weakCorrectAttemptRate, 1.0); // all correct
      assert.equal(wm.weakToSecureRecoveryRate, 0.5); // only half transition
    });
  });

  describe('numeric createdAt normalisation', () => {
    it('processes events with numeric createdAt (epoch ms) correctly', () => {
      const epochMs = new Date('2026-04-29T10:00:00Z').getTime();
      const events = generateEvents(12, {
        conceptId: 'concept-epoch',
        timestamp: undefined, // Remove timestamp
        createdAt: epochMs,
      });
      // Remove timestamp field entirely
      for (const e of events) {
        delete e.timestamp;
        e.createdAt = epochMs;
      }

      const result = runCalibration(events);
      // Should not skip — the health report should process them
      assert.ok(result.healthReport.templates['tpl-possessive-01']);
      assert.ok(result.healthReport.templates['tpl-possessive-01'].attemptCount >= 12);
    });

    it('does not skip events that only have numeric createdAt', () => {
      const epochMs = new Date('2026-04-29T12:00:00Z').getTime();
      const events = [
        {
          templateId: 'tpl-numeric',
          conceptId: 'concept-num',
          conceptIds: ['concept-num'],
          createdAt: epochMs,
          correct: true,
          tags: [],
          firstAttemptIndependent: true,
          conceptStatusBefore: 'new',
        },
      ];
      const result = runCalibration(events);
      assert.ok(result.healthReport.templates['tpl-numeric']);
      assert.equal(result.healthReport.templates['tpl-numeric'].attemptCount, 1);
    });
  });

  describe('empty input handling', () => {
    it('empty input produces all insufficient_data', () => {
      const result = runCalibration([]);
      assert.deepEqual(result.classifications.transferGaps, {});
      assert.deepEqual(result.classifications.retentionGaps, {});
      assert.deepEqual(result.classifications.weakMetrics, {});
      assert.deepEqual(result.healthReport.templates, {});
      assert.deepEqual(result.retentionReport.concepts, {});
    });
  });

  describe('P6 health classifications still work', () => {
    it('classifies templates via existing buildTemplateHealthReport', () => {
      // Directly test the P6 health report with standard fixture
      const events = [
        ...generateEvents(50, {
          templateId: 'tpl-easy',
          timestamp: '2026-04-29T10:00:00Z',
          correct: true,
          firstAttemptIndependent: true,
          elapsedMs: 1500,
        }),
        ...generateEvents(50, {
          templateId: 'tpl-hard',
          timestamp: '2026-04-29T10:00:00Z',
          correct: false,
          firstAttemptIndependent: true,
          elapsedMs: 8000,
        }),
      ];

      const report = buildTemplateHealthReport(events);
      assert.equal(report.templates['tpl-easy'].classification, 'too_easy');
      assert.equal(report.templates['tpl-hard'].classification, 'too_hard');
    });

    it('healthy classification for moderate success rate', () => {
      // 70% success rate
      const correct = generateEvents(35, {
        templateId: 'tpl-moderate',
        timestamp: '2026-04-29T10:00:00Z',
        correct: true,
        firstAttemptIndependent: true,
        elapsedMs: 5000,
      });
      const incorrect = generateEvents(15, {
        templateId: 'tpl-moderate',
        timestamp: '2026-04-29T10:00:00Z',
        correct: false,
        firstAttemptIndependent: true,
        elapsedMs: 5000,
      });
      const report = buildTemplateHealthReport([...correct, ...incorrect]);
      assert.equal(report.templates['tpl-moderate'].classification, 'healthy');
    });
  });
});
