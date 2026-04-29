const GRAMMAR_SPEECH_RATE_MIN = 0.6;
const GRAMMAR_SPEECH_RATE_MAX = 1.4;
const DEFAULT_GRAMMAR_SPEECH_RATE = 1;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanSpeechText(value, limit = 2400) {
  const text = String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > limit ? text.slice(0, limit).trim() : text;
}

function optionLabel(option) {
  if (Array.isArray(option)) return cleanSpeechText(option[1] ?? option[0] ?? '', 180);
  return cleanSpeechText(option?.label ?? option?.value ?? '', 180);
}

function pushText(parts, value, limit) {
  const text = cleanSpeechText(value, limit);
  if (text) parts.push(text);
}

function pushTextList(parts, list, limit = 180) {
  for (const entry of Array.isArray(list) ? list : []) {
    pushText(parts, entry, limit);
  }
}

function inputSpecSpeechParts(inputSpec = {}) {
  const parts = [];
  if (!isPlainObject(inputSpec)) return parts;

  if (inputSpec.label) pushText(parts, inputSpec.label, 160);

  if (inputSpec.type === 'single_choice' || inputSpec.type === 'checkbox_list') {
    const options = (Array.isArray(inputSpec.options) ? inputSpec.options : [])
      .map(optionLabel)
      .filter(Boolean);
    if (options.length) parts.push(`Options: ${options.join('. ')}`);
    return parts;
  }

  if (inputSpec.type === 'table_choice') {
    const rows = Array.isArray(inputSpec.rows) ? inputSpec.rows : [];
    const hasRowOptions = rows.some((row) => Array.isArray(row?.options) && row.options.length > 0);

    if (hasRowOptions) {
      for (const row of rows) {
        const label = cleanSpeechText(row?.label, 180);
        const opts = (Array.isArray(row?.options) ? row.options : [])
          .map(optionLabel)
          .filter(Boolean);
        if (label && opts.length) parts.push(`Row ${label}: ${opts.join(', ')}`);
        else if (label) parts.push(`Row ${label}`);
      }
    } else {
      const rowLabels = rows
        .map((row) => cleanSpeechText(row?.label, 180))
        .filter(Boolean);
      const columns = (Array.isArray(inputSpec.columns) ? inputSpec.columns : [])
        .map((column) => cleanSpeechText(column, 80))
        .filter(Boolean);
      if (rowLabels.length) parts.push(`Rows: ${rowLabels.join('. ')}`);
      if (columns.length) parts.push(`Choices: ${columns.join(', ')}`);
    }
    return parts;
  }

  if (inputSpec.type === 'multi') {
    for (const field of Array.isArray(inputSpec.fields) ? inputSpec.fields : []) {
      const label = cleanSpeechText(field?.label, 160);
      const options = (Array.isArray(field?.options) ? field.options : [])
        .map(optionLabel)
        .filter(Boolean);
      if (label && options.length) parts.push(`${label}: ${options.join(', ')}`);
      else if (label) parts.push(label);
    }
    return parts;
  }

  pushText(parts, inputSpec.placeholder, 160);
  return parts;
}

function currentMiniTestItem(session = {}) {
  const miniTest = session?.miniTest;
  const questions = Array.isArray(miniTest?.questions) ? miniTest.questions : [];
  const current = questions.find((question) => question.current)
    || questions[Number(miniTest?.currentIndex) || 0]
    || null;
  return current?.item || null;
}

function pushSupportGuidance(parts, support) {
  if (!isPlainObject(support)) return;
  pushText(parts, support.title, 160);
  pushText(parts, support.summary, 420);
  pushTextList(parts, support.notices, 180);

  const example = isPlainObject(support.workedExample) ? support.workedExample : {};
  pushText(parts, example.prompt, 220);
  pushText(parts, example.exampleResponse, 220);
  pushText(parts, example.why, 260);

  const contrast = isPlainObject(support.contrast) ? support.contrast : {};
  pushText(parts, contrast.secureExample, 220);
  pushText(parts, contrast.nearMiss, 220);
  pushText(parts, contrast.why, 260);
}

