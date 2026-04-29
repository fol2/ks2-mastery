import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * DSL definitions for gen_fronted_speech_paragraph family.
 * Templates 0-3: legacy parity (must match existing bank).
 * Templates 4-7: capacity expansion (new for P4-U8).
 */

const TEMPLATES = [
  // ─── Legacy parity (indices 0-3) ─────────────────────────────────────────────
  {
    prompt: 'Repair the punctuation in the short passage.',
    stem: 'Before lunch Zara asked can we start now',
    model: 'Before lunch, Zara asked, "Can we start now?"',
    skillIds: ['fronted_adverbial', 'speech'],
    clusterId: 'speech',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'startsWithPhraseComma',
          phrase: 'Before lunch',
          misconceptionTags: ['comma.fronted_adverbial_missing'],
        },
        {
          type: 'speechWithWords',
          words: 'can we start now',
          requiredTerminal: '?',
          misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
        },
      ],
    },
    misconceptionTags: ['comma.fronted_adverbial_missing', 'speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the punctuation in the short passage.',
    stem: 'After rehearsal Omar said the props are packed',
    model: 'After rehearsal, Omar said, "The props are packed."',
    skillIds: ['fronted_adverbial', 'speech'],
    clusterId: 'speech',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'startsWithPhraseComma',
          phrase: 'After rehearsal',
          misconceptionTags: ['comma.fronted_adverbial_missing'],
        },
        {
          type: 'speechWithWords',
          words: 'the props are packed',
          requiredTerminal: '.',
          misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
        },
      ],
    },
    misconceptionTags: ['comma.fronted_adverbial_missing', 'speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the punctuation in the short passage.',
    stem: 'During assembly Lina whispered please sit down',
    model: 'During assembly, Lina whispered, "Please sit down."',
    skillIds: ['fronted_adverbial', 'speech'],
    clusterId: 'speech',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'startsWithPhraseComma',
          phrase: 'During assembly',
          misconceptionTags: ['comma.fronted_adverbial_missing'],
        },
        {
          type: 'speechWithWords',
          words: 'please sit down',
          requiredTerminal: '.',
          misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
        },
      ],
    },
    misconceptionTags: ['comma.fronted_adverbial_missing', 'speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the punctuation in the short passage.',
    stem: 'At the gate Ben asked are we late',
    model: 'At the gate, Ben asked, "Are we late?"',
    skillIds: ['fronted_adverbial', 'speech'],
    clusterId: 'speech',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'startsWithPhraseComma',
          phrase: 'At the gate',
          misconceptionTags: ['comma.fronted_adverbial_missing'],
        },
        {
          type: 'speechWithWords',
          words: 'are we late',
          requiredTerminal: '?',
          misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
        },
      ],
    },
    misconceptionTags: ['comma.fronted_adverbial_missing', 'speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  // ─── Capacity expansion (indices 4-7) ────────────────────────────────────────
  {
    prompt: 'Repair the punctuation in the short passage.',
    stem: 'In the corridor Mia called wait for me',
    model: 'In the corridor, Mia called, "Wait for me!"',
    skillIds: ['fronted_adverbial', 'speech'],
    clusterId: 'speech',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'startsWithPhraseComma',
          phrase: 'In the corridor',
          misconceptionTags: ['comma.fronted_adverbial_missing'],
        },
        {
          type: 'speechWithWords',
          words: 'wait for me',
          requiredTerminal: '!',
          misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
        },
      ],
    },
    misconceptionTags: ['comma.fronted_adverbial_missing', 'speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the punctuation in the short passage.',
    stem: 'Near the pond Sam whispered look at the heron',
    model: 'Near the pond, Sam whispered, "Look at the heron."',
    skillIds: ['fronted_adverbial', 'speech'],
    clusterId: 'speech',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'startsWithPhraseComma',
          phrase: 'Near the pond',
          misconceptionTags: ['comma.fronted_adverbial_missing'],
        },
        {
          type: 'speechWithWords',
          words: 'look at the heron',
          requiredTerminal: '.',
          misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
        },
      ],
    },
    misconceptionTags: ['comma.fronted_adverbial_missing', 'speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the punctuation in the short passage.',
    stem: 'Behind the stage Kai asked where is my costume',
    model: 'Behind the stage, Kai asked, "Where is my costume?"',
    skillIds: ['fronted_adverbial', 'speech'],
    clusterId: 'speech',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'startsWithPhraseComma',
          phrase: 'Behind the stage',
          misconceptionTags: ['comma.fronted_adverbial_missing'],
        },
        {
          type: 'speechWithWords',
          words: 'where is my costume',
          requiredTerminal: '?',
          misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
        },
      ],
    },
    misconceptionTags: ['comma.fronted_adverbial_missing', 'speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
    readiness: ['constrained_transfer', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the punctuation in the short passage.',
    stem: 'Across the field Ava shouted come back here',
    model: 'Across the field, Ava shouted, "Come back here!"',
    skillIds: ['fronted_adverbial', 'speech'],
    clusterId: 'speech',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'startsWithPhraseComma',
          phrase: 'Across the field',
          misconceptionTags: ['comma.fronted_adverbial_missing'],
        },
        {
          type: 'speechWithWords',
          words: 'come back here',
          requiredTerminal: '!',
          misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
        },
      ],
    },
    misconceptionTags: ['comma.fronted_adverbial_missing', 'speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
    readiness: ['constrained_transfer', 'transfer', 'misconception', 'negative_test'],
  },
];

export const frontedSpeechParagraphDsl = TEMPLATES.map((t, i) =>
  definePunctuationTemplate({
    id: `dsl_fronted_speech_paragraph_v${i}`,
    familyId: 'gen_fronted_speech_paragraph',
    mode: 'paragraph',
    skillIds: t.skillIds,
    clusterId: t.clusterId,
    rewardUnitId: 'fronted-speech-core',
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
      misconceptionTags: t.misconceptionTags,
      readiness: t.readiness,
    }),
    tests: {
      accept: [
        t.model,
        // Smart/curly quotes with matched pairs acceptable
        t.model.replace(/"([^"]+)"/g, '"$1"'),
      ],
      reject: [
        // Original stem (no punctuation)
        t.stem,
        // Missing fronted adverbial comma (replace only first comma occurrence)
        (() => {
          const idx = t.model.indexOf(',');
          return t.model.slice(0, idx) + t.model.slice(idx + 1);
        })(),
        // Speech marks missing but commas present
        t.model.replace(/"/g, ''),
      ],
    },
  }),
);
