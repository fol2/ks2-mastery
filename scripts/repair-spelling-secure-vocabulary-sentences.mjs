#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  publishSpellingContentBundle,
  validateSpellingContentBundle,
} from '../src/subjects/spelling/content/model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const contentPath = path.join(rootDir, 'content', 'spelling.seed.json');
const BAD_TEMPLATE_FRAGMENT = 'on the board for secure vocabulary spelling practice';
const SECURE_SENTENCE_PREFIX = 'secure-vocabulary-';
const PUBLISHED_AT = Date.parse('2026-06-05T12:00:00.000Z');
const REPAIR_RELEASE_TITLE = 'Secure vocabulary sentence repair r8';
const THIRD_PERSON_VERBS = new Set([
  'describes',
  'estimates',
  'improves',
  'includes',
  'qualifies',
  'separates',
]);

function normaliseString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function capitalise(value) {
  const text = normaliseString(value);
  return text ? `${text.slice(0, 1).toUpperCase()}${text.slice(1)}` : text;
}

function sourceBucketFor(word) {
  const tags = Array.isArray(word?.tags) ? word.tags : [];
  const bucket = tags.find((tag) => String(tag).endsWith('_secure'));
  if (bucket) return bucket;
  if (String(word?.listId || '').includes('maths-secure')) return 'maths_secure';
  if (String(word?.listId || '').includes('science-secure')) return 'science_secure';
  if (String(word?.listId || '').includes('geography-history-secure')) return 'geography_history_secure';
  if (String(word?.listId || '').includes('writing-grammar-secure')) return 'writing_grammar_secure';
  if (String(word?.listId || '').includes('spelling-pattern-secure')) return 'spelling_pattern_secure';
  if (String(word?.listId || '').includes('morphology-family-secure')) return 'morphology_family_secure';
  if (String(word?.listId || '').includes('derived-forms-candidate')) return 'derived_forms_candidate';
  if (String(word?.listId || '').includes('tier-two-general-secure')) return 'tier_two_general_secure';
  return 'school_academic_secure';
}

function hashText(value) {
  let hash = 0;
  for (const char of value) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash);
}

function hasSuffix(word, suffixes) {
  return suffixes.some((suffix) => word.endsWith(suffix));
}

function sentenceByForm(word, bucket, variantIndex) {
  const context = {
    school_academic_secure: [
      `During the project, the pupil showed ${word} while explaining their choices.`,
      `The learning journal used ${word} to describe progress after feedback.`,
      `In the classroom discussion, ${word} helped the group describe the next step clearly.`,
    ],
    writing_grammar_secure: [
      `The edited paragraph used ${word} to make the writer's meaning clearer.`,
      `During grammar review, the class noticed ${word} in a sentence with strong structure.`,
      `The pupil chose ${word} while improving the sentence for the reader.`,
    ],
    maths_secure: [
      `The maths explanation used ${word} to justify each step in the method.`,
      `In the problem-solving task, ${word} helped the group compare their answers.`,
      `The pupil included ${word} when checking the calculation and explaining the result.`,
    ],
    science_secure: [
      `The science report used ${word} to describe what the investigation showed.`,
      `During the experiment, ${word} helped the class explain their observations.`,
      `The pupil recorded ${word} when comparing the evidence from the test.`,
    ],
    geography_history_secure: [
      `The history paragraph used ${word} to explain how events changed over time.`,
      `On the geography map, ${word} helped the class describe a place accurately.`,
      `The pupil included ${word} when linking evidence to a historical conclusion.`,
    ],
    spelling_pattern_secure: [
      `The spelling note used ${word} to show how the pattern works in a real sentence.`,
      `The pupil grouped ${word} with related spellings before practising the pattern.`,
      `During word study, ${word} helped the class compare letters, sounds, and meaning.`,
    ],
    morphology_family_secure: [
      `The word-family chart used ${word} to show how a root can change form.`,
      `The pupil linked ${word} to related words before explaining the shared meaning.`,
      `During morphology work, ${word} helped the class see how spelling and meaning connect.`,
    ],
    tier_two_general_secure: [
      `The discussion used ${word} to make the idea more precise for the reader.`,
      `The pupil chose ${word} when giving a careful answer to the question.`,
      `In the explanation, ${word} helped the class describe the situation clearly.`,
    ],
    safe_subject_vocabulary_secure: [
      `The topic summary used ${word} to explain the key idea in plain language.`,
      `The pupil included ${word} when connecting the lesson to a real example.`,
      `During revision, ${word} helped the class describe the subject accurately.`,
    ],
    derived_forms_candidate: [
      `The revised sentence used ${word} to show how the base word changes in context.`,
      `The pupil tested ${word} in a new sentence before comparing it with the root word.`,
      `During word-building practice, ${word} helped the class connect spelling to meaning.`,
    ],
  };
  const options = context[bucket] || context.school_academic_secure;
  return options[variantIndex % options.length];
}

