#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GRAMMAR_CONCEPTS,
  GRAMMAR_TEMPLATE_METADATA,
  createGrammarQuestion,
  grammarQuestionVariantSignature,
  grammarTemplateById,
  grammarTemplateGeneratorFamilyId,
  serialiseGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';
import {
  GRAMMAR_RECENT_VARIANT_REPEAT_WINDOW,
  buildGrammarPracticeQueue,
} from '../worker/src/subjects/grammar/selection.js';

const DEFAULT_OUT = 'reports/grammar/grammar-qg-p21-local-repetition.json';
const DEFAULT_STEPS = 60;
const DEFAULT_SEED_BASE = 210521;

function parseArgs(argv) {
  const args = {
    out: DEFAULT_OUT,
    json: false,
    steps: DEFAULT_STEPS,
    seedBase: DEFAULT_SEED_BASE,
    focus: null,
    mode: null,
  };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg.startsWith('--steps=')) args.steps = Math.max(1, Math.floor(Number(arg.slice('--steps='.length)) || DEFAULT_STEPS));
    else if (arg.startsWith('--seed-base=')) args.seedBase = Math.floor(Number(arg.slice('--seed-base='.length)) || DEFAULT_SEED_BASE);
    else if (arg.startsWith('--focus=')) args.focus = arg.slice('--focus='.length).split(',').map((v) => v.trim()).filter(Boolean);
    else if (arg.startsWith('--mode=')) args.mode = arg.slice('--mode='.length).split(',').map((v) => v.trim()).filter(Boolean);
  }
  return args;
}

function templateMetadataById() {
  return new Map(GRAMMAR_TEMPLATE_METADATA.map((template) => [template.id, template]));
}

