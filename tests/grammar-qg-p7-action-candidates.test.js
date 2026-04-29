import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { generateActionCandidates } from '../scripts/grammar-qg-action-candidates.mjs';
import { decideMixedTransferMaturity } from '../scripts/grammar-qg-mixed-transfer-decision.mjs';
import { decideRetentionMaintenance } from '../scripts/grammar-qg-retention-decision.mjs';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeHealthReport(templateOverrides = {}) {
  const defaults = {
    'tpl-possessive-01': {
      attemptCount: 120,
      independentFirstAttemptSuccessRate: 0.75,
      supportedSuccessRate: 0.6,
      wrongAfterSupportRate: 0.15,
      medianElapsedBucket: '5-10s',
      retrySuccessRate: 0.5,
      retryAttemptCount: 20,
      partialCreditRate: 0.1,
      skipEmptyRate: 0.02,
      confidence: 'high',
      classification: 'healthy',
    },
  };
  return { templates: { ...defaults, ...templateOverrides }, concepts: {}, meta: {} };
}

function makeMixedTransferReport(templateOverrides = {}) {
  return { templates: { ...templateOverrides }, meta: {} };
}

function makeRetentionReport(conceptOverrides = {}) {
  return { concepts: { ...conceptOverrides }, meta: {} };
}

// ─── U5: Action Candidate Generation ─────────────────────────────────────────

