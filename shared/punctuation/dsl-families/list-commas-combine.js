import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * DSL definitions for gen_list_commas_combine family.
 * Templates 0-3: legacy parity (must match existing bank).
 * Templates 4-7: capacity expansion (new for P4-U8).
 */

const EXPLANATION = 'Commas separate each item in a list so they are easy to read one by one.';

const TEMPLATES = [
  // ─── Legacy parity (indices 0-3) ─────────────────────────────────────────────
  {
    prompt: 'Combine the notes into one correctly punctuated sentence.',
    stem: 'The tray held\n- shells\n- feathers\n- pebbles',
    model: 'The tray held shells, feathers and pebbles.',
    validator: {
      type: 'combineListSentence',
      opening: 'The tray held',
      items: ['shells', 'feathers', 'pebbles'],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the notes into one correctly punctuated sentence.',
    stem: 'We collected\n- leaves\n- twigs\n- acorns',
    model: 'We collected leaves, twigs and acorns.',
    validator: {
      type: 'combineListSentence',
      opening: 'We collected',
      items: ['leaves', 'twigs', 'acorns'],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the notes into one correctly punctuated sentence.',
    stem: 'The bag contained\n- chalk\n- string\n- tape',
    model: 'The bag contained chalk, string and tape.',
    validator: {
      type: 'combineListSentence',
      opening: 'The bag contained',
      items: ['chalk', 'string', 'tape'],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the notes into one correctly punctuated sentence.',
    stem: 'Our lunch included\n- apples\n- sandwiches\n- juice',
    model: 'Our lunch included apples, sandwiches and juice.',
    validator: {
      type: 'combineListSentence',
      opening: 'Our lunch included',
      items: ['apples', 'sandwiches', 'juice'],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  // ─── Capacity expansion (indices 4-7) ────────────────────────────────────────
  {
    prompt: 'Combine the notes into one correctly punctuated sentence.',
    stem: 'The toolkit included\n- pliers\n- spanners\n- screws',
    model: 'The toolkit included pliers, spanners and screws.',
    validator: {
      type: 'combineListSentence',
      opening: 'The toolkit included',
      items: ['pliers', 'spanners', 'screws'],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the notes into one correctly punctuated sentence.',
    stem: 'We spotted\n- foxes\n- rabbits\n- deer',
    model: 'We spotted foxes, rabbits and deer.',
    validator: {
      type: 'combineListSentence',
      opening: 'We spotted',
      items: ['foxes', 'rabbits', 'deer'],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the notes into one correctly punctuated sentence.',
    stem: 'The menu offered\n- soup\n- salad\n- bread',
    model: 'The menu offered soup, salad and bread.',
    validator: {
      type: 'combineListSentence',
      opening: 'The menu offered',
      items: ['soup', 'salad', 'bread'],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma'],
    readiness: ['constrained_transfer', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the notes into one correctly punctuated sentence.',
    stem: 'They planted\n- oaks\n- elms\n- birches',
    model: 'They planted oaks, elms and birches.',
    validator: {
      type: 'combineListSentence',
      opening: 'They planted',
      items: ['oaks', 'elms', 'birches'],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma'],
    readiness: ['constrained_transfer', 'transfer', 'misconception', 'negative_test'],
  },
];

export const listCommasCombineDsl = TEMPLATES.map((t, i) =>
  definePunctuationTemplate({
    id: `dsl_list_commas_combine_v${i}`,
    familyId: 'gen_list_commas_combine',
    mode: 'combine',
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
        // Original stem (bullet list format)
        t.stem,
        // Correct list but missing terminal full stop
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
