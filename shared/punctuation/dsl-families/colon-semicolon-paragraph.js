import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * DSL definitions for gen_colon_semicolon_paragraph family.
 * Templates 0-3: legacy parity (must match existing bank).
 * Templates 4-7: capacity expansion (new for P4-U10).
 */

const EXPLANATION = 'A colon introduces a list after a complete sentence, and a semicolon joins two closely related main clauses.';

const TEMPLATES = [
  // ─── Legacy parity (indices 0-3) ─────────────────────────────────────────────
  {
    prompt: 'Repair the punctuation in the short passage.',
    stem: 'We needed three tools, a lantern, a compass and a notebook. The tide rose, the group moved inland.',
    model: 'We needed three tools: a lantern, a compass and a notebook. The tide rose; the group moved inland.',
    skillIds: ['colon_list', 'semicolon'],
    clusterId: 'boundary',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresColonBeforeList',
          opening: 'We needed three tools',
          items: ['a lantern', 'a compass', 'a notebook'],
          allowTrailingText: true,    explanation: EXPLANATION,

          misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
        },
        {
          type: 'requiresBoundaryBetweenClauses',
          mark: ';',
          left: 'The tide rose',
          right: 'the group moved inland',    explanation: EXPLANATION,

          misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
        },
      ],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing', 'boundary.comma_splice', 'boundary.semicolon_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the punctuation in the short passage.',
    stem: 'The kit held three things, a torch, a rope and a map. The rain stopped, the match continued.',
    model: 'The kit held three things: a torch, a rope and a map. The rain stopped; the match continued.',
    skillIds: ['colon_list', 'semicolon'],
    clusterId: 'boundary',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresColonBeforeList',
          opening: 'The kit held three things',
          items: ['a torch', 'a rope', 'a map'],
          allowTrailingText: true,    explanation: EXPLANATION,

          misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
        },
        {
          type: 'requiresBoundaryBetweenClauses',
          mark: ';',
          left: 'The rain stopped',
          right: 'the match continued',    explanation: EXPLANATION,

          misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
        },
      ],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing', 'boundary.comma_splice', 'boundary.semicolon_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the punctuation in the short passage.',
    stem: 'The box contained three items, a scarf, a medal and a badge. The door opened, the crowd cheered.',
    model: 'The box contained three items: a scarf, a medal and a badge. The door opened; the crowd cheered.',
    skillIds: ['colon_list', 'semicolon'],
    clusterId: 'boundary',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresColonBeforeList',
          opening: 'The box contained three items',
          items: ['a scarf', 'a medal', 'a badge'],
          allowTrailingText: true,    explanation: EXPLANATION,

          misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
        },
        {
          type: 'requiresBoundaryBetweenClauses',
          mark: ';',
          left: 'The door opened',
          right: 'the crowd cheered',    explanation: EXPLANATION,

          misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
        },
      ],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing', 'boundary.comma_splice', 'boundary.semicolon_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the punctuation in the short passage.',
    stem: 'Our display needed three labels, rivers, mountains and coasts. The lights dimmed, the film began.',
    model: 'Our display needed three labels: rivers, mountains and coasts. The lights dimmed; the film began.',
    skillIds: ['colon_list', 'semicolon'],
    clusterId: 'boundary',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresColonBeforeList',
          opening: 'Our display needed three labels',
          items: ['rivers', 'mountains', 'coasts'],
          allowTrailingText: true,    explanation: EXPLANATION,

          misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
        },
        {
          type: 'requiresBoundaryBetweenClauses',
          mark: ';',
          left: 'The lights dimmed',
          right: 'the film began',    explanation: EXPLANATION,

          misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
        },
      ],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing', 'boundary.comma_splice', 'boundary.semicolon_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  // ─── Capacity expansion (indices 4-7) ────────────────────────────────────────
  {
    prompt: 'Repair the punctuation in the short passage.',
    stem: 'The shed stored three items, a mower, a rake and a hose. The gate creaked, the dog barked.',
    model: 'The shed stored three items: a mower, a rake and a hose. The gate creaked; the dog barked.',
    skillIds: ['colon_list', 'semicolon'],
    clusterId: 'boundary',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresColonBeforeList',
          opening: 'The shed stored three items',
          items: ['a mower', 'a rake', 'a hose'],
          allowTrailingText: true,    explanation: EXPLANATION,

          misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
        },
        {
          type: 'requiresBoundaryBetweenClauses',
          mark: ';',
          left: 'The gate creaked',
          right: 'the dog barked',    explanation: EXPLANATION,

          misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
        },
      ],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing', 'boundary.comma_splice', 'boundary.semicolon_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the punctuation in the short passage.',
    stem: 'We tried three flavours, mint, lemon and ginger. The queue grew, the server worked faster.',
    model: 'We tried three flavours: mint, lemon and ginger. The queue grew; the server worked faster.',
    skillIds: ['colon_list', 'semicolon'],
    clusterId: 'boundary',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresColonBeforeList',
          opening: 'We tried three flavours',
          items: ['mint', 'lemon', 'ginger'],
          allowTrailingText: true,    explanation: EXPLANATION,

          misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
        },
        {
          type: 'requiresBoundaryBetweenClauses',
          mark: ';',
          left: 'The queue grew',
          right: 'the server worked faster',    explanation: EXPLANATION,

          misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
        },
      ],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing', 'boundary.comma_splice', 'boundary.semicolon_missing'],
    readiness: ['constrained_transfer', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the punctuation in the short passage.',
    stem: 'The park offered three trails, woodland, riverside and hilltop. The fog lifted, the runners set off.',
    model: 'The park offered three trails: woodland, riverside and hilltop. The fog lifted; the runners set off.',
    skillIds: ['colon_list', 'semicolon'],
    clusterId: 'boundary',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresColonBeforeList',
          opening: 'The park offered three trails',
          items: ['woodland', 'riverside', 'hilltop'],
          allowTrailingText: true,    explanation: EXPLANATION,

          misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
        },
        {
          type: 'requiresBoundaryBetweenClauses',
          mark: ';',
          left: 'The fog lifted',
          right: 'the runners set off',    explanation: EXPLANATION,

          misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
        },
      ],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing', 'boundary.comma_splice', 'boundary.semicolon_missing'],
    readiness: ['constrained_transfer', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the punctuation in the short passage.',
    stem: 'The basket held three fruits, apples, pears and plums. The whistle blew, the players stopped.',
    model: 'The basket held three fruits: apples, pears and plums. The whistle blew; the players stopped.',
    skillIds: ['colon_list', 'semicolon'],
    clusterId: 'boundary',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresColonBeforeList',
          opening: 'The basket held three fruits',
          items: ['apples', 'pears', 'plums'],
          allowTrailingText: true,    explanation: EXPLANATION,

          misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
        },
        {
          type: 'requiresBoundaryBetweenClauses',
          mark: ';',
          left: 'The whistle blew',
          right: 'the players stopped',    explanation: EXPLANATION,

          misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
        },
      ],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing', 'boundary.comma_splice', 'boundary.semicolon_missing'],
    readiness: ['constrained_transfer', 'transfer', 'misconception', 'negative_test'],
  },
];

