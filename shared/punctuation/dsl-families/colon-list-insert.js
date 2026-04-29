import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * DSL definitions for gen_colon_list_insert family.
 * Templates 0-3: legacy parity (must match existing bank).
 * Templates 4-7: capacity expansion (new for P4-U9).
 */

const TEMPLATES = [
  // ─── Legacy parity (indices 0-3) ─────────────────────────────────────────────
  {
    prompt: 'Add the colon before the list.',
    stem: 'We needed three tools a torch, a rope and a map.',
    model: 'We needed three tools: a torch, a rope and a map.',
    validator: {
      type: 'requiresColonBeforeList',
      opening: 'We needed three tools',
      items: ['a torch', 'a rope', 'a map'],
    },
    misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the colon before the list.',
    stem: 'The kit included three things a lantern, a compass and a notebook.',
    model: 'The kit included three things: a lantern, a compass and a notebook.',
    validator: {
      type: 'requiresColonBeforeList',
      opening: 'The kit included three things',
      items: ['a lantern', 'a compass', 'a notebook'],
    },
    misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the colon before the list.',
    stem: 'The drawer held three supplies pens, rulers and tape.',
    model: 'The drawer held three supplies: pens, rulers and tape.',
    validator: {
      type: 'requiresColonBeforeList',
      opening: 'The drawer held three supplies',
      items: ['pens', 'rulers', 'tape'],
    },
    misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the colon before the list.',
    stem: 'We chose three activities swimming, cycling and climbing.',
    model: 'We chose three activities: swimming, cycling and climbing.',
    validator: {
      type: 'requiresColonBeforeList',
      opening: 'We chose three activities',
      items: ['swimming', 'cycling', 'climbing'],
    },
    misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  // ─── Capacity expansion (indices 4-7) ────────────────────────────────────────
  {
    prompt: 'Add the colon before the list.',
    stem: 'The garden had three features a pond, a bench and a hedge.',
    model: 'The garden had three features: a pond, a bench and a hedge.',
    validator: {
      type: 'requiresColonBeforeList',
      opening: 'The garden had three features',
      items: ['a pond', 'a bench', 'a hedge'],
    },
    misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the colon before the list.',
    stem: 'She packed three essentials water, sunscreen and a hat.',
    model: 'She packed three essentials: water, sunscreen and a hat.',
    validator: {
      type: 'requiresColonBeforeList',
      opening: 'She packed three essentials',
      items: ['water', 'sunscreen', 'a hat'],
    },
    misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the colon before the list.',
    stem: 'The recipe required three spices cumin, paprika and turmeric.',
    model: 'The recipe required three spices: cumin, paprika and turmeric.',
    validator: {
      type: 'requiresColonBeforeList',
      opening: 'The recipe required three spices',
      items: ['cumin', 'paprika', 'turmeric'],
    },
    misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
    readiness: ['insertion', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the colon before the list.',
    stem: 'The team trained in three sports running, rowing and tennis.',
    model: 'The team trained in three sports: running, rowing and tennis.',
    validator: {
      type: 'requiresColonBeforeList',
      opening: 'The team trained in three sports',
      items: ['running', 'rowing', 'tennis'],
    },
    misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
    readiness: ['insertion', 'transfer', 'misconception', 'negative_test'],
  },
];

export const colonListInsertDsl = TEMPLATES.map((t, i) =>
  definePunctuationTemplate({
    id: `dsl_colon_list_insert_v${i}`,
    familyId: 'gen_colon_list_insert',
    mode: 'insert',
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
      misconceptionTags: t.misconceptionTags,
      readiness: t.readiness,
    }),
    tests: {
      accept: [
        // Model answer
        t.model,
        // Oxford comma also acceptable
        (() => {
          const lastItem = t.validator.items[t.validator.items.length - 1];
          return t.model.replace(`and ${lastItem}`, `, and ${lastItem}`);
        })(),
      ],
      reject: [
        // Original stem (missing colon)
        t.stem,
        // Semicolon instead of colon
        t.model.replace(':', ';'),
        // Missing terminal full stop
        t.model.replace(/\.$/, ''),
      ],
    },
  }),
);
