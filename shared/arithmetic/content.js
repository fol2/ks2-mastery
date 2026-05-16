import {
  ARITHMETIC_CONTENT_RELEASE_ID,
  ARITHMETIC_GOAL_OPTIONS,
  ARITHMETIC_MINIMAL_HINTS,
  ARITHMETIC_MISCONCEPTIONS,
  ARITHMETIC_MODE_OPTIONS,
  ARITHMETIC_SKILLS,
  ARITHMETIC_STRANDS,
  ARITHMETIC_SUBJECT_ID,
  ARITHMETIC_TEST_FORMS,
} from './metadata.js';

export {
  ARITHMETIC_CONTENT_RELEASE_ID,
  ARITHMETIC_GOAL_OPTIONS,
  ARITHMETIC_MINIMAL_HINTS,
  ARITHMETIC_MISCONCEPTIONS,
  ARITHMETIC_MODE_OPTIONS,
  ARITHMETIC_SKILLS,
  ARITHMETIC_STRANDS,
  ARITHMETIC_SUBJECT_ID,
  ARITHMETIC_TEST_FORMS,
} from './metadata.js';

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

export function hashString(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededRng(seed) {
  let t = (Number(seed) || 1) >>> 0;
  return function rng() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick(rng, values) {
  return values[randInt(rng, 0, values.length - 1)];
}

export function gcd(a, b) {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y) [x, y] = [y, x % y];
  return x || 1;
}

export function normaliseFraction(n, d) {
  let numerator = Math.trunc(n);
  let denominator = Math.trunc(d);
  if (!denominator) return { n: 0, d: 1 };
  if (denominator < 0) {
    numerator *= -1;
    denominator *= -1;
  }
  const factor = gcd(numerator, denominator);
  return { n: numerator / factor, d: denominator / factor };
}

export function fractionText(n, d) {
  return `${n}/${d}`;
}

export function mixedFractionText(n, d, preferMixed = true) {
  const f = normaliseFraction(n, d);
  if (f.d === 1) return String(f.n);
  const sign = f.n < 0 ? '-' : '';
  const absN = Math.abs(f.n);
  if (preferMixed && absN > f.d) {
    const whole = Math.floor(absN / f.d);
    const rem = absN % f.d;
    if (!rem) return `${sign}${whole}`;
    return `${sign}${whole} ${rem}/${f.d}`;
  }
  return `${f.n}/${f.d}`;
}

export function formatNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value || '0');
  if (Number.isInteger(numeric)) return numeric.toLocaleString('en-GB');
  return numeric.toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
}

function plainIntegerText(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value || '0');
  return String(Math.trunc(numeric));
}

function normaliseGroupingSpaces(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function hasValidNumberGrouping(value) {
  const text = normaliseGroupingSpaces(value);
  if (!text) return true;
  const hasComma = text.includes(',');
  const hasSpace = /\s/.test(text);
  if (!hasComma && !hasSpace) return true;
  if (hasComma && hasSpace) return false;
  if (hasComma) return /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d*)?$/.test(text);
  return /^[+-]?\d{1,3}(?: \d{3})+(?:\.\d*)?$/.test(text);
}

function visualVertical(top, bottom, op, result = '') {
  const lines = [String(top), `${op} ${String(bottom)}`];
  const width = Math.max(...lines.map((line) => line.length), String(result || '').length, 4);
  const padded = [String(top).padStart(width), `${op} ${String(bottom).padStart(width - 2)}`, '─'.repeat(width)];
  if (result) padded.push(String(result).padStart(width));
  return padded.join('\n');
}

const VULGAR = Object.freeze({
  '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3', '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5', '⅙': '1/6', '⅚': '5/6', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
});

const VULGAR_GLYPHS = Object.freeze(Object.keys(VULGAR));
const VULGAR_GLYPH_CLASS = VULGAR_GLYPHS.join('');
const VULGAR_AFTER_WHOLE_RE = new RegExp(`(\\d)\\s*([${VULGAR_GLYPH_CLASS}])`, 'g');
const VULGAR_AFTER_SIGN_RE = new RegExp(`([+\\-])\\s*([${VULGAR_GLYPH_CLASS}])`, 'g');
const VULGAR_RE = new RegExp(`[${VULGAR_GLYPH_CLASS}]`, 'g');

function expandVulgarFractions(value) {
  let text = String(value || '');
  text = text.replace(VULGAR_AFTER_WHOLE_RE, (_match, whole, glyph) => `${whole} ${VULGAR[glyph] || glyph}`);
  text = text.replace(VULGAR_AFTER_SIGN_RE, (_match, sign, glyph) => `${sign}${VULGAR[glyph] || glyph}`);
  return text.replace(VULGAR_RE, (glyph) => VULGAR[glyph] || glyph);
}

