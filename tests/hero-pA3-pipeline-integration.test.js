import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateCertification,
  countObservationsByProvenance,
  checkContainsDecision,
} from '../scripts/validate-hero-pA3-certification-evidence.mjs';

import {
  extractObservation,
  formatObservationRow,
} from '../scripts/hero-pA3-cohort-smoke.mjs';

import {
  validateAllRowsPrivacy,
  parseRows,
  classifyConfidence,
  assembleReport,
} from '../scripts/hero-pA3-telemetry-extract.mjs';

import {
  parseObservationTable,
  separateByProvenance,
  aggregateMetrics,
} from '../scripts/hero-pA3-metrics-summary.mjs';

import {
  validateMetricPrivacyRecursive,
  stripPrivacyFields,
} from '../shared/hero/metrics-privacy.js';

import { HERO_FLAG_KEYS } from '../shared/hero/account-override.js';

// ── Shared test manifest (real manifest structure) ─────────────────

const MANIFEST = {
  phase: 'hero-pA3',
  date: '2026-04-30',
  description: 'Certification manifest for Hero Mode pA3',
  rings: {
    'A3-0': {
      name: 'Evidence provenance and docs reconciliation',
      requiredEvidence: [
        { path: 'docs/plans/james/hero-mode/A/hero-pA3-internal-cohort-evidence.md', condition: 'file_exists', description: 'A3 evidence file' },
        { path: 'docs/plans/james/hero-mode/A/hero-pA3-rollback-procedure.md', condition: 'file_exists', description: 'Rollback procedure' },
        { path: 'docs/plans/james/hero-mode/A/hero-pA3-support-checklist.md', condition: 'file_exists', description: 'Support checklist' },
      ],
    },
    'A3-1': {
      name: 'Real internal production cohort',
      requiredEvidence: [
        { path: 'docs/plans/james/hero-mode/A/hero-pA3-internal-cohort-evidence.md', condition: 'min_real_observations_5', description: 'At least 5 real observations' },
        { path: 'docs/plans/james/hero-mode/A/hero-pA3-internal-cohort-evidence.md', condition: 'min_real_datekeys_2', description: 'At least 2 real date keys' },
        { path: 'docs/plans/james/hero-mode/A/hero-pA3-internal-cohort-evidence.md', condition: 'min_real_learners_3', description: 'At least 3 real learners' },
      ],
    },
    'A3-2': {
      name: 'Goal 6 telemetry extraction',
      requiredEvidence: [
        { path: 'reports/hero/hero-pA3-telemetry-report.json', condition: 'file_exists', description: 'Telemetry report' },
        { path: 'docs/plans/james/hero-mode/A/hero-pA3-metrics-baseline.md', condition: 'file_exists', description: 'Metrics baseline' },
      ],
    },
    'A3-3': {
      name: 'Browser QA and rollback evidence',
      requiredEvidence: [
        { path: 'docs/plans/james/hero-mode/A/hero-pA3-browser-qa-evidence.md', condition: 'status_not_pending', description: 'Browser QA completed' },
      ],
    },
    'A3-4': {
      name: 'A4 recommendation',
      requiredEvidence: [
        { path: 'docs/plans/james/hero-mode/A/hero-pA3-risk-register.md', condition: 'file_exists', description: 'Risk register' },
        { path: 'docs/plans/james/hero-mode/A/hero-pA3-recommendation.md', condition: 'contains_decision', description: 'A4 recommendation issued' },
      ],
    },
    'A3-5': {
      name: 'External micro-cohort (optional)',
      optional: true,
      requiredEvidence: [
        { path: 'docs/plans/james/hero-mode/A/hero-pA3-external-cohort-evidence.md', condition: 'min_real_observations_5', description: 'External cohort observations' },
        { path: 'docs/plans/james/hero-mode/A/hero-pA3-external-cohort-evidence.md', condition: 'min_real_datekeys_14', description: '14-day minimum' },
      ],
    },
  },
  certificationStates: ['NOT_CERTIFIED', 'CERTIFIED_WITH_LIMITATIONS', 'CERTIFIED_PRE_A4'],
};

const ROOT = '/fake/root';

function fullPath(relativePath) {
  return `${ROOT}/${relativePath}`;
}

// ── Mock file reader factory ────────────────────────────────────────

function createMockReader(fileMap) {
  return {
    exists: (p) => {
      const normalised = p.replace(/\\/g, '/');
      return normalised in fileMap;
    },
    read: (p) => {
      const normalised = p.replace(/\\/g, '/');
      if (!(normalised in fileMap)) throw new Error(`File not found: ${normalised}`);
      return fileMap[normalised];
    },
  };
}

// ── Evidence content builder ────────────────────────────────────────

