import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REASONING_TEMPLATES,
  evaluateReasoningQuestion,
  generateReasoningQuestion,
  reasoningContentSummary,
  safeReasoningQuestion,
} from '../shared/reasoning/content.js';
import { reasoningContentSummary as publicReasoningContentSummary } from '../shared/reasoning/metadata.js';

function strongValues(html) {
  return Array.from(String(html || '').matchAll(/<strong>([^<]+)<\/strong>/g)).map((match) => match[1]);
}

function findCorrectNumericAnswer(question, max = 10000) {
  for (let answer = 0; answer <= max; answer += 1) {
    if (question.evaluate({ answer: String(answer) }).correct) return answer;
  }
  return null;
}

function labelsOverlap(first, second) {
  const a = String(first || '').trim().toLowerCase();
  const b = String(second || '').trim().toLowerCase();
  if (!a || !b) return false;
  return a === b || a.endsWith(` ${b}`) || b.endsWith(` ${a}`);
}

function responseFromPlaceholders(inputSpec) {
  if (!inputSpec || typeof inputSpec !== 'object') return null;
  if (inputSpec.type === 'multi' && Array.isArray(inputSpec.fields)) {
    const response = {};
    let hasPlaceholder = false;
    for (const field of inputSpec.fields) {
      const placeholder = typeof field?.placeholder === 'string' ? field.placeholder.trim() : '';
      response[field.key] = placeholder;
      if (placeholder) hasPlaceholder = true;
    }
    return hasPlaceholder ? response : null;
  }
  if (typeof inputSpec.placeholder === 'string' && inputSpec.placeholder.trim()) {
    return { answer: inputSpec.placeholder.trim() };
  }
  return null;
}

test('reasoning content bank exposes 138 safe template families without leaking markers to the browser metadata', () => {
  const privateSummary = reasoningContentSummary();
  const publicSummary = publicReasoningContentSummary();
  assert.equal(privateSummary.templateCount, 138);
  assert.equal(privateSummary.skillCount, 17);
  assert.equal(privateSummary.satsFriendlyCount, 136);
  assert.deepEqual(publicSummary, privateSummary);
  assert.equal(REASONING_TEMPLATES.length, 138);
  assert.equal(typeof publicSummary.templateCount, 'number');
});

