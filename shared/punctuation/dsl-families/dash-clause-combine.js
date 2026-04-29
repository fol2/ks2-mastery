import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * DSL definitions for gen_dash_clause_combine family.
 */

const EXPLANATION = 'A dash separates two independent but related ideas, often adding surprise or contrast.';

const TEMPLATES = [
  {
    prompt: 'Combine the two related clauses into one sentence with a dash.',
    stem: 'The gate was stuck.\nWe found another path.',
    model: 'The gate was stuck – we found another path.',
    validator: { type: 'combineBoundaryBetweenClauses', left: 'The gate was stuck', right: 'we found another path', mark: '-' },
    explanation: EXPLANATION,

    misconceptionTags: ['boundary.dash_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the two related clauses into one sentence with a dash.',
    stem: 'The bell rang.\nEveryone hurried inside.',
    model: 'The bell rang – everyone hurried inside.',
    validator: { type: 'combineBoundaryBetweenClauses', left: 'The bell rang', right: 'everyone hurried inside', mark: '-' },
    explanation: EXPLANATION,

    misconceptionTags: ['boundary.dash_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the two related clauses into one sentence with a dash.',
    stem: 'The torch failed.\nWe used the lantern.',
    model: 'The torch failed – we used the lantern.',
    validator: { type: 'combineBoundaryBetweenClauses', left: 'The torch failed', right: 'we used the lantern', mark: '-' },
    explanation: EXPLANATION,

    misconceptionTags: ['boundary.dash_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the two related clauses into one sentence with a dash.',
    stem: 'The bridge was closed.\nThe buses turned back.',
    model: 'The bridge was closed – the buses turned back.',
    validator: { type: 'combineBoundaryBetweenClauses', left: 'The bridge was closed', right: 'the buses turned back', mark: '-' },
    explanation: EXPLANATION,

    misconceptionTags: ['boundary.dash_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the sudden shift into one sentence with a dash.',
    stem: 'The waves grew louder.\nWe stepped back.',
    model: 'The waves grew louder – we stepped back.',
    validator: { type: 'combineBoundaryBetweenClauses', left: 'The waves grew louder', right: 'we stepped back', mark: '-' },
    explanation: EXPLANATION,

    misconceptionTags: ['boundary.dash_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Join the surprise with a dash.',
    stem: 'The door opened.\nNobody spoke.',
    model: 'The door opened – nobody spoke.',
    validator: { type: 'combineBoundaryBetweenClauses', left: 'The door opened', right: 'nobody spoke', mark: '-' },
    explanation: EXPLANATION,

    misconceptionTags: ['boundary.dash_missing'],
    readiness: ['constrained_transfer', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Use one dash to combine the clauses.',
    stem: 'The signal vanished.\nThe team waited.',
    model: 'The signal vanished – the team waited.',
    validator: { type: 'combineBoundaryBetweenClauses', left: 'The signal vanished', right: 'the team waited', mark: '-' },
    explanation: EXPLANATION,

    misconceptionTags: ['boundary.dash_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Combine the two ideas with a dash.',
    stem: 'The path ended.\nWe climbed over the stile.',
    model: 'The path ended – we climbed over the stile.',
    validator: { type: 'combineBoundaryBetweenClauses', left: 'The path ended', right: 'we climbed over the stile', mark: '-' },
    explanation: EXPLANATION,

    misconceptionTags: ['boundary.dash_missing'],
    readiness: ['constrained_transfer', 'transfer', 'misconception', 'negative_test'],
  },
];

export const dashClauseCombineDsl = TEMPLATES.map((t, i) =>
  definePunctuationTemplate({
    id: `dsl_dash_clause_combine_v${i}`,
    familyId: 'gen_dash_clause_combine',
    mode: 'combine',
    skillIds: ['dash_clause'],
    clusterId: 'boundary',
    rewardUnitId: 'dash-clauses-core',
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
        // En dash (model)
        t.model,
        // Spaced hyphen
        t.model.replace(' – ', ' - '),
        // Em dash
        t.model.replace(' – ', ' — '),
      ],
      reject: [
        // Original two-sentence stem (not combined)
        t.stem,
        // Comma splice instead of dash
        `${t.validator.left}, ${t.validator.right}.`,
        // Dash present but clauses reversed
        `${t.validator.right} – ${t.validator.left}.`,
      ],
    },
  }),
);
