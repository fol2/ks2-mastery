#!/usr/bin/env node
/**
 * Grammar QG P6 — Reviewer Sample Pack Generator
 *
 * Produces a deterministic reviewer-friendly markdown document showing
 * sample prompts (without answer keys) for each generated template family,
 * with a separate Reviewer Answer Appendix at the bottom.
 *
 * Usage:  node scripts/generate-grammar-review-pack.mjs [options]
 *
 * Options:
 *   --family=<familyId>       Only generate for matching family
 *   --template=<templateId>   Only generate for matching template
 *   --max-samples=<N>         Limit samples per family (default: 5)
 *   --seed-window=<start>-<end>  Override seed range (default: 1-30)
 *
 * Output: reports/grammar/grammar-qg-p6-review-pack-<commitSha7>.md
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GRAMMAR_TEMPLATE_METADATA,
  GRAMMAR_CONTENT_RELEASE_ID,
  createGrammarQuestion,
  grammarQuestionVariantSignature,
} from '../worker/src/subjects/grammar/content.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'reports', 'grammar');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseCliArgs(argv = process.argv.slice(2)) {
  const opts = {
    family: null,
    template: null,
    maxSamples: 5,
    seedWindowStart: 1,
    seedWindowEnd: 30,
  };
  for (const arg of argv) {
    const match = arg.match(/^--([a-z-]+)=(.+)$/);
    if (!match) continue;
    const [, key, value] = match;
    switch (key) {
      case 'family':
        opts.family = value;
        break;
      case 'template':
        opts.template = value;
        break;
      case 'max-samples':
        opts.maxSamples = Math.max(1, parseInt(value, 10) || 5);
        break;
      case 'seed-window': {
        const parts = value.split('-').map((s) => parseInt(s, 10));
        if (parts.length === 2 && parts[0] > 0 && parts[1] >= parts[0]) {
          opts.seedWindowStart = parts[0];
          opts.seedWindowEnd = parts[1];
        }
        break;
      }
    }
  }
  return opts;
}

const CLI_OPTS = parseCliArgs();
const SEED_WINDOW_START = CLI_OPTS.seedWindowStart;
const SEED_WINDOW_END = CLI_OPTS.seedWindowEnd;
const MAX_SAMPLE_PROMPTS = CLI_OPTS.maxSamples;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCommitSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function stripHtml(html) {
  if (!html) return '';
  return String(html)
    // Replace block-level tags with newlines BEFORE stripping other tags
    .replace(/<\/?(p|div|br)\s*\/?>/gi, '\n')
    // Strip remaining HTML tags
    .replace(/<[^>]*>/g, '')
    // Decode HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Collapse spaces within lines (but not newlines)
    .replace(/[^\S\n]+/g, ' ')
    // Collapse multiple consecutive newlines to double-newline (paragraph break)
    .replace(/\n{2,}/g, '\n\n')
    .trim();
}

function escapeMarkdown(text) {
  return String(text || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function formatOptions(inputSpec) {
  if (!inputSpec || !inputSpec.options) return '';
  const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  return inputSpec.options
    .map((opt, i) => `${labels[i] || String(i + 1)}) ${opt.label || opt.value || ''}`)
    .join(', ');
}

function extractCorrectAnswer(question) {
  // Use the evaluate function with an empty response to get answerText
  if (typeof question.evaluate === 'function') {
    try {
      const result = question.evaluate({});
      if (result && result.answerText) return result.answerText;
    } catch { /* fall through */ }
  }
  // Fallback: last solutionLine often contains the answer
  if (Array.isArray(question.solutionLines) && question.solutionLines.length > 0) {
    return stripHtml(question.solutionLines[question.solutionLines.length - 1]);
  }
  return '(see solution)';
}

// ---------------------------------------------------------------------------
// Core generation
// ---------------------------------------------------------------------------

