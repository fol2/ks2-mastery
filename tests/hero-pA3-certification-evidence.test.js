import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateCertification,
  checkStatusNotPending,
  checkContainsDecision,
  countObservationsByProvenance,
} from '../scripts/validate-hero-pA3-certification-evidence.mjs';

// ── Fixtures ────────────────────────────────────────────────────────

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

// ── Full happy-path file map ────────────────────────────────────────

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
    [fullPath('docs/plans/james/hero-mode/A/hero-pA3-external-cohort-evidence.md')]: makeEvidenceContent([
      '| 2026-04-15 | ext-1 | ready | 300-599 | 5 | no-gap | no-override | real-production | OK |',
      '| 2026-04-16 | ext-2 | ready | 300-599 | 3 | no-gap | no-override | real-production | OK |',
      '| 2026-04-17 | ext-1 | ready | 300-599 | 6 | no-gap | no-override | real-production | OK |',
      '| 2026-04-18 | ext-3 | ready | 300-599 | 2 | no-gap | no-override | real-production | OK |',
      '| 2026-04-19 | ext-2 | ready | 300-599 | 4 | no-gap | no-override | real-production | OK |',
      '| 2026-04-20 | ext-1 | ready | 300-599 | 7 | no-gap | no-override | real-production | OK |',
      '| 2026-04-21 | ext-3 | ready | 300-599 | 3 | no-gap | no-override | real-production | OK |',
      '| 2026-04-22 | ext-2 | ready | 300-599 | 5 | no-gap | no-override | real-production | OK |',
      '| 2026-04-23 | ext-1 | ready | 300-599 | 6 | no-gap | no-override | real-production | OK |',
      '| 2026-04-24 | ext-3 | ready | 300-599 | 4 | no-gap | no-override | real-production | OK |',
      '| 2026-04-25 | ext-2 | ready | 300-599 | 5 | no-gap | no-override | real-production | OK |',
      '| 2026-04-26 | ext-1 | ready | 300-599 | 7 | no-gap | no-override | real-production | OK |',
      '| 2026-04-27 | ext-3 | ready | 300-599 | 3 | no-gap | no-override | real-production | OK |',
      '| 2026-04-28 | ext-2 | ready | 300-599 | 4 | no-gap | no-override | real-production | OK |',
    ]),
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Hero pA3 Certification Validator', () => {
  // ── countObservationsByProvenance ──────────────────────────────────

  describe('helper: countObservationsByProvenance', () => {
    it('counts 5 real + 2 simulation correctly', () => {
      const content = makeEvidenceContent([
        '| 2026-04-25 | learner-A | ready | 300-599 | 5 | no-gap | override-active | real-production | OK |',
        '| 2026-04-25 | learner-B | ready | 300-599 | 3 | no-gap | override-active | real-production | OK |',
        '| 2026-04-26 | learner-C | ready | 100-299 | 2 | no-gap | no-override | real-production | OK |',
        '| 2026-04-26 | learner-A | ready | 300-599 | 6 | no-gap | override-active | real-production | OK |',
        '| 2026-04-27 | learner-B | ready | 300-599 | 4 | no-gap | override-active | real-production | OK |',
        '| 2026-04-27 | learner-D | ready | 0-99 | 1 | no-gap | no-override | simulation | OK |',
        '| 2026-04-28 | learner-D | ready | 0-99 | 2 | no-gap | no-override | simulation | OK |',
      ]);
      const result = countObservationsByProvenance(content);
      assert.equal(result.total, 7);
      assert.equal(result.realProduction, 5);
      assert.equal(result.simulation, 2);
    });

    it('all simulation returns realProduction=0', () => {
      const content = makeEvidenceContent([
        '| 2026-04-25 | sim-1 | ready | 300-599 | 5 | no-gap | no-override | simulation | OK |',
        '| 2026-04-26 | sim-2 | ready | 300-599 | 3 | no-gap | no-override | simulation | OK |',
        '| 2026-04-27 | sim-3 | ready | 100-299 | 2 | no-gap | no-override | simulation | OK |',
      ]);
      const result = countObservationsByProvenance(content);
      assert.equal(result.total, 3);
      assert.equal(result.realProduction, 0);
      assert.equal(result.simulation, 3);
      assert.equal(result.realDateKeys.length, 0);
    });

    it('legacy format (no Source column) treats all as simulation', () => {
      // 8-column format (missing Source) — legacy pA2 format
      const content = [
        '| Date | Learner | Readiness | Balance Bucket | Ledger Entries | Reconciliation | Override | Status |',
        '|------|---------|-----------|----------------|----------------|----------------|----------|--------|',
        '| 2026-04-25 | learner-1 | ready | 300-599 | 5 | no-gap | override-active | OK |',
        '| 2026-04-26 | learner-2 | ready | 300-599 | 3 | no-gap | override-active | OK |',
      ].join('\n');
      const result = countObservationsByProvenance(content);
      assert.equal(result.total, 2);
      assert.equal(result.realProduction, 0);
      assert.equal(result.simulation, 2);
    });

    it('empty content returns all zeros', () => {
      const result = countObservationsByProvenance('');
      assert.equal(result.total, 0);
      assert.equal(result.realProduction, 0);
      assert.equal(result.simulation, 0);
      assert.equal(result.staging, 0);
      assert.equal(result.local, 0);
      assert.equal(result.manualNote, 0);
      assert.deepEqual(result.dateKeys, []);
      assert.deepEqual(result.realDateKeys, []);
      assert.deepEqual(result.realLearners, []);
    });

    it('counts unique real learners correctly', () => {
      const content = makeEvidenceContent([
        '| 2026-04-25 | learner-A | ready | 300-599 | 5 | no-gap | override-active | real-production | OK |',
        '| 2026-04-25 | learner-B | ready | 300-599 | 3 | no-gap | override-active | real-production | OK |',
        '| 2026-04-26 | learner-A | ready | 300-599 | 6 | no-gap | override-active | real-production | OK |',
        '| 2026-04-26 | learner-C | ready | 100-299 | 2 | no-gap | no-override | simulation | OK |',
      ]);
      const result = countObservationsByProvenance(content);
      assert.equal(result.realLearners.length, 2); // learner-A, learner-B
      assert.ok(result.realLearners.includes('learner-A'));
      assert.ok(result.realLearners.includes('learner-B'));
    });

    it('classifies staging, local, and manual-note correctly', () => {
      const content = makeEvidenceContent([
        '| 2026-04-25 | l-1 | ready | 300-599 | 5 | no-gap | no-override | staging | OK |',
        '| 2026-04-26 | l-2 | ready | 300-599 | 3 | no-gap | no-override | local | OK |',
        '| 2026-04-27 | l-3 | ready | 300-599 | 2 | no-gap | no-override | manual-note | OK |',
      ]);
      const result = countObservationsByProvenance(content);
      assert.equal(result.staging, 1);
      assert.equal(result.local, 1);
      assert.equal(result.manualNote, 1);
      assert.equal(result.realProduction, 0);
    });
  });

  // ── checkContainsDecision (A4 keywords) ───────────────────────────

  describe('helper: checkContainsDecision', () => {
    it('finds PROCEED TO A4 with Decision: prefix', () => {
      assert.equal(checkContainsDecision('Decision: PROCEED TO A4'), true);
    });

    it('finds HOLD AND HARDEN with Recommendation: prefix', () => {
      assert.equal(checkContainsDecision('**Recommendation:** HOLD AND HARDEN'), true);
    });

    it('finds ROLL BACK with Decision: prefix', () => {
      assert.equal(checkContainsDecision('Decision: ROLL BACK'), true);
    });

    it('returns false when no decision keyword', () => {
      assert.equal(checkContainsDecision('No decision here.'), false);
    });

    it('rejects placeholder text inside square brackets', () => {
      const placeholder = '**Recommendation:** [PROCEED TO A4 / HOLD AND HARDEN / ROLL BACK]';
      assert.equal(checkContainsDecision(placeholder), false);
    });

    it('returns false when decision keyword in body without label prefix', () => {
      assert.equal(checkContainsDecision('We should PROCEED TO A4 based on evidence.'), false);
    });

    it('finds decision on multi-line document with label', () => {
      const doc = [
        '# Recommendation',
        '',
        'Some preamble.',
        '',
        '**Decision:** PROCEED TO A4',
        '',
        'Rationale: all rings pass.',
      ].join('\n');
      assert.equal(checkContainsDecision(doc), true);
    });
  });

  // ── Gate conditions ───────────────────────────────────────────────

  describe('gate conditions', () => {
    it('min_real_observations_5 passes with 5 real rows', () => {
      const files = happyFileMap();
      const reader = createMockReader(files);
      const result = validateCertification(MANIFEST, reader, ROOT);
      assert.equal(result.rings['A3-1'].pass, true);
    });

    it('min_real_observations_5 fails with only 3 real + 4 sim', () => {
      const files = happyFileMap();
      files[fullPath('docs/plans/james/hero-mode/A/hero-pA3-internal-cohort-evidence.md')] = makeEvidenceContent([
        '| 2026-04-25 | learner-A | ready | 300-599 | 5 | no-gap | override-active | real-production | OK |',
        '| 2026-04-26 | learner-B | ready | 300-599 | 3 | no-gap | override-active | real-production | OK |',
        '| 2026-04-27 | learner-C | ready | 100-299 | 2 | no-gap | no-override | real-production | OK |',
        '| 2026-04-25 | sim-1 | ready | 300-599 | 5 | no-gap | no-override | simulation | OK |',
        '| 2026-04-26 | sim-2 | ready | 300-599 | 3 | no-gap | no-override | simulation | OK |',
        '| 2026-04-27 | sim-3 | ready | 100-299 | 2 | no-gap | no-override | simulation | OK |',
        '| 2026-04-28 | sim-4 | ready | 0-99 | 1 | no-gap | no-override | simulation | OK |',
      ]);
      const reader = createMockReader(files);
      const result = validateCertification(MANIFEST, reader, ROOT);
      assert.equal(result.rings['A3-1'].pass, false);
      assert.ok(result.rings['A3-1'].failures.some(f => f.includes('real-production observations (3/5)')));
    });

    it('min_real_datekeys_2 passes with 2 unique dates from real rows', () => {
      const files = happyFileMap();
      // Default happy path has 3 real date keys (25, 26, 27)
      const reader = createMockReader(files);
      const result = validateCertification(MANIFEST, reader, ROOT);
      assert.equal(result.rings['A3-1'].pass, true);
    });

    it('min_real_datekeys_2 fails when 2 dates but one is simulation-only', () => {
      const files = happyFileMap();
      files[fullPath('docs/plans/james/hero-mode/A/hero-pA3-internal-cohort-evidence.md')] = makeEvidenceContent([
        '| 2026-04-25 | learner-A | ready | 300-599 | 5 | no-gap | override-active | real-production | OK |',
        '| 2026-04-25 | learner-B | ready | 300-599 | 3 | no-gap | override-active | real-production | OK |',
        '| 2026-04-25 | learner-C | ready | 100-299 | 2 | no-gap | no-override | real-production | OK |',
        '| 2026-04-25 | learner-D | ready | 300-599 | 6 | no-gap | override-active | real-production | OK |',
        '| 2026-04-25 | learner-E | ready | 300-599 | 4 | no-gap | override-active | real-production | OK |',
        '| 2026-04-26 | sim-1 | ready | 0-99 | 1 | no-gap | no-override | simulation | OK |',
      ]);
      const reader = createMockReader(files);
      const result = validateCertification(MANIFEST, reader, ROOT);
      // Real date keys: only 2026-04-25 (1 key), fails min_real_datekeys_2
      assert.equal(result.rings['A3-1'].pass, false);
      assert.ok(result.rings['A3-1'].failures.some(f => f.includes('real-production date keys (1/2)')));
    });

    it('min_real_learners_3 passes with 3 unique learners from real rows', () => {
      const files = happyFileMap();
      // Default happy path has learner-A, learner-B, learner-C as real learners
      const reader = createMockReader(files);
      const result = validateCertification(MANIFEST, reader, ROOT);
      assert.equal(result.rings['A3-1'].pass, true);
    });

    it('min_real_learners_3 fails with only 2 real learners', () => {
      const files = happyFileMap();
      files[fullPath('docs/plans/james/hero-mode/A/hero-pA3-internal-cohort-evidence.md')] = makeEvidenceContent([
        '| 2026-04-25 | learner-A | ready | 300-599 | 5 | no-gap | override-active | real-production | OK |',
        '| 2026-04-26 | learner-B | ready | 300-599 | 3 | no-gap | override-active | real-production | OK |',
        '| 2026-04-27 | learner-A | ready | 100-299 | 2 | no-gap | no-override | real-production | OK |',
        '| 2026-04-28 | learner-B | ready | 300-599 | 6 | no-gap | override-active | real-production | OK |',
        '| 2026-04-29 | learner-A | ready | 300-599 | 4 | no-gap | override-active | real-production | OK |',
      ]);
      const reader = createMockReader(files);
      const result = validateCertification(MANIFEST, reader, ROOT);
      assert.equal(result.rings['A3-1'].pass, false);
      assert.ok(result.rings['A3-1'].failures.some(f => f.includes('real-production learners (2/3)')));
    });
  });

  // ── Certification status logic ────────────────────────────────────

  describe('certification status logic', () => {
    it('all rings pass returns CERTIFIED_PRE_A4', () => {
      const reader = createMockReader(happyFileMap());
      const result = validateCertification(MANIFEST, reader, ROOT);
      assert.equal(result.status, 'CERTIFIED_PRE_A4');
      assert.equal(result.failures.length, 0);
      assert.equal(result.limitations.length, 0);
    });

    it('A3-0 failure returns NOT_CERTIFIED', () => {
      const files = happyFileMap();
      delete files[fullPath('docs/plans/james/hero-mode/A/hero-pA3-rollback-procedure.md')];
      const reader = createMockReader(files);
      const result = validateCertification(MANIFEST, reader, ROOT);
      assert.equal(result.status, 'NOT_CERTIFIED');
      assert.equal(result.rings['A3-0'].pass, false);
    });

    it('A3-1 failure returns NOT_CERTIFIED', () => {
      const files = happyFileMap();
      // Replace evidence with all simulation
      files[fullPath('docs/plans/james/hero-mode/A/hero-pA3-internal-cohort-evidence.md')] = makeEvidenceContent([
        '| 2026-04-25 | sim-1 | ready | 300-599 | 5 | no-gap | no-override | simulation | OK |',
      ]);
      const reader = createMockReader(files);
      const result = validateCertification(MANIFEST, reader, ROOT);
      assert.equal(result.status, 'NOT_CERTIFIED');
      assert.equal(result.rings['A3-1'].pass, false);
    });

    it('A3-2 failure returns CERTIFIED_WITH_LIMITATIONS', () => {
      const files = happyFileMap();
      delete files[fullPath('reports/hero/hero-pA3-telemetry-report.json')];
      const reader = createMockReader(files);
      const result = validateCertification(MANIFEST, reader, ROOT);
      assert.equal(result.status, 'CERTIFIED_WITH_LIMITATIONS');
      assert.equal(result.rings['A3-2'].pass, false);
      assert.ok(result.limitations.some(l => l.includes('A3-2')));
    });

    it('A3-5 failure (optional) does NOT downgrade status', () => {
      const files = happyFileMap();
      // Remove the external cohort evidence to make A3-5 fail
      delete files[fullPath('docs/plans/james/hero-mode/A/hero-pA3-external-cohort-evidence.md')];
      const reader = createMockReader(files);
      const result = validateCertification(MANIFEST, reader, ROOT);
      // A3-5 fails but status remains CERTIFIED_PRE_A4 because it is optional
      assert.equal(result.rings['A3-5'].pass, false);
      assert.equal(result.status, 'CERTIFIED_PRE_A4');
    });

    it('A3-3 PENDING status returns CERTIFIED_WITH_LIMITATIONS', () => {
      const files = happyFileMap();
      files[fullPath('docs/plans/james/hero-mode/A/hero-pA3-browser-qa-evidence.md')] =
        '# Browser QA\n\n**Status:** PENDING\n\nAwaiting results.';
      const reader = createMockReader(files);
      const result = validateCertification(MANIFEST, reader, ROOT);
      assert.equal(result.status, 'CERTIFIED_WITH_LIMITATIONS');
      assert.equal(result.rings['A3-3'].pass, false);
    });

    it('A3-4 missing recommendation returns CERTIFIED_WITH_LIMITATIONS', () => {
      const files = happyFileMap();
      files[fullPath('docs/plans/james/hero-mode/A/hero-pA3-recommendation.md')] =
        '# Recommendation\n\nPending decision.';
      const reader = createMockReader(files);
      const result = validateCertification(MANIFEST, reader, ROOT);
      assert.equal(result.status, 'CERTIFIED_WITH_LIMITATIONS');
      assert.equal(result.rings['A3-4'].pass, false);
    });
  });

  // ── Full pipeline with mock fileReader ────────────────────────────

  describe('full pipeline', () => {
    it('empty file system returns NOT_CERTIFIED with all rings failing', () => {
      const reader = createMockReader({});
      const result = validateCertification(MANIFEST, reader, ROOT);
      assert.equal(result.status, 'NOT_CERTIFIED');
      for (const ring of Object.values(result.rings)) {
        assert.equal(ring.pass, false);
      }
    });

    it('critical rings pass but non-critical fail returns CERTIFIED_WITH_LIMITATIONS', () => {
      const files = happyFileMap();
      // Remove A3-2 evidence (non-critical)
      delete files[fullPath('reports/hero/hero-pA3-telemetry-report.json')];
      // Remove A3-4 evidence (non-critical)
      delete files[fullPath('docs/plans/james/hero-mode/A/hero-pA3-risk-register.md')];
      const reader = createMockReader(files);
      const result = validateCertification(MANIFEST, reader, ROOT);
      assert.equal(result.status, 'CERTIFIED_WITH_LIMITATIONS');
      assert.equal(result.rings['A3-0'].pass, true);
      assert.equal(result.rings['A3-1'].pass, true);
      assert.equal(result.rings['A3-2'].pass, false);
      assert.equal(result.rings['A3-4'].pass, false);
      assert.equal(result.limitations.length, 2);
    });
  });

  // ── checkStatusNotPending ─────────────────────────────────────────

  describe('helper: checkStatusNotPending', () => {
    it('returns true when no PENDING status', () => {
      assert.equal(checkStatusNotPending('Status: APPROVED'), true);
    });

    it('returns false for plain Status: PENDING', () => {
      assert.equal(checkStatusNotPending('Status: PENDING'), false);
    });

    it('returns false for bold **Status:** PENDING', () => {
      assert.equal(checkStatusNotPending('**Status:** PENDING'), false);
    });
  });
});
