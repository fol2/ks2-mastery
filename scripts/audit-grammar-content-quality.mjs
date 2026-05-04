#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GRAMMAR_MISCONCEPTIONS,
  GRAMMAR_TEMPLATE_METADATA,
  createGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';
import { markByAnswerSpec } from '../worker/src/subjects/grammar/answer-spec.js';

const DEFAULT_SEEDS = Object.freeze([1, 2, 3]);

export function parseSeedList(value) {
  if (!value) return [...DEFAULT_SEEDS];
  const seeds = [];

  for (const part of String(value).split(',')) {
    const token = part.trim();
    if (!token) continue;

    const range = token.match(/^(\d+)\.\.(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
        throw new Error(`Invalid seed range: ${token}`);
      }
      for (let seed = start; seed <= end; seed += 1) seeds.push(seed);
      continue;
    }

    const seed = Number(token);
    if (!Number.isInteger(seed) || seed < 1) {
      throw new Error(`Invalid seed value: ${token}`);
    }
    seeds.push(seed);
  }

  const unique = Array.from(new Set(seeds)).sort((a, b) => a - b);
  if (unique.length === 0) throw new Error(`No valid seeds parsed from: ${value}`);
  return unique;
}

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
 *  6. Near-miss marks correct
 *  7. Near-miss equals golden (constructed-response only)
 *  8. Raw prompt passes marking
 *  9. Child-visible article agreement (a adverb/adjective/exclamation) — P19 Contract B
 * 10. Pronoun-cohesion contradiction in feedback — P19 Contract C
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

      // --- HARD FAIL 6: Near-miss marks correct ---
      const nearMiss6 = question.answerSpec?.nearMiss;
      if (Array.isArray(nearMiss6) && nearMiss6.length > 0 && question.answerSpec) {
        for (const nm of nearMiss6) {
          const result = markByAnswerSpec(question.answerSpec, nm);
          if (result.correct === true) {
            hardFailures.push({
              rule: 'near-miss-marks-correct',
              templateId: template.id,
              seed,
              detail: `Near-miss "${nm}" is marked correct by markByAnswerSpec`,
            });
            break;
          }
        }
      }

      // --- HARD FAIL 7: Near-miss equals golden (constructed-response only) ---
      const constructedKinds7 = ['normalisedText', 'acceptedSet', 'punctuationPattern'];
      if (question.answerSpec && constructedKinds7.includes(question.answerSpec.kind)) {
        const golden7 = question.answerSpec.golden;
        const nearMiss7 = question.answerSpec.nearMiss;
        if (Array.isArray(golden7) && golden7.length > 0 && Array.isArray(nearMiss7) && nearMiss7.length > 0) {
          const normGoldens = golden7.map(normaliseOption);
          for (const nm of nearMiss7) {
            if (normGoldens.includes(normaliseOption(nm))) {
              hardFailures.push({
                rule: 'near-miss-equals-golden',
                templateId: template.id,
                seed,
                detail: `Near-miss "${nm}" equals a golden answer after normalisation`,
              });
              break;
            }
          }
        }
      }

      // --- HARD FAIL 8: Raw prompt passes marking ---
      const constructedKinds = ['normalisedText', 'acceptedSet', 'punctuationPattern'];
      if (question.answerSpec && constructedKinds.includes(question.answerSpec.kind)) {
        const nearMiss8 = question.answerSpec.nearMiss;
        if (Array.isArray(nearMiss8) && nearMiss8.length > 0) {
          for (const nm of nearMiss8) {
            const result = markByAnswerSpec(question.answerSpec, nm);
            if (result.correct === true) {
              hardFailures.push({
                rule: 'raw-prompt-passes',
                templateId: template.id,
                seed,
                detail: `Near-miss/raw value "${nm}" passes markByAnswerSpec — question is a no-op`,
              });
              break;
            }
          }
        }
      }

      // --- HARD FAIL 9: Child-visible article agreement ---
      const articleAgreementText = `${question.stemHtml || ''} ${(question.solutionLines || []).join(' ')} ${JSON.stringify(question.inputSpec || {})} ${JSON.stringify(question.answerSpec || {})}`;
      const badArticleMatch = articleAgreementText.match(/\ba\s+(adverb|adjective|exclamation)\b/i);
      if (badArticleMatch) {
        hardFailures.push({
          rule: 'article-agreement',
          templateId: template.id,
          seed,
          detail: `Use "an ${badArticleMatch[1].toLowerCase()}" rather than "a ${badArticleMatch[1].toLowerCase()}"`,
        });
      }

      // --- HARD FAIL 10: Pronoun-cohesion contradiction (P19 Contract C) ---
      // When the prompt asks about unclear/ambiguous reference, feedback must
      // not assert the pronouns "clearly refer" without an accompanying contrast
      // marker that explains the unclarity. Catches the pre-P19 pattern where
      // generated feedback contradicted the question.
      const promptPlain10 = stripHtml(question.stemHtml || '').toLowerCase();
      const feedbackPlain10 = String(question.answerSpec?.feedbackLong || '').toLowerCase();
      const contradictionTrigger = /\b(unclear|wrong|confusing|ambiguous)\b/.test(promptPlain10);
      const contradictionAssertion = /clearly refer/.test(feedbackPlain10);
      const contradictionContrast = /\b(but|however|whereas|not\s+clear|because)\b/.test(feedbackPlain10);
      if (contradictionTrigger && contradictionAssertion && !contradictionContrast) {
        hardFailures.push({
          rule: 'pronoun-cohesion-contradiction',
          templateId: template.id,
          seed,
          detail: 'Prompt says the reference is unclear/ambiguous but feedback states the pronouns "clearly refer" without explaining the contrast.',
        });
      }

      // --- ADVISORY 6: Reversed curly quotes ---
      const allText = `${question.stemHtml || ''} ${(question.solutionLines || []).join(' ')}`;
      // Only flag a closing curly quote (’) used at the START of a word after
      // whitespace/opening punctuation. The previous /’\w/ regex flagged
      // possessives like dog’s and girls’.
      if (/(^|[\s([{"“])’[A-Za-z]/.test(allText) && !/‘/.test(allText)) {
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
  const seeds = seedArg ? parseSeedList(seedArg.slice('--seeds='.length)) : [...DEFAULT_SEEDS];

  const audit = buildGrammarContentQualityAudit(seeds);
  if (audit.summary.totalTemplatesChecked === 0) {
    throw new Error(`Grammar content-quality audit checked 0 templates; parsed seeds: ${seeds.join(',')}`);
  }

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
