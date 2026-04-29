import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * DSL definitions for gen_fronted_adverbial_fix family.
 * Templates 0-3: legacy parity (must match existing bank).
 * Templates 4-7: capacity expansion (new for P4-U9).
 */

const EXPLANATION = 'A comma separates the opening adverbial phrase from the main clause so the reader knows where the main idea begins.';

const TEMPLATES = [
  // ─── Legacy parity (indices 0-3) ─────────────────────────────────────────────
  {
    prompt: 'Correct the comma after the fronted adverbial.',
    stem: 'After the storm the path was muddy.',
    model: 'After the storm, the path was muddy.',
    validator: {
      type: 'startsWithPhraseComma',
      phrase: 'After the storm',
    },
    explanation: EXPLANATION,

    misconceptionTags: ['comma.fronted_adverbial_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Correct the comma after the fronted adverbial.',
    stem: 'Before sunrise the crew checked the ropes.',
    model: 'Before sunrise, the crew checked the ropes.',
    validator: {
      type: 'startsWithPhraseComma',
      phrase: 'Before sunrise',
    },
    explanation: EXPLANATION,

    misconceptionTags: ['comma.fronted_adverbial_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Correct the comma after the fronted adverbial.',
    stem: 'During the concert the hall became silent.',
    model: 'During the concert, the hall became silent.',
    validator: {
      type: 'startsWithPhraseComma',
      phrase: 'During the concert',
    },
    explanation: EXPLANATION,

    misconceptionTags: ['comma.fronted_adverbial_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Correct the comma after the fronted adverbial.',
    stem: 'At the edge of the field the coach waited.',
    model: 'At the edge of the field, the coach waited.',
    validator: {
      type: 'startsWithPhraseComma',
      phrase: 'At the edge of the field',
    },
    explanation: EXPLANATION,

    misconceptionTags: ['comma.fronted_adverbial_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  // ─── Capacity expansion (indices 4-7) ────────────────────────────────────────
  {
    prompt: 'Correct the comma after the fronted adverbial.',
    stem: 'Without warning the fox darted across the lane.',
    model: 'Without warning, the fox darted across the lane.',
    validator: {
      type: 'startsWithPhraseComma',
      phrase: 'Without warning',
    },
    explanation: EXPLANATION,

    misconceptionTags: ['comma.fronted_adverbial_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Correct the comma after the fronted adverbial.',
    stem: 'Behind the shed the cat hid from the rain.',
    model: 'Behind the shed, the cat hid from the rain.',
    validator: {
      type: 'startsWithPhraseComma',
      phrase: 'Behind the shed',
    },
    explanation: EXPLANATION,

    misconceptionTags: ['comma.fronted_adverbial_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Correct the comma after the fronted adverbial.',
    stem: 'Throughout the afternoon the children played outside.',
    model: 'Throughout the afternoon, the children played outside.',
    validator: {
      type: 'startsWithPhraseComma',
      phrase: 'Throughout the afternoon',
    },
    explanation: EXPLANATION,

    misconceptionTags: ['comma.fronted_adverbial_missing'],
    readiness: ['proofreading', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Correct the comma after the fronted adverbial.',
    stem: 'Near the old bridge the heron stood perfectly still.',
    model: 'Near the old bridge, the heron stood perfectly still.',
    validator: {
      type: 'startsWithPhraseComma',
      phrase: 'Near the old bridge',
    },
    explanation: EXPLANATION,

    misconceptionTags: ['comma.fronted_adverbial_missing'],
    readiness: ['proofreading', 'transfer', 'misconception', 'negative_test'],
  },
];

export const frontedAdverbialFixDsl = TEMPLATES.map((t, i) =>
  definePunctuationTemplate({
    id: `dsl_fronted_adverbial_fix_v${i}`,
    familyId: 'gen_fronted_adverbial_fix',
    mode: 'fix',
    skillIds: ['fronted_adverbial'],
    clusterId: 'comma_flow',
    rewardUnitId: 'fronted-adverbials-core',
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
        // Model answer
        t.model,
        // Without trailing space variations
        t.model.trimEnd(),
      ],
      reject: [
        // Original stem (missing comma)
        t.stem,
        // Comma in the wrong place (after the first word only)
        `${t.validator.phrase.split(' ')[0]}, ${t.stem.slice(t.validator.phrase.split(' ')[0].length + 1)}`,
        // Missing terminal full stop
        t.model.replace(/\.$/, ''),
      ],
    },
  }),
);
