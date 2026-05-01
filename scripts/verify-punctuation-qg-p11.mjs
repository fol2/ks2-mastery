#!/usr/bin/env node

const major = parseInt(process.versions.node.split('.')[0], 10);
if (major < 22) {
  console.error(`\n  ✗ Node ${process.versions.node} detected — requires Node ≥ 22\n    .nvmrc specifies 22. Please switch: nvm use 22\n`);
  process.exit(1);
}

import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PUNCTUATION_CONTENT_MANIFEST,
  PUNCTUATION_RELEASE_ID,
} from '../shared/punctuation/content.js';
import {
  createPunctuationRuntimeManifest,
  PRODUCTION_DEPTH,
  CAPACITY_DEPTH,
} from '../shared/punctuation/generators.js';
import {
  DEFAULT_PUNCTUATION_PREFS,
  PUNCTUATION_GENERATED_ITEM_SEED,
} from '../src/subjects/punctuation/service-contract.js';
import { PUNCTUATION_SETUP_ROUND_LENGTH_OPTIONS } from '../src/subjects/punctuation/components/punctuation-view-model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const GATE_TIMEOUT = 180_000;
const ACCEPTANCE_PATH = resolve(ROOT, 'reports/punctuation/punctuation-qg-p11-product-acceptance.json');
const SURFACE_PACK_PATH = resolve(ROOT, 'reports/punctuation/punctuation-qg-p11-surface-pack.json');

