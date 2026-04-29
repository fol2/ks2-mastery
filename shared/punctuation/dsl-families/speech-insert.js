import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * DSL definitions for gen_speech_insert family.
 * Templates 0-3: legacy parity (must match existing bank).
 * Templates 4-7: capacity expansion (new for P4-U8).
 */

const TEMPLATES = [
  // ─── Legacy parity (indices 0-3) ─────────────────────────────────────────────
  {
    prompt: 'Add the direct-speech punctuation.',
    stem: 'Maya asked, can we start now?',
    model: 'Maya asked, "Can we start now?"',
    rubric: {
      type: 'speech',
      reportingPosition: 'before',
      spokenWords: 'can we start now',
      requiredTerminal: '?',
    },
    misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the direct-speech punctuation.',
    stem: 'Ravi said, the bell is ringing.',
    model: 'Ravi said, "The bell is ringing."',
    rubric: {
      type: 'speech',
      reportingPosition: 'before',
      spokenWords: 'the bell is ringing',
      requiredTerminal: '.',
    },
    misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the direct-speech punctuation.',
    stem: 'Lena whispered, keep the gate closed.',
    model: 'Lena whispered, "Keep the gate closed."',
    rubric: {
      type: 'speech',
      reportingPosition: 'before',
      spokenWords: 'keep the gate closed',
      requiredTerminal: '.',
    },
    misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the direct-speech punctuation.',
    stem: 'Tom asked, where did the map go?',
    model: 'Tom asked, "Where did the map go?"',
    rubric: {
      type: 'speech',
      reportingPosition: 'before',
      spokenWords: 'where did the map go',
      requiredTerminal: '?',
    },
    misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  // ─── Capacity expansion (indices 4-7) ────────────────────────────────────────
  {
    prompt: 'Add the direct-speech punctuation.',
    stem: 'Ella shouted, watch out for the wave!',
    model: 'Ella shouted, "Watch out for the wave!"',
    rubric: {
      type: 'speech',
      reportingPosition: 'before',
      spokenWords: 'watch out for the wave',
      requiredTerminal: '!',
    },
    misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the direct-speech punctuation.',
    stem: 'Sam replied, the path is clear.',
    model: 'Sam replied, "The path is clear."',
    rubric: {
      type: 'speech',
      reportingPosition: 'before',
      spokenWords: 'the path is clear',
      requiredTerminal: '.',
    },
    misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the direct-speech punctuation.',
    stem: 'Mia asked, is the door locked?',
    model: 'Mia asked, "Is the door locked?"',
    rubric: {
      type: 'speech',
      reportingPosition: 'before',
      spokenWords: 'is the door locked',
      requiredTerminal: '?',
    },
    misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
    readiness: ['insertion', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Add the direct-speech punctuation.',
    stem: 'Jake warned, stay behind the line.',
    model: 'Jake warned, "Stay behind the line."',
    rubric: {
      type: 'speech',
      reportingPosition: 'before',
      spokenWords: 'stay behind the line',
      requiredTerminal: '.',
    },
    misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
    readiness: ['insertion', 'transfer', 'misconception', 'negative_test'],
  },
];

export const speechInsertDsl = TEMPLATES.map((t, i) =>
  definePunctuationTemplate({
    id: `dsl_speech_insert_v${i}`,
    familyId: 'gen_speech_insert',
    mode: 'insert',
    skillIds: ['speech'],
    clusterId: 'speech',
    rewardUnitId: 'speech-core',
    misconceptionTags: t.misconceptionTags,
    readiness: t.readiness,
    slots: { variant: [i] },
    build: () => ({
      prompt: t.prompt,
      stem: t.stem,
      model: t.model,
      rubric: t.rubric,
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
        // Original stem (no speech marks)
        t.stem,
        // Quotes removed entirely
        t.model.replace(/"/g, ''),
        // Speech marks present but wrong terminal (swap . and ?)
        (() => {
          const terminal = t.rubric.requiredTerminal;
          const wrong = terminal === '?' ? '.' : '?';
          return t.model.slice(0, -2) + wrong + '"';
        })(),
      ],
    },
  }),
);
