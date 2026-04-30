#!/usr/bin/env node

const major = parseInt(process.versions.node.split('.')[0], 10);
if (major < 22) {
  console.error(`\n  ✗ Node ${process.versions.node} detected — requires Node ≥ 22\n    .nvmrc specifies 22. Please switch: nvm use 22\n`);
  process.exit(1);
}

// P10 verification entry point — bounded production-certification gate.
//
// Composes ALL P9 gates (47 logical) plus 9 P10-specific gates for a total of
// 56 logical gates. Machine-verifiable gates may pass while certification stays
// blocked if a human acceptance or post-deploy evidence gate is honestly absent.

import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { PUNCTUATION_CONTENT_MANIFEST, PUNCTUATION_ITEMS } from '../shared/punctuation/content.js';
import { PRODUCTION_DEPTH, createPunctuationGeneratedItems } from '../shared/punctuation/generators.js';
import { markPunctuationAnswer } from '../shared/punctuation/marking.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const MANIFEST_PATH = resolve(ROOT, 'reports/punctuation/punctuation-qg-p10-certification-manifest.json');
const REVIEWER_FIXTURE_PATH = resolve(ROOT, 'tests/fixtures/punctuation-reviewer-decisions.json');
const GATE_TIMEOUT = 120_000;

function runCommand(command) {
  execSync(command, { stdio: 'pipe', encoding: 'utf8', timeout: GATE_TIMEOUT, cwd: ROOT });
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function productionPool() {
  const generated = createPunctuationGeneratedItems({
    manifest: PUNCTUATION_CONTENT_MANIFEST,
    seed: PUNCTUATION_CONTENT_MANIFEST.releaseId || 'punctuation',
    perFamily: PRODUCTION_DEPTH,
  });
  return [
    ...PUNCTUATION_ITEMS.map((item) => ({ ...item, _source: 'fixed' })),
    ...generated.map((item) => ({ ...item, _source: 'generated' })),
  ];
}

function answersFor(item) {
  return [...new Set([
    item.model,
    ...(Array.isArray(item.accepted) ? item.accepted : []),
  ].filter((answer) => typeof answer === 'string' && answer.trim()))];
}

function checkModelAnswers() {
  const pool = productionPool();
  const items = pool.filter((item) =>
    ['insert', 'fix', 'combine', 'paragraph'].includes(item.mode)
    && typeof item.model === 'string'
    && item.model.trim()
  );
  let answersChecked = 0;
  for (const item of items) {
    for (const answer of answersFor(item)) {
      answersChecked += 1;
      const result = markPunctuationAnswer({ item, answer: { typed: answer } });
      if (!result.correct) {
        throw new Error(`Accepted answer failed for ${item.id}: ${answer}`);
      }
    }
  }
  if (answersChecked === 0) {
    throw new Error('No model/accepted answers were checked');
  }
  return { detail: `items=${items.length}, answers=${answersChecked}` };
}

function checkReviewerDecisionIntegrity() {
  const fixture = loadJson(REVIEWER_FIXTURE_PATH);
  const summary = JSON.parse(execSync('node scripts/review-punctuation-questions.mjs --summary --json', {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: GATE_TIMEOUT,
  }));
  const meta = fixture._meta || {};
  if (meta.schema_version !== 3) {
    throw new Error(`reviewer schema version ${meta.schema_version}, expected 3`);
  }
  if (meta.ai_pre_review?.status !== 'complete') {
    throw new Error('ai_pre_review.status must be complete');
  }
  if (summary.totalItems !== 192 || summary.productionCount !== 192) {
    throw new Error(`reviewer summary count mismatch: total=${summary.totalItems}, production=${summary.productionCount}`);
  }
  if (summary.itemStates.approved !== 192 || summary.productionStates.approved !== 192) {
    throw new Error(`reviewer item approvals mismatch: item=${summary.itemStates.approved}, production=${summary.productionStates.approved}`);
  }
  if (summary.clusterStates.approved !== 47) {
    throw new Error(`review-required cluster approvals ${summary.clusterStates.approved}, expected 47`);
  }
  return { detail: 'schema=3, ai_pre_review=complete, items=192, review_required_clusters=47' };
}

function checkHumanAcceptance() {
  const fixture = loadJson(REVIEWER_FIXTURE_PATH);
  const human = fixture._meta?.human_acceptance || {};
  if (human.status === 'complete') {
    for (const field of ['reviewer', 'role', 'reviewedAt']) {
      if (typeof human[field] !== 'string' || !human[field]) {
        throw new Error(`human_acceptance.${field} is required when complete`);
      }
    }
    if (human.acceptedItems !== 192) {
      throw new Error(`human_acceptance.acceptedItems=${human.acceptedItems}, expected 192`);
    }
    if (human.acceptedReviewRequiredClusters !== 47) {
      throw new Error(`human_acceptance.acceptedReviewRequiredClusters=${human.acceptedReviewRequiredClusters}, expected 47`);
    }
    if (!Array.isArray(human.blockers) || human.blockers.length > 0) {
      throw new Error('human_acceptance.blockers must be an empty array when complete');
    }
    return { detail: `human_acceptance=complete reviewer=${human.reviewer}, items=192, review_required_clusters=47` };
  }
  return {
    detail: `human_acceptance=${human.status || 'missing'}`,
    certificationBlocker: 'Human acceptance is not complete, so public production certification remains blocked.',
  };
}

function checkDepth4Lock() {
  const pool = productionPool();
  const fixed = pool.filter((item) => item._source === 'fixed').length;
  const generated = pool.filter((item) => item._source === 'generated').length;
  if (PRODUCTION_DEPTH !== 4) {
    throw new Error(`PRODUCTION_DEPTH is ${PRODUCTION_DEPTH}, expected 4`);
  }
  if (fixed !== 92 || generated !== 100 || pool.length !== 192) {
    throw new Error(`pool shape mismatch: fixed=${fixed}, generated=${generated}, total=${pool.length}`);
  }
  return { detail: `PRODUCTION_DEPTH=4, fixed=${fixed}, generated=${generated}, total=${pool.length}` };
}

function checkDepth6Blocked() {
  const seed = PUNCTUATION_CONTENT_MANIFEST.releaseId || 'punctuation';
  const depth4 = createPunctuationGeneratedItems({
    manifest: PUNCTUATION_CONTENT_MANIFEST,
    seed,
    perFamily: PRODUCTION_DEPTH,
  });
  const depth6 = createPunctuationGeneratedItems({
    manifest: PUNCTUATION_CONTENT_MANIFEST,
    seed,
    perFamily: 6,
  });
  const productionIds = new Set(depth4.map((item) => item.id));
  const candidateOnly = depth6.filter((item) => !productionIds.has(item.id));
  if (candidateOnly.length === 0) {
    throw new Error('Depth-6 candidate delta is empty; depth-6 blocking gate is not meaningful');
  }
  return { detail: `depth6_candidate_delta=${candidateOnly.length}, status=blocked` };
}

function checkLiveSmokeTruth() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`P10 certification manifest not found: ${MANIFEST_PATH}`);
  }
  const manifest = loadJson(MANIFEST_PATH);
  const smoke = manifest.liveProductionSmoke || {};
  if (manifest.certificationStatus === 'CERTIFIED_POST_DEPLOY' && smoke.status !== 'pass') {
    throw new Error('CERTIFIED_POST_DEPLOY requires liveProductionSmoke.status=pass');
  }
  if (smoke.status === 'not_run') {
    return {
      detail: 'liveProductionSmoke=not_run',
      postDeployBlocker: 'Live production smoke has not run, so post-deploy certification is unavailable.',
    };
  }
  return { detail: `liveProductionSmoke=${smoke.status}` };
}

