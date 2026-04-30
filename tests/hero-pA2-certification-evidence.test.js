import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateCertification,
  checkStatusNotPending,
  countObservations,
  checkContainsDecision,
} from '../scripts/validate-hero-pA2-certification-evidence.mjs';

// ── Fixtures ────────────────────────────────────────────────────────

const MANIFEST = {
  phase: 'hero-pA2',
  date: '2026-04-29',
  description: 'Certification manifest for Hero Mode pA2',
  rings: {
    'A2-0': {
      name: 'Evidence close-out',
      requiredEvidence: [
        {
          path: 'docs/plans/james/hero-mode/A/hero-pA1-recommendation.md',
          condition: 'status_not_pending',
          description: 'pA1 recommendation finalised (not PENDING)',
        },
      ],
    },
    'A2-1': {
      name: 'Ops + Privacy + Launchability',
      requiredTests: [
        'tests/hero-pA2-privacy-recursive.test.js',
        'tests/hero-pA2-launchability-secure-grammar.test.js',
        'tests/hero-pA2-ops-probe.test.js',
        'tests/hero-pA2-internal-override-surface.test.js',
      ],
    },
    'A2-2': {
      name: 'Internal production enablement',
      requiredEvidence: [
        {
          path: 'docs/plans/james/hero-mode/A/hero-pA2-internal-cohort-evidence.md',
          condition: 'min_observations_1',
          description: 'At least 1 cohort observation recorded',
        },
      ],
    },
    'A2-3': {
      name: 'Multi-day internal cohort',
      requiredEvidence: [
        {
          path: 'docs/plans/james/hero-mode/A/hero-pA2-internal-cohort-evidence.md',
          condition: 'min_observations_5_min_datekeys_2',
          description: 'At least 5 dated observations with at least 2 unique date keys',
        },
      ],
    },
    'A2-4': {
      name: 'A3 recommendation',
      requiredEvidence: [
        {
          path: 'docs/plans/james/hero-mode/A/hero-pA2-metrics-baseline.md',
          condition: 'file_exists',
          description: 'Metrics baseline document exists',
        },
        {
          path: 'docs/plans/james/hero-mode/A/hero-pA2-risk-register.md',
          condition: 'file_exists',
          description: 'Risk register document exists',
        },
        {
          path: 'docs/plans/james/hero-mode/A/hero-pA2-recommendation.md',
          condition: 'contains_decision',
          description: 'Recommendation contains one of: PROCEED / HOLD / ROLLBACK',
        },
      ],
    },
  },
  certificationStates: ['NOT_CERTIFIED', 'CERTIFIED_WITH_LIMITATIONS', 'CERTIFIED_PRE_A3'],
};

const ROOT = '/fake/root';

