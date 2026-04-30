#!/usr/bin/env node
/**
 * Grammar QG P10 U6 — Distractor Audit (Semantic Classification)
 *
 * For each selected-response template x seeds 1..30, runs every option through
 * evaluateGrammarQuestion. Checks:
 * - Exactly one option marks correct (single_choice)
 * - At least one complete correct set exists (multi_choice / checkbox)
 *
 * Per-option detail:
 * - optionText: the actual label text
 * - isCorrect: boolean from evaluator
 * - misconceptionTag: from the evaluation result (misconception ID for wrong answers)
 * - whyWrong: human-readable explanation from MISCONCEPTIONS lookup
 *
 * Per-template flags:
 * - ambiguousConceptArea: true when template concept overlaps formal/informal,
 *   modal verbs, subject/object, subordinate/relative clause areas
 * - requiresAdultReview: mirrors ambiguousConceptArea (flags for human sign-off)
 *
 * Report-level:
 * - ambiguousTemplates: array of template IDs flagged for adult attention
 *
 * Reports S0 if a distractor passes as correct, or no option marks correct.
 * Exit 0 if 0 S0/S1, exit 1 otherwise.
 *
 * Writes: reports/grammar/grammar-qg-p10-distractor-audit.json
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

import {
  GRAMMAR_TEMPLATE_METADATA,
  GRAMMAR_CONTENT_RELEASE_ID,
  GRAMMAR_MISCONCEPTIONS,
  createGrammarQuestion,
  evaluateGrammarQuestion,
  serialiseGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(__dirname, '..', 'reports', 'grammar');

const SEED_MIN = 1;
const SEED_MAX = 30;

/**
 * Concept areas that are inherently ambiguous and require adult review.
 * These domains have genuine edge cases in KS2 marking.
 */
const AMBIGUOUS_SKILL_IDS = Object.freeze([
  'formality',
  'modal_verbs',
  'subject_object',
  'clauses',
  'relative_clauses',
]);

/**
 * Misconception tags that represent genuine grammatical ambiguity where a
 * child's answer COULD be correct under a different reading.
 */
const DEFENSIBLE_MISCONCEPTION_TAGS = Object.freeze([
  'formality_confusion',
  'modal_certainty_confusion',
  'clause_type_confusion',
  'subject_object_confusion',
  'relative_subordinate_confusion',
  'word_class_confusion',
]);

/**
 * Phrases in the prompt that narrow interpretation and disambiguate.
 * Matched case-insensitively.
 */
const DISAMBIGUATION_PHRASES = Object.freeze([
  'in the sentence',
  'in this sentence',
  'as used here',
  'as used in',
  'in the context',
  'based on the sentence',
  'below',
]);

function isDefensibleAlternative(misconceptionTag) {
  return Boolean(misconceptionTag && DEFENSIBLE_MISCONCEPTION_TAGS.includes(misconceptionTag));
}

function doesPromptDisambiguate(promptText) {
  if (!promptText) return false;
  const lower = promptText.toLowerCase();
  return DISAMBIGUATION_PHRASES.some((phrase) => lower.includes(phrase));
}

function isAmbiguousTemplate(template) {
  const skillIds = template.skillIds || [];
  return skillIds.some((id) => AMBIGUOUS_SKILL_IDS.includes(id));
}

