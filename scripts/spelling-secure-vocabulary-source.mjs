import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  secureVocabularySemanticMeaningOverrideFor,
  secureVocabularySentenceFor,
} from './spelling-secure-vocabulary-sentence-generator.mjs';

export const SOURCE_ARTIFACT_ID = 'ks2-spelling-secure-vocabulary-source-v1';
export const AUDITED_SOURCE_PROVENANCE = 'ks2-spelling-secure-vocabulary-source-v1';
export const REVIEW_PACK_KIND = 'ks2-spelling-secure-vocabulary-review-pack';
export const IMPORT_PLAN_KIND = 'ks2-spelling-secure-vocabulary-import-plan';
export const AUDITED_SOURCE_KIND = 'ks2-spelling-secure-vocabulary-audited-source';

export const DECISION_IMPORT_REVIEWER_PACK_ONLY = 'APPROVED_FOR_IMPORT_REVIEWER_PACK_ONLY';
export const DECISION_SECURE_EXTENSION_IMPORT = 'APPROVED_FOR_SECURE_EXTENSION_IMPORT';
export const DECISION_REJECTED_NEEDS_SOURCE_REVISION = 'REJECTED_NEEDS_SOURCE_REVISION';
export const DECISION_PENDING = 'PENDING';

const WORD_PATTERN = /^[a-z]+(-[a-z]+)*$/;
const REQUIRED_RECORD_FIELDS = Object.freeze([
  'recordId',
  'word',
  'normalisedWord',
  'coverageTier',
  'recommendedPool',
  'yearBand',
  'sourceBucket',
  'reviewStatus',
  'adultReviewRequiredBeforeNewSecurePromotion',
  'sourceNote',
]);

const VALID_COVERAGE_TIERS = new Set([
  'current_statutory_core',
  'current_extra',
  'secure_extension_candidate',
]);

