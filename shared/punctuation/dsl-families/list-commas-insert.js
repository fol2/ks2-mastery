import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * DSL definitions for gen_list_commas_insert family.
 * Templates 0-3: legacy parity (must match existing bank).
 * Templates 4-7: capacity expansion (new for P4-U8).
 */

const EXPLANATION = 'Commas separate each item in a list so they are easy to read one by one.';
const EXPLANATION_RULE_ID = 'list.comma-separation';

const TEMPLATES = [
  // ─── Legacy parity (indices 0-3) ─────────────────────────────────────────────
  {
    prompt: 'Add commas to separate the list items.',
    stem: 'We packed ropes maps and snacks.',
    model: 'We packed ropes, maps and snacks.',
    validator: {
      type: 'requiresListCommas',
      items: ['ropes', 'maps', 'snacks'],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add commas to separate the list items.',
    stem: 'The box held shells bells and chalk.',
    model: 'The box held shells, bells and chalk.',
    validator: {
      type: 'requiresListCommas',
      items: ['shells', 'bells', 'chalk'],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add commas to separate the list items.',
    stem: 'The shelf held paints brushes and paper.',
    model: 'The shelf held paints, brushes and paper.',
    validator: {
      type: 'requiresListCommas',
      items: ['paints', 'brushes', 'paper'],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add commas to separate the list items.',
    stem: 'We saw gulls seals and dolphins.',
    model: 'We saw gulls, seals and dolphins.',
    validator: {
      type: 'requiresListCommas',
      items: ['gulls', 'seals', 'dolphins'],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  // ─── Capacity expansion (indices 4-7) ────────────────────────────────────────
  {
    prompt: 'Add commas to separate the list items.',
    stem: 'She bought pens rulers and notebooks.',
    model: 'She bought pens, rulers and notebooks.',
    validator: {
      type: 'requiresListCommas',
      items: ['pens', 'rulers', 'notebooks'],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add commas to separate the list items.',
    stem: 'They carried buckets spades and nets.',
    model: 'They carried buckets, spades and nets.',
    validator: {
      type: 'requiresListCommas',
      items: ['buckets', 'spades', 'nets'],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add commas to separate the list items.',
    stem: 'The garden had roses daisies and tulips.',
    model: 'The garden had roses, daisies and tulips.',
    validator: {
      type: 'requiresListCommas',
      items: ['roses', 'daisies', 'tulips'],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma'],
    readiness: ['insertion', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add commas to separate the list items.',
    stem: 'He found coins stamps and keys.',
    model: 'He found coins, stamps and keys.',
    validator: {
      type: 'requiresListCommas',
      items: ['coins', 'stamps', 'keys'],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma'],
    readiness: ['insertion', 'transfer', 'misconception', 'negative_test'],
  },
];

export const listCommasInsertDsl = TEMPLATES.map((t, i) =>
  definePunctuationTemplate({
    id: `dsl_list_commas_insert_v${i}`,
    familyId: 'gen_list_commas_insert',
    mode: 'insert',
    skillIds: ['list_commas'],
    clusterId: 'comma',
    rewardUnitId: 'list-commas-core',
    misconceptionTags: t.misconceptionTags,
    readiness: t.readiness,
    slots: { variant: [i] },
    build: () => ({
      prompt: t.prompt,
      stem: t.stem,
      model: t.model,
      validator: t.validator,
      explanation: t.explanation,
      explanationRuleId: EXPLANATION_RULE_ID,
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
        // Original stem (no commas)
        t.stem,
        // All commas present but missing terminal full stop
        t.model.replace(/\.$/, ''),
        // Comma after "and" (wrong position)
        (() => {
          const lastItem = t.validator.items[t.validator.items.length - 1];
          return t.model.replace(`and ${lastItem}.`, `and, ${lastItem}.`);
        })(),
      ],
    },
  }),
);
