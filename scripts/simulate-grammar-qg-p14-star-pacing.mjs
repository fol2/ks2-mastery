#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GRAMMAR_CONCEPTS,
  GRAMMAR_CONTENT_RELEASE_ID,
  GRAMMAR_TEMPLATE_METADATA,
} from '../worker/src/subjects/grammar/content.js';
import { buildGrammarPracticeQueue } from '../worker/src/subjects/grammar/selection.js';
import {
  computeGrammarMonsterStars,
  deriveGrammarConceptStarEvidence,
  grammarStarStageName,
} from '../shared/grammar/grammar-stars.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(ROOT_DIR, 'reports', 'grammar');
const JSON_OUT = path.join(REPORTS_DIR, 'grammar-qg-p14-star-pacing-simulation.json');
const MD_OUT = path.join(REPORTS_DIR, 'grammar-qg-p14-star-pacing-simulation.md');
const DAY_MS = 86400000;
const START_TS = Date.parse('2026-05-01T09:00:00.000Z');
const DIRECT_MONSTERS = Object.freeze(['bracehart', 'chronalyx', 'couronnail']);
const STAGE_THRESHOLDS = Object.freeze([
  ['Egg found', 1],
  ['Hatched', 15],
  ['Growing', 35],
  ['Nearly Mega', 65],
  ['Mega', 100],
]);

function emptyMastery() {
  return { concepts: {}, templates: {}, questionTypes: {}, items: {} };
}

function nodeFor(mastery, conceptId) {
  if (!mastery.concepts[conceptId]) {
    mastery.concepts[conceptId] = {
      attempts: 0,
      correct: 0,
      wrong: 0,
      strength: 0.25,
      intervalDays: 0,
      dueAt: 0,
      correctStreak: 0,
    };
  }
  return mastery.concepts[conceptId];
}

function templateById(templateId) {
  return GRAMMAR_TEMPLATE_METADATA.find((template) => template.id === templateId) || null;
}

function updateNode(node, correct, nowTs, retainedEvents) {
  node.attempts += 1;
  if (correct) {
    node.correct += 1;
    node.correctStreak += 1;
    node.strength = Math.min(0.99, node.strength + 0.18);
    if (node.correctStreak >= 5) node.intervalDays = Math.max(node.intervalDays, 7);
    else if (node.correctStreak >= 4) node.intervalDays = Math.max(node.intervalDays, 3);
    else if (node.correctStreak >= 2) node.intervalDays = Math.max(node.intervalDays, 1);
    if (node.strength >= 0.82 && node.intervalDays >= 7) retainedEvents.count += 1;
  } else {
    node.wrong += 1;
    node.correctStreak = 0;
    node.strength = Math.max(0.1, node.strength - 0.16);
    node.intervalDays = 0;
  }
  node.dueAt = nowTs + Math.max(1, node.intervalDays || 1) * DAY_MS;
}

function evidenceMap(mastery, attempts, nowTs) {
  return Object.fromEntries(GRAMMAR_CONCEPTS.map((concept) => [
    concept.id,
    deriveGrammarConceptStarEvidence({
      conceptId: concept.id,
      conceptNode: mastery.concepts[concept.id] || null,
      recentAttempts: attempts,
      nowTs,
    }),
  ]));
}

function maxDirectStars(mastery, attempts, nowTs) {
  const evidence = evidenceMap(mastery, attempts, nowTs);
  const direct = Object.fromEntries(DIRECT_MONSTERS.map((monsterId) => [
    monsterId,
    computeGrammarMonsterStars(monsterId, evidence),
  ]));
  const max = Math.max(...Object.values(direct).map((entry) => entry.stars));
  return { max, direct };
}

function correctnessFor(profile, sessionIndex, slot, templateId) {
  if (profile === 'always-correct') return true;
  if (profile === 'deep-practice') return true;
  if (profile === 'long-gap-retention') return true;
  if (profile === 'easy-template-only') return true;
  if (profile === 'repeated-template') return true;
  if (profile === 'supported-after-wrong') return slot > 1;
  return ((sessionIndex + slot + templateId.length) % 4) !== 0;
}

function queueForProfile(profile, sessionIndex, mastery, attempts, size) {
  if (profile === 'easy-template-only' || profile === 'repeated-template') {
    return Array.from({ length: size }, () => ({
      templateId: 'question_mark_select',
      skillIds: ['sentence_functions', 'speech_punctuation'],
      questionType: 'identify',
    }));
  }
  const mode = profile === 'deep-practice' ? 'smart' : 'smart';
  return buildGrammarPracticeQueue({
    mode,
    size,
    seed: 1000 + sessionIndex * 37,
    mastery,
    recentAttempts: attempts,
    now: START_TS + sessionIndex * DAY_MS,
  });
}

