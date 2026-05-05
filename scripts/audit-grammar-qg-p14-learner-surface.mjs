#!/usr/bin/env node
import fs from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  GRAMMAR_CONTENT_RELEASE_ID,
  createGrammarQuestion,
  serialiseGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';
import {
  buildGrammarMiniPack,
  buildGrammarPracticeQueue,
} from '../worker/src/subjects/grammar/selection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(ROOT_DIR, 'reports', 'grammar');
const DEFAULT_JSON_OUT = path.join(REPORTS_DIR, 'grammar-qg-p14-learner-surface-audit.json');
const DEFAULT_MD_OUT = path.join(REPORTS_DIR, 'grammar-qg-p14-learner-surface-audit.md');
const NOW_TS = Date.parse('2026-05-01T09:00:00.000Z');

function emptyMastery() {
  return { concepts: {}, templates: {}, questionTypes: {}, items: {} };
}

function returningRecentAttempts() {
  return [
    { templateId: 'tense_form_choice', conceptIds: ['tense_aspect'], questionType: 'choose', result: { correct: false }, createdAt: NOW_TS - 600000 },
    { templateId: 'qg_p14_standard_english_diagnostic_choice', conceptIds: ['standard_english'], questionType: 'choose', result: { correct: true }, createdAt: NOW_TS - 500000 },
    { templateId: 'subject_object_choice', conceptIds: ['subject_object'], questionType: 'identify', result: { correct: false }, createdAt: NOW_TS - 400000 },
    { templateId: 'qg_p14_fronted_adverbials_constructed_rewrite', conceptIds: ['adverbials'], questionType: 'rewrite', result: { correct: true }, createdAt: NOW_TS - 300000 },
  ];
}

function troubleMastery() {
  return {
    concepts: {
      standard_english: { attempts: 5, correct: 1, wrong: 4, strength: 0.25, dueAt: NOW_TS - 1, correctStreak: 0 },
      tense_aspect: { attempts: 4, correct: 1, wrong: 3, strength: 0.3, dueAt: NOW_TS - 1, correctStreak: 0 },
    },
    templates: {},
    questionTypes: {},
    items: {},
  };
}

function visibleOptions(inputSpec) {
  if (!inputSpec || typeof inputSpec !== 'object') return null;
  if (Array.isArray(inputSpec.options)) {
    return inputSpec.options.map((option) => option.label || option.value || '');
  }
  if (Array.isArray(inputSpec.rows)) {
    return inputSpec.rows.map((row) => ({
      rowLabel: row.label || row.key || '',
      options: Array.isArray(row.options) ? row.options : (inputSpec.columns || []),
    }));
  }
  if (Array.isArray(inputSpec.fields)) {
    return inputSpec.fields.map((field) => ({
      label: field.label || field.key || '',
      options: field.options || [],
    }));
  }
  return null;
}

function itemSurface({ templateId, seed, pathId, slot, reason, explicitRetryReason = '' }) {
  const question = createGrammarQuestion({ templateId, seed });
  const serialised = serialiseGrammarQuestion(question);
  return {
    pathId,
    slot,
    templateId,
    seed,
    promptText: serialised?.promptText || '',
    visibleOptionsOrFields: visibleOptions(serialised?.inputSpec),
    targetCue: serialised?.focusCue || null,
    readAloudText: serialised?.readAloudText || serialised?.screenReaderPromptText || '',
    expectedAnswerShape: question?.answerSpec?.kind || serialised?.inputSpec?.type || 'legacy-evaluator',
    repeatedInSameSession: false,
    explicitRetryReason,
    whySelected: reason,
  };
}

function markRepeats(items) {
  const counts = new Map();
  for (const item of items) counts.set(item.templateId, (counts.get(item.templateId) || 0) + 1);
  return items.map((item) => ({
    ...item,
    repeatedInSameSession: (counts.get(item.templateId) || 0) > 1,
  }));
}

function queuePath({ pathId, label, mode, size, seed, focusConceptId = '', mastery = emptyMastery(), recentAttempts = [], miniPack = false, allowExplicitRepeats = false }) {
  const queue = miniPack
    ? buildGrammarMiniPack({ mode, size, seed, focusConceptId, mastery, recentAttempts, now: NOW_TS })
    : buildGrammarPracticeQueue({ mode, size, seed, focusConceptId, mastery, recentAttempts, now: NOW_TS });
  const items = markRepeats(queue.map((entry, index) => itemSurface({
    templateId: entry.templateId,
    seed: ((Number(seed) || 1) + index * 104729) >>> 0,
    pathId,
    slot: index + 1,
    reason: `${label}; ${mode}; slot ${index + 1}`,
  })));
  const duplicateTemplateIds = [...new Set(items.filter((item) => item.repeatedInSameSession).map((item) => item.templateId))];
  const fail = !allowExplicitRepeats && duplicateTemplateIds.length > 0;
  return {
    pathId,
    label,
    mode,
    size,
    seed,
    focusConceptId,
    allowExplicitRepeats,
    duplicateTemplateIds,
    pass: !fail,
    items,
  };
}

function similarProblemPath() {
  const templateId = 'qg_p14_standard_english_constructed_rewrite';
  const items = markRepeats([
    itemSurface({
      templateId,
      seed: 41,
      pathId: 'post-feedback-similar-problem',
      slot: 1,
      reason: 'Original marked item before similar-problem action.',
    }),
    itemSurface({
      templateId,
      seed: (41 + 2654435761) >>> 0,
      pathId: 'post-feedback-similar-problem',
      slot: 2,
      reason: 'Similar-problem action deliberately keeps the same template with a new generated variant.',
      explicitRetryReason: 'similar-problem-after-feedback',
    }),
  ]);
  return {
    pathId: 'post-feedback-similar-problem',
    label: 'Post-feedback similar problem',
    mode: 'smart',
    size: 2,
    seed: 41,
    allowExplicitRepeats: true,
    duplicateTemplateIds: [templateId],
    pass: true,
    items,
  };
}

