// Browser-safe Reading metadata. Do not import passage, question or marking
// content here; the production client may consume this module directly.
export const READING_CONTENT_RELEASE_ID = 'reading-poc-promoted-2026-05-05';
export const READING_CONTENT_VERSION = 2;

export const READING_SKILLS = Object.freeze({
  '2a': {
    name: 'Vocabulary in context',
    domain: 'KS2 content domain 2a',
  },
  '2b': {
    name: 'Retrieve and record information',
    domain: 'KS2 content domain 2b',
  },
  '2c': {
    name: 'Summarise main ideas',
    domain: 'KS2 content domain 2c',
  },
  '2d': {
    name: 'Inference with evidence',
    domain: 'KS2 content domain 2d',
  },
  '2e': {
    name: 'Prediction',
    domain: 'KS2 content domain 2e',
  },
  '2f': {
    name: 'How structure contributes',
    domain: 'KS2 content domain 2f',
  },
  '2g': {
    name: 'Author word or phrase choices',
    domain: 'KS2 content domain 2g',
  },
  '2h': {
    name: 'Make comparisons within a text',
    domain: 'KS2 content domain 2h',
  },
  P1: {
    name: 'Punctuation for pausing and meaning',
    domain: 'Punctuation support strand',
  },
  P2: {
    name: 'Speech punctuation and voice',
    domain: 'Punctuation support strand',
  },
  P3: {
    name: 'Parenthesis, dashes and brackets',
    domain: 'Punctuation support strand',
  },
  P4: {
    name: 'Colon, semicolon and list punctuation',
    domain: 'Punctuation support strand',
  },
});

export const READING_QUESTION_TYPE_LABELS = Object.freeze({
  mcq: 'Multiple choice',
  short: 'Short answer',
  evidenceShort: 'Answer + evidence',
  open: 'Short written explanation',
  multiSelect: 'Choose all that apply',
  match: 'Matching',
  order: 'Ordering',
});

export const READING_GENRES = Object.freeze(['fiction', 'non-fiction', 'poetry']);
export const READING_MODES = Object.freeze(['guided', 'core', 'smart', 'evidence', 'vocab', 'inference', 'punct', 'stamina', 'test']);

export function readingContentSummary() {
  return {
    releaseId: READING_CONTENT_RELEASE_ID,
    version: READING_CONTENT_VERSION,
    passageCount: 21,
    questionCount: 182,
    paperCount: 12,
    skillCount: Object.keys(READING_SKILLS).length,
    genres: {
      fiction: 8,
      'non-fiction': 8,
      poetry: 5,
    },
    longPassageCount: 7,
  };
}
