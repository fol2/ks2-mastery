#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  GRAMMAR_TEMPLATE_METADATA,
  createGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';

function parseSeeds(arg = '1..30') {
  const match = String(arg).match(/^(\d+)\.\.(\d+)$/);
  if (match) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }
  return String(arg).split(',').map(Number).filter(Number.isInteger);
}

// Predicate kept in sync with scripts/generate-grammar-manual-expansion.mjs
// OPEN_PROMPT_RE. P19a hotfix expanded the verb list after adversarial review
// surfaced 29 templates whose prompts started with Combine/Correct/Copy/
// Insert/Edit/Fix/Punctuate/Expand/Change/Type and were silently exempted.
// Bare add/move/join now match "Add a hyphen", "Add commas", etc.
// Contract A.1 says "or similar open task".
function isOpenPrompt(prompt) {
  return /\b(explain|transfer|write\s+(?:the|an?|one|a\s+sentence)|rewrite|build|mixed\s+check|add|move|join|describe|complete\s+the\s+sentence|continue|extend|combine|correct|copy|insert|edit|fix|punctuate|expand|change|type|repair|reorder)\b/i.test(prompt || '');
}

export function buildOpenResponseFairnessAudit(seeds = parseSeeds()) {
  const findings = [];
  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    for (const seed of seeds) {
      const question = createGrammarQuestion({ templateId: template.id, seed });
      if (!question) continue;
      const inputType = question.inputSpec?.type;
      const kind = question.answerSpec?.kind;
      const prompt = String(question.stemHtml || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const acceptedCount = Array.isArray(question.answerSpec?.golden) ? question.answerSpec.golden.length : 0;
      const nearMissCount = Array.isArray(question.answerSpec?.nearMiss) ? question.answerSpec.nearMiss.length : 0;
      if (
        ['text', 'textarea'].includes(inputType)
        && ['normalisedText', 'acceptedSet'].includes(kind)
        && isOpenPrompt(prompt)
        && acceptedCount < 3
        && question.answerSpec?.manualReviewOnly !== true
      ) {
        findings.push({ templateId: template.id, seed, inputType, kind, acceptedCount, nearMissCount, prompt });
      }
    }
  }
  return { passed: findings.length === 0, findingCount: findings.length, findings };
}

async function main(argv) {
  const seedArg = argv.find((arg) => arg.startsWith('--seeds='));
  const outArg = argv.find((arg) => arg.startsWith('--out='));
  const seeds = parseSeeds(seedArg ? seedArg.slice('--seeds='.length) : '1..30');
  const audit = buildOpenResponseFairnessAudit(seeds);
  const json = JSON.stringify(audit, null, 2);
  if (outArg) {
    const outPath = path.resolve(outArg.slice('--out='.length));
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, json + '\n', 'utf8');
    console.log(`Open-response fairness audit: ${audit.passed ? 'PASS' : 'FAIL'} (${audit.findingCount} findings) -> ${outPath}`);
  } else {
    console.log(json);
  }
  if (!audit.passed) process.exit(1);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  });
}
