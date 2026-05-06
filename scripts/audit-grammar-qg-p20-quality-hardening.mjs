#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  GRAMMAR_CONTENT_RELEASE_ID,
  GRAMMAR_TEMPLATE_METADATA,
  createGrammarQuestion,
  serialiseGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';
import { markByAnswerSpec } from '../worker/src/subjects/grammar/answer-spec.js';
import { buildSmartPracticeAudit } from './audit-grammar-qg-p19-smart-practice.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_SEEDS = Object.freeze(Array.from({ length: 30 }, (_, i) => i + 1));
const DEFAULT_SMART_SEEDS = Object.freeze([1, 2, 3, 4, 5, 6]);
const GRAMMAR_LABELS = new Set([
  'active voice', 'adjective', 'adverb', 'apostrophe', 'bracket', 'colon',
  'comma', 'command', 'conjunction', 'dash', 'determiner', 'exclamation',
  'expanded noun phrase', 'fronted adverbial', 'hyphen', 'main clause',
  'modal verb', 'noun', 'noun phrase', 'object', 'parenthesis', 'passive voice',
  'preposition', 'pronoun', 'question', 'relative clause', 'semicolon',
  'sentence', 'singular possession', 'plural possession', 'statement',
  'subject', 'subordinate clause', 'verb',
]);

