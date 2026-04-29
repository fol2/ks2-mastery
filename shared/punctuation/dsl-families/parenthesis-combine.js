import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * DSL definitions for gen_parenthesis_combine family.
 * Templates 0-3: legacy parity (must match existing bank).
 * Templates 4-7: capacity expansion (new for P4-U9).
 */

const EXPLANATION = 'The extra information is set off with punctuation because it can be removed without breaking the sentence.';

const TEMPLATES = [
  // ─── Legacy parity (indices 0-3) ─────────────────────────────────────────────
  {
    prompt: 'Combine the sentence and extra detail using parenthesis.',
    stem: 'The harbour was busy.\nExtra detail: an old fishing port',
    model: 'The harbour, an old fishing port, was busy.',
    validator: {
      type: 'combineParentheticalPhrase',
      before: 'The harbour',
      phrase: 'an old fishing port',
      after: 'was busy',
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the sentence and extra detail using parenthesis.',
    stem: 'The tower stood above the bay.\nExtra detail: a useful lookout',
    model: 'The tower, a useful lookout, stood above the bay.',
    validator: {
      type: 'combineParentheticalPhrase',
      before: 'The tower',
      phrase: 'a useful lookout',
      after: 'stood above the bay',
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the sentence and extra detail using parenthesis.',
    stem: 'The library closed early.\nExtra detail: a quiet room',
    model: 'The library, a quiet room, closed early.',
    validator: {
      type: 'combineParentheticalPhrase',
      before: 'The library',
      phrase: 'a quiet room',
      after: 'closed early',
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the sentence and extra detail using parenthesis.',
    stem: 'Mr Patel smiled proudly.\nExtra detail: our maths teacher',
    model: 'Mr Patel, our maths teacher, smiled proudly.',
    validator: {
      type: 'combineParentheticalPhrase',
      before: 'Mr Patel',
      phrase: 'our maths teacher',
      after: 'smiled proudly',
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  // ─── Capacity expansion (indices 4-7) ────────────────────────────────────────
  {
    prompt: 'Combine the sentence and extra detail using parenthesis.',
    stem: 'The bridge swayed in the wind.\nExtra detail: a stone crossing',
    model: 'The bridge, a stone crossing, swayed in the wind.',
    validator: {
      type: 'combineParentheticalPhrase',
      before: 'The bridge',
      phrase: 'a stone crossing',
      after: 'swayed in the wind',
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the sentence and extra detail using parenthesis.',
    stem: 'The canal ran beside the park.\nExtra detail: a narrow waterway',
    model: 'The canal, a narrow waterway, ran beside the park.',
    validator: {
      type: 'combineParentheticalPhrase',
      before: 'The canal',
      phrase: 'a narrow waterway',
      after: 'ran beside the park',
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the sentence and extra detail using parenthesis.',
    stem: 'Mrs Khan opened the fete.\nExtra detail: our head teacher',
    model: 'Mrs Khan, our head teacher, opened the fete.',
    validator: {
      type: 'combineParentheticalPhrase',
      before: 'Mrs Khan',
      phrase: 'our head teacher',
      after: 'opened the fete',
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
    readiness: ['constrained_transfer', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the sentence and extra detail using parenthesis.',
    stem: 'The clock chimed at noon.\nExtra detail: an ancient relic',
    model: 'The clock, an ancient relic, chimed at noon.',
    validator: {
      type: 'combineParentheticalPhrase',
      before: 'The clock',
      phrase: 'an ancient relic',
      after: 'chimed at noon',
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
    readiness: ['constrained_transfer', 'transfer', 'misconception', 'negative_test'],
  },
];

export const parenthesisCombineDsl = TEMPLATES.map((t, i) =>
  definePunctuationTemplate({
    id: `dsl_parenthesis_combine_v${i}`,
    familyId: 'gen_parenthesis_combine',
    mode: 'combine',
    skillIds: ['parenthesis'],
    clusterId: 'structure',
    rewardUnitId: 'parenthesis-core',
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
        // Model answer (commas)
        t.model,
        // Brackets variant
        `${t.validator.before} (${t.validator.phrase}) ${t.validator.after}.`,
      ],
      reject: [
        // Original stem (not combined)
        t.stem,
        // Combined but only opening comma, no closing
        `${t.validator.before}, ${t.validator.phrase} ${t.validator.after}.`,
        // Missing terminal full stop
        t.model.replace(/\.$/, ''),
      ],
    },
  }),
);
