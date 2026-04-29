import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * DSL definitions for gen_apostrophe_contractions_fix family.
 */

const EXPLANATION = 'The apostrophe shows where letters have been removed to shorten two words into one.';

const TEMPLATES = [
  {
    prompt: 'Correct the apostrophes in the contractions.',
    stem: 'We cant start because its raining.',
    model: "We can't start because it's raining.",
    explanation: EXPLANATION,
    misconceptionTags: ['apostrophe.contraction_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Correct the apostrophes in the contractions.',
    stem: 'Theyre sure we wont be late.',
    model: "They're sure we won't be late.",
    explanation: EXPLANATION,
    misconceptionTags: ['apostrophe.contraction_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Correct the apostrophes in the contractions.',
    stem: 'I dont think theyve finished.',
    model: "I don't think they've finished.",
    explanation: EXPLANATION,
    misconceptionTags: ['apostrophe.contraction_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Correct the apostrophes in the contractions.',
    stem: 'Youre sure he isnt coming.',
    model: "You're sure he isn't coming.",
    explanation: EXPLANATION,
    misconceptionTags: ['apostrophe.contraction_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Correct the missing apostrophes in the contractions.',
    stem: 'We havent checked because the phones arent working.',
    model: "We haven't checked because the phones aren't working.",
    explanation: EXPLANATION,
    misconceptionTags: ['apostrophe.contraction_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Fix only the contraction apostrophes.',
    stem: 'Itll be easier if youre ready.',
    model: "It'll be easier if you're ready.",
    explanation: EXPLANATION,
    misconceptionTags: ['apostrophe.contraction_missing'],
    readiness: ['proofreading', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Proofread the sentence and repair the contractions.',
    stem: 'They didnt know we couldnt see.',
    model: "They didn't know we couldn't see.",
    explanation: EXPLANATION,
    misconceptionTags: ['apostrophe.contraction_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Rewrite with standard contraction punctuation.',
    stem: 'Shes sure it doesnt matter.',
    model: "She's sure it doesn't matter.",
    explanation: EXPLANATION,
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
      explanation: t.explanation,
      misconceptionTags: t.misconceptionTags,
      readiness: t.readiness,
    }),
    tests: {
      accept: [
        t.model,
        // Curly apostrophes are acceptable (canonical normalisation)
        t.model.replace(/'/g, '’'),
      ],
      reject: [
        // Original stem (missing apostrophes)
        t.stem,
        // Missing terminal full stop
        t.model.replace(/\.$/, ''),
        // Lowercase first letter
        t.model[0].toLowerCase() + t.model.slice(1),
      ],
    },
  }),
);
