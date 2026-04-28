#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GRAMMAR_MISCONCEPTIONS,
  GRAMMAR_TEMPLATE_METADATA,
  createGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';

const DEFAULT_SEEDS = Object.freeze([1, 2, 3]);

/**
 * Normalise an option string for duplicate detection.
 */
function normaliseOption(str) {
  return (str || '').toLowerCase().trim();
}

/**
 * Strip basic HTML tags for raw text comparison.
 */
function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, '').trim();
}

/**
 * Build a content-quality audit over the grammar template corpus.
 *
 * Hard-fail conditions (exit non-zero):
 *  1. Unknown misconception IDs
 *  2. Duplicate normalised options in selected-response templates
 *  3. Multiple correct answers in selected-response templates
 *  4. Correct answer missing from options in selected-response templates
 *  5. Fix-task templates where raw prompt equals accepted answer
 *
 * Advisory conditions (recorded but do not fail):
 *  6. Reversed curly quotes at start of quoted words
 *  7. -ly compound words hyphenated before adjective/participle
 *  8. Transfer templates whose feedback doesn't mention both grammar ideas
 */
export function buildGrammarContentQualityAudit(seeds = DEFAULT_SEEDS) {
  const hardFailures = [];
  const advisories = [];
  const misconceptionKeys = new Set(Object.keys(GRAMMAR_MISCONCEPTIONS));
  let totalTemplatesChecked = 0;

  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    for (const seed of seeds) {
      const question = createGrammarQuestion({ templateId: template.id, seed });
      if (!question) continue;
      totalTemplatesChecked += 1;

      // --- HARD FAIL 1: Unknown misconception IDs ---
      const misconceptionId = question.answerSpec?.misconception;
      if (misconceptionId && !misconceptionKeys.has(misconceptionId)) {
        hardFailures.push({
          rule: 'unknown-misconception',
          templateId: template.id,
          seed,
          detail: `Misconception "${misconceptionId}" is not registered in GRAMMAR_MISCONCEPTIONS`,
        });
      }

      // Selected-response checks
      const options = question.inputSpec?.options;
      if (template.isSelectedResponse && Array.isArray(options) && options.length > 0) {
        const optionValues = options.map((o) => o.value || o.label || '');
        const normalisedValues = optionValues.map(normaliseOption);

        // --- HARD FAIL 2: Duplicate normalised options ---
        const seen = new Set();
        for (const nv of normalisedValues) {
          if (seen.has(nv)) {
            hardFailures.push({
              rule: 'duplicate-options',
              templateId: template.id,
              seed,
              detail: `Duplicate normalised option: "${nv}"`,
            });
            break;
          }
          seen.add(nv);
        }

        // --- HARD FAIL 3 & 4: Correct answer checks ---
        const golden = question.answerSpec?.golden;
        if (Array.isArray(golden) && golden.length > 0) {
          // Multiple correct answers
          if (golden.length > 1) {
            const matchingOptions = golden.filter((g) =>
              normalisedValues.includes(normaliseOption(g)),
            );
            if (matchingOptions.length > 1) {
              hardFailures.push({
                rule: 'multiple-correct-answers',
                templateId: template.id,
                seed,
                detail: `${matchingOptions.length} golden answers found in options: ${matchingOptions.join(', ')}`,
              });
            }
          }

          // Correct answer missing from options
          const primaryGolden = golden[0];
          if (primaryGolden && !normalisedValues.includes(normaliseOption(primaryGolden))) {
            hardFailures.push({
              rule: 'correct-answer-missing',
              templateId: template.id,
              seed,
              detail: `Golden answer "${primaryGolden}" not found in option values`,
            });
          }
        }
      }

      // --- HARD FAIL 5: Fix-task where prompt equals accepted answer ---
      if (template.questionType === 'fix' || question.questionType === 'fix') {
        const rawPrompt = stripHtml(question.stemHtml || '');
        const acceptedAnswers = question.answerSpec?.golden || [];
        for (const accepted of acceptedAnswers) {
          if (accepted && rawPrompt === accepted.trim()) {
            hardFailures.push({
              rule: 'fix-task-noop',
              templateId: template.id,
              seed,
              detail: 'Raw prompt text equals the accepted answer — nothing to fix',
            });
            break;
          }
        }
      }

      // --- ADVISORY 6: Reversed curly quotes ---
      const allText = `${question.stemHtml || ''} ${(question.solutionLines || []).join(' ')}`;
      if (/’\w/.test(allText) && !/‘/.test(allText)) {
        // Closing single quote used at word start without any opening quote present
        advisories.push({
          rule: 'reversed-curly-quote',
          templateId: template.id,
          seed,
          detail: 'Closing curly quote (’) appears at start of a word without a matching opener',
        });
      }

      // --- ADVISORY 7: -ly compound words hyphenated before adjective ---
      const textForHyphen = `${question.stemHtml || ''} ${(question.solutionLines || []).join(' ')}`;
      if (/\b\w+ly-\w+/i.test(textForHyphen)) {
        advisories.push({
          rule: 'ly-compound-hyphenated',
          templateId: template.id,
          seed,
          detail: 'An -ly adverb is hyphenated before an adjective/participle (usually unnecessary)',
        });
      }

      // --- ADVISORY 8: Transfer template feedback missing grammar idea mentions ---
      if ((template.tags || []).includes('mixed-transfer') && template.skillIds.length >= 2) {
        const feedback = question.answerSpec?.feedbackLong || '';
        const solution = (question.solutionLines || []).join(' ');
        const combined = `${feedback} ${solution}`.toLowerCase();
        const skillIds = template.skillIds;
        const missing = skillIds.filter((skillId) => {
          // Check if the feedback mentions the skill concept in some recognisable form
          const normId = skillId.replace(/_/g, ' ');
          return !combined.includes(normId) && !combined.includes(skillId);
        });
        if (missing.length > 0) {
          advisories.push({
            rule: 'transfer-feedback-incomplete',
            templateId: template.id,
            seed,
            detail: `Feedback/solution does not mention skill(s): ${missing.join(', ')}`,
          });
        }
      }
    }
  }

  return {
    hardFailures,
    advisories,
    summary: {
      totalTemplatesChecked,
      hardFailCount: hardFailures.length,
      advisoryCount: advisories.length,
    },
  };
}

