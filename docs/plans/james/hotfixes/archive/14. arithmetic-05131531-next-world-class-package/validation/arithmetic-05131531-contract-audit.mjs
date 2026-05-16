#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  ARITHMETIC_TEMPLATES,
  arithmeticContentSummary,
  evaluateArithmeticQuestion,
  formatNumber,
  generateArithmeticQuestion,
  mixedFractionText,
  normaliseFraction,
} from '../../../../../../shared/arithmetic/content.js';

const DEFAULT_SEED_COUNT = 1500;
const FORMAL_VISUAL_TEMPLATE_IDS = new Set([
  'column_addition',
  'column_subtraction',
  'short_multiplication',
  'short_division',
  'long_multiplication',
  'long_division',
]);

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function correctAnswerText(question) {
  const expected = question.expected || {};
  if (expected.kind === 'fraction') {
    const normalised = normaliseFraction(expected.n, expected.d);
    return mixedFractionText(normalised.n, normalised.d, expected.preferMixed !== false);
  }
  return formatNumber(expected.value);
}

function malformedCommaText(value) {
  if (!Number.isInteger(Number(value)) || Math.abs(Number(value)) < 1000) return null;
  const sign = Number(value) < 0 ? '-' : '';
  const digits = String(Math.abs(Number(value)));
  if (digits.length === 4) return `${sign}${digits.slice(0, 2)},${digits.slice(2)}`;
  return `${sign}${digits.slice(0, 1)},${digits.slice(1)}`;
}

function evaluate(question, answer) {
  return evaluateArithmeticQuestion(question, { answer });
}

function pushSample(samples, detail) {
  if (samples.length < 10) samples.push(detail);
}