test('reasoning safe input placeholders do not reveal generated answers before marking', () => {
  const failures = [];
  for (const template of REASONING_TEMPLATES) {
    for (let seed = 1; seed <= 20; seed += 1) {
      const question = generateReasoningQuestion(template.id, seed);
      const safe = safeReasoningQuestion(question);
      const placeholderResponse = responseFromPlaceholders(safe.inputSpec);
      if (!placeholderResponse) continue;
      const result = evaluateReasoningQuestion(question, placeholderResponse);
      if (Number(result.score) > 0) {
        failures.push(`${template.id}:${seed}: placeholder response scored ${result.score}/${result.maxScore}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('reasoning templates generate, mark and serialise cleanly across smoke seeds', () => {
  const failures = [];
  for (const template of REASONING_TEMPLATES) {
    for (let seed = 1; seed <= 5; seed += 1) {
      try {
        const question = generateReasoningQuestion(template.id, seed);
        const safe = safeReasoningQuestion(question);
        const marked = evaluateReasoningQuestion(question, {});
        assert.equal(safe.id, question.itemId);
        assert.ok(safe.stemHtml, `${template.id}:${seed} has stem`);
        assert.ok(safe.inputSpec?.type, `${template.id}:${seed} has input spec`);
        assert.equal(safe.evaluate, undefined);
        assert.equal(typeof question.evaluate, 'function');
        assert.ok(Array.isArray(question.solutionLines) && question.solutionLines.length > 0, `${template.id}:${seed} has worked solution`);
        assert.equal(Number.isFinite(Number(marked.score)), true);
        assert.equal(Number.isFinite(Number(marked.maxScore)), true);
      } catch (error) {
        failures.push(`${template.id}:${seed}:${error.message}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});


test('reasoning generated templates keep stable item ids and do not emit malformed maths text', () => {
  const malformed = /\b(?:undefined|NaN|Infinity|\[object Object\])\b/i;
  const failures = [];
  for (const template of REASONING_TEMPLATES) {
    for (let seed = 1; seed <= 1000; seed += 1) {
      const question = generateReasoningQuestion(template.id, seed);
      const text = [
        question?.stemHtml,
        question?.visualHtml,
        ...(question?.solutionLines || []),
        question?.checkLine,
        question?.reflectionPrompt,
      ].filter(Boolean).join('\\n');
      if (question?.itemId !== `${template.id}:${seed}`) failures.push(`${template.id}:${seed}: unstable itemId ${question?.itemId}`);
      if (malformed.test(text)) failures.push(`${template.id}:${seed}: malformed generated text`);
    }
  }
  assert.deepEqual(failures, []);
});

test('reasoning themed expansion exposes broad context variety and keeps extra credit out of SATs sets', () => {
  const summary = reasoningContentSummary();
  assert.equal(summary.contextThemeCount, 23);
  assert.equal(summary.themedTemplateCount, 28);
  assert.equal(summary.extraCreditTemplateCount, 2);

  const extraCredit = REASONING_TEMPLATES.filter((template) => template.extraCredit);
  assert.equal(extraCredit.length, 2);
  assert.ok(extraCredit.every((template) => template.satsFriendly === false));

  const themedTemplateIds = REASONING_TEMPLATES.filter((template) => template.contextThemed).map((template) => template.id);
  assert.ok(themedTemplateIds.includes('theme_money_multi_buy_budget'));
  assert.ok(themedTemplateIds.includes('theme_extra_credit_rate_pattern'));
  assert.ok(themedTemplateIds.includes('theme_statistics_missing_mean'));
  assert.ok(themedTemplateIds.includes('theme_extra_credit_crossing_rules'));

  const themeIds = new Set();
  for (let seed = 1; seed <= 60; seed += 1) {
    const question = generateReasoningQuestion('theme_equal_groups_shortfall', seed);
    if (question?.contextThemeId) themeIds.add(question.contextThemeId);
  }
  assert.ok(themeIds.size >= 10, `expected broad theme variety, saw ${themeIds.size}`);
});

test('reasoning mixed-unit gap template never asks for a negative more-needed amount', () => {
  const reviewedNegativeCase = generateReasoningQuestion('theme_mixed_units_total_gap', 5);
  assert.equal(reviewedNegativeCase.evaluate({ answer: '-25' }).correct, false);

  const failures = [];
  for (let seed = 1; seed <= 1000; seed += 1) {
    const question = generateReasoningQuestion('theme_mixed_units_total_gap', seed);
    let hasNonNegativeAnswer = false;
    for (let answer = 0; answer <= 1000; answer += 1) {
      if (question.evaluate({ answer: String(answer) }).correct) {
        hasNonNegativeAnswer = true;
        break;
      }
    }
    if (!hasNonNegativeAnswer) failures.push(`${question.itemId}: no non-negative correct answer`);
  }
  assert.deepEqual(failures, []);
});

test('reasoning themed quantity stories stay possible and unambiguous', () => {
  const failures = [];
  for (let seed = 1; seed <= 1000; seed += 1) {
    const fractionQuestion = generateReasoningQuestion('theme_fraction_two_step_share', seed);
    const fractionStrongValues = strongValues(fractionQuestion.stemHtml);
    const fractionTotal = Number(fractionStrongValues[1]);
    const fractionAnswer = findCorrectNumericAnswer(fractionQuestion);
    if (!(fractionAnswer <= fractionTotal)) {
      failures.push(`${fractionQuestion.itemId}: used altogether ${fractionAnswer} exceeds total ${fractionTotal}`);
    }

    const percentQuestion = generateReasoningQuestion('theme_percent_change_compare', seed);
    const percentStrongValues = strongValues(percentQuestion.stemHtml);
    const percentTotal = Number(percentStrongValues[1]);
    const afternoonCompleters = Number(percentStrongValues[2]);
    if (!(afternoonCompleters <= percentTotal)) {
      failures.push(`${percentQuestion.itemId}: afternoon completers ${afternoonCompleters} exceeds total ${percentTotal}`);
    }

    const ratioQuestion = generateReasoningQuestion('theme_ratio_recipe_total', seed);
    const ratioStrongValues = strongValues(ratioQuestion.stemHtml);
    if (labelsOverlap(ratioStrongValues[0], ratioStrongValues[1])) {
      failures.push(`${ratioQuestion.itemId}: overlapping ratio items ${ratioStrongValues[0]} / ${ratioStrongValues[1]}`);
    }

    const moneyQuestion = generateReasoningQuestion('theme_money_multi_buy_budget', seed);
    const moneyMatch = String(moneyQuestion.stemHtml).match(/They buy <strong>\d+<\/strong> (.*?) at <strong>.*?<\/strong> each and <strong>\d+<\/strong> (.*?) at <strong>/);
    if (!moneyMatch || labelsOverlap(moneyMatch[1], moneyMatch[2])) {
      failures.push(`${moneyQuestion.itemId}: overlapping purchase items ${moneyMatch ? `${moneyMatch[1]} / ${moneyMatch[2]}` : 'unparsed'}`);
    }
  }
  assert.deepEqual(failures, []);
});


test('reasoning world-class themed expansion covers every domain with validated new structures', () => {
  const ids = [
    'theme_rounding_range_inventory',
    'theme_inverse_two_step_boxes',
    'theme_remainder_transport_decision',
    'theme_fraction_measure_leftover',
    'theme_decimal_measure_compare',
    'theme_percent_sale_budget',
    'theme_ratio_total_split',
    'theme_timetable_total_duration',
    'theme_triangle_base_angles',
    'theme_composite_area_remaining',
    'theme_statistics_missing_mean',
    'theme_logic_total_constraints',
    'theme_fdp_ordering_transfer',
    'theme_extra_credit_crossing_rules',
  ];
  const templateById = new Map(REASONING_TEMPLATES.map((template) => [template.id, template]));
  for (const id of ids) {
    const template = templateById.get(id);
    assert.ok(template, `${id} is registered`);
    assert.equal(template.contextThemed, true, `${id} is context-themed`);
    for (let seed = 1; seed <= 20; seed += 1) {
      const question = generateReasoningQuestion(id, seed);
      assert.equal(question.itemId, `${id}:${seed}`);
      assert.ok(question.contextThemeId, `${id}:${seed} has a context theme`);
      assert.ok(question.stemHtml.includes('<p>'), `${id}:${seed} has learner-facing stem html`);
      assert.doesNotMatch(question.stemHtml, /\b(?:boxe|benche|batche|classe)\b/i, `${id}:${seed} avoids broken singular wording`);
      assert.ok(Array.isArray(question.solutionLines) && question.solutionLines.length >= 2, `${id}:${seed} has worked reasoning`);
      assert.equal(Number.isFinite(Number(evaluateReasoningQuestion(question, {}).score)), true, `${id}:${seed} marks safely`);
    }
  }
});
