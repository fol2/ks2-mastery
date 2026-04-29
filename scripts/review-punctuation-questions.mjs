#!/usr/bin/env node

/**
 * Reviewer QA pack for punctuation questions.
 *
 * Produces a comprehensive human-readable markdown report (stdout) and/or
 * a JSON file for programmatic consumption.
 *
 * Usage:
 *   node scripts/review-punctuation-questions.mjs              # markdown to stdout
 *   node scripts/review-punctuation-questions.mjs --json       # JSON to stdout
 *   node scripts/review-punctuation-questions.mjs --out qa.json  # JSON to file
 */

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  PUNCTUATION_CONTENT_MANIFEST,
  createPunctuationContentIndexes,
} from '../shared/punctuation/content.js';
import {
  createPunctuationGeneratedItems,
  PRODUCTION_DEPTH,
} from '../shared/punctuation/generators.js';
import { markPunctuationAnswer } from '../shared/punctuation/marking.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normaliseForVariety(value) {
  return String(value ?? '')
    .replace(/ /g, ' ')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function validatorSummary(item) {
  if (!item.validator && !item.rubric) return '(none)';
  const parts = [];
  if (item.validator) {
    const type = item.validator.type || 'unknown';
    const facets = Array.isArray(item.validator.facets)
      ? item.validator.facets.map((f) => f.id || f.type || '?').join(', ')
      : '';
    parts.push(`validator: ${type}${facets ? ` [${facets}]` : ''}`);
  }
  if (item.rubric) {
    const type = item.rubric.type || 'unknown';
    parts.push(`rubric: ${type}`);
  }
  return parts.join('; ');
}

function markingResultSummary(result) {
  if (!result) return '(no result)';
  const parts = [`correct: ${result.correct}`];
  if (result.score != null) parts.push(`score: ${result.score}`);
  if (Array.isArray(result.facetResults) && result.facetResults.length) {
    const passed = result.facetResults.filter((f) => f.pass).length;
    parts.push(`facets: ${passed}/${result.facetResults.length} passed`);
  }
  if (Array.isArray(result.misconceptionTags) && result.misconceptionTags.length) {
    parts.push(`misconceptions: ${result.misconceptionTags.join(', ')}`);
  }
  return parts.join(' | ');
}

// ─── Build pool ──────────────────────────────────────────────────────────────

function buildProductionPool() {
  const indexes = createPunctuationContentIndexes(PUNCTUATION_CONTENT_MANIFEST);
  const fixedItems = indexes.items.map((item) => ({ ...item, _source: 'fixed' }));

  const generatedItems = createPunctuationGeneratedItems({
    manifest: PUNCTUATION_CONTENT_MANIFEST,
    seed: PUNCTUATION_CONTENT_MANIFEST.releaseId || 'punctuation',
    perFamily: PRODUCTION_DEPTH,
  }).map((item) => ({ ...item, _source: 'generated' }));

  return [...fixedItems, ...generatedItems];
}

// ─── Per-item QA entry ────────────────────────────────────────────────────────

function buildItemEntry(item) {
  const answer = item.mode === 'choose'
    ? { choiceIndex: item.correctIndex }
    : { typed: item.model || '' };

  let markingResult = null;
  try {
    markingResult = markPunctuationAnswer({ item, answer });
  } catch {
    markingResult = { correct: false, error: 'marking threw' };
  }

  return {
    id: item.id,
    source: item._source,
    skillIds: item.skillIds || [],
    rewardUnitId: item.rewardUnitId || '',
    mode: item.mode || '',
    prompt: item.prompt || '',
    stem: item.stem || '',
    model: item.model || '',
    accepted: item.accepted || [],
    explanation: item.explanation || '',
    validatorSummary: validatorSummary(item),
    misconceptionTags: item.misconceptionTags || [],
    markingResult,
    markingResultSummary: markingResultSummary(markingResult),
    ...(item._source === 'generated' ? {
      templateId: item.templateId || '',
      variantSignature: item.variantSignature || '',
      generatorFamilyId: item.generatorFamilyId || '',
    } : {}),
  };
}

