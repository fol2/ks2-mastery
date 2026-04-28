#!/usr/bin/env node

/**
 * CLI preview tool for punctuation generated template variants.
 *
 * Usage:
 *   node scripts/preview-punctuation-templates.mjs --family <familyId> [--variants N] [--json]
 *   node scripts/preview-punctuation-templates.mjs --all [--variants N] [--json]
 */

import { pathToFileURL } from 'node:url';

import {
  PUNCTUATION_CONTENT_MANIFEST,
  createPunctuationContentIndexes,
} from '../shared/punctuation/content.js';
import {
  createPunctuationGeneratedItems,
  GENERATED_TEMPLATE_BANK,
} from '../shared/punctuation/generators.js';
import { markPunctuationAnswer } from '../shared/punctuation/marking.js';

// ─── Argument parsing ─────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = new Set(argv);
  const valueAfter = (name) => {
    const index = argv.indexOf(name);
    if (index < 0) return undefined;
    if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) return undefined;
    return argv[index + 1];
  };

  const familyId = valueAfter('--family') || null;
  const all = args.has('--all');
  const json = args.has('--json');
  const variantsRaw = valueAfter('--variants');
  const variants = variantsRaw !== undefined ? Number(variantsRaw) : 4;

  if (!familyId && !all) {
    return { error: 'Provide --family <familyId> or --all.' };
  }
  if (!Number.isFinite(variants) || variants < 0) {
    return { error: `Invalid --variants value: "${variantsRaw}".` };
  }

  return { familyId, all, json, variants, error: null };
}

// ─── Golden test runner ───────────────────────────────────────────────────────

