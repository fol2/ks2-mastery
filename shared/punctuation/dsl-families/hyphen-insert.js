import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * DSL definitions for gen_hyphen_insert family.
 */

const EXPLANATION = 'The hyphen joins words into a single describing phrase so the reader knows they work together before the noun.';

const TEMPLATES = [
  {
    prompt: 'Add the hyphen that avoids ambiguity.',
    stem: 'The little used path was hidden.',
    model: 'The little-used path was hidden.',
    validator: { type: 'requiresHyphenatedPhrase', phrase: 'little-used path' },
    explanation: EXPLANATION,

    misconceptionTags: ['boundary.hyphen_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the hyphen that avoids ambiguity.',
    stem: 'The fast moving tide covered the rocks.',
    model: 'The fast-moving tide covered the rocks.',
    validator: { type: 'requiresHyphenatedPhrase', phrase: 'fast-moving tide' },
    explanation: EXPLANATION,

    misconceptionTags: ['boundary.hyphen_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the hyphen that avoids ambiguity.',
    stem: 'The well known guide led us.',
    model: 'The well-known guide led us.',
    validator: { type: 'requiresHyphenatedPhrase', phrase: 'well-known guide' },
    explanation: EXPLANATION,

    misconceptionTags: ['boundary.hyphen_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the hyphen that avoids ambiguity.',
    stem: 'The cold blooded reptile rested.',
    model: 'The cold-blooded reptile rested.',
    validator: { type: 'requiresHyphenatedPhrase', phrase: 'cold-blooded reptile' },
    explanation: EXPLANATION,

    misconceptionTags: ['boundary.hyphen_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the hyphen that avoids ambiguity.',
    stem: 'The sugar free snack was popular.',
    model: 'The sugar-free snack was popular.',
    validator: { type: 'requiresHyphenatedPhrase', phrase: 'sugar-free snack' },
    explanation: EXPLANATION,

    misconceptionTags: ['boundary.hyphen_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Rewrite the age phrase with the needed hyphens.',
    stem: 'The ten year old pupil read aloud.',
    model: 'The ten-year-old pupil read aloud.',
    validator: { type: 'requiresHyphenatedPhrase', phrase: 'ten-year-old pupil' },
    explanation: EXPLANATION,

    misconceptionTags: ['boundary.hyphen_missing'],
    readiness: ['insertion', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the hyphen to clarify the compound modifier.',
    stem: 'The last minute change surprised us.',
    model: 'The last-minute change surprised us.',
    validator: { type: 'requiresHyphenatedPhrase', phrase: 'last-minute change' },
    explanation: EXPLANATION,

    misconceptionTags: ['boundary.hyphen_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Fix the compound adjective before the noun.',
    stem: 'The short term plan worked.',
    model: 'The short-term plan worked.',
    validator: { type: 'requiresHyphenatedPhrase', phrase: 'short-term plan' },
    explanation: EXPLANATION,

    misconceptionTags: ['boundary.hyphen_missing'],
    readiness: ['proofreading', 'transfer', 'misconception', 'negative_test'],
  },
];

export const hyphenInsertDsl = TEMPLATES.map((t, i) =>
  definePunctuationTemplate({
    id: `dsl_hyphen_insert_v${i}`,
    familyId: 'gen_hyphen_insert',
    mode: 'insert',
    skillIds: ['hyphen'],
    clusterId: 'boundary',
    rewardUnitId: 'hyphens-core',
    misconceptionTags: t.misconceptionTags,
    readiness: t.readiness,
    slots: { variant: [i] },
    build: () => ({
      prompt: t.prompt,
      stem: t.stem,
      model: t.model,
      validator: t.validator,
      explanation: t.explanation,
      misconceptionTags: t.misconceptionTags,
      readiness: t.readiness,
    }),
    tests: {
      accept: [
        t.model,
      ],
      reject: [
        // Original stem (spaces instead of hyphens)
        t.stem,
        // Hyphen present but missing terminal full stop
        t.model.replace(/\.$/, ''),
        // Missing capital letter at start
        t.model[0].toLowerCase() + t.model.slice(1),
      ],
    },
  }),
);
