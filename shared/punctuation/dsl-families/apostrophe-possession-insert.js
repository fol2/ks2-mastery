import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * DSL definitions for gen_apostrophe_possession_insert family.
 * Templates 0-3: legacy parity (must match existing bank).
 * Templates 4-7: capacity expansion (new for P4-U8).
 */

const EXPLANATION = 'The apostrophe before the s shows that the item belongs to the noun.';
const EXPLANATION_RULE_ID = 'apostrophe.possession-singular';

const TEMPLATES = [
  // ─── Legacy parity (indices 0-3) ─────────────────────────────────────────────
  {
    prompt: 'Add apostrophes to show possession.',
    stem: 'The captains whistle was beside the teams coats.',
    model: "The captain's whistle was beside the team's coats.",
    validator: {
      type: 'requiresTokens',
      tokens: ["captain's", "team's"],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['apostrophe.possession_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add apostrophes to show possession.',
    stem: 'The childrens sketches covered the teachers desk.',
    model: "The children's sketches covered the teacher's desk.",
    validator: {
      type: 'requiresTokens',
      tokens: ["children's", "teacher's"],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['apostrophe.possession_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add apostrophes to show possession.',
    stem: 'The artists brush was near the museums door.',
    model: "The artist's brush was near the museum's door.",
    validator: {
      type: 'requiresTokens',
      tokens: ["artist's", "museum's"],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['apostrophe.possession_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add apostrophes to show possession.',
    stem: 'The sailors flag was near the harbours gate.',
    model: "The sailor's flag was near the harbour's gate.",
    validator: {
      type: 'requiresTokens',
      tokens: ["sailor's", "harbour's"],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['apostrophe.possession_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  // ─── Capacity expansion (indices 4-7) ────────────────────────────────────────
  {
    prompt: 'Add apostrophes to show possession.',
    stem: 'The gardeners shed was next to the schools fence.',
    model: "The gardener's shed was next to the school's fence.",
    validator: {
      type: 'requiresTokens',
      tokens: ["gardener's", "school's"],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['apostrophe.possession_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add apostrophes to show possession.',
    stem: 'The dogs lead hung on the owners hook.',
    model: "The dog's lead hung on the owner's hook.",
    validator: {
      type: 'requiresTokens',
      tokens: ["dog's", "owner's"],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['apostrophe.possession_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add apostrophes to show possession.',
    stem: 'The pilots map was under the passengers seat.',
    model: "The pilot's map was under the passenger's seat.",
    validator: {
      type: 'requiresTokens',
      tokens: ["pilot's", "passenger's"],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['apostrophe.possession_missing'],
    readiness: ['insertion', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add apostrophes to show possession.',
    stem: 'The knights shield rested against the castles wall.',
    model: "The knight's shield rested against the castle's wall.",
    validator: {
      type: 'requiresTokens',
      tokens: ["knight's", "castle's"],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['apostrophe.possession_missing'],
    readiness: ['insertion', 'transfer', 'misconception', 'negative_test'],
  },
];

export const apostrophePossessionInsertDsl = TEMPLATES.map((t, i) =>
  definePunctuationTemplate({
    id: `dsl_apostrophe_possession_insert_v${i}`,
    familyId: 'gen_apostrophe_possession_insert',
    mode: 'insert',
    skillIds: ['apostrophe_possession'],
    clusterId: 'apostrophe',
    rewardUnitId: 'apostrophe-possession-core',
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
        t.model,
        // Curly apostrophes acceptable
        t.model.replace(/'/g, '’'),
      ],
      reject: [
        // Original stem (missing apostrophes)
        t.stem,
        // Missing terminal full stop
        t.model.replace(/\.$/, ''),
        // One apostrophe missing (only first token corrected)
        t.stem.replace(
          t.validator.tokens[0].replace("'", ''),
          t.validator.tokens[0],
        ),
      ],
    },
  }),
);