const VALID_APPROVAL_DECISIONS = new Set([
  DECISION_IMPORT_REVIEWER_PACK_ONLY,
  DECISION_SECURE_EXTENSION_IMPORT,
  DECISION_REJECTED_NEEDS_SOURCE_REVISION,
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normaliseString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normaliseStringArray(value) {
  return Array.isArray(value)
    ? value.map((entry) => normaliseString(entry)).filter(Boolean)
    : [];
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function increment(map, key) {
  const safeKey = normaliseString(key) || 'missing';
  map[safeKey] = (map[safeKey] || 0) + 1;
}

function issue(severity, code, pathValue, message) {
  return { severity, code, path: pathValue, message };
}

function capitaliseWord(word) {
  return word ? `${word.slice(0, 1).toUpperCase()}${word.slice(1)}` : 'This word';
}

function generatedExampleSentenceFor(record, morphologyTags) {
  const word = normaliseString(record.word);
  const sourceBucket = normaliseString(record.sourceBucket).replace(/_/g, '-');
  return secureVocabularySentenceFor({
    slug: word,
    word,
    accepted: [word],
    coverageTier: 'secure-extension',
    listId: `secure-extension-${sourceBucket || 'school-academic-secure'}`,
    tags: [
      'secure-extension',
      sourceBucket || 'school-academic-secure',
      ...morphologyTags,
    ],
  }, 0);
}

function releaseQualityPolicyAllowsGeneratedFallback(approval) {
  const releaseQualityFields = isPlainObject(approval?.releaseQualityFields)
    ? approval.releaseQualityFields
    : {};
  const generatedFallbackPolicy = isPlainObject(releaseQualityFields.generatedFallbackPolicy)
    ? releaseQualityFields.generatedFallbackPolicy
    : {};

  return releaseQualityFields.ownerApprovedGeneratedFallback === true
    || generatedFallbackPolicy.ownerApproved === true;
}

function deriveMorphologyTags(record, word) {
  const suppliedTags = normaliseStringArray(record.morphologyTags);
  if (suppliedTags.length > 0) return suppliedTags;

  const sourcePatternTags = normaliseStringArray(record.patternTags);
  if (sourcePatternTags.length > 0) return sourcePatternTags;

  const tags = [];
  const suffixes = ['ation', 'tion', 'sion', 'ment', 'ness', 'able', 'ible', 'less', 'ful', 'ous', 'ity', 'ing', 'ed', 'ly'];
  const suffix = suffixes.find((entry) => word.endsWith(entry) && word.length > entry.length + 2);
  if (suffix) tags.push(`suffix-${suffix}`);
  if (word.includes('-')) tags.push('hyphenated-compound');
  if (/(.)\1/.test(word)) tags.push('double-letter');

  return tags.length > 0 ? tags : ['base-word'];
}

function deriveFamilyRoot(word, morphologyTags) {
  const suffixTag = morphologyTags.find((tag) => tag.startsWith('suffix-'));
  if (!suffixTag) return word;

  const suffix = suffixTag.slice('suffix-'.length);
  if (!suffix || !word.endsWith(suffix) || word.length <= suffix.length + 2) return word;

  const stem = word.slice(0, -suffix.length);
  if (suffix === 'ful' && !stem.endsWith('e')) return `${stem}e`;
  if (suffix === 'ity' && stem.endsWith('abil')) return `${stem.slice(0, -4)}able`;
  return stem || word;
}

function generatedReleaseReadinessFields(record) {
  const word = normaliseString(record.word);
  const morphologyTags = deriveMorphologyTags(record, word);
  const familyRoot = deriveFamilyRoot(word, morphologyTags);
  const displayWord = capitaliseWord(word);
  const advisories = normaliseStringArray(record.advisories);
  const advisoryNote = advisories.length > 0
    ? ` Advisory flags retained for adult review context: ${advisories.join(', ')}.`
    : '';
  const semanticMeaning = secureVocabularySemanticMeaningOverrideFor({ slug: word, word });

  return {
    acceptedSpellings: [word],
    rejectedVariants: [],
    explanation: semanticMeaning || `${displayWord} is an owner-approved generated KS2 secure-extension spelling-practice entry. Pupils should read it clearly, spell each letter in order, and keep the accepted UK form unchanged.`,
    exampleSentences: [generatedExampleSentenceFor(record, morphologyTags)],
    ukSpellingDecision: `UK spelling approved: ${word} is the accepted spelling for this secure-extension entry.`,
    familyRoot,
    morphologyTags,
    safetyNotes: `Owner-approved generated release-quality fields backed by James's 2026-05-17 approval. Suitable for KS2 spelling practice; no external source claim added.${advisoryNote}`,
    audioStatus: 'tts_required',
    ttsStatus: 'planned',
    generationSource: 'owner_approved_generated_release_quality_fallback',
    generationApprovalDate: '2026-05-17',
  };
}

function releaseReadinessFromSourceRecord(record, approval, secureImportApprovalApplied) {
  const generatedFallbackAllowed = secureImportApprovalApplied
    && releaseQualityPolicyAllowsGeneratedFallback(approval);
  const generatedFields = generatedFallbackAllowed
    ? generatedReleaseReadinessFields(record)
    : {};

  return {
    acceptedSpellings: normaliseStringArray(record.acceptedSpellings).length > 0
      ? normaliseStringArray(record.acceptedSpellings)
      : (generatedFields.acceptedSpellings || []),
    rejectedVariants: normaliseStringArray(record.rejectedVariants).length > 0
      ? normaliseStringArray(record.rejectedVariants)
      : (generatedFields.rejectedVariants || []),
    explanation: normaliseString(record.explanation) || generatedFields.explanation || '',
    exampleSentences: normaliseStringArray(record.exampleSentences).length > 0
      ? normaliseStringArray(record.exampleSentences)
      : (generatedFields.exampleSentences || []),
    ukSpellingDecision: normaliseString(record.ukSpellingDecision) || generatedFields.ukSpellingDecision || '',
    familyRoot: normaliseString(record.familyRoot) || generatedFields.familyRoot || '',
    morphologyTags: normaliseStringArray(record.morphologyTags).length > 0
      ? normaliseStringArray(record.morphologyTags)
      : (generatedFields.morphologyTags || []),
    safetyNotes: normaliseString(record.safetyNotes) || generatedFields.safetyNotes || '',
    audioStatus: normaliseString(record.audioStatus) || generatedFields.audioStatus || '',
    ttsStatus: normaliseString(record.ttsStatus) || generatedFields.ttsStatus || '',
    generationSource: generatedFields.generationSource || '',
    generationApprovalDate: generatedFields.generationApprovalDate || '',
  };
}

export function taxonomyTierForRecord(record) {
  switch (record.coverageTier) {
    case 'current_statutory_core':
      return 'statutory-core';
    case 'secure_extension_candidate':
      return 'secure-extension';
    case 'current_extra':
      return 'enrichment-extra';
    default:
      return 'unknown';
  }
}

export function readSourceJsonl(sourceJsonlPath) {
  const raw = readFileSync(sourceJsonlPath, 'utf8');
  const records = [];
  const lines = raw.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    try {
      records.push(JSON.parse(line));
    } catch (error) {
      const wrapped = new Error(`Invalid JSONL at line ${index + 1}: ${error.message}`);
      wrapped.cause = error;
      throw wrapped;
    }
  });
  return records;
}

export function loadSecureVocabularyInputs({ sourceJsonlPath, approvalPath }) {
  if (!sourceJsonlPath) throw new Error('Missing --source-jsonl path.');
  if (!approvalPath) throw new Error('Missing --approval path.');
  return {
    sourceJsonlPath,
    approvalPath,
    sourceJsonlSha256: sha256File(sourceJsonlPath),
    records: readSourceJsonl(sourceJsonlPath),
    approval: readJson(approvalPath),
  };
}

export function auditSecureVocabularySource({ sourceJsonlPath, approvalPath } = {}) {
  const loaded = loadSecureVocabularyInputs({ sourceJsonlPath, approvalPath });
  const issues = [];
  const seenNormalised = new Set();
  const coverageTierCounts = {};
  const taxonomyTierCounts = {};
  const recommendedPoolCounts = {};
  const reviewStatusCounts = {};
  const sourceBucketCounts = {};
  const yearBandCounts = {};
  const advisoryCounts = {};
  const patternTagCounts = {};
  const advisoryWords = [];

  const approval = isPlainObject(loaded.approval) ? loaded.approval : {};
  const approvalDecision = normaliseString(approval.decision);
  const approvalSourceHash = normaliseString(approval.sourceJsonlSha256);
  const reviewerName = normaliseString(approval.reviewerName);
  const reviewTimestamp = normaliseString(approval.reviewTimestamp);

  if (approvalDecision === DECISION_PENDING) {
    issues.push(issue('error', 'source_approval_pending', 'approval.decision', 'The source approval decision is still PENDING.'));
  } else if (!VALID_APPROVAL_DECISIONS.has(approvalDecision)) {
    issues.push(issue('error', 'invalid_source_approval_decision', 'approval.decision', `Unsupported approval decision "${approvalDecision || '(missing)'}".`));
  } else if (approvalDecision === DECISION_REJECTED_NEEDS_SOURCE_REVISION) {
    issues.push(issue('error', 'source_approval_rejected', 'approval.decision', 'The source list is rejected and must not be imported.'));
  }
  if (!reviewerName) {
    issues.push(issue('error', 'missing_source_reviewer', 'approval.reviewerName', 'Approved sources must identify the reviewer.'));
  }
  if (!reviewTimestamp) {
    issues.push(issue('error', 'missing_source_review_timestamp', 'approval.reviewTimestamp', 'Approved sources must include a review timestamp.'));
  }
  if (approvalSourceHash !== loaded.sourceJsonlSha256) {
    issues.push(issue('error', 'source_hash_mismatch', 'approval.sourceJsonlSha256', `Approval hash "${approvalSourceHash || '(missing)'}" does not match actual source hash "${loaded.sourceJsonlSha256}".`));
  }

  loaded.records.forEach((record, index) => {
    const basePath = `records[${index}]`;
    if (!isPlainObject(record)) {
      issues.push(issue('error', 'malformed_source_record', basePath, 'Each source record must be an object.'));
      return;
    }
    for (const field of REQUIRED_RECORD_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        issues.push(issue('error', 'missing_source_record_field', `${basePath}.${field}`, `Missing required field "${field}".`));
      }
    }

    const word = normaliseString(record.word);
    const normalisedWord = normaliseString(record.normalisedWord);
    const coverageTier = normaliseString(record.coverageTier);
    const taxonomyTier = taxonomyTierForRecord(record);

    increment(coverageTierCounts, coverageTier);
    increment(taxonomyTierCounts, taxonomyTier);
    increment(recommendedPoolCounts, record.recommendedPool);
    increment(reviewStatusCounts, record.reviewStatus);
    increment(sourceBucketCounts, record.sourceBucket);
    increment(yearBandCounts, record.yearBand);

    if (!WORD_PATTERN.test(word)) {
      issues.push(issue('error', 'invalid_source_word_token', `${basePath}.word`, `Invalid word token "${word}".`));
    }
    if (normalisedWord !== word) {
      issues.push(issue('error', 'normalised_word_mismatch', `${basePath}.normalisedWord`, `normalisedWord "${normalisedWord}" must match word "${word}".`));
    }
    if (seenNormalised.has(normalisedWord)) {
      issues.push(issue('error', 'duplicate_source_word', `${basePath}.normalisedWord`, `Duplicate normalised word "${normalisedWord}".`));
    }
    if (normalisedWord) seenNormalised.add(normalisedWord);
    if (!VALID_COVERAGE_TIERS.has(coverageTier)) {
      issues.push(issue('error', 'invalid_coverage_tier', `${basePath}.coverageTier`, `Unsupported coverage tier "${coverageTier}".`));
    }

    for (const advisory of Array.isArray(record.advisories) ? record.advisories : []) {
      increment(advisoryCounts, advisory);
    }
    for (const patternTag of Array.isArray(record.patternTags) ? record.patternTags : []) {
      increment(patternTagCounts, patternTag);
    }
    if (Array.isArray(record.advisories) && record.advisories.length > 0) {
      advisoryWords.push({
        recordId: normaliseString(record.recordId),
        word,
        coverageTier,
        advisories: record.advisories,
      });
    }
  });

  const errorCount = issues.filter((entry) => entry.severity === 'error').length;
  const securePromotionAllowed = approvalDecision === DECISION_SECURE_EXTENSION_IMPORT;
  const importReviewerPackAllowed = approvalDecision === DECISION_IMPORT_REVIEWER_PACK_ONLY || securePromotionAllowed;

  return {
    ok: errorCount === 0,
    status: errorCount === 0
      ? (securePromotionAllowed ? 'SOURCE APPROVED - SECURE EXTENSION IMPORT ALLOWED' : 'SOURCE APPROVED - IMPORT/REVIEWER PACK REQUIRED')
      : 'SOURCE NOT READY',
    issueCount: issues.length,
    errorCount,
    issues,
    source: {
      artifactId: SOURCE_ARTIFACT_ID,
      sourceJsonlPath: path.normalize(sourceJsonlPath),
      sourceJsonlSha256: loaded.sourceJsonlSha256,
      recordCount: loaded.records.length,
      uniqueWordCount: seenNormalised.size,
    },
    approval: {
      decision: approvalDecision,
      reviewerName,
      reviewerRole: normaliseString(approval.reviewerRole),
      reviewTimestamp,
      sourceJsonlSha256: approvalSourceHash,
      importReviewerPackAllowed,
      securePromotionAllowed,
    },
    counts: {
      coverageTier: coverageTierCounts,
      taxonomyTier: taxonomyTierCounts,
      recommendedPool: recommendedPoolCounts,
      reviewStatus: reviewStatusCounts,
      sourceBucket: sourceBucketCounts,
      yearBand: yearBandCounts,
      advisories: advisoryCounts,
      patternTags: patternTagCounts,
      advisoryWordCount: advisoryWords.length,
    },
    advisoryWords,
  };
}