function sentenceFor(wordEntry, sentenceIndex) {
  const word = normaliseString(wordEntry?.word || wordEntry?.slug).toLowerCase();
  const cap = capitalise(word);
  const bucket = sourceBucketFor(wordEntry);
  const variant = hashText(`${word}:${sentenceIndex}`) % 7;

  if (word === 'able') return 'The pupil was able to explain the answer after checking each step.';
  if (word === 'ability') return 'Maya showed her ability by explaining the hardest step clearly.';
  if (word === 'absence') return "The register recorded Sam's absence when he was away from school.";
  if (word === 'aloud') return 'The group read the poem aloud so everyone could hear the rhythm.';
  if (word === 'acid') return 'The science test showed acid reacting with the metal strip.';
  if (word === 'aim') return 'The team set a clear aim before starting the investigation.';
  if (word === 'angle') return 'The pupil measured the angle before drawing the triangle.';
  if (word === 'code') return 'The class wrote code to make the robot follow a route.';
  if (word === 'moist') return 'The soil felt moist after rain fell overnight.';

  if (hasSuffix(word, ['fully', 'lessly', 'ously', 'ably', 'ibly', 'ally', 'ly'])) {
    const options = [
      `The pupil checked the final answer ${word} before explaining the method.`,
      `The group listened ${word} while each speaker shared evidence.`,
      `During revision, the learner used feedback ${word} to improve the paragraph.`,
      `The class responded ${word} when the teacher asked for reasons.`,
    ];
    return options[variant % options.length];
  }

  if (word.endsWith('ing')) {
    const options = [
      `The class was ${word} ideas before choosing the strongest evidence.`,
      `The pupil practised ${word} the method until each step was clear.`,
      `The group noticed ${word} details while improving the explanation.`,
    ];
    return options[variant % options.length];
  }

  if (word.endsWith('ed')) {
    const options = [
      `The pupil ${word} the paragraph after reading the feedback.`,
      `The group ${word} their answer when the evidence changed.`,
      `The teacher praised the ${word} work because it showed careful thought.`,
    ];
    return options[variant % options.length];
  }

  if (hasSuffix(word, ['tion', 'sion', 'cian', 'ment', 'ness', 'ity', 'ance', 'ence', 'acy', 'ship'])) {
    const options = [
      `The report explained the ${word} behind the result clearly.`,
      `The pupil used ${word} as evidence when answering the question.`,
      `The class discussed ${word} before writing their final paragraph.`,
    ];
    return options[variant % options.length];
  }

  if (hasSuffix(word, ['able', 'ible', 'ous', 'ful', 'less', 'ive', 'al', 'ic', 'ant', 'ent'])) {
    const options = [
      `The pupil chose a ${word} example to support the explanation.`,
      `The group described the result as ${word} after checking the evidence.`,
      `The teacher asked for a ${word} reason before the class moved on.`,
    ];
    return options[variant % options.length];
  }

  if (THIRD_PERSON_VERBS.has(word)) {
    const options = [
      `The model ${word} the result before the class compares answers.`,
      `The sentence ${word} the idea clearly for the reader.`,
      `The diagram ${word} the evidence so the group can discuss it.`,
    ];
    return options[variant % options.length];
  }

  if (word.endsWith('s') && !word.endsWith('ss')) {
    const options = [
      `The class compared several ${word} before writing a conclusion.`,
      `The pupil sorted the ${word} into groups and explained the pattern.`,
      `The report used ${word} to support the main point.`,
    ];
    return options[variant % options.length];
  }

  if (hasSuffix(word, ['ate', 'ise', 'ize', 'ify'])) {
    const options = [
      `The group tried to ${word} the idea before sharing it with the class.`,
      `The pupil needed to ${word} the answer using evidence from the lesson.`,
      `The class discussed how to ${word} the work and make it clearer.`,
    ];
    return options[variant % options.length];
  }

  if (variant < 3) return sentenceByForm(word, bucket, variant);
  if (variant < 5) return `The class used ${word} when connecting the lesson to a clear example.`;
  return `${cap} helped the pupil explain the idea with more detail.`;
}

function assertSentenceQuality({ sentence, wordEntry }) {
  if (!sentence || sentence.includes(BAD_TEMPLATE_FRAGMENT)) {
    throw new Error(`Unrepaired secure vocabulary sentence for ${wordEntry.slug}`);
  }
  const accepted = Array.isArray(wordEntry.accepted) && wordEntry.accepted.length
    ? wordEntry.accepted
    : [wordEntry.word, wordEntry.slug];
  const hasAcceptedWord = accepted.some((entry) => {
    const escaped = normaliseString(entry).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped && new RegExp(`\\b${escaped}\\b`, 'i').test(sentence);
  });
  if (!hasAcceptedWord) {
    throw new Error(`Secure vocabulary sentence does not include ${wordEntry.slug}: ${sentence}`);
  }
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

await writeFile(contentPath, `${JSON.stringify(finalValidation.bundle, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  repairedCount,
  publishedReleaseId: publishedBundle.publication.currentReleaseId,
  publishedVersion: publishedBundle.publication.publishedVersion,
}, null, 2));