function normaliseForMatch(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function runGoldenTests(item) {
  const familyId = item.generatorFamilyId;
  const templates = GENERATED_TEMPLATE_BANK[familyId];
  if (!templates || !Array.isArray(templates)) return null;

  // Match by templateId first; fall back to stem+model content matching
  // (DSL families with embedTemplateId: false lack templateId on templates)
  const template = templates.find((t) => t.templateId === item.templateId)
    || templates.find((t) =>
      normaliseForMatch(t.stem) === normaliseForMatch(item.stem)
      && normaliseForMatch(t.model) === normaliseForMatch(item.model));
  if (!template || !template.tests) return null;

  const results = { accept: [], reject: [], allPassed: true };

  for (const acceptCase of (template.tests.accept || [])) {
    const result = markPunctuationAnswer({ item, answer: { typed: acceptCase } });
    const passed = result.correct === true;
    results.accept.push({ input: acceptCase, passed, detail: result });
    if (!passed) results.allPassed = false;
  }

  for (const rejectCase of (template.tests.reject || [])) {
    const result = markPunctuationAnswer({ item, answer: { typed: rejectCase } });
    const passed = result.correct === false;
    results.reject.push({ input: rejectCase, passed, detail: result });
    if (!passed) results.allPassed = false;
  }

  return results;
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function formatHumanReadable(items, goldenResults) {
  const lines = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const golden = goldenResults[i];

    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push(`  Item ID:            ${item.id}`);
    lines.push(`  Family ID:          ${item.generatorFamilyId}`);
    lines.push(`  Template ID:        ${item.templateId}`);
    lines.push(`  Variant Signature:  ${item.variantSignature}`);
    lines.push(`  Mode:               ${item.mode}`);
    lines.push(`  Skill IDs:          ${(item.skillIds || []).join(', ')}`);
    lines.push(`  Cluster ID:         ${item.clusterId}`);
    lines.push(`  Prompt:             ${item.prompt}`);
    lines.push(`  Stem:               ${(item.stem || '').replace(/\n/g, '\\n')}`);
    lines.push(`  Model Answer:       ${(item.model || '').replace(/\n/g, '\\n')}`);
    lines.push(`  Validator Type:     ${item.validator?.type || '(none)'}`);
    lines.push(`  Rubric Type:        ${item.rubric?.type || '(none)'}`);
    lines.push(`  Misconception Tags: ${(item.misconceptionTags || []).join(', ') || '(none)'}`);
    lines.push(`  Readiness Tags:     ${(item.readiness || []).join(', ') || '(none)'}`);

    if (golden) {
      const status = golden.allPassed ? 'ALL PASSED' : 'FAILURES DETECTED';
      lines.push(`  Golden Tests:       ${status}`);
      if (golden.accept.length) {
        lines.push('    Accept cases:');
        for (const c of golden.accept) {
          const mark = c.passed ? 'PASS' : 'FAIL';
          lines.push(`      [${mark}] "${c.input.replace(/\n/g, '\\n')}"`);
        }
      }
      if (golden.reject.length) {
        lines.push('    Reject cases:');
        for (const c of golden.reject) {
          const mark = c.passed ? 'PASS' : 'FAIL';
          lines.push(`      [${mark}] "${c.input.replace(/\n/g, '\\n')}"`);
        }
      }
    } else {
      lines.push('  Golden Tests:       (no tests on template)');
    }
    lines.push('');
  }
  return lines.join('\n');
}

function buildJsonOutput(items, goldenResults) {
  return items.map((item, i) => {
    const golden = goldenResults[i];
    return {
      id: item.id,
      generatorFamilyId: item.generatorFamilyId,
      templateId: item.templateId,
      variantSignature: item.variantSignature,
      mode: item.mode,
      skillIds: item.skillIds || [],
      clusterId: item.clusterId,
      prompt: item.prompt,
      stem: item.stem,
      model: item.model,
      validatorType: item.validator?.type || null,
      rubricType: item.rubric?.type || null,
      misconceptionTags: item.misconceptionTags || [],
      readiness: item.readiness || [],
      goldenTests: golden
        ? {
            allPassed: golden.allPassed,
            accept: golden.accept.map((c) => ({ input: c.input, passed: c.passed })),
            reject: golden.reject.map((c) => ({ input: c.input, passed: c.passed })),
          }
        : null,
    };
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function previewPunctuationTemplates({ familyId, all, variants, json }) {
  const indexes = createPunctuationContentIndexes(PUNCTUATION_CONTENT_MANIFEST);
  const validFamilyIds = indexes.generatorFamilies.map((f) => f.id).sort();

  // Validate family ID
  if (familyId && !validFamilyIds.includes(familyId)) {
    const message = `Unknown family ID: "${familyId}".\n\nValid family IDs:\n${validFamilyIds.map((id) => `  - ${id}`).join('\n')}\n`;
    return { error: message, items: [], exitCode: 1 };
  }

  // Generate items
  const generatedItems = createPunctuationGeneratedItems({
    manifest: PUNCTUATION_CONTENT_MANIFEST,
    seed: 'preview-cli',
    perFamily: variants,
  });

  // Filter to requested family
  const items = all
    ? generatedItems
    : generatedItems.filter((item) => item.generatorFamilyId === familyId);

  // Run golden tests
  const goldenResults = items.map((item) => runGoldenTests(item));
  const anyGoldenFailure = goldenResults.some((r) => r && !r.allPassed);

  // Format output
  const output = json
    ? JSON.stringify(buildJsonOutput(items, goldenResults), null, 2)
    : formatHumanReadable(items, goldenResults);

  return {
    error: null,
    items,
    output,
    exitCode: anyGoldenFailure ? 1 : 0,
  };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.error) {
    process.stderr.write(`Error: ${parsed.error}\n`);
    process.exitCode = 1;
    return;
  }

  const result = previewPunctuationTemplates({
    familyId: parsed.familyId,
    all: parsed.all,
    variants: parsed.variants,
    json: parsed.json,
  });

  if (result.error) {
    process.stderr.write(result.error);
    process.exitCode = result.exitCode;
    return;
  }

  if (result.output) {
    process.stdout.write(`${result.output}\n`);
  }
  process.exitCode = result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
