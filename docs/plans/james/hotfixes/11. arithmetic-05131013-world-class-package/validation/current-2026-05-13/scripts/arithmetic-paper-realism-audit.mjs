import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const contentUrl = pathToFileURL(path.resolve(process.cwd(), 'shared/arithmetic/content.js')).href;
const {
  ARITHMETIC_TEMPLATE_MAP,
  ARITHMETIC_TEST_BLUEPRINT_FULL,
  ARITHMETIC_TEST_BLUEPRINT_SHORT,
  generateArithmeticQuestion,
} = await import(contentUrl);

const SATS_STRANDS = new Set(['facts_place_value', 'operations_methods', 'decimals_fractions', 'percentages_mixed']);
const LONG_METHOD_TEMPLATES = new Set(['long_multiplication', 'long_division', 'short_multiplication', 'short_division']);
const FRACTION_PERCENTAGE_TEMPLATES = new Set([
  'fraction_of_amount',
  'fraction_add_sub',
  'mixed_number_add_sub',
  'fraction_divide_whole',
  'fraction_multiply_fraction',
  'percentage_of_amount',
]);

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function summariseBlueprint(name, blueprint) {
  const items = blueprint.map((entry, index) => {
    const template = ARITHMETIC_TEMPLATE_MAP[entry.templateId];
    assert.ok(template, `${name} blueprint references unknown template ${entry.templateId}`);
    const question = generateArithmeticQuestion({ templateId: entry.templateId, difficulty: entry.difficulty, seed: index + 1 });
    return {
      index: index + 1,
      templateId: entry.templateId,
      difficulty: entry.difficulty,
      strand: template.strand,
      testFriendly: template.testFriendly,
      marks: question.marks,
      stem: question.stem,
      visual: question.visual,
    };
  });

  const issues = [];
  const pushIssue = (message, detail = {}) => issues.push({ message, ...detail });

  for (const item of items) {
    if (!item.testFriendly) pushIssue('Blueprint includes a non-test-friendly template.', item);
    if (!SATS_STRANDS.has(item.strand)) pushIssue('Blueprint includes an unexpected strand.', item);
  }

  const difficultyCounts = countBy(items, (item) => `d${item.difficulty}`);
  const strandCounts = countBy(items, (item) => item.strand);
  const longMethodCount = items.filter((item) => LONG_METHOD_TEMPLATES.has(item.templateId)).length;
  const fractionPercentageCount = items.filter((item) => FRACTION_PERCENTAGE_TEMPLATES.has(item.templateId)).length;
  const maxDifficultyByHalf = {
    firstHalf: Math.max(...items.slice(0, Math.ceil(items.length / 2)).map((item) => item.difficulty)),
    secondHalf: Math.max(...items.slice(Math.ceil(items.length / 2)).map((item) => item.difficulty)),
  };

  if (name === 'short') {
    if (items.length !== 12) pushIssue('Short blueprint should contain 12 questions.', { length: items.length });
    if ((difficultyCounts.d2 || 0) !== 0) pushIssue('Short blueprint should not include stretch difficulty-2 items.', { difficultyCounts });
    if (longMethodCount < 3) pushIssue('Short blueprint has too little written-method coverage.', { longMethodCount });
    if (fractionPercentageCount < 3) pushIssue('Short blueprint has too little fraction/percentage coverage.', { fractionPercentageCount });
  }

  if (name === 'full') {
    if (items.length !== 36) pushIssue('Full blueprint should contain 36 questions.', { length: items.length });
    if ((difficultyCounts.d0 || 0) < 18) pushIssue('Full blueprint should keep a strong core fluency base.', { difficultyCounts });
    if ((difficultyCounts.d2 || 0) < 5) pushIssue('Full blueprint should include enough stretch material.', { difficultyCounts });
    if (maxDifficultyByHalf.firstHalf > maxDifficultyByHalf.secondHalf) {
      pushIssue('Full blueprint difficulty should not front-load harder material.', { maxDifficultyByHalf });
    }
    if (longMethodCount < 8) pushIssue('Full blueprint has too little written-method coverage.', { longMethodCount });
    if (fractionPercentageCount < 10) pushIssue('Full blueprint has too little fraction/percentage coverage.', { fractionPercentageCount });
  }

  return {
    name,
    questionCount: items.length,
    totalMarks: items.reduce((sum, item) => sum + item.marks, 0),
    difficultyCounts,
    strandCounts,
    longMethodCount,
    fractionPercentageCount,
    maxDifficultyByHalf,
    issues,
  };
}

const summary = {
  ok: true,
  auditedAt: new Date().toISOString(),
  audits: [
    summariseBlueprint('short', ARITHMETIC_TEST_BLUEPRINT_SHORT),
    summariseBlueprint('full', ARITHMETIC_TEST_BLUEPRINT_FULL),
  ],
};

summary.ok = summary.audits.every((audit) => audit.issues.length === 0);
console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exit(1);
