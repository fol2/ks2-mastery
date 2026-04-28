import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * DSL definitions for gen_apostrophe_contractions_fix family.
 */

const TEMPLATES = [
  {
    prompt: 'Correct the apostrophes in the contractions.',
    stem: 'We cant start because its raining.',
    model: "We can't start because it's raining.",
    misconceptionTags: ['apostrophe.contraction_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Correct the apostrophes in the contractions.',
    stem: 'Theyre sure we wont be late.',
    model: "They're sure we won't be late.",
    misconceptionTags: ['apostrophe.contraction_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Correct the apostrophes in the contractions.',
    stem: 'I dont think theyve finished.',
    model: "I don't think they've finished.",
    misconceptionTags: ['apostrophe.contraction_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Correct the apostrophes in the contractions.',
    stem: 'Youre sure he isnt coming.',
    model: "You're sure he isn't coming.",
    misconceptionTags: ['apostrophe.contraction_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Correct the missing apostrophes in the contractions.',
    stem: 'We havent checked because the phones arent working.',
    model: "We haven't checked because the phones aren't working.",
    misconceptionTags: ['apostrophe.contraction_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Fix only the contraction apostrophes.',
    stem: 'Itll be easier if youre ready.',
    model: "It'll be easier if you're ready.",
    misconceptionTags: ['apostrophe.contraction_missing'],
    readiness: ['proofreading', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Proofread the sentence and repair the contractions.',
    stem: 'They didnt know we couldnt see.',
    model: "They didn't know we couldn't see.",
    misconceptionTags: ['apostrophe.contraction_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Rewrite with standard contraction punctuation.',
    stem: 'Shes sure it doesnt matter.',
    model: "She's sure it doesn't matter.",
    misconceptionTags: ['apostrophe.contraction_missing'],
    readiness: ['proofreading', 'transfer', 'misconception', 'negative_test'],
  },
];

export const apostropheContractionsDsl = TEMPLATES.map((t, i) =>
  definePunctuationTemplate({
    id: `dsl_apostrophe_contractions_fix_v${i}`,
    familyId: 'gen_apostrophe_contractions_fix',
    mode: 'fix',
    skillIds: ['apostrophe_contractions'],
    clusterId: 'apostrophe',
    rewardUnitId: 'apostrophe-contractions-core',
    misconceptionTags: t.misconceptionTags,
    readiness: t.readiness,
    slots: { variant: [i] },
    build: () => ({
      prompt: t.prompt,
      stem: t.stem,
      model: t.model,
      misconceptionTags: t.misconceptionTags,
      readiness: t.readiness,
    }),
    tests: {
      accept: [t.model],
      reject: [t.stem],
    },
  }),
);
