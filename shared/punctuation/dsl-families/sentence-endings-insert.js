import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * DSL definitions for gen_sentence_endings_insert family.
 * Each variant slot maps 1:1 to an existing hand-authored template.
 */

const TEMPLATES = [
  {
    prompt: 'Add the capital letter and end punctuation.',
    stem: 'where is the tide bell',
    model: 'Where is the tide bell?',
    misconceptionTags: ['endmarks.question_mark_missing', 'endmarks.capitalisation_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the capital letter and end punctuation.',
    stem: 'what a bright signal',
    model: 'What a bright signal!',
    misconceptionTags: ['endmarks.exclamation_mark_missing', 'endmarks.capitalisation_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the capital letter and end punctuation.',
    stem: 'did the crew check the lanterns',
    model: 'Did the crew check the lanterns?',
    misconceptionTags: ['endmarks.question_mark_missing', 'endmarks.capitalisation_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the capital letter and end punctuation.',
    stem: 'how quickly the fog cleared',
    model: 'How quickly the fog cleared!',
    misconceptionTags: ['endmarks.exclamation_mark_missing', 'endmarks.capitalisation_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Rewrite this as a correctly punctuated question.',
    stem: 'can the rescue team hear us',
    model: 'Can the rescue team hear us?',
    misconceptionTags: ['endmarks.question_mark_missing', 'endmarks.capitalisation_missing'],
    readiness: ['insertion', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Rewrite the excited sentence with its capital letter and end mark.',
    stem: 'what an amazing view',
    model: 'What an amazing view!',
    misconceptionTags: ['endmarks.exclamation_mark_missing', 'endmarks.capitalisation_missing'],
    readiness: ['insertion', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Correct the sentence ending and capital letter.',
    stem: 'the lights went out',
    model: 'The lights went out.',
    misconceptionTags: ['endmarks.terminal_missing', 'endmarks.capitalisation_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the capital letter and the calm command ending.',
    stem: 'please close the safety gate',
    model: 'Please close the safety gate.',
    misconceptionTags: ['endmarks.terminal_missing', 'endmarks.capitalisation_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
];

export const sentenceEndingsInsertDsl = TEMPLATES.map((t, i) =>
  definePunctuationTemplate({
    id: `dsl_sentence_endings_insert_v${i}`,
    familyId: 'gen_sentence_endings_insert',
    mode: 'insert',
    skillIds: ['sentence_endings'],
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    misconceptionTags: t.misconceptionTags,
    readiness: t.readiness,
    slots: { variant: [i] },
    build: () => ({
      prompt: t.prompt,
      stem: t.stem,
      model: t.model,
      misconceptionTags: t.misconceptionTags,
      readiness: t.readiness,
    }),
    tests: {
      accept: [t.model],
      reject: [t.stem],
    },
  }),
);
