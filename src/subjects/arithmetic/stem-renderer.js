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
  '<': 'is less than',
  '>': 'is greater than',
  '≤': 'is less than or equal to',
  '≥': 'is greater than or equal to',
  '≠': 'is not equal to',
  '≈': 'approximately equals',
  '±': 'plus or minus',
  '^': 'to the power of',
  '/': 'over',
  ':': 'to',
});

const SYMBOL_LABELS = Object.freeze({
  '%': 'percent',
  '(': 'open bracket',
  ')': 'close bracket',
  '[': 'open square bracket',
  ']': 'close square bracket',
  '{': 'open brace',
  '}': 'close brace',
});

const LATEX_COMMANDS = Object.freeze({
  times: { type: 'operator', text: '×', label: 'times' },
  cdot: { type: 'operator', text: '×', label: 'times' },
  div: { type: 'operator', text: '÷', label: 'divided by' },
  le: { type: 'operator', text: '≤', label: 'is less than or equal to' },
  leq: { type: 'operator', text: '≤', label: 'is less than or equal to' },
  ge: { type: 'operator', text: '≥', label: 'is greater than or equal to' },
  geq: { type: 'operator', text: '≥', label: 'is greater than or equal to' },
  ne: { type: 'operator', text: '≠', label: 'is not equal to' },
  neq: { type: 'operator', text: '≠', label: 'is not equal to' },
  approx: { type: 'operator', text: '≈', label: 'approximately equals' },
  pm: { type: 'operator', text: '±', label: 'plus or minus' },
  percent: { type: 'symbol', text: '%', label: 'percent' },
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

function normalisedSource(value) {
  return String(value || '').trim();
}

function isPlainInteger(value) {
  return /^\d+$/.test(normalisedNumberText(normalisedSource(value)));
}

function skipSpaces(text, index) {
  let cursor = index;
  while (/\s/.test(text[cursor] || '')) cursor += 1;
  return cursor;
}

function matchNumberAt(text, index) {
  const match = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/.exec(text.slice(index));
  if (!match) return null;
  return { source: match[0], text: match[0], end: index + match[0].length };
}

function parseDelimited(text, index, open, close) {
  if (text[index] !== open) return null;
  let depth = 0;
  for (let cursor = index; cursor < text.length; cursor += 1) {
    const char = text[cursor];
    if (char === open) depth += 1;
    if (char === close) depth -= 1;
    if (depth === 0) {
      return {
        source: text.slice(index, cursor + 1),
        inner: text.slice(index + 1, cursor),
        end: cursor + 1,
      };
    }
  }
  return null;
}

function parseFractionAtom(text, index) {
  const start = skipSpaces(text, index);
  const grouped = parseDelimited(text, start, '(', ')') || parseDelimited(text, start, '{', '}');
  if (grouped) {
    return {
      source: normalisedSource(grouped.inner),
      end: grouped.end,
      grouped: true,
    };
  }
  const number = matchNumberAt(text, start);
  if (number) {
    return {
      source: number.source,
      end: number.end,
      grouped: false,
    };
  }
  const variable = /^[A-Za-z]+/.exec(text.slice(start));
  if (variable) {
    return {
      source: variable[0],
      end: start + variable[0].length,
      grouped: false,
    };
  }
  return null;
}

function expressionFractionToken(source, numeratorSource, denominatorSource) {
  const numerator = normalisedSource(numeratorSource);
  const denominator = normalisedSource(denominatorSource);
  return {
    type: 'expression-fraction',
    source,
    numeratorSource: numerator,
    denominatorSource: denominator,
    numeratorTokens: tokeniseArithmeticStem(numerator),
    denominatorTokens: tokeniseArithmeticStem(denominator),
  };
}

function matchLongDivisionDividendAt(text, index) {
  const match = /^[\d□,]+/.exec(text.slice(index));
  if (!match) return null;
  return {
    source: match[0],
    end: index + match[0].length,
  };
}

function longDivisionToken(source, divisorSource, dividendSource) {
  const divisor = normalisedSource(divisorSource);
  const dividend = normalisedSource(dividendSource);
  return {
    type: 'long-division',
    source,
    divisorSource: divisor,
    dividendSource: dividend,
    divisorTokens: tokeniseArithmeticStem(divisor),
    dividendTokens: tokeniseArithmeticStem(dividend),
  };
}

function matchLongDivisionAt(text, index) {
  const divisor = matchNumberAt(text, index);
  if (!divisor || isInsideProseHyphen(text, index, divisor.end) || !isPlainInteger(divisor.source)) return null;
  const bracketIndex = skipSpaces(text, divisor.end);
  if (text[bracketIndex] !== ')') return null;
  const dividendStart = skipSpaces(text, bracketIndex + 1);
  const dividend = matchLongDivisionDividendAt(text, dividendStart);
  if (!dividend) return null;
  return {
    token: longDivisionToken(
      text.slice(index, dividend.end),
      divisor.source,
      dividend.source,
    ),
    end: dividend.end,
  };
}

function matchGroupedSlashFractionAt(text, index) {
  const numeratorGroup = parseDelimited(text, index, '(', ')');
  if (numeratorGroup) {
    const slashIndex = skipSpaces(text, numeratorGroup.end);
    if (text[slashIndex] !== '/') return null;
    const denominator = parseFractionAtom(text, slashIndex + 1);
    if (!denominator) return null;
    return {
      token: expressionFractionToken(
        text.slice(index, denominator.end),
        numeratorGroup.inner,
        denominator.source,
      ),
      end: denominator.end,
    };
  }

  const numerator = matchNumberAt(text, index);
  if (!numerator || isInsideProseHyphen(text, index, numerator.end)) return null;
  const slashIndex = skipSpaces(text, numerator.end);
  if (text[slashIndex] !== '/') return null;
  const denominator = parseFractionAtom(text, slashIndex + 1);
  if (!denominator || (!denominator.grouped && isPlainInteger(denominator.source))) return null;
  return {
    token: expressionFractionToken(
      text.slice(index, denominator.end),
      numerator.source,
      denominator.source,
    ),
    end: denominator.end,
  };
}

function matchLatexAt(text, index) {
  if (text[index] !== '\\') return null;
  const commandMatch = /^\\([A-Za-z]+)/.exec(text.slice(index));
  if (!commandMatch) return null;
  const command = commandMatch[1];
  let cursor = index + commandMatch[0].length;

  if (command === 'frac') {
    const numerator = parseDelimited(text, skipSpaces(text, cursor), '{', '}');
    if (!numerator) return null;
    const denominator = parseDelimited(text, skipSpaces(text, numerator.end), '{', '}');
    if (!denominator) return null;
    return {
      token: expressionFractionToken(
        text.slice(index, denominator.end),
        numerator.inner,
        denominator.inner,
      ),
      end: denominator.end,
    };
  }

  if (command === 'sqrt') {
    const radicand = parseDelimited(text, skipSpaces(text, cursor), '{', '}');
    if (!radicand) return null;
    const radicandSource = normalisedSource(radicand.inner);
    return {
      token: {
        type: 'sqrt',
        source: text.slice(index, radicand.end),
        text: '√',
        radicandSource,
        radicandTokens: tokeniseArithmeticStem(radicandSource),
      },
      end: radicand.end,
    };
  }

  const mapped = LATEX_COMMANDS[command];
  if (!mapped) return null;
  return {
    token: {
      ...mapped,
      source: text.slice(index, cursor),
    },
    end: cursor,
  };
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

function normaliseLabelSpacing(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim();
}

function tokensAriaLabel(tokens = []) {
  return normaliseLabelSpacing(tokens
    .map((token) => {
      if (token.type === 'mixed-number') return mixedNumberAriaLabel(token);
      if (token.type === 'fraction') return fractionAriaLabel(token);
      if (token.type === 'expression-fraction') return expressionFractionAriaLabel(token);
      if (token.type === 'sqrt') return sqrtAriaLabel(token);
      if (token.type === 'long-division') return longDivisionAriaLabel(token);
      if (token.type === 'operator') return token.label;
      if (token.type === 'symbol') return token.label;
      if (token.type === 'placeholder') return token.label;
      if (token.type === 'number') return token.text;
      return token.text.replace(/\s+/g, ' ');
    })
    .join(' '));
}

export function expressionFractionAriaLabel({ numeratorSource, denominatorSource, numeratorTokens, denominatorTokens }) {
  if (isPlainInteger(numeratorSource) && isPlainInteger(denominatorSource)) {
    return fractionAriaLabel({ numerator: numeratorSource, denominator: denominatorSource });
  }
  return `${tokensAriaLabel(numeratorTokens)} over ${tokensAriaLabel(denominatorTokens)}`;
}

export function sqrtAriaLabel({ radicandTokens }) {
  return `square root of ${tokensAriaLabel(radicandTokens)}`;
}

export function longDivisionAriaLabel({ divisorTokens, dividendTokens }) {
  return `${tokensAriaLabel(dividendTokens)} divided by ${tokensAriaLabel(divisorTokens)}`;
}

export function tokeniseArithmeticStem(stem = '') {
  const text = String(stem || '');
  const tokens = [];
  let cursor = 0;

  while (cursor < text.length) {
    const latex = matchLatexAt(text, cursor);
    if (latex) {
      tokens.push(latex.token);
      cursor = latex.end;
      continue;
    }

    const longDivision = matchLongDivisionAt(text, cursor);
    if (longDivision) {
      tokens.push(longDivision.token);
      cursor = longDivision.end;
      continue;
    }

    const groupedFraction = matchGroupedSlashFractionAt(text, cursor);
    if (groupedFraction) {
      tokens.push(groupedFraction.token);
      cursor = groupedFraction.end;
      continue;
    }

    const mixedNumber = /^((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s+(\d+)\/(\d+)/.exec(text.slice(cursor));
    if (mixedNumber && !isInsideProseHyphen(text, cursor, cursor + mixedNumber[0].length)) {
      tokens.push({
        type: 'mixed-number',
        source: mixedNumber[0],
        whole: mixedNumber[1],
        numerator: mixedNumber[2],
        denominator: mixedNumber[3],
      });
      cursor += mixedNumber[0].length;
      continue;
    }

    const fraction = /^(\d+)\/(\d+)/.exec(text.slice(cursor));
    if (fraction) {
      tokens.push({
        type: 'fraction',
        source: fraction[0],
        numerator: fraction[1],
        denominator: fraction[2],
      });
      cursor += fraction[0].length;
      continue;
    }

    const number = matchNumberAt(text, cursor);
    if (number) {
      if (isInsideProseHyphen(text, cursor, number.end)) {
        pushTextToken(tokens, number.source);
        cursor = number.end;
        continue;
      }
      tokens.push({
        type: 'number',
        source: number.source,
        text: number.text,
      });
      cursor = number.end;
      continue;
    }

    const char = text[cursor];
    if (char === '-' && isProseHyphen(text, cursor)) {
      pushTextToken(tokens, char);
      cursor += 1;
      continue;
    }

    if (OPERATOR_LABELS[char]) {
      tokens.push({
        type: 'operator',
        source: char,
        text: char,
        label: OPERATOR_LABELS[char],
      });
      cursor += 1;
      continue;
    }

    if (SYMBOL_LABELS[char]) {
      tokens.push({
        type: 'symbol',
        source: char,
        text: char,
        label: SYMBOL_LABELS[char],
      });
      cursor += 1;
      continue;
    }

    if (char === '□') {
      tokens.push({
        type: 'placeholder',
        source: char,
        text: char,
        label: 'blank',
      });
      cursor += 1;
      continue;
    }

    if (char === '√') {
      tokens.push({
        type: 'operator',
        source: char,
        text: char,
        label: 'square root',
      });
      cursor += 1;
      continue;
    }

    pushTextToken(tokens, char);
    cursor += 1;
  }

  return tokens;
}

export function arithmeticStemAriaLabel(stem = '') {
  return tokensAriaLabel(tokeniseArithmeticStem(stem));
}
