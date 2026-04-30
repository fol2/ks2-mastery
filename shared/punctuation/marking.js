import { parseChoiceIndex } from './choice-index.js';

const MAX_ANSWER_LENGTH = 500;

const FACET_LABELS = Object.freeze({
  quote_variant: 'Matched inverted commas',
  speech_punctuation: 'Speech punctuation inside the closing inverted comma',
  reporting_clause: 'Reporting-clause comma',
  reporting_clause_words: 'Reporting clause preserved',
  capitalisation: 'Capital letters',
  preservation: 'Target words preserved',
  content_preservation: 'Original words preserved',
  apostrophe_forms: 'Apostrophe forms',
  comma_placement: 'Comma placement',
  boundary_mark: 'Boundary mark',
  hyphenated_phrase: 'Hyphenated phrase',
  parenthetical_phrase: 'Parenthetical phrase',
  colon_boundary: 'Colon before the list',
  list_separators: 'List separators',
  bullet_markers: 'Bullet markers',
  bullet_punctuation: 'Bullet punctuation',
  terminal_punctuation: 'Terminal punctuation',
  single_sentence: 'One combined sentence',
  sentence_completeness: 'Complete sentence',
  unwanted_punctuation: 'No duplicated punctuation outside the quote',
});

/**
 * Given a speech rubric's facets array, return the highest-priority
 * child-actionable failure message. Priority order:
 * 1. quote_variant — missing inverted commas
 * 2. speech_punctuation — punctuation outside closing speech mark
 * 3. reporting_clause — missing comma between reporting clause and speech
 * 4. reporting_clause_words — changed the reporting clause
 * 5. preservation — changed the spoken words
 * Returns null if all facets pass (or none are present).
 */
