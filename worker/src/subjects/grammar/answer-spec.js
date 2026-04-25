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

const ANSWER_SPEC_KINDS = Object.freeze([
  'exact',
  'normalisedText',
  'acceptedSet',
  'punctuationPattern',
  'multiField',
  'manualReviewOnly',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeString(value) {
  return value == null ? '' : String(value);
}

function normaliseWhitespace(text) {
  return safeString(text).replace(/\s+/g, ' ').trim();
}

function caseFold(text) {
  return safeString(text).toLowerCase();
}

function stripPunctuationForSet(text) {
  return normaliseWhitespace(safeString(text).replace(/[.,;:!?"'`]/g, ''));
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

function compareNormalisedText(response, accepted) {
  return caseFold(normaliseWhitespace(response)) === caseFold(normaliseWhitespace(accepted));
}

function compareAcceptedSet(response, acceptedList) {
  const candidate = caseFold(normaliseWhitespace(response));
  return acceptedList.some((accepted) => caseFold(normaliseWhitespace(accepted)) === candidate);
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

function mkMarkResult({ correct, score, maxScore, misconception, feedbackShort, feedbackLong, answerText, minimalHint }) {
  const result = {
    correct: Boolean(correct),
    score: Number.isFinite(Number(score)) ? Number(score) : 0,
    maxScore: Number.isFinite(Number(maxScore)) ? Number(maxScore) : 1,
    misconception: misconception || null,
    feedbackShort: feedbackShort || (correct ? 'Correct.' : 'Not quite.'),
    feedbackLong: feedbackLong || '',
    answerText: safeString(answerText),
  };
  if (minimalHint !== undefined) result.minimalHint = minimalHint;
  return result;
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
    answerText: accepted,
  });
}

function markNormalisedText(spec, response) {
  const accepted = Array.isArray(spec.golden) && spec.golden.length ? spec.golden[0] : '';
  const correct = compareNormalisedText(response, accepted);
  return mkMarkResult({
    correct,
    score: correct ? (spec.maxScore || 1) : 0,
    maxScore: spec.maxScore || 1,
    misconception: correct ? null : (spec.misconception || 'misread_question'),
    feedbackLong: spec.feedbackLong || (correct ? '' : `Correct answer: ${accepted}`),
    answerText: accepted,
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
  // Exact match (case + punctuation + whitespace sensitive) for full marks
  const candidate = safeString(response).trim();
  const exactMatch = accepted.find((entry) => safeString(entry).trim() === candidate);
  if (exactMatch) {
    return mkMarkResult({
      correct: true,
      score: fullMarks,
      maxScore: fullMarks,
      feedbackLong: spec.feedbackLong || `Correct answer: ${accepted[0]}`,
      answerText: exactMatch,
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
        answerText: bareMatch,
      });
    }
  }
  return mkMarkResult({
    correct: false,
    score: 0,
    maxScore: fullMarks,
    misconception: spec.misconception || 'misread_question',
    feedbackLong: spec.feedbackLong || `Correct answer: ${accepted[0]}`,
    answerText: accepted[0],
  });
}

function markPunctuationPattern(spec, response) {
  const accepted = Array.isArray(spec.golden) && spec.golden.length ? spec.golden[0] : '';
  const correct = comparePunctuationPattern(response, accepted, {
    optionalCommas: Boolean(spec.params?.optionalCommas),
  });
  return mkMarkResult({
    correct,
    score: correct ? (spec.maxScore || 1) : 0,
    maxScore: spec.maxScore || 1,
    misconception: correct ? null : (spec.misconception || 'punctuation_precision'),
    feedbackLong: spec.feedbackLong || (correct ? '' : `Correct answer: ${accepted}`),
    answerText: accepted,
  });
}

function markMultiField(spec, response) {
  const fields = isPlainObject(spec.params?.fields) ? spec.params.fields : {};
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
    answerText: '',
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
  const responseText = isPlainObject(response)
    ? (typeof response.answer === 'string' ? response.answer : safeString(response.answer ?? ''))
    : safeString(response);
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

export { ANSWER_SPEC_KINDS };
