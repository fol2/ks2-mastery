import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * DSL definitions for gen_comma_clarity_insert family.
 */

const TEMPLATES = [
  {
    prompt: 'Add the comma that makes the meaning clear.',
    stem: 'In the evening the harbour was quiet.',
    model: 'In the evening, the harbour was quiet.',
    validator: { type: 'startsWithPhraseComma', phrase: 'In the evening' },
    misconceptionTags: ['comma.clarity_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the comma that makes the meaning clear.',
    stem: 'When the mist lifted the tower appeared.',
    model: 'When the mist lifted, the tower appeared.',
    validator: { type: 'startsWithPhraseComma', phrase: 'When the mist lifted' },
    misconceptionTags: ['comma.clarity_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the comma that makes the meaning clear.',
    stem: 'Without a map the walkers lost time.',
    model: 'Without a map, the walkers lost time.',
    validator: { type: 'startsWithPhraseComma', phrase: 'Without a map' },
    misconceptionTags: ['comma.clarity_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the comma that makes the meaning clear.',
    stem: 'As the whistle blew the teams lined up.',
    model: 'As the whistle blew, the teams lined up.',
    validator: { type: 'startsWithPhraseComma', phrase: 'As the whistle blew' },
    misconceptionTags: ['comma.clarity_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the comma after the opening phrase to avoid a misread.',
    stem: 'After the final whistle the crowd cheered.',
    model: 'After the final whistle, the crowd cheered.',
    validator: { type: 'startsWithPhraseComma', phrase: 'After the final whistle' },
    misconceptionTags: ['comma.clarity_missing'],
    readiness: ['insertion', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Correct the missing clarity comma.',
    stem: 'If the alarm sounds the class will line up.',
    model: 'If the alarm sounds, the class will line up.',
    validator: { type: 'startsWithPhraseComma', phrase: 'If the alarm sounds' },
    misconceptionTags: ['comma.clarity_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Rewrite with the clarity comma in the right place.',
    stem: 'Near the old bridge the lane narrows.',
    model: 'Near the old bridge, the lane narrows.',
    validator: { type: 'startsWithPhraseComma', phrase: 'Near the old bridge' },
    misconceptionTags: ['comma.clarity_missing'],
    readiness: ['insertion', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the comma that separates the opening clause from the main clause.',
    stem: 'Because the path flooded the cyclists turned back.',
    model: 'Because the path flooded, the cyclists turned back.',
    validator: { type: 'startsWithPhraseComma', phrase: 'Because the path flooded' },
    misconceptionTags: ['comma.clarity_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
];

export const commaClarityInsertDsl = TEMPLATES.map((t, i) =>
  definePunctuationTemplate({
    id: `dsl_comma_clarity_insert_v${i}`,
    familyId: 'gen_comma_clarity_insert',
    mode: 'insert',
    skillIds: ['comma_clarity'],
    clusterId: 'comma_flow',
    rewardUnitId: 'comma-clarity-core',
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
