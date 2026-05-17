#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SECURE_VOCABULARY_REVIEW_PACK_WORD_METADATA_MISMATCH =
  'secure_vocabulary_review_pack_word_metadata_mismatch';
export const SECURE_VOCABULARY_RELEASE_PROMOTION_NOT_APPROVED =
  'secure_vocabulary_release_promotion_not_approved';
export const SECURE_VOCABULARY_RELEASE_WORD_NOT_ADULT_APPROVED =
  'secure_vocabulary_release_word_not_adult_approved';
export const SECURE_VOCABULARY_RELEASE_WORD_MISSING_REVIEW_PACK_ENTRY =
  'secure_vocabulary_release_word_missing_review_pack_entry';
export const SECURE_VOCABULARY_RELEASE_WORD_MISSING_FIELD =
  'secure_vocabulary_release_word_missing_field';

const SECURE_EXTENSION_IMPORT_DECISION = 'APPROVED_FOR_SECURE_EXTENSION_IMPORT';
const RELEASE_READY_REVIEW_STATUSES = new Set([
  'adult_approved',
  'adult_approved_for_secure_extension_import',
  'approved_for_secure_extension_import',
]);
const RELEASE_READY_REQUIRED_FIELDS = Object.freeze([
  'acceptedSpellings',
  'explanation',
  'exampleSentences',
  'ukSpellingDecision',
  'patternOrMorphologyTags',
  'familyRoot',
  'audioOrTtsStatus',
]);

function normaliseIdentity(value) {
  return String(value ?? '').trim().toLowerCase();
}

function wordIdentity(word) {
  if (!word || typeof word !== 'object') return '';
  return normaliseIdentity(word.slug || word.id || word.word);
}

function wordsFromPayload(payload, label) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.words)) return payload.words;
  if (Array.isArray(payload?.[label]?.words)) return payload[label].words;
  return [];
}

function valueAt(word, path) {
  let current = word;
  for (const part of path.split('.')) {
    current = current?.[part];
  }
  return current;
}

function hasUsableString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasUsableStringArray(value) {
  return Array.isArray(value) && value.some((entry) => hasUsableString(entry));
}

function metadataField(name, reviewPackPath, sourcePath) {
  return { name, reviewPackPath, sourcePath };
}

const REVIEW_PACK_WORD_METADATA_FIELDS = Object.freeze([
  metadataField('reviewer', 'reviewer', 'review.reviewer'),
  metadataField('reviewedAt', 'reviewedAt', 'review.reviewedAt'),
  metadataField('provenanceSource', 'provenanceSource', 'provenance.source'),
  metadataField('safetyStatus', 'safetyStatus', 'safety.status'),
]);

function buildAuditedSourceIndex(auditedSourceWords) {
  const index = new Map();
  for (const sourceWord of auditedSourceWords) {
    const identity = wordIdentity(sourceWord);
    if (identity && !index.has(identity)) {
      index.set(identity, sourceWord);
    }
  }
  return index;
}

function buildWordPositionIndex(words) {
  const index = new Map();
  words.forEach((word, wordIndex) => {
    const identity = wordIdentity(word);
    if (identity && !index.has(identity)) {
      index.set(identity, { index: wordIndex, word });
    }
  });
  return index;
}

function mismatchDetail(field, actual, expected) {
  return { field, actual: actual ?? null, expected: expected ?? null };
}

function reviewStatusMismatches(reviewPackWord, sourceWord) {
  const actual = reviewPackWord?.reviewStatus;
  const expected = sourceWord?.review?.status;
  if (actual === 'approved' && actual === expected) return [];

  return [mismatchDetail('reviewStatus', actual, expected)];
}

function wordMetadataMismatches(reviewPackWord, sourceWord) {
  if (!sourceWord) {
    return [mismatchDetail('sourceWord', null, 'audited source word')];
  }

  const mismatches = reviewStatusMismatches(reviewPackWord, sourceWord);
  for (const field of REVIEW_PACK_WORD_METADATA_FIELDS) {
    const actual = valueAt(reviewPackWord, field.reviewPackPath);
    const expected = valueAt(sourceWord, field.sourcePath);
    if (actual !== expected) {
      mismatches.push(mismatchDetail(field.name, actual, expected));
    }
  }
  return mismatches;
}