function makeEvidenceContent(rows) {
  const header = [
    '# Hero Mode pA3 — Internal Cohort Evidence',
    '',
    '## Observation Log',
    '',
    '| Date | Learner | Readiness | Balance Bucket | Ledger Entries | Reconciliation | Override | Source | Status |',
    '|------|---------|-----------|----------------|----------------|----------------|----------|--------|--------|',
  ];
  return [...header, ...rows].join('\n');
}

// ── Full happy-path file map ────────────────────────────────────────

function happyFileMap() {
  const evidenceRows = [
    '| 2026-04-25 | learner-A | ready | 300-599 | 5 | no-gap | override-active | real-production | OK |',
    '| 2026-04-25 | learner-B | ready | 300-599 | 3 | no-gap | override-active | real-production | OK |',
    '| 2026-04-26 | learner-C | ready | 100-299 | 2 | no-gap | no-override | real-production | OK |',
    '| 2026-04-26 | learner-A | ready | 300-599 | 6 | no-gap | override-active | real-production | OK |',
    '| 2026-04-27 | learner-B | ready | 300-599 | 4 | no-gap | override-active | real-production | OK |',
    '| 2026-04-27 | learner-D | ready | 0-99 | 1 | no-gap | no-override | simulation | OK |',
  ];

  return {
    [fullPath('docs/plans/james/hero-mode/A/hero-pA3-internal-cohort-evidence.md')]: makeEvidenceContent(evidenceRows),
    [fullPath('docs/plans/james/hero-mode/A/hero-pA3-rollback-procedure.md')]: '# Rollback Procedure\n\nSteps documented.',
    [fullPath('docs/plans/james/hero-mode/A/hero-pA3-support-checklist.md')]: '# Support Checklist\n\nAll items covered.',
    [fullPath('reports/hero/hero-pA3-telemetry-report.json')]: '{"metrics": []}',
    [fullPath('docs/plans/james/hero-mode/A/hero-pA3-metrics-baseline.md')]: '# Metrics Baseline\n\nBaseline captured.',
    [fullPath('docs/plans/james/hero-mode/A/hero-pA3-browser-qa-evidence.md')]: '# Browser QA\n\nStatus: COMPLETE\n\nAll tests passed.',
    [fullPath('docs/plans/james/hero-mode/A/hero-pA3-risk-register.md')]: '# Risk Register\n\nNo blocking risks.',
    [fullPath('docs/plans/james/hero-mode/A/hero-pA3-recommendation.md')]: '# Recommendation\n\nDecision: PROCEED TO A4\n\nRationale: all rings pass.',
  };
}

// ══════════════════════════════════════════════════════════════════════
// Test Suite
// ══════════════════════════════════════════════════════════════════════