function formatSummary(audit) {
  const lines = [
    `Grammar content-quality audit`,
    `Templates checked: ${audit.summary.totalTemplatesChecked}`,
    `Hard failures: ${audit.summary.hardFailCount}`,
    `Advisories: ${audit.summary.advisoryCount}`,
  ];
  if (audit.hardFailures.length > 0) {
    lines.push('');
    lines.push('=== HARD FAILURES ===');
    for (const f of audit.hardFailures) {
      lines.push(`  [${f.rule}] ${f.templateId} (seed ${f.seed}): ${f.detail}`);
    }
  }
  if (audit.advisories.length > 0) {
    lines.push('');
    lines.push('=== ADVISORIES ===');
    for (const a of audit.advisories) {
      lines.push(`  [${a.rule}] ${a.templateId} (seed ${a.seed}): ${a.detail}`);
    }
  }
  return lines.join('\n');
}

async function main(argv) {
  const seedArg = argv.find((arg) => arg.startsWith('--seeds='));
  const seeds = seedArg
    ? seedArg.slice('--seeds='.length).split(',').map(Number).filter(Number.isFinite)
    : DEFAULT_SEEDS;

  const audit = buildGrammarContentQualityAudit(seeds);

  if (argv.includes('--json')) {
    console.log(JSON.stringify(audit, null, 2));
  } else {
    console.log(formatSummary(audit));
  }

  if (audit.hardFailures.length > 0) {
    process.exit(1);
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  });
}