export function verifySecureVocabularyRelease({ auditedSource, reviewPack } = {}) {
  const auditedSourceWords = wordsFromPayload(auditedSource, 'auditedSource');
  const reviewPackWords = wordsFromPayload(reviewPack, 'reviewPack');
  const auditedSourceIndex = buildAuditedSourceIndex(auditedSourceWords);
  const issues = [];

  reviewPackWords.forEach((reviewPackWord, index) => {
    const identity = wordIdentity(reviewPackWord);
    const sourceWord = auditedSourceIndex.get(identity);
    const mismatches = wordMetadataMismatches(reviewPackWord, sourceWord);

    if (mismatches.length > 0) {
      issues.push({
        code: SECURE_VOCABULARY_REVIEW_PACK_WORD_METADATA_MISMATCH,
        path: `reviewPack.words[${index}]`,
        wordIdentity: identity || null,
        fields: mismatches.map((entry) => entry.field),
        mismatches,
      });
    }
  });

  return {
    ok: issues.length === 0,
    issueCount: issues.length,
    checkedReviewPackWords: reviewPackWords.length,
    checkedAuditedSourceWords: auditedSourceWords.length,
    issues,
  };
}

function sourceSummaryFrom(payload) {
  return payload?.source && typeof payload.source === 'object' ? payload.source : {};
}

function reportIssue(issues, issue, options) {
  const maxIssues = Number.isInteger(options?.maxIssues) && options.maxIssues >= 0
    ? options.maxIssues
    : Infinity;
  if (issues.length < maxIssues) {
    issues.push(issue);
  }
}

function hasReleaseField(word, fieldName) {
  const readiness = word?.releaseReadiness || {};
  switch (fieldName) {
    case 'acceptedSpellings':
      return hasUsableStringArray(readiness.acceptedSpellings) || hasUsableStringArray(word?.accepted);
    case 'explanation':
      return hasUsableString(readiness.explanation) || hasUsableString(word?.explanation);
    case 'exampleSentences':
      return hasUsableStringArray(readiness.exampleSentences) || hasUsableStringArray(word?.sentences);
    case 'ukSpellingDecision':
      return hasUsableString(readiness.ukSpellingDecision)
        || hasUsableString(word?.ukSpellingDecision)
        || hasUsableString(word?.spellingPolicy?.ukDecision);
    case 'patternOrMorphologyTags':
      return hasUsableStringArray(word?.patternTags)
        || hasUsableStringArray(readiness.morphologyTags)
        || hasUsableStringArray(word?.morphologyTags);
    case 'familyRoot':
      return hasUsableString(readiness.familyRoot)
        || hasUsableString(word?.familyRoot)
        || hasUsableString(word?.family)
        || hasUsableString(word?.morphologyFamily);
    case 'audioOrTtsStatus':
      return hasUsableString(readiness.audioStatus)
        || hasUsableString(readiness.ttsStatus)
        || hasUsableString(word?.audioStatus)
        || hasUsableString(word?.ttsStatus);
    default:
      return false;
  }
}

function reportMissingReleaseFields({ word, path, identity, issues, maxIssues }) {
  let issueCount = 0;
  for (const field of RELEASE_READY_REQUIRED_FIELDS) {
    if (hasReleaseField(word, field)) continue;
    issueCount += 1;
    reportIssue(issues, {
      code: SECURE_VOCABULARY_RELEASE_WORD_MISSING_FIELD,
      path,
      wordIdentity: identity || null,
      field,
    }, { maxIssues });
  }
  return issueCount;
}

