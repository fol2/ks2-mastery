import test from 'node:test';
import assert from 'node:assert/strict';

import {
  arithmeticStemAriaLabel,
  fractionAriaLabel,
  mixedNumberAriaLabel,
  tokeniseArithmeticStem,
} from '../src/subjects/arithmetic/stem-renderer.js';

test('arithmetic stem renderer tokenises mixed numbers without collapsing whole and fraction parts', () => {
  const tokens = tokeniseArithmeticStem('5 3/8 − 1 1/8 =');
  assert.deepEqual(tokens, [
    { type: 'mixed-number', source: '5 3/8', whole: '5', numerator: '3', denominator: '8' },
    { type: 'text', text: ' ' },
    { type: 'operator', source: '−', text: '−', label: 'minus' },
    { type: 'text', text: ' ' },
    { type: 'mixed-number', source: '1 1/8', whole: '1', numerator: '1', denominator: '8' },
    { type: 'text', text: ' ' },
    { type: 'operator', source: '=', text: '=', label: 'equals' },
  ]);
});

test('arithmetic stem renderer keeps standalone fractions separate from mixed numbers', () => {
  const tokens = tokeniseArithmeticStem('3/8 + 1/8 =');
  assert.deepEqual(tokens, [
    { type: 'fraction', source: '3/8', numerator: '3', denominator: '8' },
    { type: 'text', text: ' ' },
    { type: 'operator', source: '+', text: '+', label: 'plus' },
    { type: 'text', text: ' ' },
    { type: 'fraction', source: '1/8', numerator: '1', denominator: '8' },
    { type: 'text', text: ' ' },
    { type: 'operator', source: '=', text: '=', label: 'equals' },
  ]);
});

test('arithmetic stem renderer tokenises whole equations, not only fractions', () => {
  const tokens = tokeniseArithmeticStem('□ × 8 = 56');
  assert.deepEqual(tokens, [
    { type: 'placeholder', source: '□', text: '□', label: 'blank' },
    { type: 'text', text: ' ' },
    { type: 'operator', source: '×', text: '×', label: 'times' },
    { type: 'text', text: ' ' },
    { type: 'number', source: '8', text: '8' },
    { type: 'text', text: ' ' },
    { type: 'operator', source: '=', text: '=', label: 'equals' },
    { type: 'text', text: ' ' },
    { type: 'number', source: '56', text: '56' },
  ]);
});

test('arithmetic stem renderer does not read hyphenated prose as subtraction', () => {
  assert.equal(
    arithmeticStemAriaLabel('Use the whole-number fact, a 2-digit number and a Year-5 place-value pattern.'),
    'Use the whole-number fact, a 2-digit number and a Year-5 place-value pattern.',
  );
  assert.equal(
    tokeniseArithmeticStem('Use the whole-number fact, a 2-digit number and a Year-5 place-value pattern.').every((token) => token.type === 'text'),
    true,
  );
  assert.equal(arithmeticStemAriaLabel('63-27'), '63 minus 27');
});

test('arithmetic stem renderer exposes readable accessibility labels', () => {
  assert.equal(fractionAriaLabel({ numerator: '3', denominator: '8' }), '3 eighths');
  assert.equal(fractionAriaLabel({ numerator: '1', denominator: '8' }), '1 eighth');
  assert.equal(mixedNumberAriaLabel({ whole: '5', numerator: '3', denominator: '8' }), '5 and 3 eighths');
  assert.equal(arithmeticStemAriaLabel('5 3/8 − 1 1/8 ='), '5 and 3 eighths minus 1 and 1 eighth equals');
  assert.equal(arithmeticStemAriaLabel('□ × 8 = 56'), 'blank times 8 equals 56');
});

test('arithmetic stem renderer tokenises grouped slash fractions as expression fractions', () => {
  const tokens = tokeniseArithmeticStem('(5+3)/5');
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].type, 'expression-fraction');
  assert.equal(tokens[0].source, '(5+3)/5');
  assert.equal(tokens[0].numeratorSource, '5+3');
  assert.equal(tokens[0].denominatorSource, '5');
  assert.deepEqual(tokens[0].numeratorTokens.map((token) => ({ type: token.type, text: token.text, label: token.label })), [
    { type: 'number', text: '5', label: undefined },
    { type: 'operator', text: '+', label: 'plus' },
    { type: 'number', text: '3', label: undefined },
  ]);
  assert.deepEqual(tokens[0].denominatorTokens.map((token) => ({ type: token.type, text: token.text, label: token.label })), [
    { type: 'number', text: '5', label: undefined },
  ]);
  assert.equal(arithmeticStemAriaLabel('(5+3)/5'), '5 plus 3 over 5');
});

test('arithmetic stem renderer accepts LaTeX-style fraction and root syntax', () => {
  const tokens = tokeniseArithmeticStem('\\frac{5+3}{5} = \\sqrt{16}');
  assert.deepEqual(tokens.map((token) => token.type), ['expression-fraction', 'text', 'operator', 'text', 'sqrt']);
  assert.equal(tokens[0].source, '\\frac{5+3}{5}');
  assert.equal(tokens[0].numeratorSource, '5+3');
  assert.equal(tokens[0].denominatorSource, '5');
  assert.equal(tokens[4].source, '\\sqrt{16}');
  assert.equal(tokens[4].radicandSource, '16');
  assert.equal(arithmeticStemAriaLabel('\\frac{5+3}{5} = \\sqrt{16}'), '5 plus 3 over 5 equals square root of 16');
});

test('arithmetic stem renderer labels broader maths symbols semantically', () => {
  assert.equal(
    arithmeticStemAriaLabel('25% ≥ 1/4; x ≠ 0; 2^3 ≈ 8; ±5'),
    '25 percent is greater than or equal to 1 quarter; x is not equal to 0; 2 to the power of 3 approximately equals 8; plus or minus 5',
  );
});