export function parseNumberInput(value, options = {}) {
  const raw = String(value ?? '');
  const unitNormalisedRaw = raw.replace(/[\u00A0\u202F]/g, ' ').trim();
  if (/%/.test(unitNormalisedRaw)) {
    if (!options.allowPercentSymbol || !/^[^%]+%$/.test(unitNormalisedRaw)) return null;
  }
  if (/£/.test(unitNormalisedRaw)) {
    if (!options.allowCurrencySymbol || !/^£\s*[^£]+$/.test(unitNormalisedRaw)) return null;
  }
  let text = raw
    .replace(/[\u00A0\u202F]/g, ' ')
    .replace(/[−–—]/g, '-')
    .trim();
  if (options.allowPercentSymbol) text = text.replace(/\s*%$/, '');
  if (options.allowCurrencySymbol) text = text.replace(/^£\s*/, '');
  const remainderMatch = text.match(/^(.*?)(?:\s*(?:remainder|rem|r)\s*)0+$/i);
  const numericPartForGroupingCheck = remainderMatch ? remainderMatch[1] : text;
  if (!hasValidNumberGrouping(numericPartForGroupingCheck)) return null;
  text = text.replace(/,/g, '').replace(/\s+/g, '');
  const zr = text.match(/^([+-]?\d+)\s*(?:remainder|rem|r)\s*0+$/i);
  if (zr) return options.allowZeroRemainderText ? Number(zr[1]) : null;
  if (text.startsWith('+')) text = text.slice(1);
  if (text.startsWith('.')) text = `0${text}`;
  if (text.startsWith('-.')) text = `-0${text.slice(1)}`;
  if (/^-?\d+\.$/.test(text)) text = text.slice(0, -1);
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function parseFractionInput(value) {
  let text = expandVulgarFractions(String(value ?? ''))
    .replace(/[\u00A0\u202F]/g, ' ')
    .replace(/[−–—]/g, '-')
    .replace(/\band\b/gi, ' ')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  const integer = text.match(/^[+-]?\d+$/);
  if (integer) {
    const n = Number(text);
    return { value: n, n, d: 1, normalN: n, normalD: 1, simplified: true, decimal: false, isFraction: false };
  }
  let m = text.match(/^([+-]?\d+)\s+(\d+)\/(\d+)$/);
  if (m) {
    const rawWhole = Number(m[1]);
    let whole = rawWhole;
    const fracN = Number(m[2]);
    const fracD = Number(m[3]);
    if (!fracD) return null;
    const validMixed = Math.abs(rawWhole) > 0 && fracN > 0 && fracN < fracD;
    const sign = whole < 0 ? -1 : 1;
    whole = Math.abs(whole);
    const n = sign * (whole * fracD + fracN);
    const f = normaliseFraction(n, fracD);
    return { value: n / fracD, n, d: fracD, normalN: f.n, normalD: f.d, simplified: validMixed && gcd(n, fracD) === 1, decimal: false, isFraction: true, mixed: true, validMixed };
  }
  m = text.match(/^([+-]?\d+)\/(\d+)$/);
  if (m) {
    const n = Number(m[1]);
    const d = Number(m[2]);
    if (d <= 0) return null;
    const f = normaliseFraction(n, d);
    return { value: n / d, n, d, normalN: f.n, normalD: f.d, simplified: gcd(n, d) === 1, decimal: false, isFraction: true };
  }
  const dec = parseNumberInput(text);
  if (dec !== null) return { value: dec, decimal: true, isFraction: false };
  return null;
}

function equalNumeric(a, b, tolerance = 1e-9) {
  return Math.abs(Number(a) - Number(b)) <= tolerance;
}

function isSingleDigitAnswer(value) {
  return /^[0-9]$/.test(String(value ?? '').replace(/[\u00A0\u202F]/g, ' ').trim());
}

function result({ correct, score, maxScore, misconception = null, feedbackShort = '', feedbackLong = '', answerText = '', minimalHint = '' }) {
  return {
    correct: Boolean(correct),
    score: Number(score) || 0,
    maxScore: Number(maxScore) || 1,
    misconception,
    feedbackShort,
    feedbackLong,
    answerText,
    minimalHint: minimalHint || ARITHMETIC_MINIMAL_HINTS[misconception] || 'Check the structure and the final answer carefully.',
  };
}

function evaluateExpected(expected, response, marks = 1) {
  const answer = response?.answer ?? response?.value ?? '';
  if (expected?.kind === 'fraction') {
    const f = normaliseFraction(expected.n, expected.d);
    const parsed = parseFractionInput(answer);
    const answerText = mixedFractionText(f.n, f.d, expected.preferMixed !== false);
    if (!parsed) return result({ correct: false, score: 0, maxScore: marks, misconception: 'misread_question', feedbackShort: 'Enter a fraction, mixed number, whole number or decimal where allowed.', answerText });
    if (!equalNumeric(parsed.value, f.n / f.d)) return result({ correct: false, score: 0, maxScore: marks, misconception: 'fraction_method_error', feedbackShort: 'Not quite.', feedbackLong: `The answer is ${answerText}.`, answerText });
    if (parsed.decimal && !expected.allowDecimalEquivalent) return result({ correct: false, score: Math.max(0, marks - 1), maxScore: marks, misconception: 'fraction_method_error', feedbackShort: 'That has the right value, but the expected form is a fraction or mixed number.', feedbackLong: `Write it as ${answerText}.`, answerText });
    if (parsed.isFraction && (!parsed.simplified || parsed.normalN !== f.n || parsed.normalD !== f.d)) return result({ correct: false, score: Math.max(0, marks - 1), maxScore: marks, misconception: 'simplification_missed', feedbackShort: 'Right value, but not in simplest form.', feedbackLong: `Write it as ${answerText}.`, answerText });
    return result({ correct: true, score: marks, maxScore: marks, feedbackShort: 'Correct.', feedbackLong: `The answer is ${answerText}.`, answerText });
  }

  const answerText = expected?.answerText || formatNumber(expected?.value);
  if (expected?.kind === 'digit') {
    if (!isSingleDigitAnswer(answer)) {
      return result({ correct: false, score: 0, maxScore: marks, misconception: 'place_value_confusion', feedbackShort: 'Only enter the single missing digit, not the whole number.', answerText });
    }
    const digit = Number(String(answer).replace(/[\u00A0\u202F]/g, ' ').trim());
    if (digit === Number(expected?.value)) return result({ correct: true, score: marks, maxScore: marks, feedbackShort: 'Correct.', feedbackLong: `The answer is ${answerText}.`, answerText });
    return result({ correct: false, score: 0, maxScore: marks, misconception: expected?.misconception || 'place_value_confusion', feedbackShort: 'Not quite.', feedbackLong: `The answer is ${answerText}.`, answerText });
  }

  const numeric = parseNumberInput(answer, {
    allowPercentSymbol: Boolean(expected?.allowPercentSymbol),
    allowCurrencySymbol: Boolean(expected?.allowCurrencySymbol),
    allowZeroRemainderText: Boolean(expected?.allowZeroRemainderText),
  });
  if (numeric === null) return result({ correct: false, score: 0, maxScore: marks, misconception: 'misread_question', feedbackShort: 'Enter a number.', answerText });
  if (equalNumeric(numeric, expected?.value)) return result({ correct: true, score: marks, maxScore: marks, feedbackShort: 'Correct.', feedbackLong: `The answer is ${answerText}.`, answerText });
  let misconception = expected?.misconception || 'misread_question';
  if (Array.isArray(expected?.decimalShiftValues) && expected.decimalShiftValues.some((v) => equalNumeric(numeric, v))) misconception = 'decimal_point_error';
  if (Array.isArray(expected?.operationConfusionValues) && expected.operationConfusionValues.some((v) => equalNumeric(numeric, v))) misconception = 'operation_confusion';
  return result({ correct: false, score: 0, maxScore: marks, misconception, feedbackShort: 'Not quite.', feedbackLong: `The answer is ${answerText}.`, answerText });
}

function makeQuestion(template, seed, difficulty, data) {
  const questionId = `${template.id}:${seed}:d${difficulty}`;
  return {
    id: questionId,
    templateId: template.id,
    templateLabel: template.label,
    domain: template.domain,
    strand: template.strand,
    skillIds: template.skillIds.slice(),
    seed,
    difficulty,
    marks: data.marks || 1,
    stem: data.stem,
    visual: data.visual || '',
    inputSpec: data.inputSpec || { type: 'text', label: 'Answer' },
    solutionLines: data.solutionLines || [],
    checkLine: data.checkLine || '',
    expected: data.expected,
    answerText: data.answerText || '',
    manualMethodMark: Boolean(data.manualMethodMark),
  };
}

function decimal(value, places) {
  return Number(Number(value).toFixed(places));
}

function tidyDecimal(value, places = 10) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Number(Number(numeric.toPrecision(Math.min(12, Math.max(1, places + 2)))).toFixed(places));
}

function countColumnEvents(a, b, mode) {
  let events = 0;
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (x > 0 || y > 0) {
    const xd = x % 10;
    const yd = y % 10;
    if (mode === 'add' && xd + yd >= 10) events += 1;
    if (mode === 'subtract' && xd < yd) events += 1;
    x = Math.floor(x / 10);
    y = Math.floor(y / 10);
  }
  return events;
}

function pctFraction(percent) {
  const text = String(percent);
  const decimals = text.includes('.') ? text.split('.')[1].length : 0;
  const scale = 10 ** decimals;
  return normaliseFraction(Math.round(Number(percent) * scale), 100 * scale);
}

function properNumerator(rng, denominator, excluded = []) {
  const excludedSet = new Set(excluded.map((value) => Number(value)));
  const candidates = Array.from({ length: Math.max(0, denominator - 1) }, (_unused, index) => index + 1)
    .filter((numerator) => gcd(numerator, denominator) === 1 && !excludedSet.has(numerator));
  if (candidates.length) return pick(rng, candidates);
  const fallback = Array.from({ length: Math.max(0, denominator - 1) }, (_unused, index) => index + 1)
    .filter((numerator) => !excludedSet.has(numerator));
  return fallback.length ? pick(rng, fallback) : 1;
}

function fixedDecimalText(value, places) {
  return Number(value).toFixed(places);
}

function alignDecimalRows(values) {
  const parts = values.map((value) => {
    const text = String(value);
    const [whole, fraction = ''] = text.split('.');
    return { whole, fraction };
  });
  const left = Math.max(...parts.map((part) => part.whole.length));
  const right = Math.max(...parts.map((part) => part.fraction.length));
  return parts.map((part) => `${part.whole.padStart(left)}${right ? '.' : ''}${part.fraction.padEnd(right)}`);
}

function visualDecimalVertical(top, bottom, op, result = '') {
  const rows = result === '' ? alignDecimalRows([top, bottom]) : alignDecimalRows([top, bottom, result]);
  const width = Math.max(rows[0].length, rows[1].length + 2, result === '' ? 0 : rows[2].length, 4);
  const padded = [rows[0].padStart(width), `${op} ${rows[1].padStart(width - 2)}`, '─'.repeat(width)];
  if (result !== '') padded.push(rows[2].padStart(width));
  return padded.join('\n');
}

function template(def) {
  return Object.freeze({ ...def, skillIds: Object.freeze(def.skillIds.slice()) });
}