export function verifySecureVocabularyReleaseReadiness({
  auditedSource,
  reviewPack,
  maxIssues = 200,
} = {}) {
  const metadataReport = verifySecureVocabularyRelease({ auditedSource, reviewPack });
  const auditedSourceWords = wordsFromPayload(auditedSource, 'auditedSource');
  const reviewPackWords = wordsFromPayload(reviewPack, 'reviewPack');
  const reviewPackWordIndex = buildWordPositionIndex(reviewPackWords);
  const sourceSummary = sourceSummaryFrom(auditedSource);
  const reviewPackSummary = sourceSummaryFrom(reviewPack);
  const issues = [];
  let issueCount = metadataReport.issueCount;

  for (const issue of metadataReport.issues) {
    reportIssue(issues, issue, { maxIssues });
  }

  const securePromotionAllowed = sourceSummary.securePromotionAllowed === true
    && reviewPackSummary.securePromotionAllowed === true
    && sourceSummary.approvalDecision === SECURE_EXTENSION_IMPORT_DECISION
    && reviewPackSummary.approvalDecision === SECURE_EXTENSION_IMPORT_DECISION;

  if (!securePromotionAllowed) {
    issueCount += 1;
    reportIssue(issues, {
      code: SECURE_VOCABULARY_RELEASE_PROMOTION_NOT_APPROVED,
      path: 'source.approvalDecision',
      message: 'Secure-extension promotion requires APPROVED_FOR_SECURE_EXTENSION_IMPORT on both audited source and review pack.',
      auditedSourceDecision: sourceSummary.approvalDecision || null,
      reviewPackDecision: reviewPackSummary.approvalDecision || null,
    }, { maxIssues });
  }

  auditedSourceWords.forEach((word, index) => {
    if (word?.taxonomyTier !== 'secure-extension') return;
    const identity = wordIdentity(word);
    const reviewPackEntry = identity ? reviewPackWordIndex.get(identity) : null;

    if (!reviewPackEntry) {
      issueCount += 1;
      reportIssue(issues, {
        code: SECURE_VOCABULARY_RELEASE_WORD_MISSING_REVIEW_PACK_ENTRY,
        path: `auditedSource.words[${index}]`,
        wordIdentity: identity || null,
        message: 'Secure-extension release readiness requires every audited source word to appear in the review pack.',
      }, { maxIssues });
    }

    const reviewStatus = normaliseIdentity(word?.sourceReviewStatus || word?.review?.status);
    if (!RELEASE_READY_REVIEW_STATUSES.has(reviewStatus)) {
      issueCount += 1;
      reportIssue(issues, {
        code: SECURE_VOCABULARY_RELEASE_WORD_NOT_ADULT_APPROVED,
        path: `auditedSource.words[${index}].sourceReviewStatus`,
        wordIdentity: identity || null,
        actual: word?.sourceReviewStatus || word?.review?.status || null,
      }, { maxIssues });
    }

    issueCount += reportMissingReleaseFields({
      word,
      path: `auditedSource.words[${index}]`,
      identity,
      issues,
      maxIssues,
    });

    if (reviewPackEntry) {
      issueCount += reportMissingReleaseFields({
        word: reviewPackEntry.word,
        path: `reviewPack.words[${reviewPackEntry.index}]`,
        identity,
        issues,
        maxIssues,
      });
    }
  });

  return {
    ok: issueCount === 0,
    issueCount,
    issues,
    issuesTruncated: issues.length < issueCount,
    checkedReviewPackWords: reviewPackWords.length,
    checkedAuditedSourceWords: auditedSourceWords.length,
    checkedSecureExtensionWords: auditedSourceWords.filter((word) => word?.taxonomyTier === 'secure-extension').length,
    metadataIssueCount: metadataReport.issueCount,
  };
}

function parseArgs(argv) {
  const options = {
    auditedSourcePath: null,
    reviewPackPath: null,
    outPath: null,
    json: false,
    releaseReady: false,
    help: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--release-ready') options.releaseReady = true;
    else if ((arg === '--audited-source' || arg === '--source') && argv[index + 1]) {
      options.auditedSourcePath = argv[++index];
    } else if (arg.startsWith('--audited-source=')) {
      options.auditedSourcePath = arg.slice('--audited-source='.length);
    } else if (arg.startsWith('--source=')) {
      options.auditedSourcePath = arg.slice('--source='.length);
    } else if (arg === '--review-pack' && argv[index + 1]) {
      options.reviewPackPath = argv[++index];
    } else if (arg.startsWith('--review-pack=')) {
      options.reviewPackPath = arg.slice('--review-pack='.length);
    } else if (arg === '--out' && argv[index + 1]) {
      options.outPath = argv[++index];
    } else if (arg.startsWith('--out=')) {
      options.outPath = arg.slice('--out='.length);
    }
  }

  return options;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/verify-spelling-secure-vocabulary-release.mjs --audited-source <source.json> --review-pack <review-pack.json> [--json] [--out <report.json>] [--release-ready]',
    '',
    'The gate compares reviewPack.words metadata against the audited source word matched by slug, id, or word.',
    '`--release-ready` additionally blocks import-reviewer-only sources and secure-extension words missing release-quality metadata.',
  ].join('\n');
}

function readJsonFile(path) {
  const resolved = resolve(path);
  if (!existsSync(resolved)) {
    throw new Error(`JSON file not found: ${path}`);
  }
  return JSON.parse(readFileSync(resolved, 'utf8'));
}

function emitReport(report, options) {
  const payload = JSON.stringify(report, null, 2);
  if (options.outPath) {
    writeFileSync(resolve(options.outPath), `${payload}\n`);
  }
  if (options.json || !options.outPath) {
    console.log(payload);
  } else {
    console.log(`Secure vocabulary release verification ${report.ok ? 'passed' : 'failed'}: ${report.issueCount} issue(s)`);
  }
}

function isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  try {
    const options = parseArgs(process.argv);
    if (options.help) {
      console.log(usage());
      process.exit(0);
    }
    if (!options.auditedSourcePath || !options.reviewPackPath) {
      console.error(usage());
      process.exit(2);
    }

    const payload = {
      auditedSource: readJsonFile(options.auditedSourcePath),
      reviewPack: readJsonFile(options.reviewPackPath),
    };
    const report = options.releaseReady
      ? verifySecureVocabularyReleaseReadiness(payload)
      : verifySecureVocabularyRelease(payload);
    emitReport(report, options);
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2));
    process.exit(1);
  }
}
