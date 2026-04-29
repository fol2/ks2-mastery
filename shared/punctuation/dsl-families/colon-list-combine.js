import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * DSL definitions for gen_colon_list_combine family.
 * Templates 0-3: legacy parity (must match existing bank).
 * Templates 4-7: capacity expansion (new for P4-U10).
 */

const EXPLANATION = 'A colon introduces the list after a complete sentence that sets it up.';

const TEMPLATES = [
  // ─── Legacy parity (indices 0-3) ─────────────────────────────────────────────
  {
    prompt: 'Combine the opening clause and list using a colon.',
    stem: 'We needed three tools\na torch / a rope / a map',
    model: 'We needed three tools: a torch, a rope and a map.',
    validator: {
      type: 'combineColonList',
      opening: 'We needed three tools',
      items: ['a torch', 'a rope', 'a map'],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the opening clause and list using a colon.',
    stem: 'The kit included three things\na lantern / a compass / a notebook',
    model: 'The kit included three things: a lantern, a compass and a notebook.',
    validator: {
      type: 'combineColonList',
      opening: 'The kit included three things',
      items: ['a lantern', 'a compass', 'a notebook'],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the opening clause and list using a colon.',
    stem: 'The drawer held three supplies\npens / rulers / tape',
    model: 'The drawer held three supplies: pens, rulers and tape.',
    validator: {
      type: 'combineColonList',
      opening: 'The drawer held three supplies',
      items: ['pens', 'rulers', 'tape'],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the opening clause and list using a colon.',
    stem: 'We chose three activities\nswimming / cycling / climbing',
    model: 'We chose three activities: swimming, cycling and climbing.',
    validator: {
      type: 'combineColonList',
      opening: 'We chose three activities',
      items: ['swimming', 'cycling', 'climbing'],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  // ─── Capacity expansion (indices 4-7) ────────────────────────────────────────
  {
    prompt: 'Combine the opening clause and list using a colon.',
    stem: 'The garden had three features\na pond / a bench / a hedge',
    model: 'The garden had three features: a pond, a bench and a hedge.',
    validator: {
      type: 'combineColonList',
      opening: 'The garden had three features',
      items: ['a pond', 'a bench', 'a hedge'],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the opening clause and list using a colon.',
    stem: 'She packed three essentials\nwater / sunscreen / a hat',
    model: 'She packed three essentials: water, sunscreen and a hat.',
    validator: {
      type: 'combineColonList',
      opening: 'She packed three essentials',
      items: ['water', 'sunscreen', 'a hat'],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the opening clause and list using a colon.',
    stem: 'The recipe required three spices\ncumin / paprika / turmeric',
    model: 'The recipe required three spices: cumin, paprika and turmeric.',
    validator: {
      type: 'combineColonList',
      opening: 'The recipe required three spices',
      items: ['cumin', 'paprika', 'turmeric'],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
    readiness: ['constrained_transfer', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the opening clause and list using a colon.',
    stem: 'The team trained in three sports\nrunning / rowing / tennis',
    model: 'The team trained in three sports: running, rowing and tennis.',
    validator: {
      type: 'combineColonList',
      opening: 'The team trained in three sports',
      items: ['running', 'rowing', 'tennis'],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
    readiness: ['constrained_transfer', 'transfer', 'misconception', 'negative_test'],
  },
];

export const colonListCombineDsl = TEMPLATES.map((t, i) =>
  definePunctuationTemplate({
    id: `dsl_colon_list_combine_v${i}`,
    familyId: 'gen_colon_list_combine',
    mode: 'combine',
    skillIds: ['colon_list'],
    clusterId: 'structure',
    rewardUnitId: 'colons-core',
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
        // Model answer (no Oxford comma)
        t.model,
        // Oxford comma also acceptable
        (() => {
          const lastItem = t.validator.items[t.validator.items.length - 1];
          return t.model.replace(`and ${lastItem}`, `, and ${lastItem}`);
        })(),
      ],
      reject: [
        // Original stem (slash-separated list)
        t.stem,
        // Missing colon (just commas)
        `${t.validator.opening} ${t.validator.items.slice(0, -1).join(', ')} and ${t.validator.items[t.validator.items.length - 1]}.`,
        // Missing terminal full stop
        t.model.replace(/\.$/, ''),
      ],
    },
  }),
);