function pushVisibleFeedback(parts, feedback) {
  if (!isPlainObject(feedback)) return;
  const result = isPlainObject(feedback.result) ? feedback.result : {};
  pushText(parts, result.feedbackShort, 200);
  pushText(parts, result.feedbackLong, 420);
  pushText(parts, result.minimalHint, 260);
  pushText(parts, result.answerText ? `Answer: ${result.answerText}` : '', 320);

  const solution = isPlainObject(feedback.workedSolution) ? feedback.workedSolution : {};
  pushText(parts, solution.answerText ? `Worked solution answer: ${solution.answerText}` : '', 320);
  pushText(parts, solution.explanation, 420);
  pushText(parts, solution.check, 260);
}

export function normaliseGrammarSpeechRate(value, fallback = DEFAULT_GRAMMAR_SPEECH_RATE) {
  const numeric = Number(value);
  const base = Number.isFinite(numeric) ? numeric : Number(fallback);
  const safe = Number.isFinite(base) ? base : DEFAULT_GRAMMAR_SPEECH_RATE;
  return Math.round(Math.min(GRAMMAR_SPEECH_RATE_MAX, Math.max(GRAMMAR_SPEECH_RATE_MIN, safe)) * 100) / 100;
}

export function buildGrammarSpeechText(grammar = {}) {
  const session = grammar?.session;
  if (!isPlainObject(session)) return '';

  const miniItem = session.type === 'mini-set' ? currentMiniTestItem(session) : null;
  const item = miniItem || session.currentItem || {};
  const parts = [];

  const readAloud = typeof item.readAloudText === 'string' ? item.readAloudText.trim() : '';
  const screenReader = typeof item.screenReaderPromptText === 'string' ? item.screenReaderPromptText.trim() : '';

  if (readAloud) {
    pushText(parts, readAloud, 720);
    parts.push(...inputSpecSpeechParts(item.inputSpec || {}));
  } else if (screenReader) {
    pushText(parts, screenReader, 720);
    parts.push(...inputSpecSpeechParts(item.inputSpec || {}));
  } else {
    pushText(parts, item.templateLabel, 180);
    pushText(parts, item.promptText, 520);
    pushText(parts, item.checkLine, 360);
    parts.push(...inputSpecSpeechParts(item.inputSpec || {}));
  }

  if (session.type !== 'mini-set') {
    pushSupportGuidance(parts, session.supportGuidance);
    pushVisibleFeedback(parts, grammar.feedback);
  }

  return cleanSpeechText(parts.filter(Boolean).join('. '));
}

export function isGrammarSpeechAvailable(globalObject = globalThis) {
  return Boolean(globalObject?.speechSynthesis && globalObject?.SpeechSynthesisUtterance);
}

export function speakGrammarReadModel(grammar, {
  globalObject = globalThis,
  rate = DEFAULT_GRAMMAR_SPEECH_RATE,
} = {}) {
  const text = buildGrammarSpeechText(grammar);
  if (!text) {
    return {
      ok: false,
      code: 'grammar_speech_empty',
      message: 'No Grammar question is visible to read aloud.',
    };
  }
  if (!isGrammarSpeechAvailable(globalObject)) {
    return {
      ok: false,
      code: 'grammar_speech_unavailable',
      message: 'Speech synthesis is unavailable in this browser.',
      text,
    };
  }

  const utterance = new globalObject.SpeechSynthesisUtterance(text);
  utterance.rate = normaliseGrammarSpeechRate(rate);
  utterance.lang = 'en-GB';
  globalObject.speechSynthesis.cancel?.();
  globalObject.speechSynthesis.speak(utterance);
  return {
    ok: true,
    text,
    rate: utterance.rate,
  };
}

export {
  DEFAULT_GRAMMAR_SPEECH_RATE,
  GRAMMAR_SPEECH_RATE_MAX,
  GRAMMAR_SPEECH_RATE_MIN,
};
