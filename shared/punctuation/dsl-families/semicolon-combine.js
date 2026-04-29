import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * DSL definitions for gen_semicolon_combine family.
 * Templates 0-3: legacy parity (must match existing bank).
 * Templates 4-7: capacity expansion (new for P4-U10).
 */

const TEMPLATES = [
  // ─── Legacy parity (indices 0-3) ─────────────────────────────────────────────
  {
    prompt: 'Combine the two related clauses into one sentence with a semi-colon.',
    stem: 'The lighthouse was bright.\nThe boats still waited.',
    model: 'The lighthouse was bright; the boats still waited.',
    validator: {
      type: 'combineBoundaryBetweenClauses',
      left: 'The lighthouse was bright',
      right: 'the boats still waited',
      mark: ';',
    },
    misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the two related clauses into one sentence with a semi-colon.',
    stem: 'The rain eased.\nThe match could continue.',
    model: 'The rain eased; the match could continue.',
    validator: {
      type: 'combineBoundaryBetweenClauses',
      left: 'The rain eased',
      right: 'the match could continue',
      mark: ';',
    },
    misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the two related clauses into one sentence with a semi-colon.',
    stem: 'The clock stopped.\nThe class kept working.',
    model: 'The clock stopped; the class kept working.',
    validator: {
      type: 'combineBoundaryBetweenClauses',
      left: 'The clock stopped',
      right: 'the class kept working',
      mark: ';',
    },
    misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the two related clauses into one sentence with a semi-colon.',
    stem: 'The path was narrow.\nThe hikers walked slowly.',
    model: 'The path was narrow; the hikers walked slowly.',
    validator: {
      type: 'combineBoundaryBetweenClauses',
      left: 'The path was narrow',
      right: 'the hikers walked slowly',
      mark: ';',
    },
    misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  // ─── Capacity expansion (indices 4-7) ────────────────────────────────────────
  {
    prompt: 'Combine the two related clauses into one sentence with a semi-colon.',
    stem: 'The wind howled.\nThe shutters rattled loudly.',
    model: 'The wind howled; the shutters rattled loudly.',
    validator: {
      type: 'combineBoundaryBetweenClauses',
      left: 'The wind howled',
      right: 'the shutters rattled loudly',
      mark: ';',
    },
    misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the two related clauses into one sentence with a semi-colon.',
    stem: 'The sun set.\nThe bats emerged from the cave.',
    model: 'The sun set; the bats emerged from the cave.',
    validator: {
      type: 'combineBoundaryBetweenClauses',
      left: 'The sun set',
      right: 'the bats emerged from the cave',
      mark: ';',
    },
    misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Join the two related sentences with a semi-colon.',
    stem: 'The river rose.\nThe villagers moved to higher ground.',
    model: 'The river rose; the villagers moved to higher ground.',
    validator: {
      type: 'combineBoundaryBetweenClauses',
      left: 'The river rose',
      right: 'the villagers moved to higher ground',
      mark: ';',
    },
    misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
    readiness: ['constrained_transfer', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the two related clauses into one sentence with a semi-colon.',
    stem: 'The bell chimed.\nThe children lined up quietly.',
    model: 'The bell chimed; the children lined up quietly.',
    validator: {
      type: 'combineBoundaryBetweenClauses',
      left: 'The bell chimed',
      right: 'the children lined up quietly',
      mark: ';',
    },
    misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
    readiness: ['constrained_transfer', 'transfer', 'misconception', 'negative_test'],
  },
];

export const semicolonCombineDsl = TEMPLATES.map((t, i) =>
  definePunctuationTemplate({
    id: `dsl_semicolon_combine_v${i}`,
    familyId: 'gen_semicolon_combine',
    mode: 'combine',
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
        // Original stem (two separate sentences)
        t.stem,
        // Comma splice (wrong connector)
        `${t.validator.left}, ${t.validator.right}.`,
        // Missing terminal full stop
        t.model.replace(/\.$/, ''),
      ],
    },
  }),
);
