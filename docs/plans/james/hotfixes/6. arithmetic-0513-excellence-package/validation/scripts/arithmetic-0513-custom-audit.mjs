import { pathToFileURL } from 'node:url';
import path from 'node:path';

const moduleUrl = pathToFileURL(path.resolve(process.cwd(), 'shared/arithmetic/content.js')).href;
const { ARITHMETIC_TEMPLATES, evaluateArithmeticQuestion } = await import(moduleUrl);

function isDivisionTemplate(question) {
  return question.templateId === 'short_division' || question.templateId === 'long_division';
}

function answerFor(question) {
  if (question.expected?.kind === 'fraction') {
    const n = question.expected.n;
    const d = question.expected.d;
    if (d === 1) return String(n);
    return `${n}/${d}`;
  }
  return String(question.expected?.value ?? '');
}

function responseFor(answer) {
  return { answer: String(answer) };
}

const zeroRemainderForms = Object.freeze([
  Object.freeze({ key: 'r0', suffix: 'r 0' }),
  Object.freeze({ key: 'rem0', suffix: 'rem 0' }),
  Object.freeze({ key: 'remainder0', suffix: 'remainder 0' }),
]);

function hasBinaryArtefact(question) {
  const fields = [question.expected?.value, question.expected?.answerText, question.answerText, ...(question.solutionLines || [])];
  return fields.some((value) => /\d\.\d*(?:0000000|9999999)\d*/.test(String(value ?? '')));
}

const perTemplateLimit = Number(process.argv.find((arg) => arg.startsWith('--per-template='))?.split('=')[1] || 1500);
const summary = {
  templates: ARITHMETIC_TEMPLATES.length,
  rewardUnits: 90,
  cases: 0,
  unique: 0,
  correctFail: 0,
  percentAccepted: 0,
  badPercentAccepted: 0,
  explicitPercentAcceptances: 0,
  explicitPercentCases: 0,
  poundAccepted: 0,
  r0AcceptedNonDivision: 0,
  rem0AcceptedNonDivision: 0,
  remainder0AcceptedNonDivision: 0,
  zeroRemainderDivisionAcceptances: 0,
  zeroRemainderDivisionRemAcceptances: 0,
  zeroRemainderDivisionRemainderAcceptances: 0,
  decimalRepeats: 0,
  findings: [],
};
const seen = new Set();

for (const template of ARITHMETIC_TEMPLATES) {
  for (const difficulty of [0, 1, 2]) {
    for (let seed = 1; seed <= perTemplateLimit; seed += 1) {
      let question;
      try {
        question = template.generator(seed, difficulty);
      } catch (error) {
        summary.findings.push({ kind: 'generator_throw', templateId: template.id, difficulty, seed, message: error.message });
        continue;
      }
      summary.cases += 1;
      seen.add(`${question.templateId}|${question.stem}|${question.visual || ''}`);
      const answer = answerFor(question);
      const correctResult = evaluateArithmeticQuestion(question, responseFor(answer));
      if (!correctResult?.correct) {
        summary.correctFail += 1;
        if (summary.findings.length < 20) summary.findings.push({ kind: 'correct_answer_rejected', templateId: question.templateId, difficulty, seed, answer, result: correctResult });
      }
      if (question.expected?.kind !== 'fraction' && question.expected && Number.isFinite(Number(question.expected.value))) {
        const numericAnswer = String(question.expected.value);
        const percentResult = evaluateArithmeticQuestion(question, responseFor(`${numericAnswer}%`));
        const poundResult = evaluateArithmeticQuestion(question, responseFor(`£${numericAnswer}`));
        if (question.expected?.allowPercentSymbol) summary.explicitPercentCases += 1;
        if (percentResult?.correct) {
          summary.percentAccepted += 1;
          if (question.expected?.allowPercentSymbol) summary.explicitPercentAcceptances += 1;
          else summary.badPercentAccepted += 1;
        }
        if (poundResult?.correct) summary.poundAccepted += 1;
        for (const form of zeroRemainderForms) {
          const result = evaluateArithmeticQuestion(question, responseFor(`${numericAnswer} ${form.suffix}`));
          if (result?.correct) {
            if (isDivisionTemplate(question)) {
              if (form.key === 'r0') summary.zeroRemainderDivisionAcceptances += 1;
              if (form.key === 'rem0') summary.zeroRemainderDivisionRemAcceptances += 1;
              if (form.key === 'remainder0') summary.zeroRemainderDivisionRemainderAcceptances += 1;
            } else {
              if (form.key === 'r0') summary.r0AcceptedNonDivision += 1;
              if (form.key === 'rem0') summary.rem0AcceptedNonDivision += 1;
              if (form.key === 'remainder0') summary.remainder0AcceptedNonDivision += 1;
            }
          } else if (isDivisionTemplate(question) && summary.findings.length < 20) {
            summary.findings.push({ kind: 'division_zero_remainder_rejected', templateId: question.templateId, difficulty, seed, answer: numericAnswer, form: form.suffix, result });
          }
        }
      }
      if (question.templateId === 'powers_of_ten_shift' && hasBinaryArtefact(question)) {
        summary.decimalRepeats += 1;
        if (summary.findings.length < 20) summary.findings.push({ kind: 'binary_decimal_artefact', templateId: question.templateId, difficulty, seed, answer: question.expected?.value, stem: question.stem });
      }
    }
  }
}
summary.unique = seen.size;
console.log(JSON.stringify(summary, null, 2));
