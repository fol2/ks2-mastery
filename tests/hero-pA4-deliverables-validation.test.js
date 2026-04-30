/**
 * Hero Mode pA4 — Deliverables Validation Test
 *
 * Validates ALL contract deliverables exist (origin §19) and contain
 * the required structural elements per the pA4 specification.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

function readDoc(relativePath) {
  const fullPath = resolve(ROOT, relativePath);
  if (!existsSync(fullPath)) return null;
  return readFileSync(fullPath, 'utf8');
}

// §19 — All 9 documentation deliverables
const REQUIRED_DELIVERABLES = [
  'docs/plans/james/hero-mode/A/hero-pA4-release-candidate.md',       // §19.2
  'docs/plans/james/hero-mode/A/hero-pA4-parent-explainer.md',        // §19.3
  'docs/plans/james/hero-mode/A/hero-pA4-support-pack.md',            // §19.4
  'docs/plans/james/hero-mode/A/hero-pA4-external-cohort-evidence.md',// §19.5
  'docs/plans/james/hero-mode/A/hero-pA4-metrics-summary.md',         // §19.6
  'docs/plans/james/hero-mode/A/hero-pA4-risk-register.md',           // §19.7
  'docs/plans/james/hero-mode/A/hero-pA4-rollback-evidence.md',       // §19.8
  'docs/plans/james/hero-mode/A/hero-pA4-recommendation.md',          // §19.9
  'docs/plans/james/hero-mode/A/hero-pA4-default-on-plan.md',         // §19.10
];

describe('pA4 Contract Deliverables — Existence (§19)', () => {
  for (const path of REQUIRED_DELIVERABLES) {
    it(`deliverable exists: ${path}`, () => {
      const fullPath = resolve(ROOT, path);
      assert.ok(existsSync(fullPath), `Missing deliverable: ${path}`);
    });
  }

  it('§19.1 — external cohort control implementation exists', () => {
    const fullPath = resolve(ROOT, 'shared/hero/account-override.js');
    assert.ok(existsSync(fullPath), 'Missing: shared/hero/account-override.js');
  });

  it('§19 — browser smoke validation script exists', () => {
    const fullPath = resolve(ROOT, 'scripts/hero-pA4-external-cohort-smoke.mjs');
    assert.ok(existsSync(fullPath), 'Missing: scripts/hero-pA4-external-cohort-smoke.mjs');
  });
});

describe('Release Candidate — Structural Validation (§15.3)', () => {
  const content = readDoc('docs/plans/james/hero-mode/A/hero-pA4-release-candidate.md');

  it('document exists and is non-empty', () => {
    assert.ok(content, 'Release candidate document missing');
    assert.ok(content.length > 100, 'Release candidate document too short');
  });

  it('lists allowed change categories', () => {
    assert.ok(content.includes('Blocker fixes'), 'Missing allowed: Blocker fixes');
    assert.ok(content.includes('Rollout-control fixes'), 'Missing allowed: Rollout-control fixes');
    assert.ok(content.includes('Privacy fixes'), 'Missing allowed: Privacy fixes');
    assert.ok(content.includes('Support/ops fixes'), 'Missing allowed: Support/ops fixes');
    assert.ok(content.includes('Copy changes'), 'Missing allowed: Copy changes');
  });

  it('lists rejected change categories (§15.3)', () => {
    assert.ok(content.includes('New gameplay'), 'Missing rejected: New gameplay');
    assert.ok(content.includes('New economy mechanics'), 'Missing rejected: New economy mechanics');
    assert.ok(content.includes('New monsters'), 'Missing rejected: New monsters');
    assert.ok(content.includes('Visual polish'), 'Missing rejected: Visual polish');
    assert.ok(content.includes('Broad refactors'), 'Missing rejected: Broad refactors');
    assert.ok(content.includes('Unrelated subject work'), 'Missing rejected: Unrelated subject work');
  });

  it('contains entry criteria checklist', () => {
    assert.ok(content.includes('Entry Criteria'), 'Missing entry criteria section');
    assert.ok(content.includes('VERIFIED'), 'No VERIFIED criteria');
    assert.ok(content.includes('PENDING'), 'No PENDING criteria');
  });

  it('references CANDIDATE status', () => {
    assert.ok(content.includes('CANDIDATE'), 'Missing CANDIDATE status');
  });
});

describe('Recommendation Template — Structural Validation (§16.3)', () => {
  const content = readDoc('docs/plans/james/hero-mode/A/hero-pA4-recommendation.md');

  it('document exists and is non-empty', () => {
    assert.ok(content, 'Recommendation document missing');
    assert.ok(content.length > 100, 'Recommendation document too short');
  });

  it('enforces one-of-three decision', () => {
    assert.ok(content.includes('PROCEED TO STAGED DEFAULT-ON'), 'Missing decision: PROCEED');
    assert.ok(content.includes('HOLD AND HARDEN'), 'Missing decision: HOLD AND HARDEN');
    assert.ok(content.includes('ROLL BACK / KEEP DORMANT'), 'Missing decision: ROLL BACK');
  });

  it('has evidence boundary fields', () => {
    assert.ok(content.includes('Cohort size'), 'Missing: Cohort size');
    assert.ok(content.includes('Duration'), 'Missing: Duration');
    assert.ok(content.includes('Stop conditions triggered'), 'Missing: Stop conditions triggered');
  });

  it('has product value judgement', () => {
    assert.ok(content.includes('Start rate'), 'Missing: Start rate');
    assert.ok(content.includes('Completion rate'), 'Missing: Completion rate');
    assert.ok(content.includes('Return rate'), 'Missing: Return rate');
    assert.ok(content.includes('Support load'), 'Missing: Support load');
    assert.ok(content.includes('Child comprehension'), 'Missing: Child comprehension');
  });

  it('has unresolved risks section', () => {
    assert.ok(content.includes('Unresolved Risks'), 'Missing: Unresolved Risks section');
    assert.ok(content.includes('Severity'), 'Missing: Severity column');
    assert.ok(content.includes('Mitigation'), 'Missing: Mitigation column');
  });

  it('has next rollout mechanism fields', () => {
    assert.ok(content.includes('Target population'), 'Missing: Target population');
    assert.ok(content.includes('Flag mechanism'), 'Missing: Flag mechanism');
    assert.ok(content.includes('Monitoring window'), 'Missing: Monitoring window');
    assert.ok(content.includes('Rollback trigger'), 'Missing: Rollback trigger');
    assert.ok(content.includes('Owner'), 'Missing: Owner');
    assert.ok(content.includes('Support coverage'), 'Missing: Support coverage');
    assert.ok(content.includes('Known limitations'), 'Missing: Known limitations');
    assert.ok(content.includes('Next review date'), 'Missing: Next review date');
  });

  it('has signatures section', () => {
    assert.ok(content.includes('Signatures'), 'Missing: Signatures section');
    assert.ok(content.includes('Product owner'), 'Missing: Product owner row');
    assert.ok(content.includes('Engineering owner'), 'Missing: Engineering owner row');
    assert.ok(content.includes('Support owner'), 'Missing: Support owner row');
  });

  it('is marked as TEMPLATE status', () => {
    assert.ok(content.includes('TEMPLATE'), 'Missing TEMPLATE status');
  });
});

describe('Default-On Plan — Structural Validation (§6 Goal 5)', () => {
  const content = readDoc('docs/plans/james/hero-mode/A/hero-pA4-default-on-plan.md');

  it('document exists and is non-empty', () => {
    assert.ok(content, 'Default-on plan document missing');
    assert.ok(content.length > 100, 'Default-on plan document too short');
  });

  it('has 4-stage ladder', () => {
    assert.ok(content.includes('Stage'), 'Missing: Stage header');
    // Verify all 4 stages exist
    assert.ok(content.includes('| 1 |'), 'Missing: Stage 1');
    assert.ok(content.includes('| 2 |'), 'Missing: Stage 2');
    assert.ok(content.includes('| 3 |'), 'Missing: Stage 3');
    assert.ok(content.includes('| 4 |'), 'Missing: Stage 4');
  });

  it('Stage 1 targets new eligible accounts', () => {
    assert.ok(content.includes('New eligible accounts'), 'Stage 1 must target new eligible accounts');
  });

  it('Stage 2 uses percentage bucket (5%)', () => {
    assert.ok(content.includes('HERO_ROLLOUT_PERCENT=5'), 'Stage 2 must use 5% rollout');
  });

  it('Stage 3 widens to 25%', () => {
    assert.ok(content.includes('HERO_ROLLOUT_PERCENT=25'), 'Stage 3 must use 25% rollout');
  });

  it('Stage 4 is default-on globally', () => {
    assert.ok(content.includes('HERO_MODE_'), 'Stage 4 must reference HERO_MODE flags');
    assert.ok(content.includes('globally'), 'Stage 4 must be global');
  });

  it('states prerequisite is PROCEED recommendation', () => {
    assert.ok(content.includes('PROCEED TO STAGED DEFAULT-ON'), 'Must reference PROCEED prerequisite');
  });

  it('describes rollback mechanism', () => {
    assert.ok(content.includes('Rollback'), 'Missing: Rollback section');
    assert.ok(content.includes('dormant'), 'Rollback must preserve state as dormant');
  });

  it('defines what must be true before Stage 4', () => {
    assert.ok(content.includes('What Must Be True Before Stage 4'), 'Missing: Stage 4 preconditions');
    assert.ok(content.includes('Locked subjects'), 'Missing population: locked subjects');
    assert.ok(content.includes('Multi-learner households'), 'Missing population: multi-learner');
    assert.ok(content.includes('Returning old accounts'), 'Missing population: returning accounts');
    assert.ok(content.includes('First-time accounts'), 'Missing population: first-time');
    assert.ok(content.includes('Low-connectivity'), 'Missing population: low-connectivity');
    assert.ok(content.includes('Support paths'), 'Missing population: support paths');
  });

  it('explicitly requires more than "routes return 200"', () => {
    assert.ok(content.includes('routes return 200'), 'Must call out the "not just 200" requirement');
  });

  it('is marked as TEMPLATE status', () => {
    assert.ok(content.includes('TEMPLATE'), 'Missing TEMPLATE status');
  });
});
