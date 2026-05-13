import {
  ARITHMETIC_TEMPLATES,
  ARITHMETIC_REWARD_UNITS,
  generateArithmeticQuestion,
  evaluateArithmeticQuestion,
  mixedFractionText,
  gcd,
} from '../../../../../../shared/arithmetic/content.js';

const SAMPLES_PER_DIFFICULTY = Number(process.env.ARITHMETIC_AUDIT_SAMPLES || 1500);
const difficulties = [0, 1, 2];

function expectedAnswer(question) {
  const expected = question.expected || {};
  if (expected.kind === 'fraction') return mixedFractionText(expected.n, expected.d, expected.preferMixed !== false);
  if (expected.answerText && /^-?\d+(?:\.\d+)?$/.test(String(expected.answerText))) return String(expected.answerText);
  return String(expected.value);
}

function numericValue(question) {
  const expected = question.expected || {};
  if (expected.kind === 'fraction') return expected.n / expected.d;
  return Number(expected.value);
}

function hasBinaryArtifact(text) {
  return /(?:000000000[1-9]|999999999[0-9])/.test(String(text || ''));
}

function fractionOperands(stem) {
  return Array.from(String(stem || '').matchAll(/(?<!\d)(\d+)\/(\d+)(?!\d)/g)).map((m) => [Number(m[1]), Number(m[2])]);
}

const summary = {
  templateCount: ARITHMETIC_TEMPLATES.length,
  rewardUnitCount: ARITHMETIC_REWARD_UNITS.length,
  cases: 0,
  uniqueStemVisual: 0,
  correctFails: 0,
  unitPctBad: 0,
  poundBad: 0,
  r0Bad: 0,
  divisionR0Ok: 0,
  explicitPctCases: 0,
  exactPercentAccept: 0,
  badMixedAccepts: 0,
  malformedMixedChecked: 0,
  badDigitAccepts: 0,
  digitChecks: 0,
  unsimplifiedInputFractions: 0,
  zeroFractionSubtractions: 0,
  negativeOrderD1: 0,
  formalDecimalBadVisual: 0,
  decimalArtifacts: 0,
  findings: [],
};

const unique = new Set();
function finding(type, question, extra = {}) {
  if (summary.findings.length >= 40) return;
  summary.findings.push({
    type,
    templateId: question.templateId,
    seed: question.seed,
    difficulty: question.difficulty,
    stem: question.stem,
    visual: question.visual,
    expected: question.expected,
    ...extra,
  });
}

