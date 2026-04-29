#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

import {
  GRAMMAR_TEMPLATE_METADATA,
  GRAMMAR_CONTENT_RELEASE_ID,
  createGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(__dirname, '..', 'reports', 'grammar');

/**
 * Strip basic HTML tags for raw text comparison.
 */
function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, '').trim();
}

/**
 * Extract visible options or row labels from inputSpec.
 */
function extractVisibleOptionsOrRows(inputSpec) {
  if (!inputSpec) return [];
  if (Array.isArray(inputSpec.options)) {
    return inputSpec.options.map((o) => o.label || o.value || '');
  }
  if (Array.isArray(inputSpec.rows)) {
    return inputSpec.rows.map((r) => r.label || r.key || '');
  }
  if (Array.isArray(inputSpec.fields)) {
    return inputSpec.fields.map((f) => f.label || f.key || '');
  }
  return [];
}

/**
 * Parse a seed range string like "1..60" into an array of integers.
 */
function parseSeedRange(rangeStr) {
  if (rangeStr.includes('..')) {
    const [startStr, endStr] = rangeStr.split('..');
    const start = Number(startStr);
    const end = Number(endStr);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
      throw new Error(`Invalid seed range: ${rangeStr}`);
    }
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }
  return rangeStr.split(',').map(Number).filter(Number.isFinite);
}

/**
 * Build the full question inventory for given seeds.
 * Returns { items, redactedItems, summary }.
 */
export function buildInventory(seeds) {
  const items = [];

  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    for (const seed of seeds) {
      const question = createGrammarQuestion({ templateId: template.id, seed });
      if (!question) continue;

      const item = {
        contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
        templateId: template.id,
        seed,
        itemId: `${template.id}_${seed}`,
        conceptIds: template.skillIds || [],
        questionType: template.questionType || question.questionType || '',
        inputType: question.inputSpec?.type || '',
        isGenerated: template.generative || false,
        isMixedTransfer: (template.tags || []).includes('mixed-transfer'),
        answerSpecKind: question.answerSpec?.kind || 'none',
        marks: question.answerSpec?.maxScore || 0,
        promptText: stripHtml(question.stemHtml),
        visibleOptionsOrRows: extractVisibleOptionsOrRows(question.inputSpec),
        expectedAnswerSummary: question.answerSpec?.answerText || (question.answerSpec?.golden || [])[0] || '',
        misconceptionId: question.answerSpec?.misconception || '',
        solutionLines: question.solutionLines || [],
        variantSignature: question.variantSignature || '',
        generatorFamilyId: template.generatorFamilyId || template.id,
        reviewStatus: 'pending',
      };

      items.push(item);
    }
  }

  const redactedItems = items.map((item) => {
    const { answerSpecKind, expectedAnswerSummary, variantSignature, generatorFamilyId, solutionLines, ...rest } = item;
    return rest;
  });

  const templateIds = new Set(items.map((i) => i.templateId));

  return {
    items,
    redactedItems,
    summary: {
      totalItems: items.length,
      uniqueTemplates: templateIds.size,
      seeds: seeds.length,
      contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
    },
  };
}

/**
 * Format a markdown table from items.
 */
function toMarkdownTable(items) {
  if (items.length === 0) return '_No items generated._\n';

  const keys = Object.keys(items[0]);
  const header = `| ${keys.join(' | ')} |`;
  const separator = `| ${keys.map(() => '---').join(' | ')} |`;

  const rows = items.map((item) => {
    const cells = keys.map((k) => {
      const val = item[k];
      if (Array.isArray(val)) return val.join('; ');
      if (typeof val === 'boolean') return val ? 'Y' : 'N';
      return String(val ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    });
    return `| ${cells.join(' | ')} |`;
  });

  return [header, separator, ...rows].join('\n') + '\n';
}

async function writeReports(inventory) {
  await fs.mkdir(REPORTS_DIR, { recursive: true });

  const jsonPath = path.join(REPORTS_DIR, 'grammar-qg-p8-question-inventory.json');
  const mdPath = path.join(REPORTS_DIR, 'grammar-qg-p8-question-inventory.md');
  const redactedMdPath = path.join(REPORTS_DIR, 'grammar-qg-p8-question-inventory-redacted.md');

  // Full JSON
  await fs.writeFile(jsonPath, JSON.stringify(inventory.items, null, 2) + '\n', 'utf8');

  // Full markdown
  const mdContent = [
    `# Grammar QG P8 Question Inventory`,
    '',
    `Content Release: ${inventory.summary.contentReleaseId}`,
    `Total Items: ${inventory.summary.totalItems}`,
    `Unique Templates: ${inventory.summary.uniqueTemplates}`,
    `Seeds: ${inventory.summary.seeds}`,
    '',
    toMarkdownTable(inventory.items),
  ].join('\n');
  await fs.writeFile(mdPath, mdContent, 'utf8');

  // Redacted markdown
  const redactedMdContent = [
    `# Grammar QG P8 Question Inventory (Redacted)`,
    '',
    `Content Release: ${inventory.summary.contentReleaseId}`,
    `Total Items: ${inventory.summary.totalItems}`,
    `Unique Templates: ${inventory.summary.uniqueTemplates}`,
    `Seeds: ${inventory.summary.seeds}`,
    '',
    `_Redacted fields: answerSpecKind, expectedAnswerSummary, variantSignature, generatorFamilyId, solutionLines_`,
    '',
    toMarkdownTable(inventory.redactedItems),
  ].join('\n');
  await fs.writeFile(redactedMdPath, redactedMdContent, 'utf8');

  return { jsonPath, mdPath, redactedMdPath };
}

async function main(argv) {
  const seedArg = argv.find((arg) => arg.startsWith('--seeds='));
  const seeds = seedArg
    ? parseSeedRange(seedArg.slice('--seeds='.length))
    : Array.from({ length: 60 }, (_, i) => i + 1);

  const inventory = buildInventory(seeds);

  if (argv.includes('--json')) {
    console.log(JSON.stringify(inventory, null, 2));
  } else {
    const paths = await writeReports(inventory);
    console.log(`Grammar QG P8 Question Inventory generated:`);
    console.log(`  Total items: ${inventory.summary.totalItems}`);
    console.log(`  Unique templates: ${inventory.summary.uniqueTemplates}`);
    console.log(`  Seeds: ${inventory.summary.seeds}`);
    console.log(`  JSON: ${paths.jsonPath}`);
    console.log(`  Markdown: ${paths.mdPath}`);
    console.log(`  Redacted: ${paths.redactedMdPath}`);
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  });
}
