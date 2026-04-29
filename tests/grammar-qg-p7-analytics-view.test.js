import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCalibrationViewModel,
  classificationColour,
  categoryColour,
  confidenceBadge,
  confidenceLevel,
  decisionColour,
  formatPercent,
  CLASSIFICATION_PRIORITY,
  CATEGORY_PRIORITY,
} from '../src/subjects/grammar/calibration-view-model.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────

function makeHealthReport(templateOverrides = {}) {
  return {
    provenance: {
      calibrationSchemaVersion: 'grammar-qg-p7-calibration-v1',
      releaseId: 'test-release-001',
      dateRange: '2026-04-20 to 2026-04-29',
    },
    templates: {
      'tpl-possessive-01': {
        classification: 'healthy',
        attemptCount: 120,
        independentFirstAttemptSuccessRate: 0.82,
        conceptId: 'possessive-apostrophe',
        ...templateOverrides['tpl-possessive-01'],
      },
      'tpl-comma-splice-01': {
        classification: 'too_hard',
        attemptCount: 45,
        independentFirstAttemptSuccessRate: 0.31,
        conceptId: 'comma-splice',
        ...templateOverrides['tpl-comma-splice-01'],
      },
      'tpl-verb-tense-01': {
        classification: 'support_dependent',
        attemptCount: 8,
        independentFirstAttemptSuccessRate: 0.25,
        conceptId: 'verb-tense',
        ...templateOverrides['tpl-verb-tense-01'],
      },
    },
  };
}

function makeActionCandidates() {
  return [
    {
      templateId: 'tpl-possessive-01',
      conceptId: 'possessive-apostrophe',
      category: 'keep',
      confidence: 'high',
      rationale: 'Template performing well with high confidence.',
    },
    {
      templateId: 'tpl-comma-splice-01',
      conceptId: 'comma-splice',
      category: 'review_wording',
      confidence: 'medium',
      rationale: 'Template flagged as too_hard with wrongAfterSupportRate=42.3%.',
    },
    {
      templateId: 'tpl-verb-tense-01',
      conceptId: 'verb-tense',
      category: 'insufficient_data',
      confidence: 'insufficient',
      rationale: 'Only 8 attempts recorded — below the 30-attempt confidence threshold.',
    },
    {
      templateId: 'tpl-relative-clause-01',
      conceptId: 'relative-clause',
      category: 'retire_candidate',
      confidence: 'high',
      rationale: 'Persistently support_dependent after 150 attempts.',
    },
    {
      templateId: 'tpl-modal-verb-01',
      conceptId: 'modal-verb',
      category: 'keep',
      confidence: 'medium',
      rationale: 'Template performing within thresholds.',
    },
  ];
}

function makeMixedTransferDecision() {
  return {
    decision: 'keep_shadow_only',
    perTemplateEvidence: [
      { templateId: 'tpl-possessive-01', attemptCount: 50, successRate: 0.72, confidenceLevel: 'medium' },
      { templateId: 'tpl-comma-splice-01', attemptCount: 110, successRate: 0.45, confidenceLevel: 'high' },
    ],
    summary: 'Insufficient templates at high confidence for experiment promotion.',
  };
}

function makeRetentionDecision() {
  return {
    decision: 'no_action_needed',
    perConceptEvidence: [
      { conceptId: 'possessive-apostrophe', securedAttempts: 80, lapseRate: 0.05, hasSufficientData: true },
      { conceptId: 'comma-splice', securedAttempts: 12, lapseRate: 0.18, hasSufficientData: false },
    ],
    familyClustering: [
      { familyId: 'tpl-possessive', templateCount: 3, totalLapses: 4, lapseConcentration: 0.12 },
    ],
    summary: 'Average lapse rate below threshold — no maintenance action needed.',
  };
}