function runCommand(command) {
  return execSync(command, {
    cwd: ROOT,
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: GATE_TIMEOUT,
  });
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function runtimeSummary() {
  const manifest = createPunctuationRuntimeManifest({
    generatedPerFamily: PRODUCTION_DEPTH,
  });
  const fixedItems = manifest.items.filter((item) => item.source !== 'generated');
  const generatedItems = manifest.items.filter((item) => item.source === 'generated');
  const chooseItems = manifest.items.filter((item) => item.mode === 'choose');
  const bySkill = new Map();
  for (const item of manifest.items) {
    const skillKey = (item.skillIds || []).join('+') || 'none';
    bySkill.set(skillKey, (bySkill.get(skillKey) || 0) + 1);
  }
  const singleSkillCounts = [...bySkill.entries()]
    .filter(([skill]) => skill !== 'none' && !skill.includes('+'))
    .map(([, count]) => count);
  const generatedChooseFamilies = new Set(
    generatedItems
      .filter((item) => item.mode === 'choose')
      .map((item) => item.generatorFamilyId)
      .filter(Boolean),
  );

  return {
    productionDepth: PRODUCTION_DEPTH,
    capacityDepth: CAPACITY_DEPTH,
    releaseId: PUNCTUATION_RELEASE_ID,
    generatedSeed: PUNCTUATION_GENERATED_ITEM_SEED,
    fixedCount: fixedItems.length,
    generatedCount: generatedItems.length,
    totalProductionItems: manifest.items.length,
    chooseCount: chooseItems.length,
    minSingleSkillCount: singleSkillCounts.length ? Math.min(...singleSkillCounts) : 0,
    standardSmartRoundLength: DEFAULT_PUNCTUATION_PREFS.roundLength,
    generatedChooseFamilyCount: generatedChooseFamilies.size,
  };
}

function checkProductionDepthAndRelease() {
  const summary = runtimeSummary();
  const errors = [];
  if (summary.releaseId !== 'punctuation-qg-p11-2026-05-01') {
    errors.push(`releaseId=${summary.releaseId}`);
  }
  if (summary.generatedSeed !== 'punctuation-r4-full-14-skill-structure') {
    errors.push(`generatedSeed=${summary.generatedSeed}`);
  }
  if (summary.productionDepth < 8) errors.push(`productionDepth=${summary.productionDepth} < 8`);
  if (summary.totalProductionItems < 292) errors.push(`totalProductionItems=${summary.totalProductionItems} < 292`);
  if (summary.fixedCount !== 148) errors.push(`fixedCount=${summary.fixedCount}, expected 148`);
  if (summary.generatedCount !== 1120) errors.push(`generatedCount=${summary.generatedCount}, expected 1120`);
  if (summary.totalProductionItems !== 1268) errors.push(`totalProductionItems=${summary.totalProductionItems}, expected 1268`);
  if (errors.length) throw new Error(errors.join('; '));
  return { detail: `release=${summary.releaseId}, seed=${summary.generatedSeed}, depth=${summary.productionDepth}, runtime=${summary.totalProductionItems}` };
}

function checkGeneratedChooseCoverage() {
  const summary = runtimeSummary();
  const errors = [];
  if (summary.generatedChooseFamilyCount < 3) errors.push(`generatedChooseFamilyCount=${summary.generatedChooseFamilyCount} < 3`);
  if (summary.chooseCount < 40) errors.push(`chooseCount=${summary.chooseCount} < 40`);
  if (summary.minSingleSkillCount < 12) errors.push(`minSingleSkillCount=${summary.minSingleSkillCount} < 12`);
  if (errors.length) throw new Error(errors.join('; '));
  return { detail: `choose=${summary.chooseCount}, generatedChooseFamilies=${summary.generatedChooseFamilyCount}, minSingleSkill=${summary.minSingleSkillCount}` };
}

function checkProductAudit() {
  const output = runCommand('node scripts/audit-punctuation-qg-p11-product.mjs');
  const audit = JSON.parse(output);
  if (audit.status !== 'PASS') {
    throw new Error(`product audit failed: ${(audit.failures || []).join('; ')}`);
  }
  const freshLen6 = audit.findings?.freshLen6 || {};
  const sameDay = audit.findings?.sameDayGrinding || {};
  return {
    detail: `firstClick=${JSON.stringify(freshLen6.firstClickModes || {})}, maxRepeat20=${sameDay.slidingWindow20MaxRepeat}`,
    audit,
  };
}

function checkDefaultSmartLength() {
  if (DEFAULT_PUNCTUATION_PREFS.roundLength !== '6') {
    throw new Error(`DEFAULT_PUNCTUATION_PREFS.roundLength=${DEFAULT_PUNCTUATION_PREFS.roundLength}, expected 6`);
  }
  if (!PUNCTUATION_SETUP_ROUND_LENGTH_OPTIONS.includes(DEFAULT_PUNCTUATION_PREFS.roundLength)) {
    throw new Error(`Setup round-length options do not include default ${DEFAULT_PUNCTUATION_PREFS.roundLength}`);
  }
  return { detail: `Smart Practice default roundLength=6, setupOptions=${PUNCTUATION_SETUP_ROUND_LENGTH_OPTIONS.join('/')}` };
}

function checkSurfacePack() {
  runCommand('node scripts/build-punctuation-qg-p11-surface-pack.mjs --check');
  const pack = loadJson(SURFACE_PACK_PATH);
  const summary = pack.summary || {};
  const errors = [];
  if (pack.releaseId !== PUNCTUATION_RELEASE_ID) errors.push(`surfacePack.releaseId=${pack.releaseId}`);
  if (summary.totalItems !== 1268) errors.push(`surfacePack.totalItems=${summary.totalItems}, expected 1268`);
  if (summary.historicalP10Depth4ItemCount !== 192) errors.push(`historicalP10Depth4ItemCount=${summary.historicalP10Depth4ItemCount}, expected 192`);
  if ((summary.missingHistoricalP10Depth4ItemIds || []).length !== 0) errors.push('surface pack does not cover every historical P10 depth-4 item');
  if (summary.journeyCount < 24) errors.push(`journeyCount=${summary.journeyCount} < 24`);
  for (const type of ['fresh', 'one-wrong-then-correct', 'repeated-wrong', 'guided', 'weak', 'gps', 'post-secure']) {
    if (!summary.journeyTypes?.[type]) errors.push(`missing journey type ${type}`);
  }
  for (const kind of ['first-click', 'retry', 'mixed-review', 'due-review', 'spaced-return']) {
    if (!summary.surfaceKinds?.[kind]) errors.push(`missing surface kind ${kind}`);
  }
  if (summary.productAuditStatus !== 'PASS') errors.push(`productAuditStatus=${summary.productAuditStatus}`);
  if (errors.length) throw new Error(errors.join('; '));
  return { detail: `items=${summary.totalItems}, journeys=${summary.journeyCount}, surfaced=${summary.productServiceSurfacedItemCount}` };
}

function checkProductAcceptanceManifest() {
  if (!existsSync(ACCEPTANCE_PATH)) {
    throw new Error(`missing product acceptance manifest: ${ACCEPTANCE_PATH}`);
  }
  const manifest = loadJson(ACCEPTANCE_PATH);
  const required = [
    'questionCount',
    'clickJourney',
    'defaultSessionLength',
    'starPacing',
    'questionSurfaceReview',
    'liveJourneySmoke',
  ];
  const acceptance = manifest.acceptance || {};
  const blockers = [];
  for (const key of required) {
    if (!acceptance[key] || typeof acceptance[key].accepted !== 'boolean') {
      throw new Error(`acceptance.${key}.accepted must be boolean`);
    }
    if (acceptance[key].accepted !== true) {
      blockers.push(`${key}=${acceptance[key].status || 'not_accepted'}`);
    }
  }
  if (manifest.releaseId !== PUNCTUATION_RELEASE_ID) {
    throw new Error(`acceptance releaseId=${manifest.releaseId}, expected ${PUNCTUATION_RELEASE_ID}`);
  }
  return {
    detail: blockers.length ? `pending=${blockers.join(', ')}` : 'all product acceptance fields accepted',
    certificationBlockers: blockers,
  };
}

function checkLiveSmokeTruth() {
  if (!existsSync(ACCEPTANCE_PATH)) {
    throw new Error(`missing product acceptance manifest: ${ACCEPTANCE_PATH}`);
  }
  const manifest = loadJson(ACCEPTANCE_PATH);
  const live = manifest.acceptance?.liveJourneySmoke || {};
  if (live.accepted === true) {
    for (const field of ['origin', 'releaseId', 'timestamp', 'artefactPath']) {
      if (typeof live[field] !== 'string' || !live[field]) {
        throw new Error(`liveJourneySmoke.${field} is required when accepted`);
      }
    }
    if (live.releaseId !== PUNCTUATION_RELEASE_ID) {
      throw new Error(`liveJourneySmoke.releaseId=${live.releaseId}, expected ${PUNCTUATION_RELEASE_ID}`);
    }
    return { detail: `liveJourneySmoke=pass ${live.origin}` };
  }
  return {
    detail: `liveJourneySmoke=${live.status || 'not_run'}`,
    postDeployBlockers: [`liveJourneySmoke=${live.status || 'not_run'}`],
  };
}

const gates = [
  {
    name: 'P10 composed historical gates',
    command: 'node scripts/verify-punctuation-qg-p10.mjs',
    logicalGates: 56,
  },
  {
    name: 'Production depth, runtime count, and release-id gate',
    check: checkProductionDepthAndRelease,
    logicalGates: 1,
  },
  {
    name: 'Generated choose-family coverage gate',
    check: checkGeneratedChooseCoverage,
    logicalGates: 1,
  },
  {
    name: 'Reviewer content pack gate',
    command: 'node --test tests/punctuation-reviewer-pack-cli.test.js tests/punctuation-reviewer-pack-v3.test.js',
    logicalGates: 1,
  },
  {
    name: 'P11 learner-surface pack contract gate',
    check: checkSurfacePack,
    logicalGates: 1,
  },
  {
    name: 'P11 manual expansion gate',
    command: 'npm run verify:punctuation-qg:p11-expansion',
    logicalGates: 1,
  },
  {
    name: 'Misconception retry and anti-repetition journey simulator gate',
    check: checkProductAudit,
    logicalGates: 2,
  },
  {
    name: 'Default Smart Practice length gate',
    check: checkDefaultSmartLength,
    logicalGates: 1,
  },
  {
    name: 'Setup UI default six-question payload gate',
    command: 'node --test --test-name-pattern "P11 default Smart Practice uses six-question setup payloads" tests/react-punctuation-scene.test.js',
    logicalGates: 1,
  },
  {
    name: 'Star pacing and completion-copy gate',
    command: 'node --test tests/punctuation-star-projection.test.js tests/punctuation-view-model.test.js tests/punctuation-feedback-trust.test.js',
    logicalGates: 1,
  },
  {
    name: 'Product acceptance manifest truth gate',
    check: checkProductAcceptanceManifest,
    logicalGates: 1,
  },
  {
    name: 'Live journey smoke evidence truth gate',
    check: checkLiveSmokeTruth,
    logicalGates: 1,
  },
];

let passed = 0;
let failed = 0;
const failedNames = [];
const certificationBlockers = [];
const postDeployBlockers = [];
let productAudit = null;
const startTime = Date.now();

console.log('\n══════════════════════════════════════════════════════════════');
console.log('PUNCTUATION QG P11 VERIFICATION');
console.log('══════════════════════════════════════════════════════════════\n');

for (const gate of gates) {
  process.stdout.write(`  ▶ ${gate.name} ...`);
  const gateStart = Date.now();
  try {
    let result = {};
    if (gate.command) {
      runCommand(gate.command);
    } else {
      result = gate.check();
    }
    if (result.audit) productAudit = result.audit;
    if (Array.isArray(result.certificationBlockers)) certificationBlockers.push(...result.certificationBlockers);
    if (Array.isArray(result.postDeployBlockers)) postDeployBlockers.push(...result.postDeployBlockers);
    const elapsed = ((Date.now() - gateStart) / 1000).toFixed(1);
    process.stdout.write(`\r  ✓ ${gate.name} (${elapsed}s)${result.detail ? ' — ' + result.detail : ''}\n`);
    passed += 1;
  } catch (error) {
    const elapsed = ((Date.now() - gateStart) / 1000).toFixed(1);
    const snippet = (error.message || error.stderr || error.stdout || '').split('\n')[0].slice(0, 220);
    process.stdout.write(`\r  ✗ ${gate.name} (${elapsed}s)\n`);
    if (snippet) console.log(`    ${snippet}`);
    failed += 1;
    failedNames.push(gate.name);
  }
}

const summary = runtimeSummary();
const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
const totalLogicalGates = gates.reduce((sum, gate) => sum + gate.logicalGates, 0);
const status = failed > 0
  ? 'BLOCKED'
  : certificationBlockers.length > 0
    ? 'SOURCE_VERIFIED_PENDING_PRODUCT_ACCEPTANCE'
    : postDeployBlockers.length > 0
      ? 'SOURCE_VERIFIED_PENDING_LIVE_SMOKE'
      : 'CERTIFIED_READY_FOR_RELEASE';

console.log('\n──────────────────────────────────────────────────────────────');
console.log('  Key counts:');
console.log(`    productionDepth:             ${summary.productionDepth}`);
console.log(`    capacityDepth:               ${summary.capacityDepth}`);
console.log(`    releaseId:                   ${summary.releaseId}`);
console.log(`    generatedSeed:               ${summary.generatedSeed}`);
console.log(`    fixedCount:                  ${summary.fixedCount}`);
console.log(`    generatedCount:              ${summary.generatedCount}`);
console.log(`    totalProductionItems:        ${summary.totalProductionItems}`);
console.log(`    chooseCount:                 ${summary.chooseCount}`);
console.log(`    minSingleSkillCount:         ${summary.minSingleSkillCount}`);
console.log(`    standardSmartRoundLength:    ${summary.standardSmartRoundLength}`);
if (productAudit) {
  console.log(`    first-click mode distribution:${JSON.stringify(productAudit.findings?.freshLen6?.firstClickModes || {})}`);
  console.log(`    max item repeat in journeys: ${productAudit.findings?.sameDayGrinding?.slidingWindow20MaxRepeat ?? 'n/a'}`);
}
console.log(`    star pacing status:          ${failedNames.includes('Star pacing and completion-copy gate') ? 'fail' : 'pass'}`);
console.log(`    live smoke status:           ${postDeployBlockers.length ? postDeployBlockers.join(', ') : 'pass'}`);
console.log('──────────────────────────────────────────────────────────────');
console.log(`  Gates: ${passed} passed, ${failed} failed (${totalLogicalGates} logical gates, ${totalElapsed}s)`);
console.log(`  Status: ${status}`);
if (failedNames.length) console.log(`  Failed gates: ${failedNames.join(', ')}`);
if (certificationBlockers.length) console.log(`  Certification blockers: ${certificationBlockers.join(', ')}`);
if (postDeployBlockers.length) console.log(`  Post-deploy blockers: ${postDeployBlockers.join(', ')}`);
console.log('');

if (failed > 0) {
  process.exitCode = 1;
}
