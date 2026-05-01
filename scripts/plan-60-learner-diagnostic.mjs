#!/usr/bin/env node

import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  parseArgs as parseSessionManifestArgs,
  validate as validateSessionManifestOptions,
} from './prepare-session-manifest.mjs';
import {
  parseClassroomLoadArgs,
  validateClassroomLoadOptions,
} from './classroom-load-test.mjs';
import { parseJoinArgs } from './join-capacity-worker-logs.mjs';
import { parseStatementMapArgs } from './build-capacity-statement-map.mjs';

export const DEFAULT_P5_DATE = '2026-04-30';
export const DEFAULT_ORIGIN = 'https://ks2.eugnel.uk';
export const DEFAULT_RUN_ID = `${DEFAULT_P5_DATE}-p5-60-diagnostic`;
export const DEFAULT_MANIFEST_PATH = '/tmp/ks2-p5-60-manifest.json';
export const DEFAULT_RAW_TAIL_PATH = `/tmp/ks2-${DEFAULT_RUN_ID}-worker-tail.jsonl`;
export const DEFAULT_DECISION_PATH = 'docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p5-60-diagnostic-decision.md';
export const EXPECTED_DURATION = 'At least 25 minutes for 28/28/4 manifest preparation plus diagnostic and post-run correlation time.';

const SCRIPT_VALIDATORS = Object.freeze({
  'scripts/prepare-session-manifest.mjs': validateManifestCommand,
  'scripts/join-capacity-worker-logs.mjs': validateJoinCommand,
  'scripts/build-capacity-statement-map.mjs': validateStatementMapCommand,
});