function makeFullCalibrationData() {
  return {
    healthReport: makeHealthReport(),
    mixedTransferCalibration: { templates: {} },
    retentionReport: { concepts: {} },
    actionCandidates: makeActionCandidates(),
    mixedTransferDecision: makeMixedTransferDecision(),
    retentionDecision: makeRetentionDecision(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Grammar QG P7 — Calibration View Model (U8)', () => {
  describe('buildCalibrationViewModel — empty/missing data', () => {
    it('returns empty state when calibrationData is null', () => {
      const vm = buildCalibrationViewModel(null);
      assert.equal(vm.empty, true);
      assert.ok(vm.emptyMessage.includes('npm run grammar:qg:calibrate'));
      assert.equal(vm.header, null);
      assert.deepEqual(vm.templateHealthRows, []);
      assert.deepEqual(vm.actionCandidateGroups, []);
      assert.equal(vm.keepCount, 0);
      assert.equal(vm.mixedTransferEvidence, null);
      assert.equal(vm.retentionEvidence, null);
      assert.deepEqual(vm.confidenceWarnings, []);
    });

    it('returns empty state when calibrationData is undefined', () => {
      const vm = buildCalibrationViewModel(undefined);
      assert.equal(vm.empty, true);
    });

    it('returns empty state when calibrationData is a non-object', () => {
      const vm = buildCalibrationViewModel('some-string');
      assert.equal(vm.empty, true);
    });

    it('handles empty object gracefully', () => {
      const vm = buildCalibrationViewModel({});
      assert.equal(vm.empty, false);
      assert.equal(vm.header.releaseId, '—');
      assert.deepEqual(vm.templateHealthRows, []);
    });
  });

  describe('buildCalibrationViewModel — header', () => {
    it('extracts provenance fields into header', () => {
      const data = makeFullCalibrationData();
      const vm = buildCalibrationViewModel(data);
      assert.equal(vm.header.releaseId, 'test-release-001');
      assert.equal(vm.header.schemaVersion, 'grammar-qg-p7-calibration-v1');
      assert.equal(vm.header.dateRange, '2026-04-20 to 2026-04-29');
    });

    it('computes inputRowCount from sum of template attempt counts', () => {
      const data = makeFullCalibrationData();
      const vm = buildCalibrationViewModel(data);
      // 120 + 45 + 8 = 173
      assert.equal(vm.header.inputRowCount, 173);
    });
  });

  describe('buildCalibrationViewModel — template health rows sorted by classification', () => {
    it('sorts unhealthy templates first (support_dependent before too_hard before healthy)', () => {
      const data = makeFullCalibrationData();
      const vm = buildCalibrationViewModel(data);

      assert.equal(vm.templateHealthRows.length, 3);
      // support_dependent (priority 0) first
      assert.equal(vm.templateHealthRows[0].classification, 'support_dependent');
      // too_hard (priority 2) second
      assert.equal(vm.templateHealthRows[1].classification, 'too_hard');
      // healthy (priority 5) last
      assert.equal(vm.templateHealthRows[2].classification, 'healthy');
    });

    it('assigns correct classification colours', () => {
      const data = makeFullCalibrationData();
      const vm = buildCalibrationViewModel(data);
      assert.equal(vm.templateHealthRows[0].classificationColour, 'red'); // support_dependent
      assert.equal(vm.templateHealthRows[1].classificationColour, 'red'); // too_hard
      assert.equal(vm.templateHealthRows[2].classificationColour, 'green'); // healthy
    });

    it('assigns correct confidence badges based on attempt count', () => {
      const data = makeFullCalibrationData();
      const vm = buildCalibrationViewModel(data);
      // 120 attempts → high → green
      const healthyRow = vm.templateHealthRows.find(r => r.templateId === 'tpl-possessive-01');
      assert.equal(healthyRow.confidence, 'high');
      assert.equal(healthyRow.confidenceBadge, 'green');
      // 8 attempts → insufficient → red-outline
      const lowRow = vm.templateHealthRows.find(r => r.templateId === 'tpl-verb-tense-01');
      assert.equal(lowRow.confidence, 'insufficient');
      assert.equal(lowRow.confidenceBadge, 'red-outline');
    });

    it('formats success rate as percentage', () => {
      const data = makeFullCalibrationData();
      const vm = buildCalibrationViewModel(data);
      const healthyRow = vm.templateHealthRows.find(r => r.templateId === 'tpl-possessive-01');
      assert.equal(healthyRow.successRateDisplay, '82.0%');
    });
  });

  describe('buildCalibrationViewModel — action candidates', () => {
    it('filters out "keep" entries from groups', () => {
      const data = makeFullCalibrationData();
      const vm = buildCalibrationViewModel(data);
      for (const group of vm.actionCandidateGroups) {
        for (const row of group.rows) {
          assert.notEqual(row.category, 'keep');
        }
      }
    });

    it('reports keepCount for hidden keep entries', () => {
      const data = makeFullCalibrationData();
      const vm = buildCalibrationViewModel(data);
      assert.equal(vm.keepCount, 2); // tpl-possessive-01 + tpl-modal-verb-01
    });

    it('groups remaining candidates by category', () => {
      const data = makeFullCalibrationData();
      const vm = buildCalibrationViewModel(data);
      const categories = vm.actionCandidateGroups.map(g => g.category);
      assert.ok(categories.includes('retire_candidate'));
      assert.ok(categories.includes('review_wording'));
      assert.ok(categories.includes('insufficient_data'));
    });

    it('sorts groups by category priority (retire first, insufficient last)', () => {
      const data = makeFullCalibrationData();
      const vm = buildCalibrationViewModel(data);
      const categories = vm.actionCandidateGroups.map(g => g.category);
      const retireIdx = categories.indexOf('retire_candidate');
      const reviewIdx = categories.indexOf('review_wording');
      const insuffIdx = categories.indexOf('insufficient_data');
      assert.ok(retireIdx < reviewIdx);
      assert.ok(reviewIdx < insuffIdx);
    });
  });

  describe('buildCalibrationViewModel — mixed-transfer evidence', () => {
    it('extracts decision and colour', () => {
      const data = makeFullCalibrationData();
      const vm = buildCalibrationViewModel(data);
      assert.equal(vm.mixedTransferEvidence.decision, 'keep_shadow_only');
      assert.equal(vm.mixedTransferEvidence.decisionColour, 'green');
    });

    it('maps per-template attempt counts', () => {
      const data = makeFullCalibrationData();
      const vm = buildCalibrationViewModel(data);
      assert.equal(vm.mixedTransferEvidence.templateRows.length, 2);
      assert.equal(vm.mixedTransferEvidence.templateRows[0].attemptCount, 50);
      assert.equal(vm.mixedTransferEvidence.templateRows[1].attemptCount, 110);
    });

    it('returns null when no decision data', () => {
      const data = makeFullCalibrationData();
      data.mixedTransferDecision = null;
      const vm = buildCalibrationViewModel(data);
      assert.equal(vm.mixedTransferEvidence, null);
    });
  });

  describe('buildCalibrationViewModel — retention evidence', () => {
    it('extracts decision and colour', () => {
      const data = makeFullCalibrationData();
      const vm = buildCalibrationViewModel(data);
      assert.equal(vm.retentionEvidence.decision, 'no_action_needed');
      assert.equal(vm.retentionEvidence.decisionColour, 'green');
    });

    it('maps per-concept lapse rates', () => {
      const data = makeFullCalibrationData();
      const vm = buildCalibrationViewModel(data);
      assert.equal(vm.retentionEvidence.conceptRows.length, 2);
      assert.equal(vm.retentionEvidence.conceptRows[0].lapseRate, '5.0%');
      assert.equal(vm.retentionEvidence.conceptRows[1].lapseRate, '18.0%');
    });

    it('maps family clustering table', () => {
      const data = makeFullCalibrationData();
      const vm = buildCalibrationViewModel(data);
      assert.equal(vm.retentionEvidence.clusterRows.length, 1);
      assert.equal(vm.retentionEvidence.clusterRows[0].familyId, 'tpl-possessive');
      assert.equal(vm.retentionEvidence.clusterRows[0].templateCount, 3);
    });

    it('returns null when no decision data', () => {
      const data = makeFullCalibrationData();
      data.retentionDecision = null;
      const vm = buildCalibrationViewModel(data);
      assert.equal(vm.retentionEvidence, null);
    });
  });

  describe('buildCalibrationViewModel — confidence warnings', () => {
    it('flags templates with insufficient data', () => {
      const data = makeFullCalibrationData();
      const vm = buildCalibrationViewModel(data);
      const templateWarnings = vm.confidenceWarnings.filter(w => w.type === 'template');
      // tpl-verb-tense-01 has only 8 attempts
      assert.ok(templateWarnings.some(w => w.id === 'tpl-verb-tense-01'));
    });

    it('flags action candidates with insufficient_data category', () => {
      const data = makeFullCalibrationData();
      const vm = buildCalibrationViewModel(data);
      const actionWarnings = vm.confidenceWarnings.filter(w => w.type === 'action_candidate');
      assert.ok(actionWarnings.some(w => w.id === 'tpl-verb-tense-01'));
    });
  });

  describe('buildCalibrationViewModel — no answer keys in output', () => {
    it('view model contains no answer keys', () => {
      const data = makeFullCalibrationData();
      const vm = buildCalibrationViewModel(data);
      const serialised = JSON.stringify(vm);
      // Ensure no answer/key/correct_answer/solution fields leak through
      assert.ok(!serialised.includes('"answerKey"'));
      assert.ok(!serialised.includes('"correctAnswer"'));
      assert.ok(!serialised.includes('"solution"'));
    });
  });

  describe('buildCalibrationViewModel — no raw learner IDs in output', () => {
    it('view model contains no learner identifiers', () => {
      const data = makeFullCalibrationData();
      const vm = buildCalibrationViewModel(data);
      const serialised = JSON.stringify(vm);
      assert.ok(!serialised.includes('"learnerId"'));
      assert.ok(!serialised.includes('"userId"'));
      assert.ok(!serialised.includes('"studentId"'));
      assert.ok(!serialised.includes('"childId"'));
    });
  });

  describe('confidenceBadge helper', () => {
    it('high → green', () => assert.equal(confidenceBadge('high'), 'green'));
    it('medium → amber', () => assert.equal(confidenceBadge('medium'), 'amber'));
    it('low → grey', () => assert.equal(confidenceBadge('low'), 'grey'));
    it('insufficient → red-outline', () => assert.equal(confidenceBadge('insufficient'), 'red-outline'));
    it('unknown → grey', () => assert.equal(confidenceBadge('something_else'), 'grey'));
  });

  describe('confidenceLevel helper', () => {
    it('>100 → high', () => assert.equal(confidenceLevel(101), 'high'));
    it('30-100 → medium', () => assert.equal(confidenceLevel(50), 'medium'));
    it('10-29 → low', () => assert.equal(confidenceLevel(15), 'low'));
    it('<10 → insufficient', () => assert.equal(confidenceLevel(5), 'insufficient'));
    it('boundary: 100 → medium', () => assert.equal(confidenceLevel(100), 'medium'));
    it('boundary: 30 → medium', () => assert.equal(confidenceLevel(30), 'medium'));
    it('boundary: 10 → low', () => assert.equal(confidenceLevel(10), 'low'));
  });

  describe('formatPercent helper', () => {
    it('formats 0.82 as 82.0%', () => assert.equal(formatPercent(0.82), '82.0%'));
    it('formats 0 as 0.0%', () => assert.equal(formatPercent(0), '0.0%'));
    it('formats 1 as 100.0%', () => assert.equal(formatPercent(1), '100.0%'));
    it('returns — for null', () => assert.equal(formatPercent(null), '—'));
    it('returns — for NaN', () => assert.equal(formatPercent(NaN), '—'));
  });

  describe('decisionColour helper', () => {
    it('keep_shadow_only → green', () => assert.equal(decisionColour('keep_shadow_only'), 'green'));
    it('prepare_scoring_experiment → amber', () => assert.equal(decisionColour('prepare_scoring_experiment'), 'amber'));
    it('do_not_promote → red', () => assert.equal(decisionColour('do_not_promote'), 'red'));
    it('no_action_needed → green', () => assert.equal(decisionColour('no_action_needed'), 'green'));
    it('recommend_maintenance_experiment → amber', () => assert.equal(decisionColour('recommend_maintenance_experiment'), 'amber'));
    it('defer_insufficient_data → grey', () => assert.equal(decisionColour('defer_insufficient_data'), 'grey'));
    it('unknown → grey', () => assert.equal(decisionColour('anything'), 'grey'));
  });
});
