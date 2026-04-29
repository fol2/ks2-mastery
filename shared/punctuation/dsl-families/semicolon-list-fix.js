import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * DSL definitions for gen_semicolon_list_fix family.
 */

const EXPLANATION = 'Semicolons separate complex list items that already contain commas, keeping each group clear.';

const TEMPLATES = [
  {
    prompt: 'Use semi-colons to separate the complex list items.',
    stem: 'We visited Dover, England, Lyon, France and Porto, Portugal.',
    model: 'We visited Dover, England; Lyon, France; and Porto, Portugal.',
    validator: { type: 'requiresSemicolonList', items: ['Dover, England', 'Lyon, France', 'Porto, Portugal'] },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.semicolon_list_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Use semi-colons to separate the complex list items.',
    stem: 'The winners were Aria, Year 5, Noah, Year 6 and Sam, Year 4.',
    model: 'The winners were Aria, Year 5; Noah, Year 6; and Sam, Year 4.',
    validator: { type: 'requiresSemicolonList', items: ['Aria, Year 5', 'Noah, Year 6', 'Sam, Year 4'] },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.semicolon_list_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Use semi-colons to separate the complex list items.',
    stem: 'The stalls sold apples, Kent, pears, Devon and berries, Wales.',
    model: 'The stalls sold apples, Kent; pears, Devon; and berries, Wales.',
    validator: { type: 'requiresSemicolonList', items: ['apples, Kent', 'pears, Devon', 'berries, Wales'] },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.semicolon_list_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Use semi-colons to separate the complex list items.',
    stem: 'The clubs met in Leeds, Monday, York, Tuesday and Bath, Friday.',
    model: 'The clubs met in Leeds, Monday; York, Tuesday; and Bath, Friday.',
    validator: { type: 'requiresSemicolonList', items: ['Leeds, Monday', 'York, Tuesday', 'Bath, Friday'] },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.semicolon_list_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Use semi-colons to separate the complex list items.',
    stem: 'The survey covered Cardiff, Wales, Belfast, Northern Ireland and Truro, Cornwall.',
    model: 'The survey covered Cardiff, Wales; Belfast, Northern Ireland; and Truro, Cornwall.',
    validator: { type: 'requiresSemicolonList', items: ['Cardiff, Wales', 'Belfast, Northern Ireland', 'Truro, Cornwall'] },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.semicolon_list_missing'],
    readiness: ['proofreading', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Correct the separators in the complex list.',
    stem: 'The teams were Falcons, Year 5, Otters, Year 6 and Kites, Year 4.',
    model: 'The teams were Falcons, Year 5; Otters, Year 6; and Kites, Year 4.',
    validator: { type: 'requiresSemicolonList', items: ['Falcons, Year 5', 'Otters, Year 6', 'Kites, Year 4'] },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.semicolon_list_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Rewrite the complex list with semi-colons between the larger items.',
    stem: 'The boxes contained shells, blue, pebbles, grey and glass, green.',
    model: 'The boxes contained shells, blue; pebbles, grey; and glass, green.',
    validator: { type: 'requiresSemicolonList', items: ['shells, blue', 'pebbles, grey', 'glass, green'] },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.semicolon_list_missing'],
    readiness: ['proofreading', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add semi-colons so each complex list item stays clear.',
    stem: 'The route stopped at Exeter, station one, Bristol, station two and Reading, station three.',
    model: 'The route stopped at Exeter, station one; Bristol, station two; and Reading, station three.',
    validator: { type: 'requiresSemicolonList', items: ['Exeter, station one', 'Bristol, station two', 'Reading, station three'] },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.semicolon_list_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
];

export const semicolonListFixDsl = TEMPLATES.map((t, i) =>
  definePunctuationTemplate({
    id: `dsl_semicolon_list_fix_v${i}`,
    familyId: 'gen_semicolon_list_fix',
    mode: 'fix',
    skillIds: ['semicolon_list'],
    clusterId: 'structure',
    rewardUnitId: 'semicolon-lists-core',
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
        t.model,
      ],
      reject: [
        // Original stem (comma-only, no semicolons)
        t.stem,
        // Commas between complex items instead of semicolons
        t.model.replace(/; /g, ', '),
        // Missing terminal full stop
        t.model.replace(/\.$/, ''),
      ],
    },
  }),
);
