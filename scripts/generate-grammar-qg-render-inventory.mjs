#!/usr/bin/env node
/**
 * Grammar QG P10 U1 — Render Inventory
 *
 * For each of 78 templates x seeds 1..30 (2,340 items), generates the full
 * render surface (createGrammarQuestion + serialiseGrammarQuestion) and writes:
 * - reports/grammar/grammar-qg-p10-render-inventory.json (full, includes answer internals)
 * - reports/grammar/grammar-qg-p10-render-inventory-redacted.md (strips answers)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

import {
  GRAMMAR_TEMPLATE_METADATA,
  GRAMMAR_CONTENT_RELEASE_ID,
  createGrammarQuestion,
  serialiseGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(__dirname, '..', 'reports', 'grammar');

const SEED_MIN = 1;
const SEED_MAX = 30;

export function buildRenderInventory() {
  const items = [];

  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    for (let seed = SEED_MIN; seed <= SEED_MAX; seed++) {
      const question = createGrammarQuestion({ templateId: template.id, seed });
      if (!question) continue;

      const serialised = serialiseGrammarQuestion(question);
      if (!serialised) continue;

      items.push({
        contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
        templateId: template.id,
        seed,
        conceptIds: serialised.skillIds || [],
        inputType: serialised.inputSpec?.type || '',
        promptText: serialised.promptText || '',
        promptParts: serialised.promptParts || null,
        focusCue: serialised.focusCue || null,
        screenReaderPromptText: serialised.screenReaderPromptText || null,
        readAloudText: serialised.readAloudText || null,
        inputSpecSummary: summariseInputSpec(serialised.inputSpec),
        certificationStatus: 'approved',
        // answer internals (stripped in redacted output)
        _solutionLines: serialised.solutionLines || [],
        _answerSpec: question.answerSpec || null,
      });
    }
  }

  return {
    metadata: {
      contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
      generatedAt: new Date().toISOString(),
      templateCount: GRAMMAR_TEMPLATE_METADATA.length,
      seedRange: `${SEED_MIN}..${SEED_MAX}`,
      totalItems: items.length,
    },
    items,
  };
}

function summariseInputSpec(inputSpec) {
  if (!inputSpec) return 'none';
  const type = inputSpec.type || 'unknown';
  if (type === 'single_choice' && Array.isArray(inputSpec.options)) {
    return `single_choice(${inputSpec.options.length} options)`;
  }
  if (type === 'multi_choice' && Array.isArray(inputSpec.options)) {
    return `multi_choice(${inputSpec.options.length} options)`;
  }
  if (type === 'table_choice' && Array.isArray(inputSpec.rows)) {
    return `table_choice(${inputSpec.rows.length} rows)`;
  }
  if (type === 'textarea' || type === 'text') {
    return type;
  }
  return type;
}

function redactItem(item) {
  const { _solutionLines, _answerSpec, ...redacted } = item;
  return redacted;
}

async function writeReports(inventory) {
  await fs.mkdir(REPORTS_DIR, { recursive: true });

  const jsonPath = path.join(REPORTS_DIR, 'grammar-qg-p10-render-inventory.json');
  await fs.writeFile(jsonPath, JSON.stringify(inventory, null, 2) + '\n', 'utf8');

  // Redacted markdown
  const redacted = inventory.items.map(redactItem);
  const mdLines = [
    '# Grammar QG P10 Render Inventory (Redacted)',
    '',
    `Content Release: ${inventory.metadata.contentReleaseId}`,
    `Total Items: ${inventory.metadata.totalItems}`,
    `Templates: ${inventory.metadata.templateCount}`,
    `Seed Range: ${inventory.metadata.seedRange}`,
    `Generated: ${inventory.metadata.generatedAt}`,
    '',
    '_Answer internals stripped from this report._',
    '',
    `| templateId | seed | inputType | focusCue | promptText (truncated) |`,
    `| --- | --- | --- | --- | --- |`,
  ];

  for (const item of redacted) {
    const cue = item.focusCue ? `${item.focusCue.type}: ${item.focusCue.text}` : '-';
    const prompt = (item.promptText || '').slice(0, 60).replace(/\|/g, '\\|').replace(/\n/g, ' ');
    mdLines.push(`| ${item.templateId} | ${item.seed} | ${item.inputType} | ${cue} | ${prompt} |`);
  }

  const redactedMdPath = path.join(REPORTS_DIR, 'grammar-qg-p10-render-inventory-redacted.md');
  await fs.writeFile(redactedMdPath, mdLines.join('\n') + '\n', 'utf8');

  return { jsonPath, redactedMdPath };
}

async function main() {
  const inventory = buildRenderInventory();
  const paths = await writeReports(inventory);

  console.log('Grammar QG P10 Render Inventory generated:');
  console.log(`  Total items: ${inventory.metadata.totalItems}`);
  console.log(`  Templates: ${inventory.metadata.templateCount}`);
  console.log(`  Seed range: ${inventory.metadata.seedRange}`);
  console.log(`  JSON: ${paths.jsonPath}`);
  console.log(`  Redacted MD: ${paths.redactedMdPath}`);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main().catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  });
}
