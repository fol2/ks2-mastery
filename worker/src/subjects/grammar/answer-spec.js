// Grammar accepted-answer registry (U5).
//
// Every constructed-response template should eventually declare an `answerSpec`
// of the shape:
//   { kind, params, golden: string[], nearMiss?: string[] }
// where kind ∈ 'exact' | 'normalisedText' | 'acceptedSet' | 'punctuationPattern'
//            | 'multiField' | 'manualReviewOnly'
//
// The existing inline `accepted: [...]` arrays remain valid during the migration
// window: `markStringAnswer(respText, accepted, opts)` (content.js) constructs a
// transient `acceptedSet` spec and delegates to `markByAnswerSpec` here. That
// keeps the marking contract single-sourced without requiring an immediate
// migration of all ~20 constructed-response templates.
//
// `validateAnswerSpec` is exported for content-release tests that want to opt
// into strict per-template validation. It is not called automatically at module
// load — making it automatic would break the migration-window shape where
// `markStringAnswer` carries its own accepted array.

export const ANSWER_SPEC_KINDS = Object.freeze([
  'exact',
  'normalisedText',
  'acceptedSet',
  'punctuationPattern',
  'multiField',
  'manualReviewOnly',
]);

export const DEFAULT_MINIMAL_HINT = 'Check the sentence structure and the instruction again.';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeString(value) {
  return value == null ? '' : String(value);
}

function normaliseWhitespace(text) {
  return safeString(text).replace(/\s+/g, ' ').trim();
}

// P9 U8: iOS smart punctuation normalisation. iOS keyboards auto-replace
// straight quotes/apostrophes with typographic curly variants. For KS2
// learners typing on iPads, failing to mark their answer correct because
// of invisible Unicode substitutions is unfair. This normaliser maps
// curly left/right quotes, smart apostrophe, en-dash, and em-dash back
// to their ASCII equivalents before comparison.
export function normaliseSmartPunctuation(text) {
  return safeString(text)
    .replace(/[“”]/g, '"')   // curly double quotes → straight
    .replace(/[‘’]/g, "'")   // curly single quotes / smart apostrophe → ASCII
    .replace(/–/g, '-')           // en-dash → hyphen
    .replace(/—/g, '-');          // em-dash → hyphen
}

function caseFold(text) {
  return safeString(text).toLowerCase();
}

const GRAMMAR_LABEL_ARTICLE_CANONICALS = new Set([
  'active voice',
  'adjective',
  'adverb',
  'apostrophe',
  'bracket',
  'colon',
  'comma',
  'command',
  'conjunction',
  'dash',
  'determiner',
  'exclamation',
  'expanded noun phrase',
  'fronted adverbial',
  'hyphen',
  'main clause',
  'modal verb',
  'noun',
  'noun phrase',
  'object',
  'parenthesis',
  'passive voice',
  'preposition',
  'pronoun',
  'question',
  'relative clause',
  'semicolon',
  'sentence',
  'singular possession',
  'plural possession',
  'statement',
  'subject',
  'subordinate clause',
  'verb',
]);

