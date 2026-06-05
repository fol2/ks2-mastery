#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  publishSpellingContentBundle,
  validateSpellingContentBundle,
} from '../src/subjects/spelling/content/model.js';
import {
  BAD_TEMPLATE_FRAGMENT,
  assertSecureVocabularySentenceQuality,
  assertSecureVocabularySentenceSet,
  secureVocabularySentenceFor,
} from './spelling-secure-vocabulary-sentence-generator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const contentPath = path.join(rootDir, 'content', 'spelling.seed.json');
const SECURE_SENTENCE_PREFIX = 'secure-vocabulary-';
const PUBLISHED_AT = Date.parse('2026-06-05T20:15:00.000Z');
const REPAIR_RELEASE_TITLE = 'Secure vocabulary sentence quality repair r9';

function normaliseString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function capitalise(value) {
  const text = normaliseString(value);
  return text ? `${text.slice(0, 1).toUpperCase()}${text.slice(1)}` : text;
}

function sentenceFor(wordEntry, sentenceIndex) {
  const text = secureVocabularySentenceFor(wordEntry, sentenceIndex);
  assertSecureVocabularySentenceQuality({ sentence: text, wordEntry });
  return text;
}

function assertSentenceQuality({ sentence, wordEntry }) {
  assertSecureVocabularySentenceQuality({ sentence, wordEntry });
}

function sentenceHasBadTemplate(sentence) {
  return normaliseString(sentence).includes(BAD_TEMPLATE_FRAGMENT);
}

function isSecureVocabularyWord(wordEntry) {
  const tags = Array.isArray(wordEntry?.tags) ? wordEntry.tags : [];
  const provenanceText = `${normaliseString(wordEntry?.provenance?.source)} ${normaliseString(wordEntry?.sourceNote)}`;
  return wordEntry?.coverageTier === 'secure-extension'
    && (tags.includes('secure-extension') || provenanceText.includes('ks2-spelling-secure-vocabulary-source-v1'));
}

function repairSentenceText({ sentence, wordEntry, index, force = false }) {
  if (!force && !sentenceHasBadTemplate(sentence)) return sentence;
  const text = sentenceFor(wordEntry, index);
  assertSentenceQuality({ sentence: text, wordEntry });
  return text;
}

function repairSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.words)) return snapshot;

  const words = snapshot.words.map((word, index) => {
    const force = isSecureVocabularyWord(word);
    const sentence = repairSentenceText({ sentence: word.sentence, wordEntry: word, index, force });
    const sentences = Array.isArray(word.sentences)
      ? word.sentences.map((entry, sentenceIndex) => repairSentenceText({
        sentence: entry,
        wordEntry: word,
        index: index + sentenceIndex,
        force,
      }))
      : word.sentences;
    const variants = Array.isArray(word.variants)
      ? word.variants.map((variant, variantIndex) => ({
        ...variant,
        sentence: repairSentenceText({
          sentence: variant.sentence,
          wordEntry: { ...word, ...variant, slug: word.slug, word: variant.word || word.word },
          index: index + variantIndex,
          force,
        }),
        sentences: Array.isArray(variant.sentences)
          ? variant.sentences.map((entry, sentenceIndex) => repairSentenceText({
            sentence: entry,
            wordEntry: { ...word, ...variant, slug: word.slug, word: variant.word || word.word },
            index: index + variantIndex + sentenceIndex,
            force,
          }))
          : variant.sentences,
      }))
      : word.variants;
    return { ...word, sentence, sentences, variants };
  });

  return {
    ...snapshot,
    words,
    wordBySlug: Object.fromEntries(words.map((word) => [word.slug, word])),
  };
}

function countBadSnapshotSentences(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.words)) return 0;
  return snapshot.words.reduce((count, word) => {
    let next = count;
    if (sentenceHasBadTemplate(word.sentence)) next += 1;
    if (Array.isArray(word.sentences)) {
      next += word.sentences.filter(sentenceHasBadTemplate).length;
    }
    if (Array.isArray(word.variants)) {
      for (const variant of word.variants) {
        if (sentenceHasBadTemplate(variant.sentence)) next += 1;
        if (Array.isArray(variant.sentences)) {
          next += variant.sentences.filter(sentenceHasBadTemplate).length;
        }
      }
    }
    return next;
  }, 0);
}

