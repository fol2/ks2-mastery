// Grammar non-scored transfer-writing catalogue (U7).
//
// This module is Worker-only. The React surface must consume transfer prompts
// via the read model, never by importing this file directly — the production
// bundle audit (scripts/audit-client-bundle.mjs) should flag any browser-side
// import of `worker/src/subjects/grammar/transfer-prompts.js`.
//
// Per docs/grammar-transfer-decision.md, the transfer lane is non-scored.
// These prompts share the intent of U5's `manualReviewOnly` answerSpec kind
// (no auto-marking) but do not produce answerSpec objects themselves — saves
// go through a bespoke save-transfer-evidence Worker command that is isolated
// from the scored evaluateAnswer path entirely. The learner writes a
// paragraph, the platform saves evidence with self-assessment flags, and an
// adult reviews it later. The lane never mutates mastery, retryQueue, reward
// projection, or Concordium progress.

export const GRAMMAR_TRANSFER_MAX_PROMPTS = 20;
export const GRAMMAR_TRANSFER_HISTORY_PER_PROMPT = 5;
export const GRAMMAR_TRANSFER_WRITING_CAP = 2000;
export const GRAMMAR_TRANSFER_CHECKLIST_CAP = 24;

export const GRAMMAR_TRANSFER_PROMPTS = Object.freeze([
  Object.freeze({
    id: 'storm-scene',
    title: 'Describe a storm',
    brief: 'Write a short paragraph (3-5 sentences) describing a storm rolling in.',
    grammarTargets: ['adverbials', 'parenthesis_commas', 'relative_clauses'],
    checklist: Object.freeze([
      'Use at least one fronted adverbial (e.g., "Suddenly,").',
      'Use one pair of commas for parenthesis.',
      'Use one relative clause (starting with who, which, or that).',
    ]),
    reviewCopy: 'Teacher or parent: check for the three grammar targets and for whether the paragraph reads as a cohesive scene.',
  }),
  Object.freeze({
    id: 'market-stall',
    title: 'At the market stall',
    brief: 'Write 3-5 sentences about a busy market stall. Include a character voice.',
    grammarTargets: ['noun_phrases', 'speech_punctuation', 'tense_aspect'],
    checklist: Object.freeze([
      'Use one expanded noun phrase with at least two describing words.',
      'Use one line of direct speech with correct punctuation.',
      'Keep the tense consistent across the paragraph.',
    ]),
    reviewCopy: 'Teacher or parent: check expanded noun phrase, speech punctuation, and tense consistency.',
  }),
  Object.freeze({
    id: 'letter-opening',
    title: 'Formal letter opening',
    brief: 'Write the opening paragraph of a formal letter asking to visit a museum.',
    grammarTargets: ['formality', 'standard_english', 'subject_object'],
    checklist: Object.freeze([
      'Use Standard English throughout (no contractions).',
      'Keep the tone formal and polite.',
      'Use a clear subject-verb pairing in every sentence.',
    ]),
    reviewCopy: 'Teacher or parent: check formal register, Standard English, and clear subject-object pairings.',
  }),
  Object.freeze({
    id: 'explain-decision',
    title: 'Explain a decision',
    brief: 'Write 3-5 sentences explaining a decision your character made and why.',
    grammarTargets: ['clauses', 'modal_verbs', 'pronouns_cohesion'],
    checklist: Object.freeze([
      'Use one subordinate clause with because, although, or when.',
      'Use at least one modal verb (could, should, might).',
      'Use pronouns that make it clear who is doing what.',
    ]),
    reviewCopy: 'Teacher or parent: check subordinate clause construction, modal verb usage, and pronoun clarity.',
  }),
  Object.freeze({
    id: 'ad-for-toy',
    title: 'Advert for a new toy',
    brief: 'Write 3-5 sentences that advertise a new toy to other KS2 readers.',
    grammarTargets: ['active_passive', 'hyphen_ambiguity', 'apostrophes_possession'],
    checklist: Object.freeze([
      'Use the active voice for action sentences.',
      'Use one hyphenated compound adjective (e.g., "easy-to-build").',
      'Use one possessive apostrophe correctly.',
    ]),
    reviewCopy: 'Teacher or parent: check active voice, hyphenation, and possession apostrophes.',
  }),
]);

export const GRAMMAR_TRANSFER_PROMPT_IDS = Object.freeze(
  GRAMMAR_TRANSFER_PROMPTS.map((prompt) => prompt.id),
);

export function grammarTransferPromptById(id) {
  return GRAMMAR_TRANSFER_PROMPTS.find((prompt) => prompt.id === id) || null;
}

// Redacted view suitable for browser read-model emission. Excludes the
// reviewCopy (adult-only) and freezes the nested arrays.
export function grammarTransferPromptSummary(prompt) {
  if (!prompt) return null;
  return Object.freeze({
    id: prompt.id,
    title: prompt.title,
    brief: prompt.brief,
    grammarTargets: prompt.grammarTargets.slice(),
    checklist: prompt.checklist.slice(),
  });
}