// ─── Perceived-variety analysis ───────────────────────────────────────────────

function buildVarietyClusters(pool) {
  const stemGroups = new Map();
  const modelGroups = new Map();

  for (const item of pool) {
    const normStem = normaliseForVariety(item.stem);
    const normModel = normaliseForVariety(item.model);

    if (normStem) {
      if (!stemGroups.has(normStem)) stemGroups.set(normStem, []);
      stemGroups.get(normStem).push(item);
    }
    if (normModel) {
      if (!modelGroups.has(normModel)) modelGroups.set(normModel, []);
      modelGroups.get(normModel).push(item);
    }
  }

  const clusters = [];

  for (const [normText, items] of stemGroups) {
    if (items.length < 2) continue;
    const modes = [...new Set(items.map((i) => i.mode))].sort();
    const isSameMode = modes.length === 1 && items.length > 1;
    const isCrossMode = modes.length > 1;
    clusters.push({
      type: 'stem',
      normalisedText: normText,
      modes,
      itemIds: items.map((i) => i.id).sort(),
      count: items.length,
      classification: isSameMode ? 'SAME-MODE-DUPLICATE' : 'CROSS-MODE-OVERLAP',
      sampleStem: items[0].stem || '',
    });
  }

  for (const [normText, items] of modelGroups) {
    if (items.length < 2) continue;
    const modes = [...new Set(items.map((i) => i.mode))].sort();
    const isSameMode = modes.length === 1 && items.length > 1;
    clusters.push({
      type: 'model',
      normalisedText: normText,
      modes,
      itemIds: items.map((i) => i.id).sort(),
      count: items.length,
      classification: isSameMode ? 'SAME-MODE-DUPLICATE' : 'CROSS-MODE-OVERLAP',
      sampleModel: items[0].model || '',
    });
  }

  clusters.sort((a, b) => b.count - a.count || a.normalisedText.localeCompare(b.normalisedText));
  return clusters;
}

// ─── Markdown formatting ──────────────────────────────────────────────────────

