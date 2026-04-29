import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * DSL definitions for gen_apostrophe_mix_paragraph family.
 * Templates 0-3: legacy parity (must match existing bank).
 * Templates 4-7: capacity expansion (new for P4-U8).
 */

const EXPLANATION = 'The apostrophe marks contractions where letters are missing and possession where something belongs to a noun.';
const EXPLANATION_RULE_ID = 'apostrophe.possession-mixed';

const TEMPLATES = [
  // ─── Legacy parity (indices 0-3) ─────────────────────────────────────────────
  {
    prompt: 'Repair the apostrophes in the short passage.',
    stem: 'We wont move the childrens paintings. The teachers notes are ready.',
    model: "We won't move the children's paintings. The teachers' notes are ready.",
    skillIds: ['apostrophe_contractions', 'apostrophe_possession'],
    clusterId: 'apostrophe',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresApostropheForms',
          tokens: ["won't", "children's", "teachers' notes"],
          forbidden: ['wont', 'childrens', 'teachers notes'],    explanation: EXPLANATION,

          misconceptionTags: ['apostrophe.contraction_missing', 'apostrophe.possession_missing', 'apostrophe.possession_number'],
        },
      ],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['apostrophe.contraction_missing', 'apostrophe.possession_missing', 'apostrophe.possession_number'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the apostrophes in the short passage.',
    stem: 'I cant find the mens boots. The boys jackets are drying.',
    model: "I can't find the men's boots. The boys' jackets are drying.",
    skillIds: ['apostrophe_contractions', 'apostrophe_possession'],
    clusterId: 'apostrophe',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresApostropheForms',
          tokens: ["can't", "men's", "boys' jackets"],
          forbidden: ['cant', 'mens', 'boys jackets'],    explanation: EXPLANATION,

          misconceptionTags: ['apostrophe.contraction_missing', 'apostrophe.possession_missing', 'apostrophe.possession_number'],
        },
      ],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['apostrophe.contraction_missing', 'apostrophe.possession_missing', 'apostrophe.possession_number'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the apostrophes in the short passage.',
    stem: 'Theyre checking the captains map. We dont know the teams plan.',
    model: "They're checking the captain's map. We don't know the team's plan.",
    skillIds: ['apostrophe_contractions', 'apostrophe_possession'],
    clusterId: 'apostrophe',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresApostropheForms',
          tokens: ["they're", "captain's", "don't", "team's"],
          forbidden: ['theyre', 'captains', 'dont', 'teams plan'],    explanation: EXPLANATION,

          misconceptionTags: ['apostrophe.contraction_missing', 'apostrophe.possession_missing'],
        },
      ],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['apostrophe.contraction_missing', 'apostrophe.possession_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the apostrophes in the short passage.',
    stem: 'She wont borrow the girls pencil. Its on the teachers shelf.',
    model: "She won't borrow the girl's pencil. It's on the teacher's shelf.",
    skillIds: ['apostrophe_contractions', 'apostrophe_possession'],
    clusterId: 'apostrophe',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresApostropheForms',
          tokens: ["won't", "girl's", "it's", "teacher's"],
          forbidden: ['wont', 'girls pencil', 'its', 'teachers shelf'],    explanation: EXPLANATION,

          misconceptionTags: ['apostrophe.contraction_missing', 'apostrophe.possession_missing'],
        },
      ],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['apostrophe.contraction_missing', 'apostrophe.possession_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  // ─── Capacity expansion (indices 4-7) ────────────────────────────────────────
  {
    prompt: 'Repair the apostrophes in the short passage.',
    stem: 'He doesnt need the drivers gloves. The passengers bags are packed.',
    model: "He doesn't need the driver's gloves. The passengers' bags are packed.",
    skillIds: ['apostrophe_contractions', 'apostrophe_possession'],
    clusterId: 'apostrophe',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresApostropheForms',
          tokens: ["doesn't", "driver's", "passengers' bags"],
          forbidden: ['doesnt', 'drivers', 'passengers bags'],    explanation: EXPLANATION,

          misconceptionTags: ['apostrophe.contraction_missing', 'apostrophe.possession_missing', 'apostrophe.possession_number'],
        },
      ],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['apostrophe.contraction_missing', 'apostrophe.possession_missing', 'apostrophe.possession_number'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the apostrophes in the short passage.',
    stem: 'They havent opened the nurses bag. The doctors notes are lost.',
    model: "They haven't opened the nurse's bag. The doctors' notes are lost.",
    skillIds: ['apostrophe_contractions', 'apostrophe_possession'],
    clusterId: 'apostrophe',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresApostropheForms',
          tokens: ["haven't", "nurse's", "doctors' notes"],
          forbidden: ['havent', 'nurses', 'doctors notes'],    explanation: EXPLANATION,

          misconceptionTags: ['apostrophe.contraction_missing', 'apostrophe.possession_missing', 'apostrophe.possession_number'],
        },
      ],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['apostrophe.contraction_missing', 'apostrophe.possession_missing', 'apostrophe.possession_number'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the apostrophes in the short passage.',
    stem: 'We shouldnt move the builders tools. The plumbers van is outside.',
    model: "We shouldn't move the builder's tools. The plumber's van is outside.",
    skillIds: ['apostrophe_contractions', 'apostrophe_possession'],
    clusterId: 'apostrophe',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresApostropheForms',
          tokens: ["shouldn't", "builder's", "plumber's"],
          forbidden: ['shouldnt', 'builders tools', 'plumbers van'],    explanation: EXPLANATION,

          misconceptionTags: ['apostrophe.contraction_missing', 'apostrophe.possession_missing'],
        },
      ],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['apostrophe.contraction_missing', 'apostrophe.possession_missing'],
    readiness: ['constrained_transfer', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the apostrophes in the short passage.',
    stem: 'Youre holding the cats bowl. The kittens bed isnt dry.',
    model: "You're holding the cat's bowl. The kitten's bed isn't dry.",
    skillIds: ['apostrophe_contractions', 'apostrophe_possession'],
    clusterId: 'apostrophe',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresApostropheForms',
          tokens: ["you're", "cat's", "kitten's", "isn't"],
          forbidden: ['youre', 'cats bowl', 'kittens bed', 'isnt'],    explanation: EXPLANATION,

          misconceptionTags: ['apostrophe.contraction_missing', 'apostrophe.possession_missing'],
        },
      ],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['apostrophe.contraction_missing', 'apostrophe.possession_missing'],
    readiness: ['constrained_transfer', 'transfer', 'misconception', 'negative_test'],
  },
];

export const apostropheMixParagraphDsl = TEMPLATES.map((t, i) =>
  definePunctuationTemplate({
    id: `dsl_apostrophe_mix_paragraph_v${i}`,
    familyId: 'gen_apostrophe_mix_paragraph',
    mode: 'paragraph',
    skillIds: t.skillIds,
    clusterId: t.clusterId,
    rewardUnitId: 'apostrophe-mixed-core',
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
        // Original stem (no apostrophes)
        t.stem,
        // Only contractions fixed, possessives still wrong
        (() => {
          const checks = t.validator.checks[0];
          // Produce stem with only the first token fixed
          let partial = t.stem;
          const first = checks.tokens[0];
          const firstBase = checks.forbidden[0];
          partial = partial.replace(firstBase, first);
          return partial;
        })(),
      ],
    },
  }),
);
