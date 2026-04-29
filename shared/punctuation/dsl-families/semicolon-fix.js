import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * DSL definitions for gen_semicolon_fix family.
 * Templates 0-3: legacy parity (must match existing bank).
 * Templates 4-7: capacity expansion (new for P4-U10).
 */

const TEMPLATES = [
  // ─── Legacy parity (indices 0-3) ─────────────────────────────────────────────
  {
    prompt: 'Replace the comma splice with a semi-colon.',
    stem: 'The lighthouse was bright, the boats still waited.',
    model: 'The lighthouse was bright; the boats still waited.',
    validator: {
      type: 'requiresBoundaryBetweenClauses',
      left: 'The lighthouse was bright',
      right: 'the boats still waited',
      mark: ';',
    },
    misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Replace the comma splice with a semi-colon.',
    stem: 'The rain eased, the match could continue.',
    model: 'The rain eased; the match could continue.',
    validator: {
      type: 'requiresBoundaryBetweenClauses',
      left: 'The rain eased',
      right: 'the match could continue',
      mark: ';',
    },
    misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Replace the comma splice with a semi-colon.',
    stem: 'The clock stopped, the class kept working.',
    model: 'The clock stopped; the class kept working.',
    validator: {
      type: 'requiresBoundaryBetweenClauses',
      left: 'The clock stopped',
      right: 'the class kept working',
      mark: ';',
    },
    misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Replace the comma splice with a semi-colon.',
    stem: 'The path was narrow, the hikers walked slowly.',
    model: 'The path was narrow; the hikers walked slowly.',
    validator: {
      type: 'requiresBoundaryBetweenClauses',
      left: 'The path was narrow',
      right: 'the hikers walked slowly',
      mark: ';',
    },
    misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  // ─── Capacity expansion (indices 4-7) ────────────────────────────────────────
  {
    prompt: 'Replace the comma splice with a semi-colon.',
    stem: 'The wind howled, the shutters rattled loudly.',
    model: 'The wind howled; the shutters rattled loudly.',
    validator: {
      type: 'requiresBoundaryBetweenClauses',
      left: 'The wind howled',
      right: 'the shutters rattled loudly',
      mark: ';',
    },
    misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Replace the comma splice with a semi-colon.',
    stem: 'The sun set, the bats emerged from the cave.',
    model: 'The sun set; the bats emerged from the cave.',
    validator: {
      type: 'requiresBoundaryBetweenClauses',
      left: 'The sun set',
      right: 'the bats emerged from the cave',
      mark: ';',
    },
    misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Fix the comma splice by using a semi-colon.',
    stem: 'The river rose, the villagers moved to higher ground.',
    model: 'The river rose; the villagers moved to higher ground.',
    validator: {
      type: 'requiresBoundaryBetweenClauses',
      left: 'The river rose',
      right: 'the villagers moved to higher ground',
      mark: ';',
    },
    misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
    readiness: ['proofreading', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Replace the comma splice with a semi-colon.',
    stem: 'The bell chimed, the children lined up quietly.',
    model: 'The bell chimed; the children lined up quietly.',
    validator: {
      type: 'requiresBoundaryBetweenClauses',
      left: 'The bell chimed',
      right: 'the children lined up quietly',
      mark: ';',
    },
    misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
    readiness: ['proofreading', 'transfer', 'misconception', 'negative_test'],
  },
];

export const semicolonFixDsl = TEMPLATES.map((t, i) =>
  definePunctuationTemplate({
    id: `dsl_semicolon_fix_v${i}`,
    familyId: 'gen_semicolon_fix',
    mode: 'fix',
    skillIds: ['semicolon'],
    clusterId: 'boundary',
    rewardUnitId: 'semicolons-core',
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
        // Model answer (semicolon)
        t.model,
      ],
      reject: [
        // Original stem (comma splice)
        t.stem,
        // Full stop instead of semi-colon (two separate sentences)
        `${t.validator.left}. ${t.validator.right.charAt(0).toUpperCase()}${t.validator.right.slice(1)}.`,
        // Missing terminal full stop
        t.model.replace(/\.$/, ''),
      ],
    },
  }),
);