function audit({ seedCount = DEFAULT_SEED_COUNT } = {}) {
  const summary = arithmeticContentSummary();
  const metrics = {
    contentReleaseId: summary.releaseId,
    templates: summary.templateCount,
    rewardUnits: summary.rewardUnitCount,
    generatedCases: 0,
    uniqueStemVisualCombinations: 0,
    correctAnswerSelfMarkFailures: 0,
    malformedCommaAcceptances: 0,
    validCommaRejections: 0,
    negativeDenominatorFractionAcceptances: 0,
    formalVisualCommaFindings: 0,
    binaryDecimalArtifacts: 0,
    orderOfOperationsWholeNonNegativeFailures: 0,
    divisionZeroRemainderValidAcceptances: 0,
  };
  const samples = {
    correctAnswerSelfMarkFailures: [],
    malformedCommaAcceptances: [],
    validCommaRejections: [],
    negativeDenominatorFractionAcceptances: [],
    formalVisualCommaFindings: [],
    binaryDecimalArtifacts: [],
    orderOfOperationsWholeNonNegativeFailures: [],
  };
  const uniqueStemVisuals = new Set();

  for (const templateRef of ARITHMETIC_TEMPLATES) {
    for (const difficulty of [0, 1, 2]) {
      for (let seed = 1; seed <= seedCount; seed += 1) {
        const question = generateArithmeticQuestion({ templateId: templateRef.id, difficulty, seed });
        metrics.generatedCases += 1;
        uniqueStemVisuals.add(`${question.stem}\n${question.visual || ''}`);

        const correctAnswer = correctAnswerText(question);
        if (!evaluate(question, correctAnswer).correct) {
          metrics.correctAnswerSelfMarkFailures += 1;
          pushSample(samples.correctAnswerSelfMarkFailures, { templateId: templateRef.id, difficulty, seed, correctAnswer });
        }

        const malformedComma = malformedCommaText(question.expected?.value);
        if (malformedComma && evaluate(question, malformedComma).correct) {
          metrics.malformedCommaAcceptances += 1;
          pushSample(samples.malformedCommaAcceptances, { templateId: templateRef.id, difficulty, seed, answer: malformedComma });
        }

        const validComma = Number.isInteger(Number(question.expected?.value)) ? formatNumber(question.expected.value) : '';
        if (validComma.includes(',') && !evaluate(question, validComma).correct) {
          metrics.validCommaRejections += 1;
          pushSample(samples.validCommaRejections, { templateId: templateRef.id, difficulty, seed, answer: validComma });
        }

        if (question.expected?.allowZeroRemainderText) {
          const zeroRemainderAnswer = `${formatNumber(question.expected.value)} r 0`;
          if (evaluate(question, zeroRemainderAnswer).correct) metrics.divisionZeroRemainderValidAcceptances += 1;
        }

        if (question.expected?.kind === 'fraction' && Number(question.expected.n) > 0 && Number(question.expected.d) > 0) {
          const doubleNegative = `-${Math.abs(Number(question.expected.n))}/-${Math.abs(Number(question.expected.d))}`;
          if (evaluate(question, doubleNegative).correct) {
            metrics.negativeDenominatorFractionAcceptances += 1;
            pushSample(samples.negativeDenominatorFractionAcceptances, { templateId: templateRef.id, difficulty, seed, answer: doubleNegative });
          }
        }

        if (FORMAL_VISUAL_TEMPLATE_IDS.has(templateRef.id) && /\d,\d/.test(question.visual || '')) {
          metrics.formalVisualCommaFindings += 1;
          pushSample(samples.formalVisualCommaFindings, { templateId: templateRef.id, difficulty, seed, visual: question.visual });
        }

        if (templateRef.id === 'order_of_operations' && (!Number.isInteger(question.expected.value) || question.expected.value < 0)) {
          metrics.orderOfOperationsWholeNonNegativeFailures += 1;
          pushSample(samples.orderOfOperationsWholeNonNegativeFailures, { templateId: templateRef.id, difficulty, seed, value: question.expected.value });
        }

        const valueText = String(question.expected?.value ?? '');
        if (/000000000|999999999/.test(valueText)) {
          metrics.binaryDecimalArtifacts += 1;
          pushSample(samples.binaryDecimalArtifacts, { templateId: templateRef.id, difficulty, seed, value: valueText });
        }
      }
    }
  }

  metrics.uniqueStemVisualCombinations = uniqueStemVisuals.size;

  const zeroRemainderQuestion = { marks: 1, expected: { kind: 'number', value: 1234, allowZeroRemainderText: true } };
  const zeroRemainderCommaDiscipline = {
    validForms: ['1,234 r 0', '1,234 rem 0', '1,234 remainder 0'].map((answer) => ({
      answer,
      correct: evaluate(zeroRemainderQuestion, answer).correct,
    })),
    malformedForms: ['12,34 r 0', '12,34 rem 0', '12,34 remainder 0'].map((answer) => ({
      answer,
      correct: evaluate(zeroRemainderQuestion, answer).correct,
    })),
  };
  zeroRemainderCommaDiscipline.validCommaAccepted = zeroRemainderCommaDiscipline.validForms.every((item) => item.correct);
  zeroRemainderCommaDiscipline.malformedCommaRejected = zeroRemainderCommaDiscipline.malformedForms.every((item) => !item.correct);

  const report = {
    ok: true,
    seedCount,
    checkedAt: new Date().toISOString(),
    metrics,
    zeroRemainderCommaDiscipline,
    samples,
  };

  assert.equal(metrics.templates, 30);
  assert.equal(metrics.rewardUnits, 90);
  assert.equal(metrics.correctAnswerSelfMarkFailures, 0);
  assert.equal(metrics.malformedCommaAcceptances, 0);
  assert.equal(metrics.validCommaRejections, 0);
  assert.equal(metrics.negativeDenominatorFractionAcceptances, 0);
  assert.equal(metrics.formalVisualCommaFindings, 0);
  assert.equal(metrics.binaryDecimalArtifacts, 0);
  assert.equal(metrics.orderOfOperationsWholeNonNegativeFailures, 0);
  assert.equal(metrics.divisionZeroRemainderValidAcceptances, 9000);
  assert.equal(zeroRemainderCommaDiscipline.validCommaAccepted, true);
  assert.equal(zeroRemainderCommaDiscipline.malformedCommaRejected, true);

  return report;
}

const seedCount = Number(argValue('--seeds', DEFAULT_SEED_COUNT)) || DEFAULT_SEED_COUNT;
const report = audit({ seedCount });
const out = argValue('--out', '');
if (out) {
  const outPath = path.resolve(process.cwd(), out);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
console.log(JSON.stringify(report, null, 2));