export function parseDiagnosticPlannerArgs(argv = process.argv.slice(2)) {
  const options = {
    json: false,
    execute: false,
    approvedProductionRun: false,
    runId: DEFAULT_RUN_ID,
    origin: DEFAULT_ORIGIN,
    manifestPath: DEFAULT_MANIFEST_PATH,
    rawTailPath: DEFAULT_RAW_TAIL_PATH,
    evidencePath: '',
    tailCorrelationPath: '',
    statementMapPath: '',
    tailClassificationPath: '',
    decisionPath: '',
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--execute') {
      options.execute = true;
    } else if (arg === '--approved-production-run') {
      options.approvedProductionRun = true;
    } else if (arg === '--run-id') {
      options.runId = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--origin') {
      options.origin = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--manifest-path') {
      options.manifestPath = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--raw-tail-path') {
      options.rawTailPath = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--evidence') {
      options.evidencePath = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--tail-correlation') {
      options.tailCorrelationPath = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--statement-map') {
      options.statementMapPath = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--tail-classification') {
      options.tailClassificationPath = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--decision') {
      options.decisionPath = readValue(argv, index, arg);
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function readValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${optionName} requires a value.`);
  return value;
}

function commandString(argv) {
  return argv.map((part) => (
    /[\s"$]/.test(String(part)) ? JSON.stringify(String(part)) : String(part)
  )).join(' ');
}

function derivePaths(options) {
  const runId = options.runId || DEFAULT_RUN_ID;
  const runSlug = runId.replace(/-diagnostic$/, '');
  return {
    phase: derivePhase(runSlug),
    evidencePath: options.evidencePath || `reports/capacity/evidence/${runId}.json`,
    tailCorrelationPath: options.tailCorrelationPath || `reports/capacity/evidence/${runSlug}-tail-correlation.json`,
    statementMapPath: options.statementMapPath || `reports/capacity/evidence/${runSlug}-statement-map.json`,
    tailClassificationPath: options.tailClassificationPath || `reports/capacity/evidence/${runSlug}-tail-classification.md`,
    decisionPath: options.decisionPath || deriveDecisionPath(runSlug),
  };
}

function derivePhase(runSlug) {
  const match = runSlug.match(/^(?<date>\d{4}-\d{2}-\d{2})-(?<phase>p\d+)-60$/);
  return match?.groups?.phase || 'p5';
}

function deriveDecisionPath(runSlug) {
  const phase = derivePhase(runSlug);
  if (!phase) return DEFAULT_DECISION_PATH;
  return `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-${phase}-60-diagnostic-decision.md`;
}

export function buildSixtyLearnerDiagnosticPlan(options = {}) {
  const merged = {
    ...parseDiagnosticPlannerArgs([]),
    ...options,
  };
  const paths = derivePaths(merged);
  const rawTailPath = merged.rawTailPath || `/tmp/ks2-${merged.runId}-worker-tail.jsonl`;
  const commands = [
    {
      id: 'prepare-session-manifest',
      description: 'Prepare 60 demo sessions in 28/28/4 batches.',
      kind: 'node',
      argv: [
        'node',
        'scripts/prepare-session-manifest.mjs',
        '--origin', merged.origin,
        '--learners', '60',
        '--batch-size', '28',
        '--delay-ms', '610000',
        '--output', merged.manifestPath,
      ],
    },
    {
      id: 'start-worker-tail',
      description: 'Start raw JSON Worker tail capture before the load run.',
      kind: 'shell',
      argv: ['npm', 'run', 'ops:tail:json'],
      stdout: rawTailPath,
      background: true,
    },
    {
      id: 'run-60-diagnostic',
      description: 'Run the approved production 60-learner diagnostic.',
      kind: 'npm',
      argv: [
        'npm',
        'run',
        'capacity:classroom',
        '--',
        '--production',
        '--origin', merged.origin,
        '--session-manifest', merged.manifestPath,
        '--learners', '60',
        '--bootstrap-burst', '20',
        '--rounds', '1',
        '--config', 'reports/capacity/configs/60-learner-stretch.json',
        '--confirm-production-load',
        '--confirm-high-production-load',
        '--output', paths.evidencePath,
      ],
    },
    {
      id: 'join-worker-logs',
      description: 'Join the raw tail with the diagnostic evidence into a redacted correlation artefact.',
      kind: 'node',
      argv: [
        'node',
        'scripts/join-capacity-worker-logs.mjs',
        '--evidence', paths.evidencePath,
        '--logs', rawTailPath,
        '--output', paths.tailCorrelationPath,
      ],
    },
    {
      id: 'build-statement-map',
      description: 'Build the redacted capacity statement map.',
      kind: 'node',
      argv: [
        'node',
        'scripts/build-capacity-statement-map.mjs',
        '--input', rawTailPath,
        '--output', paths.statementMapPath,
      ],
    },
  ];

  return {
    schema: 1,
    kind: `${paths.phase}-60-learner-diagnostic-plan`,
    runId: merged.runId,
    origin: merged.origin,
    learners: 60,
    bootstrapBurst: 20,
    rounds: 1,
    thresholdConfig: 'reports/capacity/configs/60-learner-stretch.json',
    manifestPath: merged.manifestPath,
    rawTailPath,
    diagnosticEvidencePath: paths.evidencePath,
    tailCorrelationPath: paths.tailCorrelationPath,
    statementMapPath: paths.statementMapPath,
    tailClassificationPath: paths.tailClassificationPath,
    decisionPath: paths.decisionPath,
    expectedDuration: EXPECTED_DURATION,
    prerequisites: [
      'Cloudflare account credentials and wrangler tail access.',
      'Explicit production-run approval before live execution.',
      'Session-manifest preparation window for two 610000 ms bucket waits.',
      'Raw Worker tail path outside the repository.',
    ],
    rawLogWarning: 'Raw Worker tail JSONL must stay local/private and must not be committed.',
    execution: {
      dryRunDefault: true,
      localValidationOnly: true,
      fullProductionOwnedBy: 'approved-operator-gate',
      approvalRequired: true,
    },
    commands: commands.map((command) => ({
      ...command,
      command: command.stdout
        ? `${commandString(command.argv)} > ${JSON.stringify(command.stdout)}`
        : commandString(command.argv),
    })),
  };
}

export function validateSixtyLearnerDiagnosticPlan(plan, { cwd = process.cwd() } = {}) {
  const errors = [];
  for (const command of plan.commands || []) {
    if (command.kind === 'node') {
      const scriptPath = command.argv?.[1];
      const validator = SCRIPT_VALIDATORS[scriptPath];
      if (!scriptPath || !existsSync(path.resolve(cwd, scriptPath))) {
        errors.push(`Missing script path for ${command.id}: ${scriptPath || '(none)'}`);
        continue;
      }
      if (!validator) {
        errors.push(`No validator registered for ${scriptPath}`);
        continue;
      }
      try {
        validator(command.argv.slice(2));
      } catch (error) {
        errors.push(`${command.id}: ${error.message}`);
      }
    }
    if (command.id === 'run-60-diagnostic') {
      try {
        const classroomArgs = command.argv.slice(command.argv.indexOf('--') + 1);
        const options = parseClassroomLoadArgs(classroomArgs);
        validateClassroomLoadOptions(options);
        for (const required of ['--production', '--confirm-production-load', '--confirm-high-production-load']) {
          if (!classroomArgs.includes(required)) errors.push(`run-60-diagnostic missing ${required}`);
        }
      } catch (error) {
        errors.push(`run-60-diagnostic: ${error.message}`);
      }
    }
  }

  if (!path.isAbsolute(plan.rawTailPath || '')) {
    errors.push('rawTailPath must be absolute and outside the repository.');
  } else {
    const relative = path.relative(cwd, plan.rawTailPath);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      errors.push('rawTailPath must point outside the repository.');
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

function validateManifestCommand(argv) {
  const options = parseSessionManifestArgs(argv);
  validateSessionManifestOptions(options);
}

function validateJoinCommand(argv) {
  const options = parseJoinArgs(argv);
  if (!options.evidencePath) throw new Error('--evidence is required.');
  if (!options.logPaths.length) throw new Error('At least one --logs path is required.');
  if (!options.outputPath) throw new Error('--output is required.');
}

function validateStatementMapCommand(argv) {
  const options = parseStatementMapArgs(argv);
  if (!options.inputPaths.length) throw new Error('At least one --input path is required.');
  if (!options.outputPath) throw new Error('--output is required.');
}

function renderPlan(plan, validation) {
  const lines = [
    `60-learner diagnostic plan: ${plan.runId}`,
    `Origin: ${plan.origin}`,
    `Manifest: ${plan.manifestPath}`,
    `Raw tail: ${plan.rawTailPath}`,
    `Evidence: ${plan.diagnosticEvidencePath}`,
    `Tail correlation: ${plan.tailCorrelationPath}`,
    `Statement map: ${plan.statementMapPath}`,
    `Tail classification: ${plan.tailClassificationPath}`,
    `Expected duration: ${plan.expectedDuration}`,
    '',
    'Prerequisites:',
    ...plan.prerequisites.map((entry) => `- ${entry}`),
    '',
    `Raw-log warning: ${plan.rawLogWarning}`,
    '',
    'Commands:',
    ...plan.commands.map((command, index) => `${index + 1}. ${command.command}`),
    '',
    validation.ok ? 'Validation: ok' : `Validation: failed\n${validation.errors.map((entry) => `- ${entry}`).join('\n')}`,
  ];
  return `${lines.join('\n')}\n`;
}

export async function runSixtyLearnerDiagnosticPlanner(argv = process.argv.slice(2), {
  cwd = process.cwd(),
} = {}) {
  const options = parseDiagnosticPlannerArgs(argv);
  if (options.help) {
    return {
      ok: true,
      help: [
        'Usage: node scripts/plan-60-learner-diagnostic.mjs [--json] [--execute]',
        'Prints and validates the 60-learner diagnostic command plan.',
        '--execute runs local validation only; full production execution belongs to the approved operator gate.',
      ].join('\n'),
    };
  }

  const plan = buildSixtyLearnerDiagnosticPlan(options);
  const validation = validateSixtyLearnerDiagnosticPlan(plan, { cwd });
  if (options.execute && options.approvedProductionRun) {
    validation.errors.push('Full production execution is intentionally not performed by this planner; use the approved operator gate.');
  }
  const ok = validation.ok && validation.errors.length === 0;
  return {
    ok,
    plan,
    validation: { ok, errors: validation.errors },
    output: options.json ? JSON.stringify({ ok, plan, validation: { ok, errors: validation.errors } }, null, 2) : renderPlan(plan, { ok, errors: validation.errors }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSixtyLearnerDiagnosticPlanner().then((result) => {
    if (result.help) {
      console.log(result.help);
      return;
    }
    process.stdout.write(result.output);
    if (!result.ok) process.exitCode = 1;
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