function speechFailureNote(facets) {
  if (!Array.isArray(facets) || facets.length === 0) return null;
  const lookup = (id) => facets.find((f) => f.id === id);
  const quoteVariant = lookup('quote_variant');
  if (quoteVariant && !quoteVariant.ok) return 'Put inverted commas around the spoken words.';
  const speechPunctuation = lookup('speech_punctuation');
  if (speechPunctuation && !speechPunctuation.ok) return 'The punctuation mark belongs inside the closing speech mark.';
  const reportingClause = lookup('reporting_clause');
  if (reportingClause && !reportingClause.ok) return 'Add a comma between the reporting clause and the speech.';
  const reportingClauseWords = lookup('reporting_clause_words');
  if (reportingClauseWords && !reportingClauseWords.ok) return 'Keep the reporting clause from the question.';
  const preservation = lookup('preservation');
  if (preservation && !preservation.ok) return 'Keep the exact spoken words from the question.';
  return null;
}

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
    .replace(/["']\s+/g, (match, offset, str) => {
      // Preserve space after a terminal possessive apostrophe (e.g. teachers' notices)
      if (match[0] === "'" && offset > 0 && /\w/.test(str[offset - 1])) return match;
      return match[0];
    })
    .replace(/\s+([”"’'])/g, '$1');
}

function canonicalPunctuationLineText(value) {
  return normaliseAnswerLines(value)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .split('\n')
    .map((line) => line
      .replace(/\s+([,.;:?!])/g, '$1')
      .replace(/["']\s+/g, (match, offset, str) => {
        // Preserve space after a terminal possessive apostrophe (e.g. teachers' notices)
        if (match[0] === "'" && offset > 0 && /\w/.test(str[offset - 1])) return match;
        return match[0];
      })
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

/**
 * Detect whether the answer has reporting-before or reporting-after shape.
 * - 'reporting-before': meaningful words appear before the opening quote
 * - 'reporting-after': no words before quote, meaningful words after closing quote
 * - 'speech-only': no reporting clause detected on either side
 */
function detectReportingShape(text, pair) {
  const before = beforeOpeningQuote(text, pair);
  const after = afterClosingQuote(text, pair);
  const hasWordsBefore = /[a-zA-Z]{2,}/.test(before);
  const hasWordsAfter = /[a-zA-Z]{2,}/.test(after);
  if (hasWordsBefore) return 'reporting-before';
  if (hasWordsAfter) return 'reporting-after';
  return 'speech-only';
}

function reportingCommaOk(text, pair, rubric, detectedShape) {
  const shape = detectedShape || detectReportingShape(text, pair);
  // Reporting-after: comma before opening quote is not required
  if (shape === 'reporting-after') return true;
  // Speech-only: no reporting clause, comma not applicable
  if (shape === 'speech-only') return true;
  // Reporting-before: always require a comma before the opening quote
  if (shape === 'reporting-before') {
    const before = beforeOpeningQuote(text, pair);
    return /,\s*$/.test(before);
  }
  return true;
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
    const slice = clean.slice(cursor);
    const match = new RegExp(`(?:^|\\s)${escapeRegExp(target)}(?=\\s|$)`).exec(slice);
    if (!match) return false;
    cursor += match.index + match[0].length;
  }
  return true;
}

function wordCount(value) {
  const clean = stripPunctuation(value);
  return clean ? clean.split(' ').filter(Boolean).length : 0;
}

/**
 * Derive preservation tokens from a stem string by stripping punctuation
 * and splitting into a word array.
 */
export function derivePreserveTokens(stem) {
  return stripPunctuation(stem).split(' ').filter(Boolean);
}

/**
 * Evaluate whether a closed-item answer preserves the original word sequence
 * (only punctuation/capitalisation changes allowed).
 *
 * Returns { preserved, extraWords, missingWords }.
 */
export function evaluatePreservation(answer, item) {
  const text = normaliseAnswerText(answer);
  const expectedTokens = Array.isArray(item.preserveTokens) && item.preserveTokens.length > 0
    ? item.preserveTokens
    : derivePreserveTokens(item.stem || '');

  if (!expectedTokens.length) {
    return { preserved: true, extraWords: [], missingWords: [] };
  }

  const answerWords = stripPunctuation(text).split(' ').filter(Boolean);
  const expectedCount = expectedTokens.length;

  // Reject answers with word count significantly exceeding expected (catches extra tails)
  if (answerWords.length > expectedCount + 2) {
    const extra = answerWords.slice(expectedCount);
    return { preserved: false, extraWords: extra, missingWords: [] };
  }

  // Check all expected words appear in order
  const preserved = wordSequencePreserved(text, expectedTokens);
  if (!preserved) {
    const expectedLower = expectedTokens.map((w) => w.toLowerCase());
    const answerLower = answerWords.map((w) => w.toLowerCase());
    const missing = expectedLower.filter((w) => !answerLower.includes(w));
    return { preserved: false, extraWords: [], missingWords: missing };
  }

  return { preserved: true, extraWords: [], missingWords: [] };
}

function minimumWordCount(validator = {}) {
  const minimum = Number(validator.minimumWordCount);
  return Number.isFinite(minimum) && minimum > 0 ? minimum : 0;
}

function completeEnoughSentence(text, validator = {}) {
  const minimum = minimumWordCount(validator);
  return minimum === 0 || wordCount(text) >= minimum;
}

function requiredTokenCoverage(text, tokens = []) {
  const clean = canonicalPunctuationText(text).toLowerCase();
  const required = (Array.isArray(tokens) ? tokens : [])
    .map((token) => canonicalPunctuationText(token))
    .filter(Boolean);
  const missing = required.filter((token) => {
    const exactTokenPattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(token.toLowerCase())}(?=$|[^a-z0-9])`);
    return !exactTokenPattern.test(clean);
  });
  return {
    missing,
    ok: required.length > 0 && missing.length === 0,
  };
}

const COMMON_VERB_FORMS = new Set([
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'having',
  'do', 'does', 'did',
  'will', 'would', 'shall', 'should', 'may', 'might', 'can', 'could', 'must',
  'go', 'goes', 'went', 'gone', 'going',
  'get', 'gets', 'got', 'getting',
  'make', 'makes', 'made', 'making',
  'take', 'takes', 'took', 'taken', 'taking',
  'come', 'comes', 'came', 'coming',
  'see', 'sees', 'saw', 'seen', 'seeing',
  'know', 'knows', 'knew', 'known',
  'think', 'thinks', 'thought', 'thinking',
  'give', 'gives', 'gave', 'given', 'giving',
  'tell', 'tells', 'told', 'telling',
  'say', 'says', 'said', 'saying',
  'put', 'puts', 'putting',
  'use', 'uses', 'used', 'using',
  'find', 'finds', 'found', 'finding',
  'want', 'wants', 'wanted', 'wanting',
  'need', 'needs', 'needed', 'needing',
  'like', 'likes', 'liked', 'liking',
  'look', 'looks', 'looked', 'looking',
  'run', 'runs', 'ran', 'running',
  'play', 'plays', 'played', 'playing',
  'walk', 'walks', 'walked', 'walking',
  'eat', 'eats', 'ate', 'eaten', 'eating',
  'write', 'writes', 'wrote', 'written', 'writing',
  'read', 'reads', 'reading',
  'sit', 'sits', 'sat', 'sitting',
  'stand', 'stands', 'stood', 'standing',
  'live', 'lives', 'lived', 'living',
  'work', 'works', 'worked', 'working',
  'try', 'tries', 'tried', 'trying',
  'ask', 'asks', 'asked', 'asking',
  'help', 'helps', 'helped', 'helping',
  'show', 'shows', 'showed', 'shown', 'showing',
  'keep', 'keeps', 'kept', 'keeping',
  'let', 'lets', 'letting',
  'begin', 'begins', 'began', 'begun',
  'seem', 'seems', 'seemed', 'seeming',
  'leave', 'leaves', 'left', 'leaving',
  'feel', 'feels', 'felt', 'feeling',
  'bring', 'brings', 'brought', 'bringing',
  'hold', 'holds', 'held', 'holding',
  'open', 'opens', 'opened', 'opening',
  'close', 'closes', 'closed', 'closing',
  'stop', 'stops', 'stopped', 'stopping',
  'start', 'starts', 'started', 'starting',
  'move', 'moves', 'moved', 'moving',
  'turn', 'turns', 'turned', 'turning',
  'hang', 'hangs', 'hung', 'hanging',
  'wore', 'wear', 'wears', 'worn', 'wearing',
  'belong', 'belongs', 'belonged',
  'own', 'owns', 'owned', 'owning',
  'believe', 'believes', 'believed', 'believing',
  'call', 'calls', 'called', 'calling',
  'learn', 'learns', 'learned', 'learning',
  'follow', 'follows', 'followed', 'following',
  'change', 'changes', 'changed', 'changing',
  'lead', 'leads', 'led', 'leading',
  'meet', 'meets', 'met', 'meeting',
  'pay', 'pays', 'paid', 'paying',
  'send', 'sends', 'sent', 'sending',
  'build', 'builds', 'built', 'building',
  'fall', 'falls', 'fell', 'fallen', 'falling',
  'cut', 'cuts', 'cutting',
  'reach', 'reaches', 'reached', 'reaching',
  'stay', 'stays', 'stayed', 'staying',
  'wait', 'waits', 'waited', 'waiting',
  'love', 'loves', 'loved', 'loving',
  'join', 'joins', 'joined', 'joining',
  'spend', 'spends', 'spent', 'spending',
  'grow', 'grows', 'grew', 'grown', 'growing',
  'win', 'wins', 'won', 'winning',
  'teach', 'teaches', 'taught', 'teaching',
  'catch', 'catches', 'caught', 'catching',
  'fly', 'flies', 'flew', 'flown', 'flying',
  'buy', 'buys', 'bought', 'buying',
  'sing', 'sings', 'sang', 'sung', 'singing',
  'swim', 'swims', 'swam', 'swum', 'swimming',
  'draw', 'draws', 'drew', 'drawn', 'drawing',
  'jump', 'jumps', 'jumped', 'jumping',
  'pull', 'pulls', 'pulled', 'pulling',
  'push', 'pushes', 'pushed', 'pushing',
  'pick', 'picks', 'picked', 'picking',
  'drop', 'drops', 'dropped', 'dropping',
  'throw', 'throws', 'threw', 'thrown', 'throwing',
  'hit', 'hits', 'hitting',
  'miss', 'misses', 'missed', 'missing',
  'add', 'adds', 'added', 'adding',
  'finish', 'finishes', 'finished', 'finishing',
  'watch', 'watches', 'watched', 'watching',
  'hear', 'hears', 'heard', 'hearing',
  'break', 'breaks', 'broke', 'broken', 'breaking',
  'drive', 'drives', 'drove', 'driven', 'driving',
  'set', 'sets', 'setting',
  'wake', 'wakes', 'woke', 'woken', 'waking',
  'lose', 'loses', 'lost', 'losing',
  'wash', 'washes', 'washed', 'washing',
  'climb', 'climbs', 'climbed', 'climbing',
  'dance', 'dances', 'danced', 'dancing',
  'sleep', 'sleeps', 'slept', 'sleeping',
  'drink', 'drinks', 'drank', 'drunk', 'drinking',
  'hide', 'hides', 'hid', 'hidden', 'hiding',
  'fight', 'fights', 'fought', 'fighting',
  'smile', 'smiles', 'smiled', 'smiling',
  'laugh', 'laughs', 'laughed', 'laughing',
  'cry', 'cries', 'cried', 'crying',
  'die', 'dies', 'died', 'dying',
  'kill', 'kills', 'killed', 'killing',
  'pass', 'passes', 'passed', 'passing',
  'raise', 'raises', 'raised', 'raising',
  'sell', 'sells', 'sold', 'selling',
  'decide', 'decides', 'decided', 'deciding',
  'return', 'returns', 'returned', 'returning',
  'explain', 'explains', 'explained', 'explaining',
  'hope', 'hopes', 'hoped', 'hoping',
  'develop', 'develops', 'developed', 'developing',
  'carry', 'carries', 'carried', 'carrying',
  'continue', 'continues', 'continued', 'continuing',
  'worry', 'worries', 'worried', 'worrying',
  'cover', 'covers', 'covered', 'covering',
  'remember', 'remembers', 'remembered', 'remembering',
  'forget', 'forgets', 'forgot', 'forgotten', 'forgetting',
  'arrive', 'arrives', 'arrived', 'arriving',
  'create', 'creates', 'created', 'creating',
  'include', 'includes', 'included', 'including',
  'enjoy', 'enjoys', 'enjoyed', 'enjoying',
  'provide', 'provides', 'provided', 'providing',
  'speak', 'speaks', 'spoke', 'spoken', 'speaking',
  'lie', 'lies', 'lay', 'lain', 'lying',
  'rise', 'rises', 'rose', 'risen', 'rising',
  'fit', 'fits', 'fitted', 'fitting',
  'share', 'shares', 'shared', 'sharing',
  'visit', 'visits', 'visited', 'visiting',
  'wonder', 'wonders', 'wondered', 'wondering',
  'receive', 'receives', 'received', 'receiving',
  'suppose', 'supposes', 'supposed', 'supposing',
  'notice', 'notices', 'noticed', 'noticing',
  'discover', 'discovers', 'discovered', 'discovering',
  'suggest', 'suggests', 'suggested', 'suggesting',
  'expect', 'expects', 'expected', 'expecting',
  'agree', 'agrees', 'agreed', 'agreeing',
  'allow', 'allows', 'allowed', 'allowing',
  'prepare', 'prepares', 'prepared', 'preparing',
  'accept', 'accepts', 'accepted', 'accepting',
  'cross', 'crosses', 'crossed', 'crossing',
  'deliver', 'delivers', 'delivered', 'delivering',
  'practise', 'practises', 'practised', 'practising',
  'serve', 'serves', 'served', 'serving',
  'collect', 'collects', 'collected', 'collecting',
  'travel', 'travels', 'travelled', 'travelling',
  'shout', 'shouts', 'shouted', 'shouting',
  'reply', 'replies', 'replied', 'replying',
  'wish', 'wishes', 'wished', 'wishing',
  'check', 'checks', 'checked', 'checking',
  'plan', 'plans', 'planned', 'planning',
  'hurry', 'hurries', 'hurried', 'hurrying',
]);

export function evaluateMeaningfulness(text, validator, item) {
  const minWords = validator.minMeaningfulWords ?? 5;
  if (minWords === 0) return { meaningful: true, wordCount: wordCount(text), allWordsRequired: false, hasVerbFrame: true };
  if (item?.mode === 'paragraph') return { meaningful: true, wordCount: wordCount(text), allWordsRequired: false, hasVerbFrame: true };
  // insert/fix modes use pre-given sentences — verb frame is always assumed
  if (item?.mode === 'insert' || item?.mode === 'fix') return { meaningful: true, wordCount: wordCount(text), allWordsRequired: false, hasVerbFrame: true };

  const count = wordCount(text);
  const tokens = (Array.isArray(validator.tokens) ? validator.tokens : [])
    .map((t) => stripPunctuation(t).toLowerCase())
    .filter(Boolean);
  const answerWords = stripPunctuation(text).toLowerCase().split(' ').filter(Boolean);
  const allWordsRequired = tokens.length > 0 && answerWords.every((word) => tokens.includes(word));

  const nonRequiredWords = answerWords.filter((word) => !tokens.includes(word));
  const hasVerbFrame = nonRequiredWords.some((word) => COMMON_VERB_FORMS.has(word));

  return {
    meaningful: count >= minWords && !allWordsRequired && hasVerbFrame,
    wordCount: count,
    allWordsRequired,
    hasVerbFrame,
  };
}

function terminalMarkFromModel(item, fallback = '.') {
  const clean = canonicalPunctuationText(item?.model || acceptedAnswers(item)[0] || '');
  return clean.match(/([.?!])["']?$/)?.[1] || fallback;
}

function terminalSuffixPattern(requiredTerminal = null) {
  const mark = requiredTerminal ? escapeRegExp(requiredTerminal) : '[.?!]';
  return `\\s*${mark}["']?$`;
}

function singleSentenceOk(text, requiredTerminal = null) {
  const clean = canonicalPunctuationText(text);
  if (!sentenceEnds(clean, requiredTerminal)) return false;
  const body = clean.replace(/[.?!]["']?$/, '').trim();
  return !/[.?!]/.test(body);
}

function singleSpeechSentenceOk(text, requiredTerminal = null) {
  const clean = canonicalPunctuationText(text);
  if (!sentenceEnds(clean, requiredTerminal)) return false;
  const body = clean.replace(/[.?!]["']?$/, '').trim();
  const bodyNoQuoted = body.replace(/["'"'"'][^"'"'"']*["'"'"']/g, '');
  return !/[.?!]/.test(bodyNoQuoted);
}

function transferSentenceOk(item, text, requiredTerminal = null) {
  return item?.mode === 'paragraph' ? true : singleSentenceOk(text, requiredTerminal);
}

function listCommaPattern(words = [], { finalComma = false } = {}) {
  const items = words.map((word) => normaliseAnswerText(word).toLowerCase()).filter(Boolean);
  if (items.length < 2) return null;
  const escaped = items.map(escapeRegExp);
  let body = `\\b${escaped[0]}`;
  for (let index = 1; index < escaped.length - 1; index += 1) {
    body += `,\\s*${escaped[index]}`;
  }
  body += `${finalComma ? ',\\s+' : '\\s+'}and\\s+${escaped[escaped.length - 1]}\\b`;
  return new RegExp(body, 'i');
}

function listCommaOk(text, words = [], { allowFinalComma = true } = {}) {
  const clean = canonicalPunctuationText(text).toLowerCase();
  const expected = listCommaPattern(words, { finalComma: false });
  const withFinalComma = listCommaPattern(words, { finalComma: true });
  const noFinalCommaOk = expected ? expected.test(clean) : false;
  const finalCommaOk = withFinalComma ? withFinalComma.test(clean) : false;
  return {
    commaPlacement: noFinalCommaOk || (allowFinalComma && finalCommaOk),
    hasFinalComma: finalCommaOk,
  };
}

const STRICT_FINAL_COMMA_NOTE = 'For this question, do not put a comma before the final and.';

function listCommaRejectionNote(validator = {}, { hasFinalComma = false, tags = [] } = {}, fallback = '') {
  if (validator.allowFinalComma !== false || !hasFinalComma) return fallback;
  const otherIssues = uniqueStrings(tags).filter((tag) => tag !== 'comma.unnecessary_final_comma');
  if (!otherIssues.length) return STRICT_FINAL_COMMA_NOTE;
  return `${fallback} ${STRICT_FINAL_COMMA_NOTE}`.trim();
}

function openingPhraseMainClause(text, phrase) {
  const clean = canonicalPunctuationText(text);
  const canonicalPhrase = canonicalPunctuationText(phrase || '');
  const lower = clean.toLowerCase();
  const phraseOk = Boolean(canonicalPhrase) && lower.startsWith(canonicalPhrase.toLowerCase());
  const afterPhrase = phraseOk ? clean.slice(canonicalPhrase.length) : '';
  const commaOk = phraseOk && /^\s*,/.test(afterPhrase);
  const mainClause = commaOk
    ? afterPhrase.replace(/^\s*,\s*/, '').replace(/[.?!]["']?$/, '').trim()
    : '';
  return {
    phraseOk,
    commaOk,
    mainClauseOk: commaOk && wordCount(mainClause) >= 2,
  };
}

function listCommaShapePattern(words = [], { allowFinalComma = true } = {}) {
  const items = words.map((word) => canonicalPunctuationText(word).toLowerCase()).filter(Boolean);
  if (items.length < 2) return null;
  const escaped = items.map(escapeRegExp);
  if (escaped.length === 2) return `${escaped[0]}\\s+and\\s+${escaped[1]}`;
  let body = escaped[0];
  for (let index = 1; index < escaped.length - 1; index += 1) {
    body += `,\\s*${escaped[index]}`;
  }
  body += `${allowFinalComma ? ',?' : ''}\\s+and\\s+${escaped[escaped.length - 1]}`;
  return body;
}

function itemTags(item) {
  return Array.isArray(item?.misconceptionTags) ? [...item.misconceptionTags] : [];
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter((entry) => typeof entry === 'string' && entry))];
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
    : /^\s+[-–—]\s+$/.test(between);
  return { wordsOk, markOk, between, mark };
}

function hyphenatedPhrase(text, phrase) {
  const clean = canonicalPunctuationText(text);
  const phraseText = canonicalPunctuationText(phrase || '').toLowerCase();
  const phraseWords = phraseText.replace(/-/g, ' ').split(/\s+/).filter(Boolean);
  const wordsOk = phraseWords.length > 0 && wordSequencePreserved(clean, phraseWords);
  const hyphenOk = Boolean(phraseText) && new RegExp(
    `(?:^|[^a-z0-9])${escapeRegExp(phraseText)}(?=$|[^a-z0-9])`,
    'i',
  ).test(clean);
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
  const items = (Array.isArray(validator.items) ? validator.items : [])
    .map((entry) => canonicalPunctuationText(entry))
    .filter(Boolean);
  const openingLower = opening.toLowerCase();
  const wordsOk = Boolean(openingLower)
    && lower.startsWith(openingLower)
    && wordSequencePreserved(clean, [opening, ...items]);
  const afterOpening = wordsOk ? clean.slice(opening.length) : '';
  const colonOk = /^\s*:\s*/.test(afterOpening);
  const expectedList = listCommaShapePattern(items, { allowFinalComma: validator.allowFinalComma !== false });
  const tailPattern = validator.allowTrailingText === true
    ? '[.?!](?:\\s+\\S.*)?$'
    : '[.?!]?["\']?$';
  const listOk = Boolean(expectedList) && new RegExp(
    `^\\s*${escapeRegExp(opening)}\\s*:\\s*${expectedList}\\s*${tailPattern}`,
    'i',
  ).test(clean);
  const { hasFinalComma } = listCommaOk(clean, items);
  return { wordsOk, colonOk, listOk, hasFinalComma };
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

function frontedAdverbialWithSpeech(text, validator = {}, requiredTerminal = null) {
  const clean = canonicalPunctuationText(text);
  const phrase = canonicalPunctuationText(validator.phrase || '');
  const expectedReportingClause = canonicalPunctuationText(validator.reportingClause || '');
  const phraseParts = openingPhraseMainClause(clean, phrase);
  const quote = findQuotePair(text);
  const beforeQuoteText = quote.ok ? beforeOpeningQuote(text, quote.pair) : '';
  const afterPhraseBeforeQuote = phraseParts.phraseOk
    ? canonicalPunctuationText(beforeQuoteText).slice(phrase.length).trim()
    : '';
  const reportingWords = afterPhraseBeforeQuote
    .replace(/^,\s*/, '')
    .replace(/,\s*$/, '')
    .trim();
  const reportingWordsOk = expectedReportingClause
    ? stripPunctuation(reportingWords) === stripPunctuation(expectedReportingClause)
    : wordCount(reportingWords) >= 2;
  const reportingClauseOk = quote.ok
    && /,\s*$/.test(beforeQuoteText)
    && reportingWordsOk;
  const speech = evaluateSpeechRubric(text, {
    type: 'speech',
    reportingPosition: 'before',
    spokenWords: validator.words || validator.spokenWords,
    requiredTerminal,
  });
  const speechFacetOk = (id) => speech.facets.find((entry) => entry.id === id)?.ok === true;
  const quoteOk = speechFacetOk('quote_variant');
  const speechPunctuationOkValue = speechFacetOk('speech_punctuation');
  const capitalOk = speechFacetOk('capitalisation');
  const speechWordsOk = speechFacetOk('preservation');
  const unwantedOk = quote.ok ? speechFacetOk('unwanted_punctuation') : true;
  const sentenceOk = singleSentenceOk(text, requiredTerminal);
  return {
    correct: phraseParts.phraseOk
      && phraseParts.commaOk
      && reportingClauseOk
      && speech.correct
      && sentenceOk,
    phraseOk: phraseParts.phraseOk,
    commaOk: phraseParts.commaOk,
    reportingClauseOk,
    quoteOk,
    speechPunctuationOk: speechPunctuationOkValue,
    capitalOk,
    preservationOk: phraseParts.phraseOk && reportingWordsOk && speechWordsOk,
    unwantedOk,
    sentenceOk,
    speech,
  };
}

function anchoredListSentence(text, validator = {}, requiredTerminal = null) {
  const clean = canonicalPunctuationText(text);
  const opening = canonicalPunctuationText(validator.opening || '');
  const items = (Array.isArray(validator.items) ? validator.items : [])
    .map((entry) => canonicalPunctuationText(entry))
    .filter(Boolean);
  const expectedList = listCommaShapePattern(items, { allowFinalComma: validator.allowFinalComma !== false });
  const wordsOk = Boolean(opening && expectedList) && wordSequencePreserved(clean, [opening, ...items]);
  const sentenceOk = singleSentenceOk(clean, requiredTerminal);
  const listOk = Boolean(opening && expectedList) && new RegExp(
    `^${escapeRegExp(opening)}\\s+${expectedList}${terminalSuffixPattern(requiredTerminal)}`,
    'i',
  ).test(clean);
  const { hasFinalComma } = listCommaOk(clean, items);
  return { wordsOk, listOk, sentenceOk, hasFinalComma };
}

function anchoredFrontedAdverbial(text, validator = {}, requiredTerminal = null) {
  const clean = canonicalPunctuationText(text);
  const phrase = canonicalPunctuationText(validator.phrase || '');
  const mainClause = canonicalPunctuationText(validator.mainClause || '');
  const lower = clean.toLowerCase();
  const phraseOk = Boolean(phrase) && lower.startsWith(phrase.toLowerCase());
  const wordsOk = phraseOk && Boolean(mainClause) && wordSequencePreserved(clean, [phrase, mainClause]);
  const commaOk = Boolean(phrase && mainClause) && new RegExp(
    `^${escapeRegExp(phrase)},\\s*${escapeRegExp(mainClause)}${terminalSuffixPattern(requiredTerminal)}`,
    'i',
  ).test(clean);
  return { wordsOk, phraseOk, commaOk, sentenceOk: singleSentenceOk(clean, requiredTerminal) };
}

function anchoredParentheticalPhrase(text, validator = {}, requiredTerminal = null) {
  const clean = canonicalPunctuationText(text);
  const before = canonicalPunctuationText(validator.before || '');
  const phrase = canonicalPunctuationText(validator.phrase || '');
  const after = canonicalPunctuationText(validator.after || '');
  const wordsOk = Boolean(before && phrase && after) && wordSequencePreserved(clean, [before, phrase, after]);
  const loose = parentheticalPhrase(clean, validator);
  const terminal = terminalSuffixPattern(requiredTerminal);
  const commaPattern = `^${escapeRegExp(before)}\\s*,\\s*${escapeRegExp(phrase)}\\s*,\\s*${escapeRegExp(after)}${terminal}`;
  const bracketPattern = `^${escapeRegExp(before)}\\s*\\(\\s*${escapeRegExp(phrase)}\\s*\\)\\s*${escapeRegExp(after)}${terminal}`;
  const dashPattern = `^${escapeRegExp(before)}\\s+[-–—]\\s+${escapeRegExp(phrase)}\\s+[-–—]\\s+${escapeRegExp(after)}${terminal}`;
  const punctuationOk = Boolean(before && phrase && after) && [commaPattern, bracketPattern, dashPattern]
    .some((pattern) => new RegExp(pattern, 'i').test(clean));
  return { wordsOk, openOk: loose.openOk, closeOk: loose.closeOk, punctuationOk, sentenceOk: singleSentenceOk(clean, requiredTerminal) };
}

function anchoredBoundarySentence(text, validator = {}, requiredTerminal = null) {
  const clean = canonicalPunctuationText(text);
  const left = canonicalPunctuationText(validator.left || '');
  const right = canonicalPunctuationText(validator.right || '');
  const mark = String(validator.mark || ';').trim();
  const wordsOk = Boolean(left && right)
    && clean.toLowerCase().startsWith(left.toLowerCase())
    && wordSequencePreserved(clean, [left, right]);
  const markPattern = mark === ';' ? '\\s*;\\s*' : '\\s+[-–—]\\s+';
  const markOk = Boolean(left && right) && new RegExp(
    `^${escapeRegExp(left)}${markPattern}${escapeRegExp(right)}${terminalSuffixPattern(requiredTerminal)}`,
    'i',
  ).test(clean);
  const loose = boundaryBetweenClauses(clean, validator);
  return { wordsOk, markOk, between: loose.between, mark, sentenceOk: singleSentenceOk(clean, requiredTerminal) };
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
  const shape = detectReportingShape(text, quote.pair);
  const reportingOk = reportingCommaOk(text, quote.pair, rubric, shape);
  const positionAllowsAfter = rubric?.reportingPosition === 'after' || rubric?.reportingPosition === 'any';
  const sentenceCapitalOk = (positionAllowsAfter && shape !== 'reporting-before')
    ? sentenceStartsWithCapital(text) || /^["'"'“‘]/.test(text)
    : sentenceStartsWithCapital(text);
  const capitalOk = sentenceCapitalOk && quotedWordsStartWithCapital(quoted);
  const wordsOk = includesWords(quoted, rubric.spokenWords || rubric.words);
  const unwantedOk = !hasDuplicatedOutsidePunctuation(text, quote.pair);

  // Position constraint: reject shape that contradicts explicit rubric position
  const positionOk = rubric?.reportingPosition === 'any'
    || rubric?.reportingPosition == null
    || shape === 'speech-only'
    || (rubric.reportingPosition === 'before' && shape === 'reporting-before')
    || (rubric.reportingPosition === 'after' && shape === 'reporting-after');

  // Reporting-clause word enforcement: when rubric.reportingClause is supplied,
  // verify the answer contains the required clause words (additive to P7 comma logic).
  const expectedClauseWords = typeof rubric.reportingClause === 'string' && rubric.reportingClause.trim()
    ? rubric.reportingClause.trim()
    : null;
  let clauseWordsOk = true;
  if (expectedClauseWords) {
    if (shape === 'speech-only') {
      // No reporting clause in the answer at all — required clause omitted
      clauseWordsOk = false;
    } else {
      // Extract the reporting clause text from the answer (text outside quotes)
      const clauseText = shape === 'reporting-before'
        ? beforeOpeningQuote(text, quote.pair)
        : afterClosingQuote(text, quote.pair);
      clauseWordsOk = includesWords(clauseText, expectedClauseWords);
    }
  }

  facets.push(facet('quote_variant', quoteOk));
  facets.push(facet('speech_punctuation', speechOk));
  facets.push(facet('reporting_clause', reportingOk));
  if (expectedClauseWords) {
    facets.push(facet('reporting_clause_words', clauseWordsOk));
  }
  facets.push(facet('capitalisation', capitalOk));
  facets.push(facet('preservation', wordsOk));
  facets.push(facet('unwanted_punctuation', unwantedOk));
  facets.push(facet('reporting_position', positionOk));

  if (!speechOk) {
    const outside = afterClosingQuote(text, quote.pair);
    tags.push(/^[.?!]/.test(outside) ? 'speech.punctuation_outside_quote' : 'speech.punctuation_missing');
  }
  if (!reportingOk) tags.push('speech.reporting_comma_missing');
  if (!positionOk) tags.push('speech.wrong_reporting_position');
  if (!capitalOk) tags.push('speech.capitalisation_missing');
  if (!wordsOk) tags.push('speech.words_changed');
  if (!unwantedOk) tags.push('speech.unwanted_punctuation');
  if (expectedClauseWords && !clauseWordsOk) tags.push('speech.reporting_clause_changed');

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

  // Content preservation gate: for insert/fix items with a validator,
  // reject answers that add extra content beyond the original words.
  // Word-change detection is left to the validator-specific logic (better diagnostics).
  if ((item.mode === 'insert' || item.mode === 'fix') && validator.type) {
    const preservation = evaluatePreservation(text, item);
    if (!preservation.preserved && preservation.extraWords.length > 0) {
      return {
        correct: false,
        expected: item.model || '',
        note: 'You changed the sentence — only add or fix the punctuation.',
        misconceptionTags: ['content.words_added_or_changed'],
        facets: [facet('content_preservation', false)],
      };
    }
  }

  if (validator.type === 'startsWithWordQuestion') {
    const firstWord = String(validator.word || '').toLowerCase();
    const lower = text.toLowerCase();
    const wordOk = lower.startsWith(`${firstWord} `);
    const capitalOk = sentenceStartsWithCapital(text);
    const terminalOk = sentenceEnds(text, '?');
    const sentenceOk = transferSentenceOk(item, text, '?');
    const correct = wordOk && capitalOk && terminalOk && sentenceOk;
    return {
      correct,
      expected: item.model || '',
      note: correct ? 'That begins like a question and ends with a question mark.' : `Start with ${validator.word}, use a capital letter, and end with a question mark.`,
      misconceptionTags: correct ? [] : [...new Set([
        ...(wordOk ? [] : ['endmarks.question_starter_changed']),
        ...(terminalOk ? [] : ['endmarks.question_mark_missing']),
        ...(capitalOk ? [] : ['endmarks.capitalisation_missing']),
        ...(sentenceOk ? [] : ['transfer.extra_sentence']),
      ])],
      facets: [
        facet('preservation', wordOk),
        facet('capitalisation', capitalOk),
        facet('terminal_punctuation', terminalOk),
        ...(item.mode === 'paragraph' ? [] : [facet('single_sentence', sentenceOk)]),
      ],
    };
  }

  if (validator.type === 'requiresTokens') {
    const { missing, ok: tokensOk } = requiredTokenCoverage(text, validator.tokens);
    const capitalOk = sentenceStartsWithCapital(text);
    const terminalOk = sentenceEnds(text);
    const sentenceOk = transferSentenceOk(item, text);
    const completeOk = completeEnoughSentence(text, validator);
    const meaningfulness = item?.mode !== 'paragraph'
      ? evaluateMeaningfulness(text, validator, item)
      : { meaningful: true, wordCount: wordCount(text), allWordsRequired: false };
    const meaningfulOk = meaningfulness.meaningful;
    const correct = tokensOk && capitalOk && terminalOk && sentenceOk && completeOk && meaningfulOk;
    const showMeaningfulFacet = minimumWordCount(validator) > 0 || !meaningfulOk;
    return {
      correct,
      expected: item.model || '',
      note: !meaningfulOk
        ? 'Include your punctuated forms in a complete sentence.'
        : (missing.length ? `Include these exact forms: ${missing.join(', ')}.` : 'Good. The required punctuated forms are present.'),
      misconceptionTags: correct ? [] : [...new Set([
        ...(tokensOk ? [] : itemTags(item)),
        ...(capitalOk ? [] : ['apostrophe.capitalisation_missing']),
        ...(terminalOk ? [] : ['apostrophe.terminal_missing']),
        ...(sentenceOk ? [] : ['transfer.extra_sentence']),
        ...(completeOk ? [] : ['transfer.sentence_fragment']),
        ...(meaningfulOk ? [] : ['transfer.sentence_fragment']),
      ])],
      facets: [
        facet('preservation', tokensOk),
        facet('capitalisation', capitalOk),
        facet('terminal_punctuation', terminalOk),
        ...(item.mode === 'paragraph' ? [] : [facet('single_sentence', sentenceOk)]),
        ...(showMeaningfulFacet ? [facet('sentence_completeness', completeOk && meaningfulOk)] : []),
      ],
    };
  }

  if (validator.type === 'requiresListCommas') {
    const words = Array.isArray(validator.items) ? validator.items : [];
    const opening = canonicalPunctuationText(validator.opening || validator.stem || '');
    const clean = canonicalPunctuationText(text);
    const openingOk = !opening || clean.toLowerCase().startsWith(opening.toLowerCase());
    const wordsOk = words.length >= 2 && openingOk && wordSequencePreserved(text, opening ? [opening, ...words] : words);
    const { commaPlacement, hasFinalComma } = listCommaOk(text, words, {
      allowFinalComma: validator.allowFinalComma !== false,
    });
    const capitalOk = sentenceStartsWithCapital(text);
    const terminalOk = sentenceEnds(text);
    const sentenceOk = transferSentenceOk(item, text);
    const correct = wordsOk && commaPlacement && capitalOk && terminalOk && sentenceOk;
    const tags = [];
    if (!wordsOk) tags.push('comma.list_words_changed');
    if (!commaPlacement) tags.push(hasFinalComma ? 'comma.unnecessary_final_comma' : 'comma.list_separator_missing');
    if (!capitalOk) tags.push('comma.capitalisation_missing');
    if (!terminalOk) tags.push('comma.terminal_missing');
    if (terminalOk && !sentenceOk) tags.push('transfer.extra_sentence');
    const fallbackNote = opening
      ? 'Keep the exact stem and list items in order, and use commas between the list items.'
      : 'Keep the list items in order and use commas between the list items.';
    return {
      correct,
      expected: item.model || '',
      note: correct
        ? 'The list items are preserved and separated clearly.'
        : listCommaRejectionNote(
            validator,
            { hasFinalComma, tags },
            fallbackNote,
          ),
      misconceptionTags: correct ? [] : [...new Set(tags.length ? tags : itemTags(item))],
      facets: [
        facet('preservation', wordsOk),
        facet('comma_placement', commaPlacement),
        facet('capitalisation', capitalOk),
        facet('terminal_punctuation', terminalOk),
        ...(item.mode === 'paragraph' ? [] : [facet('single_sentence', sentenceOk)]),
      ],
    };
  }

  if (validator.type === 'startsWithPhraseComma') {
    const { phraseOk, commaOk, mainClauseOk } = openingPhraseMainClause(text, validator.phrase);
    const capitalOk = sentenceStartsWithCapital(text);
    const terminalOk = sentenceEnds(text);
    const sentenceOk = transferSentenceOk(item, text);
    const correct = phraseOk && commaOk && mainClauseOk && capitalOk && terminalOk && sentenceOk;
    const tags = [];
    if (!phraseOk) tags.push('comma.opening_phrase_changed');
    if (phraseOk && !commaOk) tags.push(primaryCommaTag(item, 'comma.fronted_adverbial_missing'));
    if (commaOk && !mainClauseOk) tags.push('comma.main_clause_missing');
    if (!capitalOk) tags.push('comma.capitalisation_missing');
    if (!terminalOk) tags.push('comma.terminal_missing');
    if (terminalOk && !sentenceOk) tags.push('transfer.extra_sentence');
    return {
      correct,
      expected: item.model || '',
      note: correct ? 'The opening phrase is followed by a comma.' : `Begin with ${validator.phrase}, add the comma, and finish the sentence.`,
      misconceptionTags: correct ? [] : [...new Set(tags.length ? tags : itemTags(item))],
      facets: [
        facet('preservation', phraseOk && mainClauseOk),
        facet('comma_placement', commaOk),
        facet('capitalisation', capitalOk),
        facet('terminal_punctuation', terminalOk),
        ...(item.mode === 'paragraph' ? [] : [facet('single_sentence', sentenceOk)]),
      ],
    };
  }

  if (validator.type === 'speechWithWords') {
    const requiredTerminal = validator.requiredTerminal || '?';
    const reportingPosition = item.rubric?.reportingPosition || undefined;
    const reportingClause = validator.reportingClause || item.rubric?.reportingClause || undefined;
    const rubric = evaluateSpeechRubric(text, {
      type: 'speech',
      spokenWords: validator.words,
      requiredTerminal,
      ...(reportingPosition ? { reportingPosition } : {}),
      ...(reportingClause ? { reportingClause } : {}),
    });
    const posAllowsAfter = reportingPosition === 'any' || reportingPosition === 'after';
    const looksReportingAfter = posAllowsAfter && /^["'“”‘’]/.test(text);
    const sentenceTerminal = looksReportingAfter ? null : requiredTerminal;
    const sentenceOk = looksReportingAfter
      ? singleSpeechSentenceOk(text, sentenceTerminal)
      : transferSentenceOk(item, text, sentenceTerminal);
    const correct = rubric.correct && sentenceOk;
    // Determine feedback note: priority-based facet failure messages
    const note = rubric.correct
      ? 'The spoken words are punctuated as a question.'
      : (speechFailureNote(rubric.facets) || 'Check the direct-speech punctuation carefully.');
    return {
      correct,
      expected: item.model || '',
      note,
      misconceptionTags: correct ? [] : [...new Set([
        ...(rubric.correct ? [] : rubric.misconceptionTags),
        ...(sentenceOk ? [] : ['transfer.extra_sentence']),
      ])],
      facets: [
        ...rubric.facets,
        ...(item.mode === 'paragraph' ? [] : [facet('single_sentence', sentenceOk)]),
      ],
    };
  }

  if (validator.type === 'frontedAdverbialWithSpeech') {
    const requiredTerminal = validator.requiredTerminal || terminalMarkFromModel(item, '!');
    const result = frontedAdverbialWithSpeech(text, validator, requiredTerminal);
    const tags = [];
    if (!result.phraseOk) tags.push('comma.opening_phrase_changed');
    if (result.phraseOk && !result.commaOk) tags.push(primaryCommaTag(item, 'comma.fronted_adverbial_missing'));
    if (result.quoteOk && !result.reportingClauseOk) tags.push('speech.reporting_comma_missing');
    if (!result.sentenceOk) tags.push('transfer.extra_sentence');
    tags.push(...result.speech.misconceptionTags);
    return {
      correct: result.correct,
      expected: item.model || '',
      note: result.correct ? 'That combines a fronted adverbial with direct speech.' : `Begin with "${validator.phrase}," and include correctly punctuated direct speech.`,
      misconceptionTags: result.correct ? [] : [...new Set(tags.length ? tags : itemTags(item))],
      facets: [
        facet('preservation', result.preservationOk),
        facet('comma_placement', result.commaOk),
        facet('quote_variant', result.quoteOk),
        facet('speech_punctuation', result.speechPunctuationOk),
        facet('reporting_clause', result.reportingClauseOk),
        facet('capitalisation', result.capitalOk),
        facet('unwanted_punctuation', result.unwantedOk),
        facet('single_sentence', result.sentenceOk),
      ],
    };
  }

  if (validator.type === 'requiresBoundaryBetweenClauses') {
    const { wordsOk, markOk, between, mark } = boundaryBetweenClauses(text, validator);
    const capitalOk = sentenceStartsWithCapital(text);
    const terminalOk = sentenceEnds(text);
    const sentenceOk = transferSentenceOk(item, text);
    const correct = wordsOk && markOk && capitalOk && terminalOk && sentenceOk;
    const tags = [];
    const isSemicolon = String(mark).trim() === ';';
    if (!wordsOk) tags.push('boundary.words_changed');
    if (wordsOk && !markOk) {
      if (isSemicolon && /,/.test(between)) tags.push('boundary.comma_splice');
      else tags.push(isSemicolon ? 'boundary.semicolon_missing' : 'boundary.dash_missing');
    }
    if (!capitalOk) tags.push('boundary.capitalisation_missing');
    if (!terminalOk) tags.push('boundary.terminal_missing');
    if (terminalOk && !sentenceOk) tags.push('transfer.extra_sentence');
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
        ...(item.mode === 'paragraph' ? [] : [facet('single_sentence', sentenceOk)]),
      ],
    };
  }

  if (validator.type === 'requiresHyphenatedPhrase') {
    const { wordsOk, hyphenOk } = hyphenatedPhrase(text, validator.phrase);
    const capitalOk = sentenceStartsWithCapital(text);
    const terminalOk = sentenceEnds(text);
    const sentenceOk = transferSentenceOk(item, text);
    const completeOk = completeEnoughSentence(text, validator);
    const correct = wordsOk && hyphenOk && capitalOk && terminalOk && sentenceOk && completeOk;
    const tags = [];
    if (!wordsOk) tags.push('boundary.words_changed');
    if (wordsOk && !hyphenOk) tags.push('boundary.hyphen_missing');
    if (!capitalOk) tags.push('boundary.capitalisation_missing');
    if (!terminalOk) tags.push('boundary.terminal_missing');
    if (terminalOk && !sentenceOk) tags.push('transfer.extra_sentence');
    if (!completeOk) tags.push('transfer.sentence_fragment');
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
        ...(item.mode === 'paragraph' ? [] : [facet('single_sentence', sentenceOk)]),
        ...(minimumWordCount(validator) > 0 ? [facet('sentence_completeness', completeOk)] : []),
      ],
    };
  }

  if (validator.type === 'requiresParentheticalPhrase') {
    const { wordsOk, openOk, closeOk, punctuationOk } = parentheticalPhrase(text, validator);
    const capitalOk = sentenceStartsWithCapital(text);
    const terminalOk = sentenceEnds(text);
    const sentenceOk = transferSentenceOk(item, text);
    const correct = wordsOk && punctuationOk && capitalOk && terminalOk && sentenceOk;
    const tags = [];
    if (!wordsOk) tags.push('structure.words_changed');
    if (wordsOk && !punctuationOk) tags.push(openOk || closeOk ? 'structure.parenthesis_unbalanced' : 'structure.parenthesis_missing');
    if (!capitalOk) tags.push('structure.capitalisation_missing');
    if (!terminalOk) tags.push('structure.terminal_missing');
    if (terminalOk && !sentenceOk) tags.push('transfer.extra_sentence');
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
        ...(item.mode === 'paragraph' ? [] : [facet('single_sentence', sentenceOk)]),
      ],
    };
  }

  if (validator.type === 'requiresColonBeforeList') {
    const { wordsOk, colonOk, listOk, hasFinalComma } = colonBeforeList(text, validator);
    const capitalOk = sentenceStartsWithCapital(text);
    const terminalOk = sentenceEnds(text);
    const sentenceOk = transferSentenceOk(item, text);
    const correct = wordsOk && colonOk && listOk && capitalOk && terminalOk && sentenceOk;
    const tags = [];
    if (!wordsOk) tags.push('structure.list_words_changed');
    if (wordsOk && !colonOk) tags.push('structure.colon_missing');
    if (wordsOk && !listOk) tags.push(hasFinalComma ? 'comma.unnecessary_final_comma' : 'structure.list_separator_missing');
    if (!capitalOk) tags.push('structure.capitalisation_missing');
    if (!terminalOk) tags.push('structure.terminal_missing');
    if (terminalOk && !sentenceOk) tags.push('transfer.extra_sentence');
    return {
      correct,
      expected: item.model || '',
      note: correct
        ? 'The colon introduces the list after a complete opening clause.'
        : listCommaRejectionNote(
            validator,
            { hasFinalComma, tags },
            'Use the colon after the opening clause and keep the list items in order.',
          ),
      misconceptionTags: correct ? [] : [...new Set(tags.length ? tags : itemTags(item))],
      facets: [
        facet('preservation', wordsOk),
        facet('colon_boundary', colonOk),
        facet('list_separators', listOk),
        facet('capitalisation', capitalOk),
        facet('terminal_punctuation', terminalOk),
        ...(item.mode === 'paragraph' ? [] : [facet('single_sentence', sentenceOk)]),
      ],
    };
  }

  if (validator.type === 'requiresSemicolonList') {
    const { wordsOk, separatorsOk } = semicolonList(text, validator);
    const capitalOk = sentenceStartsWithCapital(text);
    const terminalOk = sentenceEnds(text);
    const sentenceOk = transferSentenceOk(item, text);
    const correct = wordsOk && separatorsOk && capitalOk && terminalOk && sentenceOk;
    const tags = [];
    if (!wordsOk) tags.push('structure.list_words_changed');
    if (wordsOk && !separatorsOk) tags.push('structure.semicolon_list_missing');
    if (!capitalOk) tags.push('structure.capitalisation_missing');
    if (!terminalOk) tags.push('structure.terminal_missing');
    if (terminalOk && !sentenceOk) tags.push('transfer.extra_sentence');
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
        ...(item.mode === 'paragraph' ? [] : [facet('single_sentence', sentenceOk)]),
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

function paragraphCheckItem(item, check = {}) {
  return {
    ...item,
    validator: check,
    misconceptionTags: uniqueStrings([
      ...(Array.isArray(check.misconceptionTags) ? check.misconceptionTags : []),
      ...itemTags(item),
    ]),
  };
}

function markRequiredApostropheForms(check = {}, rawText = '') {
  const clean = normaliseAnswerText(rawText)
    .replace(/[‘’]/g, "'")
    .replace(/\s+([,.;:?!])/g, '$1')
    .toLowerCase();
  const required = Array.isArray(check.tokens) ? check.tokens : [];
  const forbidden = Array.isArray(check.forbidden) ? check.forbidden : [];
  const missing = required.filter((token) => !clean.includes(String(token).toLowerCase()));
  const unrepaired = forbidden.filter((token) => clean.includes(String(token).toLowerCase()));
  const correct = missing.length === 0 && unrepaired.length === 0;
  const tags = [];
  if (missing.length) tags.push('apostrophe.required_forms_missing');
  if (unrepaired.length) tags.push('apostrophe.unrepaired_forms');
  return {
    correct,
    expected: '',
    note: correct ? 'The apostrophe forms are repaired.' : 'Repair every required apostrophe form and remove the unpunctuated forms.',
    misconceptionTags: correct ? [] : uniqueStrings([
      ...tags,
      ...(Array.isArray(check.misconceptionTags) ? check.misconceptionTags : []),
    ]),
    facets: [
      facet('apostrophe_forms', correct),
    ],
  };
}

function markParagraphPassageShape(item, rawText = '') {
  const expectedWords = stripPunctuation(item.model || acceptedAnswers(item)[0] || '');
  const typedWords = stripPunctuation(rawText);
  const correct = Boolean(expectedWords) && typedWords === expectedWords;
  return {
    correct,
    expected: item.model || '',
    note: correct ? 'The passage wording is preserved.' : 'Keep the whole passage wording and do not add extra sentences.',
    misconceptionTags: correct ? [] : ['paragraph.words_changed'],
    facets: [
      facet('preservation', correct),
    ],
  };
}

function aggregateParagraphFacets(results = []) {
  const facets = new Map();
  for (const result of results) {
    for (const entry of Array.isArray(result.facets) ? result.facets : []) {
      if (!entry?.id) continue;
      const current = facets.get(entry.id);
      facets.set(entry.id, {
        id: entry.id,
        ok: current ? current.ok && entry.ok === true : entry.ok === true,
        label: entry.label || current?.label || entry.id,
      });
    }
  }
  return [...facets.values()];
}

function markParagraph(item, answer) {
  if (item.validator?.type !== 'paragraphRepair') return null;
  const rawText = isPlainObject(answer) ? answer.typed ?? answer.answer : answer;
  const checks = Array.isArray(item.validator?.checks) ? item.validator.checks : [];
  if (!checks.length) return null;
  const results = [
    markParagraphPassageShape(item, rawText),
    ...checks.map((check) => {
      if (check?.type === 'requiresApostropheForms') return markRequiredApostropheForms(check, rawText);
      return markTransfer(paragraphCheckItem(item, check), { typed: rawText });
    }),
  ].filter(Boolean);
  if (!results.length) return null;

  const correct = results.every((result) => result.correct);
  return {
    correct,
    expected: item.model || '',
    note: correct ? (item.explanation || 'The passage has been repaired.') : 'Repair every punctuation pattern in the passage.',
    misconceptionTags: correct ? [] : uniqueStrings(results.flatMap((result) => result.correct ? [] : result.misconceptionTags || [])),
    facets: aggregateParagraphFacets(results),
  };
}

function markCombine(item, answer) {
  const rawText = isPlainObject(answer) ? answer.typed ?? answer.answer : answer;
  const text = normaliseAnswerText(rawText);
  const validator = item.validator || {};

  // Content preservation gate for combine items with a validator.
  // Only fires on extra-tail violations; word-change is left to validator logic.
  if (validator.type) {
    const preservation = evaluatePreservation(text, item);
    if (!preservation.preserved && preservation.extraWords.length > 0) {
      return {
        correct: false,
        expected: item.model || '',
        note: 'You changed the sentence — only add or fix the punctuation.',
        misconceptionTags: ['content.words_added_or_changed'],
        facets: [facet('content_preservation', false)],
      };
    }
  }
  const capitalOk = sentenceStartsWithCapital(text);
  const requiredTerminal = terminalMarkFromModel(item);
  const terminalOk = sentenceEnds(text, requiredTerminal);
  const expected = item.model || '';

  if (validator.type === 'combineListSentence') {
    const { wordsOk, listOk, sentenceOk, hasFinalComma } = anchoredListSentence(text, validator, requiredTerminal);
    const correct = wordsOk && listOk && capitalOk && terminalOk && sentenceOk;
    const tags = [];
    if (!wordsOk) tags.push('comma.list_words_changed');
    if (wordsOk && !listOk) tags.push(hasFinalComma ? 'comma.unnecessary_final_comma' : 'comma.list_separator_missing');
    if (!capitalOk) tags.push('comma.capitalisation_missing');
    if (!terminalOk) tags.push('comma.terminal_missing');
    if (terminalOk && !sentenceOk) tags.push('combine.extra_sentence');
    return {
      correct,
      expected,
      note: correct
        ? 'The notes have been combined into one clear list sentence.'
        : listCommaRejectionNote(
            validator,
            { hasFinalComma, tags },
            'Keep the list words in order and separate the list with the expected comma.',
          ),
      misconceptionTags: correct ? [] : [...new Set(tags.length ? tags : itemTags(item))],
      facets: [
        facet('preservation', wordsOk),
        facet('comma_placement', listOk),
        facet('capitalisation', capitalOk),
        facet('terminal_punctuation', terminalOk),
        facet('single_sentence', sentenceOk),
      ],
    };
  }

  if (validator.type === 'combineFrontedAdverbial') {
    const { wordsOk, phraseOk, commaOk, sentenceOk } = anchoredFrontedAdverbial(text, validator, requiredTerminal);
    const correct = wordsOk && commaOk && capitalOk && terminalOk && sentenceOk;
    const tags = [];
    if (!phraseOk || !wordsOk) tags.push('comma.opening_phrase_changed');
    if (phraseOk && !commaOk) tags.push(primaryCommaTag(item, 'comma.fronted_adverbial_missing'));
    if (!capitalOk) tags.push('comma.capitalisation_missing');
    if (!terminalOk) tags.push('comma.terminal_missing');
    if (terminalOk && !sentenceOk) tags.push('combine.extra_sentence');
    return {
      correct,
      expected,
      note: correct ? 'The fronted adverbial is combined with a comma after it.' : 'Keep the phrase first, add the comma, and combine it with the main clause.',
      misconceptionTags: correct ? [] : [...new Set(tags.length ? tags : itemTags(item))],
      facets: [
        facet('preservation', wordsOk),
        facet('comma_placement', commaOk),
        facet('capitalisation', capitalOk),
        facet('terminal_punctuation', terminalOk),
        facet('single_sentence', sentenceOk),
      ],
    };
  }

  if (validator.type === 'combineParentheticalPhrase') {
    const { wordsOk, openOk, closeOk, punctuationOk, sentenceOk } = anchoredParentheticalPhrase(text, validator, requiredTerminal);
    const correct = wordsOk && punctuationOk && capitalOk && terminalOk && sentenceOk;
    const tags = [];
    if (!wordsOk) tags.push('structure.words_changed');
    if (wordsOk && !punctuationOk) tags.push(openOk || closeOk ? 'structure.parenthesis_unbalanced' : 'structure.parenthesis_missing');
    if (!capitalOk) tags.push('structure.capitalisation_missing');
    if (!terminalOk) tags.push('structure.terminal_missing');
    if (terminalOk && !sentenceOk) tags.push('combine.extra_sentence');
    return {
      correct,
      expected,
      note: correct ? 'The extra detail is combined as clear parenthesis.' : 'Keep the sentence parts in order and mark both sides of the parenthesis.',
      misconceptionTags: correct ? [] : [...new Set(tags.length ? tags : itemTags(item))],
      facets: [
        facet('preservation', wordsOk),
        facet('parenthetical_phrase', punctuationOk),
        facet('capitalisation', capitalOk),
        facet('terminal_punctuation', terminalOk),
        facet('single_sentence', sentenceOk),
      ],
    };
  }

  if (validator.type === 'combineColonList') {
    const { wordsOk, colonOk, listOk, hasFinalComma } = colonBeforeList(text, validator);
    const sentenceOk = singleSentenceOk(text, requiredTerminal);
    const correct = wordsOk && colonOk && listOk && capitalOk && terminalOk && sentenceOk;
    const tags = [];
    if (!wordsOk) tags.push('structure.list_words_changed');
    if (wordsOk && !colonOk) tags.push('structure.colon_missing');
    if (wordsOk && !listOk) tags.push(hasFinalComma ? 'comma.unnecessary_final_comma' : 'structure.list_separator_missing');
    if (!capitalOk) tags.push('structure.capitalisation_missing');
    if (!terminalOk) tags.push('structure.terminal_missing');
    if (terminalOk && !sentenceOk) tags.push('combine.extra_sentence');
    return {
      correct,
      expected,
      note: correct
        ? 'The opening clause and list are combined with a colon.'
        : listCommaRejectionNote(
            validator,
            { hasFinalComma, tags },
            'Use the colon after the opening clause and keep the list items in order.',
          ),
      misconceptionTags: correct ? [] : [...new Set(tags.length ? tags : itemTags(item))],
      facets: [
        facet('preservation', wordsOk),
        facet('colon_boundary', colonOk),
        facet('list_separators', listOk),
        facet('capitalisation', capitalOk),
        facet('terminal_punctuation', terminalOk),
        facet('single_sentence', sentenceOk),
      ],
    };
  }

  if (validator.type === 'combineBoundaryBetweenClauses') {
    const { wordsOk, markOk, between, mark, sentenceOk } = anchoredBoundarySentence(text, validator, requiredTerminal);
    const isSemicolon = mark === ';';
    const correct = wordsOk && markOk && capitalOk && terminalOk && sentenceOk;
    const tags = [];
    if (!wordsOk) tags.push('boundary.words_changed');
    if (wordsOk && !markOk) {
      if (isSemicolon && /,/.test(between)) tags.push('boundary.comma_splice');
      else tags.push(isSemicolon ? 'boundary.semicolon_missing' : 'boundary.dash_missing');
    }
    if (!capitalOk) tags.push('boundary.capitalisation_missing');
    if (!terminalOk) tags.push('boundary.terminal_missing');
    if (terminalOk && !sentenceOk) tags.push('combine.extra_sentence');
    return {
      correct,
      expected,
      note: correct ? 'The related clauses are combined into one punctuated sentence.' : 'Keep both clauses in order and put the target boundary mark between them.',
      misconceptionTags: correct ? [] : [...new Set(tags.length ? tags : itemTags(item))],
      facets: [
        facet('preservation', wordsOk),
        facet('boundary_mark', markOk),
        facet('capitalisation', capitalOk),
        facet('terminal_punctuation', terminalOk),
        facet('single_sentence', sentenceOk),
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
    note: exact
      ? (item.explanation || '')
      : (rubricResult?.facets?.length
          ? (speechFailureNote(rubricResult.facets) || 'Check the direct-speech punctuation carefully.')
          : item.explanation || ''),
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
  if (item.mode === 'paragraph') {
    const paragraph = markParagraph(item, answer);
    if (paragraph) return paragraph;
  }
  if (item.mode === 'combine') {
    const combine = markCombine(item, answer);
    if (combine) return combine;
  }
  if (item.validator) {
    const transfer = markTransfer(item, answer);
    if (transfer) return transfer;
  }
  return markExact(item, answer);
}