export const ARITHMETIC_TEMPLATES = Object.freeze([
  template({ id: 'bonds_missing', label: 'Number bonds and complements', domain: 'Number facts', strand: 'facts_place_value', skillIds: ['number_bonds'], speedFriendly: true, testFriendly: true, generator(seed, difficulty = 1) {
    const rng = seededRng(seed); const target = pick(rng, difficulty === 0 ? [10, 20, 50, 100] : difficulty === 1 ? [100, 1000] : [1000, 10000]); const part = randInt(rng, Math.floor(target * 0.12), Math.floor(target * 0.88)); const answer = target - part;
    return makeQuestion(this, seed, difficulty, { stem: `${formatNumber(part)} + □ = ${formatNumber(target)}`, inputSpec: { type: 'number', label: 'Missing number' }, expected: { kind: 'number', value: answer, misconception: 'fact_recall' }, solutionLines: [`Find the part that completes ${formatNumber(target)}.`, `${formatNumber(target)} − ${formatNumber(part)} = ${formatNumber(answer)}.`] });
  } }),
  template({ id: 'place_value_partition', label: 'Place value partitioning', domain: 'Place value', strand: 'facts_place_value', skillIds: ['place_value_partition'], speedFriendly: true, testFriendly: true, generator(seed, difficulty = 1) {
    const rng = seededRng(seed);
    const digits = difficulty === 0 ? 4 : difficulty === 1 ? 5 : 6;
    let parts;
    let values;
    let indexes;
    do {
      parts = Array.from({ length: digits }, (_, i) => i ? randInt(rng, 0, 9) : randInt(rng, 1, 9));
      values = parts.map((digit, i) => digit * (10 ** (digits - i - 1)));
      indexes = values.map((v, i) => v ? i : -1).filter((i) => i >= 0);
    } while (indexes.length < 3);
    const missing = pick(rng, indexes.slice(1));
    const expanded = values.flatMap((v, i) => {
      if (i === missing) return ['□'];
      return v ? [formatNumber(v)] : [];
    });
    return makeQuestion(this, seed, difficulty, { stem: `${formatNumber(Number(parts.join('')))} = ${expanded.join(' + ')}`, inputSpec: { type: 'number', label: 'Missing place-value part' }, expected: { kind: 'number', value: values[missing], misconception: 'place_value_confusion' }, solutionLines: ['Read the number one place at a time.', `The missing part is ${formatNumber(values[missing])}.`] });
  } }),
  template({ id: 'powers_of_ten_shift', label: 'Multiply and divide by powers of 10', domain: 'Place value', strand: 'facts_place_value', skillIds: ['powers_of_10_shift'], speedFriendly: true, testFriendly: true, generator(seed, difficulty = 1) {
    const rng = seededRng(seed); const op = pick(rng, ['×', '÷']); const power = pick(rng, difficulty === 0 ? [10, 100] : [10, 100, 1000]); const base = difficulty === 0 ? randInt(rng, 12, 980) : decimal(randInt(rng, 120, 9999) / (difficulty === 1 ? 10 : 100), difficulty === 1 ? 1 : 2); const answer = tidyDecimal(op === '×' ? base * power : base / power); const reverse = tidyDecimal(op === '×' ? base / power : base * power);
    return makeQuestion(this, seed, difficulty, { stem: `${formatNumber(base)} ${op} ${formatNumber(power)} =`, inputSpec: { type: 'text', label: 'Answer' }, expected: { kind: 'number', value: answer, answerText: formatNumber(answer), misconception: 'powers_of_ten_shift', operationConfusionValues: [reverse] }, solutionLines: ['Changing by powers of 10 changes place value.', `${formatNumber(base)} ${op} ${formatNumber(power)} = ${formatNumber(answer)}.`] });
  } }),
  template({ id: 'times_table_fact', label: 'Times-table and division facts', domain: 'Multiplication and division', strand: 'facts_place_value', skillIds: ['times_tables', 'division_facts'], speedFriendly: true, testFriendly: true, generator(seed, difficulty = 1) {
    const rng = seededRng(seed); const a = randInt(rng, 2, 12); const b = randInt(rng, 2, 12); const product = a * b; const style = pick(rng, ['mul-right', 'mul-left', 'div-divisor', 'div-quotient']); let stem; let answer;
    if (style === 'mul-right') { stem = `${a} × □ = ${product}`; answer = b; }
    else if (style === 'mul-left') { stem = `□ × ${b} = ${product}`; answer = a; }
    else if (style === 'div-divisor') { stem = `${product} ÷ □ = ${b}`; answer = a; }
    else { stem = `${product} ÷ ${a} = □`; answer = b; }
    return makeQuestion(this, seed, difficulty, { stem, inputSpec: { type: 'number', label: 'Missing number' }, expected: { kind: 'number', value: answer, misconception: 'fact_recall' }, solutionLines: [`Recall ${a} × ${b} = ${product}.`, `The missing number is ${answer}.`] });
  } }),
  template({ id: 'mental_addition', label: 'Mental addition', domain: 'Addition and subtraction', strand: 'operations_methods', skillIds: ['mental_addition'], speedFriendly: true, testFriendly: true, generator(seed, difficulty = 1) {
    const rng = seededRng(seed); const nums = difficulty === 0 ? [pick(rng, [98, 199, 298, 499]), randInt(rng, 2, 36)] : difficulty === 1 ? [randInt(rng, 120, 950), randInt(rng, 15, 180), pick(rng, [5, 10, 20, 25, 50])] : [pick(rng, [997, 1998, 2997]), randInt(rng, 102, 540), pick(rng, [3, 5, 10, 20])]; const answer = nums.reduce((a, b) => a + b, 0);
    return makeQuestion(this, seed, difficulty, { stem: `${nums.map(formatNumber).join(' + ')} =`, inputSpec: { type: 'number', label: 'Answer' }, expected: { kind: 'number', value: answer, misconception: 'fact_recall' }, solutionLines: ['Use bridging or partitioning.', `${nums.map(formatNumber).join(' + ')} = ${formatNumber(answer)}.`] });
  } }),
  template({ id: 'mental_subtraction', label: 'Mental subtraction', domain: 'Addition and subtraction', strand: 'operations_methods', skillIds: ['mental_subtraction'], speedFriendly: true, testFriendly: true, generator(seed, difficulty = 1) {
    const rng = seededRng(seed);
    let a;
    let b;
    const style = pick(rng, ['bridge', 'compensate', 'near-thousand', 'partition']);
    if (difficulty === 0) {
      a = style === 'bridge' ? randInt(rng, 72, 208) : pick(rng, [84, 96, 104, 204, 304, 504, 904]);
      b = style === 'compensate' ? pick(rng, [8, 9, 11, 19, 21, 29]) : randInt(rng, 6, 38);
    } else if (difficulty === 1) {
      a = style === 'near-thousand' ? pick(rng, [500, 600, 700, 1000, 1200, 1500, 2500]) : randInt(rng, 420, 3200);
      b = pick(rng, [randInt(rng, 85, 640), 125, 175, 225, 275, 340, 480, 625]);
    } else {
      a = style === 'near-thousand' ? pick(rng, [5003, 10004, 12000, 20005, 50000]) : randInt(rng, 4200, 65000);
      b = pick(rng, [randInt(rng, 480, 4800), 998, 1997, 2456, 3875, 9999]);
    }
    if (b >= a) a += b + pick(rng, [10, 100, 1000]);
    const answer = a - b;
    return makeQuestion(this, seed, difficulty, { stem: `${formatNumber(a)} − ${formatNumber(b)} =`, inputSpec: { type: 'number', label: 'Answer' }, expected: { kind: 'number', value: answer, misconception: 'fact_recall' }, solutionLines: ['Use counting on, compensation or subtract in parts.', `${formatNumber(a)} − ${formatNumber(b)} = ${formatNumber(answer)}.`] });
  } }),
  template({ id: 'column_addition', label: 'Column addition', domain: 'Addition and subtraction', strand: 'operations_methods', skillIds: ['column_addition'], speedFriendly: false, testFriendly: true, generator(seed, difficulty = 1) {
    const rng = seededRng(seed); const digits = difficulty === 0 ? 3 : difficulty === 1 ? 4 : 5; let a; let b; const minCarries = difficulty === 0 ? 1 : 2;
    do {
      a = randInt(rng, 10 ** (digits - 1), 10 ** digits - 1);
      b = randInt(rng, 10 ** (digits - 1), 10 ** digits - 1);
    } while (countColumnEvents(a, b, 'add') < minCarries);
    const answer = a + b;
    return makeQuestion(this, seed, difficulty, { stem: 'Work out:', visual: visualVertical(plainIntegerText(a), plainIntegerText(b), '+'), inputSpec: { type: 'number', label: 'Answer' }, expected: { kind: 'number', value: answer, misconception: 'regrouping_error' }, solutionLines: ['Add from right to left, exchanging where needed.', `${formatNumber(a)} + ${formatNumber(b)} = ${formatNumber(answer)}.`] });
  } }),
  template({ id: 'column_subtraction', label: 'Column subtraction', domain: 'Addition and subtraction', strand: 'operations_methods', skillIds: ['column_subtraction'], speedFriendly: false, testFriendly: true, generator(seed, difficulty = 1) {
    const rng = seededRng(seed); const digits = difficulty === 0 ? 3 : difficulty === 1 ? 4 : 5; let a; let b; const minExchanges = difficulty === 0 ? 1 : 2;
    do {
      a = randInt(rng, 10 ** (digits - 1), 10 ** digits - 1);
      b = randInt(rng, 10 ** (digits - 2), 10 ** digits - 1);
      if (b >= a) [a, b] = [b, a];
    } while (a <= b || countColumnEvents(a, b, 'subtract') < minExchanges);
    const answer = a - b;
    return makeQuestion(this, seed, difficulty, { stem: 'Work out:', visual: visualVertical(plainIntegerText(a), plainIntegerText(b), '−'), inputSpec: { type: 'number', label: 'Answer' }, expected: { kind: 'number', value: answer, misconception: 'regrouping_error' }, solutionLines: ['Subtract from right to left, exchanging where needed.', `${formatNumber(a)} − ${formatNumber(b)} = ${formatNumber(answer)}.`] });
  } }),
  template({ id: 'missing_number_inverse', label: 'Missing-number equation', domain: 'Addition and subtraction', strand: 'operations_methods', skillIds: ['inverse_missing'], speedFriendly: true, testFriendly: true, generator(seed, difficulty = 1) {
    const rng = seededRng(seed); const range = difficulty === 0 ? [60, 300] : difficulty === 1 ? [200, 2000] : [2000, 10000]; const style = pick(rng, ['add-right', 'add-left', 'subtract-start', 'subtract-part']); let stem; let answer; let line;
    if (style === 'subtract-start') {
      const known = randInt(rng, Math.floor(range[0] * 0.25), Math.floor(range[1] * 0.45));
      const resultValue = randInt(rng, Math.floor(range[0] * 0.35), Math.floor(range[1] * 0.75));
      answer = known + resultValue;
      stem = `□ − ${formatNumber(known)} = ${formatNumber(resultValue)}`;
      line = `${formatNumber(resultValue)} + ${formatNumber(known)} = ${formatNumber(answer)}.`;
    } else if (style === 'subtract-part') {
      const total = randInt(rng, range[0], range[1]);
      const resultValue = randInt(rng, Math.floor(total * 0.15), Math.floor(total * 0.75));
      answer = total - resultValue;
      stem = `${formatNumber(total)} − □ = ${formatNumber(resultValue)}`;
      line = `${formatNumber(total)} − ${formatNumber(resultValue)} = ${formatNumber(answer)}.`;
    } else {
      const total = randInt(rng, range[0], range[1]);
      const known = randInt(rng, Math.floor(total * 0.2), Math.floor(total * 0.85));
      answer = total - known;
      stem = style === 'add-left' ? `□ + ${formatNumber(known)} = ${formatNumber(total)}` : `${formatNumber(known)} + □ = ${formatNumber(total)}`;
      line = `${formatNumber(total)} − ${formatNumber(known)} = ${formatNumber(answer)}.`;
    }
    return makeQuestion(this, seed, difficulty, { stem, inputSpec: { type: 'number', label: 'Missing number' }, expected: { kind: 'number', value: answer, misconception: 'inverse_error' }, solutionLines: ['Use the inverse operation to isolate the missing number.', line] });
  } }),
  template({ id: 'mental_multiplication', label: 'Mental multiplication', domain: 'Multiplication and division', strand: 'operations_methods', skillIds: ['mental_multiplication'], speedFriendly: true, testFriendly: true, generator(seed, difficulty = 1) {
    const rng = seededRng(seed);
    const forms = difficulty === 0
      ? [
          () => [randInt(rng, 2, 12), pick(rng, [10, 20, 30, 40, 50])],
          () => [pick(rng, [4, 8, 12, 25, 50]), pick(rng, [2, 4, 5, 10, 20])],
          () => [randInt(rng, 11, 19), pick(rng, [3, 4, 5, 6])],
        ]
      : difficulty === 1
        ? [
            () => [randInt(rng, 13, 29), pick(rng, [20, 25, 30, 40, 50])],
            () => [pick(rng, [12, 15, 16, 18, 24, 25, 32]), randInt(rng, 6, 12)],
            () => [pick(rng, [75, 125, 150, 250]), pick(rng, [4, 6, 8, 12])],
          ]
        : [
            () => [pick(rng, [24, 25, 32, 48, 75, 125]), pick(rng, [16, 24, 32, 40])],
            () => [randInt(rng, 18, 48), pick(rng, [25, 50, 75])],
            () => [pick(rng, [12, 15, 18, 24]), pick(rng, [30, 40, 50, 60, 80])],
          ];
    const [a, b] = pick(rng, forms)();
    const answer = a * b;
    return makeQuestion(this, seed, difficulty, { stem: `${a} × ${b} =`, inputSpec: { type: 'number', label: 'Answer' }, expected: { kind: 'number', value: answer, misconception: 'fact_recall' }, solutionLines: ['Use a helpful fact and place-value pattern.', `${a} × ${b} = ${formatNumber(answer)}.`] });
  } }),
  template({ id: 'short_multiplication', label: 'Short multiplication', domain: 'Multiplication and division', strand: 'operations_methods', skillIds: ['short_multiplication'], speedFriendly: false, testFriendly: true, generator(seed, difficulty = 1) {
    const rng = seededRng(seed); const digits = difficulty === 0 ? 2 : difficulty === 1 ? 3 : 4; const a = randInt(rng, 10 ** (digits - 1), 10 ** digits - 1); const b = randInt(rng, 3, 9); const answer = a * b;
    return makeQuestion(this, seed, difficulty, { stem: 'Work out:', visual: visualVertical(plainIntegerText(a), String(b), '×'), inputSpec: { type: 'number', label: 'Answer' }, expected: { kind: 'number', value: answer, misconception: 'regrouping_error' }, solutionLines: ['Multiply from right to left.', `${formatNumber(a)} × ${b} = ${formatNumber(answer)}.`] });
  } }),
  template({ id: 'short_division', label: 'Short division', domain: 'Multiplication and division', strand: 'operations_methods', skillIds: ['short_division'], speedFriendly: false, testFriendly: true, generator(seed, difficulty = 1) {
    const rng = seededRng(seed); const divisor = randInt(rng, 2, 9); const quotient = difficulty === 0 ? randInt(rng, 10, 99) : difficulty === 1 ? randInt(rng, 50, 450) : randInt(rng, 200, 900); const dividend = divisor * quotient;
    return makeQuestion(this, seed, difficulty, { stem: 'Work out:', visual: `${divisor} ) ${plainIntegerText(dividend)}`, inputSpec: { type: 'number', label: 'Answer' }, expected: { kind: 'number', value: quotient, misconception: 'remainder_interpretation', allowZeroRemainderText: true }, solutionLines: ['Use exact division.', `${formatNumber(dividend)} ÷ ${divisor} = ${formatNumber(quotient)}.`] });
  } }),
  template({ id: 'long_multiplication', label: 'Long multiplication', domain: 'Multiplication and division', strand: 'operations_methods', skillIds: ['long_multiplication'], speedFriendly: false, testFriendly: true, generator(seed, difficulty = 1) {
    const rng = seededRng(seed); const a = difficulty === 0 ? randInt(rng, 120, 999) : difficulty === 1 ? randInt(rng, 200, 4999) : randInt(rng, 3000, 9999); const b = difficulty === 0 ? randInt(rng, 12, 39) : difficulty === 1 ? randInt(rng, 24, 79) : randInt(rng, 35, 96); const answer = a * b;
    return makeQuestion(this, seed, difficulty, { marks: 2, stem: 'Work out:', visual: visualVertical(plainIntegerText(a), plainIntegerText(b), '×'), inputSpec: { type: 'number', label: 'Final answer' }, expected: { kind: 'number', value: answer, misconception: 'regrouping_error' }, manualMethodMark: true, solutionLines: ['Multiply by the ones digit, then by the tens digit, then combine partial products.', `${formatNumber(a)} × ${formatNumber(b)} = ${formatNumber(answer)}.`] });
  } }),
  template({ id: 'long_division', label: 'Long division', domain: 'Multiplication and division', strand: 'operations_methods', skillIds: ['long_division'], speedFriendly: false, testFriendly: true, generator(seed, difficulty = 1) {
    const rng = seededRng(seed); const divisor = difficulty === 0 ? randInt(rng, 12, 24) : difficulty === 1 ? randInt(rng, 14, 36) : randInt(rng, 18, 49); const quotient = difficulty === 0 ? randInt(rng, 30, 99) : difficulty === 1 ? randInt(rng, 80, 299) : randInt(rng, 200, 999); const dividend = divisor * quotient;
    return makeQuestion(this, seed, difficulty, { marks: 2, stem: 'Work out:', visual: `${divisor} ) ${plainIntegerText(dividend)}`, inputSpec: { type: 'number', label: 'Final answer' }, expected: { kind: 'number', value: quotient, misconception: 'remainder_interpretation', allowZeroRemainderText: true }, manualMethodMark: true, solutionLines: ['Use formal long division and keep checking partial products.', `${formatNumber(dividend)} ÷ ${divisor} = ${formatNumber(quotient)}.`] });
  } }),
  template({ id: 'decimal_add_sub', label: 'Decimal addition and subtraction', domain: 'Decimals', strand: 'decimals_fractions', skillIds: ['decimals_add_sub'], speedFriendly: false, testFriendly: true, generator(seed, difficulty = 1) {
    const rng = seededRng(seed); const op = pick(rng, ['+', '−']); const places = difficulty === 0 ? 1 : difficulty === 1 ? 2 : 3; let a = decimal(randInt(rng, 120, 9999) / (10 ** places), places); let b = decimal(randInt(rng, 10, 4999) / (10 ** places), places); if (op === '−' && b > a) [a, b] = [b, a]; const answer = decimal(op === '+' ? a + b : a - b, 6);
    return makeQuestion(this, seed, difficulty, { stem: `${formatNumber(a)} ${op} ${formatNumber(b)} =`, inputSpec: { type: 'text', label: 'Answer' }, expected: { kind: 'number', value: answer, misconception: 'digit_alignment' }, solutionLines: ['Line up decimal points before calculating.', `${formatNumber(a)} ${op} ${formatNumber(b)} = ${formatNumber(answer)}.`] });
  } }),
  template({ id: 'decimal_times_integer', label: 'Decimal multiplication', domain: 'Decimals', strand: 'decimals_fractions', skillIds: ['decimals_multiply'], speedFriendly: false, testFriendly: true, generator(seed, difficulty = 1) {
    const rng = seededRng(seed); const m = difficulty === 0 ? randInt(rng, 2, 9) : difficulty === 1 ? randInt(rng, 3, 12) : randInt(rng, 6, 24); const base = difficulty === 0 ? decimal(randInt(rng, 10, 99) / 10, 1) : difficulty === 1 ? decimal(randInt(rng, 100, 999) / 100, 2) : decimal(randInt(rng, 1000, 9999) / 1000, 3); const answer = decimal(base * m, 6);
    return makeQuestion(this, seed, difficulty, { stem: `${m} × ${formatNumber(base)} =`, inputSpec: { type: 'text', label: 'Answer' }, expected: { kind: 'number', value: answer, misconception: 'decimal_point_error', decimalShiftValues: [tidyDecimal(answer * 10), tidyDecimal(answer / 10)] }, solutionLines: ['Use the whole-number fact and place the decimal point carefully.', `${m} × ${formatNumber(base)} = ${formatNumber(answer)}.`] });
  } }),
  template({ id: 'decimal_divide_integer', label: 'Decimal division by a whole number', domain: 'Decimals', strand: 'decimals_fractions', skillIds: ['decimals_divide'], speedFriendly: false, testFriendly: true, generator(seed, difficulty = 1) {
    const rng = seededRng(seed); const divisor = pick(rng, difficulty === 0 ? [2, 4, 5, 10] : difficulty === 1 ? [2, 3, 4, 5, 6, 8] : [3, 4, 5, 6, 8, 9, 12]); const quotient = difficulty === 0 ? decimal(randInt(rng, 12, 95) / 10, 1) : difficulty === 1 ? decimal(randInt(rng, 120, 950) / 100, 2) : decimal(randInt(rng, 1200, 9500) / 1000, 3); const dividend = decimal(quotient * divisor, 3);
    return makeQuestion(this, seed, difficulty, { stem: `${formatNumber(dividend)} ÷ ${divisor} =`, inputSpec: { type: 'text', label: 'Answer' }, expected: { kind: 'number', value: quotient, misconception: 'decimal_point_error', decimalShiftValues: [tidyDecimal(quotient * 10), tidyDecimal(quotient / 10)] }, solutionLines: ['Use inverse multiplication or short division with the decimal point lined up.', `${formatNumber(dividend)} ÷ ${divisor} = ${formatNumber(quotient)}.`] });
  } }),
  template({ id: 'fraction_of_amount', label: 'Fractions of amounts', domain: 'Fractions', strand: 'decimals_fractions', skillIds: ['fractions_of_amount'], speedFriendly: true, testFriendly: true, generator(seed, difficulty = 1) {
    const rng = seededRng(seed); const den = pick(rng, difficulty === 0 ? [2, 3, 4, 5] : difficulty === 1 ? [3, 4, 5, 8, 10, 12] : [6, 8, 9, 10, 12, 15, 20]); const num = properNumerator(rng, den); const onePart = difficulty === 0 ? randInt(rng, 4, 20) : difficulty === 1 ? randInt(rng, 8, 60) : randInt(rng, 16, 150); const total = den * onePart; const answer = num * onePart;
    return makeQuestion(this, seed, difficulty, { stem: `${fractionText(num, den)} of ${formatNumber(total)} =`, inputSpec: { type: 'number', label: 'Answer' }, expected: { kind: 'number', value: answer, misconception: 'fraction_method_error' }, solutionLines: [`Find one part: ${formatNumber(total)} ÷ ${den} = ${formatNumber(onePart)}.`, `Then ${num} part(s): ${formatNumber(onePart)} × ${num} = ${formatNumber(answer)}.`] });
  } }),
  template({ id: 'fraction_add_sub', label: 'Fraction calculations', domain: 'Fractions', strand: 'decimals_fractions', skillIds: ['fractions_calc'], speedFriendly: false, testFriendly: true, generator(seed, difficulty = 1) {
    const rng = seededRng(seed);
    const op = pick(rng, ['+', '−']);
    let aN;
    let aD;
    let bN;
    let bD;
    if (difficulty === 0) {
      aD = pick(rng, [4, 5, 6, 8, 10, 12]);
      bD = aD;
      aN = properNumerator(rng, aD);
      bN = properNumerator(rng, bD, op === '−' ? [aN] : []);
    } else {
      const relatedDenominators = difficulty === 1
        ? [[3,6],[3,9],[4,8],[4,12],[5,10],[5,20],[6,12],[8,12],[10,20]]
        : [[6,8],[6,9],[8,12],[9,12],[10,15],[12,18],[12,20],[14,21],[15,20],[16,24],[18,30],[20,25]];
      [aD, bD] = pick(rng, relatedDenominators);
      if (randInt(rng, 0, 1)) [aD, bD] = [bD, aD];
      aN = properNumerator(rng, aD);
      bN = properNumerator(rng, bD);
    }
    if (op === '−' && aN / aD < bN / bD) [aN, aD, bN, bD] = [bN, bD, aN, aD];
    const lcm = Math.abs(aD * bD) / gcd(aD, bD);
    const n = op === '+' ? aN * (lcm / aD) + bN * (lcm / bD) : aN * (lcm / aD) - bN * (lcm / bD);
    const f = normaliseFraction(n, lcm);
    return makeQuestion(this, seed, difficulty, { stem: `${fractionText(aN, aD)} ${op} ${fractionText(bN, bD)} =`, inputSpec: { type: 'text', label: 'Answer as a fraction or mixed number' }, expected: { kind: 'fraction', n: f.n, d: f.d, preferMixed: true }, solutionLines: [aD === bD ? 'The denominators match, so keep the denominator.' : `Change both fractions to denominator ${lcm}.`, `The answer is ${mixedFractionText(f.n, f.d, true)}.`] });
  } }),
  template({ id: 'mixed_number_add_sub', label: 'Mixed-number calculations', domain: 'Fractions', strand: 'decimals_fractions', skillIds: ['fractions_calc'], speedFriendly: false, testFriendly: true, generator(seed, difficulty = 1) {
    const rng = seededRng(seed);
    const op = pick(rng, ['+', '−']);
    let d1;
    let d2;
    if (difficulty === 2) {
      [d1, d2] = pick(rng, [[4,8],[5,10],[6,12],[8,12],[10,20],[12,18],[12,24]]);
      if (randInt(rng, 0, 1)) [d1, d2] = [d2, d1];
    } else {
      d1 = pick(rng, difficulty === 0 ? [4, 5, 6] : [5, 6, 8, 10, 12]);
      d2 = d1;
    }
    let w1 = randInt(rng, 1, difficulty === 0 ? 4 : 6);
    let w2 = randInt(rng, 1, difficulty === 0 ? 3 : 5);
    let n1 = properNumerator(rng, d1);
    let n2 = properNumerator(rng, d2);
    let improper1 = w1 * d1 + n1;
    let improper2 = w2 * d2 + n2;
    if (op === '−') {
      if (improper1 / d1 < improper2 / d2) {
        [w1, w2] = [w2, w1];
        [n1, n2] = [n2, n1];
        [d1, d2] = [d2, d1];
        [improper1, improper2] = [improper2, improper1];
      }
      if (improper1 / d1 === improper2 / d2) {
        w1 += 1;
        improper1 = w1 * d1 + n1;
      }
    }
    const lcm = Math.abs(d1 * d2) / gcd(d1, d2);
    const resultN = op === '+' ? improper1 * (lcm / d1) + improper2 * (lcm / d2) : improper1 * (lcm / d1) - improper2 * (lcm / d2);
    const f = normaliseFraction(resultN, lcm);
    return makeQuestion(this, seed, difficulty, { stem: `${w1} ${fractionText(n1, d1)} ${op} ${w2} ${fractionText(n2, d2)} =`, inputSpec: { type: 'text', label: 'Answer as a mixed number, fraction or whole number' }, expected: { kind: 'fraction', n: f.n, d: f.d, preferMixed: true }, solutionLines: ['Convert to improper fractions or work with whole and fractional parts carefully.', `The answer is ${mixedFractionText(f.n, f.d, true)}.`] });
  } }),
  template({ id: 'fraction_divide_whole', label: 'Divide a fraction by a whole number', domain: 'Fractions', strand: 'decimals_fractions', skillIds: ['fractions_calc'], speedFriendly: false, testFriendly: true, generator(seed, difficulty = 1) {
    const rng = seededRng(seed); const den = pick(rng, difficulty === 0 ? [3, 4, 5, 6, 8] : difficulty === 1 ? [3, 4, 5, 6, 8, 10, 12] : [6, 8, 10, 12, 15, 16, 20]); const num = properNumerator(rng, den); const divisor = randInt(rng, 2, difficulty === 0 ? 4 : 8); const f = normaliseFraction(num, den * divisor);
    return makeQuestion(this, seed, difficulty, { stem: `${fractionText(num, den)} ÷ ${divisor} =`, inputSpec: { type: 'text', label: 'Answer as a fraction' }, expected: { kind: 'fraction', n: f.n, d: f.d, preferMixed: false }, solutionLines: [`Dividing by ${divisor} makes each part ${divisor} times smaller.`, `The answer is ${fractionText(f.n, f.d)}.`] });
  } }),
  template({ id: 'fraction_multiply_fraction', label: 'Multiplying fractions', domain: 'Fractions', strand: 'decimals_fractions', skillIds: ['fractions_multiply'], speedFriendly: false, testFriendly: true, generator(seed, difficulty = 1) {
    const rng = seededRng(seed);
    const core = [[1,2],[1,3],[2,3],[1,4],[3,4],[1,5],[2,5],[4,5]];
    const secure = [[3,5],[5,6],[3,8],[5,8],[7,8],[2,7],[3,7],[4,9],[5,9],[7,10]];
    const stretch = [[7,12],[5,12],[11,12],[3,10],[9,10],[7,15],[8,15],[11,20],[13,20],[17,20]];
    const pool = difficulty === 0 ? core : difficulty === 1 ? core.concat(secure) : core.concat(secure, stretch);
    const [a,b] = pick(rng, pool);
    const [c,d] = pick(rng, pool);
    const f = normaliseFraction(a * c, b * d);
    return makeQuestion(this, seed, difficulty, { stem: `${fractionText(a, b)} × ${fractionText(c, d)} =`, inputSpec: { type: 'text', label: 'Answer in simplest form' }, expected: { kind: 'fraction', n: f.n, d: f.d, preferMixed: false }, solutionLines: ['Multiply the numerators and multiply the denominators.', `${a} × ${c} = ${a * c}; ${b} × ${d} = ${b * d}; simplify to ${fractionText(f.n, f.d)}.`] });
  } }),
  template({ id: 'percentage_of_amount', label: 'Percentages of amounts', domain: 'Percentages', strand: 'percentages_mixed', skillIds: ['percentages_of_amount'], speedFriendly: true, testFriendly: true, generator(seed, difficulty = 1) {
    const rng = seededRng(seed); const pct = pick(rng, difficulty === 0 ? [5, 10, 20, 25, 50] : difficulty === 1 ? [12.5, 15, 30, 40, 75] : [6.25, 12.5, 17.5, 19, 35, 62.5, 65]); const factor = pctFraction(pct).d; const baseUnit = difficulty === 0 ? randInt(rng, 4, 90) : difficulty === 1 ? randInt(rng, 10, 200) : randInt(rng, 16, 260); const amount = baseUnit * factor; const answer = tidyDecimal(amount * pct / 100);
    return makeQuestion(this, seed, difficulty, { stem: `${formatNumber(pct)}% of ${formatNumber(amount)} =`, inputSpec: { type: 'number', label: 'Answer' }, expected: { kind: 'number', value: answer, misconception: 'percentage_method_error' }, solutionLines: ['Break the percentage into easy parts such as 10%, 5%, 1%, 50%, 25% or 12.5%.', `${formatNumber(pct)}% of ${formatNumber(amount)} = ${formatNumber(answer)}.`] });
  } }),
  template({ id: 'fdp_equivalent', label: 'Fraction, decimal and percentage links', domain: 'Fractions / decimals / percentages', strand: 'percentages_mixed', skillIds: ['fdp_links'], speedFriendly: true, testFriendly: false, generator(seed, difficulty = 1) {
    const rng = seededRng(seed);
    const easy = [{ n:1,d:2,dec:0.5,pct:50 },{ n:1,d:4,dec:0.25,pct:25 },{ n:3,d:4,dec:0.75,pct:75 },{ n:1,d:5,dec:0.2,pct:20 },{ n:2,d:5,dec:0.4,pct:40 },{ n:3,d:5,dec:0.6,pct:60 },{ n:4,d:5,dec:0.8,pct:80 },{ n:1,d:10,dec:0.1,pct:10 },{ n:7,d:10,dec:0.7,pct:70 },{ n:9,d:10,dec:0.9,pct:90 }];
    const secure = [{ n:1,d:8,dec:0.125,pct:12.5 },{ n:3,d:8,dec:0.375,pct:37.5 },{ n:5,d:8,dec:0.625,pct:62.5 },{ n:7,d:8,dec:0.875,pct:87.5 },{ n:1,d:20,dec:0.05,pct:5 },{ n:3,d:20,dec:0.15,pct:15 },{ n:7,d:20,dec:0.35,pct:35 },{ n:9,d:20,dec:0.45,pct:45 },{ n:11,d:20,dec:0.55,pct:55 },{ n:13,d:20,dec:0.65,pct:65 },{ n:17,d:20,dec:0.85,pct:85 }];
    const stretch = [{ n:1,d:16,dec:0.0625,pct:6.25 },{ n:3,d:16,dec:0.1875,pct:18.75 },{ n:5,d:16,dec:0.3125,pct:31.25 },{ n:7,d:16,dec:0.4375,pct:43.75 },{ n:9,d:16,dec:0.5625,pct:56.25 },{ n:11,d:16,dec:0.6875,pct:68.75 },{ n:13,d:16,dec:0.8125,pct:81.25 },{ n:15,d:16,dec:0.9375,pct:93.75 }];
    const pool = difficulty === 0 ? easy : difficulty === 1 ? easy.concat(secure) : easy.concat(secure, stretch);
    const e = pick(rng, pool);
    const style = pick(rng, ['fraction-decimal', 'decimal-percent', 'percent-fraction']);
    if (style === 'fraction-decimal') return makeQuestion(this, seed, difficulty, { stem: `Write ${fractionText(e.n,e.d)} as a decimal.`, inputSpec: { type: 'text', label: 'Decimal' }, expected: { kind: 'number', value: e.dec, misconception: 'fraction_method_error' }, solutionLines: [`${fractionText(e.n,e.d)} = ${formatNumber(e.dec)}.`] });
    if (style === 'decimal-percent') return makeQuestion(this, seed, difficulty, { stem: `Write ${formatNumber(e.dec)} as a percentage.`, inputSpec: { type: 'number', label: 'Percentage' }, expected: { kind: 'number', value: e.pct, answerText: `${formatNumber(e.pct)}%`, misconception: 'percentage_method_error', allowPercentSymbol: true }, solutionLines: [`${formatNumber(e.dec)} = ${formatNumber(e.pct)}%.`] });
    return makeQuestion(this, seed, difficulty, { stem: `Write ${formatNumber(e.pct)}% as a fraction in simplest form.`, inputSpec: { type: 'text', label: 'Fraction' }, expected: { kind: 'fraction', n: e.n, d: e.d, preferMixed: false }, solutionLines: [`${formatNumber(e.pct)}% = ${formatNumber(e.pct)}/100 = ${fractionText(e.n,e.d)}.`] });
  } }),
  template({ id: 'order_of_operations', label: 'Order of operations', domain: 'Mixed arithmetic', strand: 'percentages_mixed', skillIds: ['order_of_operations'], speedFriendly: false, testFriendly: true, generator(seed, difficulty = 1) {
    const rng = seededRng(seed);
    let expression;
    let answer;
    if (difficulty === 0) {
      if (randInt(rng, 0, 1) === 0) {
        const a = randInt(rng, 30, 120); const b = randInt(rng, 3, 12); const c = randInt(rng, 2, 9);
        expression = `(${a} + ${c}) − ${b} × 2`;
        answer = (a + c) - b * 2;
      } else {
        const a = randInt(rng, 18, 80); const b = randInt(rng, 2, 9); const c = randInt(rng, 3, 8);
        expression = `${a} + ${b} × ${c}`;
        answer = a + b * c;
      }
    } else if (difficulty === 1) {
      if (randInt(rng, 0, 1) === 0) {
        const b = randInt(rng, 3, 12); const c = randInt(rng, 2, 9); const d = randInt(rng, 10, 30); const product = b * c; const a = randInt(rng, Math.max(30, product - d + 5), Math.max(120, product + 60));
        expression = `${a} − ${b} × ${c} + ${d}`;
        answer = a - product + d;
      } else {
        const divisor = randInt(rng, 2, 9); const quotient = randInt(rng, 6, 24); const dividend = divisor * quotient; const subtract = randInt(rng, 4, 18); const start = randInt(rng, Math.max(12, subtract + 4), 80);
        expression = `${start} + ${dividend} ÷ ${divisor} − ${subtract}`;
        answer = start + quotient - subtract;
      }
    } else {
      if (randInt(rng, 0, 1) === 0) {
        const b = randInt(rng, 3, 12); const c = randInt(rng, 2, 9); const quotient = randInt(rng, 5, 24); const d = randInt(rng, 10, 30); const minuend = (b * c) + (quotient * c);
        expression = `(${minuend} − ${b * c}) ÷ ${c} + ${d}`;
        answer = quotient + d;
      } else {
        const bracketA = randInt(rng, 8, 35); const bracketB = randInt(rng, 4, 18); const multiplier = randInt(rng, 2, 6); const start = randInt(rng, (bracketA + bracketB) * multiplier + 10, (bracketA + bracketB) * multiplier + 90); const add = randInt(rng, 5, 35);
        expression = `${start} − (${bracketA} + ${bracketB}) × ${multiplier} + ${add}`;
        answer = start - (bracketA + bracketB) * multiplier + add;
      }
    }
    return makeQuestion(this, seed, difficulty, { stem: `${expression} =`, inputSpec: { type: 'text', label: 'Answer' }, expected: { kind: 'number', value: answer, misconception: 'order_of_operations_error' }, solutionLines: ['Do brackets first, then multiplication or division, then addition or subtraction.', `${expression} = ${formatNumber(answer)}.`] });
  } }),

  template({ id: 'formal_decimal_missing_digit', label: 'Missing digit in a decimal calculation', domain: 'Decimals', strand: 'decimals_fractions', skillIds: ['decimals_add_sub', 'inverse_missing'], speedFriendly: false, testFriendly: false, generator(seed, difficulty = 1) {
    const rng = seededRng(seed); const places = difficulty === 0 ? 1 : difficulty === 1 ? 2 : 3; const scale = 10 ** places; const add = randInt(rng, 0, 1) === 1; let a = randInt(rng, 12 * scale, (difficulty === 2 ? 160 : 95) * scale); let b = randInt(rng, 4 * scale, (difficulty === 2 ? 90 : 48) * scale); if (!add && b > a) [a, b] = [b, a]; const val = add ? a + b : a - b;
    const rows = [fixedDecimalText(a / scale, places), fixedDecimalText(b / scale, places), fixedDecimalText(val / scale, places)]; const candidates = []; rows.forEach((row, rowIndex) => { for (let i = 0; i < row.length; i += 1) if (/\d/.test(row[i])) candidates.push([rowIndex, i]); }); const [row, col] = pick(rng, candidates); const ans = Number(rows[row][col]); rows[row] = `${rows[row].slice(0, col)}□${rows[row].slice(col + 1)}`;
    return makeQuestion(this, seed, difficulty, { stem: 'One digit is missing. What is the missing digit?', visual: visualDecimalVertical(rows[0], rows[1], add ? '+' : '−', rows[2]), inputSpec: { type: 'number', label: 'Missing digit' }, expected: { kind: 'digit', value: ans, misconception: 'digit_alignment' }, solutionLines: ['Line up decimal points and work column by column.', `The missing digit is ${ans}.`] });
  } }),
  template({ id: 'short_multiplication_missing_digit', label: 'Missing digit in short multiplication', domain: 'Multiplication and division', strand: 'operations_methods', skillIds: ['short_multiplication', 'inverse_missing'], speedFriendly: false, testFriendly: false, generator(seed, difficulty = 1) {
    const rng = seededRng(seed); const digits = difficulty === 0 ? 3 : 4; const a = randInt(rng, 10 ** (digits - 1), 10 ** digits - 1); const b = randInt(rng, 3, 9); const product = a * b; const rows = [String(a), String(b), String(product)]; const row = pick(rng, [0, 2]); const col = randInt(rng, 0, rows[row].length - 1); const ans = Number(rows[row][col]); rows[row] = `${rows[row].slice(0, col)}□${rows[row].slice(col + 1)}`;
    return makeQuestion(this, seed, difficulty, { stem: 'One digit is missing. What is the missing digit?', visual: visualVertical(rows[0], rows[1], '×', rows[2]), inputSpec: { type: 'number', label: 'Missing digit' }, expected: { kind: 'digit', value: ans, misconception: 'regrouping_error' }, solutionLines: ['Use short multiplication column by column, then check with inverse thinking.', `${formatNumber(a)} × ${b} = ${formatNumber(product)}, so the missing digit is ${ans}.`] });
  } }),
  template({ id: 'short_division_missing_digit', label: 'Missing digit in short division', domain: 'Multiplication and division', strand: 'operations_methods', skillIds: ['short_division', 'inverse_missing'], speedFriendly: false, testFriendly: false, generator(seed, difficulty = 1) {
    const rng = seededRng(seed); const divisor = difficulty === 0 ? randInt(rng, 2, 9) : randInt(rng, 3, 9); const quotient = difficulty === 0 ? randInt(rng, 12, 99) : randInt(rng, 80, 899); const dividend = divisor * quotient; let shownDividend = String(dividend); let shownQuotient = String(quotient); let ans; if (randInt(rng, 0, 1) === 0) { const col = randInt(rng, 0, shownQuotient.length - 1); ans = Number(shownQuotient[col]); shownQuotient = `${shownQuotient.slice(0, col)}□${shownQuotient.slice(col + 1)}`; } else { const col = randInt(rng, 0, shownDividend.length - 1); ans = Number(shownDividend[col]); shownDividend = `${shownDividend.slice(0, col)}□${shownDividend.slice(col + 1)}`; }
    return makeQuestion(this, seed, difficulty, { stem: 'One digit is missing. What is the missing digit?', visual: `    ${shownQuotient}\n${divisor} ) ${shownDividend}`, inputSpec: { type: 'number', label: 'Missing digit' }, expected: { kind: 'digit', value: ans, misconception: 'inverse_error' }, solutionLines: ['Use short division or check with inverse multiplication.', `${formatNumber(dividend)} ÷ ${divisor} = ${formatNumber(quotient)}, so the missing digit is ${ans}.`] });
  } }),
  template({ id: 'fraction_decimal_hybrid', label: 'Fraction and decimal hybrid calculations', domain: 'Fractions / decimals / percentages', strand: 'decimals_fractions', skillIds: ['fdp_links', 'fractions_calc', 'decimals_add_sub'], speedFriendly: false, testFriendly: false, generator(seed, difficulty = 1) {
    const rng = seededRng(seed);
    const op = pick(rng, ['+', '−']);
    const fractionPool = difficulty === 0
      ? [[1,2],[1,4],[3,4],[1,5],[2,5],[3,5],[4,5],[1,10],[7,10]]
      : difficulty === 1
        ? [[1,2],[3,4],[2,5],[3,5],[4,5],[1,8],[3,8],[5,8],[7,8],[7,10],[9,20],[11,20],[13,20]]
        : [[3,8],[5,8],[7,8],[9,20],[11,20],[13,20],[17,20],[1,16],[3,16],[5,16],[7,16],[9,16],[11,16],[13,16],[15,16]];
    const decimalPool = difficulty === 0
      ? [[1,10],[2,10],[3,10],[4,10],[6,10],[25,100],[75,100]]
      : difficulty === 1
        ? [[5,10],[25,100],[75,100],[1,20],[3,20],[7,20],[9,20],[11,20],[13,20],[17,20]]
        : [[5,100],[15,100],[35,100],[45,100],[55,100],[65,100],[85,100],[125,1000],[375,1000],[625,1000],[875,1000]];
    const [fn, fd] = pick(rng, fractionPool);
    let [dn, dd] = pick(rng, decimalPool);
    if (op === '−' && fn * dd === dn * fd) {
      const alternatives = decimalPool.filter(([altN, altD]) => fn * altD !== altN * fd);
      [dn, dd] = pick(rng, alternatives.length ? alternatives : decimalPool);
    }
    let left = { text: fractionText(fn, fd), n: fn, d: fd, value: fn / fd };
    let right = { text: formatNumber(dn / dd), n: dn, d: dd, value: dn / dd };
    if (randInt(rng, 0, 1) === 1) [left, right] = [right, left];
    if (op === '−' && left.value < right.value) [left, right] = [right, left];
    const common = (left.d * right.d) / gcd(left.d, right.d);
    const resultN = op === '+' ? left.n * (common / left.d) + right.n * (common / right.d) : left.n * (common / left.d) - right.n * (common / right.d);
    const f = normaliseFraction(resultN, common);
    return makeQuestion(this, seed, difficulty, { stem: `${left.text} ${op} ${right.text} =`, inputSpec: { type: 'text', label: 'Answer as a fraction, mixed number or decimal' }, expected: { kind: 'fraction', n: f.n, d: f.d, preferMixed: true, allowDecimalEquivalent: true }, solutionLines: ['Turn the fraction and decimal into equivalent values in the same form before calculating.', `The answer is ${mixedFractionText(f.n, f.d, true)} or ${formatNumber(f.n / f.d)}.`] });
  } }),
  template({ id: 'formal_missing_digit', label: 'Missing digit in a formal calculation', domain: 'Addition and subtraction', strand: 'operations_methods', skillIds: ['inverse_missing'], speedFriendly: false, testFriendly: true, generator(seed, difficulty = 1) {
    const rng = seededRng(seed); const add = randInt(rng, 0, 1) === 1; const digits = difficulty === 0 ? 3 : 4; const a = randInt(rng, 10 ** (digits - 1), 10 ** digits - 1); const b = randInt(rng, 10 ** (digits - 2), 10 ** (digits - 1) - 1); const val = add ? a + b : a - b; const rows = [String(a), String(b), String(val)]; const row = randInt(rng, 0, 2); const col = randInt(rng, 0, rows[row].length - 1); const ans = Number(rows[row][col]); rows[row] = `${rows[row].slice(0, col)}□${rows[row].slice(col + 1)}`;
    return makeQuestion(this, seed, difficulty, { stem: 'One digit is missing. What is the missing digit?', visual: visualVertical(rows[0], rows[1], add ? '+' : '−', rows[2]), inputSpec: { type: 'number', label: 'Missing digit' }, expected: { kind: 'digit', value: ans, misconception: add ? 'regrouping_error' : 'inverse_error' }, solutionLines: ['Work column by column and use the known result to recover the missing digit.', `The missing digit is ${ans}.`] });
  } }),
]);