const gates = [
  {
    name: 'P9 composed gates',
    command: 'node scripts/verify-punctuation-qg-p9.mjs',
    logicalGates: 47,
  },
  {
    name: 'P10 lexical-replacement oracle',
    command: 'node --test tests/punctuation-closed-lexical-preservation-p10.test.js',
    logicalGates: 1,
  },
  {
    name: 'Model-answer preservation after P10 patch',
    check: checkModelAnswers,
    logicalGates: 1,
  },
  {
    name: 'Reviewer decision integrity',
    check: checkReviewerDecisionIntegrity,
    logicalGates: 1,
  },
  {
    name: 'Reviewer cluster alignment',
    command: 'node --test tests/punctuation-reviewer-cluster-alignment.test.js',
    logicalGates: 1,
  },
  {
    name: 'Human acceptance truth gate',
    check: checkHumanAcceptance,
    logicalGates: 1,
  },
  {
    name: 'Certification manifest validation',
    command: 'node scripts/validate-punctuation-qg-certification-evidence.mjs reports/punctuation/punctuation-qg-p10-certification-manifest.json --root .',
    logicalGates: 1,
  },
  {
    name: 'Depth-4 production-depth lock',
    check: checkDepth4Lock,
    logicalGates: 1,
  },
  {
    name: 'Depth-6 remains blocked',
    check: checkDepth6Blocked,
    logicalGates: 1,
  },
  {
    name: 'Live production smoke truth gate',
    check: checkLiveSmokeTruth,
    logicalGates: 1,
  },
];