describe('Grammar QG P7 — U5: Action Candidate Generation', () => {
  describe('9-category classification', () => {
    it('healthy template → keep', () => {
      const health = makeHealthReport({
        'tpl-healthy-01': {
          attemptCount: 120,
          independentFirstAttemptSuccessRate: 0.75,
          supportedSuccessRate: 0.6,
          wrongAfterSupportRate: 0.15,
          medianElapsedBucket: '5-10s',
          retrySuccessRate: 0.5,
          retryAttemptCount: 10,
          confidence: 'high',
          classification: 'healthy',
        },
      });
      const result = generateActionCandidates(health, makeMixedTransferReport(), makeRetentionReport());
      const candidate = result.candidates.find((c) => c.templateId === 'tpl-healthy-01');
      assert.equal(candidate.category, 'keep');
    });

    it('too_easy + >100 attempts → warm_up_only', () => {
      const health = makeHealthReport({
        'tpl-easy-01': {
          attemptCount: 150,
          independentFirstAttemptSuccessRate: 0.98,
          supportedSuccessRate: 0.99,
          wrongAfterSupportRate: 0.01,
          medianElapsedBucket: '<2s',
          retrySuccessRate: 0.9,
          retryAttemptCount: 5,
          confidence: 'high',
          classification: 'too_easy',
        },
      });
      const result = generateActionCandidates(health, makeMixedTransferReport(), makeRetentionReport());
      const candidate = result.candidates.find((c) => c.templateId === 'tpl-easy-01');
      assert.equal(candidate.category, 'warm_up_only');
    });

    it('ambiguous classification → review_wording', () => {
      const health = makeHealthReport({
        'tpl-ambiguous-01': {
          attemptCount: 80,
          independentFirstAttemptSuccessRate: 0.5,
          supportedSuccessRate: 0.6,
          wrongAfterSupportRate: 0.45,
          medianElapsedBucket: '10-20s',
          retrySuccessRate: 0.4,
          retryAttemptCount: 15,
          confidence: 'medium',
          classification: 'ambiguous',
        },
      });
      const result = generateActionCandidates(health, makeMixedTransferReport(), makeRetentionReport());
      const candidate = result.candidates.find((c) => c.templateId === 'tpl-ambiguous-01');
      assert.equal(candidate.category, 'review_wording');
    });

    it('high wrongAfterSupportRate (>40%) → review_wording even if not classified ambiguous', () => {
      const health = makeHealthReport({
        'tpl-wrongsupport-01': {
          attemptCount: 60,
          independentFirstAttemptSuccessRate: 0.55,
          supportedSuccessRate: 0.4,
          wrongAfterSupportRate: 0.45,
          medianElapsedBucket: '5-10s',
          retrySuccessRate: 0.5,
          retryAttemptCount: 10,
          confidence: 'medium',
          classification: 'healthy',
        },
      });
      const result = generateActionCandidates(health, makeMixedTransferReport(), makeRetentionReport());
      const candidate = result.candidates.find((c) => c.templateId === 'tpl-wrongsupport-01');
      assert.equal(candidate.category, 'review_wording');
    });

    it('transfer_gap → add_bridge_practice', () => {
      const health = makeHealthReport({
        'tpl-transfer-01': {
          attemptCount: 80,
          independentFirstAttemptSuccessRate: 0.8,
          supportedSuccessRate: 0.7,
          wrongAfterSupportRate: 0.1,
          medianElapsedBucket: '5-10s',
          retrySuccessRate: 0.6,
          retryAttemptCount: 8,
          confidence: 'medium',
          classification: 'healthy',
        },
      });
      const mt = makeMixedTransferReport({
        'tpl-transfer-01': {
          attemptCount: 30,
          successRate: 0.35,
          conceptLocalSuccessRate: 0.85,
          independentRate: 0.3,
          transferGapFlagged: true,
        },
      });
      const result = generateActionCandidates(health, mt, makeRetentionReport());
      const candidate = result.candidates.find((c) => c.templateId === 'tpl-transfer-01');
      assert.equal(candidate.category, 'add_bridge_practice');
    });

    it('too_hard + high confidence → reduce_scheduler_weight', () => {
      const health = makeHealthReport({
        'tpl-hard-01': {
          attemptCount: 120,
          independentFirstAttemptSuccessRate: 0.25,
          supportedSuccessRate: 0.4,
          wrongAfterSupportRate: 0.3,
          medianElapsedBucket: '>20s',
          retrySuccessRate: 0.2,
          retryAttemptCount: 30,
          confidence: 'high',
          classification: 'too_hard',
        },
      });
      const result = generateActionCandidates(health, makeMixedTransferReport(), makeRetentionReport());
      const candidate = result.candidates.find((c) => c.templateId === 'tpl-hard-01');
      assert.equal(candidate.category, 'reduce_scheduler_weight');
    });

    it('support_dependent + >100 attempts → retire_candidate', () => {
      const health = makeHealthReport({
        'tpl-supportdep-01': {
          attemptCount: 150,
          independentFirstAttemptSuccessRate: 0.3,
          supportedSuccessRate: 0.85,
          wrongAfterSupportRate: 0.1,
          medianElapsedBucket: '10-20s',
          retrySuccessRate: 0.4,
          retryAttemptCount: 25,
          confidence: 'high',
          classification: 'support_dependent',
        },
      });
      const result = generateActionCandidates(health, makeMixedTransferReport(), makeRetentionReport());
      const candidate = result.candidates.find((c) => c.templateId === 'tpl-supportdep-01');
      assert.equal(candidate.category, 'retire_candidate');
    });

    it('retention_gap → increase_maintenance', () => {
      const health = makeHealthReport({
        'tpl-retain-01': {
          attemptCount: 80,
          independentFirstAttemptSuccessRate: 0.7,
          supportedSuccessRate: 0.6,
          wrongAfterSupportRate: 0.15,
          medianElapsedBucket: '5-10s',
          retrySuccessRate: 0.5,
          retryAttemptCount: 10,
          confidence: 'medium',
          classification: 'healthy',
          conceptId: 'retain-concept',
        },
      });
      const retention = makeRetentionReport({
        'retain-concept': {
          securedAttemptCount: 50,
          retainedPassRate: 0.6,
          lapseRate: 0.4,
          classification: 'retention_risk',
        },
      });
      const result = generateActionCandidates(health, makeMixedTransferReport(), retention);
      const maintenanceCandidates = result.candidates.filter((c) => c.category === 'increase_maintenance');
      assert.ok(maintenanceCandidates.length > 0, 'at least one increase_maintenance candidate expected');
    });

    it('below 30 attempts → insufficient_data (never non-keep)', () => {
      const health = makeHealthReport({
        'tpl-low-01': {
          attemptCount: 15,
          independentFirstAttemptSuccessRate: 0.2,
          supportedSuccessRate: 0.9,
          wrongAfterSupportRate: 0.5,
          medianElapsedBucket: '>20s',
          retrySuccessRate: 0.1,
          retryAttemptCount: 5,
          confidence: 'low',
          classification: 'too_hard',
        },
      });
      const result = generateActionCandidates(health, makeMixedTransferReport(), makeRetentionReport());
      const candidate = result.candidates.find((c) => c.templateId === 'tpl-low-01');
      assert.equal(candidate.category, 'insufficient_data');
    });

    it('every candidate has non-empty rationale string', () => {
      const health = makeHealthReport({
        'tpl-a': { attemptCount: 120, independentFirstAttemptSuccessRate: 0.75, wrongAfterSupportRate: 0.1, medianElapsedBucket: '5-10s', retrySuccessRate: 0.5, retryAttemptCount: 10, confidence: 'high', classification: 'healthy' },
        'tpl-b': { attemptCount: 15, independentFirstAttemptSuccessRate: 0.9, wrongAfterSupportRate: 0.05, medianElapsedBucket: '<2s', retrySuccessRate: 0.8, retryAttemptCount: 2, confidence: 'low', classification: 'too_easy' },
        'tpl-c': { attemptCount: 200, independentFirstAttemptSuccessRate: 0.98, wrongAfterSupportRate: 0.01, medianElapsedBucket: '<2s', retrySuccessRate: 0.9, retryAttemptCount: 3, confidence: 'high', classification: 'too_easy' },
      });
      const result = generateActionCandidates(health, makeMixedTransferReport(), makeRetentionReport());
      for (const candidate of result.candidates) {
        assert.ok(typeof candidate.rationale === 'string', `rationale must be a string for ${candidate.templateId}`);
        assert.ok(candidate.rationale.length > 0, `rationale must be non-empty for ${candidate.templateId}`);
      }
    });

    it('expand_case_bank when retry rate >30% with >50 attempts', () => {
      const health = makeHealthReport({
        'tpl-retry-heavy-01': {
          attemptCount: 80,
          independentFirstAttemptSuccessRate: 0.6,
          supportedSuccessRate: 0.5,
          wrongAfterSupportRate: 0.15,
          medianElapsedBucket: '5-10s',
          retrySuccessRate: 0.5,
          retryAttemptCount: 30, // 30/80 = 37.5%
          confidence: 'medium',
          classification: 'healthy',
        },
      });
      const result = generateActionCandidates(health, makeMixedTransferReport(), makeRetentionReport());
      const candidate = result.candidates.find((c) => c.templateId === 'tpl-retry-heavy-01');
      assert.equal(candidate.category, 'expand_case_bank');
    });

    it('rewrite_distractors when support_dependent with ≤100 attempts', () => {
      const health = makeHealthReport({
        'tpl-distractor-01': {
          attemptCount: 60,
          independentFirstAttemptSuccessRate: 0.35,
          supportedSuccessRate: 0.85,
          wrongAfterSupportRate: 0.1,
          medianElapsedBucket: '10-20s',
          retrySuccessRate: 0.4,
          retryAttemptCount: 10,
          confidence: 'medium',
          classification: 'support_dependent',
        },
      });
      const result = generateActionCandidates(health, makeMixedTransferReport(), makeRetentionReport());
      const candidate = result.candidates.find((c) => c.templateId === 'tpl-distractor-01');
      assert.equal(candidate.category, 'rewrite_distractors');
    });
  });

  describe('confidence threshold enforcement', () => {
    it('29 attempts always yields insufficient_data regardless of other signals', () => {
      const health = makeHealthReport({
        'tpl-few-01': {
          attemptCount: 29,
          independentFirstAttemptSuccessRate: 0.1,
          supportedSuccessRate: 0.9,
          wrongAfterSupportRate: 0.6,
          medianElapsedBucket: '>20s',
          retrySuccessRate: 0.05,
          retryAttemptCount: 10,
          confidence: 'low',
          classification: 'too_hard',
        },
      });
      const result = generateActionCandidates(health, makeMixedTransferReport(), makeRetentionReport());
      const candidate = result.candidates.find((c) => c.templateId === 'tpl-few-01');
      assert.equal(candidate.category, 'insufficient_data');
    });

    it('30 attempts is minimum for non-keep classification', () => {
      const health = makeHealthReport({
        'tpl-threshold-01': {
          attemptCount: 30,
          independentFirstAttemptSuccessRate: 0.2,
          supportedSuccessRate: 0.5,
          wrongAfterSupportRate: 0.3,
          medianElapsedBucket: '>20s',
          retrySuccessRate: 0.1,
          retryAttemptCount: 5,
          confidence: 'medium',
          classification: 'too_hard',
        },
      });
      const result = generateActionCandidates(health, makeMixedTransferReport(), makeRetentionReport());
      const candidate = result.candidates.find((c) => c.templateId === 'tpl-threshold-01');
      assert.notEqual(candidate.category, 'insufficient_data');
    });
  });

  describe('no mastery-write imports', () => {
    it('action-candidates script has no mastery-write/writeReward/writeStar/updateMastery/submitScore imports', () => {
      const scriptPath = path.resolve(import.meta.dirname, '..', 'scripts', 'grammar-qg-action-candidates.mjs');
      const content = readFileSync(scriptPath, 'utf-8');
      assert.ok(!content.includes('mastery-write'), 'must not import mastery-write');
      assert.ok(!content.includes('writeReward'), 'must not import writeReward');
      assert.ok(!content.includes('writeStar'), 'must not import writeStar');
      assert.ok(!content.includes('updateMastery'), 'must not import updateMastery');
      assert.ok(!content.includes('submitScore'), 'must not import submitScore');
    });

    it('mixed-transfer-decision script has no mastery-write imports', () => {
      const scriptPath = path.resolve(import.meta.dirname, '..', 'scripts', 'grammar-qg-mixed-transfer-decision.mjs');
      const content = readFileSync(scriptPath, 'utf-8');
      assert.ok(!content.includes('mastery-write'), 'must not import mastery-write');
      assert.ok(!content.includes('writeReward'), 'must not import writeReward');
      assert.ok(!content.includes('writeStar'), 'must not import writeStar');
      assert.ok(!content.includes('updateMastery'), 'must not import updateMastery');
      assert.ok(!content.includes('submitScore'), 'must not import submitScore');
    });

    it('retention-decision script has no mastery-write imports', () => {
      const scriptPath = path.resolve(import.meta.dirname, '..', 'scripts', 'grammar-qg-retention-decision.mjs');
      const content = readFileSync(scriptPath, 'utf-8');
      assert.ok(!content.includes('mastery-write'), 'must not import mastery-write');
      assert.ok(!content.includes('writeReward'), 'must not import writeReward');
      assert.ok(!content.includes('writeStar'), 'must not import writeStar');
      assert.ok(!content.includes('updateMastery'), 'must not import updateMastery');
      assert.ok(!content.includes('submitScore'), 'must not import submitScore');
    });
  });

  describe('summary statistics', () => {
    it('summary includes category counts and actionable count', () => {
      const health = makeHealthReport({
        'tpl-a': { attemptCount: 120, independentFirstAttemptSuccessRate: 0.75, wrongAfterSupportRate: 0.1, medianElapsedBucket: '5-10s', retrySuccessRate: 0.5, retryAttemptCount: 10, confidence: 'high', classification: 'healthy' },
        'tpl-b': { attemptCount: 150, independentFirstAttemptSuccessRate: 0.98, wrongAfterSupportRate: 0.01, medianElapsedBucket: '<2s', retrySuccessRate: 0.9, retryAttemptCount: 3, confidence: 'high', classification: 'too_easy' },
      });
      const result = generateActionCandidates(health, makeMixedTransferReport(), makeRetentionReport());
      assert.equal(typeof result.summary.totalCandidates, 'number');
      assert.equal(typeof result.summary.actionableCount, 'number');
      assert.ok(result.summary.categoryCounts !== undefined);
      assert.ok(result.summary.generatedAt !== undefined);
    });
  });
});