function parseSeedList(value = '', fallback = DEFAULT_SEEDS) {
  const text = String(value || '').trim();
  if (!text) return fallback.slice();
  const seeds = [];
  for (const token of text.split(',')) {
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
  const unique = Array.from(new Set(seeds)).sort((a, b) => a - b);
  if (unique.length === 0) throw new Error(`No valid seeds parsed from: ${value}`);
  return unique;
}

function normaliseSpaces(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function stripHtml(html) {
  return normaliseSpaces(String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<\/li>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"'))
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/([([{])\s+/g, '$1')
    .replace(/\s+([)\]}])/g, '$1');
}

function isOpenPrompt(prompt) {
  return /\b(explain|transfer|write\s+(?:the|an?|one|a\s+sentence)|rewrite|build|mixed\s+check|add|move|join|describe|complete\s+the\s+sentence|continue|extend|combine|correct|copy|insert|edit|fix|punctuate|expand|change|type|repair|reorder)\b/i.test(prompt || '');
}

function isGrammarLabel(text) {
  return GRAMMAR_LABELS.has(String(text || '').trim().toLowerCase());
}

function articleFor(text) {
  return /^[aeiou]/i.test(String(text || '').trim()) ? 'an' : 'a';
}

function smartPunctuationVariant(text) {
  return String(text || '')
    .replace(/"([^"\n]+)"/g, '“$1”')
    .replace(/\b([A-Za-z]+)'s\b/g, '$1’s')
    .replace(/ - /g, ' – ');
}

function answerVariantsFor(question) {
  const kind = question.answerSpec?.kind;
  const golden = Array.isArray(question.answerSpec?.golden) ? question.answerSpec.golden : [];
  const variants = [];
  for (const answer of golden.slice(0, 3)) {
    const text = String(answer || '').trim();
    if (!text) continue;
    variants.push({ label: 'golden', answer: text });
    if (kind === 'normalisedText' || kind === 'acceptedSet') {
      variants.push({ label: 'case-fold', answer: text.toUpperCase() });
      if (!/[.!?]$/.test(text)) variants.push({ label: 'terminal-full-stop', answer: `${text}.` });
      variants.push({ label: 'wrapping-quotes', answer: `"${text}"` });
      if (isGrammarLabel(text)) {
        variants.push({ label: 'article-label', answer: `${articleFor(text)} ${text}` });
        variants.push({ label: 'the-label', answer: `the ${text}` });
      }
    }
    if (kind === 'punctuationPattern') {
      variants.push({ label: 'outer-whitespace', answer: `  ${text}  ` });
      const smart = smartPunctuationVariant(text);
      if (smart !== text) variants.push({ label: 'smart-punctuation', answer: smart });
      if (question.answerSpec?.params?.optionalTerminalFullStop) {
        const terminalVariant = /\.$/.test(text) ? text.replace(/\.+$/g, '') : `${text}.`;
        variants.push({ label: 'optional-terminal-full-stop', answer: terminalVariant });
      }
    }
  }
  const seen = new Set();
  return variants.filter((variant) => {
    const key = `${variant.label}\0${variant.answer}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function evaluate(question, answer) {
  if (question?.answerSpec) return markByAnswerSpec(question.answerSpec, { answer });
  if (typeof question?.evaluate === 'function') return question.evaluate({ answer });
  return null;
}

function hasPossessiveScenarioCopyGlitch(text) {
  return /\bfor\s+(?:one|several)\s+[^.?!]+?\s+own(?:s)?\s+[^.?!]+[.?!]/i.test(text || '')
    && !/\bfor:\s+(?:one|several)\b/i.test(text || '');
}

function isInternalPunctuationRewritePrompt(prompt) {
  const text = String(prompt || '');
  if (/\b(ending\s+punctuation|direct\s+speech|speech\s+punctuation|punctuate\s+the\s+direct\s+speech)\b/i.test(text)) {
    return false;
  }
  return /\b(add|insert|rewrite|copy|correct)\b/i.test(text)
    && /\b(comma|commas|bracket|brackets|parenthesis|colon|dash|hyphen|fronted\s+adverbial)\b/i.test(text);
}

function buildTemplateQualityFindings(question, template, seed, serialised) {
  const findings = [];
  const prompt = serialised?.promptText || stripHtml(question.stemHtml);
  const text = [
    prompt,
    ...(serialised?.solutionLines || []),
    JSON.stringify(serialised?.inputSpec || question.inputSpec || {}),
  ].join(' ');
  if (/\s+[.,!?;:]/.test(text)) {
    findings.push({ rule: 'space-before-punctuation', templateId: template.id, seed, text: text.slice(0, 240) });
  }
  const badArticle = text.match(/\ba\s+(adverb|adjective|apostrophe|exclamation|expanded\s+noun\s+phrase)\b/i);
  if (badArticle) {
    findings.push({ rule: 'article-agreement', templateId: template.id, seed, text: badArticle[0] });
  }
  if (/\bClassify the grammar feature shown in this row:\s*[^.?!:]+\s+in:\s*/i.test(text)) {
    findings.push({ rule: 'awkward-table-row-copy', templateId: template.id, seed, text: text.slice(0, 180) });
  }
  if (hasPossessiveScenarioCopyGlitch(prompt)) {
    findings.push({ rule: 'possessive-scenario-copy', templateId: template.id, seed, text: prompt.slice(0, 180) });
  }
  if (question.answerSpec?.kind === 'punctuationPattern' && isInternalPunctuationRewritePrompt(prompt)) {
    const accepted = Array.isArray(question.answerSpec.golden) ? question.answerSpec.golden[0] : '';
    if (/\.$/.test(accepted)) {
      const withoutTerminalFullStop = accepted.replace(/\.+$/g, '');
      const result = evaluate(question, withoutTerminalFullStop);
      if (!result?.correct) {
        findings.push({
          rule: 'incidental-terminal-full-stop-strictness',
          templateId: template.id,
          seed,
          text: prompt.slice(0, 180),
          accepted,
        });
      }
    }
  }
  return findings;
}

export function buildGrammarQGP20QualityHardeningAudit({ seeds = DEFAULT_SEEDS, smartSeeds = DEFAULT_SMART_SEEDS } = {}) {
  const answerAcceptanceFailures = [];
  const fairnessFindings = [];
  const templateQualityFindings = [];
  const p20ClosedAutoMark = [];
  const unsafeAutoMarkedOpenPrompts = [];
  const answerSpecKindCounts = {};

  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    answerSpecKindCounts[template.answerSpecKind || 'none'] = (answerSpecKindCounts[template.answerSpecKind || 'none'] || 0) + 1;
    for (const seed of seeds) {
      const question = createGrammarQuestion({ templateId: template.id, seed });
      if (!question) continue;
      const serialised = serialiseGrammarQuestion(question);
      const prompt = serialised?.promptText || stripHtml(question.stemHtml || '');
      const inputType = question.inputSpec?.type;
      const kind = question.answerSpec?.kind;
      const acceptedCount = Array.isArray(question.answerSpec?.golden) ? question.answerSpec.golden.length : 0;

      if (question.p20ClosedAutoMark || question.answerSpec?.p20ClosedAutoMark) {
        p20ClosedAutoMark.push({ templateId: template.id, seed, kind, prompt });
        const declaredKind = template.p20ClosedAutoMarkKind || null;
        const safeRecoveredKind = ['normalisedText', 'punctuationPattern'].includes(kind)
          && declaredKind === kind
          && template.tags?.includes('p20-closed-auto-mark');
        if (isOpenPrompt(prompt) && !safeRecoveredKind) {
          unsafeAutoMarkedOpenPrompts.push({
            templateId: template.id,
            seed,
            kind,
            declaredKind,
            prompt,
          });
        }
      }

      if (
        ['text', 'textarea'].includes(inputType)
        && ['normalisedText', 'acceptedSet'].includes(kind)
        && isOpenPrompt(prompt)
        && acceptedCount < 3
        && question.manualReviewOnly !== true
        && question.nonScored !== true
        && question.p20ClosedAutoMark !== true
        && question.answerSpec?.p20ClosedAutoMark !== true
      ) {
        fairnessFindings.push({ templateId: template.id, seed, kind, acceptedCount, prompt });
      }

      if (!question.manualReviewOnly && !question.nonScored && ['normalisedText', 'acceptedSet', 'punctuationPattern'].includes(kind)) {
        for (const variant of answerVariantsFor(question)) {
          const result = evaluate(question, variant.answer);
          if (!result?.correct) {
            answerAcceptanceFailures.push({
              templateId: template.id,
              seed,
              kind,
              variant: variant.label,
              answer: variant.answer,
              expected: question.answerSpec?.golden?.[0] || '',
              prompt,
              feedback: result?.feedbackLong || '',
            });
            break;
          }
        }
      }

      templateQualityFindings.push(...buildTemplateQualityFindings(question, template, seed, serialised));
    }
  }

  const smartPractice = buildSmartPracticeAudit({ seeds: smartSeeds });
  const expansionGate = {
    passed: answerAcceptanceFailures.length === 0
      && fairnessFindings.length === 0
      && templateQualityFindings.length === 0
      && unsafeAutoMarkedOpenPrompts.length === 0
      && smartPractice.summary.pass === true,
    stance: 'Expansion is allowed only after the current pool stays clean under answer-acceptance, template-quality, fairness, and smart-practice gates.',
    newLearnerFacingFamiliesAdded: 0,
  };

  const phaseStatus = {
    phase1AnswerAcceptance: answerAcceptanceFailures.length === 0,
    phase2TemplateQuality: templateQualityFindings.length === 0,
    phase3PoolAuditAndQuarantine: fairnessFindings.length === 0 && unsafeAutoMarkedOpenPrompts.length === 0,
    phase4VarietyAndAntiRepetition: smartPractice.summary.pass === true,
    phase5ExpansionGate: expansionGate.passed,
  };
  const passed = Object.values(phaseStatus).every(Boolean);

  return {
    metadata: {
      contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
      generatedAt: new Date().toISOString(),
      seeds,
      smartSeeds,
    },
    passed,
    phaseStatus,
    summary: {
      templateCount: GRAMMAR_TEMPLATE_METADATA.length,
      seedsChecked: seeds.length,
      answerSpecKindCounts,
      p20ClosedAutoMarkTemplateCount: new Set(p20ClosedAutoMark.map((item) => item.templateId)).size,
      p20ClosedAutoMarkCaseCount: p20ClosedAutoMark.length,
      answerAcceptanceFailureCount: answerAcceptanceFailures.length,
      fairnessFindingCount: fairnessFindings.length,
      templateQualityFindingCount: templateQualityFindings.length,
      unsafeAutoMarkedOpenPromptCount: unsafeAutoMarkedOpenPrompts.length,
      smartPracticeFailureCount: smartPractice.summary.failureCount,
      smartPracticeAdvisoryCount: smartPractice.summary.advisoryCount,
    },
    answerAcceptanceFailures,
    fairnessFindings,
    templateQualityFindings,
    unsafeAutoMarkedOpenPrompts,
    p20ClosedAutoMark,
    smartPractice: {
      metadata: smartPractice.metadata,
      summary: smartPractice.summary,
      failures: smartPractice.failures,
      advisories: smartPractice.advisories,
    },
    expansionGate,
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      seeds: { type: 'string', default: '' },
      'smart-seeds': { type: 'string', default: '' },
      out: { type: 'string', default: '' },
    },
  });
  const seeds = parseSeedList(values.seeds || '', DEFAULT_SEEDS);
  const smartSeeds = parseSeedList(values['smart-seeds'] || '', DEFAULT_SMART_SEEDS);
  const audit = buildGrammarQGP20QualityHardeningAudit({ seeds, smartSeeds });
  const json = JSON.stringify(audit, null, 2);
  if (values.out) {
    const outPath = path.resolve(values.out);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, `${json}\n`, 'utf8');
    console.log(`Grammar QG P20 quality-hardening audit: ${audit.passed ? 'PASS' : 'FAIL'} -> ${outPath}`);
  } else {
    console.log(json);
  }
  if (!audit.passed) process.exit(1);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main().catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  });
}