function stripWrappingQuotes(text) {
  return safeString(text)
    .replace(/^[\s"'`]+|[\s"'`]+$/g, '')
    .trim();
}

function stripTerminalSentencePunctuation(text) {
  const value = safeString(text).trim();
  if (!value) return value;
  // Normalised-text answers are not used for punctuation-placement tasks.
  // Accept a learner's harmless final full stop/question/exclamation mark
  // without accepting missing internal punctuation in punctuationPattern tasks.
  return value.replace(/[.!?]+$/g, '').trim();
}

function stripGrammarLabelArticle(text) {
  const value = safeString(text).trim();
  const articleMatch = value.match(/^(?:a|an|the)\s+(.+)$/i);
  if (!articleMatch) return value;
  const candidate = articleMatch[1].trim();
  return GRAMMAR_LABEL_ARTICLE_CANONICALS.has(candidate.toLowerCase()) ? candidate : value;
}

export function normaliseGrammarAnswerText(text, { stripTerminalPunctuation = true, stripLabelArticle = true } = {}) {
  let value = normaliseWhitespace(normaliseSmartPunctuation(text));
  value = stripWrappingQuotes(value);
  if (stripTerminalPunctuation) value = stripTerminalSentencePunctuation(value);
  if (stripLabelArticle) value = stripGrammarLabelArticle(value);
  value = normaliseWhitespace(value);
  return caseFold(value);
}

function stripPunctuationForSet(text) {
  return normaliseGrammarAnswerText(
    safeString(text).replace(/[.,;:!?"'`]/g, ''),
    { stripTerminalPunctuation: false },
  );
}

function collapsePunctuationPattern(text) {
  // For punctuation-sensitive marking we normalise surrounding whitespace but
  // keep the punctuation characters themselves. Optional commas around
  // parentheticals are matched separately via `optionalCommas`.
  return normaliseWhitespace(safeString(text));
}

function compareExact(response, accepted) {
  return safeString(response) === safeString(accepted);
}

function compareLearnerEquivalentText(response, accepted, opts = {}) {
  return normaliseGrammarAnswerText(response, opts) === normaliseGrammarAnswerText(accepted, opts);
}

function compareNormalisedText(response, accepted) {
  return compareLearnerEquivalentText(response, accepted);
}

function compareAcceptedSet(response, acceptedList) {
  const candidate = normaliseGrammarAnswerText(response);
  return acceptedList.some((accepted) => normaliseGrammarAnswerText(accepted) === candidate);
}

function comparePunctuationPattern(response, accepted, { optionalCommas = false } = {}) {
  const candidate = collapsePunctuationPattern(response);
  const target = collapsePunctuationPattern(accepted);
  if (candidate === target) return true;
  if (optionalCommas) {
    // Accept the same sentence with surrounding commas stripped.
    const stripCommas = (text) => text.replace(/\s*,\s*/g, ' ').replace(/\s+/g, ' ').trim();
    if (stripCommas(candidate) === stripCommas(target)) return true;
  }
  return false;
}

function mkMarkResult({
  correct,
  score,
  maxScore,
  misconception,
  feedbackShort,
  feedbackLong,
  answerText,
  minimalHint,
  nonScored,
  manualReviewOnly,
}) {
  const normalisedCorrect = Boolean(correct);
  return {
    correct: normalisedCorrect,
    score: Number.isFinite(Number(score)) ? Number(score) : 0,
    maxScore: Number.isFinite(Number(maxScore)) ? Number(maxScore) : 1,
    misconception: misconception || null,
    feedbackShort: feedbackShort || (normalisedCorrect ? 'Correct.' : 'Not quite.'),
    feedbackLong: feedbackLong || '',
    answerText: safeString(answerText),
    // Default hint so direct callers (U7 transfer lane, future content-release
    // templates with declarative answerSpec) inherit the same shape the
    // legacy content.js mkResult guarantees. Adapter paths can still inject
    // a concept-specific hint via content.js markStringAnswer.
    minimalHint: minimalHint ?? DEFAULT_MINIMAL_HINT,
    ...(nonScored ? { nonScored: true } : {}),
    ...(manualReviewOnly ? { manualReviewOnly: true } : {}),
  };
}

function markExact(spec, response) {
  const accepted = Array.isArray(spec.golden) && spec.golden.length ? spec.golden[0] : '';
  const correct = compareExact(response, accepted);
  return mkMarkResult({
    correct,
    score: correct ? (spec.maxScore || 1) : 0,
    maxScore: spec.maxScore || 1,
    misconception: correct ? null : (spec.misconception || 'misread_question'),
    feedbackLong: spec.feedbackLong || (correct ? '' : `Correct answer: ${accepted}`),
    answerText: spec.answerText || accepted,
    minimalHint: spec.minimalHint,
  });
}

function markNormalisedText(spec, response) {
  const accepted = Array.isArray(spec.golden) && spec.golden.length ? spec.golden : [];
  const matched = accepted.find((entry) => compareNormalisedText(response, entry)) || null;
  const answerText = spec.answerText || matched || accepted[0] || '';
  const correct = Boolean(matched);
  return mkMarkResult({
    correct,
    score: correct ? (spec.maxScore || 1) : 0,
    maxScore: spec.maxScore || 1,
    misconception: correct ? null : (spec.misconception || 'misread_question'),
    feedbackLong: spec.feedbackLong || (correct ? '' : `Correct answer: ${accepted[0] || ''}`),
    answerText,
    minimalHint: spec.minimalHint,
  });
}

function markAcceptedSet(spec, response) {
  const accepted = Array.isArray(spec.golden) && spec.golden.length ? spec.golden : [];
  if (accepted.length === 0) {
    return mkMarkResult({
      correct: false,
      score: 0,
      maxScore: spec.maxScore || 1,
      misconception: 'marking_unavailable',
      feedbackLong: 'Accepted-answer list is empty.',
      answerText: '',
    });
  }
  const fullMarks = spec.maxScore || 2;
  // Full marks for exact or learner-equivalent text: case differences and
  // harmless outer quotes/articles around grammar labels and harmless terminal
  // sentence punctuation should not turn a correct Grammar answer into a
  // refusal. Grammar-critical punctuation remains covered by punctuationPattern.
  const candidate = safeString(response).trim();
  const exactMatch = accepted.find((entry) => safeString(entry).trim() === candidate)
    || accepted.find((entry) => compareLearnerEquivalentText(response, entry));
  if (exactMatch) {
    return mkMarkResult({
      correct: true,
      score: fullMarks,
      maxScore: fullMarks,
      feedbackLong: spec.feedbackLong || `Correct answer: ${accepted[0]}`,
      answerText: spec.answerText || exactMatch,
      minimalHint: spec.minimalHint,
    });
  }
  // Partial credit path (fullMarks > 1): normalised + punctuation-stripped match.
  // A learner who produced the same words but missed a comma/full-stop earns
  // (fullMarks - 1) with a punctuation-precision misconception tag.
  if (fullMarks > 1) {
    const responseStripped = stripPunctuationForSet(response);
    const bareMatch = accepted.find((entry) => stripPunctuationForSet(entry) === responseStripped);
    if (bareMatch) {
      return mkMarkResult({
        correct: false,
        score: fullMarks - 1,
        maxScore: fullMarks,
        misconception: spec.punctuationMisconception || 'punctuation_precision',
        feedbackShort: 'The grammar idea is close, but the exact punctuation or wording is not fully correct.',
        feedbackLong: spec.feedbackLong || `Correct answer: ${accepted[0]}`,
        answerText: spec.answerText || bareMatch,
        minimalHint: spec.minimalHint,
      });
    }
  }
  return mkMarkResult({
    correct: false,
    score: 0,
    maxScore: fullMarks,
    misconception: spec.misconception || 'misread_question',
    feedbackLong: spec.feedbackLong || `Correct answer: ${accepted[0]}`,
    answerText: spec.answerText || accepted[0],
    minimalHint: spec.minimalHint,
  });
}

function markPunctuationPattern(spec, response) {
  const accepted = Array.isArray(spec.golden) && spec.golden.length ? spec.golden : [];
  const compareParams = {
    optionalCommas: Boolean(spec.params?.optionalCommas),
  };
  const matched = accepted.find((entry) => comparePunctuationPattern(response, entry, compareParams)) || null;
  const correct = Boolean(matched);
  return mkMarkResult({
    correct,
    score: correct ? (spec.maxScore || 1) : 0,
    maxScore: spec.maxScore || 1,
    misconception: correct ? null : (spec.misconception || 'punctuation_precision'),
    feedbackLong: spec.feedbackLong || (correct ? '' : `Correct answer: ${accepted[0] || ''}`),
    answerText: spec.answerText || matched || accepted[0] || '',
    minimalHint: spec.minimalHint,
  });
}

function markMultiField(spec, response) {
  const fields = isPlainObject(spec.params?.fields) ? spec.params.fields : null;
  if (!fields || Object.keys(fields).length === 0) {
    return mkMarkResult({
      correct: false,
      score: 0,
      maxScore: spec.maxScore || 1,
      misconception: 'marking_unavailable',
      feedbackLong: 'multiField answer spec requires params.fields with at least one entry.',
      answerText: '',
    });
  }
  const responses = isPlainObject(response) ? response : {};
  let subtotal = 0;
  let max = 0;
  const misconceptions = [];
  for (const [key, subSpec] of Object.entries(fields)) {
    const subResult = markByAnswerSpec(subSpec, responses[key]);
    subtotal += Number(subResult.score) || 0;
    max += Number(subResult.maxScore) || 0;
    if (!subResult.correct && subResult.misconception) misconceptions.push(subResult.misconception);
  }
  const correct = max > 0 && subtotal >= max;
  return mkMarkResult({
    correct,
    score: subtotal,
    maxScore: max || (spec.maxScore || 1),
    misconception: correct ? null : (misconceptions[0] || spec.misconception || 'misread_question'),
    feedbackLong: spec.feedbackLong || '',
    answerText: spec.answerText || '',
    minimalHint: spec.minimalHint,
  });
}

function markManualReviewOnly(spec) {
  return mkMarkResult({
    correct: false,
    score: 0,
    maxScore: spec.maxScore || 0,
    misconception: null,
    feedbackShort: 'Saved for review.',
    feedbackLong: spec.feedbackLong || 'This response is saved for teacher or parent review and is not auto-marked.',
    answerText: '',
    minimalHint: spec.minimalHint,
    nonScored: true,
    manualReviewOnly: true,
  });
}

export function markByAnswerSpec(spec, response) {
  if (!isPlainObject(spec)) {
    return mkMarkResult({
      correct: false,
      score: 0,
      maxScore: 1,
      misconception: 'marking_unavailable',
      feedbackLong: 'No answer specification provided.',
      answerText: '',
    });
  }
  const kind = spec.kind;
  if (!ANSWER_SPEC_KINDS.includes(kind)) {
    return mkMarkResult({
      correct: false,
      score: 0,
      maxScore: spec.maxScore || 1,
      misconception: 'marking_unavailable',
      feedbackLong: `Unsupported answer spec kind: ${kind}`,
      answerText: '',
    });
  }
  const rawResponseText = isPlainObject(response)
    ? (typeof response.answer === 'string' ? response.answer : safeString(response.answer ?? ''))
    : safeString(response);
  // P9 U8: normalise iOS smart punctuation before marking so curly
  // quotes/apostrophes/dashes do not cause false negatives on iPad.
  const responseText = normaliseSmartPunctuation(rawResponseText);
  switch (kind) {
    case 'exact': return markExact(spec, responseText);
    case 'normalisedText': return markNormalisedText(spec, responseText);
    case 'acceptedSet': return markAcceptedSet(spec, responseText);
    case 'punctuationPattern': return markPunctuationPattern(spec, responseText);
    case 'multiField': return markMultiField(spec, response);
    case 'manualReviewOnly': return markManualReviewOnly(spec);
    default: return mkMarkResult({
      correct: false,
      score: 0,
      maxScore: spec.maxScore || 1,
      misconception: 'marking_unavailable',
      feedbackLong: 'Unsupported answer spec kind.',
      answerText: '',
    });
  }
}

// Strict validator — intentionally NOT called at module import so the
// migration-window inline-`accepted` shape keeps working. Content-release tests
// can opt into this to enforce declarative shapes per template.
export function validateAnswerSpec(spec, { requireGolden = true, requireNearMiss = true } = {}) {
  if (!isPlainObject(spec)) {
    throw new Error('answerSpec must be a plain object');
  }
  if (!ANSWER_SPEC_KINDS.includes(spec.kind)) {
    throw new Error(`answerSpec.kind must be one of ${ANSWER_SPEC_KINDS.join(', ')}`);
  }
  if (spec.kind === 'manualReviewOnly') {
    return true; // manualReviewOnly has no golden/nearMiss requirement
  }
  if (spec.kind === 'multiField') {
    if (!isPlainObject(spec.params?.fields)) {
      throw new Error('multiField answerSpec requires params.fields object');
    }
    for (const [key, sub] of Object.entries(spec.params.fields)) {
      try {
        validateAnswerSpec(sub, { requireGolden, requireNearMiss });
      } catch (err) {
        throw new Error(`multiField.${key}: ${err.message}`);
      }
    }
    return true;
  }
  if (requireGolden) {
    if (!Array.isArray(spec.golden) || spec.golden.length === 0) {
      throw new Error(`${spec.kind} answerSpec requires non-empty golden[] array`);
    }
  }
  if (requireNearMiss) {
    if (!Array.isArray(spec.nearMiss)) {
      throw new Error(`${spec.kind} answerSpec requires nearMiss[] array (empty is fine)`);
    }
  }
  return true;
}