// ─── U6: Mixed-Transfer Decision Gate ─────────────────────────────────────────

describe('Grammar QG P7 — U6: Mixed-Transfer Decision Gate', () => {
  function makeTemplateSet(count, attemptCount, successRate, conceptLocalRate) {
    const templates = {};
    for (let i = 0; i < count; i++) {
      templates[`tpl-mixed-${String(i + 1).padStart(2, '0')}`] = {
        attemptCount,
        successRate,
        conceptLocalSuccessRate: conceptLocalRate,
        independentRate: successRate * 0.9,
      };
    }
    return templates;
  }

  it('all 8 templates at high confidence → prepare_scoring_experiment', () => {
    const report = makeMixedTransferReport(makeTemplateSet(8, 150, 0.7, 0.75));
    const result = decideMixedTransferMaturity(report);
    assert.equal(result.decision, 'prepare_scoring_experiment');
  });

  it('only 2 templates at medium → keep_shadow_only', () => {
    const templates = {
      ...makeTemplateSet(2, 50, 0.7, 0.75),
      ...makeTemplateSet(6, 10, 0.6, 0.7), // below medium threshold
    };
    // Fix keys to avoid collision
    const fixed = {};
    let i = 0;
    for (const [, v] of Object.entries(templates)) {
      fixed[`tpl-mt-${String(++i).padStart(2, '0')}`] = v;
    }
    const report = makeMixedTransferReport(fixed);
    const result = decideMixedTransferMaturity(report);
    assert.equal(result.decision, 'keep_shadow_only');
  });

  it('mixed evidence with some harmful → do_not_promote when majority of high-confidence are harmful', () => {
    const templates = {};
    // 4 high-confidence templates that are harmful (local success much higher than mixed)
    for (let i = 0; i < 4; i++) {
      templates[`tpl-harm-${i}`] = { attemptCount: 120, successRate: 0.3, conceptLocalSuccessRate: 0.8 };
    }
    // 2 high-confidence templates that are fine
    for (let i = 0; i < 2; i++) {
      templates[`tpl-ok-${i}`] = { attemptCount: 120, successRate: 0.7, conceptLocalSuccessRate: 0.75 };
    }
    const report = makeMixedTransferReport(templates);
    const result = decideMixedTransferMaturity(report);
    assert.equal(result.decision, 'do_not_promote');
  });

  it('decision includes per-template attempt counts', () => {
    const report = makeMixedTransferReport(makeTemplateSet(4, 80, 0.65, 0.7));
    const result = decideMixedTransferMaturity(report);
    assert.ok(Array.isArray(result.perTemplateEvidence));
    assert.equal(result.perTemplateEvidence.length, 4);
    for (const tmpl of result.perTemplateEvidence) {
      assert.equal(typeof tmpl.attemptCount, 'number');
      assert.equal(typeof tmpl.successRate, 'number');
      assert.ok(tmpl.templateId);
    }
  });

  it('result always includes futureActionRef', () => {
    const report = makeMixedTransferReport(makeTemplateSet(8, 150, 0.7, 0.75));
    const result = decideMixedTransferMaturity(report);
    assert.equal(result.futureActionRef, 'Requires separate reviewed scoring plan');
  });

  it('6 medium + 3 high is the minimum for prepare_scoring_experiment', () => {
    const templates = {};
    // 3 at high confidence
    for (let i = 0; i < 3; i++) {
      templates[`tpl-high-${i}`] = { attemptCount: 110, successRate: 0.7, conceptLocalSuccessRate: 0.75 };
    }
    // 3 more at medium confidence (total 6 medium)
    for (let i = 0; i < 3; i++) {
      templates[`tpl-med-${i}`] = { attemptCount: 50, successRate: 0.65, conceptLocalSuccessRate: 0.7 };
    }
    const report = makeMixedTransferReport(templates);
    const result = decideMixedTransferMaturity(report);
    assert.equal(result.decision, 'prepare_scoring_experiment');
  });

  it('5 medium + 3 high is NOT sufficient → keep_shadow_only', () => {
    const templates = {};
    for (let i = 0; i < 3; i++) {
      templates[`tpl-high-${i}`] = { attemptCount: 110, successRate: 0.7, conceptLocalSuccessRate: 0.75 };
    }
    for (let i = 0; i < 2; i++) {
      templates[`tpl-med-${i}`] = { attemptCount: 50, successRate: 0.65, conceptLocalSuccessRate: 0.7 };
    }
    // 3 below medium
    for (let i = 0; i < 3; i++) {
      templates[`tpl-low-${i}`] = { attemptCount: 15, successRate: 0.6, conceptLocalSuccessRate: 0.65 };
    }
    const report = makeMixedTransferReport(templates);
    const result = decideMixedTransferMaturity(report);
    assert.equal(result.decision, 'keep_shadow_only');
  });
});