const rawBundle = JSON.parse(await readFile(contentPath, 'utf8'));
const draftValidation = validateSpellingContentBundle(rawBundle);
if (!draftValidation.ok) {
  throw new Error(`Cannot repair invalid spelling content: ${draftValidation.errors.length} validation errors.`);
}

const bundle = draftValidation.bundle;
const wordBySlug = new Map(bundle.draft.words.map((word) => [word.slug, word]));
let repairedCount = 0;

const repairedDraft = {
  ...bundle.draft,
  sentences: bundle.draft.sentences.map((sentence, index) => {
    if (!sentence.id.startsWith(SECURE_SENTENCE_PREFIX)) {
      return sentence;
    }
    const wordEntry = wordBySlug.get(sentence.wordSlug);
    if (!wordEntry) {
      throw new Error(`Secure vocabulary sentence ${sentence.id} points to missing word ${sentence.wordSlug}.`);
    }
    const text = sentenceFor(wordEntry, index);
    assertSentenceQuality({ sentence: text, wordEntry });
    repairedCount += 1;
    return { ...sentence, text };
  }),
};

const repairedBundle = {
  ...bundle,
  draft: repairedDraft,
  releases: bundle.releases.map((release) => ({
    ...release,
    snapshot: repairSnapshot(release.snapshot),
  })),
};

const repairedValidation = validateSpellingContentBundle(repairedBundle);
if (!repairedValidation.ok) {
  throw new Error(`Repaired spelling content is invalid: ${repairedValidation.errors.length} validation errors.`);
}

const currentRelease = repairedValidation.bundle.releases.find((release) => (
  release.id === repairedValidation.bundle.publication.currentReleaseId
));
const shouldPublishRepairRelease = currentRelease?.title !== REPAIR_RELEASE_TITLE
  || countBadSnapshotSentences(currentRelease?.snapshot) > 0;
const publishedBundle = shouldPublishRepairRelease
  ? publishSpellingContentBundle(repairedValidation.bundle, {
    title: REPAIR_RELEASE_TITLE,
    notes: 'Replaces repeated secure-extension vocabulary placeholder sentences with context-bearing examples.',
    publishedAt: PUBLISHED_AT,
  })
  : repairedValidation.bundle;

const finalValidation = validateSpellingContentBundle(publishedBundle);
if (!finalValidation.ok) {
  throw new Error(`Published repaired spelling content is invalid: ${finalValidation.errors.length} validation errors.`);
}

const finalBadSentences = finalValidation.bundle.draft.sentences.filter((sentence) => (
  sentence.id.startsWith(SECURE_SENTENCE_PREFIX) && sentence.text.includes(BAD_TEMPLATE_FRAGMENT)
));
if (finalBadSentences.length > 0) {
  throw new Error(`Found ${finalBadSentences.length} unrepaired secure vocabulary sentence(s).`);
}

const releaseBadSentenceCount = finalValidation.bundle.releases
  .reduce((count, release) => count + countBadSnapshotSentences(release.snapshot), 0);
if (releaseBadSentenceCount > 0) {
  throw new Error(`Found ${releaseBadSentenceCount} unrepaired secure vocabulary snapshot sentence(s).`);
}

const publishedSecureWords = finalValidation.bundle.releases
  .find((release) => release.id === finalValidation.bundle.publication.currentReleaseId)
  ?.snapshot.words
  .filter(isSecureVocabularyWord)
  .map((word) => ({
    slug: word.slug,
    word: word.word,
    accepted: word.accepted,
    sentence: word.sentence || word.sentences?.[0] || '',
  })) || [];
assertSecureVocabularySentenceSet(publishedSecureWords);

await writeFile(contentPath, `${JSON.stringify(finalValidation.bundle, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  repairedCount,
  publishedReleaseId: publishedBundle.publication.currentReleaseId,
  publishedVersion: publishedBundle.publication.publishedVersion,
}, null, 2));
