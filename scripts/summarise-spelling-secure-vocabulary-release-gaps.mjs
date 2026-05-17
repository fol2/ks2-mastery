#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifySecureVocabularyReleaseReadiness } from './verify-spelling-secure-vocabulary-release.mjs';

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
  return normaliseIdentity(word?.slug || word?.id || word?.word);
}

function sourceSummaryFrom(payload) {
  return payload?.source && typeof payload.source === 'object' ? payload.source : {};
}

function wordsFromPayload(payload, label) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.words)) return payload.words;
  if (Array.isArray(payload?.[label]?.words)) return payload[label].words;
  return [];
}

function hasUsableString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasUsableStringArray(value) {
  return Array.isArray(value) && value.some((entry) => hasUsableString(entry));
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

function increment(map, key) {
  const safeKey = String(key || 'missing');
  map[safeKey] = (map[safeKey] || 0) + 1;
}

function emptyFieldCounts() {
  return Object.fromEntries(RELEASE_READY_REQUIRED_FIELDS.map((field) => [field, 0]));
}

function totalMissingReleaseFields(summary) {
  return RELEASE_READY_REQUIRED_FIELDS.reduce((total, field) =>
    total
      + (summary.missingFields?.auditedSource?.[field] || 0)
      + (summary.missingFields?.reviewPack?.[field] || 0), 0);
}

function recordExample(examples, word, maxExamples) {
  if (examples.length >= maxExamples) return;
  examples.push({
    word: word?.word || word?.slug || word?.id || null,
    sourceRecordId: word?.sourceRecordId || null,
  });
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

export function summariseSecureVocabularyReleaseGaps({
  auditedSource,
  reviewPack,
  maxExamples = 20,
} = {}) {
  const auditedSourceWords = wordsFromPayload(auditedSource, 'auditedSource');
  const reviewPackWords = wordsFromPayload(reviewPack, 'reviewPack');
  const secureExtensionWords = auditedSourceWords.filter((word) => word?.taxonomyTier === 'secure-extension');
  const reviewPackIndex = buildWordPositionIndex(reviewPackWords);
  const auditedSourceSummary = sourceSummaryFrom(auditedSource);
  const reviewPackSummary = sourceSummaryFrom(reviewPack);
  const readiness = verifySecureVocabularyReleaseReadiness({
    auditedSource,
    reviewPack,
    maxIssues: 0,
  });

  const auditedSourceMissingFields = emptyFieldCounts();
  const reviewPackMissingFields = emptyFieldCounts();
  const missingFieldExamples = Object.fromEntries(
    RELEASE_READY_REQUIRED_FIELDS.map((field) => [field, []])
  );
  const reviewStatusCounts = {};
  const sourceBucketCounts = {};
  const yearBandCounts = {};
  const advisoryCounts = {};
  const missingReviewPackExamples = [];
  const notAdultApprovedExamples = [];
  let missingReviewPackEntries = 0;
  let adultApprovedForSecureImport = 0;
  let advisoryWordCount = 0;
  let noAdvisoryWordCount = 0;

  for (const word of secureExtensionWords) {
    const identity = wordIdentity(word);
    const reviewPackEntry = identity ? reviewPackIndex.get(identity) : null;
    const reviewStatus = normaliseIdentity(word?.sourceReviewStatus || word?.review?.status);
    const advisories = Array.isArray(word?.advisories) ? word.advisories : [];

    increment(reviewStatusCounts, reviewStatus || 'missing');
    increment(sourceBucketCounts, word?.sourceBucket || word?.provenance?.sourceBucket || 'missing');
    increment(yearBandCounts, word?.yearBand || 'missing');

    if (RELEASE_READY_REVIEW_STATUSES.has(reviewStatus)) {
      adultApprovedForSecureImport += 1;
    } else {
      recordExample(notAdultApprovedExamples, word, maxExamples);
    }

    if (advisories.length > 0) {
      advisoryWordCount += 1;
      for (const advisory of advisories) increment(advisoryCounts, advisory);
    } else {
      noAdvisoryWordCount += 1;
    }

    for (const field of RELEASE_READY_REQUIRED_FIELDS) {
      if (!hasReleaseField(word, field)) {
        auditedSourceMissingFields[field] += 1;
        recordExample(missingFieldExamples[field], word, maxExamples);
      }
    }

    if (!reviewPackEntry) {
      missingReviewPackEntries += 1;
      recordExample(missingReviewPackExamples, word, maxExamples);
      continue;
    }

    for (const field of RELEASE_READY_REQUIRED_FIELDS) {
      if (!hasReleaseField(reviewPackEntry.word, field)) {
        reviewPackMissingFields[field] += 1;
      }
    }
  }

  const promotionApproved = auditedSourceSummary.approvalDecision === SECURE_EXTENSION_IMPORT_DECISION
    && reviewPackSummary.approvalDecision === SECURE_EXTENSION_IMPORT_DECISION
    && auditedSourceSummary.securePromotionAllowed === true
    && reviewPackSummary.securePromotionAllowed === true;

  return {
    ok: readiness.ok,
    status: readiness.ok ? 'RELEASE READY' : 'RELEASE BLOCKED',
    approval: {
      auditedSourceDecision: auditedSourceSummary.approvalDecision || null,
      reviewPackDecision: reviewPackSummary.approvalDecision || null,
      auditedSourceSecurePromotionAllowed: auditedSourceSummary.securePromotionAllowed === true,
      reviewPackSecurePromotionAllowed: reviewPackSummary.securePromotionAllowed === true,
      promotionApproved,
    },
    counts: {
      auditedSourceWords: auditedSourceWords.length,
      reviewPackWords: reviewPackWords.length,
      secureExtensionWords: secureExtensionWords.length,
      missingReviewPackEntries,
      adultApprovedForSecureImport,
      notAdultApprovedForSecureImport: secureExtensionWords.length - adultApprovedForSecureImport,
      advisoryWordCount,
      noAdvisoryWordCount,
    },
    releaseReadiness: {
      ok: readiness.ok,
      issueCount: readiness.issueCount,
      metadataIssueCount: readiness.metadataIssueCount,
      checkedSecureExtensionWords: readiness.checkedSecureExtensionWords,
      checkedAuditedSourceWords: readiness.checkedAuditedSourceWords,
      checkedReviewPackWords: readiness.checkedReviewPackWords,
    },
    missingFields: {
      auditedSource: auditedSourceMissingFields,
      reviewPack: reviewPackMissingFields,
    },
    distributions: {
      reviewStatus: reviewStatusCounts,
      sourceBucket: sourceBucketCounts,
      yearBand: yearBandCounts,
      advisories: advisoryCounts,
    },
    examples: {
      notAdultApproved: notAdultApprovedExamples,
      missingReviewPackEntries: missingReviewPackExamples,
      missingFields: missingFieldExamples,
    },
  };
}

export function renderSecureVocabularyReleaseGapMarkdown(summary) {
  const lines = [
    '# Spelling Secure Vocabulary Release Gap Summary',
    '',
    `Status: ${summary.status}`,
    `Release-readiness issue count: ${summary.releaseReadiness.issueCount}`,
    `Metadata issue count: ${summary.releaseReadiness.metadataIssueCount}`,
    '',
    '## Approval',
    '',
    `- Audited source decision: ${summary.approval.auditedSourceDecision}`,
    `- Review pack decision: ${summary.approval.reviewPackDecision}`,
    `- Audited source secure promotion allowed: ${summary.approval.auditedSourceSecurePromotionAllowed}`,
    `- Review pack secure promotion allowed: ${summary.approval.reviewPackSecurePromotionAllowed}`,
    `- Promotion approved: ${summary.approval.promotionApproved}`,
    '',
    '## Counts',
    '',
    `- Audited source words: ${summary.counts.auditedSourceWords}`,
    `- Review pack words: ${summary.counts.reviewPackWords}`,
    `- Secure-extension words: ${summary.counts.secureExtensionWords}`,
    `- Missing review-pack entries: ${summary.counts.missingReviewPackEntries}`,
    `- Adult-approved for secure import: ${summary.counts.adultApprovedForSecureImport}`,
    `- Not adult-approved for secure import: ${summary.counts.notAdultApprovedForSecureImport}`,
    `- Advisory words: ${summary.counts.advisoryWordCount}`,
    `- No-advisory words: ${summary.counts.noAdvisoryWordCount}`,
    '',
    '## Missing Release Fields',
    '',
    '| Field | Audited source missing | Review pack missing |',
    '|---|---:|---:|',
  ];

  for (const field of RELEASE_READY_REQUIRED_FIELDS) {
    lines.push(`| ${field} | ${summary.missingFields.auditedSource[field]} | ${summary.missingFields.reviewPack[field]} |`);
  }

  lines.push('');
  lines.push('## Review Status Distribution');
  lines.push('');
  lines.push('| Status | Count |');
  lines.push('|---|---:|');
  for (const [status, count] of Object.entries(summary.distributions.reviewStatus).sort()) {
    lines.push(`| ${status} | ${count} |`);
  }

  lines.push('');
  lines.push('## Advisory Distribution');
  lines.push('');
  const advisoryEntries = Object.entries(summary.distributions.advisories).sort();
  if (advisoryEntries.length === 0) {
    lines.push('No advisories recorded.');
  } else {
    lines.push('| Advisory | Count |');
    lines.push('|---|---:|');
    for (const [advisory, count] of advisoryEntries) {
      lines.push(`| ${advisory} | ${count} |`);
    }
  }

  lines.push('');
  lines.push('## First Not-Adult-Approved Examples');
  lines.push('');
  if (summary.examples.notAdultApproved.length === 0) {
    lines.push('None.');
  } else {
    lines.push('| Word | Source record |');
    lines.push('|---|---|');
    for (const example of summary.examples.notAdultApproved) {
      lines.push(`| ${example.word} | ${example.sourceRecordId} |`);
    }
  }

  lines.push('');
  lines.push('## Required Next Source Input');
  lines.push('');
  if (
    summary.approval.promotionApproved
    && summary.counts.notAdultApprovedForSecureImport === 0
    && totalMissingReleaseFields(summary) === 0
  ) {
    lines.push('No additional source-list, secure-import approval, or release-quality field input is required for the current approved artefacts. Live secure-extension promotion still requires runtime content import, release metadata, CI, deployment, and production hard-refresh evidence.');
  } else if (summary.approval.promotionApproved && summary.counts.notAdultApprovedForSecureImport === 0) {
    lines.push('The current artefact has `APPROVED_FOR_SECURE_EXTENSION_IMPORT` and adult-approved per-word secure import status. A live secure-extension import still requires all missing release fields above on both the audited source and review pack.');
  } else {
    lines.push('The current artefact is suitable for import/reviewer-pack generation only. A live secure-extension import requires `APPROVED_FOR_SECURE_EXTENSION_IMPORT`, adult-approved per-word secure import status, and all missing release fields above on both the audited source and review pack.');
  }
  lines.push('');

  return lines.join('\n');
}

function parseArgs(argv) {
  const options = {
    auditedSourcePath: null,
    reviewPackPath: null,
    outPath: null,
    mdOutPath: null,
    json: false,
    help: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--json') options.json = true;
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
    } else if (arg === '--md-out' && argv[index + 1]) {
      options.mdOutPath = argv[++index];
    } else if (arg.startsWith('--md-out=')) {
      options.mdOutPath = arg.slice('--md-out='.length);
    }
  }

  return options;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/summarise-spelling-secure-vocabulary-release-gaps.mjs --audited-source <source.json> --review-pack <review-pack.json> [--json] [--out <summary.json>] [--md-out <summary.md>]',
    '',
    'Summarises secure-extension release-readiness blockers into counts and examples without promoting any words.',
  ].join('\n');
}

function readJsonFile(filePath) {
  const resolved = resolve(filePath);
  if (!existsSync(resolved)) {
    throw new Error(`JSON file not found: ${filePath}`);
  }
  return JSON.parse(readFileSync(resolved, 'utf8'));
}

function writeFileEnsuringDirectory(filePath, payload) {
  const resolved = resolve(filePath);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, payload, 'utf8');
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

    const summary = summariseSecureVocabularyReleaseGaps({
      auditedSource: readJsonFile(options.auditedSourcePath),
      reviewPack: readJsonFile(options.reviewPackPath),
    });

    if (options.outPath) {
      writeFileEnsuringDirectory(options.outPath, `${JSON.stringify(summary, null, 2)}\n`);
    }
    if (options.mdOutPath) {
      writeFileEnsuringDirectory(options.mdOutPath, renderSecureVocabularyReleaseGapMarkdown(summary));
    }
    if (options.json || (!options.outPath && !options.mdOutPath)) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(`Secure vocabulary release gap summary ${summary.status}: ${summary.releaseReadiness.issueCount} issue(s)`);
    }
    process.exit(summary.ok ? 0 : 1);
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2));
    process.exit(1);
  }
}