export function runDistractorAudit() {
  const results = [];
  let s0Count = 0;
  let s1Count = 0;

  const selectedResponseTemplates = GRAMMAR_TEMPLATE_METADATA.filter(
    (t) => t.isSelectedResponse,
  );

  // Pre-compute ambiguous template set (only IDs — actual list populated after results)
  const ambiguousSet = new Set();
  for (const template of selectedResponseTemplates) {
    if (isAmbiguousTemplate(template)) {
      ambiguousSet.add(template.id);
    }
  }

  // Track which templates actually produced auditable results
  const templatesWithResults = new Set();

  for (const template of selectedResponseTemplates) {
    const ambiguousConceptArea = ambiguousSet.has(template.id);

    for (let seed = SEED_MIN; seed <= SEED_MAX; seed++) {
      const question = createGrammarQuestion({ templateId: template.id, seed });
      if (!question) continue;

      const inputType = question.inputSpec?.type;
      if (inputType !== 'single_choice' && inputType !== 'multi_choice') continue;

      // Serialise to get promptText / screenReaderPromptText for disambiguation check
      const serialised = serialiseGrammarQuestion(question);
      const promptTextForCheck = serialised?.screenReaderPromptText || serialised?.promptText || '';
      const promptDisambiguates = doesPromptDisambiguate(promptTextForCheck);

      const options = question.inputSpec.options || [];
      const correctOptions = [];
      const incorrectOptions = [];
      const optionDetails = [];

      for (const opt of options) {
        const resp = { answer: inputType === 'multi_choice' ? [opt.value] : opt.value };
        const result = evaluateGrammarQuestion(question, resp);
        const isCorrect = Boolean(result && result.correct);
        const misconceptionTag = (!isCorrect && result?.misconception) ? result.misconception : null;
        const whyWrong = misconceptionTag ? (GRAMMAR_MISCONCEPTIONS[misconceptionTag] || null) : null;

        const detail = {
          optionText: opt.label || opt.value,
          isCorrect,
          misconceptionTag,
          whyWrong,
        };

        // Per-option defensibility fields for distractors
        if (!isCorrect) {
          detail.defensibleAlternative = isDefensibleAlternative(misconceptionTag);
          detail.promptDisambiguates = promptDisambiguates;
        }

        optionDetails.push(detail);

        if (isCorrect) {
          correctOptions.push(opt.value);
        } else {
          incorrectOptions.push(opt.value);
        }
      }

      let severity = null;
      let issue = null;

      if (inputType === 'single_choice') {
        if (correctOptions.length === 0) {
          severity = 'S0';
          issue = 'no-correct-option';
          s0Count++;
        } else if (correctOptions.length > 1) {
          severity = 'S0';
          issue = 'multiple-correct-options';
          s0Count++;
        }
      } else if (inputType === 'multi_choice') {
        if (correctOptions.length === 0) {
          severity = 'S0';
          issue = 'no-correct-option';
          s0Count++;
        }
      }

      templatesWithResults.add(template.id);

      results.push({
        templateId: template.id,
        seed,
        inputType,
        optionCount: options.length,
        correctCount: correctOptions.length,
        incorrectCount: incorrectOptions.length,
        severity,
        issue,
        options: optionDetails,
        ambiguousConceptArea,
        requiresAdultReview: ambiguousConceptArea,
      });
    }
  }

  // Only include ambiguous templates that actually produced auditable results
  const ambiguousTemplates = [...ambiguousSet].filter((id) => templatesWithResults.has(id));

  return {
    metadata: {
      contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
      generatedAt: new Date().toISOString(),
      seedRange: `${SEED_MIN}..${SEED_MAX}`,
      templatesAudited: selectedResponseTemplates.length,
      totalItems: results.length,
      s0Count,
      s1Count,
      pass: s0Count === 0 && s1Count === 0,
    },
    ambiguousTemplates,
    results,
  };
}

async function main() {
  const audit = runDistractorAudit();

  await fs.mkdir(REPORTS_DIR, { recursive: true });
  const outputPath = path.join(REPORTS_DIR, 'grammar-qg-p10-distractor-audit.json');
  await fs.writeFile(outputPath, JSON.stringify(audit, null, 2) + '\n', 'utf8');

  console.log('Grammar QG P10 Distractor Audit:');
  console.log(`  Templates audited: ${audit.metadata.templatesAudited}`);
  console.log(`  Total items: ${audit.metadata.totalItems}`);
  console.log(`  S0 failures: ${audit.metadata.s0Count}`);
  console.log(`  S1 failures: ${audit.metadata.s1Count}`);
  console.log(`  Pass: ${audit.metadata.pass}`);
  console.log(`  Output: ${outputPath}`);

  if (!audit.metadata.pass) {
    process.exit(1);
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main().catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  });
}
