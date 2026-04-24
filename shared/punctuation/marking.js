const MAX_ANSWER_LENGTH = 500;

const FACET_LABELS = Object.freeze({
  quote_variant: 'Matched inverted commas',
  speech_punctuation: 'Speech punctuation inside the closing inverted comma',
  reporting_clause: 'Reporting-clause comma',
  capitalisation: 'Capital letters',
  preservation: 'Target words preserved',
  unwanted_punctuation: 'No duplicated punctuation outside the quote',
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normaliseAnswerText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\r\n]+/g, ' ')
    .trim()
    .slice(0, MAX_ANSWER_LENGTH);
}

export function canonicalPunctuationText(value) {
  return normaliseAnswerText(value)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+([,.;:?!])/g, '$1')
    .replace(/([“"‘'])\s+/g, '$1')
    .replace(/\s+([”"’'])/g, '$1');
}

function stripPunctuation(value) {
  return canonicalPunctuationText(value)
    .toLowerCase()
    .replace(/[“”"‘’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sentenceStartsWithCapital(text) {
  return /^[A-Z]/.test(normaliseAnswerText(text));
}

function sentenceEnds(text, mark = null) {
  const clean = canonicalPunctuationText(text);
  if (mark) {
    const escaped = mark.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`${escaped}["']?$`).test(clean);
  }
  return /[.?!]["']?$/.test(clean);
}

function acceptedAnswers(item) {
  const accepted = Array.isArray(item?.accepted)
    ? item.accepted
    : (Array.isArray(item?.answers) ? item.answers : []);
  const model = typeof item?.model === 'string' && item.model ? [item.model] : [];
  return [...new Set([...accepted, ...model].filter((entry) => typeof entry === 'string' && entry))];
}

function parseChoiceIndex(value) {
  if (Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}

function markChoose(item, answer) {
  const raw = isPlainObject(answer) ? answer.choiceIndex ?? answer.value ?? answer.typed : answer;
  const parsed = parseChoiceIndex(raw);
  const correct = parsed != null && parsed === Number(item.correctIndex);
  return {
    correct,
    expected: item.model || item.options?.[item.correctIndex] || '',
    note: item.explanation || '',
    misconceptionTags: correct ? [] : (Array.isArray(item.misconceptionTags) ? [...item.misconceptionTags] : []),
    facets: [],
  };
}

function facet(id, ok) {
  return {
    id,
    ok: Boolean(ok),
    label: FACET_LABELS[id] || id,
  };
}

function quoteInfo(char) {
  if (char === '"') return { family: 'double', role: 'straight' };
  if (char === "'") return { family: 'single', role: 'straight' };
  if (char === '“') return { family: 'double', role: 'open' };
  if (char === '”') return { family: 'double', role: 'close' };
  if (char === '‘') return { family: 'single', role: 'open' };
  if (char === '’') return { family: 'single', role: 'close' };
  return null;
}

function findQuotePair(text) {
  const quotes = [];
  [...text].forEach((char, index) => {
    const info = quoteInfo(char);
    if (info) quotes.push({ char, index, ...info });
  });
  if (quotes.length < 2) {
    return { ok: false, tag: 'speech.quote_missing', quotes, pair: null };
  }

  for (let i = 0; i < quotes.length - 1; i += 1) {
    const open = quotes[i];
    for (let j = i + 1; j < quotes.length; j += 1) {
      const close = quotes[j];
      if (open.family !== close.family) continue;
      if (open.role === 'close') continue;
      if (close.role === 'open') continue;
      if (open.role === 'straight' || close.role === 'straight' || (open.role === 'open' && close.role === 'close')) {
        return { ok: true, tag: null, quotes, pair: { open, close } };
      }
    }
  }
  return { ok: false, tag: 'speech.quote_unmatched', quotes, pair: null };
}

function afterClosingQuote(text, pair) {
  return text.slice(pair.close.index + 1).trim();
}

function beforeOpeningQuote(text, pair) {
  return text.slice(0, pair.open.index).trim();
}

function quotedSpeech(text, pair) {
  return text.slice(pair.open.index + 1, pair.close.index);
}

function includesWords(text, words) {
  if (!words) return true;
  return stripPunctuation(text).includes(stripPunctuation(words));
}

function quotedWordsStartWithCapital(text) {
  return /^[A-Z]/.test(normaliseAnswerText(text));
}

function reportingCommaOk(text, pair, rubric) {
  if (rubric?.reportingPosition === 'after') return true;
  const before = beforeOpeningQuote(text, pair);
  if (!before) return true;
  return /,\s*$/.test(before);
}

function speechPunctuationOk(quoted, requiredTerminal = null) {
  const clean = normaliseAnswerText(quoted);
  if (requiredTerminal) return clean.endsWith(requiredTerminal);
  return /[.?!]$/.test(clean);
}

function hasDuplicatedOutsidePunctuation(text, pair) {
  return /^[.?!]/.test(afterClosingQuote(text, pair));
}

export function evaluateSpeechRubric(answer, rubric = {}) {
  const text = normaliseAnswerText(answer);
  const tags = [];
  const quote = findQuotePair(text);
  const facets = [];

  if (!quote.ok) {
    tags.push(quote.tag);
    facets.push(facet('quote_variant', false));
    return {
      correct: false,
      misconceptionTags: [...new Set(tags)],
      facets,
      quoted: '',
    };
  }

  const quoted = quotedSpeech(text, quote.pair);
  const quoteOk = true;
  const requiredTerminal = typeof rubric.requiredTerminal === 'string' ? rubric.requiredTerminal : null;
  const speechOk = speechPunctuationOk(quoted, requiredTerminal);
  const reportingOk = reportingCommaOk(text, quote.pair, rubric);
  const capitalOk = sentenceStartsWithCapital(text) && quotedWordsStartWithCapital(quoted);
  const wordsOk = includesWords(quoted, rubric.spokenWords || rubric.words);
  const unwantedOk = !hasDuplicatedOutsidePunctuation(text, quote.pair);

  facets.push(facet('quote_variant', quoteOk));
  facets.push(facet('speech_punctuation', speechOk));
  facets.push(facet('reporting_clause', reportingOk));
  facets.push(facet('capitalisation', capitalOk));
  facets.push(facet('preservation', wordsOk));
  facets.push(facet('unwanted_punctuation', unwantedOk));

  if (!speechOk) {
    const outside = afterClosingQuote(text, quote.pair);
    tags.push(/^[.?!]/.test(outside) ? 'speech.punctuation_outside_quote' : 'speech.punctuation_missing');
  }
  if (!reportingOk) tags.push('speech.reporting_comma_missing');
  if (!capitalOk) tags.push('speech.capitalisation_missing');
  if (!wordsOk) tags.push('speech.words_changed');
  if (!unwantedOk) tags.push('speech.unwanted_punctuation');

  return {
    correct: facets.every((entry) => entry.ok),
    misconceptionTags: [...new Set(tags)],
    facets,
    quoted,
  };
}

function markTransfer(item, answer) {
  const text = normaliseAnswerText(isPlainObject(answer) ? answer.typed ?? answer.answer : answer);
  const validator = item.validator || {};

  if (validator.type === 'startsWithWordQuestion') {
    const firstWord = String(validator.word || '').toLowerCase();
    const lower = text.toLowerCase();
    const correct = lower.startsWith(`${firstWord} `) && sentenceStartsWithCapital(text) && sentenceEnds(text, '?');
    return {
      correct,
      expected: item.model || '',
      note: correct ? 'That begins like a question and ends with a question mark.' : `Start with ${validator.word}, use a capital letter, and end with a question mark.`,
      misconceptionTags: correct ? [] : ['endmarks.question_mark_missing', 'endmarks.capitalisation_missing'],
      facets: [
        facet('capitalisation', sentenceStartsWithCapital(text)),
        facet('speech_punctuation', sentenceEnds(text, '?')),
      ],
    };
  }

  if (validator.type === 'requiresTokens') {
    const lower = text.toLowerCase();
    const missing = (Array.isArray(validator.tokens) ? validator.tokens : [])
      .filter((token) => !lower.includes(String(token).toLowerCase()));
    const correct = missing.length === 0 && sentenceStartsWithCapital(text) && sentenceEnds(text);
    return {
      correct,
      expected: item.model || '',
      note: missing.length ? `Include these exact forms: ${missing.join(', ')}.` : 'Good. The required punctuated forms are present.',
      misconceptionTags: correct ? [] : (Array.isArray(item.misconceptionTags) ? [...item.misconceptionTags] : []),
      facets: [
        facet('capitalisation', sentenceStartsWithCapital(text)),
        facet('speech_punctuation', sentenceEnds(text)),
      ],
    };
  }

  if (validator.type === 'speechWithWords') {
    const rubric = evaluateSpeechRubric(text, {
      type: 'speech',
      spokenWords: validator.words,
      requiredTerminal: validator.requiredTerminal || '?',
    });
    return {
      correct: rubric.correct,
      expected: item.model || '',
      note: rubric.correct ? 'The spoken words are punctuated as a question.' : 'Include inverted commas around the spoken words and keep the question mark with the speech.',
      misconceptionTags: rubric.misconceptionTags,
      facets: rubric.facets,
    };
  }

  return null;
}

function markExact(item, answer) {
  const text = canonicalPunctuationText(isPlainObject(answer) ? answer.typed ?? answer.answer : answer);
  const accepted = acceptedAnswers(item).map(canonicalPunctuationText);
  let exact = accepted.includes(text);
  let rubricResult = null;

  if (item.rubric?.type === 'speech') {
    rubricResult = evaluateSpeechRubric(text, item.rubric);
    exact = exact || rubricResult.correct;
  }

  return {
    correct: exact,
    expected: item.model || acceptedAnswers(item)[0] || '',
    note: exact ? (item.explanation || '') : (rubricResult?.misconceptionTags?.length ? 'Check the direct-speech punctuation carefully.' : item.explanation || ''),
    misconceptionTags: exact
      ? []
      : (rubricResult?.misconceptionTags?.length
          ? rubricResult.misconceptionTags
          : (Array.isArray(item.misconceptionTags) ? [...item.misconceptionTags] : [])),
    facets: rubricResult?.facets || [],
  };
}

export function markPunctuationAnswer({ item, answer } = {}) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return {
      correct: false,
      expected: '',
      note: 'No punctuation item was available.',
      misconceptionTags: ['punctuation.item_unavailable'],
      facets: [],
    };
  }

  if (item.mode === 'choose') return markChoose(item, answer);
  if (item.validator) {
    const transfer = markTransfer(item, answer);
    if (transfer) return transfer;
  }
  return markExact(item, answer);
}