function formatMarkdown(entries, clusters, meta) {
  const lines = [];

  lines.push('# Punctuation Reviewer QA Pack');
  lines.push('');
  lines.push(`Generated: ${meta.date}`);
  lines.push(`Production depth: ${meta.depth}`);
  lines.push(`Total items: ${meta.totalItems} (fixed: ${meta.fixedCount}, generated: ${meta.generatedCount})`);
  lines.push('');

  // ─── Per-item catalogue ─────────────────────────────────────────────────────
  lines.push('## Item Catalogue');
  lines.push('');

  for (const entry of entries) {
    lines.push(`### ${entry.id}`);
    lines.push('');
    lines.push(`- **Source:** ${entry.source}`);
    lines.push(`- **Mode:** ${entry.mode}`);
    lines.push(`- **Skills:** ${entry.skillIds.join(', ')}`);
    lines.push(`- **Reward unit:** ${entry.rewardUnitId}`);
    lines.push(`- **Prompt:** ${entry.prompt}`);
    if (entry.stem) lines.push(`- **Stem:** ${entry.stem}`);
    lines.push(`- **Model answer:** ${entry.model}`);
    if (entry.accepted.length > 1) {
      lines.push(`- **Accepted alternatives:** ${entry.accepted.filter((a) => a !== entry.model).join(' | ')}`);
    }
    lines.push(`- **Explanation:** ${entry.explanation}`);
    lines.push(`- **Validator/rubric:** ${entry.validatorSummary}`);
    if (entry.misconceptionTags.length) {
      lines.push(`- **Misconception tags:** ${entry.misconceptionTags.join(', ')}`);
    }
    lines.push(`- **Marking result:** ${entry.markingResultSummary}`);
    if (entry.templateId) {
      lines.push(`- **Template ID:** ${entry.templateId}`);
      lines.push(`- **Variant signature:** ${entry.variantSignature}`);
      lines.push(`- **Generator family:** ${entry.generatorFamilyId}`);
    }
    lines.push('');
  }

  // ─── Perceived-variety report ───────────────────────────────────────────────
  lines.push('## Perceived-Variety Report');
  lines.push('');

  const sameModeClusters = clusters.filter((c) => c.classification === 'SAME-MODE-DUPLICATE');
  const crossModeClusters = clusters.filter((c) => c.classification === 'CROSS-MODE-OVERLAP');

  lines.push(`Same-mode duplicate clusters: ${sameModeClusters.length}`);
  lines.push(`Cross-mode overlap clusters: ${crossModeClusters.length}`);
  lines.push('');

  if (sameModeClusters.length) {
    lines.push('### Same-Mode Duplicates (potential bugs)');
    lines.push('');
    for (const cluster of sameModeClusters) {
      const sample = cluster.sampleStem || cluster.sampleModel || cluster.normalisedText;
      lines.push(`- **[${cluster.type}]** "${sample}" (mode=${cluster.modes[0]}, ${cluster.count} items)`);
      lines.push(`  Items: ${cluster.itemIds.join(', ')}`);
    }
    lines.push('');
  }

  if (crossModeClusters.length) {
    lines.push('### Cross-Mode Overlaps (reviewer decision)');
    lines.push('');
    for (const cluster of crossModeClusters) {
      const sample = cluster.sampleStem || cluster.sampleModel || cluster.normalisedText;
      lines.push(`- **[${cluster.type}]** "${sample}" (modes=${cluster.modes.join(',')}, ${cluster.count} items)`);
      lines.push(`  Items: ${cluster.itemIds.join(', ')}`);
    }
    lines.push('');
  }

  if (!sameModeClusters.length && !crossModeClusters.length) {
    lines.push('No variety clusters detected — all items have unique stems and models.');
    lines.push('');
  }

  return lines.join('\n');
}

// ─── JSON output ──────────────────────────────────────────────────────────────

function buildJsonOutput(entries, clusters, meta) {
  return {
    _meta: meta,
    items: entries,
    perceivedVariety: {
      totalClusters: clusters.length,
      sameModeCount: clusters.filter((c) => c.classification === 'SAME-MODE-DUPLICATE').length,
      crossModeCount: clusters.filter((c) => c.classification === 'CROSS-MODE-OVERLAP').length,
      clusters,
    },
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = new Set(argv);
  const outIndex = argv.indexOf('--out');
  const outPath = outIndex >= 0 && outIndex + 1 < argv.length ? argv[outIndex + 1] : null;
  return {
    json: args.has('--json'),
    outPath,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const pool = buildProductionPool();
  const entries = pool.map(buildItemEntry);
  const clusters = buildVarietyClusters(pool);

  const meta = {
    generated: new Date().toISOString().slice(0, 10),
    date: new Date().toISOString().slice(0, 10),
    depth: PRODUCTION_DEPTH,
    totalItems: pool.length,
    fixedCount: pool.filter((i) => i._source === 'fixed').length,
    generatedCount: pool.filter((i) => i._source === 'generated').length,
    items_reviewed: pool.length,
  };

  if (args.json || args.outPath) {
    const json = JSON.stringify(buildJsonOutput(entries, clusters, meta), null, 2);
    if (args.outPath) {
      writeFileSync(args.outPath, json + '\n', 'utf8');
      process.stderr.write(`QA pack written to ${args.outPath}\n`);
    } else {
      process.stdout.write(json + '\n');
    }
  } else {
    process.stdout.write(formatMarkdown(entries, clusters, meta));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export { buildProductionPool, buildItemEntry, buildVarietyClusters, normaliseForVariety };