function auditedWordFromSourceRecord(record, approval, sourceJsonlSha256, index) {
  const taxonomyTier = taxonomyTierForRecord(record);
  const decision = normaliseString(approval.decision);
  const reviewer = normaliseString(approval.reviewerName);
  const reviewedAt = normaliseString(approval.reviewTimestamp);
  const secureImportApprovalApplied = decision === DECISION_SECURE_EXTENSION_IMPORT
    && taxonomyTier === 'secure-extension';
  const sourceReviewStatusBeforeSecureImportApproval = normaliseString(record.reviewStatus);
  const sourceReviewStatus = secureImportApprovalApplied
    ? 'adult_approved_for_secure_extension_import'
    : sourceReviewStatusBeforeSecureImportApproval;
  const safetyStatus = secureImportApprovalApplied
    ? 'approved_for_secure_extension_import'
    : 'approved_for_import_reviewer_pack_only';

  return {
    id: normaliseString(record.recordId) || `source-${index + 1}`,
    slug: normaliseString(record.normalisedWord) || normaliseString(record.word),
    word: normaliseString(record.word),
    sourceRecordId: normaliseString(record.recordId),
    coverageTier: normaliseString(record.coverageTier),
    taxonomyTier,
    recommendedPool: normaliseString(record.recommendedPool),
    yearBand: normaliseString(record.yearBand),
    sourceBucket: normaliseString(record.sourceBucket),
    patternTags: normaliseStringArray(record.patternTags),
    advisories: normaliseStringArray(record.advisories),
    sourceReviewStatus,
    sourceReviewStatusBeforeSecureImportApproval,
    secureImportApprovalApplied,
    review: {
      status: 'approved',
      decision,
      reviewer,
      reviewedAt,
      sourceJsonlSha256,
    },
    provenance: {
      source: AUDITED_SOURCE_PROVENANCE,
      artifactId: SOURCE_ARTIFACT_ID,
      sourceRecordId: normaliseString(record.recordId),
      sourceBucket: normaliseString(record.sourceBucket),
      sourceJsonlSha256,
      sourceNote: normaliseString(record.sourceNote),
    },
    safety: {
      status: safetyStatus,
      advisories: normaliseStringArray(record.advisories),
      securePromotionAllowed: decision === DECISION_SECURE_EXTENSION_IMPORT,
    },
    releaseReadiness: {
      ...releaseReadinessFromSourceRecord(record, approval, secureImportApprovalApplied),
    },
  };
}

