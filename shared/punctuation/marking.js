import { parseChoiceIndex } from './choice-index.js';

const MAX_ANSWER_LENGTH = 500;

const FACET_LABELS = Object.freeze({
  quote_variant: 'Matched inverted commas',
  speech_punctuation: 'Speech punctuation inside the closing inverted comma',
  reporting_clause: 'Reporting-clause comma',
  capitalisation: 'Capital letters',
  preservation: 'Target words preserved',
  comma_placement: 'Comma placement',
  boundary_mark: 'Boundary mark',
  hyphenated_phrase: 'Hyphenated phrase',
  parenthetical_phrase: 'Parenthetical phrase',
  colon_boundary: 'Colon before the list',
  list_separators: 'List separators',
  bullet_markers: 'Bullet markers',
  bullet_punctuation: 'Bullet punctuation',
  terminal_punctuation: 'Terminal punctuation',
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

function normaliseAnswerLines(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
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

function canonicalPunctuationLineText(value) {
  return normaliseAnswerLines(value)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .split('\n')
    .map((line) => line
      .replace(/\s+([,.;:?!])/g, '$1')
      .replace(/([“"‘'])\s+/g, '$1')
      .replace(/\s+([”"’'])/g, '$1'))
    .join('\n');
}

function stripPunctuation(value) {
  return canonicalPunctuationText(value)
    .toLowerCase()
    .replace(/[“”"‘’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function wordSequencePreserved(text, words = []) {
  const clean = stripPunctuation(text);
  let cursor = 0;
  for (const word of words) {
    const target = stripPunctuation(word);
    if (!target) continue;
    const index = clean.indexOf(target, cursor);
    if (index < 0) return false;
    cursor = index + target.length;
  }
  return true;
}

function listCommaPattern(words = [], { finalComma = false } = {}) {
  const items = words.map((word) => normaliseAnswerText(word).toLowerCase()).filter(Boolean);
  if (items.length < 2) return null;
  const escaped = items.map(escapeRegExp);
  let body = `\\b${escaped[0]}`;
  for (let index = 1; index < escaped.length - 1; index += 1) {
    body += `,\\s*${escaped[index]}`;
  }
  body += `${finalComma ? ',?' : ''}\\s+and\\s+${escaped[escaped.length - 1]}\\b`;
  return new RegExp(body, 'i');
}

function listCommaOk(text, words = []) {
  const clean = canonicalPunctuationText(text).toLowerCase();
  const expected = listCommaPattern(words, { finalComma: false });
  const withFinalComma = listCommaPattern(words, { finalComma: true });
  const commaPlacement = expected ? expected.test(clean) : false;
  return {
    commaPlacement,
    hasFinalComma: !commaPlacement && withFinalComma ? withFinalComma.test(clean) : false,
  };
}

function itemTags(item) {
  return Array.isArray(item?.misconceptionTags) ? [...item.misconceptionTags] : [];
}

function primaryCommaTag(item, fallback) {
  return itemTags(item).find((tag) => tag.startsWith('comma.')) || fallback;
}

function boundaryBetweenClauses(text, validator = {}) {
  const clean = canonicalPunctuationText(text);
  const lower = clean.toLowerCase();
  const left = canonicalPunctuationText(validator.left || '');
  const right = canonicalPunctuationText(validator.right || '');
  const leftLower = left.toLowerCase();
  const rightLower = right.toLowerCase();
  const leftIndex = leftLower ? lower.indexOf(leftLower) : -1;
  const rightIndex = rightLower ? lower.indexOf(rightLower, Math.max(0, leftIndex + leftLower.length)) : -1;
  const wordsOk = leftIndex >= 0 && rightIndex > leftIndex;
  const between = wordsOk ? clean.slice(leftIndex + left.length, rightIndex) : '';
  const mark = String(validator.mark || ';');
  const markOk = mark.trim() === ';'
    ? /^\s*;\s*$/.test(between)
    : /^\s+-\s+$/.test(between);
  return { wordsOk, markOk, between, mark };
}

function hyphenatedPhrase(text, phrase) {
  const clean = canonicalPunctuationText(text);
  const phraseText = canonicalPunctuationText(phrase || '').toLowerCase();
  const phraseWords = phraseText.replace(/-/g, ' ').split(/\s+/).filter(Boolean);
  const wordsOk = phraseWords.length > 0 && wordSequencePreserved(clean, phraseWords);
  const hyphenOk = Boolean(phraseText) && clean.toLowerCase().includes(phraseText);
  return { wordsOk, hyphenOk };
}

function parentheticalPhrase(text, validator = {}) {
  const clean = canonicalPunctuationText(text);
  const lower = clean.toLowerCase();
  const before = canonicalPunctuationText(validator.before || '');
  const phrase = canonicalPunctuationText(validator.phrase || '');
  const after = canonicalPunctuationText(validator.after || '');
  const beforeIndex = before ? lower.indexOf(before.toLowerCase()) : -1;
  const phraseIndex = phrase ? lower.indexOf(phrase.toLowerCase(), Math.max(0, beforeIndex + before.length)) : -1;
  const afterIndex = after ? lower.indexOf(after.toLowerCase(), Math.max(0, phraseIndex + phrase.length)) : -1;
  const wordsOk = beforeIndex >= 0 && phraseIndex > beforeIndex && afterIndex > phraseIndex;
  const beforeGap = wordsOk ? clean.slice(beforeIndex + before.length, phraseIndex) : '';
  const afterGap = wordsOk ? clean.slice(phraseIndex + phrase.length, afterIndex) : '';
  const openOk = /^\s*(?:,|\(|[-–—])\s*$/.test(beforeGap);
  const closeOk = /^\s*(?:,|\)|[-–—])\s*$/.test(afterGap);
  const punctuationOk = (/^\s*,\s*$/.test(beforeGap) && /^\s*,\s*$/.test(afterGap))
    || (/^\s*\(\s*$/.test(beforeGap) && /^\s*\)\s*$/.test(afterGap))
    || (/^\s*[-–—]\s*$/.test(beforeGap) && /^\s*[-–—]\s*$/.test(afterGap));
  return { wordsOk, openOk, closeOk, punctuationOk };
}

function colonBeforeList(text, validator = {}) {
  const clean = canonicalPunctuationText(text);
  const lower = clean.toLowerCase();
  const opening = canonicalPunctuationText(validator.opening || '');
  const items = Array.isArray(validator.items) ? validator.items : [];
  const openingIndex = opening ? lower.indexOf(opening.toLowerCase()) : -1;
  const wordsOk = openingIndex >= 0 && wordSequencePreserved(clean, [opening, ...items]);
  const afterOpening = openingIndex >= 0 ? clean.slice(openingIndex + opening.length) : '';
  const colonOk = /^\s*:\s*/.test(afterOpening);
  const { commaPlacement, hasFinalComma } = listCommaOk(clean, items);
  return { wordsOk, colonOk, listOk: commaPlacement, hasFinalComma };
}

function semicolonList(text, validator = {}) {
  const clean = canonicalPunctuationText(text);
  const lower = clean.toLowerCase();
  const items = (Array.isArray(validator.items) ? validator.items : [])
    .map((entry) => canonicalPunctuationText(entry))
    .filter(Boolean);
  if (items.length < 2) return { wordsOk: false, separatorsOk: false };
  const indices = [];
  let cursor = 0;
  for (const item of items) {
    const index = lower.indexOf(item.toLowerCase(), cursor);
    if (index < 0) return { wordsOk: false, separatorsOk: false };
    indices.push({ index, item });
    cursor = index + item.length;
  }
  const prefixOk = !/;/.test(clean.slice(0, indices[0].index));
  const separatorsOk = indices.slice(0, -1).every((entry, index) => {
    const next = indices[index + 1];
    const gap = clean.slice(entry.index + entry.item.length, next.index);
    return index === indices.length - 2
      ? /^\s*;\s*(?:and\s+)?$/i.test(gap)
      : /^\s*;\s*$/.test(gap);
  });
  const last = indices[indices.length - 1];
  const tailOk = /^[.?!]?["']?$/.test(clean.slice(last.index + last.item.length).trim());
  return {
    wordsOk: indices.length === items.length,
    separatorsOk: prefixOk && separatorsOk && tailOk,
  };
}

function bulletStemAndItems(text, validator = {}) {
  const clean = canonicalPunctuationLineText(text);
  const lines = clean.split('\n').filter(Boolean);
  const stem = canonicalPunctuationLineText(validator.stem || '');
  const items = (Array.isArray(validator.items) ? validator.items : [])
    .map((entry) => canonicalPunctuationLineText(entry))
    .filter(Boolean);
  const firstLine = lines[0] || '';
  const stemPattern = stem ? new RegExp(`^${escapeRegExp(stem)}\\s*:?$`, 'i') : null;
  const colonPattern = stem ? new RegExp(`^${escapeRegExp(stem)}\\s*:$`, 'i') : null;
  const stemOk = Boolean(stemPattern?.test(firstLine));
  const colonOk = Boolean(colonPattern?.test(firstLine));
  const bulletLines = lines.slice(1);
  const parsedItems = bulletLines.map((line) => {
    const match = line.match(/^-\s+(.+)$/);
    return match ? canonicalPunctuationLineText(match[1]) : null;
  });
  const bulletMarkersOk = bulletLines.length === items.length && parsedItems.every(Boolean);
  const itemBase = (value) => canonicalPunctuationLineText(value).replace(/[.!?]$/, '').trim().toLowerCase();
  const itemsOk = items.length > 0
    && parsedItems.length === items.length
    && parsedItems.every((entry, index) => entry && itemBase(entry) === itemBase(items[index]));
  const endings = parsedItems.filter(Boolean).map((entry) => entry.match(/[.!?]$/)?.[0] || '');
  const allowedEndings = new Set(['', '.']);
  const punctuationOk = bulletMarkersOk && endings.every((ending) => allowedEndings.has(ending)) && new Set(endings).size <= 1;
  return { stemOk, colonOk, itemsOk, bulletMarkersOk, punctuationOk };
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
  const rawText = isPlainObject(answer) ? answer.typed ?? answer.answer : answer;
  const text = normaliseAnswerText(rawText);
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

  if (validator.type === 'requiresListCommas') {
    const words = Array.isArray(validator.items) ? validator.items : [];
    const wordsOk = words.length >= 2 && wordSequencePreserved(text, words);
    const { commaPlacement, hasFinalComma } = listCommaOk(text, words);
    const capitalOk = sentenceStartsWithCapital(text);
    const terminalOk = sentenceEnds(text);
    const correct = wordsOk && commaPlacement && capitalOk && terminalOk;
    const tags = [];
    if (!wordsOk) tags.push('comma.list_words_changed');
    if (!commaPlacement) tags.push(hasFinalComma ? 'comma.unnecessary_final_comma' : 'comma.list_separator_missing');
    if (!capitalOk) tags.push('comma.capitalisation_missing');
    if (!terminalOk) tags.push('comma.terminal_missing');
    return {
      correct,
      expected: item.model || '',
      note: correct ? 'The list items are preserved and separated clearly.' : 'Keep the list items in order and add the list comma before the final and phrase.',
      misconceptionTags: correct ? [] : [...new Set(tags.length ? tags : itemTags(item))],
      facets: [
        facet('preservation', wordsOk),
        facet('comma_placement', commaPlacement),
        facet('capitalisation', capitalOk),
        facet('terminal_punctuation', terminalOk),
      ],
    };
  }

  if (validator.type === 'startsWithPhraseComma') {
    const phrase = canonicalPunctuationText(validator.phrase || '');
    const clean = canonicalPunctuationText(text);
    const phraseOk = Boolean(phrase) && clean.toLowerCase().startsWith(phrase.toLowerCase());
    const commaOk = Boolean(phrase) && clean.toLowerCase().startsWith(`${phrase.toLowerCase()},`);
    const capitalOk = sentenceStartsWithCapital(text);
    const terminalOk = sentenceEnds(text);
    const correct = phraseOk && commaOk && capitalOk && terminalOk;
    const tags = [];
    if (!phraseOk) tags.push('comma.opening_phrase_changed');
    if (phraseOk && !commaOk) tags.push(primaryCommaTag(item, 'comma.fronted_adverbial_missing'));
    if (!capitalOk) tags.push('comma.capitalisation_missing');
    if (!terminalOk) tags.push('comma.terminal_missing');
    return {
      correct,
      expected: item.model || '',
      note: correct ? 'The opening phrase is followed by a comma.' : `Begin with ${validator.phrase}, add the comma, and finish the sentence.`,
      misconceptionTags: correct ? [] : [...new Set(tags.length ? tags : itemTags(item))],
      facets: [
        facet('preservation', phraseOk),
        facet('comma_placement', commaOk),
        facet('capitalisation', capitalOk),
        facet('terminal_punctuation', terminalOk),
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

  if (validator.type === 'requiresBoundaryBetweenClauses') {
    const { wordsOk, markOk, between, mark } = boundaryBetweenClauses(text, validator);
    const capitalOk = sentenceStartsWithCapital(text);
    const terminalOk = sentenceEnds(text);
    const correct = wordsOk && markOk && capitalOk && terminalOk;
    const tags = [];
    const isSemicolon = String(mark).trim() === ';';
    if (!wordsOk) tags.push('boundary.words_changed');
    if (wordsOk && !markOk) {
      if (isSemicolon && /,/.test(between)) tags.push('boundary.comma_splice');
      else tags.push(isSemicolon ? 'boundary.semicolon_missing' : 'boundary.dash_missing');
    }
    if (!capitalOk) tags.push('boundary.capitalisation_missing');
    if (!terminalOk) tags.push('boundary.terminal_missing');
    return {
      correct,
      expected: item.model || '',
      note: correct ? 'The related clauses are joined with the target boundary mark.' : 'Keep both clauses in order and put the target boundary mark between them.',
      misconceptionTags: correct ? [] : [...new Set(tags.length ? tags : itemTags(item))],
      facets: [
        facet('preservation', wordsOk),
        facet('boundary_mark', markOk),
        facet('capitalisation', capitalOk),
        facet('terminal_punctuation', terminalOk),
      ],
    };
  }

  if (validator.type === 'requiresHyphenatedPhrase') {
    const { wordsOk, hyphenOk } = hyphenatedPhrase(text, validator.phrase);
    const capitalOk = sentenceStartsWithCapital(text);
    const terminalOk = sentenceEnds(text);
    const correct = wordsOk && hyphenOk && capitalOk && terminalOk;
    const tags = [];
    if (!wordsOk) tags.push('boundary.words_changed');
    if (wordsOk && !hyphenOk) tags.push('boundary.hyphen_missing');
    if (!capitalOk) tags.push('boundary.capitalisation_missing');
    if (!terminalOk) tags.push('boundary.terminal_missing');
    return {
      correct,
      expected: item.model || '',
      note: correct ? `The phrase ${validator.phrase} is hyphenated clearly.` : `Include the exact hyphenated phrase ${validator.phrase} in a complete sentence.`,
      misconceptionTags: correct ? [] : [...new Set(tags.length ? tags : itemTags(item))],
      facets: [
        facet('preservation', wordsOk),
        facet('hyphenated_phrase', hyphenOk),
        facet('capitalisation', capitalOk),
        facet('terminal_punctuation', terminalOk),
      ],
    };
  }

  if (validator.type === 'requiresParentheticalPhrase') {
    const { wordsOk, openOk, closeOk, punctuationOk } = parentheticalPhrase(text, validator);
    const capitalOk = sentenceStartsWithCapital(text);
    const terminalOk = sentenceEnds(text);
    const correct = wordsOk && punctuationOk && capitalOk && terminalOk;
    const tags = [];
    if (!wordsOk) tags.push('structure.words_changed');
    if (wordsOk && !punctuationOk) tags.push(openOk || closeOk ? 'structure.parenthesis_unbalanced' : 'structure.parenthesis_missing');
    if (!capitalOk) tags.push('structure.capitalisation_missing');
    if (!terminalOk) tags.push('structure.terminal_missing');
    return {
      correct,
      expected: item.model || '',
      note: correct ? 'The extra information is marked off clearly.' : 'Keep the sentence parts in order and mark the parenthesis with commas, brackets or dashes.',
      misconceptionTags: correct ? [] : [...new Set(tags.length ? tags : itemTags(item))],
      facets: [
        facet('preservation', wordsOk),
        facet('parenthetical_phrase', punctuationOk),
        facet('capitalisation', capitalOk),
        facet('terminal_punctuation', terminalOk),
      ],
    };
  }

  if (validator.type === 'requiresColonBeforeList') {
    const { wordsOk, colonOk, listOk, hasFinalComma } = colonBeforeList(text, validator);
    const capitalOk = sentenceStartsWithCapital(text);
    const terminalOk = sentenceEnds(text);
    const correct = wordsOk && colonOk && listOk && capitalOk && terminalOk;
    const tags = [];
    if (!wordsOk) tags.push('structure.list_words_changed');
    if (wordsOk && !colonOk) tags.push('structure.colon_missing');
    if (wordsOk && !listOk) tags.push(hasFinalComma ? 'comma.unnecessary_final_comma' : 'structure.list_separator_missing');
    if (!capitalOk) tags.push('structure.capitalisation_missing');
    if (!terminalOk) tags.push('structure.terminal_missing');
    return {
      correct,
      expected: item.model || '',
      note: correct ? 'The colon introduces the list after a complete opening clause.' : 'Use the colon after the opening clause and keep the list items in order.',
      misconceptionTags: correct ? [] : [...new Set(tags.length ? tags : itemTags(item))],
      facets: [
        facet('preservation', wordsOk),
        facet('colon_boundary', colonOk),
        facet('list_separators', listOk),
        facet('capitalisation', capitalOk),
        facet('terminal_punctuation', terminalOk),
      ],
    };
  }

  if (validator.type === 'requiresSemicolonList') {
    const { wordsOk, separatorsOk } = semicolonList(text, validator);
    const capitalOk = sentenceStartsWithCapital(text);
    const terminalOk = sentenceEnds(text);
    const correct = wordsOk && separatorsOk && capitalOk && terminalOk;
    const tags = [];
    if (!wordsOk) tags.push('structure.list_words_changed');
    if (wordsOk && !separatorsOk) tags.push('structure.semicolon_list_missing');
    if (!capitalOk) tags.push('structure.capitalisation_missing');
    if (!terminalOk) tags.push('structure.terminal_missing');
    return {
      correct,
      expected: item.model || '',
      note: correct ? 'The complex list items are separated with semi-colons.' : 'Keep each complex list item in order and separate the larger items with semi-colons.',
      misconceptionTags: correct ? [] : [...new Set(tags.length ? tags : itemTags(item))],
      facets: [
        facet('preservation', wordsOk),
        facet('list_separators', separatorsOk),
        facet('capitalisation', capitalOk),
        facet('terminal_punctuation', terminalOk),
      ],
    };
  }

  if (validator.type === 'requiresBulletStemAndItems') {
    const { stemOk, colonOk, itemsOk, bulletMarkersOk, punctuationOk } = bulletStemAndItems(rawText, validator);
    const correct = stemOk && colonOk && itemsOk && bulletMarkersOk && punctuationOk;
    const tags = [];
    if (!stemOk || !itemsOk) tags.push('structure.list_words_changed');
    if (stemOk && !colonOk) tags.push('structure.bullet_colon_missing');
    if (!bulletMarkersOk && (itemsOk || stemOk)) tags.push('structure.bullet_marker_missing');
    if (bulletMarkersOk && !punctuationOk) tags.push('structure.bullet_punctuation_inconsistent');
    return {
      correct,
      expected: item.model || '',
      note: correct ? 'The stem introduces the bullet list and the items are marked consistently.' : 'Use the stem with a colon, put each bullet on its own line, and punctuate the items consistently.',
      misconceptionTags: correct ? [] : [...new Set(tags.length ? tags : itemTags(item))],
      facets: [
        facet('preservation', stemOk && itemsOk),
        facet('colon_boundary', colonOk),
        facet('bullet_markers', bulletMarkersOk),
        facet('bullet_punctuation', punctuationOk),
      ],
    };
  }

  return null;
}

function itemRequiresLineBullets(item) {
  return Array.isArray(item?.skillIds) && item.skillIds.includes('bullet_points');
}

function markExact(item, answer) {
  const normalise = itemRequiresLineBullets(item) ? canonicalPunctuationLineText : canonicalPunctuationText;
  const text = normalise(isPlainObject(answer) ? answer.typed ?? answer.answer : answer);
  const accepted = acceptedAnswers(item).map(normalise);
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