let passed = 0;
let failed = 0;
const failedNames = [];
const certificationBlockers = [];
const postDeployBlockers = [];
const results = [];
const startTime = Date.now();

console.log('\n══════════════════════════════════════════════════════════════');
console.log('PUNCTUATION QG P10 VERIFICATION');
console.log('══════════════════════════════════════════════════════════════\n');

for (const gate of gates) {
  process.stdout.write(`  ▶ ${gate.name} ...`);
  const gateStart = Date.now();
  try {
    let gateResult = {};
    if (gate.command) {
      runCommand(gate.command);
    } else {
      gateResult = gate.check();
    }
    if (gateResult.certificationBlocker) certificationBlockers.push(gateResult.certificationBlocker);
    if (gateResult.postDeployBlocker) postDeployBlockers.push(gateResult.postDeployBlocker);
    const elapsed = ((Date.now() - gateStart) / 1000).toFixed(1);
    process.stdout.write(`\r  ✓ ${gate.name} (${elapsed}s)${gateResult.detail ? ' — ' + gateResult.detail : ''}\n`);
    results.push({ name: gate.name, status: 'PASS', elapsed, detail: gateResult.detail || '' });
    passed += 1;
  } catch (error) {
    const elapsed = ((Date.now() - gateStart) / 1000).toFixed(1);
    const isTimeout = error.killed || error.signal === 'SIGTERM';
    const snippet = isTimeout
      ? `TIMEOUT after ${GATE_TIMEOUT / 1000}s`
      : (error.message || error.stderr || error.stdout || '').split('\n')[0].slice(0, 220);
    process.stdout.write(`\r  ✗ ${gate.name} (${elapsed}s)\n`);
    if (snippet) console.log(`    ${snippet}`);
    results.push({ name: gate.name, status: 'FAIL', elapsed, error: snippet });
    failedNames.push(gate.name);
    failed += 1;
  }
}

const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
const totalLogicalGates = gates.reduce((sum, gate) => sum + gate.logicalGates, 0);
const certificationStatus = failed > 0
  ? 'BLOCKED'
  : certificationBlockers.length > 0
    ? 'BLOCKED_PENDING_HUMAN_ACCEPTANCE'
    : postDeployBlockers.length > 0
      ? 'CERTIFIED_PRE_DEPLOY'
      : 'CERTIFIED_POST_DEPLOY';

console.log('\n──────────────────────────────────────────────────────────────');
console.log('  Summary:');
console.log(`    Top-level gates:    ${gates.length}`);
console.log(`    Logical gates:      ${totalLogicalGates}`);
console.log(`    Passed:             ${passed}/${gates.length}`);
console.log(`    Failed:             ${failed}`);
if (failedNames.length > 0) {
  console.log(`    Failed gates:       ${failedNames.join(', ')}`);
}
console.log(`    Production depth:   ${PRODUCTION_DEPTH}`);
console.log(`    Certification:      ${certificationStatus}`);
console.log(`    Elapsed:            ${totalElapsed}s`);
console.log('──────────────────────────────────────────────────────────────');

if (certificationBlockers.length > 0) {
  console.log('\n  Certification blockers:');
  for (const blocker of certificationBlockers) {
    console.log(`    - ${blocker}`);
  }
}
if (postDeployBlockers.length > 0) {
  console.log('\n  Post-deploy blockers:');
  for (const blocker of postDeployBlockers) {
    console.log(`    - ${blocker}`);
  }
}

if (failed > 0) {
  console.log(`\n  RESULT: FAIL (${failed} gate${failed > 1 ? 's' : ''} failed)\n`);
  process.exitCode = 1;
} else {
  console.log(`\n  RESULT: ${certificationStatus}\n`);
}
