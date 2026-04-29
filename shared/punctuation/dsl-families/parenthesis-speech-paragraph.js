import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * DSL definitions for gen_parenthesis_speech_paragraph family.
 * Templates 0-3: legacy parity (must match existing bank).
 * Templates 4-7: capacity expansion (new for P4-U9).
 */

const TEMPLATES = [
  // ─── Legacy parity (indices 0-3) ─────────────────────────────────────────────
  {
    prompt: 'Repair the punctuation in the short passage.',
    stem: 'The harbour an old fishing port was busy. Ravi said the bell is ringing',
    model: 'The harbour, an old fishing port, was busy. Ravi said, "The bell is ringing."',
    skillIds: ['parenthesis', 'speech'],
    clusterId: 'structure',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresParentheticalPhrase',
          before: 'The harbour',
          phrase: 'an old fishing port',
          after: 'was busy',
          misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
        },
        {
          type: 'speechWithWords',
          words: 'the bell is ringing',
          requiredTerminal: '.',
          misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
        },
      ],
    },
    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced', 'speech.quote_missing', 'speech.reporting_comma_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the punctuation in the short passage.',
    stem: 'The tower a useful lookout stood above the bay. Mia asked where are the boats',
    model: 'The tower, a useful lookout, stood above the bay. Mia asked, "Where are the boats?"',
    skillIds: ['parenthesis', 'speech'],
    clusterId: 'structure',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresParentheticalPhrase',
          before: 'The tower',
          phrase: 'a useful lookout',
          after: 'stood above the bay',
          misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
        },
        {
          type: 'speechWithWords',
          words: 'where are the boats',
          requiredTerminal: '?',
          misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
        },
      ],
    },
    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced', 'speech.quote_missing', 'speech.reporting_comma_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the punctuation in the short passage.',
    stem: 'The library a quiet room closed early. Nina said we can come back tomorrow',
    model: 'The library, a quiet room, closed early. Nina said, "We can come back tomorrow."',
    skillIds: ['parenthesis', 'speech'],
    clusterId: 'structure',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresParentheticalPhrase',
          before: 'The library',
          phrase: 'a quiet room',
          after: 'closed early',
          misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
        },
        {
          type: 'speechWithWords',
          words: 'we can come back tomorrow',
          requiredTerminal: '.',
          misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
        },
      ],
    },
    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced', 'speech.quote_missing', 'speech.reporting_comma_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the punctuation in the short passage.',
    stem: 'Mr Patel our maths teacher smiled proudly. Leo asked did we win',
    model: 'Mr Patel, our maths teacher, smiled proudly. Leo asked, "Did we win?"',
    skillIds: ['parenthesis', 'speech'],
    clusterId: 'structure',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresParentheticalPhrase',
          before: 'Mr Patel',
          phrase: 'our maths teacher',
          after: 'smiled proudly',
          misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
        },
        {
          type: 'speechWithWords',
          words: 'did we win',
          requiredTerminal: '?',
          misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
        },
      ],
    },
    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced', 'speech.quote_missing', 'speech.reporting_comma_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  // ─── Capacity expansion (indices 4-7) ────────────────────────────────────────
  {
    prompt: 'Repair the punctuation in the short passage.',
    stem: 'The bridge a stone crossing swayed in the wind. Kai shouted hold on tight',
    model: 'The bridge, a stone crossing, swayed in the wind. Kai shouted, "Hold on tight!"',
    skillIds: ['parenthesis', 'speech'],
    clusterId: 'structure',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresParentheticalPhrase',
          before: 'The bridge',
          phrase: 'a stone crossing',
          after: 'swayed in the wind',
          misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
        },
        {
          type: 'speechWithWords',
          words: 'hold on tight',
          requiredTerminal: '!',
          misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
        },
      ],
    },
    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced', 'speech.quote_missing', 'speech.reporting_comma_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the punctuation in the short passage.',
    stem: 'The canal a narrow waterway ran beside the park. Zara said the ducks are nesting',
    model: 'The canal, a narrow waterway, ran beside the park. Zara said, "The ducks are nesting."',
    skillIds: ['parenthesis', 'speech'],
    clusterId: 'structure',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresParentheticalPhrase',
          before: 'The canal',
          phrase: 'a narrow waterway',
          after: 'ran beside the park',
          misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
        },
        {
          type: 'speechWithWords',
          words: 'the ducks are nesting',
          requiredTerminal: '.',
          misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
        },
      ],
    },
    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced', 'speech.quote_missing', 'speech.reporting_comma_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the punctuation in the short passage.',
    stem: 'Mrs Khan our head teacher opened the fete. Sam asked can we have another go',
    model: 'Mrs Khan, our head teacher, opened the fete. Sam asked, "Can we have another go?"',
    skillIds: ['parenthesis', 'speech'],
    clusterId: 'structure',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresParentheticalPhrase',
          before: 'Mrs Khan',
          phrase: 'our head teacher',
          after: 'opened the fete',
          misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
        },
        {
          type: 'speechWithWords',
          words: 'can we have another go',
          requiredTerminal: '?',
          misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
        },
      ],
    },
    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced', 'speech.quote_missing', 'speech.reporting_comma_missing'],
    readiness: ['constrained_transfer', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the punctuation in the short passage.',
    stem: 'The clock an ancient relic chimed at noon. Ava whispered it still works',
    model: 'The clock, an ancient relic, chimed at noon. Ava whispered, "It still works."',
    skillIds: ['parenthesis', 'speech'],
    clusterId: 'structure',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresParentheticalPhrase',
          before: 'The clock',
          phrase: 'an ancient relic',
          after: 'chimed at noon',
          misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
        },
        {
          type: 'speechWithWords',
          words: 'it still works',
          requiredTerminal: '.',
          misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
        },
      ],
    },
    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced', 'speech.quote_missing', 'speech.reporting_comma_missing'],
    readiness: ['constrained_transfer', 'transfer', 'misconception', 'negative_test'],
  },
];

export const parenthesisSpeechParagraphDsl = TEMPLATES.map((t, i) =>
  definePunctuationTemplate({
    id: `dsl_parenthesis_speech_paragraph_v${i}`,
    familyId: 'gen_parenthesis_speech_paragraph',
    mode: 'paragraph',
    skillIds: t.skillIds,
    clusterId: t.clusterId,
    rewardUnitId: 'parenthesis-core',
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
        // Model answer
        t.model,
        // Curly quotes acceptable (opening " → “, closing " → ”)
        t.model.replace(/"([^"]+)"/g, '“$1”'),
      ],
      reject: [
        // Original stem (all errors present)
        t.stem,
        // Parenthesis fixed but speech still broken
        (() => {
          const check0 = t.validator.checks[0];
          return `${check0.before}, ${check0.phrase}, ${check0.after}. ${t.stem.split('. ')[1]}`;
        })(),
        // Missing reporting comma before speech
        t.model.replace(', "', ' "'),
      ],
    },
  }),
);
