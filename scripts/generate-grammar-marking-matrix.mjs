#!/usr/bin/env node
/**
 * Grammar QG P10 R-U2 — Full Variant Marking Matrix (9 categories)
 *
 * For each constructed-response template (textarea/text inputSpec) x seeds 1..5:
 * Tests 9 variant categories against the evaluator and records pass/fail.
 *
 * Categories:
 *  1. goldenAnswers             — all accepted answers from answerSpec.golden
 *  2. acceptedVariants          — whitespace-padded golden (leading/trailing/double-space)
 *  3. nearMisses                — golden[0] with first word removed
 *  4. rawPromptProbes           — ["", " ", "I don't know"]
 *  5. smartPunctuationVariants  — golden[0] with straight↔curly transforms
 *  6. caseVariants              — golden[0].toLowerCase(), golden[0].toUpperCase()
 *  7. commonChildMistakes       — golden[0] with last word duplicated
 *  8. expectedScore             — pass/fail expectation per category
 *  9. misconceptionTag          — from evaluator result for near-miss
 *
 * Writes:
 *   reports/grammar/grammar-qg-p10-marking-matrix.json
 *   reports/grammar/grammar-qg-p10-marking-matrix.md
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

import {
  GRAMMAR_TEMPLATE_METADATA,
  GRAMMAR_CONTENT_RELEASE_ID,
  createGrammarQuestion,
  evaluateGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';

import { normaliseSmartPunctuation } from '../worker/src/subjects/grammar/answer-spec.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(__dirname, '..', 'reports', 'grammar');

const SEED_MIN = 1;
const SEED_MAX = 5;

// ---------------------------------------------------------------------------
// Variant builders
// ---------------------------------------------------------------------------

function toSmart(text) {
  return String(text || '')
    .replace(/"/g, '“')   // straight double -> left curly
    .replace(/'/g, '’');  // straight single -> right curly (smart apostrophe)
}

function toStraight(text) {
  return normaliseSmartPunctuation(text);
}

function evalVariant(question, input) {
  const result = evaluateGrammarQuestion(question, { answer: input });
  return { input, marksCorrect: result?.correct === true };
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildMarkingMatrix() {
  const entries = [];

  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    for (let seed = SEED_MIN; seed <= SEED_MAX; seed++) {
      const question = createGrammarQuestion({ templateId: template.id, seed });
      if (!question) continue;

      const inputType = question.inputSpec?.type;
      if (inputType !== 'textarea' && inputType !== 'text') continue;

      const golden = question.answerSpec?.golden;
      if (!golden || golden.length === 0) continue;

      const primary = golden[0];
      const words = primary.split(/\s+/);

      // 1. goldenAnswers — all accepted answers
      const goldenAnswers = golden.map((g) => evalVariant(question, g));

      // 2. acceptedVariants — whitespace tolerance
      const acceptedInputs = [
        ' ' + primary,                        // leading space
        primary + ' ',                        // trailing space
        primary.replace(/  +/g, ' '),         // double-space normalised
      ];
      const uniqueAccepted = [...new Set(acceptedInputs)].filter((v) => v !== primary);
      const acceptedVariants = (uniqueAccepted.length > 0 ? uniqueAccepted : [' ' + primary])
        .map((v) => evalVariant(question, v));

      // 3. nearMisses — golden[0] with first word removed
      const nearMissInput = words.length > 1 ? words.slice(1).join(' ') : primary.slice(1);
      const nearMisses = [evalVariant(question, nearMissInput)];

      // 4. rawPromptProbes — must all mark incorrect
      const rawPromptProbes = ['', ' ', "I don't know"].map((v) => evalVariant(question, v));

      // 5. smartPunctuationVariants — curly<->straight
      const smartPunctuationVariants = [
        evalVariant(question, toSmart(primary)),
        evalVariant(question, toStraight(primary)),
      ];

      // 6. caseVariants
      const caseVariants = [
        evalVariant(question, primary.toLowerCase()),
        evalVariant(question, primary.toUpperCase()),
      ];

      // 7. commonChildMistakes — last word duplicated
      const lastWord = words[words.length - 1] || '';
      const commonChildMistakes = [evalVariant(question, primary + ' ' + lastWord)];

      // 8. expectedScore — pass/fail expectations per category
      const expectedScore = {
        goldenAnswers: 'pass',
        acceptedVariants: 'pass',
        nearMisses: 'fail',
        rawPromptProbes: 'fail',
        smartPunctuationVariants: 'pass',
        caseVariants: 'varies',
        commonChildMistakes: 'fail',
      };

      // 9. misconceptionTag — from evaluator for near-miss
      const nearMissEval = evaluateGrammarQuestion(question, { answer: nearMissInput });
      const misconceptionTag = nearMissEval?.misconception || null;

      entries.push({
        templateId: template.id,
        seed,
        inputType,
        goldenAnswers,
        acceptedVariants,
        nearMisses,
        rawPromptProbes,
        smartPunctuationVariants,
        caseVariants,
        commonChildMistakes,
        expectedScore,
        misconceptionTag,
      });
    }
  }

  return {
    metadata: {
      contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
      generatedAt: new Date().toISOString(),
      seedRange: `${SEED_MIN}..${SEED_MAX}`,
      totalEntries: entries.length,
      variantCategories: 9,
      categoriesTested: [
        'goldenAnswers',
        'acceptedVariants',
        'nearMisses',
        'rawPromptProbes',
        'smartPunctuationVariants',
        'caseVariants',
        'commonChildMistakes',
        'expectedScore',
        'misconceptionTag',
      ],
    },
    entries,
  };
}

// ---------------------------------------------------------------------------
// Markdown report
// ---------------------------------------------------------------------------

function generateMarkdown(matrix) {
  const lines = [];
  lines.push('# Grammar QG P10 — Marking Matrix (Full Variant Expansion)');
  lines.push('');
  lines.push(`Generated: ${matrix.metadata.generatedAt}`);
  lines.push(`Content release: ${matrix.metadata.contentReleaseId}`);
  lines.push(`Seed range: ${matrix.metadata.seedRange}`);
  lines.push(`Total entries: ${matrix.metadata.totalEntries}`);
  lines.push(`Variant categories: ${matrix.metadata.variantCategories}`);
  lines.push('');
  lines.push('## Categories tested');
  lines.push('');
  lines.push('| # | Category | Description |');
  lines.push('|---|----------|-------------|');
  lines.push('| 1 | goldenAnswers | All accepted golden answers mark correct |');
  lines.push('| 2 | acceptedVariants | Whitespace-normalised variants mark correct |');
  lines.push('| 3 | nearMisses | First word removed — marks incorrect |');
  lines.push('| 4 | rawPromptProbes | Empty / junk — marks incorrect |');
  lines.push('| 5 | smartPunctuationVariants | Curly <-> straight punctuation |');
  lines.push('| 6 | caseVariants | toLowerCase / toUpperCase |');
  lines.push('| 7 | commonChildMistakes | Last word duplicated — marks incorrect |');
  lines.push('| 8 | expectedScore | Pass/fail expectations per category |');
  lines.push('| 9 | misconceptionTag | Evaluator misconception for near-miss |');
  lines.push('');

  // Summary table
  lines.push('## Summary by template');
  lines.push('');
  lines.push('| Template | Seeds | Golden Pass | Accepted Pass | NearMiss Fail | Probe Fail | Smart Pass | Case Pass | Mistake Fail |');
  lines.push('|----------|-------|-------------|---------------|---------------|------------|------------|-----------|--------------|');

  const grouped = {};
  for (const e of matrix.entries) {
    if (!grouped[e.templateId]) grouped[e.templateId] = [];
    grouped[e.templateId].push(e);
  }

  for (const [tid, group] of Object.entries(grouped)) {
    const goldenPass = group.flatMap((e) => e.goldenAnswers).filter((v) => v.marksCorrect).length;
    const goldenTotal = group.flatMap((e) => e.goldenAnswers).length;
    const acceptPass = group.flatMap((e) => e.acceptedVariants).filter((v) => v.marksCorrect).length;
    const acceptTotal = group.flatMap((e) => e.acceptedVariants).length;
    const nearFail = group.flatMap((e) => e.nearMisses).filter((v) => !v.marksCorrect).length;
    const nearTotal = group.flatMap((e) => e.nearMisses).length;
    const probeFail = group.flatMap((e) => e.rawPromptProbes).filter((v) => !v.marksCorrect).length;
    const probeTotal = group.flatMap((e) => e.rawPromptProbes).length;
    const smartPass = group.flatMap((e) => e.smartPunctuationVariants).filter((v) => v.marksCorrect).length;
    const smartTotal = group.flatMap((e) => e.smartPunctuationVariants).length;
    const casePass = group.flatMap((e) => e.caseVariants).filter((v) => v.marksCorrect).length;
    const caseTotal = group.flatMap((e) => e.caseVariants).length;
    const mistakeFail = group.flatMap((e) => e.commonChildMistakes).filter((v) => !v.marksCorrect).length;
    const mistakeTotal = group.flatMap((e) => e.commonChildMistakes).length;

    lines.push(
      `| ${tid} | ${group.length} | ${goldenPass}/${goldenTotal} | ${acceptPass}/${acceptTotal} | ${nearFail}/${nearTotal} | ${probeFail}/${probeTotal} | ${smartPass}/${smartTotal} | ${casePass}/${caseTotal} | ${mistakeFail}/${mistakeTotal} |`,
    );
  }

  lines.push('');
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

async function main() {
  const matrix = buildMarkingMatrix();

  await fs.mkdir(REPORTS_DIR, { recursive: true });

  const jsonPath = path.join(REPORTS_DIR, 'grammar-qg-p10-marking-matrix.json');
  await fs.writeFile(jsonPath, JSON.stringify(matrix, null, 2) + '\n', 'utf8');

  const mdPath = path.join(REPORTS_DIR, 'grammar-qg-p10-marking-matrix.md');
  await fs.writeFile(mdPath, generateMarkdown(matrix), 'utf8');

  console.log('Grammar QG P10 Marking Matrix (9-category) generated:');
  console.log(`  Total entries: ${matrix.metadata.totalEntries}`);
  console.log(`  Variant categories: ${matrix.metadata.variantCategories}`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  MD:   ${mdPath}`);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main().catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  });
}
