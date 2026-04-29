import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * DSL definitions for gen_parenthesis_fix family.
 * Templates 0-3: legacy parity (must match existing bank).
 * Templates 4-7: capacity expansion (new for P4-U9).
 */

const TEMPLATES = [
  // ─── Legacy parity (indices 0-3) ─────────────────────────────────────────────
  {
    prompt: 'Correct the parenthesis punctuation.',
    stem: 'The harbour, an old fishing port was busy.',
    model: 'The harbour, an old fishing port, was busy.',
    validator: {
      type: 'requiresParentheticalPhrase',
      before: 'The harbour',
      phrase: 'an old fishing port',
      after: 'was busy',
    },
    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Correct the parenthesis punctuation.',
    stem: 'The tower a useful lookout stood above the bay.',
    model: 'The tower, a useful lookout, stood above the bay.',
    validator: {
      type: 'requiresParentheticalPhrase',
      before: 'The tower',
      phrase: 'a useful lookout',
      after: 'stood above the bay',
    },
    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Correct the parenthesis punctuation.',
    stem: 'The library a quiet room closed early.',
    model: 'The library, a quiet room, closed early.',
    validator: {
      type: 'requiresParentheticalPhrase',
      before: 'The library',
      phrase: 'a quiet room',
      after: 'closed early',
    },
    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Correct the parenthesis punctuation.',
    stem: 'Mr Patel our maths teacher smiled proudly.',
    model: 'Mr Patel, our maths teacher, smiled proudly.',
    validator: {
      type: 'requiresParentheticalPhrase',
      before: 'Mr Patel',
      phrase: 'our maths teacher',
      after: 'smiled proudly',
    },
    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  // ─── Capacity expansion (indices 4-7) ────────────────────────────────────────
  {
    prompt: 'Correct the parenthesis punctuation.',
    stem: 'The bridge a stone crossing swayed in the wind.',
    model: 'The bridge, a stone crossing, swayed in the wind.',
    validator: {
      type: 'requiresParentheticalPhrase',
      before: 'The bridge',
      phrase: 'a stone crossing',
      after: 'swayed in the wind',
    },
    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Correct the parenthesis punctuation.',
    stem: 'The canal a narrow waterway ran beside the park.',
    model: 'The canal, a narrow waterway, ran beside the park.',
    validator: {
      type: 'requiresParentheticalPhrase',
      before: 'The canal',
      phrase: 'a narrow waterway',
      after: 'ran beside the park',
    },
    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Correct the parenthesis punctuation.',
    stem: 'Mrs Khan our head teacher opened the fete.',
    model: 'Mrs Khan, our head teacher, opened the fete.',
    validator: {
      type: 'requiresParentheticalPhrase',
      before: 'Mrs Khan',
      phrase: 'our head teacher',
      after: 'opened the fete',
    },
    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
    readiness: ['proofreading', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Correct the parenthesis punctuation.',
    stem: 'The clock an ancient relic chimed at noon.',
    model: 'The clock, an ancient relic, chimed at noon.',
    validator: {
      type: 'requiresParentheticalPhrase',
      before: 'The clock',
      phrase: 'an ancient relic',
      after: 'chimed at noon',
    },
    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
    readiness: ['proofreading', 'transfer', 'misconception', 'negative_test'],
  },
];

export const parenthesisFixDsl = TEMPLATES.map((t, i) =>
  definePunctuationTemplate({
    id: `dsl_parenthesis_fix_v${i}`,
    familyId: 'gen_parenthesis_fix',
    mode: 'fix',
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
        // Original stem (missing or unbalanced parenthesis)
        t.stem,
        // Only opening comma, no closing comma
        `${t.validator.before}, ${t.validator.phrase} ${t.validator.after}.`,
        // Missing terminal full stop
        t.model.replace(/\.$/, ''),
      ],
    },
  }),
);
