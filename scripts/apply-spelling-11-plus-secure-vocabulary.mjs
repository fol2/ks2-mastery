#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path, { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSpellingContentSummary,
  normaliseSpellingContentBundle,
  publishSpellingContentBundle,
  validateSpellingContentBundle,
} from '../src/subjects/spelling/content/model.js';
import { SPELLING_COVERAGE_TIER } from '../src/subjects/spelling/content/taxonomy.js';

const SOURCE_KIND = 'ks2-spelling-11-plus-secure-vocabulary-source';
const SOURCE_ID = 'spelling-11-plus-secure-vocabulary-2026-06-25';
const SOURCE_TAG = '11-plus-vocabulary-2026-06-25';
const SOURCE_TITLE = '11+ Vocabulary: 300 Words and Meanings';
const EXPECTED_SUPPLIED_AT = '2026-06-25';
const EXPECTED_SOURCE_ATTACHMENT_PATH =
  '/Users/nelsonto/.codex/attachments/0c412cd5-cd3f-419a-baae-02eae8b8fe57/pasted-text.txt';
const EXPECTED_SOURCE_TEXT_SHA256 = 'a5e0e6117ee764c859504429707875f5b132697c84f47d56604cc22320952b75';
const EXPECTED_SOURCE_WORDS_SHA256 = 'a40f3e29cd899e2503e0ccd700dcd278c5272d7dc33b3f54c494a19b2ec7897d';
const DEFAULT_SOURCE_PATH = 'content/spelling-11-plus-secure-vocabulary-2026-06-25.json';
const DEFAULT_CONTENT_PATH = 'content/spelling.seed.json';
const DEFAULT_MANIFEST_PATH =
  'docs/plans/james/hotfixes/23. 11-plus-secure-vocabulary/validation/11-plus-secure-vocabulary-import-manifest.json';
const DEFAULT_PUBLISHED_AT = '2026-06-25T20:30:00.000Z';
const APPROVED_SOURCE_REVIEW_STATUS = 'owner_supplied_adult_approved_for_secure_extension_import';
const APPROVED_WORD_REVIEW_STATUS = 'adult_approved_for_secure_extension_import';
const APPROVED_WORD_SAFETY_STATUS = 'approved_for_secure_extension_import';
const EXPECTED_WORD_YEAR_BAND = 'Y5-Y6 secure vocabulary';
const EXPECTED_SOURCE_DUPLICATE_POLICY = 'update_existing_word_meanings_without_duplicating_slugs';
const INITIAL_IMPORT_OUTCOME = Object.freeze({
  baseline: 'origin/main content/spelling.seed.json before the 2026-06-25 11 plus import',
  newSecureExtensionWordCount: 224,
  newSecureExtensionSentenceCount: 224,
  newSecureExtensionWordListCount: 15,
  existingWordCount: 76,
  existingByTier: {
    [SPELLING_COVERAGE_TIER.SECURE_EXTENSION]: 56,
    [SPELLING_COVERAGE_TIER.STATUTORY_CORE]: 20,
  },
  enrichmentExtraCollisionCount: 0,
  sourceWordCount: 300,
});

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

function slugFromSection(section) {
  return normaliseSlug(section || '11 plus vocabulary');
}

function titleCase(value) {
  return normaliseString(value)
    .toLowerCase()
    .replace(/\band\b/g, 'and')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => (part === 'and' ? part : `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`))
    .join(' ');
}

function uniqueStrings(values) {
  const output = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const trimmed = normaliseString(value).toLowerCase();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    output.push(trimmed);
  }
  return output;
}

