import {
  ARITHMETIC_TEMPLATES,
  ARITHMETIC_REWARD_UNITS,
  ARITHMETIC_TEST_BLUEPRINT_SHORT,
  ARITHMETIC_TEST_BLUEPRINT_FULL,
  evaluateArithmeticQuestion,
  formatNumber,
} from '../../../../../../shared/arithmetic/content.js';

const templateById = new Map(ARITHMETIC_TEMPLATES.map((template) => [template.id, template]));
const findings = [];
const seen = new Map();
let cases = 0;
let badPercentUnitAcceptances = 0;
let poundAccepted = 0;
let expectedPercentOutputAcceptances = 0;
let malformedPercentOutputAcceptances = 0;
let expectedPercentOutputCases = 0;

function normaliseKey(question) {
  return [question.templateId, question.difficulty, question.stem, question.visual || ''].join(' | ');
}

function expectedText(question) {
  if (question.expected?.kind === 'fraction') {
    return question.answerText || `${question.expected.n}/${question.expected.d}`;
  }
  if (question.expected?.answerText) return question.expected.answerText;
  return formatNumber(question.expected?.value);
}

function recordFinding(kind, detail) {
  if (findings.length < 50) findings.push({ kind, ...detail });
}

for (const template of ARITHMETIC_TEMPLATES) {
  for (const difficulty of [0, 1, 2]) {
    for (let seed = 1; seed <= 500; seed += 1) {
      const question = template.generator(seed, difficulty);
      cases += 1;
      if (!question || typeof question !== 'object') recordFinding('missing-question', { template: template.id, difficulty, seed });
      if (!question.stem || !String(question.stem).trim()) recordFinding('blank-stem', { template: template.id, difficulty, seed });
      if (!question.expected) recordFinding('missing-expected', { template: template.id, difficulty, seed });
      if (question.expected?.kind === 'number' || question.expected?.kind === 'digit') {
        if (!Number.isFinite(Number(question.expected.value))) recordFinding('non-finite-number-answer', { template: template.id, difficulty, seed, expected: question.expected });
      }
      if (question.expected?.kind === 'fraction') {
        if (!Number.isFinite(Number(question.expected.n)) || !Number.isFinite(Number(question.expected.d)) || Number(question.expected.d) === 0) recordFinding('bad-fraction-answer', { template: template.id, difficulty, seed, expected: question.expected });
      }
      const correct = expectedText(question);
      const marked = evaluateArithmeticQuestion(question, { answer: correct });
      if (!marked.correct) recordFinding('self-mark-failed', { template: template.id, difficulty, seed, stem: question.stem, correct, marked });
      if ((question.expected?.kind === 'number' || question.expected?.kind === 'digit') && Number.isFinite(Number(question.expected.value))) {
        const plainExpected = String(question.expected.value);
        const withPercent = evaluateArithmeticQuestion(question, { answer: `${plainExpected}%` });
        const withPound = evaluateArithmeticQuestion(question, { answer: `£${plainExpected}` });
        if (question.expected.allowPercentSymbol) {
          expectedPercentOutputCases += 1;
          if (withPercent.correct) expectedPercentOutputAcceptances += 1;
          else recordFinding('expected-percent-symbol-rejected', { template: template.id, difficulty, seed, stem: question.stem, answer: `${plainExpected}%`, withPercent });
          const malformedPercentAnswers = [`%${plainExpected}`, `${plainExpected}%%`];
          if (plainExpected.length > 1) malformedPercentAnswers.push(`${plainExpected.slice(0, 1)}%${plainExpected.slice(1)}`);
          for (const malformedAnswer of malformedPercentAnswers) {
            const malformed = evaluateArithmeticQuestion(question, { answer: malformedAnswer });
            if (malformed.correct) {
              malformedPercentOutputAcceptances += 1;
              recordFinding('malformed-percent-symbol-accepted', { template: template.id, difficulty, seed, stem: question.stem, answer: malformedAnswer });
            }
          }
        } else if (withPercent.correct) {
          badPercentUnitAcceptances += 1;
          recordFinding('bad-percent-unit-accepted', { template: template.id, difficulty, seed, stem: question.stem, answer: `${plainExpected}%` });
        }
        if (withPound.correct) {
          poundAccepted += 1;
          recordFinding('bad-pound-unit-accepted', { template: template.id, difficulty, seed, stem: question.stem, answer: `£${plainExpected}` });
        }
      }
      const key = normaliseKey(question);
      seen.set(key, (seen.get(key) || 0) + 1);
    }
  }
}

for (const [form, blueprint] of Object.entries({ short: ARITHMETIC_TEST_BLUEPRINT_SHORT, full: ARITHMETIC_TEST_BLUEPRINT_FULL })) {
  for (const slot of blueprint) {
    if (!templateById.has(slot.templateId)) recordFinding('blueprint-missing-template', { form, slot });
  }
}

const blueprintSummary = Object.fromEntries(Object.entries({ short: ARITHMETIC_TEST_BLUEPRINT_SHORT, full: ARITHMETIC_TEST_BLUEPRINT_FULL }).map(([form, blueprint]) => [form, {
  questions: blueprint.length,
  marks: blueprint.reduce((sum, slot) => {
    const template = templateById.get(slot.templateId);
    if (!template) return sum;
    return sum + (template.generator(123, slot.difficulty).marks || 1);
  }, 0),
}]));

const duplicateHotspots = [...seen.entries()]
  .filter(([, count]) => count > 1)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([key, count]) => ({ count, key }));

const summary = {
  templates: ARITHMETIC_TEMPLATES.length,
  rewardUnits: ARITHMETIC_REWARD_UNITS.length,
  cases,
  uniqueStemVisuals: seen.size,
  duplicateStemVisuals: cases - seen.size,
  badPercentUnitAcceptances,
  poundAccepted,
  expectedPercentOutputCases,
  expectedPercentOutputAcceptances,
  malformedPercentOutputAcceptances,
  blueprints: blueprintSummary,
  findingCount: findings.length,
  findings,
  duplicateHotspots,
};

console.log(JSON.stringify(summary, null, 2));
if (findings.length || badPercentUnitAcceptances || poundAccepted || malformedPercentOutputAcceptances || expectedPercentOutputAcceptances !== expectedPercentOutputCases) process.exitCode = 1;
