import assert from 'node:assert/strict';
import {
  REASONING_TEMPLATES,
  evaluateReasoningQuestion,
  generateReasoningQuestion,
  reasoningContentSummary,
  safeReasoningQuestion,
} from '../../../../../../../shared/reasoning/content.js';

const seedCount = Number(process.env.REASONING_AUDIT_SEEDS || 300);
const malformed = /\b(?:undefined|NaN|Infinity|\[object Object\])\b/i;
const failures = [];
const themeIds = new Set();
const templateThemeCoverage = new Map();
let generated = 0;
for (const template of REASONING_TEMPLATES) {
  const perTemplateThemes = new Set();
  for (let seed = 1; seed <= seedCount; seed += 1) {
    try {
      const question = generateReasoningQuestion(template.id, seed);
      generated += 1;
      assert.ok(question, `${template.id}:${seed} generated`);
      assert.equal(question.itemId, `${template.id}:${seed}`, `${template.id}:${seed} item id`);
      const text = [question.stemHtml, question.visualHtml, ...(question.solutionLines || []), question.checkLine, question.reflectionPrompt, JSON.stringify(question.inputSpec || {})].filter(Boolean).join('\n');
      if (malformed.test(text)) failures.push(`${template.id}:${seed}: malformed generated text`);
      if (/\b(?:boxe|benche|batche|classe)\b/i.test(text)) failures.push(`${template.id}:${seed}: broken singular wording`);
      const result = evaluateReasoningQuestion(question, {});
      if (!Number.isFinite(Number(result.score))) failures.push(`${template.id}:${seed}: non-finite score`);
      if (!Number.isFinite(Number(result.maxScore))) failures.push(`${template.id}:${seed}: non-finite maxScore`);
      const safe = safeReasoningQuestion(question);
      if (safe.evaluate !== undefined) failures.push(`${template.id}:${seed}: safe question leaked evaluator`);
      if (safe.solutionLines !== undefined) failures.push(`${template.id}:${seed}: safe question leaked solution without includeFeedback`);
      if (safe.domain !== undefined || safe.skillIds !== undefined || safe.skillNames !== undefined) failures.push(`${template.id}:${seed}: safe question leaked early skill metadata`);
      if (question.contextThemeId) { themeIds.add(question.contextThemeId); perTemplateThemes.add(question.contextThemeId); }
    } catch (error) { failures.push(`${template.id}:${seed}: ${error.message}`); }
  }
  if (template.contextThemed) templateThemeCoverage.set(template.id, perTemplateThemes.size);
}
const summary = reasoningContentSummary();
const lowThemeCoverage = [...templateThemeCoverage.entries()].filter(([, count]) => count < Math.min(12, summary.contextThemeCount));
const report = { releaseId: summary.releaseId, templateCount: summary.templateCount, satsFriendlyCount: summary.satsFriendlyCount, contextThemeCount: summary.contextThemeCount, themedTemplateCount: summary.themedTemplateCount, extraCreditTemplateCount: summary.extraCreditTemplateCount, seedsPerTemplate: seedCount, generated, failureCount: failures.length, failures: failures.slice(0, 50), distinctThemeIdsSeen: themeIds.size, lowThemeCoverage: lowThemeCoverage.slice(0, 50) };
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
