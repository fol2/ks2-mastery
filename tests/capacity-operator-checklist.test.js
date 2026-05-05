import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  parseArgs as parseSessionManifestArgs,
  validate as validateSessionManifestOptions,
} from '../scripts/prepare-session-manifest.mjs';
import {
  parseClassroomLoadArgs,
  validateClassroomLoadOptions,
} from '../scripts/classroom-load-test.mjs';
import { parseJoinArgs } from '../scripts/join-capacity-worker-logs.mjs';
import { parseStatementMapArgs } from '../scripts/build-capacity-statement-map.mjs';

const CHECKLIST_PATH = 'reports/capacity/configs/p4-60-diagnostic-checklist.md';
const CHECKLIST = readFileSync(CHECKLIST_PATH, 'utf8');
const COMPLETION_REPORT_PATH = 'docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p5-completion-report.md';
const COMPLETION_REPORT = readFileSync(COMPLETION_REPORT_PATH, 'utf8');

function shellBlocks(markdown) {
  return [...markdown.matchAll(/```sh\r?\n([\s\S]*?)```/g)].map((match) => match[1]);
}

function shellWords(command) {
  const words = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (const match of command.matchAll(pattern)) {
    words.push(match[1] ?? match[2] ?? match[3]);
  }
  return words;
}

function normaliseCommand(block) {
  return block
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\\\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function commandsFromChecklist() {
  return shellBlocks(CHECKLIST)
    .map(normaliseCommand)
    .filter(Boolean);
}

function nodeScriptCommands() {
  return commandsFromChecklist()
    .filter((command) => command.startsWith('node scripts/'))
    .map(shellWords);
}

function capacityCommand() {
  return commandsFromChecklist().find((command) => command.startsWith('npm run capacity:classroom'));
}

test('P5 operator checklist references existing script paths', () => {
  for (const argv of nodeScriptCommands()) {
    assert.equal(argv[0], 'node');
    assert.ok(
      existsSync(path.resolve(process.cwd(), argv[1])),
      `${argv[1]} must exist`,
    );
  }
});

test('P5 operator checklist documented script options match parser contracts', () => {
  const validators = {
    'scripts/prepare-session-manifest.mjs': (argv) => {
      const parsed = parseSessionManifestArgs(argv);
      validateSessionManifestOptions(parsed);
      assert.equal(parsed.batchSize, 28);
      assert.equal(parsed.delayMs, 610_000);
    },
    'scripts/join-capacity-worker-logs.mjs': (argv) => {
      const parsed = parseJoinArgs(argv);
      assert.equal(parsed.evidencePath.includes('p5-60-diagnostic'), true);
      assert.equal(parsed.logPaths.length, 1);
      assert.equal(parsed.outputPath.includes('p5-60-tail-correlation'), true);
    },
    'scripts/build-capacity-statement-map.mjs': (argv) => {
      const parsed = parseStatementMapArgs(argv);
      assert.deepEqual(parsed.inputPaths, ['$RAW_LOG']);
      assert.equal(parsed.outputPath.includes('p5-60-statement-map'), true);
    },
  };

  for (const [, scriptPath, ...argv] of nodeScriptCommands()) {
    assert.ok(validators[scriptPath], `missing test validator for ${scriptPath}`);
    validators[scriptPath](argv);
  }
});

test('P5 operator checklist no longer mentions stale P4 command drift', () => {
  assert.doesNotMatch(CHECKLIST, /--bucket-reset-minutes/);
  assert.doesNotMatch(CHECKLIST, /scripts\/correlate-worker-tail\.mjs/);
  assert.doesNotMatch(CHECKLIST, /scripts\/build-statement-map\.mjs/);
  assert.doesNotMatch(CHECKLIST, /\s--tail\b/);
});

test('P5 operator checklist production load command carries required safety flags', () => {
  const command = capacityCommand();
  assert.ok(command, 'capacity:classroom command must be documented');
  const argv = shellWords(command);
  const separator = argv.indexOf('--');
  assert.notEqual(separator, -1);
  const parsed = parseClassroomLoadArgs(argv.slice(separator + 1));
  validateClassroomLoadOptions(parsed);

  assert.equal(parsed.mode, 'production');
  assert.equal(parsed.origin, 'https://ks2.eugnel.uk');
  assert.equal(parsed.sessionManifest, '/tmp/ks2-p5-60-manifest.json');
  assert.equal(parsed.learners, 60);
  assert.equal(parsed.bootstrapBurst, 20);
  assert.equal(parsed.rounds, 1);
  assert.equal(parsed.confirmProductionLoad, true);
  assert.equal(parsed.confirmHighProductionLoad, true);
});

test('P5 operator checklist explicitly forbids committing raw Worker tail JSONL', () => {
  assert.match(CHECKLIST, /Never commit raw `\*\.jsonl` Worker tail captures to git/);
  assert.match(CHECKLIST, /git status` must not show any `\.jsonl` files staged/);
});

test('P5 completion report preserves capacity certification boundaries', () => {
  assert.match(COMPLETION_REPORT, /30-learner-beta-certified/);
  assert.match(COMPLETION_REPORT, /60 learners are not certified/);
  assert.match(COMPLETION_REPORT, /1000 learners remain non-certifying modelling only/);
  assert.match(COMPLETION_REPORT, /60-diagnostic-setup-blocked/);
  assert.match(COMPLETION_REPORT, /1000-route-costs-still-incomplete/);
  assert.doesNotMatch(COMPLETION_REPORT, /\b60 learners are supported\b/i);
  assert.doesNotMatch(COMPLETION_REPORT, /\b1000 learners are supported\b/i);
});

test('P5 completion report records raw-log and Admin evidence guardrails', () => {
  assert.match(COMPLETION_REPORT, /Raw Worker tail JSONL remains local\/private/);
  assert.match(COMPLETION_REPORT, /certifying, diagnostic, preflight, smoke, and modelling-only/);
  assert.match(COMPLETION_REPORT, /No 60-learner or 1000-learner support claim should be published/);
});
