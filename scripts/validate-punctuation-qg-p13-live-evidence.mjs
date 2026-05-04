#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  createPunctuationContentIndexes,
  PUNCTUATION_RELEASE_ID,
} from '../shared/punctuation/content.js';
import {
  createPunctuationRuntimeManifest,
  GENERATED_TEMPLATE_BANK,
  PRODUCTION_DEPTH,
} from '../shared/punctuation/generators.js';

export const PUNCTUATION_QG_P13_LIVE_PHASE = 'punctuation-qg-p13-live-serving';
export const PUNCTUATION_QG_P13_DEFAULT_ORIGIN = 'https://ks2.eugnel.uk';

function countBy(items, keyFor) {
  const counts = {};
  for (const item of items) {
    const key = keyFor(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

// P14 update: this validator describes the FROZEN P13 live release, not the
// current source tree. P13 served the P12 3,312-item pool with 28 generator
// families × 100 templates each. Computing from live source post-P14 would
// drift, so the expectation is now a frozen literal. The dynamic byMode /
// bySkill / generatedTemplateCounts breakdowns were never asserted against,
// so they can be omitted; consumers only checked the top-level counters.
export function expectedPunctuationQGP13LiveManifest() {
  return Object.freeze({
    phase: PUNCTUATION_QG_P13_LIVE_PHASE,
    contentReleaseId: 'punctuation-qg-p12-3000-2026-05-02',
    productionDepth: 100,
    fixedItems: 512,
    generatedItems: 2800,
    runtimeItems: 3312,
    publishedRewardUnits: 14,
    generatedFamilies: 28,
    templatesPerFamilyMin: 100,
    templatesPerFamilyMax: 100,
  });
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function pushIf(errors, condition, message) {
  if (condition) errors.push(message);
}

export function validatePunctuationQGP13LiveEvidence(evidence, {
  expectedOrigin = PUNCTUATION_QG_P13_DEFAULT_ORIGIN,
  requireWorkerIdentity = true,
} = {}) {
  const expected = expectedPunctuationQGP13LiveManifest();
  const errors = [];

  pushIf(errors, !evidence || typeof evidence !== 'object', 'evidence must be a JSON object');
  if (!evidence || typeof evidence !== 'object') {
    return { ok: false, expected, errors };
  }

  const attestation = evidence.attestation || {};
  const observed = evidence.punctuation?.productionObserved || {};
  const local = evidence.punctuation?.localReleaseManifestExpectation || {};
  const smartSix = evidence.punctuation?.smartSix || {};
  const parentHubEvidence = evidence.punctuation?.parentHubEvidence || {};
  const adminHubEvidence = evidence.adminHubEvidence || evidence.punctuation?.adminHubEvidence || {};
  const spelling = evidence.spelling || {};

  pushIf(errors, evidence.ok !== true, 'ok must be true');
  pushIf(errors, evidence.origin !== expectedOrigin, `origin=${evidence.origin}, expected ${expectedOrigin}`);
  pushIf(errors, attestation.environment !== 'production', `attestation.environment=${attestation.environment}, expected production`);
  pushIf(errors, attestation.releasePhase !== PUNCTUATION_QG_P13_LIVE_PHASE, `attestation.releasePhase=${attestation.releasePhase}, expected ${PUNCTUATION_QG_P13_LIVE_PHASE}`);
  pushIf(errors, attestation.releaseId !== expected.contentReleaseId, `attestation.releaseId=${attestation.releaseId}, expected ${expected.contentReleaseId}`);
  pushIf(errors, attestation.runtimeItemCount !== expected.runtimeItems, `attestation.runtimeItemCount=${attestation.runtimeItemCount}, expected ${expected.runtimeItems}`);
  pushIf(errors, attestation.generatedDepth !== expected.productionDepth, `attestation.generatedDepth=${attestation.generatedDepth}, expected ${expected.productionDepth}`);
  pushIf(errors, attestation.authenticatedCoverage !== true, 'attestation.authenticatedCoverage must be true');
  pushIf(errors, !isNonEmptyString(attestation.timestamp), 'attestation.timestamp is required');
  if (requireWorkerIdentity) {
    pushIf(errors, !isNonEmptyString(attestation.workerCommitSha) && !isNonEmptyString(attestation.workerVersionId) && !isNonEmptyString(attestation.deploymentId), 'workerCommitSha, workerVersionId, or deploymentId is required for a P13 live-serving claim');
  }

  pushIf(errors, observed.releaseId !== expected.contentReleaseId, `productionObserved.releaseId=${observed.releaseId}, expected ${expected.contentReleaseId}`);
  pushIf(errors, observed.runtimeItems !== expected.runtimeItems, `productionObserved.runtimeItems=${observed.runtimeItems}, expected ${expected.runtimeItems}`);
  pushIf(errors, observed.publishedRewardUnits !== expected.publishedRewardUnits, `productionObserved.publishedRewardUnits=${observed.publishedRewardUnits}, expected ${expected.publishedRewardUnits}`);

  pushIf(errors, local.fixedItems !== expected.fixedItems, `localReleaseManifestExpectation.fixedItems=${local.fixedItems}, expected ${expected.fixedItems}`);
  pushIf(errors, local.generatedItems !== expected.generatedItems, `localReleaseManifestExpectation.generatedItems=${local.generatedItems}, expected ${expected.generatedItems}`);
  pushIf(errors, local.generatedPerFamily !== expected.productionDepth, `localReleaseManifestExpectation.generatedPerFamily=${local.generatedPerFamily}, expected ${expected.productionDepth}`);
  pushIf(errors, local.runtimeItems !== expected.runtimeItems, `localReleaseManifestExpectation.runtimeItems=${local.runtimeItems}, expected ${expected.runtimeItems}`);
  pushIf(errors, local.publishedRewardUnits !== expected.publishedRewardUnits, `localReleaseManifestExpectation.publishedRewardUnits=${local.publishedRewardUnits}, expected ${expected.publishedRewardUnits}`);

  pushIf(errors, smartSix.summaryTotal !== 6, `smartSix.summaryTotal=${smartSix.summaryTotal}, expected 6`);
  pushIf(errors, smartSix.uniqueItems !== 6, `smartSix.uniqueItems=${smartSix.uniqueItems}, expected 6`);
  pushIf(errors, Number(smartSix.immediateRepeats || 0) !== 0, `smartSix.immediateRepeats=${smartSix.immediateRepeats}, expected 0`);
  pushIf(errors, Number(smartSix.generatedSeen || 0) < 1, `smartSix.generatedSeen=${smartSix.generatedSeen}, expected at least 1 generated item in the six-question live smoke`);
  pushIf(errors, !Array.isArray(smartSix.items) || smartSix.items.length !== 6, 'smartSix.items must contain six surfaced live items');
  if (Array.isArray(smartSix.items)) {
    for (const [index, item] of smartSix.items.entries()) {
      pushIf(errors, !isNonEmptyString(item.itemId), `smartSix.items[${index}].itemId is required`);
      pushIf(errors, !['fixed', 'generated'].includes(item.source), `smartSix.items[${index}].source=${item.source}, expected fixed/generated`);
      pushIf(errors, !isNonEmptyString(item.mode), `smartSix.items[${index}].mode is required`);
      pushIf(errors, !Array.isArray(item.skillIds) || item.skillIds.length < 1, `smartSix.items[${index}].skillIds must be non-empty`);
    }
  }
  pushIf(errors, parentHubEvidence.hasEvidence !== true, 'parentHubEvidence.hasEvidence must be true');
  pushIf(errors, Number(parentHubEvidence.attempts || 0) < 6, `parentHubEvidence.attempts=${parentHubEvidence.attempts}, expected at least 6`);
  pushIf(errors, parentHubEvidence.progressSnapshotsHasPunctuation !== true, 'parentHubEvidence.progressSnapshotsHasPunctuation must be true');
  for (const key of ['punctuationEvidence', 'progressSnapshots', 'misconceptionPatterns']) {
    pushIf(errors, parentHubEvidence.redactionChecks?.[key] !== true, `parentHubEvidence.redactionChecks.${key} must be true`);
  }
  if (attestation.adminHubCoverage === true) {
    pushIf(errors, adminHubEvidence.hasEvidence !== true, 'adminHubEvidence.hasEvidence must be true when attestation.adminHubCoverage is true');
    for (const key of ['learnerSupport', 'punctuationEvidence', 'releaseDiagnostics']) {
      pushIf(errors, adminHubEvidence.redactionChecks?.[key] !== true, `adminHubEvidence.redactionChecks.${key} must be true when Admin Hub coverage is claimed`);
    }
  }
  pushIf(errors, Number(spelling.progressTotal) !== 1, `spelling.progressTotal=${spelling.progressTotal}, expected 1`);
  pushIf(errors, spelling.hasPromptToken !== true, 'spelling.hasPromptToken must be true');
  for (const key of ['rawWordHidden', 'rawSentenceHidden', 'promptTokenReturned']) {
    pushIf(errors, spelling.redactionChecks?.[key] !== true, `spelling.redactionChecks.${key} must be true`);
  }

  return {
    ok: errors.length === 0,
    expected,
    errors,
    caveats: {
      adminHubCoverage: attestation.adminHubCoverage === true ? 'covered' : 'not claimed by this P13 punctuation live-serving smoke',
      contentReleaseId: 'P13 is a live-serving release gate for the P12 3000+ content pool; the content release id remains P12 unless deliberately bumped in content source.',
    },
  };
}

function argValue(argv, ...names) {
  for (const name of names) {
    const index = argv.indexOf(name);
    if (index !== -1 && index + 1 < argv.length) return argv[index + 1];
  }
  return '';
}

function main(argv = process.argv) {
  const file = argValue(argv, '--file') || argv[2] || 'reports/punctuation/punctuation-qg-p13-production-smoke.json';
  const origin = argValue(argv, '--origin') || PUNCTUATION_QG_P13_DEFAULT_ORIGIN;
  const evidence = JSON.parse(readFileSync(file, 'utf8'));
  const result = validatePunctuationQGP13LiveEvidence(evidence, {
    expectedOrigin: origin,
    requireWorkerIdentity: true,
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
