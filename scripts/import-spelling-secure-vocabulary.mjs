#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path, { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUDITED_SOURCE_PROVENANCE,
  DECISION_SECURE_EXTENSION_IMPORT,
  SOURCE_ARTIFACT_ID,
  buildSecureVocabularyArtifacts,
  writeJson,
} from './spelling-secure-vocabulary-source.mjs';
import {
  buildSpellingContentSummary,
  normaliseSpellingContentBundle,
  publishSpellingContentBundle,
  validateSpellingContentBundle,
} from '../src/subjects/spelling/content/model.js';
import { SPELLING_COVERAGE_TIER } from '../src/subjects/spelling/content/taxonomy.js';

export const DEFAULT_AUDITED_SOURCE_PATH =
  'docs/plans/james/hotfixes/21. spelling-package/validation/secure-vocabulary-approved-source/audited-source.json';
export const DEFAULT_CONTENT_PATH = 'content/spelling.seed.json';
export const DEFAULT_RUNTIME_IMPORT_MANIFEST_PATH =
  'docs/plans/james/hotfixes/21. spelling-package/validation/secure-vocabulary-approved-source/runtime-import-manifest.json';
export const SECURE_VOCABULARY_RELEASE_TITLE = 'Secure vocabulary expansion r6';
export const SECURE_VOCABULARY_RELEASE_NOTES =
  'Publishes owner-approved secure-extension vocabulary from ks2-spelling-secure-vocabulary-source-v1 without changing statutory-core semantics.';
export const SECURE_VOCABULARY_DEFAULT_PUBLISHED_AT = '2026-05-17T16:30:00.000Z';

const SECURE_EXTENSION_READY_STATUS = 'adult_approved_for_secure_extension_import';
const SECURE_IMPORT_TAG = 'secure-extension';
const RECLASSIFIED_FROM_SECURE_EXTENSION_TAG = 'reclassified-from-secure-extension';

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

function normaliseSlug(value) {
  return normaliseString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeContentBundle(filePath, bundle) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
}

function timestampFromIso(value, fallbackIso = SECURE_VOCABULARY_DEFAULT_PUBLISHED_AT) {
  const parsed = Date.parse(normaliseString(value));
  if (Number.isFinite(parsed)) return parsed;
  return Date.parse(fallbackIso);
}

function sourceCounts(auditedSource) {
  return auditedSource?.source?.counts?.taxonomyTier || {};
}