function buildFamilies(opts = CLI_OPTS) {
  // Group templates by generatorFamilyId
  const familyMap = new Map();

  for (const meta of GRAMMAR_TEMPLATE_METADATA) {
    if (!meta.generative) continue;
    // CLI filter: --template
    if (opts.template && meta.id !== opts.template) continue;
    const familyId = meta.generatorFamilyId;
    if (!familyMap.has(familyId)) {
      familyMap.set(familyId, {
        familyId,
        templateIds: [],
        skillIds: new Set(),
        answerSpecKind: null,
        questionType: null,
        tags: new Set(),
      });
    }
    const family = familyMap.get(familyId);
    family.templateIds.push(meta.id);
    for (const s of meta.skillIds) family.skillIds.add(s);
    if (meta.answerSpecKind) family.answerSpecKind = meta.answerSpecKind;
    if (meta.questionType) family.questionType = meta.questionType;
    for (const t of meta.tags) family.tags.add(t);
  }

  let families = Array.from(familyMap.values())
    .map((f) => ({
      ...f,
      skillIds: Array.from(f.skillIds).sort(),
      templateIds: Array.from(new Set(f.templateIds)).sort(),
      tags: Array.from(f.tags).sort(),
    }))
    .sort((a, b) => a.familyId.localeCompare(b.familyId));

  // CLI filter: --family
  if (opts.family) {
    families = families.filter((f) => f.familyId === opts.family);
  }

  return families;
}