export function buildSecureVocabularyArtifacts({ sourceJsonlPath, approvalPath, generatedAt = new Date().toISOString() } = {}) {
  const loaded = loadSecureVocabularyInputs({ sourceJsonlPath, approvalPath });
  const audit = auditSecureVocabularySource({ sourceJsonlPath, approvalPath });
  if (!audit.ok) {
    const error = new Error(`Secure vocabulary source is not ready: ${audit.errorCount} error(s).`);
    error.audit = audit;
    throw error;
  }

  const auditedWords = loaded.records.map((record, index) =>
    auditedWordFromSourceRecord(record, loaded.approval, loaded.sourceJsonlSha256, index)
  );

  const sourceSummary = {
    artifactId: SOURCE_ARTIFACT_ID,
    sourceJsonlSha256: loaded.sourceJsonlSha256,
    recordCount: auditedWords.length,
    uniqueWordCount: audit.source.uniqueWordCount,
    approvalDecision: audit.approval.decision,
    reviewerName: audit.approval.reviewerName,
    reviewerRole: audit.approval.reviewerRole,
    reviewTimestamp: audit.approval.reviewTimestamp,
    importReviewerPackAllowed: audit.approval.importReviewerPackAllowed,
    securePromotionAllowed: audit.approval.securePromotionAllowed,
    counts: audit.counts,
  };

  const auditedSource = {
    kind: AUDITED_SOURCE_KIND,
    version: 1,
    generatedAt,
    source: sourceSummary,
    words: auditedWords,
  };

  const reviewPackWords = auditedWords.map((word) => ({
    slug: word.slug,
    word: word.word,
    sourceRecordId: word.sourceRecordId,
    coverageTier: word.coverageTier,
    taxonomyTier: word.taxonomyTier,
    recommendedPool: word.recommendedPool,
    yearBand: word.yearBand,
    sourceBucket: word.sourceBucket,
    patternTags: word.patternTags,
    advisories: word.advisories,
    sourceReviewStatus: word.sourceReviewStatus,
    sourceReviewStatusBeforeSecureImportApproval: word.sourceReviewStatusBeforeSecureImportApproval,
    secureImportApprovalApplied: word.secureImportApprovalApplied,
    reviewStatus: word.review.status,
    reviewer: word.review.reviewer,
    reviewedAt: word.review.reviewedAt,
    provenanceSource: word.provenance.source,
    safetyStatus: word.safety.status,
    releaseReadiness: word.releaseReadiness,
  }));

  const reviewPack = {
    kind: REVIEW_PACK_KIND,
    version: 1,
    generatedAt,
    source: sourceSummary,
    words: reviewPackWords,
  };

  const importPlan = {
    kind: IMPORT_PLAN_KIND,
    version: 1,
    generatedAt,
    mode: 'check',
    writes: false,
    status: audit.approval.securePromotionAllowed
      ? 'approved_for_secure_extension_import_not_applied'
      : 'approved_for_import_reviewer_pack_only_not_applied',
    source: sourceSummary,
    taxonomy: {
      current_statutory_core: 'statutory-core',
      secure_extension_candidate: 'secure-extension',
      current_extra: 'enrichment-extra',
    },
    records: auditedWords.map((word) => ({
      sourceRecordId: word.sourceRecordId,
      word: word.word,
      slug: word.slug,
      coverageTier: word.coverageTier,
      taxonomyTier: word.taxonomyTier,
      recommendedPool: word.recommendedPool,
      importAction: word.coverageTier === 'secure_extension_candidate'
        ? 'plan_secure_extension_candidate'
        : 'preserve_current_snapshot_record',
      reviewStatus: word.review.status,
      sourceReviewStatus: word.sourceReviewStatus,
      sourceReviewStatusBeforeSecureImportApproval: word.sourceReviewStatusBeforeSecureImportApproval,
      secureImportApprovalApplied: word.secureImportApprovalApplied,
      reviewer: word.review.reviewer,
      reviewedAt: word.review.reviewedAt,
      sourceJsonlSha256: word.review.sourceJsonlSha256,
      safetyStatus: word.safety.status,
      advisories: word.advisories,
    })),
  };

  return {
    audit,
    auditedSource,
    reviewPack,
    importPlan,
  };
}