function countBy(values, selector) {
  const counts = {};
  for (const value of Array.isArray(values) ? values : []) {
    const key = normaliseString(selector(value));
    if (!key) continue;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function runtimeImportSourceSummary(auditedSource, secureWords, skippedExistingExtraWords = []) {
  const source = isPlainObject(auditedSource?.source) ? auditedSource.source : {};
  const sourceCountsSummary = isPlainObject(source.counts) ? source.counts : {};
  const words = Array.isArray(auditedSource?.words) ? auditedSource.words : [];
  const secureTierWords = words.filter((word) => word?.taxonomyTier === SPELLING_COVERAGE_TIER.SECURE_EXTENSION);
  const unapprovedSecureCount = secureTierWords.filter((word) => !sourceWordIsApprovedSecureExtension(word)).length;
  const skippedExistingExtraSlugs = skippedExistingExtraWords.map((word) => normaliseSlug(word.slug || word.word));
  return {
    ...source,
    counts: {
      ...sourceCountsSummary,
      reviewStatus: countBy(words, (word) => word?.sourceReviewStatus),
      secureImportApproval: {
        approvedSecureExtensionWords: secureWords.length,
        importableSecureExtensionWords: secureWords.length - skippedExistingExtraWords.length,
        skippedExistingExtraWords: skippedExistingExtraWords.length,
        skippedExistingExtraWordSlugs: skippedExistingExtraSlugs,
        unapprovedSecureExtensionWords: unapprovedSecureCount,
        approvalAppliedWords: secureTierWords.filter((word) => word?.secureImportApprovalApplied === true).length,
        approvalDecision: source.approvalDecision || DECISION_SECURE_EXTENSION_IMPORT,
      },
    },
  };
}

function sourceWordIsApprovedSecureExtension(word) {
  return word?.taxonomyTier === SPELLING_COVERAGE_TIER.SECURE_EXTENSION
    && word?.secureImportApprovalApplied === true
    && word?.sourceReviewStatus === SECURE_EXTENSION_READY_STATUS
    && word?.review?.status === 'approved'
    && word?.review?.decision === DECISION_SECURE_EXTENSION_IMPORT
    && word?.safety?.securePromotionAllowed === true;
}

function approvedSecureExtensionWords(auditedSource) {
  const words = Array.isArray(auditedSource?.words) ? auditedSource.words : [];
  return words.filter(sourceWordIsApprovedSecureExtension);
}

function releaseReadinessFor(word) {
  return isPlainObject(word?.releaseReadiness) ? word.releaseReadiness : {};
}

function hasReleaseReadyFields(word) {
  const readiness = releaseReadinessFor(word);
  return normaliseStringArray(readiness.acceptedSpellings).length > 0
    && normaliseString(readiness.explanation)
    && normaliseStringArray(readiness.exampleSentences).length > 0
    && normaliseString(readiness.ukSpellingDecision)
    && normaliseString(readiness.familyRoot)
    && (
      normaliseStringArray(readiness.morphologyTags).length > 0
      || normaliseStringArray(word?.patternTags).length > 0
    )
    && (normaliseString(readiness.audioStatus) || normaliseString(readiness.ttsStatus));
}

function uniqueStrings(values, { lowerCase = true } = {}) {
  const seen = new Set();
  const output = [];
  for (const value of Array.isArray(values) ? values : []) {
    const trimmed = normaliseString(value);
    if (!trimmed) continue;
    const candidate = lowerCase ? trimmed.toLowerCase() : trimmed;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    output.push(candidate);
  }
  return output;
}

function titleCase(value) {
  return normaliseString(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function yearGroupsForSourceWord(word) {
  const yearBand = normaliseString(word?.yearBand).toLowerCase();
  if (yearBand.includes('5-6') || yearBand.includes('y5-y6')) return ['Y5', 'Y6'];
  if (yearBand.includes('3-4') || yearBand.includes('y3-y4')) return ['Y3', 'Y4'];
  return ['Y3', 'Y4', 'Y5', 'Y6'];
}

function yearGroupKey(yearGroups) {
  return yearGroups.join('-').toLowerCase();
}

function sourceBucketKey(word) {
  return normaliseSlug(word?.sourceBucket || 'secure-vocabulary');
}

function listKeyForSourceWord(word) {
  return `${sourceBucketKey(word)}__${yearGroupKey(yearGroupsForSourceWord(word))}`;
}

function sourceNoteFor(word) {
  const recordId = normaliseString(word?.sourceRecordId);
  const bucket = normaliseString(word?.sourceBucket);
  const reviewedAt = normaliseString(word?.review?.reviewedAt);
  const reviewer = normaliseString(word?.review?.reviewer);
  const sha = normaliseString(word?.review?.sourceJsonlSha256);
  return [
    `Secure vocabulary source ${SOURCE_ARTIFACT_ID}`,
    recordId ? `record ${recordId}` : '',
    bucket ? `bucket ${bucket}` : '',
    reviewer || reviewedAt ? `approved by ${reviewer || 'owner'}${reviewedAt ? ` on ${reviewedAt}` : ''}` : '',
    sha ? `source SHA-256 ${sha}` : '',
  ].filter(Boolean).join('; ');
}

function provenanceFor(word, publishedAt) {
  return {
    source: AUDITED_SOURCE_PROVENANCE,
    note: sourceNoteFor(word),
    importedAt: publishedAt,
  };
}

function tagsFor(word) {
  return uniqueStrings([
    SECURE_IMPORT_TAG,
    sourceBucketKey(word),
    normaliseString(word?.sourceReviewStatus),
    ...normaliseStringArray(word?.patternTags),
    ...normaliseStringArray(releaseReadinessFor(word).morphologyTags),
    ...normaliseStringArray(word?.advisories),
  ]);
}

function acceptedSpellingsFor(word) {
  const readiness = releaseReadinessFor(word);
  return uniqueStrings([
    word?.word,
    word?.slug,
    ...normaliseStringArray(readiness.acceptedSpellings),
  ]);
}

function buildSecureVocabularyEntries({ secureWords, existingBundle, publishedAt }) {
  const maxListSort = existingBundle.draft.wordLists.reduce((max, list) => Math.max(max, Number(list.sortIndex) || 0), 0);
  const maxWordSort = existingBundle.draft.words.reduce((max, word) => Math.max(max, Number(word.sortIndex) || 0), 0);
  const maxSentenceSort = existingBundle.draft.sentences.reduce((max, sentence) => Math.max(max, Number(sentence.sortIndex) || 0), 0);
  const listGroups = new Map();
  const wordEntries = [];
  const sentenceEntries = [];

  secureWords.forEach((sourceWord, index) => {
    const slug = normaliseSlug(sourceWord.slug || sourceWord.word);
    const wordText = normaliseString(sourceWord.word).toLowerCase();
    const readiness = releaseReadinessFor(sourceWord);
    const listKey = listKeyForSourceWord(sourceWord);
    const listId = `secure-extension-${listKey.replace(/__/g, '-')}`;
    const yearGroups = yearGroupsForSourceWord(sourceWord);
    const sourceNote = sourceNoteFor(sourceWord);
    const provenance = provenanceFor(sourceWord, publishedAt);
    const sentenceId = `secure-vocabulary-${slug}__01`;

    if (!listGroups.has(listKey)) {
      listGroups.set(listKey, {
        id: listId,
        title: `Secure vocabulary - ${titleCase(sourceWord.sourceBucket || 'secure vocabulary')}`,
        spellingPool: 'core',
        coverageTier: SPELLING_COVERAGE_TIER.SECURE_EXTENSION,
        yearGroups,
        tags: uniqueStrings([SECURE_IMPORT_TAG, sourceBucketKey(sourceWord)]),
        wordSlugs: [],
        sourceNote: `${SOURCE_ARTIFACT_ID}; source bucket ${normaliseString(sourceWord.sourceBucket) || 'secure vocabulary'}`,
        provenance,
        sortIndex: maxListSort + listGroups.size + 1,
      });
    }

    const list = listGroups.get(listKey);
    list.wordSlugs.push(slug);

    wordEntries.push({
      slug,
      word: wordText,
      family: normaliseString(readiness.familyRoot) || titleCase(sourceWord.sourceBucket || 'secure vocabulary'),
      listId: list.id,
      spellingPool: 'core',
      coverageTier: SPELLING_COVERAGE_TIER.SECURE_EXTENSION,
      yearGroups,
      tags: tagsFor(sourceWord),
      patternIds: normaliseStringArray(sourceWord.patternTags),
      accepted: acceptedSpellingsFor(sourceWord),
      explanation: normaliseString(readiness.explanation),
      sentenceEntryIds: [sentenceId],
      sourceNote,
      provenance,
      sortIndex: maxWordSort + index + 1,
    });

    sentenceEntries.push({
      id: sentenceId,
      wordSlug: slug,
      text: normaliseStringArray(readiness.exampleSentences)[0],
      variantLabel: 'secure-extension',
      tags: uniqueStrings([SECURE_IMPORT_TAG, sourceBucketKey(sourceWord)]),
      sourceNote,
      provenance,
      sortIndex: maxSentenceSort + index + 1,
    });
  });

  return {
    wordLists: [...listGroups.values()],
    words: wordEntries,
    sentences: sentenceEntries,
  };
}

function isSecureVocabularyImportedEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const source = normaliseString(entry?.provenance?.source);
  const note = normaliseString(entry?.provenance?.note);
  const sourceNote = normaliseString(entry?.sourceNote);
  return source === AUDITED_SOURCE_PROVENANCE
    || note.includes(SOURCE_ARTIFACT_ID)
    || sourceNote.includes(SOURCE_ARTIFACT_ID);
}

function isSecureVocabularyImportedRelease(release) {
  if (!release || typeof release !== 'object') return false;
  return isSecureVocabularyImportedEntry(release)
    || normaliseString(release.title) === SECURE_VOCABULARY_RELEASE_TITLE
    || normaliseString(release.notes).includes(SOURCE_ARTIFACT_ID);
}

function isExistingSecureVocabularyReclassifiedExtra(entry, sourceWord) {
  if (!entry || typeof entry !== 'object') return false;
  const sourceRecordId = normaliseString(sourceWord?.sourceRecordId);
  const provenanceNote = normaliseString(entry?.provenance?.note);
  const sourceNote = normaliseString(entry?.sourceNote);
  const sourceText = `${normaliseString(entry?.provenance?.source)} ${provenanceNote} ${sourceNote}`;
  return entry.spellingPool === 'extra'
    && entry.coverageTier === SPELLING_COVERAGE_TIER.ENRICHMENT_EXTRA
    && normaliseStringArray(entry.tags).includes(RECLASSIFIED_FROM_SECURE_EXTENSION_TAG)
    && sourceText.includes(SOURCE_ARTIFACT_ID)
    && (!sourceRecordId || sourceText.includes(sourceRecordId));
}

function stripPriorSecureVocabularyImport(rawBundle) {
  const bundle = normaliseSpellingContentBundle(rawBundle);
  const importedSlugs = new Set(
    bundle.draft.words
      .filter((word) => word.coverageTier === SPELLING_COVERAGE_TIER.SECURE_EXTENSION && isSecureVocabularyImportedEntry(word))
      .map((word) => word.slug)
  );
  const importedSentenceIds = new Set(
    bundle.draft.sentences
      .filter((sentence) => importedSlugs.has(sentence.wordSlug) || isSecureVocabularyImportedEntry(sentence))
      .map((sentence) => sentence.id)
  );
  const releases = bundle.releases.filter((release) => !isSecureVocabularyImportedRelease(release));
  const latestRelease = [...releases].sort((a, b) => b.version - a.version || b.publishedAt - a.publishedAt)[0] || null;

  return normaliseSpellingContentBundle({
    ...bundle,
    draft: {
      ...bundle.draft,
      wordLists: bundle.draft.wordLists
        .filter((list) => !isSecureVocabularyImportedEntry(list))
        .map((list) => ({
          ...list,
          wordSlugs: list.wordSlugs.filter((slug) => !importedSlugs.has(slug)),
        })),
      words: bundle.draft.words.filter((word) => !importedSlugs.has(word.slug)),
      sentences: bundle.draft.sentences.filter((sentence) => !importedSentenceIds.has(sentence.id)),
    },
    releases,
    publication: latestRelease
      ? {
          currentReleaseId: latestRelease.id,
          publishedVersion: latestRelease.version,
          updatedAt: latestRelease.publishedAt,
        }
      : {
          currentReleaseId: '',
          publishedVersion: 0,
          updatedAt: 0,
        },
  });
}

function assertAuditedSourceReady(auditedSource) {
  const issues = [];
  const source = auditedSource?.source || {};
  const secureWords = approvedSecureExtensionWords(auditedSource);
  const expectedSecureCount = Number(sourceCounts(auditedSource)['secure-extension']) || 0;

  if (source.approvalDecision !== DECISION_SECURE_EXTENSION_IMPORT || source.securePromotionAllowed !== true) {
    issues.push({
      code: 'secure_vocabulary_import_not_approved',
      path: 'source.approvalDecision',
      message: 'Runtime import requires APPROVED_FOR_SECURE_EXTENSION_IMPORT.',
    });
  }

  if (expectedSecureCount !== secureWords.length) {
    issues.push({
      code: 'secure_vocabulary_approved_word_count_mismatch',
      path: 'words',
      expected: expectedSecureCount,
      actual: secureWords.length,
    });
  }

  auditedSource.words?.forEach((word, index) => {
    if (word?.taxonomyTier !== SPELLING_COVERAGE_TIER.SECURE_EXTENSION) return;
    const slug = normaliseSlug(word.slug || word.word);
    if (!sourceWordIsApprovedSecureExtension(word)) {
      issues.push({
        code: 'secure_vocabulary_word_not_approved',
        path: `words[${index}]`,
        word: slug,
      });
    }
    if (!hasReleaseReadyFields(word)) {
      issues.push({
        code: 'secure_vocabulary_word_missing_release_quality_fields',
        path: `words[${index}].releaseReadiness`,
        word: slug,
      });
    }
  });

  const seen = new Set();
  secureWords.forEach((word, index) => {
    const slug = normaliseSlug(word.slug || word.word);
    if (seen.has(slug)) {
      issues.push({
        code: 'secure_vocabulary_duplicate_slug',
        path: `approvedSecureWords[${index}].slug`,
        word: slug,
      });
    }
    seen.add(slug);
  });

  if (issues.length > 0) {
    const error = new Error(`Audited secure vocabulary source is not ready for runtime import: ${issues.length} issue(s).`);
    error.issues = issues;
    throw error;
  }

  return secureWords;
}

function releaseWithSecureProvenance(bundle, publishedAt) {
  const releases = bundle.releases.map((release, index) => {
    if (index !== bundle.releases.length - 1) return release;
    return {
      ...release,
      sourceNote: `${SOURCE_ARTIFACT_ID} runtime secure-extension import.`,
      provenance: {
        source: AUDITED_SOURCE_PROVENANCE,
        note: `Owner-approved secure-extension import applied on ${new Date(publishedAt).toISOString()}.`,
        importedAt: publishedAt,
      },
    };
  });
  return normaliseSpellingContentBundle({
    ...bundle,
    releases,
  });
}

export function buildSecureVocabularyRuntimeImport({
  auditedSource,
  contentBundle,
  publishedAt = timestampFromIso(SECURE_VOCABULARY_DEFAULT_PUBLISHED_AT),
} = {}) {
  const secureWords = assertAuditedSourceReady(auditedSource);
  const stripped = stripPriorSecureVocabularyImport(contentBundle);
  const existingWordsBySlug = new Map(stripped.draft.words.map((word) => [word.slug, word]));
  const importableSecureWords = [];
  const skippedExistingExtraWords = [];
  const collisionSlugs = [];
  for (const word of secureWords) {
    const slug = normaliseSlug(word.slug || word.word);
    const existingWord = existingWordsBySlug.get(slug);
    if (!existingWord) {
      importableSecureWords.push(word);
    } else if (isExistingSecureVocabularyReclassifiedExtra(existingWord, word)) {
      skippedExistingExtraWords.push(word);
    } else {
      collisionSlugs.push(slug);
    }
  }
  if (collisionSlugs.length > 0) {
    const error = new Error(`Secure vocabulary import collides with existing runtime word(s): ${collisionSlugs.slice(0, 10).join(', ')}`);
    error.issues = collisionSlugs.map((slug) => ({
      code: 'secure_vocabulary_runtime_slug_collision',
      path: 'content.draft.words',
      word: slug,
    }));
    throw error;
  }

  const entries = buildSecureVocabularyEntries({ secureWords: importableSecureWords, existingBundle: stripped, publishedAt });
  const draft = {
    ...stripped.draft,
    version: Number(stripped.draft.version || 0) + 1,
    notes: `${normaliseString(stripped.draft.notes) || 'Seeded spelling draft'} Secure-extension vocabulary imported from ${SOURCE_ARTIFACT_ID}.`,
    updatedAt: publishedAt,
    wordLists: [...stripped.draft.wordLists, ...entries.wordLists],
    words: [...stripped.draft.words, ...entries.words],
    sentences: [...stripped.draft.sentences, ...entries.sentences],
  };

  const validation = validateSpellingContentBundle({
    ...stripped,
    draft,
  });
  if (!validation.ok) {
    const error = new Error(`Secure vocabulary import produced invalid spelling content: ${validation.errors.length} error(s).`);
    error.validation = validation;
    throw error;
  }

  const published = releaseWithSecureProvenance(publishSpellingContentBundle(validation.bundle, {
    title: SECURE_VOCABULARY_RELEASE_TITLE,
    notes: SECURE_VOCABULARY_RELEASE_NOTES,
    publishedAt,
  }), publishedAt);

  const summary = buildSpellingContentSummary(published);
  const release = published.releases.at(-1);
  const sourceSummary = runtimeImportSourceSummary(auditedSource, secureWords, skippedExistingExtraWords);
  const skippedExistingExtraWordSlugs = skippedExistingExtraWords.map((word) => normaliseSlug(word.slug || word.word));
  const manifest = {
    kind: 'ks2-spelling-secure-vocabulary-runtime-import-manifest',
    version: 1,
    generatedAt: new Date(publishedAt).toISOString(),
    source: sourceSummary,
    release: {
      id: release.id,
      version: release.version,
      title: release.title,
      publishedAt: release.publishedAt,
      provenance: release.provenance,
    },
    imported: {
      secureExtensionWordCount: importableSecureWords.length,
      secureExtensionSentenceCount: entries.sentences.length,
      secureExtensionWordListCount: entries.wordLists.length,
      wordSlugs: importableSecureWords.map((word) => normaliseSlug(word.slug || word.word)),
      skippedExistingExtraWordCount: skippedExistingExtraWords.length,
      skippedExistingExtraWordSlugs,
    },
    summary,
    mappings: importableSecureWords.map((word) => ({
      sourceRecordId: word.sourceRecordId,
      slug: normaliseSlug(word.slug || word.word),
      word: normaliseString(word.word).toLowerCase(),
      sourceBucket: word.sourceBucket,
      yearGroups: yearGroupsForSourceWord(word),
      listId: `secure-extension-${listKeyForSourceWord(word).replace(/__/g, '-')}`,
      sentenceEntryId: `secure-vocabulary-${normaliseSlug(word.slug || word.word)}__01`,
      reviewer: word.review?.reviewer || '',
      reviewedAt: word.review?.reviewedAt || '',
      sourceJsonlSha256: word.review?.sourceJsonlSha256 || '',
    })),
    skippedExistingExtraMappings: skippedExistingExtraWords.map((word) => ({
      sourceRecordId: word.sourceRecordId,
      slug: normaliseSlug(word.slug || word.word),
      word: normaliseString(word.word).toLowerCase(),
      reason: RECLASSIFIED_FROM_SECURE_EXTENSION_TAG,
    })),
  };

  return {
    bundle: published,
    manifest,
    plan: {
      kind: 'ks2-spelling-secure-vocabulary-runtime-import-plan',
      version: 1,
      generatedAt: new Date(publishedAt).toISOString(),
      mode: 'check',
      writes: false,
      expectedWritesOnApply: true,
      status: 'approved_for_secure_extension_runtime_import',
      source: sourceSummary,
      release: manifest.release,
      imported: manifest.imported,
      summary,
    },
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    sourceJsonlPath: null,
    approvalPath: null,
    auditedSourcePath: null,
    contentPath: DEFAULT_CONTENT_PATH,
    manifestPath: DEFAULT_RUNTIME_IMPORT_MANIFEST_PATH,
    outPath: null,
    publishedAtIso: SECURE_VOCABULARY_DEFAULT_PUBLISHED_AT,
    apply: false,
    check: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--check') options.check = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--source-jsonl' && argv[index + 1]) options.sourceJsonlPath = argv[++index];
    else if (arg.startsWith('--source-jsonl=')) options.sourceJsonlPath = arg.slice('--source-jsonl='.length);
    else if (arg === '--approval' && argv[index + 1]) options.approvalPath = argv[++index];
    else if (arg.startsWith('--approval=')) options.approvalPath = arg.slice('--approval='.length);
    else if ((arg === '--audited-source' || arg === '--source') && argv[index + 1]) options.auditedSourcePath = argv[++index];
    else if (arg.startsWith('--audited-source=')) options.auditedSourcePath = arg.slice('--audited-source='.length);
    else if (arg.startsWith('--source=')) options.auditedSourcePath = arg.slice('--source='.length);
    else if (arg === '--content' && argv[index + 1]) options.contentPath = argv[++index];
    else if (arg.startsWith('--content=')) options.contentPath = arg.slice('--content='.length);
    else if (arg === '--manifest' && argv[index + 1]) options.manifestPath = argv[++index];
    else if (arg.startsWith('--manifest=')) options.manifestPath = arg.slice('--manifest='.length);
    else if (arg === '--published-at' && argv[index + 1]) options.publishedAtIso = argv[++index];
    else if (arg.startsWith('--published-at=')) options.publishedAtIso = arg.slice('--published-at='.length);
    else if (arg === '--out' && argv[index + 1]) options.outPath = argv[++index];
    else if (arg.startsWith('--out=')) options.outPath = arg.slice('--out='.length);
  }

  return options;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/import-spelling-secure-vocabulary.mjs --check --source-jsonl <source.jsonl> --approval <owner-approval-record.json> [--json] [--out <import-plan.json>]',
    '  node scripts/import-spelling-secure-vocabulary.mjs --check --audited-source <audited-source.json> [--content <spelling.seed.json>] [--json] [--out <runtime-import-plan.json>]',
    '  node scripts/import-spelling-secure-vocabulary.mjs --apply --audited-source <audited-source.json> [--content <spelling.seed.json>] [--manifest <runtime-import-manifest.json>] [--published-at <iso>] [--json] [--out <runtime-import-result.json>]',
  ].join('\n');
}

function portablePath(filePath, { cwd = process.cwd() } = {}) {
  const absolutePath = resolve(filePath);
  const relativePath = path.relative(cwd, absolutePath);
  if (relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
    return relativePath.split(path.sep).join('/');
  }
  return absolutePath.split(path.sep).join('/');
}

function emitPayload(payload, options, fallbackMessage) {
  if (options.outPath) {
    writeJson(resolve(options.outPath), payload);
  }
  if (options.json || !options.outPath) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(fallbackMessage);
  }
}

