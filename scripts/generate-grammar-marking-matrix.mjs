#!/usr/bin/env node
/**
 * Grammar QG P10 R-U2 — Full Variant Expansion Marking Matrix
 *
 * For each constructed-response template (textarea/text inputSpec), seeds 1..10:
 * Generates 9 variant categories per entry, running each variant through
 * `evaluateGrammarQuestion` for real pass/fail results.
 *
 * Categories:
 *  1. goldenAnswers       — all accepted answers from answerSpec
 *  2. acceptedVariants    — mutations that should still pass
 *  3. nearMisses          — golden with one critical word changed
 *  4. rawPromptProbes     — empty, whitespace, "I don't know", prompt echo
 *  5. smartPunctuationVariants — curly↔straight transforms on golden
 *  6. caseVariants        — lowercase, UPPERCASE, Sentence Case of golden
 *  7. commonChildMistakes — misconception-based errors
 *  8. expectedScore       — correct/incorrect per variant
 *  9. misconceptionTag    — from evaluateGrammarQuestion when wrong
 *
 * Writes:
 *   reports/grammar/grammar-qg-p10-marking-matrix.json
 *   reports/grammar/grammar-qg-p10-marking-matrix.md
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

import { normaliseSmartPunctuation } from '../worker/src/subjects/grammar/answer-spec.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(__dirname, '..', 'reports', 'grammar');

const SEED_MIN = 1;
const SEED_MAX = 10;

// ---------------------------------------------------------------------------
// Smart punctuation: apply curly→straight and straight→curly transforms
// ---------------------------------------------------------------------------

function applyCurlyToStraight(text) {
  return normaliseSmartPunctuation(text);
}

function applyStraightToCurly(text) {
  return String(text || '')
    .replace(/"/g, '“')   // straight double → left curly
    .replace(/'/g, '’');  // straight single → right curly (smart apostrophe)
}

// ---------------------------------------------------------------------------
// Case variant generators
// ---------------------------------------------------------------------------

function toSentenceCase(text) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

// ---------------------------------------------------------------------------
// Common child mistakes generator (misconception-based)
// ---------------------------------------------------------------------------

function generateChildMistakes(golden, question) {
  const mistakes = [];
  const misconception = question.answerSpec?.misconception || '';

  if (misconception.includes('fronted_adverbial') || misconception.includes('punctuation')) {
    // Missing comma after fronted adverbial
    const noComma = golden.replace(/^([^,]+),\s*/, '$1 ');
    if (noComma !== golden) mistakes.push(noComma);
  }
  if (misconception.includes('tense')) {
    // Wrong tense: swap past→present simple patterns
    const wrongTense = golden.replace(/\b(walked|ran|jumped|played|looked)\b/, 'walk');
    if (wrongTense !== golden) mistakes.push(wrongTense);
  }
  if (misconception.includes('apostrophe') || misconception.includes('possession')) {
    // Missing apostrophe in possession
    const noApostrophe = golden.replace(/'s\b/g, 's');
    if (noApostrophe !== golden) mistakes.push(noApostrophe);
  }
  if (misconception.includes('subordinate_clause') || misconception.includes('relative_clause')) {
    // Remove subordinating conjunction
    const noConj = golden.replace(/\b(because|although|while|when|if|since|unless)\s+/i, '');
    if (noConj !== golden && noConj.length > 5) mistakes.push(noConj);
  }
  if (misconception.includes('speech_punctuation')) {
    // Missing speech marks
    const noSpeech = golden.replace(/["“”]/g, '');
    if (noSpeech !== golden) mistakes.push(noSpeech);
  }
  // Generic: remove full stop
  const noFullStop = golden.replace(/\.\s*$/, '');
  if (noFullStop !== golden) mistakes.push(noFullStop);

  return mistakes;
}

// ---------------------------------------------------------------------------
// Near-miss generator: change one critical word
// ---------------------------------------------------------------------------

function generateNearMisses(golden, answerSpec) {
  const misses = [];

  // Use spec-declared nearMiss if available
  if (Array.isArray(answerSpec?.nearMiss) && answerSpec.nearMiss.length > 0) {
    misses.push(...answerSpec.nearMiss);
  }

  // Auto-generate: swap a content word
  const words = golden.split(/\s+/);
  if (words.length >= 3) {
    // Replace the 2nd content word with a plausible wrong word
    const swapIdx = Math.min(2, words.length - 1);
    const mutated = [...words];
    mutated[swapIdx] = mutated[swapIdx] === 'the' ? 'a' : 'the';
    const mutatedStr = mutated.join(' ');
    if (mutatedStr !== golden) misses.push(mutatedStr);
  }

  return misses;
}

// ---------------------------------------------------------------------------
// Run a variant through the evaluator, return structured result
// ---------------------------------------------------------------------------

function evaluateVariant(question, answer) {
  const result = evaluateGrammarQuestion(question, { answer });
  if (!result) return { passed: null, misconceptionTag: null };
  return {
    passed: result.correct,
    misconceptionTag: result.misconception || null,
  };
}

// ---------------------------------------------------------------------------
// Main matrix builder
// ---------------------------------------------------------------------------

export function buildMarkingMatrix() {
  const entries = [];

  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    for (let seed = SEED_MIN; seed <= SEED_MAX; seed++) {
      const question = createGrammarQuestion({ templateId: template.id, seed });
      if (!question) continue;

      const inputType = question.inputSpec?.type;
      if (inputType !== 'textarea' && inputType !== 'text') continue;

      const answerSpec = question.answerSpec;

      // 1. Golden answers — ALL accepted from answerSpec
      const goldenAnswers = [];
      if (Array.isArray(answerSpec?.golden) && answerSpec.golden.length > 0) {
        goldenAnswers.push(...answerSpec.golden);
      } else if (answerSpec?.answerText) {
        goldenAnswers.push(answerSpec.answerText);
      }

      if (goldenAnswers.length === 0) {
        // Skip entries with no golden — cannot test marking
        continue;
      }

      const primaryGolden = goldenAnswers[0];

      // Evaluate all golden answers
      const goldenResults = goldenAnswers.map((g) => ({
        answer: g,
        ...evaluateVariant(question, g),
      }));

      // 2. Accepted variants — minor mutations that should still pass
      const acceptedVariants = [];
      // Whitespace-padded golden
      acceptedVariants.push({ answer: `  ${primaryGolden}  `, reason: 'leading/trailing whitespace' });
      // Double-space internal
      const doubleSpaced = primaryGolden.replace(/ /g, '  ');
      if (doubleSpaced !== primaryGolden) {
        acceptedVariants.push({ answer: doubleSpaced, reason: 'double internal spaces' });
      }
      const acceptedResults = acceptedVariants.map((v) => ({
        ...v,
        ...evaluateVariant(question, v.answer),
      }));

      // 3. Near misses — golden with one critical word changed
      const nearMissAnswers = generateNearMisses(primaryGolden, answerSpec);
      const nearMissResults = nearMissAnswers.map((nm) => ({
        answer: nm,
        ...evaluateVariant(question, nm),
      }));

      // 4. Raw prompt probes — must all mark incorrect
      const promptText = (question.stemHtml || '').replace(/<[^>]+>/g, '').trim();
      const rawPromptProbes = [
        { answer: '', reason: 'empty string' },
        { answer: '   ', reason: 'whitespace only' },
        { answer: "I don't know", reason: 'refusal phrase' },
        { answer: promptText.slice(0, 120), reason: 'prompt text echo' },
      ];
      const probeResults = rawPromptProbes.map((p) => ({
        ...p,
        ...evaluateVariant(question, p.answer),
      }));

      // 5. Smart punctuation variants — curly↔straight
      const smartPunctuationVariants = [];
      const straightened = applyCurlyToStraight(primaryGolden);
      const curlified = applyStraightToCurly(primaryGolden);
      if (straightened !== primaryGolden) {
        smartPunctuationVariants.push({ answer: straightened, transform: 'curly→straight' });
      }
      if (curlified !== primaryGolden) {
        smartPunctuationVariants.push({ answer: curlified, transform: 'straight→curly' });
      }
      // Always include at least the straight version even if identical
      if (smartPunctuationVariants.length === 0) {
        smartPunctuationVariants.push({ answer: primaryGolden, transform: 'identity (no smart punctuation)' });
      }
      const smartPunctResults = smartPunctuationVariants.map((sp) => ({
        ...sp,
        ...evaluateVariant(question, sp.answer),
      }));

      // 6. Case variants
      const caseVariants = [
        { answer: primaryGolden.toLowerCase(), transform: 'all lowercase' },
        { answer: primaryGolden.toUpperCase(), transform: 'ALL UPPERCASE' },
        { answer: toSentenceCase(primaryGolden), transform: 'Sentence Case' },
      ];
      const caseResults = caseVariants.map((cv) => ({
        ...cv,
        ...evaluateVariant(question, cv.answer),
      }));

      // 7. Common child mistakes
      const childMistakeAnswers = generateChildMistakes(primaryGolden, question);
      const childMistakeResults = childMistakeAnswers.map((cm) => ({
        answer: cm,
        ...evaluateVariant(question, cm),
      }));

      // 8. Expected score classification
      // 9. Misconception tags are embedded in the results above

      entries.push({
        templateId: template.id,
        seed,
        inputType,
        goldenAnswers: goldenResults,
        acceptedVariants: acceptedResults,
        nearMisses: nearMissResults,
        rawPromptProbes: probeResults,
        smartPunctuationVariants: smartPunctResults,
        caseVariants: caseResults,
        commonChildMistakes: childMistakeResults,
        expectedScore: {
          golden: 'correct',
          acceptedVariants: 'correct',
          nearMisses: 'incorrect',
          rawPromptProbes: 'incorrect',
        },
        misconceptionTag: answerSpec?.misconception || null,
      });
    }
  }

  // Aggregate metadata
  const goldenAllPass = entries.every((e) =>
    e.goldenAnswers.every((g) => g.passed === true),
  );
  const probeAllFail = entries.every((e) =>
    e.rawPromptProbes.every((p) => p.passed === false),
  );

  return {
    metadata: {
      contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
      generatedAt: new Date().toISOString(),
      seedRange: `${SEED_MIN}..${SEED_MAX}`,
      totalEntries: entries.length,
      variantCategories: 9,
      goldenAllPass,
      probeAllFail,
      goldenPassCount: entries.filter((e) => e.goldenAnswers.every((g) => g.passed === true)).length,
      goldenFailCount: entries.filter((e) => e.goldenAnswers.some((g) => g.passed === false)).length,
      probeRejectCount: entries.filter((e) => e.rawPromptProbes.every((p) => p.passed === false)).length,
      smartPunctPassCount: entries.filter((e) => e.smartPunctuationVariants.every((sp) => sp.passed === true)).length,
    },
    entries,
  };
}

// ---------------------------------------------------------------------------
// Markdown report generator
// ---------------------------------------------------------------------------

function generateMarkdown(matrix) {
  const lines = [];
  lines.push('# Grammar QG P10 Marking Matrix — Full Variant Expansion');
  lines.push('');
  lines.push(`Content Release: ${matrix.metadata.contentReleaseId}`);
  lines.push(`Generated: ${matrix.metadata.generatedAt}`);
  lines.push(`Seed Range: ${matrix.metadata.seedRange}`);
  lines.push(`Total Entries: ${matrix.metadata.totalEntries}`);
  lines.push(`Variant Categories: ${matrix.metadata.variantCategories}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Golden all pass | ${matrix.metadata.goldenAllPass} |`);
  lines.push(`| Probe all fail | ${matrix.metadata.probeAllFail} |`);
  lines.push(`| Golden pass count | ${matrix.metadata.goldenPassCount} |`);
  lines.push(`| Golden fail count | ${matrix.metadata.goldenFailCount} |`);
  lines.push(`| Probe reject count | ${matrix.metadata.probeRejectCount} |`);
  lines.push(`| Smart punct pass count | ${matrix.metadata.smartPunctPassCount} |`);
  lines.push('');
  lines.push('## Variant Categories');
  lines.push('');
  lines.push('1. **goldenAnswers** — all accepted answers from answerSpec');
  lines.push('2. **acceptedVariants** — whitespace mutations that should still pass');
  lines.push('3. **nearMisses** — golden with one critical word changed (should mark incorrect)');
  lines.push('4. **rawPromptProbes** — empty, whitespace, refusal, prompt echo (must mark incorrect)');
  lines.push('5. **smartPunctuationVariants** — curly/straight transforms on golden');
  lines.push('6. **caseVariants** — lowercase, UPPERCASE, Sentence Case');
  lines.push('7. **commonChildMistakes** — misconception-driven errors');
  lines.push('8. **expectedScore** — correct/incorrect classification per category');
  lines.push('9. **misconceptionTag** — from evaluateGrammarQuestion when wrong answer submitted');
  lines.push('');
  lines.push('## Per-Entry Detail (first 10)');
  lines.push('');

  const sample = matrix.entries.slice(0, 10);
  for (const entry of sample) {
    lines.push(`### ${entry.templateId} (seed ${entry.seed})`);
    lines.push('');
    lines.push(`| Category | Count | All Pass/Fail |`);
    lines.push(`| --- | --- | --- |`);
    lines.push(`| goldenAnswers | ${entry.goldenAnswers.length} | ${entry.goldenAnswers.every((g) => g.passed) ? 'ALL PASS' : 'SOME FAIL'} |`);
    lines.push(`| acceptedVariants | ${entry.acceptedVariants.length} | ${entry.acceptedVariants.every((v) => v.passed) ? 'ALL PASS' : 'MIXED'} |`);
    lines.push(`| nearMisses | ${entry.nearMisses.length} | ${entry.nearMisses.every((n) => !n.passed) ? 'ALL REJECTED' : 'SOME PASS'} |`);
    lines.push(`| rawPromptProbes | ${entry.rawPromptProbes.length} | ${entry.rawPromptProbes.every((p) => !p.passed) ? 'ALL REJECTED' : 'SOME PASS'} |`);
    lines.push(`| smartPunctuationVariants | ${entry.smartPunctuationVariants.length} | ${entry.smartPunctuationVariants.every((sp) => sp.passed) ? 'ALL PASS' : 'MIXED'} |`);
    lines.push(`| caseVariants | ${entry.caseVariants.length} | ${entry.caseVariants.every((c) => c.passed) ? 'ALL PASS' : 'MIXED'} |`);
    lines.push(`| commonChildMistakes | ${entry.commonChildMistakes.length} | ${entry.commonChildMistakes.length === 0 ? 'N/A' : entry.commonChildMistakes.every((m) => !m.passed) ? 'ALL REJECTED' : 'SOME PASS'} |`);
    lines.push(`| misconceptionTag | — | ${entry.misconceptionTag || 'none'} |`);
    lines.push('');
  }

  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const matrix = buildMarkingMatrix();

  await fs.mkdir(REPORTS_DIR, { recursive: true });

  const jsonPath = path.join(REPORTS_DIR, 'grammar-qg-p10-marking-matrix.json');
  await fs.writeFile(jsonPath, JSON.stringify(matrix, null, 2) + '\n', 'utf8');

  const mdPath = path.join(REPORTS_DIR, 'grammar-qg-p10-marking-matrix.md');
  await fs.writeFile(mdPath, generateMarkdown(matrix), 'utf8');

  console.log('Grammar QG P10 Marking Matrix (Full Variant Expansion) generated:');
  console.log(`  Total entries: ${matrix.metadata.totalEntries}`);
  console.log(`  Variant categories: ${matrix.metadata.variantCategories}`);
  console.log(`  Golden all pass: ${matrix.metadata.goldenAllPass}`);
  console.log(`  Probe all fail: ${matrix.metadata.probeAllFail}`);
  console.log(`  Golden pass: ${matrix.metadata.goldenPassCount}`);
  console.log(`  Golden fail: ${matrix.metadata.goldenFailCount}`);
  console.log(`  Smart punct pass: ${matrix.metadata.smartPunctPassCount}`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  Markdown: ${mdPath}`);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main().catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  });
}
