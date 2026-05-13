const DENOMINATOR_LABELS = Object.freeze({
  2: ['half', 'halves'],
  3: ['third', 'thirds'],
  4: ['quarter', 'quarters'],
  5: ['fifth', 'fifths'],
  6: ['sixth', 'sixths'],
  7: ['seventh', 'sevenths'],
  8: ['eighth', 'eighths'],
  9: ['ninth', 'ninths'],
  10: ['tenth', 'tenths'],
  11: ['eleventh', 'elevenths'],
  12: ['twelfth', 'twelfths'],
  15: ['fifteenth', 'fifteenths'],
  16: ['sixteenth', 'sixteenths'],
  18: ['eighteenth', 'eighteenths'],
  20: ['twentieth', 'twentieths'],
});

const OPERATOR_LABELS = Object.freeze({
  '+': 'plus',
  '-': 'minus',
  '−': 'minus',
  '×': 'times',
  '÷': 'divided by',
  '=': 'equals',
});

function pushTextToken(tokens, value) {
  if (!value) return;
  const previous = tokens[tokens.length - 1];
  if (previous?.type === 'text') {
    previous.text += value;
    return;
  }
  tokens.push({ type: 'text', text: value });
}

function isAsciiLetter(value) {
  return /^[A-Za-z]$/.test(value || '');
}

function isAsciiAlphaNumeric(value) {
  return /^[A-Za-z0-9]$/.test(value || '');
}

function isProseHyphen(text, index) {
  const before = text[index - 1];
  const after = text[index + 1];
  return (
    isAsciiAlphaNumeric(before)
    && isAsciiAlphaNumeric(after)
    && (isAsciiLetter(before) || isAsciiLetter(after))
  );
}

function isInsideProseHyphen(text, start, end) {
  return (
    (text[end] === '-' && isProseHyphen(text, end))
    || (text[start - 1] === '-' && isProseHyphen(text, start - 1))
  );
}

function normalisedNumberText(value) {
  return String(value || '').replace(/,/g, '');
}

function denominatorLabel(denominator, numerator = 2) {
  const d = Number(denominator);
  const n = Math.abs(Number(numerator));
  const labels = DENOMINATOR_LABELS[d];
  if (labels) return n === 1 ? labels[0] : labels[1];
  return n === 1 ? `${d}th` : `${d}ths`;
}

export function fractionAriaLabel({ numerator, denominator }) {
  return `${Number(normalisedNumberText(numerator))} ${denominatorLabel(denominator, numerator)}`;
}

export function mixedNumberAriaLabel({ whole, numerator, denominator }) {
  return `${Number(normalisedNumberText(whole))} and ${fractionAriaLabel({ numerator, denominator })}`;
}

export function tokeniseArithmeticStem(stem = '') {
  const text = String(stem || '');
  const tokens = [];
  const numberPattern = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?';
  const tokenPattern = new RegExp(`(${numberPattern})\\s+(\\d+)\\/(\\d+)|(\\d+)\\/(\\d+)|(${numberPattern})|([+\\-−×÷=])|(□)`, 'g');
  let cursor = 0;
  let match;

  while ((match = tokenPattern.exec(text)) !== null) {
    if (match[6] !== undefined && isInsideProseHyphen(text, match.index, match.index + match[0].length)) {
      pushTextToken(tokens, text.slice(cursor, match.index + match[0].length));
      cursor = match.index + match[0].length;
      continue;
    }

    if (match[7] === '-' && isProseHyphen(text, match.index)) {
      pushTextToken(tokens, text.slice(cursor, match.index + 1));
      cursor = match.index + 1;
      continue;
    }

    pushTextToken(tokens, text.slice(cursor, match.index));
    if (match[1] !== undefined) {
      tokens.push({
        type: 'mixed-number',
        source: match[0],
        whole: match[1],
        numerator: match[2],
        denominator: match[3],
      });
    } else if (match[4] !== undefined) {
      tokens.push({
        type: 'fraction',
        source: match[0],
        numerator: match[4],
        denominator: match[5],
      });
    } else if (match[6] !== undefined) {
      tokens.push({
        type: 'number',
        source: match[0],
        text: match[6],
      });
    } else if (match[7] !== undefined) {
      tokens.push({
        type: 'operator',
        source: match[0],
        text: match[7],
        label: OPERATOR_LABELS[match[7]],
      });
    } else {
      tokens.push({
        type: 'placeholder',
        source: match[0],
        text: match[8],
        label: 'blank',
      });
    }
    cursor = match.index + match[0].length;
  }

  pushTextToken(tokens, text.slice(cursor));
  return tokens;
}

export function arithmeticStemAriaLabel(stem = '') {
  return tokeniseArithmeticStem(stem)
    .map((token) => {
      if (token.type === 'mixed-number') return mixedNumberAriaLabel(token);
      if (token.type === 'fraction') return fractionAriaLabel(token);
      if (token.type === 'operator') return token.label;
      if (token.type === 'placeholder') return token.label;
      if (token.type === 'number') return token.text;
      return token.text.replace(/\s+/g, ' ');
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim();
}