function generateFamilyData(family) {
  const primaryTemplateId = family.templateIds[0];
  const signatures = new Set();
  const samples = [];
  const answers = [];

  for (let seed = SEED_WINDOW_START; seed <= SEED_WINDOW_END; seed++) {
    const question = createGrammarQuestion({ templateId: primaryTemplateId, seed });
    if (!question) continue;

    const sig = grammarQuestionVariantSignature(question);
    signatures.add(sig || `seed-${seed}`);

    const correctAnswer = extractCorrectAnswer(question);
    answers.push({ seed, correctAnswer });

    // Collect distinct samples (by signature)
    if (samples.length < MAX_SAMPLE_PROMPTS) {
      const alreadySampled = samples.some(
        (s) => grammarQuestionVariantSignature(s.question) === sig
      );
      if (!alreadySampled) {
        samples.push({ seed, question });
      }
    }
  }

  return {
    uniqueVariants: signatures.size,
    samples,
    answers,
  };
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

function renderFamilySection(family, data) {
  const lines = [];
  lines.push(`## Family: ${family.familyId}`);
  lines.push('');
  lines.push(`- **Template ID(s):** ${family.templateIds.join(', ')}`);
  lines.push(`- **Skill IDs:** ${family.skillIds.join(', ')}`);
  lines.push(`- **Answer-spec kind:** ${family.answerSpecKind || 'inline'}`);
  lines.push(`- **Question type:** ${family.questionType || 'unknown'}`);
  lines.push(`- **Tags:** ${family.tags.join(', ') || 'none'}`);
  lines.push(`- **Unique variants (seeds 1..30):** ${data.uniqueVariants}`);
  lines.push('');
  lines.push('### Sample Prompts');
  lines.push('');

  for (const { seed, question } of data.samples) {
    lines.push(`#### Seed ${seed}`);
    lines.push(`**Question type:** ${question.questionType}`);
    // Render stem with paragraph breaks preserved
    const stemText = stripHtml(question.stemHtml);
    const stemLines = stemText.split('\n').filter((l) => l.trim());
    if (stemLines.length > 1) {
      lines.push(`**Stem:**`);
      lines.push('');
      for (const sl of stemLines) {
        lines.push(`> ${sl.trim()}`);
      }
    } else {
      lines.push(`**Stem:** ${stemLines[0] || ''}`);
    }
    if (question.inputSpec && question.inputSpec.options) {
      lines.push(`**Options:** ${formatOptions(question.inputSpec)}`);
    } else if (question.inputSpec && question.inputSpec.type) {
      lines.push(`**Input:** ${question.inputSpec.type} — ${question.inputSpec.label || ''}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function renderAnswerAppendix(families, familyDataMap) {
  const lines = [];
  lines.push('## Reviewer Answer Appendix');
  lines.push('');
  lines.push('> ⚠️ This section contains correct answers. Do not share with learners.');
  lines.push('');
  lines.push('| Family | Seed | Correct Answer |');
  lines.push('|---|---|---|');

  for (const family of families) {
    const data = familyDataMap.get(family.familyId);
    if (!data) continue;
    for (const { seed, correctAnswer } of data.answers) {
      lines.push(`| ${family.familyId} | ${seed} | ${escapeMarkdown(correctAnswer)} |`);
    }
  }

  return lines.join('\n');
}

function renderSummaryTable(families, familyDataMap) {
  const lines = [];
  lines.push('## Summary');
  lines.push('');
  lines.push('| Family | Template(s) | Concept(s) | AnswerSpec Kind | Unique Variants |');
  lines.push('|---|---|---|---|---|');
  for (const family of families) {
    const data = familyDataMap.get(family.familyId);
    if (!data) continue;
    const templates = family.templateIds.join(', ');
    const concepts = family.skillIds.join(', ');
    const kind = family.answerSpecKind || 'inline';
    const variants = data.uniqueVariants;
    lines.push(`| ${escapeMarkdown(family.familyId)} | ${escapeMarkdown(templates)} | ${escapeMarkdown(concepts)} | ${kind} | ${variants} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function renderDocument(families, familyDataMap, commitSha) {
  const lines = [];
  lines.push('# Grammar QG P6 — Reviewer Sample Pack');
  lines.push('');
  lines.push(`Generated from commit: ${commitSha}`);
  lines.push(`Release: ${GRAMMAR_CONTENT_RELEASE_ID}`);
  lines.push(`Seed window: ${SEED_WINDOW_START}..${SEED_WINDOW_END}`);
  lines.push(`Total generated families: ${families.length}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Summary table before family sections
  lines.push(renderSummaryTable(families, familyDataMap));
  lines.push('---');
  lines.push('');

  for (const family of families) {
    const data = familyDataMap.get(family.familyId);
    if (!data) continue;
    lines.push(renderFamilySection(family, data));
    lines.push('---');
    lines.push('');
  }

  lines.push(renderAnswerAppendix(families, familyDataMap));
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const commitSha = getCommitSha();
  const commitSha7 = commitSha.slice(0, 7);
  const outputFile = path.join(OUTPUT_DIR, `grammar-qg-p6-review-pack-${commitSha7}.md`);
  const families = buildFamilies();

  const familyDataMap = new Map();
  for (const family of families) {
    familyDataMap.set(family.familyId, generateFamilyData(family));
  }

  const markdown = renderDocument(families, familyDataMap, commitSha);

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(outputFile, markdown, 'utf8');

  // Summary
  const totalFamilies = families.length;
  const p6Families = families.filter((f) => f.tags.includes('qg-p6')).length;
  console.log(`Grammar QG P6 Review Pack generated.`);
  console.log(`  Commit: ${commitSha}`);
  console.log(`  Release: ${GRAMMAR_CONTENT_RELEASE_ID}`);
  console.log(`  Total generated families: ${totalFamilies}`);
  console.log(`  P6-tagged families: ${p6Families}`);
  console.log(`  Output: ${outputFile}`);
}

// Export internals for testing
export { stripHtml, parseCliArgs, buildFamilies, generateFamilyData, renderDocument, getCommitSha, extractCorrectAnswer };

// Only run main when executed directly (not imported for testing)
const isMainModule = process.argv[1] && (
  process.argv[1].replace(/\\/g, '/').endsWith('/generate-grammar-review-pack.mjs')
);
if (isMainModule) {
  main();
}