function timestampFromIso(value) {
  const parsed = Date.parse(normaliseString(value));
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ISO timestamp: ${value}`);
  }
  return parsed;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function portablePath(filePath, { cwd = process.cwd() } = {}) {
  const absolutePath = resolve(filePath);
  const relativePath = path.relative(cwd, absolutePath);
  if (relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
    return relativePath.split(path.sep).join('/');
  }
  return absolutePath.split(path.sep).join('/');
}

function sourceHash(source) {
  return createHash('sha256').update(JSON.stringify(source.words || [])).digest('hex');
}

function assertSourceField(condition, field, message) {
  if (!condition) {
    throw new Error(`11 plus source ${field}: ${message}`);
  }
}

function assertEqualSourceField(value, expected, field) {
  const actual = normaliseString(value);
  assertSourceField(actual === expected, field, `expected ${expected}, received ${actual || '<missing>'}.`);
}

function assertSha256(value, field) {
  assertSourceField(/^[a-f0-9]{64}$/i.test(normaliseString(value)), field, 'expected a SHA-256 hex digest.');
}

function validateSourceApproval(rawSource) {
  const source = isPlainObject(rawSource.source) ? rawSource.source : {};
  assertSourceField(Number(rawSource.version) === 1, 'version', `expected 1, received ${rawSource.version ?? '<missing>'}.`);
  assertEqualSourceField(source.title, SOURCE_TITLE, 'source.title');
  assertEqualSourceField(source.suppliedBy, 'James', 'source.suppliedBy');
  assertEqualSourceField(source.suppliedAt, EXPECTED_SUPPLIED_AT, 'source.suppliedAt');
  assertEqualSourceField(source.sourceAttachmentPath, EXPECTED_SOURCE_ATTACHMENT_PATH, 'source.sourceAttachmentPath');
  assertEqualSourceField(source.sourceTextSha256, EXPECTED_SOURCE_TEXT_SHA256, 'source.sourceTextSha256');
  assertSha256(source.sourceTextSha256, 'source.sourceTextSha256');
  assertEqualSourceField(source.reviewStatus, APPROVED_SOURCE_REVIEW_STATUS, 'source.reviewStatus');
  assertEqualSourceField(source.targetCoverageTier, SPELLING_COVERAGE_TIER.SECURE_EXTENSION, 'source.targetCoverageTier');
  assertEqualSourceField(source.duplicatePolicy, EXPECTED_SOURCE_DUPLICATE_POLICY, 'source.duplicatePolicy');
}

function validateSourceWordApproval(entry, index, word, slug) {
  const prefix = `words[${index}] ${slug || word || '<missing>'}`;
  assertEqualSourceField(entry.reviewStatus, APPROVED_WORD_REVIEW_STATUS, `${prefix}.reviewStatus`);
  assertEqualSourceField(entry.safetyStatus, APPROVED_WORD_SAFETY_STATUS, `${prefix}.safetyStatus`);
  assertEqualSourceField(entry.yearBand, EXPECTED_WORD_YEAR_BAND, `${prefix}.yearBand`);

  const acceptedSpellings = uniqueStrings(entry.acceptedSpellings);
  assertSourceField(acceptedSpellings.length > 0, `${prefix}.acceptedSpellings`, 'must list at least one accepted spelling.');
  assertSourceField(
    acceptedSpellings.includes(word),
    `${prefix}.acceptedSpellings`,
    `must include the canonical spelling ${word}.`,
  );

  const ukSpellingDecision = normaliseString(entry.ukSpellingDecision);
  assertSourceField(
    ukSpellingDecision.startsWith('UK canonical spelling approved:'),
    `${prefix}.ukSpellingDecision`,
    'must record the UK canonical spelling decision.',
  );
  assertSourceField(
    ukSpellingDecision.toLowerCase().includes(word),
    `${prefix}.ukSpellingDecision`,
    `must name the canonical spelling ${word}.`,
  );

  const familyRoot = normaliseString(entry.familyRoot).toLowerCase();
  assertSourceField(Boolean(familyRoot), `${prefix}.familyRoot`, 'is required.');

  const morphologyTags = uniqueStrings(entry.morphologyTags);
  assertSourceField(morphologyTags.length > 0, `${prefix}.morphologyTags`, 'must list at least one morphology tag.');

  return {
    acceptedSpellings,
    familyRoot,
    morphologyTags,
  };
}

function validateSource(rawSource) {
  if (!isPlainObject(rawSource) || rawSource.kind !== SOURCE_KIND) {
    throw new Error(`Expected source kind ${SOURCE_KIND}.`);
  }
  validateSourceApproval(rawSource);
  const rawWords = Array.isArray(rawSource.words) ? rawSource.words : [];
  if (rawWords.length !== 300) {
    throw new Error(`Expected exactly 300 source words, received ${rawWords.length}.`);
  }
  const seen = new Set();
  const words = rawWords.map((entry, index) => {
    const word = normaliseString(entry.word).toLowerCase();
    const meaning = normaliseString(entry.meaning);
    const slug = normaliseSlug(entry.slug || word);
    const section = normaliseString(entry.section);
    const sourceRecordId = normaliseString(entry.sourceRecordId || `11plus-${String(index + 1).padStart(3, '0')}`);
    if (!word || !slug || !meaning || !section) {
      throw new Error(`Source word at index ${index} is missing word, slug, meaning, or section.`);
    }
    if (seen.has(slug)) {
      throw new Error(`Duplicate source slug: ${slug}`);
    }
    seen.add(slug);
    const approval = validateSourceWordApproval(entry, index, word, slug);
    return {
      ...entry,
      word,
      slug,
      meaning,
      section,
      sectionIndex: Number(entry.sectionIndex) || 0,
      sourceRecordId,
      acceptedSpellings: approval.acceptedSpellings,
      familyRoot: approval.familyRoot,
      morphologyTags: approval.morphologyTags,
    };
  });
  const rawWordsSha256 = sourceHash({ words: rawWords });
  assertEqualSourceField(rawWordsSha256, EXPECTED_SOURCE_WORDS_SHA256, 'wordsSha256');

  return {
    ...rawSource,
    words,
  };
}

function sourceNoteFor(sourceWord, source, sourceWordsSha256) {
  return [
    `${SOURCE_TITLE} source ${SOURCE_ID}`,
    `record ${sourceWord.sourceRecordId}`,
    `section ${sourceWord.section}`,
    `supplied by ${normaliseString(source.source?.suppliedBy) || 'James'}`,
    `source words SHA-256 ${sourceWordsSha256}`,
  ].join('; ');
}

function appendSourceNote(currentNote, addition) {
  const existing = normaliseString(currentNote);
  if (!existing) return addition;
  if (existing.includes(addition)) return existing;
  return `${existing} ${addition}`;
}

function provenanceFor(sourceWord, source, sourceWordsSha256, publishedAt) {
  return {
    source: SOURCE_ID,
    note: sourceNoteFor(sourceWord, source, sourceWordsSha256),
    importedAt: publishedAt,
  };
}

function sourceParts(value) {
  return normaliseString(value)
    .split(/\s*;\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function mergeProvenanceSource(currentSource, nextSource) {
  const output = [];
  const seen = new Set();
  for (const part of [...sourceParts(currentSource), ...sourceParts(nextSource)]) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(part);
  }
  return output.join('; ');
}

function normaliseImportedAt(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function mergeProvenance(currentProvenance, sourceWord, source, sourceWordsSha256, publishedAt) {
  const current = isPlainObject(currentProvenance) ? currentProvenance : {};
  const next = provenanceFor(sourceWord, source, sourceWordsSha256, publishedAt);
  return {
    source: mergeProvenanceSource(current.source, next.source),
    note: appendSourceNote(current.note, next.note),
    importedAt: Math.max(normaliseImportedAt(current.importedAt), next.importedAt),
  };
}

function sameProvenance(left, right) {
  const current = isPlainObject(left) ? left : {};
  const next = isPlainObject(right) ? right : {};
  return normaliseString(current.source) === normaliseString(next.source)
    && normaliseString(current.note) === normaliseString(next.note)
    && normaliseImportedAt(current.importedAt) === normaliseImportedAt(next.importedAt);
}

function sentenceTextFor(sourceWord) {
  return `In vocabulary practice, ${sourceWord.word} means ${sourceWord.meaning}.`;
}

function learnerExplanationFor(sourceWord) {
  if (sourceWord.meaning.length >= 12) return sourceWord.meaning;
  return `${titleCase(sourceWord.word)} means ${sourceWord.meaning}.`;
}

function listIdForSection(section) {
  return `secure-extension-11-plus-${slugFromSection(section)}-2026-06-25`;
}

function sectionTag(section) {
  return `11-plus-${slugFromSection(section)}`;
}

function buildNewEntries({ newSourceWords, bundle, source, sourceWordsSha256, publishedAt }) {
  const maxListSort = bundle.draft.wordLists.reduce((max, list) => Math.max(max, Number(list.sortIndex) || 0), 0);
  const maxWordSort = bundle.draft.words.reduce((max, word) => Math.max(max, Number(word.sortIndex) || 0), 0);
  const maxSentenceSort = bundle.draft.sentences.reduce((max, sentence) => Math.max(max, Number(sentence.sortIndex) || 0), 0);
  const listsBySection = new Map();
  const words = [];
  const sentences = [];

  newSourceWords.forEach((sourceWord, index) => {
    if (!listsBySection.has(sourceWord.section)) {
      const listId = listIdForSection(sourceWord.section);
      listsBySection.set(sourceWord.section, {
        id: listId,
        title: `Secure vocabulary - 11 plus ${titleCase(sourceWord.section)}`,
        spellingPool: 'core',
        coverageTier: SPELLING_COVERAGE_TIER.SECURE_EXTENSION,
        yearGroups: ['Y5', 'Y6'],
        tags: uniqueStrings(['secure-extension', SOURCE_TAG, sectionTag(sourceWord.section)]),
        wordSlugs: [],
        sourceNote: `${SOURCE_TITLE} source ${SOURCE_ID}; section ${sourceWord.section}`,
        provenance: provenanceFor(sourceWord, source, sourceWordsSha256, publishedAt),
        sortIndex: maxListSort + listsBySection.size + 1,
      });
    }

    const list = listsBySection.get(sourceWord.section);
    const sentenceId = `${SOURCE_ID}-${sourceWord.slug}__01`;
    const sourceNote = sourceNoteFor(sourceWord, source, sourceWordsSha256);
    const provenance = provenanceFor(sourceWord, source, sourceWordsSha256, publishedAt);
    list.wordSlugs.push(sourceWord.slug);
    words.push({
      slug: sourceWord.slug,
      word: sourceWord.word,
      family: titleCase(sourceWord.section),
      listId: list.id,
      spellingPool: 'core',
      coverageTier: SPELLING_COVERAGE_TIER.SECURE_EXTENSION,
      yearGroups: ['Y5', 'Y6'],
      tags: uniqueStrings([
        'secure-extension',
        SOURCE_TAG,
        sectionTag(sourceWord.section),
        'base-word',
        'adult_approved_for_secure_extension_import',
        ...sourceWord.morphologyTags,
      ]),
      patternIds: [],
      accepted: sourceWord.acceptedSpellings,
      explanation: learnerExplanationFor(sourceWord),
      sentenceEntryIds: [sentenceId],
      sourceNote,
      provenance,
      sortIndex: maxWordSort + index + 1,
    });
    sentences.push({
      id: sentenceId,
      wordSlug: sourceWord.slug,
      text: sentenceTextFor(sourceWord),
      variantLabel: '11-plus-secure-vocabulary',
      tags: uniqueStrings(['secure-extension', SOURCE_TAG, sectionTag(sourceWord.section)]),
      sourceNote,
      provenance,
      sortIndex: maxSentenceSort + index + 1,
    });
  });

  return {
    wordLists: [...listsBySection.values()],
    words,
    sentences,
  };
}

function applySourceToBundle({ source, contentBundle, publishedAt }) {
  const sourceWordsSha256 = sourceHash(source);
  const bundle = normaliseSpellingContentBundle(contentBundle);
  const sourceWordsBySlug = new Map(source.words.map((word) => [word.slug, word]));
  const draftWordsBySlug = new Map(bundle.draft.words.map((word, index) => [word.slug, { word, index }]));
  const existing = [];
  const newSourceWords = [];
  const collisions = [];

  for (const sourceWord of source.words) {
    const existingDraft = draftWordsBySlug.get(sourceWord.slug);
    if (!existingDraft) {
      newSourceWords.push(sourceWord);
      continue;
    }
    if (existingDraft.word.coverageTier === SPELLING_COVERAGE_TIER.ENRICHMENT_EXTRA) {
      collisions.push(sourceWord.slug);
      continue;
    }
    existing.push({ sourceWord, draftWord: existingDraft.word, index: existingDraft.index });
  }

  if (collisions.length > 0) {
    throw new Error(`11 plus source collides with enrichment-extra word(s): ${collisions.join(', ')}`);
  }

  const updatedExistingSlugs = [];
  const sourceNoteUpdates = [];
  const provenanceUpdates = [];
  const shortMeaningWrappedSlugs = source.words
    .filter((sourceWord) => learnerExplanationFor(sourceWord) !== sourceWord.meaning)
    .map((sourceWord) => sourceWord.slug);
  const draftWords = bundle.draft.words.map((word) => {
    const sourceWord = sourceWordsBySlug.get(word.slug);
    if (!sourceWord) return word;

    const sourceNote = sourceNoteFor(sourceWord, source, sourceWordsSha256);
    const explanation = learnerExplanationFor(sourceWord);
    const nextTags = uniqueStrings([...(Array.isArray(word.tags) ? word.tags : []), SOURCE_TAG, sectionTag(sourceWord.section)]);
    const nextProvenance = mergeProvenance(word.provenance, sourceWord, source, sourceWordsSha256, publishedAt);
    const nextWord = {
      ...word,
      tags: nextTags,
      explanation,
      sourceNote: appendSourceNote(word.sourceNote, sourceNote),
      provenance: nextProvenance,
    };
    if (word.explanation !== explanation) updatedExistingSlugs.push(word.slug);
    if (word.sourceNote !== nextWord.sourceNote) sourceNoteUpdates.push(word.slug);
    if (!sameProvenance(word.provenance, nextProvenance)) provenanceUpdates.push(word.slug);
    return nextWord;
  });

  const newEntries = buildNewEntries({
    newSourceWords,
    bundle,
    source,
    sourceWordsSha256,
    publishedAt,
  });

  const hasDraftChanges = newSourceWords.length > 0
    || updatedExistingSlugs.length > 0
    || sourceNoteUpdates.length > 0
    || provenanceUpdates.length > 0;
  const existingByTier = existing.reduce((counts, entry) => {
    const tier = entry.draftWord.coverageTier;
    counts[tier] = (counts[tier] || 0) + 1;
    return counts;
  }, {});

  const buildManifest = (published, mode = hasDraftChanges ? 'apply' : 'noop') => {
    const summary = buildSpellingContentSummary(published);
    return {
      kind: 'ks2-spelling-11-plus-secure-vocabulary-import-manifest',
      version: 1,
      generatedAt: new Date(publishedAt).toISOString(),
      mode,
      source: {
        sourceId: SOURCE_ID,
        title: source.source?.title || SOURCE_TITLE,
        sourceWordsSha256,
        suppliedBy: source.source?.suppliedBy || 'James',
        sourceWordCount: source.words.length,
        uniqueSlugCount: new Set(source.words.map((word) => word.slug)).size,
        sectionCount: new Set(source.words.map((word) => word.section)).size,
      },
      taskOutcome: {
        initialImport: INITIAL_IMPORT_OUTCOME,
        currentRun: {
          newSecureExtensionWordCount: newSourceWords.length,
          newSecureExtensionSentenceCount: newEntries.sentences.length,
          newSecureExtensionWordListCount: newEntries.wordLists.length,
          existingWordMeaningUpdateCount: updatedExistingSlugs.length,
          existingWordSourceNoteUpdateCount: sourceNoteUpdates.length,
          existingWordProvenanceUpdateCount: provenanceUpdates.length,
          existingWordCount: existing.length,
          existingByTier,
        },
      },
      imported: {
        newSecureExtensionWordCount: newSourceWords.length,
        newSecureExtensionSentenceCount: newEntries.sentences.length,
        newSecureExtensionWordListCount: newEntries.wordLists.length,
        existingWordMeaningUpdateCount: updatedExistingSlugs.length,
        existingWordSourceNoteUpdateCount: sourceNoteUpdates.length,
        existingWordProvenanceUpdateCount: provenanceUpdates.length,
        existingWordCount: existing.length,
        existingByTier,
        shortMeaningWrappedCount: shortMeaningWrappedSlugs.length,
        shortMeaningWrappedSlugs,
        newSecureExtensionWordSlugs: newSourceWords.map((word) => word.slug),
        existingWordSlugs: existing.map((entry) => entry.sourceWord.slug),
      },
      release: {
        id: published.publication.currentReleaseId,
        version: published.publication.publishedVersion,
        publishedAt,
        publishedAtIso: new Date(publishedAt).toISOString(),
      },
      summary,
    };
  };

  if (!hasDraftChanges) {
    const validation = validateSpellingContentBundle(bundle);
    if (!validation.ok) {
      const error = new Error(`11 plus secure vocabulary import found invalid existing content: ${validation.errors.length} error(s).`);
      error.validation = validation;
      throw error;
    }
    return {
      bundle: validation.bundle,
      manifest: buildManifest(validation.bundle, 'noop'),
    };
  }

  const draft = {
    ...bundle.draft,
    version: Number(bundle.draft.version || 0) + 1,
    notes: appendSourceNote(
      bundle.draft.notes,
      `James supplied ${source.words.length} 11 plus vocabulary meanings on 2026-06-25; ${newSourceWords.length} added as secure-extension words and ${existing.length} existing word meanings aligned.`,
    ),
    updatedAt: publishedAt,
    wordLists: [...bundle.draft.wordLists, ...newEntries.wordLists],
    words: [...draftWords, ...newEntries.words],
    sentences: [...bundle.draft.sentences, ...newEntries.sentences],
  };

  const candidate = normaliseSpellingContentBundle({
    ...bundle,
    draft,
  });
  const validation = validateSpellingContentBundle(candidate);
  if (!validation.ok) {
    const error = new Error(`11 plus secure vocabulary import produced invalid content: ${validation.errors.length} error(s).`);
    error.validation = validation;
    throw error;
  }

  const published = publishSpellingContentBundle(validation.bundle, {
    title: '11 plus secure vocabulary expansion',
    notes: 'Publishes James supplied 11 plus vocabulary meanings; new words are secure-extension and statutory-core semantics remain unchanged.',
    publishedAt,
  });
  const manifest = buildManifest(published);

  return {
    bundle: published,
    manifest,
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    apply: false,
    check: false,
    json: false,
    sourcePath: DEFAULT_SOURCE_PATH,
    contentPath: DEFAULT_CONTENT_PATH,
    manifestPath: DEFAULT_MANIFEST_PATH,
    outPath: '',
    publishedAtIso: DEFAULT_PUBLISHED_AT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--check') options.check = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--source' && argv[index + 1]) options.sourcePath = argv[++index];
    else if (arg.startsWith('--source=')) options.sourcePath = arg.slice('--source='.length);
    else if (arg === '--content' && argv[index + 1]) options.contentPath = argv[++index];
    else if (arg.startsWith('--content=')) options.contentPath = arg.slice('--content='.length);
    else if (arg === '--manifest' && argv[index + 1]) options.manifestPath = argv[++index];
    else if (arg.startsWith('--manifest=')) options.manifestPath = arg.slice('--manifest='.length);
    else if (arg === '--out' && argv[index + 1]) options.outPath = argv[++index];
    else if (arg.startsWith('--out=')) options.outPath = arg.slice('--out='.length);
    else if (arg === '--published-at' && argv[index + 1]) options.publishedAtIso = argv[++index];
    else if (arg.startsWith('--published-at=')) options.publishedAtIso = arg.slice('--published-at='.length);
  }

  return options;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/apply-spelling-11-plus-secure-vocabulary.mjs --check [--json] [--out <plan.json>]',
    '  node scripts/apply-spelling-11-plus-secure-vocabulary.mjs --apply [--json] [--manifest <manifest.json>]',
  ].join('\n');
}

function emitPayload(payload, options, fallbackMessage) {
  if (options.outPath) writeJson(resolve(options.outPath), payload);
  if (options.json || !options.outPath) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(fallbackMessage);
  }
}

function main() {
  const options = parseArgs();
  if (!options.apply && !options.check) {
    console.error(usage());
    process.exit(2);
  }

  const sourcePath = resolve(options.sourcePath);
  const contentPath = resolve(options.contentPath);
  const manifestPath = resolve(options.manifestPath);
  const publishedAt = timestampFromIso(options.publishedAtIso);
  const source = validateSource(readJson(sourcePath));
  const contentBundle = readJson(contentPath);
  const result = applySourceToBundle({ source, contentBundle, publishedAt });

  if (options.apply) {
    writeJson(contentPath, result.bundle);
    writeJson(manifestPath, result.manifest);
  }

  const payload = {
    ...result.manifest,
    mode: options.apply ? result.manifest.mode : 'check',
    writes: options.apply,
    sourcePath: portablePath(sourcePath),
    contentPath: portablePath(contentPath),
    manifestPath: portablePath(manifestPath),
  };
  emitPayload(
    payload,
    options,
    `11 plus secure vocabulary ${options.apply ? 'applied' : 'checked'}: ${payload.imported.newSecureExtensionWordCount} new secure-extension word(s).`,
  );
}

function isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

export {
  applySourceToBundle,
  validateSource,
};

if (isMainModule()) {
  try {
    main();
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      error: error?.message || String(error),
      issues: error?.validation?.errors || error?.issues || [],
    }, null, 2));
    process.exit(1);
  }
}