function retryQueuePath() {
  const templateId = 'qg_p14_tense_aspect_constructed_rewrite';
  const items = markRepeats([
    itemSurface({
      templateId,
      seed: 73,
      pathId: 'retry-queue-after-miss',
      slot: 1,
      reason: 'Missed item that creates a retry queue entry.',
    }),
    itemSurface({
      templateId,
      seed: 73,
      pathId: 'retry-queue-after-miss',
      slot: 2,
      reason: 'Retry queue returns the missed item deliberately.',
      explicitRetryReason: 'retry-queue-repair-after-miss',
    }),
  ]);
  return {
    pathId: 'retry-queue-after-miss',
    label: 'Retry queue after miss',
    mode: 'smart',
    size: 2,
    seed: 73,
    allowExplicitRepeats: true,
    duplicateTemplateIds: [templateId],
    pass: true,
    items,
  };
}

const SURFACE_CACHE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.test-cache', 'learner-surface-audit.json');

export function buildLearnerSurfaceAudit() {
  if (existsSync(SURFACE_CACHE_PATH)) {
    try {
      const cached = JSON.parse(readFileSync(SURFACE_CACHE_PATH, 'utf8'));
      if (cached.contentReleaseId === GRAMMAR_CONTENT_RELEASE_ID) return cached;
    } catch { /* regenerate */ }
  }
  const paths = [
    queuePath({ pathId: 'first-time-smart', label: 'First-time smart practice', mode: 'smart', size: 5, seed: 87 }),
    queuePath({ pathId: 'returning-smart', label: 'Returning smart practice', mode: 'smart', size: 5, seed: 143, recentAttempts: returningRecentAttempts() }),
    queuePath({ pathId: 'focus-concept', label: 'Focus concept practice', mode: 'smart', size: 5, seed: 1234, focusConceptId: 'hyphen_ambiguity' }),
    queuePath({ pathId: 'trouble-spots', label: 'Trouble spots', mode: 'trouble', size: 5, seed: 221, mastery: troubleMastery(), recentAttempts: returningRecentAttempts() }),
    queuePath({ pathId: 'mini-test', label: 'Mini-test', mode: 'satsset', size: 8, seed: 17, miniPack: true }),
    queuePath({ pathId: 'deep-practice', label: 'Deep practice', mode: 'smart', size: 15, seed: 501, mastery: troubleMastery(), recentAttempts: returningRecentAttempts() }),
    similarProblemPath(),
    retryQueuePath(),
  ];
  const failures = paths.filter((entry) => !entry.pass);
  const result = {
    reportId: 'grammar-qg-p14-learner-surface-audit',
    contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
    generatedAt: new Date().toISOString(),
    pathCount: paths.length,
    pass: failures.length === 0,
    failures: failures.map((entry) => ({
      pathId: entry.pathId,
      duplicateTemplateIds: entry.duplicateTemplateIds,
    })),
    paths,
  };
  try {
    mkdirSync(path.dirname(SURFACE_CACHE_PATH), { recursive: true });
    writeFileSync(SURFACE_CACHE_PATH, JSON.stringify(result, null, 2));
  } catch { /* non-fatal */ }
  return result;
}

function markdownFor(report) {
  const lines = [
    '# Grammar QG P14 Learner Surface Audit',
    '',
    `Content release: ${report.contentReleaseId}`,
    `Pass: ${report.pass ? 'yes' : 'no'}`,
    '',
  ];
  for (const pathEntry of report.paths) {
    lines.push(`## ${pathEntry.label}`);
    lines.push('');
    lines.push(`- Path ID: ${pathEntry.pathId}`);
    lines.push(`- Mode: ${pathEntry.mode}`);
    lines.push(`- Seed: ${pathEntry.seed}`);
    lines.push(`- Duplicate templates: ${pathEntry.duplicateTemplateIds.length ? pathEntry.duplicateTemplateIds.join(', ') : 'none'}`);
    lines.push('');
    lines.push('| Slot | Template | Seed | Repeated | Answer shape | Why selected | Prompt |');
    lines.push('| ---: | --- | ---: | --- | --- | --- | --- |');
    for (const item of pathEntry.items) {
      const prompt = (item.promptText || '').replace(/\|/g, '\\|').slice(0, 120);
      lines.push(`| ${item.slot} | ${item.templateId} | ${item.seed} | ${item.repeatedInSameSession ? 'yes' : 'no'} | ${item.expectedAnswerShape} | ${item.whySelected.replace(/\|/g, '\\|')} | ${prompt} |`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const { values } = parseArgs({
    options: {
      out: { type: 'string', default: DEFAULT_JSON_OUT },
      markdown: { type: 'string', default: DEFAULT_MD_OUT },
      'report-id': { type: 'string', default: 'grammar-qg-p14-learner-surface-audit' },
    },
    strict: false,
  });
  const report = buildLearnerSurfaceAudit();
  report.reportId = values['report-id'];
  const jsonOut = path.resolve(values.out);
  const mdOut = path.resolve(values.markdown);
  await fs.mkdir(path.dirname(jsonOut), { recursive: true });
  await fs.writeFile(jsonOut, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(mdOut, `${markdownFor(report).trimEnd()}\n`, 'utf8');
  console.log(`Wrote ${path.relative(ROOT_DIR, jsonOut)}`);
  console.log(`Wrote ${path.relative(ROOT_DIR, mdOut)}`);
  if (!report.pass) process.exit(1);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main().catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  });
}
