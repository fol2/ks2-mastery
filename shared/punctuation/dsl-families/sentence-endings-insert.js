import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * DSL definitions for gen_sentence_endings_insert family.
 * Each variant slot maps 1:1 to an existing hand-authored template.
 */

const EXPLANATION = 'Every sentence needs a capital letter at the start and the correct end mark to show whether it is a statement, question, or exclamation.';

const TEMPLATES = [
  {
    prompt: 'Add the capital letter and end punctuation.',
    stem: 'where is the tide bell',
    model: 'Where is the tide bell?',    explanation: EXPLANATION,

    misconceptionTags: ['endmarks.question_mark_missing', 'endmarks.capitalisation_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the capital letter and end punctuation.',
    stem: 'what a bright signal',
    model: 'What a bright signal!',    explanation: EXPLANATION,

    misconceptionTags: ['endmarks.exclamation_mark_missing', 'endmarks.capitalisation_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the capital letter and end punctuation.',
    stem: 'did the crew check the lanterns',
    model: 'Did the crew check the lanterns?',    explanation: EXPLANATION,

    misconceptionTags: ['endmarks.question_mark_missing', 'endmarks.capitalisation_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the capital letter and end punctuation.',
    stem: 'how quickly the fog cleared',
    model: 'How quickly the fog cleared!',    explanation: EXPLANATION,

    misconceptionTags: ['endmarks.exclamation_mark_missing', 'endmarks.capitalisation_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Rewrite this as a correctly punctuated question.',
    stem: 'can the rescue team hear us',
    model: 'Can the rescue team hear us?',    explanation: EXPLANATION,

    misconceptionTags: ['endmarks.question_mark_missing', 'endmarks.capitalisation_missing'],
    readiness: ['insertion', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Rewrite the excited sentence with its capital letter and end mark.',
    stem: 'what an amazing view',
    model: 'What an amazing view!',    explanation: EXPLANATION,

    misconceptionTags: ['endmarks.exclamation_mark_missing', 'endmarks.capitalisation_missing'],
    readiness: ['insertion', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Correct the sentence ending and capital letter.',
    stem: 'the lights went out',
    model: 'The lights went out.',    explanation: EXPLANATION,

    misconceptionTags: ['endmarks.terminal_missing', 'endmarks.capitalisation_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the capital letter and the calm command ending.',
    stem: 'please close the safety gate',
    model: 'Please close the safety gate.',    explanation: EXPLANATION,

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
      explanation: t.explanation,
      misconceptionTags: t.misconceptionTags,
      readiness: t.readiness,
    }),
    tests: {
      accept: [
        t.model,
      ],
      reject: [
        // Original stem (no capital, no end mark)
        t.stem,
        // Capital added but wrong end mark (swap ? and ! and .)
        (() => {
          const mark = t.model.slice(-1);
          const wrongMark = mark === '?' ? '.' : mark === '!' ? '.' : '?';
          return t.model.slice(0, -1) + wrongMark;
        })(),
        // Correct end mark but missing capital letter
        t.model[0].toLowerCase() + t.model.slice(1),
      ],
    },
  }),
);
