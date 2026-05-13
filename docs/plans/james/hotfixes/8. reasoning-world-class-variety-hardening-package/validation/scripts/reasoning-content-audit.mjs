import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import {
  REASONING_TEMPLATES,
  evaluateReasoningQuestion,
  generateReasoningQuestion,
  reasoningContentSummary,
  safeReasoningQuestion,
} from '../../../../../../../shared/reasoning/content.js';

const outPath = process.argv[2];
const malformed = /\b(?:undefined|NaN|Infinity|\[object Object\])\b/i;

function currentBase() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

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

const summary = reasoningContentSummary();
const failures = {
  unstableItemIds: [],
  malformedTextFailures: [],
  safeReadModelMarkerLeaks: [],
  nonFiniteMarkerOutputs: [],
  negativeMoreNeededAccepted: [],
  impossibleUsedAltogether: [],
  afternoonCompletersOverTotal: [],
  overlappingRatioItems: [],
  overlappingPurchaseItems: [],
  themeCoverageFailures: [],
};
const themedTemplates = {};

for (const template of REASONING_TEMPLATES) {
  if (template.contextThemed) themedTemplates[template.id] = new Set();

  for (let seed = 1; seed <= 1000; seed += 1) {
    const question = generateReasoningQuestion(template.id, seed);
    const safe = safeReasoningQuestion(question);
    const marked = evaluateReasoningQuestion(question, {});
    const text = [
      question?.stemHtml,
      question?.visualHtml,
      ...(question?.solutionLines || []),
      question?.checkLine,
      question?.reflectionPrompt,
    ].filter(Boolean).join('\n');

    if (question?.itemId !== `${template.id}:${seed}`) {
      failures.unstableItemIds.push(`${template.id}:${seed}:${question?.itemId}`);
    }
    if (malformed.test(text)) failures.malformedTextFailures.push(`${template.id}:${seed}`);
    if (safe?.evaluate !== undefined) failures.safeReadModelMarkerLeaks.push(`${template.id}:${seed}`);
    if (!Number.isFinite(Number(marked.score)) || !Number.isFinite(Number(marked.maxScore))) {
      failures.nonFiniteMarkerOutputs.push(`${template.id}:${seed}`);
    }
    if (template.contextThemed && question?.contextThemeId) themedTemplates[template.id].add(question.contextThemeId);

    if (template.id === 'theme_mixed_units_total_gap') {
      for (let answer = -1000; answer < 0; answer += 1) {
        if (question.evaluate({ answer: String(answer) }).correct) {
          failures.negativeMoreNeededAccepted.push(`${question.itemId}:${answer}`);
          break;
        }
      }
    }

    if (template.id === 'theme_fraction_two_step_share') {
      const values = strongValues(question.stemHtml);
      const total = Number(values[1]);
      const answer = findCorrectNumericAnswer(question);
      if (!(answer <= total)) failures.impossibleUsedAltogether.push(`${question.itemId}:${answer}>${total}`);
    }

    if (template.id === 'theme_percent_change_compare') {
      const values = strongValues(question.stemHtml);
      const total = Number(values[1]);
      const afternoonCompleters = Number(values[2]);
      if (!(afternoonCompleters <= total)) failures.afternoonCompletersOverTotal.push(`${question.itemId}:${afternoonCompleters}>${total}`);
    }

    if (template.id === 'theme_ratio_recipe_total') {
      const values = strongValues(question.stemHtml);
      if (labelsOverlap(values[0], values[1])) failures.overlappingRatioItems.push(`${question.itemId}:${values[0]}/${values[1]}`);
    }

    if (template.id === 'theme_money_multi_buy_budget') {
      const match = String(question.stemHtml).match(/They buy <strong>\d+<\/strong> (.*?) at <strong>.*?<\/strong> each and <strong>\d+<\/strong> (.*?) at <strong>/);
      if (!match || labelsOverlap(match[1], match[2])) {
        failures.overlappingPurchaseItems.push(`${question.itemId}:${match ? `${match[1]}/${match[2]}` : 'unparsed'}`);
      }
    }
  }
}

for (const [templateId, themes] of Object.entries(themedTemplates)) {
  if (themes.size !== summary.contextThemeCount) {
    failures.themeCoverageFailures.push(`${templateId}:${themes.size}/${summary.contextThemeCount}`);
  }
}

const output = {
  checkedAt: new Date().toISOString(),
  base: currentBase(),
  summary,
  templateCount: REASONING_TEMPLATES.length,
  seedsPerTemplate: 1000,
  generatedCases: REASONING_TEMPLATES.length * 1000,
  unstableItemIds: failures.unstableItemIds.length,
  malformedTextFailures: failures.malformedTextFailures.length,
  safeReadModelMarkerLeaks: failures.safeReadModelMarkerLeaks.length,
  nonFiniteMarkerOutputs: failures.nonFiniteMarkerOutputs.length,
  negativeMoreNeededAccepted: failures.negativeMoreNeededAccepted.length,
  impossibleUsedAltogether: failures.impossibleUsedAltogether.length,
  afternoonCompletersOverTotal: failures.afternoonCompletersOverTotal.length,
  overlappingRatioItems: failures.overlappingRatioItems.length,
  overlappingPurchaseItems: failures.overlappingPurchaseItems.length,
  themedTemplates: Object.fromEntries(Object.entries(themedTemplates).map(([id, themes]) => [id, Array.from(themes).sort()])),
  failures,
};

const json = `${JSON.stringify(output, null, 2)}\n`;
if (outPath) writeFileSync(outPath, json);
else process.stdout.write(json);

const failed = Object.values(failures).some((items) => items.length > 0);
if (failed) process.exitCode = 1;
