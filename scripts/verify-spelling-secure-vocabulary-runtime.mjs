#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import {
  buildSpellingContentSummary,
  normaliseSpellingContentBundle,
  validateSpellingContentBundle,
} from '../src/subjects/spelling/content/model.js';
import { SPELLING_COVERAGE_TIER } from '../src/subjects/spelling/content/taxonomy.js';
import {
  DEFAULT_AUDITED_SOURCE_PATH,
  DEFAULT_CONTENT_PATH,
} from './import-spelling-secure-vocabulary.mjs';

export const SECURE_VOCABULARY_RUNTIME_CONTENT_INVALID =
  'secure_vocabulary_runtime_content_invalid';
export const SECURE_VOCABULARY_RUNTIME_COUNT_MISMATCH =
  'secure_vocabulary_runtime_count_mismatch';
export const SECURE_VOCABULARY_RUNTIME_WORD_MISSING =
  'secure_vocabulary_runtime_word_missing';
export const SECURE_VOCABULARY_RUNTIME_WORD_FIELD_MISMATCH =
  'secure_vocabulary_runtime_word_field_mismatch';
export const SECURE_VOCABULARY_GENERATED_MODULE_MISMATCH =
  'secure_vocabulary_generated_module_mismatch';

const SECURE_EXTENSION_READY_STATUS = 'adult_approved_for_secure_extension_import';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normaliseString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normaliseSlug(value) {
  return normaliseString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normaliseStringArray(value) {
  return Array.isArray(value)
    ? value.map((entry) => normaliseString(entry)).filter(Boolean)
    : [];
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function wordsFromAuditedSource(auditedSource) {
  return (Array.isArray(auditedSource?.words) ? auditedSource.words : [])
    .filter((word) => word?.taxonomyTier === SPELLING_COVERAGE_TIER.SECURE_EXTENSION);
}

function approvedSecureWordsFromAuditedSource(auditedSource) {
  return wordsFromAuditedSource(auditedSource)
    .filter((word) => word?.secureImportApprovalApplied === true
      && word?.sourceReviewStatus === SECURE_EXTENSION_READY_STATUS
      && word?.review?.status === 'approved'
      && word?.safety?.securePromotionAllowed === true);
}

function expectedTaxonomyCount(auditedSource, tier) {
  return Number(auditedSource?.source?.counts?.taxonomyTier?.[tier]) || 0;
}

function reportIssue(issues, issue) {
  issues.push(issue);
}

function expectedWordShape(sourceWord) {
  const readiness = isPlainObject(sourceWord?.releaseReadiness) ? sourceWord.releaseReadiness : {};
  return {
    slug: normaliseSlug(sourceWord.slug || sourceWord.word),
    word: normaliseString(sourceWord.word).toLowerCase(),
    accepted: normaliseStringArray(readiness.acceptedSpellings).map((entry) => entry.toLowerCase()),
    explanation: normaliseString(readiness.explanation),
    sentence: normaliseStringArray(readiness.exampleSentences)[0] || '',
    sourceRecordId: normaliseString(sourceWord.sourceRecordId),
  };
}

function assertRuntimeWordShape({
  issues,
  sourceWord,
  runtimeWord,
  path,
  sentenceById = null,
}) {
  const expected = expectedWordShape(sourceWord);
  if (!runtimeWord) {
    reportIssue(issues, {
      code: SECURE_VOCABULARY_RUNTIME_WORD_MISSING,
      path,
      wordIdentity: expected.slug,
    });
    return;
  }

  const fieldChecks = [
    ['word', runtimeWord.word, expected.word],
    ['spellingPool', runtimeWord.spellingPool, 'core'],
    ['coverageTier', runtimeWord.coverageTier, SPELLING_COVERAGE_TIER.SECURE_EXTENSION],
    ['explanation', runtimeWord.explanation, expected.explanation],
  ];

  for (const [field, actual, expectedValue] of fieldChecks) {
    if (actual === expectedValue) continue;
    reportIssue(issues, {
      code: SECURE_VOCABULARY_RUNTIME_WORD_FIELD_MISMATCH,
      path: `${path}.${field}`,
      wordIdentity: expected.slug,
      actual,
      expected: expectedValue,
    });
  }

  if (!normaliseStringArray(runtimeWord.accepted).map((entry) => entry.toLowerCase()).includes(expected.word)) {
    reportIssue(issues, {
      code: SECURE_VOCABULARY_RUNTIME_WORD_FIELD_MISMATCH,
      path: `${path}.accepted`,
      wordIdentity: expected.slug,
      actual: runtimeWord.accepted || [],
      expected: expected.word,
    });
  }

  const sentenceTexts = normaliseStringArray(runtimeWord.sentences);
  if (sentenceTexts.length === 0 && sentenceById) {
    for (const sentenceId of normaliseStringArray(runtimeWord.sentenceEntryIds)) {
      const sentence = sentenceById.get(sentenceId);
      if (sentence?.text) sentenceTexts.push(sentence.text);
    }
  }
  if (!sentenceTexts.includes(expected.sentence)) {
    reportIssue(issues, {
      code: SECURE_VOCABULARY_RUNTIME_WORD_FIELD_MISMATCH,
      path: `${path}.sentences`,
      wordIdentity: expected.slug,
      actual: sentenceTexts,
      expected: expected.sentence,
    });
  }

  const provenanceSource = normaliseString(runtimeWord?.provenance?.source);
  const provenanceNote = normaliseString(runtimeWord?.provenance?.note);
  const sourceNote = normaliseString(runtimeWord?.sourceNote);
  if (
    !provenanceSource.includes('ks2-spelling-secure-vocabulary-source-v1')
    || !`${provenanceNote} ${sourceNote}`.includes(expected.sourceRecordId)
  ) {
    reportIssue(issues, {
      code: SECURE_VOCABULARY_RUNTIME_WORD_FIELD_MISMATCH,
      path: `${path}.provenance`,
      wordIdentity: expected.slug,
      actual: runtimeWord?.provenance || null,
      expected: `source provenance with record ${expected.sourceRecordId}`,
    });
  }
}

function compareCount(issues, path, actual, expected) {
  if (actual === expected) return;
  reportIssue(issues, {
    code: SECURE_VOCABULARY_RUNTIME_COUNT_MISMATCH,
    path,
    actual,
    expected,
  });
}

export function verifySecureVocabularyRuntime({
  auditedSource,
  contentBundle,
  generatedModule = null,
} = {}) {
  const issues = [];
  const approvedSecureWords = approvedSecureWordsFromAuditedSource(auditedSource);
  const expectedSecureCount = expectedTaxonomyCount(auditedSource, SPELLING_COVERAGE_TIER.SECURE_EXTENSION);
  const expectedStatutoryCoreCount = expectedTaxonomyCount(auditedSource, SPELLING_COVERAGE_TIER.STATUTORY_CORE);
  const expectedEnrichmentExtraCount = expectedTaxonomyCount(auditedSource, SPELLING_COVERAGE_TIER.ENRICHMENT_EXTRA);
  const bundle = normaliseSpellingContentBundle(contentBundle);
  const validation = validateSpellingContentBundle(bundle);
  const summary = buildSpellingContentSummary(bundle);
  const release = bundle.releases.find((entry) => entry.id === bundle.publication.currentReleaseId)
    || bundle.releases.at(-1)
    || null;
  const runtimeBySlug = release?.snapshot?.wordBySlug || {};
  const draftBySlug = Object.fromEntries(bundle.draft.words.map((word) => [word.slug, word]));
  const draftSentenceById = new Map(bundle.draft.sentences.map((sentence) => [sentence.id, sentence]));

  if (!validation.ok) {
    reportIssue(issues, {
      code: SECURE_VOCABULARY_RUNTIME_CONTENT_INVALID,
      path: 'content',
      errors: validation.errors,
    });
  }

  compareCount(issues, 'summary.secureExtensionCount', summary.secureExtensionCount, expectedSecureCount);
  compareCount(issues, 'summary.statutoryCoreCount', summary.statutoryCoreCount, expectedStatutoryCoreCount);
  compareCount(issues, 'summary.enrichmentExtraCount', summary.enrichmentExtraCount, expectedEnrichmentExtraCount);
  compareCount(issues, 'approvedSecureWords.length', approvedSecureWords.length, expectedSecureCount);

  approvedSecureWords.forEach((sourceWord, index) => {
    const slug = normaliseSlug(sourceWord.slug || sourceWord.word);
    assertRuntimeWordShape({
      issues,
      sourceWord,
      runtimeWord: draftBySlug[slug],
      path: `content.draft.words[${slug || index}]`,
      sentenceById: draftSentenceById,
    });
    assertRuntimeWordShape({
      issues,
      sourceWord,
      runtimeWord: runtimeBySlug[slug],
      path: `content.release.snapshot.wordBySlug.${slug || index}`,
    });
  });

  if (generatedModule) {
    const generatedSummary = generatedModule.SEEDED_SPELLING_CONTENT_SUMMARY || null;
    const generatedSnapshot = generatedModule.SEEDED_SPELLING_PUBLISHED_SNAPSHOT || null;
    const generatedBySlug = generatedSnapshot?.wordBySlug || {};
    if (!generatedSummary || generatedSummary.secureExtensionCount !== expectedSecureCount) {
      reportIssue(issues, {
        code: SECURE_VOCABULARY_GENERATED_MODULE_MISMATCH,
        path: 'generatedModule.SEEDED_SPELLING_CONTENT_SUMMARY.secureExtensionCount',
        actual: generatedSummary?.secureExtensionCount ?? null,
        expected: expectedSecureCount,
      });
    }
    for (const sourceWord of approvedSecureWords) {
      const slug = normaliseSlug(sourceWord.slug || sourceWord.word);
      if (generatedBySlug[slug]) continue;
      reportIssue(issues, {
        code: SECURE_VOCABULARY_GENERATED_MODULE_MISMATCH,
        path: `generatedModule.SEEDED_SPELLING_PUBLISHED_SNAPSHOT.wordBySlug.${slug}`,
        wordIdentity: slug,
      });
    }
  }

  return {
    ok: issues.length === 0,
    issueCount: issues.length,
    issues,
    checkedSecureExtensionWords: approvedSecureWords.length,
    expectedSecureExtensionWords: expectedSecureCount,
    summary,
    release: release
      ? {
          id: release.id,
          version: release.version,
          title: release.title,
          publishedAt: release.publishedAt,
        }
      : null,
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    auditedSourcePath: DEFAULT_AUDITED_SOURCE_PATH,
    contentPath: DEFAULT_CONTENT_PATH,
    modulePath: 'src/subjects/spelling/data/content-data.js',
    outPath: null,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if ((arg === '--audited-source' || arg === '--source') && argv[index + 1]) options.auditedSourcePath = argv[++index];
    else if (arg.startsWith('--audited-source=')) options.auditedSourcePath = arg.slice('--audited-source='.length);
    else if (arg.startsWith('--source=')) options.auditedSourcePath = arg.slice('--source='.length);
    else if (arg === '--content' && argv[index + 1]) options.contentPath = argv[++index];
    else if (arg.startsWith('--content=')) options.contentPath = arg.slice('--content='.length);
    else if (arg === '--module' && argv[index + 1]) options.modulePath = argv[++index];
    else if (arg.startsWith('--module=')) options.modulePath = arg.slice('--module='.length);
    else if (arg === '--out' && argv[index + 1]) options.outPath = argv[++index];
    else if (arg.startsWith('--out=')) options.outPath = arg.slice('--out='.length);
  }

  return options;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/verify-spelling-secure-vocabulary-runtime.mjs [--audited-source <source.json>] [--content <spelling.seed.json>] [--module <content-data.js>] [--json] [--out <report.json>]',
  ].join('\n');
}

async function loadGeneratedModule(modulePath) {
  const resolved = resolve(modulePath);
  if (!existsSync(resolved)) return null;
  const cacheBust = `?t=${Date.now()}`;
  return import(`${pathToFileURL(resolved).href}${cacheBust}`);
}

function emitReport(report, options) {
  const payload = JSON.stringify(report, null, 2);
  if (options.outPath) {
    writeFileSync(resolve(options.outPath), `${payload}\n`, 'utf8');
  }
  if (options.json || !options.outPath) {
    console.log(payload);
  } else {
    console.log(`Secure vocabulary runtime verification ${report.ok ? 'passed' : 'failed'}: ${report.issueCount} issue(s)`);
  }
}

function isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  try {
    const options = parseArgs();
    if (!options.auditedSourcePath || !options.contentPath) {
      console.error(usage());
      process.exit(2);
    }
    const report = verifySecureVocabularyRuntime({
      auditedSource: readJson(resolve(options.auditedSourcePath)),
      contentBundle: readJson(resolve(options.contentPath)),
      generatedModule: await loadGeneratedModule(options.modulePath),
    });
    emitReport(report, options);
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      error: error?.message || String(error),
      issues: error?.issues || [],
    }, null, 2));
    process.exit(1);
  }
}
