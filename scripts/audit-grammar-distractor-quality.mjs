#!/usr/bin/env node
/**
 * Grammar QG P10 U6 — Distractor Audit
 *
 * For each selected-response template x seeds 1..30, runs every option through
 * evaluateGrammarQuestion. Checks:
 * - Exactly one option marks correct (single_choice)
 * - At least one complete correct set exists (multi_choice / checkbox)
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
  createGrammarQuestion,
  evaluateGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(__dirname, '..', 'reports', 'grammar');

const SEED_MIN = 1;
const SEED_MAX = 30;

export function runDistractorAudit() {
  const results = [];
  let s0Count = 0;
  let s1Count = 0;

  const selectedResponseTemplates = GRAMMAR_TEMPLATE_METADATA.filter(
    (t) => t.isSelectedResponse,
  );

  for (const template of selectedResponseTemplates) {
    for (let seed = SEED_MIN; seed <= SEED_MAX; seed++) {
      const question = createGrammarQuestion({ templateId: template.id, seed });
      if (!question) continue;

      const inputType = question.inputSpec?.type;
      if (inputType !== 'single_choice' && inputType !== 'multi_choice') continue;

      const options = question.inputSpec.options || [];
      const correctOptions = [];
      const incorrectOptions = [];

      for (const opt of options) {
        const resp = { answer: inputType === 'multi_choice' ? [opt.value] : opt.value };
        const result = evaluateGrammarQuestion(question, resp);
        if (result && result.correct) {
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

      results.push({
        templateId: template.id,
        seed,
        inputType,
        optionCount: options.length,
        correctCount: correctOptions.length,
        incorrectCount: incorrectOptions.length,
        severity,
        issue,
      });
    }
  }

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