function simulateProfile(profile, opts = {}) {
  const sessions = opts.sessions || 80;
  const size = opts.size || (profile === 'deep-practice' ? 15 : 5);
  const mastery = emptyMastery();
  const attempts = [];
  const distinctTemplates = new Set();
  const distinctConcepts = new Set();
  const retainedEvents = { count: 0 };
  const milestones = {};

  for (let sessionIndex = 1; sessionIndex <= sessions; sessionIndex += 1) {
    const nowTs = START_TS + sessionIndex * DAY_MS * (profile === 'long-gap-retention' ? 3 : 1);
    const queue = queueForProfile(profile, sessionIndex, mastery, attempts, size);
    queue.forEach((entry, slotIndex) => {
      const template = templateById(entry.templateId);
      const conceptIds = template?.skillIds?.length ? template.skillIds : (entry.skillIds || []);
      const correct = correctnessFor(profile, sessionIndex, slotIndex + 1, entry.templateId);
      distinctTemplates.add(entry.templateId);
      for (const conceptId of conceptIds) {
        distinctConcepts.add(conceptId);
        updateNode(nodeFor(mastery, conceptId), correct, nowTs, retainedEvents);
      }
      attempts.push({
        templateId: entry.templateId,
        conceptIds,
        questionType: entry.questionType,
        result: { correct },
        firstAttemptIndependent: profile !== 'supported-after-wrong',
        supportLevelAtScoring: profile === 'supported-after-wrong' ? 1 : 0,
        createdAt: nowTs,
      });
      while (attempts.length > 80) attempts.shift();
    });

    const { max } = maxDirectStars(mastery, attempts, nowTs);
    for (const [label, threshold] of STAGE_THRESHOLDS) {
      if (max >= threshold && milestones[label] == null) {
        milestones[label] = {
          session: sessionIndex,
          distinctTemplates: distinctTemplates.size,
          distinctConcepts: distinctConcepts.size,
          retainedAfterSecureEvents: retainedEvents.count,
          stars: max,
        };
      }
    }
  }

  const final = maxDirectStars(mastery, attempts, START_TS + sessions * DAY_MS);
  return {
    profile,
    sessionSize: size,
    sessionsSimulated: sessions,
    milestones,
    finalMaxDirectStars: final.max,
    finalStageName: grammarStarStageName(final.max),
    finalDirectStars: Object.fromEntries(Object.entries(final.direct).map(([id, row]) => [id, row.stars])),
    distinctTemplates: distinctTemplates.size,
    distinctConcepts: distinctConcepts.size,
    retainedAfterSecureEvents: retainedEvents.count,
    highStageViaRepeatedShallowItems: ['easy-template-only', 'repeated-template'].includes(profile) && final.max >= 65,
  };
}

export function buildStarPacingSimulation() {
  const profiles = [
    simulateProfile('always-correct', { size: 5 }),
    simulateProfile('mixed-correct-wrong', { size: 5 }),
    simulateProfile('easy-template-only', { size: 5 }),
    simulateProfile('repeated-template', { size: 5 }),
    simulateProfile('supported-after-wrong', { size: 5 }),
    simulateProfile('deep-practice', { size: 15 }),
    simulateProfile('long-gap-retention', { size: 5 }),
  ];
  const highStageFailures = profiles.filter((profile) => profile.highStageViaRepeatedShallowItems);
  return {
    reportId: 'grammar-qg-p14-star-pacing-simulation',
    contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
    generatedAt: new Date().toISOString(),
    templateCount: GRAMMAR_TEMPLATE_METADATA.length,
    profiles,
    conclusion: {
      pass: highStageFailures.length === 0,
      highStageFailures: highStageFailures.map((entry) => entry.profile),
      copyRecommendation: 'Keep quick practice copy separate from deep practice; no Star threshold change is required in this P14 slice.',
      thresholdChange: 'none',
      migrationRequired: false,
      highWaterSafetyImpacted: false,
    },
  };
}

function markdownFor(report) {
  const lines = [
    '# Grammar QG P14 Star-Pacing Simulation',
    '',
    `Content release: ${report.contentReleaseId}`,
    `Template count: ${report.templateCount}`,
    `Pass: ${report.conclusion.pass ? 'yes' : 'no'}`,
    '',
    '| Profile | Session size | Final max Stars | Stage | Distinct templates | Distinct concepts | Retention events | Mega session |',
    '| --- | ---: | ---: | --- | ---: | ---: | ---: | --- |',
  ];
  for (const profile of report.profiles) {
    lines.push(`| ${profile.profile} | ${profile.sessionSize} | ${profile.finalMaxDirectStars} | ${profile.finalStageName} | ${profile.distinctTemplates} | ${profile.distinctConcepts} | ${profile.retainedAfterSecureEvents} | ${profile.milestones.Mega?.session || '-'} |`);
  }
  lines.push('');
  lines.push('## Conclusion');
  lines.push('');
  lines.push(`- ${report.conclusion.copyRecommendation}`);
  lines.push(`- Threshold change: ${report.conclusion.thresholdChange}`);
  lines.push(`- Migration required: ${report.conclusion.migrationRequired ? 'yes' : 'no'}`);
  return `${lines.join('\n')}\n`;
}

async function main() {
  const report = buildStarPacingSimulation();
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  await fs.writeFile(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(MD_OUT, markdownFor(report), 'utf8');
  console.log(`Wrote ${path.relative(ROOT_DIR, JSON_OUT)}`);
  console.log(`Wrote ${path.relative(ROOT_DIR, MD_OUT)}`);
  if (!report.conclusion.pass) process.exit(1);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main().catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  });
}
