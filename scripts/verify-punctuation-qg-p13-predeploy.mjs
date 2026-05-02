#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  expectedPunctuationQGP13LiveManifest,
  PUNCTUATION_QG_P13_LIVE_PHASE,
} from './validate-punctuation-qg-p13-live-evidence.mjs';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const DEFAULT_OUT = resolve(ROOT, 'reports/punctuation/punctuation-qg-p13-predeploy-evidence.json');

function argValue(argv, ...names) {
  for (const name of names) {
    const index = argv.indexOf(name);
    if (index !== -1 && index + 1 < argv.length) return argv[index + 1];
  }
  return '';
}

export function resolvePredeployEvidenceOut(argv = process.argv) {
  const out = argValue(argv, '--out');
  return out ? resolve(ROOT, out) : DEFAULT_OUT;
}

function run(command) {
  const started = Date.now();
  execSync(command, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', timeout: 180_000 });
  return { command, elapsedMs: Date.now() - started };
}

function assertRuntimeContract(expected) {
  assert.equal(expected.phase, PUNCTUATION_QG_P13_LIVE_PHASE);
  assert.equal(expected.contentReleaseId, 'punctuation-qg-p12-3000-2026-05-02');
  assert.equal(expected.productionDepth, 100);
  assert.equal(expected.fixedItems, 512);
  assert.equal(expected.generatedItems, 2800);
  assert.equal(expected.runtimeItems, 3312);
  assert.equal(expected.generatedFamilies, 28);
  assert.equal(expected.templatesPerFamilyMin, 100);
  assert.equal(expected.templatesPerFamilyMax, 100);
  assert.equal(expected.publishedRewardUnits, 14);
}

export function buildPunctuationQGP13PredeployEvidence({ runCommands = true } = {}) {
  const major = parseInt(process.versions.node.split('.')[0], 10);
  if (major < 22) throw new Error(`Node ${process.versions.node} detected — P13 predeploy requires Node >= 22.`);
  const expected = expectedPunctuationQGP13LiveManifest();
  assertRuntimeContract(expected);
  const commands = [];
  if (runCommands) {
    commands.push(run('npm run verify:punctuation-qg:p12'));
    commands.push(run('node --test tests/punctuation-release-smoke.test.js tests/punctuation-service.test.js tests/worker-punctuation-runtime.test.js tests/punctuation-qg-p12-surface-pack.test.js tests/punctuation-qg-p13-live-release.test.js'));
  }
  return {
    ok: true,
    phase: 'predeploy',
    liveServingPhase: PUNCTUATION_QG_P13_LIVE_PHASE,
    generatedAt: new Date().toISOString(),
    node: process.version,
    expected,
    commands,
    deploymentRequired: {
      required: true,
      reason: 'This predeploy verifier proves source/runtime readiness only. P13 live-serving certification requires production smoke evidence after deployment.',
      requiredLiveArtefact: 'reports/punctuation/punctuation-qg-p13-production-smoke.json',
    },
  };
}

function main() {
  const out = resolvePredeployEvidenceOut();
  const evidence = buildPunctuationQGP13PredeployEvidence({ runCommands: !process.argv.includes('--no-run') });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
