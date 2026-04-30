import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSixtyLearnerDiagnosticPlan,
  runSixtyLearnerDiagnosticPlanner,
  validateSixtyLearnerDiagnosticPlan,
} from '../scripts/plan-60-learner-diagnostic.mjs';

test('60-learner diagnostic planner emits the full dry-run-safe command plan', () => {
  const plan = buildSixtyLearnerDiagnosticPlan();
  const commandIds = plan.commands.map((command) => command.id);

  assert.equal(plan.kind, 'p5-60-learner-diagnostic-plan');
  assert.equal(plan.runId, '2026-04-30-p5-60-diagnostic');
  assert.equal(plan.origin, 'https://ks2.eugnel.uk');
  assert.equal(plan.manifestPath, '/tmp/ks2-p5-60-manifest.json');
  assert.equal(plan.rawTailPath, '/tmp/ks2-2026-04-30-p5-60-diagnostic-worker-tail.jsonl');
  assert.equal(plan.diagnosticEvidencePath, 'reports/capacity/evidence/2026-04-30-p5-60-diagnostic.json');
  assert.equal(plan.tailCorrelationPath, 'reports/capacity/evidence/2026-04-30-p5-60-tail-correlation.json');
  assert.equal(plan.statementMapPath, 'reports/capacity/evidence/2026-04-30-p5-60-statement-map.json');
  assert.equal(plan.tailClassificationPath, 'reports/capacity/evidence/2026-04-30-p5-60-tail-classification.md');
  assert.deepEqual(commandIds, [
    'prepare-session-manifest',
    'start-worker-tail',
    'run-60-diagnostic',
    'join-worker-logs',
    'build-statement-map',
  ]);
  assert.match(plan.rawLogWarning, /must not be committed/i);
  assert.equal(plan.execution.localValidationOnly, true);
});

test('60-learner diagnostic planner validates script paths and documented options', () => {
  const plan = buildSixtyLearnerDiagnosticPlan();
  const validation = validateSixtyLearnerDiagnosticPlan(plan);

  assert.deepEqual(validation.errors, []);
  assert.equal(validation.ok, true);
});

test('60-learner diagnostic planner fails if a referenced script path does not exist', () => {
  const plan = buildSixtyLearnerDiagnosticPlan();
  plan.commands[0] = {
    ...plan.commands[0],
    argv: ['node', 'scripts/not-a-real-script.mjs', '--help'],
  };
  const validation = validateSixtyLearnerDiagnosticPlan(plan);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /Missing script path/);
});

test('60-learner diagnostic planner fails if a documented option is unknown', () => {
  const plan = buildSixtyLearnerDiagnosticPlan();
  const manifest = plan.commands.find((command) => command.id === 'prepare-session-manifest');
  manifest.argv.push('--bucket-reset-minutes', '10');
  const validation = validateSixtyLearnerDiagnosticPlan(plan);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /Unknown option: --bucket-reset-minutes/);
});

test('60-learner diagnostic planner locks production mode safety flags', () => {
  const plan = buildSixtyLearnerDiagnosticPlan();
  const load = plan.commands.find((command) => command.id === 'run-60-diagnostic');
  const args = load.argv.slice(load.argv.indexOf('--') + 1);

  assert.ok(args.includes('--production'));
  assert.ok(args.includes('--confirm-production-load'));
  assert.ok(args.includes('--confirm-high-production-load'));

  load.argv = load.argv.filter((arg) => arg !== '--confirm-high-production-load');
  const validation = validateSixtyLearnerDiagnosticPlan(plan);
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /confirm-high-production-load/);
});

test('60-learner diagnostic planner emits machine-readable JSON without credentials', async () => {
  const result = await runSixtyLearnerDiagnosticPlanner(['--json']);
  const payload = JSON.parse(result.output);

  assert.equal(result.ok, true);
  assert.equal(payload.ok, true);
  assert.equal(payload.plan.rawTailPath.startsWith('/tmp/'), true);
  assert.equal(payload.validation.ok, true);
});

test('60-learner diagnostic planner refuses full production execution ownership', async () => {
  const result = await runSixtyLearnerDiagnosticPlanner(['--execute', '--approved-production-run']);

  assert.equal(result.ok, false);
  assert.match(result.validation.errors.join('\n'), /Full production execution is intentionally not performed/);
});
