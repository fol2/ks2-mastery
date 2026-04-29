#!/usr/bin/env node
/**
 * Grammar QG P10 U7 — Marking Matrix
 *
 * For each constructed-response template (textarea/text inputSpec), seeds 1..10:
 * - Tests: golden answer marks correct, empty/whitespace marks incorrect.
 *
 * Writes: reports/grammar/grammar-qg-p10-marking-matrix.json
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
const SEED_MAX = 10;

export function buildMarkingMatrix() {
  const entries = [];

  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    for (let seed = SEED_MIN; seed <= SEED_MAX; seed++) {
      const question = createGrammarQuestion({ templateId: template.id, seed });
      if (!question) continue;

      const inputType = question.inputSpec?.type;
      if (inputType !== 'textarea' && inputType !== 'text') continue;

      // Derive golden answer
      const golden = deriveGolden(question);
      let goldenResult = null;
      let goldenCorrect = null;

      if (golden) {
        goldenResult = evaluateGrammarQuestion(question, { answer: golden });
        goldenCorrect = goldenResult ? goldenResult.correct : null;
      }

      // Test empty string
      const emptyResult = evaluateGrammarQuestion(question, { answer: '' });
      const emptyCorrect = emptyResult ? emptyResult.correct : null;

      // Test whitespace
      const wsResult = evaluateGrammarQuestion(question, { answer: '   ' });
      const wsCorrect = wsResult ? wsResult.correct : null;

      entries.push({
        templateId: template.id,
        seed,
        inputType,
        goldenAnswer: golden || null,
        goldenMarksCorrect: goldenCorrect,
        emptyMarksIncorrect: emptyCorrect === false,
        whitespaceMarksIncorrect: wsCorrect === false,
      });
    }
  }

  return {
    metadata: {
      contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
      generatedAt: new Date().toISOString(),
      seedRange: `${SEED_MIN}..${SEED_MAX}`,
      totalEntries: entries.length,
      goldenPassCount: entries.filter((e) => e.goldenMarksCorrect === true).length,
      goldenFailCount: entries.filter((e) => e.goldenMarksCorrect === false).length,
      goldenUnknownCount: entries.filter((e) => e.goldenMarksCorrect === null).length,
      emptyRejectsCount: entries.filter((e) => e.emptyMarksIncorrect).length,
    },
    entries,
  };
}

function deriveGolden(question) {
  if (question.answerSpec?.golden && question.answerSpec.golden.length > 0) {
    return question.answerSpec.golden[0];
  }
  if (question.answerSpec?.answerText) {
    return question.answerSpec.answerText;
  }
  return null;
}

async function main() {
  const matrix = buildMarkingMatrix();

  await fs.mkdir(REPORTS_DIR, { recursive: true });
  const outputPath = path.join(REPORTS_DIR, 'grammar-qg-p10-marking-matrix.json');
  await fs.writeFile(outputPath, JSON.stringify(matrix, null, 2) + '\n', 'utf8');

  console.log('Grammar QG P10 Marking Matrix generated:');
  console.log(`  Total entries: ${matrix.metadata.totalEntries}`);
  console.log(`  Golden pass: ${matrix.metadata.goldenPassCount}`);
  console.log(`  Golden fail: ${matrix.metadata.goldenFailCount}`);
  console.log(`  Golden unknown: ${matrix.metadata.goldenUnknownCount}`);
  console.log(`  Empty rejects: ${matrix.metadata.emptyRejectsCount}`);
  console.log(`  Output: ${outputPath}`);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main().catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  });
}