// ─── U7: Retention Maintenance Decision Gate ──────────────────────────────────

describe('Grammar QG P7 — U7: Retention Maintenance Decision Gate', () => {
  it('high lapse rate + sufficient data → recommend_maintenance_experiment', () => {
    const retention = makeRetentionReport({
      'possessive-apostrophe': {
        securedAttemptCount: 50,
        retainedPassRate: 0.7,
        lapseRate: 0.3,
        classification: 'retention_risk',
      },
      'comma-in-list': {
        securedAttemptCount: 40,
        retainedPassRate: 0.75,
        lapseRate: 0.25,
        classification: 'minor_lapse',
      },
    });
    const result = decideRetentionMaintenance(retention);
    assert.equal(result.decision, 'recommend_maintenance_experiment');
  });

  it('low lapse rate + sufficient data → no_action_needed', () => {
    const retention = makeRetentionReport({
      'possessive-apostrophe': {
        securedAttemptCount: 80,
        retainedPassRate: 0.95,
        lapseRate: 0.05,
        classification: 'retained',
      },
      'comma-in-list': {
        securedAttemptCount: 60,
        retainedPassRate: 0.93,
        lapseRate: 0.07,
        classification: 'retained',
      },
    });
    const result = decideRetentionMaintenance(retention);
    assert.equal(result.decision, 'no_action_needed');
  });

  it('insufficient data → defer_insufficient_data', () => {
    const retention = makeRetentionReport({
      'possessive-apostrophe': {
        securedAttemptCount: 10,
        retainedPassRate: 0.8,
        lapseRate: 0.2,
        classification: 'minor_lapse',
      },
      'comma-in-list': {
        securedAttemptCount: 5,
        retainedPassRate: 0.6,
        lapseRate: 0.4,
        classification: 'retention_risk',
      },
    });
    const result = decideRetentionMaintenance(retention);
    assert.equal(result.decision, 'defer_insufficient_data');
  });

  it('family clustering identifies which families have highest lapse', () => {
    const retention = makeRetentionReport({
      'possessive-apostrophe': {
        securedAttemptCount: 50,
        retainedPassRate: 0.6,
        lapseRate: 0.4,
        classification: 'retention_risk',
      },
      'comma-in-list': {
        securedAttemptCount: 50,
        retainedPassRate: 0.95,
        lapseRate: 0.05,
        classification: 'retained',
      },
      'relative-clause': {
        securedAttemptCount: 40,
        retainedPassRate: 0.7,
        lapseRate: 0.3,
        classification: 'retention_risk',
      },
    });
    const result = decideRetentionMaintenance(retention);
    assert.ok(Array.isArray(result.familyClustering));
    assert.ok(result.familyClustering.length > 0);
    // First entry should have the highest lapse rate
    const highest = result.familyClustering[0];
    assert.ok(highest.lapseRate >= result.familyClustering[result.familyClustering.length - 1].lapseRate);
    assert.ok(typeof highest.generatorFamilyId === 'string');
    assert.ok(typeof highest.totalLapses === 'number');
  });

  it('result always includes futureActionRef', () => {
    const retention = makeRetentionReport({
      'concept-a': { securedAttemptCount: 50, lapseRate: 0.3, classification: 'retention_risk' },
    });
    const result = decideRetentionMaintenance(retention);
    assert.equal(result.futureActionRef, 'Requires separate scheduler adjustment plan');
  });

  it('perConceptEvidence includes all concepts from input', () => {
    const retention = makeRetentionReport({
      'concept-a': { securedAttemptCount: 50, lapseRate: 0.1, classification: 'retained' },
      'concept-b': { securedAttemptCount: 10, lapseRate: 0.2, classification: 'minor_lapse' },
      'concept-c': { securedAttemptCount: 80, lapseRate: 0.05, classification: 'retained' },
    });
    const result = decideRetentionMaintenance(retention);
    assert.equal(result.perConceptEvidence.length, 3);
    const ids = result.perConceptEvidence.map((e) => e.conceptId).sort();
    assert.deepEqual(ids, ['concept-a', 'concept-b', 'concept-c']);
  });

  it('mixed lapse rate between 10% and 20% → no_action_needed (monitor zone)', () => {
    const retention = makeRetentionReport({
      'concept-a': { securedAttemptCount: 50, lapseRate: 0.15, retainedPassRate: 0.85, classification: 'minor_lapse' },
      'concept-b': { securedAttemptCount: 60, lapseRate: 0.12, retainedPassRate: 0.88, classification: 'minor_lapse' },
    });
    const result = decideRetentionMaintenance(retention);
    assert.equal(result.decision, 'no_action_needed');
  });
});
