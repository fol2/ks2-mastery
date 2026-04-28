import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * DSL definitions for gen_dash_clause_fix family.
 */

const TEMPLATES = [
  {
    prompt: 'Add a dash between the related clauses.',
    stem: 'The gate was stuck we found another path.',
    model: 'The gate was stuck – we found another path.',
    validator: { type: 'requiresBoundaryBetweenClauses', left: 'The gate was stuck', right: 'we found another path', mark: '-' },
    misconceptionTags: ['boundary.dash_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add a dash between the related clauses.',
    stem: 'The bell rang everyone hurried inside.',
    model: 'The bell rang – everyone hurried inside.',
    validator: { type: 'requiresBoundaryBetweenClauses', left: 'The bell rang', right: 'everyone hurried inside', mark: '-' },
    misconceptionTags: ['boundary.dash_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add a dash between the related clauses.',
    stem: 'The torch failed we used the lantern.',
    model: 'The torch failed – we used the lantern.',
    validator: { type: 'requiresBoundaryBetweenClauses', left: 'The torch failed', right: 'we used the lantern', mark: '-' },
    misconceptionTags: ['boundary.dash_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add a dash between the related clauses.',
    stem: 'The bridge was closed the buses turned back.',
    model: 'The bridge was closed – the buses turned back.',
    validator: { type: 'requiresBoundaryBetweenClauses', left: 'The bridge was closed', right: 'the buses turned back', mark: '-' },
    misconceptionTags: ['boundary.dash_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add a dash to mark the sudden shift.',
    stem: 'The waves grew louder we stepped back.',
    model: 'The waves grew louder – we stepped back.',
    validator: { type: 'requiresBoundaryBetweenClauses', left: 'The waves grew louder', right: 'we stepped back', mark: '-' },
    misconceptionTags: ['boundary.dash_missing'],
    readiness: ['proofreading', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Replace the run-on join with a dash.',
    stem: 'The door opened nobody spoke.',
    model: 'The door opened – nobody spoke.',
    validator: { type: 'requiresBoundaryBetweenClauses', left: 'The door opened', right: 'nobody spoke', mark: '-' },
    misconceptionTags: ['boundary.dash_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Use a dash to connect the surprise.',
    stem: 'The signal vanished the team waited.',
    model: 'The signal vanished – the team waited.',
    validator: { type: 'requiresBoundaryBetweenClauses', left: 'The signal vanished', right: 'the team waited', mark: '-' },
    misconceptionTags: ['boundary.dash_missing'],
    readiness: ['proofreading', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the dash between the two related ideas.',
    stem: 'The path ended we climbed over the stile.',
    model: 'The path ended – we climbed over the stile.',
    validator: { type: 'requiresBoundaryBetweenClauses', left: 'The path ended', right: 'we climbed over the stile', mark: '-' },
    misconceptionTags: ['boundary.dash_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
];

export const dashClauseFixDsl = TEMPLATES.map((t, i) =>
  definePunctuationTemplate({
    id: `dsl_dash_clause_fix_v${i}`,
    familyId: 'gen_dash_clause_fix',
    mode: 'fix',
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
      misconceptionTags: t.misconceptionTags,
      readiness: t.readiness,
    }),
    tests: {
      accept: [t.model],
      reject: [t.stem],
    },
  }),
);