export const ARITHMETIC_TEMPLATE_MAP = Object.freeze(Object.fromEntries(ARITHMETIC_TEMPLATES.map((templateRef) => [templateRef.id, templateRef])));

export const ARITHMETIC_TEST_BLUEPRINT_SHORT = Object.freeze([
  ['place_value_partition',0], ['times_table_fact',0], ['mental_addition',0], ['fraction_of_amount',0], ['short_division',0], ['decimal_add_sub',0], ['percentage_of_amount',0], ['long_multiplication',1], ['powers_of_ten_shift',1], ['fraction_add_sub',1], ['long_division',1], ['order_of_operations',1],
].map(([templateId, difficulty]) => Object.freeze({ templateId, difficulty })));

export const ARITHMETIC_TEST_BLUEPRINT_FULL = Object.freeze([
  ['place_value_partition',0], ['mental_subtraction',0], ['times_table_fact',0], ['decimal_add_sub',0], ['mental_subtraction',0], ['times_table_fact',0], ['fraction_of_amount',0], ['mental_multiplication',0], ['missing_number_inverse',0], ['times_table_fact',0], ['fraction_of_amount',0], ['short_division',0], ['short_multiplication',0], ['long_multiplication',1], ['short_division',0], ['decimal_times_integer',0], ['powers_of_ten_shift',0], ['fraction_add_sub',1], ['short_division',1], ['column_subtraction',1], ['short_division',1], ['fraction_add_sub',1], ['decimal_add_sub',1], ['mixed_number_add_sub',0], ['percentage_of_amount',0], ['fraction_divide_whole',0], ['percentage_of_amount',2], ['long_division',1], ['mixed_number_add_sub',1], ['long_multiplication',2], ['order_of_operations',1], ['percentage_of_amount',2], ['fraction_of_amount',2], ['long_division',2], ['fraction_multiply_fraction',1], ['mixed_number_add_sub',2],
].map(([templateId, difficulty]) => Object.freeze({ templateId, difficulty })));

