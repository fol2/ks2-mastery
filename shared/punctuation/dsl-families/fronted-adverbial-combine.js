import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * DSL definitions for gen_fronted_adverbial_combine family.
 * Templates 0-3: legacy parity (must match existing bank).
 * Templates 4-7: capacity expansion (new for P4-U9).
 */

const TEMPLATES = [
  // ─── Legacy parity (indices 0-3) ─────────────────────────────────────────────
  {
    prompt: 'Combine the adverbial and main clause into one sentence.',
    stem: 'Before sunrise\nThe crew checked the ropes.',
    model: 'Before sunrise, the crew checked the ropes.',
    validator: {
      type: 'combineFrontedAdverbial',
      phrase: 'Before sunrise',
      mainClause: 'the crew checked the ropes',
    },
    misconceptionTags: ['comma.fronted_adverbial_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the adverbial and main clause into one sentence.',
    stem: 'After the rehearsal\nThe cast packed away the props.',
    model: 'After the rehearsal, the cast packed away the props.',
    validator: {
      type: 'combineFrontedAdverbial',
      phrase: 'After the rehearsal',
      mainClause: 'the cast packed away the props',
    },
    misconceptionTags: ['comma.fronted_adverbial_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the adverbial and main clause into one sentence.',
    stem: 'During the concert\nThe hall became silent.',
    model: 'During the concert, the hall became silent.',
    validator: {
      type: 'combineFrontedAdverbial',
      phrase: 'During the concert',
      mainClause: 'the hall became silent',
    },
    misconceptionTags: ['comma.fronted_adverbial_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the adverbial and main clause into one sentence.',
    stem: 'At the edge of the field\nThe coach waited.',
    model: 'At the edge of the field, the coach waited.',
    validator: {
      type: 'combineFrontedAdverbial',
      phrase: 'At the edge of the field',
      mainClause: 'the coach waited',
    },
    misconceptionTags: ['comma.fronted_adverbial_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  // ─── Capacity expansion (indices 4-7) ────────────────────────────────────────
  {
    prompt: 'Combine the adverbial and main clause into one sentence.',
    stem: 'Without warning\nThe fox darted across the lane.',
    model: 'Without warning, the fox darted across the lane.',
    validator: {
      type: 'combineFrontedAdverbial',
      phrase: 'Without warning',
      mainClause: 'the fox darted across the lane',
    },
    misconceptionTags: ['comma.fronted_adverbial_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the adverbial and main clause into one sentence.',
    stem: 'Behind the shed\nThe cat hid from the rain.',
    model: 'Behind the shed, the cat hid from the rain.',
    validator: {
      type: 'combineFrontedAdverbial',
      phrase: 'Behind the shed',
      mainClause: 'the cat hid from the rain',
    },
    misconceptionTags: ['comma.fronted_adverbial_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the adverbial and main clause into one sentence.',
    stem: 'Throughout the afternoon\nThe children played outside.',
    model: 'Throughout the afternoon, the children played outside.',
    validator: {
      type: 'combineFrontedAdverbial',
      phrase: 'Throughout the afternoon',
      mainClause: 'the children played outside',
    },
    misconceptionTags: ['comma.fronted_adverbial_missing'],
    readiness: ['constrained_transfer', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the adverbial and main clause into one sentence.',
    stem: 'Near the old bridge\nThe heron stood perfectly still.',
    model: 'Near the old bridge, the heron stood perfectly still.',
    validator: {
      type: 'combineFrontedAdverbial',
      phrase: 'Near the old bridge',
      mainClause: 'the heron stood perfectly still',
    },
    misconceptionTags: ['comma.fronted_adverbial_missing'],
    readiness: ['constrained_transfer', 'transfer', 'misconception', 'negative_test'],
  },
];

export const frontedAdverbialCombineDsl = TEMPLATES.map((t, i) =>
  definePunctuationTemplate({
    id: `dsl_fronted_adverbial_combine_v${i}`,
    familyId: 'gen_fronted_adverbial_combine',
    mode: 'combine',
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
      misconceptionTags: t.misconceptionTags,
      readiness: t.readiness,
    }),
    tests: {
      accept: [
        // Model answer
        t.model,
        // Trailing whitespace tolerance
        t.model.trimEnd(),
      ],
      reject: [
        // Original two-line stem (not combined)
        t.stem,
        // Combined but missing comma after adverbial
        `${t.validator.phrase} ${t.validator.mainClause}.`,
        // Missing terminal full stop
        t.model.replace(/\.$/, ''),
      ],
    },
  }),
);
