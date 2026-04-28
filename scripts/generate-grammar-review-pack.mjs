#!/usr/bin/env node
/**
 * Grammar QG P5 — Reviewer Sample Pack Generator
 *
 * Produces a deterministic reviewer-friendly markdown document showing
 * sample prompts (without answer keys) for each generated template family,
 * with a separate Reviewer Answer Appendix at the bottom.
 *
 * Usage:  node scripts/generate-grammar-review-pack.mjs
 * Output: reports/grammar/grammar-qg-p5-review-pack.md
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GRAMMAR_TEMPLATE_METADATA,
  createGrammarQuestion,
  grammarQuestionVariantSignature,
} from '../worker/src/subjects/grammar/content.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'reports', 'grammar');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'grammar-qg-p5-review-pack.md');

const SEED_WINDOW_START = 1;
const SEED_WINDOW_END = 30;
const MAX_SAMPLE_PROMPTS = 5;

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
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
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

function buildFamilies() {
  // Group templates by generatorFamilyId
  const familyMap = new Map();

  for (const meta of GRAMMAR_TEMPLATE_METADATA) {
    if (!meta.generative) continue;
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

  return Array.from(familyMap.values())
    .map((f) => ({
      ...f,
      skillIds: Array.from(f.skillIds).sort(),
      templateIds: Array.from(new Set(f.templateIds)).sort(),
      tags: Array.from(f.tags).sort(),
    }))
    .sort((a, b) => a.familyId.localeCompare(b.familyId));
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
    lines.push(`**Stem:** ${stripHtml(question.stemHtml)}`);
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

function renderDocument(families, familyDataMap, commitSha) {
  const lines = [];
  lines.push('# Grammar QG P5 — Reviewer Sample Pack');
  lines.push('');
  lines.push(`Generated from commit: ${commitSha}`);
  lines.push('Release: grammar-qg-p5-2026-04-28');
  lines.push(`Seed window: ${SEED_WINDOW_START}..${SEED_WINDOW_END}`);
  lines.push(`Total generated families: ${families.length}`);
  lines.push('');
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
  const families = buildFamilies();

  const familyDataMap = new Map();
  for (const family of families) {
    familyDataMap.set(family.familyId, generateFamilyData(family));
  }

  const markdown = renderDocument(families, familyDataMap, commitSha);

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, markdown, 'utf8');

  // Summary
  const totalFamilies = families.length;
  const p5Families = families.filter((f) => f.tags.includes('qg-p5')).length;
  console.log(`Grammar QG P5 Review Pack generated.`);
  console.log(`  Commit: ${commitSha}`);
  console.log(`  Total generated families: ${totalFamilies}`);
  console.log(`  P5-tagged families: ${p5Families}`);
  console.log(`  Output: ${OUTPUT_FILE}`);
}

main();