for (const template of ARITHMETIC_TEMPLATES) {
  for (const difficulty of difficulties) {
    for (let offset = 1; offset <= SAMPLES_PER_DIFFICULTY; offset += 1) {
      const seed = difficulty * 1000000 + offset;
      const question = generateArithmeticQuestion({ templateId: template.id, difficulty, seed });
      summary.cases += 1;
      unique.add(`${question.stem}\n${question.visual || ''}`);

      const answer = expectedAnswer(question);
      const marked = evaluateArithmeticQuestion(question, { answer });
      if (!marked.correct) {
        summary.correctFails += 1;
        finding('correct_answer_failed', question, { answer, marked });
      }

      if (hasBinaryArtifact(question.stem) || hasBinaryArtifact(question.visual) || hasBinaryArtifact(answer)) {
        summary.decimalArtifacts += 1;
        finding('binary_decimal_artifact', question, { answer });
      }

      const expected = question.expected || {};
      if (expected.kind === 'number') {
        if (!expected.allowPercentSymbol && evaluateArithmeticQuestion(question, { answer: `${expected.value}%` }).correct) {
          summary.unitPctBad += 1;
          finding('bad_percent_unit_accept', question, { probe: `${expected.value}%` });
        }
        if (evaluateArithmeticQuestion(question, { answer: `£${expected.value}` }).correct) {
          summary.poundBad += 1;
          finding('bad_currency_accept', question, { probe: `£${expected.value}` });
        }
        const r0 = `${expected.value} r 0`;
        const r0Correct = evaluateArithmeticQuestion(question, { answer: r0 }).correct;
        if (expected.allowZeroRemainderText) {
          if (r0Correct) summary.divisionR0Ok += 1;
          else finding('division_zero_remainder_rejected', question, { probe: r0 });
        } else if (r0Correct) {
          summary.r0Bad += 1;
          finding('non_division_zero_remainder_accept', question, { probe: r0 });
        }
        if (expected.allowPercentSymbol) {
          summary.explicitPctCases += 1;
          if (evaluateArithmeticQuestion(question, { answer: `${expected.value}%` }).correct) summary.exactPercentAccept += 1;
          else finding('explicit_percentage_rejected', question, { probe: `${expected.value}%` });
        }
      }

      if (expected.kind === 'digit') {
        summary.digitChecks += 1;
        for (const probe of [`0${expected.value}`, `${expected.value}.0`, `+${expected.value}`]) {
          if (evaluateArithmeticQuestion(question, { answer: probe }).correct) {
            summary.badDigitAccepts += 1;
            finding('bad_digit_accept', question, { probe });
          }
        }
      }

      if (expected.kind === 'fraction' && Math.abs(expected.n) > expected.d) {
        const absoluteNumerator = Math.abs(expected.n);
        const whole = Math.trunc(absoluteNumerator / expected.d);
        const remainder = absoluteNumerator % expected.d;
        const zeroWhole = `0 ${absoluteNumerator}/${expected.d}`;
        const probes = [zeroWhole];
        if (whole > 0 && remainder > 0) {
          const shiftedWhole = whole - 1;
          const improperNumerator = expected.d + remainder;
          probes.push(expected.n < 0 ? `-${shiftedWhole} ${improperNumerator}/${expected.d}` : `${shiftedWhole} ${improperNumerator}/${expected.d}`);
        }
        for (const probe of probes) {
          summary.malformedMixedChecked += 1;
          if (evaluateArithmeticQuestion(question, { answer: probe }).correct) {
            summary.badMixedAccepts += 1;
            finding('bad_malformed_mixed_accept', question, { probe });
          }
        }
      }

      if (['fraction_of_amount', 'fraction_add_sub', 'mixed_number_add_sub', 'fraction_divide_whole'].includes(template.id)) {
        for (const [n, d] of fractionOperands(question.stem)) {
          if (d && gcd(n, d) !== 1) {
            summary.unsimplifiedInputFractions += 1;
            finding('unsimplified_input_fraction', question, { operand: `${n}/${d}` });
          }
        }
      }
      if (['fraction_add_sub', 'mixed_number_add_sub', 'fraction_decimal_hybrid'].includes(template.id) && String(question.stem).includes('−') && Math.abs(numericValue(question)) < 1e-9) {
        summary.zeroFractionSubtractions += 1;
        finding('zero_fraction_subtraction', question);
      }
      if (template.id === 'order_of_operations' && difficulty === 1 && numericValue(question) < 0) {
        summary.negativeOrderD1 += 1;
        finding('negative_order_difficulty_1', question, { value: numericValue(question) });
      }
      if (template.id === 'formal_decimal_missing_digit') {
        const rows = String(question.visual || '').split('\n').filter((line) => line.trim() && !/^─+$/.test(line.trim()));
        const numericRows = rows.filter((line) => /[\d□]/.test(line));
        const decimalColumns = numericRows.map((line) => line.indexOf('.'));
        const decimalPlaces = numericRows.map((line) => {
          const column = line.indexOf('.');
          return column === -1 ? -1 : line.slice(column + 1).trimEnd().length;
        });
        if (
          numericRows.length < 3
          || numericRows.some((line) => !line.includes('.'))
          || new Set(decimalColumns).size !== 1
          || new Set(decimalPlaces).size !== 1
        ) {
          summary.formalDecimalBadVisual += 1;
          finding('formal_decimal_bad_visual', question, { rows: numericRows, decimalColumns, decimalPlaces });
        }
      }
    }
  }
}
summary.uniqueStemVisual = unique.size;
console.log(JSON.stringify(summary, null, 2));