export const ARITHMETIC_REWARD_UNITS = Object.freeze(
  ARITHMETIC_TEMPLATES.flatMap((templateRef) => [0, 1, 2].map((difficulty) => Object.freeze({
    id: `${templateRef.id}:d${difficulty}`,
    templateId: templateRef.id,
    difficulty,
    strand: templateRef.strand,
    skillIds: templateRef.skillIds.slice(),
    label: `${templateRef.label} ${difficulty === 0 ? 'core' : difficulty === 1 ? 'secure' : 'stretch'}`,
  }))),
);

export const ARITHMETIC_REWARD_UNIT_MAP = Object.freeze(Object.fromEntries(ARITHMETIC_REWARD_UNITS.map((unit) => [unit.id, unit])));

export function arithmeticRewardUnitIdForQuestion(question) {
  return `${question?.templateId || ''}:d${Number(question?.difficulty) || 0}`;
}

export function generateArithmeticQuestion({ templateId, seed = 1, difficulty = 1 } = {}) {
  const templateRef = ARITHMETIC_TEMPLATE_MAP[templateId] || ARITHMETIC_TEMPLATES[0];
  const band = Math.max(0, Math.min(2, Math.floor(Number(difficulty) || 0)));
  return templateRef.generator(Number(seed) || 1, band);
}