function stablePromptKey(question) {
  const serialised = serialiseGrammarQuestion(question);
  return String(serialised?.promptText || '')
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function stableSurfaceKey(question) {
  const serialised = serialiseGrammarQuestion(question);
  return JSON.stringify({
    promptText: stablePromptKey(question),
    inputSpec: serialised?.inputSpec || null,
    questionType: serialised?.questionType || '',
  });
}

function buildAttempt({ entry, question, seed, createdAt }) {
  const template = grammarTemplateById(entry.templateId);
  return {
    templateId: entry.templateId,
    conceptIds: (entry.skillIds || []).slice(),
    questionType: entry.questionType,
    result: { correct: true },
    createdAt,
    seed,
    generatorFamilyId: grammarTemplateGeneratorFamilyId(template || entry),
    variantSignature: grammarQuestionVariantSignature(question) || '',
  };
}

function recentDistance(history, key, keyFn, windowSize) {
  const max = Math.min(history.length, windowSize);
  for (let distance = 1; distance <= max; distance += 1) {
    const entry = history[history.length - distance];
    if (keyFn(entry) === key) return distance;
  }
  return Infinity;
}

function runScenario({ mode, focusConceptId, steps, seedBase }) {
  const recentAttempts = [];
  const seen = [];
  const violations = [];
  const warnings = [];
  const familyConceptWindow = [];
  const now = Date.UTC(2026, 4, 11, 9, 0, 0);

  for (let step = 0; step < steps; step += 1) {
    const seed = (seedBase + step * 104729 + focusConceptId.length * 8191 + mode.length * 131) >>> 0;
    const queue = buildGrammarPracticeQueue({
      mode,
      focusConceptId,
      recentAttempts,
      seed,
      size: 1,
      now: now + step * 60_000,
      includeBlocked: false,
    });
    const entry = queue[0];
    if (!entry) {
      violations.push({ type: 'empty-queue', step, mode, focusConceptId });
      continue;
    }

    const question = createGrammarQuestion({ templateId: entry.templateId, seed });
    if (!question) {
      violations.push({ type: 'question-not-created', step, mode, focusConceptId, templateId: entry.templateId });
      continue;
    }

    const promptKey = stablePromptKey(question);
    const surfaceKey = stableSurfaceKey(question);
    const variantSignature = grammarQuestionVariantSignature(question) || '';
    const templateRepeatDistance = recentDistance(seen, entry.templateId, (item) => item.templateId, 12);
    const promptRepeatDistance = recentDistance(seen, promptKey, (item) => item.promptKey, GRAMMAR_RECENT_VARIANT_REPEAT_WINDOW);
    const surfaceRepeatDistance = recentDistance(seen, surfaceKey, (item) => item.surfaceKey, GRAMMAR_RECENT_VARIANT_REPEAT_WINDOW);
    const variantRepeatDistance = variantSignature
      ? recentDistance(seen, variantSignature, (item) => item.variantSignature, GRAMMAR_RECENT_VARIANT_REPEAT_WINDOW)
      : Infinity;

    if (surfaceRepeatDistance !== Infinity) {
      violations.push({ type: 'surface-repeat', step, mode, focusConceptId, distance: surfaceRepeatDistance, templateId: entry.templateId, promptKey });
    }
    if (promptRepeatDistance !== Infinity) {
      warnings.push({ type: 'prompt-rhythm-repeat', step, mode, focusConceptId, distance: promptRepeatDistance, templateId: entry.templateId, promptKey });
    }
    if (variantRepeatDistance !== Infinity) {
      violations.push({ type: 'variant-repeat', step, mode, focusConceptId, distance: variantRepeatDistance, templateId: entry.templateId, variantSignature });
    }

    const focusedPoolSize = GRAMMAR_TEMPLATE_METADATA.filter((template) => (template.skillIds || []).includes(focusConceptId)).length;
    if (templateRepeatDistance !== Infinity && focusedPoolSize >= 12) {
      warnings.push({ type: 'template-repeat-within-12', step, mode, focusConceptId, distance: templateRepeatDistance, templateId: entry.templateId });
    }

    const familyConceptKey = `${buildAttempt({ entry, question, seed, createdAt: now }).generatorFamilyId}:${focusConceptId}`;
    familyConceptWindow.push(familyConceptKey);
    while (familyConceptWindow.length > 10) familyConceptWindow.shift();
    const familyConceptCount = familyConceptWindow.filter((key) => key === familyConceptKey).length;
    if (familyConceptCount > 2) {
      warnings.push({ type: 'family-concept-cluster', step, mode, focusConceptId, countInLast10: familyConceptCount, familyConceptKey });
    }

    seen.push({
      templateId: entry.templateId,
      questionType: entry.questionType,
      promptKey,
      surfaceKey,
      variantSignature,
      reason: entry.reason,
    });
    recentAttempts.push(buildAttempt({ entry, question, seed, createdAt: now + step * 60_000 }));
    while (recentAttempts.length > GRAMMAR_RECENT_VARIANT_REPEAT_WINDOW) recentAttempts.shift();
  }

  const templateCounts = new Map();
  const questionTypeCounts = new Map();
  for (const item of seen) {
    templateCounts.set(item.templateId, (templateCounts.get(item.templateId) || 0) + 1);
    questionTypeCounts.set(item.questionType, (questionTypeCounts.get(item.questionType) || 0) + 1);
  }

  return {
    mode,
    focusConceptId,
    steps,
    uniqueTemplates: templateCounts.size,
    uniquePrompts: new Set(seen.map((item) => item.promptKey)).size,
    uniqueVariants: new Set(seen.map((item) => item.variantSignature).filter(Boolean)).size,
    templateCounts: Object.fromEntries([...templateCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12)),
    questionTypeCounts: Object.fromEntries([...questionTypeCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    violationCount: violations.length,
    warningCount: warnings.length,
    violations,
    warnings: warnings.slice(0, 40),
  };
}

export function auditGrammarP21LocalRepetition(options = {}) {
  const args = {
    steps: options.steps || DEFAULT_STEPS,
    seedBase: options.seedBase || DEFAULT_SEED_BASE,
    focus: Array.isArray(options.focus) ? options.focus : null,
    mode: Array.isArray(options.mode) ? options.mode : null,
  };
  const conceptIds = args.focus || GRAMMAR_CONCEPTS.map((concept) => concept.id);
  const modes = args.mode || ['smart', 'trouble', 'satsset'];
  const scenarios = [];

  for (const mode of modes) {
    for (const focusConceptId of conceptIds) {
      scenarios.push(runScenario({
        mode,
        focusConceptId,
        steps: args.steps,
        seedBase: args.seedBase,
      }));
    }
  }

  const violations = scenarios.flatMap((scenario) => scenario.violations.map((violation) => ({ ...violation, scenario: `${scenario.mode}:${scenario.focusConceptId}` })));
  const warnings = scenarios.flatMap((scenario) => scenario.warnings.map((warning) => ({ ...warning, scenario: `${scenario.mode}:${scenario.focusConceptId}` })));

  return {
    release: 'grammar-qg-p21-local-repetition',
    generatedAt: new Date().toISOString(),
    steps: args.steps,
    seedBase: args.seedBase,
    repeatWindow: GRAMMAR_RECENT_VARIANT_REPEAT_WINDOW,
    scenarioCount: scenarios.length,
    status: violations.length === 0 ? 'pass' : 'fail',
    summary: {
      violationCount: violations.length,
      warningCount: warnings.length,
      minUniqueTemplates: Math.min(...scenarios.map((scenario) => scenario.uniqueTemplates)),
      minUniquePrompts: Math.min(...scenarios.map((scenario) => scenario.uniquePrompts)),
      minUniqueVariants: Math.min(...scenarios.map((scenario) => scenario.uniqueVariants)),
    },
    scenarios,
    violations: violations.slice(0, 120),
    warnings: warnings.slice(0, 120),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = auditGrammarP21LocalRepetition(args);
  const outPath = path.resolve(process.cwd(), args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`Grammar P21 local repetition audit: ${result.status}\n`);
    process.stdout.write(`scenarios=${result.scenarioCount} violations=${result.summary.violationCount} warnings=${result.summary.warningCount}\n`);
    process.stdout.write(`wrote ${outPath}\n`);
  }
  if (result.status !== 'pass') process.exitCode = 1;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) main();