describe('Hero pA3 Pipeline Integration', () => {
  // ── 1. Full pipeline — all gates pass ─────────────────────────────

  describe('full pipeline — all gates pass', () => {
    it('certifies CERTIFIED_PRE_A4 when all A3-0 through A3-4 pass', () => {
      const reader = createMockReader(happyFileMap());
      const result = validateCertification(MANIFEST, reader, ROOT);

      assert.equal(result.status, 'CERTIFIED_PRE_A4');
      assert.equal(result.limitations.length, 0);

      // Verify every required ring passes
      assert.equal(result.rings['A3-0'].pass, true);
      assert.equal(result.rings['A3-1'].pass, true);
      assert.equal(result.rings['A3-2'].pass, true);
      assert.equal(result.rings['A3-3'].pass, true);
      assert.equal(result.rings['A3-4'].pass, true);

      // A3-5 is optional — its failure does not affect certification
      // failures array may contain A3-5 failures but status is still CERTIFIED_PRE_A4
      const nonOptionalFailures = result.failures.filter(f =>
        !f.includes('hero-pA3-external-cohort-evidence')
      );
      assert.equal(nonOptionalFailures.length, 0);
    });

    it('evidence file has 5+ real rows, 3+ learners, 2+ date keys', () => {
      const files = happyFileMap();
      const content = files[fullPath('docs/plans/james/hero-mode/A/hero-pA3-internal-cohort-evidence.md')];
      const counts = countObservationsByProvenance(content);

      assert.ok(counts.realProduction >= 5, `Expected >=5 real rows, got ${counts.realProduction}`);
      assert.ok(counts.realLearners.length >= 3, `Expected >=3 learners, got ${counts.realLearners.length}`);
      assert.ok(counts.realDateKeys.length >= 2, `Expected >=2 date keys, got ${counts.realDateKeys.length}`);
    });
  });

  // ── 2. Mixed provenance — only real rows counted ──────────────────

  describe('full pipeline — mixed provenance, only real rows counted', () => {
    it('NOT_CERTIFIED when only 3 real + 10 simulation (real insufficient)', () => {
      const files = happyFileMap();
      const evidenceRows = [
        '| 2026-04-25 | learner-A | ready | 300-599 | 5 | no-gap | override-active | real-production | OK |',
        '| 2026-04-26 | learner-B | ready | 300-599 | 3 | no-gap | override-active | real-production | OK |',
        '| 2026-04-27 | learner-C | ready | 100-299 | 2 | no-gap | no-override | real-production | OK |',
        '| 2026-04-25 | sim-1 | ready | 300-599 | 5 | no-gap | no-override | simulation | OK |',
        '| 2026-04-25 | sim-2 | ready | 300-599 | 3 | no-gap | no-override | simulation | OK |',
        '| 2026-04-26 | sim-3 | ready | 100-299 | 2 | no-gap | no-override | simulation | OK |',
        '| 2026-04-26 | sim-4 | ready | 300-599 | 6 | no-gap | no-override | simulation | OK |',
        '| 2026-04-27 | sim-5 | ready | 300-599 | 4 | no-gap | no-override | simulation | OK |',
        '| 2026-04-27 | sim-6 | ready | 0-99 | 1 | no-gap | no-override | simulation | OK |',
        '| 2026-04-28 | sim-7 | ready | 300-599 | 3 | no-gap | no-override | simulation | OK |',
        '| 2026-04-28 | sim-8 | ready | 300-599 | 2 | no-gap | no-override | simulation | OK |',
        '| 2026-04-29 | sim-9 | ready | 300-599 | 5 | no-gap | no-override | simulation | OK |',
        '| 2026-04-30 | sim-10 | ready | 300-599 | 4 | no-gap | no-override | simulation | OK |',
      ];
      files[fullPath('docs/plans/james/hero-mode/A/hero-pA3-internal-cohort-evidence.md')] = makeEvidenceContent(evidenceRows);

      const reader = createMockReader(files);
      const result = validateCertification(MANIFEST, reader, ROOT);

      assert.equal(result.status, 'NOT_CERTIFIED');
      assert.equal(result.rings['A3-1'].pass, false);
      assert.ok(result.rings['A3-1'].failures.some(f => f.includes('real-production observations (3/5)')));
    });

    it('provenance counter confirms: 3 real, 10 simulation in mixed file', () => {
      const content = makeEvidenceContent([
        '| 2026-04-25 | learner-A | ready | 300-599 | 5 | no-gap | override-active | real-production | OK |',
        '| 2026-04-26 | learner-B | ready | 300-599 | 3 | no-gap | override-active | real-production | OK |',
        '| 2026-04-27 | learner-C | ready | 100-299 | 2 | no-gap | no-override | real-production | OK |',
        '| 2026-04-25 | sim-1 | ready | 300-599 | 5 | no-gap | no-override | simulation | OK |',
        '| 2026-04-25 | sim-2 | ready | 300-599 | 3 | no-gap | no-override | simulation | OK |',
        '| 2026-04-26 | sim-3 | ready | 100-299 | 2 | no-gap | no-override | simulation | OK |',
        '| 2026-04-26 | sim-4 | ready | 300-599 | 6 | no-gap | no-override | simulation | OK |',
        '| 2026-04-27 | sim-5 | ready | 300-599 | 4 | no-gap | no-override | simulation | OK |',
        '| 2026-04-27 | sim-6 | ready | 0-99 | 1 | no-gap | no-override | simulation | OK |',
        '| 2026-04-28 | sim-7 | ready | 300-599 | 3 | no-gap | no-override | simulation | OK |',
        '| 2026-04-28 | sim-8 | ready | 300-599 | 2 | no-gap | no-override | simulation | OK |',
        '| 2026-04-29 | sim-9 | ready | 300-599 | 5 | no-gap | no-override | simulation | OK |',
        '| 2026-04-30 | sim-10 | ready | 300-599 | 4 | no-gap | no-override | simulation | OK |',
      ]);
      const counts = countObservationsByProvenance(content);

      assert.equal(counts.realProduction, 3);
      assert.equal(counts.simulation, 10);
      assert.equal(counts.total, 13);
    });
  });

  // ── 3. Ring A3-5 optional — missing does not block ────────────────

  describe('ring A3-5 optional — missing does not block', () => {
    it('CERTIFIED_PRE_A4 when A3-0 through A3-4 pass and A3-5 file missing', () => {
      const files = happyFileMap();
      // A3-5 file is not in happyFileMap by default — that is the test
      const reader = createMockReader(files);
      const result = validateCertification(MANIFEST, reader, ROOT);

      assert.equal(result.status, 'CERTIFIED_PRE_A4');
      assert.equal(result.rings['A3-5'].pass, false);
      // Confirm limitations do not include A3-5
      assert.ok(!result.limitations.some(l => l.includes('A3-5')));
    });
  });

  // ── 4. Ring A3-5 optional — fails does not downgrade ──────────────

  describe('ring A3-5 optional — fails does not downgrade', () => {
    it('CERTIFIED_PRE_A4 when A3-5 exists but has insufficient real observations', () => {
      const files = happyFileMap();
      // Add external evidence file with only 2 real observations (needs 5)
      files[fullPath('docs/plans/james/hero-mode/A/hero-pA3-external-cohort-evidence.md')] = makeEvidenceContent([
        '| 2026-04-15 | ext-1 | ready | 300-599 | 5 | no-gap | no-override | real-production | OK |',
        '| 2026-04-16 | ext-2 | ready | 300-599 | 3 | no-gap | no-override | real-production | OK |',
        '| 2026-04-17 | sim-1 | ready | 300-599 | 2 | no-gap | no-override | simulation | OK |',
        '| 2026-04-18 | sim-2 | ready | 300-599 | 4 | no-gap | no-override | simulation | OK |',
        '| 2026-04-19 | sim-3 | ready | 300-599 | 6 | no-gap | no-override | simulation | OK |',
      ]);

      const reader = createMockReader(files);
      const result = validateCertification(MANIFEST, reader, ROOT);

      assert.equal(result.status, 'CERTIFIED_PRE_A4');
      assert.equal(result.rings['A3-5'].pass, false);
      assert.ok(result.rings['A3-5'].failures.some(f => f.includes('real-production observations (2/5)')));
    });
  });

  // ── 5. Decision keyword missing — A3-4 fails ─────────────────────

  describe('decision keyword missing — A3-4 fails', () => {
    it('CERTIFIED_WITH_LIMITATIONS when recommendation has placeholder', () => {
      const files = happyFileMap();
      files[fullPath('docs/plans/james/hero-mode/A/hero-pA3-recommendation.md')] =
        '# Recommendation\n\n**Recommendation:** [PROCEED TO A4 / HOLD AND HARDEN / ROLL BACK]\n\n[PENDING]';

      const reader = createMockReader(files);
      const result = validateCertification(MANIFEST, reader, ROOT);

      assert.equal(result.status, 'CERTIFIED_WITH_LIMITATIONS');
      assert.equal(result.rings['A3-4'].pass, false);
      assert.ok(result.limitations.some(l => l.includes('A3-4')));
    });

    it('checkContainsDecision rejects bracket-enclosed placeholder', () => {
      const placeholder = '**Recommendation:** [PROCEED TO A4 / HOLD AND HARDEN / ROLL BACK]';
      assert.equal(checkContainsDecision(placeholder), false);
    });

    it('checkContainsDecision accepts valid decision after label', () => {
      assert.equal(checkContainsDecision('Decision: PROCEED TO A4'), true);
      assert.equal(checkContainsDecision('Recommendation: HOLD AND HARDEN'), true);
      assert.equal(checkContainsDecision('Decision: ROLL BACK'), true);
    });
  });

  // ── 6. Ring A3-0 file missing — NOT_CERTIFIED ─────────────────────

  describe('ring A3-0 file missing — NOT_CERTIFIED', () => {
    it('NOT_CERTIFIED when evidence file does not exist', () => {
      const files = happyFileMap();
      delete files[fullPath('docs/plans/james/hero-mode/A/hero-pA3-internal-cohort-evidence.md')];

      const reader = createMockReader(files);
      const result = validateCertification(MANIFEST, reader, ROOT);

      assert.equal(result.status, 'NOT_CERTIFIED');
      assert.equal(result.rings['A3-0'].pass, false);
      assert.ok(result.rings['A3-0'].failures.some(f => f.includes('File missing')));
    });

    it('NOT_CERTIFIED when all A3-0 files missing', () => {
      const reader = createMockReader({});
      const result = validateCertification(MANIFEST, reader, ROOT);

      assert.equal(result.status, 'NOT_CERTIFIED');
      assert.equal(result.rings['A3-0'].pass, false);
      assert.equal(result.rings['A3-1'].pass, false);
    });
  });

  // ── 7. Provenance counting correctness ────────────────────────────

  describe('provenance counting correctness', () => {
    it('correctly classifies all 5 source types', () => {
      const content = makeEvidenceContent([
        '| 2026-04-25 | l-1 | ready | 300-599 | 5 | no-gap | override-active | real-production | OK |',
        '| 2026-04-25 | l-2 | ready | 300-599 | 3 | no-gap | override-active | real-production | OK |',
        '| 2026-04-26 | l-3 | ready | 100-299 | 2 | no-gap | no-override | staging | OK |',
        '| 2026-04-27 | l-4 | ready | 300-599 | 4 | no-gap | no-override | local | OK |',
        '| 2026-04-28 | l-5 | ready | 0-99 | 1 | no-gap | no-override | simulation | OK |',
        '| 2026-04-28 | l-6 | ready | 300-599 | 2 | no-gap | no-override | simulation | OK |',
        '| 2026-04-29 | l-7 | ready | 300-599 | 3 | no-gap | no-override | simulation | OK |',
        '| 2026-04-30 | l-8 | ready | 300-599 | 5 | no-gap | no-override | manual-note | OK |',
      ]);
      const result = countObservationsByProvenance(content);

      assert.equal(result.realProduction, 2);
      assert.equal(result.staging, 1);
      assert.equal(result.local, 1);
      assert.equal(result.simulation, 3);
      assert.equal(result.manualNote, 1);
      assert.equal(result.total, 8);
    });

    it('realDateKeys only counts dates from real-production rows', () => {
      const content = makeEvidenceContent([
        '| 2026-04-25 | l-1 | ready | 300-599 | 5 | no-gap | override-active | real-production | OK |',
        '| 2026-04-26 | l-2 | ready | 300-599 | 3 | no-gap | no-override | simulation | OK |',
        '| 2026-04-27 | l-3 | ready | 100-299 | 2 | no-gap | no-override | staging | OK |',
        '| 2026-04-28 | l-4 | ready | 300-599 | 4 | no-gap | no-override | real-production | OK |',
      ]);
      const result = countObservationsByProvenance(content);

      // Total date keys: 4 (25, 26, 27, 28)
      assert.equal(result.dateKeys.length, 4);
      // Real date keys: 2 (25, 28 only)
      assert.equal(result.realDateKeys.length, 2);
      assert.ok(result.realDateKeys.includes('2026-04-25'));
      assert.ok(result.realDateKeys.includes('2026-04-28'));
      assert.ok(!result.realDateKeys.includes('2026-04-26'));
      assert.ok(!result.realDateKeys.includes('2026-04-27'));
    });

    it('realLearners only counts learners from real-production rows', () => {
      const content = makeEvidenceContent([
        '| 2026-04-25 | real-learner-A | ready | 300-599 | 5 | no-gap | override-active | real-production | OK |',
        '| 2026-04-25 | sim-learner-B | ready | 300-599 | 3 | no-gap | no-override | simulation | OK |',
        '| 2026-04-26 | real-learner-C | ready | 100-299 | 2 | no-gap | no-override | real-production | OK |',
        '| 2026-04-26 | staging-learner-D | ready | 300-599 | 4 | no-gap | no-override | staging | OK |',
      ]);
      const result = countObservationsByProvenance(content);

      assert.equal(result.realLearners.length, 2);
      assert.ok(result.realLearners.includes('real-learner-A'));
      assert.ok(result.realLearners.includes('real-learner-C'));
      assert.ok(!result.realLearners.includes('sim-learner-B'));
      assert.ok(!result.realLearners.includes('staging-learner-D'));
    });
  });

  // ── 8. Smoke script output compatibility with validator ───────────

  describe('smoke script output parseable by validator', () => {
    it('formatObservationRow generates valid 9-column row for countObservationsByProvenance', () => {
      const obs = {
        date: '2026-04-30',
        learner: 'test-learner-1',
        readiness: 'ready',
        balanceBucket: '300-599',
        ledgerEntries: 7,
        reconciliation: 'no-gap',
        override: 'override-active',
        source: 'real-production',
        status: 'OK',
      };

      const row = formatObservationRow(obs);
      const content = makeEvidenceContent([row]);
      const counts = countObservationsByProvenance(content);

      assert.equal(counts.total, 1);
      assert.equal(counts.realProduction, 1);
      assert.equal(counts.realDateKeys.length, 1);
      assert.equal(counts.realDateKeys[0], '2026-04-30');
      assert.equal(counts.realLearners.length, 1);
      assert.equal(counts.realLearners[0], 'test-learner-1');
    });

    it('extractObservation produces correct source classification for validator', () => {
      const probeData = {
        data: {
          readiness: { overall: 'ready' },
          health: { balanceBucket: '100-299', balance: 150, ledgerEntryCount: 3 },
          reconciliation: { hasGap: false },
          overrideStatus: { isInternalAccount: true },
        },
      };

      const obs = extractObservation('learner-X', probeData, 'real-production');
      assert.equal(obs.source, 'real-production');

      const row = formatObservationRow(obs);
      const content = makeEvidenceContent([row]);
      const counts = countObservationsByProvenance(content);

      assert.equal(counts.realProduction, 1);
      assert.equal(counts.realLearners[0], 'learner-X');
    });

    it('simulation source from smoke script is correctly classified', () => {
      const probeData = {
        data: {
          readiness: { overall: 'not_started' },
          health: { balanceBucket: '0-99', balance: 0, ledgerEntryCount: 0 },
          reconciliation: { hasGap: false },
          overrideStatus: { isInternalAccount: false },
        },
      };

      const obs = extractObservation('sim-learner-1', probeData, 'simulation');
      const row = formatObservationRow(obs);
      const content = makeEvidenceContent([row]);
      const counts = countObservationsByProvenance(content);

      assert.equal(counts.simulation, 1);
      assert.equal(counts.realProduction, 0);
    });
  });

  // ── 9. Privacy validation on mock telemetry output ────────────────

  describe('privacy validation integration', () => {
    it('clean telemetry data passes privacy validation', () => {
      const cleanPayload = {
        eventType: 'hero.task.completed',
        data: {
          taskId: 'task-123',
          subjectId: 'grammar',
          dateKey: '2026-04-30',
          intent: 'weak-repair',
          coinsAwarded: 10,
        },
      };

      const result = validateMetricPrivacyRecursive(cleanPayload);
      assert.equal(result.valid, true);
      assert.equal(result.violations.length, 0);
    });

    it('telemetry with rawAnswer field fails with violation path', () => {
      const dirtyPayload = {
        eventType: 'hero.task.completed',
        data: {
          taskId: 'task-456',
          subjectId: 'spelling',
          rawAnswer: 'the child typed this text',
        },
      };

      const result = validateMetricPrivacyRecursive(dirtyPayload);
      assert.equal(result.valid, false);
      assert.ok(result.violations.length > 0);
      assert.ok(result.violations.some(v => v.includes('rawAnswer')));
    });

    it('deeply nested forbidden field is detected', () => {
      const deepPayload = {
        level1: {
          level2: {
            level3: {
              childFreeText: 'secret text from child',
            },
          },
        },
      };

      const result = validateMetricPrivacyRecursive(deepPayload);
      assert.equal(result.valid, false);
      assert.ok(result.violations.some(v => v === 'level1.level2.level3.childFreeText'));
    });

    it('validateAllRowsPrivacy passes with clean rows', () => {
      const parsedRows = [
        { eventJson: { eventType: 'hero.task.completed', data: { taskId: 't1' } } },
        { eventJson: { eventType: 'hero.coins.awarded', amount: 10 } },
        { eventJson: null }, // null rows are skipped
      ];

      const result = validateAllRowsPrivacy(parsedRows);
      assert.equal(result.passed, true);
      assert.equal(result.rowsChecked, 2); // null row skipped
      assert.equal(result.violations.length, 0);
    });

    it('validateAllRowsPrivacy fails with violation in any row', () => {
      const parsedRows = [
        { eventJson: { eventType: 'hero.task.completed', data: { taskId: 't1' } } },
        { eventJson: { eventType: 'hero.task.completed', data: { rawPrompt: 'leaked prompt' } } },
      ];

      const result = validateAllRowsPrivacy(parsedRows);
      assert.equal(result.passed, false);
      assert.equal(result.violations.length, 1);
      assert.equal(result.violations[0].rowIndex, 1);
      assert.ok(result.violations[0].violations.some(v => v.includes('rawPrompt')));
    });
  });

  // ── 10. Metrics summary integration ───────────────────────────────

  describe('metrics summary parses 9-column format correctly', () => {
    it('parseObservationTable extracts rows from 9-column evidence (Source at position 8)', () => {
      const content = [
        '# Evidence',
        '',
        '| Date | Learner | Readiness | Balance Bucket | Ledger Entries | Reconciliation | Override | Source | Status |',
        '|------|---------|-----------|----------------|----------------|----------------|----------|--------|--------|',
        '| 2026-04-25 | learner-A | ready | 300-599 | 5 | no-gap | override-active | real-production | OK |',
        '| 2026-04-26 | learner-B | ready | 100-299 | 3 | no-gap | no-override | simulation | OK |',
        '| 2026-04-27 | learner-C | not-ready | 0-99 | 1 | gap | no-override | real-production | WARN:insufficient |',
      ].join('\n');

      const observations = parseObservationTable(content);
      assert.equal(observations.length, 3);
      assert.equal(observations[0].date, '2026-04-25');
      assert.equal(observations[0].learner, 'learner-A');
      assert.equal(observations[0].source, 'real-production');
      assert.equal(observations[1].source, 'simulation');
      assert.equal(observations[2].status, 'WARN:insufficient');
    });

    it('separateByProvenance correctly splits all 5 provenance types', () => {
      const observations = [
        { source: 'real-production', date: '2026-04-25', learner: 'a' },
        { source: 'real-production', date: '2026-04-26', learner: 'b' },
        { source: 'staging', date: '2026-04-25', learner: 'e' },
        { source: 'local', date: '2026-04-26', learner: 'f' },
        { source: 'simulation', date: '2026-04-25', learner: 'c' },
        { source: 'manual-note', date: '2026-04-27', learner: 'd' },
      ];

      const result = separateByProvenance(observations);
      assert.equal(result.real.length, 2);
      assert.equal(result.staging.length, 1);
      assert.equal(result.local.length, 1);
      assert.equal(result.simulation.length, 1);
      assert.equal(result.manual.length, 1);
      assert.equal(result.total, 6);
    });

    it('classifyConfidence returns correct tier labels', () => {
      assert.equal(classifyConfidence(100), 'high');
      assert.equal(classifyConfidence(150), 'high');
      assert.equal(classifyConfidence(30), 'medium');
      assert.equal(classifyConfidence(50), 'medium');
      assert.equal(classifyConfidence(10), 'low');
      assert.equal(classifyConfidence(20), 'low');
      assert.equal(classifyConfidence(0), 'insufficient');
      assert.equal(classifyConfidence(9), 'insufficient');
    });

    it('assembleReport produces valid structure with empty rows', () => {
      const report = assembleReport([], { dateFrom: '2026-04-01', dateTo: '2026-04-30', learnerIds: [] });

      assert.ok(report.extractedAt);
      assert.equal(report.totalEvents, 0);
      assert.ok(report.signals);
      assert.ok(report.privacyValidation.passed);
      assert.ok(report.warnings.length > 0); // warns about no events
    });

    it('parseRows handles malformed event_json gracefully', () => {
      const rawRows = [
        { id: 1, learner_id: 'l1', subject_id: 's1', system_id: 'hero-mode', event_type: 'hero.task.completed', event_json: '{"valid": true}', created_at: '2026-04-25T10:00:00Z' },
        { id: 2, learner_id: 'l2', subject_id: 's2', system_id: 'hero-mode', event_type: 'hero.task.completed', event_json: 'INVALID_JSON{{{', created_at: '2026-04-26T10:00:00Z' },
        { id: 3, learner_id: 'l3', subject_id: 's3', system_id: 'hero-mode', event_type: 'hero.coins.awarded', event_json: null, created_at: '2026-04-27T10:00:00Z' },
      ];

      const parsed = parseRows(rawRows);
      assert.equal(parsed.length, 3);
      assert.deepEqual(parsed[0].eventJson, { valid: true });
      assert.equal(parsed[1].eventJson, null); // malformed => null
      assert.equal(parsed[2].eventJson, null); // null stays null
    });

    it('parseRows strips forbidden fields from event_json (defence-in-depth)', () => {
      const rawRows = [
        {
          id: 1, learner_id: 'l1', subject_id: 's1', system_id: 'hero-mode',
          event_type: 'hero.task.completed',
          event_json: JSON.stringify({ taskId: 't1', rawAnswer: 'secret child text', data: { intent: 'weak-repair' } }),
          created_at: '2026-04-25T10:00:00Z',
        },
      ];

      const parsed = parseRows(rawRows);
      assert.equal(parsed.length, 1);
      // rawAnswer must be stripped
      assert.equal('rawAnswer' in parsed[0].eventJson, false);
      // Non-forbidden fields remain
      assert.equal(parsed[0].eventJson.taskId, 't1');
      assert.equal(parsed[0].eventJson.data.intent, 'weak-repair');
    });
  });

  // ── 11. Privacy depth hardening (MAX_DEPTH=50) ────────────────────

  describe('privacy depth hardening — formerly MAX_DEPTH=10 bypass', () => {
    it('detects forbidden field at depth 11 (previously bypassed)', () => {
      // Build a payload nested 11 levels deep
      let payload = { rawAnswer: 'leaked child answer' };
      for (let i = 0; i < 10; i++) {
        payload = { [`level${10 - i}`]: payload };
      }
      // payload is now: { level1: { level2: ... { level10: { rawAnswer: ... } } } }

      const result = validateMetricPrivacyRecursive(payload);
      assert.equal(result.valid, false);
      assert.ok(result.violations.length > 0);
      assert.ok(result.violations[0].includes('rawAnswer'));
    });

    it('detects forbidden field at depth 49 (well within new limit)', () => {
      // Build a payload nested 49 levels deep
      let payload = { childFreeText: 'deeply hidden secret' };
      for (let i = 0; i < 48; i++) {
        payload = { [`d${48 - i}`]: payload };
      }

      const result = validateMetricPrivacyRecursive(payload);
      assert.equal(result.valid, false);
      assert.ok(result.violations.length > 0);
      assert.ok(result.violations[0].includes('childFreeText'));
    });

    it('stripPrivacyFields strips at depth 11 (previously returned unchanged)', () => {
      // Build a payload with forbidden field at depth 11
      let payload = { childInput: 'secret child input', safe: 'visible' };
      for (let i = 0; i < 10; i++) {
        payload = { [`level${10 - i}`]: payload };
      }

      const stripped = stripPrivacyFields(payload);

      // Navigate to depth 11 in the stripped result
      let node = stripped;
      for (let i = 1; i <= 10; i++) {
        node = node[`level${i}`];
        assert.ok(node, `level${i} should exist in stripped output`);
      }
      // childInput must be stripped, safe must remain
      assert.equal('childInput' in node, false);
      assert.equal(node.safe, 'visible');
    });

    it('stripPrivacyFields strips at depth 49', () => {
      // Build a payload with forbidden field at depth 49
      let payload = { rawText: 'deeply hidden', keep: 'this' };
      for (let i = 0; i < 48; i++) {
        payload = { [`d${48 - i}`]: payload };
      }

      const stripped = stripPrivacyFields(payload);

      // Navigate to depth 49 in the stripped result
      let node = stripped;
      for (let i = 1; i <= 48; i++) {
        node = node[`d${i}`];
        assert.ok(node, `d${i} should exist in stripped output`);
      }
      assert.equal('rawText' in node, false);
      assert.equal(node.keep, 'this');
    });
  });

  // ── 12. Env secrets projection (effectiveFlags) ───────────────────

  describe('env secrets projection — effectiveFlags must only contain Hero flag keys', () => {
    it('HERO_FLAG_KEYS is frozen and contains exactly 6 known keys', () => {
      assert.equal(HERO_FLAG_KEYS.length, 6);
      assert.ok(HERO_FLAG_KEYS.includes('HERO_MODE_SHADOW_ENABLED'));
      assert.ok(HERO_FLAG_KEYS.includes('HERO_MODE_LAUNCH_ENABLED'));
      assert.ok(HERO_FLAG_KEYS.includes('HERO_MODE_CHILD_UI_ENABLED'));
      assert.ok(HERO_FLAG_KEYS.includes('HERO_MODE_PROGRESS_ENABLED'));
      assert.ok(HERO_FLAG_KEYS.includes('HERO_MODE_ECONOMY_ENABLED'));
      assert.ok(HERO_FLAG_KEYS.includes('HERO_MODE_CAMP_ENABLED'));
      assert.ok(Object.isFrozen(HERO_FLAG_KEYS));
    });

    it('projecting resolvedFlags through HERO_FLAG_KEYS excludes secret keys', () => {
      // Simulate what resolveHeroFlagsWithOverride returns (full env + overrides)
      const resolvedFlags = {
        HERO_MODE_SHADOW_ENABLED: 'true',
        HERO_MODE_LAUNCH_ENABLED: 'true',
        HERO_MODE_CHILD_UI_ENABLED: 'true',
        HERO_MODE_PROGRESS_ENABLED: 'true',
        HERO_MODE_ECONOMY_ENABLED: 'true',
        HERO_MODE_CAMP_ENABLED: 'true',
        // These are secrets that MUST NOT leak
        HERO_INTERNAL_ACCOUNTS: '["adult-secret-1","adult-secret-2"]',
        DB_AUTH_TOKEN: 'super-secret-db-token',
        STRIPE_KEY: 'sk_live_secret',
        SESSION_SECRET: 'hmac-key-never-expose',
      };

      // Apply the same projection used in the fixed app.js
      const effectiveFlags = Object.fromEntries(
        HERO_FLAG_KEYS.map(k => [k, resolvedFlags[k] || ''])
      );

      // Must contain all 6 Hero flags
      for (const key of HERO_FLAG_KEYS) {
        assert.equal(effectiveFlags[key], 'true', `${key} should be present`);
      }

      // Must NOT contain any secrets
      assert.equal('HERO_INTERNAL_ACCOUNTS' in effectiveFlags, false);
      assert.equal('DB_AUTH_TOKEN' in effectiveFlags, false);
      assert.equal('STRIPE_KEY' in effectiveFlags, false);
      assert.equal('SESSION_SECRET' in effectiveFlags, false);

      // Must have exactly 6 keys
      assert.equal(Object.keys(effectiveFlags).length, 6);
    });

    it('projection returns empty string for missing flag keys', () => {
      const resolvedFlags = {
        HERO_MODE_SHADOW_ENABLED: 'true',
        // Other 5 keys missing (non-internal account scenario)
        SOME_SECRET: 'should-not-appear',
      };

      const effectiveFlags = Object.fromEntries(
        HERO_FLAG_KEYS.map(k => [k, resolvedFlags[k] || ''])
      );

      assert.equal(effectiveFlags.HERO_MODE_SHADOW_ENABLED, 'true');
      assert.equal(effectiveFlags.HERO_MODE_LAUNCH_ENABLED, '');
      assert.equal(effectiveFlags.HERO_MODE_CAMP_ENABLED, '');
      assert.equal('SOME_SECRET' in effectiveFlags, false);
      assert.equal(Object.keys(effectiveFlags).length, 6);
    });
  });
});