export function renderSecureVocabularyReviewPackMarkdown(reviewPack) {
  const source = reviewPack.source || {};
  const counts = source.counts || {};
  const taxonomyCounts = counts.taxonomyTier || {};
  const advisoryWords = reviewPack.words.filter((word) => Array.isArray(word.advisories) && word.advisories.length > 0);
  const lines = [
    '# Spelling Secure Vocabulary Review Pack',
    '',
    `Generated at: ${reviewPack.generatedAt}`,
    `Source JSONL SHA-256: ${source.sourceJsonlSha256}`,
    `Approval decision: ${source.approvalDecision}`,
    `Reviewer: ${source.reviewerName}`,
    `Review timestamp: ${source.reviewTimestamp}`,
    '',
    '## Counts',
    '',
    `- Total records: ${source.recordCount}`,
    `- Unique words: ${source.uniqueWordCount}`,
    `- Statutory-core records: ${taxonomyCounts['statutory-core'] || 0}`,
    `- Secure-extension records: ${taxonomyCounts['secure-extension'] || 0}`,
    `- Enrichment-extra records: ${taxonomyCounts['enrichment-extra'] || 0}`,
    `- Advisory words: ${advisoryWords.length}`,
    '',
    '## Scope',
    '',
    source.securePromotionAllowed
      ? 'The source is approved for secure-extension import, but production still requires release, CI, deployment, and live verification evidence.'
      : 'The source is approved for import/reviewer-pack generation only. It is not approved for live secure-extension promotion.',
    '',
    '## Advisory Words',
    '',
  ];

  if (advisoryWords.length === 0) {
    lines.push('None.');
  } else {
    lines.push('| Word | Source record | Taxonomy tier | Advisories |');
    lines.push('|---|---|---|---|');
    for (const word of advisoryWords) {
      lines.push(`| ${word.word} | ${word.sourceRecordId} | ${word.taxonomyTier} | ${word.advisories.join(', ')} |`);
    }
  }

  lines.push('');
  lines.push('## First 20 Secure-extension Records');
  lines.push('');
  lines.push('| Word | Source record | Year band | Source bucket |');
  lines.push('|---|---|---|---|');
  for (const word of reviewPack.words.filter((entry) => entry.taxonomyTier === 'secure-extension').slice(0, 20)) {
    lines.push(`| ${word.word} | ${word.sourceRecordId} | ${word.yearBand} | ${word.sourceBucket} |`);
  }
  lines.push('');

  return lines.join('\n');
}

export function writeJson(filePath, payload) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export function writeText(filePath, payload) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, payload, 'utf8');
}
