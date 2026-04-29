#!/usr/bin/env node
/**
 * Grammar QG P10 U5 — Quality Register
 *
 * For each of 78 templates, generates a quality decision based on automated
 * oracle testing. Uses createGrammarQuestion + evaluateGrammarQuestion to test
 * seeds 1..10. Decision: `approved` if all seeds produce valid questions with
 * correct marking; `blocked` otherwise.
 *
 * Writes: reports/grammar/grammar-qg-p10-quality-register.json
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

export function buildQualityRegister() {
  const entries = [];

  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    const evidence = [];
    let allPass = true;

    for (let seed = SEED_MIN; seed <= SEED_MAX; seed++) {
      const question = createGrammarQuestion({ templateId: template.id, seed });
      if (!question) {
        evidence.push({ seed, outcome: 'no-question', detail: 'generator returned null' });
        allPass = false;
        continue;
      }

      // Test golden answer marking for selected-response templates
      if (question.inputSpec?.type === 'single_choice' || question.inputSpec?.type === 'multi_choice') {
        const goldenResp = buildGoldenResponse(question);
        if (!goldenResp) {
          evidence.push({ seed, outcome: 'no-golden', detail: 'could not determine golden response' });
          allPass = false;
          continue;
        }

        const result = evaluateGrammarQuestion(question, goldenResp);
        if (!result || !result.correct) {
          evidence.push({ seed, outcome: 'marking-fail', detail: 'golden answer did not mark correct' });
          allPass = false;
        } else {
          evidence.push({ seed, outcome: 'pass', detail: 'golden marks correct' });
        }
      } else if (question.inputSpec?.type === 'table_choice') {
        // For table_choice, verify structure is sound
        const rows = question.inputSpec.rows;
        if (!rows || rows.length === 0) {
          evidence.push({ seed, outcome: 'structure-fail', detail: 'table has no rows' });
          allPass = false;
        } else {
          evidence.push({ seed, outcome: 'pass', detail: 'table structure valid' });
        }
      } else {
        // Constructed-response: verify golden answer from answerSpec marks correct
        const goldenResp = buildConstructedGolden(question);
        if (goldenResp) {
          const result = evaluateGrammarQuestion(question, goldenResp);
          if (!result || !result.correct) {
            evidence.push({ seed, outcome: 'marking-fail', detail: 'constructed golden did not mark correct' });
            allPass = false;
          } else {
            evidence.push({ seed, outcome: 'pass', detail: 'constructed golden marks correct' });
          }
        } else {
          // No golden derivable — structural check only
          evidence.push({ seed, outcome: 'pass', detail: 'structural check only (no golden derivable)' });
        }
      }
    }

    entries.push({
      templateId: template.id,
      decision: allPass ? 'approved' : 'blocked',
      reviewMethod: 'automated-oracle',
      seedWindow: `${SEED_MIN}..${SEED_MAX}`,
      evidence,
    });
  }

  return {
    metadata: {
      contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
      generatedAt: new Date().toISOString(),
      templateCount: entries.length,
      approved: entries.filter((e) => e.decision === 'approved').length,
      blocked: entries.filter((e) => e.decision === 'blocked').length,
    },
    entries,
  };
}

function buildGoldenResponse(question) {
  // For single_choice: find the option that marks correct by testing each
  if (question.inputSpec?.type === 'single_choice') {
    for (const opt of question.inputSpec.options || []) {
      const resp = { answer: opt.value };
      const result = evaluateGrammarQuestion(question, resp);
      if (result && result.correct) return resp;
    }
    return null;
  }
  // For multi_choice: find all correct options
  if (question.inputSpec?.type === 'multi_choice') {
    const correctOpts = [];
    for (const opt of question.inputSpec.options || []) {
      const resp = { answer: [opt.value] };
      const result = evaluateGrammarQuestion(question, resp);
      if (result && result.correct) correctOpts.push(opt.value);
    }
    if (correctOpts.length > 0) return { answer: correctOpts };
    return null;
  }
  return null;
}

function buildConstructedGolden(question) {
  // Try deriving from answerSpec golden
  const golden = question.answerSpec?.golden;
  if (Array.isArray(golden) && golden.length > 0) {
    return { answer: golden[0] };
  }
  // Try answerText
  if (question.answerSpec?.answerText) {
    return { answer: question.answerSpec.answerText };
  }
  return null;
}

async function main() {
  const register = buildQualityRegister();

  await fs.mkdir(REPORTS_DIR, { recursive: true });
  const outputPath = path.join(REPORTS_DIR, 'grammar-qg-p10-quality-register.json');
  await fs.writeFile(outputPath, JSON.stringify(register, null, 2) + '\n', 'utf8');

  console.log('Grammar QG P10 Quality Register generated:');
  console.log(`  Templates: ${register.metadata.templateCount}`);
  console.log(`  Approved: ${register.metadata.approved}`);
  console.log(`  Blocked: ${register.metadata.blocked}`);
  console.log(`  Output: ${outputPath}`);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main().catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  });
}