export function evaluateArithmeticQuestion(question, response = {}) {
  if (!question?.expected) return result({ correct: false, score: 0, maxScore: Number(question?.marks) || 1, misconception: 'misread_question', feedbackShort: 'Question data is missing.' });
  return evaluateExpected(question.expected, response, Number(question.marks) || 1);
}

export function arithmeticPublicQuestionId({ sessionId = '', question = null, index = 0 } = {}) {
  const sourceId = question?.id ? String(question.id) : '';
  if (!sourceId) return '';
  return `arith_q_${hashString(`${sessionId}:${Number(index) || 0}:${sourceId}`).toString(36)}`;
}

export function safeQuestionForClient(question, { includeAnswer = false, sessionId = '', index = 0 } = {}) {
  if (!question) return null;
  const safe = clone(question);
  safe.id = arithmeticPublicQuestionId({ sessionId, question, index });
  delete safe.templateId;
  delete safe.seed;
  delete safe.difficulty;
  if (!includeAnswer) {
    delete safe.expected;
    delete safe.answerText;
    delete safe.solutionLines;
  }
  return safe;
}

export function arithmeticContentSummary() {
  const strandTotals = Object.fromEntries(Object.keys(ARITHMETIC_STRANDS).map((strandId) => [strandId, 0]));
  for (const unit of ARITHMETIC_REWARD_UNITS) strandTotals[unit.strand] = (strandTotals[unit.strand] || 0) + 1;
  return {
    subjectId: ARITHMETIC_SUBJECT_ID,
    releaseId: ARITHMETIC_CONTENT_RELEASE_ID,
    templateCount: ARITHMETIC_TEMPLATES.length,
    skillCount: Object.keys(ARITHMETIC_SKILLS).length,
    rewardUnitCount: ARITHMETIC_REWARD_UNITS.length,
    strands: clone(ARITHMETIC_STRANDS),
    skills: clone(ARITHMETIC_SKILLS),
    strandTotals,
  };
}
