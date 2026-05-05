#!/usr/bin/env node

/**
 * Validates the P20 production smoke contract for Punctuation QG.
 *
 * This validates production evidence only. It does not prove local source
 * quality; pair it with `audit-punctuation-qg-p20-expansion.mjs`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_SMOKE_PATH = 'reports/punctuation/punctuation-qg-p20-production-smoke.json';
const DEFAULT_AUDIT_PATH = 'reports/punctuation/punctuation-qg-p20-expansion-audit.json';
const MIN_RUNTIME_ITEMS = 15_000;

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    smokePath: args.find((arg) => !arg.startsWith('--')) || DEFAULT_SMOKE_PATH,
    auditPath: DEFAULT_AUDIT_PATH,
    expectedOrigin: 'https://ks2.eugnel.uk',
    json: args.includes('--json'),
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--audit' && args[index + 1]) options.auditPath = args[++index];
    else if (arg.startsWith('--audit=')) options.auditPath = arg.slice('--audit='.length);
    else if (arg === '--expected-origin' && args[index + 1]) options.expectedOrigin = args[++index];
    else if (arg.startsWith('--expected-origin=')) options.expectedOrigin = arg.slice('--expected-origin='.length);
  }
  return options;
}

function readJson(path) {
  const resolved = resolve(path);
  if (!existsSync(resolved)) return { exists: false, path, data: null, error: null };
  try {
    return { exists: true, path, data: JSON.parse(readFileSync(resolved, 'utf8')), error: null };
  } catch (error) {
    return { exists: true, path, data: null, error: error.message };
  }
}

function firstString(...values) {
  return values.find((value) => typeof value === 'string' && value.trim()) || '';
}

function firstNumber(...values) {
  const found = values.find((value) => Number.isFinite(Number(value)));
  return found === undefined ? null : Number(found);
}

function parseReleaseId(releaseId) {
  const match = String(releaseId || '').match(/^punctuation-qg-p(\d+)-(\d+)-(\d{4}-\d{2}-\d{2})$/);
  if (!match) return { matchesPattern: false, phase: null, embeddedRuntimeCount: null, releaseDate: null };
  return {
    matchesPattern: true,
    phase: Number(match[1]),
    embeddedRuntimeCount: Number(match[2]),
    releaseDate: match[3],
  };
}

export function validatePunctuationQGP20LiveEvidence({ smokePath = DEFAULT_SMOKE_PATH, auditPath = DEFAULT_AUDIT_PATH, expectedOrigin = 'https://ks2.eugnel.uk' } = {}) {
  const smoke = readJson(smokePath);
  const audit = readJson(auditPath);
  const failures = [];

  if (!smoke.exists) failures.push(`missing production smoke: ${smokePath}`);
  if (smoke.error) failures.push(`production smoke is not valid JSON: ${smoke.error}`);

  const data = smoke.data || {};
  const attestation = data.attestation || {};
  const punctuation = data.punctuation || {};
  const productionObserved = punctuation.productionObserved || {};
  const smartSix = punctuation.smartSix || data.smartSix || {};

  const releaseId = firstString(
    data.releaseId,
    attestation.releaseId,
    productionObserved.releaseId,
    smartSix?.observedRuntimeStats?.releaseId,
  );
  const runtimeItemCount = firstNumber(
    data.runtimeItemCount,
    attestation.runtimeItemCount,
    productionObserved.runtimeItems,
    productionObserved.runtimeItemCount,
    smartSix?.observedRuntimeStats?.runtimeItems,
    smartSix?.observedRuntimeStats?.runtimeItemCount,
  );
  const release = parseReleaseId(releaseId);
  const environment = firstString(data.environment, attestation.environment);
  const origin = firstString(data.origin, attestation.origin);
  const workerEvidence = firstString(
    data.workerCommitSha,
    data.workerVersionId,
    attestation.workerCommitSha,
    attestation.workerVersionId,
    attestation.deploymentId,
  );
  const authenticatedCoverage = data.authenticatedCoverage === true || attestation.authenticatedCoverage === true;
  const adminHubCoverage = data.adminHubCoverage === true
    || attestation.adminHubCoverage === true
    || data.adminHubEvidence?.hasEvidence === true
    || punctuation.adminHubEvidence?.hasEvidence === true;

  if (data.ok !== true) failures.push('production smoke ok must be true');
  if (origin !== expectedOrigin) failures.push(`origin=${origin || 'missing'}, expected ${expectedOrigin}`);
  if (environment !== 'production') failures.push(`environment=${environment || 'missing'}, expected production`);
  if (!release.matchesPattern) failures.push(`releaseId=${releaseId || 'missing'} does not match punctuation-qg-p20-{count}-{yyyy-mm-dd}`);
  if (release.phase !== null && release.phase < 20) failures.push(`release phase p${release.phase} is lower than p20`);
  if (runtimeItemCount === null) failures.push('runtime item count missing');
  if (runtimeItemCount !== null && runtimeItemCount < MIN_RUNTIME_ITEMS) failures.push(`runtime item count ${runtimeItemCount} < ${MIN_RUNTIME_ITEMS}`);
  if (release.embeddedRuntimeCount !== null && runtimeItemCount !== null && release.embeddedRuntimeCount !== runtimeItemCount) {
    failures.push(`release ID embedded count ${release.embeddedRuntimeCount} does not match runtime count ${runtimeItemCount}`);
  }
  if (!workerEvidence) failures.push('worker commit/version/deployment evidence missing');
  if (!authenticatedCoverage) failures.push('authenticatedCoverage must be true');
  if (!adminHubCoverage) failures.push('adminHubCoverage/adminHubEvidence must be true');
  if (Number(smartSix.summaryTotal) !== 6) failures.push(`smartSix.summaryTotal=${smartSix.summaryTotal}, expected 6`);
  if (Number(smartSix.uniqueItems) !== 6) failures.push(`smartSix.uniqueItems=${smartSix.uniqueItems}, expected 6`);
  if (Number(smartSix.immediateRepeats) !== 0) failures.push(`smartSix.immediateRepeats=${smartSix.immediateRepeats}, expected 0`);

  const dashAcceptance = Array.isArray(punctuation.dashAcceptance) ? punctuation.dashAcceptance : [];
  const dashByVariant = new Map(dashAcceptance.map((entry) => [entry?.variant, entry]));
  for (const variant of ['spaced-hyphen', 'en-dash', 'em-dash']) {
    const entry = dashByVariant.get(variant);
    if (!entry) {
      failures.push(`dashAcceptance missing ${variant}`);
      continue;
    }
    if (entry.feedbackKind !== 'success') {
      failures.push(`dashAcceptance.${variant}.feedbackKind=${entry.feedbackKind || 'missing'}, expected success`);
    }
    if (typeof entry.acceptedAnswer !== 'string' || !entry.acceptedAnswer.trim()) {
      failures.push(`dashAcceptance.${variant}.acceptedAnswer missing`);
    }
  }

  let auditStatus = null;
  if (!audit.exists) failures.push(`missing local P20 expansion audit evidence: ${auditPath}`);
  else if (audit.error) failures.push(`P20 expansion audit is not valid JSON: ${audit.error}`);
  else {
    auditStatus = audit.data?.status || null;
    if (auditStatus !== 'PASS') failures.push(`P20 expansion audit status=${auditStatus || 'missing'}, expected PASS`);
  }

  return {
    schemaVersion: 1,
    phase: 'punctuation-qg-p20-live-evidence-validation',
    ok: failures.length === 0,
    smokePath,
    auditPath,
    expectedOrigin,
    observed: {
      origin,
      environment,
      releaseId,
      release,
      runtimeItemCount,
      workerEvidencePresent: Boolean(workerEvidence),
      authenticatedCoverage,
      adminHubCoverage,
      smartSix: {
        summaryTotal: smartSix.summaryTotal ?? null,
        uniqueItems: smartSix.uniqueItems ?? null,
        immediateRepeats: smartSix.immediateRepeats ?? null,
      },
      dashAcceptance: dashAcceptance.map((entry) => ({
        variant: entry?.variant ?? null,
        feedbackKind: entry?.feedbackKind ?? null,
        hasAcceptedAnswer: typeof entry?.acceptedAnswer === 'string' && entry.acceptedAnswer.trim().length > 0,
      })),
      auditStatus,
    },
    failures,
  };
}

function main() {
  const options = parseArgs(process.argv);
  const result = validatePunctuationQGP20LiveEvidence(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Punctuation QG P20 live evidence validation: ${result.ok ? 'PASS' : 'FAIL'}`);
    for (const failure of result.failures) console.log(`  - ${failure}`);
  }
  if (!result.ok) process.exitCode = 1;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) main();