function runSourceCheckMode(options) {
  if (!options.sourceJsonlPath || !options.approvalPath) return false;
  const { importPlan } = buildSecureVocabularyArtifacts({
    sourceJsonlPath: resolve(options.sourceJsonlPath),
    approvalPath: resolve(options.approvalPath),
  });
  emitPayload(
    importPlan,
    options,
    `Secure vocabulary import plan generated: ${importPlan.source.recordCount} record(s), writes=${importPlan.writes}`
  );
  return true;
}

function main() {
  const options = parseArgs();
  if (options.check && !options.auditedSourcePath && runSourceCheckMode(options)) return;
  if ((!options.check && !options.apply) || !options.auditedSourcePath) {
    console.error(usage());
    process.exit(2);
  }

  const auditedSourcePath = resolve(options.auditedSourcePath);
  const contentPath = resolve(options.contentPath);
  const manifestPath = resolve(options.manifestPath);
  const publishedAt = timestampFromIso(options.publishedAtIso);
  const auditedSource = readJson(auditedSourcePath);
  const contentBundle = readJson(contentPath);
  const runtimeImport = buildSecureVocabularyRuntimeImport({
    auditedSource,
    contentBundle,
    publishedAt,
  });

  if (options.apply) {
    writeContentBundle(contentPath, runtimeImport.bundle);
    writeJson(manifestPath, runtimeImport.manifest);
    const result = {
      kind: 'ks2-spelling-secure-vocabulary-runtime-import-result',
      version: 1,
      generatedAt: new Date(publishedAt).toISOString(),
      mode: 'apply',
      writes: true,
      auditedSourcePath: portablePath(auditedSourcePath),
      contentPath: portablePath(contentPath),
      manifestPath: portablePath(manifestPath),
      release: runtimeImport.manifest.release,
      imported: runtimeImport.manifest.imported,
      summary: runtimeImport.manifest.summary,
    };
    emitPayload(
      result,
      options,
      `Secure vocabulary runtime import applied: ${result.imported.secureExtensionWordCount} secure-extension word(s), release=${result.release.id}`
    );
    return;
  }

  emitPayload(
    runtimeImport.plan,
    options,
    `Secure vocabulary runtime import plan generated: ${runtimeImport.plan.imported.secureExtensionWordCount} secure-extension word(s), writes=${runtimeImport.plan.writes}`
  );
}

function isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  try {
    main();
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      error: error?.message || String(error),
      issues: error?.issues || error?.validation?.errors || [],
    }, null, 2));
    process.exit(1);
  }
}
