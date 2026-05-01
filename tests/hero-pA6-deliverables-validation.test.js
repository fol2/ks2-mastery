import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

const REQUIRED_DOCS = [
  'docs/plans/james/hero-mode/A/hero-pA6-preflight.md',
  'docs/plans/james/hero-mode/A/hero-pA6-live-rollout-log.md',
  'docs/plans/james/hero-mode/A/hero-pA6-metrics-summary.md',
  'docs/plans/james/hero-mode/A/hero-pA6-support-summary.md',
  'docs/plans/james/hero-mode/A/hero-pA6-rollback-evidence.md',
  'docs/plans/james/hero-mode/A/hero-pA6-production-decision.md',
];

const REQUIRED_ARTEFACTS = [
  'scripts/hero-pA6-metrics-extract.mjs',
  'reports/hero/hero-pA6-metrics-report.json',
];

function read(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

describe('Hero Mode pA6 deliverables', () => {
  it('creates the required close-out artefacts', () => {
    for (const path of [...REQUIRED_DOCS, ...REQUIRED_ARTEFACTS]) {
      assert.ok(existsSync(resolve(ROOT, path)), `Missing pA6 artefact: ${path}`);
    }
  });

  it('records one exact final decision and does not leave the outcome pending', () => {
    const decision = read('docs/plans/james/hero-mode/A/hero-pA6-production-decision.md');
    assert.ok(decision.includes('HOLD AT CURRENT ROLLOUT PERCENTAGE'));
    assert.equal(decision.includes('[PENDING]'), false);
    assert.equal(/NORMALISE HERO MODE[\s\S]*Selected outcome/i.test(decision), false);
    assert.ok(decision.includes('Review-by date | 2026-05-15'));
    assert.ok(decision.includes('Repository-declared rollout-bucket percentage | 0% effective'));
    assert.ok(decision.includes('Secret-name check | `node scripts/wrangler-oauth.mjs secret list`'));
    assert.ok(decision.includes('Exact live allowlist size | BLOCKED'));
    assert.ok(decision.includes('A6 HOLD contract boundary | BLOCKED'));
  });

  it('keeps live rollout evidence honest rather than counting pA5 templates', () => {
    const preflight = read('docs/plans/james/hero-mode/A/hero-pA6-preflight.md');
    const rollout = read('docs/plans/james/hero-mode/A/hero-pA6-live-rollout-log.md');

    assert.ok(preflight.includes('pA5 template rows are not countable as live evidence'));
    assert.ok(preflight.includes('HERO_ROLLOUT_PERCENT` is absent from the tracked Worker vars'));
    assert.ok(preflight.includes('HERO_INTERNAL_ACCOUNTS` is present but its value/size is hidden'));
    assert.ok(rollout.includes('No new production accounts widened by this branch'));
    assert.ok(rollout.includes('rollout-bucket path is effectively 0%'));
    assert.ok(rollout.includes('HOLD AT CURRENT ROLLOUT PERCENTAGE'));
    assert.ok(rollout.includes('not a contract-complete production HOLD certification'));
    assert.equal(/normalised by this branch/i.test(rollout), false);
  });

  it('documents the schema-accurate metric boundary', () => {
    const metrics = read('docs/plans/james/hero-mode/A/hero-pA6-metrics-summary.md');

    assert.ok(metrics.includes("`child_game_state` where `system_id = 'hero-mode'`"));
    assert.ok(metrics.includes('event_log` | Observational telemetry mirror only'));
    assert.ok(metrics.includes('not-observable-yet | 11'));
    assert.ok(metrics.includes('Zero supplied rows do not prove zero production issues'));
    assert.ok(metrics.includes('no-live-export-supplied'));
    assert.ok(metrics.includes('status: "not-evaluated"'));
    assert.ok(metrics.includes('Hero route 5xx count'));
    assert.ok(metrics.includes('Exposure to excluded accounts'));
  });

  it('requires owners and production rollback evidence before widening', () => {
    const support = read('docs/plans/james/hero-mode/A/hero-pA6-support-summary.md');
    const rollback = read('docs/plans/james/hero-mode/A/hero-pA6-rollback-evidence.md');
    const decision = read('docs/plans/james/hero-mode/A/hero-pA6-production-decision.md');

    assert.ok(support.includes('Support owner | Not recorded'));
    assert.ok(support.includes('| **Total** | 0 | 0 | 0 | No support rows supplied; not proof of zero live support issues |'));
    assert.ok(support.includes('## Evidence Blockers'));
    assert.ok(rollback.includes('production rollback rehearsal still needs to prove'));
    assert.ok(decision.includes('REQUIRED BEFORE WIDENING'));
  });
});
