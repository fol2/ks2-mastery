#!/usr/bin/env node
/**
 * Grammar QG P10 U1+U6 — Render Inventory (Enriched)
 *
 * For each of 78 templates x seeds 1..30 (2,340 items), generates the full
 * render surface (createGrammarQuestion + serialiseGrammarQuestion) and writes:
 * - reports/grammar/grammar-qg-p10-render-inventory.json (full, includes answer internals)
 * - reports/grammar/grammar-qg-p10-render-inventory.md (full markdown for adult review)
 * - reports/grammar/grammar-qg-p10-render-inventory-redacted.md (strips answers)
 *
 * U6 enrichment adds: visibleOptions, rowSpecificOptions, fullSpeechOutput, _feedbackSummary
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

import {
  GRAMMAR_TEMPLATE_METADATA,
  GRAMMAR_CONTENT_RELEASE_ID,
  createGrammarQuestion,
  serialiseGrammarQuestion,
  evaluateGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';

import { buildGrammarSpeechText } from '../src/subjects/grammar/speech.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(__dirname, '..', 'reports', 'grammar');

const SEED_MIN = 1;
const SEED_MAX = 30;

// ---------------------------------------------------------------------------
// U6: Visible options extraction
// ---------------------------------------------------------------------------

function extractOptionLabel(option) {
  if (Array.isArray(option)) return String(option[1] ?? option[0] ?? '');
  return String(option?.label ?? option?.value ?? '');
}

function extractVisibleOptions(inputSpec) {
  if (!inputSpec || typeof inputSpec !== 'object') return null;

  const type = inputSpec.type;

  if (type === 'single_choice' || type === 'checkbox_list') {
    const options = Array.isArray(inputSpec.options) ? inputSpec.options : [];
    return options.map(extractOptionLabel).filter(Boolean);
  }

  if (type === 'table_choice') {
    const rows = Array.isArray(inputSpec.rows) ? inputSpec.rows : [];
    return rows.map((row) => ({
      rowLabel: String(row?.label ?? row?.key ?? ''),
      options: Array.isArray(row?.options)
        ? row.options.map(extractOptionLabel).filter(Boolean)
        : (Array.isArray(inputSpec.columns) ? inputSpec.columns.map(String) : []),
    }));
  }

  if (type === 'text' || type === 'textarea') {
    const placeholder = inputSpec.placeholder ? String(inputSpec.placeholder) : null;
    return placeholder ? { placeholder } : null;
  }

  if (type === 'multi') {
    const fields = Array.isArray(inputSpec.fields) ? inputSpec.fields : [];
    return fields.map((field) => ({
      label: String(field?.label ?? ''),
      options: Array.isArray(field?.options)
        ? field.options.map(extractOptionLabel).filter(Boolean)
        : [],
    }));
  }

  return null;
}

// ---------------------------------------------------------------------------
// U6: Row-specific options (heterogeneous table_choice only)
// ---------------------------------------------------------------------------

function extractRowSpecificOptions(inputSpec) {
  if (!inputSpec || inputSpec.type !== 'table_choice') return null;
  const rows = Array.isArray(inputSpec.rows) ? inputSpec.rows : [];
  const hasRowOptions = rows.some((row) => Array.isArray(row?.options) && row.options.length > 0);
  if (!hasRowOptions) return null;
  return rows.map((row) => ({
    rowLabel: String(row?.label ?? row?.key ?? ''),
    options: Array.isArray(row?.options) ? row.options.map(extractOptionLabel).filter(Boolean) : [],
  }));
}

// ---------------------------------------------------------------------------
// U6: Full speech output
// ---------------------------------------------------------------------------

function buildFullSpeechOutput(serialised) {
  return buildGrammarSpeechText({
    session: {
      type: 'practice',
      currentItem: serialised,
      supportGuidance: null,
    },
    feedback: null,
  });
}

// ---------------------------------------------------------------------------
// U6: Feedback summary (evaluate with correct answer)
// ---------------------------------------------------------------------------

function extractFeedbackSummary(question) {
  if (!question || typeof question.evaluate !== 'function') return null;

  // Evaluate with an empty response — the feedbackLong field will reveal
  // the correct answer (e.g., "The correct answer is: X") which is what
  // we want for the adult review report.
  const result = evaluateGrammarQuestion(question, {});
  if (!result) return null;

  return {
    feedbackShort: result.feedbackShort || null,
    feedbackLong: result.feedbackLong || null,
    answerText: result.answerText || null,
  };
}

export function buildRenderInventory() {
  const items = [];

  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    for (let seed = SEED_MIN; seed <= SEED_MAX; seed++) {
      const question = createGrammarQuestion({ templateId: template.id, seed });
      if (!question) continue;

      const serialised = serialiseGrammarQuestion(question);
      if (!serialised) continue;

      const inputSpec = serialised.inputSpec || null;

      items.push({
        contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
        templateId: template.id,
        seed,
        conceptIds: serialised.skillIds || [],
        inputType: inputSpec?.type || '',
        promptText: serialised.promptText || '',
        promptParts: serialised.promptParts || null,
        focusCue: serialised.focusCue || null,
        screenReaderPromptText: serialised.screenReaderPromptText || null,
        readAloudText: serialised.readAloudText || null,
        inputSpecSummary: summariseInputSpec(inputSpec),
        // U6 enrichment fields
        visibleOptions: extractVisibleOptions(inputSpec),
        rowSpecificOptions: extractRowSpecificOptions(inputSpec),
        fullSpeechOutput: buildFullSpeechOutput(serialised),
        certificationStatus: 'approved',
        // answer internals (stripped in redacted output)
        _solutionLines: serialised.solutionLines || [],
        _answerSpec: question.answerSpec || null,
        _feedbackSummary: extractFeedbackSummary(question),
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

  // Full markdown (non-redacted — for adult review, includes answers)
  const fullMdPath = path.join(REPORTS_DIR, 'grammar-qg-p10-render-inventory.md');
  await fs.writeFile(fullMdPath, buildFullMarkdown(inventory) + '\n', 'utf8');

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

  return { jsonPath, fullMdPath, redactedMdPath };
}

function buildFullMarkdown(inventory) {
  const lines = [
    '# Grammar QG P10 Render Inventory',
    '',
    `Content Release: ${inventory.metadata.contentReleaseId}`,
    `Total Items: ${inventory.metadata.totalItems}`,
    `Templates: ${inventory.metadata.templateCount}`,
    `Seed Range: ${inventory.metadata.seedRange}`,
    `Generated: ${inventory.metadata.generatedAt}`,
    '',
    '_This report includes answer internals and is for adult review only._',
    '',
    `| templateId | seed | inputType | visibleOptions (summary) | speechOutput (truncated) | feedbackLong |`,
    `| --- | --- | --- | --- | --- | --- |`,
  ];

  for (const item of inventory.items) {
    const optsSummary = formatVisibleOptionsSummary(item.visibleOptions);
    const speech = (item.fullSpeechOutput || '').slice(0, 50).replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const feedback = (item._feedbackSummary?.feedbackLong || '-').slice(0, 60).replace(/\|/g, '\\|').replace(/\n/g, ' ');
    lines.push(`| ${item.templateId} | ${item.seed} | ${item.inputType} | ${optsSummary} | ${speech} | ${feedback} |`);
  }

  return lines.join('\n');
}

function formatVisibleOptionsSummary(visibleOptions) {
  if (!visibleOptions) return '-';
  if (Array.isArray(visibleOptions)) {
    if (visibleOptions.length === 0) return '-';
    // For flat arrays (single_choice/checkbox_list string arrays)
    if (typeof visibleOptions[0] === 'string') {
      return visibleOptions.slice(0, 4).join(', ').slice(0, 40).replace(/\|/g, '\\|');
    }
    // For table_choice or multi arrays of objects
    return `${visibleOptions.length} rows/fields`;
  }
  if (typeof visibleOptions === 'object' && visibleOptions.placeholder) {
    return `placeholder: ${visibleOptions.placeholder}`.slice(0, 40).replace(/\|/g, '\\|');
  }
  return '-';
}

async function main() {
  const inventory = buildRenderInventory();
  const paths = await writeReports(inventory);

  console.log('Grammar QG P10 Render Inventory generated (enriched U6):');
  console.log(`  Total items: ${inventory.metadata.totalItems}`);
  console.log(`  Templates: ${inventory.metadata.templateCount}`);
  console.log(`  Seed range: ${inventory.metadata.seedRange}`);
  console.log(`  JSON: ${paths.jsonPath}`);
  console.log(`  Full MD: ${paths.fullMdPath}`);
  console.log(`  Redacted MD: ${paths.redactedMdPath}`);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main().catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  });
}
