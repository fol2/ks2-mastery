import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUNCTUATION_CURRENT_RELEASE_ID } from '../src/subjects/punctuation/service-contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const REPORT_PATH = resolve(ROOT, 'reports/punctuation/punctuation-qg-p20-expansion-audit.json');

function readJsonReport(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function rebuildP20Evidence() {
  execFileSync(process.execPath, ['scripts/build-punctuation-qg-p20-evidence.mjs'], { cwd: ROOT, stdio: 'inherit' });
  execFileSync(process.execPath, ['scripts/simulate-punctuation-qg-p20-heavy-play.mjs'], { cwd: ROOT, stdio: 'inherit' });
  execFileSync(process.execPath, ['scripts/audit-punctuation-qg-p20-expansion.mjs', '--out', REPORT_PATH], { cwd: ROOT, stdio: 'inherit' });
}

function loadP20Report() {
  let report = readJsonReport(REPORT_PATH);
  if (!report || report.status !== 'PASS' || report.releaseId !== PUNCTUATION_CURRENT_RELEASE_ID) {
    rebuildP20Evidence();
    report = readJsonReport(REPORT_PATH);
  }
  assert.ok(report, 'P20 expansion report could not be parsed after rebuild');
  return report;
}

const report = loadP20Report();
const P20_THRESHOLDS = report.thresholds;

test('P20 release identity and runtime pool scale are certified', () => {
  assert.equal(report.gates.releaseIdentity.ok, true, JSON.stringify(report.gates.releaseIdentity, null, 2));
  assert.equal(report.gates.poolDepth.ok, true, JSON.stringify(report.gates.poolDepth, null, 2));
  assert.ok(report.counts.runtimeItems >= P20_THRESHOLDS.minRuntimeItems, `runtimeItems=${report.counts.runtimeItems}`);
  assert.ok(report.counts.generatedItems >= P20_THRESHOLDS.minGeneratedItems, `generatedItems=${report.counts.generatedItems}`);
});

test('P20 learner-facing surfaces and generated family depth are heavy-play ready', () => {
  assert.equal(report.gates.learnerSurfaceVariety.ok, true, JSON.stringify(report.gates.learnerSurfaceVariety, null, 2));
  assert.equal(report.gates.generatedFamilyDepth.ok, true, JSON.stringify(report.gates.generatedFamilyDepth, null, 2));
  assert.ok(report.counts.uniqueLearnerSurfaces >= P20_THRESHOLDS.minUniqueLearnerSurfaces, `uniqueLearnerSurfaces=${report.counts.uniqueLearnerSurfaces}`);
  assert.ok(report.counts.uniqueVariantSignatures >= P20_THRESHOLDS.minUniqueVariantSignatures, `uniqueVariantSignatures=${report.counts.uniqueVariantSignatures}`);
});

test('P20 per-skill balance gives every published punctuation skill enough depth', () => {
  assert.equal(report.gates.perSkillBalance.ok, true, JSON.stringify(report.gates.perSkillBalance.failingSkills, null, 2));
  assert.equal(report.skillRows.length, 14);
  for (const row of report.skillRows) {
    assert.ok(row.uniqueSurfaces >= P20_THRESHOLDS.minSkillUniqueSurfaces, `${row.skillId} uniqueSurfaces=${row.uniqueSurfaces}`);
    assert.ok(row.openTypedItems >= P20_THRESHOLDS.minSkillOpenTypedItems, `${row.skillId} openTypedItems=${row.openTypedItems}`);
    assert.ok(row.transferOpenProductionItems >= P20_THRESHOLDS.minSkillTransferOpenProductionItems, `${row.skillId} transferOpenProductionItems=${row.transferOpenProductionItems}`);
    assert.ok(row.choiceItems >= P20_THRESHOLDS.minSkillChoiceItems, `${row.skillId} choiceItems=${row.choiceItems}`);
  }
});

test('P20 marking, hyphen quality, review governance, and negative vectors are production-clean', () => {
  assert.equal(report.gates.modelSelfMarking.ok, true, JSON.stringify(report.gates.modelSelfMarking, null, 2));
  assert.equal(report.gates.hyphenCompoundQuality.ok, true, JSON.stringify(report.gates.hyphenCompoundQuality, null, 2));
  assert.equal(report.counts.hyphenAdverbialLyHyphenFindings, 0, JSON.stringify(report.gates.hyphenCompoundQuality, null, 2));
  assert.equal(report.counts.hyphenMalformedCompoundFindings, 0, JSON.stringify(report.gates.hyphenCompoundQuality, null, 2));
  assert.equal(report.counts.hyphenArticleAgreementFindings, 0, JSON.stringify(report.gates.hyphenCompoundQuality, null, 2));
  assert.equal(report.gates.reviewGovernance.ok, true, JSON.stringify(report.gates.reviewGovernance, null, 2));
  assert.equal(report.gates.negativeVectorCoverage.ok, true, JSON.stringify(report.gates.negativeVectorCoverage, null, 2));
});

test('P20 heavy-play scheduler simulation does not make repetition noticeable', () => {
  assert.equal(report.gates.heavyPlayVariety.ok, true, JSON.stringify(report.gates.heavyPlayVariety, null, 2));
  assert.ok(report.gates.heavyPlayVariety.observed.oneLearnerUniqueItems >= P20_THRESHOLDS.minOneLearnerUniqueItems);
  assert.ok(report.gates.heavyPlayVariety.observed.multiLearnerUniqueItems >= P20_THRESHOLDS.minMultiLearnerUniqueItems);
  assert.equal(report.gates.heavyPlayVariety.observed.immediateItemRepeats, 0);
  assert.equal(report.gates.heavyPlayVariety.observed.immediateSignatureRepeats, 0);
});

test('P20 expansion audit is globally PASS', () => {
  assert.equal(report.status, 'PASS', JSON.stringify({ failingGates: report.failingGates, counts: report.counts }, null, 2));
});
