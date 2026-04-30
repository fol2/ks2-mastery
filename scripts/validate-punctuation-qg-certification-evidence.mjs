#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_ROOT = resolve(__dirname, '..');

const CERTIFYING_STATUSES = new Set([
  'CERTIFIED_PRE_DEPLOY',
  'CERTIFIED_POST_DEPLOY',
  'DEPTH6_BLOCKED_BUT_DEPTH4_CERTIFIED',
]);

const ALLOWED_STATUSES = new Set([
  'BLOCKED',
  'BLOCKED_PENDING_HUMAN_ACCEPTANCE',
  ...CERTIFYING_STATUSES,
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function addError(errors, message) {
  errors.push(message);
}

function requireObject(errors, value, path) {
  if (!isPlainObject(value)) {
    addError(errors, `${path} must be an object`);
    return false;
  }
  return true;
}

function requireString(errors, value, path) {
  if (typeof value !== 'string' || !value.trim()) {
    addError(errors, `${path} must be a non-empty string`);
    return false;
  }
  return true;
}

function requireExact(errors, value, expected, path) {
  if (value !== expected) {
    addError(errors, `${path} must be ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
  }
}

function requireSha256(errors, value, path) {
  if (!/^[0-9a-f]{64}$/.test(String(value || ''))) {
    addError(errors, `${path} must be an exact SHA-256 hex digest`);
  }
}

function requireSemverVersion(errors, value, path) {
  if (!/^v?\d+\.\d+\.\d+$/.test(String(value || ''))) {
    addError(errors, `${path} must be an exact semantic version, not a placeholder`);
  }
}

function gitObjectExists(root, commitSha, relativePath) {
  try {
    execFileSync('git', ['cat-file', '-e', `${commitSha}:${relativePath}`], {
      cwd: root,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function validateSource(errors, warnings, manifest, root, certifying) {
  if (!requireObject(errors, manifest.source, 'source')) return;
  const { source } = manifest;
  if (!requireObject(errors, source.zip, 'source.zip')) return;
  requireExact(errors, source.zip.name, 'ks2-mastery-lean-04301832.zip', 'source.zip.name');
  requireSha256(errors, source.zip.sha256, 'source.zip.sha256');

  if (!requireObject(errors, source.git, 'source.git')) return;
  const git = source.git;
  requireString(errors, git.repository, 'source.git.repository');
  requireString(errors, git.ref, 'source.git.ref');
  if (!/^[0-9a-f]{40}$/.test(String(git.commitSha || ''))) {
    addError(errors, 'source.git.commitSha must be a 40-character Git SHA');
  }

  if (!Array.isArray(git.verifiedPaths) || git.verifiedPaths.length === 0) {
    addError(errors, 'source.git.verifiedPaths must be a non-empty array');
  }

  if (!isPlainObject(git.pathHashes)) {
    addError(errors, 'source.git.pathHashes must be an object keyed by verified path');
  }

  if (Array.isArray(git.verifiedPaths) && isPlainObject(git.pathHashes)) {
    for (const relativePath of git.verifiedPaths) {
      if (typeof relativePath !== 'string' || !relativePath) {
        addError(errors, 'source.git.verifiedPaths entries must be non-empty strings');
        continue;
      }
      const absolutePath = resolve(root, relativePath);
      if (!existsSync(absolutePath)) {
        addError(errors, `verified path does not exist in working tree: ${relativePath}`);
        continue;
      }
      const expectedHash = git.pathHashes[relativePath];
      requireSha256(errors, expectedHash, `source.git.pathHashes.${relativePath}`);
      if (/^[0-9a-f]{64}$/.test(String(expectedHash || ''))) {
        const actualHash = sha256File(absolutePath);
        if (actualHash !== expectedHash) {
          addError(errors, `path hash mismatch for ${relativePath}: manifest=${expectedHash}, actual=${actualHash}`);
        }
      }
      if (git.commitContainsAllVerifiedPaths === true && !gitObjectExists(root, git.commitSha, relativePath)) {
        addError(errors, `source.git.commitSha does not contain verified path: ${relativePath}`);
      }
    }
  }

  if (git.commitContainsAllVerifiedPaths !== true) {
    if (certifying) {
      addError(errors, 'certifying manifests require source.git.commitContainsAllVerifiedPaths=true');
    } else {
      warnings.push('source.git.commitContainsAllVerifiedPaths is false; manifest is correctly non-certifying');
    }
  }
}

function validateRuntimePool(errors, manifest) {
  if (!requireObject(errors, manifest.runtimePool, 'runtimePool')) return;
  requireExact(errors, manifest.runtimePool.productionDepth, 4, 'runtimePool.productionDepth');
  requireExact(errors, manifest.runtimePool.fixedItems, 92, 'runtimePool.fixedItems');
  requireExact(errors, manifest.runtimePool.generatedProductionItems, 100, 'runtimePool.generatedProductionItems');
  requireExact(errors, manifest.runtimePool.totalProductionItems, 192, 'runtimePool.totalProductionItems');
}

function validateLocalVerification(errors, warnings, manifest, root) {
  if (!requireObject(errors, manifest.localVerification, 'localVerification')) return;
  const local = manifest.localVerification;
  requireExact(errors, local.command, 'npm run verify:punctuation-qg:p10', 'localVerification.command');
  if (!['pass', 'not_run', 'blocked'].includes(local.status)) {
    addError(errors, `localVerification.status must be pass, not_run, or blocked; got ${JSON.stringify(local.status)}`);
  }

  if (local.status === 'pass') {
    requireExact(errors, local.exitCode, 0, 'localVerification.exitCode');
    requireSemverVersion(errors, local.nodeVersion, 'localVerification.nodeVersion');
    requireSemverVersion(errors, local.npmVersion, 'localVerification.npmVersion');
    if (local.logicalGates !== 56) {
      addError(errors, `localVerification.logicalGates must be 56, got ${local.logicalGates}`);
    }
    requireString(errors, local.logPath, 'localVerification.logPath');
    requireSha256(errors, local.logSha256, 'localVerification.logSha256');
    if (typeof local.logPath === 'string' && local.logPath) {
      const logPath = resolve(root, local.logPath);
      if (!existsSync(logPath)) {
        addError(errors, `localVerification.logPath does not exist: ${local.logPath}`);
      } else if (/^[0-9a-f]{64}$/.test(String(local.logSha256 || ''))) {
        const actualHash = sha256File(logPath);
        if (actualHash !== local.logSha256) {
          addError(errors, `localVerification.logSha256 mismatch: manifest=${local.logSha256}, actual=${actualHash}`);
        }
      }
    }
  } else {
    warnings.push(`localVerification.status=${local.status}; manifest is not a completed local-run artefact`);
  }
}

function validateReview(errors, manifest, certifying) {
  if (!requireObject(errors, manifest.review, 'review')) return;
  const { review } = manifest;
  if (!requireObject(errors, review.aiPreReview, 'review.aiPreReview')) return;
  requireExact(errors, review.aiPreReview.status, 'complete', 'review.aiPreReview.status');
  requireExact(errors, review.aiPreReview.itemDecisions, 192, 'review.aiPreReview.itemDecisions');
  requireExact(errors, review.aiPreReview.reviewRequiredClusterDecisions, 47, 'review.aiPreReview.reviewRequiredClusterDecisions');

  if (!requireObject(errors, review.humanAcceptance, 'review.humanAcceptance')) return;
  const human = review.humanAcceptance;
  if (human.status === 'complete') {
    requireString(errors, human.reviewer, 'review.humanAcceptance.reviewer');
    requireString(errors, human.role, 'review.humanAcceptance.role');
    requireString(errors, human.reviewedAt, 'review.humanAcceptance.reviewedAt');
    requireExact(errors, human.acceptedItems, 192, 'review.humanAcceptance.acceptedItems');
    requireExact(errors, human.acceptedReviewRequiredClusters, 47, 'review.humanAcceptance.acceptedReviewRequiredClusters');
    if (!Array.isArray(human.blockers) || human.blockers.length !== 0) {
      addError(errors, 'review.humanAcceptance.blockers must be an empty array when complete');
    }
  } else if (certifying) {
    addError(errors, 'certifying manifests require review.humanAcceptance.status=complete');
  } else if (manifest.certificationStatus !== 'BLOCKED_PENDING_HUMAN_ACCEPTANCE') {
    addError(errors, 'incomplete human acceptance must use certificationStatus=BLOCKED_PENDING_HUMAN_ACCEPTANCE');
  }
}

function validateLiveSmoke(errors, manifest) {
  if (!requireObject(errors, manifest.liveProductionSmoke, 'liveProductionSmoke')) return;
  const smoke = manifest.liveProductionSmoke;
  if (manifest.certificationStatus === 'CERTIFIED_POST_DEPLOY') {
    requireExact(errors, smoke.status, 'pass', 'liveProductionSmoke.status');
    for (const field of ['environment', 'origin', 'releaseId', 'deployedCommitOrWorkerVersion', 'timestamp', 'result', 'artefactPath', 'artefactSha256']) {
      requireString(errors, smoke[field], `liveProductionSmoke.${field}`);
    }
    requireSha256(errors, smoke.artefactSha256, 'liveProductionSmoke.artefactSha256');
  } else if (!['not_run', 'pass', 'fail'].includes(smoke.status)) {
    addError(errors, `liveProductionSmoke.status must be not_run, pass, or fail; got ${JSON.stringify(smoke.status)}`);
  }
}

function validateDepth6(errors, manifest) {
  if (!requireObject(errors, manifest.depth6, 'depth6')) return;
  requireExact(errors, manifest.depth6.status, 'blocked', 'depth6.status');
}

export function validatePunctuationCertificationManifest(manifestPath, { root = DEFAULT_ROOT } = {}) {
  const errors = [];
  const warnings = [];
  const absolutePath = resolve(root, manifestPath);

  if (!existsSync(absolutePath)) {
    return { valid: false, errors: [`Manifest file not found: ${manifestPath}`], warnings, manifest: null };
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    return { valid: false, errors: [`Failed to parse manifest JSON: ${error.message}`], warnings, manifest: null };
  }

  requireExact(errors, manifest.schemaVersion, 1, 'schemaVersion');
  requireExact(errors, manifest.subject, 'punctuation', 'subject');
  requireExact(errors, manifest.phase, 'punctuation-qg-p10', 'phase');
  requireString(errors, manifest.releaseId, 'releaseId');

  if (!ALLOWED_STATUSES.has(manifest.certificationStatus)) {
    addError(errors, `certificationStatus is not allowed: ${JSON.stringify(manifest.certificationStatus)}`);
  }

  const certifying = CERTIFYING_STATUSES.has(manifest.certificationStatus);
  validateSource(errors, warnings, manifest, root, certifying);
  validateRuntimePool(errors, manifest);
  validateLocalVerification(errors, warnings, manifest, root);
  validateReview(errors, manifest, certifying);
  validateLiveSmoke(errors, manifest);
  validateDepth6(errors, manifest);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    manifest,
  };
}

function parseCli(argv) {
  const args = { manifestPath: null, root: DEFAULT_ROOT };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') {
      args.root = resolve(argv[index + 1] || '.');
      index += 1;
    } else if (!args.manifestPath) {
      args.manifestPath = arg;
    }
  }
  return args;
}

function main() {
  const args = parseCli(process.argv);
  if (!args.manifestPath) {
    console.error('Usage: node scripts/validate-punctuation-qg-certification-evidence.mjs <manifest.json> [--root .]');
    process.exit(2);
  }

  const result = validatePunctuationCertificationManifest(args.manifestPath, { root: args.root });
  if (!result.valid) {
    console.error('Punctuation QG certification evidence: FAIL');
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  console.log('Punctuation QG certification evidence: PASS');
  if (result.warnings.length > 0) {
    for (const warning of result.warnings) {
      console.log(`  warning: ${warning}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