function fullPath(relativePath) {
  // Normalise to forward slashes for consistent path joining
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

function happyFileMap() {
  return {
    [fullPath('docs/plans/james/hero-mode/A/hero-pA1-recommendation.md')]:
      '# pA1 Recommendation\n\nStatus: APPROVED\n\nProceeding to A2.',
    [fullPath('tests/hero-pA2-privacy-recursive.test.js')]: '// test',
    [fullPath('tests/hero-pA2-launchability-secure-grammar.test.js')]: '// test',
    [fullPath('tests/hero-pA2-ops-probe.test.js')]: '// test',
    [fullPath('tests/hero-pA2-internal-override-surface.test.js')]: '// test',
    [fullPath('docs/plans/james/hero-mode/A/hero-pA2-internal-cohort-evidence.md')]: [
      '# Cohort Evidence',
      '',
      '| Date | Observation |',
      '|------|-------------|',
      '| 2026-04-25 | Session 1 completed |',
      '| 2026-04-25 | Session 2 completed |',
      '| 2026-04-26 | Session 3 completed |',
      '| 2026-04-26 | Session 4 completed |',
      '| 2026-04-27 | Session 5 completed |',
    ].join('\n'),
    [fullPath('docs/plans/james/hero-mode/A/hero-pA2-metrics-baseline.md')]:
      '# Metrics Baseline\n\nBaseline captured.',
    [fullPath('docs/plans/james/hero-mode/A/hero-pA2-risk-register.md')]:
      '# Risk Register\n\nNo blocking risks.',
    [fullPath('docs/plans/james/hero-mode/A/hero-pA2-recommendation.md')]:
      '# Recommendation\n\nDecision: PROCEED TO A3\n\nRationale: all rings pass.',
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Hero pA2 Certification Validator', () => {
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

  describe('helper: countObservations', () => {
    it('counts dated observation lines', () => {
      const content = '| 2026-04-25 | obs1 |\n| 2026-04-26 | obs2 |\n| 2026-04-26 | obs3 |';
      const result = countObservations(content);
      assert.equal(result.count, 3);
      assert.deepEqual(result.dateKeys.sort(), ['2026-04-25', '2026-04-26']);
    });

    it('returns zero for no observations', () => {
      const result = countObservations('No table rows here.');
      assert.equal(result.count, 0);
      assert.deepEqual(result.dateKeys, []);
    });
  });

  describe('helper: checkContainsDecision', () => {
    it('finds PROCEED TO A3 with Decision: prefix', () => {
      assert.equal(checkContainsDecision('Decision: PROCEED TO A3'), true);
    });

    it('finds HOLD AND HARDEN with Recommendation: prefix', () => {
      assert.equal(checkContainsDecision('**Recommendation:** HOLD AND HARDEN'), true);
    });

    it('finds ROLLBACK with Decision: prefix', () => {
      assert.equal(checkContainsDecision('Decision: ROLLBACK'), true);
    });

    it('returns false when no decision keyword at all', () => {
      assert.equal(checkContainsDecision('No decision here.'), false);
    });

    it('rejects placeholder text inside square brackets', () => {
      const placeholder = '**Recommendation:** [PROCEED TO A3 / HOLD AND HARDEN / ROLLBACK]';
      assert.equal(checkContainsDecision(placeholder), false);
    });

    it('returns false when decision keyword in body text without label prefix', () => {
      const bodyOnly = 'We should PROCEED TO A3 based on evidence.';
      assert.equal(checkContainsDecision(bodyOnly), false);
    });

    it('finds decision on a multi-line document with label', () => {
      const doc = [
        '# Recommendation',
        '',
        'Some preamble text.',
        '',
        '**Decision:** PROCEED TO A3',
        '',
        'Rationale: all rings pass.',
      ].join('\n');
      assert.equal(checkContainsDecision(doc), true);
    });
  });

  describe('happy path: all evidence present', () => {
    it('returns CERTIFIED_PRE_A3', () => {
      const reader = createMockReader(happyFileMap());
      const result = validateCertification(MANIFEST, reader, ROOT);

      assert.equal(result.status, 'CERTIFIED_PRE_A3');
      assert.equal(result.failures.length, 0);
      assert.equal(result.limitations.length, 0);

      for (const ring of Object.values(result.rings)) {
        assert.equal(ring.pass, true);
      }
    });
  });

  describe('pA1 recommendation still PENDING', () => {
    it('returns NOT_CERTIFIED with reason', () => {
      const files = happyFileMap();
      files[fullPath('docs/plans/james/hero-mode/A/hero-pA1-recommendation.md')] =
        '# pA1 Recommendation\n\n**Status:** PENDING\n\nAwaiting evidence.';

      const reader = createMockReader(files);
      const result = validateCertification(MANIFEST, reader, ROOT);

      assert.equal(result.status, 'NOT_CERTIFIED');
      assert.equal(result.rings['A2-0'].pass, false);
      assert.ok(result.failures.some((f) => f.includes('PENDING')));
    });
  });

  describe('cohort evidence has only 3 observations', () => {
    it('returns CERTIFIED_WITH_LIMITATIONS (A2-3 fails for < 5)', () => {
      const files = happyFileMap();
      files[fullPath('docs/plans/james/hero-mode/A/hero-pA2-internal-cohort-evidence.md')] = [
        '# Cohort Evidence',
        '',
        '| Date | Observation |',
        '|------|-------------|',
        '| 2026-04-25 | Session 1 |',
        '| 2026-04-26 | Session 2 |',
        '| 2026-04-27 | Session 3 |',
      ].join('\n');

      const reader = createMockReader(files);
      const result = validateCertification(MANIFEST, reader, ROOT);

      // A2-2 passes (min 1 observation), A2-3 fails (needs 5 observations)
      assert.equal(result.rings['A2-2'].pass, true);
      assert.equal(result.rings['A2-3'].pass, false);
      assert.equal(result.status, 'CERTIFIED_WITH_LIMITATIONS');
      assert.ok(result.limitations.some((l) => l.includes('A2-3')));
    });
  });

  describe('cohort evidence has 5 observations but only 1 date key', () => {
    it('returns CERTIFIED_WITH_LIMITATIONS (A2-3 fails for < 2 date keys)', () => {
      const files = happyFileMap();
      files[fullPath('docs/plans/james/hero-mode/A/hero-pA2-internal-cohort-evidence.md')] = [
        '# Cohort Evidence',
        '',
        '| Date | Observation |',
        '|------|-------------|',
        '| 2026-04-25 | Session 1 |',
        '| 2026-04-25 | Session 2 |',
        '| 2026-04-25 | Session 3 |',
        '| 2026-04-25 | Session 4 |',
        '| 2026-04-25 | Session 5 |',
      ].join('\n');

      const reader = createMockReader(files);
      const result = validateCertification(MANIFEST, reader, ROOT);

      assert.equal(result.rings['A2-3'].pass, false);
      assert.equal(result.status, 'CERTIFIED_WITH_LIMITATIONS');
      assert.ok(result.rings['A2-3'].failures.some((f) => f.includes('date keys')));
    });
  });

  describe('metrics baseline missing', () => {
    it('returns CERTIFIED_WITH_LIMITATIONS stating which component lacks evidence', () => {
      const files = happyFileMap();
      delete files[fullPath('docs/plans/james/hero-mode/A/hero-pA2-metrics-baseline.md')];

      const reader = createMockReader(files);
      const result = validateCertification(MANIFEST, reader, ROOT);

      assert.equal(result.status, 'CERTIFIED_WITH_LIMITATIONS');
      assert.equal(result.rings['A2-4'].pass, false);
      assert.ok(result.rings['A2-4'].failures.some((f) => f.includes('metrics-baseline')));
      assert.ok(result.limitations.some((l) => l.includes('A2-4')));
    });
  });

  describe('all A2-1 test files exist', () => {
    it('ring A2-1 passes', () => {
      const reader = createMockReader(happyFileMap());
      const result = validateCertification(MANIFEST, reader, ROOT);

      assert.equal(result.rings['A2-1'].pass, true);
      assert.equal(result.rings['A2-1'].failures.length, 0);
    });
  });

  describe('one A2-1 test file missing', () => {
    it('ring A2-1 fails and status is NOT_CERTIFIED', () => {
      const files = happyFileMap();
      delete files[fullPath('tests/hero-pA2-internal-override-surface.test.js')];

      const reader = createMockReader(files);
      const result = validateCertification(MANIFEST, reader, ROOT);

      assert.equal(result.rings['A2-1'].pass, false);
      assert.equal(result.status, 'NOT_CERTIFIED');
      assert.ok(result.rings['A2-1'].failures.some((f) => f.includes('internal-override-surface')));
    });
  });
});