export const colonSemicolonParagraphDsl = TEMPLATES.map((t, i) =>
  definePunctuationTemplate({
    id: `dsl_colon_semicolon_paragraph_v${i}`,
    familyId: 'gen_colon_semicolon_paragraph',
    mode: 'paragraph',
    skillIds: t.skillIds,
    clusterId: t.clusterId,
    rewardUnitId: 'semicolons-core',
    misconceptionTags: t.misconceptionTags,
    readiness: t.readiness,
    slots: { variant: [i] },
    build: () => ({
      prompt: t.prompt,
      stem: t.stem,
      model: t.model,
      skillIds: t.skillIds,
      clusterId: t.clusterId,
      validator: t.validator,
      explanation: t.explanation,
      misconceptionTags: t.misconceptionTags,
      readiness: t.readiness,
    }),
    tests: {
      accept: [
        // Model answer
        t.model,
      ],
      reject: [
        // Original stem (all errors present)
        t.stem,
        // Colon fixed but semicolon still wrong (comma splice remains)
        (() => {
          const check0 = t.validator.checks[0];
          const check1 = t.validator.checks[1];
          return `${check0.opening}: ${check0.items.slice(0, -1).join(', ')} and ${check0.items[check0.items.length - 1]}. ${check1.left}, ${check1.right}.`;
        })(),
        // Semicolon fixed but colon still wrong (comma instead of colon)
        (() => {
          const check0 = t.validator.checks[0];
          const check1 = t.validator.checks[1];
          return `${check0.opening}, ${check0.items.slice(0, -1).join(', ')} and ${check0.items[check0.items.length - 1]}. ${check1.left}; ${check1.right}.`;
        })(),
      ],
    },
  }),
);
