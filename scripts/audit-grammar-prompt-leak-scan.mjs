#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GRAMMAR_CONTENT_RELEASE_ID,
  GRAMMAR_TEMPLATE_METADATA,
  createGrammarQuestion,
  serialiseGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';

const DEFAULT_SEEDS = Object.freeze(Array.from({ length: 30 }, (_, i) => i + 1));
const EXPLANATION_ARROW_FAMILIES = new Set([
  'qg_p18_p18_active_passive_application_transfer',
]);

function parseSeedList(value = '1..30') {
  const seeds = [];
  for (const token of String(value || '').split(',')) {
    const part = token.trim();
    if (!part) continue;
    const range = part.match(/^(\d+)\.\.(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
        throw new Error(`Invalid seed range: ${part}`);
      }
      for (let seed = start; seed <= end; seed += 1) seeds.push(seed);
      continue;
    }
    const seed = Number(part);
    if (!Number.isInteger(seed) || seed < 1) throw new Error(`Invalid seed value: ${part}`);
    seeds.push(seed);
  }
  return Array.from(new Set(seeds)).sort((a, b) => a - b);
}

function decodeHtml(text) {
  return String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(text) {
  return decodeHtml(text)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<\/li>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function normaliseText(text) {
  return stripHtml(text)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function comparableText(text) {
  return normaliseText(text)
    .toLowerCase()
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/([([{])\s+/g, '$1')
    .replace(/\s+([)\]}])/g, '$1');
}

function isFixRewriteOrFill(question, template) {
  const type = question?.questionType || template?.questionType || '';
  return ['fix', 'rewrite', 'fill'].includes(type);
}

function wordCount(text) {
  return normaliseText(text).split(/\s+/).filter(Boolean).length;
}

function expectedAnswerFragments(question) {
  const answerSpec = question?.answerSpec || {};
  const raw = [];
  if (typeof answerSpec.expectedAnswerSummary === 'string') raw.push(answerSpec.expectedAnswerSummary);
  if (Array.isArray(answerSpec.golden)) raw.push(...answerSpec.golden);
  if (Array.isArray(answerSpec.acceptedAnswers)) raw.push(...answerSpec.acceptedAnswers);
  const seen = new Set();
  return raw
    .map((value) => normaliseText(value))
    .filter((value) => value.length > 0)
    .filter((value) => {
      const key = comparableText(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function isMaterialExpectedAnswer(fragment) {
  const clean = normaliseText(fragment);
  if (clean.length >= 16) return true;
  return wordCount(clean) >= 3;
}

function buildPromptQualityFindings({ template, seed, prompt }) {
  const findings = [];
  const text = normaliseText(prompt);
  if (/\b(?:undefined|null|NaN|\[object Object\])\b/i.test(text)) {
    findings.push({ rule: 'unresolved-runtime-token', severity: 'blocker' });
  }
  if (/\{\{[^}]+\}\}|\$\{[^}]+\}|<%=?[^%]+%>/.test(text)) {
    findings.push({ rule: 'unresolved-template-placeholder', severity: 'blocker' });
  }
  if (/\s+[.,!?;:]/.test(text)) {
    findings.push({ rule: 'space-before-punctuation', severity: 'blocker' });
  }
  if (/([!?;,])\1+|\.{2}(?!\.)|\.{4,}/.test(text.replace(/\.\.\./g, ''))) {
    findings.push({ rule: 'repeated-punctuation', severity: 'blocker' });
  }
  if (/(?:→|->)\s*$/.test(text)) {
    findings.push({ rule: 'dangling-arrow', severity: 'blocker' });
  }
  return findings.map((finding) => ({
    ...finding,
    templateId: template.id,
    seed,
    prompt: text,
  }));
}

function hasAnswerLeakMarker(prompt, expectedAnswer) {
  const comparablePrompt = comparableText(prompt);
  const comparableAnswer = comparableText(expectedAnswer);
  const answerIndex = comparablePrompt.indexOf(comparableAnswer);
  if (answerIndex === -1) return false;
  const before = comparablePrompt.slice(0, answerIndex);
  return /(?:→|->)\s*$/.test(before)
    || /\b(?:correct(?:ed)?\s+(?:answer|version|sentence)|model\s+answer|answer\s+(?:is|should\s+be))\s*:?\s*$/.test(before);
}

export function buildGrammarPromptLeakScan({ seeds = DEFAULT_SEEDS } = {}) {
  const arrowPrompts = [];
  const reviewedArrowPrompts = [];
  const promptQualityFindings = [];
  const expectedAnswerPromptFindings = [];
  const expectedAnswerPromptReviews = [];
  const shortExpectedAnswerReviews = [];
  const generationFailures = [];
  let itemCount = 0;

  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    for (const seed of seeds) {
      let question;
      let serialised;
      try {
        question = createGrammarQuestion({ templateId: template.id, seed });
        if (!question) continue;
        serialised = serialiseGrammarQuestion(question);
      } catch (error) {
        generationFailures.push({
          templateId: template.id,
          seed,
          message: error?.message || String(error),
        });
        continue;
      }

      itemCount += 1;
      const prompt = normaliseText(serialised?.promptText || question?.stemHtml || '');
      if (/(?:→|->)/.test(prompt)) {
        const review = EXPLANATION_ARROW_FAMILIES.has(template.id)
          ? 'reviewed-explanation-transformation'
          : 'requires-review';
        const row = {
          templateId: template.id,
          seed,
          questionType: question.questionType || template.questionType || '',
          prompt,
          review,
        };
        arrowPrompts.push(row);
        if (review === 'reviewed-explanation-transformation') reviewedArrowPrompts.push(row);
        else promptQualityFindings.push({ ...row, rule: 'unreviewed-arrow-prompt', severity: 'blocker' });
      }

      promptQualityFindings.push(...buildPromptQualityFindings({ template, seed, prompt }));

      if (!isFixRewriteOrFill(question, template)) continue;
      const comparablePrompt = comparableText(prompt);
      for (const fragment of expectedAnswerFragments(question)) {
        const comparableFragment = comparableText(fragment);
        if (!comparableFragment || !comparablePrompt.includes(comparableFragment)) continue;
        const row = {
          templateId: template.id,
          seed,
          questionType: question.questionType || template.questionType || '',
          answerSpecKind: question.answerSpec?.kind || null,
          expectedAnswer: fragment,
          prompt,
        };
        if (isMaterialExpectedAnswer(fragment) && hasAnswerLeakMarker(prompt, fragment)) {
          expectedAnswerPromptFindings.push({
            ...row,
            rule: 'corrected-answer-visible-in-prompt',
            severity: 'blocker',
          });
        } else if (isMaterialExpectedAnswer(fragment)) {
          expectedAnswerPromptReviews.push({
            ...row,
            review: 'expected-answer-text-visible-as-source-material-or-if-needed-task',
          });
        } else {
          shortExpectedAnswerReviews.push({
            ...row,
            review: 'short-grammar-label-or-punctuation-target-reviewed',
          });
        }
      }
    }
  }

  const blockerFindings = [
    ...generationFailures.map((failure) => ({ ...failure, rule: 'generation-failure', severity: 'blocker' })),
    ...promptQualityFindings.filter((finding) => finding.severity === 'blocker'),
    ...expectedAnswerPromptFindings,
  ];

  return {
    releaseId: GRAMMAR_CONTENT_RELEASE_ID,
    generatedAt: new Date().toISOString(),
    seedWindow: seeds,
    templateCount: GRAMMAR_TEMPLATE_METADATA.length,
    itemCount,
    arrowPromptCount: arrowPrompts.length,
    reviewedArrowPromptCount: reviewedArrowPrompts.length,
    unreviewedArrowPromptCount: arrowPrompts.length - reviewedArrowPrompts.length,
    expectedAnswerPromptFindingCount: expectedAnswerPromptFindings.length,
    expectedAnswerPromptReviewCount: expectedAnswerPromptReviews.length,
    shortExpectedAnswerReviewCount: shortExpectedAnswerReviews.length,
    promptQualityFindingCount: promptQualityFindings.length,
    generationFailureCount: generationFailures.length,
    blockerFindingCount: blockerFindings.length,
    status: blockerFindings.length === 0 ? 'pass' : 'fail',
    arrowPrompts,
    reviewedArrowPrompts,
    expectedAnswerPromptFindings,
    expectedAnswerPromptReviews,
    shortExpectedAnswerReviews,
    promptQualityFindings,
    generationFailures,
    blockerFindings,
  };
}

async function main(argv) {
  const outArg = argv.find((arg) => arg.startsWith('--out='));
  const seedArg = argv.find((arg) => arg.startsWith('--seeds='));
  const json = argv.includes('--json');
  const seeds = seedArg ? parseSeedList(seedArg.slice('--seeds='.length)) : DEFAULT_SEEDS.slice();
  const result = buildGrammarPromptLeakScan({ seeds });
  if (outArg) {
    const outPath = path.resolve(outArg.slice('--out='.length));
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    process.stdout.write(`Grammar prompt leak scan: ${result.status}\n`);
    process.stdout.write(`items=${result.itemCount} arrows=${result.arrowPromptCount} blockers=${result.blockerFindingCount}\n`);
    process.stdout.write(`wrote ${outPath}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
  if (json && outArg) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== 'pass') process.exitCode = 1;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exit(1);
  });
}
