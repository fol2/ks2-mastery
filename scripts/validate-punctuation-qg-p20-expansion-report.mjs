#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const reportPath = resolve(process.argv[2] || 'reports/punctuation/punctuation-qg-p20-expansion-audit.json');

function fail(message, details = null) {
  console.error(`P20 expansion report validation failed: ${message}`);
  if (details) console.error(JSON.stringify(details, null, 2));
  process.exit(1);
}

if (!existsSync(reportPath)) fail(`missing report at ${reportPath}`);

let report;
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8'));
} catch (error) {
  fail(`cannot parse report JSON: ${error.message}`);
}

const thresholds = report.thresholds || {};
const counts = report.counts || {};
const gates = report.gates || {};

if (report.status !== 'PASS') fail('global status is not PASS', { status: report.status, failingGates: report.failingGates });
if (gates.releaseIdentity?.ok !== true) fail('release identity gate failed', gates.releaseIdentity);
if (gates.poolDepth?.ok !== true) fail('pool depth gate failed', gates.poolDepth);
if (gates.learnerSurfaceVariety?.ok !== true) fail('learner surface variety gate failed', gates.learnerSurfaceVariety);
if (gates.generatedFamilyDepth?.ok !== true) fail('generated family depth gate failed', gates.generatedFamilyDepth);
if (gates.perSkillBalance?.ok !== true) fail('per-skill balance gate failed', gates.perSkillBalance?.failingSkills || gates.perSkillBalance);
if (gates.modelSelfMarking?.ok !== true) fail('model self-marking gate failed', gates.modelSelfMarking);
if (gates.hyphenCompoundQuality?.ok !== true) fail('hyphen compound quality gate failed', gates.hyphenCompoundQuality);
if (gates.apostropheContractionGrammarQuality?.ok !== true) fail('apostrophe contraction grammar quality gate failed', gates.apostropheContractionGrammarQuality);
if (gates.reviewGovernance?.ok !== true) fail('review governance gate failed', gates.reviewGovernance);
if (gates.negativeVectorCoverage?.ok !== true) fail('negative-vector coverage gate failed', gates.negativeVectorCoverage);
if (gates.heavyPlayVariety?.ok !== true) fail('heavy-play variety gate failed', gates.heavyPlayVariety);

if (counts.runtimeItems < thresholds.minRuntimeItems) fail('runtime item floor not met', counts);
if (counts.generatedItems < thresholds.minGeneratedItems) fail('generated item floor not met', counts);
if (counts.fixedItems < thresholds.minFixedItems) fail('fixed item floor not met', counts);
if (counts.uniqueLearnerSurfaces < thresholds.minUniqueLearnerSurfaces) fail('unique learner-facing surface floor not met', counts);
if (counts.uniqueVariantSignatures < thresholds.minUniqueVariantSignatures) fail('unique variant signature floor not met', counts);
if (counts.duplicateSurfaceGroups !== 0) fail('runtime duplicate surface groups must be zero', counts);
if (counts.generatedDuplicateSurfaceGroups !== undefined && counts.generatedDuplicateSurfaceGroups !== 0) fail('generated duplicate surface groups must be zero', counts);
if (counts.fixedDuplicateSurfaceGroups !== undefined && counts.fixedDuplicateSurfaceGroups !== 0) fail('fixed-bank duplicate surface groups must be zero', counts);
if (counts.legacyFixedDuplicateSurfaceGroups !== undefined && counts.legacyFixedDuplicateSurfaceGroups !== 0) fail('legacy fixed-bank duplicate surface groups must be zero', counts);
if (counts.hyphenAdverbialLyHyphenFindings !== 0) fail('adverbial -ly hyphen findings must be zero', counts);
if (counts.hyphenMalformedCompoundFindings !== 0) fail('malformed hyphen compound findings must be zero', counts);
if (counts.hyphenArticleAgreementFindings !== 0) fail('hyphen article agreement findings must be zero', counts);
if (counts.apostropheContractionGrammarFindings !== 0) fail('apostrophe contraction grammar findings must be zero', counts);
if (counts.modelSelfMarkingFailures !== 0) fail('model self-marking failures must be zero', counts);

const skillRows = Array.isArray(report.skillRows) ? report.skillRows : [];
if (skillRows.length !== 14) fail('expected all 14 published punctuation skills in skillRows', { skillRows: skillRows.length });
for (const row of skillRows) {
  if (row.uniqueSurfaces < thresholds.minSkillUniqueSurfaces) fail(`${row.skillId} unique surface floor not met`, row);
  if (row.openTypedItems < thresholds.minSkillOpenTypedItems) fail(`${row.skillId} open typed item floor not met`, row);
  if (row.transferOpenProductionItems < thresholds.minSkillTransferOpenProductionItems) fail(`${row.skillId} transfer/open-production floor not met`, row);
  if (row.choiceItems < thresholds.minSkillChoiceItems) fail(`${row.skillId} choice item floor not met`, row);
}

console.log('P20 expansion report validation: PASS');
console.log(`  release: ${report.releaseId}`);
console.log(`  runtime/generated/fixed: ${counts.runtimeItems}/${counts.generatedItems}/${counts.fixedItems}`);
console.log(`  unique surfaces/signatures: ${counts.uniqueLearnerSurfaces}/${counts.uniqueVariantSignatures}`);
